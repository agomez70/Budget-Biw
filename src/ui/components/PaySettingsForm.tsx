import { hourlyTakeHome, type PayFrequency, type PayType, type Settings } from '../../core';
import { useI18n } from '../../i18n';
import { Field, MoneyInput, NumberInput, Seg } from './common';

export function PaySettingsForm({ value, onChange, compact }: { value: Settings; onChange: (s: Settings) => void; compact?: boolean }) {
  const { t, money } = useI18n();
  const set = (p: Partial<Settings>) => onChange({ ...value, ...p });
  return (
    <>
      <div className="field">
        <span>{t('settings.payType')}</span>
        <Seg<PayType>
          full
          value={value.payType}
          onChange={(payType) => set({ payType })}
          options={[
            { value: 'salary', label: t('settings.salary') },
            { value: 'hourly', label: t('settings.hourly') },
          ]}
        />
      </div>
      <div className="field-row">
        <Field label={t('settings.frequency')}>
          <select value={value.frequency} onChange={(e) => set({ frequency: e.target.value as PayFrequency })}>
            {(['weekly', 'biweekly', 'semimonthly', 'monthly'] as PayFrequency[]).map((f) => (
              <option key={f} value={f}>
                {t(`freq.${f}`)}
              </option>
            ))}
          </select>
        </Field>
        {value.frequency !== 'semimonthly' && (
          <Field label={t('settings.firstPaycheck')}>
            <input type="date" value={value.firstPaycheck} onChange={(e) => e.target.value && set({ firstPaycheck: e.target.value })} />
          </Field>
        )}
      </div>
      {value.frequency === 'semimonthly' && (
        <div className="field-row">
          <Field label={t('settings.semiDay1')}>
            <NumberInput value={value.semiMonthlyDays[0]} min={1} max={31} step="1" onChange={(n) => set({ semiMonthlyDays: [Math.min(31, Math.max(1, Math.round(n))), value.semiMonthlyDays[1]] })} />
          </Field>
          <Field label={t('settings.semiDay2')} hint={t('settings.semiHint')}>
            <NumberInput value={value.semiMonthlyDays[1]} min={1} max={31} step="1" onChange={(n) => set({ semiMonthlyDays: [value.semiMonthlyDays[0], Math.min(31, Math.max(1, Math.round(n)))] })} />
          </Field>
        </div>
      )}
      {value.payType === 'salary' ? (
        <Field label={t('settings.paycheckAmount')}>
          <MoneyInput value={value.paycheckAmount} onChange={(c) => c != null && set({ paycheckAmount: c })} />
        </Field>
      ) : (
        <>
          <div className="field-row">
            <Field label={t('settings.rate')}>
              <MoneyInput value={value.hourlyRate} onChange={(c) => c != null && set({ hourlyRate: c })} />
            </Field>
            <Field label={t('settings.tax')}>
              <NumberInput value={value.taxPct} min={0} max={100} onChange={(n) => set({ taxPct: Math.min(100, Math.max(0, n)) })} />
            </Field>
          </div>
          <div className="field-row">
            <Field label={t('settings.typicalHours')}>
              <NumberInput value={value.typicalHours} min={0} onChange={(n) => set({ typicalHours: Math.max(0, n) })} />
            </Field>
            <Field label={t('settings.slowHours')}>
              <NumberInput value={value.slowHours} min={0} onChange={(n) => set({ slowHours: Math.max(0, n) })} />
            </Field>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('settings.takeHome', { amount: money(hourlyTakeHome(value.hourlyRate, value.typicalHours, value.taxPct)), slow: money(hourlyTakeHome(value.hourlyRate, value.slowHours, value.taxPct)) })}
          </p>
        </>
      )}
      {!compact && (
        <div className="field-row">
          <Field label={t('settings.monthlyDeposit')} hint={t('settings.monthlyDepositHint')}>
            <MoneyInput value={value.monthlyDeposit} onChange={(c) => c != null && set({ monthlyDeposit: c })} />
          </Field>
          <Field label={t('settings.depositDay')}>
            <NumberInput value={value.monthlyDepositDay} min={1} max={31} step="1" onChange={(n) => set({ monthlyDepositDay: Math.min(31, Math.max(1, Math.round(n))) })} />
          </Field>
        </div>
      )}
    </>
  );
}
