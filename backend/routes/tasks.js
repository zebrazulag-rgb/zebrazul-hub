const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team'));

// Lista apenas tarefas de nivel principal (nao mostra subtarefas soltas no quadro),
// com contagem de progresso das subtarefas de cada uma.
router.get('/', (req, res) => {
  const { status, assignee_id, client_id } = req.query;
  let query = `
    SELECT t.*, u.name as assignee_name, u.avatar_color as assignee_color, u.avatar_data as assignee_avatar, c.name as client_name,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) as subtask_total,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done') as subtask_done
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.parent_task_id IS NULL
  `;
  const params = [];
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (assignee_id) { query += ' AND t.assignee_id = ?'; params.push(assignee_id); }
  if (client_id) { query += ' AND t.client_id = ?'; params.push(client_id); }
  query += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC';

  const tasks = db.prepare(query).all(...params).map((t) => ({
    ...t,
    attachment_data: undefined
  }));
  res.json({ tasks });
});

router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, c.name as client_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });

  const subtasks = db.prepare(`
    SELECT st.id, st.title, st.status, st.due_date, st.attachment_filename,
           u.name as assignee_name, u.avatar_color as assignee_color, u.avatar_data as assignee_avatar
    FROM tasks st
    LEFT JOIN users u ON u.id = st.assignee_id
    WHERE st.parent_task_id = ?
    ORDER BY COALESCE(st.due_date, st.created_at) ASC
  `).all(req.params.id);

  res.json({ task, subtasks });
});

router.post('/', (req, res) => {
  const { title, description, due_date, assignee_id, status, client_id, attachment_data, attachment_mime, attachment_filename, parent_task_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Titulo e obrigatorio' });

  let finalClientId = client_id || null;
  if (parent_task_id && !finalClientId) {
    const parent = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(parent_task_id);
    finalClientId = parent && parent.client_id ? parent.client_id : null;
  }

  const info = db.prepare(`
    INSERT INTO tasks (client_id, created_by, assignee_id, parent_task_id, title, description, due_date, status, attachment_data, attachment_mime, attachment_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalClientId, req.user.id, assignee_id || null, parent_task_id || null, title, description || '',
    due_date || null, status || 'pending', attachment_data || null, attachment_mime || null, attachment_filename || null
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { title, description, due_date, assignee_id, status, client_id, attachment_data, attachment_mime, attachment_filename } = req.body;
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      due_date = COALESCE(?, due_date),
      assignee_id = COALESCE(?, assignee_id),
      status = COALESCE(?, status),
      client_id = COALESCE(?, client_id),
      attachment_data = COALESCE(?, attachment_data),
      attachment_mime = COALESCE(?, attachment_mime),
      attachment_filename = COALESCE(?, attachment_filename),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title, description, due_date || null, assignee_id || null, status,
    client_id || null, attachment_data, attachment_mime, attachment_filename, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
