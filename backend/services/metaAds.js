const crypto = require('crypto');

const DEFAULT_API_VERSION = 'v25.0';
const REQUEST_TIMEOUT_MS = Number(process.env.META_REQUEST_TIMEOUT_MS || 30000);

class MetaApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.status = details.status || 502;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function getMetaConfig() {
  return {
    accessToken: String(process.env.META_ACCESS_TOKEN || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
    apiVersion: String(process.env.META_API_VERSION || DEFAULT_API_VERSION).trim(),
  };
}

function getMetaStatus() {
  const config = getMetaConfig();
  return {
    configured: Boolean(config.accessToken),
    api_version: config.apiVersion,
  };
}

function normalizeAccountId(value) {
  return String(value || '').trim().replace(/^act_/, '');
}

function accountNode(accountId) {
  const normalized = normalizeAccountId(accountId);
  if (!/^\d+$/.test(normalized)) {
    throw new MetaApiError('Identificador da conta de anuncios invalido', { status: 400 });
  }
  return `act_${normalized}`;
}

function buildAppSecretProof(accessToken, appSecret) {
  if (!appSecret) return null;
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

async function requestUrl(url, config) {
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
      throw new MetaApiError('A Meta retornou uma resposta invalida', { status: 502 });
    }

    if (!response.ok || payload.error) {
      const apiError = payload.error || {};
      throw new MetaApiError(apiError.message || 'Falha ao consultar a API da Meta', {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
        metaCode: apiError.code,
        metaSubcode: apiError.error_subcode,
        traceId: apiError.fbtrace_id,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof MetaApiError) throw error;
    if (error.name === 'AbortError') {
      throw new MetaApiError('A consulta a Meta excedeu o tempo limite', { status: 504 });
    }
    throw new MetaApiError('Nao foi possivel conectar a API da Meta', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function graphRequest(pathOrUrl, params = {}) {
  const config = getMetaConfig();
  if (!config.accessToken) {
    throw new MetaApiError('META_ACCESS_TOKEN nao esta configurado no servidor', { status: 503 });
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

  if (!url.searchParams.has('access_token')) {
    url.searchParams.set('access_token', config.accessToken);
  }
  const proof = buildAppSecretProof(config.accessToken, config.appSecret);
  if (proof && !url.searchParams.has('appsecret_proof')) {
    url.searchParams.set('appsecret_proof', proof);
  }

  return requestUrl(url, config);
}

async function graphCollection(path, params = {}) {
  const rows = [];
  let payload = await graphRequest(path, params);

  while (payload) {
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    const next = payload.paging?.next;
    if (!next) break;
    payload = await graphRequest(next);
  }

  return rows;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionMap(actions) {
  const map = new Map();
  if (!Array.isArray(actions)) return map;
  for (const action of actions) {
    if (!action?.action_type) continue;
    map.set(action.action_type, toNumber(action.value));
  }
  return map;
}

function maximumAction(map, aliases) {
  return aliases.reduce((maximum, alias) => Math.max(maximum, toNumber(map.get(alias))), 0);
}

const ACTION_ALIASES = {
  conversations: [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
  ],
  leads: [
    'lead',
    'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead',
    'leadgen_grouped',
    'onsite_web_lead',
  ],
  purchases: [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
  ],
  registrations: [
    'complete_registration',
    'offsite_conversion.fb_pixel_complete_registration',
  ],
  contacts: [
    'contact_total',
    'contact',
    'schedule_total',
    'schedule',
    'submit_application_total',
    'submit_application',
  ],
};

function deriveOutcomeMetrics(row) {
  const map = actionMap(row.actions);
  const conversations = maximumAction(map, ACTION_ALIASES.conversations);
  const leads = maximumAction(map, ACTION_ALIASES.leads);
  const purchases = maximumAction(map, ACTION_ALIASES.purchases);
  const registrations = maximumAction(map, ACTION_ALIASES.registrations);
  const contacts = maximumAction(map, ACTION_ALIASES.contacts);
  const conversions = Math.max(purchases, registrations, contacts);

  let results = 0;
  let resultType = null;
  const candidates = [
    ['Conversas iniciadas', conversations],
    ['Leads', leads],
    ['Conversoes', conversions],
  ];
  for (const [label, value] of candidates) {
    if (value > results) {
      results = value;
      resultType = label;
    }
  }

  const spend = toNumber(row.spend);
  return {
    conversations,
    leads,
    conversions,
    results,
    result_type: resultType,
    cost_per_conversation: conversations > 0 ? spend / conversations : 0,
    cost_per_lead: leads > 0 ? spend / leads : 0,
    cost_per_result: results > 0 ? spend / results : 0,
  };
}

function normalizeInsightRow(row) {
  const reach = toNumber(row.reach);
  const impressions = toNumber(row.impressions);
  const clicks = toNumber(row.clicks);
  const spend = toNumber(row.spend);
  const outcomes = deriveOutcomeMetrics(row);

  return {
    date_start: row.date_start || null,
    date_stop: row.date_stop || row.date_start || null,
    reach,
    impressions,
    frequency: toNumber(row.frequency) || (reach > 0 ? impressions / reach : 0),
    clicks,
    inline_link_clicks: toNumber(row.inline_link_clicks),
    ctr: toNumber(row.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0),
    cpc: toNumber(row.cpc) || (clicks > 0 ? spend / clicks : 0),
    cpm: toNumber(row.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0),
    spend,
    ...outcomes,
    actions_json: JSON.stringify(Array.isArray(row.actions) ? row.actions : []),
  };
}

async function listAdAccounts() {
  const accounts = await graphCollection('me/adaccounts', {
    fields: 'id,account_id,name,currency,timezone_name,account_status',
    limit: 200,
  });

  return accounts.map((account) => ({
    account_id: normalizeAccountId(account.account_id || account.id),
    id: account.id || accountNode(account.account_id),
    name: account.name || `Conta ${normalizeAccountId(account.account_id || account.id)}`,
    currency: account.currency || null,
    timezone_name: account.timezone_name || null,
    account_status: account.account_status ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function getAdAccount(accountId) {
  const row = await graphRequest(accountNode(accountId), {
    fields: 'id,account_id,name,currency,timezone_name,account_status',
  });
  return {
    account_id: normalizeAccountId(row.account_id || row.id),
    id: row.id || accountNode(accountId),
    name: row.name || `Conta ${normalizeAccountId(accountId)}`,
    currency: row.currency || null,
    timezone_name: row.timezone_name || null,
    account_status: row.account_status ?? null,
  };
}

const ACCOUNT_INSIGHT_FIELDS = [
  'date_start',
  'date_stop',
  'reach',
  'impressions',
  'frequency',
  'clicks',
  'inline_link_clicks',
  'ctr',
  'cpc',
  'cpm',
  'spend',
  'actions',
].join(',');

async function getDailyInsights(accountId, dateFrom, dateTo) {
  const rows = await graphCollection(`${accountNode(accountId)}/insights`, {
    fields: ACCOUNT_INSIGHT_FIELDS,
    level: 'account',
    time_range: { since: dateFrom, until: dateTo },
    time_increment: 1,
    limit: 5000,
  });
  return rows.map(normalizeInsightRow);
}

async function getAccountPeriodInsights(accountId, dateFrom, dateTo) {
  const rows = await graphCollection(`${accountNode(accountId)}/insights`, {
    fields: ACCOUNT_INSIGHT_FIELDS,
    level: 'account',
    time_range: { since: dateFrom, until: dateTo },
    limit: 50,
  });
  if (!rows.length) {
    return normalizeInsightRow({ date_start: dateFrom, date_stop: dateTo });
  }
  return normalizeInsightRow(rows[0]);
}

async function getCampaignPeriodInsights(accountId, dateFrom, dateTo) {
  const fields = `campaign_id,campaign_name,${ACCOUNT_INSIGHT_FIELDS}`;
  const rows = await graphCollection(`${accountNode(accountId)}/insights`, {
    fields,
    level: 'campaign',
    time_range: { since: dateFrom, until: dateTo },
    limit: 5000,
  });

  return rows.map((row) => ({
    campaign_id: String(row.campaign_id || ''),
    campaign_name: row.campaign_name || 'Campanha sem nome',
    ...normalizeInsightRow(row),
  })).filter((row) => row.campaign_id);
}

module.exports = {
  MetaApiError,
  getMetaStatus,
  normalizeAccountId,
  listAdAccounts,
  getAdAccount,
  getDailyInsights,
  getAccountPeriodInsights,
  getCampaignPeriodInsights,
  normalizeInsightRow,
  deriveOutcomeMetrics,
};
