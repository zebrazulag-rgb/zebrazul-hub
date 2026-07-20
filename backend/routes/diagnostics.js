const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const { normalizeAnswers, calculateProgress, calculateScores } = require('../services/diagnostic');

const router = express.Router();
router.use(authRequired);

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function normalizeAssessment(row, includeAnswers = false) {
  if (!row) return null;
  const result = {
    ...row,
    progress: Number(row.progress || 0),
    overall_score: Number(row.overall_score || 0),
    scores: parseJson(row.scores_json, null),
  };
  if (includeAnswers) result.answers = parseJson(row.answers_json, {});
  delete result.answers_json;
  delete result.scores_json;
  return result;
}

function ensureClient(req, res, clientId) {
  if (!clientId) {
    res.status(400).json({ error: 'Selecione um cliente para abrir o diagnóstico' });
    return false;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return false;
  }
  return true;
}

router.get('/', (req, res) => {
  const clientId = req.user.role === 'client' ? Number(req.user.client_id) : Number(req.query.client_id);
  if (!ensureClient(req, res, clientId)) return;
  const rows = db.prepare(`
    SELECT d.*, c.name AS client_name
    FROM diagnostic_assessments d
    JOIN clients c ON c.id = d.client_id
    WHERE d.client_id = ? AND d.agency_id = ?
    ORDER BY d.created_at DESC, d.id DESC
  `).all(clientId, req.user.agency_id);
  res.json({ diagnostics: rows.map((row) => normalizeAssessment(row, false)) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.name AS client_name
    FROM diagnostic_assessments d
    JOIN clients c ON c.id = d.client_id
    WHERE d.id = ? AND d.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  if (!ensureClient(req, res, row.client_id)) return;
  res.json({ diagnostic: normalizeAssessment(row, true) });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const clientId = Number(req.body.client_id);
  if (!ensureClient(req, res, clientId)) return;
  const client = db.prepare('SELECT name FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
  const title = String(req.body.title || `DME — ${client.name}`).trim().slice(0, 180);
  const shareToken = crypto.randomBytes(24).toString('hex');
  const info = db.prepare(`
    INSERT INTO diagnostic_assessments
      (agency_id, client_id, title, share_token, status, created_by)
    VALUES (?, ?, ?, ?, 'shared', ?)
  `).run(req.user.agency_id, clientId, title, shareToken, req.user.id);
  const row = db.prepare(`
    SELECT d.*, c.name AS client_name
    FROM diagnostic_assessments d JOIN clients c ON c.id = d.client_id
    WHERE d.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({ diagnostic: normalizeAssessment(row, true) });
});

router.put('/:id', requireRole('admin', 'team'), (req, res) => {
  const row = db.prepare('SELECT * FROM diagnostic_assessments WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  if (!ensureClient(req, res, row.client_id)) return;
  const updates = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Informe o título' });
    updates.push('title = ?'); values.push(title.slice(0, 180));
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    const status = String(req.body.status || '');
    if (!['shared', 'in_progress', 'submitted', 'archived'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    updates.push('status = ?'); values.push(status);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'answers')) {
    const answers = normalizeAnswers(req.body.answers);
    const scores = calculateScores(answers);
    updates.push('answers_json = ?', 'scores_json = ?', 'overall_score = ?', 'progress = ?', "last_saved_at = datetime('now')");
    values.push(JSON.stringify(answers), JSON.stringify(scores), scores.overall, calculateProgress(answers));
  }
  if (!updates.length) return res.json({ diagnostic: normalizeAssessment(row, true) });
  values.push(req.params.id, req.user.agency_id);
  db.prepare(`UPDATE diagnostic_assessments SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(...values);
  const updated = db.prepare(`SELECT d.*, c.name AS client_name FROM diagnostic_assessments d JOIN clients c ON c.id = d.client_id WHERE d.id = ?`).get(req.params.id);
  res.json({ diagnostic: normalizeAssessment(updated, true) });
});

router.post('/:id/regenerate-link', requireRole('admin', 'team'), (req, res) => {
  const row = db.prepare('SELECT * FROM diagnostic_assessments WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  if (!ensureClient(req, res, row.client_id)) return;
  const shareToken = crypto.randomBytes(24).toString('hex');
  db.prepare("UPDATE diagnostic_assessments SET share_token = ?, status = CASE WHEN status = 'archived' THEN 'shared' ELSE status END, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(shareToken, row.id, req.user.agency_id);
  const updated = db.prepare(`SELECT d.*, c.name AS client_name FROM diagnostic_assessments d JOIN clients c ON c.id = d.client_id WHERE d.id = ?`).get(row.id);
  res.json({ diagnostic: normalizeAssessment(updated, true) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM diagnostic_assessments WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado' });
  if (!ensureClient(req, res, row.client_id)) return;
  db.prepare("UPDATE diagnostic_assessments SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND agency_id = ?").run(row.id, req.user.agency_id);
  res.json({ ok: true });
});

module.exports = router;
