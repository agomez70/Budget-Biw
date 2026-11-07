import { describe, it, expect } from 'vitest';
import * as A from './actions';
import { billsOn, openPeriod, trueRemaining } from './budget';
import { sampleState } from './sample';

const NOW = '2026-01-20T12:00:00.000Z';
const fresh = () => sampleState('2026-01-20', NOW);
const card = (s: ReturnType<typeof fresh>) => s.debts.find((d) => d.id === 'card')!.balance;

describe('log entries', () => {
  it('debit reduces bank; card adds to card debt; edit and delete reverse', () => {
    let s = fresh();
    const bank0 = s.account.bankBalance;
    const card0 = card(s);
    s = A.addLogEntry(s, { id: 'a', date: '2026-01-20', amount: 1234, note: 'lunch', kind: 'debit' });
    expect(s.account.bankBalance).toBe(bank0 - 1234);
    s = A.addLogEntry(s, { id: 'b', date: '2026-01-20', amount: 5000, note: '', kind: 'card' });
    expect(card(s)).toBe(card0 + 5000);
    expect(s.log[1].debtId).toBe('card');
    s = A.updateLogEntry(s, 'a', { kind: 'card' });
    expect(s.account.bankBalance).toBe(bank0);
    expect(card(s)).toBe(card0 + 6234);
    s = A.updateLogEntry(s, 'b', { amount: 1000 });
    expect(card(s)).toBe(card0 + 2234);
    s = A.deleteLogEntry(s, 'b');
    s = A.deleteLogEntry(s, 'a');
    expect(card(s)).toBe(card0);
    expect(s.log).toHaveLength(0);
    expect(A.deleteLogEntry(s, 'nope')).toBe(s);
  });
});

describe('deposits', () => {
  it('add to bank (and true remaining) right away', () => {
    let s = fresh();
    const tr = trueRemaining(s, '2026-01-20');
    s = A.addDeposit(s, { id: 'd', date: '2026-01-20', amount: 4000, note: 'refund' });
    expect(trueRemaining(s, '2026-01-20')).toBe(tr + 4000);
    s = A.updateDeposit(s, 'd', { amount: 1000 });
    expect(trueRemaining(s, '2026-01-20')).toBe(tr + 1000);
    s = A.deleteDeposit(s, 'd');
    expect(trueRemaining(s, '2026-01-20')).toBe(tr);
  });
});

describe('bills', () => {
  it('checking pays from bank, leaves true remaining unchanged, and pays down a linked debt', () => {
    let s = fresh();
    const bills = billsOn(s, openPeriod(s).start);
    const cardPay = bills.find((b) => b.ruleId === 'card-pay')!;
    const tr = trueRemaining(s, '2026-01-20');
    const bank0 = s.account.bankBalance;
    s = A.setBillChecked(s, cardPay, true);
    expect(s.account.bankBalance).toBe(bank0 - 15000);
    expect(card(s)).toBe(340000 - 15000);
    expect(trueRemaining(s, '2026-01-20')).toBe(tr);
    // actual payment differs: override while checked adjusts by the delta
    const checked = billsOn(s, openPeriod(s).start).find((b) => b.ruleId === 'card-pay')!;
    s = A.setBillOverride(s, checked, 40000);
    expect(card(s)).toBe(340000 - 40000);
    expect(s.account.bankBalance).toBe(bank0 - 40000);
    const again = billsOn(s, openPeriod(s).start).find((b) => b.ruleId === 'card-pay')!;
    s = A.setBillChecked(s, again, false);
    expect(card(s)).toBe(340000);
    expect(s.account.bankBalance).toBe(bank0);
    expect(A.setBillChecked(s, { ...again, checked: false }, false)).toBe(s);
  });
  it('manual add and delete for one paycheck only', () => {
    let s = fresh();
    const p = openPeriod(s).start;
    s = A.addManualBill(s, { key: 'm', paycheck: p, name: 'Vet', amount: 9000, dueDate: '2026-01-21', checked: false, source: 'paycheck' });
    expect(billsOn(s, p).some((b) => b.key === 'm')).toBe(true);
    s = A.deleteBillInstance(s, billsOn(s, p).find((b) => b.key === 'm')!);
    expect(billsOn(s, p).some((b) => b.key === 'm')).toBe(false);
    const gro = billsOn(s, p).find((b) => b.ruleId === 'groceries')!;
    s = A.deleteBillInstance(s, gro);
    expect(billsOn(s, p).some((b) => b.ruleId === 'groceries')).toBe(false);
    expect(billsOn(s, '2026-01-30').some((b) => b.ruleId === 'groceries')).toBe(true);
  });
  it('deleting a checked bill refunds it', () => {
    let s = fresh();
    const p = openPeriod(s).start;
    const bank0 = s.account.bankBalance;
    s = A.setBillChecked(s, billsOn(s, p)[0], true);
    s = A.deleteBillInstance(s, billsOn(s, p)[0]);
    expect(s.account.bankBalance).toBe(bank0);
  });
});

