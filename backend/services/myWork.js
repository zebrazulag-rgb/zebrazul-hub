const { phaseOf, daysBetween, addDays } = require('./managerDashboard');

function toDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function todayInFortaleza() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function severityForDue(dueDate, today) {
  if (!dueDate) return 0;
  if (dueDate < today) return 3;
  if (dueDate === today) return 2;
  if (dueDate <= addDays(today, 3)) return 1;
  return 0;
}

function classifyTaskForUser(item, { isManager = false, assignedToUser = false, today }) {
  const dueSeverity = severityForDue(item.due_date, today);
  const lateDays = item.due_date && item.due_date < today ? daysBetween(item.due_date, today) : 0;

  if (isManager && item.phase === 'approval_direction') {
    return { bucket: 'action', action: 'Aprovar direção', reason: item.idle_days ? `Aguardando sua aprovação há ${item.idle_days}d` : 'Aguardando sua aprovação', severity: Math.max(2, dueSeverity), late_days: lateDays };
  }
  if (isManager && item.phase === 'approval_held') {
    return { bucket: 'action', action: 'Enviar ao cliente', reason: item.idle_days ? `Aprovada há ${item.idle_days}d e ainda não foi enviada` : 'Aprovada pela direção e ainda não enviada', severity: Math.max(2, dueSeverity), late_days: lateDays };
  }
  if (isManager && item.phase === 'approval_client' && item.idle_days >= 2) {
    return { bucket: 'action', action: 'Cobrar cliente', reason: `Cliente sem responder há ${item.idle_days}d`, severity: item.idle_days >= 5 ? 3 : 2, late_days: lateDays };
  }

  if (!assignedToUser) return null;

  if (item.phase === 'correction') {
    return { bucket: 'action', action: 'Corrigir', reason: item.feedback || `Correção pedida pela ${item.source || 'aprovação'}`, severity: Math.max(3, dueSeverity), late_days: lateDays };
  }
  if (item.phase === 'todo') {
    return { bucket: 'action', action: 'Começar', reason: lateDays ? `Atrasada há ${lateDays}d` : (item.due_date === today ? 'Vence hoje' : item.idle_days >= 3 ? `Parada há ${item.idle_days}d` : 'Ainda não iniciada'), severity: Math.max(dueSeverity, item.idle_days >= 5 ? 2 : 0), late_days: lateDays };
  }
  if (item.phase === 'in_progress') {
    return { bucket: 'action', action: 'Continuar', reason: lateDays ? `Atrasada há ${lateDays}d` : (item.due_date === today ? 'Vence hoje' : item.idle_days >= 3 ? `Sem movimento há ${item.idle_days}d` : 'Em produção'), severity: Math.max(dueSeverity, item.idle_days >= 5 ? 2 : 0), late_days: lateDays };
  }
  if (['approval_direction', 'approval_held', 'approval_client'].includes(item.phase)) {
    const waitingReason = {
      approval_direction: 'Aguardando direção',
      approval_held: 'Aguardando envio ao cliente',
      approval_client: 'Aguardando cliente',
    }[item.phase];
    return { bucket: 'waiting', action: 'Aguardar', reason: waitingReason, severity: 0, late_days: lateDays };
  }
  return null;
}

function sortWorkItems(a, b) {
  return Number(b.severity || 0) - Number(a.severity || 0)
    || Number(b.late_days || 0) - Number(a.late_days || 0)
    || String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'))
    || Number(a.id || 0) - Number(b.id || 0);
}

