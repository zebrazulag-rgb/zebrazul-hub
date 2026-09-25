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
  const rawType = String(attachment?.mime_type || attachment?.type || attachment?.media_type || '').toLowerCase();
  const url = attachmentUrl(attachment);
  return {
    type: rawType.includes('video') ? 'video' : rawType.includes('image') ? 'image' : (attachment?.type || 'attachment'),
    url,
    title: attachment?.name || attachment?.title || null,
  };
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function businessIdentity(connection, bundle) {
  const ids = new Set([
    bundle?.instagramUserId,
    bundle?.instagram_user_id,
    connection?.instagram_user_id,
    connection?.instagramUserId,
    connection?.id,
  ].filter(Boolean).map((value) => String(value)));
  const usernames = new Set([
    connection?.username,
    bundle?.username,
  ].map(normalizeUsername).filter(Boolean));
  return { ids, usernames };
}

function isBusinessParticipant(participant, identity) {
  if (!participant) return false;
  if (participant.id && identity?.ids?.has(String(participant.id))) return true;
  const username = normalizeUsername(participant.username);
  return Boolean(username && identity?.usernames?.has(username));
}

function normalizeMessage(message, identity) {
  const from = normalizeParticipant(message?.from);
  const to = arrayData(message?.to).map(normalizeParticipant).filter(Boolean);
  const attachments = arrayData(message?.attachments)
    .map(normalizeAttachment)
    .filter((item) => item.url || item.title);
  return {
    id: message?.id ? String(message.id) : null,
    created_time: message?.created_time || null,
    text: message?.message || message?.text || '',
    from,
    to,
    attachments,
    is_from_business: isBusinessParticipant(from, identity),
  };
}

function peerFromParticipants(participants, identity) {
  const normalized = arrayData(participants).map(normalizeParticipant).filter(Boolean);
  const external = normalized.find((item) => !isBusinessParticipant(item, identity));
  return external || null;
}

async function enrichPeer(peer, accessToken) {
  if (!peer?.id || (peer.username && peer.name && peer.profile_picture_url)) return peer;
  try {
    const profile = await instagramGraphRequest(peer.id, { fields: 'name,username,profile_pic' }, accessToken);
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

async function fetchConversationList(bundle, limit, after) {
  const params = {
    fields: 'id,updated_time,participants,messages.limit(1){id,created_time,from,to,message,attachments}',
    limit,
    after: after || undefined,
  };

  // A API com Instagram Login aceita /me/conversations. Mantemos fallback para o
  // ID explícito porque contas/versões antigas podem responder de forma diferente.
  for (const target of ['me/conversations', `${bundle.instagramUserId}/conversations`]) {
    try {
      return await instagramGraphRequest(target, params, bundle.accessToken);
    } catch (error) {
      try {
        return await instagramGraphRequest(target, {
          fields: 'id,updated_time,participants',
          limit,
          after: after || undefined,
        }, bundle.accessToken);
      } catch {
        if (target !== `${bundle.instagramUserId}/conversations`) continue;
        throw error;
      }
    }
  }
  return { data: [] };
}

async function listConversations(clientId, agencyId, { limit = DEFAULT_LIMIT, after = null } = {}) {
  try {
    const { connection, bundle } = messagingBundle(clientId, agencyId);
    const instagramUserId = String(bundle.instagramUserId);
    const identity = businessIdentity(connection, bundle);
    const safeLimit = Math.max(1, Math.min(Number(limit || DEFAULT_LIMIT), 50));
    const payload = await fetchConversationList(bundle, safeLimit, after);
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    const conversations = await Promise.all(rows.map(async (row) => {
      let peer = peerFromParticipants(row.participants, identity);
      peer = await enrichPeer(peer, bundle.accessToken);
      const latestRaw = arrayData(row.messages)[0] || null;
      const latest = latestRaw ? normalizeMessage(latestRaw, identity) : null;
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
        id: instagramUserId,
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

async function conversationInfo(conversationId, bundle, connection = null) {
  const payload = await instagramGraphRequest(String(conversationId), {
    fields: 'id,updated_time,participants',
  }, bundle.accessToken);
  const identity = businessIdentity(connection, bundle);
  let peer = peerFromParticipants(payload?.participants, identity);
  peer = await enrichPeer(peer, bundle.accessToken);
  return {
    id: String(payload?.id || conversationId),
    updated_time: payload?.updated_time || null,
    peer,
  };
}

async function getConversation(clientId, agencyId, conversationId, { limit = 20 } = {}) {
  try {
    const { connection, bundle } = messagingBundle(clientId, agencyId);
    const safeLimit = Math.max(1, Math.min(Number(limit || 20), 20));
    const identity = businessIdentity(connection, bundle);
    let info = null;
    let expanded = null;

    try {
      info = await conversationInfo(conversationId, bundle, connection);
    } catch {
      // Algumas versões retornam participants apenas quando a conversa é expandida.
      expanded = await instagramGraphRequest(String(conversationId), {
        fields: `id,updated_time,participants,messages.limit(${safeLimit}){id,created_time,from,to,message,attachments}`,
      }, bundle.accessToken);
      let peer = peerFromParticipants(expanded?.participants, identity);
      peer = await enrichPeer(peer, bundle.accessToken);
      info = {
        id: String(expanded?.id || conversationId),
        updated_time: expanded?.updated_time || null,
        peer,
      };
    }

    // Para o histórico completo, priorizamos o edge /messages. Em algumas respostas
    // expandidas a Meta retorna os IDs e timestamps, mas omite o corpo da mensagem.
    let messagePayload = null;
    try {
      messagePayload = await instagramGraphRequest(`${conversationId}/messages`, {
        fields: 'id,created_time,from,to,message,attachments',
        limit: safeLimit,
      }, bundle.accessToken);
    } catch (error) {
      if (!expanded) {
        expanded = await instagramGraphRequest(String(conversationId), {
          fields: `id,updated_time,participants,messages.limit(${safeLimit}){id,created_time,from,to,message,attachments}`,
        }, bundle.accessToken);
      }
      messagePayload = expanded?.messages || null;
      if (!messagePayload) throw error;
    }

    const messages = arrayData(messagePayload)
      .map((row) => normalizeMessage(row, identity))
      .sort((a, b) => (Date.parse(a.created_time || '') || 0) - (Date.parse(b.created_time || '') || 0));

    return {
      account: {
        id: String(bundle.instagramUserId),
        username: connection.username || bundle.username || null,
        display_name: connection.display_name || null,
        profile_picture_url: connection.profile_picture_url || null,
      },
      conversation: info,
      messages,
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

    const { connection, bundle } = messagingBundle(clientId, agencyId);
    const info = await conversationInfo(conversationId, bundle, connection);
    if (!info.peer?.id) {
      throw new InstagramMessageError('Não foi possível identificar o destinatário desta conversa.', { status: 409 });
    }

    // /me/messages é o formato oficial da Send API com Instagram Login.
    // Se uma conta/versão exigir o ID explícito, fazemos fallback transparente.
    let result;
    try {
      result = await jsonPost('me/messages', {
        recipient: { id: info.peer.id },
        message: { text: normalizedText },
      }, bundle.accessToken);
    } catch (error) {
      if (error.metaCode === 10 || error.metaCode === 200) throw error;
      result = await jsonPost(`${bundle.instagramUserId}/messages`, {
        recipient: { id: info.peer.id },
        message: { text: normalizedText },
      }, bundle.accessToken);
    }

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
