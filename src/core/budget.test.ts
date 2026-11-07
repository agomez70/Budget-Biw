import { describe, it, expect } from 'vitest';
import { cardAddedThisPeriod, daysUntilNextPaycheck, homeNumbers, nextBills, pendingPaycheck, safePerDay, trueRemaining, unpaidBillsDue, warnings } from './budget';
import { initialState, defaultSettings } from './sample';
import { upsertInstance } from './bills';
import type { AppState } from './types';

const NOW = '2026-01-20T12:00:00.000Z';
// Biweekly: 01-02, 01-16, 01-30, 02-13
function base(today = '2026-01-20'): AppState {
  const s = initialState({ ...defaultSettings('2026-01-02'), setupComplete: true }, 100000, today, NOW);
  s.rules = [
    { id: 'phone', name: 'Phone', amount: 5000, mode: 'by', dueDay: 25, source: 'paycheck' }, // on 01-16
    { id: 'rent', name: 'Rent', amount: 60000, mode: 'ahead', dueDay: 1, source: 'paycheck' }, // 02-01 on 01-16
    { id: 'gro', name: 'Groceries', amount: 10000, mode: 'each', source: 'paycheck' },
  ];
  return s;
}

describe('trueRemaining and safePerDay', () => {
  it('subtracts unpaid bills on paychecks ≤ today', () => {
    const s = base();
    expect(s.periods[0].start).toBe('2026-01-16');
    expect(unpaidBillsDue(s, '2026-01-20').map((b) => b.ruleId).sort()).toEqual(['gro', 'phone', 'rent']);
    expect(trueRemaining(s, '2026-01-20')).toBe(100000 - 75000);
  });
  it('checked bills are not subtracted', () => {
    const s = base();
    s.billInstances = upsertInstance([], { key: 'rent|2026-02-01', ruleId: 'rent', paycheck: '2026-01-16', name: 'Rent', amount: 60000, dueDate: '2026-02-01', checked: true, source: 'paycheck' });
    expect(trueRemaining(s, '2026-01-20')).toBe(100000 - 15000);
  });
  it('includes an unreceived paycheck dated ≤ today', () => {
    const s = base();
    // 01-30 paycheck has groceries; not received yet but dated ≤ today
    expect(trueRemaining(s, '2026-01-31')).toBe(100000 - 75000 - 10000);
  });
  it('days until next paycheck, min 1', () => {
    const s = base();
    expect(daysUntilNextPaycheck(s, '2026-01-20')).toBe(10);
    expect(daysUntilNextPaycheck(s, '2026-01-29')).toBe(1);
    expect(daysUntilNextPaycheck(s, '2026-01-30')).toBe(14);
  });
  it('safePerDay floors, is 0 when nothing remains, and rolls forward unspent money', () => {
    expect(safePerDay(25000, 10)).toBe(2500);
    expect(safePerDay(1000, 3)).toBe(333);
    expect(safePerDay(0, 5)).toBe(0);
    expect(safePerDay(-500, 5)).toBe(0);
    expect(safePerDay(500, 0)).toBe(500);
    // spending nothing for a day raises tomorrow's allowance
    const today = safePerDay(25000, 10);
    expect(safePerDay(25000, 9)).toBeGreaterThan(today);
  });
  it('homeNumbers bundles it all', () => {
    const s = base();
    s.log = [{ id: 'c', date: '2026-01-18', amount: 2500, note: '', kind: 'card' }];
    const h = homeNumbers(s, '2026-01-20');
    expect(h.trueRemaining).toBe(25000);
    expect(h.safePerDay).toBe(2500);
    expect(h.nextPaycheck).toBe('2026-01-30');
    expect(h.cardAdded).toBe(2500);
    expect(cardAddedThisPeriod(s)).toBe(2500);
  });
});

describe('next bills, pending paycheck, warnings', () => {
  it('next three unpaid bills from today', () => {
    const s = base();
    expect(nextBills(s, '2026-01-20', 3).map((b) => b.key)).toEqual(['phone|2026-01-25', 'gro|2026-01-30', 'rent|2026-02-01']);
  });
  it('pending paycheck appears on payday', () => {
    const s = base();
    expect(pendingPaycheck(s, '2026-01-29')).toBeNull();
    expect(pendingPaycheck(s, '2026-01-30')).toBe('2026-01-30');
    s.received['2026-01-30'] = { amount: 1, receivedAt: NOW };
    expect(pendingPaycheck(s, '2026-01-31')).toBeNull();
  });
  it('late paycheck warning after 2+ days', () => {
    const s = base();
    expect(warnings(s, '2026-01-31').some((w) => w.kind === 'latePaycheck')).toBe(false);
    expect(warnings(s, '2026-02-01')).toContainEqual({ kind: 'latePaycheck', paycheck: '2026-01-30', daysLate: 2 });
  });
  it('bills before next paycheck exceeding balance', () => {
    const s = base();
    s.account.bankBalance = 10000;
    const w = warnings(s, '2026-01-20').find((x) => x.kind === 'billsExceedBalance');
    expect(w).toMatchObject({ due: 15000, balance: 10000, nextPaycheck: '2026-01-30' });
    s.account.bankBalance = 90000;
    expect(warnings(s, '2026-01-20').some((x) => x.kind === 'billsExceedBalance')).toBe(false);
  });
  it('slow-period warning for hourly pay', () => {
    const s = base();
    s.settings = { ...s.settings, payType: 'hourly', hourlyRate: 1000, slowHours: 20, typicalHours: 80, taxPct: 0 };
    // slow pay 20000; paycheck 01-30 bills: groceries 10000 + phone? (phone on 01-16) → ok; 02-13: groceries + rent(03-01) 70000 → warn
    const w = warnings(s, '2026-01-20').find((x) => x.kind === 'slowPeriod');
    expect(w).toMatchObject({ paycheck: '2026-02-13', slowPay: 20000, bills: 75000 });
    s.settings.slowHours = 80;
    expect(warnings(s, '2026-01-20').some((x) => x.kind === 'slowPeriod')).toBe(false);
  });
});
