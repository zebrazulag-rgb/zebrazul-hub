const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const { persistMedia, externalizeGallery } = require('../services/mediaStorage');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team', 'client'));

const TASK_STATUSES = new Set(['pending', 'in_progress', 'done', 'posted']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high']);
const TASK_TYPES = new Set(['basic', 'post', 'video']);
const CONTENT_TYPES = new Set(['feed', 'reels', 'story', 'carrossel', 'artigo']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeCsvStatus(value) {
  const key = normalizeKey(value);
  if (!key) return 'pending';
  const map = {
    'a fazer': 'pending',
    'pendente': 'pending',
    'pending': 'pending',
    'em andamento': 'in_progress',
    'andamento': 'in_progress',
    'in progress': 'in_progress',
    'in_progress': 'in_progress',
    'concluida': 'done',
    'concluido': 'done',
    'done': 'done',
    'postado': 'posted',
    'postada': 'posted',
    'posted': 'posted',
  };
  return map[key] || null;
}

function normalizeCsvPriority(value) {
  const key = normalizeKey(value);
  if (!key) return 'medium';
  const map = {
    'baixa': 'low',
    'baixo': 'low',
    'low': 'low',
    'media': 'medium',
    'medio': 'medium',
    'medium': 'medium',
    'alta': 'high',
    'alto': 'high',
    'high': 'high',
  };
  return map[key] || null;
}

function normalizeCsvTaskType(value) {
  const key = normalizeKey(value);
  if (!key) return 'basic';
  const map = {
    'tarefa basica': 'basic',
    'tarefa': 'basic',
    'basic': 'basic',
    'post': 'post',
    'publicacao': 'post',
    'gravacao e edicao de video': 'video',
    'gravacao de video': 'video',
    'edicao de video': 'video',
    'video': 'video',
  };
  return map[key] || (TASK_TYPES.has(key) ? key : null);
}

function taskTypeLabel(value) {
  return value === 'post' ? 'Post'
    : value === 'video' ? 'Gravação e Edição de Vídeo'
    : 'Tarefa básica';
}

function normalizeCsvContentType(value) {
  const key = normalizeKey(value);
  if (!key) return null;
  const map = {
    'estatico': 'feed',
    'estatica': 'feed',
    'post estatico': 'feed',
    'feed': 'feed',
    'reel': 'reels',
    'reels': 'reels',
    'story': 'story',
    'stories': 'story',
    'carrossel': 'carrossel',
    'carousel': 'carrossel',
    'artigo': 'artigo',
  };
  return map[key] || (CONTENT_TYPES.has(key) ? key : null);
}

function contentTypeLabel(value) {
  return value === 'feed' ? 'Estático'
    : value === 'reels' ? 'Reels'
    : value === 'story' ? 'Story'
    : value === 'carrossel' ? 'Carrossel'
    : value === 'artigo' ? 'Artigo'
    : '';
}

function priorityLabel(value) {
  return value === 'high' ? 'Alta' : value === 'low' ? 'Baixa' : 'Média';
}

function statusLabel(value) {
  return value === 'in_progress' ? 'Em andamento'
    : value === 'done' ? 'Concluída'
    : value === 'posted' ? 'Postado'
    : 'A fazer';
}

function parseCsvDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  return null;
}

function splitAssignees(value) {
  return normalizeText(value)
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function accessibleClientsForUser(user) {
  if (user.role === 'client') {
    return db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?')
      .all(Number(user.client_id), Number(user.agency_id));
  }
  if (user.role === 'admin' || user.is_operations_head) {
    return db.prepare("SELECT id, name FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name")
      .all(Number(user.agency_id));
  }
  const ids = Array.isArray(user.client_ids) ? user.client_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT id, name FROM clients WHERE agency_id = ? AND id IN (${placeholders}) ORDER BY name`)
    .all(Number(user.agency_id), ...ids);
}

function csvContext(user) {
  const clients = accessibleClientsForUser(user);
  const clientByName = new Map(clients.map((client) => [normalizeKey(client.name), client]));
  const users = db.prepare(`
    SELECT id, name, email, role, is_operations_head
    FROM users
    WHERE agency_id = ? AND role IN ('admin','team')
    ORDER BY name
  `).all(Number(user.agency_id));
  const userByName = new Map();
  users.forEach((member) => {
    userByName.set(normalizeKey(member.name), member);
    if (member.email) userByName.set(normalizeKey(member.email), member);
  });
  return { clients, clientByName, users, userByName };
}

function findExistingParentTask(agencyId, clientId, projectName, title) {
  return db.prepare(`
    SELECT id, created_by, status
    FROM tasks
    WHERE agency_id = ?
      AND client_id = ?
      AND parent_task_id IS NULL
      AND lower(trim(COALESCE(project_name, ''))) = lower(trim(?))
      AND lower(trim(title)) = lower(trim(?))
    ORDER BY id
    LIMIT 1
  `).get(Number(agencyId), Number(clientId), projectName || '', title);
}

function findExistingSubtask(agencyId, parentTaskId, title) {
  if (!parentTaskId) return null;
  return db.prepare(`
    SELECT id, created_by, status
    FROM tasks
    WHERE agency_id = ? AND parent_task_id = ? AND lower(trim(title)) = lower(trim(?))
    ORDER BY id
    LIMIT 1
  `).get(Number(agencyId), Number(parentTaskId), title);
}

function normalizeCsvRows(user, rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const context = csvContext(user);
  const byCsvId = new Map();
  const normalized = rows.map((source, index) => {
    const csvId = normalizeText(source.csv_id || source.id_tarefa || source.id || `linha-${index + 1}`);
    const parentCsvId = normalizeText(source.parent_csv_id || source.id_tarefa_pai || source.parent_id);
    const clientName = user.role === 'client'
      ? (context.clients[0]?.name || '')
      : normalizeText(source.client);
    const client = user.role === 'client'
      ? context.clients[0]
      : context.clientByName.get(normalizeKey(clientName));
    const statusProvided = normalizeText(source.status) !== '';
    const priorityProvided = normalizeText(source.priority) !== '';
    const taskTypeRaw = normalizeText(source.task_type || source.tipo_de_tarefa || source.tipo_tarefa);
    const taskType = normalizeCsvTaskType(taskTypeRaw);
    const contentTypeRaw = normalizeText(source.content_type || source.tipo_de_conteudo || source.tipo_conteudo);
    const contentType = normalizeCsvContentType(contentTypeRaw);
    const genericDescription = normalizeText(source.description || source.descricao);
    const contentIdea = normalizeText(source.content_idea || source.ideia_do_conteudo || source.ideia_conteudo);
    const scriptBriefing = normalizeText(source.script_briefing || source.roteiro_briefing || source.roteiro);
    const description = taskType === 'post'
      ? (contentIdea || genericDescription)
      : taskType === 'video'
        ? (scriptBriefing || genericDescription)
        : genericDescription;
    const postDateRaw = normalizeText(source.post_date || source.data_de_postagem || source.data_postagem);
    const status = normalizeCsvStatus(source.status);
    const priority = normalizeCsvPriority(source.priority);
    const dueRaw = taskType === 'post' && postDateRaw
      ? postDateRaw
      : normalizeText(source.due_date || source.deadline || source.prazo);
    const dueDate = parseCsvDate(dueRaw);
    const assigneeNames = splitAssignees(source.responsible || source.assignee || source.responsavel);
    const assigneeIds = [];
    const unknownAssignees = [];
    assigneeNames.forEach((name) => {
      const member = context.userByName.get(normalizeKey(name));
      if (member) assigneeIds.push(Number(member.id));
      else unknownAssignees.push(name);
    });

    const row = {
      line: index + 2,
      csv_id: csvId,
      parent_csv_id: parentCsvId,
      client_name: clientName,
      client_id: client ? Number(client.id) : null,
      project_name: normalizeText(source.project || source.projeto),
      front_name: normalizeText(source.front || source.frente),
      title: normalizeText(source.title || source.titulo),
      task_type: taskType,
      task_type_label: taskTypeLabel(taskType),
      description,
      content_type: taskType === 'post' ? contentType : null,
      content_type_label: taskType === 'post' ? contentTypeLabel(contentType) : '',
      caption: taskType === 'post' ? normalizeText(source.caption || source.legenda) : '',
      video_link: taskType === 'video' ? normalizeText(source.video_link || source.link_do_video || source.link_video) : '',
      responsible: assigneeNames.join('; '),
      assignee_ids: [...new Set(assigneeIds)],
      unknown_assignees: unknownAssignees,
      priority,
      status,
      due_raw: dueRaw,
      due_date: dueDate,
      deadline_label: dueRaw && !dueDate ? dueRaw : '',
      goal: normalizeText(source.goal || source.meta),
      provided: {
        project_name: normalizeText(source.project || source.projeto) !== '',
        front_name: normalizeText(source.front || source.frente) !== '',
        title: normalizeText(source.title || source.titulo) !== '',
        task_type: taskTypeRaw !== '',
        description: genericDescription !== '' || contentIdea !== '' || scriptBriefing !== '',
        content_type: contentTypeRaw !== '',
        caption: normalizeText(source.caption || source.legenda) !== '',
        video_link: normalizeText(source.video_link || source.link_do_video || source.link_video) !== '',
        responsible: assigneeNames.length > 0,
        priority: priorityProvided,
        status: statusProvided,
        due_date: dueRaw !== '',
        goal: normalizeText(source.goal || source.meta) !== '',
      },
      errors: [],
      warnings: [],
      duplicate: false,
      existing_task_id: null,
      type: parentCsvId ? 'subtask' : 'task',
    };
    if (byCsvId.has(csvId)) row.errors.push(`ID da tarefa "${csvId}" está duplicado no CSV.`);
    else byCsvId.set(csvId, row);
    return row;
  });

  normalized.forEach((row) => {
    if (!row.client_id) row.errors.push('Cliente não encontrado ou sem acesso.');
    if (!row.title) row.errors.push('Título é obrigatório.');
    if (!row.task_type) row.errors.push('Tipo de tarefa inválido. Use Tarefa básica, Post ou Gravação e Edição de Vídeo.');
    if (row.task_type === 'post' && row.provided.content_type && !row.content_type) {
      row.errors.push('Tipo de conteúdo inválido. Use Estático, Carrossel, Reels, Story ou Artigo.');
    }
    if (!row.status) row.errors.push('Status inválido.');
    if (!row.priority) row.errors.push('Prioridade inválida.');
    if (row.unknown_assignees.length) row.errors.push(`Responsável não encontrado: ${row.unknown_assignees.join(', ')}.`);
    if (row.parent_csv_id === row.csv_id) row.errors.push('Uma tarefa não pode ser subtarefa dela mesma.');
    if (row.parent_csv_id) {
      const parent = byCsvId.get(row.parent_csv_id);
      if (!parent) {
        row.errors.push(`Tarefa pai "${row.parent_csv_id}" não encontrada no CSV.`);
      } else if (parent.parent_csv_id) {
        row.errors.push('O ZebraHub suporta atualmente apenas um nível de subtarefas.');
      } else if (row.client_id && parent.client_id && row.client_id !== parent.client_id) {
        row.errors.push('A subtarefa e a tarefa pai precisam pertencer ao mesmo cliente.');
      }
    }
    if (row.client_id) {
      const assignmentCheck = validateAssigneesForClient(row.client_id, row.assignee_ids, user.agency_id);
      if (!assignmentCheck.ok) row.errors.push(assignmentCheck.error);
    }
  });

  // Detecta relações circulares mesmo em arquivos fora da ordem.
  normalized.forEach((row) => {
    const visited = new Set([row.csv_id]);
    let cursor = row;
    while (cursor.parent_csv_id) {
      if (visited.has(cursor.parent_csv_id)) {
        row.errors.push('Foi detectada uma relação circular entre tarefas.');
        break;
      }
      visited.add(cursor.parent_csv_id);
      cursor = byCsvId.get(cursor.parent_csv_id);
      if (!cursor) break;
    }
  });

  // IDs exportados pelo próprio ZebraHub usam o prefixo ZH-. IDs simples (1, 2, 3...)
  // continuam sendo temporários do arquivo e nunca são confundidos com IDs do banco.
  normalized.filter((row) => row.client_id && !row.errors.length).forEach((row) => {
    const internalMatch = String(row.csv_id).match(/^ZH-(\d+)$/i);
    if (!internalMatch) return;
    const existing = db.prepare(`
      SELECT id, client_id, parent_task_id, created_by, status
      FROM tasks
      WHERE id = ? AND agency_id = ?
    `).get(Number(internalMatch[1]), Number(user.agency_id));
    if (!existing) {
      row.errors.push(`A tarefa interna ${row.csv_id} não existe mais no ZebraHub.`);
      return;
    }
    if (Number(existing.client_id) !== Number(row.client_id)) {
      row.errors.push(`A tarefa interna ${row.csv_id} pertence a outro cliente.`);
      return;
    }
    const shouldBeSubtask = Boolean(row.parent_csv_id);
    if (Boolean(existing.parent_task_id) !== shouldBeSubtask) {
      row.errors.push(`A hierarquia de ${row.csv_id} não corresponde à tarefa existente.`);
      return;
    }
    row.duplicate = true;
    row.existing_task_id = Number(existing.id);
    row.warnings.push('Tarefa identificada pelo ID interno do ZebraHub.');
  });

  // Duplicidade por Cliente + Projeto + Título para arquivos criados fora do ZebraHub.
  normalized.filter((row) => !row.parent_csv_id && row.client_id && row.title && !row.errors.length && !row.existing_task_id).forEach((row) => {
    const existing = findExistingParentTask(user.agency_id, row.client_id, row.project_name, row.title);
    if (existing) {
      row.duplicate = true;
      row.existing_task_id = Number(existing.id);
      row.warnings.push('Essa tarefa já existe.');
    }
  });

  // Para subtarefas, usa o pai existente quando ele foi identificado por ID ou duplicidade.
  normalized.filter((row) => row.parent_csv_id && row.client_id && row.title && !row.errors.length && !row.existing_task_id).forEach((row) => {
    const parent = byCsvId.get(row.parent_csv_id);
    const parentDbId = parent?.existing_task_id || null;
    const existing = parentDbId ? findExistingSubtask(user.agency_id, parentDbId, row.title) : null;
    if (existing) {
      row.duplicate = true;
      row.existing_task_id = Number(existing.id);
      row.warnings.push('Essa subtarefa já existe.');
    }
  });

  return { rows: normalized, byCsvId };
}


function teamVisibilityClause(alias = 't') {
  return ` AND (
    ${alias}.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
    OR EXISTS (
      SELECT 1
      FROM client_task_requests ctr
      JOIN user_client_access uca ON uca.client_id = ctr.client_id
      WHERE ctr.agency_id = ${alias}.agency_id
        AND (ctr.task_id = ${alias}.id OR ctr.task_id = ${alias}.parent_task_id)
        AND uca.user_id = ?
    )
  )`;
}

function pushTeamVisibilityParams(params, user) {
  params.push(Number(user.id), Number(user.id));
}

function taskRequestForTask(taskId, agencyId) {
  return db.prepare(`
    SELECT ctr.id, ctr.client_id
    FROM client_task_requests ctr
    LEFT JOIN tasks child ON child.id = ? AND child.agency_id = ctr.agency_id
    WHERE ctr.agency_id = ?
      AND (ctr.task_id = ? OR ctr.task_id = child.parent_task_id)
    LIMIT 1
  `).get(Number(taskId), Number(agencyId), Number(taskId));
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
    if (assigned) return true;

    const request = taskRequestForTask(task.id, user.agency_id);
    return Boolean(request && canAccessClient(user, task.client_id || request.client_id));
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
    query += teamVisibilityClause('t');
    pushTeamVisibilityParams(params, user);
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
  if (task.feed_post_id) {
    const existingPost = db.prepare('SELECT id FROM posts WHERE id = ? AND agency_id = ?').get(task.feed_post_id, agencyId);
    if (existingPost) {
      db.prepare(`UPDATE posts SET feed_visible = 1, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(existingPost.id, agencyId);
      return { postId: Number(existingPost.id), action: 'reactivated' };
    }
  }

  if (!task.client_id) throw new Error('A tarefa precisa estar vinculada a um cliente');
  const taskGallery = parseGallery(task.media_gallery);
  if (!task.attachment_data && taskGallery.length === 0) {
    throw new Error('Anexe ao menos uma imagem antes de enviar para o feed');
  }

  const info = db.prepare(`
    INSERT INTO posts (
      agency_id, client_id, created_by, title, caption, content_type, platforms,
      media_data, media_mime, media_gallery, scheduled_at, status, feed_visible
    ) VALUES (?, ?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, ?, 'draft', 1)
  `).run(
    agencyId,
    task.client_id,
    userId,
    task.title,
    task.caption || '',
    task.content_type || 'feed',
    task.attachment_data || taskGallery[0]?.data || null,
    task.attachment_mime || taskGallery[0]?.mime || null,
    taskGallery.length ? JSON.stringify(taskGallery) : null,
    task.due_date || null
  );

  db.prepare(`UPDATE tasks SET feed_post_id = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
    .run(info.lastInsertRowid, task.id, agencyId);
  return { postId: Number(info.lastInsertRowid), action: 'created' };
}

function taskSummaryQuery(whereClause) {
  return `
    SELECT
      t.id, t.agency_id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.project_name, t.front_name, t.priority, t.goal,
      t.due_date, t.deadline_label, t.status, t.is_featured, t.attachment_filename, t.feed_post_id,
      COALESCE(p.feed_visible, 0) AS feed_post_visible,
      t.created_at, t.updated_at,
      c.name AS client_name,
      ctr.id AS client_request_id,
      ctr.protocol AS request_protocol,
      ctr.requester_name,
      ctr.request_type,
      ctr.requested_due_date,
      ctr.urgency AS request_urgency,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id) AS subtask_total,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'pending') AS subtask_pending,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'in_progress') AS subtask_in_progress,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status IN ('done', 'posted')) AS subtask_done,
      (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.agency_id = t.agency_id AND st.status = 'posted') AS subtask_posted
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
    LEFT JOIN client_task_requests ctr ON ctr.task_id = t.id AND ctr.agency_id = t.agency_id
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
    `;
    const compactParams = [req.user.agency_id];

    if (req.user.role === 'team' && !req.user.is_operations_head) {
      compactQuery += teamVisibilityClause('t');
      pushTeamVisibilityParams(compactParams, req.user);
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

  let query = taskSummaryQuery('WHERE t.parent_task_id IS NULL AND t.agency_id = ?');
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += teamVisibilityClause('t');
    pushTeamVisibilityParams(params, req.user);
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
        OR EXISTS (
          SELECT 1
          FROM client_task_requests ctr
          JOIN user_client_access uca ON uca.client_id = ctr.client_id
          WHERE ctr.agency_id = t.agency_id
            AND (ctr.task_id = t.id OR ctr.task_id = t.parent_task_id)
            AND uca.user_id = ?
        )
      )
    `;
    params.push(Number(req.user.id), Number(req.user.id), Number(req.user.id));
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
      t.title, t.project_name, t.front_name, t.priority, t.goal,
      t.due_date, t.deadline_label, t.status, t.is_featured, t.attachment_filename, t.feed_post_id,
      COALESCE(p.feed_visible, 0) AS feed_post_visible,
      t.created_at, t.updated_at,
      c.name AS client_name,
      ctr.id AS client_request_id,
      ctr.protocol AS request_protocol,
      ctr.requester_name,
      ctr.request_type,
      ctr.requested_due_date,
      ctr.urgency AS request_urgency,
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
    LEFT JOIN client_task_requests ctr ON ctr.task_id = t.id AND ctr.agency_id = t.agency_id
    WHERE t.agency_id = ? AND t.due_date IS NOT NULL
  `;
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += teamVisibilityClause('t');
    pushTeamVisibilityParams(params, req.user);
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


function validCalendarSharePeriod(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  return Number.isInteger(year) && year >= 2020 && year <= 2100
    && Number.isInteger(month) && month >= 1 && month <= 12;
}

function calendarSharePayload(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    client_id: Number(row.client_id),
    client_name: row.client_name,
    year: Number(row.share_year),
    month: Number(row.share_month),
    token: row.token,
    active: Number(row.active) === 1,
    show_status: Number(row.show_status) === 1,
    show_assignees: Number(row.show_assignees) === 1,
    show_description: Number(row.show_description) === 1,
    include_posted: Number(row.include_posted) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/calendar-share', requireRole('admin', 'team'), (req, res) => {
  const { client_id, year, month } = req.query;
  if (!client_id || !validCalendarSharePeriod(year, month)) {
    return res.status(400).json({ error: 'Informe cliente, ano e mês válidos' });
  }
  if (!ensureClientAccess(req, res, client_id)) return;

  const row = db.prepare(`
    SELECT s.*, c.name AS client_name
    FROM task_calendar_shares s
    JOIN clients c ON c.id = s.client_id AND c.agency_id = s.agency_id
    WHERE s.agency_id = ? AND s.client_id = ? AND s.share_year = ? AND s.share_month = ?
    LIMIT 1
  `).get(Number(req.user.agency_id), Number(client_id), Number(year), Number(month));

  return res.json({ share: calendarSharePayload(row) });
});

router.post('/calendar-share', requireRole('admin', 'team'), (req, res) => {
  const {
    client_id,
    year,
    month,
    show_status = true,
    show_assignees = false,
    show_description = false,
    include_posted = true,
    regenerate = false,
  } = req.body || {};

  if (!client_id || !validCalendarSharePeriod(year, month)) {
    return res.status(400).json({ error: 'Informe cliente, ano e mês válidos' });
  }
  if (!ensureClientAccess(req, res, client_id)) return;

  const agencyId = Number(req.user.agency_id);
  const clientId = Number(client_id);
  const shareYear = Number(year);
  const shareMonth = Number(month);
  const existing = db.prepare(`
    SELECT id, token FROM task_calendar_shares
    WHERE agency_id = ? AND client_id = ? AND share_year = ? AND share_month = ?
  `).get(agencyId, clientId, shareYear, shareMonth);

  const token = (!existing || regenerate)
    ? crypto.randomBytes(24).toString('base64url')
    : existing.token;

  if (existing) {
    db.prepare(`
      UPDATE task_calendar_shares
      SET token = ?, active = 1, show_status = ?, show_assignees = ?, show_description = ?, include_posted = ?, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(
      token,
      show_status ? 1 : 0,
      show_assignees ? 1 : 0,
      show_description ? 1 : 0,
      include_posted ? 1 : 0,
      Number(existing.id),
      agencyId
    );
  } else {
    db.prepare(`
      INSERT INTO task_calendar_shares (
        agency_id, client_id, token, share_year, share_month,
        show_status, show_assignees, show_description, include_posted,
        active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      agencyId,
      clientId,
      token,
      shareYear,
      shareMonth,
      show_status ? 1 : 0,
      show_assignees ? 1 : 0,
      show_description ? 1 : 0,
      include_posted ? 1 : 0,
      Number(req.user.id)
    );
  }

  const row = db.prepare(`
    SELECT s.*, c.name AS client_name
    FROM task_calendar_shares s
    JOIN clients c ON c.id = s.client_id AND c.agency_id = s.agency_id
    WHERE s.agency_id = ? AND s.client_id = ? AND s.share_year = ? AND s.share_month = ?
  `).get(agencyId, clientId, shareYear, shareMonth);

  return res.status(existing ? 200 : 201).json({ share: calendarSharePayload(row) });
});

router.patch('/calendar-share', requireRole('admin', 'team'), (req, res) => {
  const { client_id, year, month, active } = req.body || {};
  if (!client_id || !validCalendarSharePeriod(year, month)) {
    return res.status(400).json({ error: 'Informe cliente, ano e mês válidos' });
  }
  if (!ensureClientAccess(req, res, client_id)) return;

  const info = db.prepare(`
    UPDATE task_calendar_shares
    SET active = ?, updated_at = datetime('now')
    WHERE agency_id = ? AND client_id = ? AND share_year = ? AND share_month = ?
  `).run(
    active ? 1 : 0,
    Number(req.user.agency_id),
    Number(client_id),
    Number(year),
    Number(month)
  );
  if (!info.changes) return res.status(404).json({ error: 'Link compartilhável ainda não foi criado' });
  return res.json({ ok: true, active: Boolean(active) });
});

router.get('/featured/all', (req, res) => {
  let query = taskSummaryQuery(`
    WHERE t.parent_task_id IS NULL
      AND t.agency_id = ?
      AND t.is_featured = 1
  `);
  const params = [req.user.agency_id];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    query += teamVisibilityClause('t');
    pushTeamVisibilityParams(params, req.user);
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


function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function buildTaskExportRows(req) {
  const {
    client_id, project, front, priority, status, assignee_id, due_from, due_to,
  } = req.query;

  let parentQuery = `
    SELECT t.*, c.name AS client_name
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    WHERE t.agency_id = ? AND t.parent_task_id IS NULL
  `;
  const params = [Number(req.user.agency_id)];

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    parentQuery += teamVisibilityClause('t');
    pushTeamVisibilityParams(params, req.user);
  } else if (req.user.role === 'client') {
    parentQuery += ' AND t.client_id = ?';
    params.push(Number(req.user.client_id));
  }

  if (client_id) {
    if (!canAccessClient(req.user, Number(client_id))) {
      const error = new Error('Você não tem acesso ao cliente selecionado');
      error.statusCode = 403;
      throw error;
    }
    parentQuery += ' AND t.client_id = ?';
    params.push(Number(client_id));
  }
  if (project) {
    parentQuery += ' AND lower(trim(COALESCE(t.project_name, \'\'))) = lower(trim(?))';
    params.push(String(project));
  }
  if (front) {
    parentQuery += ' AND lower(trim(COALESCE(t.front_name, \'\'))) = lower(trim(?))';
    params.push(String(front));
  }
  if (priority) {
    parentQuery += ' AND t.priority = ?';
    params.push(String(priority));
  }
  if (status) {
    parentQuery += ' AND t.status = ?';
    params.push(String(status));
  }
  if (assignee_id) {
    parentQuery += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(Number(assignee_id));
  }
  if (due_from) {
    parentQuery += ' AND substr(t.due_date, 1, 10) >= ?';
    params.push(String(due_from));
  }
  if (due_to) {
    parentQuery += ' AND substr(t.due_date, 1, 10) <= ?';
    params.push(String(due_to));
  }

  parentQuery += ' ORDER BY COALESCE(t.due_date, t.created_at) ASC, t.id ASC';
  const parents = db.prepare(parentQuery).all(...params);
  if (!parents.length) return [];

  const parentIds = parents.map((row) => Number(row.id));
  const placeholders = parentIds.map(() => '?').join(',');
  let children = db.prepare(`
    SELECT t.*, c.name AS client_name
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    WHERE t.agency_id = ? AND t.parent_task_id IN (${placeholders})
    ORDER BY t.parent_task_id, COALESCE(t.due_date, t.created_at), t.id
  `).all(Number(req.user.agency_id), ...parentIds);

  if (req.user.role === 'team' && !req.user.is_operations_head) {
    children = children.filter((child) => canAccessTask(req.user, child));
  }

  const all = [...parents, ...children];
  const assignees = attachAssignees(all.map((row) => ({ ...row })), req.user.agency_id);
  const assigneeMap = new Map(assignees.map((row) => [Number(row.id), row.assignees || []]));
  const childrenByParent = new Map();
  children.forEach((child) => {
    const key = Number(child.parent_task_id);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(child);
  });

  const ordered = [];
  parents.forEach((parent) => {
    ordered.push(parent);
    (childrenByParent.get(Number(parent.id)) || []).forEach((child) => ordered.push(child));
  });

  return ordered.map((task) => {
    const taskType = TASK_TYPES.has(task.task_type) ? task.task_type : 'basic';
    const taskDate = task.due_date ? String(task.due_date).slice(0, 10) : (task.deadline_label || '');
    return {
      task_id: `ZH-${Number(task.id)}`,
      parent_task_id: task.parent_task_id ? `ZH-${Number(task.parent_task_id)}` : '',
      task_type: taskTypeLabel(taskType),
      client: task.client_name || '',
      project: task.project_name || '',
      front: task.front_name || '',
      title: task.title || '',
      description: taskType === 'basic' ? (task.description || '') : '',
      content_idea: taskType === 'post' ? (task.description || '') : '',
      content_type: taskType === 'post' ? contentTypeLabel(task.content_type) : '',
      post_date: taskType === 'post' ? taskDate : '',
      caption: taskType === 'post' ? (task.caption || '') : '',
      script_briefing: taskType === 'video' ? (task.description || '') : '',
      video_link: taskType === 'video' ? (task.video_link || '') : '',
      responsible: (assigneeMap.get(Number(task.id)) || []).map((item) => item.name).join('; '),
      priority: priorityLabel(task.priority || 'medium'),
      status: statusLabel(task.status),
      due_date: taskType === 'post' ? '' : taskDate,
      goal: task.goal || '',
      created_at: task.created_at || '',
      updated_at: task.updated_at || '',
    };
  });
}

router.get('/csv/export', (req, res) => {
  try {
    const rows = buildTaskExportRows(req);
    const headers = [
      'ID da tarefa', 'ID da tarefa pai', 'Tipo de tarefa', 'Cliente', 'Projeto', 'Frente', 'Título',
      'Descrição', 'Ideia do conteúdo', 'Tipo de conteúdo', 'Data de postagem', 'Legenda',
      'Roteiro / briefing', 'Link do vídeo', 'Responsável', 'Prioridade', 'Status', 'Prazo', 'Meta',
      'Data de criação', 'Data de atualização'
    ];
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach((row) => {
      lines.push([
        row.task_id, row.parent_task_id, row.task_type, row.client, row.project, row.front, row.title,
        row.description, row.content_idea, row.content_type, row.post_date, row.caption,
        row.script_briefing, row.video_link, row.responsible, row.priority, row.status, row.due_date, row.goal,
        row.created_at, row.updated_at
      ].map(csvEscape).join(','));
    });
    const csv = '\uFEFF' + lines.join('\r\n');
    const date = new Date().toISOString().slice(0, 10);
    const clientPart = normalizeKey(req.query.client_name || 'todos').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'todos';
    const projectPart = normalizeKey(req.query.project || 'tarefas').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tarefas';
    const filename = `tarefas_${clientPart}_${projectPart}_${date}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'Não foi possível exportar as tarefas' });
  }
});

