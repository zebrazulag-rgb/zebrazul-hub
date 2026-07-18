const crypto = require('crypto');

const DEFAULT_API_VERSION = 'v25.0';
const REQUEST_TIMEOUT_MS = Number(process.env.META_REQUEST_TIMEOUT_MS || 30000);
const CONTENT_LIMIT = Math.max(5, Math.min(Number(process.env.META_ORGANIC_CONTENT_LIMIT || 50), 100));

class MetaOrganicApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MetaOrganicApiError';
    this.status = details.status || 502;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function getOrganicConfig() {
  return {
    accessToken: String(process.env.META_ORGANIC_ACCESS_TOKEN || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
    apiVersion: String(process.env.META_API_VERSION || DEFAULT_API_VERSION).trim(),
    businessId: String(process.env.META_BUSINESS_ID || '').trim(),
  };
}

function getOrganicStatus() {
  const config = getOrganicConfig();
  return {
    configured: Boolean(config.accessToken),
    api_version: config.apiVersion,
    business_id_configured: Boolean(config.businessId),
  };
}

function buildAppSecretProof(accessToken, appSecret) {
  if (!appSecret) return null;
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

async function requestUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new MetaOrganicApiError('A Meta retornou uma resposta invalida', { status: 502 });
    }

    if (!response.ok || payload.error) {
      const apiError = payload.error || {};
      throw new MetaOrganicApiError(apiError.message || 'Falha ao consultar a API organica da Meta', {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
        metaCode: apiError.code,
        metaSubcode: apiError.error_subcode,
        traceId: apiError.fbtrace_id,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof MetaOrganicApiError) throw error;
    if (error.name === 'AbortError') {
      throw new MetaOrganicApiError('A consulta organica a Meta excedeu o tempo limite', { status: 504 });
    }
    throw new MetaOrganicApiError('Nao foi possivel conectar a API organica da Meta', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function organicGraphRequest(pathOrUrl, params = {}) {
  const config = getOrganicConfig();
  if (!config.accessToken) {
    throw new MetaOrganicApiError('META_ORGANIC_ACCESS_TOKEN nao esta configurado no servidor', { status: 503 });
  }

  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = new URL(
    isAbsolute
      ? pathOrUrl
      : `https://graph.facebook.com/${config.apiVersion}/${String(pathOrUrl).replace(/^\//, '')}`
  );

  if (!isAbsolute) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }

  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', config.accessToken);
  const proof = buildAppSecretProof(config.accessToken, config.appSecret);
  if (proof && !url.searchParams.has('appsecret_proof')) url.searchParams.set('appsecret_proof', proof);
  return requestUrl(url);
}

async function organicGraphCollection(path, params = {}) {
  const rows = [];
  let payload = await organicGraphRequest(path, params);
  while (payload) {
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    const next = payload.paging?.next;
    if (!next) break;
    payload = await organicGraphRequest(next);
  }
  return rows;
}

async function safeRequest(path, params = {}) {
  try {
    return await organicGraphRequest(path, params);
  } catch (error) {
    return { __error: error };
  }
}

async function safeCollection(path, params = {}) {
  try {
    return await organicGraphCollection(path, params);
  } catch {
    return [];
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pictureUrl(value) {
  return value?.data?.url || value?.url || null;
}

function normalizeInstagramAccount(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    username: row.username || null,
    name: row.name || row.username || null,
    profile_picture_url: row.profile_picture_url || null,
    followers_count: toNumber(row.followers_count),
    media_count: toNumber(row.media_count),
  };
}

async function enrichPage(page) {
  if (!page?.id) return null;
  const details = await safeRequest(String(page.id), {
    fields: 'id,name,username,fan_count,followers_count,picture.type(large){url},instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}',
  });
  const source = details.__error ? page : details;
  return {
    asset_key: `page:${source.id}`,
    page_id: String(source.id),
    page_name: source.name || `Pagina ${source.id}`,
    page_username: source.username || null,
    page_picture_url: pictureUrl(source.picture),
    page_followers: toNumber(source.followers_count || source.fan_count),
    instagram: normalizeInstagramAccount(source.instagram_business_account),
    source: 'page',
  };
}

async function listAssignedPages() {
  const config = getOrganicConfig();
  const me = await organicGraphRequest('me', { fields: 'id,name' });
  const fields = 'id,name,username,fan_count,followers_count,picture.type(large){url},instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}';
  let pages = [];

  if (me?.id) {
    pages = await safeCollection(`${me.id}/assigned_pages`, { fields, limit: 200 });
  }
  if (!pages.length) pages = await safeCollection('me/accounts', { fields, limit: 200 });

  if (config.businessId) {
    const [owned, client] = await Promise.all([
      safeCollection(`${config.businessId}/owned_pages`, { fields, limit: 200 }),
      safeCollection(`${config.businessId}/client_pages`, { fields, limit: 200 }),
    ]);
    pages.push(...owned, ...client);
  }

  const unique = new Map();
  for (const page of pages) {
    if (page?.id) unique.set(String(page.id), page);
  }
  return { me, pages: [...unique.values()] };
}

async function listDirectInstagramAccounts(systemUserId) {
  if (!systemUserId) return [];
  const fields = 'id,username,name,profile_picture_url,followers_count,media_count';
  const rows = await safeCollection(`${systemUserId}/assigned_instagram_accounts`, { fields, limit: 200 });
  return rows.map(normalizeInstagramAccount).filter(Boolean);
}

async function listOrganicAssets() {
  const { me, pages } = await listAssignedPages();
  const enrichedPages = (await Promise.all(pages.map(enrichPage))).filter(Boolean);
  const linkedInstagramIds = new Set(enrichedPages.map((item) => item.instagram?.id).filter(Boolean));
  const directInstagram = await listDirectInstagramAccounts(me?.id);
  const standalone = directInstagram
    .filter((account) => !linkedInstagramIds.has(account.id))
    .map((account) => ({
      asset_key: `instagram:${account.id}`,
      page_id: null,
      page_name: null,
      page_username: null,
      page_picture_url: null,
      page_followers: 0,
      instagram: account,
      source: 'instagram',
    }));

  return [...enrichedPages, ...standalone].sort((a, b) => {
    const aName = a.page_name || a.instagram?.username || '';
    const bName = b.page_name || b.instagram?.username || '';
    return aName.localeCompare(bName, 'pt-BR');
  });
}

async function getOrganicAsset(assetKey) {
  const assets = await listOrganicAssets();
  const asset = assets.find((item) => item.asset_key === String(assetKey));
  if (!asset) throw new MetaOrganicApiError('Ativo organico nao encontrado ou sem permissao', { status: 404 });
  return asset;
}

function insightValue(item, mode = 'sum') {
  if (!item) return 0;
  if (item.total_value !== undefined) {
    if (typeof item.total_value === 'number' || typeof item.total_value === 'string') return toNumber(item.total_value);
    if (item.total_value?.value !== undefined) return toNumber(item.total_value.value);
  }
  if (item.value !== undefined && typeof item.value !== 'object') return toNumber(item.value);
  if (Array.isArray(item.values) && item.values.length) {
    if (mode === 'last') return toNumber(item.values[item.values.length - 1]?.value);
    return item.values.reduce((sum, entry) => sum + toNumber(entry?.value), 0);
  }
  return 0;
}

function extractBreakdownDelta(item) {
  const breakdowns = item?.total_value?.breakdowns || item?.breakdowns || [];
  let follows = 0;
  let unfollows = 0;
  for (const breakdown of breakdowns) {
    for (const result of breakdown?.results || []) {
      const labels = (result.dimension_values || []).map((value) => String(value).toUpperCase());
      const value = toNumber(result.value);
      if (labels.some((label) => label.includes('UNFOLLOW'))) unfollows += value;
      else if (labels.some((label) => label.includes('FOLLOW'))) follows += value;
    }
  }
  return follows - unfollows;
}

function normalizeInsightSeries(item) {
  const values = Array.isArray(item?.values) ? item.values : [];
  return values.map((entry) => ({
    date: String(entry.end_time || entry.date || '').slice(0, 10),
    value: toNumber(entry.value),
  })).filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date));
}

async function fetchInsightMetric(nodeId, metric, params = {}) {
  const attempts = [
    { metric, period: 'day', metric_type: 'total_value', ...params },
    { metric, period: 'day', ...params },
    { metric, period: 'lifetime', ...params },
  ];
  for (const query of attempts) {
    const payload = await safeRequest(`${nodeId}/insights`, query);
    if (!payload.__error && Array.isArray(payload.data) && payload.data.length) return payload.data[0];
  }
  return null;
}

async function fetchMetrics(nodeId, metrics, params = {}) {
  const pairs = await Promise.all(metrics.map(async (metric) => [metric, await fetchInsightMetric(nodeId, metric, params)]));
  return Object.fromEntries(pairs);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

async function getFacebookOverview(pageId, dateFrom, dateTo) {
  if (!pageId) return null;
  const page = await organicGraphRequest(pageId, {
    fields: 'id,name,username,fan_count,followers_count,picture.type(large){url}',
  });
  const metrics = await fetchMetrics(pageId, [
    'page_impressions_unique',
    'page_impressions',
    'page_post_engagements',
    'page_fans',
    'page_views_total',
  ], { since: dateFrom, until: dateTo });

  const followersSeries = normalizeInsightSeries(metrics.page_fans);
  const followersCurrent = toNumber(page.followers_count || page.fan_count || insightValue(metrics.page_fans, 'last'));
  const followersStart = followersSeries.length ? followersSeries[0].value : followersCurrent;
  const followersEnd = followersSeries.length ? followersSeries[followersSeries.length - 1].value : followersCurrent;

  return {
    profile: {
      id: String(page.id),
      name: page.name || null,
      username: page.username || null,
      picture_url: pictureUrl(page.picture),
    },
    totals: {
      followers: followersCurrent,
      followers_delta: followersEnd - followersStart,
      reach: insightValue(metrics.page_impressions_unique),
      impressions: insightValue(metrics.page_impressions),
      views: insightValue(metrics.page_views_total),
      interactions: insightValue(metrics.page_post_engagements),
      engaged_accounts: 0,
      profile_views: insightValue(metrics.page_views_total),
      website_clicks: 0,
    },
    metric_items: metrics,
  };
}

async function getFacebookContent(pageId, dateFrom, dateTo) {
  if (!pageId) return [];
  const until = `${dateTo}T23:59:59`;
  const posts = await safeCollection(`${pageId}/posts`, {
    fields: 'id,message,created_time,permalink_url,full_picture,shares,comments.limit(0).summary(true),likes.limit(0).summary(true)',
    since: `${dateFrom}T00:00:00`,
    until,
    limit: CONTENT_LIMIT,
  });

  const limited = posts.slice(0, CONTENT_LIMIT);
  return mapWithConcurrency(limited, 4, async (post) => {
    const metrics = await fetchMetrics(post.id, [
      'post_impressions_unique',
      'post_impressions',
      'post_engaged_users',
      'post_clicks',
    ]);
    const likes = toNumber(post.likes?.summary?.total_count);
    const comments = toNumber(post.comments?.summary?.total_count);
    const shares = toNumber(post.shares?.count);
    const interactions = Math.max(insightValue(metrics.post_engaged_users), likes + comments + shares);
    return {
      platform: 'facebook',
      content_id: String(post.id),
      content_type: 'POST',
      caption: post.message || '',
      permalink: post.permalink_url || null,
      thumbnail_url: post.full_picture || null,
      published_at: post.created_time || null,
      reach: insightValue(metrics.post_impressions_unique),
      views: insightValue(metrics.post_impressions),
      impressions: insightValue(metrics.post_impressions),
      interactions,
      likes,
      comments,
      shares,
      saves: 0,
      clicks: insightValue(metrics.post_clicks),
    };
  });
}

async function getInstagramOverview(instagramId, dateFrom, dateTo) {
  if (!instagramId) return null;
  const profile = await organicGraphRequest(instagramId, {
    fields: 'id,username,name,profile_picture_url,followers_count,media_count',
  });
  const metrics = await fetchMetrics(instagramId, [
    'reach',
    'views',
    'accounts_engaged',
    'total_interactions',
    'profile_views',
    'website_clicks',
  ], { since: dateFrom, until: dateTo });
  metrics.follows_and_unfollows = await fetchInsightMetric(instagramId, 'follows_and_unfollows', {
    since: dateFrom,
    until: dateTo,
    breakdown: 'follow_type',
  });

  const followerDelta = extractBreakdownDelta(metrics.follows_and_unfollows);
  return {
    profile: {
      id: String(profile.id),
      name: profile.name || profile.username || null,
      username: profile.username || null,
      picture_url: profile.profile_picture_url || null,
      media_count: toNumber(profile.media_count),
    },
    totals: {
      followers: toNumber(profile.followers_count),
      followers_delta: followerDelta,
      reach: insightValue(metrics.reach),
      views: insightValue(metrics.views),
      impressions: insightValue(metrics.views),
      interactions: insightValue(metrics.total_interactions),
      engaged_accounts: insightValue(metrics.accounts_engaged),
      profile_views: insightValue(metrics.profile_views),
      website_clicks: insightValue(metrics.website_clicks),
    },
    metric_items: metrics,
  };
}

async function getInstagramContent(instagramId, dateFrom, dateTo) {
  if (!instagramId) return [];
  const media = await safeCollection(`${instagramId}/media`, {
    fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
    since: `${dateFrom}T00:00:00`,
    until: `${dateTo}T23:59:59`,
    limit: CONTENT_LIMIT,
  });

  const limited = media.slice(0, CONTENT_LIMIT);
  return mapWithConcurrency(limited, 4, async (item) => {
    const metrics = await fetchMetrics(item.id, [
      'views',
      'reach',
      'total_interactions',
      'likes',
      'comments',
      'saved',
      'shares',
    ]);
    const likes = Math.max(toNumber(item.like_count), insightValue(metrics.likes));
    const comments = Math.max(toNumber(item.comments_count), insightValue(metrics.comments));
    const shares = insightValue(metrics.shares);
    const saves = insightValue(metrics.saved);
    const interactions = Math.max(insightValue(metrics.total_interactions), likes + comments + shares + saves);
    const views = insightValue(metrics.views);
    return {
      platform: 'instagram',
      content_id: String(item.id),
      content_type: item.media_product_type || item.media_type || 'MEDIA',
      caption: item.caption || '',
      permalink: item.permalink || null,
      thumbnail_url: item.thumbnail_url || item.media_url || null,
      published_at: item.timestamp || null,
      reach: insightValue(metrics.reach),
      views,
      impressions: views,
      interactions,
      likes,
      comments,
      shares,
      saves,
      clicks: 0,
    };
  });
}

function metricSeriesToMap(metricItems, mapping) {
  const daily = new Map();
  for (const [metricName, field] of Object.entries(mapping)) {
    const series = normalizeInsightSeries(metricItems?.[metricName]);
    for (const point of series) {
      if (!daily.has(point.date)) daily.set(point.date, {});
      daily.get(point.date)[field] = point.value;
    }
  }
  return daily;
}

function mergeContentIntoDaily(dailyMap, contentRows) {
  for (const row of contentRows || []) {
    const date = String(row.published_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!dailyMap.has(date)) dailyMap.set(date, {});
    const day = dailyMap.get(date);
    day.posts_published = toNumber(day.posts_published) + 1;
    day.content_reach = toNumber(day.content_reach) + toNumber(row.reach);
    day.content_views = toNumber(day.content_views) + toNumber(row.views);
    day.content_interactions = toNumber(day.content_interactions) + toNumber(row.interactions);
  }
  return dailyMap;
}

function buildDailyRows(platform, overview, contentRows) {
  const mapping = platform === 'instagram'
    ? {
      reach: 'reach',
      views: 'views',
      accounts_engaged: 'engaged_accounts',
      total_interactions: 'interactions',
      profile_views: 'profile_views',
      website_clicks: 'website_clicks',
    }
    : {
      page_impressions_unique: 'reach',
      page_impressions: 'impressions',
      page_post_engagements: 'interactions',
      page_fans: 'followers',
      page_views_total: 'profile_views',
    };
  const daily = metricSeriesToMap(overview?.metric_items, mapping);
  mergeContentIntoDaily(daily, contentRows);
  return [...daily.entries()].map(([metric_date, values]) => ({
    platform,
    metric_date,
    reach: toNumber(values.reach || values.content_reach),
    views: toNumber(values.views || values.impressions || values.content_views),
    impressions: toNumber(values.impressions || values.views || values.content_views),
    interactions: toNumber(values.interactions || values.content_interactions),
    engaged_accounts: toNumber(values.engaged_accounts),
    followers: toNumber(values.followers),
    followers_delta: 0,
    profile_views: toNumber(values.profile_views),
    website_clicks: toNumber(values.website_clicks),
    posts_published: toNumber(values.posts_published),
  })).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

module.exports = {
  MetaOrganicApiError,
  getOrganicStatus,
  listOrganicAssets,
  getOrganicAsset,
  getFacebookOverview,
  getFacebookContent,
  getInstagramOverview,
  getInstagramContent,
  buildDailyRows,
  toNumber,
};
