const express = require('express');
const db = require('../db/database');
const { recordActivity } = require('../services/activity');
const { isHeldForDirection } = require('../services/designerApprovals');

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

function getVisibleFeedHighlights(clientId, agencyId = null) {
  let sql = `
    SELECT id, name, cover_data, cover_mime, sort_order, visible
    FROM feed_highlights
    WHERE client_id = ? AND visible = 1
  `;
  const params = [clientId];
  if (agencyId != null) {
    sql += ' AND agency_id = ?';
    params.push(agencyId);
  }
  sql += ' ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all(...params);
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
  const post = db.prepare(`
    SELECT * FROM posts
    WHERE share_token = ?
      AND COALESCE(feed_visible, 1) = 1
      AND scheduled_at IS NOT NULL
  `).get(req.params.token);
  if (!post) return res.status(404).json({ error: 'Este conteúdo não está disponível na grade para aprovação' });

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
  const client = db.prepare('SELECT id, agency_id, name, logo_color, avatar_data, bio, instagram_username, instagram_display_name, instagram_posts_count, instagram_followers_count, instagram_following_count, instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action FROM clients WHERE feed_share_token = ?').get(req.params.token);
  if (!client) return res.status(404).json({ error: 'Link invalido ou expirado' });

  const posts = db.prepare(`
    SELECT id, title, caption, content_type, media_data, media_mime, media_gallery, scheduled_at, status, client_feedback,
           COALESCE(is_pinned, 0) AS is_pinned
    FROM posts
    WHERE client_id = ? AND COALESCE(feed_visible, 1) = 1
      AND (scheduled_at IS NOT NULL OR status = 'pending_approval')
      AND status IN ('pending_approval','approved','rejected','scheduled','draft')
    ORDER BY COALESCE(is_pinned, 0) DESC, COALESCE(scheduled_at, updated_at, created_at) DESC, id DESC
  `).all(client.id);

  res.json({ client, highlights: getVisibleFeedHighlights(client.id, client.agency_id), posts: posts.map(normalizePost) });
});

