const express = require('express');
const db = require('../db/database');
const { publicAgency } = require('../services/tenant');
const { normalizeAnswers, calculateProgress, validateComplete, calculateScores } = require('../services/diagnostic');

const router = express.Router();

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function getDiagnostic(token) {
  return db.prepare(`
    SELECT d.*, c.name AS client_name, c.segment AS client_segment, c.logo_color AS client_color,
           a.name AS agency_name, a.slug AS agency_slug
    FROM diagnostic_assessments d
    JOIN clients c ON c.id = d.client_id
    JOIN agencies a ON a.id = d.agency_id
    WHERE d.share_token = ? AND d.status != 'archived'
  `).get(token);
}

function payload(row) {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(row.agency_id);
  return {
    diagnostic: {
      id: row.id,
      title: row.title,
      status: row.status,
      progress: Number(row.progress || 0),
      answers: parseJson(row.answers_json, {}),
      scores: parseJson(row.scores_json, null),
      overall_score: Number(row.overall_score || 0),
      respondent_name: row.respondent_name || null,
      submitted_at: row.submitted_at || null,
      last_saved_at: row.last_saved_at || null,
      client: { name: row.client_name, segment: row.client_segment, color: row.client_color },
    },
    agency: publicAgency(agency),
  };
}

router.get('/:token', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link de diagnóstico não é válido ou foi encerrado.' });
  res.json(payload(row));
});

router.put('/:token', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link de diagnóstico não é válido ou foi encerrado.' });
  if (row.status === 'submitted') return res.status(409).json({ error: 'Este diagnóstico já foi enviado.' });
  const answers = normalizeAnswers(req.body.answers);
  const progress = calculateProgress(answers);
  const status = progress > 0 ? 'in_progress' : 'shared';
  db.prepare(`
    UPDATE diagnostic_assessments
    SET answers_json = ?, progress = ?, status = ?, respondent_name = ?, last_saved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(answers), progress, status, String(answers.respondent || '').trim() || null, row.id);
  res.json({ ok: true, progress, status, last_saved_at: new Date().toISOString() });
});

router.post('/:token/submit', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link de diagnóstico não é válido ou foi encerrado.' });
  if (row.status === 'submitted') return res.json(payload(row));
  const answers = normalizeAnswers(req.body.answers);
  const validation = validateComplete(answers);
  if (!validation.complete) {
    return res.status(400).json({ error: `Preencha os campos obrigatórios e os pilares pendentes: ${validation.missing.join(', ')}.`, missing: validation.missing });
  }
  const scores = calculateScores(answers);
  db.prepare(`
    UPDATE diagnostic_assessments
    SET answers_json = ?, scores_json = ?, overall_score = ?, progress = 100, status = 'submitted',
        respondent_name = ?, submitted_at = datetime('now'), last_saved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(answers), JSON.stringify(scores), scores.overall, String(answers.respondent || '').trim(), row.id);
  res.json(payload(getDiagnostic(req.params.token)));
});

module.exports = router;
