// Radar de Conteúdo — rotas por cliente. Permissões (radar.*) são verificadas em
// services/permissions.js (apiPermissionForRequest); aqui garantimos o isolamento por cliente/agência.
const express = require('express');
const db = require('../db/database');
const { canAccessClient } = require('../middleware/auth');
const { discoverFeeds, tryParseFeed, normalizeUrl, googleNewsFeedUrl } = require('../services/radarFeed');
const { refreshSource, refreshClient, cutoffIso } = require('../services/radar');
const { buildPrompt, KINDS } = require('../services/radarPrompts');
const { trendingTerms, fold } = require('../services/radarInsights');

const router = express.Router();
const MAX_SOURCES_PER_CLIENT = 20;
const isClientUser = (req) => req.user?.role === 'client';

function ensureClient(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) { res.status(403).json({ error: 'Você não tem acesso a este cliente.' }); return null; }
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(Number(clientId), req.user.agency_id);
  if (!client) { res.status(404).json({ error: 'Cliente não encontrado.' }); return null; }
  return client;
}

function ensureSource(req, res, sourceId) {
  const source = db.prepare('SELECT * FROM radar_sources WHERE id = ? AND agency_id = ?').get(Number(sourceId), req.user.agency_id);
  if (!source) { res.status(404).json({ error: 'Fonte não encontrada.' }); return null; }
  if (!canAccessClient(req.user, source.client_id)) { res.status(403).json({ error: 'Você não tem acesso a este cliente.' }); return null; }
  return source;
}

const publicSource = (row) => ({
  id: row.id, client_id: row.client_id, name: row.name, site_url: row.site_url, feed_url: row.feed_url, feed_type: row.feed_type,
  is_active: Boolean(row.is_active), client_visible: Boolean(row.client_visible),
  last_fetched_at: row.last_fetched_at, last_success_at: row.last_success_at, last_status: row.last_status, last_error: row.last_error,
  consecutive_failures: row.consecutive_failures, item_count: row.item_count ?? undefined,
});

function cleanName(value, fallback) {
  return String(value || '').trim().slice(0, 120) || fallback;
}

// ---- Fontes ----
router.get('/clients/:clientId/sources', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const rows = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM radar_items i WHERE i.source_id = s.id) AS item_count
    FROM radar_sources s WHERE s.client_id = ? AND s.agency_id = ? ORDER BY s.created_at DESC, s.id DESC
  `).all(client.id, req.user.agency_id);
  res.json({ sources: rows.map(publicSource), limit: MAX_SOURCES_PER_CLIENT });
});

router.post('/clients/:clientId/discover', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  try {
    const candidates = await discoverFeeds(req.body?.url);
    res.json({ candidates, found: candidates.length > 0 });
  } catch (error) {
    res.status(422).json({ error: error.message || 'Não foi possível analisar este endereço.' });
  }
});

router.post('/clients/:clientId/sources', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const count = db.prepare('SELECT COUNT(*) n FROM radar_sources WHERE client_id = ?').get(client.id).n;
  if (count >= MAX_SOURCES_PER_CLIENT) return res.status(409).json({ error: `Limite de ${MAX_SOURCES_PER_CLIENT} fontes por cliente.` });

  let feedUrl;
  try { feedUrl = normalizeUrl(req.body?.feed_url).toString(); } catch (error) { return res.status(400).json({ error: error.message }); }
  let siteUrl = null;
  if (req.body?.site_url) { try { siteUrl = normalizeUrl(req.body.site_url).toString(); } catch { siteUrl = null; } }

  let feedType = null; let feedTitle = ''; let discoveredSite = null;
  try {
    const { feed, finalUrl } = await tryParseFeed(feedUrl);
    feedType = feed.type; feedTitle = feed.title; discoveredSite = feed.site_url; feedUrl = finalUrl;
  } catch (error) {
    if (req.body?.force !== true) {
      return res.status(422).json({ error: `Não consegui ler este feed: ${error.message}`, can_force: true });
    }
  }
  const exists = db.prepare('SELECT id FROM radar_sources WHERE client_id = ? AND feed_url = ?').get(client.id, feedUrl);
  if (exists) return res.status(409).json({ error: 'Esta fonte já está cadastrada para o cliente.' });

  const name = cleanName(req.body?.name, feedTitle || new URL(feedUrl).hostname);
  const info = db.prepare(`
    INSERT INTO radar_sources (agency_id, client_id, name, site_url, feed_url, feed_type, is_active, client_visible, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(req.user.agency_id, client.id, name, siteUrl || discoveredSite, feedUrl, feedType, req.body?.client_visible === false ? 0 : 1, req.user.id);
  const refresh = await refreshSource(info.lastInsertRowid);
  const row = db.prepare('SELECT * FROM radar_sources WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ source: publicSource(row), collected: refresh.ok ? refresh.added : 0, warning: refresh.ok ? null : refresh.error });
});

