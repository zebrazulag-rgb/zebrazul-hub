const express = require('express');
const db = require('../db/database');

const router = express.Router();

function parseGallery(value, fallbackData = null, fallbackMime = null) {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return fallbackData ? [{ data: fallbackData, mime: fallbackMime || 'image/jpeg', filename: '' }] : [];
}

function normalizePost(post) {
  if (!post) return post;
  return { ...post, media_gallery: parseGallery(post.media_gallery, post.media_data, post.media_mime) };
}

// Consulta um post pelo token de compartilhamento - sem autenticação
router.get('/posts/:token', (req, res) => {
  const post = db.prepare(`
    SELECT p.id, p.title, p.caption, p.content_type, p.platforms, p.media_url, p.media_data, p.media_mime, p.media_gallery,
           p.scheduled_at, p.status, p.client_feedback, c.name as client_name, c.logo_color as client_color
    FROM posts p
    JOIN clients c ON c.id = p.client_id
    WHERE p.share_token = ?
  `).get(req.params.token);

  if (!post) return res.status(404).json({ error: 'Link inválido ou expirado' });

  const comments = db.prepare(`
    SELECT pc.message, pc.created_at, u.name as user_name, u.role as user_role
    FROM post_comments pc JOIN users u ON u.id = pc.user_id
    WHERE pc.post_id = ? ORDER BY pc.created_at ASC
  `).all(post.id);

  res.json({ post: normalizePost(post), comments });
});

// Cliente aprova ou reprova pelo link público, com feedback opcional
router.put('/posts/:token', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE share_token = ?').get(req.params.token);
  if (!post) return res.status(404).json({ error: 'Link inválido ou expirado' });

  const { status, client_feedback } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  db.prepare(`
    UPDATE posts SET status = ?, client_feedback = COALESCE(?, client_feedback), updated_at = datetime('now')
    WHERE share_token = ?
  `).run(status, client_feedback, req.params.token);

  res.json({ ok: true });
});

// Comentário anônimo do cliente pelo link público (identificado como "Cliente" no registro)
router.post('/posts/:token/comments', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE share_token = ?').get(req.params.token);
  if (!post) return res.status(404).json({ error: 'Link inválido ou expirado' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

  // Usa o primeiro usuário 'client' vinculado a este cliente como autor do comentário público;
  // se não existir nenhum, usa o criador do post como fallback silencioso.
  const clientUser = db.prepare('SELECT id FROM users WHERE client_id = (SELECT client_id FROM posts WHERE id = ?) AND role = \'client\' LIMIT 1').get(post.id);
  const authorId = clientUser ? clientUser.id : post.created_by;

  db.prepare('INSERT INTO post_comments (post_id, user_id, message) VALUES (?, ?, ?)').run(post.id, authorId, message);
  res.status(201).json({ ok: true });
});

// Consulta o feed de um cliente pelo token publico - sem autenticacao
router.get('/feed/:token', (req, res) => {
  const client = db.prepare('SELECT id, name, logo_color, avatar_data, bio, instagram_username, instagram_display_name, instagram_posts_count, instagram_followers_count, instagram_following_count, instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action FROM clients WHERE feed_share_token = ?').get(req.params.token);
  if (!client) return res.status(404).json({ error: 'Link invalido ou expirado' });

  const posts = db.prepare(`
    SELECT id, title, caption, content_type, media_data, media_mime, media_gallery, scheduled_at, status
    FROM posts
    WHERE client_id = ? AND scheduled_at IS NOT NULL AND status IN ('pending_approval','approved','scheduled','draft')
    ORDER BY scheduled_at DESC
  `).all(client.id);

  res.json({ client, posts: posts.map(normalizePost) });
});

module.exports = router;
