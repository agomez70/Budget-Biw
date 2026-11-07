import { billAmount } from './bills';
import { billsOn, homeNumbers, openPeriod } from './budget';
import { addDays, monthOf } from './dates';
import { debtPayoff, type PayoffResult } from './debt';
import { sum } from './money';
import { expectedPay, hourlyTakeHome, paychecks } from './paychecks';
import type { AppState, BillInstance, Cents, ISODate, LeftoverAction, LogEntry, Period, PeriodSummary, Timestamp } from './types';

/**
 * The Payday flow. `confirmPayday` is the only way a period closes.
 * It is pure and idempotent: confirming an already received paycheck
 * returns the same state object.
 */

export interface PaydayInput {
  paycheck: ISODate;
  /** Actual take-home amount for this paycheck. */
  amount: Cents;
  /** Real bank balance after the deposit. */
  actualBalance: Cents;
  /** Keys of old-period bills (unchecked) the user confirms were paid. */
  paidOldBills: string[];
  /** What to do with a reconciliation difference outside tolerance. */
  diffHandling: 'unlogged' | 'accept';
  leftoverAction: LeftoverAction;
}

export function amountFromHours(s: AppState, hours: number): Cents {
  return hourlyTakeHome(s.settings.hourlyRate, hours, s.settings.taxPct);
}

/** Bills that belong to the period being closed: paychecks in [start, paycheck). */
export function closingBills(s: AppState, paycheck: ISODate): BillInstance[] {
  const start = openPeriod(s).start;
  return paychecks(s.settings, start, addDays(paycheck, -1)).flatMap((p) => billsOn(s, p));
}

export interface Reconciliation {
  startBalance: Cents;
  manualAdjust: Cents;
  debits: Cents;
  checkedBills: Cents;
  deposits: Cents;
  /** Everything else that moved the tracked balance (e.g. bills paid ahead). */
  other: Cents;
  /** Old bills just confirmed as paid in this flow. */
  newlyPaid: Cents;
  paycheck: Cents;
  expected: Cents;
  actual: Cents;
  /** actual − expected. Negative means less money than expected. */
  diff: Cents;
  matches: boolean;
}

/**
 * expected = previous balance − logged purchases − bills checked off + deposits + this paycheck
 * (computed from the tracked balance, with the breakdown shown line by line).
 */
export function reconcile(s: AppState, input: Pick<PaydayInput, 'paycheck' | 'amount' | 'actualBalance' | 'paidOldBills'>): Reconciliation {
  const open = openPeriod(s);
  const bills = closingBills(s, input.paycheck);
  const debits = sum(s.log.filter((e) => e.kind === 'debit').map((e) => e.amount));
  const checkedBills = sum(bills.filter((b) => b.checked && b.source === 'paycheck').map(billAmount));
  const deposits = sum(s.deposits.map((d) => d.amount));
  const newlyPaid = sum(bills.filter((b) => !b.checked && b.source === 'paycheck' && input.paidOldBills.includes(b.key)).map(billAmount));
  const tracked = open.startBalance + open.manualAdjust - debits - checkedBills + deposits;
  const other = s.account.bankBalance - tracked;
  const expected = s.account.bankBalance - newlyPaid + input.amount;
  const diff = input.actualBalance - expected;
  return {
    startBalance: open.startBalance,
    manualAdjust: open.manualAdjust,
    debits,
    checkedBills,
    deposits,
    other,
    newlyPaid,
    paycheck: input.amount,
    expected,
    actual: input.actualBalance,
    diff,
    matches: Math.abs(diff) <= s.settings.toleranceCents,
  };
}

/** Money left from the old period: actual balance without the new paycheck, minus old bills still unpaid. */
export function leftover(s: AppState, input: Pick<PaydayInput, 'paycheck' | 'amount' | 'actualBalance' | 'paidOldBills'>): Cents {
  const unpaid = closingBills(s, input.paycheck).filter((b) => !b.checked && b.source === 'paycheck' && !input.paidOldBills.includes(b.key));
  return input.actualBalance - input.amount - sum(unpaid.map(billAmount));
}

/** Actual payments made toward each debt during a month (from checked bills, open and closed). */
export function paidTowardDebtsInMonth(s: AppState, month: string): Record<string, Cents> {
  const all = [...s.billInstances, ...s.periods.flatMap((p) => p.bills ?? [])];
  const seen = new Set<string>();
  const out: Record<string, Cents> = {};
  for (const b of all) {
    const id = `${b.key}@${b.paycheck}`;
    if (seen.has(id) || !b.checked || !b.debtId || monthOf(b.dueDate) !== month) continue;
    seen.add(id);
    out[b.debtId] = (out[b.debtId] ?? 0) + billAmount(b);
  }
  return out;
}

/** Debt payoff projection for the current state, using actual payments already made this month. */
export function projection(s: AppState, today: ISODate): PayoffResult {
  const month = monthOf(today);
  return debtPayoff(s.debts, {
    startMonth: month,
    extraMonthly: s.extraMonthly,
    lumps: s.lumps,
    paidThisMonth: paidTowardDebtsInMonth(s, month),
  });
}

export function applyLeftover(s: AppState, amount: Cents, action: LeftoverAction): { state: AppState; moved: Cents } {
  if (amount <= 0 || action.kind === 'roll') return { state: s, moved: 0 };
  if (action.kind === 'savings') {
    return { state: { ...s, savings: s.savings + amount, account: { ...s.account, bankBalance: s.account.bankBalance - amount } }, moved: amount };
  }
  const debt = s.debts.find((d) => d.id === action.debtId);
  if (!debt) return { state: s, moved: 0 };
  const moved = Math.min(amount, debt.balance);
  return {
    state: {
      ...s,
      debts: s.debts.map((d) => (d.id === debt.id ? { ...d, balance: d.balance - moved } : d)),
      account: { ...s.account, bankBalance: s.account.bankBalance - moved },
    },
    moved,
  };
}

