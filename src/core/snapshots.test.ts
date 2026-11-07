import { describe, it, expect } from 'vitest';
import { addSnapshot, makeSnapshot, needsDailySnapshot, snapshotDiff, MAX_SNAPSHOTS } from './snapshots';
import { exportJSON, importJSON, ImportError } from './serialize';
import { sampleState } from './sample';
import * as A from './actions';

const NOW = '2026-01-20T12:00:00.000Z';

describe('snapshots', () => {
  it('copies state deeply', () => {
    const s = sampleState('2026-01-20', NOW);
    const snap = makeSnapshot(s, 'manual', 'a', NOW, '2026-01-20');
    s.account.bankBalance = 1;
    expect(snap.state.account.bankBalance).toBe(245000);
  });
  it('keeps the newest 30, newest first', () => {
    const s = sampleState('2026-01-20', NOW);
    let list = [] as ReturnType<typeof addSnapshot>;
    for (let i = 0; i < 35; i++) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
      list = addSnapshot(list, makeSnapshot(s, 'manual', `s${i}`, at, '2026-01-01'));
    }
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].id).toBe('s34');
    expect(list[29].id).toBe('s5');
  });
  it('daily snapshot once per day', () => {
    const s = sampleState('2026-01-20', NOW);
    const list = [makeSnapshot(s, 'daily', 'd', NOW, '2026-01-20'), makeSnapshot(s, 'payday', 'p', NOW, '2026-01-21')];
    expect(needsDailySnapshot(list, '2026-01-20')).toBe(false);
    expect(needsDailySnapshot(list, '2026-01-21')).toBe(true);
    expect(needsDailySnapshot([], '2026-01-21')).toBe(true);
  });
  it('diff summary vs current', () => {
    const s = sampleState('2026-01-20', NOW);
    const snap = makeSnapshot(s, 'manual', 'a', NOW, '2026-01-20');
    const cur = A.addLogEntry(s, { id: 'x', date: '2026-01-20', amount: 1000, note: '', kind: 'debit' });
    expect(snapshotDiff(snap, cur)).toMatchObject({ balance: 245000, balanceDelta: 1000, logCount: 0, logDelta: -1, periodsDelta: 0 });
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    const s = sampleState('2026-01-20', NOW);
    expect(importJSON(exportJSON(s, NOW))).toEqual(s);
  });
  it('accepts a bare state and migrates missing fields', () => {
    const s = sampleState('2026-01-20', NOW) as Partial<ReturnType<typeof sampleState>>;
    delete s.lumps;
    delete s.categories;
    const out = importJSON(JSON.stringify(s));
    expect(out.lumps).toEqual({});
    expect(out.categories.length).toBeGreaterThan(0);
  });
  it('rejects bad files', () => {
    expect(() => importJSON('{')).toThrow(ImportError);
    expect(() => importJSON('{"app":"other","state":{}}')).toThrow(ImportError);
    expect(() => importJSON('{}')).toThrow(ImportError);
    const s = sampleState('2026-01-20', NOW);
    s.account.bankBalance = 12.5;
    expect(() => importJSON(JSON.stringify(s))).toThrow(/integer cents/);
    const t = sampleState('2026-01-20', NOW);
    t.log.push({ id: 'x', date: '01/02/2026', amount: 1, note: '', kind: 'debit' });
    expect(() => importJSON(JSON.stringify(t))).toThrow(ImportError);
  });
});
