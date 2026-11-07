import type { AppState, Snapshot } from '../core/types';

/**
 * Persistence boundary. The app only talks to this interface, so a sync
 * backend can be added later without touching the UI or the core.
 */
export interface Storage {
  loadState(): Promise<AppState | null>;
  saveState(state: AppState): Promise<void>;
  /** Newest first. */
  loadSnapshots(): Promise<Snapshot[]>;
  saveSnapshots(list: Snapshot[]): Promise<void>;
}

export class MemoryStorage implements Storage {
  private state: AppState | null = null;
  private snaps: Snapshot[] = [];
  async loadState() {
    return this.state ? structuredClone(this.state) : null;
  }
  async saveState(s: AppState) {
    this.state = structuredClone(s);
  }
  async loadSnapshots() {
    return structuredClone(this.snaps);
  }
  async saveSnapshots(list: Snapshot[]) {
    this.snaps = structuredClone(list);
  }
}
