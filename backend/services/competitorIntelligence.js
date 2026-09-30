const db = require('../db/database');
const { getClientTokenBundle, graphRequest, MetaOAuthError } = require('./metaOAuth');

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

class CompetitorIntelligenceError extends Error {
  constructor(message, status = 502, code = 'competitor_intelligence_error', details = null) {
    super(message);
    this.name = 'CompetitorIntelligenceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value, max = 5000) { return String(value ?? '').trim().slice(0, max); }
function toNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function usernameFromInput(value) {
  const raw = clean(value, 500).replace(/^@/, '');
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (/instagram\.com$/i.test(url.hostname.replace(/^www\./, ''))) {
      return (url.pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '').toLowerCase();
    }
  } catch {}
  if (/^[a-zA-Z0-9._]{1,30}$/.test(raw)) return raw.toLowerCase();
  return '';
}

function normalizeMedia(media = []) {
  return (Array.isArray(media) ? media : []).map((item) => ({
    id: String(item.id || ''),
    caption: clean(item.caption, 5000),
    media_type: clean(item.media_type, 80),
    media_url: clean(item.media_url, 3000),
    thumbnail_url: clean(item.thumbnail_url, 3000),
    permalink: clean(item.permalink, 3000),
    timestamp: item.timestamp || null,
    like_count: toNumber(item.like_count),
    comments_count: toNumber(item.comments_count),
  })).filter((item) => item.id);
}

function calculateMetrics(profile, media) {
  const rows = normalizeMedia(media);
  const format = { IMAGE: 0, VIDEO: 0, CAROUSEL_ALBUM: 0, OTHER: 0 };
  let likes = 0; let comments = 0; let chars = 0; let hashtags = 0; let posts30d = 0;
  const now = Date.now();
  rows.forEach((item) => {
    const key = Object.prototype.hasOwnProperty.call(format, item.media_type) ? item.media_type : 'OTHER';
    format[key] += 1; likes += item.like_count; comments += item.comments_count; chars += item.caption.length;
    hashtags += (item.caption.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    const ts = Date.parse(item.timestamp || ''); if (Number.isFinite(ts) && now - ts <= 30 * 86400000) posts30d += 1;
  });
  const count = Math.max(1, rows.length);
  const topPosts = [...rows].sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count)).slice(0, 5).map((item) => ({ id: item.id, permalink: item.permalink, media_type: item.media_type, like_count: item.like_count, comments_count: item.comments_count, caption: item.caption.slice(0, 500) }));
  return {
    sample_size: rows.length,
    followers_count: toNumber(profile.followers_count),
    follows_count: toNumber(profile.follows_count),
    media_count: toNumber(profile.media_count),
    posts_last_30_days: posts30d,
    average_likes: Math.round(likes / count),
    average_comments: Math.round(comments / count),
    average_caption_chars: Math.round(chars / count),
    average_hashtags: Number((hashtags / count).toFixed(1)),
    format_mix: format,
    top_posts: topPosts,
  };
}

function collectorCandidates(agencyId) {
  return db.prepare(`
    SELECT
      moc.id AS oauth_connection_id, moc.client_id, moc.provider_user_name, moc.selected_instagram_account_id,
      moc.status, moc.token_expires_at, moc.scopes_json, moc.updated_at, c.name AS client_name,
      moa.instagram_username, moa.instagram_name, moa.instagram_picture_url
    FROM meta_oauth_connections moc
    JOIN clients c ON c.id = moc.client_id AND c.agency_id = moc.agency_id
    LEFT JOIN meta_organic_accounts moa ON moa.client_id = moc.client_id AND moa.agency_id = moc.agency_id
    WHERE moc.agency_id = ?
      AND moc.status = 'connected'
      AND moc.selected_instagram_account_id IS NOT NULL
      AND trim(moc.selected_instagram_account_id) <> ''
    ORDER BY datetime(moc.updated_at) DESC, moc.id DESC
  `).all(Number(agencyId));
}

