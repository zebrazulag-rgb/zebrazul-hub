const DEFAULT_TENANT_SLUG = String(import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'zebrazul').trim().toLowerCase();

export function normalizeTenantSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60);
}

export function tenantSlugFromHostname(hostname = window.location.hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || /^127\./.test(host)) return DEFAULT_TENANT_SLUG;
  if (host.endsWith('.zebrahub.com.br')) {
    const prefix = host.slice(0, -'.zebrahub.com.br'.length).split('.').pop();
    if (prefix && !['www', 'app', 'api'].includes(prefix)) return normalizeTenantSlug(prefix);
  }
  return DEFAULT_TENANT_SLUG;
}

export function getTenantSlug() {
  return normalizeTenantSlug(localStorage.getItem('zebrahub_tenant_slug')) || tenantSlugFromHostname();
}

export function persistTenantSlug(slug) {
  const normalized = normalizeTenantSlug(slug);
  if (normalized) localStorage.setItem('zebrahub_tenant_slug', normalized);
}
