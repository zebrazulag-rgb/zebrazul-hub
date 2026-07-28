const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const DEFAULT_API_VERSION = 'v25.0';
const REQUEST_TIMEOUT_MS = Number(process.env.META_REQUEST_TIMEOUT_MS || 30000);
const DEFAULT_FRONTEND_ORIGIN = 'https://app.zebrazul.com.br';
const DEFAULT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_insights',
  'ads_read',
];

class MetaOAuthError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MetaOAuthError';
    this.status = details.status || 400;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function getConfig() {
  return {
    appId: String(process.env.META_APP_ID || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
    apiVersion: String(process.env.META_API_VERSION || DEFAULT_API_VERSION).trim(),
    redirectUri: String(process.env.META_OAUTH_REDIRECT_URI || '').trim(),
    frontendOrigin: String(
      process.env.META_OAUTH_FRONTEND_URL
      || process.env.FRONTEND_URL
      || process.env.APP_URL
      || DEFAULT_FRONTEND_ORIGIN
    ).trim().replace(/\/$/, ''),
    encryptionSecret: String(
      process.env.META_TOKEN_ENCRYPTION_KEY
      || process.env.JWT_SECRET
      || 'zebrahub-meta-token-dev-secret'
    ),
  };
}

function getOAuthStatus() {
  const config = getConfig();
  return {
    configured: Boolean(config.appId && config.appSecret),
    app_id_configured: Boolean(config.appId),
    app_secret_configured: Boolean(config.appSecret),
    redirect_uri_configured: Boolean(config.redirectUri),
    api_version: config.apiVersion,
  };
}

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin;
  } catch {
    return null;
  }
}

function allowedFrontendOrigins() {
  const config = getConfig();
  const values = [
    config.frontendOrigin,
    process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}` : null,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ].map(normalizeOrigin).filter(Boolean);
  return [...new Set(values)];
}

function resolveFrontendOrigin(candidate) {
  const normalized = normalizeOrigin(candidate);
  const allowed = allowedFrontendOrigins();
  if (normalized && allowed.includes(normalized)) return normalized;
  return allowed[0] || DEFAULT_FRONTEND_ORIGIN;
}

function encryptionKey() {
  return crypto.createHash('sha256').update(getConfig().encryptionSecret).digest();
}

function encryptToken(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptToken(payload) {
  if (!payload) return null;
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw new MetaOAuthError('Nao foi possivel ler a credencial da Meta. Reconecte a conta.', { status: 500 });
  }
}

function buildAppSecretProof(accessToken) {
  const secret = getConfig().appSecret;
  if (!secret || !accessToken) return null;
  return crypto.createHmac('sha256', secret).update(accessToken).digest('hex');
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch {
      throw new MetaOAuthError('A Meta retornou uma resposta invalida.', { status: 502 });
    }
    if (!response.ok || payload.error) {
      const apiError = payload.error || {};
      throw new MetaOAuthError(apiError.message || 'Falha ao comunicar com a Meta.', {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
        metaCode: apiError.code,
        metaSubcode: apiError.error_subcode,
        traceId: apiError.fbtrace_id,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof MetaOAuthError) throw error;
    if (error.name === 'AbortError') {
      throw new MetaOAuthError('A Meta demorou demais para responder.', { status: 504 });
    }
    throw new MetaOAuthError('Nao foi possivel conectar a Meta.', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function graphRequest(pathOrUrl, params = {}, accessToken) {
  if (!accessToken) throw new MetaOAuthError('A autorizacao da Meta nao esta disponivel.', { status: 401 });
  const config = getConfig();
  const isAbsolute = /^https?:\/\//i.test(String(pathOrUrl));
  const url = new URL(isAbsolute
    ? pathOrUrl
    : `https://graph.facebook.com/${config.apiVersion}/${String(pathOrUrl).replace(/^\//, '')}`);
  if (!isAbsolute) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', accessToken);
  const proof = buildAppSecretProof(accessToken);
  if (proof && !url.searchParams.has('appsecret_proof')) url.searchParams.set('appsecret_proof', proof);
  return requestJson(url);
}

