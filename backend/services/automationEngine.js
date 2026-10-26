const { phaseOf, daysBetween, addDays } = require('./managerDashboard');
const { todayInFortaleza } = require('./myWork');

const RULE_DEFINITIONS = [
  {
    key: 'correction_open',
    label: 'Correção voltou',
    eyebrow: 'Correção',
    description: 'Avisa quem precisa agir quando uma peça entra em correção e continua aberta.',
    trigger: 'Peça em correção',
    recipients: 'Responsáveis pela demanda',
    default_cooldown_hours: 12,
  },
  {
    key: 'due_tomorrow',
    label: 'Prazo amanhã',
    eyebrow: 'Prazo',
    description: 'Lembra a pessoa responsável um dia antes do vencimento de uma demanda ainda aberta.',
    trigger: 'Prazo = amanhã',
    recipients: 'Responsáveis pela demanda',
    default_cooldown_hours: 20,
  },
  {
    key: 'client_waiting',
    label: 'Cliente parado',
    eyebrow: 'Aprovação',
    description: 'Sinaliza quando uma peça está com o cliente há pelo menos 2 dias sem resposta.',
    trigger: 'Cliente sem resposta ≥ 2 dias',
    recipients: 'Responsável pelo cliente + operação',
    default_cooldown_hours: 24,
  },
  {
    key: 'approved_undated',
    label: 'Aprovou e parou',
    eyebrow: 'Agendamento',
    description: 'Cobra o próximo passo quando uma peça foi aprovada, mas continua sem data de publicação.',
    trigger: 'Aprovada e sem data',
    recipients: 'Responsável pelo cliente + operação',
    default_cooldown_hours: 24,
  },
  {
    key: 'video_stalled',
    label: 'Vídeo pedindo próximo passo',
    eyebrow: 'Audiovisual',
    description: 'Avisa quando um vídeo fica sem editor ou pronto sem avançar por pelo menos 2 dias.',
    trigger: 'Audiovisual parado ≥ 2 dias',
    recipients: 'Editor / responsável + operação',
    default_cooldown_hours: 24,
  },
];

const RULE_MAP = new Map(RULE_DEFINITIONS.map((rule) => [rule.key, rule]));
const MAX_DELIVERIES_PER_AGENCY_RUN = 40;
const MAX_CANDIDATES_PER_RULE = 80;
const activeAgencyRuns = new Set();
let sweepRunning = false;

function cleanText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map((value) => Number(value || 0)).filter((value) => value > 0))];
}

function normalizeCooldown(value, fallback = 24) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(4, Math.min(168, Math.round(n)));
}

