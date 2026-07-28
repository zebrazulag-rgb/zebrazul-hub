const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const {
  MetaOAuthError,
  getConfig,
  getOAuthStatus,
  buildAuthorizationUrl,
  createOAuthState,
  consumeOAuthState,
  exchangeCodeForToken,
  saveOAuthConnection,
  getConnectionStatus,
  getClientAssets,
  saveClientSelections,
  disconnectOAuth,
  popupHtml,
} = require('../services/metaOAuth');

const router = express.Router();

function apiError(res, error) {
  if (error instanceof MetaOAuthError) {
    return res.status(error.status || 400).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[META OAUTH] Erro nao tratado:', error);
  return res.status(500).json({ error: 'Erro interno na conexao com a Meta.' });
}

function ensureAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
    return false;
  }
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?')
    .get(clientId, req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente nao encontrado.' });
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
  return `${protocol}://${host}/api/meta-oauth/callback`;
}

router.get('/callback', async (req, res) => {
  let stateRow = null;
  try {
    stateRow = consumeOAuthState(req.query.state);
    if (req.query.error) {
      const reason = req.query.error_description || 'A autorizacao foi cancelada.';
      return res.status(400).type('html').send(popupHtml({
        ok: false,
        frontendOrigin: stateRow.frontend_origin,
        clientId: stateRow.client_id,
        message: reason,
      }));
    }
    if (!req.query.code) throw new MetaOAuthError('A Meta nao retornou o codigo de autorizacao.');
    const token = await exchangeCodeForToken({ code: req.query.code, redirectUri: stateRow.redirect_uri });
    await saveOAuthConnection({ stateRow, token });
    return res.type('html').send(popupHtml({
      ok: true,
      frontendOrigin: stateRow.frontend_origin,
      clientId: stateRow.client_id,
      message: 'Autorizacao concluida. Volte ao ZebraHub para escolher os perfis e a conta de anuncios.',
    }));
  } catch (error) {
    console.error('[META OAUTH CALLBACK]', error);
    return res.status(error.status || 400).type('html').send(popupHtml({
      ok: false,
      frontendOrigin: stateRow?.frontend_origin,
      clientId: stateRow?.client_id,
      message: error.message || 'Nao foi possivel concluir a conexao.',
    }));
  }
});

router.use(authRequired);

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
      return res.status(503).json({ error: 'Configure META_APP_ID e META_APP_SECRET no Railway antes de conectar.' });
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

router.get('/assets/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureAccess(req, res, clientId)) return;
  try {
    const assets = await getClientAssets(clientId, req.user.agency_id);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...assets,
      connection: getConnectionStatus(clientId, req.user.agency_id),
    });
  } catch (error) {
    apiError(res, error);
  }
});

router.put('/client/:clientId/selections', async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureAccess(req, res, clientId)) return;
  try {
    const pageId = String(req.body?.page_id || '').trim() || null;
    const adAccountId = String(req.body?.ad_account_id || '').trim().replace(/^act_/, '') || null;
    if (!pageId && !adAccountId) {
      return res.status(400).json({ error: 'Selecione ao menos uma Pagina/Instagram ou conta de anuncios.' });
    }
    const connection = await saveClientSelections({
      clientId,
      agencyId: req.user.agency_id,
      pageId,
      adAccountId,
    });
    res.json({ connection });
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