function candidateExpired(row) {
  if (!row?.token_expires_at) return false;
  const expiresAt = Date.parse(row.token_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function candidateHasBusinessDiscoveryScope(row) {
  let scopes = [];
  try { scopes = JSON.parse(row?.scopes_json || '[]'); } catch { scopes = []; }
  return scopes.includes('instagram_basic');
}

function rememberCollector(agencyId, candidate, configuredBy = null) {
  db.prepare(`
    INSERT INTO competitor_collectors (
      agency_id, oauth_connection_id, instagram_account_id, instagram_username, instagram_name, profile_picture_url, configured_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(agency_id) DO UPDATE SET
      oauth_connection_id = excluded.oauth_connection_id,
      instagram_account_id = excluded.instagram_account_id,
      instagram_username = COALESCE(excluded.instagram_username, competitor_collectors.instagram_username),
      instagram_name = COALESCE(excluded.instagram_name, competitor_collectors.instagram_name),
      profile_picture_url = COALESCE(excluded.profile_picture_url, competitor_collectors.profile_picture_url),
      configured_by = COALESCE(excluded.configured_by, competitor_collectors.configured_by),
      updated_at = datetime('now')
  `).run(
    Number(agencyId), Number(candidate.oauth_connection_id), String(candidate.selected_instagram_account_id || ''),
    candidate.instagram_username || null, candidate.instagram_name || null, candidate.instagram_picture_url || null, configuredBy
  );
}

function getStoredCollector(agencyId) {
  return db.prepare(`
    SELECT cc.*, moc.client_id, moc.provider_user_name, moc.status AS connection_status, moc.token_expires_at, moc.scopes_json,
      c.name AS client_name, moa.instagram_username AS live_instagram_username,
      moa.instagram_name AS live_instagram_name, moa.instagram_picture_url AS live_instagram_picture_url
    FROM competitor_collectors cc
    LEFT JOIN meta_oauth_connections moc ON moc.id = cc.oauth_connection_id AND moc.agency_id = cc.agency_id
    LEFT JOIN clients c ON c.id = moc.client_id AND c.agency_id = cc.agency_id
    LEFT JOIN meta_organic_accounts moa ON moa.client_id = moc.client_id AND moa.agency_id = cc.agency_id
    WHERE cc.agency_id = ?
  `).get(Number(agencyId)) || null;
}

function resolveAgencyCollector(agencyId, configuredBy = null) {
  const stored = getStoredCollector(agencyId);
  if (stored?.oauth_connection_id && stored.connection_status === 'connected' && stored.instagram_account_id !== '' && candidateHasBusinessDiscoveryScope(stored)) {
    const expiresAt = stored.token_expires_at ? Date.parse(stored.token_expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) {
      try {
        const bundle = getClientTokenBundle(stored.client_id, agencyId);
        if (bundle?.selectedInstagramId) {
          return {
            bundle,
            collector: {
              oauth_connection_id: Number(stored.oauth_connection_id), client_id: Number(stored.client_id),
              client_name: stored.client_name || null,
              instagram_account_id: stored.instagram_account_id || bundle.selectedInstagramId,
              instagram_username: stored.live_instagram_username || stored.instagram_username || null,
              instagram_name: stored.live_instagram_name || stored.instagram_name || null,
              profile_picture_url: stored.live_instagram_picture_url || stored.profile_picture_url || null,
              automatic: false,
            },
          };
        }
      } catch {}
    }
  }

  const candidates = collectorCandidates(agencyId).filter((row) => !candidateExpired(row) && candidateHasBusinessDiscoveryScope(row));
  for (const candidate of candidates) {
    try {
      const bundle = getClientTokenBundle(candidate.client_id, agencyId);
      if (!bundle?.selectedInstagramId) continue;
      rememberCollector(agencyId, candidate, configuredBy);
      return {
        bundle,
        collector: {
          oauth_connection_id: Number(candidate.oauth_connection_id), client_id: Number(candidate.client_id),
          client_name: candidate.client_name || null, instagram_account_id: bundle.selectedInstagramId,
          instagram_username: candidate.instagram_username || null, instagram_name: candidate.instagram_name || null,
          profile_picture_url: candidate.instagram_picture_url || null, automatic: true,
        },
      };
    } catch {}
  }
  return null;
}

function getCollectorOverview(agencyId) {
  const resolved = resolveAgencyCollector(agencyId);
  const candidates = collectorCandidates(agencyId).map((row) => ({
    oauth_connection_id: Number(row.oauth_connection_id), client_id: Number(row.client_id), client_name: row.client_name || null,
    instagram_account_id: row.selected_instagram_account_id || null, instagram_username: row.instagram_username || null,
    instagram_name: row.instagram_name || null, profile_picture_url: row.instagram_picture_url || null,
    provider_user_name: row.provider_user_name || null, expired: candidateExpired(row),
    business_discovery_ready: !candidateExpired(row) && candidateHasBusinessDiscoveryScope(row),
  }));
  return { configured: Boolean(resolved), collector: resolved?.collector || null, candidates };
}

function setAgencyCollector(agencyId, oauthConnectionId, configuredBy = null) {
  const candidate = collectorCandidates(agencyId).find((row) => Number(row.oauth_connection_id) === Number(oauthConnectionId));
  if (!candidate) throw new CompetitorIntelligenceError('Essa conexão não está disponível para a agência.', 404, 'collector_connection_not_found');
  if (candidateExpired(candidate)) throw new CompetitorIntelligenceError('Essa conexão da Meta expirou. Reconecte-a antes de usá-la para concorrentes.', 409, 'collector_connection_expired');
  if (!candidateHasBusinessDiscoveryScope(candidate)) throw new CompetitorIntelligenceError('Reconecte essa conta uma vez para liberar a permissão de análise de concorrentes.', 409, 'collector_permission_missing');
  let bundle;
  try { bundle = getClientTokenBundle(candidate.client_id, agencyId); }
  catch (error) { throw new CompetitorIntelligenceError(error.message, error.status || 401, 'collector_connection_error'); }
  if (!bundle?.selectedInstagramId) throw new CompetitorIntelligenceError('Selecione um Instagram profissional nessa conexão antes de usá-la como coletora.', 409, 'collector_instagram_not_selected');
  rememberCollector(agencyId, candidate, configuredBy);
  return getCollectorOverview(agencyId);
}

async function fetchCompetitorProfile({ agencyId, username }) {
  const resolved = resolveAgencyCollector(agencyId);
  if (!resolved?.bundle?.selectedInstagramId) {
    throw new CompetitorIntelligenceError(
      'Configure uma conta coletora uma única vez em Configurações > Integrações. Depois disso, basta cadastrar os @ dos concorrentes.',
      409, 'collector_not_configured'
    );
  }
  const bundle = resolved.bundle;
  const accessToken = bundle.pageAccessToken || bundle.userAccessToken;
  const fields = `business_discovery.username(${username}){id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(24){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count}}`;
  let payload;
  try { payload = await graphRequest(String(bundle.selectedInstagramId), { fields }, accessToken); }
  catch (error) {
    if (error instanceof MetaOAuthError) {
      throw new CompetitorIntelligenceError(
        'Não foi possível ler esse perfil pela API oficial. O perfil precisa ser profissional (Business/Creator) e a conexão Meta precisa ter acesso válido.',
        error.status || 400,
        'business_discovery_failed',
        error.message,
      );
    }
    throw error;
  }
  const profile = payload?.business_discovery;
  if (!profile?.username) throw new CompetitorIntelligenceError('A Meta não retornou dados para esse perfil.', 404, 'competitor_not_found');
  const media = normalizeMedia(profile.media?.data || []);
  return {
    profile: {
      id: String(profile.id || ''), username: clean(profile.username, 80), name: clean(profile.name, 180),
      biography: clean(profile.biography, 1200), website: clean(profile.website, 1200), profile_picture_url: clean(profile.profile_picture_url, 3000),
      followers_count: toNumber(profile.followers_count), follows_count: toNumber(profile.follows_count), media_count: toNumber(profile.media_count),
    },
    media,
  };
}

function analysisSchema() {
  return {
    type: 'object', additionalProperties: false,
    required: ['summary','positioning','likely_audience','tone','pillars','visual_direction','commercial_signals','recurring_ctas','strengths_observed','gaps_observed','opportunities','cautions'],
    properties: {
      summary: { type: 'string' }, positioning: { type: 'string' }, likely_audience: { type: 'string' },
      tone: { type: 'array', items: { type: 'string' } },
      pillars: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name','share','evidence'], properties: { name: { type: 'string' }, share: { type: 'integer' }, evidence: { type: 'string' } } } },
      visual_direction: { type: 'array', items: { type: 'string' } }, commercial_signals: { type: 'array', items: { type: 'string' } }, recurring_ctas: { type: 'array', items: { type: 'string' } },
      strengths_observed: { type: 'array', items: { type: 'string' } }, gaps_observed: { type: 'array', items: { type: 'string' } }, opportunities: { type: 'array', items: { type: 'string' } }, cautions: { type: 'array', items: { type: 'string' } },
    },
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const pieces = [];
  (payload?.output || []).forEach((item) => (item?.content || []).forEach((part) => { if (part?.type === 'output_text' && typeof part.text === 'string') pieces.push(part.text); }));
  return pieces.join('\n').trim();
}

async function analyzeWithAI({ profile, media, metrics }) {
  const apiKey = clean(process.env.OPENAI_API_KEY, 10000);
  if (!apiKey) return { analysis: null, model: null, warning: 'OPENAI_API_KEY não está configurada; métricas coletadas, mas leitura estratégica por IA não foi executada.' };
  const model = clean(process.env.OPENAI_COMPETITOR_MODEL || process.env.OPENAI_MODEL, 120) || 'gpt-5.6-luna';
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.max(30000, Number(process.env.OPENAI_TIMEOUT_MS || 90000)));
  const captions = media.slice(0, 24).map((item, index) => ({ index: index + 1, type: item.media_type, timestamp: item.timestamp, likes: item.like_count, comments: item.comments_count, caption: item.caption.slice(0, 1800) }));
  const text = JSON.stringify({ profile, metrics, posts: captions });
  const images = media.filter((item) => item.media_url || item.thumbnail_url).slice(0, 6).map((item) => ({ type: 'input_image', image_url: item.thumbnail_url || item.media_url }));
  const instructions = [
    'Você é um analista de posicionamento e conteúdo para uma agência de marketing brasileira.',
    'Analise somente os dados públicos fornecidos do Instagram e a amostra de publicações retornada pela API.',
    'Não invente fatos, campanhas, resultados ou públicos que não estejam sustentados pela amostra.',
    'Quando fizer inferência, use linguagem como “aparenta”, “sugere” ou “na amostra”.',
    'Pilares devem somar aproximadamente 100% e representar apenas a amostra disponível.',
    'Visual_direction pode usar as imagens anexadas, sem identificar pessoas nem inferir atributos sensíveis.',
    'Opportunities significa territórios de comunicação que o cliente pode TESTAR; não diga que o concorrente é melhor ou pior.',
    'Responda em português do Brasil, direto e útil para uma direção estratégica.',
  ].join('\n');
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model, store: false, max_output_tokens: 2600,
        input: [{ role: 'system', content: [{ type: 'input_text', text: instructions }] }, { role: 'user', content: [{ type: 'input_text', text }, ...images] }],
        text: { format: { type: 'json_schema', name: 'zebrahub_competitor_analysis', strict: true, schema: analysisSchema() } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new CompetitorIntelligenceError(payload?.error?.message || 'A IA não conseguiu concluir a análise.', response.status >= 500 ? 502 : response.status, payload?.error?.code || 'openai_error');
    const output = extractOutputText(payload); if (!output) throw new CompetitorIntelligenceError('A IA retornou uma análise vazia.', 502, 'empty_ai_response');
    let analysis; try { analysis = JSON.parse(output); } catch { throw new CompetitorIntelligenceError('A IA retornou uma análise em formato inesperado.', 502, 'invalid_ai_json'); }
    return { analysis, model, warning: null };
  } catch (error) {
    if (error?.name === 'AbortError') return { analysis: null, model, warning: 'A análise estratégica por IA excedeu o tempo limite. As métricas foram salvas normalmente.' };
    if (error instanceof CompetitorIntelligenceError) return { analysis: null, model, warning: error.message };
    return { analysis: null, model, warning: 'A leitura estratégica por IA não pôde ser concluída agora.' };
  } finally { clearTimeout(timer); }
}

module.exports = {
  CompetitorIntelligenceError, usernameFromInput, fetchCompetitorProfile, calculateMetrics, analyzeWithAI,
  getCollectorOverview, setAgencyCollector, resolveAgencyCollector,
};
