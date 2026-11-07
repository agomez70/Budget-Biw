import { describe, it, expect } from 'vitest';
import { expectedPay, hourlyTakeHome, nextPaycheckAfter, paycheckOnOrBefore, paychecks, prevPaycheck } from './paychecks';
import { defaultSettings } from './sample';

const s = (over: Partial<ReturnType<typeof defaultSettings>>) => ({ ...defaultSettings('2026-01-02'), ...over });

describe('paychecks', () => {
  it('biweekly steps both directions from the anchor', () => {
    const st = s({ frequency: 'biweekly', firstPaycheck: '2026-01-02' });
    expect(paychecks(st, '2026-01-01', '2026-02-15')).toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13']);
    expect(paychecks(st, '2025-12-01', '2025-12-31')).toEqual(['2025-12-05', '2025-12-19']);
    expect(paychecks(st, '2026-01-03', '2026-01-15')).toEqual([]);
  });
  it('weekly', () => {
    const st = s({ frequency: 'weekly', firstPaycheck: '2026-01-02' });
    expect(paychecks(st, '2026-01-02', '2026-01-23')).toEqual(['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23']);
  });
  it('semi-monthly clamps to month end', () => {
    const st = s({ frequency: 'semimonthly', semiMonthlyDays: [15, 31] });
    expect(paychecks(st, '2026-01-01', '2026-03-01')).toEqual(['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28']);
    expect(paychecks(st, '2026-04-01', '2026-04-30')).toEqual(['2026-04-15', '2026-04-30']);
  });
  it('semi-monthly never duplicates a clamped day', () => {
    const st = s({ frequency: 'semimonthly', semiMonthlyDays: [30, 31] });
    expect(paychecks(st, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });
  it('monthly clamps to month end', () => {
    const st = s({ frequency: 'monthly', firstPaycheck: '2026-01-31' });
    expect(paychecks(st, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('neighbours', () => {
    const st = s({ frequency: 'biweekly', firstPaycheck: '2026-01-02' });
    expect(nextPaycheckAfter(st, '2026-01-02')).toBe('2026-01-16');
    expect(nextPaycheckAfter(st, '2026-01-10')).toBe('2026-01-16');
    expect(paycheckOnOrBefore(st, '2026-01-16')).toBe('2026-01-16');
    expect(paycheckOnOrBefore(st, '2026-01-15')).toBe('2026-01-02');
    expect(prevPaycheck(st, '2026-01-16')).toBe('2026-01-02');
  });
  it('empty when range reversed', () => {
    expect(paychecks(s({}), '2026-02-01', '2026-01-01')).toEqual([]);
  });
});

describe('pay amounts', () => {
  it('hourly take-home = rate × hours × (1 − tax%)', () => {
    expect(hourlyTakeHome(2000, 80, 20)).toBe(128000);
    expect(hourlyTakeHome(1875, 37.5, 12.5)).toBe(61523);
    expect(hourlyTakeHome(2000, 0, 20)).toBe(0);
  });
  it('expected pay by pay type', () => {
    expect(expectedPay(s({ payType: 'salary', paycheckAmount: 150000 }))).toBe(150000);
    expect(expectedPay(s({ payType: 'hourly', hourlyRate: 2000, typicalHours: 80, taxPct: 20 }))).toBe(128000);
  });
});
