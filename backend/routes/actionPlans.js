const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function resolveClientId(req, requested) {
  if (req.user.role === 'client') return Number(req.user.client_id) || null;
  return Number(requested) || null;
}

function ensureClient(req, res, clientId) {
  if (!clientId) {
    res.status(400).json({ error: 'Selecione um cliente para abrir o Diagnóstico Estratégico' });
    return false;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return false;
  }
  return true;
}

function getPlan(clientId, year, agencyId) {
  return db.prepare('SELECT * FROM action_plans WHERE client_id = ? AND year = ? AND agency_id = ?').get(clientId, year, agencyId);
}

function getTasks(planId) {
  if (!planId) return [];
  return db.prepare(`
    SELECT id, action_plan_id, title, description, due_date, status, created_at, updated_at
    FROM action_plan_tasks
    WHERE action_plan_id = ?
    ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
             COALESCE(due_date, created_at) ASC
  `).all(planId);
}

function parseDiagnosisData(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function serializePlan(plan) {
  if (!plan) return null;
  return {
    ...plan,
    diagnosis_data: parseDiagnosisData(plan.strategic_diagnosis_json),
    strategic_diagnosis: parseDiagnosisData(plan.strategic_diagnosis_json),
    progress: Number(plan.strategic_diagnosis_progress || 0),
  };
}

router.get('/', (req, res) => {
  const clientId = resolveClientId(req, req.query.client_id);
  const year = Number(req.query.year) || new Date().getFullYear();
  if (!ensureClient(req, res, clientId)) return;
  const plan = getPlan(clientId, year, req.user.agency_id);
  res.json({
    plan: serializePlan(plan) || {
      id: null,
      client_id: clientId,
      year,
      what_we_want: '',
      why_we_want: '',
      how_we_will_do: '',
      manifesto: '',
      diagnosis: '',
      diagnosis_data: null,
      strategic_diagnosis: null,
      progress: 0,
    },
    tasks: getTasks(plan?.id),
  });
});

router.put('/', (req, res) => {
  const clientId = resolveClientId(req, req.body.client_id);
  const year = Number(req.body.year) || new Date().getFullYear();
  if (!ensureClient(req, res, clientId)) return;

  const existing = getPlan(clientId, year, req.user.agency_id) || {};
  const hasDiagnosisData = Object.prototype.hasOwnProperty.call(req.body, 'diagnosis_data')
    || Object.prototype.hasOwnProperty.call(req.body, 'strategic_diagnosis');
  const diagnosisData = hasDiagnosisData
    ? (req.body.diagnosis_data ?? req.body.strategic_diagnosis ?? {})
    : parseDiagnosisData(existing.strategic_diagnosis_json);
  const diagnosisJson = diagnosisData && typeof diagnosisData === 'object'
    ? JSON.stringify(diagnosisData)
    : String(existing.strategic_diagnosis_json || '{}');
  const progress = Object.prototype.hasOwnProperty.call(req.body, 'progress')
    ? Math.max(0, Math.min(100, Number(req.body.progress) || 0))
    : Number(existing.strategic_diagnosis_progress || 0);

  const values = [
    Object.prototype.hasOwnProperty.call(req.body, 'what_we_want') ? String(req.body.what_we_want || '') : String(existing.what_we_want || ''),
    Object.prototype.hasOwnProperty.call(req.body, 'why_we_want') ? String(req.body.why_we_want || '') : String(existing.why_we_want || ''),
    Object.prototype.hasOwnProperty.call(req.body, 'how_we_will_do') ? String(req.body.how_we_will_do || '') : String(existing.how_we_will_do || ''),
    Object.prototype.hasOwnProperty.call(req.body, 'manifesto') ? String(req.body.manifesto || '') : String(existing.manifesto || ''),
    Object.prototype.hasOwnProperty.call(req.body, 'diagnosis') ? String(req.body.diagnosis || '') : String(existing.diagnosis || ''),
    diagnosisJson,
    progress,
  ];

  db.prepare(`
    INSERT INTO action_plans
      (agency_id, client_id, year, what_we_want, why_we_want, how_we_will_do, manifesto, diagnosis, strategic_diagnosis_json, strategic_diagnosis_progress, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id, year) DO UPDATE SET
      what_we_want = excluded.what_we_want,
      why_we_want = excluded.why_we_want,
      how_we_will_do = excluded.how_we_will_do,
      manifesto = excluded.manifesto,
      diagnosis = excluded.diagnosis,
      strategic_diagnosis_json = excluded.strategic_diagnosis_json,
      strategic_diagnosis_progress = excluded.strategic_diagnosis_progress,
      updated_at = datetime('now')
  `).run(req.user.agency_id, clientId, year, ...values, req.user.id);

  const plan = getPlan(clientId, year, req.user.agency_id);
  res.json({ ok: true, plan: serializePlan(plan), tasks: getTasks(plan.id) });
});

router.post('/tasks', (req, res) => {
  const clientId = resolveClientId(req, req.body.client_id);
  const year = Number(req.body.year) || new Date().getFullYear();
  if (!ensureClient(req, res, clientId)) return;
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Informe o título da tarefa' });
  let plan = getPlan(clientId, year, req.user.agency_id);
  if (!plan) {
    db.prepare('INSERT INTO action_plans (agency_id, client_id, year, created_by) VALUES (?, ?, ?, ?)' ).run(req.user.agency_id, clientId, year, req.user.id);
    plan = getPlan(clientId, year, req.user.agency_id);
  }
  const info = db.prepare(`
    INSERT INTO action_plan_tasks (action_plan_id, title, description, due_date, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(plan.id, title, req.body.description || '', req.body.due_date || null, req.body.status || 'pending', req.user.id);
  const task = db.prepare('SELECT * FROM action_plan_tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ task });
});

router.put('/tasks/:id', (req, res) => {
  const task = db.prepare(`
    SELECT apt.*, ap.client_id, ap.agency_id FROM action_plan_tasks apt
    JOIN action_plans ap ON ap.id = apt.action_plan_id
    WHERE apt.id = ? AND ap.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!ensureClient(req, res, task.client_id)) return;
  const title = Object.prototype.hasOwnProperty.call(req.body, 'title') ? String(req.body.title || '').trim() : task.title;
  if (!title) return res.status(400).json({ error: 'Informe o título da tarefa' });
  db.prepare(`
    UPDATE action_plan_tasks SET title = ?, description = ?, due_date = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title,
    Object.prototype.hasOwnProperty.call(req.body, 'description') ? req.body.description || '' : task.description,
    Object.prototype.hasOwnProperty.call(req.body, 'due_date') ? req.body.due_date || null : task.due_date,
    Object.prototype.hasOwnProperty.call(req.body, 'status') ? req.body.status : task.status,
    task.id
  );
  res.json({ task: db.prepare('SELECT * FROM action_plan_tasks WHERE id = ?').get(task.id) });
});

router.delete('/tasks/:id', (req, res) => {
  const task = db.prepare(`
    SELECT apt.id, ap.client_id, ap.agency_id FROM action_plan_tasks apt
    JOIN action_plans ap ON ap.id = apt.action_plan_id
    WHERE apt.id = ? AND ap.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!ensureClient(req, res, task.client_id)) return;
  db.prepare('DELETE FROM action_plan_tasks WHERE id = ?').run(task.id);
  res.json({ ok: true });
});

module.exports = router;
