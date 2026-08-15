const express = require('express');
const { randomBytes } = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requireRole('admin', 'team'));

const CAMPAIGN_YEAR = 2027;
const DEFAULT_ANSWERS = {
  objetivoPrincipal: 'Conquistar novos alunos para Natal e Parnamirim',
  resultadoConcreto: 'Atingir 310 alunos ativos em 2027 por meio da captação de novos alunos',
  escopo: 'Unidades Natal e Parnamirim',
  baseProjetada2027: '258',
  metaTotal2027: '310',
  metaNovosCalculada: '52',
  totalDistribuido: '0',
};

const REQUIRED_FIELDS = [
  'respondente',
  'baseProjetada2027',
  'publicoPrioritario',
  'momentoVida',
  'maiorDesejo',
  'objecao',
  'percepcaoAtual',
  'percepcaoDesejada',
  'verdadeUnica',
  'promessaCentral',
  'territorio',
  'provas',
  'emocaoPrincipal',
  'identidadeCrista',
  'tresAtributos',
  'evitarTom',
  'obrigatorios',
  'proibidos',
  'fraseNorte',
];

function normalizeClientName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isBeeClientName(name) {
  const normalized = normalizeClientName(name);
  return normalized === 'bee'
    || normalized.startsWith('bee ')
    || normalized.includes('bee christian')
    || normalized.includes('bee light');
}

function resolveClient(req, res, requestedClientId) {
  const clientId = Number(requestedClientId) || null;
  if (!clientId) {
    res.status(400).json({ error: 'Selecione o cliente Bee Christian School' });
    return null;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return null;
  }

  const client = db.prepare('SELECT id, agency_id, name FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
  if (!client || !isBeeClientName(client.name)) {
    res.status(403).json({ error: 'Este briefing é exclusivo da Bee Christian School' });
    return null;
  }
  return client;
}

function safeParseAnswers(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeAnswers(value, current = {}) {
  const incoming = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const merged = { ...DEFAULT_ANSWERS, ...current, ...incoming };
  const clean = {};
  for (const [key, raw] of Object.entries(merged)) {
    if (raw == null) clean[key] = '';
    else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') clean[key] = String(raw);
  }

  const base = Math.max(0, Number(clean.baseProjetada2027) || 0);
  const target = Math.max(0, Number(clean.metaTotal2027) || 310);
  const natal = Math.max(0, Number(clean.metaNovosNatal) || 0);
  const parnamirim = Math.max(0, Number(clean.metaNovosParnamirim) || 0);
  clean.metaNovosCalculada = String(Math.max(0, target - base));
  clean.totalDistribuido = String(natal + parnamirim);
  return clean;
}

function progressFor(answers) {
  const done = REQUIRED_FIELDS.filter((field) => String(answers?.[field] || '').trim()).length;
  return Math.round((done / REQUIRED_FIELDS.length) * 100);
}

function serialize(row) {
  if (!row) return null;
  return {
    ...row,
    progress: Number(row.progress || 0),
    answers: safeParseAnswers(row.answers_json),
  };
}

function createShareToken() {
  return randomBytes(24).toString('hex');
}

router.get('/', (req, res) => {
  const client = resolveClient(req, res, req.query.client_id);
  if (!client) return;
  const year = Number(req.query.year) || CAMPAIGN_YEAR;
  const rows = db.prepare(`
    SELECT b.*, u.name AS created_by_name
    FROM bee_campaign_briefing_responses b
    LEFT JOIN users u ON u.id = b.created_by
    WHERE b.agency_id = ? AND b.client_id = ? AND b.campaign_year = ? AND b.status <> 'archived'
    ORDER BY CASE b.status WHEN 'submitted' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
             datetime(b.updated_at) DESC,
             b.id DESC
  `).all(req.user.agency_id, client.id, year);

  res.json({ client, year, responses: rows.map(serialize) });
});

router.post('/', (req, res) => {
  const client = resolveClient(req, res, req.body.client_id);
  if (!client) return;
  const year = Number(req.body.year) || CAMPAIGN_YEAR;
  const answers = normalizeAnswers(req.body.answers || {});
  const progress = progressFor(answers);
  const respondentName = String(answers.respondente || req.body.respondent_name || '').trim() || null;
  const token = createShareToken();

  const info = db.prepare(`
    INSERT INTO bee_campaign_briefing_responses
      (agency_id, client_id, campaign_year, share_token, status, answers_json, progress, respondent_name, created_by, last_saved_at)
    VALUES (?, ?, ?, ?, 'shared', ?, ?, ?, ?, datetime('now'))
  `).run(
    req.user.agency_id,
    client.id,
    year,
    token,
    JSON.stringify(answers),
    progress,
    respondentName,
    req.user.id,
  );

  const row = db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ response: serialize(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Resposta não encontrada' });
  const client = resolveClient(req, res, existing.client_id);
  if (!client) return;

  const currentAnswers = safeParseAnswers(existing.answers_json);
  const answers = normalizeAnswers(req.body.answers || {}, currentAnswers);
  const progress = progressFor(answers);
  const respondentName = String(answers.respondente || '').trim() || null;
  const requestedStatus = String(req.body.status || existing.status || '').trim();
  const nextStatus = requestedStatus === 'submitted'
    ? 'submitted'
    : (progress > 0 ? 'in_progress' : 'shared');

  db.prepare(`
    UPDATE bee_campaign_briefing_responses
    SET answers_json = ?, progress = ?, respondent_name = ?, status = ?,
        submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, datetime('now')) ELSE submitted_at END,
        last_saved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(answers), progress, respondentName, nextStatus, nextStatus, existing.id);

  const row = db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ?').get(existing.id);
  res.json({ response: serialize(row) });
});

router.post('/:id/reset-link', (req, res) => {
  const existing = db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Resposta não encontrada' });
  const client = resolveClient(req, res, existing.client_id);
  if (!client) return;
  const token = createShareToken();
  db.prepare(`UPDATE bee_campaign_briefing_responses SET share_token = ?, status = CASE WHEN status = 'submitted' THEN status ELSE 'shared' END, updated_at = datetime('now') WHERE id = ?`).run(token, existing.id);
  res.json({ response: serialize(db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ?').get(existing.id)) });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bee_campaign_briefing_responses WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Resposta não encontrada' });
  const client = resolveClient(req, res, existing.client_id);
  if (!client) return;
  db.prepare(`UPDATE bee_campaign_briefing_responses SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(existing.id);
  res.json({ ok: true });
});

module.exports = router;