function ensureAutomationRules(db, agencyId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO automation_rules (agency_id, rule_key, enabled, cooldown_hours)
    VALUES (?, ?, 1, ?)
  `);
  RULE_DEFINITIONS.forEach((rule) => insert.run(Number(agencyId), rule.key, rule.default_cooldown_hours));
}

function loadRuleSettings(db, agencyId) {
  ensureAutomationRules(db, agencyId);
  const rows = db.prepare(`
    SELECT rule_key, enabled, cooldown_hours, updated_at
    FROM automation_rules
    WHERE agency_id = ?
  `).all(Number(agencyId));
  const settings = new Map(rows.map((row) => [row.rule_key, row]));
  return RULE_DEFINITIONS.map((definition) => {
    const row = settings.get(definition.key) || {};
    return {
      ...definition,
      enabled: Number(row.enabled ?? 1) === 1,
      cooldown_hours: normalizeCooldown(row.cooldown_hours, definition.default_cooldown_hours),
      updated_at: row.updated_at || null,
    };
  });
}

function canManageAutomations(user) {
  return Boolean(user && (user.role === 'admin' || Number(user.is_operations_head) === 1));
}

function loadInternalUsers(db, agencyId) {
  const hasCustomRole = db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'custom_role_id');
  const rows = db.prepare(`
    SELECT id, agency_id, name, email, role, client_id, is_platform_owner, is_agency_owner,
           is_operations_head, is_commercial_team, ${hasCustomRole ? 'custom_role_id' : 'NULL AS custom_role_id'}
    FROM users
    WHERE agency_id = ? AND role != 'client'
    ORDER BY CASE WHEN role = 'admin' THEN 0 WHEN is_operations_head = 1 THEN 1 ELSE 2 END, name
  `).all(Number(agencyId));
  return rows;
}

function permissionForRule(ruleKey) {
  if (ruleKey === 'video_stalled') return 'audiovisual.view';
  if (ruleKey === 'approved_undated') return ['social.view', 'tasks.view'];
  return 'tasks.view';
}

function userCanReceiveRule(user, ruleKey) {
  // Lazy require mantém as funções puras deste módulo testáveis sem abrir o banco.
  const { hasPermission } = require('./permissions');
  const permission = permissionForRule(ruleKey);
  if (Array.isArray(permission)) return permission.some((key) => hasPermission(user, key));
  return hasPermission(user, permission);
}

function taskAssigneeMap(db, agencyId) {
  const map = new Map();
  const add = (taskId, userId) => {
    const task = Number(taskId || 0);
    const user = Number(userId || 0);
    if (!task || !user) return;
    if (!map.has(task)) map.set(task, new Set());
    map.get(task).add(user);
  };
  db.prepare(`SELECT id, assignee_id, parent_task_id FROM tasks WHERE agency_id = ?`).all(Number(agencyId)).forEach((row) => {
    add(row.id, row.assignee_id);
  });
  db.prepare(`
    SELECT ta.task_id, ta.user_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.agency_id = ?
  `).all(Number(agencyId)).forEach((row) => add(row.task_id, row.user_id));
  return map;
}

function collectTaskRecipients(row, assigneeMap, fallbackIds = []) {
  const direct = [
    ...(assigneeMap.get(Number(row.id)) || []),
    ...(assigneeMap.get(Number(row.parent_task_id || 0)) || []),
    Number(row.assignee_id || 0),
    Number(row.parent_assignee_id || 0),
  ];
  const owners = uniqueNumbers(direct);
  if (owners.length) return owners;
  if (Number(row.client_responsible_id || 0) > 0) return [Number(row.client_responsible_id)];
  return uniqueNumbers(fallbackIds);
}

function getOpsRecipients(users) {
  const heads = users.filter((user) => Number(user.is_operations_head) === 1).map((user) => user.id);
  if (heads.length) return uniqueNumbers(heads);
  return uniqueNumbers(users.filter((user) => user.role === 'admin').map((user) => user.id));
}

function readApprovalSupport(db) {
  const exists = Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'designer_approval_states'`).get());
  return {
    columns: exists
      ? `das.direction_status AS das_direction, das.client_status AS das_client, das.direction_feedback AS das_direction_feedback, das.client_feedback AS das_client_feedback`
      : `NULL AS das_direction, NULL AS das_client, NULL AS das_direction_feedback, NULL AS das_client_feedback`,
    join: exists ? `LEFT JOIN designer_approval_states das ON das.task_id = t.id AND das.agency_id = t.agency_id` : '',
  };
}

