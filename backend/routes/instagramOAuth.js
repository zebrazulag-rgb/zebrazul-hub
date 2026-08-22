const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient, requirePermission } = require('../middleware/auth');
const {
  InstagramOAuthError,
  getConfig,
  getOAuthStatus,
  buildAuthorizationUrl,
  createOAuthState,
  consumeOAuthState,
  exchangeCodeForToken,
  saveOAuthConnection,
  getConnectionStatus,
  disconnectOAuth,
  popupHtml,
} = require('../services/instagramOAuth');

const router = express.Router();

function apiError(res, error) {
  if (error instanceof InstagramOAuthError) {
    return res.status(error.status || 400).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[INSTAGRAM OAUTH] Erro não tratado:', error);
  return res.status(500).json({ error: 'Erro interno na conexão com o Instagram.' });
}

function ensureAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
    return false;
  }
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?')
    .get(clientId, req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return false;
  }
  return client;
}

function callbackUrl(req) {
  const configured = getConfig().redirectUri;
  if (configured) return configured;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}/api/instagram-oauth/callback`;
}

router.get('/callback', async (req, res) => {
  let stateRow = null;
  try {
    stateRow = consumeOAuthState(req.query.state);
    if (req.query.error || req.query.error_reason) {
      const reason = req.query.error_description || req.query.error_reason || 'A autorização foi cancelada.';
      return res.status(400).type('html').send(popupHtml({
        ok: false,
        frontendOrigin: stateRow.frontend_origin,
        clientId: stateRow.client_id,
        message: reason,
      }));
    }
    if (!req.query.code) throw new InstagramOAuthError('O Instagram não retornou o código de autorização.');
    const token = await exchangeCodeForToken({ code: req.query.code, redirectUri: stateRow.redirect_uri });
    await saveOAuthConnection({ stateRow, token });
    return res.type('html').send(popupHtml({
      ok: true,
      frontendOrigin: stateRow.frontend_origin,
      clientId: stateRow.client_id,
      message: 'Conta profissional autorizada. Volte ao ZebraHub e ative o recebimento.',
    }));
  } catch (error) {
    console.error('[INSTAGRAM OAUTH CALLBACK]', error);
    return res.status(error.status || 400).type('html').send(popupHtml({
      ok: false,
      frontendOrigin: stateRow?.frontend_origin,
      clientId: stateRow?.client_id,
      message: error.message || 'Não foi possível concluir a conexão.',
    }));
  }
});

router.use(authRequired);
router.use(requirePermission('social.connections'));

router.get('/status/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  const client = ensureAccess(req, res, clientId);
  if (!client) return;
  res.set('Cache-Control', 'no-store');
  res.json({
    oauth: { ...getOAuthStatus(), redirect_uri: callbackUrl(req) },
    connection: getConnectionStatus(clientId, req.user.agency_id),
    client: { id: client.id, name: client.name },
  });
});

router.post('/start/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  const client = ensureAccess(req, res, clientId);
  if (!client) return;
  try {
    const status = getOAuthStatus();
    if (!status.configured) {
      return res.status(503).json({ error: 'Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET no Railway antes de conectar.' });
    }
    const redirectUri = callbackUrl(req);
    const state = createOAuthState({
      agencyId: req.user.agency_id,
      clientId,
      userId: req.user.id,
      frontendOrigin: req.body?.origin || req.get('origin'),
      redirectUri,
    });
    res.json({
      authorization_url: buildAuthorizationUrl({ redirectUri, state }),
      redirect_uri: redirectUri,
      client: { id: client.id, name: client.name },
    });
  } catch (error) {
    apiError(res, error);
  }
});

router.delete('/client/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureAccess(req, res, clientId)) return;
  try {
    disconnectOAuth(clientId, req.user.agency_id);
    res.json({ ok: true });
  } catch (error) {
    apiError(res, error);
  }
});

module.exports = router;
