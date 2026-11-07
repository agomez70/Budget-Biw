import { describe, it, expect } from 'vitest';
import { assertCents, centsToInput, formatMoney, mulRound, parseMoney, sum } from './money';

describe('money', () => {
  it('parses user input to integer cents', () => {
    expect(parseMoney('12')).toBe(1200);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('$1,234.56')).toBe(123456);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('1,234')).toBe(123400);
    expect(parseMoney('-3.20')).toBe(-320);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseMoney('12.345.67')).toBeNull();
  });
  it('never produces floats', () => {
    expect(Number.isInteger(parseMoney('0.29')!)).toBe(true);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1.005')).toBe(100500);
  });
  it('formats', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(-500)).toBe('−$5.00');
    expect(formatMoney(500, 'en', { sign: true })).toBe('+$5.00');
    expect(centsToInput(123405)).toBe('1234.05');
    expect(centsToInput(-5)).toBe('-0.05');
  });
  it('helpers', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(mulRound(1000, 0.785)).toBe(785);
    expect(mulRound(-15, 0.5)).toBe(-8);
    expect(() => assertCents(1.5)).toThrow();
  });
});
