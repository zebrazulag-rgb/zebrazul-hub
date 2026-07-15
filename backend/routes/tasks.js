const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team'));

function getAssignees(taskId) {
  return db.prepare(`
    SELECT u.id, u.name, u.avatar_color, u.avatar_data
    FROM task_assignees ta JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
    ORDER BY u.name
  `).all(taskId);
}

function setAssignees(taskId, assigneeIds) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  if (Array.isArray(assigneeIds)) {
    const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
    assigneeIds.filter(Boolean).forEach((uid) => insert.run(taskId, uid));
  }
}

router.get('/', (req, res) => {
  const { status, assignee_id, client_id } = req.query;
  let query = `
    SELECT t.*, c.name as client_name,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) as subtask_total,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done') as subtask_done
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.parent_task_id IS NULL
  `;
  const params = [];
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (client_id) { query += ' AND t.client_id = ?'; params.push(client_id); }
  if (assignee_id) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(assignee_id);
  }
  query += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC';

  const tasks = db.prepare(query).all(...params).map((t) => ({
    ...t,
    attachment_data: undefined,
    media_gallery: undefined,
    assignees: getAssignees(t.id)
  }));
  res.json({ tasks });
});

router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT t.*, c.name as client_name, c.logo_color as client_color
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });

  task.assignees = getAssignees(task.id);
  task.media_gallery = task.media_gallery ? JSON.parse(task.media_gallery) : [];

  const subtasks = db.prepare(`
    SELECT st.id, st.title, st.status, st.due_date, st.attachment_filename
    FROM tasks st WHERE st.parent_task_id = ?
    ORDER BY COALESCE(st.due_date, st.created_at) ASC
  `).all(req.params.id).map((s) => ({ ...s, assignees: getAssignees(s.id) }));

  res.json({ task, subtasks });
});

router.post('/', (req, res) => {
  const {
    title, description, task_type, content_type, caption, video_link, media_gallery,
    due_date, assignee_ids, status, client_id,
    attachment_data, attachment_mime, attachment_filename, parent_task_id
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Titulo e obrigatorio' });

  let finalClientId = client_id || null;
  if (parent_task_id && !finalClientId) {
    const parent = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(parent_task_id);
    finalClientId = parent && parent.client_id ? parent.client_id : null;
  }

  const info = db.prepare(`
    INSERT INTO tasks (client_id, created_by, parent_task_id, task_type, title, description, content_type, caption, video_link, media_gallery, due_date, status, attachment_data, attachment_mime, attachment_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalClientId, req.user.id, parent_task_id || null, task_type || 'basic', title, description || '',
    content_type || null, caption || null, video_link || null,
    media_gallery ? JSON.stringify(media_gallery) : null,
    due_date || null, status || 'pending',
    attachment_data || null, attachment_mime || null, attachment_filename || null
  );
  setAssignees(info.lastInsertRowid, assignee_ids);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const {
    title, description, task_type, content_type, caption, video_link, media_gallery,
    due_date, assignee_ids, status, client_id,
    attachment_data, attachment_mime, attachment_filename
  } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      task_type = COALESCE(?, task_type),
      content_type = COALESCE(?, content_type),
      caption = COALESCE(?, caption),
      video_link = COALESCE(?, video_link),
      media_gallery = COALESCE(?, media_gallery),
      due_date = COALESCE(?, due_date),
      status = COALESCE(?, status),
      client_id = COALESCE(?, client_id),
      attachment_data = COALESCE(?, attachment_data),
      attachment_mime = COALESCE(?, attachment_mime),
      attachment_filename = COALESCE(?, attachment_filename),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title, description, task_type, content_type, caption, video_link,
    media_gallery ? JSON.stringify(media_gallery) : null,
    due_date || null, status, client_id || null,
    attachment_data, attachment_mime, attachment_filename, req.params.id
  );

  if (assignee_ids !== undefined) setAssignees(req.params.id, assignee_ids);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/duplicate', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tarefa nao encontrada' });

  const info = db.prepare(`
    INSERT INTO tasks (client_id, created_by, parent_task_id, task_type, title, description, content_type, caption, video_link, media_gallery, due_date, status, attachment_data, attachment_mime, attachment_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    t.client_id, req.user.id, t.parent_task_id, t.task_type, `${t.title} (cópia)`, t.description,
    t.content_type, t.caption, t.video_link, t.media_gallery, t.due_date,
    t.attachment_data, t.attachment_mime, t.attachment_filename
  );
  setAssignees(info.lastInsertRowid, getAssignees(t.id).map((a) => a.id));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/add-to-feed', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!t.client_id) return res.status(400).json({ error: 'A tarefa precisa estar vinculada a um cliente' });
  if (!t.attachment_data) return res.status(400).json({ error: 'Anexe ao menos uma imagem antes de enviar para o feed' });

  const info = db.prepare(`
    INSERT INTO posts (client_id, created_by, title, caption, content_type, platforms, media_data, media_mime, scheduled_at, status)
    VALUES (?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, 'draft')
  `).run(
    t.client_id, req.user.id, t.title, t.caption || '', t.content_type || 'feed',
    t.attachment_data, t.attachment_mime, t.due_date || null
  );

  db.prepare('UPDATE tasks SET feed_post_id = ? WHERE id = ?').run(info.lastInsertRowid, t.id);
  res.status(201).json({ post_id: info.lastInsertRowid });
});

module.exports = router;
