import { useState } from 'react';
import { daysBetween, history, type Period } from '../../core';
import { useI18n, type DictKey } from '../../i18n';
import { useStore } from '../../state/context';
import { GroupedBars } from '../components/Charts';
import { Sheet } from '../components/common';

export function History() {
  const { t, money, date } = useI18n();
  const { state } = useStore();
  const periods = history(state);
  const [open, setOpen] = useState<Period | null>(null);
  const recent = periods.slice(0, 12).reverse();
  const budget = (p: Period) => p.safePerDayAtStart * daysBetween(p.start, p.end!);
  const spent = (p: Period) => (p.summary ? p.summary.spentDebit + p.summary.spentCard : 0);

  if (periods.length === 0) {
    return (
      <div className="card">
        <div className="empty">{t('history.none')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>{t('history.spendVsSafe')}</h2>
        <GroupedBars
          ariaLabel={t('history.spendVsSafe')}
          series={[t('history.spent'), t('history.safeBudget')]}
          rows={recent.map((p) => ({ label: date(p.start), values: [spent(p), budget(p)] }))}
          format={(v) => money(v)}
        />
      </div>
      <div className="card">
        <h2>{t('history.leftoverTrend')}</h2>
        <GroupedBars ariaLabel={t('history.leftoverTrend')} series={[t('history.leftover')]} rows={recent.map((p) => ({ label: date(p.start), values: [p.summary?.leftover ?? 0] }))} format={(v) => money(v)} />
      </div>

      <div className="section-title">{t('history.periods')}</div>
      <div className="card">
        {periods.map((p) => (
          <button key={p.id} className="row tappable" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left' }} onClick={() => setOpen(p)}>
            <div className="grow">
              <div className="title">
                {date(p.start)} – {date(p.end!)}
              </div>
              <div className="meta">
                {t('history.spentN', { amount: money(spent(p)) })} · {t('history.leftoverN', { amount: money(p.summary?.leftover ?? 0) })}
              </div>
            </div>
            <span className="muted">›</span>
          </button>
        ))}
      </div>
      {open && <PeriodSheet p={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PeriodSheet({ p, onClose }: { p: Period; onClose: () => void }) {
  const { t, money, date } = useI18n();
  const s = p.summary!;
  const catLabel = (c: string) => {
    const k = `cat.${c}` as DictKey;
    return t(k) === k ? c : t(k);
  };
  const actionLabel =
    s.leftoverAction.kind === 'roll'
      ? t('history.rolled')
      : s.leftoverAction.kind === 'savings'
        ? t('history.toSavings')
        : t('history.toDebt', { name: s.debtBalances.find((d) => d.id === (s.leftoverAction as { debtId: string }).debtId)?.name ?? '' });
  const rows: [string, string][] = [
    [t('history.plannedPay'), money(s.plannedPay)],
    [t('history.actualPay'), money(s.actualPay)],
    [t('history.billsPaid'), money(s.billsPaidTotal)],
    [t('history.spentDebit'), money(s.spentDebit)],
    [t('history.spentCard'), money(s.spentCard)],
    [t('history.deposits'), money(s.depositsTotal)],
  ];
  if (s.unlogged) rows.push([t('history.unlogged'), money(s.unlogged)]);
  if (s.reconcileDiff) rows.push([t('history.diffAccepted'), money(s.reconcileDiff, { sign: true })]);
  rows.push([t('history.leftover'), `${money(s.leftover)} · ${actionLabel}`]);

  return (
    <Sheet title={`${date(p.start)} – ${date(p.end!)}`} onClose={onClose}>
      <table className="recon">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {Object.keys(s.byCategory).length > 0 && (
        <>
          <div className="section-title">{t('history.byCategory')}</div>
          {Object.entries(s.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <div key={c} className="spread small" style={{ padding: '4px 0' }}>
                <span>{c === 'uncategorized' ? t('history.uncategorized') : c === 'unlogged' ? t('history.unlogged') : catLabel(c)}</span>
                <span className="num">{money(v)}</span>
              </div>
            ))}
        </>
      )}
      <div className="section-title">{t('history.entries')}</div>
      {(p.log ?? []).length + (p.deposits ?? []).length === 0 && <div className="empty">{t('home.noEntries')}</div>}
      {(p.log ?? []).map((e) => (
        <div key={e.id} className="row">
          <div className="grow">
            <div className="title">{e.unlogged ? t('history.unlogged') : e.note || t('entry.purchase')}</div>
            <div className="meta">{date(e.date)}</div>
          </div>
          {e.kind === 'card' && <span className="chip card">{t('entry.card')}</span>}
          <div className="amount num">{money(-e.amount)}</div>
        </div>
      ))}
      {(p.deposits ?? []).map((d) => (
        <div key={d.id} className="row">
          <div className="grow">
            <div className="title">{d.note || t('entry.deposit')}</div>
            <div className="meta">{date(d.date)}</div>
          </div>
          <span className="chip ok">{t('entry.deposit')}</span>
          <div className="amount num pos">{money(d.amount, { sign: true })}</div>
        </div>
      ))}
      {s.billsPaid.length > 0 && (
        <>
          <div className="section-title">{t('history.billsPaid')}</div>
          {s.billsPaid.map((b, i) => (
            <div key={i} className="spread small" style={{ padding: '4px 0' }}>
              <span>{b.name}</span>
              <span className="num">{money(b.amount)}</span>
            </div>
          ))}
        </>
      )}
      {s.debtBalances.length > 0 && (
        <>
          <div className="section-title">{t('history.debtsAtClose')}</div>
          {s.debtBalances.map((d) => (
            <div key={d.id} className="spread small" style={{ padding: '4px 0' }}>
              <span>{d.name}</span>
              <span className="num">{money(d.balance)}</span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
