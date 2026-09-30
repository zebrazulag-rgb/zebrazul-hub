const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const {
  CompetitorIntelligenceError,
  usernameFromInput,
  fetchCompetitorProfile,
  calculateMetrics,
  analyzeWithAI,
  getCollectorOverview,
  setAgencyCollector,
} = require('../services/competitorIntelligence');

const router = express.Router();
router.use(authRequired);

const activeJobs = new Set();
const MAX_COMPETITORS_PER_CLIENT = 10;

function ensureClient(req, res, value) {
  const clientId = Number(value);
  if (!Number.isInteger(clientId) || clientId <= 0) { res.status(400).json({ error: 'Selecione um cliente.' }); return null; }
  if (!canAccessClient(req.user, clientId)) { res.status(403).json({ error: 'Você não possui acesso a este cliente.' }); return null; }
  const row = db.prepare('SELECT id, name, instagram_username FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
  if (!row) { res.status(404).json({ error: 'Cliente não encontrado.' }); return null; }
  return row;
}

function canEdit(req) { return req.user?.role === 'admin' || req.user?.role === 'team'; }
function canConfigureCollector(req) {
  return req.user?.role === 'admin' || Boolean(req.user?.is_agency_owner) || Boolean(req.user?.is_platform_owner);
}
function safeJson(value, fallback) { try { return JSON.parse(value || ''); } catch { return fallback; } }

function latestSnapshot(competitorId, agencyId) {
  const row = db.prepare(`SELECT * FROM competitor_snapshots WHERE competitor_id = ? AND agency_id = ? ORDER BY datetime(captured_at) DESC, id DESC LIMIT 1`).get(competitorId, agencyId);
  if (!row) return null;
  return {
    id: row.id,
    captured_at: row.captured_at,
    source: row.source,
    ai_model: row.ai_model,
    profile: safeJson(row.profile_json, {}),
    media: safeJson(row.media_json, []),
    metrics: safeJson(row.metrics_json, {}),
    analysis: safeJson(row.analysis_json, {}),
  };
}

function serializeCompetitor(row, agencyId) {
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    instagram_username: row.instagram_username,
    instagram_url: row.instagram_url,
    display_name: row.display_name,
    profile_picture_url: row.profile_picture_url,
    biography: row.biography,
    website: row.website,
    followers_count: Number(row.followers_count || 0),
    follows_count: Number(row.follows_count || 0),
    media_count: Number(row.media_count || 0),
    status: row.status,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest: latestSnapshot(row.id, agencyId),
  };
}

function getCompetitor(id, agencyId) {
  return db.prepare('SELECT * FROM competitors WHERE id = ? AND agency_id = ?').get(Number(id), Number(agencyId)) || null;
}

async function runAnalysis(context, competitor) {
  const { profile, media } = await fetchCompetitorProfile({
    agencyId: context.agencyId,
    username: competitor.instagram_username,
  });
  const metrics = calculateMetrics(profile, media);
  const ai = await analyzeWithAI({ profile, media, metrics });
  const analysis = ai.analysis || {
    summary: ai.warning || 'Métricas coletadas. A leitura estratégica por IA ainda não está disponível.',
    warning: ai.warning || null,
  };

  const snapshotInfo = db.prepare(`
    INSERT INTO competitor_snapshots (agency_id, client_id, competitor_id, source, profile_json, media_json, metrics_json, analysis_json, ai_model, created_by)
    VALUES (?, ?, ?, 'meta_agency_collector', ?, ?, ?, ?, ?, ?)
  `).run(
    context.agencyId,
    competitor.client_id,
    competitor.id,
    JSON.stringify(profile),
    JSON.stringify(media),
    JSON.stringify(metrics),
    JSON.stringify(analysis),
    ai.model || null,
    context.userId || competitor.created_by || null,
  );

  db.prepare(`
    UPDATE competitors SET instagram_url = ?, display_name = ?, profile_picture_url = ?, biography = ?, website = ?,
      followers_count = ?, follows_count = ?, media_count = ?, status = 'ready', last_error = NULL, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    `https://www.instagram.com/${profile.username}/`,
    profile.name || profile.username,
    profile.profile_picture_url || null,
    profile.biography || null,
    profile.website || null,
    profile.followers_count || 0,
    profile.follows_count || 0,
    profile.media_count || 0,
    competitor.id,
    context.agencyId,
  );

  return { snapshot_id: snapshotInfo.lastInsertRowid, warning: ai.warning || null };
}

