const { buildMyWork, todayInFortaleza } = require('./myWork');
const { buildManagerDashboard, phaseOf, daysBetween, addDays } = require('./managerDashboard');

function toDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanText(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function groupForAlert(alert, today) {
  if (Number(alert.severity || 0) >= 3) return 'urgent';
  if (alert.due_date === today || alert.schedule_date === today) return 'today';
  if (Number(alert.severity || 0) >= 2) return 'attention';
  return 'waiting';
}

function sortAlerts(a, b) {
  const groupRank = { urgent: 4, today: 3, attention: 2, waiting: 1 };
  return (groupRank[b.group] || 0) - (groupRank[a.group] || 0)
    || Number(b.severity || 0) - Number(a.severity || 0)
    || Number(b.age_days || 0) - Number(a.age_days || 0)
    || String(a.due_date || a.schedule_date || '9999-12-31').localeCompare(String(b.due_date || b.schedule_date || '9999-12-31'))
    || String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
}

function summarizeAlerts(alerts) {
  const summary = {
    total: alerts.length,
    urgent: alerts.filter((item) => item.group === 'urgent').length,
    today: alerts.filter((item) => item.group === 'today').length,
    attention: alerts.filter((item) => item.group === 'attention').length,
    waiting: alerts.filter((item) => item.group === 'waiting').length,
  };
  if (summary.urgent > 0) {
    summary.headline = summary.urgent === 1 ? 'TEM 1 COISA GRITANDO.' : `TEM ${summary.urgent} COISAS GRITANDO.`;
    summary.subline = `${summary.total} sinal${summary.total === 1 ? '' : 'is'} ativo${summary.total === 1 ? '' : 's'} na operação.`;
  } else if (summary.total > 0) {
    summary.headline = summary.total === 1 ? 'HOJE TEM 1 COISA PEDINDO ATENÇÃO.' : `HOJE TEM ${summary.total} COISAS PEDINDO ATENÇÃO.`;
    summary.subline = 'Melhor resolver enquanto ainda é pequeno.';
  } else {
    summary.headline = 'NADA GRITANDO. BOM SINAL.';
    summary.subline = 'O radar não encontrou gargalos ativos agora.';
  }
  return summary;
}

function buildSmartAlerts(db, {
  user,
  today,
  clientId = null,
  canSeeTasks = true,
  canSeeAudiovisual = false,
  canSeeSocial = false,
} = {}) {
  const todayDay = toDay(today) || todayInFortaleza();
  const tomorrow = addDays(todayDay, 1);
  const agencyId = Number(user.agency_id);
  const userId = Number(user.id);
  const isManager = user.role === 'admin' || Number(user.is_operations_head) === 1;
  const requestedClientId = Number(clientId || 0) || null;
  const byEntity = new Map();

  function pushAlert(input) {
    if (!input?.entity_type || !input?.entity_id) return;
    const alert = {
      id: `${input.entity_type}:${input.entity_id}:${input.signal || 'attention'}`,
      entity_type: input.entity_type,
      entity_id: Number(input.entity_id),
      signal: input.signal || 'attention',
      area: input.area || 'Operação',
      title: cleanText(input.title || 'Pendência'),
      client_id: input.client_id ? Number(input.client_id) : null,
      client_name: input.client_name || 'Interno',
      message: cleanText(input.message || ''),
      action: input.action || 'Abrir',
      link: input.link || '/',
      severity: Math.max(1, Math.min(3, Number(input.severity || 1))),
      age_days: Math.max(0, Number(input.age_days || 0)),
      due_date: toDay(input.due_date),
      schedule_date: toDay(input.schedule_date),
    };
    alert.group = input.group || groupForAlert(alert, todayDay);
    const key = `${alert.entity_type}:${alert.entity_id}`;
    const current = byEntity.get(key);
    if (!current || alert.severity > current.severity || (alert.severity === current.severity && sortAlerts(alert, current) < 0)) {
      byEntity.set(key, alert);
    }
  }

  // Fila pessoal: aquilo que depende diretamente do usuário agora.
  const myWork = buildMyWork(db, {
    user,
    today: todayDay,
    clientId: requestedClientId,
    canSeeTasks,
    canSeeAudiovisual,
  });

  myWork.actions.forEach((item) => {
    const dueTomorrow = item.due_date === tomorrow;
    const dueToday = item.due_date === todayDay;
    const overdue = Number(item.late_days || 0) > 0;
    const correction = item.phase === 'correction';
    const stale = Number(item.idle_days || 0) >= 3;
    if (!overdue && !correction && !dueToday && !dueTomorrow && !stale && Number(item.severity || 0) < 2) return;

    let signal = 'stalled';
    let severity = Math.max(1, Number(item.severity || 0));
    let message = item.reason || 'Tem uma ação esperando você.';
    if (correction) signal = 'correction';
    else if (overdue) signal = 'overdue';
    else if (dueToday) signal = 'due_today';
    else if (dueTomorrow) { signal = 'due_tomorrow'; severity = Math.max(1, severity); message = 'Vence amanhã.'; }

    pushAlert({
      entity_type: item.kind === 'video' ? 'video' : 'task',
      entity_id: item.id,
      signal,
      area: item.area,
      title: item.title,
      client_id: item.client_id,
      client_name: item.client_name,
      message,
      action: item.action,
      link: item.link,
      severity,
      age_days: item.idle_days,
      due_date: item.due_date,
      group: dueToday && severity < 3 ? 'today' : undefined,
    });
  });

  // Gestão: gargalos que não pertencem necessariamente a uma pessoa, mas travam a operação.
  if (isManager && canSeeTasks) {
    const manager = buildManagerDashboard(db, { agencyId, today: todayDay });
    manager.queue.forEach((item) => {
      if (requestedClientId && Number(item.client_id) !== requestedClientId) return;
      const meta = {
        correction: { signal: 'correction', action: 'Corrigir', area: 'Designer' },
        overdue: { signal: 'overdue', action: 'Destravar', area: 'Operação' },
        approval_direction: { signal: 'approval_direction', action: 'Aprovar', area: 'Aprovação' },
        send_to_client: { signal: 'send_to_client', action: 'Enviar ao cliente', area: 'Aprovação' },
        approval_client: { signal: 'client_waiting', action: 'Cobrar cliente', area: 'Aprovação' },
        stalled: { signal: 'stalled', action: 'Destravar', area: 'Designer' },
      }[item.type] || { signal: item.type || 'attention', action: 'Abrir', area: 'Operação' };
      const link = ['approval_direction', 'send_to_client', 'approval_client'].includes(item.type)
        ? '/aprovacao'
        : `/designer?task_id=${item.parent_task_id || item.id}`;
      pushAlert({
        entity_type: 'task', entity_id: item.id, signal: meta.signal, area: meta.area,
        title: item.title, client_id: item.client_id, client_name: item.client_name,
        message: item.detail, action: meta.action, link, severity: item.severity,
        age_days: item.idle_days, due_date: item.due_date,
      });
    });

    // Tarefas sem dono: só vira alerta quando já está parada, vencida ou perto do prazo.
    const hasApprovalStates = Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'designer_approval_states'`).get());
    const approvalColumns = hasApprovalStates
      ? `das.direction_status AS das_direction, das.client_status AS das_client, das.direction_feedback AS das_direction_feedback, das.client_feedback AS das_client_feedback`
      : `NULL AS das_direction, NULL AS das_client, NULL AS das_direction_feedback, NULL AS das_client_feedback`;
    const approvalJoin = hasApprovalStates
      ? 'LEFT JOIN designer_approval_states das ON das.task_id = t.id AND das.agency_id = t.agency_id'
      : '';
    const unassignedRows = db.prepare(`
      SELECT t.id, t.parent_task_id, t.client_id, t.title, t.status, t.workflow_stage, t.approval_status,
             t.direction_status, t.client_status, t.direction_feedback, t.client_feedback,
             t.due_date, t.updated_at, t.created_at, c.name AS client_name, ${approvalColumns}
      FROM tasks t
      LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
      LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
      ${approvalJoin}
      WHERE t.agency_id = ?
        AND COALESCE(t.is_backlog, 0) = 0 AND COALESCE(p.is_backlog, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
        AND (t.client_id IS NULL OR c.status = 'active')
        AND t.status != 'posted'
        AND t.assignee_id IS NULL AND p.assignee_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM task_assignees tap WHERE tap.task_id = t.parent_task_id)
        ${requestedClientId ? 'AND t.client_id = ?' : ''}
    `).all(agencyId, ...(requestedClientId ? [requestedClientId] : []));

    unassignedRows.forEach((row) => {
      const phase = phaseOf(row).phase;
      if (!['todo', 'in_progress', 'correction'].includes(phase)) return;
      const dueDate = toDay(row.due_date);
      const idleDays = Math.max(0, daysBetween(toDay(row.updated_at) || toDay(row.created_at) || todayDay, todayDay));
      const lateDays = dueDate && dueDate < todayDay ? daysBetween(dueDate, todayDay) : 0;
      const needsAttention = lateDays > 0 || dueDate === todayDay || dueDate === tomorrow || idleDays >= 2 || phase === 'correction';
      if (!needsAttention) return;
      const severity = lateDays > 0 || phase === 'correction' ? 3 : (dueDate === todayDay || idleDays >= 4 ? 2 : 1);
      pushAlert({
        entity_type: 'task', entity_id: row.id, signal: 'unassigned', area: 'Operação',
        title: row.title, client_id: row.client_id, client_name: row.client_name || 'Interno',
        message: lateDays > 0 ? `Sem responsável e atrasada há ${lateDays}d.` : `Sem responsável${idleDays ? ` há ${idleDays}d` : ''}.`,
        action: 'Definir responsável', link: `/designer?task_id=${row.parent_task_id || row.id}`,
        severity, age_days: idleDays, due_date: dueDate,
      });
    });

    // Peça aprovada pelo cliente, mas sem data de publicação.
    if (canSeeSocial) {
      const undatedRows = db.prepare(`
        SELECT t.id, t.parent_task_id, t.client_id, t.title, t.updated_at, t.client_at, c.name AS client_name
        FROM tasks t
        LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
        LEFT JOIN clients c ON c.id = COALESCE(t.client_id, p.client_id) AND c.agency_id = t.agency_id
        WHERE t.agency_id = ?
          AND COALESCE(t.is_backlog, 0) = 0 AND COALESCE(p.is_backlog, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
          AND t.task_type != 'video'
          AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
          AND (t.client_status = 'approved' OR t.approval_status = 'approved')
          AND t.workflow_stage = 'approved'
          AND t.due_date IS NULL
          AND (t.client_id IS NULL OR c.status = 'active')
          ${requestedClientId ? 'AND COALESCE(t.client_id, p.client_id) = ?' : ''}
      `).all(agencyId, ...(requestedClientId ? [requestedClientId] : []));
      undatedRows.forEach((row) => {
        const age = Math.max(0, daysBetween(toDay(row.client_at) || toDay(row.updated_at) || todayDay, todayDay));
        pushAlert({
          entity_type: 'task', entity_id: row.id, signal: 'approved_undated', area: 'Agendamento',
          title: row.title, client_id: row.client_id, client_name: row.client_name || 'Interno',
          message: age ? `Aprovada há ${age}d e ainda sem data.` : 'Aprovada e ainda sem data de publicação.',
          action: 'Definir data', link: '/agendamento', severity: age >= 3 ? 2 : 1, age_days: age,
        });
      });
    }
  }

  // Audiovisual de gestão: vídeo pronto parado, sem editor ou publicação que venceu.
  if (isManager && canSeeAudiovisual) {
    const videoRows = db.prepare(`
      SELECT v.id, v.client_id, v.title, v.status, v.editor_user_id, v.updated_at, v.created_at,
             c.name AS client_name,
             MIN(CASE WHEN s.status != 'cancelled' THEN s.scheduled_at END) AS scheduled_at,
             MAX(CASE WHEN s.status = 'posted' THEN 1 ELSE 0 END) AS schedule_posted
      FROM audiovisual_videos v
      JOIN clients c ON c.id = v.client_id AND c.agency_id = v.agency_id
      LEFT JOIN audiovisual_video_schedules s ON s.video_id = v.id AND s.agency_id = v.agency_id
      WHERE v.agency_id = ? AND c.status = 'active' AND v.status != 'posted'
        ${requestedClientId ? 'AND v.client_id = ?' : ''}
      GROUP BY v.id
    `).all(agencyId, ...(requestedClientId ? [requestedClientId] : []));

    videoRows.forEach((row) => {
      const idleDays = Math.max(0, daysBetween(toDay(row.updated_at) || toDay(row.created_at) || todayDay, todayDay));
      const scheduleDay = toDay(row.scheduled_at);
      if (['recorded', 'editing'].includes(row.status) && !row.editor_user_id && idleDays >= 2) {
        pushAlert({
          entity_type: 'video', entity_id: row.id, signal: 'video_unassigned', area: 'Audiovisual',
          title: row.title, client_id: row.client_id, client_name: row.client_name,
          message: `Vídeo sem editor há ${idleDays}d.`, action: 'Definir editor', link: '/audiovisual',
          severity: idleDays >= 5 ? 3 : 2, age_days: idleDays,
        });
        return;
      }
      if (['edited', 'approved'].includes(row.status) && idleDays >= 2) {
        pushAlert({
          entity_type: 'video', entity_id: row.id, signal: 'video_ready', area: 'Audiovisual',
          title: row.title, client_id: row.client_id, client_name: row.client_name,
          message: `Vídeo pronto há ${idleDays}d e ainda não avançou.`, action: 'Dar próximo passo', link: '/audiovisual',
          severity: idleDays >= 5 ? 3 : 2, age_days: idleDays,
        });
      }
      if (['dated', 'scheduled'].includes(row.status) && scheduleDay && !Number(row.schedule_posted)) {
        if (scheduleDay < todayDay) {
          const late = daysBetween(scheduleDay, todayDay);
          pushAlert({
            entity_type: 'video', entity_id: row.id, signal: 'video_publish_overdue', area: 'Audiovisual',
            title: row.title, client_id: row.client_id, client_name: row.client_name,
            message: `Era para publicar há ${late}d.`, action: 'Checar publicação', link: '/audiovisual',
            severity: 3, age_days: late, schedule_date: scheduleDay,
          });
        } else if (scheduleDay === todayDay) {
          pushAlert({
            entity_type: 'video', entity_id: row.id, signal: 'video_publish_today', area: 'Audiovisual',
            title: row.title, client_id: row.client_id, client_name: row.client_name,
            message: 'Publicação prevista para hoje.', action: 'Publicar', link: '/audiovisual',
            severity: 2, schedule_date: scheduleDay, group: 'today',
          });
        }
      }
    });
  }

  const alerts = [...byEntity.values()].map((alert) => ({ ...alert, group: alert.group || groupForAlert(alert, todayDay) })).sort(sortAlerts);
  const summary = summarizeAlerts(alerts);
  return {
    generated_at: new Date().toISOString(),
    today: todayDay,
    tomorrow,
    summary,
    groups: {
      urgent: alerts.filter((item) => item.group === 'urgent'),
      today: alerts.filter((item) => item.group === 'today'),
      attention: alerts.filter((item) => item.group === 'attention'),
      waiting: alerts.filter((item) => item.group === 'waiting'),
    },
    alerts: alerts.slice(0, 160),
  };
}

module.exports = { buildSmartAlerts, sortAlerts, summarizeAlerts, groupForAlert };
