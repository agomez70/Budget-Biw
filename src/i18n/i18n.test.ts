import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from './en';
import { es } from './es';
import { translate } from './index';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('i18n', () => {
  it('Spanish has exactly the English keys, all non-empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(es)) expect(v.trim()).not.toBe('');
  });
  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(es[k]), k).toEqual(ph(en[k]));
  });
  it('every static key used in the UI exists', () => {
    const src = files(join(__dirname, '..', 'ui')).map((f) => readFileSync(f, 'utf8')).join('\n');
    const used = [...src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(50);
    for (const k of used) expect(en, k).toHaveProperty([k]);
  });
  it('interpolates', () => {
    expect(translate('en', 'banner.question', { date: 'Jan 30', amount: '$10.00' })).toBe('Paycheck of Jan 30 expected: $10.00. Did it arrive?');
    expect(translate('es', 'warn.late', { date: '30 ene', days: 3 })).toBe('El pago del 30 ene lleva 3 días de retraso.');
  });
});
