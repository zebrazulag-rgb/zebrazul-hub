const db = require('../db/database');
const {
  InstagramOAuthError,
  getClientTokenBundle: getInstagramTokenBundle,
  getConnectionStatus: getInstagramConnectionStatus,
  instagramGraphRequest,
  instagramGraphPost,
} = require('./instagramOAuth');
const {
  MetaOAuthError,
  getClientTokenBundle: getMetaTokenBundle,
  getConnectionStatus: getMetaConnectionStatus,
  graphRequest: metaGraphRequest,
  graphPost: metaGraphPost,
} = require('./metaOAuth');

class InstagramPublishingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstagramPublishingError';
    this.status = details.status || 400;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'instagram' || provider === 'meta') return provider;
  return 'auto';
}

function hasScope(scopes, scope) {
  return Array.isArray(scopes) && scopes.includes(scope);
}

function parseGallery(value, fallbackData, fallbackMime) {
  let parsed = value;
  for (let i = 0; i < 3 && typeof parsed === 'string'; i += 1) {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  const items = Array.isArray(parsed) ? parsed : [];
  const normalized = items.map((item) => {
    if (!item) return null;
    if (typeof item === 'string') return { data: item, mime: 'image/jpeg' };
    const data = item.data || item.url || item.src || item.media_data;
    return data ? { ...item, data, mime: item.mime || item.type || item.media_mime || 'image/jpeg' } : null;
  }).filter(Boolean);
  if (normalized.length) return normalized;
  return fallbackData ? [{ data: fallbackData, mime: fallbackMime || 'image/jpeg' }] : [];
}

function publicBaseUrl() {
  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const raw = String(process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || (railwayDomain ? `https://${railwayDomain}` : '')).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/api\/?$/, '').replace(/\/$/, '');
    url.search = ''; url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return raw.replace(/\/api\/?$/, '').replace(/\/$/, ''); }
}

