import { useState } from 'react';
import { initialState, withStartSafePerDay, type Language, type Settings } from '../../core';
import { useI18n } from '../../i18n';
import { useStore } from '../../state/context';
import { Field, MoneyInput, Seg } from '../components/common';
import { PaySettingsForm } from '../components/PaySettingsForm';

export function Wizard() {
  const { t } = useI18n();
  const { store, state, today } = useStore();
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<Settings>(state.settings);
  const [balance, setBalance] = useState<number | null>(state.account.bankBalance);
  const [keepSample, setKeepSample] = useState(true);

  const setLang = (language: Language) => {
    setSettings((s) => ({ ...s, language }));
    store.update((s) => ({ ...s, settings: { ...s.settings, language } }));
  };

  const finish = () => {
    const now = new Date().toISOString();
    const fresh = initialState({ ...settings, setupComplete: true }, balance ?? 0, today, now);
    store.update((s) =>
      withStartSafePerDay(keepSample ? { ...fresh, rules: s.rules, debts: s.debts, extraMonthly: s.extraMonthly, categories: s.categories } : fresh, today),
    );
  };

  return (
    <div className="app" style={{ paddingBottom: 32 }}>
      <div className="topbar">
        <h1>{t('wizard.welcome')}</h1>
        <Seg value={settings.language} onChange={setLang} options={[{ value: 'en', label: 'EN' }, { value: 'es', label: 'ES' }]} />
      </div>
      <div className="steps">
        {[1, 2].map((i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {step === 1 && (
        <div className="card">
          <h2>{t('wizard.payTitle')}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('wizard.payIntro')}
          </p>
          <PaySettingsForm value={settings} onChange={setSettings} />
          <button className="btn primary block" onClick={() => setStep(2)}>
            {t('common.next')}
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="card">
          <h2>{t('wizard.balanceTitle')}</h2>
          <Field label={t('home.bankBalance')} hint={t('wizard.balanceHint')}>
            <MoneyInput value={balance} onChange={setBalance} big allowNegative autoFocus />
          </Field>
          <label className={`option${keepSample ? ' on' : ''}`}>
            <input type="radio" checked={keepSample} onChange={() => setKeepSample(true)} />
            <div>
              <div>{t('wizard.keepSample')}</div>
              <small className="muted">{t('wizard.keepSampleHint')}</small>
            </div>
          </label>
          <label className={`option${!keepSample ? ' on' : ''}`}>
            <input type="radio" checked={!keepSample} onChange={() => setKeepSample(false)} />
            <div>{t('wizard.startEmpty')}</div>
          </label>
          <div className="btn-row mt">
            <button className="btn" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button className="btn primary" disabled={balance == null} onClick={finish}>
              {t('wizard.finish')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
