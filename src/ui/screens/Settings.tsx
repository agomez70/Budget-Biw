import { useRef, useState } from 'react';
import { exportJSON, ImportError, snapshotDiff, type Snapshot } from '../../core';
import { useI18n } from '../../i18n';
import { useStore } from '../../state/context';
import { Field, MoneyInput, TwoStepConfirm } from '../components/common';
import { PaySettingsForm } from '../components/PaySettingsForm';

type Confirm = 'clear' | 'reset' | { restore: Snapshot } | null;

export function SettingsScreen() {
  const { t, money, ts } = useI18n();
  const { store, state } = useStore();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    const blob = new Blob([exportJSON(state, new Date().toISOString())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      store.importText(await file.text());
      setMsg(t('settings.imported'));
    } catch (e) {
      setMsg(e instanceof ImportError ? t('settings.importFailed', { reason: e.message }) : t('settings.importFailed', { reason: String(e) }));
    }
  };

  return (
    <>
      <div className="section-title">{t('settings.pay')}</div>
      <div className="card">
        <PaySettingsForm value={state.settings} onChange={(settings) => store.update((s) => ({ ...s, settings }))} />
        <Field label={t('settings.tolerance')} hint={t('settings.toleranceHint')}>
          <MoneyInput value={state.settings.toleranceCents} onChange={(c) => c != null && store.update((s) => ({ ...s, settings: { ...s.settings, toleranceCents: c } }))} />
        </Field>
      </div>

      <div className="section-title">{t('settings.data')}</div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          {t('settings.localNote')}
        </p>
        <div className="btn-row">
          <button className="btn" onClick={doExport}>
            {t('settings.export')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t('settings.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="small">{msg}</p>}
        {state.savings > 0 && <p className="small muted">{t('debts.savings', { amount: money(state.savings) })}</p>}
      </div>

      <div className="section-title spread">
        <span>{t('settings.backups')}</span>
        <button className="btn small" onClick={() => store.takeSnapshot('manual')}>
          {t('settings.backupNow')}
        </button>
      </div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          {t('settings.backupsNote')}
        </p>
        {store.snapshots.length === 0 && <div className="empty">{t('settings.noBackups')}</div>}
        {store.snapshots.map((snap) => {
          const d = snapshotDiff(snap, state);
          return (
            <div key={snap.id} className="row">
              <div className="grow">
                <div className="title">
                  {ts(snap.at)} <span className="chip">{t(`reason.${snap.reason}`)}</span>
                </div>
                <div className="meta">
                  {t('settings.snapBalance', { amount: money(d.balance) })}
                  {d.balanceDelta !== 0 && ` (${money(d.balanceDelta, { sign: true })})`} · {t('settings.snapEntries', { n: d.logCount })}
                  {d.logDelta !== 0 && ` (${d.logDelta > 0 ? '+' : ''}${d.logDelta})`}
                  {d.periodsDelta !== 0 && ` · ${t('settings.snapPeriods', { n: d.periodsDelta > 0 ? `+${d.periodsDelta}` : d.periodsDelta })}`}
                </div>
              </div>
              <button className="btn small" onClick={() => setConfirm({ restore: snap })}>
                {t('settings.restore')}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-title">{t('settings.reset')}</div>
      <div className="card">
        <div className="row">
          <div className="grow">
            <div className="title">{t('reset.clearTitle')}</div>
            <div className="meta">{t('reset.clearDesc')}</div>
          </div>
          <button className="btn small" onClick={() => setConfirm('clear')}>
            {t('reset.clearButton')}
          </button>
        </div>
        <div className="row">
          <div className="grow">
            <div className="title">{t('reset.allTitle')}</div>
            <div className="meta">{t('reset.allDesc')}</div>
          </div>
          <button className="btn small danger" onClick={() => setConfirm('reset')}>
            {t('reset.allButton')}
          </button>
        </div>
      </div>
      <p className="center small muted">Budget Planner · v1</p>

      {confirm === 'clear' && <TwoStepConfirm title={t('reset.clearTitle')} description={t('reset.clearDesc')} confirmLabel={t('reset.clearButton')} onConfirm={() => store.clearPeriod()} onClose={() => setConfirm(null)} />}
      {confirm === 'reset' && <TwoStepConfirm title={t('reset.allTitle')} description={t('reset.allDesc')} confirmLabel={t('reset.allButton')} onConfirm={() => store.resetEverything()} onClose={() => setConfirm(null)} />}
      {confirm && typeof confirm === 'object' && (
        <TwoStepConfirm
          title={t('settings.restore')}
          description={t('settings.restoreDesc', { when: ts(confirm.restore.at) })}
          confirmLabel={t('settings.restore')}
          onConfirm={() => store.restore(confirm.restore.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
