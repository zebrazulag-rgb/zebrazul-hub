const DEFAULT_TENANT_SLUG = String(import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'zebrazul').trim().toLowerCase();
const TENANT_BASE_DOMAIN = String(import.meta.env.VITE_TENANT_BASE_DOMAIN || 'app.zebrazul.com.br')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^\.+|\.+$/g, '') || 'app.zebrazul.com.br';

const LEGACY_TENANT_DOMAINS = ['zebrahub.com.br'];

export function normalizeTenantSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60);
}

export function tenantBaseDomain() {
  return TENANT_BASE_DOMAIN;
}

export function tenantHostForSlug(slug) {
  const normalized = normalizeTenantSlug(slug) || DEFAULT_TENANT_SLUG;
  return normalized === DEFAULT_TENANT_SLUG ? TENANT_BASE_DOMAIN : `${normalized}.${TENANT_BASE_DOMAIN}`;
}

export function tenantSlugFromHostname(hostname = window.location.hostname) {
  const host = String(hostname || '').toLowerCase().split(':')[0];
  if (!host || host === 'localhost' || /^127\./.test(host)) return DEFAULT_TENANT_SLUG;

  const suffixes = [TENANT_BASE_DOMAIN, ...LEGACY_TENANT_DOMAINS]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  for (const domain of suffixes) {
    if (host === domain) return DEFAULT_TENANT_SLUG;
    const suffix = `.${domain}`;
    if (host.endsWith(suffix)) {
      const prefix = host.slice(0, -suffix.length).split('.').pop();
      if (prefix && !['www', 'app', 'api'].includes(prefix)) return normalizeTenantSlug(prefix);
    }
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
