const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const { FeedCoverIntelligenceError, analyzeCoverImage, isVideoType } = require('../services/feedCoverIntelligence');

const router = express.Router();
router.use(authRequired);

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
    return false;
  }
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(Number(clientId), req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return false;
  }
  return true;
}

function parseGallery(value, fallback = null) {
  let source = value;
  for (let attempt = 0; attempt < 3 && typeof source === 'string'; attempt += 1) {
    try { source = JSON.parse(source); } catch { break; }
  }
  if (source && !Array.isArray(source) && typeof source === 'object') {
    source = source.media_gallery || source.gallery || source.images || source.items || [];
  }
  const gallery = Array.isArray(source) ? source : [];
  for (const item of gallery) {
    const data = typeof item === 'string' ? item : (item?.data || item?.url || item?.src || item?.media_data);
    if (data) return data;
  }
  return fallback || null;
}

function analysisKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

function normalizedAnalysis(row) {
  if (!row) return null;
  let signals = [];
  try { signals = JSON.parse(row.visual_signals || '[]'); } catch {}
  return {
    ...row,
    confidence: Number(row.confidence || 0),
    cover_score: Number(row.cover_score || 0),
    visual_signals: Array.isArray(signals) ? signals : [],
  };
}

function getCachedAnalysis(agencyId, clientId, sourceType, sourceId) {
  return normalizedAnalysis(db.prepare(`
    SELECT * FROM feed_cover_analyses
    WHERE agency_id = ? AND client_id = ? AND source_type = ? AND source_id = ?
  `).get(agencyId, clientId, sourceType, String(sourceId)));
}

function getPlannedSource(agencyId, clientId, sourceId) {
  const row = db.prepare(`
    SELECT id, client_id, title, caption, content_type, media_data, media_gallery, updated_at
    FROM posts WHERE id = ? AND client_id = ? AND agency_id = ?
  `).get(Number(sourceId), clientId, agencyId);
  if (!row) return null;
  return {
    source_type: 'planned',
    source_id: String(row.id),
    content_type: row.content_type || '',
    title: row.title || '',
    caption: row.caption || '',
    image_ref: parseGallery(row.media_gallery, row.media_data),
    source_updated_at: row.updated_at || null,
  };
}

function getInstagramSource(agencyId, clientId, sourceId) {
  const row = db.prepare(`
    SELECT s.content_id, s.content_type, s.caption, s.thumbnail_url, s.published_at, s.synced_at
    FROM meta_organic_content_snapshots s
    JOIN meta_organic_accounts a ON a.id = s.organic_account_id
    WHERE a.agency_id = ? AND a.client_id = ? AND s.platform = 'instagram' AND s.content_id = ?
    ORDER BY s.id DESC LIMIT 1
  `).get(agencyId, clientId, String(sourceId));
  if (!row) return null;
  return {
    source_type: 'instagram',
    source_id: String(row.content_id),
    content_type: row.content_type || '',
    title: '',
    caption: row.caption || '',
    image_ref: row.thumbnail_url || null,
    source_updated_at: row.synced_at || row.published_at || null,
  };
}

function saveAnalysis({ agencyId, clientId, source, result }) {
  db.prepare(`
    INSERT INTO feed_cover_analyses (
      agency_id, client_id, source_type, source_id, image_ref, content_type,
      status, confidence, cover_score, summary, visual_signals, analysis_source,
      model, source_updated_at, analyzed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(agency_id, client_id, source_type, source_id) DO UPDATE SET
      image_ref = excluded.image_ref,
      content_type = excluded.content_type,
      status = excluded.status,
      confidence = excluded.confidence,
      cover_score = excluded.cover_score,
      summary = excluded.summary,
      visual_signals = excluded.visual_signals,
      analysis_source = excluded.analysis_source,
      model = excluded.model,
      source_updated_at = excluded.source_updated_at,
      analyzed_at = datetime('now'),
      updated_at = datetime('now')
  `).run(
    agencyId, clientId, source.source_type, source.source_id, source.image_ref,
    source.content_type, result.status, result.confidence, result.cover_score,
    result.summary || '', JSON.stringify(result.visual_signals || []), result.source || 'rule',
    result.model || null, source.source_updated_at || null,
  );
  return getCachedAnalysis(agencyId, clientId, source.source_type, source.source_id);
}

