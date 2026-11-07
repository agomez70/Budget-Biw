import { billAmount, instancesForPaycheck, windowFor } from './bills';
import { addDays, daysBetween } from './dates';
import { sum } from './money';
import { expectedPay, hourlyTakeHome, nextPaycheckAfter, paychecks } from './paychecks';
import type { AppState, BillInstance, Cents, ISODate, Period } from './types';

export function openPeriod(s: AppState): Period {
  const p = s.periods.find((x) => x.status === 'open');
  if (!p) throw new Error('No open period');
  return p;
}

/** Bills for one paycheck with stored edits applied. */
export function billsOn(s: AppState, paycheck: ISODate): BillInstance[] {
  return instancesForPaycheck(s.rules, s.billInstances, windowFor(s.settings, paycheck));
}

/** Paychecks from the open period's start through `today` (inclusive). */
export function paychecksThrough(s: AppState, today: ISODate): ISODate[] {
  return paychecks(s.settings, openPeriod(s).start, today);
}

/** Unpaid (unchecked) bills on paychecks dated ≤ today in the open period. */
export function unpaidBillsDue(s: AppState, today: ISODate): BillInstance[] {
  return paychecksThrough(s, today).flatMap((p) => billsOn(s, p).filter((b) => !b.checked));
}

/** trueRemaining = bank balance now − unpaid bills on paychecks dated ≤ today */
export function trueRemaining(s: AppState, today: ISODate): Cents {
  return s.account.bankBalance - sum(unpaidBillsDue(s, today).map(billAmount));
}

export function daysUntilNextPaycheck(s: AppState, today: ISODate): number {
  return Math.max(1, daysBetween(today, nextPaycheckAfter(s.settings, today)));
}

/** safePerDay = trueRemaining / days until next paycheck (min 1 day; 0 if nothing remains). */
export function safePerDay(remaining: Cents, days: number): Cents {
  if (remaining <= 0) return 0;
  return Math.floor(remaining / Math.max(1, days));
}

export function cardAddedThisPeriod(s: AppState): Cents {
  return sum(s.log.filter((e) => e.kind === 'card').map((e) => e.amount));
}

/** Upcoming unpaid bills from today on, across the next paychecks. */
export function nextBills(s: AppState, today: ISODate, count: number): BillInstance[] {
  const start = openPeriod(s).start;
  const pcs = paychecks(s.settings, start, addDays(today, 100));
  const out: BillInstance[] = [];
  for (const p of pcs) {
    for (const b of billsOn(s, p)) if (!b.checked && b.dueDate >= today) out.push(b);
    if (out.length >= count && p > today) break;
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, count);
}

/** The earliest paycheck after the open period's start, on or before today, that has not been received. */
export function pendingPaycheck(s: AppState, today: ISODate): ISODate | null {
  const start = openPeriod(s).start;
  const list = paychecks(s.settings, addDays(start, 1), today).filter((p) => !s.received[p]);
  return list[0] ?? null;
}

export type Warning =
  | { kind: 'billsExceedBalance'; due: Cents; balance: Cents; nextPaycheck: ISODate }
  | { kind: 'latePaycheck'; paycheck: ISODate; daysLate: number }
  | { kind: 'slowPeriod'; paycheck: ISODate; slowPay: Cents; bills: Cents };

export function warnings(s: AppState, today: ISODate): Warning[] {
  const out: Warning[] = [];
  const next = nextPaycheckAfter(s.settings, today);
  // Unpaid bills due from now until the next paycheck (including overdue ones in the open period).
  const start = openPeriod(s).start;
  const dueSoon = paychecks(s.settings, start, addDays(next, 40))
    .flatMap((p) => billsOn(s, p))
    .filter((b) => !b.checked && b.dueDate < next);
  const due = sum(dueSoon.map(billAmount));
  if (due > s.account.bankBalance) out.push({ kind: 'billsExceedBalance', due, balance: s.account.bankBalance, nextPaycheck: next });
  const pending = pendingPaycheck(s, today);
  if (pending) {
    const late = daysBetween(pending, today);
    if (late >= 2) out.push({ kind: 'latePaycheck', paycheck: pending, daysLate: late });
  }
  if (s.settings.payType === 'hourly') {
    const slowPay = hourlyTakeHome(s.settings.hourlyRate, s.settings.slowHours, s.settings.taxPct);
    const upcoming = paychecks(s.settings, today, addDays(today, 31)).slice(0, 2);
    const candidates = [pending ?? undefined, ...upcoming].filter((x): x is ISODate => !!x);
    for (const p of [...new Set(candidates)]) {
      const bills = sum(billsOn(s, p).map(billAmount));
      if (slowPay < bills) {
        out.push({ kind: 'slowPeriod', paycheck: p, slowPay, bills });
        break;
      }
    }
  }
  return out;
}

export interface HomeNumbers {
  bank: Cents;
  unpaid: Cents;
  unpaidBills: BillInstance[];
  trueRemaining: Cents;
  days: number;
  nextPaycheck: ISODate;
  safePerDay: Cents;
  cardAdded: Cents;
  expectedPay: Cents;
}

export function homeNumbers(s: AppState, today: ISODate): HomeNumbers {
  const unpaidBills = unpaidBillsDue(s, today);
  const unpaid = sum(unpaidBills.map(billAmount));
  const tr = s.account.bankBalance - unpaid;
  const days = daysUntilNextPaycheck(s, today);
  return {
    bank: s.account.bankBalance,
    unpaid,
    unpaidBills,
    trueRemaining: tr,
    days,
    nextPaycheck: nextPaycheckAfter(s.settings, today),
    safePerDay: safePerDay(tr, days),
    cardAdded: cardAddedThisPeriod(s),
    expectedPay: expectedPay(s.settings),
  };
}
