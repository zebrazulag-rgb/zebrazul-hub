const db = require('../db/database');
const { encryptSecret, decryptSecret } = require('./credentialVault');

const API_BASE = 'https://api.brightdata.com/datasets/v3';
const DEFAULT_PROFILE_DATASET_ID = 'gd_l1vikfch901nx3by4';
const DEFAULT_POSTS_DATASET_ID = 'gd_lk5ns7kz21pck8jpis';

class BrightDataError extends Error {
  constructor(message, status = 502, code = 'brightdata_error', details = null) {
    super(message);
    this.name = 'BrightDataError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value, max = 10000) {
  return String(value ?? '').trim().slice(0, max);
}

function envToken() {
  return clean(
    process.env.BRIGHT_DATA_API_TOKEN
      || process.env.BRIGHTDATA_API_KEY
      || process.env.BRIGHT_DATA_API_KEY,
    20000,
  );
}

function getStoredSettings(agencyId) {
  try {
    return db.prepare(`
      SELECT * FROM competitor_provider_settings
      WHERE agency_id = ?
    `).get(Number(agencyId)) || null;
  } catch {
    return null;
  }
}

function resolveBrightDataConfig(agencyId) {
  const row = getStoredSettings(agencyId);
  const envApiToken = envToken();
  let storedApiToken = '';
  if (row?.api_key_encrypted) {
    try { storedApiToken = decryptSecret(row.api_key_encrypted, agencyId); } catch { storedApiToken = ''; }
  }
  const apiToken = storedApiToken || envApiToken;
  return {
    provider: 'brightdata',
    apiToken,
    source: storedApiToken ? 'database' : envApiToken ? 'environment' : null,
    profileDatasetId: clean(row?.profile_dataset_id || process.env.BRIGHT_DATA_INSTAGRAM_PROFILE_DATASET_ID || DEFAULT_PROFILE_DATASET_ID, 120),
    postsDatasetId: clean(row?.posts_dataset_id || process.env.BRIGHT_DATA_INSTAGRAM_POSTS_DATASET_ID || DEFAULT_POSTS_DATASET_ID, 120),
    configuredAt: row?.updated_at || null,
  };
}

function getBrightDataOverview(agencyId) {
  const config = resolveBrightDataConfig(agencyId);
  return {
    configured: Boolean(config.apiToken),
    provider: 'brightdata',
    source: config.source,
    profile_dataset_id: config.profileDatasetId,
    posts_dataset_id: config.postsDatasetId,
    configured_at: config.configuredAt,
  };
}

function saveBrightDataSettings(agencyId, input = {}, configuredBy = null) {
  const current = getStoredSettings(agencyId);
  const apiKey = clean(input.api_key, 20000);
  const profileDatasetId = clean(input.profile_dataset_id || current?.profile_dataset_id || DEFAULT_PROFILE_DATASET_ID, 120) || DEFAULT_PROFILE_DATASET_ID;
  const postsDatasetId = clean(input.posts_dataset_id || current?.posts_dataset_id || DEFAULT_POSTS_DATASET_ID, 120) || DEFAULT_POSTS_DATASET_ID;
  const encrypted = apiKey ? encryptSecret(apiKey, agencyId) : current?.api_key_encrypted || null;

  if (!encrypted && !envToken()) {
    throw new BrightDataError('Cole a API Key da Bright Data para ativar a coleta.', 400, 'brightdata_key_required');
  }

  db.prepare(`
    INSERT INTO competitor_provider_settings (
      agency_id, provider, api_key_encrypted, profile_dataset_id, posts_dataset_id, configured_by, updated_at
    ) VALUES (?, 'brightdata', ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(agency_id) DO UPDATE SET
      provider = 'brightdata',
      api_key_encrypted = COALESCE(excluded.api_key_encrypted, competitor_provider_settings.api_key_encrypted),
      profile_dataset_id = excluded.profile_dataset_id,
      posts_dataset_id = excluded.posts_dataset_id,
      configured_by = COALESCE(excluded.configured_by, competitor_provider_settings.configured_by),
      updated_at = datetime('now')
  `).run(Number(agencyId), encrypted, profileDatasetId, postsDatasetId, configuredBy || null);

  return getBrightDataOverview(agencyId);
}

function clearBrightDataSettings(agencyId) {
  db.prepare('DELETE FROM competitor_provider_settings WHERE agency_id = ?').run(Number(agencyId));
  return getBrightDataOverview(agencyId);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new BrightDataError('A Bright Data demorou mais do que o esperado para responder.', 504, 'brightdata_timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parsePayloadText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  try { return JSON.parse(trimmed); } catch {}
  const rows = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) return [];
  try { return rows.map((line) => JSON.parse(line)); } catch {
    throw new BrightDataError('A Bright Data retornou dados em um formato inesperado.', 502, 'brightdata_invalid_payload');
  }
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (payload && typeof payload === 'object' && !payload.status && !payload.snapshot_id) return [payload];
  return [];
}

function providerErrorMessage(payload, fallback = 'A Bright Data não conseguiu coletar este perfil.') {
  const row = Array.isArray(payload) ? payload.find((item) => item?.error || item?.error_message || item?.message) : payload;
  return clean(row?.error_message || row?.error || row?.message || fallback, 1200) || fallback;
}

function friendlyHttpError(status, payload, fallback) {
  if (status === 401 || status === 403) return 'A API Key da Bright Data é inválida ou não tem acesso a este scraper. Confira a chave em Configurações > Integrações.';
  if (status === 402) return 'A conta Bright Data está sem créditos disponíveis para esta coleta.';
  if (status === 429) return 'A Bright Data limitou temporariamente as coletas. Tente novamente em alguns instantes.';
  return providerErrorMessage(payload, fallback);
}

async function downloadSnapshot(snapshotId, apiToken) {
  const url = `${API_BASE}/snapshot/${encodeURIComponent(snapshotId)}?format=json`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  }, 45000);
  const text = await response.text();
  const payload = parsePayloadText(text);
  if (response.status === 202) return { pending: true, payload };
  if (!response.ok) {
    throw new BrightDataError(friendlyHttpError(response.status, payload), response.status >= 500 ? 502 : response.status, 'brightdata_snapshot_failed', payload);
  }
  if (payload?.status && ['running', 'building', 'starting'].includes(payload.status)) return { pending: true, payload };
  return { pending: false, payload };
}

