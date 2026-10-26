const express = require('express');
const db = require('../db/database');
const { hasPermission } = require('../services/permissions');
const {
  normalizeDay,
  normalizeScope,
  classifyTask,
  headlineForSummary,
  splitList,
} = require('../utils/operationalCalendar');

const router = express.Router();

function accessibleClientIds(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.is_operations_head) {
    return db.prepare("SELECT id FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name")
      .all(user.agency_id).map((row) => Number(row.id));
  }
  if (user.role === 'client') return user.client_id ? [Number(user.client_id)] : [];
  return (Array.isArray(user.client_ids) ? user.client_ids : []).map(Number).filter(Boolean);
}

function selectionForRequest(req, res) {
  const available = accessibleClientIds(req.user);
  const requested = Number(req.query.client_id || 0);
  if (!requested) return { available, selected: available, requested: null };
  if (!available.includes(requested)) {
    res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
    return null;
  }
  return { available, selected: [requested], requested };
}

function dateTimeForDay(day) {
  return `${String(day).slice(0, 10)}T12:00:00`;
}

function parseRange(req, res) {
  const from = normalizeDay(req.query.from);
  const to = normalizeDay(req.query.to);
  if (!from || !to) {
    res.status(400).json({ error: 'Informe o período do calendário.' });
    return null;
  }
  if (from > to) {
    res.status(400).json({ error: 'A data inicial deve ser anterior à data final.' });
    return null;
  }
  const span = Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(span) || span > 62) {
    res.status(400).json({ error: 'Consulte no máximo 63 dias por vez.' });
    return null;
  }
  return { from, to };
}

function inClause(ids) {
  return ids.length ? ids.map(() => '?').join(',') : 'NULL';
}

function taskEvents(req, range, clientIds, scope) {
  if (!hasPermission(req.user, 'tasks.view')) return [];
  const clauses = [
    't.agency_id = ?',
    "date(t.due_date) BETWEEN date(?) AND date(?)",
    'COALESCE(t.is_backlog, 0) = 0',
    "NOT EXISTS (SELECT 1 FROM tasks bp WHERE bp.id = t.parent_task_id AND bp.agency_id = t.agency_id AND COALESCE(bp.is_backlog, 0) = 1)",
  ];
  const params = [req.user.agency_id, range.from, range.to];

  if (req.user.role === 'admin' || req.user.is_operations_head) {
    if (clientIds.length) {
      clauses.push(`(t.client_id IS NULL OR t.client_id IN (${inClause(clientIds)}))`);
      params.push(...clientIds);
    } else {
      clauses.push('t.client_id IS NULL');
    }
  } else if (clientIds.length) {
    // Para contas de equipe com carteira restrita, tarefas internas sem cliente só
    // entram quando pertencem à própria pessoa. Isso evita expor demandas gerais
    // da agência fora do escopo daquele usuário.
    clauses.push(`(t.client_id IN (${inClause(clientIds)}) OR (t.client_id IS NULL AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))))`);
    params.push(...clientIds, req.user.id, req.user.id);
  } else {
    clauses.push('(t.client_id IS NULL AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)))');
    params.push(req.user.id, req.user.id);
  }

  if (scope === 'mine') {
    clauses.push('(t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))');
    params.push(req.user.id, req.user.id);
  }

  const rows = db.prepare(`
    SELECT
      t.id, t.client_id, t.parent_task_id, t.task_type, t.title, t.due_date,
      t.status, t.workflow_stage, t.approval_status, t.direction_status, t.client_status,
      t.created_by, t.updated_at,
      c.name AS client_name,
      parent.title AS parent_title,
      creator.name AS creator_name,
      (SELECT GROUP_CONCAT(ta.user_id, '|') FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids,
      (SELECT GROUP_CONCAT(u.name, '|') FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id) AS assignee_names
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN users creator ON creator.id = t.created_by
    WHERE ${clauses.join(' AND ')}
    ORDER BY t.due_date ASC, t.id ASC
  `).all(...params);

  return rows.map((row) => {
    const meta = classifyTask(row);
    const assigneeIds = splitList(row.assignee_ids).map(Number).filter(Boolean);
    const assigneeNames = splitList(row.assignee_names);
    return {
      id: `task:${row.id}`,
      source: 'task',
      source_id: Number(row.id),
      type: meta.type,
      type_label: meta.label,
      title: row.title,
      subtitle: row.parent_title || null,
      client_id: row.client_id ? Number(row.client_id) : null,
      client_name: row.client_name || 'Zebrazul',
      start_at: dateTimeForDay(row.due_date),
      end_at: dateTimeForDay(row.due_date),
      all_day: true,
      status: meta.stage,
      responsible_ids: assigneeIds.length ? assigneeIds : (row.created_by ? [Number(row.created_by)] : []),
      responsible_names: assigneeNames.length ? assigneeNames : (row.creator_name ? [row.creator_name] : []),
      link: meta.type === 'approval' ? '/aprovacao' : (meta.type === 'post' ? '/agendamento' : '/designer'),
      notes: null,
    };
  });
}

