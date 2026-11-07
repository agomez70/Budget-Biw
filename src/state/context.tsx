import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { todayISO, type AppState } from '../core';
import type { BudgetStore } from './store';

const Ctx = createContext<BudgetStore | null>(null);

export function StoreProvider({ store, children }: { store: BudgetStore; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Re-renders when the local date changes. */
function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const id = setInterval(() => setToday(todayISO()), 30_000);
    const onVis = () => setToday(todayISO());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return today;
}

export function useStore(): { store: BudgetStore; state: AppState; today: string } {
  const store = useContext(Ctx);
  if (!store) throw new Error('StoreProvider missing');
  useSyncExternalStore(store.subscribe, store.getVersion);
  const today = useToday();
  return { store, state: store.state, today };
}
