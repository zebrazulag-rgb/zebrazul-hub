const db = require('../db/database');
const {
  MetaOrganicApiError,
  getFacebookOverview,
  getFacebookContent,
  getInstagramOverview,
  getInstagramContent,
  buildDailyRows,
  toNumber,
} = require('./metaOrganic');

function getOrganicConnectionByClient(clientId) {
  return db.prepare(`
    SELECT id, client_id, asset_key, page_id, page_name, page_username, page_picture_url,
           instagram_account_id, instagram_username, instagram_name, instagram_picture_url,
           last_synced_at, last_sync_status, last_sync_error, created_at, updated_at
    FROM meta_organic_accounts
    WHERE client_id = ?
  `).get(clientId) || null;
}

function setSyncState(connectionId, status, error = null) {
  db.prepare(`
    UPDATE meta_organic_accounts
    SET last_sync_status = ?, last_sync_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, error ? String(error).slice(0, 700) : null, connectionId);
}

function emptyTotals() {
  return {
    followers: 0,
    followers_delta: 0,
    reach: 0,
    views: 0,
    impressions: 0,
    interactions: 0,
    engaged_accounts: 0,
    profile_views: 0,
    website_clicks: 0,
    posts_count: 0,
    engagement_rate: 0,
  };
}

function finalizeTotals(overview, content) {
  const totals = { ...emptyTotals(), ...(overview?.totals || {}) };
  const contentTotals = (content || []).reduce((acc, row) => {
    acc.reach += toNumber(row.reach);
    acc.views += toNumber(row.views);
    acc.impressions += toNumber(row.impressions);
    acc.interactions += toNumber(row.interactions);
    return acc;
  }, { reach: 0, views: 0, impressions: 0, interactions: 0 });

  if (!totals.reach) totals.reach = contentTotals.reach;
  if (!totals.views) totals.views = contentTotals.views;
  if (!totals.impressions) totals.impressions = contentTotals.impressions || totals.views;
  if (!totals.interactions) totals.interactions = contentTotals.interactions;
  totals.posts_count = (content || []).length;
  totals.engagement_rate = totals.reach > 0 ? (totals.interactions / totals.reach) * 100 : 0;
  return totals;
}

function savePlatformSnapshot(connectionId, platform, dateFrom, dateTo, overview, contentRows) {
  if (!overview) return;
  const totals = finalizeTotals(overview, contentRows);
  db.prepare(`
    INSERT INTO meta_organic_report_snapshots (
      organic_account_id, platform, date_from, date_to, followers, followers_delta,
      reach, views, impressions, interactions, engaged_accounts, profile_views,
      website_clicks, posts_count, engagement_rate, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(organic_account_id, platform, date_from, date_to) DO UPDATE SET
      followers = excluded.followers,
      followers_delta = excluded.followers_delta,
      reach = excluded.reach,
      views = excluded.views,
      impressions = excluded.impressions,
      interactions = excluded.interactions,
      engaged_accounts = excluded.engaged_accounts,
      profile_views = excluded.profile_views,
      website_clicks = excluded.website_clicks,
      posts_count = excluded.posts_count,
      engagement_rate = excluded.engagement_rate,
      synced_at = datetime('now')
  `).run(
    connectionId, platform, dateFrom, dateTo, totals.followers, totals.followers_delta,
    totals.reach, totals.views, totals.impressions, totals.interactions,
    totals.engaged_accounts, totals.profile_views, totals.website_clicks,
    totals.posts_count, totals.engagement_rate
  );
}

function saveDaily(connectionId, platform, dateFrom, dateTo, rows) {
  db.prepare(`
    DELETE FROM meta_organic_daily_metrics
    WHERE organic_account_id = ? AND platform = ? AND metric_date BETWEEN ? AND ?
  `).run(connectionId, platform, dateFrom, dateTo);

  const insert = db.prepare(`
    INSERT INTO meta_organic_daily_metrics (
      organic_account_id, platform, metric_date, reach, views, impressions,
      interactions, engaged_accounts, followers, followers_delta, profile_views,
      website_clicks, posts_published, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const row of rows || []) {
    insert.run(
      connectionId, platform, row.metric_date, row.reach, row.views, row.impressions,
      row.interactions, row.engaged_accounts, row.followers, row.followers_delta,
      row.profile_views, row.website_clicks, row.posts_published
    );
  }
}

function saveContent(connectionId, platform, dateFrom, dateTo, rows) {
  db.prepare(`
    DELETE FROM meta_organic_content_snapshots
    WHERE organic_account_id = ? AND platform = ? AND date_from = ? AND date_to = ?
  `).run(connectionId, platform, dateFrom, dateTo);

  const insert = db.prepare(`
    INSERT INTO meta_organic_content_snapshots (
      organic_account_id, platform, date_from, date_to, content_id, content_type,
      caption, permalink, thumbnail_url, published_at, reach, views, impressions,
      interactions, likes, comments, shares, saves, clicks, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const row of rows || []) {
    insert.run(
      connectionId, platform, dateFrom, dateTo, row.content_id, row.content_type,
      row.caption, row.permalink, row.thumbnail_url, row.published_at, row.reach,
      row.views, row.impressions, row.interactions, row.likes, row.comments,
      row.shares, row.saves, row.clicks
    );
  }
}

async function syncMetaOrganicClient(clientId, dateFrom, dateTo) {
  const connection = getOrganicConnectionByClient(clientId);
  if (!connection) {
    throw new MetaOrganicApiError('Este cliente ainda nao possui Facebook ou Instagram organico vinculado', { status: 400 });
  }
  setSyncState(connection.id, 'syncing');

  try {
    const facebookPromise = connection.page_id
      ? Promise.all([
        getFacebookOverview(connection.page_id, dateFrom, dateTo),
        getFacebookContent(connection.page_id, dateFrom, dateTo),
      ])
      : Promise.resolve([null, []]);
    const instagramPromise = connection.instagram_account_id
      ? Promise.all([
        getInstagramOverview(connection.instagram_account_id, dateFrom, dateTo),
        getInstagramContent(connection.instagram_account_id, dateFrom, dateTo),
      ])
      : Promise.resolve([null, []]);

    const [[facebookOverview, facebookContent], [instagramOverview, instagramContent]] = await Promise.all([
      facebookPromise,
      instagramPromise,
    ]);

    const facebookDaily = buildDailyRows('facebook', facebookOverview, facebookContent);
    const instagramDaily = buildDailyRows('instagram', instagramOverview, instagramContent);

    const saveSync = db.transaction(() => {
      if (facebookOverview) {
        savePlatformSnapshot(connection.id, 'facebook', dateFrom, dateTo, facebookOverview, facebookContent);
        saveDaily(connection.id, 'facebook', dateFrom, dateTo, facebookDaily);
        saveContent(connection.id, 'facebook', dateFrom, dateTo, facebookContent);
      }
      if (instagramOverview) {
        savePlatformSnapshot(connection.id, 'instagram', dateFrom, dateTo, instagramOverview, instagramContent);
        saveDaily(connection.id, 'instagram', dateFrom, dateTo, instagramDaily);
        saveContent(connection.id, 'instagram', dateFrom, dateTo, instagramContent);
      }

      db.prepare(`
        UPDATE meta_organic_accounts
        SET page_name = COALESCE(?, page_name),
            page_username = COALESCE(?, page_username),
            page_picture_url = COALESCE(?, page_picture_url),
            instagram_username = COALESCE(?, instagram_username),
            instagram_name = COALESCE(?, instagram_name),
            instagram_picture_url = COALESCE(?, instagram_picture_url),
            last_synced_at = datetime('now'), last_sync_status = 'success',
            last_sync_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        facebookOverview?.profile?.name || null,
        facebookOverview?.profile?.username || null,
        facebookOverview?.profile?.picture_url || null,
        instagramOverview?.profile?.username || null,
        instagramOverview?.profile?.name || null,
        instagramOverview?.profile?.picture_url || null,
        connection.id
      );
    });
    saveSync();

    return {
      client_id: Number(clientId),
      facebook_content: facebookContent.length,
      instagram_content: instagramContent.length,
      facebook_daily: facebookDaily.length,
      instagram_daily: instagramDaily.length,
      date_from: dateFrom,
      date_to: dateTo,
    };
  } catch (error) {
    const message = error instanceof MetaOrganicApiError ? error.message : 'Falha inesperada na sincronizacao organica';
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

async function syncAllOrganicAccounts(range = currentMonthRange()) {
  const connections = db.prepare('SELECT client_id FROM meta_organic_accounts ORDER BY client_id').all();
  const result = { total: connections.length, success: 0, failed: 0, details: [] };
  for (const row of connections) {
    try {
      const detail = await syncMetaOrganicClient(row.client_id, range.from, range.to);
      result.success += 1;
      result.details.push({ ...detail, ok: true });
    } catch (error) {
      result.failed += 1;
      result.details.push({
        client_id: Number(row.client_id),
        ok: false,
        error: error instanceof MetaOrganicApiError ? error.message : 'Falha inesperada',
      });
    }
  }
  return result;
}

module.exports = {
  getOrganicConnectionByClient,
  syncMetaOrganicClient,
  syncAllOrganicAccounts,
  currentMonthRange,
  emptyTotals,
};
