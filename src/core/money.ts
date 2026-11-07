import type { Cents, Language } from './types';

export function assertCents(n: number): Cents {
  if (!Number.isInteger(n)) throw new Error(`Money must be integer cents, got ${n}`);
  return n;
}

/** Parse user input like "1,234.56", "$12", "12,5" (es) into cents. Returns null if invalid. */
export function parseMoney(input: string): Cents | null {
  let s = input.trim().replace(/[$\s]/g, '');
  let neg = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    neg = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let intPart = s;
  let frac = '';
  const groupsOk = (parts: string[]) => parts.slice(1).every((g) => g.length === 3) && parts[0].length > 0;
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    const idx = s.lastIndexOf(dec);
    intPart = s.slice(0, idx);
    frac = s.slice(idx + 1);
    if (intPart.includes(dec) || !groupsOk(intPart.split(thou))) return null;
    intPart = intPart.split(thou).join('');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2 || parts[1].length === 3) {
      if (!groupsOk(parts)) return null;
      intPart = parts.join('');
    } else {
      intPart = parts[0];
      frac = parts[1];
    }
  }
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  if (!intPart && !frac) return null;
  const cents = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -cents : cents;
}

export function formatMoney(c: Cents, lang: Language = 'en', opts: { sign?: boolean } = {}): string {
  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const s = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(Math.abs(c) / 100);
  if (c < 0) return `−${s}`;
  if (opts.sign && c > 0) return `+${s}`;
  return s;
}

/** Plain decimal string for input fields: 1234.5 -> "1234.50" */
export function centsToInput(c: Cents): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

/** Multiply cents by a rate and round half away from zero to integer cents. */
export function mulRound(c: Cents, factor: number): Cents {
  const v = c * factor;
  return Math.sign(v) * Math.round(Math.abs(v) + 1e-9);
}
