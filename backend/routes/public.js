const express = require('express');
const db = require('../db/database');

const router = express.Router();

function ensureSocialMediaShareStorage() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_media_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agency_id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_social_media_share_links_token
      ON social_media_share_links(token);
  `);
}

function getSocialMediaSharedClient(token) {
  ensureSocialMediaShareStorage();
  let client = db.prepare(`
    SELECT c.id, c.agency_id, c.name, c.logo_color, c.avatar_data, c.bio,
           c.instagram_username, c.instagram_display_name,
           c.instagram_posts_count, c.instagram_followers_count, c.instagram_following_count,
           c.instagram_link, c.instagram_primary_action, c.instagram_secondary_action, c.instagram_tertiary_action
    FROM social_media_share_links s
    JOIN clients c ON c.id = s.client_id AND c.agency_id = s.agency_id
    WHERE s.token = ? AND s.active = 1
    LIMIT 1
  `).get(token);

  // Compatibilidade com links gerados na primeira versão, que ficavam na
  // coluna clients.social_media_share_token.
  if (!client) {
    try {
      client = db.prepare(`
        SELECT id, agency_id, name, logo_color, avatar_data, bio,
               instagram_username, instagram_display_name,
               instagram_posts_count, instagram_followers_count, instagram_following_count,
               instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action
        FROM clients
        WHERE social_media_share_token = ?
        LIMIT 1
      `).get(token);
    } catch {}
  }
  return client;
}

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

// Consulta pública somente para visualização de um post.
// O token é separado do fluxo de aprovação.
router.get('/view-posts/:token', (req, res) => {
  const post = db.prepare(`
    SELECT p.id, p.title, p.caption, p.content_type, p.platforms, p.media_url, p.media_data, p.media_mime, p.media_gallery,
           p.scheduled_at, p.created_at, p.updated_at,
           c.name as client_name, c.logo_color as client_color,
           c.instagram_username as client_username, c.instagram_display_name as client_display_name,
           c.avatar_data as client_avatar
    FROM posts p
    JOIN clients c ON c.id = p.client_id
    WHERE p.public_view_token = ?
  `).get(req.params.token);

  if (!post) return res.status(404).json({ error: 'Link inválido ou expirado' });
  res.json({ post: normalizePost(post) });
});

// Consulta um post pelo token de compartilhamento - sem autenticação
router.get('/posts/:token', (req, res) => {
  const post = db.prepare(`
    SELECT p.id, p.title, p.caption, p.content_type, p.platforms, p.media_url, p.media_data, p.media_mime, p.media_gallery,
           p.scheduled_at, p.status, p.client_feedback,
           c.name as client_name, c.logo_color as client_color,
           c.instagram_username as client_username, c.avatar_data as client_avatar
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
    WHERE client_id = ? AND COALESCE(feed_visible, 1) = 1 AND scheduled_at IS NOT NULL AND status IN ('pending_approval','approved','scheduled','draft')
    ORDER BY scheduled_at DESC
  `).all(client.id);

  res.json({ client, posts: posts.map(normalizePost) });
});


// Link operacional do Social Media: grade completa do cliente com ações
// estritamente limitadas à publicação. O token não expõe o restante do Hub.
router.get('/social-media/:token', (req, res) => {
  const client = getSocialMediaSharedClient(req.params.token);

  if (!client) return res.status(404).json({ error: 'Link inválido ou desativado' });

  const posts = db.prepare(`
    SELECT id, title, caption, content_type, media_data, media_mime, media_gallery,
           scheduled_at, status, updated_at
    FROM posts
    WHERE client_id = ?
      AND COALESCE(feed_visible, 1) = 1
      AND scheduled_at IS NOT NULL
      AND status IN ('pending_approval','approved','scheduled','draft','published','posted')
    ORDER BY scheduled_at DESC, id DESC
  `).all(client.id);

  res.json({ client, posts: posts.map(normalizePost) });
});

router.put('/social-media/:token/posts/:postId/posted', (req, res) => {
  const client = getSocialMediaSharedClient(req.params.token);
  if (!client) return res.status(404).json({ error: 'Link inválido ou desativado' });

  const post = db.prepare(`
    SELECT id, client_id, status
    FROM posts
    WHERE id = ? AND client_id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(req.params.postId), Number(client.id), Number(client.agency_id));
  if (!post) return res.status(404).json({ error: 'Publicação não encontrada neste cliente' });

  const markPosted = db.transaction(() => {
    db.prepare(`
      UPDATE posts
      SET status = 'published', updated_at = datetime('now')
      WHERE id = ? AND client_id = ? AND agency_id = ?
    `).run(Number(post.id), Number(client.id), Number(client.agency_id));

    // Se o post nasceu de uma tarefa, o Kanban acompanha a confirmação do
    // Social Media automaticamente.
    db.prepare(`
      UPDATE tasks
      SET status = 'posted', updated_at = datetime('now')
      WHERE feed_post_id = ? AND client_id = ? AND agency_id = ?
    `).run(Number(post.id), Number(client.id), Number(client.agency_id));
  });
  markPosted();

  res.json({ ok: true, post_id: Number(post.id), status: 'published' });
});


