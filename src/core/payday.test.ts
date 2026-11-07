import { describe, it, expect } from 'vitest';
import * as A from './actions';
import { billsOn, homeNumbers, openPeriod, pendingPaycheck } from './budget';
import { sampleState } from './sample';
import { amountFromHours, canUndoPayday, closingBills, confirmPayday, history, leftover, leftoverPreview, paidTowardDebtsInMonth, projection, reconcile, type PaydayInput } from './payday';
import type { AppState } from './types';

const NOW = '2026-01-20T12:00:00.000Z';
const PAY_AT = '2026-01-30T15:00:00.000Z';
const ctx = { now: PAY_AT, today: '2026-01-30', snapshotId: 'snap-1' };

/** Open period 01-16 → 01-30; bank 300000; every bill on 01-16 checked; a few entries. */
function scenario(): AppState {
  let s = sampleState('2026-01-20', NOW);
  s.account.bankBalance = 300000;
  s.periods[0].startBalance = 300000;
  for (const b of billsOn(s, '2026-01-16')) s = A.setBillChecked(s, b, true); // rent 125000, power 9000, groceries 20000, card 15000
  s = A.addLogEntry(s, { id: 'l1', date: '2026-01-21', amount: 5000, note: 'food', kind: 'debit', category: 'groceries' });
  s = A.addLogEntry(s, { id: 'l2', date: '2026-01-22', amount: 3000, note: 'shoes', kind: 'card' });
  s = A.addDeposit(s, { id: 'd1', date: '2026-01-23', amount: 2000, note: 'refund' });
  return s;
}

const input = (over: Partial<PaydayInput> = {}): PaydayInput => ({
  paycheck: '2026-01-30',
  amount: 185000,
  actualBalance: 313000,
  paidOldBills: [],
  diffHandling: 'accept',
  leftoverAction: { kind: 'roll' },
  ...over,
});

describe('reconcile', () => {
  it('expected = previous − purchases − checked bills + deposits + paycheck', () => {
    const s = scenario();
    const r = reconcile(s, input());
    expect(r).toMatchObject({ startBalance: 300000, debits: 5000, checkedBills: 169000, deposits: 2000, other: 0, paycheck: 185000 });
    expect(r.expected).toBe(300000 - 5000 - 169000 + 2000 + 185000);
    expect(r.diff).toBe(0);
    expect(r.matches).toBe(true);
  });
  it('tolerance and mismatch', () => {
    const s = scenario();
    expect(reconcile(s, input({ actualBalance: 313000 - 500 })).matches).toBe(true);
    const r = reconcile(s, input({ actualBalance: 310000 }));
    expect(r.matches).toBe(false);
    expect(r.diff).toBe(-3000);
  });
  it('manual balance edits show as an adjustment line', () => {
    let s = scenario();
    s = A.setBankBalance(s, s.account.bankBalance + 700, NOW);
    const r = reconcile(s, input());
    expect(r.manualAdjust).toBe(700);
    expect(r.other).toBe(0);
    expect(r.expected).toBe(313700);
  });
  it('old bills confirmed paid in the flow reduce expected', () => {
    let s = scenario();
    const power = billsOn(s, '2026-01-16').find((b) => b.ruleId === 'power')!;
    s = A.setBillChecked(s, power, false);
    expect(closingBills(s, '2026-01-30').filter((b) => !b.checked).map((b) => b.ruleId)).toEqual(['power']);
    const r = reconcile(s, input({ paidOldBills: [power.key] }));
    expect(r.newlyPaid).toBe(9000);
    expect(r.expected).toBe(313000);
  });
});

