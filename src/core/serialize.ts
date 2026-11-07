import { isISODate } from './dates';
import { STATE_VERSION } from './sample';
import { DEFAULT_CATEGORIES } from './sample';
import type { AppState } from './types';

export const EXPORT_APP = 'budget-planner';

export interface ExportFile {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  state: AppState;
}

export function exportJSON(state: AppState, now: string): string {
  const file: ExportFile = { app: EXPORT_APP, version: STATE_VERSION, exportedAt: now, state };
  return JSON.stringify(file, null, 2);
}

export class ImportError extends Error {}

const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n);

/** Bring older saved states up to the current shape. */
export function migrate(raw: AppState): AppState {
  const s = { ...raw };
  s.categories ??= [...DEFAULT_CATEGORIES];
  s.lumps ??= {};
  s.savings ??= 0;
  s.extraMonthly ??= 0;
  s.billInstances ??= [];
  s.received ??= {};
  s.version = STATE_VERSION;
  return s;
}

/** Structural checks; money must be integer cents and dates ISO. */
export function validateState(s: unknown): asserts s is AppState {
  const fail = (msg: string): never => {
    throw new ImportError(msg);
  };
  if (!s || typeof s !== 'object') fail('Not an object');
  const st = s as AppState;
  if (!st.settings || !st.account || !Array.isArray(st.rules) || !Array.isArray(st.debts) || !Array.isArray(st.log) || !Array.isArray(st.periods) || !Array.isArray(st.deposits)) {
    fail('Missing required sections');
  }
  if (!isInt(st.account.bankBalance)) fail('Bank balance must be integer cents');
  if (!isISODate(st.settings.firstPaycheck)) fail('Invalid first paycheck date');
  for (const e of st.log) if (!isInt(e.amount) || !isISODate(e.date)) fail('Invalid log entry');
  for (const d of st.deposits) if (!isInt(d.amount) || !isISODate(d.date)) fail('Invalid deposit');
  for (const r of st.rules) if (!isInt(r.amount)) fail('Invalid bill amount');
  for (const d of st.debts) if (!isInt(d.balance) || !isInt(d.minPayment)) fail('Invalid debt');
  if (st.periods.filter((p) => p.status === 'open').length !== 1) fail('Exactly one open period is required');
}

export function importJSON(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('Not valid JSON');
  }
  const file = parsed as Partial<ExportFile>;
  const state = file && typeof file === 'object' && 'state' in file ? file.state : parsed;
  if (file && typeof file === 'object' && 'app' in file && file.app !== EXPORT_APP) throw new ImportError('Not a Budget Planner file');
  validateState(state);
  return migrate(state);
}
