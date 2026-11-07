import { addMonthsYM, clampedDate, parseISO } from './dates';
import { nextPaycheckAfter } from './paychecks';
import type { BillInstance, BillRule, Cents, ISODate, ISOMonth, Settings } from './types';

/** A paycheck plus the next two paychecks — enough to place every bill mode. */
export interface PayWindow {
  date: ISODate;
  next: ISODate;
  afterNext: ISODate;
}

export function windowFor(s: Pick<Settings, 'frequency' | 'firstPaycheck' | 'semiMonthlyDays'>, paycheck: ISODate): PayWindow {
  const next = nextPaycheckAfter(s, paycheck);
  return { date: paycheck, next, afterNext: nextPaycheckAfter(s, next) };
}

/** Due dates of a rule in [from, toExclusive). */
export function dueDatesInRange(rule: BillRule, from: ISODate, toExclusive: ISODate): ISODate[] {
  if (toExclusive <= from) return [];
  if (rule.mode === 'once') {
    return rule.dueDate && rule.dueDate >= from && rule.dueDate < toExclusive ? [rule.dueDate] : [];
  }
  const day = rule.dueDay ?? 1;
  const a = parseISO(from);
  const b = parseISO(toExclusive);
  const out: ISODate[] = [];
  for (let ym = { y: a.y, m: a.m }; ym.y * 12 + ym.m <= b.y * 12 + b.m; ym = addMonthsYM(ym.y, ym.m, 1)) {
    const d = clampedDate(ym.y, ym.m, day);
    if (d >= from && d < toExclusive) out.push(d);
  }
  return out;
}

export const instanceKey = (ruleId: string, dueDate: ISODate) => `${ruleId}|${dueDate}`;

function generated(rule: BillRule, paycheck: ISODate, dueDate: ISODate): BillInstance {
  return {
    key: instanceKey(rule.id, dueDate),
    ruleId: rule.id,
    paycheck,
    name: rule.name,
    amount: rule.amount,
    dueDate,
    checked: false,
    debtId: rule.debtId,
    source: rule.source,
  };
}

/**
 * Place paycheck-funded bills on a paycheck by mode:
 * - by:    due in [paycheck, next)          → paid from the paycheck before the due date
 * - ahead: due in [next, afterNext)         → one paycheck earlier than `by`
 * - each:  every paycheck (due on payday)
 * - once:  single date, placed like `by`
 */
export function billsForPeriod(rules: BillRule[], w: PayWindow): BillInstance[] {
  const out: BillInstance[] = [];
  for (const r of rules) {
    if (r.source !== 'paycheck') continue;
    let dates: ISODate[];
    switch (r.mode) {
      case 'each':
        dates = [w.date];
        break;
      case 'ahead':
        dates = dueDatesInRange(r, w.next, w.afterNext);
        break;
      case 'by':
      case 'once':
        dates = dueDatesInRange(r, w.date, w.next);
        break;
    }
    for (const d of dates) out.push(generated(r, w.date, d));
  }
  return out.sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.name.localeCompare(y.name)));
}

/**
 * Generated bills merged with stored edits (checks, overrides, deletions,
 * one-off manual bills) for one paycheck. Deleted instances are omitted.
 */
export function instancesForPaycheck(rules: BillRule[], stored: BillInstance[], w: PayWindow): BillInstance[] {
  const mine = stored.filter((b) => b.paycheck === w.date);
  const byKey = new Map(mine.map((b) => [b.key, b]));
  const out: BillInstance[] = [];
  for (const g of billsForPeriod(rules, w)) {
    const st = byKey.get(g.key);
    if (st) {
      byKey.delete(g.key);
      if (!st.deleted) out.push(st);
    } else out.push(g);
  }
  for (const st of byKey.values()) if (!st.deleted && (st.manual || st.carriedFrom)) out.push(st);
  return out.sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0));
}

export const billAmount = (b: BillInstance): Cents => b.override ?? b.amount;

/** Bills funded by the monthly deposit in a given month. */
export function depositBillsForMonth(rules: BillRule[], month: ISOMonth): { rule: BillRule; dueDate: ISODate }[] {
  const [y, m] = month.split('-').map(Number);
  const from = clampedDate(y, m, 1);
  const n = addMonthsYM(y, m, 1);
  const to = clampedDate(n.y, n.m, 1);
  const out: { rule: BillRule; dueDate: ISODate }[] = [];
  for (const r of rules) {
    if (r.source !== 'deposit') continue;
    if (r.mode === 'each') out.push({ rule: r, dueDate: from });
    else for (const d of dueDatesInRange(r, from, to)) out.push({ rule: r, dueDate: d });
  }
  return out;
}

/** Store an edit to an instance (upsert by key + paycheck). */
export function upsertInstance(stored: BillInstance[], inst: BillInstance): BillInstance[] {
  const i = stored.findIndex((b) => b.key === inst.key && b.paycheck === inst.paycheck);
  if (i < 0) return [...stored, inst];
  const copy = stored.slice();
  copy[i] = inst;
  return copy;
}
