const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function clampText(value, limit = 500) {
  return String(value ?? '').trim().slice(0, limit);
}

function normalizeRow(row, includePayload = false) {
  if (!row) return null;
  const result = {
    id: Number(row.id),
    agency_id: Number(row.agency_id),
    client_id: Number(row.client_id),
    client_name: row.client_name || row.company_name || '',
    source: row.source || 'client',
    version: row.version || '0.3',
    status: row.status || 'draft',
    niche_key: row.niche_key || 'geral',
    company_name: row.company_name || row.client_name || '',
    segment: row.segment || '',
    respondent: row.respondent || '',
    progress: Number(row.progress || 0),
    result: safeJson(row.result_json, null),
    created_by: row.created_by ? Number(row.created_by) : null,
    respondent_user_id: row.respondent_user_id ? Number(row.respondent_user_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at || null,
  };
  if (includePayload) result.answers = safeJson(row.answers_json, {});
  return result;
}

function clientForRequest(req, requestedId) {
  const clientId = req.user?.role === 'client' ? Number(req.user.client_id) : Number(requestedId);
  if (!clientId) return { error: 'Selecione um cliente para abrir o Mapa da Marca.' };
  if (!canAccessClient(req.user, clientId)) return { error: 'Você não tem acesso a este cliente.', status: 403 };
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
  if (!client) return { error: 'Cliente não encontrado.', status: 404 };
  return { client };
}

function ensureWritable(req, res) {
  if (req.user?.role === 'client' && req.user?.trial?.is_trial && req.user?.trial?.expired) {
    res.status(403).json({ error: 'Seu período experimental terminou. O diagnóstico permanece salvo para uma futura ativação.' });
    return false;
  }
  return true;
}

router.get('/', (req, res) => {
  const { client, error, status } = clientForRequest(req, req.query.client_id);
  if (!client) return res.status(status || 400).json({ error });
  const rows = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM presence_diagnostics p
    JOIN clients c ON c.id = p.client_id
    WHERE p.agency_id = ? AND p.client_id = ? AND p.status <> 'archived'
    ORDER BY COALESCE(p.submitted_at, p.updated_at, p.created_at) DESC, p.id DESC
  `).all(req.user.agency_id, client.id);
  res.json({ diagnostics: rows.map((row) => normalizeRow(row, false)) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM presence_diagnostics p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = ? AND p.agency_id = ?
  `).get(Number(req.params.id), req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado.' });
  const { client, error, status } = clientForRequest(req, row.client_id);
  if (!client) return res.status(status || 400).json({ error });
  res.json({ diagnostic: normalizeRow(row, true) });
});

router.post('/', (req, res) => {
  if (!ensureWritable(req, res)) return;
  const { client, error, status } = clientForRequest(req, req.body?.client_id);
  if (!client) return res.status(status || 400).json({ error });

  const forceNew = Boolean(req.body?.force_new);
  if (!forceNew) {
    const active = db.prepare(`
      SELECT p.*, c.name AS client_name
      FROM presence_diagnostics p
      JOIN clients c ON c.id = p.client_id
      WHERE p.agency_id = ? AND p.client_id = ? AND p.status IN ('draft','in_progress')
      ORDER BY p.updated_at DESC, p.id DESC LIMIT 1
    `).get(req.user.agency_id, client.id);
    if (active) return res.status(200).json({ diagnostic: normalizeRow(active, true), reused: true });
  }

  const source = req.user?.role === 'client'
    ? (req.user?.trial?.is_trial ? 'trial' : 'client')
    : 'team';
  const respondent = clampText(req.user?.name || '', 160);
  const info = db.prepare(`
    INSERT INTO presence_diagnostics (
      agency_id, client_id, created_by, respondent_user_id, source, version,
      status, niche_key, company_name, segment, respondent, progress,
      answers_json, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '0.3', 'draft', 'geral', ?, ?, ?, 0, '{}', NULL, datetime('now'), datetime('now'))
  `).run(
    req.user.agency_id,
    client.id,
    req.user.id || null,
    req.user.id || null,
    source,
    client.name,
    client.segment || '',
    respondent,
  );
  const row = db.prepare(`
    SELECT p.*, c.name AS client_name FROM presence_diagnostics p
    JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({ diagnostic: normalizeRow(row, true), reused: false });
});

router.put('/:id', (req, res) => {
  if (!ensureWritable(req, res)) return;
  const row = db.prepare('SELECT * FROM presence_diagnostics WHERE id = ? AND agency_id = ?').get(Number(req.params.id), req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado.' });
  const { client, error, status } = clientForRequest(req, row.client_id);
  if (!client) return res.status(status || 400).json({ error });
  if (row.status === 'submitted' && req.user?.role === 'client') {
    return res.status(409).json({ error: 'Este diagnóstico já foi concluído. Crie uma nova versão para atualizar o mapa.' });
  }

  const body = req.body || {};
  const nextStatus = ['draft', 'in_progress', 'submitted'].includes(String(body.status || ''))
    ? String(body.status)
    : (row.status || 'draft');
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : safeJson(row.answers_json, {});
  const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result) ? body.result : safeJson(row.result_json, null);
  const progress = Math.max(0, Math.min(100, Number(body.progress ?? row.progress ?? 0) || 0));
  const nicheKey = clampText(body.niche_key ?? row.niche_key ?? 'geral', 80) || 'geral';
  const companyName = clampText(body.company_name ?? row.company_name ?? client.name, 180) || client.name;
  const segment = clampText(body.segment ?? row.segment ?? client.segment ?? '', 180);
  const respondent = clampText(body.respondent ?? row.respondent ?? req.user?.name ?? '', 180);

  db.prepare(`
    UPDATE presence_diagnostics
    SET status = ?, niche_key = ?, company_name = ?, segment = ?, respondent = ?, progress = ?,
        answers_json = ?, result_json = ?, respondent_user_id = COALESCE(respondent_user_id, ?),
        submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, datetime('now')) ELSE submitted_at END,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    nextStatus,
    nicheKey,
    companyName,
    segment,
    respondent,
    progress,
    JSON.stringify(answers),
    result ? JSON.stringify(result) : null,
    req.user.id || null,
    nextStatus,
    row.id,
    req.user.agency_id,
  );

  if (segment && !String(client.segment || '').trim()) {
    db.prepare('UPDATE clients SET segment = ? WHERE id = ? AND agency_id = ?').run(segment, client.id, req.user.agency_id);
  }

  const updated = db.prepare(`
    SELECT p.*, c.name AS client_name FROM presence_diagnostics p
    JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(row.id);
  res.json({ diagnostic: normalizeRow(updated, true) });
});

router.delete('/:id', (req, res) => {
  if (!['admin', 'team'].includes(req.user?.role)) return res.status(403).json({ error: 'Apenas a equipe pode arquivar diagnósticos.' });
  const row = db.prepare('SELECT * FROM presence_diagnostics WHERE id = ? AND agency_id = ?').get(Number(req.params.id), req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado.' });
  const { client, error, status } = clientForRequest(req, row.client_id);
  if (!client) return res.status(status || 400).json({ error });
  db.prepare("UPDATE presence_diagnostics SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(row.id, req.user.agency_id);
  res.json({ ok: true });
});

module.exports = router;