async function waitForSnapshot(snapshotId, apiToken, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const progressResponse = await fetchWithTimeout(`${API_BASE}/progress/${encodeURIComponent(snapshotId)}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      }, 20000);
      const progressText = await progressResponse.text();
      const progress = parsePayloadText(progressText);
      if (progressResponse.ok && progress?.status === 'failed') {
        throw new BrightDataError(providerErrorMessage(progress, 'A coleta falhou na Bright Data.'), 502, 'brightdata_collection_failed', progress);
      }
      if (progressResponse.ok && progress?.status === 'ready') {
        const result = await downloadSnapshot(snapshotId, apiToken);
        if (!result.pending) return result.payload;
      }
    } catch (error) {
      if (error instanceof BrightDataError && error.code === 'brightdata_collection_failed') throw error;
      // Alguns jobs ficam disponíveis primeiro no endpoint de snapshot. Tentamos logo abaixo.
    }

    try {
      const result = await downloadSnapshot(snapshotId, apiToken);
      if (!result.pending) return result.payload;
    } catch (error) {
      if (error instanceof BrightDataError && [400, 401, 402, 403].includes(Number(error.status))) throw error;
    }
    await sleep(1800);
  }
  throw new BrightDataError('A coleta foi iniciada, mas ainda não terminou. Tente atualizar novamente em alguns instantes.', 504, 'brightdata_snapshot_timeout');
}

async function collectDataset({ apiToken, datasetId, input, timeoutMs = 180000 }) {
  if (!apiToken) throw new BrightDataError('A integração com a Bright Data ainda não foi configurada.', 409, 'brightdata_not_configured');
  if (!datasetId) throw new BrightDataError('O dataset da Bright Data não foi configurado.', 409, 'brightdata_dataset_missing');
  const payload = Array.isArray(input) ? input : [input];
  const params = new URLSearchParams({ dataset_id: datasetId, format: 'json', include_errors: 'true', uncompressed_webhook: 'true' });
  const response = await fetchWithTimeout(`${API_BASE}/trigger?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, 45000);
  const text = await response.text();
  const result = parsePayloadText(text);
  if (!response.ok) {
    throw new BrightDataError(friendlyHttpError(response.status, result), response.status >= 500 ? 502 : response.status, 'brightdata_trigger_failed', result);
  }
  if (Array.isArray(result)) return result;
  if (!result?.snapshot_id) {
    const rows = rowsFromPayload(result);
    if (rows.length) return rows;
    throw new BrightDataError('A Bright Data não devolveu um identificador para acompanhar a coleta.', 502, 'brightdata_snapshot_missing', result);
  }
  const snapshot = await waitForSnapshot(result.snapshot_id, apiToken, timeoutMs);
  const rows = rowsFromPayload(snapshot);
  if (!rows.length && snapshot?.status === 'failed') {
    throw new BrightDataError(providerErrorMessage(snapshot), 502, 'brightdata_collection_failed', snapshot);
  }
  return rows;
}