async function graphCollection(path, params, accessToken) {
  const rows = [];
  let payload = await graphRequest(path, params, accessToken);
  while (payload) {
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    if (!payload.paging?.next) break;
    payload = await graphRequest(payload.paging.next, {}, accessToken);
  }
  return rows;
}

function buildAuthorizationUrl({ redirectUri, state }) {
  const config = getConfig();
  if (!config.appId || !config.appSecret) {
    throw new MetaOAuthError('Configure META_APP_ID e META_APP_SECRET no Railway.', { status: 503 });
  }
  const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DEFAULT_SCOPES.join(','));
  url.searchParams.set('auth_type', 'rerequest');
  url.searchParams.set('return_scopes', 'true');
  return url.toString();
}

function createOAuthState({ agencyId, clientId, userId, frontendOrigin, redirectUri }) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const origin = resolveFrontendOrigin(frontendOrigin);
  db.prepare(`
    INSERT INTO meta_oauth_states (
      nonce, agency_id, client_id, user_id, frontend_origin, redirect_uri, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+15 minutes'))
  `).run(nonce, agencyId, clientId, userId, origin, redirectUri);
  return jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '15m', issuer: 'zebrahub-meta-oauth' });
}

function consumeOAuthState(state) {
  let payload;
  try {
    payload = jwt.verify(String(state || ''), JWT_SECRET, { issuer: 'zebrahub-meta-oauth' });
  } catch {
    throw new MetaOAuthError('A solicitacao de conexao expirou. Tente novamente.', { status: 400 });
  }
  const row = db.prepare(`
    SELECT * FROM meta_oauth_states
    WHERE nonce = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
  `).get(payload.nonce);
  if (!row) throw new MetaOAuthError('A solicitacao de conexao nao e mais valida.', { status: 400 });
  db.prepare("UPDATE meta_oauth_states SET used_at = datetime('now') WHERE nonce = ?").run(payload.nonce);
  return row;
}

async function exchangeCodeForToken({ code, redirectUri }) {
  const config = getConfig();
  const shortUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
  shortUrl.searchParams.set('client_id', config.appId);
  shortUrl.searchParams.set('client_secret', config.appSecret);
  shortUrl.searchParams.set('redirect_uri', redirectUri);
  shortUrl.searchParams.set('code', code);
  const shortToken = await requestJson(shortUrl);
  if (!shortToken.access_token) throw new MetaOAuthError('A Meta nao retornou um token de acesso.', { status: 502 });

  let token = shortToken;
  try {
    const longUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', config.appId);
    longUrl.searchParams.set('client_secret', config.appSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken.access_token);
    const longToken = await requestJson(longUrl);
    if (longToken.access_token) token = longToken;
  } catch (error) {
    console.warn('[META OAUTH] Nao foi possivel trocar por token de longa duracao:', error.message);
  }
  return token;
}

