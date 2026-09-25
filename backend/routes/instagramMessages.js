const express = require('express');
const db = require('../db/database');
const { canAccessClient } = require('../middleware/auth');
const {
  InstagramMessageError,
  status,
  listConversations,
  getConversation,
  sendTextMessage,
} = require('../services/instagramMessages');

const router = express.Router();

function apiError(res, error) {
  if (error instanceof InstagramMessageError) {
    return res.status(error.status || 400).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[INSTAGRAM MESSAGES] Erro não tratado:', error);
  return res.status(500).json({ error: 'Erro interno ao acessar as mensagens do Instagram.' });
}

function ensureClient(req, res, clientId) {
  const id = Number(clientId);
  if (!id || !canAccessClient(req.user, id)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
    return null;
  }
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?')
    .get(id, req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return null;
  }
  return client;
}

router.get('/:clientId/status', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ client, ...status(client.id, req.user.agency_id) });
  } catch (error) {
    apiError(res, error);
  }
});

router.get('/:clientId/conversations', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    const data = await listConversations(client.id, req.user.agency_id, {
      limit: req.query.limit,
      after: req.query.after,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ client, ...data });
  } catch (error) {
    apiError(res, error);
  }
});

router.get('/:clientId/conversations/:conversationId', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    const data = await getConversation(client.id, req.user.agency_id, req.params.conversationId, {
      limit: req.query.limit,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ client, ...data });
  } catch (error) {
    apiError(res, error);
  }
});

router.post('/:clientId/conversations/:conversationId/messages', async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    const result = await sendTextMessage(
      client.id,
      req.user.agency_id,
      req.params.conversationId,
      req.body?.message
    );
    res.status(201).json(result);
  } catch (error) {
    apiError(res, error);
  }
});

module.exports = router;