// Acompanhar um assunto (ex.: "saúde mental") via feed de busca do Google Notícias.
router.post('/clients/:clientId/topic-source', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  let feedUrl;
  try { feedUrl = googleNewsFeedUrl(req.body?.query, { days: Number(req.body?.days) || 0 }); } catch (error) { return res.status(400).json({ error: error.message }); }
  const count = db.prepare('SELECT COUNT(*) n FROM radar_sources WHERE client_id = ?').get(client.id).n;
  if (count >= MAX_SOURCES_PER_CLIENT) return res.status(409).json({ error: `Limite de ${MAX_SOURCES_PER_CLIENT} fontes por cliente.` });
  if (db.prepare('SELECT id FROM radar_sources WHERE client_id = ? AND feed_url = ?').get(client.id, feedUrl)) return res.status(409).json({ error: 'Este assunto já está sendo acompanhado.' });
  const label = String(req.body?.query).trim().replace(/\s+/g, ' ').slice(0, 80);
  const info = db.prepare(`
    INSERT INTO radar_sources (agency_id, client_id, name, site_url, feed_url, feed_type, is_active, client_visible, created_by)
    VALUES (?, ?, ?, 'https://news.google.com/', ?, 'rss', 1, ?, ?)
  `).run(req.user.agency_id, client.id, cleanName(req.body?.name, `Assunto: ${label}`), feedUrl, req.body?.client_visible === false ? 0 : 1, req.user.id);
  const refresh = await refreshSource(info.lastInsertRowid);
  const row = db.prepare('SELECT * FROM radar_sources WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ source: publicSource(row), collected: refresh.ok ? refresh.added : 0, warning: refresh.ok ? null : refresh.error });
});

router.put('/sources/:id', async (req, res) => {
  const source = ensureSource(req, res, req.params.id); if (!source) return;
  const body = req.body || {};
  const next = {
    name: body.name !== undefined ? cleanName(body.name, source.name) : source.name,
    site_url: source.site_url,
    feed_url: source.feed_url,
    is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : source.is_active,
    client_visible: body.client_visible !== undefined ? (body.client_visible ? 1 : 0) : source.client_visible,
  };
  if (body.site_url !== undefined) {
    try { next.site_url = body.site_url ? normalizeUrl(body.site_url).toString() : null; } catch (error) { return res.status(400).json({ error: error.message }); }
  }
  let feedChanged = false;
  if (body.feed_url !== undefined && String(body.feed_url).trim() !== source.feed_url) {
    try { next.feed_url = normalizeUrl(body.feed_url).toString(); } catch (error) { return res.status(400).json({ error: error.message }); }
    const dup = db.prepare('SELECT id FROM radar_sources WHERE client_id = ? AND feed_url = ? AND id != ?').get(source.client_id, next.feed_url, source.id);
    if (dup) return res.status(409).json({ error: 'Esta fonte já está cadastrada para o cliente.' });
    feedChanged = true;
  }
  db.prepare(`
    UPDATE radar_sources SET name = ?, site_url = ?, feed_url = ?, is_active = ?, client_visible = ?,
      etag = CASE WHEN ? THEN NULL ELSE etag END, last_modified = CASE WHEN ? THEN NULL ELSE last_modified END,
      consecutive_failures = CASE WHEN ? THEN 0 ELSE consecutive_failures END, updated_at = datetime('now')
    WHERE id = ?
  `).run(next.name, next.site_url, next.feed_url, next.is_active, next.client_visible, feedChanged ? 1 : 0, feedChanged ? 1 : 0, (feedChanged || (next.is_active && !source.is_active)) ? 1 : 0, source.id);
  let refresh = null;
  if (next.is_active && (feedChanged || !source.is_active)) refresh = await refreshSource(source.id);
  const row = db.prepare('SELECT * FROM radar_sources WHERE id = ?').get(source.id);
  res.json({ source: publicSource(row), warning: refresh && !refresh.ok ? refresh.error : null });
});