function tokenExpiresAt(expiresIn) {
  const seconds = Number(expiresIn || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function fetchGrantedScopes(accessToken) {
  try {
    const rows = await graphCollection('me/permissions', { limit: 100 }, accessToken);
    return rows.filter((row) => row.status === 'granted').map((row) => row.permission);
  } catch {
    return [];
  }
}

async function saveOAuthConnection({ stateRow, token }) {
  const profile = await graphRequest('me', { fields: 'id,name' }, token.access_token);
  const scopes = await fetchGrantedScopes(token.access_token);
  db.prepare(`
    INSERT INTO meta_oauth_connections (
      agency_id, client_id, provider_user_id, provider_user_name,
      access_token_encrypted, token_expires_at, scopes_json, status,
      last_error, connected_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', NULL, ?, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET
      agency_id = excluded.agency_id,
      provider_user_id = excluded.provider_user_id,
      provider_user_name = excluded.provider_user_name,
      access_token_encrypted = excluded.access_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      scopes_json = excluded.scopes_json,
      status = 'connected',
      last_error = NULL,
      connected_by = excluded.connected_by,
      updated_at = datetime('now')
  `).run(
    stateRow.agency_id,
    stateRow.client_id,
    profile.id || null,
    profile.name || null,
    encryptToken(token.access_token),
    tokenExpiresAt(token.expires_in),
    JSON.stringify(scopes),
    stateRow.user_id
  );
  return getConnectionStatus(stateRow.client_id, stateRow.agency_id);
}

function getConnectionRow(clientId, agencyId) {
  return db.prepare(`
    SELECT * FROM meta_oauth_connections WHERE client_id = ? AND agency_id = ?
  `).get(clientId, agencyId) || null;
}

function isExpired(value) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function serializeConnection(row) {
  if (!row) return null;
  let scopes = [];
  try { scopes = JSON.parse(row.scopes_json || '[]'); } catch { scopes = []; }
  return {
    id: row.id,
    client_id: row.client_id,
    provider_user_id: row.provider_user_id,
    provider_user_name: row.provider_user_name,
    token_expires_at: row.token_expires_at,
    expired: isExpired(row.token_expires_at),
    scopes,
    selected_page_id: row.selected_page_id,
    selected_instagram_account_id: row.selected_instagram_account_id,
    selected_ad_account_id: row.selected_ad_account_id,
    status: isExpired(row.token_expires_at) ? 'expired' : row.status,
    last_error: row.last_error,
    connected_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getConnectionStatus(clientId, agencyId) {
  return serializeConnection(getConnectionRow(clientId, agencyId));
}

function getClientTokenBundle(clientId, agencyId = null) {
  const row = agencyId
    ? getConnectionRow(clientId, agencyId)
    : db.prepare('SELECT * FROM meta_oauth_connections WHERE client_id = ?').get(clientId);
  if (!row) return null;
  if (isExpired(row.token_expires_at)) {
    throw new MetaOAuthError('A autorizacao da Meta expirou. Abra Conexoes e reconecte a conta.', { status: 401 });
  }
  return {
    connectionId: row.id,
    userAccessToken: decryptToken(row.access_token_encrypted),
    pageAccessToken: decryptToken(row.page_access_token_encrypted),
    selectedPageId: row.selected_page_id,
    selectedInstagramId: row.selected_instagram_account_id,
    selectedAdAccountId: row.selected_ad_account_id,
  };
}

function pictureUrl(value) {
  return value?.data?.url || value?.url || null;
}

async function discoverAssets(accessToken) {
  const [profile, pages, adAccounts] = await Promise.all([
    graphRequest('me', { fields: 'id,name' }, accessToken),
    graphCollection('me/accounts', {
      fields: 'id,name,username,picture.type(large){url},access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}',
      limit: 200,
    }, accessToken),
    graphCollection('me/adaccounts', {
      fields: 'id,account_id,name,currency,timezone_name,account_status',
      limit: 200,
    }, accessToken).catch(() => []),
  ]);

  return {
    profile: { id: String(profile.id || ''), name: profile.name || null },
    pages: pages.map((page) => ({
      id: String(page.id),
      name: page.name || `Pagina ${page.id}`,
      username: page.username || null,
      picture_url: pictureUrl(page.picture),
      instagram: page.instagram_business_account ? {
        id: String(page.instagram_business_account.id),
        username: page.instagram_business_account.username || null,
        name: page.instagram_business_account.name || page.instagram_business_account.username || null,
        profile_picture_url: page.instagram_business_account.profile_picture_url || null,
        followers_count: Number(page.instagram_business_account.followers_count || 0),
        media_count: Number(page.instagram_business_account.media_count || 0),
      } : null,
      __page_access_token: page.access_token || null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    ad_accounts: adAccounts.map((account) => ({
      id: String(account.id || ''),
      account_id: String(account.account_id || account.id || '').replace(/^act_/, ''),
      name: account.name || `Conta ${account.account_id || account.id}`,
      currency: account.currency || null,
      timezone_name: account.timezone_name || null,
      account_status: account.account_status ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

async function getClientAssets(clientId, agencyId) {
  const bundle = getClientTokenBundle(clientId, agencyId);
  if (!bundle) throw new MetaOAuthError('Este cliente ainda nao autorizou a Meta.', { status: 404 });
  const assets = await discoverAssets(bundle.userAccessToken);
  return {
    profile: assets.profile,
    pages: assets.pages.map(({ __page_access_token, ...page }) => page),
    ad_accounts: assets.ad_accounts,
  };
}

function assertClientAssetAvailability(assets, pageId, adAccountId) {
  const page = pageId ? assets.pages.find((item) => String(item.id) === String(pageId)) : null;
  const ad = adAccountId ? assets.ad_accounts.find((item) => String(item.account_id) === String(adAccountId).replace(/^act_/, '')) : null;
  if (pageId && !page) throw new MetaOAuthError('A Pagina selecionada nao esta disponivel para este login.', { status: 400 });
  if (adAccountId && !ad) throw new MetaOAuthError('A conta de anuncios selecionada nao esta disponivel para este login.', { status: 400 });
  return { page, ad };
}

function assertNoAssignmentConflict({ agencyId, clientId, page, ad }) {
  if (page) {
    const instagramId = page.instagram?.id || null;
    const assigned = db.prepare(`
      SELECT client_id FROM meta_organic_accounts
      WHERE agency_id = ? AND client_id <> ? AND (
        page_id = ? OR (? IS NOT NULL AND instagram_account_id = ?)
      )
    `).get(agencyId, clientId, page.id, instagramId, instagramId);
    if (assigned) throw new MetaOAuthError('Esta Pagina ou Instagram ja esta vinculado a outro cliente.', { status: 409 });
  }
  if (ad) {
    const assigned = db.prepare(`
      SELECT client_id FROM meta_ad_accounts
      WHERE agency_id = ? AND client_id <> ? AND account_id = ?
    `).get(agencyId, clientId, ad.account_id);
    if (assigned) throw new MetaOAuthError('Esta conta de anuncios ja esta vinculada a outro cliente.', { status: 409 });
  }
}

async function saveClientSelections({ clientId, agencyId, pageId, adAccountId }) {
  const bundle = getClientTokenBundle(clientId, agencyId);
  if (!bundle) throw new MetaOAuthError('Conecte a Meta antes de escolher os ativos.', { status: 400 });
  const assets = await discoverAssets(bundle.userAccessToken);
  const { page, ad } = assertClientAssetAvailability(assets, pageId, adAccountId);
  assertNoAssignmentConflict({ agencyId, clientId, page, ad });

  const save = db.transaction(() => {
    if (page) {
      const current = db.prepare('SELECT id, page_id FROM meta_organic_accounts WHERE client_id = ? AND agency_id = ?').get(clientId, agencyId);
      if (current && String(current.page_id || '') !== String(page.id)) {
        db.prepare('DELETE FROM meta_organic_accounts WHERE id = ?').run(current.id);
      }
      db.prepare(`
        INSERT INTO meta_organic_accounts (
          agency_id, client_id, asset_key, page_id, page_name, page_username, page_picture_url,
          instagram_account_id, instagram_username, instagram_name, instagram_picture_url,
          oauth_connection_id, last_sync_status, last_sync_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'never', NULL, datetime('now'))
        ON CONFLICT(client_id) DO UPDATE SET
          asset_key = excluded.asset_key,
          page_id = excluded.page_id,
          page_name = excluded.page_name,
          page_username = excluded.page_username,
          page_picture_url = excluded.page_picture_url,
          instagram_account_id = excluded.instagram_account_id,
          instagram_username = excluded.instagram_username,
          instagram_name = excluded.instagram_name,
          instagram_picture_url = excluded.instagram_picture_url,
          oauth_connection_id = excluded.oauth_connection_id,
          last_sync_error = NULL,
          updated_at = datetime('now')
      `).run(
        agencyId,
        clientId,
        `page:${page.id}`,
        page.id,
        page.name,
        page.username,
        page.picture_url,
        page.instagram?.id || null,
        page.instagram?.username || null,
        page.instagram?.name || null,
        page.instagram?.profile_picture_url || null,
        bundle.connectionId
      );
    }

    if (ad) {
      const current = db.prepare('SELECT id, account_id FROM meta_ad_accounts WHERE client_id = ? AND agency_id = ?').get(clientId, agencyId);
      if (current && String(current.account_id) !== String(ad.account_id)) {
        db.prepare('DELETE FROM meta_ad_accounts WHERE id = ?').run(current.id);
      }
      db.prepare(`
        INSERT INTO meta_ad_accounts (
          agency_id, client_id, account_id, account_name, currency, timezone_name,
          account_status, oauth_connection_id, last_sync_status, last_sync_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'never', NULL, datetime('now'))
        ON CONFLICT(client_id) DO UPDATE SET
          account_id = excluded.account_id,
          account_name = excluded.account_name,
          currency = excluded.currency,
          timezone_name = excluded.timezone_name,
          account_status = excluded.account_status,
          oauth_connection_id = excluded.oauth_connection_id,
          last_sync_error = NULL,
          updated_at = datetime('now')
      `).run(
        agencyId,
        clientId,
        ad.account_id,
        ad.name,
        ad.currency,
        ad.timezone_name,
        ad.account_status,
        bundle.connectionId
      );
    }

    db.prepare(`
      UPDATE meta_oauth_connections SET
        selected_page_id = COALESCE(?, selected_page_id),
        selected_instagram_account_id = COALESCE(?, selected_instagram_account_id),
        selected_ad_account_id = COALESCE(?, selected_ad_account_id),
        page_access_token_encrypted = COALESCE(?, page_access_token_encrypted),
        status = 'connected', last_error = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      page?.id || null,
      page?.instagram?.id || null,
      ad?.account_id || null,
      page?.__page_access_token ? encryptToken(page.__page_access_token) : null,
      bundle.connectionId
    );
  });
  save();
  return getConnectionStatus(clientId, agencyId);
}

function disconnectOAuth(clientId, agencyId) {
  const row = getConnectionRow(clientId, agencyId);
  if (!row) return false;
  const disconnect = db.transaction(() => {
    db.prepare(`
      UPDATE meta_ad_accounts
      SET oauth_connection_id = NULL, last_sync_status = 'error',
          last_sync_error = 'Autorizacao da Meta desconectada', updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ?
    `).run(clientId, agencyId);
    db.prepare(`
      UPDATE meta_organic_accounts
      SET oauth_connection_id = NULL, last_sync_status = 'error',
          last_sync_error = 'Autorizacao da Meta desconectada', updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ?
    `).run(clientId, agencyId);
    db.prepare('DELETE FROM meta_oauth_connections WHERE id = ?').run(row.id);
  });
  disconnect();
  return true;
}

function popupHtml({ ok, frontendOrigin, clientId, message }) {
  const payload = JSON.stringify({
    type: 'zebrahub-meta-oauth',
    ok: Boolean(ok),
    clientId: Number(clientId || 0),
    message: String(message || ''),
  }).replace(/</g, '\\u003c');
  const targetOrigin = JSON.stringify(resolveFrontendOrigin(frontendOrigin));
  const title = ok ? 'Meta conectada' : 'Falha na conexão';
  const color = ok ? '#059669' : '#dc2626';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.12)}.dot{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;margin:0 auto 18px;background:${color}15;color:${color};font-size:28px;font-weight:800}h1{font-size:22px;margin:0 0 10px}p{color:#64748b;line-height:1.6;margin:0}</style></head><body><div class="card"><div class="dot">${ok ? '✓' : '!'}</div><h1>${title}</h1><p>${String(message || '').replace(/[<>&]/g, '')}</p></div><script>try{if(window.opener){window.opener.postMessage(${payload},${targetOrigin});setTimeout(()=>window.close(),650)}}catch(e){}</script></body></html>`;
}

module.exports = {
  MetaOAuthError,
  getConfig,
  getOAuthStatus,
  resolveFrontendOrigin,
  buildAuthorizationUrl,
  createOAuthState,
  consumeOAuthState,
  exchangeCodeForToken,
  saveOAuthConnection,
  getConnectionStatus,
  getClientTokenBundle,
  getClientAssets,
  saveClientSelections,
  disconnectOAuth,
  popupHtml,
};
