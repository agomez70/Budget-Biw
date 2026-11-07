import type { ISODate, ISOMonth } from './types';

/**
 * All date math works on calendar fields via Date.UTC, so it never shifts
 * with the user's timezone. Never call `new Date('YYYY-MM-DD')`.
 */

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseISO(s: ISODate): YMD {
  const m = ISO_RE.exec(s);
  if (!m) throw new Error(`Invalid ISO date: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toISO(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Date in the given month with the day clamped to the month's last day. */
export function clampedDate(y: number, m: number, day: number): ISODate {
  return toISO(y, m, Math.min(Math.max(1, day), daysInMonth(y, m)));
}

function toEpochDay(s: ISODate): number {
  const { y, m, d } = parseISO(s);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromEpochDay(n: number): ISODate {
  const dt = new Date(n * DAY_MS);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(s) + n);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Add months to a (year, month) pair. */
export function addMonthsYM(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function monthOf(s: ISODate): ISOMonth {
  return s.slice(0, 7);
}

export function addMonths(month: ISOMonth, n: number): ISOMonth {
  const [y, m] = month.split('-').map(Number);
  const r = addMonthsYM(y, m, n);
  return `${pad(r.y, 4)}-${pad(r.m)}`;
}

/** Today's date in the user's local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}