function socialPostEvents(req, range, clientIds, scope) {
  const canSocial = hasPermission(req.user, 'social.feed') || hasPermission(req.user, 'tasks.approval');
  if (!canSocial || !clientIds.length) return [];
  const clauses = [
    'p.agency_id = ?',
    "datetime(p.scheduled_at) >= datetime(?)",
    "datetime(p.scheduled_at) < datetime(?, '+1 day')",
    'COALESCE(p.feed_visible, 1) <> 0',
    `p.client_id IN (${inClause(clientIds)})`,
  ];
  const params = [req.user.agency_id, `${range.from}T00:00:00`, range.to, ...clientIds];
  if (scope === 'mine') {
    clauses.push('p.created_by = ?');
    params.push(req.user.id);
  }
  const rows = db.prepare(`
    SELECT p.id, p.client_id, p.title, p.content_type, p.scheduled_at, p.status, p.created_by,
           c.name AS client_name, u.name AS creator_name
    FROM posts p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.scheduled_at ASC, p.id ASC
  `).all(...params);
  return rows.map((row) => ({
    id: `post:${row.id}`,
    source: 'post',
    source_id: Number(row.id),
    type: 'post',
    type_label: 'Postagem',
    title: row.title,
    subtitle: row.content_type || null,
    client_id: Number(row.client_id),
    client_name: row.client_name,
    start_at: row.scheduled_at,
    end_at: row.scheduled_at,
    all_day: false,
    status: row.status || 'scheduled',
    responsible_ids: row.created_by ? [Number(row.created_by)] : [],
    responsible_names: row.creator_name ? [row.creator_name] : [],
    link: '/agendamento',
    notes: null,
  }));
}

function recordingEvents(req, range, clientIds, scope) {
  if (!hasPermission(req.user, 'audiovisual.view') || !clientIds.length) return [];
  const clauses = [
    'r.agency_id = ?',
    "datetime(r.scheduled_start) >= datetime(?)",
    "datetime(r.scheduled_start) < datetime(?, '+1 day')",
    "r.status <> 'cancelled'",
    `r.client_id IN (${inClause(clientIds)})`,
  ];
  const params = [req.user.agency_id, `${range.from}T00:00:00`, range.to, ...clientIds];
  if (scope === 'mine') {
    clauses.push('r.created_by = ?');
    params.push(req.user.id);
  }
  const rows = db.prepare(`
    SELECT r.*, c.name AS client_name, creator.name AS creator_name
    FROM audiovisual_recordings r
    JOIN clients c ON c.id = r.client_id
    LEFT JOIN users creator ON creator.id = r.created_by
    WHERE ${clauses.join(' AND ')}
    ORDER BY r.scheduled_start ASC, r.id ASC
  `).all(...params);
  return rows.map((row) => ({
    id: `recording:${row.id}`,
    source: 'recording',
    source_id: Number(row.id),
    type: 'recording',
    type_label: 'Gravação',
    title: row.title || `Gravação · ${row.client_name}`,
    subtitle: row.location || null,
    client_id: Number(row.client_id),
    client_name: row.client_name,
    start_at: row.scheduled_start,
    end_at: row.scheduled_end || row.scheduled_start,
    all_day: false,
    status: row.status || 'scheduled',
    responsible_ids: row.responsible_name ? [] : (row.created_by ? [Number(row.created_by)] : []),
    responsible_names: [row.responsible_name || row.creator_name].filter(Boolean),
    link: '/audiovisual',
    notes: row.notes || null,
  }));
}

function audiovisualScheduleEvents(req, range, clientIds, scope) {
  if (!hasPermission(req.user, 'audiovisual.view') || !clientIds.length) return [];
  const clauses = [
    's.agency_id = ?',
    "datetime(s.scheduled_at) >= datetime(?)",
    "datetime(s.scheduled_at) < datetime(?, '+1 day')",
    "s.status <> 'cancelled'",
    `v.client_id IN (${inClause(clientIds)})`,
  ];
  const params = [req.user.agency_id, `${range.from}T00:00:00`, range.to, ...clientIds];
  if (scope === 'mine') {
    clauses.push('(v.editor_user_id = ? OR s.created_by = ?)');
    params.push(req.user.id, req.user.id);
  }
  const rows = db.prepare(`
    SELECT s.id, s.video_id, s.feed_post_id, s.platform, s.scheduled_at, s.status, s.created_by,
           v.title, v.client_id, v.editor_user_id,
           c.name AS client_name, editor.name AS editor_name, creator.name AS creator_name
    FROM audiovisual_video_schedules s
    JOIN audiovisual_videos v ON v.id = s.video_id AND v.agency_id = s.agency_id
    JOIN clients c ON c.id = v.client_id
    LEFT JOIN users editor ON editor.id = v.editor_user_id
    LEFT JOIN users creator ON creator.id = s.created_by
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.scheduled_at ASC, s.id ASC
  `).all(...params);

  return rows.map((row) => ({
    id: `av-post:${row.id}`,
    source: 'audiovisual_schedule',
    source_id: Number(row.id),
    type: 'post',
    type_label: 'Postagem · vídeo',
    title: row.title,
    subtitle: row.platform || 'Vídeo',
    client_id: Number(row.client_id),
    client_name: row.client_name,
    start_at: row.scheduled_at,
    end_at: row.scheduled_at,
    all_day: false,
    status: row.status || 'dated',
    responsible_ids: [row.editor_user_id || row.created_by].filter(Boolean).map(Number),
    responsible_names: [row.editor_name || row.creator_name].filter(Boolean),
    link: '/audiovisual',
    notes: null,
    feed_post_id: row.feed_post_id ? Number(row.feed_post_id) : null,
  }));
}