function firstValue(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function pickImage(row) {
  const direct = firstValue(row, ['thumbnail_url', 'image_url', 'display_url', 'media_url', 'profile_image_link', 'profile_picture_url', 'profile_pic_url_hd', 'profile_pic_url']);
  if (direct) return clean(direct, 3000);
  const photos = row?.photos || row?.images || row?.image_urls;
  if (Array.isArray(photos) && photos.length) {
    const first = photos[0];
    return clean(typeof first === 'string' ? first : first?.url || first?.src || first?.image_url || '', 3000);
  }
  return '';
}

function normalizeProfileRow(row, requestedUsername) {
  const username = clean(firstValue(row, ['account', 'username', 'user_name', 'user_posted'], requestedUsername), 80).replace(/^@/, '').toLowerCase();
  return {
    id: clean(firstValue(row, ['id', 'instagram_id', 'fbid'], ''), 120),
    username: username || requestedUsername,
    name: clean(firstValue(row, ['full_name', 'profile_name', 'name'], username || requestedUsername), 180),
    biography: clean(firstValue(row, ['biography', 'bio', 'description'], ''), 1600),
    website: clean(firstValue(row, ['external_url', 'website', 'external_link'], ''), 3000),
    profile_picture_url: pickImage(row),
    followers_count: Number(firstValue(row, ['followers', 'followers_count', 'follower_count'], 0)) || 0,
    follows_count: Number(firstValue(row, ['following', 'following_count', 'follows_count'], 0)) || 0,
    media_count: Number(firstValue(row, ['posts_count', 'media_count', 'post_count'], 0)) || 0,
    is_verified: Boolean(firstValue(row, ['is_verified', 'verified'], false)),
  };
}

function normalizePostRow(row, index = 0) {
  const permalink = clean(firstValue(row, ['url', 'post_url', 'permalink', 'link'], ''), 3000);
  const description = clean(firstValue(row, ['description', 'caption', 'text'], ''), 5000);
  const photos = row?.photos || row?.images || row?.image_urls;
  const firstPhoto = Array.isArray(photos) && photos.length ? (typeof photos[0] === 'string' ? photos[0] : photos[0]?.url || photos[0]?.src || photos[0]?.image_url || '') : '';
  const mediaUrl = clean(firstValue(row, ['video_url', 'media_url', 'image_url', 'display_url'], firstPhoto), 3000);
  const thumbnailUrl = clean(firstValue(row, ['thumbnail_url', 'thumbnail', 'display_url', 'image_url'], firstPhoto || mediaUrl), 3000);
  const rawType = clean(firstValue(row, ['media_type', 'type', 'post_type', 'format'], ''), 80).toUpperCase();
  const isReel = /\/reel\//i.test(permalink) || rawType.includes('REEL') || rawType.includes('VIDEO');
  const isCarousel = rawType.includes('CAROUSEL') || (Array.isArray(photos) && photos.length > 1);
  const mediaType = isCarousel ? 'CAROUSEL_ALBUM' : isReel ? 'VIDEO' : 'IMAGE';
  const id = clean(firstValue(row, ['id', 'post_id', 'shortcode', 'code'], permalink || `brightdata-${index}`), 500);
  return {
    id,
    caption: description,
    media_type: mediaType,
    media_url: mediaUrl,
    thumbnail_url: thumbnailUrl,
    permalink,
    timestamp: firstValue(row, ['date_posted', 'timestamp', 'taken_at', 'created_at'], null),
    like_count: Number(firstValue(row, ['likes', 'like_count', 'likes_count'], 0)) || 0,
    comments_count: Number(firstValue(row, ['num_comments', 'comments_count', 'comment_count'], 0)) || 0,
    view_count: Number(firstValue(row, ['views', 'view_count', 'video_view_count'], 0)) || 0,
  };
}

function validRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && !row.error && !row.error_message && row.status !== 'failed');
}

async function fetchInstagramCompetitor({ agencyId, username }) {
  const config = resolveBrightDataConfig(agencyId);
  if (!config.apiToken) {
    throw new BrightDataError('Ative a coleta em Configurações > Integrações. Depois disso, basta cadastrar os @.', 409, 'brightdata_not_configured');
  }

  const profileUrl = `https://www.instagram.com/${username}/`;
  const rawProfileRows = await collectDataset({
    apiToken: config.apiToken,
    datasetId: config.profileDatasetId,
    input: [{ url: profileUrl }],
    timeoutMs: 180000,
  });
  const profileRows = validRows(rawProfileRows);
  const profileRow = profileRows[0];
  if (!profileRow) {
    const providerMessage = providerErrorMessage(rawProfileRows, '');
    throw new BrightDataError(providerMessage || 'Não encontramos dados públicos para esse @. Confirme o usuário e tente novamente.', 404, 'brightdata_profile_not_found', rawProfileRows);
  }

  const profile = normalizeProfileRow(profileRow, username);
  let media = [];
  let mediaWarning = null;
  if (config.postsDatasetId) {
    try {
      const postRows = validRows(await collectDataset({
        apiToken: config.apiToken,
        datasetId: config.postsDatasetId,
        input: [{ url: profileUrl }],
        timeoutMs: 180000,
      }));
      media = postRows.map(normalizePostRow).filter((item) => item.permalink || item.caption).sort((a, b) => {
        const ta = Date.parse(a.timestamp || '') || 0;
        const tb = Date.parse(b.timestamp || '') || 0;
        return tb - ta;
      }).slice(0, 30);
    } catch (error) {
      mediaWarning = 'O perfil foi coletado, mas a amostra de posts não ficou disponível nesta leitura.';
    }
  }

  return { profile, media, warning: mediaWarning };
}

module.exports = {
  BrightDataError,
  DEFAULT_PROFILE_DATASET_ID,
  DEFAULT_POSTS_DATASET_ID,
  getBrightDataOverview,
  saveBrightDataSettings,
  clearBrightDataSettings,
  resolveBrightDataConfig,
  fetchInstagramCompetitor,
  collectDataset,
};
