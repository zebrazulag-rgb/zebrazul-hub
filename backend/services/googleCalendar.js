const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const { encryptSecret, decryptSecret } = require('./credentialVault');

const DEFAULT_FRONTEND_ORIGIN = 'https://app.zebrazul.com.br';
const REQUEST_TIMEOUT_MS = Number(process.env.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS || 30000);
const DEFAULT_TIMEZONE = 'America/Fortaleza';
const DEFAULT_UTC_OFFSET = '-03:00';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
];

class GoogleCalendarError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.status = status;
  }
}

function getConfig() {
  return {
    clientId: String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim(),
    redirectUri: String(process.env.GOOGLE_CALENDAR_REDIRECT_URI || '').trim(),
    frontendOrigin: String(
      process.env.GOOGLE_CALENDAR_FRONTEND_URL
      || process.env.FRONTEND_URL
      || process.env.APP_URL
      || DEFAULT_FRONTEND_ORIGIN
    ).trim().replace(/\/$/, ''),
    timezone: String(process.env.GOOGLE_CALENDAR_TIMEZONE || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
    utcOffset: String(process.env.GOOGLE_CALENDAR_UTC_OFFSET || DEFAULT_UTC_OFFSET).trim() || DEFAULT_UTC_OFFSET,
  };
}

function getOAuthStatus() {
  const config = getConfig();
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    client_id_configured: Boolean(config.clientId),
    client_secret_configured: Boolean(config.clientSecret),
    redirect_uri_configured: Boolean(config.redirectUri),
    timezone: config.timezone,
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

function buildAuthorizationUrl({ redirectUri, state }) {
  const config = getConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new GoogleCalendarError('Configure GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET no Railway.', 503);
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

function createOAuthState({ agencyId, userId, frontendOrigin, redirectUri }) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const origin = resolveFrontendOrigin(frontendOrigin);
  db.prepare(`
    INSERT INTO google_calendar_oauth_states (
      nonce, agency_id, user_id, frontend_origin, redirect_uri, expires_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+15 minutes'))
  `).run(nonce, agencyId, userId, origin, redirectUri);
  return jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '15m', issuer: 'zebrahub-google-calendar-oauth' });
}

function consumeOAuthState(state) {
  let payload;
  try {
    payload = jwt.verify(String(state || ''), JWT_SECRET, { issuer: 'zebrahub-google-calendar-oauth' });
  } catch {
    throw new GoogleCalendarError('A solicitação de conexão expirou. Tente novamente.');
  }

  const row = db.prepare(`
    SELECT * FROM google_calendar_oauth_states
    WHERE nonce = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
  `).get(payload.nonce);
  if (!row) throw new GoogleCalendarError('A solicitação de conexão não é mais válida.');
  db.prepare("UPDATE google_calendar_oauth_states SET used_at = datetime('now') WHERE nonce = ?").run(payload.nonce);
  return row;
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) {
      const message = data?.error_description || data?.error?.message || data?.error || `Erro do Google (${response.status}).`;
      throw new GoogleCalendarError(String(message), response.status >= 500 ? 502 : 400);
    }
    return data;
  } catch (error) {
    if (error instanceof GoogleCalendarError) throw error;
    if (error.name === 'AbortError') throw new GoogleCalendarError('O Google demorou demais para responder.', 504);
    throw new GoogleCalendarError('Não foi possível conectar ao Google Agenda.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function exchangeCodeForToken({ code, redirectUri }) {
  const config = getConfig();
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('redirect_uri', redirectUri);
  body.set('grant_type', 'authorization_code');
  const token = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!token.access_token) throw new GoogleCalendarError('O Google não retornou um token de acesso.', 502);
  return token;
}

