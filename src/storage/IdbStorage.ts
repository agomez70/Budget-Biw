import { createStore, get, set, type UseStore } from 'idb-keyval';
import type { AppState, Snapshot } from '../core/types';
import type { Storage } from './Storage';

const STATE_KEY = 'state';
const SNAPSHOTS_KEY = 'snapshots';

export class IdbStorage implements Storage {
  private store: UseStore;
  constructor(dbName = 'budget-planner', storeName = 'kv') {
    this.store = createStore(dbName, storeName);
  }
  async loadState() {
    return (await get<AppState>(STATE_KEY, this.store)) ?? null;
  }
  async saveState(state: AppState) {
    await set(STATE_KEY, state, this.store);
  }
  async loadSnapshots() {
    return (await get<Snapshot[]>(SNAPSHOTS_KEY, this.store)) ?? [];
  }
  async saveSnapshots(list: Snapshot[]) {
    await set(SNAPSHOTS_KEY, list, this.store);
  }
}
