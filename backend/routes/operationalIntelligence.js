const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { inferApprovalState } = require('../utils/workflowState');
const {
  clampDays,
  hoursBetween,
  ageDays,
  average,
  percent,
  stageForTask,
  stageLabel,
  isCorrectionTouched,
  isOnTime,
  demandTypeLabel,
  buildSignals,
} = require('../utils/operationalIntelligence');

const router = express.Router();
router.use(authRequired);

function accessibleClientIds(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.is_operations_head) {
    return db.prepare("SELECT id FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name")
      .all(user.agency_id).map((row) => Number(row.id));
  }
  if (user.role === 'client') return user.client_id ? [Number(user.client_id)] : [];
  return (Array.isArray(user.client_ids) ? user.client_ids : []).map(Number).filter(Boolean);
}

function selectedClientIds(req, res) {
  const available = accessibleClientIds(req.user);
  const requested = Number(req.query.client_id || 0);
  if (requested) {
    if (!canAccessClient(req.user, requested)) {
      res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
      return null;
    }
    return [requested];
  }
  return available;
}

function placeholders(ids) {
  return ids.length ? ids.map(() => '?').join(',') : 'NULL';
}

function parseAssignees(rawIds, rawNames, fallbackId, fallbackName) {
  const ids = String(rawIds || '').split('|').map(Number).filter(Boolean);
  const names = String(rawNames || '').split('|').map((value) => value.trim()).filter(Boolean);
  if (!ids.length && fallbackId) return [{ id: Number(fallbackId), name: fallbackName || 'Responsável' }];
  return ids.map((id, index) => ({ id, name: names[index] || 'Responsável' }));
}

function dateRange(days) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const iso = (date) => date.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

