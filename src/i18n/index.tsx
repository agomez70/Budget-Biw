import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { formatMoney, parseISO, type Cents, type ISODate, type Language } from '../core';
import { en, type DictKey } from './en';
import { es } from './es';

export const dictionaries: Record<Language, Record<DictKey, string>> = { en, es };

export type Vars = Record<string, string | number>;

export function translate(lang: Language, key: DictKey, vars?: Vars): string {
  let s = dictionaries[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const locale = (lang: Language) => (lang === 'es' ? 'es-US' : 'en-US');

/** Formats an ISO date without timezone drift (UTC fields in, UTC out). */
export function formatDate(lang: Language, iso: ISODate, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const { y, m, d } = parseISO(iso);
  return new Intl.DateTimeFormat(locale(lang), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonth(lang: Language, month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(lang), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatTimestamp(lang: Language, ts: string): string {
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

export interface I18n {
  lang: Language;
  t: (key: DictKey, vars?: Vars) => string;
  money: (c: Cents, opts?: { sign?: boolean }) => string;
  date: (iso: ISODate, opts?: Intl.DateTimeFormatOptions) => string;
  month: (m: string) => string;
  ts: (t: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (k, v) => translate(lang, k, v),
      money: (c, o) => formatMoney(c, lang, o),
      date: (iso, o) => formatDate(lang, iso, o),
      month: (m) => formatMonth(lang, m),
      ts: (t) => formatTimestamp(lang, t),
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}

export type { DictKey };