// A aprovação agora acontece diretamente na grade compartilhada do cliente.
// O token do feed limita a decisão aos conteúdos visíveis e agendados daquele cliente.
router.put('/feed/:token/posts/:postId', (req, res) => {
  const client = db.prepare(`
    SELECT id, agency_id, name
    FROM clients
    WHERE feed_share_token = ?
    LIMIT 1
  `).get(req.params.token);
  if (!client) return res.status(404).json({ error: 'Link inválido ou expirado' });

  const status = String(req.body?.status || '');
  const clientFeedback = String(req.body?.client_feedback || '').trim() || null;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  if (status === 'rejected' && !clientFeedback) {
    return res.status(400).json({ error: 'Escreva o que precisa ser corrigido antes de solicitar ajustes.' });
  }

  const post = db.prepare(`
    SELECT id, title, status
    FROM posts
    WHERE id = ?
      AND client_id = ?
      AND agency_id = ?
      AND COALESCE(feed_visible, 1) = 1
      AND (scheduled_at IS NOT NULL OR status = 'pending_approval')
    LIMIT 1
  `).get(Number(req.params.postId), Number(client.id), Number(client.agency_id));
  if (!post) return res.status(404).json({ error: 'Conteúdo não encontrado nesta grade' });

  const now = new Date().toISOString();
  const task = db.prepare(`
    SELECT id
    FROM tasks
    WHERE feed_post_id = ? AND agency_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(Number(post.id), Number(client.agency_id));

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE posts
      SET status = ?, client_feedback = ?,
          workflow_stage = ?, feed_visible = ?, updated_at = datetime('now')
      WHERE id = ? AND client_id = ? AND agency_id = ?
    `).run(
      status,
      clientFeedback,
      status === 'approved' ? 'approved' : 'correction',
      status === 'approved' ? 1 : 0,
      Number(post.id), Number(client.id), Number(client.agency_id)
    );

    if (task?.id) {
      const approved = status === 'approved';
      db.prepare(`
        UPDATE tasks
        SET direction_status = 'approved',
            client_status = ?, client_feedback = ?, client_at = ?,
            approval_status = ?, workflow_stage = ?, designer_completed = ?, status = ?,
            updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(
        approved ? 'approved' : 'changes_requested',
        clientFeedback,
        now,
        approved ? 'approved' : 'changes_requested',
        approved ? 'approved' : 'correction',
        approved ? 1 : 0,
        approved ? 'done' : 'in_progress',
        Number(task.id), Number(client.agency_id)
      );

      try {
        const stateExists = db.prepare(`
          SELECT task_id FROM designer_approval_states
          WHERE task_id = ? AND agency_id = ? LIMIT 1
        `).get(Number(task.id), Number(client.agency_id));
        if (stateExists) {
          db.prepare(`
            UPDATE designer_approval_states
            SET direction_status = 'approved', client_status = ?, client_feedback = ?, client_at = ?,
                updated_at = datetime('now')
            WHERE task_id = ? AND agency_id = ?
          `).run(
            approved ? 'approved' : 'changes_requested',
            clientFeedback,
            now,
            Number(task.id), Number(client.agency_id)
          );
        }
      } catch (stateError) {
        console.warn('[PUBLIC_FEED_APPROVAL] Não foi possível sincronizar estado auxiliar:', stateError.message);
      }
    }
  });

  transaction();

  recordActivity({
    agencyId: client.agency_id,
    actorName: `CLIENTE · ${client.name || 'GRADE'}`,
    clientId: client.id,
    module: task?.id ? 'designer' : 'social',
    action: status === 'approved' ? 'approved' : 'changes_requested',
    entityType: task?.id ? 'task' : 'post',
    entityId: task?.id ? Number(task.id) : Number(post.id),
    entityLabel: post.title,
    summary: status === 'approved' ? 'Aprovou um conteúdo pela grade' : 'Solicitou ajustes em um conteúdo pela grade',
    details: { source: 'public_feed', previous_status: post.status, new_status: status, client_feedback: clientFeedback, post_id: Number(post.id) },
    path: `/public/feed/${req.params.token}/posts/${post.id}`,
    method: 'PUT',
  });

  return res.json({
    ok: true,
    post_id: Number(post.id),
    task_id: task?.id ? Number(task.id) : null,
    status,
    client_feedback: clientFeedback,
  });
});



// Link operacional do Social Media: grade completa do cliente com ações
// estritamente limitadas à publicação. O token não expõe o restante do Hub.
router.get('/social-media/:token', (req, res) => {
  const client = getSocialMediaSharedClient(req.params.token);

  if (!client) return res.status(404).json({ error: 'Link inválido ou desativado' });

  const posts = db.prepare(`
    SELECT id, title, caption, content_type, media_data, media_mime, media_gallery,
           scheduled_at, status, updated_at, COALESCE(is_pinned, 0) AS is_pinned
    FROM posts
    WHERE client_id = ?
      AND COALESCE(feed_visible, 1) = 1
      AND scheduled_at IS NOT NULL
      AND status IN ('pending_approval','approved','scheduled','draft','published','posted')
    ORDER BY COALESCE(is_pinned, 0) DESC, scheduled_at DESC, id DESC
  `).all(client.id);

  res.json({ client, highlights: getVisibleFeedHighlights(client.id, client.agency_id), posts: posts.map(normalizePost) });
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

  recordActivity({
    agencyId: client.agency_id, actorName: 'LINK SOCIAL MEDIA', clientId: client.id,
    module: 'social', action: 'published', entityType: 'post', entityId: post.id,
    entityLabel: db.prepare('SELECT title FROM posts WHERE id = ?').get(post.id)?.title || null,
    summary: 'Confirmou uma publicação como postada',
    details: { source: 'link_social_media', previous_status: post.status, new_status: 'published' },
    path: `/public/social-media/${req.params.token}/posts/${post.id}/posted`, method: 'PUT'
  });

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


// Aprovação pública das peças do Squad -> Designer.
// IMPORTANTE: este fluxo resolve o token diretamente no cadastro do cliente.
// Assim ele não depende da tabela legada designer_approval_links nem do estado
// interno usado pela tela autenticada.
function tableColumns(tableName) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => String(column.name)));
  } catch {
    return new Set();
  }
}

function resolveDesignerApprovalClient(token) {
  const value = String(token || '').trim();
  if (!value) return null;

  const profileFields = `
    id, agency_id, name, logo_color, avatar_data, bio,
    instagram_username, instagram_display_name,
    instagram_posts_count, instagram_followers_count, instagram_following_count,
    instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action
  `;

  // Caminho principal: é exatamente o token gerado por /clients/:id/feed-share.
  try {
    const client = db.prepare(`
      SELECT ${profileFields}
      FROM clients
      WHERE feed_share_token = ?
      LIMIT 1
    `).get(value);
    if (client) return client;
  } catch (error) {
    console.warn('[PUBLIC_DESIGNER_APPROVAL] feed_share_token indisponível:', error.message);
  }

  // Compatibilidade com a tentativa anterior de token exclusivo de aprovação.
  const clientColumns = tableColumns('clients');
  if (clientColumns.has('approval_share_token')) {
    try {
      const client = db.prepare(`
        SELECT ${profileFields}
        FROM clients
        WHERE approval_share_token = ?
        LIMIT 1
      `).get(value);
      if (client) return client;
    } catch (error) {
      console.warn('[PUBLIC_DESIGNER_APPROVAL] approval_share_token indisponível:', error.message);
    }
  }

  // Compatibilidade final com links históricos.
  try {
    const linkColumns = tableColumns('designer_approval_links');
    if (linkColumns.has('token') && linkColumns.has('client_id')) {
      const hasAgencyId = linkColumns.has('agency_id');
      const agencyJoin = hasAgencyId ? 'AND c.agency_id = l.agency_id' : '';
      const activeFilter = linkColumns.has('active') ? 'AND COALESCE(l.active, 1) = 1' : '';
      const client = db.prepare(`
        SELECT c.id, c.agency_id, c.name, c.logo_color, c.avatar_data, c.bio,
               c.instagram_username, c.instagram_display_name,
               c.instagram_posts_count, c.instagram_followers_count, c.instagram_following_count,
               c.instagram_link, c.instagram_primary_action, c.instagram_secondary_action, c.instagram_tertiary_action
        FROM designer_approval_links l
        JOIN clients c ON c.id = l.client_id ${agencyJoin}
        WHERE l.token = ? ${activeFilter}
        LIMIT 1
      `).get(value);
      if (client) return client;
    }
  } catch (error) {
    console.warn('[PUBLIC_DESIGNER_APPROVAL] link legado indisponível:', error.message);
  }

  return null;
}

function publicApprovalImages(task) {
  const gallery = parseGallery(task?.media_gallery).filter((item) => {
    const data = String(item?.data || item?.url || item?.src || '');
    const mime = String(item?.mime || item?.type || '').toLowerCase();
    return Boolean(data) && (
      mime.startsWith('image/') ||
      data.startsWith('data:image/') ||
      /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data)
    );
  }).map((item) => ({
    data: item.data || item.url || item.src || '',
    mime: item.mime || item.type || 'image/jpeg',
    filename: item.filename || item.name || '',
  }));

  if (gallery.length) return gallery;

  const attachmentData = String(task?.attachment_data || '');
  const attachmentMime = String(task?.attachment_mime || '').toLowerCase();
  const attachmentIsImage = Boolean(attachmentData) && (
    attachmentMime.startsWith('image/') ||
    attachmentData.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(attachmentData)
  );

  return attachmentIsImage
    ? [{ data: attachmentData, mime: task?.attachment_mime || 'image/jpeg', filename: task?.attachment_filename || '' }]
    : [];
}

function designerApprovalReady(task) {
  const directionStatus = String(task?.direction_status || '').toLowerCase();
  const approvalStatus = String(task?.approval_status || '').toLowerCase();
  const workflowStage = String(task?.workflow_stage || '').toLowerCase();
  // Aprovada pela direção mas ainda não enviada ao cliente: não é pública.
  if (isHeldForDirection(task)) return false;
  return directionStatus === 'approved'
    || ['pending_approval', 'send', 'approved'].includes(approvalStatus)
    || ['external_approval', 'approved'].includes(workflowStage);
}

function getDesignerApprovalItemsDirect(client) {
  if (!client?.id || !client?.agency_id) return [];

  const rows = db.prepare(`
    SELECT t.*, COALESCE(t.client_id, parent.client_id) AS resolved_client_id
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND COALESCE(t.client_id, parent.client_id) = ?
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.id DESC
  `).all(Number(client.agency_id), Number(client.id));

  return rows
    .filter((task) => String(task.task_type || '').toLowerCase() !== 'video')
    .filter((task) => String(task.front_name || '').trim().toLowerCase() !== 'site/lp')
    .filter(designerApprovalReady)
    .map((task) => {
      const images = publicApprovalImages(task);
      const clientStatusRaw = String(task.client_status || '').toLowerCase();
      const approvalStatus = String(task.approval_status || '').toLowerCase();
      const workflowStage = String(task.workflow_stage || '').toLowerCase();
      const clientStatus = clientStatusRaw && clientStatusRaw !== 'waiting'
        ? clientStatusRaw
        : ((approvalStatus === 'approved' || workflowStage === 'approved') ? 'approved' : 'pending');

      return {
        id: Number(task.id),
        parent_task_id: task.parent_task_id ? Number(task.parent_task_id) : null,
        title: task.title,
        content_type: task.content_type,
        content_tag: task.content_tag,
        caption: task.caption,
        due_date: task.due_date,
        workflow_stage: 'approval',
        direction_status: String(task.direction_status || '').toLowerCase() === 'changes_requested' ? 'changes_requested' : 'approved',
        direction_feedback: task.direction_feedback || null,
        client_status: clientStatus,
        client_feedback: task.client_feedback || null,
        images,
        image_count: images.length,
        updated_at: task.updated_at,
      };
    })
    .filter((item) => item.image_count > 0);
}

function updateTaskClientDecisionDirect({ client, taskId, decision, feedback }) {
  const task = db.prepare(`
    SELECT t.*, COALESCE(t.client_id, parent.client_id) AS resolved_client_id
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    WHERE t.id = ?
      AND t.agency_id = ?
      AND COALESCE(t.client_id, parent.client_id) = ?
    LIMIT 1
  `).get(Number(taskId), Number(client.agency_id), Number(client.id));

  if (!task) return { error: 'TASK_NOT_FOUND' };
  if (!designerApprovalReady(task)) return { error: 'NOT_READY' };

  const normalizedFeedback = String(feedback || '').trim() || null;
  if (decision === 'changes_requested' && !normalizedFeedback) {
    throw new Error('Informe o que precisa ser corrigido antes de enviar a correção.');
  }

  const taskColumns = tableColumns('tasks');
  const updates = [];
  const values = [];
  const add = (column, value) => {
    if (!taskColumns.has(column)) return;
    updates.push(`${column} = ?`);
    values.push(value);
  };

  add('direction_status', 'approved');
  add('client_status', decision === 'approved' ? 'approved' : 'changes_requested');
  add('client_feedback', normalizedFeedback);
  add('client_at', new Date().toISOString());
  add('approval_status', decision === 'approved' ? 'approved' : 'changes_requested');
  add('workflow_stage', decision === 'approved' ? 'approved' : 'correction');
  add('designer_completed', decision === 'approved' ? 1 : 0);
  if (taskColumns.has('updated_at')) updates.push(`updated_at = datetime('now')`);

  if (updates.length) {
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
      .run(...values, Number(task.id), Number(client.agency_id));
  }

  // Mantém a tabela auxiliar sincronizada quando ela existe, sem torná-la
  // requisito para o link público funcionar.
  try {
    const stateColumns = tableColumns('designer_approval_states');
    if (stateColumns.has('task_id') && stateColumns.has('agency_id')) {
      const existing = db.prepare(`
        SELECT task_id FROM designer_approval_states
        WHERE task_id = ? AND agency_id = ? LIMIT 1
      `).get(Number(task.id), Number(client.agency_id));
      if (existing) {
        const stateUpdates = [];
        const stateValues = [];
        const addState = (column, value) => {
          if (!stateColumns.has(column)) return;
          stateUpdates.push(`${column} = ?`);
          stateValues.push(value);
        };
        addState('direction_status', 'approved');
        addState('client_status', decision === 'approved' ? 'approved' : 'changes_requested');
        addState('client_feedback', normalizedFeedback);
        addState('client_at', new Date().toISOString());
        if (stateColumns.has('updated_at')) stateUpdates.push(`updated_at = datetime('now')`);
        if (stateUpdates.length) {
          db.prepare(`UPDATE designer_approval_states SET ${stateUpdates.join(', ')} WHERE task_id = ? AND agency_id = ?`)
            .run(...stateValues, Number(task.id), Number(client.agency_id));
        }
      }
    }
  } catch (error) {
    console.warn('[PUBLIC_DESIGNER_APPROVAL] Não foi possível sincronizar estado auxiliar:', error.message);
  }

  // Se já existe um post espelhado na grade, mantém o status coerente.
  if (task.feed_post_id) {
    try {
      const postColumns = tableColumns('posts');
      const postUpdates = [];
      const postValues = [];
      const addPost = (column, value) => {
        if (!postColumns.has(column)) return;
        postUpdates.push(`${column} = ?`);
        postValues.push(value);
      };
      addPost('status', decision === 'approved' ? 'approved' : 'rejected');
      addPost('workflow_stage', decision === 'approved' ? 'approved' : 'correction');
      addPost('client_feedback', normalizedFeedback);
      addPost('feed_visible', decision === 'approved' ? 1 : 0);
      if (postColumns.has('updated_at')) postUpdates.push(`updated_at = datetime('now')`);
      if (postUpdates.length) {
        db.prepare(`UPDATE posts SET ${postUpdates.join(', ')} WHERE id = ? AND agency_id = ?`)
          .run(...postValues, Number(task.feed_post_id), Number(client.agency_id));
      }
    } catch (error) {
      console.warn('[PUBLIC_DESIGNER_APPROVAL] Não foi possível sincronizar post:', error.message);
    }
  }

  return {
    ok: true,
    decision,
    task_id: Number(task.id),
    state: {
      id: Number(task.id),
      task_id: Number(task.id),
      direction_status: 'approved',
      client_status: decision === 'approved' ? 'approved' : 'changes_requested',
      client_feedback: normalizedFeedback,
    },
  };
}

router.get('/designer-approval/:token', (req, res) => {
  try {
    const client = resolveDesignerApprovalClient(req.params.token);
    if (!client) return res.status(404).json({ error: 'Link de aprovação inválido ou desativado.' });

    const items = getDesignerApprovalItemsDirect(client);
    return res.json({
      client,
      highlights: getVisibleFeedHighlights(client.id, client.agency_id),
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('[PUBLIC_DESIGNER_APPROVAL] Falha ao carregar link:', error);
    return res.status(500).json({
      error: 'Não foi possível carregar a aprovação do cliente.',
      code: 'PUBLIC_DESIGNER_APPROVAL_LOAD_FAILED',
    });
  }
});

router.put('/designer-approval/:token/items/:taskId', (req, res) => {
  const decision = String(req.body?.decision || '');
  if (!['approved', 'changes_requested'].includes(decision)) {
    return res.status(400).json({ error: 'Decisão inválida.' });
  }

  try {
    const client = resolveDesignerApprovalClient(req.params.token);
    if (!client) return res.status(404).json({ error: 'Link de aprovação inválido ou desativado.' });

    const result = updateTaskClientDecisionDirect({
      client,
      taskId: Number(req.params.taskId),
      decision,
      feedback: req.body?.feedback || null,
    });

    if (result?.error === 'TASK_NOT_FOUND') return res.status(404).json({ error: 'Peça não encontrada neste link.' });
    if (result?.error === 'NOT_READY') return res.status(409).json({ error: 'Esta peça ainda não está liberada para aprovação do cliente.' });

    recordActivity({
      agencyId: client.agency_id,
      actorName: `CLIENTE · ${client.name || 'APROVAÇÃO'}`,
      clientId: client.id,
      module: 'designer',
      action: decision === 'approved' ? 'approved' : 'changes_requested',
      entityType: 'task',
      entityId: Number(req.params.taskId),
      entityLabel: `Peça #${req.params.taskId}`,
      summary: decision === 'approved' ? 'Aprovou uma peça do Designer' : 'Solicitou correção em uma peça do Designer',
      details: { source: 'designer_public_approval', feedback: req.body?.feedback || null },
      path: `/public/designer-approval/${req.params.token}/items/${req.params.taskId}`,
      method: 'PUT',
    });

    return res.json(result);
  } catch (error) {
    console.error('[PUBLIC_DESIGNER_APPROVAL] Falha ao registrar decisão:', error);
    return res.status(400).json({ error: error.message || 'Não foi possível registrar esta decisão.' });
  }
});

module.exports = router;
