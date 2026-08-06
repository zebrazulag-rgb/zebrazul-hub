const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const {
  InstagramStoryError,
  requestPublicBaseUrl,
  updateSettings,
  publishMention,
  publishFacebookTagTest,
  getFacebookTagTestStatus,
  subscribeClient,
  setupStatus,
  getMentionById,
  serializeMention,
  ignoreMention,
  restoreMention,
} = require('../services/instagramStories');

const router = express.Router();
router.use(authRequired);

function apiError(res, error) {
  if (error instanceof InstagramStoryError) {
    return res.status(error.status || 400).json({
      error: error.message,
      meta_code: error.metaCode,
      meta_subcode: error.metaSubcode,
      trace_id: error.traceId,
    });
  }
  console.error('[INSTAGRAM STORIES] Erro não tratado:', error);
  return res.status(500).json({ error: 'Erro interno na Central de Stories.' });
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

function accessibleClientIds(user) {
  if (user.role === 'admin' || user.is_operations_head) {
    return db.prepare('SELECT id FROM clients WHERE agency_id = ? ORDER BY id')
      .all(user.agency_id).map((row) => Number(row.id));
  }
  if (user.role === 'client') return user.client_id ? [Number(user.client_id)] : [];
  return Array.isArray(user.client_ids) ? user.client_ids.map(Number).filter(Boolean) : [];
}

function queryScope(req, requestedClientId = null) {
  if (requestedClientId) {
    if (!canAccessClient(req.user, requestedClientId)) return null;
    return [Number(requestedClientId)];
  }
  return accessibleClientIds(req.user);
}

router.get('/', (req, res) => {
  // Recupera cards presos em "Publicando" caso o processo anterior tenha
  // sido interrompido por restart/deploy do servidor.
  db.prepare(`
    UPDATE instagram_story_mentions SET
      status = 'failed',
      error_message = 'A publicação foi interrompida antes da confirmação. Tente novamente.',
      updated_at = datetime('now')
    WHERE agency_id = ?
      AND status = 'publishing'
      AND datetime(updated_at) < datetime('now', '-5 minutes')
  `).run(req.user.agency_id);

  const clientId = Number(req.query.client_id || 0) || null;
  const ids = queryScope(req, clientId);
  if (!ids) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  if (!ids.length) return res.json({ stories: [], stats: {} });

  const allowedStatuses = new Set(['pending', 'publishing', 'published', 'ignored', 'failed', 'expired']);
  const status = allowedStatuses.has(String(req.query.status || '')) ? String(req.query.status) : null;
  const search = String(req.query.search || '').trim();
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 200));
  const placeholders = ids.map(() => '?').join(',');
  const where = [`ism.agency_id = ?`, `ism.client_id IN (${placeholders})`];
  const values = [req.user.agency_id, ...ids];
  if (status) {
    where.push('ism.status = ?');
    values.push(status);
  }
  if (search) {
    where.push(`(
      lower(COALESCE(ism.sender_username, '')) LIKE ? OR
      lower(COALESCE(ism.sender_name, '')) LIKE ? OR
      lower(c.name) LIKE ?
    )`);
    const term = `%${search.toLowerCase()}%`;
    values.push(term, term, term);
  }

  const rows = db.prepare(`
    SELECT ism.*, c.name AS client_name, c.avatar_data AS client_avatar
    FROM instagram_story_mentions ism
    JOIN clients c ON c.id = ism.client_id
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(ism.received_at) DESC, ism.id DESC
    LIMIT ?
  `).all(...values, limit);

  const statsRows = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM instagram_story_mentions
    WHERE agency_id = ? AND client_id IN (${placeholders})
    GROUP BY status
  `).all(req.user.agency_id, ...ids);
  const stats = statsRows.reduce((acc, row) => {
    acc[row.status] = Number(row.total || 0);
    acc.total += Number(row.total || 0);
    return acc;
  }, { total: 0, pending: 0, publishing: 0, published: 0, ignored: 0, failed: 0, expired: 0 });

  return res.json({ stories: rows.map(serializeMention), stats });
});

router.get('/setup/:clientId', (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ client, ...setupStatus(client.id, req.user.agency_id, req) });
  } catch (error) {
    apiError(res, error);
  }
});

router.put('/settings/:clientId', requireRole('admin', 'team'), (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    const settings = updateSettings({
      clientId: client.id,
      agencyId: req.user.agency_id,
      enabled: Boolean(req.body?.enabled),
      mode: req.body?.mode,
      allowedUsernames: req.body?.allowed_usernames,
    });
    res.json({ settings });
  } catch (error) {
    apiError(res, error);
  }
});

router.post('/subscribe/:clientId', requireRole('admin', 'team'), async (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  try {
    const settings = await subscribeClient(client.id, req.user.agency_id);
    res.json({ settings, setup: setupStatus(client.id, req.user.agency_id, req) });
  } catch (error) {
    apiError(res, error);
  }
});


router.post('/:id/publish-facebook-tag-test', requireRole('admin', 'team'), async (req, res) => {
  const story = getMentionById(Number(req.params.id), req.user.agency_id);
  if (!story) return res.status(404).json({ error: 'Story não encontrado.' });
  if (!ensureClient(req, res, story.client_id)) return;
  try {
    const result = await publishFacebookTagTest(story.id, {
      agencyId: req.user.agency_id,
      publicBaseUrl: requestPublicBaseUrl(req),
    });
    const publishedStory = result.story;
    const payload = {
      story: publishedStory,
      processing: Boolean(result.processing),
      container_status: result.container_status || null,
      next_check_seconds: result.next_check_seconds || 30,
      test: {
        channel: 'facebook_tag_test',
        username: publishedStory.tagging_username || publishedStory.sender_username || null,
        message: result.processing
          ? 'A Meta recebeu o Story e está processando a mídia. O ZebraHub vai concluir automaticamente.'
          : 'A Meta aceitou e publicou o contêiner com user_tags. Confirme no Instagram se a conta recebeu a marcação.',
      },
    };
    return res.status(result.processing ? 202 : 200).json(payload);
  } catch (error) {
    apiError(res, error);
  }
});

router.get('/:id/facebook-tag-test-status', requireRole('admin', 'team'), async (req, res) => {
  const story = getMentionById(Number(req.params.id), req.user.agency_id);
  if (!story) return res.status(404).json({ error: 'Story não encontrado.' });
  if (!ensureClient(req, res, story.client_id)) return;
  try {
    const result = await getFacebookTagTestStatus(story.id, {
      agencyId: req.user.agency_id,
    });
    return res.json({
      story: result.story,
      processing: Boolean(result.processing),
      container_status: result.container_status || null,
      next_check_seconds: result.next_check_seconds || 30,
    });
  } catch (error) {
    apiError(res, error);
  }
});

router.post('/:id/publish', async (req, res) => {
  const story = getMentionById(Number(req.params.id), req.user.agency_id);
  if (!story) return res.status(404).json({ error: 'Story não encontrado.' });
  if (!ensureClient(req, res, story.client_id)) return;
  try {
    const published = await publishMention(story.id, {
      agencyId: req.user.agency_id,
      publicBaseUrl: requestPublicBaseUrl(req),
    });
    res.json({ story: published });
  } catch (error) {
    apiError(res, error);
  }
});

router.post('/:id/ignore', (req, res) => {
  const story = getMentionById(Number(req.params.id), req.user.agency_id);
  if (!story) return res.status(404).json({ error: 'Story não encontrado.' });
  if (!ensureClient(req, res, story.client_id)) return;
  try {
    res.json({ story: ignoreMention(story.id, req.user.agency_id, req.user.id) });
  } catch (error) {
    apiError(res, error);
  }
});

router.post('/:id/restore', (req, res) => {
  const story = getMentionById(Number(req.params.id), req.user.agency_id);
  if (!story) return res.status(404).json({ error: 'Story não encontrado.' });
  if (!ensureClient(req, res, story.client_id)) return;
  try {
    res.json({ story: restoreMention(story.id, req.user.agency_id) });
  } catch (error) {
    apiError(res, error);
  }
});

module.exports = router;
