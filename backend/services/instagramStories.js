const crypto = require('crypto');
const db = require('../db/database');
const { persistMediaBuffer } = require('./mediaStorage');
const {
  InstagramOAuthError,
  REQUIRED_SCOPES: REQUIRED_STORY_SCOPES,
  getConfig,
  getConnectionStatus,
  getClientTokenBundle,
  findConnectionByInstagramUserId,
  instagramGraphRequest,
  instagramGraphPost,
} = require('./instagramOAuth');

const MEDIA_DOWNLOAD_TIMEOUT_MS = Number(process.env.INSTAGRAM_STORY_DOWNLOAD_TIMEOUT_MS || process.env.META_STORY_DOWNLOAD_TIMEOUT_MS || 30000);
const MAX_MEDIA_BYTES = Number(process.env.INSTAGRAM_STORY_MAX_BYTES || process.env.META_STORY_MAX_BYTES || 100 * 1024 * 1024);

class InstagramStoryError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstagramStoryError';
    this.status = details.status || 400;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function parseAllowedUsernames(value) {
  const source = Array.isArray(value) ? value : safeJson(value, []);
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map(normalizeUsername).filter(Boolean))];
}

function serializeSettings(row) {
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    enabled: Number(row.enabled) === 1,
    mode: row.mode || 'manual',
    allowed_usernames: parseAllowedUsernames(row.allowed_usernames_json),
    subscribed_at: row.subscribed_at || null,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function ensureSettings(clientId, agencyId) {
  db.prepare(`
    INSERT INTO instagram_story_settings (agency_id, client_id)
    VALUES (?, ?)
    ON CONFLICT(client_id) DO NOTHING
  `).run(agencyId, clientId);
  return db.prepare(`
    SELECT * FROM instagram_story_settings
    WHERE client_id = ? AND agency_id = ?
  `).get(clientId, agencyId);
}

function getSettings(clientId, agencyId) {
  return serializeSettings(ensureSettings(clientId, agencyId));
}

function updateSettings({ clientId, agencyId, enabled, mode, allowedUsernames }) {
  ensureSettings(clientId, agencyId);
  const normalizedMode = mode === 'automatic' ? 'automatic' : 'manual';
  const usernames = parseAllowedUsernames(allowedUsernames);
  db.prepare(`
    UPDATE instagram_story_settings SET
      enabled = ?,
      mode = ?,
      allowed_usernames_json = ?,
      last_error = NULL,
      updated_at = datetime('now')
    WHERE client_id = ? AND agency_id = ?
  `).run(enabled ? 1 : 0, normalizedMode, JSON.stringify(usernames), clientId, agencyId);
  return getSettings(clientId, agencyId);
}

function configuredPublicBaseUrl() {
  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const raw = String(
    process.env.PUBLIC_BACKEND_URL
    || process.env.BACKEND_PUBLIC_URL
    || process.env.API_PUBLIC_URL
    || (railwayDomain ? `https://${railwayDomain}` : '')
  ).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/api\/?$/, '').replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
  }
}

function requestPublicBaseUrl(req) {
  const configured = configuredPublicBaseUrl();
  if (configured) return configured;
  if (!req) return '';
  const forwardedProto = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get?.('x-forwarded-host') || req.get?.('host');
  return host ? `${protocol}://${host}` : '';
}