router.delete('/sources/:id', (req, res) => {
  const source = ensureSource(req, res, req.params.id); if (!source) return;
  db.prepare('DELETE FROM radar_sources WHERE id = ?').run(source.id);
  res.json({ ok: true });
});

// ---- Referências editoriais do cliente ----
router.get('/clients/:clientId/editorial', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  res.json({ editorial_references: client.editorial_references || '' });
});

router.put('/clients/:clientId/editorial', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const text = String(req.body?.editorial_references ?? '').slice(0, 200000); // teto de segurança, na prática sem limite
  db.prepare('UPDATE clients SET editorial_references = ? WHERE id = ? AND agency_id = ?').run(text.trim() || null, client.id, req.user.agency_id);
  res.json({ editorial_references: text.trim() });
});

// ---- Atualização e lista ----
router.post('/clients/:clientId/refresh', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const summary = await refreshClient(client.id, { force: false });
  res.json(summary);
});

// Primeira visita: considera "novo" o que chegou nas últimas 48 h (assim a página já abre com vida).
function lastSeen(userId, clientId) {
  const row = db.prepare('SELECT last_seen_at FROM radar_visits WHERE user_id = ? AND client_id = ?').get(userId, clientId);
  if (row) return row.last_seen_at;
  return new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function visibleBase(req, clientId) {
  const where = ['i.client_id = ?', 'i.agency_id = ?', 's.is_active = 1', 'i.published_at >= ?'];
  const params = [clientId, req.user.agency_id, cutoffIso()];
  if (isClientUser(req)) where.push('s.client_visible = 1');
  return { where, params, from: 'FROM radar_items i JOIN radar_sources s ON s.id = i.source_id' };
}

function dayBound(value, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return end ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
}

router.get('/clients/:clientId/items', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const where = ['i.client_id = ?', 'i.agency_id = ?', 's.is_active = 1', 'i.published_at >= ?'];
  const params = [client.id, req.user.agency_id, cutoffIso()];
  if (isClientUser(req)) where.push('s.client_visible = 1');
  const from = dayBound(req.query.from, false); const to = dayBound(req.query.to, true);
  if (from) { where.push('i.published_at >= ?'); params.push(from); }
  if (to) { where.push('i.published_at <= ?'); params.push(to); }
  if (Number(req.query.source_id) > 0) { where.push('i.source_id = ?'); params.push(Number(req.query.source_id)); }
  const terms = String(req.query.q || '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  const joiner = req.query.match === 'any' ? ' OR ' : ' AND ';
  if (terms.length) {
    const parts = terms.map(() => `(i.title LIKE ? ESCAPE '\\' OR i.summary LIKE ? ESCAPE '\\')`);
    where.push(`(${parts.join(joiner)})`);
    terms.forEach((t) => { const like = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`; params.push(like, like); });
  }
  if (req.query.saved === '1') {
    where.push('EXISTS (SELECT 1 FROM radar_item_saves sv WHERE sv.item_id = i.id AND sv.user_id = ?)');
    params.push(req.user.id);
  }
  const seenAt = lastSeen(req.user.id, client.id);
  if (req.query.only_new === '1') { where.push('i.fetched_at > ?'); params.push(seenAt); }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const base = `FROM radar_items i JOIN radar_sources s ON s.id = i.source_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...params).n;
  const items = db.prepare(`
    SELECT i.id, i.source_id, s.name AS source_name, i.title, i.summary, i.link, i.published_at,
      (i.fetched_at > ?) AS is_new,
      EXISTS (SELECT 1 FROM radar_item_saves sv WHERE sv.item_id = i.id AND sv.user_id = ?) AS saved ${base}
    ORDER BY i.published_at DESC, i.id DESC LIMIT ? OFFSET ?
  `).all(seenAt, req.user.id, ...params, limit, offset).map((row) => ({ ...row, is_new: Boolean(row.is_new), saved: Boolean(row.saved) }));
  const sourceFilter = isClientUser(req) ? ' AND client_visible = 1' : '';
  const sources = db.prepare(`SELECT id, name FROM radar_sources WHERE client_id = ? AND agency_id = ? AND is_active = 1${sourceFilter} ORDER BY name`).all(client.id, req.user.agency_id);
  res.json({ items, total, sources, limit, offset });
});

// ---- Prompts ----
router.post('/items/:id/prompt', (req, res) => {
  const item = db.prepare(`
    SELECT i.*, s.name AS source_name FROM radar_items i JOIN radar_sources s ON s.id = i.source_id
    WHERE i.id = ? AND i.agency_id = ?
  `).get(Number(req.params.id), req.user.agency_id);
  if (!item) return res.status(404).json({ error: 'Notícia não encontrada.' });
  const client = ensureClient(req, res, item.client_id); if (!client) return;
  const kind = String(req.body?.kind || '');
  if (!KINDS[kind]) return res.status(400).json({ error: 'Escolha carrossel ou roteiro de vídeo.' });
  const angle = String(req.body?.angle || '').trim().slice(0, 500);
  const diagnosisRow = db.prepare(`
    SELECT result_json FROM presence_diagnostics
    WHERE agency_id = ? AND client_id = ? AND status = 'submitted'
    ORDER BY submitted_at DESC, id DESC LIMIT 1
  `).get(req.user.agency_id, client.id);
  let presenceDiagnostic = null;
  try { presenceDiagnostic = diagnosisRow?.result_json ? JSON.parse(diagnosisRow.result_json) : null; } catch {}
  const prompt = buildPrompt({ kind, client, item, source: { name: item.source_name }, angle, presenceDiagnostic });
  const info = db.prepare(`
    INSERT INTO radar_prompt_history (agency_id, client_id, item_id, kind, angle, prompt_text, item_title, item_link, source_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.agency_id, client.id, item.id, kind, angle || null, prompt, item.title, item.link, item.source_name, req.user.id);
  res.status(201).json({ prompt, kind, history_id: info.lastInsertRowid });
});

router.get('/clients/:clientId/history', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const params = [client.id, req.user.agency_id];
  let kindSql = '';
  if (KINDS[String(req.query.kind || '')]) { kindSql = ' AND h.kind = ?'; params.push(String(req.query.kind)); }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const total = db.prepare(`SELECT COUNT(*) n FROM radar_prompt_history h WHERE h.client_id = ? AND h.agency_id = ?${kindSql}`).get(...params).n;
  const rows = db.prepare(`
    SELECT h.id, h.kind, h.angle, h.prompt_text, h.item_title, h.item_link, h.source_name, h.created_at, u.name AS created_by_name
    FROM radar_prompt_history h LEFT JOIN users u ON u.id = h.created_by
    WHERE h.client_id = ? AND h.agency_id = ?${kindSql} ORDER BY h.created_at DESC, h.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  res.json({ history: rows, total, limit, offset });
});

// ---- Página do Radar: visão geral, "em alta", visitas e salvos ----
router.get('/clients/:clientId/overview', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  const { where, params, from } = visibleBase(req, client.id);
  const seenAt = lastSeen(req.user.id, client.id);
  const iso = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const startOfToday = `${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)}T03:00:00.000Z`; // dia em America/Fortaleza
  const count = (extra, ...p) => db.prepare(`SELECT COUNT(*) n ${from} WHERE ${where.join(' AND ')} ${extra}`).get(...params, ...p).n;
  const titles = db.prepare(`SELECT i.title ${from} WHERE ${where.join(' AND ')} AND i.published_at >= ? ORDER BY i.published_at DESC LIMIT 400`).all(...params, iso(7)).map((r) => r.title);
  const sourcesActive = db.prepare(`SELECT COUNT(*) n FROM radar_sources WHERE client_id = ? AND agency_id = ? AND is_active = 1${isClientUser(req) ? ' AND client_visible = 1' : ''}`).get(client.id, req.user.agency_id).n;
  const lastRow = db.prepare(`SELECT MAX(last_success_at) AS t FROM radar_sources WHERE client_id = ? AND agency_id = ? AND is_active = 1`).get(client.id, req.user.agency_id);
  const promptsTotal = isClientUser(req) ? null : db.prepare('SELECT COUNT(*) n FROM radar_prompt_history WHERE client_id = ? AND agency_id = ?').get(client.id, req.user.agency_id).n;
  res.json({
    client: { id: client.id, name: client.name, segment: client.segment, logo_color: client.logo_color },
    stats: {
      new_since_visit: count('AND i.fetched_at > ?', seenAt),
      today: count('AND i.published_at >= ?', startOfToday),
      week: count('AND i.published_at >= ?', iso(7)),
      total: count(''),
      sources_active: sourcesActive,
      prompts_total: promptsTotal,
      last_updated_at: lastRow?.t || null,
    },
    trending: trendingTerms(titles),
    last_seen_at: seenAt,
  });
});

router.post('/clients/:clientId/seen', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId); if (!client) return;
  db.prepare(`INSERT INTO radar_visits (user_id, client_id, last_seen_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, client_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`).run(req.user.id, client.id, sqlNow());
  res.json({ ok: true });
});

// Resumo para a vitrine de clientes e para o selo do menu.
router.get('/summary', (req, res) => {
  let rows;
  if (req.user.role === 'admin' || req.user.is_operations_head) {
    rows = db.prepare("SELECT id, name, segment, logo_color FROM clients WHERE agency_id = ? AND status != 'inactive' ORDER BY name").all(req.user.agency_id);
  } else {
    const ids = isClientUser(req) ? [Number(req.user.client_id)] : (Array.isArray(req.user.client_ids) ? req.user.client_ids : []);
    rows = ids.length ? db.prepare(`SELECT id, name, segment, logo_color FROM clients WHERE agency_id = ? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY name`).all(req.user.agency_id, ...ids) : [];
  }
  const clientSide = isClientUser(req) ? ' AND s.client_visible = 1' : '';
  const clients = rows.map((c) => {
    const seenAt = lastSeen(req.user.id, c.id);
    const row = db.prepare(`
      SELECT COUNT(DISTINCT s.id) AS sources,
        COALESCE(SUM(CASE WHEN i.fetched_at > ? THEN 1 ELSE 0 END), 0) AS fresh,
        COALESCE(SUM(CASE WHEN i.published_at >= ? THEN 1 ELSE 0 END), 0) AS week
      FROM radar_sources s LEFT JOIN radar_items i ON i.source_id = s.id AND i.published_at >= ?
      WHERE s.client_id = ? AND s.agency_id = ? AND s.is_active = 1${clientSide}
    `).get(seenAt, new Date(Date.now() - 7 * 86400000).toISOString(), cutoffIso(), c.id, req.user.agency_id);
    return { ...c, sources: row.sources, new_since_visit: row.fresh, week: row.week };
  });
  res.json({ clients, total_new: clients.reduce((sum, c) => sum + c.new_since_visit, 0) });
});

router.post('/items/:id/save', (req, res) => {
  const item = db.prepare('SELECT id, client_id FROM radar_items WHERE id = ? AND agency_id = ?').get(Number(req.params.id), req.user.agency_id);
  if (!item) return res.status(404).json({ error: 'Notícia não encontrada.' });
  if (!ensureClient(req, res, item.client_id)) return;
  db.prepare('INSERT OR IGNORE INTO radar_item_saves (user_id, item_id) VALUES (?, ?)').run(req.user.id, item.id);
  res.json({ saved: true });
});
router.delete('/items/:id/save', (req, res) => {
  const item = db.prepare('SELECT id, client_id FROM radar_items WHERE id = ? AND agency_id = ?').get(Number(req.params.id), req.user.agency_id);
  if (!item) return res.status(404).json({ error: 'Notícia não encontrada.' });
  if (!ensureClient(req, res, item.client_id)) return;
  db.prepare('DELETE FROM radar_item_saves WHERE user_id = ? AND item_id = ?').run(req.user.id, item.id);
  res.json({ saved: false });
});

module.exports = router;