function buildMyWork(db, {
  user,
  today,
  clientId = null,
  canSeeTasks = true,
  canSeeAudiovisual = false,
} = {}) {
  const todayDay = toDay(today) || todayInFortaleza();
  const agencyId = Number(user.agency_id);
  const userId = Number(user.id);
  const isManager = user.role === 'admin' || Number(user.is_operations_head) === 1;
  const requestedClientId = Number(clientId || 0) || null;
  const actions = [];
  const waiting = [];

  if (canSeeTasks) {
    const hasApprovalStates = Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'designer_approval_states'`).get());
    const approvalColumns = hasApprovalStates
      ? `das.direction_status AS das_direction, das.client_status AS das_client,
           das.direction_feedback AS das_direction_feedback, das.client_feedback AS das_client_feedback`
      : `NULL AS das_direction, NULL AS das_client, NULL AS das_direction_feedback, NULL AS das_client_feedback`;
    const approvalJoin = hasApprovalStates
      ? 'LEFT JOIN designer_approval_states das ON das.task_id = t.id AND das.agency_id = t.agency_id'
      : '';

    const taskRows = db.prepare(`
      SELECT t.id, t.parent_task_id, t.client_id, t.title, t.task_type, t.status, t.workflow_stage,
             t.approval_status, t.direction_status, t.client_status, t.direction_feedback, t.client_feedback,
             t.due_date, t.updated_at, t.created_at, t.assignee_id,
             p.assignee_id AS parent_assignee_id,
             c.name AS client_name,
             ${approvalColumns},
             CASE WHEN EXISTS (
               SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?
             ) THEN 1 ELSE 0 END AS leaf_assigned,
             CASE WHEN t.parent_task_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id = t.parent_task_id AND ta2.user_id = ?
             ) THEN 1 ELSE 0 END AS parent_assigned,
             CASE WHEN EXISTS (
               SELECT 1 FROM task_assignees any_ta WHERE any_ta.task_id = t.id
             ) OR EXISTS (
               SELECT 1 FROM task_assignees any_parent WHERE any_parent.task_id = t.parent_task_id
             ) OR t.assignee_id IS NOT NULL OR p.assignee_id IS NOT NULL THEN 1 ELSE 0 END AS has_any_assignee
      FROM tasks t
      LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
      LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
      ${approvalJoin}
      WHERE t.agency_id = ?
        AND COALESCE(t.is_backlog, 0) = 0
        AND COALESCE(p.is_backlog, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
        AND (t.client_id IS NULL OR c.status = 'active')
        AND t.status != 'posted'
        ${requestedClientId ? 'AND t.client_id = ?' : ''}
    `).all(userId, userId, agencyId, ...(requestedClientId ? [requestedClientId] : []));

    taskRows.forEach((row) => {
      const phase = phaseOf(row);
      if (phase.phase === 'ready' || phase.phase === 'posted') return;
      const updatedDay = toDay(row.updated_at) || toDay(row.created_at) || todayDay;
      const idleDays = Math.max(0, daysBetween(updatedDay, todayDay));
      const dueDate = toDay(row.due_date);
      const assignedToUser = Boolean(
        Number(row.leaf_assigned) === 1
        || Number(row.parent_assigned) === 1
        || Number(row.assignee_id) === userId
        || Number(row.parent_assignee_id) === userId
      );

      const item = {
        id: Number(row.id),
        parent_task_id: row.parent_task_id ? Number(row.parent_task_id) : null,
        kind: 'task',
        title: row.title,
        client_id: row.client_id ? Number(row.client_id) : null,
        client_name: row.client_name || 'Interno',
        phase: phase.phase,
        source: phase.source || null,
        feedback: phase.feedback || null,
        due_date: dueDate,
        idle_days: idleDays,
        link: `/designer?task_id=${row.parent_task_id || row.id}`,
      };

      let classified = classifyTaskForUser(item, { isManager, assignedToUser, today: todayDay });

      if (!classified && isManager && Number(row.has_any_assignee) === 0 && ['todo', 'in_progress', 'correction'].includes(item.phase)) {
        const lateDays = dueDate && dueDate < todayDay ? daysBetween(dueDate, todayDay) : 0;
        if (lateDays > 0 || idleDays >= 3) {
          classified = {
            bucket: 'action',
            action: 'Definir responsável',
            reason: lateDays ? `Sem responsável e atrasada há ${lateDays}d` : `Sem responsável há ${idleDays}d`,
            severity: lateDays >= 3 ? 3 : 2,
            late_days: lateDays,
          };
        }
      }

      if (!classified) return;
      const approvalAction = isManager && ['approval_direction', 'approval_held', 'approval_client'].includes(item.phase) && classified.bucket === 'action';
      const output = {
        ...item,
        ...classified,
        area: approvalAction ? 'Aprovação' : 'Designer',
        link: approvalAction ? '/aprovacao' : item.link,
      };
      if (classified.bucket === 'waiting') waiting.push(output);
      else actions.push(output);
    });
  }

  if (canSeeAudiovisual) {
    const videoRows = db.prepare(`
      SELECT v.id, v.title, v.status, v.client_id, v.updated_at, v.created_at,
             c.name AS client_name, r.title AS recording_title
      FROM audiovisual_videos v
      JOIN clients c ON c.id = v.client_id AND c.agency_id = v.agency_id
      LEFT JOIN audiovisual_recordings r ON r.id = v.recording_id AND r.agency_id = v.agency_id
      WHERE v.agency_id = ?
        AND v.editor_user_id = ?
        AND v.status IN ('recorded', 'editing', 'edited')
        AND c.status = 'active'
        ${requestedClientId ? 'AND v.client_id = ?' : ''}
      ORDER BY v.updated_at ASC, v.id ASC
    `).all(agencyId, userId, ...(requestedClientId ? [requestedClientId] : []));

    videoRows.forEach((row) => {
      const updatedDay = toDay(row.updated_at) || toDay(row.created_at) || todayDay;
      const idleDays = Math.max(0, daysBetween(updatedDay, todayDay));
      if (row.status === 'edited') {
        waiting.push({
          id: Number(row.id), kind: 'video', area: 'Audiovisual', title: row.title, client_id: Number(row.client_id), client_name: row.client_name,
          phase: 'edited', action: 'Aguardar', reason: 'Edição concluída, aguardando próxima etapa', severity: 0, late_days: 0,
          due_date: null, idle_days: idleDays, link: '/audiovisual', recording_title: row.recording_title || null,
        });
        return;
      }
      actions.push({
        id: Number(row.id), kind: 'video', area: 'Audiovisual', title: row.title, client_id: Number(row.client_id), client_name: row.client_name,
        phase: row.status, action: row.status === 'recorded' ? 'Começar edição' : 'Continuar edição',
        reason: idleDays >= 3 ? `Sem movimento há ${idleDays}d` : (row.status === 'recorded' ? 'Bruto pronto para edição' : 'Edição em andamento'),
        severity: idleDays >= 5 ? 2 : (idleDays >= 3 ? 1 : 0), late_days: 0, due_date: null, idle_days: idleDays,
        link: '/audiovisual', recording_title: row.recording_title || null,
      });
    });
  }

  actions.sort(sortWorkItems);
  waiting.sort((a, b) => Number(b.idle_days || 0) - Number(a.idle_days || 0) || Number(a.id || 0) - Number(b.id || 0));

  const urgent = actions.filter((item) => Number(item.severity) >= 3).length;
  const dueToday = actions.filter((item) => item.due_date === todayDay).length;
  const overdue = actions.filter((item) => Number(item.late_days || 0) > 0).length;

  return {
    generated_at: new Date().toISOString(),
    today: todayDay,
    summary: {
      total: actions.length,
      urgent,
      overdue,
      due_today: dueToday,
      waiting: waiting.length,
      tasks: actions.filter((item) => item.kind === 'task').length,
      audiovisual: actions.filter((item) => item.kind === 'video').length,
    },
    actions: actions.slice(0, 120),
    waiting: waiting.slice(0, 80),
  };
}

module.exports = {
  buildMyWork,
  classifyTaskForUser,
  severityForDue,
  sortWorkItems,
  todayInFortaleza,
};