async function processQueuedCompetitor(competitorId, agencyId, userId = null) {
  const jobKey = `${agencyId}:${competitorId}`;
  if (activeJobs.has(jobKey)) return;
  activeJobs.add(jobKey);
  try {
    const competitor = getCompetitor(competitorId, agencyId);
    if (!competitor) return;
    db.prepare(`UPDATE competitors SET status = 'analyzing', last_error = NULL, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(competitor.id, agencyId);
    try {
      await runAnalysis({ agencyId, userId }, competitor);
    } catch (error) {
      const message = error instanceof CompetitorIntelligenceError ? error.message : 'Não foi possível concluir a análise deste perfil.';
      db.prepare(`UPDATE competitors SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(message, competitor.id, agencyId);
      if (!(error instanceof CompetitorIntelligenceError)) console.error('[COMPETITORS QUEUE]', error);
    }
  } finally {
    activeJobs.delete(jobKey);
  }
}

function queueCompetitor(competitorId, agencyId, userId = null) {
  const jobKey = `${agencyId}:${competitorId}`;
  if (activeJobs.has(jobKey)) return;
  setImmediate(() => processQueuedCompetitor(competitorId, agencyId, userId));
}

function parseUsernames(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,;]+/g);
  const valid = [];
  const invalid = [];
  entries.filter(Boolean).forEach((entry) => {
    const username = usernameFromInput(entry);
    if (username) valid.push(username);
    else invalid.push(String(entry).trim());
  });
  return { usernames: [...new Set(valid)], invalid };
}

router.get('/collector', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getCollectorOverview(req.user.agency_id));
});

router.put('/collector', (req, res) => {
  if (!canConfigureCollector(req)) return res.status(403).json({ error: 'Somente administradores podem alterar a conta coletora.' });
  try {
    const oauthConnectionId = Number(req.body?.oauth_connection_id);
    if (!Number.isInteger(oauthConnectionId) || oauthConnectionId <= 0) return res.status(400).json({ error: 'Selecione uma conexão válida.' });
    res.json(setAgencyCollector(req.user.agency_id, oauthConnectionId, req.user.id));
  } catch (error) {
    const message = error instanceof CompetitorIntelligenceError ? error.message : 'Não foi possível configurar a conta coletora.';
    res.status(error.status || 500).json({ error: message, code: error.code || 'collector_setup_failed' });
  }
});

router.get('/', (req, res) => {
  const client = ensureClient(req, res, req.query.client_id); if (!client) return;
  const rows = db.prepare(`SELECT * FROM competitors WHERE agency_id = ? AND client_id = ? ORDER BY datetime(updated_at) DESC, id DESC`).all(req.user.agency_id, client.id);
  const collector = getCollectorOverview(req.user.agency_id);
  rows.filter((row) => {
    if (['pending', 'analyzing'].includes(row.status)) return true;
    if (row.status !== 'error' || !collector.configured) return false;
    return /conecte e selecione o instagram|conta coletora|configurações > integrações/i.test(String(row.last_error || ''));
  }).forEach((row) => queueCompetitor(row.id, req.user.agency_id, req.user.id));
  res.set('Cache-Control', 'no-store');
  res.json({
    client,
    collector,
    competitors: rows.map((row) => serializeCompetitor(row, req.user.agency_id)),
  });
});

