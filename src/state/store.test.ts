import { describe, it, expect } from 'vitest';
import { BudgetStore } from './store';
import { MemoryStorage } from '../storage/Storage';
import { addLogEntry, exportJSON, billsOn, openPeriod, type PaydayInput } from '../core';

function setup(start = '2026-01-20T12:00:00') {
  let now = new Date(start);
  const storage = new MemoryStorage();
  const store = new BudgetStore(storage, () => now);
  return { store, storage, setNow: (s: string) => (now = new Date(s)) };
}

const payday = (store: BudgetStore): PaydayInput => ({
  paycheck: '2026-01-30',
  amount: 185000,
  actualBalance: store.state.account.bankBalance + 185000,
  paidOldBills: billsOn(store.state, openPeriod(store.state).start).map((b) => b.key),
  diffHandling: 'accept',
  leftoverAction: { kind: 'roll' },
});

describe('BudgetStore', () => {
  it('starts with sample data and a daily snapshot, once per day', async () => {
    const { store, storage, setNow } = setup();
    await store.init();
    expect(store.state.settings.setupComplete).toBe(false);
    expect(store.snapshots.map((s) => s.reason)).toEqual(['daily']);
    await store.flush();
    const again = new BudgetStore(storage, () => new Date('2026-01-20T18:00:00'));
    await again.init();
    expect(again.snapshots).toHaveLength(1);
    setNow('2026-01-21T08:00:00');
    const third = new BudgetStore(storage, () => new Date('2026-01-21T08:00:00'));
    await third.init();
    expect(third.snapshots.map((s) => s.reason)).toEqual(['daily', 'daily']);
  });

  it('persists every update', async () => {
    const { store, storage } = setup();
    await store.init();
    store.update((s) => addLogEntry(s, { id: 'x', date: '2026-01-20', amount: 100, note: '', kind: 'debit' }));
    await store.flush();
    expect((await storage.loadState())!.log).toHaveLength(1);
  });

  it('payday: snapshot first, idempotent, undo within 24h', async () => {
    const { store, setNow } = setup();
    await store.init();
    setNow('2026-01-30T09:00:00');
    const before = store.state;
    const input = payday(store);
    expect(store.confirmPayday(input)).toBe(true);
    expect(store.snapshots[0].reason).toBe('payday');
    expect(store.snapshots[0].state).toEqual(before);
    const count = store.snapshots.length;
    expect(store.confirmPayday(input)).toBe(false);
    expect(store.snapshots.length).toBe(count);
    setNow('2026-01-31T08:00:00');
    expect(store.canUndoPayday()).toBe(true);
    expect(store.undoLastPayday()).toBe(true);
    expect(store.state).toEqual(before);
    expect(store.snapshots[0].reason).toBe('restore');
    expect(store.canUndoPayday()).toBe(false);
  });

  it('undo expires after 24h', async () => {
    const { store, setNow } = setup();
    await store.init();
    setNow('2026-01-30T09:00:00');
    store.confirmPayday(payday(store));
    setNow('2026-01-31T09:00:01');
    expect(store.undoLastPayday()).toBe(false);
  });

  it('restore is itself undoable', async () => {
    const { store } = setup();
    await store.init();
    const daily = store.snapshots[0];
    store.update((s) => ({ ...s, savings: 999 }));
    store.restore(daily.id);
    expect(store.state.savings).toBe(0);
    const restoreSnap = store.snapshots.find((s) => s.reason === 'restore')!;
    expect(restoreSnap.state.savings).toBe(999);
    store.restore(restoreSnap.id);
    expect(store.state.savings).toBe(999);
  });

  it('restore keeps the language currently in use', async () => {
    const { store } = setup();
    await store.init();
    const daily = store.snapshots[0];
    store.update((s) => ({ ...s, settings: { ...s.settings, language: 'es' } }));
    store.restore(daily.id);
    expect(store.state.settings.language).toBe('es');
  });

  it('clear period and reset everything take snapshots first', async () => {
    const { store } = setup();
    await store.init();
    store.update((s) => ({ ...addLogEntry(s, { id: 'x', date: '2026-01-20', amount: 100, note: '', kind: 'debit' }), settings: { ...s.settings, setupComplete: true, language: 'es' } }));
    store.clearPeriod();
    expect(store.state.log).toEqual([]);
    expect(store.snapshots[0].reason).toBe('clear');
    expect(store.snapshots[0].state.log).toHaveLength(1);
    store.resetEverything();
    expect(store.snapshots[0].reason).toBe('reset');
    expect(store.state.settings.setupComplete).toBe(false);
    expect(store.state.settings.language).toBe('es');
  });

  it('import validates before snapshotting', async () => {
    const { store } = setup();
    await store.init();
    const n = store.snapshots.length;
    expect(() => store.importText('garbage')).toThrow();
    expect(store.snapshots.length).toBe(n);
    const exported = exportJSON({ ...store.state, savings: 4242 }, store.now);
    store.importText(exported);
    expect(store.state.savings).toBe(4242);
    expect(store.snapshots[0].reason).toBe('import');
  });
});
