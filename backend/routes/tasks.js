const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const { persistMedia, externalizeGallery } = require('../services/mediaStorage');
const {
  getApprovalState,
  getApprovalStates,
  resetApprovalForTask,
  setDirectionDecision,
  sendToClient,
  getClientApprovalLink,
  getOrCreateClientApprovalLink,
} = require('../services/designerApprovals');

const { buildPostedReport } = require('../services/postedReport');
const { normalizeWorkflowStage, legacyStatusForWorkflow, workflowStageFromLegacy } = require('../utils/workflowState');
const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team', 'client'));

const TASK_STATUSES = new Set(['pending', 'in_progress', 'done', 'posted']);
const TASK_WORKFLOW_STAGES = new Set(['todo', 'in_progress', 'correction', 'approval', 'internal_approval', 'external_approval', 'approved', 'scheduled', 'posted']);
const TASK_APPROVAL_STATUSES = new Set(['completed', 'send', 'pending_approval', 'changes_requested', 'approved']);



function normalizeFeedContentType(contentType) {
  if (contentType === 'carrossel') return 'carrossel';
  if (contentType === 'story' || contentType === 'stories') return 'story';
  if (contentType === 'reels') return 'reels';
  return 'feed';
}

function taskHasMedia(task) {
  return Boolean(task?.attachment_data || parseGallery(task?.media_gallery).length);
}

function canAccessTask(user, task) {
  if (!task || Number(task.agency_id) !== Number(user.agency_id)) return false;
  if (user.role === 'admin' || user.is_operations_head) return true;
  if (user.role === 'client') {
    return Number(task.client_id) === Number(user.client_id);
  }
  if (user.role === 'team' && !user.is_operations_head) {
    const assigned = db.prepare(
      'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
    ).get(task.id, user.id);
    return Boolean(assigned);
  }
  return false;
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

function attachAssignees(rows, agencyId) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => Number(row.id));
  const placeholders = ids.map(() => '?').join(',');
  const assignments = db.prepare(`
    SELECT ta.task_id, u.id, u.name, u.avatar_color, u.avatar_data
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id IN (${placeholders}) AND u.agency_id = ?
    ORDER BY u.name
  `).all(...ids, agencyId);

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

function validateAssigneesForClient(clientId, assigneeIds, agencyId) {
  if (!Array.isArray(assigneeIds)) return { ok: true };
  const ids = [...new Set(assigneeIds.map(Number).filter(Boolean))];
  if (!ids.length) return { ok: true };

  const placeholders = ids.map(() => '?').join(',');
  const users = db.prepare(`SELECT id, role, is_operations_head FROM users WHERE agency_id = ? AND id IN (${placeholders})`).all(agencyId, ...ids);
  if (users.length !== ids.length || users.some((user) => !['admin', 'team'].includes(user.role))) {
    return { ok: false, error: 'Selecione somente membros da equipe como responsáveis' };
  }
  if (!clientId) return { ok: true };

  const teamIds = users.filter((user) => user.role === 'team' && Number(user.is_operations_head) !== 1).map((user) => user.id);
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


function getAccessibleParentOptions(user, task) {
  let query = `
    SELECT
      t.id, t.client_id, t.title, t.status, t.due_date,
      c.name AS client_name
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    WHERE t.parent_task_id IS NULL
      AND t.agency_id = ?
      AND t.id != ?
  `;
  const params = [Number(user.agency_id), Number(task.id)];

  if (task.client_id) {
    query += ' AND t.client_id = ?';
    params.push(Number(task.client_id));
  } else {
    query += ' AND t.client_id IS NULL';
  }

  if (user.role === 'team' && !user.is_operations_head) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(user.id));
  } else if (user.role === 'client') {
    query += ' AND 1 = 0';
  }

  query += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC, t.title COLLATE NOCASE ASC';
  return db.prepare(query).all(...params);
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

function serializeExternalGallery(value, fallbackData = null, fallbackMime = null) {
  const gallery = externalizeGallery(value, fallbackData, fallbackMime);
  return gallery.length ? JSON.stringify(gallery) : null;
}

