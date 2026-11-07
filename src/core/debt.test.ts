import { describe, it, expect } from 'vitest';
import { aprFor, avalancheOrder, debtPayoff, monthlyInterest } from './debt';
import type { Debt } from './types';

const d = (over: Partial<Debt>): Debt => ({ id: 'x', name: 'X', balance: 100000, apr: 0, minPayment: 10000, priority: 1, isCard: false, ...over });

describe('debtPayoff', () => {
  it('zero-interest single debt pays off in balance/payment months', () => {
    const r = debtPayoff([d({})], { startMonth: '2026-11', extraMonthly: 0 });
    expect(r.months).toHaveLength(10);
    expect(r.debtFreeMonth).toBe('2027-08');
    expect(r.totalInterest).toBe(0);
  });
  it('charges monthly interest in integer cents', () => {
    expect(monthlyInterest(100000, 12)).toBe(1000);
    expect(monthlyInterest(12345, 19.99)).toBe(206);
    expect(monthlyInterest(0, 20)).toBe(0);
    const r = debtPayoff([d({ apr: 12 })], { startMonth: '2026-01', extraMonthly: 0 });
    expect(r.months[0].interest).toBe(1000);
    expect(r.months[0].balances.x).toBe(91000);
    for (const m of r.months) for (const v of Object.values(m.balances)) expect(Number.isInteger(v)).toBe(true);
  });
  it('avalanche: extra goes to the highest APR, freed minimums roll over', () => {
    const debts = [d({ id: 'low', name: 'Low', apr: 5, balance: 50000, minPayment: 5000 }), d({ id: 'high', name: 'High', apr: 25, balance: 50000, minPayment: 5000 })];
    const r = debtPayoff(debts, { startMonth: '2026-01', extraMonthly: 10000 });
    expect(r.months[0].payments.high).toBe(15000);
    expect(r.months[0].payments.low).toBe(5000);
    expect(r.payoffMonth.high! < r.payoffMonth.low!).toBe(true);
    // after high is paid, total budget (20000) goes to low
    const after = r.months.find((m) => m.month > r.payoffMonth.high!)!;
    expect(after.payments.low).toBe(Math.min(20000, r.months[r.months.indexOf(after) - 1].balances.low + after.interest));
  });
  it('promo APR expiry changes the avalanche target', () => {
    const card = d({ id: 'card', name: 'Card', apr: 30, promoApr: 0, promoEndMonth: '2026-03', balance: 100000 });
    const loan = d({ id: 'loan', name: 'Loan', apr: 10, balance: 100000 });
    expect(aprFor(card, '2026-03')).toBe(0);
    expect(aprFor(card, '2026-04')).toBe(30);
    expect(avalancheOrder([card, loan], '2026-02')[0].id).toBe('loan');
    expect(avalancheOrder([card, loan], '2026-04')[0].id).toBe('card');
    const r = debtPayoff([card, loan], { startMonth: '2026-01', extraMonthly: 10000 });
    expect(r.months[0].interest).toBe(833); // loan only
    expect(r.months[0].payments.loan).toBe(20000);
    expect(r.months[3].payments.card).toBe(20000); // April: card is now the target
    expect(r.months[3].interest).toBeGreaterThan(r.months[2].interest);
  });
  it('priority breaks APR ties', () => {
    const r = avalancheOrder([d({ id: 'a', priority: 2 }), d({ id: 'b', priority: 1 })], '2026-01');
    expect(r.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('lump payments keyed by month', () => {
    const base = debtPayoff([d({ apr: 10 })], { startMonth: '2026-01', extraMonthly: 0 });
    const lump = debtPayoff([d({ apr: 10 })], { startMonth: '2026-01', extraMonthly: 0, lumps: { '2026-02': 50000 } });
    expect(lump.months[1].payments.x).toBe(60000);
    expect(lump.debtFreeMonth! < base.debtFreeMonth!).toBe(true);
    expect(lump.totalInterest).toBeLessThan(base.totalInterest);
  });
  it('uses the actual payment already made this month instead of the plan', () => {
    // Planned min 10000, but the user actually paid 30000 (balance already reduced).
    const after = d({ balance: 70000 });
    const r = debtPayoff([after], { startMonth: '2026-01', extraMonthly: 0, paidThisMonth: { x: 30000 } });
    expect(r.months[0].payments.x).toBe(0);
    expect(r.months[0].balances.x).toBe(70000);
    expect(r.debtFreeMonth).toBe('2026-08');
    // Paid less than planned: the remainder of the minimum is still paid this month
    const r2 = debtPayoff([d({ balance: 95000 })], { startMonth: '2026-01', extraMonthly: 0, paidThisMonth: { x: 5000 } });
    expect(r2.months[0].payments.x).toBe(5000);
  });
  it('returns null when payments never cover interest', () => {
    const r = debtPayoff([d({ apr: 30, balance: 1000000, minPayment: 1000 })], { startMonth: '2026-01', extraMonthly: 0, maxMonths: 120 });
    expect(r.debtFreeMonth).toBeNull();
    expect(r.payoffMonth.x).toBeNull();
  });
  it('already debt-free', () => {
    const r = debtPayoff([d({ balance: 0 })], { startMonth: '2026-01', extraMonthly: 0 });
    expect(r.debtFreeMonth).toBe('2026-01');
    expect(debtPayoff([], { startMonth: '2026-01', extraMonthly: 0 }).debtFreeMonth).toBe('2026-01');
  });
});