function buildTaskCandidates(db, { agencyId, today, internalUsers }) {
  const todayDay = toDay(today) || todayInFortaleza();
  const tomorrow = addDays(todayDay, 1);
  const approval = readApprovalSupport(db);
  const rows = db.prepare(`
    SELECT t.id, t.parent_task_id, t.client_id, t.assignee_id, t.title, t.task_type, t.status,
           t.workflow_stage, t.approval_status, t.direction_status, t.client_status,
           t.direction_feedback, t.client_feedback, t.due_date, t.updated_at, t.created_at,
           t.front_name, p.assignee_id AS parent_assignee_id,
           c.name AS client_name, c.responsible_user_id AS client_responsible_id,
           ${approval.columns}
    FROM tasks t
    LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
    LEFT JOIN clients c ON c.id = COALESCE(t.client_id, p.client_id) AND c.agency_id = t.agency_id
    ${approval.join}
    WHERE t.agency_id = ?
      AND COALESCE(t.is_backlog, 0) = 0
      AND COALESCE(p.is_backlog, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
      AND (COALESCE(t.client_id, p.client_id) IS NULL OR c.status = 'active')
      AND t.status != 'posted'
  `).all(Number(agencyId));

  const assignees = taskAssigneeMap(db, agencyId);
  const opsRecipients = getOpsRecipients(internalUsers);
  const candidates = [];

  rows.forEach((row) => {
    const phase = phaseOf(row);
    const idleDays = Math.max(0, daysBetween(toDay(row.updated_at) || toDay(row.created_at) || todayDay, todayDay));
    const clientName = row.client_name || 'Interno';
    const clientId = Number(row.client_id || 0) || null;
    const ownerRecipients = collectTaskRecipients(row, assignees, opsRecipients);

    if (phase.phase === 'correction') {
      candidates.push({
        rule_key: 'correction_open', entity_type: 'task', entity_id: Number(row.id), client_id: clientId,
        client_name: clientName, recipients: ownerRecipients,
        title: `Correção voltou — ${clientName}`,
        message: cleanText(`${row.title}${phase.feedback ? ` • ${phase.feedback}` : ` • Correção pedida pelo ${phase.source || 'time'}.`}`),
        link: `/designer?task_id=${row.parent_task_id || row.id}`,
        age_days: idleDays,
      });
    }

    const dueDay = toDay(row.due_date);
    if (dueDay === tomorrow && ['todo', 'in_progress', 'approval_direction', 'approval_held', 'approval_client'].includes(phase.phase)) {
      candidates.push({
        rule_key: 'due_tomorrow', entity_type: 'task', entity_id: Number(row.id), client_id: clientId,
        client_name: clientName, recipients: ownerRecipients,
        title: `Vence amanhã — ${clientName}`,
        message: cleanText(`${row.title} está no seu radar para amanhã.`),
        link: `/designer?task_id=${row.parent_task_id || row.id}`,
        age_days: idleDays,
      });
    }

    if (phase.phase === 'approval_client' && idleDays >= 2) {
      const recipients = uniqueNumbers([Number(row.client_responsible_id || 0), ...opsRecipients]);
      candidates.push({
        rule_key: 'client_waiting', entity_type: 'task', entity_id: Number(row.id), client_id: clientId,
        client_name: clientName, recipients,
        title: `Cliente parado — ${clientName}`,
        message: cleanText(`${row.title} aguarda resposta do cliente há ${idleDays} dia${idleDays === 1 ? '' : 's'}.`),
        link: '/aprovacao', age_days: idleDays,
      });
    }

    const rawStage = String(row.workflow_stage || '').trim();
    const explicitlyApproved = rawStage === 'approved' || row.client_status === 'approved' || row.approval_status === 'approved';
    const nonPublishingArea = String(row.front_name || '').trim().toLocaleLowerCase('pt-BR') === 'site/lp';
    if (phase.phase === 'ready' && explicitlyApproved && !dueDay && row.task_type !== 'video' && !nonPublishingArea) {
      const recipients = uniqueNumbers([Number(row.client_responsible_id || 0), ...opsRecipients]);
      candidates.push({
        rule_key: 'approved_undated', entity_type: 'task', entity_id: Number(row.id), client_id: clientId,
        client_name: clientName, recipients,
        title: `Aprovou e parou — ${clientName}`,
        message: cleanText(`${row.title} está aprovada${idleDays ? ` há ${idleDays} dia${idleDays === 1 ? '' : 's'}` : ''} e ainda sem data de publicação.`),
        link: '/agendamento', age_days: idleDays,
      });
    }
  });

  return candidates;
}