function addTaskRecordToFeed(task, userId, agencyId) {
  if (!task.client_id) throw new Error('A tarefa precisa estar vinculada a um cliente');
  const taskGallery = parseGallery(task.media_gallery);
  if (!task.attachment_data && taskGallery.length === 0) {
    throw new Error('Anexe ao menos uma imagem antes de enviar para o feed');
  }

  const mediaData = task.attachment_data || taskGallery[0]?.data || null;
  const mediaMime = task.attachment_mime || taskGallery[0]?.mime || null;
  const galleryJson = taskGallery.length ? JSON.stringify(taskGallery) : null;
  const feedContentType = normalizeFeedContentType(task.content_type);
  const workflowStage = normalizeWorkflowStage(task.workflow_stage || workflowStageFromLegacy(task.status));

  if (task.feed_post_id) {
    const existingPost = db.prepare('SELECT id FROM posts WHERE id = ? AND agency_id = ?').get(task.feed_post_id, agencyId);
    if (existingPost) {
      db.prepare(`
        UPDATE posts SET
          title = ?, caption = ?, content_type = ?, media_data = ?, media_mime = ?, media_gallery = ?,
          scheduled_at = COALESCE(?, scheduled_at), workflow_stage = ?, feed_visible = 1,
          updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(
        task.title,
        task.caption || '',
        feedContentType,
        mediaData,
        mediaMime,
        galleryJson,
        task.due_date || null,
        workflowStage,
        existingPost.id,
        agencyId
      );
      return { postId: Number(existingPost.id), action: 'updated' };
    }
  }

  const info = db.prepare(`
    INSERT INTO posts (
      agency_id, client_id, created_by, title, caption, content_type, platforms,
      media_data, media_mime, media_gallery, scheduled_at, status, workflow_stage, feed_visible
    ) VALUES (?, ?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, ?, 'draft', ?, 1)
  `).run(
    agencyId,
    task.client_id,
    userId,
    task.title,
    task.caption || '',
    feedContentType,
    mediaData,
    mediaMime,
    galleryJson,
    task.due_date || null,
    workflowStage
  );

  db.prepare(`UPDATE tasks SET feed_post_id = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
    .run(info.lastInsertRowid, task.id, agencyId);
  return { postId: Number(info.lastInsertRowid), action: 'created' };
}

function syncTaskMediaToLinkedFeedPost(task, agencyId) {
  if (!task?.feed_post_id) return { synced: false, reason: 'no_linked_post' };

  const existingPost = db.prepare('SELECT id FROM posts WHERE id = ? AND agency_id = ?')
    .get(Number(task.feed_post_id), Number(agencyId));
  if (!existingPost) return { synced: false, reason: 'post_not_found' };

  const gallery = parseGallery(task.media_gallery);
  const first = gallery[0] || (task.attachment_data ? {
    data: task.attachment_data,
    mime: task.attachment_mime || 'image/jpeg',
    filename: task.attachment_filename || '',
  } : null);
  const hasMedia = Boolean(first?.data);

  db.prepare(`
    UPDATE posts
    SET media_data = ?, media_mime = ?, media_gallery = ?,
        feed_visible = CASE WHEN ? = 1 THEN feed_visible ELSE 0 END,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    first?.data || null,
    first?.mime || null,
    gallery.length ? JSON.stringify(gallery) : null,
    hasMedia ? 1 : 0,
    Number(existingPost.id),
    Number(agencyId)
  );

  return { synced: true, postId: Number(existingPost.id), hasMedia };
}

// Tarefa (ou subtarefa de tarefa) que NÃO está no backlog. Usar em toda métrica/lista operacional.
const NOT_IN_BACKLOG = `COALESCE(t.is_backlog, 0) = 0
        AND (t.parent_task_id IS NULL OR t.parent_task_id NOT IN (SELECT bt.id FROM tasks bt WHERE COALESCE(bt.is_backlog, 0) = 1))`;

function taskSummaryQuery(whereClause) {
  return `
    SELECT
      t.id, t.agency_id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.content_type, t.content_tag, t.front_name, t.project_name, t.priority, t.goal, t.briefing_json, t.due_date, t.status, t.workflow_stage, t.approval_status, t.designer_completed, t.is_featured, COALESCE(t.is_backlog, 0) AS is_backlog, t.attachment_filename, t.feed_post_id,
      t.direction_status, t.direction_feedback, t.direction_by, t.direction_at,
      t.client_status, t.client_feedback, t.client_at,
      COALESCE(p.feed_visible, 0) AS feed_post_visible,
      t.created_at, t.updated_at,
      c.name AS client_name,
      COALESCE(
        CASE
          WHEN t.workflow_stage = 'correction' OR t.approval_status = 'changes_requested' THEN
            COALESCE(NULLIF(TRIM(t.client_feedback), ''), NULLIF(TRIM(t.direction_feedback), ''))
          ELSE NULL
        END,
        (
          SELECT COALESCE(
            NULLIF(TRIM(st.client_feedback), ''),
            NULLIF(TRIM(st.direction_feedback), ''),
            NULLIF(TRIM(das.client_feedback), ''),
            NULLIF(TRIM(das.direction_feedback), '')
          )
          FROM tasks st
          LEFT JOIN designer_approval_states das ON das.task_id = st.id AND das.agency_id = st.agency_id
          WHERE st.parent_task_id = t.id
            AND st.agency_id = t.agency_id
            AND (st.workflow_stage = 'correction' OR st.approval_status = 'changes_requested')
          ORDER BY COALESCE(st.updated_at, st.created_at) DESC, st.id DESC
          LIMIT 1
        )
      ) AS correction_feedback,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id) AS subtask_total,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'pending') AS subtask_pending,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'in_progress') AS subtask_in_progress,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND COALESCE(st.designer_completed, 0) = 1) AS subtask_done,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'posted') AS subtask_posted,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND (st.workflow_stage = 'correction' OR st.approval_status = 'changes_requested')) AS subtask_correction
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
    ${whereClause}
  `;
}

function getTaskSummary(taskId, agencyId) {
  const row = db.prepare(taskSummaryQuery('WHERE t.id = ? AND t.agency_id = ?')).get(taskId, agencyId);
  return row ? attachAssignees([row], agencyId)[0] : null;
}

router.get('/', (req, res) => {
  const { status, assignee_id, client_id, summary } = req.query;

  // O painel precisa apenas de prazo e status. Esta rota compacta evita as
  // contagens correlacionadas de subtarefas e o carregamento de responsáveis,
  // além de incluir tarefas e subtarefas nas métricas gerais.
  if (summary === 'dashboard') {
    let compactQuery = `
      SELECT t.id, t.client_id, t.parent_task_id, t.due_date, t.status, t.is_featured
      FROM tasks t
      WHERE t.agency_id = ?
        AND ${NOT_IN_BACKLOG}
    `;
    const compactParams = [req.user.agency_id];

    if (req.user.role === 'team' && !req.user.is_operations_head) {
      compactQuery += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
      compactParams.push(Number(req.user.id));
    } else if (req.user.role === 'client') {
      compactQuery += ' AND t.client_id = ?';
      compactParams.push(Number(req.user.client_id));
    }

    if (client_id) {
      if (!ensureClientAccess(req, res, client_id)) return;
      compactQuery += ' AND t.client_id = ?';
      compactParams.push(Number(client_id));
    }
    if (status) {
      compactQuery += ' AND t.status = ?';
      compactParams.push(status);
    }
    if (assignee_id) {
      compactQuery += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
      compactParams.push(Number(assignee_id));
    }

    compactQuery += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC';
    return res.json({ tasks: db.prepare(compactQuery).all(...compactParams) });
  }

  // Backlog fica fora de tudo por padrão (contadores, kanban, painel). Só aparece com ?backlog=1.
  let query = taskSummaryQuery(`WHERE t.parent_task_id IS NULL AND t.agency_id = ? AND COALESCE(t.is_backlog, 0) = ${req.query.backlog === '1' ? 1 : 0}`);
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(req.user.id));
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

  const tasks = attachAssignees(db.prepare(query).all(...params), req.user.agency_id);
  res.json({ tasks });
});



// ---------------------------------------------------------------------------
// Fila de agendamento (Social Media): peças aprovadas pelo cliente, prontas para
// agendar/postar. Acesso por cliente (não por responsável da tarefa).
// ---------------------------------------------------------------------------
const SCHEDULE_STAGES = ['approved', 'scheduled', 'posted'];

function scheduleImages(row) {
  const gallery = parseGallery(row.media_gallery).filter((item) => {
    const mime = String(item?.mime || item?.type || '').toLowerCase();
    const data = String(item?.data || item?.url || item?.src || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data) || data.startsWith('data:image/') || data.startsWith('/api/media/');
  });
  if (gallery.length) {
    return gallery.map((item) => ({ data: item.data || item.url || item.src, mime: item.mime || item.type || 'image/jpeg', filename: item.filename || '' }));
  }
  const mime = String(row.attachment_mime || '').toLowerCase();
  if (row.attachment_data && (mime.startsWith('image/') || String(row.attachment_data).startsWith('data:image/') || String(row.attachment_data).startsWith('/api/media/'))) {
    return [{ data: row.attachment_data, mime: row.attachment_mime || 'image/jpeg', filename: row.attachment_filename || '' }];
  }
  return [];
}

const SCHEDULE_PLATFORMS = ['instagram_feed', 'instagram_stories', 'instagram_reels', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'pinterest', 'google'];

function cleanPlatforms(value) {
  const list = Array.isArray(value) ? value : [];
  return SCHEDULE_PLATFORMS.filter((key) => list.includes(key));
}

function parsePlatforms(raw) {
  try { return cleanPlatforms(JSON.parse(raw || '[]')); } catch { return []; }
}

// Relatório de postagens do mês (peças marcadas como postadas). O mês vale pela data de postagem da peça.
router.get('/posted-report', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const { client_id } = req.query;
  if (client_id && !canAccessClient(req.user, Number(client_id))) {
    return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  }
  const scoped = !client_id && req.user.role === 'team' && !req.user.is_operations_head;
  return res.json(buildPostedReport({
    agencyId: req.user.agency_id,
    month: req.query.month,
    clientId: client_id ? Number(client_id) : null,
    clientIds: scoped ? (req.user.client_ids || []).map(Number).filter(Boolean) : null,
  }));
});

// Link público do relatório de um cliente + mês (mesmo link sempre que repetir cliente/mês).
router.post('/posted-report/link', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const clientId = Number(req.body?.client_id);
  const month = String(req.body?.month || '');
  if (!clientId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Escolha um cliente e um mês.' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, Number(req.user.agency_id));
  if (!client || !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  let row = db.prepare('SELECT token FROM posted_report_links WHERE agency_id = ? AND client_id = ? AND month = ?').get(Number(req.user.agency_id), clientId, month);
  if (!row) {
    const token = require('crypto').randomBytes(18).toString('hex');
    db.prepare('INSERT INTO posted_report_links (agency_id, client_id, month, token, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(Number(req.user.agency_id), clientId, month, token, Number(req.user.id));
    row = { token };
  }
  return res.json({ token: row.token, path: `/relatorio/${row.token}` });
});

router.get('/schedule-queue', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const { client_id } = req.query;
  if (client_id && !canAccessClient(req.user, Number(client_id))) {
    return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  }

  let query = `
    SELECT t.id, t.parent_task_id, COALESCE(t.client_id, parent.client_id) AS client_id,
           t.title, t.caption, t.content_type, t.due_date, t.workflow_stage, t.client_at, t.posted_at,
           t.updated_at, t.scheduled_platforms, t.attachment_data, t.attachment_mime, t.attachment_filename, t.media_gallery,
           c.name AS client_name, c.logo_color AS client_color, parent.title AS parent_title
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN clients c ON c.id = COALESCE(t.client_id, parent.client_id) AND c.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND COALESCE(t.is_backlog, 0) = 0
      AND COALESCE(parent.is_backlog, 0) = 0
      AND t.task_type != 'video'
      AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
      AND (t.client_status = 'approved' OR t.approval_status = 'approved')
      AND (
        t.workflow_stage IN ('approved', 'scheduled')
        OR (t.workflow_stage = 'posted' AND substr(COALESCE(t.posted_at, t.updated_at), 1, 10) >= date('now', '-45 days'))
      )
  `;
  const params = [req.user.agency_id];
  if (client_id) {
    query += ' AND COALESCE(t.client_id, parent.client_id) = ?';
    params.push(Number(client_id));
  } else if (req.user.role === 'team' && !req.user.is_operations_head) {
    const ids = (req.user.client_ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.json({ items: [], counts: { approved: 0, scheduled: 0, posted: 0 } });
    query += ` AND COALESCE(t.client_id, parent.client_id) IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  query += ` ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.id ASC`;

  const counts = { approved: 0, scheduled: 0, posted: 0 };
  const items = db.prepare(query).all(...params).map((row) => {
    counts[row.workflow_stage] = (counts[row.workflow_stage] || 0) + 1;
    const allImages = scheduleImages(row);
    // Postadas: só a capa (miniatura) para não pesar a lista; o total vai em image_count.
    const images = row.workflow_stage === 'posted' ? allImages.slice(0, 1) : allImages;
    return {
      id: row.id,
      parent_task_id: row.parent_task_id,
      parent_title: row.parent_title,
      client_id: row.client_id,
      client_name: row.client_name,
      client_color: row.client_color,
      title: row.title,
      caption: row.caption || '',
      content_type: row.content_type,
      due_date: row.due_date,
      stage: row.workflow_stage,
      approved_at: row.client_at,
      posted_at: row.posted_at,
      platforms: parsePlatforms(row.scheduled_platforms),
      images,
      image_count: allImages.length,
    };
  });
  return res.json({ items, counts });
});