async function analyzeSource({ agencyId, clientId, sourceType, sourceId, force = false }) {
  const source = sourceType === 'instagram'
    ? getInstagramSource(agencyId, clientId, sourceId)
    : getPlannedSource(agencyId, clientId, sourceId);
  if (!source) throw new FeedCoverIntelligenceError('Conteúdo não encontrado para análise.', 404, 'source_not_found');

  const cached = getCachedAnalysis(agencyId, clientId, sourceType, sourceId);
  if (!force && cached && cached.image_ref === source.image_ref && cached.content_type === source.content_type && cached.status !== 'error') {
    return cached;
  }

  try {
    const result = await analyzeCoverImage(source);
    return saveAnalysis({ agencyId, clientId, source, result });
  } catch (error) {
    const result = {
      status: 'error', confidence: 0, cover_score: 0,
      summary: error.message || 'Não foi possível analisar esta capa.',
      visual_signals: [], source: 'error', model: null,
    };
    saveAnalysis({ agencyId, clientId, source, result });
    throw error;
  }
}

router.get('/client/:clientId/published', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  const limit = Math.max(3, Math.min(60, Number(req.query.limit || 30)));
  const connection = db.prepare(`
    SELECT id, instagram_username, instagram_name, instagram_picture_url, last_synced_at, last_sync_status, last_sync_error
    FROM meta_organic_accounts WHERE agency_id = ? AND client_id = ?
  `).get(req.user.agency_id, clientId);

  if (!connection) return res.json({ connected: false, items: [], connection: null });

  const items = db.prepare(`
    SELECT s.content_id, s.content_type, s.caption, s.permalink, s.thumbnail_url,
           s.published_at, s.reach, s.views, s.interactions, s.likes, s.comments,
           s.shares, s.saves, s.synced_at
    FROM meta_organic_content_snapshots s
    JOIN (
      SELECT organic_account_id, content_id, MAX(id) AS max_id
      FROM meta_organic_content_snapshots
      WHERE platform = 'instagram'
      GROUP BY organic_account_id, content_id
    ) latest ON latest.max_id = s.id
    WHERE s.organic_account_id = ? AND s.platform = 'instagram'
    ORDER BY datetime(s.published_at) DESC, s.id DESC
    LIMIT ?
  `).all(connection.id, limit);

  res.json({ connected: Boolean(connection.instagram_username || items.length), connection, items });
});

router.get('/client/:clientId/covers', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  const rows = db.prepare(`
    SELECT * FROM feed_cover_analyses
    WHERE agency_id = ? AND client_id = ?
    ORDER BY analyzed_at DESC
  `).all(req.user.agency_id, clientId).map(normalizedAnalysis);
  const analyses = Object.fromEntries(rows.map((row) => [analysisKey(row.source_type, row.source_id), row]));
  res.json({ analyses, count: rows.length });
});

router.post('/client/:clientId/analyze-covers', requireRole('admin', 'team'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  const plannedIds = [...new Set((req.body?.planned_ids || []).map(Number).filter(Number.isFinite))].slice(0, 24);
  const instagramIds = [...new Set((req.body?.instagram_ids || []).map(String).filter(Boolean))].slice(0, 24);
  const force = Boolean(req.body?.force);
  const queue = [
    ...plannedIds.map((id) => ({ sourceType: 'planned', sourceId: id })),
    ...instagramIds.map((id) => ({ sourceType: 'instagram', sourceId: id })),
  ].slice(0, 30);

  const results = [];
  for (const item of queue) {
    try {
      const analysis = await analyzeSource({
        agencyId: req.user.agency_id,
        clientId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        force,
      });
      results.push({ ok: true, key: analysisKey(item.sourceType, item.sourceId), analysis });
    } catch (error) {
      const cached = getCachedAnalysis(req.user.agency_id, clientId, item.sourceType, item.sourceId);
      results.push({ ok: false, key: analysisKey(item.sourceType, item.sourceId), error: error.message || 'Falha na análise.', analysis: cached });
    }
  }

  const analyses = Object.fromEntries(results.filter((item) => item.analysis).map((item) => [item.key, item.analysis]));
  res.json({ ok: true, total: queue.length, success: results.filter((item) => item.ok).length, results, analyses });
});

module.exports = router;