function buildVideoCandidates(db, { agencyId, today, internalUsers }) {
  const todayDay = toDay(today) || todayInFortaleza();
  const opsRecipients = getOpsRecipients(internalUsers);
  const rows = db.prepare(`
    SELECT v.id, v.client_id, v.title, v.status, v.editor_user_id, v.updated_at, v.created_at,
           c.name AS client_name, c.responsible_user_id AS client_responsible_id,
           MIN(CASE WHEN s.status != 'cancelled' THEN s.scheduled_at END) AS scheduled_at
    FROM audiovisual_videos v
    JOIN clients c ON c.id = v.client_id AND c.agency_id = v.agency_id
    LEFT JOIN audiovisual_video_schedules s ON s.video_id = v.id AND s.agency_id = v.agency_id
    WHERE v.agency_id = ? AND c.status = 'active' AND v.status != 'posted'
    GROUP BY v.id
  `).all(Number(agencyId));

  const candidates = [];
  rows.forEach((row) => {
    const idleDays = Math.max(0, daysBetween(toDay(row.updated_at) || toDay(row.created_at) || todayDay, todayDay));
    if (idleDays < 2) return;
    let message = null;
    let recipients = [];
    if (['recorded', 'editing'].includes(row.status) && !Number(row.editor_user_id || 0)) {
      message = `${row.title} está sem editor há ${idleDays} dia${idleDays === 1 ? '' : 's'}.`;
      recipients = uniqueNumbers([Number(row.client_responsible_id || 0), ...opsRecipients]);
    } else if (['edited', 'approved'].includes(row.status) && !row.scheduled_at) {
      message = `${row.title} está pronto há ${idleDays} dia${idleDays === 1 ? '' : 's'} e ainda não avançou.`;
      recipients = uniqueNumbers([Number(row.editor_user_id || 0), Number(row.client_responsible_id || 0), ...opsRecipients]);
    }
    if (!message) return;
    candidates.push({
      rule_key: 'video_stalled', entity_type: 'video', entity_id: Number(row.id), client_id: Number(row.client_id),
      client_name: row.client_name || 'Cliente', recipients,
      title: `Vídeo pedindo próximo passo — ${row.client_name || 'Cliente'}`,
      message: cleanText(message), link: '/audiovisual', age_days: idleDays,
    });
  });
  return candidates;
}

function filterCandidatesForRules(candidates, ruleSettings) {
  const enabled = new Map(ruleSettings.map((rule) => [rule.key, rule]));
  const grouped = new Map();
  candidates.forEach((candidate) => {
    const setting = enabled.get(candidate.rule_key);
    if (!setting?.enabled) return;
    if (!grouped.has(candidate.rule_key)) grouped.set(candidate.rule_key, []);
    grouped.get(candidate.rule_key).push(candidate);
  });
  const result = [];
  RULE_DEFINITIONS.forEach((definition) => {
    const list = grouped.get(definition.key) || [];
    list.sort((a, b) => Number(b.age_days || 0) - Number(a.age_days || 0) || Number(a.entity_id) - Number(b.entity_id));
    result.push(...list.slice(0, MAX_CANDIDATES_PER_RULE));
  });
  return result;
}

function recentlyDelivered(db, { agencyId, ruleKey, userId, entityType, entityId, cooldownHours }) {
  const modifier = `-${normalizeCooldown(cooldownHours)} hours`;
  return Boolean(db.prepare(`
    SELECT 1
    FROM automation_deliveries
    WHERE agency_id = ? AND rule_key = ? AND user_id = ?
      AND COALESCE(entity_type, '') = COALESCE(?, '')
      AND COALESCE(entity_id, 0) = COALESCE(?, 0)
      AND datetime(sent_at) >= datetime('now', ?)
    ORDER BY id DESC
    LIMIT 1
  `).get(Number(agencyId), ruleKey, Number(userId), entityType || null, Number(entityId || 0) || null, modifier));
}

