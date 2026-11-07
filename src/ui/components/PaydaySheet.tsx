import { useMemo, useState } from 'react';
import {
  amountFromHours,
  billAmount,
  closingBills,
  expectedPay,
  leftover as leftoverOf,
  leftoverPreview,
  reconcile,
  type ISODate,
  type LeftoverAction,
} from '../../core';
import { useI18n } from '../../i18n';
import { useStore } from '../../state/context';
import { Field, MoneyInput, NumberInput, Seg, Sheet } from './common';

export function PaydaySheet({ paycheck, onClose }: { paycheck: ISODate; onClose: () => void }) {
  const { t, money, date, month } = useI18n();
  const { store, state, today } = useStore();
  const s = state.settings;
  const expected = expectedPay(s);
  const [step, setStep] = useState(1);
  const [byHours, setByHours] = useState(false);
  const [hours, setHours] = useState(s.typicalHours);
  const [amountInput, setAmountInput] = useState<number | null>(expected);
  const amount = byHours ? amountFromHours(state, hours) : amountInput;
  const [actual, setActual] = useState<number | null>(null);
  const [paidOld, setPaidOld] = useState<string[]>([]);
  const [diffHandling, setDiffHandling] = useState<'unlogged' | 'accept'>('unlogged');
  const [leftKind, setLeftKind] = useState<LeftoverAction['kind']>('roll');
  const [debtId, setDebtId] = useState(() => [...state.debts].filter((d) => d.balance > 0).sort((a, b) => b.apr - a.apr)[0]?.id ?? '');

  const unchecked = useMemo(() => closingBills(state, paycheck).filter((b) => !b.checked && b.source === 'paycheck'), [state, paycheck]);
  const input = { paycheck, amount: amount ?? 0, actualBalance: actual ?? 0, paidOldBills: paidOld };
  const rec = reconcile(state, input);
  const left = leftoverOf(state, input);
  const action: LeftoverAction = leftKind === 'debt' ? { kind: 'debt', debtId } : leftKind === 'savings' ? { kind: 'savings' } : { kind: 'roll' };
  const preview = left > 0 && state.debts.length > 0 ? leftoverPreview(state, today, left, action) : null;
  const fmtMonth = (m: string | null) => (m ? month(m) : t('debts.never'));

  const confirm = () => {
    store.confirmPayday({ ...input, diffHandling: rec.matches || rec.diff > 0 ? 'accept' : diffHandling, leftoverAction: left > 0 ? action : { kind: 'roll' } });
    onClose();
  };

  return (
    <Sheet title={t('payday.title', { date: date(paycheck) })} onClose={onClose}>
      <div className="steps" aria-label={t('payday.stepOf', { step, total: 3 })}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 1 && (
        <>
          <h4 style={{ margin: '0 0 12px' }}>{t('payday.step1')}</h4>
          {s.payType === 'hourly' && (
            <div className="mb">
              <Seg
                full
                value={byHours ? 'hours' : 'amount'}
                onChange={(v) => setByHours(v === 'hours')}
                options={[
                  { value: 'amount', label: t('payday.enterAmount') },
                  { value: 'hours', label: t('payday.enterHours') },
                ]}
              />
            </div>
          )}
          {byHours ? (
            <>
              <Field label={t('payday.hoursWorked')}>
                <NumberInput value={hours} onChange={setHours} min={0} />
              </Field>
              <p className="muted">
                {t('payday.calculated')}: <strong className="num">{money(amount ?? 0)}</strong>
                <br />
                <small>
                  {money(s.hourlyRate)} × {hours} h × (1 − {s.taxPct}%)
                </small>
              </p>
            </>
          ) : (
            <Field label={t('payday.actualPay')} hint={t('payday.expectedWas', { amount: money(expected) })}>
              <MoneyInput value={amountInput} onChange={setAmountInput} big autoFocus />
            </Field>
          )}
          <button className="btn primary block mt" disabled={amount == null || amount <= 0} onClick={() => setStep(2)}>
            {t('common.next')}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h4 style={{ margin: '0 0 12px' }}>{t('payday.step2')}</h4>
          <Field label={t('payday.realBalance')} hint={t('payday.realBalanceHint')}>
            <MoneyInput value={actual} onChange={setActual} big autoFocus allowNegative />
          </Field>
          {unchecked.length > 0 && (
            <div className="card">
              <h2>{t('payday.unpaidQuestion')}</h2>
              {unchecked.map((b) => (
                <label key={b.key} className="row tappable">
                  <input
                    type="checkbox"
                    className="check"
                    checked={paidOld.includes(b.key)}
                    onChange={(e) => setPaidOld((p) => (e.target.checked ? [...p, b.key] : p.filter((k) => k !== b.key)))}
                  />
                  <div className="grow">
                    <div className="title">{b.name}</div>
                    <div className="meta">{t('bills.due', { date: date(b.dueDate) })}</div>
                  </div>
                  <div className="amount num">{money(billAmount(b))}</div>
                </label>
              ))}
              <p className="muted small" style={{ marginBottom: 0 }}>
                {t('payday.unpaidCarry')}
              </p>
            </div>
          )}
          <table className="recon">
            <tbody>
              <tr>
                <td>{t('recon.previous')}</td>
                <td>{money(rec.startBalance)}</td>
              </tr>
              {rec.manualAdjust !== 0 && (
                <tr>
                  <td>{t('recon.manual')}</td>
                  <td>{money(rec.manualAdjust, { sign: true })}</td>
                </tr>
              )}
              <tr>
                <td>{t('recon.purchases')}</td>
                <td>{money(-rec.debits)}</td>
              </tr>
              <tr>
                <td>{t('recon.billsChecked')}</td>
                <td>{money(-rec.checkedBills)}</td>
              </tr>
              {rec.newlyPaid > 0 && (
                <tr>
                  <td>{t('recon.billsJustPaid')}</td>
                  <td>{money(-rec.newlyPaid)}</td>
                </tr>
              )}
              <tr>
                <td>{t('recon.deposits')}</td>
                <td>{money(rec.deposits, { sign: true })}</td>
              </tr>
              {rec.other !== 0 && (
                <tr>
                  <td>{t('recon.other')}</td>
                  <td>{money(rec.other, { sign: true })}</td>
                </tr>
              )}
              <tr>
                <td>{t('recon.paycheck')}</td>
                <td>{money(rec.paycheck, { sign: true })}</td>
              </tr>
              <tr className="total">
                <td>{t('recon.expected')}</td>
                <td>{money(rec.expected)}</td>
              </tr>
              {actual != null && (
                <>
                  <tr>
                    <td>{t('recon.actual')}</td>
                    <td>{money(actual)}</td>
                  </tr>
                  <tr>
                    <td>{t('recon.difference')}</td>
                    <td>{money(rec.diff, { sign: true })}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          {actual != null && (
            <div className="mt">
              {rec.matches ? (
                <div className="card accent">✓ {t('recon.matches')}</div>
              ) : rec.diff < 0 ? (
                <>
                  <p>
                    <strong>{t('recon.unloggedQ', { amount: money(-rec.diff) })}</strong>
                  </p>
                  <label className={`option${diffHandling === 'unlogged' ? ' on' : ''}`}>
                    <input type="radio" checked={diffHandling === 'unlogged'} onChange={() => setDiffHandling('unlogged')} />
                    <div>
                      <div>{t('recon.recordUnlogged')}</div>
                      <small className="muted">{t('recon.recordUnloggedHint')}</small>
                    </div>
                  </label>
                  <label className={`option${diffHandling === 'accept' ? ' on' : ''}`}>
                    <input type="radio" checked={diffHandling === 'accept'} onChange={() => setDiffHandling('accept')} />
                    <div>
                      <div>{t('recon.accept')}</div>
                      <small className="muted">{t('recon.acceptHint')}</small>
                    </div>
                  </label>
                </>
              ) : (
                <div className="card warn">{t('recon.moreThanExpected', { amount: money(rec.diff) })}</div>
              )}
            </div>
          )}
          <div className="btn-row mt">
            <button className="btn" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button className="btn primary" disabled={actual == null} onClick={() => setStep(3)}>
              {t('common.next')}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h4 style={{ margin: '0 0 12px' }}>{t('payday.step3')}</h4>
          {left > 0 ? (
            <>
              <p>{t('payday.leftoverIs', { amount: money(left) })}</p>
              <label className={`option${leftKind === 'roll' ? ' on' : ''}`}>
                <input type="radio" checked={leftKind === 'roll'} onChange={() => setLeftKind('roll')} />
                <div>
                  <div>{t('payday.roll')}</div>
                  <small className="muted">{t('payday.rollHint')}</small>
                </div>
              </label>
              {state.debts.some((d) => d.balance > 0) && (
                <label className={`option${leftKind === 'debt' ? ' on' : ''}`}>
                  <input type="radio" checked={leftKind === 'debt'} onChange={() => setLeftKind('debt')} />
                  <div style={{ flex: 1 }}>
                    <div>{t('payday.toDebt')}</div>
                    {leftKind === 'debt' && (
                      <select className="mt" value={debtId} onChange={(e) => setDebtId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8 }}>
                        {state.debts
                          .filter((d) => d.balance > 0)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} · {money(d.balance)} · {d.apr}%
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </label>
              )}
              <label className={`option${leftKind === 'savings' ? ' on' : ''}`}>
                <input type="radio" checked={leftKind === 'savings'} onChange={() => setLeftKind('savings')} />
                <div>
                  <div>{t('payday.toSavings')}</div>
                  <small className="muted">{t('payday.savingsHint')}</small>
                </div>
              </label>
              {preview && (
                <div className="card accent mt">
                  <div className="small muted">{t('payday.debtFreeEffect')}</div>
                  <div>
                    <strong>{fmtMonth(preview.before)}</strong>
                    {preview.after !== preview.before && (
                      <>
                        {' → '}
                        <strong>{fmtMonth(preview.after)}</strong>
                      </>
                    )}
                    {preview.after === preview.before && <span className="muted"> · {t('payday.noChange')}</span>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="muted">{left < 0 ? t('payday.short', { amount: money(-left) }) : t('payday.noLeftover')}</p>
          )}
          <div className="card">
            <h2>{t('payday.willDo')}</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
              <li>{t('payday.do.snapshot')}</li>
              <li>{t('payday.do.close')}</li>
              <li>{t('payday.do.balance', { amount: money(actual ?? 0) })}</li>
              <li>{t('payday.do.received', { amount: money(amount ?? 0) })}</li>
              <li>{t('payday.do.open')}</li>
            </ul>
          </div>
          <div className="btn-row mt">
            <button className="btn" onClick={() => setStep(2)}>
              {t('common.back')}
            </button>
            <button className="btn primary" onClick={confirm}>
              {t('payday.confirm')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
