import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ClientFilterProvider } from './context/ClientFilterContext.jsx';
import { TenantProvider } from './context/TenantContext.jsx';
import './index.css';

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