describe('confirmPayday', () => {
  it('closes the old period atomically and opens the new one', () => {
    const s = scenario();
    const out = confirmPayday(s, input({ actualBalance: 310000, diffHandling: 'unlogged' }), ctx);
    const closed = history(out);
    expect(closed).toHaveLength(1);
    const p = closed[0];
    expect(p.status).toBe('closed');
    expect(p.start).toBe('2026-01-16');
    expect(p.end).toBe('2026-01-30');
    expect(p.log!.map((e) => e.id)).toEqual(['l1', 'l2', 'unlogged-2026-01-30']);
    expect(p.log![2]).toMatchObject({ amount: 3000, kind: 'debit', unlogged: true, date: '2026-01-29' });
    expect(p.deposits!.map((d) => d.id)).toEqual(['d1']);
    expect(p.bills!.every((b) => b.checked)).toBe(true);
    expect(p.summary).toMatchObject({
      plannedPay: 185000,
      billsPaidTotal: 169000,
      spentDebit: 8000,
      spentCard: 3000,
      depositsTotal: 2000,
      unlogged: 3000,
      reconcileDiff: 0,
      leftover: 310000 - 185000,
      leftoverAction: { kind: 'roll' },
      byCategory: { groceries: 5000, uncategorized: 3000, unlogged: 3000 },
    });
    expect(p.summary!.debtBalances.find((d) => d.id === 'card')!.balance).toBe(340000 - 15000 + 3000);
    // active state
    expect(out.log).toEqual([]);
    expect(out.deposits).toEqual([]);
    expect(out.account).toEqual({ bankBalance: 310000, asOf: PAY_AT });
    expect(out.received['2026-01-30']).toEqual({ amount: 185000, receivedAt: PAY_AT });
    const open = openPeriod(out);
    expect(open).toMatchObject({ start: '2026-01-30', status: 'open', startBalance: 310000, actualPay: 185000, manualAdjust: 0 });
    expect(open.safePerDayAtStart).toBe(homeNumbers(out, '2026-01-30').safePerDay);
    expect(out.billInstances.some((b) => b.paycheck === '2026-01-16')).toBe(false);
    expect(out.lastPayday).toEqual({ paycheck: '2026-01-30', at: PAY_AT, snapshotId: 'snap-1' });
    expect(pendingPaycheck(out, '2026-01-30')).toBeNull();
    // new period bills are generated
    expect(billsOn(out, '2026-01-30').length).toBeGreaterThan(0);
  });
  it('is idempotent', () => {
    const s = scenario();
    const once = confirmPayday(s, input(), ctx);
    expect(confirmPayday(once, input(), ctx)).toBe(once);
    expect(confirmPayday(once, input({ paycheck: '2026-01-16' }), ctx)).toBe(once);
  });
  it('accepting a difference records it on the summary', () => {
    const out = confirmPayday(scenario(), input({ actualBalance: 316000 }), ctx);
    expect(history(out)[0].summary!.reconcileDiff).toBe(3000);
    expect(history(out)[0].summary!.unlogged).toBe(0);
    expect(out.account.bankBalance).toBe(316000);
  });
  it('card purchases leave the active log but keep counting toward card debt', () => {
    const s = scenario();
    const cardBefore = s.debts.find((d) => d.id === 'card')!.balance;
    const out = confirmPayday(s, input(), ctx);
    expect(out.debts.find((d) => d.id === 'card')!.balance).toBe(cardBefore);
    expect(homeNumbers(out, '2026-01-30').cardAdded).toBe(0);
  });
  it('carries unpaid old bills forward and pays confirmed ones', () => {
    let s = scenario();
    for (const r of ['power', 'card-pay']) s = A.setBillChecked(s, billsOn(s, '2026-01-16').find((b) => b.ruleId === r)!, false);
    const cardKey = billsOn(s, '2026-01-16').find((b) => b.ruleId === 'card-pay')!.key;
    const card0 = s.debts.find((d) => d.id === 'card')!.balance;
    const out = confirmPayday(s, input({ paidOldBills: [cardKey], actualBalance: 313000 + 9000 }), ctx);
    expect(out.debts.find((d) => d.id === 'card')!.balance).toBe(card0 - 15000);
    const carried = billsOn(out, '2026-01-30').filter((b) => b.carriedFrom);
    expect(carried.map((b) => b.name)).toEqual(['Electric']);
    expect(carried[0].carriedFrom).toBe('2026-01-16');
    expect(history(out)[0].summary!.leftover).toBe(313000 + 9000 - 185000 - 9000);
  });
  it('leftover to a debt or savings', () => {
    const s = scenario();
    const l = leftover(s, input());
    expect(l).toBe(128000);
    const toDebt = confirmPayday(s, input({ leftoverAction: { kind: 'debt', debtId: 'car' } }), ctx);
    expect(toDebt.debts.find((d) => d.id === 'car')!.balance).toBe(820000 - 128000);
    expect(toDebt.account.bankBalance).toBe(313000 - 128000);
    expect(history(toDebt)[0].summary!.leftoverAction).toEqual({ kind: 'debt', debtId: 'car' });
    const toSave = confirmPayday(s, input({ leftoverAction: { kind: 'savings' } }), ctx);
    expect(toSave.savings).toBe(128000);
    expect(toSave.account.bankBalance).toBe(185000);
  });
  it('leftover to a debt never overpays it', () => {
    let s = scenario();
    s = A.upsertDebt(s, { ...s.debts.find((d) => d.id === 'car')!, balance: 1000 });
    const out = confirmPayday(s, input({ leftoverAction: { kind: 'debt', debtId: 'car' } }), ctx);
    expect(out.debts.find((d) => d.id === 'car')!.balance).toBe(0);
    expect(out.account.bankBalance).toBe(312000);
  });
  it('negative leftover moves nothing', () => {
    const out = confirmPayday(scenario(), input({ actualBalance: 100000, leftoverAction: { kind: 'savings' } }), ctx);
    expect(out.savings).toBe(0);
    expect(history(out)[0].summary!.leftoverAction).toEqual({ kind: 'roll' });
  });
  it('preview shows the effect on the debt-free date', () => {
    const s = scenario();
    const p = leftoverPreview(s, '2026-01-30', 128000, { kind: 'debt', debtId: 'card' });
    expect(p.before).not.toBeNull();
    expect(p.after! <= p.before!).toBe(true);
    const roll = leftoverPreview(s, '2026-01-30', 128000, { kind: 'roll' });
    expect(roll.after).toBe(roll.before);
  });
  it('hours to amount for hourly pay', () => {
    const s = scenario();
    s.settings = { ...s.settings, hourlyRate: 2000, taxPct: 20 };
    expect(amountFromHours(s, 72)).toBe(115200);
  });
});