function insertDelivery(db, { agencyId, ruleKey, userId, candidate }) {
  const insert = db.transaction(() => {
    const notification = db.prepare(`
      INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id, link)
      VALUES (?, ?, 'automation', ?, ?, ?, ?, ?)
    `).run(
      Number(agencyId), Number(userId), candidate.title, candidate.message,
      candidate.entity_type || null, Number(candidate.entity_id || 0) || null, candidate.link || null
    );
    db.prepare(`
      INSERT INTO automation_deliveries
        (agency_id, rule_key, user_id, client_id, entity_type, entity_id, notification_id, title, message, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(agencyId), ruleKey, Number(userId), Number(candidate.client_id || 0) || null,
      candidate.entity_type || null, Number(candidate.entity_id || 0) || null, Number(notification.lastInsertRowid),
      candidate.title, candidate.message, candidate.link || null
    );
    return Number(notification.lastInsertRowid);
  });
  return insert();
}

function summarizeRunDetails(ruleSettings, candidates, deliveries) {
  const counts = {};
  ruleSettings.forEach((rule) => {
    counts[rule.key] = {
      enabled: rule.enabled,
      candidates: candidates.filter((candidate) => candidate.rule_key === rule.key).length,
      delivered: deliveries.filter((delivery) => delivery.rule_key === rule.key).length,
    };
  });
  return counts;
}

async function runAutomationCycle(db, { agencyId, triggerType = 'scheduled', actorUserId = null, today = null } = {}) {
  const agency = Number(agencyId || 0);
  if (!agency) throw new Error('agencyId obrigatório');
  if (activeAgencyRuns.has(agency)) return { skipped: true, reason: 'already_running', agency_id: agency };
  activeAgencyRuns.add(agency);

  const runInfo = db.prepare(`
    INSERT INTO automation_runs (agency_id, trigger_type, status, actor_user_id)
    VALUES (?, ?, 'running', ?)
  `).run(agency, triggerType, Number(actorUserId || 0) || null);
  const runId = Number(runInfo.lastInsertRowid);

  try {
    const ruleSettings = loadRuleSettings(db, agency);
    const users = loadInternalUsers(db, agency);
    const userMap = new Map(users.map((user) => [Number(user.id), user]));
    const todayDay = toDay(today) || todayInFortaleza();
    const candidates = filterCandidatesForRules([
      ...buildTaskCandidates(db, { agencyId: agency, today: todayDay, internalUsers: users }),
      ...buildVideoCandidates(db, { agencyId: agency, today: todayDay, internalUsers: users }),
    ], ruleSettings);
    const settingMap = new Map(ruleSettings.map((rule) => [rule.key, rule]));
    const deliveries = [];

    for (const candidate of candidates) {
      if (deliveries.length >= MAX_DELIVERIES_PER_AGENCY_RUN) break;
      const setting = settingMap.get(candidate.rule_key);
      if (!setting?.enabled) continue;
      const recipients = uniqueNumbers(candidate.recipients).filter((userId) => {
        const user = userMap.get(userId);
        return user && userCanReceiveRule(user, candidate.rule_key);
      });
      for (const userId of recipients) {
        if (deliveries.length >= MAX_DELIVERIES_PER_AGENCY_RUN) break;
        if (recentlyDelivered(db, {
          agencyId: agency,
          ruleKey: candidate.rule_key,
          userId,
          entityType: candidate.entity_type,
          entityId: candidate.entity_id,
          cooldownHours: setting.cooldown_hours,
        })) continue;
        const notificationId = insertDelivery(db, { agencyId: agency, ruleKey: candidate.rule_key, userId, candidate });
        deliveries.push({ rule_key: candidate.rule_key, user_id: userId, entity_type: candidate.entity_type, entity_id: candidate.entity_id, notification_id: notificationId });
      }
    }

    const details = summarizeRunDetails(ruleSettings, candidates, deliveries);
    db.prepare(`
      UPDATE automation_runs
      SET status = 'completed', candidates = ?, notifications_created = ?, scanned_rules = ?,
          finished_at = datetime('now'), details_json = ?
      WHERE id = ?
    `).run(candidates.length, deliveries.length, ruleSettings.filter((rule) => rule.enabled).length, JSON.stringify(details), runId);

    return {
      run_id: runId,
      agency_id: agency,
      today: todayDay,
      candidates: candidates.length,
      notifications_created: deliveries.length,
      enabled_rules: ruleSettings.filter((rule) => rule.enabled).length,
      details,
    };
  } catch (error) {
    db.prepare(`
      UPDATE automation_runs
      SET status = 'failed', finished_at = datetime('now'), error_message = ?
      WHERE id = ?
    `).run(cleanText(error?.message || error, 500), runId);
    throw error;
  } finally {
    activeAgencyRuns.delete(agency);
  }
}

async function runAutomationSweep(db, { triggerType = 'scheduled' } = {}) {
  if (sweepRunning) return { skipped: true, reason: 'sweep_running' };
  sweepRunning = true;
  try {
    const agencies = db.prepare(`SELECT id FROM agencies WHERE status = 'active' ORDER BY id`).all();
    const results = [];
    for (const agency of agencies) {
      try {
        results.push(await runAutomationCycle(db, { agencyId: agency.id, triggerType }));
      } catch (error) {
        results.push({ agency_id: Number(agency.id), error: cleanText(error?.message || error, 300) });
      }
    }
    return { agencies: results.length, results };
  } finally {
    sweepRunning = false;
  }
}

function getAutomationOverview(db, agencyId) {
  const agency = Number(agencyId);
  const rules = loadRuleSettings(db, agency);
  const lastRun = db.prepare(`
    SELECT id, trigger_type, status, candidates, notifications_created, scanned_rules,
           started_at, finished_at, error_message
    FROM automation_runs
    WHERE agency_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(agency) || null;
  const sent7d = Number(db.prepare(`
    SELECT COUNT(*) AS total FROM automation_deliveries
    WHERE agency_id = ? AND datetime(sent_at) >= datetime('now', '-7 days')
  `).get(agency)?.total || 0);
  const sent24h = Number(db.prepare(`
    SELECT COUNT(*) AS total FROM automation_deliveries
    WHERE agency_id = ? AND datetime(sent_at) >= datetime('now', '-24 hours')
  `).get(agency)?.total || 0);
  const recentRuns = db.prepare(`
    SELECT id, trigger_type, status, candidates, notifications_created, scanned_rules,
           started_at, finished_at, error_message
    FROM automation_runs
    WHERE agency_id = ?
    ORDER BY id DESC
    LIMIT 12
  `).all(agency);
  const recentDeliveries = db.prepare(`
    SELECT d.id, d.rule_key, d.user_id, d.client_id, d.entity_type, d.entity_id, d.title, d.message,
           d.link, d.sent_at, u.name AS user_name, c.name AS client_name
    FROM automation_deliveries d
    JOIN users u ON u.id = d.user_id AND u.agency_id = d.agency_id
    LEFT JOIN clients c ON c.id = d.client_id AND c.agency_id = d.agency_id
    WHERE d.agency_id = ?
    ORDER BY d.id DESC
    LIMIT 30
  `).all(agency);
  return {
    rules,
    summary: {
      active_rules: rules.filter((rule) => rule.enabled).length,
      total_rules: rules.length,
      sent_24h: sent24h,
      sent_7d: sent7d,
      last_run: lastRun,
    },
    recent_runs: recentRuns,
    recent_deliveries: recentDeliveries,
  };
}

module.exports = {
  RULE_DEFINITIONS,
  RULE_MAP,
  MAX_DELIVERIES_PER_AGENCY_RUN,
  normalizeCooldown,
  uniqueNumbers,
  canManageAutomations,
  ensureAutomationRules,
  loadRuleSettings,
  filterCandidatesForRules,
  summarizeRunDetails,
  runAutomationCycle,
  runAutomationSweep,
  getAutomationOverview,
};