const PUBLIC_TASK_STATUS_LABELS = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  done: 'Concluída',
  posted: 'Postado',
};

router.get('/task-calendar/:token', (req, res) => {
  const share = db.prepare(`
    SELECT
      s.id, s.agency_id, s.client_id, s.share_year, s.share_month,
      s.show_status, s.show_assignees, s.show_description, s.include_posted,
      c.name AS client_name, c.avatar_data, c.logo_color
    FROM task_calendar_shares s
    JOIN clients c ON c.id = s.client_id AND c.agency_id = s.agency_id
    WHERE s.token = ? AND s.active = 1
    LIMIT 1
  `).get(req.params.token);

  if (!share) return res.status(404).json({ error: 'Link inválido ou desativado' });

  const start = `${share.share_year}-${String(share.share_month).padStart(2, '0')}-01`;
  const endDate = new Date(Number(share.share_year), Number(share.share_month), 0);
  const end = `${share.share_year}-${String(share.share_month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  let query = `
    SELECT
      t.id, t.parent_task_id, t.title, t.description, t.task_type, t.content_type,
      t.due_date, t.status, t.project_name, t.front_name,
      parent.title AS parent_title
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    WHERE t.agency_id = ? AND t.client_id = ?
      AND t.due_date BETWEEN ? AND ?
  `;
  const params = [Number(share.agency_id), Number(share.client_id), start, end];
  if (!Number(share.include_posted)) query += ` AND t.status <> 'posted'`;
  query += ` ORDER BY t.due_date ASC, CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END, t.title COLLATE NOCASE ASC`;

  const tasks = db.prepare(query).all(...params);

  let assigneesByTask = new Map();
  if (Number(share.show_assignees) && tasks.length) {
    const ids = tasks.map((task) => Number(task.id));
    const placeholders = ids.map(() => '?').join(',');
    const assignees = db.prepare(`
      SELECT ta.task_id, u.name
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id AND u.agency_id = ?
      WHERE ta.task_id IN (${placeholders})
      ORDER BY u.name
    `).all(Number(share.agency_id), ...ids);
    assigneesByTask = assignees.reduce((map, item) => {
      if (!map.has(Number(item.task_id))) map.set(Number(item.task_id), []);
      map.get(Number(item.task_id)).push(item.name);
      return map;
    }, new Map());
  }

  const serializedTasks = tasks.map((task) => ({
    id: Number(task.id),
    parent_task_id: task.parent_task_id ? Number(task.parent_task_id) : null,
    parent_title: task.parent_title || null,
    title: task.title,
    description: Number(share.show_description) ? (task.description || '') : '',
    task_type: task.task_type,
    content_type: task.content_type,
    due_date: task.due_date,
    status: Number(share.show_status) ? task.status : null,
    status_label: Number(share.show_status) ? (PUBLIC_TASK_STATUS_LABELS[task.status] || task.status) : null,
    project_name: task.project_name || '',
    front_name: task.front_name || '',
    assignees: Number(share.show_assignees) ? (assigneesByTask.get(Number(task.id)) || []) : [],
  }));

  const summary = serializedTasks.reduce((acc, task) => {
    acc.total += 1;
    if (task.status && Object.prototype.hasOwnProperty.call(acc, task.status)) acc[task.status] += 1;
    return acc;
  }, { total: 0, pending: 0, in_progress: 0, done: 0, posted: 0 });

  return res.json({
    client: {
      id: Number(share.client_id),
      name: share.client_name,
      avatar_data: share.avatar_data,
      logo_color: share.logo_color,
    },
    period: { year: Number(share.share_year), month: Number(share.share_month) },
    options: {
      show_status: Number(share.show_status) === 1,
      show_assignees: Number(share.show_assignees) === 1,
      show_description: Number(share.show_description) === 1,
      include_posted: Number(share.include_posted) === 1,
    },
    summary,
    tasks: serializedTasks,
  });
});

module.exports = router;
