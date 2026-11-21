import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DsaProvider } from '@dsa-portal/ui-core';
import { App } from './App';
import { dsa } from './platform';
import { startTheme } from './theme';
import './styles.css';

async function start() {
  if (import.meta.env.VITE_MOCK === '1') {
    const { startMockWorker } = await import('@dsa-portal/ui-core/mocks/browser');
    await startMockWorker();
  }
  startTheme();
  void dsa.stores.auth.getState().restore();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DsaProvider value={dsa}>
        <App />
      </DsaProvider>
    </StrictMode>
  );
}
void start();
