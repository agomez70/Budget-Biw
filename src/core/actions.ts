import { billAmount, upsertInstance } from './bills';
import { openPeriod } from './budget';
import type { AppState, BillInstance, BillRule, Cents, Debt, Deposit, ISODate, LogEntry, Timestamp } from './types';

/**
 * Pure state transitions for everyday edits. Each returns a new state.
 * Debit entries reduce the bank balance; card entries add to the card's
 * balance; deposits add to the bank balance; checking a bill pays it from
 * the bank (and reduces a linked debt).
 */

function adjustDebt(debts: Debt[], id: string | undefined, delta: Cents): Debt[] {
  if (!id || !delta) return debts;
  return debts.map((d) => (d.id === id ? { ...d, balance: Math.max(0, d.balance + delta) } : d));
}

export function defaultCardId(s: AppState): string | undefined {
  return s.debts.find((d) => d.isCard)?.id;
}

function applyEntry(s: AppState, e: LogEntry, sign: 1 | -1): AppState {
  if (e.kind === 'debit') {
    return { ...s, account: { ...s.account, bankBalance: s.account.bankBalance - sign * e.amount } };
  }
  return { ...s, debts: adjustDebt(s.debts, e.debtId ?? defaultCardId(s), sign * e.amount) };
}

export function addLogEntry(s: AppState, e: LogEntry): AppState {
  const entry = e.kind === 'card' && !e.debtId ? { ...e, debtId: defaultCardId(s) } : e;
  return applyEntry({ ...s, log: [...s.log, entry] }, entry, 1);
}

export function updateLogEntry(s: AppState, id: string, patch: Partial<Omit<LogEntry, 'id'>>): AppState {
  const old = s.log.find((e) => e.id === id);
  if (!old) return s;
  let next: LogEntry = { ...old, ...patch };
  if (next.kind === 'card' && !next.debtId) next = { ...next, debtId: defaultCardId(s) };
  if (next.kind === 'debit') delete next.debtId;
  const reverted = applyEntry(s, old, -1);
  return applyEntry({ ...reverted, log: s.log.map((e) => (e.id === id ? next : e)) }, next, 1);
}

export function deleteLogEntry(s: AppState, id: string): AppState {
  const old = s.log.find((e) => e.id === id);
  if (!old) return s;
  return applyEntry({ ...s, log: s.log.filter((e) => e.id !== id) }, old, -1);
}

const bank = (s: AppState, delta: Cents): AppState => ({ ...s, account: { ...s.account, bankBalance: s.account.bankBalance + delta } });

export function addDeposit(s: AppState, d: Deposit): AppState {
  return bank({ ...s, deposits: [...s.deposits, d] }, d.amount);
}

export function updateDeposit(s: AppState, id: string, patch: Partial<Omit<Deposit, 'id'>>): AppState {
  const old = s.deposits.find((d) => d.id === id);
  if (!old) return s;
  const next = { ...old, ...patch };
  return bank({ ...s, deposits: s.deposits.map((d) => (d.id === id ? next : d)) }, next.amount - old.amount);
}

export function deleteDeposit(s: AppState, id: string): AppState {
  const old = s.deposits.find((d) => d.id === id);
  if (!old) return s;
  return bank({ ...s, deposits: s.deposits.filter((d) => d.id !== id) }, -old.amount);
}

/** Effect of a bill being paid (sign 1) or un-paid (sign -1). */
function payEffect(s: AppState, b: BillInstance, sign: 1 | -1): AppState {
  const amt = billAmount(b);
  const withDebt = { ...s, debts: adjustDebt(s.debts, b.debtId, -sign * amt) };
  return b.source === 'paycheck' ? bank(withDebt, -sign * amt) : withDebt;
}

export function setBillChecked(s: AppState, b: BillInstance, checked: boolean): AppState {
  if (b.checked === checked) return s;
  const next = { ...b, checked };
  return payEffect({ ...s, billInstances: upsertInstance(s.billInstances, next) }, next, checked ? 1 : -1);
}

export function setBillOverride(s: AppState, b: BillInstance, override: Cents | undefined): AppState {
  const next: BillInstance = { ...b, override: override === b.amount ? undefined : override };
  let out: AppState = { ...s, billInstances: upsertInstance(s.billInstances, next) };
  if (b.checked) out = payEffect(payEffect(out, b, -1), next, 1);
  return out;
}

export function addManualBill(s: AppState, b: BillInstance): AppState {
  return { ...s, billInstances: upsertInstance(s.billInstances, { ...b, manual: true, checked: false }) };
}

/** Remove one occurrence (this paycheck only). */
export function deleteBillInstance(s: AppState, b: BillInstance): AppState {
  const out = b.checked ? payEffect(s, b, -1) : s;
  if (b.manual || b.carriedFrom) {
    return { ...out, billInstances: out.billInstances.filter((x) => !(x.key === b.key && x.paycheck === b.paycheck)) };
  }
  return { ...out, billInstances: upsertInstance(out.billInstances, { ...b, checked: false, deleted: true }) };
}

/** Correct the bank balance by hand. This never closes a period. */
export function setBankBalance(s: AppState, balance: Cents, now: Timestamp): AppState {
  const delta = balance - s.account.bankBalance;
  const open = openPeriod(s);
  return {
    ...s,
    account: { bankBalance: balance, asOf: now },
    periods: s.periods.map((p) => (p.id === open.id ? { ...p, manualAdjust: p.manualAdjust + delta } : p)),
  };
}

/** Clear current period: removes the active log and deposits only (reversing their effects). */
export function clearCurrentPeriod(s: AppState): AppState {
  let out = s;
  for (const e of s.log) out = deleteLogEntry(out, e.id);
  for (const d of s.deposits) out = deleteDeposit(out, d.id);
  return { ...out, log: [], deposits: [] };
}

export function upsertRule(s: AppState, r: BillRule): AppState {
  const exists = s.rules.some((x) => x.id === r.id);
  return { ...s, rules: exists ? s.rules.map((x) => (x.id === r.id ? r : x)) : [...s.rules, r] };
}

/** Delete a rule. Stored edits for its future occurrences go too; checked ones stay as history. */
export function deleteRule(s: AppState, id: string): AppState {
  return { ...s, rules: s.rules.filter((r) => r.id !== id), billInstances: s.billInstances.filter((b) => b.ruleId !== id || b.checked) };
}

export function upsertDebt(s: AppState, d: Debt): AppState {
  const exists = s.debts.some((x) => x.id === d.id);
  return { ...s, debts: exists ? s.debts.map((x) => (x.id === d.id ? d : x)) : [...s.debts, d] };
}

export function deleteDebt(s: AppState, id: string): AppState {
  return {
    ...s,
    debts: s.debts.filter((d) => d.id !== id),
    rules: s.rules.map((r) => (r.debtId === id ? { ...r, debtId: undefined } : r)),
  };
}

export function setLump(s: AppState, month: string, amount: Cents): AppState {
  const lumps = { ...s.lumps };
  if (amount > 0) lumps[month] = amount;
  else delete lumps[month];
  return { ...s, lumps };
}

export function isEditableDate(s: AppState, date: ISODate): boolean {
  return date >= openPeriod(s).start;
}
