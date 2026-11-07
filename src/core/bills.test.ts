import { describe, it, expect } from 'vitest';
import { billsForPeriod, depositBillsForMonth, dueDatesInRange, instancesForPaycheck, upsertInstance, windowFor, billAmount } from './bills';
import { defaultSettings } from './sample';
import type { BillRule } from './types';

const st = defaultSettings('2026-01-02'); // biweekly Fridays: 01-02, 01-16, 01-30, 02-13, 02-27
const rule = (over: Partial<BillRule>): BillRule => ({ id: 'r', name: 'Bill', amount: 1000, mode: 'by', dueDay: 20, source: 'paycheck', ...over });

describe('dueDatesInRange', () => {
  it('monthly with clamping', () => {
    expect(dueDatesInRange(rule({ dueDay: 31 }), '2026-02-01', '2026-03-05')).toEqual(['2026-02-28']);
    expect(dueDatesInRange(rule({ dueDay: 1 }), '2026-01-02', '2026-03-02')).toEqual(['2026-02-01', '2026-03-01']);
    expect(dueDatesInRange(rule({}), '2026-01-20', '2026-01-20')).toEqual([]);
  });
  it('once', () => {
    expect(dueDatesInRange(rule({ mode: 'once', dueDate: '2026-01-10' }), '2026-01-02', '2026-01-16')).toEqual(['2026-01-10']);
    expect(dueDatesInRange(rule({ mode: 'once', dueDate: '2026-01-16' }), '2026-01-02', '2026-01-16')).toEqual([]);
  });
});

describe('billsForPeriod', () => {
  it('by: falls on the paycheck on or before the due date', () => {
    const r = [rule({ dueDay: 20 })];
    expect(billsForPeriod(r, windowFor(st, '2026-01-02'))).toHaveLength(0);
    const b = billsForPeriod(r, windowFor(st, '2026-01-16'));
    expect(b.map((x) => x.dueDate)).toEqual(['2026-01-20']);
    // due on a payday: paid from that payday
    expect(billsForPeriod([rule({ dueDay: 16 })], windowFor(st, '2026-01-16'))).toHaveLength(1);
  });
  it('ahead: one paycheck earlier than by', () => {
    const r = [rule({ mode: 'ahead', dueDay: 20 })];
    expect(billsForPeriod(r, windowFor(st, '2026-01-02')).map((x) => x.dueDate)).toEqual(['2026-01-20']);
    expect(billsForPeriod(r, windowFor(st, '2026-01-16'))).toHaveLength(0);
  });
  it('each: every paycheck', () => {
    const r = [rule({ mode: 'each', dueDay: undefined, amount: 5000 })];
    for (const p of ['2026-01-02', '2026-01-16', '2026-01-30']) {
      const b = billsForPeriod(r, windowFor(st, p));
      expect(b).toHaveLength(1);
      expect(b[0].dueDate).toBe(p);
      expect(b[0].key).toBe(`r|${p}`);
    }
  });
  it('once', () => {
    const r = [rule({ mode: 'once', dueDate: '2026-02-01' })];
    expect(billsForPeriod(r, windowFor(st, '2026-01-30'))).toHaveLength(1);
    expect(billsForPeriod(r, windowFor(st, '2026-01-16'))).toHaveLength(0);
  });
  it('ignores deposit-funded bills', () => {
    expect(billsForPeriod([rule({ source: 'deposit' })], windowFor(st, '2026-01-16'))).toHaveLength(0);
  });
  it('every monthly occurrence lands on exactly one paycheck', () => {
    const r = [rule({ dueDay: 31 }), rule({ id: 'a', mode: 'ahead', dueDay: 1 })];
    const pcs = ['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13', '2026-02-27', '2026-03-13', '2026-03-27'];
    const all = pcs.flatMap((p) => billsForPeriod(r, windowFor(st, p)).map((b) => b.key));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('r|2026-02-28');
    expect(all).toContain('a|2026-03-01');
  });
  it('semi-monthly windows', () => {
    const s2 = { ...st, frequency: 'semimonthly' as const, semiMonthlyDays: [15, 31] as [number, number] };
    const w = windowFor(s2, '2026-02-15');
    expect(w).toEqual({ date: '2026-02-15', next: '2026-02-28', afterNext: '2026-03-15' });
    expect(billsForPeriod([rule({ dueDay: 27 })], w)).toHaveLength(1);
  });
});

describe('instancesForPaycheck', () => {
  const rules = [rule({ id: 'rent', dueDay: 20, amount: 100000 }), rule({ id: 'gym', mode: 'each', amount: 2000 })];
  const w = windowFor(st, '2026-01-16');
  it('merges stored checks, overrides, deletions and manual bills', () => {
    let stored = upsertInstance([], { ...billsForPeriod(rules, w)[0], checked: true, override: 1500 });
    stored = upsertInstance(stored, { key: 'm1', paycheck: '2026-01-16', name: 'Gift', amount: 3000, dueDate: '2026-01-18', checked: false, manual: true, source: 'paycheck' });
    stored = upsertInstance(stored, { key: 'm2', paycheck: '2026-01-30', name: 'Other', amount: 3000, dueDate: '2026-01-31', checked: false, manual: true, source: 'paycheck' });
    const list = instancesForPaycheck(rules, stored, w);
    expect(list.map((b) => b.key)).toEqual(['gym|2026-01-16', 'm1', 'rent|2026-01-20']);
    const gym = list[0];
    expect(gym.checked).toBe(true);
    expect(billAmount(gym)).toBe(1500);
    stored = upsertInstance(stored, { ...list[2], deleted: true });
    expect(instancesForPaycheck(rules, stored, w).map((b) => b.key)).toEqual(['gym|2026-01-16', 'm1']);
  });
  it('upsert replaces existing', () => {
    const b = billsForPeriod(rules, w)[0];
    const s1 = upsertInstance([b], { ...b, checked: true });
    expect(s1).toHaveLength(1);
    expect(s1[0].checked).toBe(true);
  });
});

describe('depositBillsForMonth', () => {
  it('lists deposit-funded bills in the month', () => {
    const r = [rule({ id: 'ins', source: 'deposit', dueDay: 31 }), rule({ id: 'x' }), rule({ id: 'e', source: 'deposit', mode: 'each' })];
    const out = depositBillsForMonth(r, '2026-02');
    expect(out.map((o) => [o.rule.id, o.dueDate])).toEqual([['ins', '2026-02-28'], ['e', '2026-02-01']]);
  });
});
