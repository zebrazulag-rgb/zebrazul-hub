const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const {
  MetaOrganicApiError,
  getOrganicStatus,
  listOrganicAssets,
  getOrganicAsset,
} = require('../services/metaOrganic');
const { syncMetaOrganicClient, emptyTotals } = require('../services/metaOrganicSync');

const router = express.Router();
router.use(authRequired);

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente' });
    return false;
  }
  return true;
}

function getClient(clientId, agencyId) {
  return db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?').get(clientId, agencyId);
}

function getConnection(clientId, agencyId) {
  return db.prepare(`
    SELECT id, client_id, asset_key, page_id, page_name, page_username, page_picture_url,
           instagram_account_id, instagram_username, instagram_name, instagram_picture_url,
           last_synced_at, last_sync_status, last_sync_error, created_at, updated_at
    FROM meta_organic_accounts
    WHERE client_id = ? AND agency_id = ?
  `).get(clientId, agencyId) || null;
}

function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function resolveDateRange(input = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = String(input.from || `${today.slice(0, 8)}01`);
  const to = String(input.to || today);
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new MetaOrganicApiError('Periodo invalido. Use datas no formato AAAA-MM-DD.', { status: 400 });
  }
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (fromTime > toTime) throw new MetaOrganicApiError('A data inicial nao pode ser posterior a data final.', { status: 400 });
  const days = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (days > 366) throw new MetaOrganicApiError('Selecione um periodo de no maximo 366 dias.', { status: 400 });
  return { from, to };
}

function apiErrorResponse(res, error) {
  if (error instanceof MetaOrganicApiError) {
    return res.status(error.status || 502).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[META ORGANIC] Erro nao tratado:', error);
  return res.status(500).json({ error: 'Erro interno ao processar a integracao organica com a Meta' });
}

function getReportPayload(clientId, from, to, agencyId) {
  const connection = getConnection(clientId, agencyId);
  if (!connection) {
    return {
      connection: null,
      period: { from, to },
      facebook: emptyTotals(),
      instagram: emptyTotals(),
      daily: [],
      content: [],
    };
  }

  const snapshots = db.prepare(`
    SELECT platform, followers, followers_delta, reach, views, impressions,
           interactions, engaged_accounts, profile_views, website_clicks,
           posts_count, engagement_rate, synced_at
    FROM meta_organic_report_snapshots
    WHERE organic_account_id = ? AND date_from = ? AND date_to = ?
  `).all(connection.id, from, to);
  const byPlatform = new Map(snapshots.map((row) => [row.platform, row]));

  const daily = db.prepare(`
    SELECT platform, metric_date, reach, views, impressions, interactions,
           engaged_accounts, followers, followers_delta, profile_views,
           website_clicks, posts_published, synced_at
    FROM meta_organic_daily_metrics
    WHERE organic_account_id = ? AND metric_date BETWEEN ? AND ?
    ORDER BY metric_date ASC, platform ASC
  `).all(connection.id, from, to);

  const content = db.prepare(`
    SELECT platform, content_id, content_type, caption, permalink, thumbnail_url,
           published_at, reach, views, impressions, interactions, likes, comments,
           shares, saves, clicks, synced_at
    FROM meta_organic_content_snapshots
    WHERE organic_account_id = ? AND date_from = ? AND date_to = ?
    ORDER BY interactions DESC, reach DESC, published_at DESC
  `).all(connection.id, from, to);

  return {
    connection,
    period: { from, to },
    facebook: byPlatform.get('facebook') || emptyTotals(),
    instagram: byPlatform.get('instagram') || emptyTotals(),
    daily,
    content,
  };
}

router.get('/status', (req, res) => res.json(getOrganicStatus()));

router.get('/assets', requireRole('admin'), async (req, res) => {
  try {
    const assets = await listOrganicAssets();
    const assignments = db.prepare(`
      SELECT m.asset_key, m.client_id, c.name AS client_name
      FROM meta_organic_accounts m
      JOIN clients c ON c.id = m.client_id
      WHERE m.agency_id = ? AND c.agency_id = ?
    `).all(req.user.agency_id, req.user.agency_id);
    const assignmentMap = new Map(assignments.map((row) => [row.asset_key, row]));
    res.json({
      assets: assets.map((asset) => ({ ...asset, assignment: assignmentMap.get(asset.asset_key) || null })),
    });
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.get('/client/:clientId/connection', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });
  res.json({ connection: getConnection(clientId, req.user.agency_id), meta: getOrganicStatus() });
});

router.put('/client/:clientId/connection', requireRole('admin'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });

  try {
    const assetKey = String(req.body.asset_key || '').trim();
    if (!assetKey) return res.status(400).json({ error: 'Selecione uma Pagina ou conta do Instagram' });
    const asset = await getOrganicAsset(assetKey);
    const assigned = db.prepare(`
      SELECT client_id FROM meta_organic_accounts
      WHERE agency_id = ? AND client_id <> ? AND (
        asset_key = ? OR
        (? IS NOT NULL AND page_id = ?) OR
        (? IS NOT NULL AND instagram_account_id = ?)
      )
    `).get(
      req.user.agency_id,
      clientId,
      assetKey,
      asset.page_id,
      asset.page_id,
      asset.instagram?.id || null,
      asset.instagram?.id || null
    );
    if (assigned) return res.status(409).json({ error: 'Esta Pagina ou conta do Instagram ja esta vinculada a outro cliente' });

    const currentConnection = getConnection(clientId, req.user.agency_id);
    const saveConnection = db.transaction(() => {
      if (currentConnection && currentConnection.asset_key !== assetKey) {
        db.prepare('DELETE FROM meta_organic_accounts WHERE id = ? AND agency_id = ?').run(currentConnection.id, req.user.agency_id);
      }

      db.prepare(`
        INSERT INTO meta_organic_accounts (
          agency_id, client_id, asset_key, page_id, page_name, page_username, page_picture_url,
          instagram_account_id, instagram_username, instagram_name, instagram_picture_url,
          last_sync_status, last_sync_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'never', NULL, datetime('now'))
        ON CONFLICT(client_id) DO UPDATE SET
          page_name = excluded.page_name,
          page_username = excluded.page_username,
          page_picture_url = excluded.page_picture_url,
          instagram_username = excluded.instagram_username,
          instagram_name = excluded.instagram_name,
          instagram_picture_url = excluded.instagram_picture_url,
          last_sync_error = NULL,
          updated_at = datetime('now')
      `).run(
        req.user.agency_id,
        clientId,
        asset.asset_key,
        asset.page_id,
        asset.page_name,
        asset.page_username,
        asset.page_picture_url,
        asset.instagram?.id || null,
        asset.instagram?.username || null,
        asset.instagram?.name || null,
        asset.instagram?.profile_picture_url || null
      );
    });
    saveConnection();
    res.json({ connection: getConnection(clientId, req.user.agency_id) });
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.delete('/client/:clientId/connection', requireRole('admin'), (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  db.prepare('DELETE FROM meta_organic_accounts WHERE client_id = ? AND agency_id = ?').run(clientId, req.user.agency_id);
  res.json({ ok: true });
});

router.get('/client/:clientId/report', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });
  try {
    const { from, to } = resolveDateRange(req.query);
    res.json(getReportPayload(clientId, from, to, req.user.agency_id));
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.post('/client/:clientId/sync', requireRole('admin', 'team'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });
  try {
    const { from, to } = resolveDateRange(req.body || {});
    await syncMetaOrganicClient(clientId, from, to);
    res.json(getReportPayload(clientId, from, to, req.user.agency_id));
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

module.exports = router;