router.get('/csv/model', (req, res) => {
  const headers = [
    'ID da tarefa', 'ID da tarefa pai', 'Tipo de tarefa', 'Cliente', 'Projeto', 'Frente', 'Título',
    'Descrição', 'Ideia do conteúdo', 'Tipo de conteúdo', 'Data de postagem', 'Legenda',
    'Roteiro / briefing', 'Link do vídeo', 'Responsável', 'Prioridade', 'Status', 'Prazo', 'Meta'
  ];
  const basicTask = [
    '1', '', 'Tarefa básica', 'Basalto', 'Plano de Ação Estratégico Basalto 2026', 'Marketing',
    'CRONOGRAMA DE AGOSTO', 'Planejamento principal do mês', '', '', '', '', '', '',
    'Arthur', 'Média', 'A fazer', '2026-08-31', ''
  ];
  const staticPost = [
    '2', '1', 'Post', 'Basalto', 'Plano de Ação Estratégico Basalto 2026', 'Conteúdo',
    'Post institucional', '', 'Título na arte: Segurança para crescer.\nDireção visual: usar a identidade da marca.',
    'Estático', '2026-08-10', 'Legenda do post com CTA e hashtags.', '', '',
    'Arthur', 'Média', 'A fazer', '', ''
  ];
  const carouselPost = [
    '3', '1', 'Post', 'Basalto', 'Plano de Ação Estratégico Basalto 2026', 'Conteúdo',
    'Carrossel educativo', '', 'SLIDE 1 — Capa\nSLIDE 2 — Desenvolvimento\nSLIDE 3 — CTA',
    'Carrossel', '2026-08-12', 'Legenda do carrossel com CTA e hashtags.', '', '',
    'Arthur', 'Média', 'A fazer', '', ''
  ];
  const videoTask = [
    '4', '1', 'Gravação e Edição de Vídeo', 'Basalto', 'Plano de Ação Estratégico Basalto 2026', 'Conteúdo',
    'Vídeo de autoridade', '', '', '', '', '',
    'CENA 1 — Gancho\nFALA: Comece com uma pergunta.\nCENA 2 — Desenvolvimento\nCENA 3 — CTA', '',
    'Arthur', 'Média', 'A fazer', '2026-08-14', ''
  ];
  const csv = '\uFEFF' + [headers, basicTask, staticPost, carouselPost, videoTask]
    .map((row) => row.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo_importacao_tarefas_zebrahub.csv"');
  res.send(csv);
});

router.post('/csv/preview', (req, res) => {
  const result = normalizeCsvRows(req.user, req.body?.rows);
  const rows = result.rows.map((row) => ({
    ...row,
    provided: undefined,
    assignee_ids: row.assignee_ids,
  }));
  const errors = rows.filter((row) => row.errors.length > 0).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  const tasks = rows.filter((row) => row.type === 'task').length;
  const subtasks = rows.filter((row) => row.type === 'subtask').length;
  return res.json({
    summary: {
      total: rows.length,
      tasks,
      subtasks,
      valid: rows.length - errors,
      errors,
      duplicates,
    },
    rows,
  });
});

router.post('/csv/import', (req, res) => {
  const duplicateStrategy = ['ignore', 'duplicate', 'update'].includes(req.body?.duplicate_strategy)
    ? req.body.duplicate_strategy
    : 'ignore';
  const normalized = normalizeCsvRows(req.user, req.body?.rows);
  const validRows = normalized.rows.filter((row) => row.errors.length === 0);
  const invalidRows = normalized.rows.filter((row) => row.errors.length > 0);

  if (!validRows.length) {
    return res.status(400).json({
      error: 'Nenhuma linha válida para importar.',
      errors: invalidRows.map((row) => ({ line: row.line, title: row.title, errors: row.errors })),
    });
  }

  const createOne = (row, parentTaskId = null) => {
    const status = req.user.role === 'client' ? 'pending' : (row.status || 'pending');
    const info = db.prepare(`
      INSERT INTO tasks (
        agency_id, client_id, created_by, parent_task_id, task_type, title, description,
        project_name, front_name, priority, goal, content_type, caption, video_link,
        due_date, deadline_label, status, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      Number(req.user.agency_id), Number(row.client_id), Number(req.user.id), parentTaskId || null,
      row.task_type || 'basic', row.title, row.description || '', row.project_name || null, row.front_name || null,
      row.priority || 'medium', row.goal || null, row.content_type || null, row.caption || null, row.video_link || null,
      row.due_date || null, row.deadline_label || null, status
    );
    setAssignees(info.lastInsertRowid, row.assignee_ids);
    return Number(info.lastInsertRowid);
  };

  const updateOne = (taskId, row) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?')
      .get(Number(taskId), Number(req.user.agency_id));
    if (!existing || !canModifyTask(req.user, existing)) {
      throw new Error(`A tarefa "${row.title}" existe, mas você não pode atualizá-la.`);
    }
    const fields = [];
    const values = [];
    const mapping = [
      ['project_name', row.project_name],
      ['front_name', row.front_name],
      ['title', row.title],
      ['task_type', row.task_type],
      ['description', row.description],
      ['content_type', row.content_type],
      ['caption', row.caption],
      ['video_link', row.video_link],
      ['priority', row.priority],
      ['status', req.user.role === 'client' ? 'pending' : row.status],
      ['due_date', row.due_date],
      ['deadline_label', row.deadline_label],
      ['goal', row.goal],
    ];
    mapping.forEach(([field, value]) => {
      if (field === 'deadline_label') {
        if (!row.provided.due_date) return;
      } else if (!row.provided[field]) return;
      fields.push(`${field} = ?`);
      values.push(value === '' ? null : value);
    });
    if (fields.length) {
      db.prepare(`UPDATE tasks SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(...values, Number(taskId), Number(req.user.agency_id));
    }
    if (row.provided.responsible) setAssignees(taskId, row.assignee_ids);
    return Number(taskId);
  };

  const counts = { created: 0, subtasks_created: 0, updated: 0, ignored: 0 };
  const csvToDbId = new Map();
  const imported = [];
  const runtimeErrors = [];

  try {
    const transaction = db.transaction(() => {
      const parents = validRows.filter((row) => !row.parent_csv_id);
      for (const row of parents) {
        let taskId = null;
        const existing = row.existing_task_id
          ? db.prepare('SELECT id, created_by, status FROM tasks WHERE id = ? AND agency_id = ?').get(row.existing_task_id, req.user.agency_id)
          : findExistingParentTask(req.user.agency_id, row.client_id, row.project_name, row.title);

        if (existing && duplicateStrategy === 'ignore') {
          taskId = Number(existing.id);
          counts.ignored += 1;
        } else if (existing && duplicateStrategy === 'update') {
          taskId = updateOne(existing.id, row);
          counts.updated += 1;
        } else {
          taskId = createOne(row, null);
          counts.created += 1;
        }
        csvToDbId.set(row.csv_id, taskId);
        imported.push({ csv_id: row.csv_id, task_id: taskId, type: 'task' });
      }

      const children = validRows.filter((row) => row.parent_csv_id);
      for (const row of children) {
        const parentTaskId = csvToDbId.get(row.parent_csv_id);
        if (!parentTaskId) {
          runtimeErrors.push({ line: row.line, title: row.title, errors: ['Tarefa pai não foi importada.'] });
          continue;
        }
        const existing = row.existing_task_id
          ? db.prepare('SELECT id, created_by, status FROM tasks WHERE id = ? AND agency_id = ?').get(row.existing_task_id, req.user.agency_id)
          : findExistingSubtask(req.user.agency_id, parentTaskId, row.title);
        let taskId = null;
        if (existing && duplicateStrategy === 'ignore') {
          taskId = Number(existing.id);
          counts.ignored += 1;
        } else if (existing && duplicateStrategy === 'update') {
          taskId = updateOne(existing.id, row);
          counts.updated += 1;
        } else {
          taskId = createOne(row, parentTaskId);
          counts.subtasks_created += 1;
        }
        csvToDbId.set(row.csv_id, taskId);
        imported.push({ csv_id: row.csv_id, task_id: taskId, type: 'subtask', parent_task_id: parentTaskId });
      }
    });
    transaction();
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível importar as tarefas' });
  }

  return res.status(201).json({
    ok: true,
    counts,
    imported,
    skipped_invalid: invalidRows.length,
    errors: [
      ...invalidRows.map((row) => ({ line: row.line, title: row.title, errors: row.errors })),
      ...runtimeErrors,
    ],
  });
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

router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT
      t.id, t.agency_id, t.client_id, t.created_by, t.parent_task_id, t.task_type,
      t.title, t.description, t.project_name, t.front_name, t.priority, t.goal,
      t.content_type, t.caption, t.video_link,
      t.due_date, t.deadline_label, t.status, t.is_featured, t.attachment_mime, t.attachment_filename,
      t.feed_post_id, COALESCE(p.feed_visible, 0) AS feed_post_visible, t.created_at, t.updated_at,
      ctr.id AS client_request_id,
      ctr.protocol AS request_protocol,
      ctr.requester_name, ctr.requester_email, ctr.requester_phone,
      ctr.request_type, ctr.requested_due_date, ctr.urgency AS request_urgency,
      ctr.references_text AS request_references, ctr.notes AS request_notes,
      CASE WHEN t.attachment_data IS NOT NULL AND length(t.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment,
      CASE WHEN t.media_gallery IS NOT NULL AND length(t.media_gallery) > 2 THEN 1 ELSE 0 END AS has_gallery,
      c.name AS client_name, c.logo_color AS client_color
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN posts p ON p.id = t.feed_post_id AND p.agency_id = t.agency_id
    LEFT JOIN client_task_requests ctr ON ctr.task_id = t.id AND ctr.agency_id = t.agency_id
    WHERE t.id = ? AND t.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;

  task.assignees = attachAssignees([{ id: task.id }], req.user.agency_id)[0].assignees;

  let subtaskQuery = `
    SELECT st.id, st.client_id, st.created_by, st.parent_task_id, st.task_type, st.content_type,
           st.title, st.project_name, st.front_name, st.priority, st.goal,
           st.status, st.due_date, st.deadline_label, st.attachment_filename, st.feed_post_id,
           COALESCE(sp.feed_visible, 0) AS feed_post_visible,
           CASE WHEN st.attachment_data IS NOT NULL AND length(st.attachment_data) > 0 THEN 1 ELSE 0 END AS has_attachment
    FROM tasks st
    LEFT JOIN posts sp ON sp.id = st.feed_post_id AND sp.agency_id = st.agency_id
    WHERE st.parent_task_id = ? AND st.agency_id = ?
  `;
  const subtaskParams = [req.params.id, req.user.agency_id];
  if (req.user.role === 'team' && !req.user.is_operations_head) {
    subtaskQuery += teamVisibilityClause('st');
    pushTeamVisibilityParams(subtaskParams, req.user);
  }
  subtaskQuery += ' ORDER BY COALESCE(st.due_date, st.created_at) ASC';
  const subtaskRows = db.prepare(subtaskQuery).all(...subtaskParams);
  const subtasks = attachAssignees(subtaskRows, req.user.agency_id);

  let requestFiles = [];
  let requestEvents = [];
  if (task.client_request_id) {
    requestFiles = db.prepare(`
      SELECT id, file_url, mime, filename, created_at
      FROM client_task_request_files
      WHERE request_id = ?
      ORDER BY id ASC
    `).all(Number(task.client_request_id));
    requestEvents = db.prepare(`
      SELECT e.id, e.event_type, e.message, e.created_at, u.name AS user_name
      FROM client_task_request_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.request_id = ? AND e.agency_id = ?
      ORDER BY e.created_at ASC, e.id ASC
    `).all(Number(task.client_request_id), Number(req.user.agency_id));
  }

  res.json({ task, subtasks, request_files: requestFiles, request_events: requestEvents });
});

router.post('/', (req, res) => {
  const {
    title, description, project_name, front_name, priority, goal,
    task_type, content_type, caption, video_link, media_gallery,
    due_date, assignee_ids, status, client_id, is_featured,
    attachment_data, attachment_mime, attachment_filename, parent_task_id
  } = req.body;
  if (!String(title || '').trim()) return res.status(400).json({ error: 'Titulo e obrigatorio' });
  if (req.user.role !== 'client' && status && !TASK_STATUSES.has(String(status))) {
    return res.status(400).json({ error: 'Status de tarefa inválido' });
  }
  if (priority && !TASK_PRIORITIES.has(String(priority))) {
    return res.status(400).json({ error: 'Prioridade de tarefa inválida' });
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
  const assigneeValidation = validateAssigneesForClient(finalClientId, finalAssigneeIds, req.user.agency_id);
  if (!assigneeValidation.ok) return res.status(400).json({ error: assigneeValidation.error });

  const createTask = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tasks (
        agency_id, client_id, created_by, parent_task_id, task_type, title, description,
        project_name, front_name, priority, goal,
        content_type, caption, video_link, media_gallery, due_date, status, is_featured,
        attachment_data, attachment_mime, attachment_filename
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.agency_id, finalClientId, req.user.id, parent_task_id || null, task_type || 'basic', String(title).trim(), description || '',
      project_name || null, front_name || null, priority || 'medium', goal || null,
      content_type || null, caption || null, video_link || null,
      serializeExternalGallery(media_gallery),
      due_date || null, req.user.role === 'client' ? 'pending' : (status || 'pending'),
      req.user.role === 'client' || parent_task_id ? 0 : (Number(is_featured) === 1 ? 1 : 0),
      persistMedia(attachment_data, attachment_mime || 'application/octet-stream'), attachment_mime || null, attachment_filename || null
    );
    setAssignees(info.lastInsertRowid, finalAssigneeIds);
    return info.lastInsertRowid;
  });

  const id = createTask();
  res.status(201).json({ id, task: getTaskSummary(id, req.user.agency_id) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, existing)) return;
  if (!ensureModifyTask(req, res, existing)) return;

  if (Object.prototype.hasOwnProperty.call(req.body, 'title') && !String(req.body.title || '').trim()) {
    return res.status(400).json({ error: 'Titulo e obrigatorio' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'status') && !TASK_STATUSES.has(String(req.body.status))) {
    return res.status(400).json({ error: 'Status de tarefa inválido' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'priority') && req.body.priority && !TASK_PRIORITIES.has(String(req.body.priority))) {
    return res.status(400).json({ error: 'Prioridade de tarefa inválida' });
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

  const allowedFields = req.user.role === 'client' ? [
    'title', 'description', 'project_name', 'front_name', 'priority', 'goal',
    'task_type', 'content_type', 'caption', 'video_link',
    'media_gallery', 'due_date', 'attachment_data', 'attachment_mime', 'attachment_filename'
  ] : [
    'title', 'description', 'project_name', 'front_name', 'priority', 'goal',
    'task_type', 'content_type', 'caption', 'video_link',
    'media_gallery', 'due_date', 'status', 'client_id',
    'is_featured', 'attachment_data', 'attachment_mime', 'attachment_filename'
  ];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'media_gallery') {
      values.push(serializeExternalGallery(req.body.media_gallery));
    } else if (field === 'attachment_data') {
      values.push(persistMedia(req.body.attachment_data, req.body.attachment_mime || existing.attachment_mime || 'application/octet-stream'));
    } else if (field === 'title') {
      values.push(String(req.body.title).trim());
    } else if (field === 'client_id') {
      values.push(req.body.client_id ? Number(req.body.client_id) : null);
    } else if (field === 'is_featured') {
      values.push(Number(req.body.is_featured) === 1 ? 1 : 0);
    } else {
      values.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  const updateTask = db.transaction(() => {
    if (updates.length) {
      db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(...values, req.params.id, req.user.agency_id);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')) {
      setAssignees(req.params.id, req.body.assignee_ids);
    }
  });
  updateTask();

  const clientRequest = db.prepare(`
    SELECT id FROM client_task_requests
    WHERE task_id = ? AND agency_id = ?
  `).get(Number(req.params.id), Number(req.user.agency_id));
  if (clientRequest) {
    const eventMessages = [];
    const statusNames = { pending: 'A fazer', in_progress: 'Em andamento', done: 'Concluída', posted: 'Postado' };
    const priorityNames = { low: 'Baixa', medium: 'Média', high: 'Alta' };
    if (Object.prototype.hasOwnProperty.call(req.body, 'status') && req.body.status !== existing.status) {
      eventMessages.push(`Status: ${statusNames[existing.status] || existing.status} → ${statusNames[req.body.status] || req.body.status}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'priority') && req.body.priority && req.body.priority !== existing.priority) {
      eventMessages.push(`Prioridade: ${priorityNames[existing.priority] || existing.priority} → ${priorityNames[req.body.priority] || req.body.priority}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'due_date') && (req.body.due_date || null) !== (existing.due_date || null)) {
      eventMessages.push(`Prazo interno atualizado para ${req.body.due_date || 'sem prazo'}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'assignee_ids')) {
      const names = attachAssignees([{ id: Number(req.params.id) }], req.user.agency_id)[0].assignees.map((item) => item.name);
      eventMessages.push(names.length ? `Responsável(is): ${names.join(', ')}` : 'Responsáveis removidos');
    }
    if (eventMessages.length) {
      const insertEvent = db.prepare(`
        INSERT INTO client_task_request_events (agency_id, request_id, user_id, event_type, message)
        VALUES (?, ?, ?, 'task_updated', ?)
      `);
      eventMessages.forEach((message) => insertEvent.run(req.user.agency_id, clientRequest.id, req.user.id, message));
    }
  }

  res.json({ ok: true, task: getTaskSummary(req.params.id, req.user.agency_id) });
});

router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT id, agency_id, client_id FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
  if (!ensureTaskAccess(req, res, task)) return;
  const completeTask = db.prepare('SELECT id, agency_id, client_id, created_by, status FROM tasks WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!ensureModifyTask(req, res, completeTask)) return;
  db.prepare('DELETE FROM tasks WHERE id = ? AND agency_id = ?').run(req.params.id, req.user.agency_id);
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
      INSERT INTO tasks (
        agency_id, client_id, created_by, parent_task_id, task_type, title, description,
        project_name, front_name, priority, goal,
        content_type, caption, video_link, media_gallery, due_date, deadline_label, status,
        attachment_data, attachment_mime, attachment_filename
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      req.user.agency_id, task.client_id, req.user.id, task.parent_task_id, task.task_type, `${task.title} (cópia)`, task.description,
      task.project_name, task.front_name, task.priority || 'medium', task.goal,
      task.content_type, task.caption, task.video_link, task.media_gallery, requestedDueDate, task.deadline_label,
      task.attachment_data, task.attachment_mime, task.attachment_filename
    );
    const assigneeIds = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(task.id).map((row) => row.user_id);
    setAssignees(info.lastInsertRowid, assigneeIds);
    return info.lastInsertRowid;
  });

  const id = duplicate();
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
