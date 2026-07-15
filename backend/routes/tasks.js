const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team', 'client'));

function canAccessTask(user, task) {
  return task && (task.client_id === null || task.client_id === undefined || canAccessClient(user, task.client_id));
}

function canModifyTask(user, task) {
  if (!task) return false;
  if (['admin', 'team'].includes(user.role)) return true;
  return user.role === 'client' && Number(task.created_by) === Number(user.id) && task.status === 'pending';
}

function ensureModifyTask(req, res, task) {
  if (!canModifyTask(req.user, task)) {
    res.status(403).json({ error: 'Clientes só podem editar ou apagar tarefas próprias que ainda estão pendentes' });
    return false;
  }
  return true;
}

function ensureTaskAccess(req, res, task) {
  if (!canAccessTask(req.user, task)) {
    res.status(403).json({ error: 'Voce nao tem acesso ao cliente desta tarefa' });
    return false;
  }
  return true;
}

function ensureClientAccess(req, res, clientId) {
  if (!clientId) return true;
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso ao cliente selecionado' });
    return false;
  }
  return true;
}

function attachAssignees(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => Number(row.id));
  const placeholders = ids.map(() => '?').join(',');
  const assignments = db.prepare(`
    SELECT ta.task_id, u.id, u.name, u.avatar_color, u.avatar_data
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id IN (${placeholders})
    ORDER BY u.name
  `).all(...ids);

  const byTask = new Map();
  assignments.forEach((assignment) => {
    if (!byTask.has(assignment.task_id)) byTask.set(assignment.task_id, []);
    byTask.get(assignment.task_id).push({
      id: assignment.id,
      name: assignment.name,
      avatar_color: assignment.avatar_color,
      avatar_data: assignment.avatar_data,
    });
  });

  return rows.map((row) => ({ ...row, assignees: byTask.get(row.id) || [] }));
}

function setAssignees(taskId, assigneeIds) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  if (!Array.isArray(assigneeIds)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  [...new Set(assigneeIds.map(Number).filter(Boolean))].forEach((uid) => insert.run(taskId, uid));
}

function validateAssigneesForClient(clientId, assigneeIds) {
  if (!Array.isArray(assigneeIds)) return { ok: true };
  const ids = [...new Set(assigneeIds.map(Number).filter(Boolean))];
  if (!ids.length) return { ok: true };

  const placeholders = ids.map(() => '?').join(',');
  const users = db.prepare(`SELECT id, role FROM users WHERE id IN (${placeholders})`).all(...ids);
  if (users.length !== ids.length || users.some((user) => !['admin', 'team'].includes(user.role))) {
    return { ok: false, error: 'Selecione somente membros da equipe como responsáveis' };
  }
  if (!clientId) return { ok: true };

  const teamIds = users.filter((user) => user.role === 'team').map((user) => user.id);
  if (!teamIds.length) return { ok: true };
  const teamPlaceholders = teamIds.map(() => '?').join(',');
  const allowed = db.prepare(`
    SELECT user_id FROM user_client_access
    WHERE client_id = ? AND user_id IN (${teamPlaceholders})
  `).all(Number(clientId), ...teamIds).map((row) => Number(row.user_id));
  if (allowed.length !== teamIds.length) {
    return { ok: false, error: 'Um dos responsáveis nao tem acesso ao cliente selecionado' };
  }
  return { ok: true };
}

function parseGallery(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function taskSummaryQuery(whereClause) {
  return `
    SELECT
      t.id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.due_date, t.status, t.attachment_filename, t.feed_post_id,
      t.created_at, t.updated_at,
      c.name AS client_name,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) AS subtask_total,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done') AS subtask_done
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    ${whereClause}
  `;
}

function getTaskSummary(taskId) {
  const row = db.prepare(taskSummaryQuery('WHERE t.id = ?')).get(taskId);
  return row ? attachAssignees([row])[0] : null;
}

router.get('/', (req, res) => {
  const { status, assignee_id, client_id } = req.query;
  let query = taskSummaryQuery('WHERE t.parent_task_id IS NULL');
  const params = [];

  if (req.user.role === 'team') {
    if (req.user.client_ids.length) {
      const placeholders = req.user.client_ids.map(() => '?').join(',');
      query += ` AND (t.client_id IS NULL OR t.client_id IN (${placeholders}))`;
      params.push(...req.user.client_ids);
    } else {
      query += ' AND t.client_id IS NULL';
    }
  } else if (req.user.role === 'client') {
    query += ' AND t.client_id = ?';
    params.push(Number(req.user.client_id));
  }

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND t.client_id = ?';
    params.push(Number(client_id));
  }
  if (assignee_id) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(assignee_id));
  }
  query += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC';

  const tasks = attachAssignees(db.prepare(query).all(...params));
  res.json({ tasks });
});