describe('bank balance and clearing', () => {
  it('manual balance update records an adjustment and never closes the period', () => {
    let s = fresh();
    s = A.setBankBalance(s, 100000, '2026-01-21T00:00:00.000Z');
    expect(s.account).toEqual({ bankBalance: 100000, asOf: '2026-01-21T00:00:00.000Z' });
    expect(openPeriod(s).manualAdjust).toBe(100000 - 245000);
    expect(s.periods.filter((p) => p.status === 'closed')).toHaveLength(0);
  });
  it('clear current period removes log and deposits only', () => {
    let s = fresh();
    const bank0 = s.account.bankBalance;
    s = A.addLogEntry(s, { id: 'a', date: '2026-01-20', amount: 1000, note: '', kind: 'debit' });
    s = A.addLogEntry(s, { id: 'b', date: '2026-01-20', amount: 1000, note: '', kind: 'card' });
    s = A.addDeposit(s, { id: 'd', date: '2026-01-20', amount: 500, note: '' });
    s = A.setBillChecked(s, billsOn(s, openPeriod(s).start)[0], true);
    const rules = s.rules;
    const insts = s.billInstances;
    s = A.clearCurrentPeriod(s);
    expect(s.log).toEqual([]);
    expect(s.deposits).toEqual([]);
    expect(card(s)).toBe(340000);
    expect(s.rules).toBe(rules);
    expect(s.billInstances).toBe(insts);
    expect(s.account.bankBalance).toBe(bank0 - billsOn(s, openPeriod(s).start)[0].amount);
  });
});

describe('rules and debts', () => {
  it('crud', () => {
    let s = fresh();
    s = A.upsertRule(s, { id: 'new', name: 'Net', amount: 5000, mode: 'by', dueDay: 3, source: 'paycheck' });
    expect(s.rules.some((r) => r.id === 'new')).toBe(true);
    s = A.upsertRule(s, { ...s.rules.find((r) => r.id === 'new')!, amount: 6000 });
    expect(s.rules.find((r) => r.id === 'new')!.amount).toBe(6000);
    s = A.deleteRule(s, 'new');
    expect(s.rules.some((r) => r.id === 'new')).toBe(false);
    s = A.deleteDebt(s, 'card');
    expect(s.rules.find((r) => r.id === 'card-pay')!.debtId).toBeUndefined();
    s = A.upsertDebt(s, { id: 'z', name: 'Z', balance: 1, apr: 1, minPayment: 1, priority: 1, isCard: false });
    expect(s.debts.some((d) => d.id === 'z')).toBe(true);
    s = A.setLump(s, '2026-03', 5000);
    expect(s.lumps).toEqual({ '2026-03': 5000 });
    s = A.setLump(s, '2026-03', 0);
    expect(s.lumps).toEqual({});
    expect(A.isEditableDate(s, '2026-01-15')).toBe(false);
    expect(A.isEditableDate(s, '2026-01-16')).toBe(true);
  });
});
