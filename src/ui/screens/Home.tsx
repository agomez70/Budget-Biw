import { useState } from 'react';
import { billAmount, homeNumbers, nextBills, openPeriod, pendingPaycheck, setBankBalance, setBillChecked, warnings, expectedPay, type Deposit, type LogEntry, type BillInstance } from '../../core';
import { useI18n, type DictKey } from '../../i18n';
import { useStore } from '../../state/context';
import { Field, HowButton, MoneyInput, Sheet } from '../components/common';
import { EntrySheet, type EntryTarget } from '../components/EntrySheet';
import { PaydaySheet } from '../components/PaydaySheet';

export function Home() {
  const { t, money, date, ts } = useI18n();
  const { store, state, today } = useStore();
  const h = homeNumbers(state, today);
  const pending = pendingPaycheck(state, today);
  const warns = warnings(state, today);
  const upcoming = nextBills(state, today, 3);
  const [entry, setEntry] = useState<EntryTarget | null>(null);
  const [payday, setPayday] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState(false);
  const canUndo = store.canUndoPayday();
  const period = openPeriod(state);

  type Item = { kind: 'log'; e: LogEntry } | { kind: 'dep'; e: Deposit };
  const items: Item[] = [...state.log.map((e) => ({ kind: 'log' as const, e })), ...state.deposits.map((e) => ({ kind: 'dep' as const, e }))].sort((a, b) =>
    a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : 0,
  );

  return (
    <>
      {pending && (
        <div className="card accent">
          <div className="small muted">{t('banner.payday')}</div>
          <p style={{ margin: '4px 0 12px', fontSize: 17 }}>
            {t('banner.question', { date: date(pending, { weekday: 'short', month: 'short', day: 'numeric' }), amount: money(expectedPay(state.settings)) })}
          </p>
          <button className="btn primary block" onClick={() => setPayday(pending)}>
            {t('banner.record')}
          </button>
        </div>
      )}

      {canUndo && state.lastPayday && (
        <div className="card spread">
          <span className="small">{t('undo.text', { date: date(state.lastPayday.paycheck) })}</span>
          <button className="btn small" onClick={() => store.undoLastPayday()}>
            {t('undo.button')}
          </button>
        </div>
      )}

      {warns.map((w, i) => (
        <div key={i} className={`card ${w.kind === 'billsExceedBalance' ? 'danger' : 'warn'}`} role="alert">
          {w.kind === 'billsExceedBalance' && t('warn.billsExceed', { due: money(w.due), balance: money(w.balance), date: date(w.nextPaycheck) })}
          {w.kind === 'latePaycheck' && t('warn.late', { date: date(w.paycheck), days: w.daysLate })}
          {w.kind === 'slowPeriod' && t('warn.slow', { date: date(w.paycheck), pay: money(w.slowPay), bills: money(w.bills) })}
        </div>
      ))}

      <div className="card">
        <div className="hero-label">
          {t('home.trueRemaining')}
          <HowButton
            title={t('home.trueRemaining')}
            formula={t('how.trueRemaining')}
            lines={[
              [t('home.bankBalance'), money(h.bank)],
              ...h.unpaidBills.map((b): [string, string] => [`− ${b.name} (${date(b.dueDate)})`, money(-billAmount(b))]),
              [t('home.trueRemaining'), money(h.trueRemaining)],
            ]}
          />
        </div>
        <div className={`hero-value num${h.trueRemaining < 0 ? ' neg' : ''}`}>{money(h.trueRemaining)}</div>
        <div className="stats">
          <div className="stat">
            <div className="label">
              {t('home.safePerDay')}
              <HowButton
                title={t('home.safePerDay')}
                formula={t('how.safePerDay')}
                lines={[
                  [t('home.trueRemaining'), money(h.trueRemaining)],
                  [t('home.daysLeft'), String(h.days)],
                  [t('home.safePerDay'), money(h.safePerDay)],
                ]}
              />
            </div>
            <div className="value num">{money(h.safePerDay)}</div>
          </div>
          <div className="stat">
            <div className="label">
              {t('home.daysLeft')}
              <HowButton title={t('home.daysLeft')} formula={t('how.days', { date: date(h.nextPaycheck) })} />
            </div>
            <div className="value num">{h.days}</div>
            <div className="sub">{t('home.nextPay', { date: date(h.nextPaycheck, { weekday: 'short', month: 'short', day: 'numeric' }) })}</div>
          </div>
          <div className="stat">
            <div className="label">
              {t('home.cardAdded')}
              <HowButton
                title={t('home.cardAdded')}
                formula={t('how.cardAdded')}
                lines={[...state.log.filter((e) => e.kind === 'card').map((e): [string, string] => [e.note || date(e.date), money(e.amount)]), [t('common.total'), money(h.cardAdded)]]}
              />
            </div>
            <div className="value num">{money(h.cardAdded)}</div>
          </div>
        </div>
        <button className="row tappable" style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border)', marginTop: 12, padding: '12px 0 0', textAlign: 'left' }} onClick={() => setEditBalance(true)}>
          <div className="grow">
            <div className="meta">{t('home.bankBalance')}</div>
            <div className="small muted">{t('home.asOf', { when: ts(state.account.asOf) })}</div>
          </div>
          <div className="amount num">{money(h.bank)}</div>
          <span className="muted">›</span>
        </button>
      </div>

      <div className="section-title">{t('home.nextBills')}</div>
      <div className="card">
        {upcoming.length === 0 && <div className="empty">{t('home.noBills')}</div>}
        {upcoming.map((b) => (
          <BillRow key={b.key + b.paycheck} b={b} onToggle={(c) => store.update((s) => setBillChecked(s, b, c))} />
        ))}
      </div>

      <div className="section-title spread">
        <span>{t('home.thisPeriod', { date: date(period.start) })}</span>
      </div>
      <div className="card">
        {items.length === 0 && <div className="empty">{t('home.noEntries')}</div>}
        {items.map((it) => (
          <button
            key={it.e.id}
            className="row tappable"
            style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left' }}
            onClick={() => setEntry(it.kind === 'log' ? { type: 'purchase', entry: it.e } : { type: 'deposit', entry: it.e })}
          >
            <div className="grow">
              <div className="title">{it.e.note || (it.kind === 'dep' ? t('entry.deposit') : t('entry.purchase'))}</div>
              <div className="meta">
                {date(it.e.date)}
                {it.kind === 'log' && it.e.category && <> · {t(`cat.${it.e.category}` as DictKey) === `cat.${it.e.category}` ? it.e.category : t(`cat.${it.e.category}` as DictKey)}</>}
              </div>
            </div>
            {it.kind === 'log' && it.e.kind === 'card' && <span className="chip card">{t('entry.card')}</span>}
            {it.kind === 'dep' && <span className="chip ok">{t('entry.deposit')}</span>}
            <div className={`amount num ${it.kind === 'dep' ? 'pos' : ''}`}>{it.kind === 'dep' ? money(it.e.amount, { sign: true }) : money(-it.e.amount)}</div>
          </button>
        ))}
        <div className="btn-row mt">
          <button className="btn small" onClick={() => setEntry({ type: 'deposit' })}>
            + {t('entry.deposit')}
          </button>
        </div>
      </div>

      <div className="fab-row">
        <button className="btn primary" onClick={() => setEntry({ type: 'purchase' })}>
          + {t('home.quickAdd')}
        </button>
      </div>

      {entry && <EntrySheet target={entry} onClose={() => setEntry(null)} />}
      {payday && <PaydaySheet paycheck={payday} onClose={() => setPayday(null)} />}
      {editBalance && <BalanceSheet onClose={() => setEditBalance(false)} />}
    </>
  );
}

function BalanceSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { store, state } = useStore();
  const [v, setV] = useState<number | null>(state.account.bankBalance);
  return (
    <Sheet title={t('balance.title')} onClose={onClose}>
      <Field label={t('home.bankBalance')} hint={t('balance.hint')}>
        <MoneyInput value={v} onChange={setV} big autoFocus allowNegative />
      </Field>
      <button
        className="btn primary block"
        disabled={v == null}
        onClick={() => {
          store.update((s) => setBankBalance(s, v!, new Date().toISOString()));
          onClose();
        }}
      >
        {t('common.save')}
      </button>
    </Sheet>
  );
}

export function BillRow({ b, onToggle, onEdit }: { b: BillInstance; onToggle: (checked: boolean) => void; onEdit?: () => void }) {
  const { t, money, date } = useI18n();
  return (
    <div className={`row${b.checked ? ' done' : ''}`}>
      <input type="checkbox" className="check" checked={b.checked} onChange={(e) => onToggle(e.target.checked)} aria-label={t('bills.markPaid', { name: b.name })} />
      <div className={`grow${onEdit ? ' tappable' : ''}`} onClick={onEdit} role={onEdit ? 'button' : undefined}>
        <div className="title">{b.name}</div>
        <div className="meta">
          {t('bills.due', { date: date(b.dueDate) })}
          {b.carriedFrom && <> · {t('bills.carried')}</>}
          {b.manual && <> · {t('bills.oneOff')}</>}
        </div>
      </div>
      <div className="amount num" onClick={onEdit}>
        {money(billAmount(b))}
        {b.override != null && b.override !== b.amount && <div className="small muted" style={{ textDecoration: 'line-through', textAlign: 'right' }}>{money(b.amount)}</div>}
      </div>
    </div>
  );
}
