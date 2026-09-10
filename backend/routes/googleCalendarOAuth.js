const express = require('express');
const db = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const {
  GoogleCalendarError,
  getConfig,
  getOAuthStatus,
  buildAuthorizationUrl,
  createOAuthState,
  consumeOAuthState,
  exchangeCodeForToken,
  saveConnection,
  getConnectionStatus,
  syncRecordingEvent,
  disconnect,
  popupHtml,
} = require('../services/googleCalendar');

const router = express.Router();

function callbackUrl(req) {
  const configured = getConfig().redirectUri;
  if (configured) return configured;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}/api/google-calendar-oauth/callback`;
}

router.get('/callback', async (req, res) => {
  let stateRow = null;
  try {
    stateRow = consumeOAuthState(req.query.state);
    if (req.query.error) {
      const reason = req.query.error_description || 'A autorização foi cancelada.';
      return res.status(400).type('html').send(popupHtml({ ok: false, frontendOrigin: stateRow.frontend_origin, message: reason }));
    }
    if (!req.query.code) throw new GoogleCalendarError('O Google não retornou o código de autorização.');
    const token = await exchangeCodeForToken({ code: req.query.code, redirectUri: stateRow.redirect_uri });
    await saveConnection({ stateRow, token });

    // Ao conectar pela primeira vez, envia também as gravações futuras que já
    // estavam marcadas no ZebraHub e ainda não possuíam evento no Google.
    const pendingRecordings = db.prepare(`
      SELECT r.*, c.name AS client_name
      FROM audiovisual_recordings r
      JOIN clients c ON c.id = r.client_id
      WHERE r.agency_id = ? AND r.status = 'scheduled'
        AND r.google_event_id IS NULL
        AND replace(r.scheduled_start, 'T', ' ') >= datetime('now', '-3 hours')
      ORDER BY r.scheduled_start ASC
      LIMIT 100
    `).all(stateRow.agency_id);
    for (const recording of pendingRecordings) {
      try {
        const sync = await syncRecordingEvent({ recording, clientName: recording.client_name, agencyId: stateRow.agency_id });
        if (sync?.event_id || sync?.html_link) {
          db.prepare(`
            UPDATE audiovisual_recordings
            SET google_event_id = ?, google_event_link = ?, updated_at = datetime('now')
            WHERE id = ? AND agency_id = ?
          `).run(sync.event_id || null, sync.html_link || null, recording.id, stateRow.agency_id);
        }
      } catch (syncError) {
        console.warn('[GOOGLE CALENDAR OAUTH] Falha ao sincronizar gravação existente:', syncError.message);
      }
    }

    return res.type('html').send(popupHtml({
      ok: true,
      frontendOrigin: stateRow.frontend_origin,
      message: 'Autorização concluída. As novas gravações do ZebraHub poderão ser sincronizadas com seu Google Agenda.',
    }));
  } catch (error) {
    console.error('[GOOGLE CALENDAR OAUTH CALLBACK]', error);
    return res.status(error.status || 400).type('html').send(popupHtml({
      ok: false,
      frontendOrigin: stateRow?.frontend_origin,
      message: error.message || 'Não foi possível concluir a conexão.',
    }));
  }
});

router.use(authRequired);

router.get('/status', requirePermission('audiovisual.view'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    oauth: { ...getOAuthStatus(), redirect_uri: callbackUrl(req) },
    connection: getConnectionStatus(req.user.agency_id),
  });
});

router.post('/start', requirePermission('audiovisual.calendar'), (req, res) => {
  try {
    const status = getOAuthStatus();
    if (!status.configured) {
      return res.status(503).json({ error: 'Configure GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET no Railway antes de conectar.' });
    }
    const redirectUri = callbackUrl(req);
    const state = createOAuthState({
      agencyId: req.user.agency_id,
      userId: req.user.id,
      frontendOrigin: req.body?.origin || req.get('origin'),
      redirectUri,
    });
    res.json({ authorization_url: buildAuthorizationUrl({ redirectUri, state }), redirect_uri: redirectUri });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível iniciar a conexão com o Google Agenda.' });
  }
});

router.delete('/connection', requirePermission('audiovisual.calendar'), (req, res) => {
  disconnect(req.user.agency_id);
  res.json({ ok: true });
});

module.exports = router;