// Social Media move a peça aprovada entre: para agendar -> agendada -> postada (e desfaz).
router.post('/:id/schedule-status', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const stage = String(req.body?.stage || '');
  if (!SCHEDULE_STAGES.includes(stage)) return res.status(400).json({ error: 'Etapa inválida.' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  let clientId = task.client_id;
  if (!clientId && task.parent_task_id) {
    clientId = db.prepare('SELECT client_id FROM tasks WHERE id = ? AND agency_id = ?').get(task.parent_task_id, req.user.agency_id)?.client_id;
  }
  if (!canAccessClient(req.user, Number(clientId))) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  const approvedByClient = task.client_status === 'approved' || task.approval_status === 'approved';
  if (!approvedByClient || !SCHEDULE_STAGES.includes(task.workflow_stage)) {
    return res.status(400).json({ error: 'Somente peças aprovadas pelo cliente podem ser agendadas ou postadas.' });
  }

  if (Array.isArray(req.body?.platforms)) {
    db.prepare('UPDATE tasks SET scheduled_platforms = ? WHERE id = ? AND agency_id = ?')
      .run(JSON.stringify(cleanPlatforms(req.body.platforms)), Number(task.id), Number(req.user.agency_id));
  }
  db.prepare(`
    UPDATE tasks
    SET workflow_stage = ?, status = ?, designer_completed = 1,
        posted_at = CASE WHEN ? = 'posted' THEN datetime('now') ELSE NULL END,
        posted_by = CASE WHEN ? = 'posted' THEN ? ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(stage, legacyStatusForWorkflow(stage), stage, stage, Number(req.user.id), Number(task.id), Number(req.user.agency_id));
  const updated = db.prepare('SELECT id, workflow_stage, status, posted_at, scheduled_platforms FROM tasks WHERE id = ?').get(task.id);
  return res.json({ ok: true, task: { ...updated, platforms: parsePlatforms(updated.scheduled_platforms) } });
});

// Define em quais lugares a peça foi agendada/postada (Instagram feed/stories/reels, Facebook, TikTok...).
router.put('/:id/platforms', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  if (!Array.isArray(req.body?.platforms)) return res.status(400).json({ error: 'Lista de plataformas inválida.' });
  const task = db.prepare('SELECT id, client_id, parent_task_id FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  let clientId = task.client_id;
  if (!clientId && task.parent_task_id) {
    clientId = db.prepare('SELECT client_id FROM tasks WHERE id = ? AND agency_id = ?').get(task.parent_task_id, req.user.agency_id)?.client_id;
  }
  if (!canAccessClient(req.user, Number(clientId))) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  const platforms = cleanPlatforms(req.body.platforms);
  db.prepare("UPDATE tasks SET scheduled_platforms = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(JSON.stringify(platforms), Number(task.id), Number(req.user.agency_id));
  return res.json({ ok: true, platforms });
});

function validDay(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

function withNewDay(oldValue, day) {
  const time = /T(\d{2}:\d{2}(:\d{2})?)/.exec(String(oldValue || ''))?.[1] || '12:00:00';
  return `${day}T${time.length === 5 ? `${time}:00` : time}`;
}

// Corrige a data de postagem de uma peça (Aprovação e Agendamento). Mantém o post ligado em sincronia.
router.put('/:id/date', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const day = validDay(req.body?.date);
  if (!day) return res.status(400).json({ error: 'Data inválida.' });
  const task = db.prepare('SELECT id, client_id, parent_task_id, feed_post_id FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  let clientId = task.client_id;
  if (!clientId && task.parent_task_id) {
    clientId = db.prepare('SELECT client_id FROM tasks WHERE id = ? AND agency_id = ?').get(task.parent_task_id, req.user.agency_id)?.client_id;
  }
  if (!canAccessClient(req.user, Number(clientId))) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  db.transaction(() => {
    db.prepare("UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?").run(day, task.id, Number(req.user.agency_id));
    if (task.feed_post_id) {
      const post = db.prepare('SELECT scheduled_at FROM posts WHERE id = ? AND agency_id = ?').get(task.feed_post_id, Number(req.user.agency_id));
      if (post) db.prepare("UPDATE posts SET scheduled_at = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
        .run(withNewDay(post.scheduled_at, day), task.feed_post_id, Number(req.user.agency_id));
    }
  })();
  res.json({ ok: true, due_date: day });
});

// Mesma correção para posts antigos do feed (sem tarefa).
router.put('/posts/:postId/date', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const day = validDay(req.body?.date);
  if (!day) return res.status(400).json({ error: 'Data inválida.' });
  const post = db.prepare('SELECT id, client_id, scheduled_at FROM posts WHERE id = ? AND agency_id = ?').get(Number(req.params.postId), Number(req.user.agency_id));
  if (!post) return res.status(404).json({ error: 'Post nao encontrado' });
  if (!canAccessClient(req.user, Number(post.client_id))) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  db.prepare("UPDATE posts SET scheduled_at = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(withNewDay(post.scheduled_at, day), post.id, Number(req.user.agency_id));
  res.json({ ok: true, due_date: day });
});

// Grade visual de aprovação do Squad -> Designer.
// A grade é derivada diretamente das tarefas/subtarefas em "Em aprovação",
// portanto não depende da grade editorial do Social Media.
router.get('/approval-grid', (req, res) => {
  const { client_id } = req.query;
  let query = `
    SELECT
      t.id, t.agency_id, COALESCE(t.client_id, parent.client_id) AS client_id, t.parent_task_id, t.task_type,
      t.title, t.content_type, t.content_tag, t.front_name, t.caption,
      t.due_date, t.status, t.workflow_stage, t.approval_status,
      t.direction_status, t.direction_feedback, t.direction_by, t.direction_at,
      t.client_status, t.client_feedback, t.client_at,
      t.attachment_data, t.attachment_mime, t.attachment_filename, t.media_gallery,
      t.created_at, t.updated_at, t.scheduled_platforms,
      c.name AS client_name, c.logo_color AS client_color
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN clients c ON c.id = COALESCE(t.client_id, parent.client_id) AND c.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND ${NOT_IN_BACKLOG}
      AND t.task_type != 'video'
      AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
      AND (LOWER(COALESCE(t.workflow_stage, '')) NOT IN ('scheduled', 'posted') OR t.feed_post_id IS NOT NULL)
      AND (
        t.workflow_stage IN ('approval', 'internal_approval', 'external_approval', 'approved', 'correction')
        OR LOWER(COALESCE(t.approval_status, '')) = 'changes_requested'
        OR t.direction_status IN ('approved', 'changes_requested')
        OR t.client_status = 'changes_requested'
        OR EXISTS (
          SELECT 1 FROM designer_approval_states das
          WHERE das.task_id = t.id AND das.agency_id = t.agency_id
            AND (
              das.direction_status IN ('pending', 'approved', 'changes_requested')
              OR das.client_status = 'changes_requested'
            )
        )
      )
  `;
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += ` AND (
      t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
      OR t.parent_task_id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
    )`;
    params.push(Number(req.user.id), Number(req.user.id));
  } else if (req.user.role === 'client') {
    query += ' AND COALESCE(t.client_id, parent.client_id) = ?';
    params.push(Number(req.user.client_id));
  }

  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND COALESCE(t.client_id, parent.client_id) = ?';
    params.push(Number(client_id));
  }

  query += ' ORDER BY COALESCE(t.updated_at, t.created_at) DESC';

  const rows = db.prepare(query).all(...params);
  const approvalStates = getApprovalStates(rows.map((row) => row.id), req.user.agency_id);
  const items = rows.map((row) => {
    const persistedApprovalState = approvalStates.get(Number(row.id));
    const legacyApprovalStatus = String(row.approval_status || '').toLowerCase();
    const rawWorkflowStage = String(row.workflow_stage || '').toLowerCase();
    const inferredLegacyState = legacyApprovalStatus === 'approved' || rawWorkflowStage === 'approved'
      ? { direction_status: 'approved', client_status: 'approved' }
      : (legacyApprovalStatus === 'pending_approval' || legacyApprovalStatus === 'send' || rawWorkflowStage === 'external_approval')
          ? { direction_status: 'approved', client_status: 'pending' }
          : (legacyApprovalStatus === 'changes_requested' || normalizeWorkflowStage(row.workflow_stage) === 'correction')
              ? { direction_status: 'changes_requested', client_status: 'waiting' }
              : { direction_status: 'pending', client_status: 'waiting' };
    let approvalState = persistedApprovalState || {
      ...inferredLegacyState,
      direction_feedback: null,
      direction_by: null,
      direction_at: null,
      client_feedback: null,
      client_at: null,
    };
    approvalState = {
      ...approvalState,
      direction_status: (row.direction_status && row.direction_status !== 'pending')
        ? row.direction_status
        : (approvalState.direction_status || row.direction_status || inferredLegacyState.direction_status),
      direction_feedback: row.direction_feedback || approvalState.direction_feedback || null,
      direction_by: row.direction_by || approvalState.direction_by || null,
      direction_at: row.direction_at || approvalState.direction_at || null,
      client_status: (row.client_status && row.client_status !== 'waiting')
        ? row.client_status
        : (approvalState.client_status || row.client_status || inferredLegacyState.client_status),
      client_feedback: row.client_feedback || approvalState.client_feedback || null,
      client_at: row.client_at || approvalState.client_at || null,
    };
    // Compatibilidade: se a decisão foi persistida por um backend anterior
    // apenas em approval_status, ela não pode ser sobrescrita por um estado
    // auxiliar antigo que ainda esteja como pending.
    if (legacyApprovalStatus === 'approved') {
      approvalState = { ...approvalState, direction_status: 'approved', client_status: 'approved' };
    } else if ((legacyApprovalStatus === 'pending_approval' || legacyApprovalStatus === 'send' || rawWorkflowStage === 'external_approval')
      && approvalState.direction_status === 'pending') {
      approvalState = { ...approvalState, direction_status: 'approved', client_status: 'pending' };
    } else if (legacyApprovalStatus === 'changes_requested'
      || normalizeWorkflowStage(row.workflow_stage) === 'correction') {
      approvalState = { ...approvalState, direction_status: 'changes_requested', client_status: 'waiting' };
    }
    const gallery = parseGallery(row.media_gallery);
    const imageGallery = gallery.filter((item) => {
      const mime = String(item?.mime || item?.type || '').toLowerCase();
      const data = String(item?.data || item?.url || item?.src || '').toLowerCase();
      return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data) || data.startsWith('data:image/');
    });
    const attachmentIsImage = String(row.attachment_mime || '').toLowerCase().startsWith('image/')
      || String(row.attachment_data || '').toLowerCase().startsWith('data:image/')
      || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(String(row.attachment_data || ''));

    const images = imageGallery.length
      ? imageGallery
      : (attachmentIsImage && row.attachment_data
          ? [{ data: row.attachment_data, mime: row.attachment_mime || 'image/jpeg', filename: row.attachment_filename || '' }]
          : []);

    return {
      id: row.id,
      client_id: row.client_id,
      parent_task_id: row.parent_task_id,
      title: row.title,
      content_type: row.content_type,
      content_tag: row.content_tag,
      caption: row.caption,
      due_date: row.due_date,
      workflow_stage: normalizeWorkflowStage(row.workflow_stage),
      approval_status: row.approval_status || null,
      client_name: row.client_name,
      client_color: row.client_color,
      images,
      image_count: images.length,
      direction_status: approvalState.direction_status || 'pending',
      direction_feedback: approvalState.direction_feedback || null,
      direction_by: approvalState.direction_by || null,
      direction_at: approvalState.direction_at || null,
      client_status: approvalState.client_status || 'waiting',
      client_feedback: approvalState.client_feedback || null,
      client_at: approvalState.client_at || null,
      correction_feedback: approvalState.client_status === 'changes_requested'
        ? (approvalState.client_feedback || approvalState.direction_feedback || null)
        : (approvalState.direction_status === 'changes_requested'
            ? (approvalState.direction_feedback || approvalState.client_feedback || null)
            : null),
      correction_source: approvalState.client_status === 'changes_requested'
        ? 'client'
        : (approvalState.direction_status === 'changes_requested' ? 'direction' : null),
      updated_at: row.updated_at,
      platforms: parsePlatforms(row.scheduled_platforms),
    };
  }).filter((item) => item.image_count > 0);

  // Posts antigos da grade do Social Media (que não nasceram de uma tarefa) também aparecem
  // na grade do cliente selecionado, somente para visualização.
  if (client_id && req.user.role !== 'client') {
    const legacyPosts = db.prepare(`
      SELECT p.id, p.client_id, p.title, p.caption, p.content_type, p.media_data, p.media_mime, p.media_gallery,
             p.scheduled_at, p.status, p.client_feedback, p.created_at, p.updated_at, COALESCE(p.is_pinned, 0) AS is_pinned
      FROM posts p
      WHERE p.agency_id = ? AND p.client_id = ?
        AND COALESCE(p.feed_visible, 1) = 1
        AND (p.scheduled_at IS NOT NULL OR p.status = 'pending_approval')
        AND p.status IN ('pending_approval', 'approved', 'rejected', 'scheduled', 'draft')
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.feed_post_id = p.id AND t.agency_id = p.agency_id)
      ORDER BY COALESCE(p.scheduled_at, p.updated_at, p.created_at) DESC, p.id DESC
    `).all(Number(req.user.agency_id), Number(client_id));
    for (const post of legacyPosts) {
      const gallery = parseGallery(post.media_gallery).filter((entry) => String(entry?.data || entry?.url || '').length > 0);
      const images = gallery.length
        ? gallery
        : (post.media_data ? [{ data: post.media_data, mime: post.media_mime || 'image/jpeg', filename: '' }] : []);
      if (!images.length) continue;
      const clientApproved = post.status === 'approved' || post.status === 'scheduled';
      const rejected = post.status === 'rejected';
      items.push({
        id: `post-${post.id}`,
        post_id: post.id,
        legacy_post: true,
        client_id: post.client_id,
        parent_task_id: null,
        title: post.title,
        content_type: post.content_type,
        content_tag: null,
        caption: post.caption || '',
        due_date: post.scheduled_at ? String(post.scheduled_at).slice(0, 10) : null,
        workflow_stage: 'approved',
        approval_status: clientApproved ? 'approved' : (rejected ? 'changes_requested' : 'pending_approval'),
        direction_status: 'approved',
        direction_feedback: null,
        client_status: clientApproved ? 'approved' : (rejected ? 'changes_requested' : 'pending'),
        post_status: post.status,
        is_pinned: Number(post.is_pinned || 0),
        in_client_view: true,
        platforms: [],
        client_feedback: post.client_feedback || null,
        images,
        image_count: images.length,
        created_at: post.created_at,
        updated_at: post.updated_at,
      });
    }
  }

  if (client_id) {
    // Marca quais peças (de tarefa) aparecem hoje no link do cliente: mesma regra do /public/feed.
    const taskItems = items.filter((item) => !item.legacy_post);
    if (taskItems.length) {
      const linked = new Map();
      const ids = taskItems.map((item) => Number(item.id));
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        db.prepare(`
          SELECT t.id AS task_id, p.status, p.scheduled_at, COALESCE(p.feed_visible, 1) AS feed_visible, COALESCE(p.is_pinned, 0) AS is_pinned
          FROM tasks t JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
          WHERE t.agency_id = ? AND t.id IN (${chunk.map(() => '?').join(',')})
        `).all(Number(req.user.agency_id), ...chunk).forEach((row) => linked.set(Number(row.task_id), row));
      }
      for (const item of taskItems) {
        const post = linked.get(Number(item.id));
        const visible = Boolean(post)
          && Number(post.feed_visible) === 1
          && (post.scheduled_at || post.status === 'pending_approval')
          && ['pending_approval', 'approved', 'rejected', 'scheduled', 'draft'].includes(post.status);
        item.in_client_view = Boolean(visible);
        item.post_status = post?.status || null;
        item.is_pinned = Number(post?.is_pinned || 0);
      }
    }
    const positions = new Map(db.prepare('SELECT item_key, position FROM approval_grid_order WHERE agency_id = ? AND client_id = ?')
      .all(Number(req.user.agency_id), Number(client_id)).map((row) => [row.item_key, Number(row.position)]));
    for (const item of items) {
      const key = item.legacy_post ? `post:${item.post_id}` : `task:${item.id}`;
      item.grid_position = positions.has(key) ? positions.get(key) : null;
    }
  }

  return res.json({ items, total: items.length });
});

// Ordem manual das peças na grade de Aprovação (mão que move). Guarda a ordem completa do cliente.
router.put('/approval-grid/order', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const clientId = Number(req.body?.client_id);
  if (!clientId || !ensureClientAccess(req, res, clientId)) return;
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String).filter((key) => /^(task|post):\d+$/.test(key)) : [];
  if (!keys.length || keys.length > 1000) return res.status(400).json({ error: 'Ordem inválida.' });
  const unique = [...new Set(keys)];
  db.transaction(() => {
    db.prepare('DELETE FROM approval_grid_order WHERE agency_id = ? AND client_id = ?').run(Number(req.user.agency_id), clientId);
    const insert = db.prepare('INSERT INTO approval_grid_order (agency_id, client_id, item_key, position) VALUES (?, ?, ?, ?)');
    unique.forEach((key, index) => insert.run(Number(req.user.agency_id), clientId, key, index));
  })();
  res.json({ ok: true, total: unique.length });
});

// Aprovação da direção acontece dentro do ZebraHub. Somente administração/direção
// pode decidir; a aprovação positiva libera a peça para o link do cliente.
router.post('/:id/direction-approval', (req, res) => {
  const canApproveDirection = req.user.role === 'admin' || req.user.is_agency_owner || req.user.is_platform_owner || req.user.is_operations_head;
  if (!canApproveDirection) {
    return res.status(403).json({ error: 'A aprovação da direção é restrita à administração.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  const isDesignerTask = task.task_type !== 'video' && String(task.front_name || '').trim().toLocaleLowerCase('pt-BR') !== 'site/lp';
  if (!isDesignerTask) {
    return res.status(400).json({ error: 'Esta peça não pertence ao fluxo do Designer.' });
  }
  // A própria grade de aprovação já controla o que pode chegar aqui. Não
  // bloqueamos a decisão apenas por um nome de etapa legado, pois versões
  // anteriores gravavam approval/internal_approval/external_approval de formas diferentes.
  if (!taskHasMedia(task)) {
    return res.status(400).json({ error: 'A peça precisa ter imagem para ser aprovada.' });
  }

  const decision = String(req.body?.decision || '');
  if (!['approved', 'changes_requested'].includes(decision)) {
    return res.status(400).json({ error: 'Decisão de aprovação inválida.' });
  }

  try {
    const state = setDirectionDecision({
      task,
      userId: req.user.id,
      decision,
      feedback: req.body?.feedback || null,
    });
    const effectiveClientId = Number(state?.client_id || task.client_id || 0) || null;
    const link = decision === 'approved' && effectiveClientId
      ? getOrCreateClientApprovalLink({ agencyId: req.user.agency_id, clientId: effectiveClientId, createdBy: req.user.id })
      : (effectiveClientId ? getClientApprovalLink(req.user.agency_id, effectiveClientId) : null);
    return res.json({ ok: true, state, link: link || null });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível registrar a aprovação da direção.' });
  }
});

// Envio explícito ao cliente: só depois da aprovação da direção, e só por quem
// pode decidir pela direção. Sem isso a peça fica retida na área da direção.
router.post('/:id/send-to-client', (req, res) => {
  const canApproveDirection = req.user.role === 'admin' || req.user.is_agency_owner || req.user.is_platform_owner || req.user.is_operations_head;
  if (!canApproveDirection) {
    return res.status(403).json({ error: 'O envio ao cliente é restrito à administração.' });
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  if (!taskHasMedia(task)) {
    return res.status(400).json({ error: 'A peça precisa ter imagem para ser enviada.' });
  }
  try {
    const result = sendToClient({ task });
    const clientId = Number(result.state?.client_id || task.client_id || 0) || null;
    const link = clientId
      ? getOrCreateClientApprovalLink({ agencyId: req.user.agency_id, clientId, createdBy: req.user.id })
      : null;
    return res.json({ ok: true, state: result.state, already_sent: !!result.already_sent, link: link || null });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível enviar ao cliente.' });
  }
});

// Persistência explícita do feedback de correção da Direção.
// Esta rota mantém o texto sincronizado tanto na própria tarefa quanto no
// estado auxiliar de aprovação, evitando que o feedback se perca entre telas.
router.put('/:id/correction-feedback', (req, res) => {
  const canApproveDirection = req.user.role === 'admin' || req.user.is_agency_owner || req.user.is_platform_owner || req.user.is_operations_head;
  if (!canApproveDirection) {
    return res.status(403).json({ error: 'O feedback da direção é restrito à administração.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(req.params.id), Number(req.user.agency_id));
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  const feedback = String(req.body?.feedback || '').trim();
  if (!feedback) return res.status(400).json({ error: 'Escreva o feedback da correção.' });

  const now = new Date().toISOString();
  const effectiveClientId = Number(task.client_id || 0) || (() => {
    if (!task.parent_task_id) return null;
    const parent = db.prepare('SELECT client_id FROM tasks WHERE id = ? AND agency_id = ?').get(Number(task.parent_task_id), Number(task.agency_id));
    return Number(parent?.client_id || 0) || null;
  })();

  const persistFeedback = db.transaction(() => {
    if (effectiveClientId && !task.client_id) {
      db.prepare('UPDATE tasks SET client_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND agency_id = ?')
        .run(effectiveClientId, Number(task.id), Number(task.agency_id));
    }

    db.prepare(`
      INSERT INTO designer_approval_states (
        task_id, agency_id, client_id,
        direction_status, direction_feedback, direction_by, direction_at,
        client_status, client_feedback, client_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'changes_requested', ?, ?, ?, 'waiting', NULL, NULL, datetime('now'), datetime('now'))
      ON CONFLICT(task_id) DO UPDATE SET
        agency_id = excluded.agency_id,
        client_id = COALESCE(excluded.client_id, designer_approval_states.client_id),
        direction_status = 'changes_requested',
        direction_feedback = excluded.direction_feedback,
        direction_by = excluded.direction_by,
        direction_at = excluded.direction_at,
        client_status = 'waiting',
        updated_at = datetime('now')
    `).run(
      Number(task.id),
      Number(task.agency_id),
      effectiveClientId,
      feedback,
      Number(req.user.id),
      now
    );

    db.prepare(`
      UPDATE tasks
      SET direction_status = 'changes_requested', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'waiting', approval_status = 'changes_requested', workflow_stage = 'correction',
          designer_completed = 0, status = 'in_progress', updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(feedback, Number(req.user.id), now, Number(task.id), Number(task.agency_id));
  });

  try {
    persistFeedback();
    const state = getApprovalState(Number(task.id), Number(task.agency_id));
    return res.json({
      ok: true,
      state: {
        ...(state || {}),
        direction_status: 'changes_requested',
        direction_feedback: feedback,
        correction_feedback: feedback,
        correction_source: 'direction',
      },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível salvar o feedback da correção.' });
  }
});

router.get('/approval-link/client/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!clientId || !ensureClientAccess(req, res, clientId)) return;

  try {
    // Para a equipe, o link deve simplesmente existir ao abrir a aba Cliente.
    // Assim não dependemos de um clique extra em "Gerar link" para liberar a
    // aprovação externa. Usuários cliente continuam apenas consultando.
    const link = req.user.role === 'client'
      ? getClientApprovalLink(req.user.agency_id, clientId)
      : getOrCreateClientApprovalLink({
          agencyId: req.user.agency_id,
          clientId,
          createdBy: req.user.id,
        });
    if (!link?.token) {
      return res.status(500).json({ error: 'O link de aprovação não pôde ser criado para este cliente.' });
    }
    return res.json({ link });
  } catch (error) {
    console.error('[DESIGNER_APPROVAL_LINK] Erro ao carregar/criar link:', error);
    return res.status(500).json({ error: 'Não foi possível preparar o link de aprovação do cliente.' });
  }
});

