import { homeNumbers } from './budget';
import { paycheckOnOrBefore, expectedPay } from './paychecks';
import type { AppState, ISODate, Settings, Timestamp } from './types';

export const STATE_VERSION = 1;

export function defaultSettings(firstPaycheck: ISODate = '2026-01-02'): Settings {
  return {
    payType: 'salary',
    frequency: 'biweekly',
    firstPaycheck,
    paycheckAmount: 185000,
    hourlyRate: 2200,
    typicalHours: 80,
    slowHours: 56,
    taxPct: 18,
    semiMonthlyDays: [15, 31],
    monthlyDeposit: 0,
    monthlyDepositDay: 1,
    language: 'en',
    toleranceCents: 500,
    setupComplete: false,
  };
}

export const DEFAULT_CATEGORIES = ['groceries', 'dining', 'gas', 'shopping', 'health', 'fun', 'other'];

/**
 * A fresh state with an open period that starts at the latest paycheck on
 * or before `today`. That paycheck counts as already received.
 */
export function initialState(settings: Settings, bankBalance: number, today: ISODate, now: Timestamp): AppState {
  const start = paycheckOnOrBefore(settings, today);
  const pay = expectedPay(settings);
  return {
    version: STATE_VERSION,
    settings,
    account: { bankBalance, asOf: now },
    rules: [],
    billInstances: [],
    debts: [],
    log: [],
    deposits: [],
    periods: [
      {
        id: `p-${start}`,
        start,
        status: 'open',
        plannedPay: pay,
        actualPay: pay,
        startBalance: bankBalance,
        safePerDayAtStart: 0,
        manualAdjust: 0,
      },
    ],
    received: { [start]: { amount: pay, receivedAt: now } },
    extraMonthly: 0,
    lumps: {},
    savings: 0,
    categories: [...DEFAULT_CATEGORIES],
  };
}

/** Sample data shown on first launch and after "Reset everything". */
export function sampleState(today: ISODate, now: Timestamp, language: Settings['language'] = 'en'): AppState {
  const settings = { ...defaultSettings('2026-01-02'), language };
  const s = initialState(settings, 245000, today, now);
  s.rules = [
    { id: 'rent', name: language === 'es' ? 'Renta' : 'Rent', amount: 125000, mode: 'ahead', dueDay: 1, source: 'paycheck' },
    { id: 'phone', name: language === 'es' ? 'Teléfono' : 'Phone', amount: 6500, mode: 'by', dueDay: 12, source: 'paycheck' },
    { id: 'power', name: language === 'es' ? 'Luz' : 'Electric', amount: 9000, mode: 'by', dueDay: 22, source: 'paycheck' },
    { id: 'groceries', name: language === 'es' ? 'Supermercado' : 'Groceries', amount: 20000, mode: 'each', source: 'paycheck' },
    { id: 'card-pay', name: language === 'es' ? 'Pago tarjeta' : 'Card payment', amount: 15000, mode: 'by', dueDay: 25, source: 'paycheck', debtId: 'card' },
  ];
  s.debts = [
    { id: 'card', name: language === 'es' ? 'Tarjeta' : 'Visa', balance: 340000, apr: 27.99, minPayment: 15000, priority: 1, isCard: true },
    { id: 'car', name: language === 'es' ? 'Auto' : 'Car loan', balance: 820000, apr: 6.9, minPayment: 28000, priority: 2, isCard: false },
  ];
  s.extraMonthly = 10000;
  return withStartSafePerDay(s, today);
}

/** Record the open period's starting safe-to-spend (used by the History trend). */
export function withStartSafePerDay(s: AppState, today: ISODate): AppState {
  const spd = homeNumbers(s, today).safePerDay;
  return { ...s, periods: s.periods.map((p) => (p.status === 'open' ? { ...p, safePerDayAtStart: spd } : p)) };
}
