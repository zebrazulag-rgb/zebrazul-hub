import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getTenantSlug, persistTenantSlug } from '../tenant';

const TenantContext = createContext(null);

const FALLBACK_AGENCY = {
  name: 'Zebrazul',
  slug: 'zebrazul',
  product_name: 'Zebrahub',
  logo_data: null,
  primary_color: '#0969ff',
  secondary_color: '#4f8cff',
  sidebar_color: '#121620',
  login_background_color: '#121620',
  footer_text: 'Tecnologia ZebraHub',
  show_powered_by: true,
};

function applyBranding(agency) {
  const root = document.documentElement;
  root.style.setProperty('--agency-primary', agency.primary_color || FALLBACK_AGENCY.primary_color);
  root.style.setProperty('--agency-secondary', agency.secondary_color || FALLBACK_AGENCY.secondary_color);
  root.style.setProperty('--agency-sidebar', agency.sidebar_color || FALLBACK_AGENCY.sidebar_color);
  root.style.setProperty('--agency-login-bg', agency.login_background_color || FALLBACK_AGENCY.login_background_color);
  document.title = agency.product_name || agency.name || 'Zebrahub';
  if (agency.logo_data) {
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = agency.logo_data;
  }
}

export function TenantProvider({ children }) {
  const [agency, setAgency] = useState(FALLBACK_AGENCY);
  const [loadingTenant, setLoadingTenant] = useState(true);

  const refreshTenant = useCallback(async (authenticated = false) => {
    try {
      const { data } = await api.get(authenticated ? '/tenant/me' : '/tenant');
      const next = { ...FALLBACK_AGENCY, ...(data.agency || {}) };
      setAgency(next);
      persistTenantSlug(next.slug || getTenantSlug());
      applyBranding(next);
      return next;
    } catch {
      applyBranding(FALLBACK_AGENCY);
      return FALLBACK_AGENCY;
    } finally {
      setLoadingTenant(false);
    }
  }, []);

  const updateAgency = useCallback((nextAgency) => {
    setAgency((previous) => {
      const next = { ...FALLBACK_AGENCY, ...previous, ...nextAgency };
      if (next.slug) persistTenantSlug(next.slug);
      applyBranding(next);
      return next;
    });
  }, []);

  useEffect(() => { refreshTenant(false); }, [refreshTenant]);

  const value = useMemo(() => ({ agency, loadingTenant, refreshTenant, updateAgency }), [agency, loadingTenant, refreshTenant, updateAgency]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