function absoluteMediaUrl(value) {
  const media = String(value || '').trim();
  if (/^https?:\/\//i.test(media)) return media;
  const base = publicBaseUrl();
  if (!base) throw new InstagramPublishingError('Configure PUBLIC_BACKEND_URL no Railway para o Instagram acessar a mídia.', { status: 503 });
  return `${base}${media.startsWith('/') ? '' : '/'}${media}`;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function directAdapter(bundle) {
  if (!bundle?.accessToken || !bundle?.instagramUserId) return null;
  return {
    provider: 'instagram',
    providerLabel: 'Instagram direto',
    accessToken: bundle.accessToken,
    instagramUserId: String(bundle.instagramUserId),
    username: bundle.username || null,
    graphRequest: instagramGraphRequest,
    graphPost: instagramGraphPost,
  };
}

function metaAdapter(bundle) {
  if (!bundle?.selectedInstagramId) return null;
  const accessToken = bundle.pageAccessToken || bundle.userAccessToken;
  if (!accessToken) return null;
  return {
    provider: 'meta',
    providerLabel: 'Meta / Facebook',
    accessToken,
    instagramUserId: String(bundle.selectedInstagramId),
    username: null,
    graphRequest: metaGraphRequest,
    graphPost: metaGraphPost,
  };
}

function getPublishingOptions(clientId, agencyId = null) {
  let direct = null;
  let meta = null;
  let directError = null;
  let metaError = null;

  try {
    const status = getInstagramConnectionStatus(clientId, agencyId);
    if (status && !hasScope(status.scopes, 'instagram_business_content_publish')) {
      directError = 'Reconecte o Instagram concedendo instagram_business_content_publish.';
    } else {
      const bundle = getInstagramTokenBundle(clientId, agencyId);
      direct = directAdapter(bundle);
    }
  } catch (error) {
    directError = error?.message || 'Conexão do Instagram indisponível.';
  }

  try {
    const status = getMetaConnectionStatus(clientId, agencyId);
    if (status && !hasScope(status.scopes, 'instagram_content_publish')) {
      metaError = 'Reconecte a Meta concedendo instagram_content_publish para publicar pelo Instagram vinculado à Página.';
    } else {
      const bundle = getMetaTokenBundle(clientId, agencyId);
      meta = metaAdapter(bundle);
    }
  } catch (error) {
    metaError = error?.message || 'Conexão da Meta indisponível.';
  }

  return {
    instagram: {
      available: Boolean(direct),
      label: 'Instagram direto',
      username: direct?.username || null,
      error: directError,
    },
    meta: {
      available: Boolean(meta),
      label: 'Meta / Facebook',
      instagram_user_id: meta?.instagramUserId || null,
      error: metaError,
    },
  };
}

function resolvePublishingAdapter(post, requestedProvider = null) {
  const provider = normalizeProvider(requestedProvider || post.instagram_publish_provider || 'auto');
  const errors = [];

  if (provider === 'instagram' || provider === 'auto') {
    try {
      const status = getInstagramConnectionStatus(post.client_id, post.agency_id);
      if (status && !hasScope(status.scopes, 'instagram_business_content_publish')) {
        throw new InstagramPublishingError('Reconecte o Instagram concedendo a permissão de publicação.', { status: 409 });
      }
      const adapter = directAdapter(getInstagramTokenBundle(post.client_id, post.agency_id));
      if (adapter) return adapter;
      errors.push('Instagram direto não está conectado.');
    } catch (error) {
      errors.push(error?.message || 'Instagram direto indisponível.');
      if (provider === 'instagram') throw error;
    }
  }

  if (provider === 'meta' || provider === 'auto') {
    try {
      const status = getMetaConnectionStatus(post.client_id, post.agency_id);
      if (status && !hasScope(status.scopes, 'instagram_content_publish')) {
        throw new InstagramPublishingError('Reconecte a Meta concedendo instagram_content_publish para publicar pelo Instagram vinculado à Página.', { status: 409 });
      }
      const adapter = metaAdapter(getMetaTokenBundle(post.client_id, post.agency_id));
      if (adapter) return adapter;
      errors.push('A Meta está conectada, mas nenhuma conta profissional do Instagram foi selecionada pela Página.');
    } catch (error) {
      errors.push(error?.message || 'Conexão da Meta indisponível.');
      if (provider === 'meta') throw error;
    }
  }

  const providerHint = provider === 'instagram'
    ? 'Conecte o Instagram diretamente em Relatórios > Conexões.'
    : provider === 'meta'
      ? 'Conecte a Meta, selecione a Página e confirme o Instagram vinculado em Relatórios > Conexões.'
      : 'Conecte o Instagram diretamente ou pela Meta em Relatórios > Conexões.';
  throw new InstagramPublishingError(`${providerHint}${errors.length ? ` ${errors.join(' ')}` : ''}`, { status: 409 });
}

async function waitForContainer(containerId, adapter, attempts = 24) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      last = await adapter.graphRequest(String(containerId), { fields: 'status_code,status' }, adapter.accessToken);
      const code = String(last?.status_code || '').toUpperCase();
      if (code === 'FINISHED' || code === 'PUBLISHED') return last;
      if (code === 'ERROR' || code === 'EXPIRED') throw new InstagramPublishingError(`O Instagram rejeitou a mídia: ${last?.status || code}.`);
    } catch (error) {
      if (error instanceof InstagramPublishingError) throw error;
      if (i === attempts - 1) throw error;
    }
    await sleep(2500);
  }
  throw new InstagramPublishingError(`A mídia ainda está sendo processada pelo Instagram (${last?.status || 'IN_PROGRESS'}). Tente novamente em instantes.`, { status: 409 });
}

async function publishContainer(adapter, containerId) {
  await waitForContainer(containerId, adapter);
  return adapter.graphPost(`${adapter.instagramUserId}/media_publish`, { creation_id: containerId }, adapter.accessToken);
}

async function createSingleContainer({ adapter, item, caption, contentType, carouselItem = false }) {
  const url = absoluteMediaUrl(item.data);
  const video = String(item.mime || '').startsWith('video/') || contentType === 'reels';
  const params = {};
  if (video) {
    params.media_type = contentType === 'reels' && !carouselItem ? 'REELS' : 'VIDEO';
    params.video_url = url;
  } else {
    params.image_url = url;
  }
  if (carouselItem) params.is_carousel_item = 'true';
  if (!carouselItem && caption) params.caption = caption;
  const result = await adapter.graphPost(`${adapter.instagramUserId}/media`, params, adapter.accessToken);
  if (!result?.id) throw new InstagramPublishingError('O Instagram não retornou o contêiner da publicação.', { status: 502 });
  return result.id;
}