/** Debt-free month for each leftover choice, for the preview in step 3. */
export function leftoverPreview(s: AppState, today: ISODate, amount: Cents, action: LeftoverAction): { before: string | null; after: string | null } {
  const before = projection(s, today).debtFreeMonth;
  const after = projection(applyLeftover(s, amount, action).state, today).debtFreeMonth;
  return { before, after };
}

export interface PaydayContext {
  now: Timestamp;
  today: ISODate;
  snapshotId: string;
}

export function confirmPayday(s: AppState, input: PaydayInput, ctx: PaydayContext): AppState {
  const open = openPeriod(s);
  if (s.received[input.paycheck] || input.paycheck <= open.start) return s; // idempotent

  const rec = reconcile(s, input);
  const left = leftover(s, input);
  const oldPaychecks = new Set(paychecks(s.settings, open.start, addDays(input.paycheck, -1)));
  let debts = s.debts;

  // 1) Old-period bills: mark confirmed ones paid (their linked debts go down), carry the rest forward.
  const closing = closingBills(s, input.paycheck).map((b) => {
    if (!b.checked && input.paidOldBills.includes(b.key)) {
      if (b.debtId) debts = debts.map((d) => (d.id === b.debtId ? { ...d, balance: Math.max(0, d.balance - billAmount(b)) } : d));
      return { ...b, checked: true };
    }
    return b;
  });
  const carried: BillInstance[] = closing
    .filter((b) => !b.checked && b.source === 'paycheck')
    .map((b) => ({ ...b, key: `carry|${b.key}`, paycheck: input.paycheck, carriedFrom: b.paycheck, manual: false }));

  // 2) Reconciliation difference.
  let log: LogEntry[] = s.log;
  let unlogged = 0;
  if (!rec.matches && rec.diff < 0 && input.diffHandling === 'unlogged') {
    unlogged = -rec.diff;
    log = [...log, { id: `unlogged-${input.paycheck}`, date: addDays(input.paycheck, -1), amount: unlogged, note: 'Unlogged', kind: 'debit', unlogged: true }];
  }

  // 3) Summary.
  const byCategory: Record<string, Cents> = {};
  for (const e of log) {
    const c = e.category ?? (e.unlogged ? 'unlogged' : 'uncategorized');
    byCategory[c] = (byCategory[c] ?? 0) + e.amount;
  }
  const paid = closing.filter((b) => b.checked);
  const baseSummary: Omit<PeriodSummary, 'leftoverAction' | 'leftover' | 'debtBalances'> = {
    start: open.start,
    end: input.paycheck,
    plannedPay: open.plannedPay,
    actualPay: open.actualPay,
    billsPaid: paid.map((b) => ({ name: b.name, amount: billAmount(b) })),
    billsPaidTotal: sum(paid.map(billAmount)),
    spentDebit: sum(log.filter((e) => e.kind === 'debit').map((e) => e.amount)),
    spentCard: sum(log.filter((e) => e.kind === 'card').map((e) => e.amount)),
    byCategory,
    depositsTotal: sum(s.deposits.map((d) => d.amount)),
    unlogged,
    reconcileDiff: unlogged ? 0 : rec.diff,
    safePerDayAtStart: open.safePerDayAtStart,
  };

  // 4) New balances, leftover handling.
  let next: AppState = {
    ...s,
    debts,
    account: { bankBalance: input.actualBalance, asOf: ctx.now },
    log: [],
    deposits: [],
    billInstances: [...s.billInstances.filter((b) => !oldPaychecks.has(b.paycheck)), ...carried],
    received: { ...s.received, [input.paycheck]: { amount: input.amount, receivedAt: ctx.now } },
  };
  const { state: afterLeftover, moved } = applyLeftover(next, left, input.leftoverAction);
  next = afterLeftover;
  const leftoverAction: LeftoverAction = moved > 0 ? input.leftoverAction : { kind: 'roll' };

  const closed: Period = {
    ...open,
    status: 'closed',
    end: input.paycheck,
    log,
    deposits: s.deposits,
    bills: closing,
    summary: {
      ...baseSummary,
      leftover: left,
      leftoverAction,
      debtBalances: next.debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance })),
    },
  };

  const newPeriod: Period = {
    id: `p-${input.paycheck}`,
    start: input.paycheck,
    status: 'open',
    plannedPay: expectedPay(s.settings),
    actualPay: input.amount,
    startBalance: next.account.bankBalance,
    safePerDayAtStart: 0,
    manualAdjust: 0,
  };
  next = {
    ...next,
    periods: [...s.periods.filter((p) => p.id !== open.id), closed, newPeriod],
    lastPayday: { paycheck: input.paycheck, at: ctx.now, snapshotId: ctx.snapshotId },
  };
  const spd = homeNumbers(next, ctx.today < input.paycheck ? input.paycheck : ctx.today).safePerDay;
  return { ...next, periods: next.periods.map((p) => (p.id === newPeriod.id ? { ...p, safePerDayAtStart: spd } : p)) };
}

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canUndoPayday(s: AppState, now: Date): boolean {
  if (!s.lastPayday) return false;
  const at = Date.parse(s.lastPayday.at);
  return now.getTime() - at < UNDO_WINDOW_MS && now.getTime() >= at;
}

/** Closed periods, newest first. */
export function history(s: AppState): Period[] {
  return s.periods.filter((p) => p.status === 'closed').sort((a, b) => (a.start < b.start ? 1 : -1));
}
