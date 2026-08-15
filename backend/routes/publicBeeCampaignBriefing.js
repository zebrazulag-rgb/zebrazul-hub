const express = require('express');
const db = require('../db/database');

const router = express.Router();

const REQUIRED_FIELDS = [
  'respondente','baseProjetada2027','publicoPrioritario','momentoVida','maiorDesejo','objecao',
  'percepcaoAtual','percepcaoDesejada','verdadeUnica','promessaCentral','territorio','provas',
  'emocaoPrincipal','identidadeCrista','tresAtributos','evitarTom','obrigatorios','proibidos','fraseNorte',
];

const DEFAULT_ANSWERS = {
  objetivoPrincipal: 'Conquistar novos alunos para Natal e Parnamirim',
  resultadoConcreto: 'Atingir 310 alunos ativos em 2027 por meio da captação de novos alunos',
  escopo: 'Unidades Natal e Parnamirim',
  baseProjetada2027: '258',
  metaTotal2027: '310',
  metaNovosCalculada: '52',
  totalDistribuido: '0',
};

function safeParse(value) {
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

function getByToken(token) {
  return db.prepare(`
    SELECT b.*, c.name AS client_name
    FROM bee_campaign_briefing_responses b
    JOIN clients c ON c.id = b.client_id
    WHERE b.share_token = ? AND b.status <> 'archived'
  `).get(String(token || '').trim());
}

function serialize(row) {
  return {
    id: row.id,
    campaign_year: row.campaign_year,
    title: row.title,
    status: row.status,
    progress: Number(row.progress || 0),
    respondent_name: row.respondent_name,
    submitted_at: row.submitted_at,
    last_saved_at: row.last_saved_at,
    client_name: row.client_name,
    answers: safeParse(row.answers_json),
  };
}

router.get('/:token', (req, res) => {
  const row = getByToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Link de briefing inválido ou arquivado' });
  res.set('Cache-Control', 'no-store');
  res.json({ response: serialize(row) });
});

router.put('/:token', (req, res) => {
  const row = getByToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Link de briefing inválido ou arquivado' });
  if (row.status === 'submitted') return res.status(409).json({ error: 'Esta resposta já foi enviada e está bloqueada para edição' });

  const answers = normalizeAnswers(req.body.answers || {}, safeParse(row.answers_json));
  const progress = progressFor(answers);
  const respondentName = String(answers.respondente || '').trim() || null;
  db.prepare(`
    UPDATE bee_campaign_briefing_responses
    SET answers_json = ?, progress = ?, respondent_name = ?, status = ?, last_saved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(answers), progress, respondentName, progress > 0 ? 'in_progress' : 'shared', row.id);

  res.set('Cache-Control', 'no-store');
  res.json({ response: serialize(getByToken(req.params.token)) });
});

router.post('/:token/submit', (req, res) => {
  const row = getByToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Link de briefing inválido ou arquivado' });
  if (row.status === 'submitted') {
    res.set('Cache-Control', 'no-store');
    return res.json({ response: serialize(row) });
  }

  const answers = normalizeAnswers(req.body.answers || {}, safeParse(row.answers_json));
  const progress = progressFor(answers);
  if (progress < 100) return res.status(400).json({ error: `Preencha os campos essenciais antes de enviar. Progresso atual: ${progress}%` });

  const respondentName = String(answers.respondente || '').trim() || null;
  db.prepare(`
    UPDATE bee_campaign_briefing_responses
    SET answers_json = ?, progress = 100, respondent_name = ?, status = 'submitted',
        submitted_at = datetime('now'), last_saved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(answers), respondentName, row.id);

  res.set('Cache-Control', 'no-store');
  res.json({ response: serialize(getByToken(req.params.token)) });
});

module.exports = router;
