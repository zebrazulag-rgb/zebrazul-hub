import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ClientFilterProvider } from './context/ClientFilterContext.jsx';
import { TenantProvider } from './context/TenantContext.jsx';
import './index.css';
import './dark-theme.css';

// Tema all black aplicado em tempo de execução para não depender do index.html
// nem de cache do template estático.
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('zebrahub-all-black');
  document.documentElement.dataset.zebrahubTheme = 'all-black';
  document.body.classList.add('zebrahub-all-black');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <TenantProvider>
      <AuthProvider>
        <ClientFilterProvider>
          <App />
        </ClientFilterProvider>
      </AuthProvider>
      </TenantProvider>
    </BrowserRouter>
  </React.StrictMode>
);
