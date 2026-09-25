const {
  InstagramOAuthError,
  getConfig,
  getConnectionStatus,
  getClientTokenBundle,
  instagramGraphRequest,
} = require('./instagramOAuth');

const REQUIRED_SCOPE = 'instagram_business_manage_messages';
const DEFAULT_LIMIT = 25;
const REQUEST_TIMEOUT_MS = Number(process.env.INSTAGRAM_REQUEST_TIMEOUT_MS || 30000);

class InstagramMessageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstagramMessageError';
    this.status = details.status || 400;
    this.metaCode = details.metaCode || null;
    this.metaSubcode = details.metaSubcode || null;
    this.traceId = details.traceId || null;
  }
}

function wrapInstagramError(error) {
  if (error instanceof InstagramMessageError) return error;
  if (error instanceof InstagramOAuthError) {
    return new InstagramMessageError(error.message, {
      status: error.status,
      metaCode: error.metaCode,
      metaSubcode: error.metaSubcode,
      traceId: error.traceId,
    });
  }
  return new InstagramMessageError(error?.message || 'Não foi possível comunicar com o Instagram.', { status: 502 });
}

function messagingBundle(clientId, agencyId) {
  const connection = getConnectionStatus(clientId, agencyId);
  if (!connection || connection.status !== 'connected') {
    throw new InstagramMessageError('Conecte a conta profissional do Instagram antes de abrir as mensagens.', { status: 409 });
  }
  const scopes = new Set(connection.scopes || []);
  if (!scopes.has(REQUIRED_SCOPE)) {
    throw new InstagramMessageError(
      'A conexão atual não autorizou mensagens. Reconecte o Instagram e permita o acesso às mensagens.',
      { status: 409 }
    );
  }
  const bundle = getClientTokenBundle(clientId, agencyId);
  if (!bundle?.instagramUserId || !bundle?.accessToken) {
    throw new InstagramMessageError('A conexão do Instagram está incompleta. Reconecte a conta.', { status: 409 });
  }
  return { connection, bundle };
}


async function resolveMessagingUserId(bundle) {
  const fallback = String(bundle?.instagramUserId || '').trim();
  if (!fallback) return null;

  for (const target of [fallback, 'me']) {
    try {
      const profile = await instagramGraphRequest(target, {
        fields: 'id,user_id,username',
      }, bundle.accessToken);
      const resolved = String(profile?.user_id || profile?.id || '').trim();
      if (resolved) return resolved;
    } catch {}
  }
  return fallback;
}