async function publishPost(postId, { agencyId = null, provider = null } = {}) {
  const post = agencyId
    ? db.prepare('SELECT * FROM posts WHERE id = ? AND agency_id = ?').get(postId, agencyId)
    : db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) throw new InstagramPublishingError('Publicação não encontrada.', { status: 404 });
  if (post.instagram_published_media_id) return post;

  const claim = db.prepare(`UPDATE posts SET instagram_publish_state = 'publishing', instagram_publish_error = NULL, updated_at = datetime('now') WHERE id = ? AND COALESCE(instagram_publish_state, '') <> 'publishing'`).run(post.id);
  if (!claim.changes) throw new InstagramPublishingError('Esta publicação já está sendo processada.', { status: 409 });

  try {
    const adapter = resolvePublishingAdapter(post, provider);
    const gallery = parseGallery(post.media_gallery, post.media_data, post.media_mime);
    if (!gallery.length) throw new InstagramPublishingError('Adicione uma imagem ou vídeo antes de publicar.', { status: 400 });
    if (post.content_type === 'story') throw new InstagramPublishingError('Stories continuam sendo publicados pela área de Stories do ZebraHub.', { status: 400 });

    const caption = String(post.caption || '');
    let parentId;
    if (gallery.length > 1 || post.content_type === 'carrossel') {
      if (gallery.length < 2) throw new InstagramPublishingError('Um carrossel precisa ter pelo menos 2 mídias.', { status: 400 });
      if (gallery.length > 10) throw new InstagramPublishingError('O Instagram aceita no máximo 10 mídias por carrossel.', { status: 400 });
      const children = [];
      for (const item of gallery) {
        const childId = await createSingleContainer({ adapter, item, caption: '', contentType: 'feed', carouselItem: true });
        await waitForContainer(childId, adapter, 16);
        children.push(childId);
      }
      const parent = await adapter.graphPost(`${adapter.instagramUserId}/media`, {
        media_type: 'CAROUSEL', children: children.join(','), caption,
      }, adapter.accessToken);
      parentId = parent?.id;
    } else {
      parentId = await createSingleContainer({ adapter, item: gallery[0], caption, contentType: post.content_type });
    }
    if (!parentId) throw new InstagramPublishingError('Não foi possível preparar a publicação no Instagram.', { status: 502 });
    const published = await publishContainer(adapter, parentId);
    if (!published?.id) throw new InstagramPublishingError('O Instagram não confirmou a publicação.', { status: 502 });

    db.prepare(`UPDATE posts SET status = 'published', instagram_publish_state = 'published', instagram_publish_provider = ?, instagram_container_id = ?, instagram_published_media_id = ?, instagram_published_at = datetime('now'), instagram_publish_error = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(adapter.provider, String(parentId), String(published.id), post.id);
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  } catch (error) {
    const message = error?.message || 'Não foi possível publicar no Instagram.';
    db.prepare(`UPDATE posts SET instagram_publish_state = 'failed', instagram_publish_error = ?, updated_at = datetime('now') WHERE id = ?`).run(message.slice(0, 1000), post.id);
    if (error instanceof InstagramPublishingError) throw error;
    if (error instanceof InstagramOAuthError || error instanceof MetaOAuthError) {
      throw new InstagramPublishingError(message, {
        status: error.status,
        metaCode: error.metaCode,
        metaSubcode: error.metaSubcode,
        traceId: error.traceId,
      });
    }
    throw new InstagramPublishingError(message, { status: 502 });
  }
}

async function publishDuePosts() {
  const rows = db.prepare(`SELECT id, agency_id FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at) <= datetime('now') AND COALESCE(instagram_publish_state, '') IN ('','scheduled') ORDER BY datetime(scheduled_at) ASC LIMIT 20`).all();
  let published = 0; let failed = 0;
  for (const row of rows) {
    try { await publishPost(row.id, { agencyId: row.agency_id }); published += 1; }
    catch (error) { failed += 1; console.error('[INSTAGRAM PUBLISH] Falha agendada', row.id, error.message); }
  }
  return { total: rows.length, published, failed };
}

module.exports = {
  InstagramPublishingError,
  getPublishingOptions,
  normalizeProvider,
  publishPost,
  publishDuePosts,
};
