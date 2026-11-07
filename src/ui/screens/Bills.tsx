import { useState } from 'react';
import {
  addManualBill,
  billAmount,
  billsOn,
  deleteBillInstance,
  deleteRule,
  depositBillsForMonth,
  expectedPay,
  hourlyTakeHome,
  monthOf,
  nextPaycheckAfter,
  openPeriod,
  prevPaycheck,
  setBillChecked,
  setBillOverride,
  sum,
  upsertRule,
  type BillInstance,
  type BillMode,
  type BillRule,
  type BillSource,
  type ISODate,
} from '../../core';
import { useI18n } from '../../i18n';
import { useStore } from '../../state/context';
import { newId } from '../../state/store';
import { Field, MoneyInput, NumberInput, Seg, Sheet } from '../components/common';
import { BillRow } from './Home';

export function Bills() {
  const { t, money, date, month } = useI18n();
  const { store, state, today } = useStore();
  const start = openPeriod(state).start;
  const [paycheck, setPaycheck] = useState<ISODate>(start);
  const pc = paycheck < start ? start : paycheck;
  const bills = billsOn(state, pc);
  const total = sum(bills.map(billAmount));
  const pay = state.received[pc]?.amount ?? expectedPay(state.settings);
  const [editInst, setEditInst] = useState<BillInstance | null>(null);
  const [addOneOff, setAddOneOff] = useState(false);
  const [editRule, setEditRule] = useState<BillRule | 'new' | null>(null);
  const s = state.settings;
  const slowPay = s.payType === 'hourly' ? hourlyTakeHome(s.hourlyRate, s.slowHours, s.taxPct) : null;
  const curMonth = monthOf(today);
  const depBills = depositBillsForMonth(state.rules, curMonth);
  const end = nextPaycheckAfter(s, pc);

  return (
    <>
      <div className="card">
        <div className="spread mb">
          <button className="btn small" disabled={pc <= start} onClick={() => setPaycheck(prevPaycheck(s, pc))} aria-label={t('common.previous')}>
            ‹
          </button>
          <div className="center">
            <div style={{ fontWeight: 650 }}>{t('bills.paycheckOf', { date: date(pc, { weekday: 'short', month: 'short', day: 'numeric' }) })}</div>
            <div className="small muted">
              {date(pc)} – {date(end)} {pc === start && <span className="chip ok">{t('bills.current')}</span>}
            </div>
          </div>
          <button className="btn small" onClick={() => setPaycheck(nextPaycheckAfter(s, pc))} aria-label={t('common.next')}>
            ›
          </button>
        </div>
        {bills.length === 0 && <div className="empty">{t('bills.none')}</div>}
        {bills.map((b) => (
          <BillRow key={b.key} b={b} onToggle={(c) => store.update((st) => setBillChecked(st, b, c))} onEdit={() => setEditInst(b)} />
        ))}
        <table className="recon mt">
          <tbody>
            <tr>
              <td>{state.received[pc] ? t('bills.payReceived') : t('bills.payExpected')}</td>
              <td>{money(pay)}</td>
            </tr>
            <tr>
              <td>{t('bills.total')}</td>
              <td>{money(-total)}</td>
            </tr>
            <tr className="total">
              <td>{t('bills.afterBills')}</td>
              <td>{money(pay - total)}</td>
            </tr>
          </tbody>
        </table>
        {slowPay != null && slowPay < total && <div className="card warn mt">{t('warn.slow', { date: date(pc), pay: money(slowPay), bills: money(total) })}</div>}
        <button className="btn small mt" onClick={() => setAddOneOff(true)}>
          + {t('bills.addOneOff')}
        </button>
      </div>

      <div className="section-title">{t('bills.recurring')}</div>
      <div className="card">
        {state.rules.length === 0 && <div className="empty">{t('bills.noRules')}</div>}
        {state.rules.map((r) => (
          <button key={r.id} className="row tappable" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left' }} onClick={() => setEditRule(r)}>
            <div className="grow">
              <div className="title">{r.name}</div>
              <div className="meta">
                {t(`mode.${r.mode}`)}
                {(r.mode === 'by' || r.mode === 'ahead') && ` · ${t('bills.dayN', { day: r.dueDay ?? 1 })}`}
                {r.mode === 'once' && r.dueDate && ` · ${date(r.dueDate)}`}
                {r.source === 'deposit' && ` · ${t('source.deposit')}`}
                {r.debtId && ` · ${state.debts.find((d) => d.id === r.debtId)?.name ?? ''}`}
              </div>
            </div>
            <div className="amount num">{money(r.amount)}</div>
          </button>
        ))}
        <button className="btn small mt" onClick={() => setEditRule('new')}>
          + {t('bills.addRule')}
        </button>
      </div>

      {(s.monthlyDeposit > 0 || depBills.length > 0) && (
        <>
          <div className="section-title">{t('bills.monthlyDeposit', { month: month(curMonth) })}</div>
          <div className="card">
            {depBills.map(({ rule, dueDate }) => (
              <div key={rule.id + dueDate} className="row">
                <div className="grow">
                  <div className="title">{rule.name}</div>
                  <div className="meta">{t('bills.due', { date: date(dueDate) })}</div>
                </div>
                <div className="amount num">{money(rule.amount)}</div>
              </div>
            ))}
            <table className="recon mt">
              <tbody>
                <tr>
                  <td>{t('settings.monthlyDeposit')}</td>
                  <td>{money(s.monthlyDeposit)}</td>
                </tr>
                <tr className="total">
                  <td>{t('bills.afterBills')}</td>
                  <td>{money(s.monthlyDeposit - sum(depBills.map((d) => d.rule.amount)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {editInst && <InstanceSheet inst={editInst} onClose={() => setEditInst(null)} />}
      {addOneOff && <OneOffSheet paycheck={pc} onClose={() => setAddOneOff(false)} />}
      {editRule && <RuleSheet rule={editRule === 'new' ? null : editRule} onClose={() => setEditRule(null)} />}
    </>
  );
}

function InstanceSheet({ inst, onClose }: { inst: BillInstance; onClose: () => void }) {
  const { t, money, date } = useI18n();
  const { store } = useStore();
  const [amt, setAmt] = useState<number | null>(billAmount(inst));
  return (
    <Sheet title={inst.name} onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        {t('bills.due', { date: date(inst.dueDate) })} · {t('bills.paycheckOf', { date: date(inst.paycheck) })}
      </p>
      <Field label={t('bills.actualAmount')} hint={inst.ruleId ? t('bills.plannedWas', { amount: money(inst.amount) }) : undefined}>
        <MoneyInput value={amt} onChange={setAmt} big />
      </Field>
      {inst.debtId && <p className="small muted">{t('bills.debtLinkedHint')}</p>}
      <div className="btn-row">
        <button
          className="btn danger"
          onClick={() => {
            store.update((s) => deleteBillInstance(s, inst));
            onClose();
          }}
        >
          {t('bills.deleteThisOnly')}
        </button>
        <button
          className="btn primary"
          disabled={amt == null}
          onClick={() => {
            store.update((s) => setBillOverride(s, inst, amt!));
            onClose();
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}

function OneOffSheet({ paycheck, onClose }: { paycheck: ISODate; onClose: () => void }) {
  const { t } = useI18n();
  const { store, state } = useStore();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(paycheck);
  const [debtId, setDebtId] = useState('');
  const valid = name.trim() && amount != null && amount > 0;
  return (
    <Sheet title={t('bills.addOneOff')} onClose={onClose}>
      <Field label={t('common.name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="field-row">
        <Field label={t('common.amount')}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label={t('bills.dueDate')}>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      {state.debts.length > 0 && (
        <Field label={t('bills.linkedDebt')}>
          <select value={debtId} onChange={(e) => setDebtId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {state.debts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <button
        className="btn primary block"
        disabled={!valid}
        onClick={() => {
          store.update((s) => addManualBill(s, { key: newId('bill'), paycheck, name: name.trim(), amount: amount!, dueDate, checked: false, source: 'paycheck', debtId: debtId || undefined }));
          onClose();
        }}
      >
        {t('common.add')}
      </button>
    </Sheet>
  );
}

function RuleSheet({ rule, onClose }: { rule: BillRule | null; onClose: () => void }) {
  const { t } = useI18n();
  const { store, state, today } = useStore();
  const [r, setR] = useState<BillRule>(rule ?? { id: newId('rule'), name: '', amount: 0, mode: 'by', dueDay: 1, source: 'paycheck' });
  const set = (p: Partial<BillRule>) => setR((x) => ({ ...x, ...p }));
  const valid = r.name.trim() && r.amount > 0 && (r.mode !== 'once' || r.dueDate);
  return (
    <Sheet title={rule ? t('bills.editRule') : t('bills.addRule')} onClose={onClose}>
      <Field label={t('common.name')}>
        <input value={r.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!rule} />
      </Field>
      <Field label={t('common.amount')}>
        <MoneyInput value={r.amount || null} onChange={(c) => set({ amount: c ?? 0 })} />
      </Field>
      <div className="field">
        <span>{t('bills.mode')}</span>
        <Seg<BillMode>
          full
          value={r.mode}
          onChange={(mode) => set({ mode, dueDate: mode === 'once' ? r.dueDate ?? today : r.dueDate })}
          options={(['by', 'ahead', 'each', 'once'] as BillMode[]).map((m) => ({ value: m, label: t(`mode.${m}`) }))}
        />
        <small className="hint">{t(`mode.${r.mode}.hint`)}</small>
      </div>
      {(r.mode === 'by' || r.mode === 'ahead') && (
        <Field label={t('bills.dueDay')} hint={t('bills.dueDayHint')}>
          <NumberInput value={r.dueDay ?? 1} min={1} max={31} step="1" onChange={(n) => set({ dueDay: Math.min(31, Math.max(1, Math.round(n))) })} />
        </Field>
      )}
      {r.mode === 'once' && (
        <Field label={t('bills.dueDate')}>
          <input type="date" value={r.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
      )}
      <div className="field">
        <span>{t('bills.source')}</span>
        <Seg<BillSource>
          full
          value={r.source}
          onChange={(source) => set({ source })}
          options={[
            { value: 'paycheck', label: t('source.paycheck') },
            { value: 'deposit', label: t('source.deposit') },
          ]}
        />
      </div>
      {state.debts.length > 0 && (
        <Field label={t('bills.linkedDebt')} hint={t('bills.linkedDebtHint')}>
          <select value={r.debtId ?? ''} onChange={(e) => set({ debtId: e.target.value || undefined })}>
            <option value="">{t('common.none')}</option>
            {state.debts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="btn-row mt">
        {rule && (
          <button
            className="btn danger"
            onClick={() => {
              store.update((s) => deleteRule(s, rule.id));
              onClose();
            }}
          >
            {t('common.delete')}
          </button>
        )}
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            store.update((s) => upsertRule(s, { ...r, name: r.name.trim() }));
            onClose();
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
