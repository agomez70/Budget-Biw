import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { IdbStorage } from './storage/IdbStorage';
import { BudgetStore } from './state/store';
import { StoreProvider } from './state/context';
import { App } from './ui/App';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="loading">…</div>);

const store = new BudgetStore(new IdbStorage());
store.init().then(() => {
  document.documentElement.lang = store.state.settings.language;
  store.subscribe(() => (document.documentElement.lang = store.state.settings.language));
  root.render(
    <StrictMode>
      <StoreProvider store={store}>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
});

registerSW({ immediate: true });
