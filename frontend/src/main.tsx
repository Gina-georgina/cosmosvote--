import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { WalletProvider } from './WalletContext';
import { validateConfig } from './config';
import { ToastProvider } from './components/ToastContext';
import { I18nProvider } from './i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

try {
  validateConfig();
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <WalletProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </WalletProvider>
      </I18nProvider>
    </StrictMode>
  );
} catch (error) {
  root.innerHTML = `
    <div style="background: #fee2e2; color: #991b1b; padding: 1rem; border-bottom: 1px solid #f87171; text-align: center; font-family: system-ui, sans-serif;">
      <h3 style="margin: 0 0 0.5rem 0;">⚠️ Invalid Configuration</h3>
      <p style="margin: 0;">${(error as Error).message.replace(/\n/g, '<br/>')}</p>
    </div>
  `;
}
