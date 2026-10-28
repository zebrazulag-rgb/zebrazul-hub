const express = require('express');
const db = require('../db/database');
const { publicAgency } = require('../services/tenant');

const router = express.Router();

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function clampText(value, limit = 500) {
  return String(value ?? '').trim().slice(0, limit);
}

function getDiagnostic(token) {
  return db.prepare(`
    SELECT p.*, c.name AS client_name, c.segment AS client_segment,
           a.name AS agency_name, a.slug AS agency_slug
    FROM presence_diagnostics p
    JOIN clients c ON c.id = p.client_id
    JOIN agencies a ON a.id = p.agency_id
    WHERE p.share_token = ? AND p.status <> 'archived'
  `).get(String(token || '').trim());
}

function payload(row) {
  if (!row) return null;
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(row.agency_id);
  return {
    diagnostic: {
      id: Number(row.id),
      client_id: Number(row.client_id),
      client_name: row.client_name || row.company_name || '',
      version: row.version || '0.3',
      status: row.status || 'draft',
      niche_key: row.niche_key || 'geral',
      company_name: row.company_name || row.client_name || '',
      segment: row.segment || row.client_segment || '',
      respondent: row.respondent || '',
      progress: Number(row.progress || 0),
      answers: safeJson(row.answers_json, {}),
      result: safeJson(row.result_json, null),
      created_at: row.created_at,
      updated_at: row.updated_at,
      submitted_at: row.submitted_at || null,
    },
    agency: publicAgency(agency),
  };
}

router.get('/:token', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link do Mapa da Marca não é válido ou foi encerrado.' });
  res.json(payload(row));
});

router.put('/:token', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link do Mapa da Marca não é válido ou foi encerrado.' });
  if (row.status === 'submitted') return res.status(409).json({ error: 'Este Mapa da Marca já foi concluído.' });

  const body = req.body || {};
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : safeJson(row.answers_json, {});
  const progress = Math.max(0, Math.min(99, Number(body.progress ?? row.progress ?? 0) || 0));
  const nicheKey = clampText(body.niche_key ?? row.niche_key ?? 'geral', 80) || 'geral';
  const companyName = clampText(body.company_name ?? row.company_name ?? row.client_name, 180) || row.client_name;
  const segment = clampText(body.segment ?? row.segment ?? row.client_segment ?? '', 180);
  const respondent = clampText(body.respondent ?? row.respondent ?? '', 180);
  const nextStatus = progress > 0 ? 'in_progress' : 'draft';

  db.prepare(`
    UPDATE presence_diagnostics
    SET source = 'client', status = ?, niche_key = ?, company_name = ?, segment = ?, respondent = ?,
        progress = ?, answers_json = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nicheKey, companyName, segment, respondent, progress, JSON.stringify(answers), row.id);

  if (segment && !String(row.client_segment || '').trim()) {
    db.prepare('UPDATE clients SET segment = ? WHERE id = ? AND agency_id = ?').run(segment, row.client_id, row.agency_id);
  }

  res.json(payload(getDiagnostic(req.params.token)));
});

router.post('/:token/submit', (req, res) => {
  const row = getDiagnostic(req.params.token);
  if (!row) return res.status(404).json({ error: 'Este link do Mapa da Marca não é válido ou foi encerrado.' });
  if (row.status === 'submitted') return res.json(payload(row));

  const body = req.body || {};
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result) ? body.result : null;
  const progress = Math.max(0, Math.min(100, Number(body.progress || 0) || 0));
  if (progress < 100 || !result) {
    return res.status(400).json({ error: 'Conclua todas as perguntas antes de enviar o Mapa da Marca.' });
  }

  const nicheKey = clampText(body.niche_key ?? row.niche_key ?? 'geral', 80) || 'geral';
  const companyName = clampText(body.company_name ?? row.company_name ?? row.client_name, 180) || row.client_name;
  const segment = clampText(body.segment ?? row.segment ?? row.client_segment ?? '', 180);
  const respondent = clampText(body.respondent ?? row.respondent ?? '', 180);

  db.prepare(`
    UPDATE presence_diagnostics
    SET source = 'client', status = 'submitted', niche_key = ?, company_name = ?, segment = ?, respondent = ?,
        progress = 100, answers_json = ?, result_json = ?, submitted_at = COALESCE(submitted_at, datetime('now')),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nicheKey, companyName, segment, respondent, JSON.stringify(answers), JSON.stringify(result), row.id);

  if (segment && !String(row.client_segment || '').trim()) {
    db.prepare('UPDATE clients SET segment = ? WHERE id = ? AND agency_id = ?').run(segment, row.client_id, row.agency_id);
  }

  res.json(payload(getDiagnostic(req.params.token)));
});

module.exports = router;
