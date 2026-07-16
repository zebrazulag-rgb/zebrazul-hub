const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function parseGallery(value, fallbackData = null, fallbackMime = null) {
  if (Array.isArray(value)) return value;
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return fallbackData ? [{ data: fallbackData, mime: fallbackMime || 'image/jpeg', filename: '' }] : [];
}

function serializeGallery(value, fallbackData = null, fallbackMime = null) {
  const gallery = parseGallery(value, fallbackData, fallbackMime);
  return gallery.length ? JSON.stringify(gallery) : null;
}

function normalizePost(post) {
  if (!post) return post;
  return {
    ...post,
    media_gallery: parseGallery(post.media_gallery, post.media_data, post.media_mime),
  };
}

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente' });
    return false;
  }
  return true;
}

function appendPostScope(req, query, params) {
  if (req.user.role === 'admin') return query;
  if (req.user.role === 'client') {
    query += ' AND client_id = ?';
    params.push(req.user.client_id);
    return query;
  }
  if (!req.user.client_ids.length) return `${query} AND 0`;
  const placeholders = req.user.client_ids.map(() => '?').join(',');
  query += ` AND client_id IN (${placeholders})`;
  params.push(...req.user.client_ids);
  return query;
}

router.get('/', (req, res) => {
  const { client_id, status } = req.query;
  let query = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  query = appendPostScope(req, query, params);

  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND client_id = ?';
    params.push(Number(client_id));
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY COALESCE(scheduled_at, created_at) ASC';
  const posts = db.prepare(query).all(...params).map(normalizePost);
  res.json({ posts });
});

router.get('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!ensureClientAccess(req, res, post.client_id)) return;
  const comments = db.prepare(
    `SELECT pc.*, u.name as user_name, u.role as user_role FROM post_comments pc
     JOIN users u ON u.id = pc.user_id WHERE pc.post_id = ? ORDER BY pc.created_at ASC`
  ).all(req.params.id);
  res.json({ post: normalizePost(post), comments });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const { client_id, title, caption, content_type, platforms, media_url, media_data, media_mime, media_gallery, scheduled_at, status } = req.body;
  if (!client_id || !title) return res.status(400).json({ error: 'client_id e title sao obrigatorios' });
  if (!ensureClientAccess(req, res, client_id)) return;

  const info = db.prepare(
    `INSERT INTO posts (client_id, created_by, title, caption, content_type, platforms, media_url, media_data, media_mime, media_gallery, scheduled_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    client_id, req.user.id, title, caption || '', content_type || 'feed',
    JSON.stringify(platforms || []), media_url || null,
    media_data || media_gallery?.[0]?.data || null,
    media_mime || media_gallery?.[0]?.mime || null,
    serializeGallery(media_gallery, media_data, media_mime),
    scheduled_at || null, status || 'draft'
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/share', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (!ensureClientAccess(req, res, post.client_id)) return;

  let token = post.share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE posts SET share_token = ? WHERE id = ?').run(token, req.params.id);
  }
  res.json({ token });
});

router.put('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!ensureClientAccess(req, res, post.client_id)) return;

  const { status, client_feedback } = req.body;

  if (req.user.role === 'client') {
    if (status && !['approved', 'rejected'].includes(status)) {
      return res.status(403).json({ error: 'Cliente so pode aprovar ou reprovar' });
    }
    db.prepare(
      `UPDATE posts SET
        status = COALESCE(?, status),
        client_feedback = COALESCE(?, client_feedback),
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, client_feedback, req.params.id);
    return res.json({ ok: true });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'client_id')) {
    const targetClient = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.body.client_id);
    if (!targetClient) return res.status(400).json({ error: 'Cliente invalido' });
    if (!ensureClientAccess(req, res, req.body.client_id)) return;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'title') && !String(req.body.title || '').trim()) {
    return res.status(400).json({ error: 'Titulo e obrigatorio' });
  }

  const allowedFields = [
    'client_id',
    'title',
    'caption',
    'content_type',
    'platforms',
    'media_url',
    'media_data',
    'media_mime',
    'media_gallery',
    'scheduled_at',
    'status',
    'client_feedback',
  ];

  const updates = [];
  const values = [];
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'platforms') {
      values.push(JSON.stringify(req.body.platforms || []));
    } else if (field === 'media_gallery') {
      values.push(serializeGallery(req.body.media_gallery, req.body.media_data, req.body.media_mime));
    } else if (field === 'title') {
      values.push(String(req.body.title).trim());
    } else {
      values.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'media_gallery')) {
    const gallery = parseGallery(req.body.media_gallery);
    const first = gallery[0] || null;
    if (!Object.prototype.hasOwnProperty.call(req.body, 'media_data')) {
      updates.push('media_data = ?');
      values.push(first?.data || null);
    }
    if (!Object.prototype.hasOwnProperty.call(req.body, 'media_mime')) {
      updates.push('media_mime = ?');
      values.push(first?.mime || null);
    }
  }

  if (updates.length > 0) {
    db.prepare(
      `UPDATE posts SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values, req.params.id);
  }

  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin', 'team'), (req, res) => {
  const post = db.prepare('SELECT client_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!ensureClientAccess(req, res, post.client_id)) return;
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/comments', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!ensureClientAccess(req, res, post.client_id)) return;

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatoria' });

  const info = db.prepare('INSERT INTO post_comments (post_id, user_id, message) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, message);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