// Fluxo simples: cadastra um ou vários @ e devolve imediatamente.
// A coleta/análise acontece em segundo plano e o frontend acompanha o status.
router.post('/', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Seu acesso permite apenas visualizar as análises.' });
  const client = ensureClient(req, res, req.body.client_id); if (!client) return;
  const parsed = parseUsernames(req.body.usernames || req.body.input || req.body.instagram_url || req.body.username);
  if (!parsed.usernames.length) return res.status(400).json({ error: 'Digite pelo menos um @ válido do Instagram.', invalid: parsed.invalid });

  const existingRows = db.prepare(`SELECT * FROM competitors WHERE agency_id = ? AND client_id = ?`).all(req.user.agency_id, client.id);
  const byUsername = new Map(existingRows.map((row) => [row.instagram_username, row]));
  const remaining = Math.max(0, MAX_COMPETITORS_PER_CLIENT - existingRows.length);
  const added = [];
  const existing = [];
  const skipped = [];
  let slots = remaining;

  parsed.usernames.forEach((username) => {
    const found = byUsername.get(username);
    if (found) {
      existing.push(serializeCompetitor(found, req.user.agency_id));
      if (found.status === 'error') {
        db.prepare(`UPDATE competitors SET status = 'pending', last_error = NULL, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(found.id, req.user.agency_id);
        queueCompetitor(found.id, req.user.agency_id, req.user.id);
      }
      return;
    }
    if (slots <= 0) { skipped.push(username); return; }
    const info = db.prepare(`
      INSERT INTO competitors (agency_id, client_id, instagram_username, instagram_url, status, created_by)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(req.user.agency_id, client.id, username, `https://www.instagram.com/${username}/`, req.user.id);
    const row = getCompetitor(info.lastInsertRowid, req.user.agency_id);
    byUsername.set(username, row);
    added.push(serializeCompetitor(row, req.user.agency_id));
    slots -= 1;
    queueCompetitor(row.id, req.user.agency_id, req.user.id);
  });

  res.status(201).json({
    ok: true,
    added,
    existing,
    invalid: parsed.invalid,
    skipped,
    limit: MAX_COMPETITORS_PER_CLIENT,
    collector: getCollectorOverview(req.user.agency_id),
  });
});

// Mantida para compatibilidade com versões anteriores do frontend.
router.post('/analyze', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Seu acesso permite apenas visualizar as análises.' });
  const client = ensureClient(req, res, req.body.client_id); if (!client) return;
  const username = usernameFromInput(req.body.instagram_url || req.body.username);
  if (!username) return res.status(400).json({ error: 'Cole um link ou @ do Instagram válido.' });
  let competitor = db.prepare('SELECT * FROM competitors WHERE agency_id = ? AND client_id = ? AND instagram_username = ?').get(req.user.agency_id, client.id, username);
  if (!competitor) {
    const info = db.prepare(`INSERT INTO competitors (agency_id, client_id, instagram_username, instagram_url, status, created_by) VALUES (?, ?, ?, ?, 'analyzing', ?)`)
      .run(req.user.agency_id, client.id, username, `https://www.instagram.com/${username}/`, req.user.id);
    competitor = getCompetitor(info.lastInsertRowid, req.user.agency_id);
  } else db.prepare(`UPDATE competitors SET status = 'analyzing', last_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(competitor.id);

  try {
    const result = await runAnalysis({ agencyId: req.user.agency_id, userId: req.user.id }, competitor);
    res.json({ competitor: serializeCompetitor(getCompetitor(competitor.id, req.user.agency_id), req.user.agency_id), ...result });
  } catch (error) {
    const message = error instanceof CompetitorIntelligenceError ? error.message : 'Não foi possível concluir a análise deste perfil.';
    db.prepare(`UPDATE competitors SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(message, competitor.id, req.user.agency_id);
    if (!(error instanceof CompetitorIntelligenceError)) console.error('[COMPETITORS ANALYZE]', error);
    res.status(error.status || 502).json({ error: message, code: error.code || 'analysis_failed', details: error.details || null, competitor: serializeCompetitor(getCompetitor(competitor.id, req.user.agency_id), req.user.agency_id) });
  }
});

router.post('/:id/analyze', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Seu acesso permite apenas visualizar as análises.' });
  const competitor = getCompetitor(req.params.id, req.user.agency_id);
  if (!competitor || !canAccessClient(req.user, competitor.client_id)) return res.status(404).json({ error: 'Concorrente não encontrado.' });
  db.prepare(`UPDATE competitors SET status = 'analyzing', last_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(competitor.id);
  try {
    const result = await runAnalysis({ agencyId: req.user.agency_id, userId: req.user.id }, competitor);
    res.json({ competitor: serializeCompetitor(getCompetitor(competitor.id, req.user.agency_id), req.user.agency_id), ...result });
  } catch (error) {
    const message = error instanceof CompetitorIntelligenceError ? error.message : 'Não foi possível atualizar a análise.';
    db.prepare(`UPDATE competitors SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ?`).run(message, competitor.id);
    res.status(error.status || 502).json({ error: message, code: error.code || 'analysis_failed' });
  }
});

router.delete('/:id', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Seu acesso permite apenas visualizar as análises.' });
  const competitor = getCompetitor(req.params.id, req.user.agency_id);
  if (!competitor || !canAccessClient(req.user, competitor.client_id)) return res.status(404).json({ error: 'Concorrente não encontrado.' });
  db.prepare('DELETE FROM competitors WHERE id = ? AND agency_id = ?').run(competitor.id, req.user.agency_id);
  res.json({ ok: true });
});

router.get('/:id/history', (req, res) => {
  const competitor = getCompetitor(req.params.id, req.user.agency_id);
  if (!competitor || !canAccessClient(req.user, competitor.client_id)) return res.status(404).json({ error: 'Concorrente não encontrado.' });
  const rows = db.prepare(`SELECT id, captured_at, metrics_json, analysis_json FROM competitor_snapshots WHERE competitor_id = ? AND agency_id = ? ORDER BY datetime(captured_at) DESC, id DESC LIMIT 24`).all(competitor.id, req.user.agency_id);
  res.json({ snapshots: rows.map((row) => ({ id: row.id, captured_at: row.captured_at, metrics: safeJson(row.metrics_json, {}), analysis: safeJson(row.analysis_json, {}) })) });
});

module.exports = router;