// Mídias são carregadas separadamente para o modal abrir imediatamente.
router.get('/:id/media', (req, res) => {
  const task = db.prepare(`
    SELECT id, client_id, attachment_data, attachment_mime, attachment_filename, media_gallery
    FROM tasks WHERE id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  res.json({
    media: {
      attachment_data: task.attachment_data,
      attachment_mime: task.attachment_mime,
      attachment_filename: task.attachment_filename,
      media_gallery: parseGallery(task.media_gallery),
    },
  });
});

router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT
      t.id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.description, t.content_type, t.caption, t.video_link,
      t.due_date, t.status, t.attachment_mime, t.attachment_filename,
      t.feed_post_id, t.created_at, t.updated_at,
      CASE WHEN t.attachment_data IS NOT NULL AND length(t.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment,
      CASE WHEN t.media_gallery IS NOT NULL AND length(t.media_gallery) > 2 THEN 1 ELSE 0 END AS has_gallery,
      c.name AS client_name, c.logo_color AS client_color
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  task.assignees = attachAssignees([{ id: task.id }])[0].assignees;

  const subtaskRows = db.prepare(`
    SELECT st.id, st.client_id, st.created_by, st.title, st.status, st.due_date, st.attachment_filename,
           CASE WHEN st.attachment_data IS NOT NULL AND length(st.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment
    FROM tasks st
    WHERE st.parent_task_id = ?
    ORDER BY COALESCE(st.due_date, st.created_at) ASC
  `).all(req.params.id);
  const subtasks = attachAssignees(subtaskRows);

  res.json({ task, subtasks });
});

router.post('/', (req, res) => {
  const {
    title, description, task_type, content_type, caption, video_link, media_gallery,
    due_date, assignee_ids, status, client_id,
    attachment_data, attachment_mime, attachment_filename, parent_task_id
  } = req.body;
  if (!String(title || '').trim()) return res.status(400).json({ error: 'Titulo e obrigatorio' });

  let finalClientId = req.user.role === 'client' ? Number(req.user.client_id) : (client_id ? Number(client_id) : null);
  if (parent_task_id) {
    const parent = db.prepare('SELECT id, client_id FROM tasks WHERE id = ?').get(parent_task_id);
    if (!parent) return res.status(404).json({ error: 'Tarefa principal nao encontrada' });
    if (!ensureTaskAccess(req, res, parent)) return;
    if (!finalClientId) finalClientId = parent.client_id || null;
  }
  if (!ensureClientAccess(req, res, finalClientId)) return;
  const finalAssigneeIds = Array.isArray(assignee_ids) ? assignee_ids : [];
  const assigneeValidation = validateAssigneesForClient(finalClientId, finalAssigneeIds);
  if (!assigneeValidation.ok) return res.status(400).json({ error: assigneeValidation.error });

  const createTask = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tasks (client_id, created_by, parent_task_id, task_type, title, description, content_type, caption, video_link, media_gallery, due_date, status, attachment_data, attachment_mime, attachment_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalClientId, req.user.id, parent_task_id || null, task_type || 'basic', String(title).trim(), description || '',
      content_type || null, caption || null, video_link || null,
      Array.isArray(media_gallery) ? JSON.stringify(media_gallery) : null,
      due_date || null, req.user.role === 'client' ? 'pending' : (status || 'pending'),
      attachment_data || null, attachment_mime || null, attachment_filename || null
    );
    setAssignees(info.lastInsertRowid, finalAssigneeIds);
    return info.lastInsertRowid;
  });

  const id = createTask();
  res.status(201).json({ id, task: getTaskSummary(id) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, existing)) return;
  if (!ensureModifyTask(req, res, existing)) return;

  if (Object.prototype.hasOwnProperty.call(req.body, 'title') && !String(req.body.title || '').trim()) {
    return res.status(400).json({ error: 'Titulo e obrigatorio' });
  }

  const targetClientId = req.user.role === 'client'
    ? Number(req.user.client_id)
    : Object.prototype.hasOwnProperty.call(req.body, 'client_id')
    ? (req.body.client_id ? Number(req.body.client_id) : null)
    : existing.client_id;
  if (req.user.role !== 'client' && Object.prototype.hasOwnProperty.call(req.body, 'client_id')) {
    if (!ensureClientAccess(req, res, targetClientId)) return;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')) {
    const assigneeValidation = validateAssigneesForClient(targetClientId, req.body.assignee_ids);
    if (!assigneeValidation.ok) return res.status(400).json({ error: assigneeValidation.error });
  }

  const allowedFields = req.user.role === 'client' ? [
    'title', 'description', 'task_type', 'content_type', 'caption', 'video_link',
    'media_gallery', 'due_date', 'attachment_data', 'attachment_mime', 'attachment_filename'
  ] : [
    'title', 'description', 'task_type', 'content_type', 'caption', 'video_link',
    'media_gallery', 'due_date', 'status', 'client_id',
    'attachment_data', 'attachment_mime', 'attachment_filename'
  ];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'media_gallery') {
      values.push(Array.isArray(req.body.media_gallery) ? JSON.stringify(req.body.media_gallery) : null);
    } else if (field === 'title') {
      values.push(String(req.body.title).trim());
    } else if (field === 'client_id') {
      values.push(req.body.client_id ? Number(req.body.client_id) : null);
    } else {
      values.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  const updateTask = db.transaction(() => {
    if (updates.length) {
      db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...values, req.params.id);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')) {
      setAssignees(req.params.id, req.body.assignee_ids);
    }
  });
  updateTask();

  res.json({ ok: true, task: getTaskSummary(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT id, client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  const completeTask = db.prepare('SELECT id, client_id, created_by, status FROM tasks WHERE id = ?').get(req.params.id);
  if (!ensureModifyTask(req, res, completeTask)) return;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/duplicate', requireRole('admin', 'team'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  const duplicate = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tasks (client_id, created_by, parent_task_id, task_type, title, description, content_type, caption, video_link, media_gallery, due_date, status, attachment_data, attachment_mime, attachment_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      task.client_id, req.user.id, task.parent_task_id, task.task_type, `${task.title} (cópia)`, task.description,
      task.content_type, task.caption, task.video_link, task.media_gallery, task.due_date,
      task.attachment_data, task.attachment_mime, task.attachment_filename
    );
    const assigneeIds = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(task.id).map((row) => row.user_id);
    setAssignees(info.lastInsertRowid, assigneeIds);
    return info.lastInsertRowid;
  });

  const id = duplicate();
  res.status(201).json({ id, task: getTaskSummary(id) });
});

router.post('/:id/add-to-feed', requireRole('admin', 'team'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  if (!task.client_id) return res.status(400).json({ error: 'A tarefa precisa estar vinculada a um cliente' });
  if (!task.attachment_data) return res.status(400).json({ error: 'Anexe ao menos uma imagem antes de enviar para o feed' });

  const info = db.prepare(`
    INSERT INTO posts (client_id, created_by, title, caption, content_type, platforms, media_data, media_mime, scheduled_at, status)
    VALUES (?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, 'draft')
  `).run(
    task.client_id, req.user.id, task.title, task.caption || '', task.content_type || 'feed',
    task.attachment_data, task.attachment_mime, task.due_date || null
  );

  db.prepare('UPDATE tasks SET feed_post_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(info.lastInsertRowid, task.id);
  res.status(201).json({ post_id: info.lastInsertRowid });
});

module.exports = router;
