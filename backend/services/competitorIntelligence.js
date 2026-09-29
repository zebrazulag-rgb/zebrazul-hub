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

async function fetchCompetitorProfile({ clientId, agencyId, username }) {
  let bundle;
  try { bundle = getClientTokenBundle(clientId, agencyId); }
  catch (error) { throw new CompetitorIntelligenceError(error.message, error.status || 401, 'meta_connection_error'); }
  if (!bundle?.selectedInstagramId) {
    throw new CompetitorIntelligenceError('Conecte e selecione o Instagram profissional deste cliente em Conexões antes de analisar concorrentes.', 409, 'instagram_not_selected');
  }
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

module.exports = { CompetitorIntelligenceError, usernameFromInput, fetchCompetitorProfile, calculateMetrics, analyzeWithAI };