describe('projection uses actual card payments', () => {
  it('counts what was actually paid this month', () => {
    let s = scenario(); // card-pay due 01-25, checked at 15000
    expect(paidTowardDebtsInMonth(s, '2026-01')).toEqual({ card: 15000 });
    const b = billsOn(s, '2026-01-16').find((x) => x.ruleId === 'card-pay')!;
    s = A.setBillOverride(s, b, 50000);
    expect(paidTowardDebtsInMonth(s, '2026-01')).toEqual({ card: 50000 });
    const r = projection(s, '2026-01-26');
    expect(r.months[0].payments.card).toBeLessThan(s.debts.find((d) => d.id === 'card')!.minPayment + s.extraMonthly);
    // still counted after the period closes
    const out = confirmPayday(s, input({ actualBalance: 313000 - 35000 }), ctx);
    expect(paidTowardDebtsInMonth(out, '2026-01')).toEqual({ card: 50000 });
  });
});

describe('undo window', () => {
  it('24 hours after confirm', () => {
    const out = confirmPayday(scenario(), input(), ctx);
    expect(canUndoPayday(out, new Date('2026-01-31T14:59:00.000Z'))).toBe(true);
    expect(canUndoPayday(out, new Date('2026-01-31T15:00:00.000Z'))).toBe(false);
    expect(canUndoPayday(scenario(), new Date(PAY_AT))).toBe(false);
  });
});

describe('start-of-period safe-to-spend', () => {
  it('sample and wizard states record it for the History trend', async () => {
    const { withStartSafePerDay } = await import('./sample');
    const s = sampleState('2026-01-20', NOW);
    expect(openPeriod(s).safePerDayAtStart).toBe(homeNumbers(s, '2026-01-20').safePerDay);
    const t = withStartSafePerDay({ ...s, account: { ...s.account, bankBalance: 0 } }, '2026-01-20');
    expect(openPeriod(t).safePerDayAtStart).toBe(0);
  });
});
