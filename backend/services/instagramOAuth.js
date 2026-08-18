const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const DEFAULT_API_VERSION = 'v25.0';
const REQUEST_TIMEOUT_MS = Number(process.env.INSTAGRAM_REQUEST_TIMEOUT_MS || 30000);
const DEFAULT_FRONTEND_ORIGIN = 'https://app.zebrazul.com.br';
const REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
];

class InstagramOAuthError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstagramOAuthError';
    this.status = details.status || 400;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function getConfig() {
  return {
    appId: String(
      process.env.INSTAGRAM_APP_ID
      || process.env.STORIES_INSTAGRAM_APP_ID
      || ''
    ).trim(),
    appSecret: String(
      process.env.INSTAGRAM_APP_SECRET
      || process.env.STORIES_INSTAGRAM_APP_SECRET
      || ''
    ).trim(),
    apiVersion: String(
      process.env.INSTAGRAM_API_VERSION
      || process.env.META_API_VERSION
      || DEFAULT_API_VERSION
    ).trim(),
    redirectUri: String(process.env.INSTAGRAM_OAUTH_REDIRECT_URI || '').trim(),
    frontendOrigin: String(
      process.env.INSTAGRAM_OAUTH_FRONTEND_URL
      || process.env.META_OAUTH_FRONTEND_URL
      || process.env.FRONTEND_URL
      || process.env.APP_URL
      || DEFAULT_FRONTEND_ORIGIN
    ).trim().replace(/\/$/, ''),
    encryptionSecret: String(
      process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY
      || process.env.META_TOKEN_ENCRYPTION_KEY
      || process.env.JWT_SECRET
      || 'zebrahub-instagram-token-dev-secret'
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
    login_type: 'instagram',
  };
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
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
  } catch {
    throw new InstagramOAuthError('Não foi possível ler a credencial do Instagram. Reconecte a conta.', { status: 500 });
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
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new InstagramOAuthError('O Instagram retornou uma resposta inválida.', { status: 502 });
    }
    if (!response.ok || payload.error) {
      const apiError = payload.error || {};
      throw new InstagramOAuthError(
        apiError.message || payload.error_message || 'Falha ao comunicar com o Instagram.',
        {
          status: response.status >= 400 && response.status < 500 ? 400 : 502,
          metaCode: apiError.code || payload.error_type,
          metaSubcode: apiError.error_subcode,
          traceId: apiError.fbtrace_id,
        }
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof InstagramOAuthError) throw error;
    if (error.name === 'AbortError') {
      throw new InstagramOAuthError('O Instagram demorou demais para responder.', { status: 504 });
    }
    throw new InstagramOAuthError('Não foi possível conectar ao Instagram.', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function graphUrl(pathOrUrl) {
  const config = getConfig();
  if (/^https?:\/\//i.test(String(pathOrUrl))) return new URL(String(pathOrUrl));
  return new URL(`https://graph.instagram.com/${config.apiVersion}/${String(pathOrUrl).replace(/^\//, '')}`);
}

async function instagramGraphRequest(pathOrUrl, params = {}, accessToken) {
  if (!accessToken) throw new InstagramOAuthError('A autorização do Instagram não está disponível.', { status: 401 });
  const url = graphUrl(pathOrUrl);
  if (!/^https?:\/\//i.test(String(pathOrUrl))) {
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

async function instagramGraphPost(path, params = {}, accessToken) {
  if (!accessToken) throw new InstagramOAuthError('A autorização do Instagram não está disponível.', { status: 401 });
  const url = graphUrl(path);
  url.searchParams.set('access_token', accessToken);
  const proof = buildAppSecretProof(accessToken);
  if (proof) url.searchParams.set('appsecret_proof', proof);

  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  });
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function buildAuthorizationUrl({ redirectUri, state }) {
  const config = getConfig();
  if (!config.appId || !config.appSecret) {
    throw new InstagramOAuthError('Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET no Railway.', { status: 503 });
  }
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');
  return url.toString();
}

function createOAuthState({ agencyId, clientId, userId, frontendOrigin, redirectUri }) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const origin = resolveFrontendOrigin(frontendOrigin);
  db.prepare(`
    INSERT INTO instagram_oauth_states (
      nonce, agency_id, client_id, user_id, frontend_origin, redirect_uri, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+15 minutes'))
  `).run(nonce, agencyId, clientId, userId, origin, redirectUri);
  return jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '15m', issuer: 'zebrahub-instagram-oauth' });
}

function consumeOAuthState(state) {
  let payload;
  try {
    payload = jwt.verify(String(state || ''), JWT_SECRET, { issuer: 'zebrahub-instagram-oauth' });
  } catch {
    throw new InstagramOAuthError('A solicitação de conexão expirou. Tente novamente.', { status: 400 });
  }
  const row = db.prepare(`
    SELECT * FROM instagram_oauth_states
    WHERE nonce = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
  `).get(payload.nonce);
  if (!row) throw new InstagramOAuthError('A solicitação de conexão não é mais válida.', { status: 400 });
  db.prepare("UPDATE instagram_oauth_states SET used_at = datetime('now') WHERE nonce = ?").run(payload.nonce);
  return row;
}

async function exchangeCodeForToken({ code, redirectUri }) {
  const config = getConfig();
  const body = new URLSearchParams();
  body.set('client_id', config.appId);
  body.set('client_secret', config.appSecret);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

  const shortToken = await requestJson('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!shortToken.access_token) {
    throw new InstagramOAuthError('O Instagram não retornou um token de acesso.', { status: 502 });
  }

  let token = shortToken;
  try {
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', config.appSecret);
    longUrl.searchParams.set('access_token', shortToken.access_token);
    const longToken = await requestJson(longUrl);
    if (longToken.access_token) token = { ...shortToken, ...longToken };
  } catch (error) {
    console.warn('[INSTAGRAM OAUTH] Não foi possível trocar por token de longa duração:', error.message);
  }
  return token;
}

function tokenExpiresAt(expiresIn) {
  const seconds = Number(expiresIn || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function fetchInstagramProfile(accessToken, tokenUserId = null) {
  const fieldSets = [
    'id,user_id,username,name,account_type,profile_picture_url',
    'id,username,name,account_type,profile_picture_url',
    'id,username,name,account_type',
  ];
  let lastError = null;
  for (const fields of fieldSets) {
    try {
      const profile = await instagramGraphRequest('me', { fields }, accessToken);
      return {
        id: String(profile.user_id || profile.id || tokenUserId || ''),
        username: profile.username || null,
        name: profile.name || profile.username || null,
        accountType: profile.account_type || null,
        profilePictureUrl: profile.profile_picture_url || null,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (tokenUserId) {
    return {
      id: String(tokenUserId),
      username: null,
      name: null,
      accountType: null,
      profilePictureUrl: null,
    };
  }
  throw lastError || new InstagramOAuthError('Não foi possível identificar a conta do Instagram.', { status: 502 });
}

async function saveOAuthConnection({ stateRow, token }) {
  const profile = await fetchInstagramProfile(token.access_token, token.user_id);
  if (!profile.id) throw new InstagramOAuthError('O Instagram não retornou o ID da conta profissional.', { status: 502 });

  const conflictingClient = db.prepare(`
    SELECT c.id, c.name
    FROM meta_organic_accounts moa
    JOIN clients c ON c.id = moa.client_id
    WHERE moa.agency_id = ? AND moa.client_id <> ? AND moa.instagram_account_id = ?
    LIMIT 1
  `).get(stateRow.agency_id, stateRow.client_id, profile.id);
  if (conflictingClient) {
    throw new InstagramOAuthError(`Este Instagram já está vinculado ao cliente ${conflictingClient.name}.`, { status: 409 });
  }

  // Antes de gravar, detecta se a mesma conta profissional ja esta associada
  // diretamente a outro cliente da mesma agencia. Sem esta verificacao, o SQLite
  // devolvia apenas "UNIQUE constraint failed", sem indicar onde estava o vinculo.
  const directConflict = db.prepare(`
    SELECT ioc.client_id, ioc.status, ioc.username, c.name AS client_name
    FROM instagram_oauth_connections ioc
    JOIN clients c ON c.id = ioc.client_id
    WHERE ioc.agency_id = ?
      AND ioc.client_id <> ?
      AND ioc.instagram_user_id = ?
    LIMIT 1
  `).get(stateRow.agency_id, stateRow.client_id, String(profile.id));

  if (directConflict) {
    const accountLabel = profile.username || directConflict.username
      ? `@${profile.username || directConflict.username}`
      : 'esta conta do Instagram';
    throw new InstagramOAuthError(
      `${accountLabel} ja esta conectado ao cliente ${directConflict.client_name}. ` +
      'Se essa e a conta correta para este cliente, desconecte-a do cliente anterior primeiro. ' +
      'Se nao for, volte ao login e entre com o Instagram correto.',
      { status: 409 }
    );
  }

  const grantedScopes = Array.isArray(token.permissions) && token.permissions.length
    ? token.permissions
    : REQUIRED_SCOPES;

  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO instagram_oauth_connections (
        agency_id, client_id, instagram_user_id, username, display_name,
        profile_picture_url, account_type, access_token_encrypted,
        token_expires_at, scopes_json, status, last_error, connected_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', NULL, ?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET
        agency_id = excluded.agency_id,
        instagram_user_id = excluded.instagram_user_id,
        username = excluded.username,
        display_name = excluded.display_name,
        profile_picture_url = excluded.profile_picture_url,
        account_type = excluded.account_type,
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
      profile.id,
      profile.username,
      profile.name,
      profile.profilePictureUrl,
      profile.accountType,
      encryptToken(token.access_token),
      tokenExpiresAt(token.expires_in),
      JSON.stringify(grantedScopes),
      stateRow.user_id
    );

    const instagramConnection = getConnectionRow(stateRow.client_id, stateRow.agency_id);
    const currentOrganic = db.prepare(`
      SELECT id, asset_key
      FROM meta_organic_accounts
      WHERE client_id = ? AND agency_id = ?
    `).get(stateRow.client_id, stateRow.agency_id);
    const assetKey = currentOrganic?.asset_key || `instagram:${profile.id}`;

    db.prepare(`
      INSERT INTO meta_organic_accounts (
        agency_id, client_id, asset_key,
        instagram_account_id, instagram_username, instagram_name, instagram_picture_url,
        instagram_oauth_connection_id, last_sync_status, last_sync_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'never', NULL, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET
        instagram_account_id = excluded.instagram_account_id,
        instagram_username = excluded.instagram_username,
        instagram_name = excluded.instagram_name,
        instagram_picture_url = excluded.instagram_picture_url,
        instagram_oauth_connection_id = excluded.instagram_oauth_connection_id,
        last_sync_status = 'never',
        last_sync_error = NULL,
        updated_at = datetime('now')
    `).run(
      stateRow.agency_id,
      stateRow.client_id,
      assetKey,
      profile.id,
      profile.username,
      profile.name,
      profile.profilePictureUrl,
      instagramConnection.id
    );

    db.prepare(`
      UPDATE clients SET
        instagram_username = COALESCE(?, instagram_username),
        instagram_display_name = COALESCE(?, instagram_display_name)
      WHERE id = ? AND agency_id = ?
    `).run(profile.username, profile.name, stateRow.client_id, stateRow.agency_id);

    db.prepare(`
      INSERT INTO instagram_story_settings (agency_id, client_id, subscribed_at, last_error)
      VALUES (?, ?, NULL, NULL)
      ON CONFLICT(client_id) DO UPDATE SET
        subscribed_at = NULL,
        last_error = NULL,
        updated_at = datetime('now')
    `).run(stateRow.agency_id, stateRow.client_id);
  });
  save();

  return getConnectionStatus(stateRow.client_id, stateRow.agency_id);
}

function getConnectionRow(clientId, agencyId = null) {
  if (agencyId) {
    return db.prepare(`
      SELECT * FROM instagram_oauth_connections WHERE client_id = ? AND agency_id = ?
    `).get(clientId, agencyId) || null;
  }
  return db.prepare('SELECT * FROM instagram_oauth_connections WHERE client_id = ?').get(clientId) || null;
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
    instagram_user_id: row.instagram_user_id,
    username: row.username,
    display_name: row.display_name,
    profile_picture_url: row.profile_picture_url,
    account_type: row.account_type,
    token_expires_at: row.token_expires_at,
    expired: isExpired(row.token_expires_at),
    scopes,
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
  const row = getConnectionRow(clientId, agencyId);
  if (!row) return null;
  if (isExpired(row.token_expires_at)) {
    throw new InstagramOAuthError('A autorização do Instagram expirou. Reconecte a conta.', { status: 401 });
  }
  return {
    connectionId: row.id,
    accessToken: decryptToken(row.access_token_encrypted),
    instagramUserId: row.instagram_user_id,
    username: row.username,
    accountType: row.account_type,
  };
}

function findConnectionByInstagramUserId(instagramUserId) {
  if (!instagramUserId) return null;
  return db.prepare(`
    SELECT ioc.*, c.name AS client_name
    FROM instagram_oauth_connections ioc
    JOIN clients c ON c.id = ioc.client_id
    WHERE ioc.instagram_user_id = ? AND ioc.status = 'connected'
    LIMIT 1
  `).get(String(instagramUserId)) || null;
}

function disconnectOAuth(clientId, agencyId) {
  const row = getConnectionRow(clientId, agencyId);
  if (!row) return false;
  const disconnect = db.transaction(() => {
    db.prepare(`
      UPDATE meta_organic_accounts SET
        instagram_oauth_connection_id = NULL,
        last_sync_status = CASE WHEN oauth_connection_id IS NOT NULL THEN last_sync_status ELSE 'error' END,
        last_sync_error = CASE WHEN oauth_connection_id IS NOT NULL THEN last_sync_error ELSE 'Instagram direto desconectado' END,
        updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ? AND instagram_oauth_connection_id = ?
    `).run(clientId, agencyId, row.id);

    db.prepare('DELETE FROM instagram_oauth_connections WHERE id = ?').run(row.id);
    db.prepare(`
      UPDATE instagram_story_settings SET
        subscribed_at = NULL,
        last_error = 'Instagram desconectado',
        updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ?
    `).run(clientId, agencyId);
  });
  disconnect();
  return true;
}

function popupHtml({ ok, frontendOrigin, clientId, message }) {
  const payload = JSON.stringify({
    type: 'zebrahub-instagram-oauth',
    ok: Boolean(ok),
    clientId: Number(clientId || 0),
    message: String(message || ''),
  }).replace(/</g, '\\u003c');
  const targetOrigin = JSON.stringify(resolveFrontendOrigin(frontendOrigin));
  const title = ok ? 'Instagram conectado' : 'Falha na conexão';
  const color = ok ? '#059669' : '#dc2626';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.12)}.dot{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;margin:0 auto 18px;background:${color}15;color:${color};font-size:28px;font-weight:800}h1{font-size:22px;margin:0 0 10px}p{color:#64748b;line-height:1.6;margin:0}</style></head><body><div class="card"><div class="dot">${ok ? '✓' : '!'}</div><h1>${title}</h1><p>${String(message || '').replace(/[<>&]/g, '')}</p></div><script>try{if(window.opener){window.opener.postMessage(${payload},${targetOrigin});setTimeout(()=>window.close(),650)}}catch(e){}</script></body></html>`;
}

module.exports = {
  InstagramOAuthError,
  REQUIRED_SCOPES,
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
  findConnectionByInstagramUserId,
  instagramGraphRequest,
  instagramGraphPost,
  disconnectOAuth,
  popupHtml,
};