router.get('/', (req, res) => {
  if (req.user?.role === 'client') return res.status(403).json({ error: 'Inteligência operacional é exclusiva da equipe interna.' });

  const days = clampDays(req.query.days);
  const range = dateRange(days);
  const clientIds = selectedClientIds(req, res);
  if (!clientIds) return;

  const agencyId = Number(req.user.agency_id);
  const clientScope = clientIds.length ? `t.client_id IN (${placeholders(clientIds)})` : 't.client_id IS NULL';
  const commonParams = [agencyId, ...clientIds];
  const leafClause = 'COALESCE(t.is_backlog, 0) = 0 AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)';

  const periodTasks = db.prepare(`
    SELECT t.*, c.name AS client_name,
      creator.name AS creator_name,
      (SELECT GROUP_CONCAT(ta.user_id, '|') FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids,
      (SELECT GROUP_CONCAT(u.name, '|') FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id) AS assignee_names
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN users creator ON creator.id = t.created_by
    WHERE t.agency_id = ? AND ${clientScope} AND ${leafClause}
      AND date(t.created_at) BETWEEN date(?) AND date(?)
    ORDER BY t.created_at DESC
  `).all(...commonParams, range.from, range.to);

  const activeTasks = db.prepare(`
    SELECT t.*, c.name AS client_name,
      creator.name AS creator_name,
      (SELECT GROUP_CONCAT(ta.user_id, '|') FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids,
      (SELECT GROUP_CONCAT(u.name, '|') FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id) AS assignee_names
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
    LEFT JOIN users creator ON creator.id = t.created_by
    WHERE t.agency_id = ? AND ${clientScope} AND ${leafClause}
      AND COALESCE(t.workflow_stage, '') <> 'posted' AND COALESCE(t.status, '') <> 'posted'
    ORDER BY COALESCE(t.updated_at, t.created_at) ASC
  `).all(...commonParams).filter((task) => stageForTask(task) !== 'posted');

  const completed = periodTasks.filter((task) => ['approved', 'scheduled', 'posted'].includes(stageForTask(task)));
  const onTimeStates = completed.map(isOnTime).filter((value) => value !== null);
  const onTimeCount = onTimeStates.filter(Boolean).length;
  const correctionTasks = periodTasks.filter(isCorrectionTouched);
  const directionCorrections = periodTasks.filter((task) => {
    const state = inferApprovalState(task);
    return Boolean(String(task.direction_feedback || '').trim() || state.directionStatus === 'changes_requested');
  }).length;
  const clientCorrections = periodTasks.filter((task) => {
    const state = inferApprovalState(task);
    return Boolean(String(task.client_feedback || '').trim() || state.clientStatus === 'changes_requested');
  }).length;
  const now = Date.now();
  const overdueOpen = activeTasks.filter((task) => task.due_date && new Date(`${String(task.due_date).slice(0, 10)}T23:59:59`).getTime() < now && !['approved', 'scheduled', 'posted'].includes(stageForTask(task))).length;

  const approvalDirectionHours = periodTasks.map((task) => hoursBetween(task.created_at, task.direction_at)).filter((value) => value != null);
  const approvalClientHours = periodTasks.map((task) => hoursBetween(task.direction_at, task.client_at)).filter((value) => value != null);
  const approvalTotalHours = periodTasks.map((task) => hoursBetween(task.created_at, task.client_at)).filter((value) => value != null);

  const stageMap = new Map();
  activeTasks.forEach((task) => {
    const stage = stageForTask(task);
    if (stage === 'posted') return;
    if (!stageMap.has(stage)) stageMap.set(stage, { stage, label: stageLabel(stage), count: 0, idle: [] });
    const row = stageMap.get(stage);
    row.count += 1;
    row.idle.push(ageDays(task.updated_at || task.created_at, now));
  });
  const stages = Array.from(stageMap.values())
    .map((item) => ({ stage: item.stage, label: item.label, count: item.count, avg_idle_days: average(item.idle) || 0 }))
    .sort((a, b) => b.count - a.count);

  const teamMap = new Map();
  activeTasks.forEach((task) => {
    const assignees = parseAssignees(task.assignee_ids, task.assignee_names, task.assignee_id, task.creator_name);
    assignees.forEach((person) => {
      if (!teamMap.has(person.id)) teamMap.set(person.id, { id: person.id, name: person.name, open: 0, overdue: 0, corrections: 0, due_soon: 0 });
      const row = teamMap.get(person.id);
      row.open += 1;
      const stage = stageForTask(task);
      if (stage === 'correction') row.corrections += 1;
      if (task.due_date) {
        const due = new Date(`${String(task.due_date).slice(0, 10)}T23:59:59`).getTime();
        if (due < now && !['approved', 'scheduled', 'posted'].includes(stage)) row.overdue += 1;
        else if (due - now <= 2 * 86400000 && due >= now) row.due_soon += 1;
      }
    });
  });
  const team = Array.from(teamMap.values()).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const clientMap = new Map();
  const ensureClient = (task) => {
    const id = Number(task.client_id || 0);
    if (!id) return null;
    if (!clientMap.has(id)) clientMap.set(id, { id, name: task.client_name || `Cliente ${id}`, created: 0, completed: 0, correction: 0, open: 0, overdue: 0, approvalHours: [] });
    return clientMap.get(id);
  };
  periodTasks.forEach((task) => {
    const row = ensureClient(task);
    if (!row) return;
    row.created += 1;
    if (['approved', 'scheduled', 'posted'].includes(stageForTask(task))) row.completed += 1;
    if (isCorrectionTouched(task)) row.correction += 1;
    const hours = hoursBetween(task.created_at, task.client_at);
    if (hours != null) row.approvalHours.push(hours);
  });
  activeTasks.forEach((task) => {
    const row = ensureClient(task);
    if (!row) return;
    row.open += 1;
    const stage = stageForTask(task);
    if (task.due_date && new Date(`${String(task.due_date).slice(0, 10)}T23:59:59`).getTime() < now && !['approved', 'scheduled', 'posted'].includes(stage)) row.overdue += 1;
  });
  const clients = Array.from(clientMap.values()).map((item) => ({
    id: item.id,
    name: item.name,
    created: item.created,
    completed: item.completed,
    open: item.open,
    overdue: item.overdue,
    correction_rate: percent(item.correction, item.created),
    avg_approval_hours: average(item.approvalHours),
  })).sort((a, b) => b.created - a.created || b.open - a.open);

  const typeMap = new Map();
  periodTasks.forEach((task) => {
    const label = demandTypeLabel(task);
    typeMap.set(label, (typeMap.get(label) || 0) + 1);
  });
  const demandTypes = Array.from(typeMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const waitingDirection = activeTasks.filter((task) => {
    const state = inferApprovalState(task);
    return ['approval', 'correction'].includes(stageForTask(task)) && state.directionStatus !== 'approved' && !state.correction;
  }).length;
  const waitingClient = activeTasks.filter((task) => {
    const state = inferApprovalState(task);
    return state.directionStatus === 'approved' && state.clientStatus !== 'approved' && !state.correction;
  }).length;
  const approvedWithoutDate = activeTasks.filter((task) => stageForTask(task) === 'approved' && !task.due_date).length;

  let audiovisual = { videos_period: 0, editing_now: 0, ready_unpublished: 0, avg_recording_to_edit_hours: null, avg_edit_to_post_hours: null };
  if (clientIds.length) {
    const videoRows = db.prepare(`
      SELECT v.*, r.recorded_at, r.scheduled_start
      FROM audiovisual_videos v
      LEFT JOIN audiovisual_recordings r ON r.id = v.recording_id AND r.agency_id = v.agency_id
      WHERE v.agency_id = ? AND v.client_id IN (${placeholders(clientIds)})
        AND date(v.created_at) BETWEEN date(?) AND date(?)
    `).all(agencyId, ...clientIds, range.from, range.to);
    const activeVideoRows = db.prepare(`
      SELECT v.* FROM audiovisual_videos v
      WHERE v.agency_id = ? AND v.client_id IN (${placeholders(clientIds)})
        AND v.status <> 'posted'
    `).all(agencyId, ...clientIds);
    audiovisual = {
      videos_period: videoRows.length,
      editing_now: activeVideoRows.filter((row) => ['recorded', 'editing'].includes(row.status)).length,
      ready_unpublished: activeVideoRows.filter((row) => ['edited', 'approved', 'dated', 'scheduled'].includes(row.status)).length,
      avg_recording_to_edit_hours: average(videoRows.map((row) => hoursBetween(row.recorded_at || row.scheduled_start || row.created_at, row.edited_at)).filter((value) => value != null)),
      avg_edit_to_post_hours: average(videoRows.map((row) => hoursBetween(row.edited_at, row.posted_at)).filter((value) => value != null)),
    };
  }

  const summary = {
    created: periodTasks.length,
    completed: completed.length,
    open: activeTasks.length,
    overdue_open: overdueOpen,
    correction_touched: correctionTasks.length,
    correction_rate: percent(correctionTasks.length, periodTasks.length),
    direction_corrections: directionCorrections,
    client_corrections: clientCorrections,
    on_time_rate: percent(onTimeCount, onTimeStates.length),
    on_time_sample: onTimeStates.length,
    waiting_direction: waitingDirection,
    waiting_client: waitingClient,
    approved_without_date: approvedWithoutDate,
    avg_direction_hours: average(approvalDirectionHours),
    avg_client_hours: average(approvalClientHours),
    avg_total_approval_hours: average(approvalTotalHours),
  };

  const signals = buildSignals({ summary, stages, team, clients, audiovisual });

  return res.json({
    meta: {
      days,
      from: range.from,
      to: range.to,
      client_id: Number(req.query.client_id || 0) || null,
      generated_at: new Date().toISOString(),
      methodology_note: 'Indicadores calculados com os estados e timestamps hoje disponíveis no ZebraHub. “Sem movimento” usa updated_at como proxy; não é um cronômetro histórico de etapa.',
    },
    summary,
    signals,
    stages,
    clients,
    team,
    demand_types: demandTypes,
    audiovisual,
  });
});

module.exports = router;
