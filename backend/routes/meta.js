const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const {
  MetaApiError,
  getMetaStatus,
  normalizeAccountId,
  listAdAccounts,
  getAdAccount,
} = require('../services/metaAds');
const { syncMetaClient } = require('../services/metaSync');

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
    SELECT id, client_id, account_id, account_name, currency, timezone_name,
           account_status, last_synced_at, last_sync_status, last_sync_error,
           created_at, updated_at
    FROM meta_ad_accounts
    WHERE client_id = ? AND agency_id = ?
  `).get(clientId, agencyId) || null;
}

const configuredAutoSyncMinutes = Number(process.env.META_AUTO_SYNC_MINUTES || 30);
const AUTO_SYNC_MAX_AGE_MINUTES = Number.isFinite(configuredAutoSyncMinutes) && configuredAutoSyncMinutes >= 5
  ? configuredAutoSyncMinutes
  : 30;
const autoSyncLocks = new Map();

function wantsAutoSync(req) {
  return req.user?.role === 'client' && ['1', 'true', 'yes'].includes(String(req.query.auto_sync || '').toLowerCase());
}

function parseDatabaseDate(value) {
  if (!value) return null;
  const normalized = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecent(value, minutes = AUTO_SYNC_MAX_AGE_MINUTES) {
  const timestamp = parseDatabaseDate(value);
  return timestamp !== null && (Date.now() - timestamp) < minutes * 60 * 1000;
}

function getAdsSnapshotSyncedAt(connectionId, from, to) {
  return db.prepare(`
    SELECT synced_at
    FROM meta_report_snapshots
    WHERE meta_account_id = ? AND date_from = ? AND date_to = ?
  `).get(connectionId, from, to)?.synced_at || null;
}

function shouldAutoSyncAds(connection, from, to) {
  if (!connection || connection.last_sync_status === 'syncing') return false;
  if (connection.last_sync_status === 'error' && isRecent(connection.updated_at, 10)) return false;
  const snapshotSyncedAt = getAdsSnapshotSyncedAt(connection.id, from, to);
  if (!snapshotSyncedAt) return true;
  return !isRecent(snapshotSyncedAt);
}

async function autoSyncAdsIfNeeded(req, connection, clientId, from, to) {
  if (!wantsAutoSync(req) || !connection) return { requested: false, refreshed: false };

  const lockKey = `${req.user.agency_id}:${clientId}:${from}:${to}`;
  const existingLock = autoSyncLocks.get(lockKey);
  if (existingLock) {
    try {
      await existingLock;
      return { requested: true, refreshed: true, shared: true };
    } catch (error) {
      return { requested: true, refreshed: false, error: error.message };
    }
  }

  if (!shouldAutoSyncAds(connection, from, to)) {
    return { requested: true, refreshed: false, fresh: true };
  }

  const syncPromise = syncMetaClient(clientId, from, to);
  autoSyncLocks.set(lockKey, syncPromise);
  try {
    await syncPromise;
    return { requested: true, refreshed: true };
  } catch (error) {
    return { requested: true, refreshed: false, error: error.message };
  } finally {
    autoSyncLocks.delete(lockKey);
  }
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

function resolveDateRange(query) {
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFrom = `${defaultTo.slice(0, 8)}01`;
  const from = String(query.from || defaultFrom);
  const to = String(query.to || defaultTo);

  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new MetaApiError('Periodo invalido. Use datas no formato AAAA-MM-DD.', { status: 400 });
  }
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (fromTime > toTime) {
    throw new MetaApiError('A data inicial nao pode ser posterior a data final.', { status: 400 });
  }
  const days = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (days > 366) {
    throw new MetaApiError('Selecione um periodo de no maximo 366 dias.', { status: 400 });
  }
  return { from, to };
}

function apiErrorResponse(res, error) {
  if (error instanceof MetaApiError) {
    return res.status(error.status || 502).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[META] Erro nao tratado:', error);
  return res.status(500).json({ error: 'Erro interno ao processar a integracao com a Meta' });
}

function reportTotalsFromRows(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.reach += Number(row.reach || 0);
    acc.impressions += Number(row.impressions || 0);
    acc.clicks += Number(row.clicks || 0);
    acc.inline_link_clicks += Number(row.inline_link_clicks || 0);
    acc.spend += Number(row.spend || 0);
    acc.conversations += Number(row.conversations || 0);
    acc.leads += Number(row.leads || 0);
    acc.conversions += Number(row.conversions || 0);
    acc.results += Number(row.results || 0);
    return acc;
  }, {
    reach: 0,
    impressions: 0,
    frequency: 0,
    clicks: 0,
    inline_link_clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    spend: 0,
    conversations: 0,
    leads: 0,
    conversions: 0,
    results: 0,
    cost_per_conversation: 0,
    cost_per_lead: 0,
    cost_per_result: 0,
    result_type: null,
  });

  totals.frequency = totals.reach > 0 ? totals.impressions / totals.reach : 0;
  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  totals.cost_per_conversation = totals.conversations > 0 ? totals.spend / totals.conversations : 0;
  totals.cost_per_lead = totals.leads > 0 ? totals.spend / totals.leads : 0;
  totals.cost_per_result = totals.results > 0 ? totals.spend / totals.results : 0;
  return totals;
}

function serializeConnection(connection) {
  if (!connection) return null;
  return {
    ...connection,
    account_id: String(connection.account_id),
  };
}

function getReportPayload(clientId, from, to, agencyId) {
  const connection = getConnection(clientId, agencyId);
  if (!connection) {
    return {
      connection: null,
      period: { from, to },
      totals: reportTotalsFromRows([]),
      totals_source: 'none',
      reach_is_estimated: false,
      daily: [],
      campaigns: [],
    };
  }

  const daily = db.prepare(`
    SELECT metric_date, reach, impressions, frequency, clicks, inline_link_clicks,
           ctr, cpc, cpm, spend, conversations, leads, conversions, results,
           result_type, cost_per_conversation, cost_per_lead, cost_per_result
    FROM meta_daily_metrics
    WHERE meta_account_id = ? AND metric_date BETWEEN ? AND ?
    ORDER BY metric_date ASC
  `).all(connection.id, from, to);

  const snapshot = db.prepare(`
    SELECT reach, impressions, frequency, clicks, inline_link_clicks, ctr, cpc, cpm,
           spend, conversations, leads, conversions, results, result_type,
           cost_per_conversation, cost_per_lead, cost_per_result, synced_at
    FROM meta_report_snapshots
    WHERE meta_account_id = ? AND date_from = ? AND date_to = ?
  `).get(connection.id, from, to);

  const campaigns = db.prepare(`
    SELECT campaign_id, campaign_name, reach, impressions, frequency, clicks,
           inline_link_clicks, ctr, cpc, cpm, spend, conversations, leads,
           conversions, results, result_type, cost_per_conversation,
           cost_per_lead, cost_per_result, synced_at
    FROM meta_campaign_snapshots
    WHERE meta_account_id = ? AND date_from = ? AND date_to = ?
    ORDER BY spend DESC, campaign_name ASC
  `).all(connection.id, from, to);

  return {
    connection: serializeConnection(connection),
    period: { from, to },
    totals: snapshot || reportTotalsFromRows(daily),
    totals_source: snapshot ? 'meta_snapshot' : (daily.length ? 'daily_estimate' : 'none'),
    reach_is_estimated: !snapshot && daily.length > 1,
    daily,
    campaigns,
  };
}

router.get('/status', (req, res) => {
  res.json(getMetaStatus());
});

router.get('/accounts', requireRole('admin'), async (req, res) => {
  try {
    const accounts = await listAdAccounts();
    const assignments = db.prepare(`
      SELECT m.account_id, m.client_id, c.name AS client_name
      FROM meta_ad_accounts m
      JOIN clients c ON c.id = m.client_id
      WHERE m.agency_id = ? AND c.agency_id = ?
    `).all(req.user.agency_id, req.user.agency_id);
    const assignmentByAccount = new Map(assignments.map((row) => [String(row.account_id), row]));
    res.json({
      accounts: accounts.map((account) => ({
        ...account,
        assignment: assignmentByAccount.get(String(account.account_id)) || null,
      })),
    });
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.get('/client/:clientId/connection', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });
  res.json({ connection: serializeConnection(getConnection(clientId, req.user.agency_id)), meta: getMetaStatus() });
});

router.put('/client/:clientId/connection', requireRole('admin'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });

  try {
    const requestedAccountId = normalizeAccountId(req.body.account_id);
    if (!requestedAccountId) {
      return res.status(400).json({ error: 'Selecione uma conta de anuncios' });
    }

    const account = await getAdAccount(requestedAccountId);
    const assigned = db.prepare('SELECT client_id FROM meta_ad_accounts WHERE account_id = ? AND client_id <> ? AND agency_id = ?')
      .get(account.account_id, clientId, req.user.agency_id);
    if (assigned) {
      return res.status(409).json({ error: 'Esta conta de anuncios ja esta vinculada a outro cliente' });
    }

    const currentConnection = getConnection(clientId, req.user.agency_id);
    const saveConnection = db.transaction(() => {
      if (currentConnection && String(currentConnection.account_id) !== String(account.account_id)) {
        db.prepare('DELETE FROM meta_ad_accounts WHERE id = ? AND agency_id = ?').run(currentConnection.id, req.user.agency_id);
      }

      db.prepare(`
        INSERT INTO meta_ad_accounts (
          agency_id, client_id, account_id, account_name, currency, timezone_name, account_status,
          last_sync_status, last_sync_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'never', NULL, datetime('now'))
        ON CONFLICT(client_id) DO UPDATE SET
          account_name = excluded.account_name,
          currency = excluded.currency,
          timezone_name = excluded.timezone_name,
          account_status = excluded.account_status,
          last_sync_error = NULL,
          updated_at = datetime('now')
      `).run(
        req.user.agency_id,
        clientId,
        account.account_id,
        account.name,
        account.currency,
        account.timezone_name,
        account.account_status
      );
    });
    saveConnection();

    res.json({ connection: serializeConnection(getConnection(clientId, req.user.agency_id)) });
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.delete('/client/:clientId/connection', requireRole('admin'), (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  db.prepare('DELETE FROM meta_ad_accounts WHERE client_id = ? AND agency_id = ?').run(clientId, req.user.agency_id);
  res.json({ ok: true });
});

router.get('/client/:clientId/report', async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });

  try {
    const { from, to } = resolveDateRange(req.query);
    const connection = getConnection(clientId, req.user.agency_id);
    const autoSync = await autoSyncAdsIfNeeded(req, connection, clientId, from, to);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      ...getReportPayload(clientId, from, to, req.user.agency_id),
      auto_sync: autoSync,
    });
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

router.post('/client/:clientId/sync', requireRole('admin', 'team'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;
  if (!getClient(clientId, req.user.agency_id)) return res.status(404).json({ error: 'Cliente nao encontrado' });

  let range;
  try {
    range = resolveDateRange(req.body || {});
    await syncMetaClient(clientId, range.from, range.to);
    res.json(getReportPayload(clientId, range.from, range.to, req.user.agency_id));
  } catch (error) {
    apiErrorResponse(res, error);
  }
});

module.exports = router;
