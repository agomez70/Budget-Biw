import { useState, type ReactNode } from 'react';
import { I18nProvider, useI18n, type DictKey } from '../i18n';
import { useStore } from '../state/context';
import { Seg } from './components/common';
import { Bills } from './screens/Bills';
import { Debts } from './screens/Debts';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { SettingsScreen } from './screens/Settings';
import { Wizard } from './screens/Wizard';

type Tab = 'home' | 'bills' | 'debts' | 'history' | 'settings';

const icons: Record<Tab, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  bills: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  debts: <path d="M3 7h18v10H3zM3 11h18M7 15h3" />,
  history: <path d="M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 3v4h4" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
};

function Shell() {
  const { t } = useI18n();
  const { store, state } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  if (!state.settings.setupComplete) return <Wizard />;
  const lang = state.settings.language;
  return (
    <>
      <main className="app">
        <header className="topbar">
          <h1>{t(`tab.${tab}` as DictKey)}</h1>
          <Seg
            value={lang}
            onChange={(language) => store.update((s) => ({ ...s, settings: { ...s.settings, language } }))}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'es', label: 'ES' },
            ]}
          />
        </header>
        {tab === 'home' && <Home />}
        {tab === 'bills' && <Bills />}
        {tab === 'debts' && <Debts />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="nav" aria-label={t('nav.label')}>
        <div className="nav-inner">
          {(Object.keys(icons) as Tab[]).map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); window.scrollTo(0, 0); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                {icons[k]}
              </svg>
              {t(`tab.${k}` as DictKey)}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

export function App() {
  const { state } = useStore();
  return (
    <I18nProvider lang={state.settings.language}>
      <Shell />
    </I18nProvider>
  );
}
