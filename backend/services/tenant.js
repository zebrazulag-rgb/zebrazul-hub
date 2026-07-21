const db = require('../db/database');

const DEFAULT_TENANT_SLUG = String(process.env.DEFAULT_AGENCY_SLUG || 'zebrazul')
  .trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'zebrazul';

const TENANT_BASE_DOMAIN = String(process.env.TENANT_BASE_DOMAIN || 'app.zebrazul.com.br')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^\.+|\.+$/g, '') || 'app.zebrazul.com.br';

const LEGACY_TENANT_DOMAINS = ['zebrahub.com.br'];

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/:]/)[0]
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60);
}

function extractTenantSlug(req) {
  const explicit = normalizeSlug(req.headers['x-tenant-slug']);
  if (explicit) return explicit;

  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = (forwarded || String(req.headers.host || '')).split(':')[0].toLowerCase();
  if (!host || host === 'localhost' || /^127\./.test(host)) return DEFAULT_TENANT_SLUG;

  const domains = [TENANT_BASE_DOMAIN, ...LEGACY_TENANT_DOMAINS]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  for (const domain of domains) {
    if (host === domain) return DEFAULT_TENANT_SLUG;
    const suffix = `.${domain}`;
    if (host.endsWith(suffix)) {
      const prefix = host.slice(0, -suffix.length).split('.').pop();
      if (prefix && !['www', 'app', 'api'].includes(prefix)) return normalizeSlug(prefix);
    }
  }

  return DEFAULT_TENANT_SLUG;
}

function publicAgency(agency) {
  if (!agency) return null;
  return {
    id: Number(agency.id),
    name: agency.name,
    slug: agency.slug,
    status: agency.status,
    plan: agency.plan,
    product_name: agency.product_name || 'Zebrahub',
    logo_data: agency.logo_data || null,
    logo_mime: agency.logo_mime || null,
    primary_color: agency.primary_color || '#0969ff',
    secondary_color: agency.secondary_color || '#4f8cff',
    sidebar_color: agency.sidebar_color || '#121620',
    login_background_color: agency.login_background_color || '#121620',
    support_email: agency.support_email || null,
    support_whatsapp: agency.support_whatsapp || null,
    footer_text: agency.plan === 'essential' ? 'Tecnologia ZebraHub' : (agency.footer_text || 'Tecnologia ZebraHub'),
    show_powered_by: agency.plan === 'essential' ? true : Number(agency.show_powered_by) !== 0,
    max_clients: Number(agency.max_clients || 10),
    max_users: Number(agency.max_users || 5),
  };
}

function findAgencyBySlug(slug, { includeInactive = false } = {}) {
  const normalized = normalizeSlug(slug) || DEFAULT_TENANT_SLUG;
  const sql = includeInactive
    ? 'SELECT * FROM agencies WHERE slug = ?'
    : "SELECT * FROM agencies WHERE slug = ? AND status = 'active'";
  return db.prepare(sql).get(normalized) || null;
}

function findDefaultAgency() {
  return findAgencyBySlug(DEFAULT_TENANT_SLUG) || db.prepare("SELECT * FROM agencies WHERE status = 'active' ORDER BY id LIMIT 1").get() || null;
}

function resolveAgency(req, options = {}) {
  const slug = extractTenantSlug(req);
  const agency = findAgencyBySlug(slug, options);
  if (agency) return agency;
  return slug === DEFAULT_TENANT_SLUG ? findDefaultAgency() : null;
}

module.exports = {
  DEFAULT_TENANT_SLUG,
  TENANT_BASE_DOMAIN,
  normalizeSlug,
  extractTenantSlug,
  publicAgency,
  findAgencyBySlug,
  findDefaultAgency,
  resolveAgency,
};