function arrayData(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeParticipant(value) {
  if (!value) return null;
  return {
    id: value.id ? String(value.id) : null,
    username: value.username || null,
    name: value.name || null,
    profile_picture_url: value.profile_pic || value.profile_picture_url || null,
  };
}

function attachmentUrl(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  return attachment.image_data?.url
    || attachment.video_data?.url
    || attachment.file_url
    || attachment.payload?.url
    || attachment.url
    || null;
}

function normalizeAttachment(attachment) {
  const type = String(attachment?.mime_type || attachment?.type || attachment?.media_type || '').toLowerCase();
  const url = attachmentUrl(attachment);
  return {
    type: type.includes('video') ? 'video' : type.includes('image') ? 'image' : (attachment?.type || 'attachment'),
    url,
    title: attachment?.name || attachment?.title || null,
  };
}

function normalizeMessage(message, instagramUserId) {
  const from = normalizeParticipant(message?.from);
  const to = arrayData(message?.to).map(normalizeParticipant).filter(Boolean);
  const attachments = arrayData(message?.attachments).map(normalizeAttachment).filter((item) => item.url || item.title);
  return {
    id: message?.id ? String(message.id) : null,
    created_time: message?.created_time || null,
    text: message?.message || message?.text || '',
    from,
    to,
    attachments,
    is_from_business: Boolean(from?.id && String(from.id) === String(instagramUserId)),
  };
}

function peerFromParticipants(participants, instagramUserId) {
  const normalized = arrayData(participants).map(normalizeParticipant).filter(Boolean);
  return normalized.find((item) => item.id && String(item.id) !== String(instagramUserId))
    || normalized[0]
    || null;
}

async function enrichPeer(peer, accessToken) {
  if (!peer?.id) return peer;
  if (peer.username && peer.name && peer.profile_picture_url) return peer;
  try {
    const profile = await instagramGraphRequest(peer.id, {
      fields: 'name,username,profile_pic',
    }, accessToken);
    return {
      ...peer,
      username: profile?.username || peer.username || null,
      name: profile?.name || peer.name || null,
      profile_picture_url: profile?.profile_pic || peer.profile_picture_url || null,
    };
  } catch {
    return peer;
  }
}

async function listConversations(clientId, agencyId, { limit = DEFAULT_LIMIT, after = null } = {}) {
  try {
    const { connection, bundle } = messagingBundle(clientId, agencyId);
    const messagingUserId = await resolveMessagingUserId(bundle);
    const safeLimit = Math.max(1, Math.min(Number(limit || DEFAULT_LIMIT), 50));
    const params = {
      fields: 'id,updated_time,participants,messages.limit(1){id,created_time,from,to,message,attachments}',
      limit: safeLimit,
      after: after || undefined,
    };

    let payload;
    try {
      payload = await instagramGraphRequest(`${messagingUserId}/conversations`, params, bundle.accessToken);
    } catch (error) {
      // Algumas versões/contas podem rejeitar a expansão de messages na listagem.
      // Fazemos uma segunda consulta só com os campos universais da conversa.
      payload = await instagramGraphRequest(`${messagingUserId}/conversations`, {
        fields: 'id,updated_time,participants',
        limit: safeLimit,
        after: after || undefined,
      }, bundle.accessToken);
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const conversations = await Promise.all(rows.map(async (row) => {
      let peer = peerFromParticipants(row.participants, messagingUserId);
      peer = await enrichPeer(peer, bundle.accessToken);
      const latestRaw = arrayData(row.messages)[0] || null;
      const latest = latestRaw ? normalizeMessage(latestRaw, messagingUserId) : null;
      return {
        id: String(row.id),
        updated_time: row.updated_time || latest?.created_time || null,
        peer,
        latest_message: latest,
      };
    }));

    conversations.sort((a, b) => {
      const left = Date.parse(a.updated_time || '') || 0;
      const right = Date.parse(b.updated_time || '') || 0;
      return right - left;
    });

    return {
      account: {
        id: messagingUserId,
        username: connection.username || bundle.username || null,
        display_name: connection.display_name || null,
        profile_picture_url: connection.profile_picture_url || null,
      },
      conversations,
      next_cursor: payload?.paging?.cursors?.after || null,
      has_next: Boolean(payload?.paging?.next),
    };
  } catch (error) {
    throw wrapInstagramError(error);
  }
}

async function conversationInfo(conversationId, bundle, messagingUserId = null) {
  const payload = await instagramGraphRequest(String(conversationId), {
    fields: 'id,updated_time,participants',
  }, bundle.accessToken);
  const selfId = messagingUserId || bundle.instagramUserId;
  let peer = peerFromParticipants(payload?.participants, selfId);
  peer = await enrichPeer(peer, bundle.accessToken);
  return {
    id: String(payload?.id || conversationId),
    updated_time: payload?.updated_time || null,
    peer,
  };
}

async function getConversation(clientId, agencyId, conversationId, { limit = 50, before = null, after = null } = {}) {
  try {
    const { connection, bundle } = messagingBundle(clientId, agencyId);
    const messagingUserId = await resolveMessagingUserId(bundle);
    const info = await conversationInfo(conversationId, bundle, messagingUserId);
    const safeLimit = Math.max(1, Math.min(Number(limit || 50), 100));
    let payload;
    try {
      payload = await instagramGraphRequest(`${conversationId}/messages`, {
        fields: 'id,created_time,from,to,message,attachments',
        limit: safeLimit,
        before: before || undefined,
        after: after || undefined,
      }, bundle.accessToken);
    } catch (error) {
      // Fallback documentado pela Conversations API: expandir messages na própria conversa.
      const expanded = await instagramGraphRequest(String(conversationId), {
        fields: `messages.limit(${Math.min(safeLimit, 20)}){id,created_time,from,to,message,attachments}`,
      }, bundle.accessToken);
      payload = expanded?.messages || { data: [] };
    }

    const messages = (Array.isArray(payload?.data) ? payload.data : [])
      .map((row) => normalizeMessage(row, messagingUserId))
      .sort((a, b) => (Date.parse(a.created_time || '') || 0) - (Date.parse(b.created_time || '') || 0));

    return {
      account: {
        id: messagingUserId,
        username: connection.username || bundle.username || null,
        display_name: connection.display_name || null,
        profile_picture_url: connection.profile_picture_url || null,
      },
      conversation: info,
      messages,
      paging: {
        before: payload?.paging?.cursors?.before || null,
        after: payload?.paging?.cursors?.after || null,
        next: Boolean(payload?.paging?.next),
        previous: Boolean(payload?.paging?.previous),
      },
    };
  } catch (error) {
    throw wrapInstagramError(error);
  }
}

async function jsonPost(path, body, accessToken) {
  const config = getConfig();
  const url = new URL(`https://graph.instagram.com/${config.apiVersion}/${String(path).replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok || payload?.error) {
      const apiError = payload?.error || {};
      throw new InstagramMessageError(apiError.message || 'O Instagram não aceitou o envio da mensagem.', {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
        metaCode: apiError.code,
        metaSubcode: apiError.error_subcode,
        traceId: apiError.fbtrace_id,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof InstagramMessageError) throw error;
    if (error?.name === 'AbortError') {
      throw new InstagramMessageError('O Instagram demorou demais para responder.', { status: 504 });
    }
    throw new InstagramMessageError('Não foi possível enviar a mensagem para o Instagram.', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTextMessage(clientId, agencyId, conversationId, text) {
  try {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) throw new InstagramMessageError('Digite uma mensagem.', { status: 400 });
    if (normalizedText.length > 1000) {
      throw new InstagramMessageError('A mensagem deve ter no máximo 1.000 caracteres.', { status: 400 });
    }

    const { bundle } = messagingBundle(clientId, agencyId);
    const messagingUserId = await resolveMessagingUserId(bundle);
    const info = await conversationInfo(conversationId, bundle, messagingUserId);
    if (!info.peer?.id) {
      throw new InstagramMessageError('Não foi possível identificar o destinatário desta conversa.', { status: 409 });
    }

    const result = await jsonPost(`${messagingUserId}/messages`, {
      recipient: { id: info.peer.id },
      message: { text: normalizedText },
    }, bundle.accessToken);

    return {
      ok: true,
      recipient_id: result?.recipient_id || info.peer.id,
      message_id: result?.message_id || null,
    };
  } catch (error) {
    throw wrapInstagramError(error);
  }
}

function status(clientId, agencyId) {
  try {
    const connection = getConnectionStatus(clientId, agencyId);
    const scopes = new Set(connection?.scopes || []);
    return {
      connected: Boolean(connection && connection.status === 'connected'),
      status: connection?.status || 'disconnected',
      username: connection?.username || null,
      display_name: connection?.display_name || null,
      profile_picture_url: connection?.profile_picture_url || null,
      instagram_user_id: connection?.instagram_user_id || null,
      permission_granted: scopes.has(REQUIRED_SCOPE),
      required_scope: REQUIRED_SCOPE,
    };
  } catch (error) {
    throw wrapInstagramError(error);
  }
}

module.exports = {
  InstagramMessageError,
  REQUIRED_SCOPE,
  status,
  listConversations,
  getConversation,
  sendTextMessage,
};
