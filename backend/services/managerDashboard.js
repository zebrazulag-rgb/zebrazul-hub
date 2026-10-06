// Painel do Gestor: transforma tarefas, aprovações e clientes em "o que exige decisão agora".
// Função pura sobre o banco (somente leitura). Sem tabelas novas, sem escrita.
//
// Unidade de análise: a "peça de trabalho" = tarefa SEM subtarefas (folha) ou a própria subtarefa.
// Tarefas-mãe que têm subtarefas ficam de fora para não contar a mesma demanda duas vezes.

const DAY_MS = 86400000;
const DEFAULTS = { stalledDays: 3, abandonedDays: 30, clientWaitDays: 2, windowDays: 7 };

function toDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dayNumber(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function daysBetween(fromDay, toDayValue) {
  if (!fromDay || !toDayValue) return 0;
  return dayNumber(toDayValue) - dayNumber(fromDay);
}

function addDays(day, amount) {
  const date = new Date((dayNumber(day) + amount) * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function normalizeStage(stage) {
  if (stage === 'internal_approval' || stage === 'external_approval') return 'approval';
  return stage;
}

function stageFromLegacy(status) {
  if (status === 'posted') return 'posted';
  if (status === 'done') return 'approved';
  if (status === 'in_progress') return 'in_progress';
  return 'todo';
}

// Fase atual da peça, espelhando as regras de aprovação usadas em routes/tasks.js.
function phaseOf(row) {
  const rawStage = row.workflow_stage || stageFromLegacy(row.status);
  const stage = normalizeStage(rawStage);
  if (row.status === 'posted' || stage === 'posted') return { phase: 'posted' };

  let direction = row.direction_status && row.direction_status !== 'pending'
    ? row.direction_status
    : (row.das_direction || row.direction_status || 'pending');
  let client = row.client_status && row.client_status !== 'waiting'
    ? row.client_status
    : (row.das_client || row.client_status || 'waiting');

  const legacyApproval = row.approval_status;
  if ((legacyApproval === 'pending_approval' || legacyApproval === 'send' || rawStage === 'external_approval')
    && direction === 'pending') {
    direction = 'approved';
    client = 'pending';
  }

  const changesRequested = direction === 'changes_requested' || client === 'changes_requested'
    || legacyApproval === 'changes_requested';
  if (stage === 'correction' || (changesRequested && ['approval', 'in_progress', 'todo'].includes(stage))) {
    return {
      phase: 'correction',
      source: client === 'changes_requested' ? 'cliente' : 'direção',
      feedback: client === 'changes_requested'
        ? (row.client_feedback || row.das_client_feedback)
        : (row.direction_feedback || row.das_direction_feedback),
    };
  }

  if (stage === 'approval') {
    if (direction !== 'approved') return { phase: 'approval_direction' };
    if (client === 'approved') return { phase: 'ready' };
    return { phase: 'approval_client' };
  }
  if (stage === 'approved' || stage === 'scheduled') return { phase: 'ready', scheduled: stage === 'scheduled' };
  if (stage === 'in_progress') return { phase: 'in_progress' };
  return { phase: 'todo' };
}

const OPEN_PHASES = new Set(['todo', 'in_progress', 'correction', 'approval_direction', 'approval_client']);

function excerpt(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function buildManagerDashboard(db, { agencyId, today, options = {} } = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const todayDay = toDay(today) || new Date().toISOString().slice(0, 10);
  const windowEnd = addDays(todayDay, cfg.windowDays - 1);
  const postedCutoff = addDays(todayDay, -30);
  const agency = Number(agencyId);

  // A tabela de aprovações é criada sob demanda; se ainda não existir, seguimos sem ela.
  const hasApprovalStates = Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'designer_approval_states'`).get());
  const approvalColumns = hasApprovalStates
    ? `das.direction_status AS das_direction, das.client_status AS das_client,
           das.direction_feedback AS das_direction_feedback, das.client_feedback AS das_client_feedback`
    : `NULL AS das_direction, NULL AS das_client, NULL AS das_direction_feedback, NULL AS das_client_feedback`;
  const approvalJoin = hasApprovalStates
    ? 'LEFT JOIN designer_approval_states das ON das.task_id = t.id AND das.agency_id = t.agency_id'
    : '';

  const rows = db.prepare(`
    SELECT t.id, t.parent_task_id, t.client_id, t.title, t.task_type, t.status, t.workflow_stage,
           t.approval_status, t.direction_status, t.client_status, t.direction_feedback, t.client_feedback,
           t.due_date, t.updated_at, t.created_at,
           c.name AS client_name, c.status AS client_state,
           p.title AS parent_title,
           ${approvalColumns}
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
    ${approvalJoin}
    WHERE t.agency_id = ?
      AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
      AND (t.client_id IS NULL OR c.status = 'active')
      AND (t.status != 'posted' OR substr(COALESCE(t.due_date, t.updated_at), 1, 10) >= ?)
  `).all(agency, postedCutoff);

  // Responsáveis: da própria peça ou, se não houver, herdados da tarefa-mãe.
  const ids = [...new Set(rows.flatMap((r) => [r.id, r.parent_task_id]).filter(Boolean))];
  const assigneeMap = new Map();
  if (ids.length) {
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      db.prepare(`
        SELECT ta.task_id, u.id, u.name, u.avatar_color
        FROM task_assignees ta JOIN users u ON u.id = ta.user_id
        WHERE u.agency_id = ? AND ta.task_id IN (${chunk.map(() => '?').join(',')})
        ORDER BY u.name
      `).all(agency, ...chunk).forEach((a) => {
        if (!assigneeMap.has(a.task_id)) assigneeMap.set(a.task_id, []);
        assigneeMap.get(a.task_id).push({ id: a.id, name: a.name, avatar_color: a.avatar_color });
      });
    }
  }

  const items = rows.map((row) => {
    const info = phaseOf(row);
    const due = toDay(row.due_date);
    const idle = Math.max(0, daysBetween(toDay(row.updated_at) || toDay(row.created_at), todayDay));
    const open = OPEN_PHASES.has(info.phase);
    const lateDays = open && due && due < todayDay && row.status !== 'done' && row.status !== 'posted'
      ? daysBetween(due, todayDay) : 0;
    const assignees = assigneeMap.get(row.id) || assigneeMap.get(row.parent_task_id) || [];
    return {
      id: row.id,
      parent_task_id: row.parent_task_id || null,
      parent_title: row.parent_title || null,
      title: row.title,
      client_id: row.client_id || null,
      client_name: row.client_name || 'Interno',
      phase: info.phase,
      source: info.source || null,
      feedback: info.feedback ? excerpt(info.feedback) : null,
      scheduled: Boolean(info.scheduled),
      due_date: due,
      idle_days: idle,
      late_days: lateDays,
      open,
      abandoned: open && idle >= cfg.abandonedDays,
      assignees,
    };
  });

  // ---------- Fila de decisões ----------
  const queue = [];
  const abandoned = [];
  items.forEach((item) => {
    if (!item.open) return;
    let type = null;
    let severity = 0;
    let days = 0;
    let detail = '';

    if (item.abandoned) {
      abandoned.push({ ...item, type: 'abandoned', severity: 0, days: item.idle_days, detail: `Sem movimento há ${item.idle_days} dias` });
      return;
    }
    if (item.phase === 'correction') {
      type = 'correction'; severity = 3; days = item.idle_days;
      detail = `Correção pedida pelo ${item.source}${item.idle_days ? ` · há ${plural(item.idle_days, 'dia', 'dias')}` : ''}`;
    } else if (item.late_days > 0) {
      type = 'overdue'; severity = 3; days = item.late_days;
      const where = { approval_direction: 'aguardando sua aprovação', approval_client: 'aguardando o cliente', todo: 'não iniciada', in_progress: 'em andamento' }[item.phase] || '';
      detail = `Atrasada ${plural(item.late_days, 'dia', 'dias')}${where ? ` · ${where}` : ''}`;
    } else if (item.phase === 'approval_direction') {
      type = 'approval_direction'; severity = item.idle_days >= 3 ? 3 : 2; days = item.idle_days;
      detail = item.idle_days ? `Aguardando sua aprovação há ${plural(item.idle_days, 'dia', 'dias')}` : 'Aguardando sua aprovação';
    } else if (item.phase === 'approval_client' && item.idle_days >= cfg.clientWaitDays) {
      type = 'approval_client'; severity = item.idle_days >= 5 ? 3 : 2; days = item.idle_days;
      detail = `Cliente não respondeu há ${plural(item.idle_days, 'dia', 'dias')} · vale cobrar`;
    } else if ((item.phase === 'todo' || item.phase === 'in_progress') && item.idle_days >= cfg.stalledDays) {
      type = 'stalled'; severity = 1; days = item.idle_days;
      detail = `Parada há ${plural(item.idle_days, 'dia', 'dias')} (${item.phase === 'todo' ? 'não iniciada' : 'em andamento'})`;
    }
    if (type) queue.push({ ...item, type, severity, days, detail });
  });
  queue.sort((a, b) => b.severity - a.severity || b.days - a.days || a.id - b.id);
  abandoned.sort((a, b) => b.days - a.days);

  const counts = { correction: 0, overdue: 0, approval_direction: 0, approval_client: 0, stalled: 0 };
  queue.forEach((q) => { counts[q.type] += 1; });

  // ---------- Carga da equipe ----------
  const loadMap = new Map();
  const ensureLoad = (key, name, color) => {
    if (!loadMap.has(key)) loadMap.set(key, { user_id: key === 'none' ? null : key, name, avatar_color: color || '#94a3b8', open: 0, overdue: 0, correction: 0, waiting_approval: 0, due_next_days: 0 });
    return loadMap.get(key);
  };
  items.filter((i) => i.open && !i.abandoned).forEach((item) => {
    const owners = item.assignees.length ? item.assignees : [null];
    owners.forEach((owner) => {
      const entry = owner ? ensureLoad(owner.id, owner.name, owner.avatar_color) : ensureLoad('none', 'Sem responsável', '#94a3b8');
      entry.open += 1;
      if (item.late_days > 0) entry.overdue += 1;
      if (item.phase === 'correction') entry.correction += 1;
      if (item.phase === 'approval_direction' || item.phase === 'approval_client') entry.waiting_approval += 1;
      if (item.due_date && item.due_date >= todayDay && item.due_date <= windowEnd) entry.due_next_days += 1;
    });
  });
  const team = [...loadMap.values()].sort((a, b) =>
    (a.user_id === null) - (b.user_id === null)
    || b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, 'pt-BR'));
  // "Sem responsável" sempre no topo quando houver peças, pois é decisão do gestor.
  team.sort((a, b) => (b.user_id === null && b.open > 0) - (a.user_id === null && a.open > 0));

  // ---------- Fluxo ----------
  const phaseOrder = ['todo', 'in_progress', 'correction', 'approval_direction', 'approval_client', 'ready'];
  const funnel = phaseOrder.map((phase) => {
    const list = items.filter((i) => i.phase === phase && !i.abandoned);
    const avg = list.length ? Math.round((list.reduce((s, i) => s + i.idle_days, 0) / list.length) * 10) / 10 : 0;
    return { phase, count: list.length, avg_idle_days: avg };
  });
  const posted7 = items.filter((i) => i.phase === 'posted' && i.due_date && i.due_date > addDays(todayDay, -7) && i.due_date <= todayDay).length;

  // ---------- Saúde dos clientes ----------
  const clientRows = db.prepare(`SELECT id, name, logo_color FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name`).all(agency);
  const lastTaskPost = new Map(db.prepare(`
    SELECT client_id, MAX(substr(due_date, 1, 10)) AS d FROM tasks
    WHERE agency_id = ? AND client_id IS NOT NULL AND status = 'posted' AND due_date IS NOT NULL AND substr(due_date, 1, 10) <= ?
    GROUP BY client_id
  `).all(agency, todayDay).map((r) => [r.client_id, r.d]));
  const lastFeedPost = new Map(db.prepare(`
    SELECT client_id, MAX(substr(scheduled_at, 1, 10)) AS d FROM posts
    WHERE agency_id = ? AND status = 'published' AND scheduled_at IS NOT NULL AND substr(scheduled_at, 1, 10) <= ?
    GROUP BY client_id
  `).all(agency, todayDay).map((r) => [r.client_id, r.d]));

  const byClient = new Map();
  items.forEach((item) => { if (item.client_id) { if (!byClient.has(item.client_id)) byClient.set(item.client_id, []); byClient.get(item.client_id).push(item); } });

  const levelRank = { green: 0, yellow: 1, red: 2 };
  const health = clientRows.map((client) => {
    const list = (byClient.get(client.id) || []).filter((i) => !i.abandoned);
    const windowItems = list.filter((i) => i.due_date && i.due_date >= todayDay && i.due_date <= windowEnd);
    const readyInWindow = windowItems.filter((i) => i.phase === 'ready' || i.phase === 'posted').length;
    const late = list.filter((i) => i.late_days > 0);
    const corrections = list.filter((i) => i.phase === 'correction');
    const waitingClient = list.filter((i) => i.phase === 'approval_client');
    const waitingMax = waitingClient.reduce((m, i) => Math.max(m, i.idle_days), 0);
    const lastPost = [lastTaskPost.get(client.id), lastFeedPost.get(client.id)].filter(Boolean).sort().pop() || null;
    const sincePost = lastPost ? daysBetween(lastPost, todayDay) : null;

    const reasons = [];
    const flag = (level, text) => reasons.push({ level, text });
    if (windowItems.length === 0) {
      flag(sincePost === null || sincePost > 10 ? 'red' : 'yellow', `Nada planejado nos próximos ${cfg.windowDays} dias`);
    } else if (readyInWindow === 0 && windowItems.length >= 2) {
      flag('yellow', `${windowItems.length} peças na semana, nenhuma pronta`);
    }
    if (late.length) {
      const oldest = Math.max(...late.map((i) => i.late_days));
      flag(late.length >= 3 || oldest >= 5 ? 'red' : 'yellow', `${plural(late.length, 'atrasada', 'atrasadas')} (a mais antiga há ${plural(oldest, 'dia', 'dias')})`);
    }
    if (waitingClient.length && waitingMax >= cfg.clientWaitDays) {
      flag(waitingMax >= 5 ? 'red' : 'yellow', `Cliente sem responder há ${plural(waitingMax, 'dia', 'dias')}`);
    }
    if (corrections.length) flag('yellow', `${plural(corrections.length, 'correção aberta', 'correções abertas')}`);

    const level = reasons.reduce((worst, r) => (levelRank[r.level] > levelRank[worst] ? r.level : worst), 'green');
    reasons.sort((a, b) => levelRank[b.level] - levelRank[a.level]);
    return {
      client_id: client.id,
      name: client.name,
      logo_color: client.logo_color,
      level,
      reasons,
      planned_next_days: windowItems.length,
      ready_next_days: readyInWindow,
      late: late.length,
      open: list.length,
      days_since_last_post: sincePost,
    };
  }).sort((a, b) => levelRank[b.level] - levelRank[a.level] || b.late - a.late || a.name.localeCompare(b.name, 'pt-BR'));

  const clientsRed = health.filter((c) => c.level === 'red').length;
  const clientsYellow = health.filter((c) => c.level === 'yellow').length;

  return {
    generated_at: new Date().toISOString(),
    today: todayDay,
    config: { ...cfg },
    summary: {
      decisions: queue.length,
      approval_direction: counts.approval_direction,
      correction: counts.correction,
      overdue: counts.overdue,
      approval_client_waiting: counts.approval_client,
      stalled: counts.stalled,
      abandoned: abandoned.length,
      clients_red: clientsRed,
      clients_yellow: clientsYellow,
      clients_total: health.length,
      posted_last_7_days: posted7,
    },
    queue_counts: counts,
    queue: queue.slice(0, 80),
    queue_total: queue.length,
    abandoned: abandoned.slice(0, 60),
    abandoned_total: abandoned.length,
    clients: health,
    team,
    funnel,
  };
}

module.exports = { buildManagerDashboard, phaseOf, daysBetween, addDays };