async function fetchGoogleProfile(accessToken) {
  try {
    return await requestJson('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return {};
  }
}

function expiresAt(expiresIn) {
  const seconds = Number(expiresIn || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function saveConnection({ stateRow, token }) {
  const profile = await fetchGoogleProfile(token.access_token);
  const existing = db.prepare('SELECT * FROM google_calendar_connections WHERE agency_id = ?').get(stateRow.agency_id);
  const refreshToken = token.refresh_token || (existing?.refresh_token_encrypted ? decryptSecret(existing.refresh_token_encrypted, stateRow.agency_id) : null);
  if (!refreshToken) {
    throw new GoogleCalendarError('O Google não retornou autorização offline. Desconecte a integração no Google e tente novamente.', 400);
  }
  db.prepare(`
    INSERT INTO google_calendar_connections (
      agency_id, google_email, google_user_id, calendar_id,
      access_token_encrypted, refresh_token_encrypted, token_expires_at,
      scopes_json, status, connected_by, connected_at, updated_at
    ) VALUES (?, ?, ?, 'primary', ?, ?, ?, ?, 'connected', ?, datetime('now'), datetime('now'))
    ON CONFLICT(agency_id) DO UPDATE SET
      google_email = excluded.google_email,
      google_user_id = excluded.google_user_id,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      scopes_json = excluded.scopes_json,
      status = 'connected',
      last_error = NULL,
      connected_by = excluded.connected_by,
      connected_at = datetime('now'),
      updated_at = datetime('now')
  `).run(
    stateRow.agency_id,
    profile.email || null,
    profile.id || null,
    encryptSecret(token.access_token, stateRow.agency_id),
    encryptSecret(refreshToken, stateRow.agency_id),
    expiresAt(token.expires_in),
    JSON.stringify(String(token.scope || '').split(/\s+/).filter(Boolean)),
    stateRow.user_id,
  );
  return getConnectionStatus(stateRow.agency_id);
}

function getConnectionRow(agencyId) {
  return db.prepare('SELECT * FROM google_calendar_connections WHERE agency_id = ?').get(agencyId) || null;
}

function getConnectionStatus(agencyId) {
  const row = getConnectionRow(agencyId);
  if (!row) return { connected: false, status: 'disconnected' };
  return {
    connected: row.status === 'connected',
    status: row.status,
    google_email: row.google_email,
    calendar_id: row.calendar_id || 'primary',
    connected_at: row.connected_at,
    last_error: row.last_error,
  };
}

async function refreshAccessToken(row) {
  const config = getConfig();
  const refreshToken = decryptSecret(row.refresh_token_encrypted, row.agency_id);
  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('refresh_token', refreshToken);
  body.set('grant_type', 'refresh_token');
  const token = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!token.access_token) throw new GoogleCalendarError('Não foi possível renovar o acesso ao Google Agenda.', 401);
  db.prepare(`
    UPDATE google_calendar_connections
    SET access_token_encrypted = ?, token_expires_at = ?, status = 'connected', last_error = NULL, updated_at = datetime('now')
    WHERE agency_id = ?
  `).run(encryptSecret(token.access_token, row.agency_id), expiresAt(token.expires_in), row.agency_id);
  return token.access_token;
}

async function accessTokenForAgency(agencyId) {
  const row = getConnectionRow(agencyId);
  if (!row || row.status !== 'connected') return null;
  const expiry = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (!expiry || expiry < Date.now() + 60000) return refreshAccessToken(row);
  try {
    return decryptSecret(row.access_token_encrypted, agencyId);
  } catch {
    return refreshAccessToken(row);
  }
}

async function calendarRequest(agencyId, path, options = {}) {
  let token = await accessTokenForAgency(agencyId);
  if (!token) return null;
  const doRequest = (accessToken) => requestJson(`https://www.googleapis.com/calendar/v3${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  try {
    return await doRequest(token);
  } catch (error) {
    if (error.status !== 400 && error.status !== 401) throw error;
    const row = getConnectionRow(agencyId);
    token = await refreshAccessToken(row);
    return doRequest(token);
  }
}

function toRfc3339(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/Z$|[+-]\d\d:\d\d$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const config = getConfig();
  const normalized = raw.length === 16 ? `${raw}:00` : raw;
  const date = new Date(`${normalized}${config.utcOffset}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addMinutes(value, minutes) {
  const base = toRfc3339(value);
  if (!base) return null;
  return new Date(new Date(base).getTime() + Number(minutes || 60) * 60000).toISOString();
}

function recordingEventBody(recording, clientName) {
  const config = getConfig();
  const start = toRfc3339(recording.scheduled_start);
  const end = toRfc3339(recording.scheduled_end) || addMinutes(recording.scheduled_start, 60);
  const icon = recording.status === 'recorded' ? '✅' : recording.status === 'cancelled' ? '❌' : '🎥';
  return {
    summary: `${icon} Gravação — ${clientName}`,
    description: [
      `ZebraHub • Gravação #${recording.id}`,
      recording.responsible_name ? `Responsável: ${recording.responsible_name}` : null,
      recording.status ? `Status: ${recording.status}` : null,
      recording.notes || null,
    ].filter(Boolean).join('\n'),
    location: recording.location || undefined,
    start: { dateTime: start, timeZone: config.timezone },
    end: { dateTime: end, timeZone: config.timezone },
  };
}

async function syncRecordingEvent({ recording, clientName, agencyId }) {
  const connection = getConnectionRow(agencyId);
  if (!connection || connection.status !== 'connected') return { skipped: true };
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const eventBody = recordingEventBody(recording, clientName);
  try {
    let event;
    if (recording.google_event_id) {
      event = await calendarRequest(agencyId, `/calendars/${calendarId}/events/${encodeURIComponent(recording.google_event_id)}`, {
        method: 'PATCH',
        body: eventBody,
      });
    } else {
      event = await calendarRequest(agencyId, `/calendars/${calendarId}/events`, {
        method: 'POST',
        body: eventBody,
      });
    }
    if (!event) return { skipped: true };
    return { event_id: event.id || recording.google_event_id || null, html_link: event.htmlLink || recording.google_event_link || null };
  } catch (error) {
    db.prepare(`UPDATE google_calendar_connections SET last_error = ?, updated_at = datetime('now') WHERE agency_id = ?`)
      .run(error.message || 'Falha ao sincronizar evento.', agencyId);
    throw error;
  }
}

async function deleteRecordingEvent({ recording, agencyId }) {
  if (!recording?.google_event_id) return { skipped: true };
  const connection = getConnectionRow(agencyId);
  if (!connection || connection.status !== 'connected') return { skipped: true };
  const token = await accessTokenForAgency(agencyId);
  if (!token) return { skipped: true };
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(recording.google_event_id)}`;
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404 || response.status === 410 || response.ok) return { ok: true };
  throw new GoogleCalendarError('Não foi possível remover o evento do Google Agenda.', 502);
}

function disconnect(agencyId) {
  db.prepare(`
    UPDATE google_calendar_connections
    SET status = 'disconnected', access_token_encrypted = NULL, refresh_token_encrypted = NULL,
        token_expires_at = NULL, updated_at = datetime('now')
    WHERE agency_id = ?
  `).run(agencyId);
}

function popupHtml({ ok, frontendOrigin, message }) {
  const origin = resolveFrontendOrigin(frontendOrigin);
  const payload = JSON.stringify({ type: 'zebrahub-google-calendar-oauth', ok: Boolean(ok), message: String(message || '') }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Google Agenda</title></head><body style="font-family:Arial,sans-serif;padding:28px;color:#0f172a"><h2>${ok ? 'Google Agenda conectado' : 'Não foi possível conectar'}</h2><p>${String(message || '').replace(/[<>]/g, '')}</p><script>try{if(window.opener){window.opener.postMessage(${payload}, ${JSON.stringify(origin)});}setTimeout(()=>window.close(),700);}catch(e){}</script></body></html>`;
}

module.exports = {
  GoogleCalendarError,
  getConfig,
  getOAuthStatus,
  buildAuthorizationUrl,
  createOAuthState,
  consumeOAuthState,
  exchangeCodeForToken,
  saveConnection,
  getConnectionStatus,
  syncRecordingEvent,
  deleteRecordingEvent,
  disconnect,
  popupHtml,
};
