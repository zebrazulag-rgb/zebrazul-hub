const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function canAccessClient(req, clientId) {
  if (req.user.role === 'client') return req.user.client_id === Number(clientId);
  return true; // admin e team veem tudo
}

router.get('/', (req, res) => {
  const { client_id, status } = req.query;
  let query = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  if (req.user.role === 'client') {
    query += ' AND client_id = ?';
    params.push(req.user.client_id);
  } else if (client_id) {
    query += ' AND client_id = ?';
    params.push(client_id);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY COALESCE(scheduled_at, created_at) ASC';
  const posts = db.prepare(query).all(...params);
  res.json({ posts });
});

router.get('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!canAccessClient(req, post.client_id)) return res.status(403).json({ error: 'Acesso negado' });
  const comments = db.prepare(
    `SELECT pc.*, u.name as user_name, u.role as user_role FROM post_comments pc
     JOIN users u ON u.id = pc.user_id WHERE pc.post_id = ? ORDER BY pc.created_at ASC`
  ).all(req.params.id);
  res.json({ post, comments });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const { client_id, title, caption, content_type, platforms, media_url, media_data, media_mime, scheduled_at, status } = req.body;
  if (!client_id || !title) return res.status(400).json({ error: 'client_id e title sao obrigatorios' });

  const info = db.prepare(
    `INSERT INTO posts (client_id, created_by, title, caption, content_type, platforms, media_url, media_data, media_mime, scheduled_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    client_id, req.user.id, title, caption || '', content_type || 'feed',
    JSON.stringify(platforms || []), media_url || null, media_data || null, media_mime || null,
    scheduled_at || null, status || 'draft'
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

// Gera (ou retorna, se já existir) o link público de aprovação do post
router.post('/:id/share', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (!canAccessClient(req, post.client_id)) return res.status(403).json({ error: 'Acesso negado' });

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
  if (!canAccessClient(req, post.client_id)) return res.status(403).json({ error: 'Acesso negado' });

  const { title, caption, content_type, platforms, media_url, media_data, media_mime, scheduled_at, status, client_feedback } = req.body;

  // Cliente so pode alterar o status para approved/rejected e deixar feedback
  if (req.user.role === 'client') {
    if (status && !['approved', 'rejected'].includes(status)) {
      return res.status(403).json({ error: 'Cliente so pode aprovar ou reprovar' });
    }
    db.prepare('UPDATE posts SET status = COALESCE(?, status), client_feedback = COALESCE(?, client_feedback), updated_at = datetime(\'now\') WHERE id = ?')
      .run(status, client_feedback, req.params.id);
    return res.json({ ok: true });
  }

  db.prepare(
    `UPDATE posts SET
      title = COALESCE(?, title),
      caption = COALESCE(?, caption),
      content_type = COALESCE(?, content_type),
      platforms = COALESCE(?, platforms),
      media_url = COALESCE(?, media_url),
      media_data = COALESCE(?, media_data),
      media_mime = COALESCE(?, media_mime),
      scheduled_at = COALESCE(?, scheduled_at),
      status = COALESCE(?, status),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title, caption, content_type,
    platforms ? JSON.stringify(platforms) : null,
    media_url, media_data, media_mime, scheduled_at, status, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin', 'team'), (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/comments', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!canAccessClient(req, post.client_id)) return res.status(403).json({ error: 'Acesso negado' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatoria' });

  const info = db.prepare('INSERT INTO post_comments (post_id, user_id, message) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, message);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
