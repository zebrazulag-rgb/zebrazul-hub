const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const ALLOWED_TYPES = new Set(['cycle_90', 'monthly']);

function resolveClientId(req, requested) {
  if (req.user.role === 'client') return Number(req.user.client_id) || null;
  return Number(requested) || null;
}

function ensureClient(req, res, clientId) {
  if (!clientId) {
    res.status(400).json({ error: 'Selecione um cliente para abrir o planejamento' });
    return false;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return false;
  }
  return true;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function serializeDocument(record) {
  if (!record) return null;
  return {
    id: record.id,
    agency_id: record.agency_id,
    client_id: record.client_id,
    type: record.type,
    period_key: record.period_key,
    year: Number(record.year),
    title: record.title || '',
    data: parseJson(record.data_json) || {},
    progress: Number(record.progress || 0),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

router.get('/summary', (req, res) => {
  const clientId = resolveClientId(req, req.query.client_id);
  const year = Number(req.query.year) || new Date().getFullYear();
  if (!ensureClient(req, res, clientId)) return;

  const rows = db.prepare(`
    SELECT type, period_key, title, progress, updated_at
    FROM planning_documents
    WHERE agency_id = ? AND client_id = ? AND year = ?
    ORDER BY period_key ASC
  `).all(req.user.agency_id, clientId, year);

  const summarize = (type) => {
    const documents = rows.filter((row) => row.type === type);
    const totalProgress = documents.reduce((sum, item) => sum + Number(item.progress || 0), 0);
    return {
      count: documents.length,
      progress: documents.length ? Math.round(totalProgress / documents.length) : 0,
      latest: documents.length ? documents[documents.length - 1] : null,
      documents,
    };
  };

  res.json({
    year,
    cycle_90: summarize('cycle_90'),
    monthly: summarize('monthly'),
  });
});

router.get('/', (req, res) => {
  const clientId = resolveClientId(req, req.query.client_id);
  const type = String(req.query.type || '');
  const periodKey = String(req.query.period_key || '').trim();
  if (!ensureClient(req, res, clientId)) return;
  if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'Tipo de planejamento inválido' });
  if (!periodKey) return res.status(400).json({ error: 'Informe o período do planejamento' });

  const record = db.prepare(`
    SELECT * FROM planning_documents
    WHERE agency_id = ? AND client_id = ? AND type = ? AND period_key = ?
  `).get(req.user.agency_id, clientId, type, periodKey);

  res.json({ document: serializeDocument(record) });
});

router.put('/', (req, res) => {
  const clientId = resolveClientId(req, req.body.client_id);
  const type = String(req.body.type || '');
  const periodKey = String(req.body.period_key || '').trim();
  const year = Number(req.body.year) || new Date().getFullYear();
  if (!ensureClient(req, res, clientId)) return;
  if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'Tipo de planejamento inválido' });
  if (!periodKey) return res.status(400).json({ error: 'Informe o período do planejamento' });

  const payload = req.body.data && typeof req.body.data === 'object' ? req.body.data : {};
  const progress = Math.max(0, Math.min(100, Number(req.body.progress) || 0));
  const title = String(req.body.title || periodKey).trim();

  db.prepare(`
    INSERT INTO planning_documents
      (agency_id, client_id, type, period_key, year, title, data_json, progress, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agency_id, client_id, type, period_key) DO UPDATE SET
      year = excluded.year,
      title = excluded.title,
      data_json = excluded.data_json,
      progress = excluded.progress,
      updated_at = datetime('now')
  `).run(
    req.user.agency_id,
    clientId,
    type,
    periodKey,
    year,
    title,
    JSON.stringify(payload),
    progress,
    req.user.id
  );

  const record = db.prepare(`
    SELECT * FROM planning_documents
    WHERE agency_id = ? AND client_id = ? AND type = ? AND period_key = ?
  `).get(req.user.agency_id, clientId, type, periodKey);

  res.json({ ok: true, document: serializeDocument(record) });
});

module.exports = router;