function absoluteMediaUrl(mediaUrl, publicBaseUrl) {
  const value = String(mediaUrl || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (!value) return '';
  const base = String(publicBaseUrl || configuredPublicBaseUrl()).replace(/\/$/, '');
  if (!base) {
    throw new InstagramStoryError('Configure PUBLIC_BACKEND_URL no Railway para a Meta acessar a mídia do Story.', { status: 503 });
  }
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function findConnectionByTargets(targetIds) {
  const ids = [...new Set((targetIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  for (const id of ids) {
    const row = findConnectionByInstagramUserId(id);
    if (row) return row;
  }
  return null;
}

function attachmentUrl(attachment) {
  const payload = attachment?.payload || {};
  return payload.url || payload.media_url || payload.src || attachment?.url || null;
}

function attachmentMediaType(attachment) {
  const type = String(attachment?.type || attachment?.payload?.media_type || '').toLowerCase();
  if (type.includes('video') || type.includes('reel')) return 'video';
  return 'image';
}

function storyHint(messaging, attachment) {
  const hint = JSON.stringify({
    attachment,
    referral: messaging?.referral,
    postback: messaging?.postback,
    messageReferral: messaging?.message?.referral,
    replyTo: messaging?.message?.reply_to,
  }).toLowerCase();
  return hint.includes('story_mention')
    || hint.includes('story mention')
    || String(attachment?.type || '').toLowerCase().includes('story');
}

async function downloadMedia(url, hintedType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);
  try {
    const parsed = new URL(String(url));
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new InstagramStoryError('A URL da mídia recebida não é válida.');
    }
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ZebraHub-Story-Collector/1.0' },
    });
    if (!response.ok) {
      throw new InstagramStoryError(`Não foi possível baixar a mídia da Meta (${response.status}).`, { status: 502 });
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_MEDIA_BYTES) {
      throw new InstagramStoryError('A mídia recebida ultrapassa o limite configurado para Stories.', { status: 413 });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new InstagramStoryError('A Meta retornou uma mídia vazia.', { status: 502 });
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw new InstagramStoryError('A mídia recebida ultrapassa o limite configurado para Stories.', { status: 413 });
    }
    let mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
      mime = hintedType === 'video' ? 'video/mp4' : 'image/jpeg';
    }
    const mediaType = mime.startsWith('video/') ? 'video' : 'image';
    const mediaUrl = persistMediaBuffer(buffer, mime);
    if (!mediaUrl) throw new InstagramStoryError('Não foi possível salvar a mídia recebida.', { status: 500 });
    return { mediaUrl, mime, mediaType, bytes: buffer.length };
  } catch (error) {
    if (error instanceof InstagramStoryError) throw error;
    if (error.name === 'AbortError') {
      throw new InstagramStoryError('A Meta demorou demais para entregar a mídia do Story.', { status: 504 });
    }
    throw new InstagramStoryError('Não foi possível baixar a mídia recebida da Meta.', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function senderProfile(senderId, bundle) {
  if (!senderId || !bundle?.accessToken) return {};
  try {
    const profile = await instagramGraphRequest(String(senderId), {
      fields: 'name,username,profile_pic,profile_picture_url',
    }, bundle.accessToken);
    return {
      username: profile.username || null,
      name: profile.name || null,
      profilePictureUrl: profile.profile_pic || profile.profile_picture_url || null,
    };
  } catch {
    return {};
  }
}

async function ensureMentionSenderProfile(row, bundle) {
  if (row?.sender_username) {
    return {
      username: normalizeUsername(row.sender_username),
      name: row.sender_name || null,
      profilePictureUrl: row.sender_profile_picture_url || null,
    };
  }
  if (!row?.sender_igsid) return {};
  const profile = await senderProfile(row.sender_igsid, bundle);
  if (profile.username) {
    db.prepare(`
      UPDATE instagram_story_mentions SET
        sender_username = ?, sender_name = ?, sender_profile_picture_url = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalizeUsername(profile.username),
      profile.name || null,
      profile.profilePictureUrl || null,
      row.id
    );
  }
  return profile;
}

function storyUserTags(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return [{ username: normalized, x: 0.5, y: 0.9 }];
}

function senderAllowed(settings, username) {
  const allowed = parseAllowedUsernames(settings.allowed_usernames_json);
  if (!allowed.length) return true;
  return allowed.includes(normalizeUsername(username));
}

function supportsStoryPublishing(accountType) {
  const normalized = String(accountType || '').trim().toUpperCase();
  // A API pode omitir account_type em algumas respostas. Nesse caso,
  // deixamos a publicação seguir e usamos a resposta oficial como validação final.
  if (!normalized) return true;
  return normalized.includes('BUSINESS');
}

function shouldAutoPublish(settings, mention) {
  return Number(settings?.enabled) === 1
    && settings?.mode === 'automatic'
    && mention.sourceKind === 'story_mention'
    && senderAllowed(settings, mention.senderUsername);
}

function serializeMention(row) {
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name || null,
    client_avatar: row.client_avatar || null,
    event_key: row.event_key,
    meta_message_id: row.meta_message_id,
    source_kind: row.source_kind,
    sender_igsid: row.sender_igsid,
    sender_username: row.sender_username,
    sender_name: row.sender_name,
    sender_profile_picture_url: row.sender_profile_picture_url,
    source_media_url: row.source_media_url,
    media_url: row.media_url,
    media_mime: row.media_mime,
    media_type: row.media_type,
    status: row.status,
    published_container_id: row.published_container_id,
    published_media_id: row.published_media_id,
    error_message: row.error_message,
    received_at: row.received_at,
    expires_at: row.expires_at,
    published_at: row.published_at,
    ignored_at: row.ignored_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getMentionById(id, agencyId = null) {
  const row = agencyId
    ? db.prepare(`
        SELECT ism.*, c.name AS client_name, c.avatar_data AS client_avatar
        FROM instagram_story_mentions ism
        JOIN clients c ON c.id = ism.client_id
        WHERE ism.id = ? AND ism.agency_id = ?
      `).get(id, agencyId)
    : db.prepare(`
        SELECT ism.*, c.name AS client_name, c.avatar_data AS client_avatar
        FROM instagram_story_mentions ism
        JOIN clients c ON c.id = ism.client_id
        WHERE ism.id = ?
      `).get(id);
  return serializeMention(row);
}

function markMentionFailure(id, message) {
  db.prepare(`
    UPDATE instagram_story_mentions SET
      status = 'failed', error_message = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(String(message || 'Falha ao processar o Story.'), id);
}

async function processMessagingAttachment({ entry, messaging, attachment, index, connection }) {
  const sourceUrl = attachmentUrl(attachment);
  if (!sourceUrl) return { ignored: true };

  const messageId = String(messaging?.message?.mid || messaging?.mid || '').trim();
  const eventKey = messageId
    ? `${connection.client_id}:${messageId}:${index}`
    : `${connection.client_id}:${hashPayload({ entryId: entry?.id, messaging, attachment, index })}`;

  const existing = db.prepare('SELECT id FROM instagram_story_mentions WHERE event_key = ?').get(eventKey);
  if (existing) return { duplicate: true, id: existing.id };

  const senderId = String(messaging?.sender?.id || '').trim() || null;
  const sourceKind = storyHint(messaging, attachment) ? 'story_mention' : 'media_message';
  const hintedType = attachmentMediaType(attachment);
  const receivedAtMs = Number(messaging?.timestamp || entry?.time || Date.now());
  const receivedAt = new Date(Number.isFinite(receivedAtMs) ? receivedAtMs : Date.now());
  const expiresAt = new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const insert = db.prepare(`
    INSERT INTO instagram_story_mentions (
      agency_id, client_id, instagram_oauth_connection_id, event_key, meta_message_id,
      source_kind, sender_igsid, source_media_url, media_type, status,
      raw_payload_json, received_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    connection.agency_id,
    connection.client_id,
    connection.id,
    eventKey,
    messageId || null,
    sourceKind,
    senderId,
    sourceUrl,
    hintedType,
    JSON.stringify({ entry, messaging, attachment }),
    receivedAt.toISOString(),
    expiresAt
  );
  const mentionId = Number(insert.lastInsertRowid);

  try {
    const bundle = getClientTokenBundle(connection.client_id, connection.agency_id);
    const [profile, media] = await Promise.all([
      senderProfile(senderId, bundle),
      downloadMedia(sourceUrl, hintedType),
    ]);

    db.prepare(`
      UPDATE instagram_story_mentions SET
        sender_username = ?, sender_name = ?, sender_profile_picture_url = ?,
        media_url = ?, media_mime = ?, media_type = ?, error_message = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      profile.username || null,
      profile.name || null,
      profile.profilePictureUrl || null,
      media.mediaUrl,
      media.mime,
      media.mediaType,
      mentionId
    );

    const settings = ensureSettings(connection.client_id, connection.agency_id);
    const mention = {
      id: mentionId,
      sourceKind,
      senderUsername: profile.username || null,
    };
    if (shouldAutoPublish(settings, mention)) {
      setImmediate(() => {
        publishMention(mentionId, { agencyId: connection.agency_id }).catch((error) => {
          console.error('[INSTAGRAM STORIES] Falha no repost automático:', error.message);
        });
      });
    }
    return { created: true, id: mentionId, sourceKind };
  } catch (error) {
    markMentionFailure(mentionId, error.message);
    return { created: true, id: mentionId, failed: true, error: error.message };
  }
}

async function processWebhookPayload(payload) {
  const eventKey = hashPayload(payload);
  const eventInsert = db.prepare(`
    INSERT INTO instagram_story_webhook_events (event_key, object_type, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(event_key) DO NOTHING
  `).run(eventKey, payload?.object || null, JSON.stringify(payload || {}));
  if (eventInsert.changes === 0) return { duplicate: true, created: 0, ignored: 0 };

  let created = 0;
  let ignored = 0;
  let failed = 0;
  try {
    for (const entry of payload?.entry || []) {
      for (const messaging of entry?.messaging || []) {
        if (messaging?.is_echo || messaging?.is_self || messaging?.message?.is_echo) {
          ignored += 1;
          continue;
        }
        const attachments = Array.isArray(messaging?.message?.attachments)
          ? messaging.message.attachments
          : [];
        if (!attachments.length) {
          ignored += 1;
          continue;
        }
        const connection = findConnectionByTargets([
          entry?.id,
          messaging?.recipient?.id,
          messaging?.page_id,
        ]);
        if (!connection) {
          ignored += attachments.length;
          continue;
        }
        ensureSettings(connection.client_id, connection.agency_id);
        for (let index = 0; index < attachments.length; index += 1) {
          const result = await processMessagingAttachment({
            entry,
            messaging,
            attachment: attachments[index],
            index,
            connection,
          });
          if (result.created) created += 1;
          if (result.failed) failed += 1;
          else if (result.ignored) ignored += 1;
        }
      }
    }
    db.prepare(`
      UPDATE instagram_story_webhook_events SET
        status = ?, processed_at = datetime('now')
      WHERE event_key = ?
    `).run(created ? 'processed' : 'ignored', eventKey);
    return { duplicate: false, created, ignored, failed };
  } catch (error) {
    db.prepare(`
      UPDATE instagram_story_webhook_events SET
        status = 'failed', error_message = ?, processed_at = datetime('now')
      WHERE event_key = ?
    `).run(error.message || 'Falha ao processar webhook.', eventKey);
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVideoContainer(containerId, token) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const state = await instagramGraphRequest(String(containerId), { fields: 'status_code,status' }, token);
    const code = String(state.status_code || '').toUpperCase();
    if (!code || code === 'FINISHED' || code === 'PUBLISHED') return state;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new InstagramStoryError(state.status || `O Instagram rejeitou o vídeo (${code}).`, { status: 400 });
    }
    await sleep(2000);
  }
  throw new InstagramStoryError('O vídeo ainda está sendo processado pelo Instagram. Tente publicar novamente em alguns instantes.', { status: 409 });
}

async function publishMention(id, { agencyId = null, publicBaseUrl = '' } = {}) {
  const row = agencyId
    ? db.prepare('SELECT * FROM instagram_story_mentions WHERE id = ? AND agency_id = ?').get(id, agencyId)
    : db.prepare('SELECT * FROM instagram_story_mentions WHERE id = ?').get(id);
  if (!row) throw new InstagramStoryError('Story não encontrado.', { status: 404 });
  if (row.status === 'published') return getMentionById(id, row.agency_id);
  if (row.status === 'ignored') throw new InstagramStoryError('Restaure este Story antes de publicá-lo.', { status: 409 });
  if (!row.media_url) throw new InstagramStoryError('A mídia deste Story ainda não está disponível.', { status: 409 });

  const expiresAt = Date.parse(row.expires_at || '');
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    db.prepare("UPDATE instagram_story_mentions SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(id);
    throw new InstagramStoryError('A janela de 24 horas desta mídia já expirou.', { status: 409 });
  }

  const bundle = getClientTokenBundle(row.client_id, row.agency_id);
  if (!bundle?.instagramUserId) {
    throw new InstagramStoryError('Conecte a conta profissional do Instagram deste cliente.', { status: 409 });
  }
  const token = bundle.accessToken;
  if (!token) throw new InstagramStoryError('Reconecte o Instagram para renovar o token de publicação.', { status: 401 });
  if (!supportsStoryPublishing(bundle.accountType)) {
    throw new InstagramStoryError('A publicação de Stories pela API exige uma conta Instagram Business. Altere a conta para Empresa e reconecte.', { status: 409 });
  }

  const sender = await ensureMentionSenderProfile(row, bundle);
  const senderUsername = normalizeUsername(sender.username || row.sender_username);
  if (row.source_kind === 'story_mention' && !senderUsername) {
    throw new InstagramStoryError(
      'Não foi possível identificar quem marcou a conta. Reconecte o Instagram e tente novamente para publicar com o crédito correto.',
      { status: 409 }
    );
  }

  const hostedUrl = absoluteMediaUrl(row.media_url, publicBaseUrl);
  db.prepare(`
    UPDATE instagram_story_mentions SET
      status = 'publishing', error_message = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  try {
    const createParams = { media_type: 'STORIES' };
    const userTags = storyUserTags(senderUsername);
    if (userTags) createParams.user_tags = userTags;
    if (row.media_type === 'video' || String(row.media_mime || '').startsWith('video/')) {
      createParams.video_url = hostedUrl;
    } else {
      createParams.image_url = hostedUrl;
    }

    const container = await instagramGraphPost(`${bundle.instagramUserId}/media`, createParams, token);
    if (!container?.id) throw new InstagramStoryError('O Instagram não retornou o contêiner de publicação.', { status: 502 });
    db.prepare(`
      UPDATE instagram_story_mentions SET
        published_container_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(container.id), id);

    if (createParams.video_url) await waitForVideoContainer(container.id, token);
    const published = await instagramGraphPost(`${bundle.instagramUserId}/media_publish`, {
      creation_id: container.id,
    }, token);
    if (!published?.id) throw new InstagramStoryError('O Instagram não confirmou a publicação do Story.', { status: 502 });

    db.prepare(`
      UPDATE instagram_story_mentions SET
        status = 'published', published_media_id = ?, published_at = datetime('now'),
        error_message = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(published.id), id);
    return getMentionById(id, row.agency_id);
  } catch (error) {
    let message = error?.message || 'Não foi possível publicar o Story.';
    if (/user_tags|user tags|invalid parameter/i.test(message)) {
      message = `O Instagram recusou a marcação de @${senderUsername || 'autor'} neste formato de Story: ${message}`;
    }
    markMentionFailure(id, message);
    if (error instanceof InstagramStoryError) throw error;
    if (error instanceof InstagramOAuthError) {
      throw new InstagramStoryError(message, {
        status: error.status,
        metaCode: error.metaCode,
        metaSubcode: error.metaSubcode,
        traceId: error.traceId,
      });
    }
    throw new InstagramStoryError(message, { status: 502 });
  }
}

async function subscribeClient(clientId, agencyId) {
  const bundle = getClientTokenBundle(clientId, agencyId);
  if (!bundle) throw new InstagramStoryError('Conecte o Instagram antes de ativar o recebimento de Stories.', { status: 404 });
  if (!bundle.instagramUserId) {
    throw new InstagramStoryError('A conta profissional do Instagram não foi identificada.', { status: 409 });
  }
  if (!bundle.accessToken) throw new InstagramStoryError('Reconecte o Instagram para renovar o token.', { status: 401 });

  try {
    await instagramGraphPost(`${bundle.instagramUserId}/subscribed_apps`, {
      subscribed_fields: 'messages',
    }, bundle.accessToken);
    ensureSettings(clientId, agencyId);
    db.prepare(`
      UPDATE instagram_story_settings SET
        subscribed_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ?
    `).run(clientId, agencyId);
    return getSettings(clientId, agencyId);
  } catch (error) {
    ensureSettings(clientId, agencyId);
    db.prepare(`
      UPDATE instagram_story_settings SET
        last_error = ?, updated_at = datetime('now')
      WHERE client_id = ? AND agency_id = ?
    `).run(error.message || 'Não foi possível assinar os webhooks.', clientId, agencyId);
    if (error instanceof InstagramOAuthError) {
      throw new InstagramStoryError(error.message, {
        status: error.status,
        metaCode: error.metaCode,
        metaSubcode: error.metaSubcode,
        traceId: error.traceId,
      });
    }
    throw error;
  }
}

function setupStatus(clientId, agencyId, req = null) {
  const settings = getSettings(clientId, agencyId);
  const connection = getConnectionStatus(clientId, agencyId);
  const granted = new Set(connection?.scopes || []);
  const missingScopes = REQUIRED_STORY_SCOPES.filter((scope) => !granted.has(scope));
  const publicBaseUrl = requestPublicBaseUrl(req);
  const verifyToken = String(
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
    || process.env.META_WEBHOOK_VERIFY_TOKEN
    || ''
  ).trim();
  return {
    settings,
    connection,
    account: connection ? {
      instagram_account_id: connection.instagram_user_id,
      instagram_username: connection.username,
      instagram_name: connection.display_name,
      instagram_picture_url: connection.profile_picture_url,
      account_type: connection.account_type,
    } : null,
    readiness: {
      oauth_configured: Boolean(getConfig().appId && getConfig().appSecret),
      connected: Boolean(connection && connection.status === 'connected'),
      instagram_selected: Boolean(connection?.instagram_user_id),
      story_publish_supported: Boolean(connection && supportsStoryPublishing(connection.account_type)),
      webhook_verify_token_configured: Boolean(verifyToken),
      public_backend_url_configured: Boolean(configuredPublicBaseUrl()),
      missing_scopes: missingScopes,
      ready: Boolean(
        connection
        && connection.status === 'connected'
        && connection.instagram_user_id
        && supportsStoryPublishing(connection.account_type)
        && verifyToken
        && publicBaseUrl
        && missingScopes.length === 0
      ),
    },
    webhook_url: publicBaseUrl ? `${publicBaseUrl}/api/instagram-stories/webhook` : null,
    required_scopes: REQUIRED_STORY_SCOPES,
  };
}

function ignoreMention(id, agencyId, userId) {
  const result = db.prepare(`
    UPDATE instagram_story_mentions SET
      status = 'ignored', ignored_at = datetime('now'), ignored_by = ?,
      error_message = NULL, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND status <> 'published'
  `).run(userId || null, id, agencyId);
  if (!result.changes) throw new InstagramStoryError('Story não encontrado ou já publicado.', { status: 404 });
  return getMentionById(id, agencyId);
}

function restoreMention(id, agencyId) {
  const result = db.prepare(`
    UPDATE instagram_story_mentions SET
      status = 'pending', ignored_at = NULL, ignored_by = NULL,
      error_message = NULL, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND status IN ('ignored','failed')
  `).run(id, agencyId);
  if (!result.changes) throw new InstagramStoryError('Este Story não pode ser restaurado.', { status: 409 });
  return getMentionById(id, agencyId);
}

module.exports = {
  InstagramStoryError,
  REQUIRED_STORY_SCOPES,
  configuredPublicBaseUrl,
  requestPublicBaseUrl,
  getSettings,
  updateSettings,
  processWebhookPayload,
  publishMention,
  subscribeClient,
  setupStatus,
  getMentionById,
  serializeMention,
  ignoreMention,
  restoreMention,
};
