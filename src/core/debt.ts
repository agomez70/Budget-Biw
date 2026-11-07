import { addMonths } from './dates';
import { mulRound, sum } from './money';
import type { Cents, Debt, ISOMonth } from './types';

export interface PayoffPlan {
  startMonth: ISOMonth;
  /** Extra beyond the minimums, every month. */
  extraMonthly: Cents;
  /** One-time lump payments keyed by month. */
  lumps?: Record<ISOMonth, Cents>;
  /**
   * Amounts already paid toward each debt in the start month (actual
   * payments from checked bills). Balances already reflect them, so the
   * simulation only pays what is still owed for that month. This is how an
   * actual card payment that differs from the plan feeds the projection.
   */
  paidThisMonth?: Record<string, Cents>;
  maxMonths?: number;
}

export interface PayoffMonth {
  month: ISOMonth;
  interest: Cents;
  payments: Record<string, Cents>;
  balances: Record<string, Cents>;
  totalBalance: Cents;
}

export interface PayoffResult {
  months: PayoffMonth[];
  /** Month the last balance reaches 0, or null if never (within maxMonths). */
  debtFreeMonth: ISOMonth | null;
  totalInterest: Cents;
  payoffMonth: Record<string, ISOMonth | null>;
}

export function aprFor(d: Debt, month: ISOMonth): number {
  if (d.promoApr != null && d.promoEndMonth && month <= d.promoEndMonth) return d.promoApr;
  return d.apr;
}

export function monthlyInterest(balance: Cents, apr: number): Cents {
  return balance > 0 ? mulRound(balance, apr / 1200) : 0;
}

/** Avalanche order for a month: highest current APR first, then priority. */
export function avalancheOrder(debts: Debt[], month: ISOMonth): Debt[] {
  return [...debts].sort((a, b) => aprFor(b, month) - aprFor(a, month) || a.priority - b.priority || a.name.localeCompare(b.name));
}

export function debtPayoff(debts: Debt[], plan: PayoffPlan): PayoffResult {
  const max = plan.maxMonths ?? 600;
  const bal: Record<string, Cents> = Object.fromEntries(debts.map((d) => [d.id, Math.max(0, d.balance)]));
  const payoffMonth: Record<string, ISOMonth | null> = Object.fromEntries(debts.map((d) => [d.id, d.balance <= 0 ? plan.startMonth : null]));
  const baseBudget = sum(debts.map((d) => d.minPayment)) + plan.extraMonthly;
  const months: PayoffMonth[] = [];
  let totalInterest = 0;
  let debtFreeMonth: ISOMonth | null = debts.every((d) => d.balance <= 0) ? plan.startMonth : null;

  for (let i = 0; i < max && debtFreeMonth === null; i++) {
    const month = addMonths(plan.startMonth, i);
    const paid = i === 0 ? plan.paidThisMonth ?? {} : {};
    let interest = 0;
    for (const d of debts) {
      const it = monthlyInterest(bal[d.id], aprFor(d, month));
      bal[d.id] += it;
      interest += it;
    }
    totalInterest += interest;
    let budget = baseBudget + (plan.lumps?.[month] ?? 0) - sum(Object.values(paid));
    budget = Math.max(0, budget);
    const payments: Record<string, Cents> = {};
    // 1) minimums (less anything already paid this month)
    for (const d of debts) {
      const due = Math.max(0, d.minPayment - (paid[d.id] ?? 0));
      const p = Math.min(bal[d.id], due, budget);
      bal[d.id] -= p;
      budget -= p;
      payments[d.id] = p;
    }
    // 2) everything else to the avalanche target(s)
    for (const d of avalancheOrder(debts, month)) {
      if (budget <= 0) break;
      const p = Math.min(bal[d.id], budget);
      bal[d.id] -= p;
      budget -= p;
      payments[d.id] += p;
    }
    for (const d of debts) if (bal[d.id] === 0 && payoffMonth[d.id] === null) payoffMonth[d.id] = month;
    const totalBalance = sum(Object.values(bal));
    months.push({ month, interest, payments, balances: { ...bal }, totalBalance });
    if (totalBalance === 0) debtFreeMonth = month;
  }
  return { months, debtFreeMonth, totalInterest, payoffMonth };
}
