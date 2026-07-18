const db = require('../db/database');
const {
  MetaApiError,
  getAdAccount,
  getDailyInsights,
  getAccountPeriodInsights,
  getCampaignPeriodInsights,
} = require('./metaAds');

function getConnectionByClient(clientId) {
  return db.prepare(`
    SELECT id, client_id, account_id, account_name, currency, timezone_name,
           account_status, last_synced_at, last_sync_status, last_sync_error
    FROM meta_ad_accounts
    WHERE client_id = ?
  `).get(clientId) || null;
}

function setSyncState(connectionId, status, error = null) {
  db.prepare(`
    UPDATE meta_ad_accounts
    SET last_sync_status = ?, last_sync_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, error ? String(error).slice(0, 500) : null, connectionId);
}

async function syncMetaClient(clientId, dateFrom, dateTo) {
  const connection = getConnectionByClient(clientId);
  if (!connection) {
    throw new MetaApiError('Este cliente ainda nao possui uma conta Meta Ads vinculada', { status: 400 });
  }

  setSyncState(connection.id, 'syncing');

  try {
    const [account, daily, periodTotals, campaigns] = await Promise.all([
      getAdAccount(connection.account_id),
      getDailyInsights(connection.account_id, dateFrom, dateTo),
      getAccountPeriodInsights(connection.account_id, dateFrom, dateTo),
      getCampaignPeriodInsights(connection.account_id, dateFrom, dateTo),
    ]);

    const saveSync = db.transaction(() => {
      db.prepare('DELETE FROM meta_daily_metrics WHERE meta_account_id = ? AND metric_date BETWEEN ? AND ?')
        .run(connection.id, dateFrom, dateTo);

      const insertDaily = db.prepare(`
        INSERT INTO meta_daily_metrics (
          meta_account_id, metric_date, reach, impressions, frequency, clicks,
          inline_link_clicks, ctr, cpc, cpm, spend, conversations, leads,
          conversions, results, result_type, cost_per_conversation,
          cost_per_lead, cost_per_result, actions_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (const row of daily) {
        insertDaily.run(
          connection.id, row.date_start, row.reach, row.impressions, row.frequency,
          row.clicks, row.inline_link_clicks, row.ctr, row.cpc, row.cpm, row.spend,
          row.conversations, row.leads, row.conversions, row.results, row.result_type,
          row.cost_per_conversation, row.cost_per_lead, row.cost_per_result, row.actions_json
        );
      }

      db.prepare(`
        INSERT INTO meta_report_snapshots (
          meta_account_id, date_from, date_to, reach, impressions, frequency, clicks,
          inline_link_clicks, ctr, cpc, cpm, spend, conversations, leads,
          conversions, results, result_type, cost_per_conversation,
          cost_per_lead, cost_per_result, actions_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(meta_account_id, date_from, date_to) DO UPDATE SET
          reach = excluded.reach,
          impressions = excluded.impressions,
          frequency = excluded.frequency,
          clicks = excluded.clicks,
          inline_link_clicks = excluded.inline_link_clicks,
          ctr = excluded.ctr,
          cpc = excluded.cpc,
          cpm = excluded.cpm,
          spend = excluded.spend,
          conversations = excluded.conversations,
          leads = excluded.leads,
          conversions = excluded.conversions,
          results = excluded.results,
          result_type = excluded.result_type,
          cost_per_conversation = excluded.cost_per_conversation,
          cost_per_lead = excluded.cost_per_lead,
          cost_per_result = excluded.cost_per_result,
          actions_json = excluded.actions_json,
          synced_at = datetime('now')
      `).run(
        connection.id, dateFrom, dateTo, periodTotals.reach, periodTotals.impressions,
        periodTotals.frequency, periodTotals.clicks, periodTotals.inline_link_clicks,
        periodTotals.ctr, periodTotals.cpc, periodTotals.cpm, periodTotals.spend,
        periodTotals.conversations, periodTotals.leads, periodTotals.conversions,
        periodTotals.results, periodTotals.result_type, periodTotals.cost_per_conversation,
        periodTotals.cost_per_lead, periodTotals.cost_per_result, periodTotals.actions_json
      );

      db.prepare('DELETE FROM meta_campaign_snapshots WHERE meta_account_id = ? AND date_from = ? AND date_to = ?')
        .run(connection.id, dateFrom, dateTo);
      const insertCampaign = db.prepare(`
        INSERT INTO meta_campaign_snapshots (
          meta_account_id, date_from, date_to, campaign_id, campaign_name,
          reach, impressions, frequency, clicks, inline_link_clicks, ctr, cpc,
          cpm, spend, conversations, leads, conversions, results, result_type,
          cost_per_conversation, cost_per_lead, cost_per_result, actions_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (const row of campaigns) {
        insertCampaign.run(
          connection.id, dateFrom, dateTo, row.campaign_id, row.campaign_name,
          row.reach, row.impressions, row.frequency, row.clicks, row.inline_link_clicks,
          row.ctr, row.cpc, row.cpm, row.spend, row.conversations, row.leads,
          row.conversions, row.results, row.result_type, row.cost_per_conversation,
          row.cost_per_lead, row.cost_per_result, row.actions_json
        );
      }

      db.prepare(`
        UPDATE meta_ad_accounts
        SET account_name = ?, currency = ?, timezone_name = ?, account_status = ?,
            last_synced_at = datetime('now'), last_sync_status = 'success',
            last_sync_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        account.name,
        account.currency,
        account.timezone_name,
        account.account_status,
        connection.id
      );
    });

    saveSync();
    return {
      client_id: Number(clientId),
      account_id: String(connection.account_id),
      daily_rows: daily.length,
      campaigns: campaigns.length,
      date_from: dateFrom,
      date_to: dateTo,
    };
  } catch (error) {
    const message = error instanceof MetaApiError ? error.message : 'Falha inesperada na sincronizacao';
    setSyncState(connection.id, 'error', message);
    throw error;
  }
}

function localIsoDate(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  return {
    from: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
    to: localIsoDate(now),
  };
}

async function syncAllConnectedAccounts(range = currentMonthRange()) {
  const connections = db.prepare('SELECT client_id FROM meta_ad_accounts ORDER BY client_id').all();
  const result = { total: connections.length, success: 0, failed: 0, details: [] };

  for (const row of connections) {
    try {
      const detail = await syncMetaClient(row.client_id, range.from, range.to);
      result.success += 1;
      result.details.push({ ...detail, ok: true });
    } catch (error) {
      result.failed += 1;
      result.details.push({
        client_id: Number(row.client_id),
        ok: false,
        error: error instanceof MetaApiError ? error.message : 'Falha inesperada',
      });
    }
  }

  return result;
}

module.exports = {
  getConnectionByClient,
  syncMetaClient,
  syncAllConnectedAccounts,
  currentMonthRange,
};
