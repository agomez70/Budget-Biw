import { describe, it, expect } from 'vitest';
import { addDays, addMonths, clampedDate, daysBetween, daysInMonth, isISODate, parseISO, todayISO } from './dates';

describe('dates', () => {
  it('parses and validates', () => {
    expect(parseISO('2026-02-28')).toEqual({ y: 2026, m: 2, d: 28 });
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('nope')).toBe(false);
    expect(() => parseISO('2026/01/01')).toThrow();
  });
  it('adds days across months, years and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 14)).toBe('2026-11-15');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('counts days between', () => {
    expect(daysBetween('2026-01-01', '2026-01-15')).toBe(14);
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28);
  });
  it('clamps to month end', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(clampedDate(2026, 2, 31)).toBe('2026-02-28');
    expect(clampedDate(2026, 4, 31)).toBe('2026-04-30');
    expect(clampedDate(2026, 1, 31)).toBe('2026-01-31');
  });
  it('adds months', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('uses local calendar date for today', () => {
    expect(todayISO(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
    expect(todayISO(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});
