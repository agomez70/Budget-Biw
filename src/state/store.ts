import {
  addSnapshot,
  clearCurrentPeriod,
  confirmPayday,
  importJSON,
  makeSnapshot,
  needsDailySnapshot,
  sampleState,
  todayISO,
  canUndoPayday,
  type AppState,
  type PaydayInput,
  type Snapshot,
  type SnapshotReason,
} from '../core';
import type { Storage } from '../storage/Storage';

export type Clock = () => Date;

let counter = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Holds app state, persists every change through `Storage`, and takes the
 * automatic snapshots (payday, reset, clear, import, restore, daily).
 * Framework-free so it can be unit tested.
 */
export class BudgetStore {
  state!: AppState;
  snapshots: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private saving: Promise<void> = Promise.resolve();
  private pending = false;

  constructor(
    private storage: Storage,
    private clock: Clock = () => new Date(),
  ) {}

  get today() {
    return todayISO(this.clock());
  }
  get now() {
    return this.clock().toISOString();
  }

  async init(): Promise<void> {
    const [loaded, snaps] = await Promise.all([this.storage.loadState(), this.storage.loadSnapshots()]);
    this.snapshots = snaps;
    if (loaded) {
      try {
        this.state = importJSON(JSON.stringify(loaded));
      } catch {
        this.state = loaded;
      }
    } else {
      const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('es') ? 'es' : 'en';
      this.state = sampleState(this.today, this.now, lang);
    }
    if (needsDailySnapshot(this.snapshots, this.today)) this.takeSnapshot('daily');
    await this.persist();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /** Coalesced writes: at most one save in flight, and the next one writes the latest state. */
  private persist(): Promise<void> {
    if (this.pending) return this.saving;
    this.pending = true;
    this.saving = this.saving.then(async () => {
      this.pending = false;
      await Promise.all([this.storage.saveState(this.state), this.storage.saveSnapshots(this.snapshots)]);
    });
    return this.saving;
  }

  /** Wait until everything has been written. */
  flush() {
    return this.saving;
  }

  update(fn: (s: AppState) => AppState): void {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    this.emit();
    void this.persist();
  }

  takeSnapshot(reason: SnapshotReason): Snapshot {
    const snap = makeSnapshot(this.state, reason, newId('snap'), this.now, this.today);
    this.snapshots = addSnapshot(this.snapshots, snap);
    this.emit();
    void this.persist();
    return snap;
  }

  /** Payday confirm: snapshot first, then the atomic close/open. Idempotent. */
  confirmPayday(input: PaydayInput): boolean {
    if (this.state.received[input.paycheck]) return false;
    const snap = this.takeSnapshot('payday');
    const next = confirmPayday(this.state, input, { now: this.now, today: this.today, snapshotId: snap.id });
    if (next === this.state) return false;
    this.update(() => next);
    return true;
  }

  canUndoPayday(): boolean {
    return canUndoPayday(this.state, this.clock()) && this.snapshots.some((s) => s.id === this.state.lastPayday?.snapshotId);
  }

  undoLastPayday(): boolean {
    if (!this.canUndoPayday()) return false;
    return this.restore(this.state.lastPayday!.snapshotId);
  }

  /** Restore a snapshot, snapshotting the current state first so restore is undoable too. */
  restore(id: string): boolean {
    const snap = this.snapshots.find((s) => s.id === id);
    if (!snap) return false;
    this.takeSnapshot('restore');
    const restored = structuredClone(snap.state);
    // Language is a display preference, not data: keep the one in use.
    restored.settings.language = this.state.settings.language;
    this.update(() => restored);
    return true;
  }

  clearPeriod(): void {
    this.takeSnapshot('clear');
    this.update(clearCurrentPeriod);
  }

  resetEverything(): void {
    this.takeSnapshot('reset');
    const lang = this.state.settings.language;
    const fresh = sampleState(this.today, this.now, lang);
    this.update(() => fresh);
  }

  /** Throws ImportError for bad input, before touching anything. */
  importText(text: string): void {
    const parsed = importJSON(text);
    this.takeSnapshot('import');
    this.update(() => parsed);
  }
}