function organizerEvents(req, range, clientIds, requestedClientId, scope) {
  if (!hasPermission(req.user, 'organizer.view')) return [];
  const clauses = ['e.agency_id = ?', 'date(e.start_at) BETWEEN date(?) AND date(?)'];
  const params = [req.user.agency_id, range.from, range.to];
  if (scope === 'mine') {
    clauses.push('e.user_id = ?');
    params.push(req.user.id);
  } else {
    clauses.push("(e.visibility = 'team' OR e.user_id = ?)");
    params.push(req.user.id);
  }
  if (requestedClientId) {
    clauses.push('e.client_id = ?');
    params.push(requestedClientId);
  } else if (clientIds.length && req.user.role !== 'admin' && !req.user.is_operations_head) {
    clauses.push(`(e.client_id IS NULL OR e.client_id IN (${inClause(clientIds)}))`);
    params.push(...clientIds);
  }
  const rows = db.prepare(`
    SELECT e.*, u.name AS user_name, c.name AS client_name
    FROM organizer_events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN clients c ON c.id = e.client_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.start_at ASC, e.id ASC
  `).all(...params);
  return rows.map((row) => {
    const type = row.event_type === 'meeting' ? 'meeting'
      : row.event_type === 'recording' ? 'recording'
        : row.event_type === 'post' ? 'post' : 'event';
    return {
      id: `event:${row.id}`,
      source: 'organizer',
      source_id: Number(row.id),
      type,
      type_label: type === 'meeting' ? 'Reunião' : type === 'recording' ? 'Gravação' : type === 'post' ? 'Postagem' : 'Evento',
      title: row.title,
      subtitle: row.event_type === 'personal' ? 'Pessoal' : null,
      client_id: row.client_id ? Number(row.client_id) : null,
      client_name: row.client_name || 'Zebrazul',
      start_at: row.start_at,
      end_at: row.end_at || row.start_at,
      all_day: Boolean(Number(row.all_day || 0)),
      status: 'scheduled',
      responsible_ids: [Number(row.user_id)],
      responsible_names: [row.user_name].filter(Boolean),
      link: '/organizacao',
      notes: row.notes || null,
    };
  });
}

function dedupe(events) {
  // Quando o Audiovisual criou um post real no Feed, o Feed vira a fonte pública da postagem.
  // Mantemos o agendamento audiovisual apenas se não houver esse post no recorte.
  const postIds = new Set(events.filter((event) => event.source === 'post').map((event) => Number(event.source_id)));
  return events.filter((event) => !(event.source === 'audiovisual_schedule' && event.feed_post_id && postIds.has(Number(event.feed_post_id))));
}

router.get('/', (req, res) => {
  const range = parseRange(req, res);
  if (!range) return;
  const selection = selectionForRequest(req, res);
  if (!selection) return;
  const scope = normalizeScope(req.query.scope);

  let events = [
    ...taskEvents(req, range, selection.selected, scope),
    ...socialPostEvents(req, range, selection.selected, scope),
    ...recordingEvents(req, range, selection.selected, scope),
    ...audiovisualScheduleEvents(req, range, selection.selected, scope),
    ...organizerEvents(req, range, selection.selected, selection.requested, scope),
  ];

  events = dedupe(events).sort((a, b) => {
    const byDate = String(a.start_at || '').localeCompare(String(b.start_at || ''));
    return byDate || String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });

  const summary = events.reduce((acc, event) => {
    acc.total += 1;
    acc[event.type] = Number(acc[event.type] || 0) + 1;
    return acc;
  }, { total: 0, recording: 0, delivery: 0, approval: 0, post: 0, meeting: 0, event: 0 });
  summary.headline = headlineForSummary(summary);

  const responsibleMap = new Map();
  events.forEach((event) => {
    (event.responsible_names || []).forEach((name, index) => {
      const id = Number(event.responsible_ids?.[index] || 0);
      const key = id ? `id:${id}` : `name:${name}`;
      if (!responsibleMap.has(key)) responsibleMap.set(key, { id: id || null, name });
    });
  });

  res.json({
    range,
    scope,
    summary,
    events,
    responsibles: [...responsibleMap.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')),
  });
});

module.exports = router;