router.post('/approval-link/client/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!clientId || !ensureClientAccess(req, res, clientId)) return;
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Apenas a equipe pode gerar o link de aprovação do cliente.' });
  }

  try {
    const link = getOrCreateClientApprovalLink({
      agencyId: req.user.agency_id,
      clientId,
      createdBy: req.user.id,
    });
    if (!link?.token) {
      return res.status(500).json({ error: 'O link de aprovação não pôde ser criado para este cliente.' });
    }
    return res.json({ link });
  } catch (error) {
    console.error('[DESIGNER_APPROVAL_LINK] Erro ao gerar link:', error);
    return res.status(500).json({ error: 'Não foi possível preparar o link de aprovação do cliente.' });
  }
});

// Métricas leves do painel. Cada registro é contabilizado individualmente,
// portanto tarefas principais e subtarefas entram no total e nos status.
router.get('/dashboard-stats', (req, res) => {
  const { client_id, start_date, end_date, today_date } = req.query;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(String(start_date || '')) || !datePattern.test(String(end_date || ''))) {
    return res.status(400).json({ error: 'Informe um período válido para o painel' });
  }

  const today = datePattern.test(String(today_date || ''))
    ? String(today_date)
    : new Date().toISOString().slice(0, 10);

  let query = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN t.status IN ('done', 'posted') THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN t.status NOT IN ('done', 'posted') AND substr(t.due_date, 1, 10) < ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN t.status NOT IN ('done', 'posted') AND substr(t.due_date, 1, 10) >= ? THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN t.parent_task_id IS NULL THEN 1 ELSE 0 END) AS task_total,
      SUM(CASE WHEN t.parent_task_id IS NOT NULL THEN 1 ELSE 0 END) AS subtask_total
    FROM tasks t
    WHERE t.agency_id = ?
      AND t.due_date IS NOT NULL
      AND substr(t.due_date, 1, 10) BETWEEN ? AND ?
  `;
  const params = [today, today, Number(req.user.agency_id), String(start_date), String(end_date)];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    // Uma subtarefa também entra quando sua tarefa principal está atribuída ao usuário,
    // espelhando o total exibido na área de Tarefas.
    query += `
      AND (
        t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
        OR t.parent_task_id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
      )
    `;
    params.push(Number(req.user.id), Number(req.user.id));
  } else if (req.user.role === 'client') {
    query += ' AND t.client_id = ?';
    params.push(Number(req.user.client_id));
  }

  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND t.client_id = ?';
    params.push(Number(client_id));
  }

  const row = db.prepare(query).get(...params) || {};
  return res.json({
    stats: {
      total: Number(row.total || 0),
      pending: Number(row.pending || 0),
      overdue: Number(row.overdue || 0),
      done: Number(row.done || 0),
      task_total: Number(row.task_total || 0),
      subtask_total: Number(row.subtask_total || 0),
      includes_subtasks: true,
    },
  });
});


router.get('/calendar', (req, res) => {
  const { client_id } = req.query;
  let query = `
    SELECT
      t.id, t.agency_id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.content_type, t.content_tag, t.front_name, t.due_date, t.status, t.workflow_stage, t.approval_status, t.designer_completed, t.is_featured, t.attachment_filename, t.feed_post_id,
      COALESCE(p.feed_visible, 0) AS feed_post_visible,
      t.created_at, t.updated_at,
      c.name AS client_name,
      parent.title AS parent_title,
      CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END AS is_subtask,
      CASE WHEN t.parent_task_id IS NULL THEN
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id)
      ELSE 0 END AS subtask_total,
      CASE WHEN t.parent_task_id IS NULL THEN
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status IN ('done', 'posted'))
      ELSE 0 END AS subtask_done,
      CASE WHEN t.parent_task_id IS NULL THEN
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'posted')
      ELSE 0 END AS subtask_posted
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
    WHERE t.agency_id = ? AND t.due_date IS NOT NULL
      AND ${NOT_IN_BACKLOG}
  `;
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(req.user.id));
  } else if (req.user.role === 'client') {
    query += ' AND t.client_id = ?';
    params.push(Number(req.user.client_id));
  }

  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND t.client_id = ?';
    params.push(Number(client_id));
  }

  query += ` ORDER BY
    t.due_date ASC,
    CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END,
    COALESCE(parent.title, t.title) COLLATE NOCASE ASC,
    t.title COLLATE NOCASE ASC`;

  const tasks = attachAssignees(db.prepare(query).all(...params), req.user.agency_id);
  res.json({ tasks });
});

router.get('/featured/all', (req, res) => {
  let query = taskSummaryQuery(`
    WHERE t.parent_task_id IS NULL
      AND t.agency_id = ?
      AND t.is_featured = 1
  `);
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(req.user.id));
  } else if (req.user.role === 'client') {
    query += ' AND t.client_id = ?';
    params.push(Number(req.user.client_id));
  }

  query += ` ORDER BY
    CASE t.status WHEN 'posted' THEN 2 WHEN 'done' THEN 1 ELSE 0 END,
    CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
    t.due_date ASC,
    t.updated_at DESC`;

  const tasks = attachAssignees(db.prepare(query).all(...params), req.user.agency_id);
  res.json({ tasks });
});

router.get('/:id/parent-options', requireRole('admin', 'team'), (req, res) => {
  const task = db.prepare('SELECT id, agency_id, client_id, parent_task_id FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  const childCount = db.prepare('SELECT COUNT(*) AS total FROM tasks WHERE parent_task_id = ? AND agency_id = ?').get(task.id, req.user.agency_id).total;
  const options = getAccessibleParentOptions(req.user, task);
  res.json({ options, child_count: Number(childCount || 0) });
});

router.put('/:id/convert-to-subtask', requireRole('admin', 'team'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  if (!ensureModifyTask(req, res, task)) return;

  const parentId = Number(req.body.parent_task_id);
  if (!parentId) return res.status(400).json({ error: 'Selecione a tarefa principal' });
  if (parentId === Number(task.id)) return res.status(400).json({ error: 'Uma tarefa nao pode ser subtarefa dela mesma' });

  const childCount = db.prepare('SELECT COUNT(*) AS total FROM tasks WHERE parent_task_id = ? AND agency_id = ?').get(task.id, req.user.agency_id).total;
  if (Number(childCount || 0) > 0) {
    return res.status(400).json({ error: 'Esta tarefa possui subtarefas. Mova ou remova essas subtarefas antes da conversao.' });
  }

  const parent = db.prepare('SELECT id, agency_id, client_id, parent_task_id FROM tasks WHERE id = ? AND agency_id = ?').get(parentId, req.user.agency_id);
  if (!parent) return res.status(404).json({ error: 'Tarefa principal nao encontrada' });
  if (parent.parent_task_id) return res.status(400).json({ error: 'Selecione uma tarefa principal, nao uma subtarefa' });
  if (!ensureTaskAccess(req, res, parent)) return;

  const taskClientId = task.client_id ? Number(task.client_id) : null;
  const parentClientId = parent.client_id ? Number(parent.client_id) : null;
  if (taskClientId !== parentClientId) {
    return res.status(400).json({ error: 'A tarefa e a tarefa principal precisam pertencer ao mesmo cliente' });
  }

  db.prepare(`
    UPDATE tasks
    SET parent_task_id = ?, is_featured = 0, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(parentId, task.id, req.user.agency_id);

  res.json({ ok: true, task_id: Number(task.id), parent_task_id: parentId });
});

