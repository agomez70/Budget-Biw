import { addDays, addMonthsYM, clampedDate, daysBetween, parseISO } from './dates';
import { mulRound } from './money';
import type { Cents, ISODate, Settings } from './types';

type PaySchedule = Pick<Settings, 'frequency' | 'firstPaycheck' | 'semiMonthlyDays'>;

/** All paycheck dates in [from, to], inclusive, ascending. */
export function paychecks(s: PaySchedule, from: ISODate, to: ISODate): ISODate[] {
  if (to < from) return [];
  const out: ISODate[] = [];
  if (s.frequency === 'weekly' || s.frequency === 'biweekly') {
    const step = s.frequency === 'weekly' ? 7 : 14;
    const offset = daysBetween(s.firstPaycheck, from);
    let k = Math.ceil(offset / step);
    for (let d = addDays(s.firstPaycheck, k * step); d <= to; d = addDays(s.firstPaycheck, ++k * step)) {
      out.push(d);
    }
    return out;
  }
  const start = parseISO(from);
  const end = parseISO(to);
  const anchorDay = parseISO(s.firstPaycheck).d;
  const days =
    s.frequency === 'monthly' ? [anchorDay] : [...s.semiMonthlyDays].sort((a, b) => a - b);
  for (let ym = { y: start.y, m: start.m }; ym.y * 12 + ym.m <= end.y * 12 + end.m; ym = addMonthsYM(ym.y, ym.m, 1)) {
    const seen = new Set<ISODate>();
    for (const day of days) {
      const d = clampedDate(ym.y, ym.m, day);
      if (!seen.has(d) && d >= from && d <= to) out.push(d);
      seen.add(d);
    }
  }
  return out;
}

const SEARCH_DAYS = 40; // longer than any pay interval

/** First paycheck strictly after `date`. */
export function nextPaycheckAfter(s: PaySchedule, date: ISODate): ISODate {
  const list = paychecks(s, addDays(date, 1), addDays(date, SEARCH_DAYS));
  return list[0];
}

/** Latest paycheck on or before `date`. */
export function paycheckOnOrBefore(s: PaySchedule, date: ISODate): ISODate {
  const list = paychecks(s, addDays(date, -SEARCH_DAYS), date);
  return list[list.length - 1];
}

/** Paycheck immediately before `date` (strictly earlier). */
export function prevPaycheck(s: PaySchedule, date: ISODate): ISODate {
  return paycheckOnOrBefore(s, addDays(date, -1));
}

export function hourlyTakeHome(rateCents: Cents, hours: number, taxPct: number): Cents {
  return Math.max(0, mulRound(rateCents, hours * (1 - taxPct / 100)));
}

/** Expected take-home for a normal paycheck. */
export function expectedPay(s: Settings): Cents {
  return s.payType === 'salary' ? s.paycheckAmount : hourlyTakeHome(s.hourlyRate, s.typicalHours, s.taxPct);
}
