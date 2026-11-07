import type { AppState, Cents, ISODate, Snapshot, SnapshotReason, Timestamp } from './types';

export const MAX_SNAPSHOTS = 30;

export function makeSnapshot(state: AppState, reason: SnapshotReason, id: string, now: Timestamp, day: ISODate): Snapshot {
  return { id, at: now, day, reason, state: structuredClone(state) };
}

/** Add a snapshot and keep only the newest MAX_SNAPSHOTS. List is newest first. */
export function addSnapshot(list: Snapshot[], snap: Snapshot, max = MAX_SNAPSHOTS): Snapshot[] {
  return [snap, ...list.filter((s) => s.id !== snap.id)].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, max);
}

export function needsDailySnapshot(list: Snapshot[], today: ISODate): boolean {
  return !list.some((s) => s.reason === 'daily' && s.day === today);
}

export interface SnapshotDiff {
  balance: Cents;
  balanceDelta: Cents;
  logCount: number;
  logDelta: number;
  closedPeriods: number;
  periodsDelta: number;
}

/** Short summary of a snapshot compared to the current state. */
export function snapshotDiff(snap: Snapshot, current: AppState): SnapshotDiff {
  const closed = (s: AppState) => s.periods.filter((p) => p.status === 'closed').length;
  return {
    balance: snap.state.account.bankBalance,
    balanceDelta: snap.state.account.bankBalance - current.account.bankBalance,
    logCount: snap.state.log.length,
    logDelta: snap.state.log.length - current.log.length,
    closedPeriods: closed(snap.state),
    periodsDelta: closed(snap.state) - closed(current),
  };
}