// Mídias são carregadas separadamente para o modal abrir imediatamente.
router.get('/:id/media', (req, res) => {
  const task = db.prepare(`
    SELECT id, agency_id, client_id, attachment_data, attachment_mime, attachment_filename, media_gallery
    FROM tasks WHERE id = ? AND agency_id = ?
  `).get(req.params.id, req.user.agency_id);
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

router.get('/briefing-suggestions', (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const clientId = Number(req.query.client_id);
  if (!clientId) return res.json({ items: [] });
  if (!canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
  const rows = db.prepare(`
    SELECT id, title, project_name, front_name, priority, goal, briefing_json, due_date, created_at, updated_at
    FROM tasks
    WHERE agency_id = ? AND client_id = ? AND parent_task_id IS NULL
      AND briefing_json IS NOT NULL AND TRIM(briefing_json) != ''
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT ?
  `).all(Number(req.user.agency_id), clientId, limit);
  return res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT
      t.id, t.agency_id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.description, t.content_type, t.content_tag, t.front_name, t.project_name, t.priority, t.goal, t.briefing_json, t.caption, t.video_link,
      t.due_date, t.status, t.workflow_stage, t.approval_status, t.designer_completed, COALESCE(t.is_backlog, 0) AS is_backlog,
      t.direction_status, t.direction_feedback, t.direction_by, t.direction_at, t.client_status, t.client_feedback, t.client_at,
      t.is_featured, t.attachment_mime, t.attachment_filename,
      t.feed_post_id, COALESCE(p.feed_visible, 0) AS feed_post_visible, t.created_at, t.updated_at,
      CASE WHEN t.attachment_data IS NOT NULL AND length(t.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment,
      CASE WHEN t.media_gallery IS NOT NULL AND length(t.media_gallery) > 2 THEN 1 ELSE 0 END AS has_gallery,
      c.name AS client_name, c.logo_color AS client_color
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
    WHERE t.id = ? AND t.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  task.assignees = attachAssignees([{ id: task.id }], req.user.agency_id)[0].assignees;
  task.briefing_history = db.prepare(`
    SELECT e.id, e.event_type, e.snapshot_json, e.created_at, u.name AS user_name
    FROM task_briefing_events e
    LEFT JOIN users u ON u.id = e.user_id AND u.agency_id = e.agency_id
    WHERE e.agency_id = ? AND e.task_id = ?
    ORDER BY e.id DESC
    LIMIT 20
  `).all(Number(req.user.agency_id), Number(task.id));


  let subtaskQuery = `
    SELECT st.id, st.client_id, st.created_by, st.parent_task_id, st.task_type, st.content_type, st.content_tag, st.front_name,
           st.title, st.caption, st.status, st.workflow_stage, st.approval_status, st.designer_completed,
           st.direction_status, st.direction_feedback, st.direction_by, st.direction_at, st.client_status, st.client_feedback, st.client_at,
           st.due_date, st.attachment_filename, st.feed_post_id,
           COALESCE(sp.feed_visible, 0) AS feed_post_visible,
           CASE WHEN st.attachment_data IS NOT NULL AND length(st.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment,
           CASE WHEN st.media_gallery IS NOT NULL AND length(st.media_gallery) > 2 THEN 1 ELSE 0 END AS has_gallery
    FROM tasks st
    LEFT JOIN posts sp ON sp.id = st.feed_post_id AND sp.agency_id = st.agency_id
    WHERE st.parent_task_id = ? AND st.agency_id = ?
  `;
  const subtaskParams = [req.params.id, req.user.agency_id];
  if (req.user.role === 'team' && !req.user.is_operations_head) {
    subtaskQuery += ' AND st.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    subtaskParams.push(Number(req.user.id));
  }
  subtaskQuery += ' ORDER BY COALESCE(st.due_date, st.created_at) ASC';
  const subtaskRows = db.prepare(subtaskQuery).all(...subtaskParams);
  const subtasks = attachAssignees(subtaskRows, req.user.agency_id);

  const approvalStates = getApprovalStates([task.id, ...subtasks.map((item) => item.id)], req.user.agency_id);
  const taskApprovalState = approvalStates.get(Number(task.id));
  if (taskApprovalState) {
    task.direction_status = taskApprovalState.direction_status || task.direction_status;
    task.direction_feedback = taskApprovalState.direction_feedback || task.direction_feedback;
    task.client_status = taskApprovalState.client_status || task.client_status;
    task.client_feedback = taskApprovalState.client_feedback || task.client_feedback;
    task.correction_feedback = taskApprovalState.correction_feedback || task.correction_feedback || null;
  } else {
    task.correction_feedback = String(task.client_feedback || task.direction_feedback || '').trim() || null;
  }
  subtasks.forEach((subtask) => {
    const state = approvalStates.get(Number(subtask.id));
    if (state) {
      subtask.direction_status = state.direction_status || subtask.direction_status;
      subtask.direction_feedback = state.direction_feedback || subtask.direction_feedback;
      subtask.client_status = state.client_status || subtask.client_status;
      subtask.client_feedback = state.client_feedback || subtask.client_feedback;
      subtask.correction_feedback = state.correction_feedback || null;
    } else {
      subtask.correction_feedback = String(subtask.client_feedback || subtask.direction_feedback || '').trim() || null;
    }
  });

  res.json({ task, subtasks });
});

router.post('/', (req, res) => {
  const {
    title, description, task_type, content_type, content_tag, front_name, caption, video_link, media_gallery,
    due_date, assignee_ids, status, workflow_stage, client_id, is_featured, is_backlog,
    project_name, priority, goal, briefing_json, attachment_data, attachment_mime, attachment_filename, parent_task_id
  } = req.body;
  if (!String(title || '').trim()) return res.status(400).json({ error: 'Titulo e obrigatorio' });
  if (req.user.role !== 'client' && status && !TASK_STATUSES.has(String(status))) {
    return res.status(400).json({ error: 'Status de tarefa inválido' });
  }
  if (workflow_stage && !TASK_WORKFLOW_STAGES.has(String(workflow_stage))) {
    return res.status(400).json({ error: 'Etapa de fluxo inválida' });
  }

  let finalClientId = req.user.role === 'client' ? Number(req.user.client_id) : (client_id ? Number(client_id) : null);
  if (parent_task_id) {
    const parent = db.prepare('SELECT id, agency_id, client_id FROM tasks WHERE id = ? AND agency_id = ?').get(parent_task_id, req.user.agency_id);
    if (!parent) return res.status(404).json({ error: 'Tarefa principal nao encontrada' });
    if (!ensureTaskAccess(req, res, parent)) return;
    if (!finalClientId) finalClientId = parent.client_id || null;
  }
  if (!ensureClientAccess(req, res, finalClientId)) return;
  const finalAssigneeIds = Array.isArray(assignee_ids) ? assignee_ids : [];
  if (briefing_json && req.user.role !== 'client') {
    if (!finalClientId) return res.status(400).json({ error: 'Briefing estruturado precisa de um cliente.' });
    if (!String(goal || '').trim()) return res.status(400).json({ error: 'Briefing estruturado precisa dizer o que deve acontecer com a entrega.' });
    if (!String(due_date || '').trim()) return res.status(400).json({ error: 'Briefing estruturado precisa de prazo.' });
    if (!finalAssigneeIds.length) return res.status(400).json({ error: 'Briefing estruturado precisa de pelo menos um responsável.' });
  }
  const assigneeValidation = validateAssigneesForClient(finalClientId, finalAssigneeIds, req.user.agency_id);
  if (!assigneeValidation.ok) return res.status(400).json({ error: assigneeValidation.error });
  const finalWorkflowStage = req.user.role === 'client'
    ? 'todo'
    : normalizeWorkflowStage(workflow_stage || workflowStageFromLegacy(status || 'pending'));

  const createTask = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tasks (agency_id, client_id, created_by, parent_task_id, task_type, title, description, content_type, content_tag, front_name, caption, video_link, media_gallery, due_date, status, workflow_stage, is_featured, is_backlog, project_name, priority, goal, briefing_json, attachment_data, attachment_mime, attachment_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.agency_id, finalClientId, req.user.id, parent_task_id || null, task_type || 'basic', String(title).trim(), description || '',
      content_type || null, content_tag || null, front_name || null, caption || null, video_link || null,
      serializeExternalGallery(media_gallery),
      due_date || null,
      legacyStatusForWorkflow(finalWorkflowStage),
      finalWorkflowStage,
      req.user.role === 'client' || parent_task_id ? 0 : (Number(is_featured) === 1 ? 1 : 0),
      req.user.role === 'client' || parent_task_id ? 0 : (Number(is_backlog) === 1 ? 1 : 0),
      project_name || null, priority || 'medium', goal || null, briefing_json || null,
      persistMedia(attachment_data, attachment_mime || 'application/octet-stream'), attachment_mime || null, attachment_filename || null
    );
    setAssignees(info.lastInsertRowid, finalAssigneeIds);
    return info.lastInsertRowid;
  });

  const id = createTask();
  if (briefing_json) {
    db.prepare(`INSERT INTO task_briefing_events (agency_id, task_id, user_id, event_type, snapshot_json) VALUES (?, ?, ?, 'created', ?)` )
      .run(Number(req.user.agency_id), Number(id), Number(req.user.id), String(briefing_json));
  }
  res.status(201).json({ id, task: getTaskSummary(id, req.user.agency_id) });
});

// Designers can check/uncheck only their own subtasks without needing the broader
// task-edit permission. This avoids routing a simple production checkbox through
// the full task update flow.
router.patch('/:id/designer-completed', requireRole('admin', 'team'), (req, res) => {
  const task = db.prepare(`
    SELECT id, agency_id, client_id, parent_task_id, designer_completed
    FROM tasks
    WHERE id = ? AND agency_id = ?
  `).get(req.params.id, req.user.agency_id);

  if (!task) return res.status(404).json({ error: 'Subtarefa não encontrada' });
  if (!task.parent_task_id) {
    return res.status(400).json({ error: 'O check de produção é exclusivo para subtarefas' });
  }

  const isPrivileged = req.user.role === 'admin' || Number(req.user.is_operations_head) === 1;
  if (!isPrivileged) {
    const assigned = db.prepare(`
      SELECT 1 FROM task_assignees
      WHERE task_id = ? AND user_id = ?
    `).get(Number(task.id), Number(req.user.id));
    if (!assigned) {
      return res.status(403).json({ error: 'Você só pode marcar como concluída uma subtarefa atribuída a você' });
    }
  }

  const rawValue = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed')
    ? req.body.completed
    : req.body?.designer_completed;
  if (![0, 1, true, false, '0', '1'].includes(rawValue)) {
    return res.status(400).json({ error: 'Conclusão do designer inválida' });
  }

  const completed = Number(rawValue) === 1 || rawValue === true ? 1 : 0;
  db.prepare(`
    UPDATE tasks
    SET designer_completed = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(completed, Number(task.id), Number(req.user.agency_id));

  return res.json({
    ok: true,
    task: getTaskSummary(Number(task.id), Number(req.user.agency_id)),
    designer_completed: completed,
  });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Tarefa nao encontrada' });

  const requestKeys = Object.keys(req.body || {});
  const isDesignerCheckOnly = existing.parent_task_id
    && requestKeys.length === 1
    && requestKeys[0] === 'designer_completed';

  if (isDesignerCheckOnly && req.user.role === 'team' && !req.user.is_operations_head) {
    // A designer may check a subtask explicitly assigned to them. We also accept
    // assignment inherited from the parent demand because older ZebraHub tasks
    // sometimes stored the responsible designer only on the parent task.
    const assigned = db.prepare(`
      SELECT 1
      FROM task_assignees
      WHERE user_id = ? AND task_id IN (?, ?)
      LIMIT 1
    `).get(Number(req.user.id), Number(existing.id), Number(existing.parent_task_id));
    if (!assigned) {
      return res.status(403).json({ error: 'Você só pode marcar uma subtarefa atribuída a você' });
    }
  } else {
    if (!ensureTaskAccess(req, res, existing)) return;
    if (!ensureModifyTask(req, res, existing)) return;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'title') && !String(req.body.title || '').trim()) {
    return res.status(400).json({ error: 'Titulo e obrigatorio' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'status') && !TASK_STATUSES.has(String(req.body.status))) {
    return res.status(400).json({ error: 'Status de tarefa inválido' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'workflow_stage') && !TASK_WORKFLOW_STAGES.has(String(req.body.workflow_stage))) {
    return res.status(400).json({ error: 'Etapa de fluxo inválida' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'approval_status') && !TASK_APPROVAL_STATUSES.has(String(req.body.approval_status))) {
    return res.status(400).json({ error: 'Etapa de aprovação inválida' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'designer_completed') && ![0, 1, true, false, '0', '1'].includes(req.body.designer_completed)) {
    return res.status(400).json({ error: 'Conclusão do designer inválida' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'is_featured') && existing.parent_task_id) {
    return res.status(400).json({ error: 'Somente tarefas principais podem aparecer em destaque no painel' });
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
    const assigneeValidation = validateAssigneesForClient(targetClientId, req.body.assignee_ids, req.user.agency_id);
    if (!assigneeValidation.ok) return res.status(400).json({ error: assigneeValidation.error });
  }
  const effectiveBriefingJson = Object.prototype.hasOwnProperty.call(req.body, 'briefing_json') ? req.body.briefing_json : existing.briefing_json;
  if (effectiveBriefingJson && req.user.role !== 'client') {
    const effectiveGoal = Object.prototype.hasOwnProperty.call(req.body, 'goal') ? req.body.goal : existing.goal;
    const effectiveDueDate = Object.prototype.hasOwnProperty.call(req.body, 'due_date') ? req.body.due_date : existing.due_date;
    const effectiveAssignees = Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')
      ? (Array.isArray(req.body.assignee_ids) ? req.body.assignee_ids.map(Number).filter(Boolean) : [])
      : db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(Number(existing.id)).map((row) => Number(row.user_id));
    if (!targetClientId) return res.status(400).json({ error: 'Briefing estruturado precisa de um cliente.' });
    if (!String(effectiveGoal || '').trim()) return res.status(400).json({ error: 'Briefing estruturado precisa dizer o que deve acontecer com a entrega.' });
    if (!String(effectiveDueDate || '').trim()) return res.status(400).json({ error: 'Briefing estruturado precisa de prazo.' });
    if (!effectiveAssignees.length) return res.status(400).json({ error: 'Briefing estruturado precisa de pelo menos um responsável.' });
  }

  const allowedFields = req.user.role === 'client' ? [
    'title', 'description', 'task_type', 'content_type', 'content_tag', 'front_name', 'caption', 'video_link',
    'project_name', 'priority', 'goal', 'briefing_json', 'media_gallery', 'due_date', 'attachment_data', 'attachment_mime', 'attachment_filename'
  ] : [
    'title', 'description', 'task_type', 'content_type', 'content_tag', 'front_name', 'caption', 'video_link',
    'project_name', 'priority', 'goal', 'briefing_json', 'media_gallery', 'due_date', 'status', 'workflow_stage', 'approval_status', 'designer_completed',
    'direction_status', 'direction_feedback', 'direction_by', 'direction_at', 'client_status', 'client_feedback', 'client_at', 'client_id',
    'is_featured', 'is_backlog', 'attachment_data', 'attachment_mime', 'attachment_filename'
  ];
  const updates = [];
  const values = [];
  const mediaGalleryProvided = Object.prototype.hasOwnProperty.call(req.body, 'media_gallery');
  const normalizedMediaGallery = mediaGalleryProvided ? externalizeGallery(req.body.media_gallery) : null;

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    if (field === 'status' && Object.prototype.hasOwnProperty.call(req.body, 'workflow_stage')) continue;
    // When the gallery is sent, it becomes the single source of truth for task media.
    // attachment_* is rebuilt from the first remaining image below so a deleted image
    // cannot survive in a legacy fallback column.
    if (mediaGalleryProvided && ['attachment_data', 'attachment_mime', 'attachment_filename'].includes(field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'media_gallery') {
      values.push(normalizedMediaGallery.length ? JSON.stringify(normalizedMediaGallery) : null);
    } else if (field === 'attachment_data') {
      values.push(persistMedia(req.body.attachment_data, req.body.attachment_mime || existing.attachment_mime || 'application/octet-stream'));
    } else if (field === 'title') {
      values.push(String(req.body.title).trim());
    } else if (field === 'client_id') {
      values.push(req.body.client_id ? Number(req.body.client_id) : null);
    } else if (field === 'is_backlog') {
      values.push(Number(req.body.is_backlog) === 1 || req.body.is_backlog === true ? 1 : 0);
    } else if (field === 'is_featured') {
      values.push(Number(req.body.is_featured) === 1 ? 1 : 0);
    } else if (field === 'designer_completed') {
      values.push(Number(req.body.designer_completed) === 1 || req.body.designer_completed === true ? 1 : 0);
    } else if (field === 'workflow_stage') {
      values.push(normalizeWorkflowStage(req.body.workflow_stage));
    } else {
      values.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  if (mediaGalleryProvided) {
    const firstMedia = normalizedMediaGallery[0] || null;
    updates.push('attachment_data = ?', 'attachment_mime = ?', 'attachment_filename = ?');
    values.push(
      firstMedia?.data || null,
      firstMedia?.mime || null,
      firstMedia?.filename || null
    );
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'workflow_stage')) {
    const normalizedRequestedStage = normalizeWorkflowStage(String(req.body.workflow_stage));
    updates.push('status = ?');
    values.push(legacyStatusForWorkflow(normalizedRequestedStage));
    if (!Object.prototype.hasOwnProperty.call(req.body, 'designer_completed')) {
      if (normalizedRequestedStage === 'correction') {
        updates.push('designer_completed = ?');
        values.push(0);
      } else if (['approval', 'approved', 'scheduled', 'posted'].includes(normalizedRequestedStage)) {
        updates.push('designer_completed = ?');
        values.push(1);
      }
    }
  } else if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    updates.push('workflow_stage = ?');
    values.push(workflowStageFromLegacy(String(req.body.status)));
  }

  const mediaChanged = mediaGalleryProvided || Object.prototype.hasOwnProperty.call(req.body, 'attachment_data');
  const updateTask = db.transaction(() => {
    if (updates.length) {
      db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(...values, req.params.id, req.user.agency_id);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')) {
      setAssignees(req.params.id, req.body.assignee_ids);
    }
    if (mediaChanged) {
      const taskWithUpdatedMedia = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?')
        .get(req.params.id, req.user.agency_id);
      if (taskWithUpdatedMedia?.feed_post_id) {
        syncTaskMediaToLinkedFeedPost(taskWithUpdatedMedia, req.user.agency_id);
      }
    }
  });
  updateTask();

  if (Object.prototype.hasOwnProperty.call(req.body, 'briefing_json') && String(req.body.briefing_json || '') !== String(existing.briefing_json || '')) {
    db.prepare(`INSERT INTO task_briefing_events (agency_id, task_id, user_id, event_type, snapshot_json) VALUES (?, ?, ?, 'updated', ?)` )
      .run(Number(req.user.agency_id), Number(req.params.id), Number(req.user.id), String(req.body.briefing_json || '{}'));
  }

  const refreshedTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  const refreshedStage = normalizeWorkflowStage(refreshedTask?.workflow_stage || workflowStageFromLegacy(refreshedTask?.status));
  const previousStage = normalizeWorkflowStage(existing?.workflow_stage || workflowStageFromLegacy(existing?.status));
  if (Object.prototype.hasOwnProperty.call(req.body, 'workflow_stage') && refreshedStage === 'approval' && previousStage !== 'approval'
    && !Object.prototype.hasOwnProperty.call(req.body, 'direction_status')
    && !['pending_approval', 'approved', 'changes_requested'].includes(String(req.body.approval_status || '').toLowerCase())) {
    resetApprovalForTask(refreshedTask);
    db.prepare(`UPDATE tasks SET approval_status = 'completed', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
      .run(Number(refreshedTask.id), Number(req.user.agency_id));
    refreshedTask.approval_status = 'completed';
  }
  const isDesignerTask = refreshedTask && refreshedTask.task_type !== 'video'
    && String(refreshedTask.front_name || '').trim().toLocaleLowerCase('pt-BR') !== 'site/lp';

  // O conteúdo do Designer só entra na grade editorial do Social Media depois
  // de aprovado. Antes disso, a peça vive exclusivamente na grade /aprovacao.
  if (isDesignerTask && refreshedTask.task_type === 'post' && refreshedStage === 'approved' && taskHasMedia(refreshedTask)) {
    try {
      addTaskRecordToFeed(refreshedTask, req.user.id, req.user.agency_id);
    } catch (error) {
      console.warn('[TASKS] Não foi possível promover o conteúdo aprovado para o Feed:', error.message);
    }
  } else if (refreshedTask?.feed_post_id) {
    const feedVisible = ['approved', 'scheduled', 'posted'].includes(refreshedStage) ? 1 : 0;
    db.prepare(`UPDATE posts SET workflow_stage = ?, feed_visible = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
      .run(refreshedStage, feedVisible, refreshedTask.feed_post_id, req.user.agency_id);
  }


  res.json({ ok: true, task: getTaskSummary(req.params.id, req.user.agency_id) });
});

router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT id, agency_id, client_id FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  const completeTask = db.prepare('SELECT id, agency_id, client_id, created_by, status FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!ensureModifyTask(req, res, completeTask)) return;
  // piece=1: exclusão de uma peça pela grade de Aprovação. Não apaga em cascata as subtarefas.
  if (req.query.piece === '1') {
    const subtasks = Number(db.prepare('SELECT COUNT(*) AS total FROM tasks WHERE parent_task_id = ? AND agency_id = ?').get(task.id, req.user.agency_id)?.total || 0);
    if (subtasks > 0) {
      return res.status(409).json({ error: `Esta peça tem ${subtasks} subtarefa(s). Exclua pelo Squad para não perder as subtarefas.` });
    }
  }
  const linked = db.prepare('SELECT feed_post_id FROM tasks WHERE id = ? AND agency_id = ?').get(task.id, req.user.agency_id);
  db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE id = ? AND agency_id = ?').run(req.params.id, req.user.agency_id);
    // Remove também o post da grade editorial que nasceu desta tarefa (se nenhuma outra tarefa o usa).
    if (linked?.feed_post_id) {
      const stillUsed = db.prepare('SELECT 1 FROM tasks WHERE feed_post_id = ? AND agency_id = ? LIMIT 1').get(linked.feed_post_id, req.user.agency_id);
      if (!stillUsed) db.prepare('DELETE FROM posts WHERE id = ? AND agency_id = ?').run(linked.feed_post_id, req.user.agency_id);
    }
  })();
  res.json({ ok: true });
});

router.post('/:id/duplicate', requireRole('admin', 'team', 'client'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  if (req.user.role === 'client' && !ensureModifyTask(req, res, task)) return;

  const requestedDueDate = Object.prototype.hasOwnProperty.call(req.body || {}, 'due_date')
    ? (req.body.due_date || null)
    : task.due_date;

  const duplicate = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tasks (agency_id, client_id, created_by, parent_task_id, task_type, title, description, content_type, content_tag, front_name, caption, video_link, media_gallery, due_date, status, workflow_stage, attachment_data, attachment_mime, attachment_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'todo', ?, ?, ?)
    `).run(
      req.user.agency_id, task.client_id, req.user.id, task.parent_task_id, task.task_type, `${task.title} (cópia)`, task.description,
      task.content_type, task.content_tag, task.front_name, task.caption, task.video_link, task.media_gallery, requestedDueDate,
      task.attachment_data, task.attachment_mime, task.attachment_filename
    );
    const assigneeIds = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(task.id).map((row) => row.user_id);
    setAssignees(info.lastInsertRowid, assigneeIds);
    return info.lastInsertRowid;
  });

  const id = duplicate();
  const duplicatedTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
  res.status(201).json({ id, task: getTaskSummary(id, req.user.agency_id) });
});

router.post('/:id/add-to-feed', requireRole('admin', 'team'), (req, res) => {
  if (req.user?.is_commercial_team) {
    return res.status(403).json({ error: 'A Equipe Comercial não possui acesso ao Feed' });
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  try {
    const result = addTaskRecordToFeed(task, req.user.id, req.user.agency_id);
    return res.status(result.action === 'created' ? 201 : 200).json({
      post_id: result.postId,
      feed_visible: 1,
      action: result.action,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível adicionar à grade' });
  }
});

router.post('/:id/remove-from-feed', requireRole('admin', 'team'), (req, res) => {
  if (req.user?.is_commercial_team) {
    return res.status(403).json({ error: 'A Equipe Comercial não possui acesso ao Feed' });
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  if (!task.feed_post_id) return res.json({ ok: true, feed_visible: 0 });

  db.prepare(`UPDATE posts SET feed_visible = 0, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
    .run(task.feed_post_id, req.user.agency_id);
  return res.json({ ok: true, post_id: Number(task.feed_post_id), feed_visible: 0 });
});

router.post('/:id/add-all-to-feed', requireRole('admin', 'team'), (req, res) => {
  if (req.user?.is_commercial_team) {
    return res.status(403).json({ error: 'A Equipe Comercial não possui acesso ao Feed' });
  }
  const parent = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!parent) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, parent)) return;

  const candidates = db.prepare(`
    SELECT * FROM tasks
    WHERE agency_id = ? AND (id = ? OR parent_task_id = ?)
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, COALESCE(due_date, created_at) ASC
  `).all(req.user.agency_id, parent.id, parent.id, parent.id);

  const added = [];
  const skipped = [];
  for (const task of candidates) {
    if (req.user.role === 'team' && !req.user.is_operations_head && Number(task.id) !== Number(parent.id)) {
      const assigned = db.prepare('SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?').get(task.id, req.user.id);
      if (!assigned) continue;
    }
    if (task.task_type !== 'post') {
      skipped.push({ id: Number(task.id), title: task.title, reason: 'Não é uma publicação' });
      continue;
    }
    try {
      const result = addTaskRecordToFeed(task, req.user.id, req.user.agency_id);
      added.push({ id: Number(task.id), post_id: result.postId, action: result.action });
    } catch (error) {
      skipped.push({ id: Number(task.id), title: task.title, reason: error.message });
    }
  }

  return res.json({ added, skipped, total_added: added.length, total_skipped: skipped.length });
});

module.exports = router;
