import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ClientFilterProvider } from './context/ClientFilterContext.jsx';
import { TenantProvider } from './context/TenantContext.jsx';
import { initializeTheme } from './utils/theme.js';
import { installMediaDomFallback } from './utils/mediaUrl.js';
import PwaInstallPrompt from './components/PwaInstallPrompt.jsx';
import './index.css';
import './theme.css';

initializeTheme();
installMediaDomFallback();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <TenantProvider>
        <AuthProvider>
          <ClientFilterProvider>
            <App />
            <PwaInstallPrompt />
          </ClientFilterProvider>
        </AuthProvider>
      </TenantProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
