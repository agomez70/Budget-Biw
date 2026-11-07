import { useState } from 'react';
import { addMonths, avalancheOrder, deleteDebt, monthOf, projection, setLump, sum, upsertDebt, type Debt } from '../../core';
import { useI18n } from '../../i18n';
import { useStore } from '../../state/context';
import { newId } from '../../state/store';
import { LineChart } from '../components/Charts';
import { Field, HowButton, MoneyInput, NumberInput, Sheet } from '../components/common';

export function Debts() {
  const { t, money, month } = useI18n();
  const { store, state, today } = useStore();
  const r = projection(state, today);
  const total = sum(state.debts.map((d) => d.balance));
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);
  const [lumpMonth, setLumpMonth] = useState(addMonths(monthOf(today), 1));
  const [lumpAmt, setLumpAmt] = useState<number | null>(null);
  const order = avalancheOrder(
    state.debts.filter((d) => d.balance > 0),
    monthOf(today),
  );
  const step = Math.max(1, Math.ceil(r.months.length / 24));
  const points = [{ label: month(monthOf(today)), value: total }, ...r.months.filter((_, i) => i % step === step - 1 || i === r.months.length - 1).map((m) => ({ label: month(m.month), value: m.totalBalance }))];

  return (
    <>
      <div className="card">
        <div className="hero-label">
          {t('debts.debtFree')}
          <HowButton title={t('debts.debtFree')} formula={t('how.payoff')} />
        </div>
        <div className="hero-value">{state.debts.length === 0 ? '—' : r.debtFreeMonth ? month(r.debtFreeMonth) : t('debts.never')}</div>
        <div className="stats">
          <div className="stat">
            <div className="label">{t('debts.total')}</div>
            <div className="value num">{money(total)}</div>
          </div>
          <div className="stat">
            <div className="label">{t('debts.interest')}</div>
            <div className="value num">{money(r.totalInterest)}</div>
          </div>
          <div className="stat">
            <div className="label">{t('debts.monthly')}</div>
            <div className="value num">{money(sum(state.debts.map((d) => d.minPayment)) + state.extraMonthly)}</div>
          </div>
        </div>
        {points.length > 2 && (
          <div className="mt">
            <div className="small muted mb">{t('debts.chartTitle')}</div>
            <LineChart points={points} format={(v) => money(v)} ariaLabel={t('debts.chartTitle')} />
          </div>
        )}
      </div>

      <div className="section-title">{t('debts.list')}</div>
      <div className="card">
        {state.debts.length === 0 && <div className="empty">{t('debts.none')}</div>}
        {state.debts.map((d) => {
          const rank = order.findIndex((x) => x.id === d.id);
          return (
            <button key={d.id} className="row tappable" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left' }} onClick={() => setEdit(d)}>
              <div className="grow">
                <div className="title">
                  {d.name} {rank === 0 && <span className="chip ok">{t('debts.target')}</span>}
                </div>
                <div className="meta">
                  {d.apr}% APR
                  {d.promoApr != null && d.promoEndMonth && ` · ${t('debts.promoUntil', { apr: d.promoApr, month: month(d.promoEndMonth) })}`} · {t('debts.min', { amount: money(d.minPayment) })}
                  {r.payoffMonth[d.id] && ` · ${t('debts.paidOff', { month: month(r.payoffMonth[d.id]!) })}`}
                </div>
              </div>
              <div className="amount num">{money(d.balance)}</div>
            </button>
          );
        })}
        <button className="btn small mt" onClick={() => setEdit('new')}>
          + {t('debts.add')}
        </button>
      </div>

      <div className="section-title">{t('debts.plan')}</div>
      <div className="card">
        <Field label={t('debts.extra')} hint={t('debts.extraHint')}>
          <MoneyInput value={state.extraMonthly} onChange={(c) => c != null && store.update((s) => ({ ...s, extraMonthly: c }))} />
        </Field>
        <div className="small muted mb">{t('debts.lumps')}</div>
        {Object.entries(state.lumps)
          .sort()
          .map(([m, c]) => (
            <div key={m} className="row">
              <div className="grow">{month(m)}</div>
              <div className="amount num">{money(c)}</div>
              <button className="btn ghost small" onClick={() => store.update((s) => setLump(s, m, 0))} aria-label={t('common.delete')}>
                ✕
              </button>
            </div>
          ))}
        <div className="field-row">
          <Field label={t('debts.lumpMonth')}>
            <input type="month" value={lumpMonth} min={monthOf(today)} onChange={(e) => setLumpMonth(e.target.value)} />
          </Field>
          <Field label={t('common.amount')}>
            <MoneyInput value={lumpAmt} onChange={setLumpAmt} />
          </Field>
        </div>
        <button
          className="btn small"
          disabled={!lumpAmt || !lumpMonth}
          onClick={() => {
            store.update((s) => setLump(s, lumpMonth, (s.lumps[lumpMonth] ?? 0) + lumpAmt!));
            setLumpAmt(null);
          }}
        >
          + {t('debts.addLump')}
        </button>
        {state.savings > 0 && <p className="small muted">{t('debts.savings', { amount: money(state.savings) })}</p>}
      </div>

      {edit && <DebtSheet debt={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function DebtSheet({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const { t } = useI18n();
  const { store, state } = useStore();
  const [d, setD] = useState<Debt>(debt ?? { id: newId('debt'), name: '', balance: 0, apr: 0, minPayment: 0, priority: state.debts.length + 1, isCard: false });
  const set = (p: Partial<Debt>) => setD((x) => ({ ...x, ...p }));
  const [promo, setPromo] = useState(d.promoApr != null);
  return (
    <Sheet title={debt ? t('debts.edit') : t('debts.add')} onClose={onClose}>
      <Field label={t('common.name')}>
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!debt} />
      </Field>
      <div className="field-row">
        <Field label={t('debts.balance')}>
          <MoneyInput value={d.balance} onChange={(c) => set({ balance: c ?? 0 })} />
        </Field>
        <Field label="APR %">
          <NumberInput value={d.apr} min={0} onChange={(n) => set({ apr: Math.max(0, n) })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label={t('debts.minPayment')}>
          <MoneyInput value={d.minPayment} onChange={(c) => set({ minPayment: c ?? 0 })} />
        </Field>
        <Field label={t('debts.priority')} hint={t('debts.priorityHint')}>
          <NumberInput value={d.priority} step="1" min={1} onChange={(n) => set({ priority: Math.round(n) })} />
        </Field>
      </div>
      <label className="row tappable">
        <input type="checkbox" className="check" checked={d.isCard} onChange={(e) => set({ isCard: e.target.checked })} />
        <div className="grow">
          <div>{t('debts.isCard')}</div>
          <div className="meta">{t('debts.isCardHint')}</div>
        </div>
      </label>
      <label className="row tappable">
        <input
          type="checkbox"
          className="check"
          checked={promo}
          onChange={(e) => {
            setPromo(e.target.checked);
            if (!e.target.checked) set({ promoApr: undefined, promoEndMonth: undefined });
            else set({ promoApr: 0, promoEndMonth: d.promoEndMonth ?? '' });
          }}
        />
        <div className="grow">{t('debts.promo')}</div>
      </label>
      {promo && (
        <div className="field-row mt">
          <Field label={t('debts.promoApr')}>
            <NumberInput value={d.promoApr ?? 0} min={0} onChange={(n) => set({ promoApr: Math.max(0, n) })} />
          </Field>
          <Field label={t('debts.promoEnd')}>
            <input type="month" value={d.promoEndMonth ?? ''} onChange={(e) => set({ promoEndMonth: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="btn-row mt">
        {debt && (
          <button
            className="btn danger"
            onClick={() => {
              store.update((s) => deleteDebt(s, debt.id));
              onClose();
            }}
          >
            {t('common.delete')}
          </button>
        )}
        <button
          className="btn primary"
          disabled={!d.name.trim()}
          onClick={() => {
            const clean = { ...d, name: d.name.trim() };
            if (!promo || !clean.promoEndMonth) {
              delete clean.promoApr;
              delete clean.promoEndMonth;
            }
            store.update((s) => upsertDebt(s, clean));
            onClose();
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
