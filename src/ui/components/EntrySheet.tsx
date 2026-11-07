import { useState } from 'react';
import { addDeposit, addLogEntry, deleteDeposit, deleteLogEntry, openPeriod, updateDeposit, updateLogEntry, type Deposit, type LogEntry, type LogKind } from '../../core';
import { useI18n, type DictKey } from '../../i18n';
import { useStore } from '../../state/context';
import { newId } from '../../state/store';
import { Field, MoneyInput, Seg, Sheet } from './common';

export type EntryTarget = { type: 'purchase'; entry?: LogEntry } | { type: 'deposit'; entry?: Deposit };

export function EntrySheet({ target, onClose }: { target: EntryTarget; onClose: () => void }) {
  const { t } = useI18n();
  const { store, state, today } = useStore();
  const existing = target.entry;
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [kind, setKind] = useState<LogKind>(target.type === 'purchase' ? target.entry?.kind ?? 'debit' : 'debit');
  const [category, setCategory] = useState(target.type === 'purchase' ? target.entry?.category ?? '' : '');
  const cards = state.debts.filter((d) => d.isCard);
  const [cardId, setCardId] = useState(target.type === 'purchase' ? target.entry?.debtId ?? cards[0]?.id ?? '' : '');
  const minDate = openPeriod(state).start;
  const valid = amount != null && amount > 0 && date >= minDate;

  const save = () => {
    if (!valid) return;
    if (target.type === 'purchase') {
      const fields = { amount: amount!, note: note.trim(), date, kind, category: category || undefined, debtId: kind === 'card' ? cardId || undefined : undefined };
      store.update((s) => (existing ? updateLogEntry(s, existing.id, fields) : addLogEntry(s, { id: newId('log'), ...fields })));
    } else {
      const fields = { amount: amount!, note: note.trim(), date };
      store.update((s) => (existing ? updateDeposit(s, existing.id, fields) : addDeposit(s, { id: newId('dep'), ...fields })));
    }
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    store.update((s) => (target.type === 'purchase' ? deleteLogEntry(s, existing.id) : deleteDeposit(s, existing.id)));
    onClose();
  };

  const title = target.type === 'purchase' ? (existing ? t('entry.editPurchase') : t('entry.addPurchase')) : existing ? t('entry.editDeposit') : t('entry.addDeposit');

  return (
    <Sheet title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('common.amount')}>
          <MoneyInput value={amount} onChange={setAmount} big autoFocus={!existing} />
        </Field>
        {target.type === 'purchase' && (
          <div className="field">
            <span>{t('entry.paidWith')}</span>
            <Seg
              full
              value={kind}
              onChange={setKind}
              options={[
                { value: 'debit', label: t('entry.debit') },
                { value: 'card', label: t('entry.card') },
              ]}
            />
            {kind === 'card' && cards.length === 0 && <small className="hint">{t('entry.noCard')}</small>}
          </div>
        )}
        {target.type === 'purchase' && kind === 'card' && cards.length > 1 && (
          <Field label={t('entry.whichCard')}>
            <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('entry.note')}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={target.type === 'deposit' ? t('entry.depositPlaceholder') : t('entry.notePlaceholder')} />
        </Field>
        <div className="field-row">
          <Field label={t('common.date')}>
            <input type="date" value={date} min={minDate} max={today >= minDate ? today : undefined} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {target.type === 'purchase' && (
            <Field label={t('entry.category')}>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t('entry.noCategory')}</option>
                {state.categories.map((c) => (
                  <option key={c} value={c}>
                    {t(`cat.${c}` as DictKey) === `cat.${c}` ? c : t(`cat.${c}` as DictKey)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {target.type === 'deposit' && <p className="muted small">{t('entry.depositHint')}</p>}
        <div className="btn-row mt">
          {existing && (
            <button type="button" className="btn danger" onClick={remove}>
              {t('common.delete')}
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!valid}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
