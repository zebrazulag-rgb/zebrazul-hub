const db = require('../db/database');
const {
  InstagramOAuthError,
  getClientTokenBundle,
  instagramGraphRequest,
  instagramGraphPost,
} = require('./instagramOAuth');

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

async function waitForContainer(containerId, token, attempts = 24) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      last = await instagramGraphRequest(String(containerId), { fields: 'status_code,status' }, token);
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

async function publishContainer(instagramUserId, containerId, token) {
  await waitForContainer(containerId, token);
  return instagramGraphPost(`${instagramUserId}/media_publish`, { creation_id: containerId }, token);
}

async function createSingleContainer({ instagramUserId, item, caption, contentType, token, carouselItem = false }) {
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
  const result = await instagramGraphPost(`${instagramUserId}/media`, params, token);
  if (!result?.id) throw new InstagramPublishingError('O Instagram não retornou o contêiner da publicação.', { status: 502 });
  return result.id;
}

async function publishPost(postId, { agencyId = null } = {}) {
  const post = agencyId
    ? db.prepare('SELECT * FROM posts WHERE id = ? AND agency_id = ?').get(postId, agencyId)
    : db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) throw new InstagramPublishingError('Publicação não encontrada.', { status: 404 });
  if (post.instagram_published_media_id) return post;

  const claim = db.prepare(`UPDATE posts SET instagram_publish_state = 'publishing', instagram_publish_error = NULL, updated_at = datetime('now') WHERE id = ? AND COALESCE(instagram_publish_state, '') <> 'publishing'`).run(post.id);
  if (!claim.changes) throw new InstagramPublishingError('Esta publicação já está sendo processada.', { status: 409 });

  try {
    const bundle = getClientTokenBundle(post.client_id, post.agency_id);
    if (!bundle?.accessToken || !bundle?.instagramUserId) throw new InstagramPublishingError('Conecte o Instagram profissional deste cliente antes de publicar.', { status: 409 });
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
        const childId = await createSingleContainer({ instagramUserId: bundle.instagramUserId, item, caption: '', contentType: 'feed', token: bundle.accessToken, carouselItem: true });
        await waitForContainer(childId, bundle.accessToken, 16);
        children.push(childId);
      }
      const parent = await instagramGraphPost(`${bundle.instagramUserId}/media`, {
        media_type: 'CAROUSEL', children: children.join(','), caption,
      }, bundle.accessToken);
      parentId = parent?.id;
    } else {
      parentId = await createSingleContainer({ instagramUserId: bundle.instagramUserId, item: gallery[0], caption, contentType: post.content_type, token: bundle.accessToken });
    }
    if (!parentId) throw new InstagramPublishingError('Não foi possível preparar a publicação no Instagram.', { status: 502 });
    const published = await publishContainer(bundle.instagramUserId, parentId, bundle.accessToken);
    if (!published?.id) throw new InstagramPublishingError('O Instagram não confirmou a publicação.', { status: 502 });

    db.prepare(`UPDATE posts SET status = 'published', instagram_publish_state = 'published', instagram_container_id = ?, instagram_published_media_id = ?, instagram_published_at = datetime('now'), instagram_publish_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(String(parentId), String(published.id), post.id);
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  } catch (error) {
    const message = error?.message || 'Não foi possível publicar no Instagram.';
    db.prepare(`UPDATE posts SET instagram_publish_state = 'failed', instagram_publish_error = ?, updated_at = datetime('now') WHERE id = ?`).run(message.slice(0, 1000), post.id);
    if (error instanceof InstagramPublishingError) throw error;
    if (error instanceof InstagramOAuthError) throw new InstagramPublishingError(message, { status: error.status, metaCode: error.metaCode, metaSubcode: error.metaSubcode, traceId: error.traceId });
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

module.exports = { InstagramPublishingError, publishPost, publishDuePosts };
