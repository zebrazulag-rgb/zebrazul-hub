const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS bee_family_survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER,
    respondent_name TEXT,
    nps_score INTEGER NOT NULL,
    nps_comment TEXT,
    event_overall INTEGER NOT NULL,
    event_organization INTEGER NOT NULL,
    event_team INTEGER NOT NULL,
    child_experience INTEGER NOT NULL,
    expectations TEXT NOT NULL,
    favorite_moment TEXT NOT NULL,
    improvements TEXT NOT NULL,
    continue_events TEXT NOT NULL,
    source TEXT DEFAULT 'npsbee-dia-dos-pais-2026',
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const EXPECTATIONS = new Set([
  'Superou minhas expectativas',
  'Correspondeu às expectativas',
  'Correspondeu parcialmente',
  'Não correspondeu',
]);

const CONTINUE_EVENTS = new Set(['Com certeza', 'Sim', 'Talvez', 'Não']);

function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function integerBetween(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

router.post('/responses', (req, res) => {
  const body = req.body || {};

  const npsScore = integerBetween(body.nps_score, 0, 10);
  const eventOverall = integerBetween(body.event_overall, 1, 5);
  const eventOrganization = integerBetween(body.event_organization, 1, 5);
  const eventTeam = integerBetween(body.event_team, 1, 5);
  const childExperience = integerBetween(body.child_experience, 1, 5);
  const expectations = cleanText(body.expectations, 120);
  const favoriteMoment = cleanText(body.favorite_moment);
  const improvements = cleanText(body.improvements);
  const continueEvents = cleanText(body.continue_events, 80);

  if (npsScore === null) return res.status(400).json({ error: 'Nota NPS inválida.' });
  if ([eventOverall, eventOrganization, eventTeam, childExperience].some((value) => value === null)) {
    return res.status(400).json({ error: 'Preencha as avaliações do evento de 1 a 5.' });
  }
  if (!EXPECTATIONS.has(expectations)) return res.status(400).json({ error: 'Resposta de expectativa inválida.' });
  if (!favoriteMoment) return res.status(400).json({ error: 'Informe o momento que você mais gostou.' });
  if (!improvements) return res.status(400).json({ error: 'Informe o que poderia ser melhorado.' });
  if (!CONTINUE_EVENTS.has(continueEvents)) return res.status(400).json({ error: 'Resposta sobre continuidade dos eventos inválida.' });

  const respondentName = cleanText(body.respondent_name, 120) || null;
  const npsComment = cleanText(body.nps_comment, 1500) || null;
  const source = cleanText(body.source, 120) || 'npsbee-dia-dos-pais-2026';

  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = forwardedFor || req.ip || null;
  const userAgent = cleanText(req.headers['user-agent'], 500) || null;

  const info = db.prepare(`
    INSERT INTO bee_family_survey_responses (
      respondent_name,
      nps_score,
      nps_comment,
      event_overall,
      event_organization,
      event_team,
      child_experience,
      expectations,
      favorite_moment,
      improvements,
      continue_events,
      source,
      ip_address,
      user_agent
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    respondentName,
    npsScore,
    npsComment,
    eventOverall,
    eventOrganization,
    eventTeam,
    childExperience,
    expectations,
    favoriteMoment,
    improvements,
    continueEvents,
    source,
    ipAddress,
    userAgent
  );

  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.get('/responses', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT
      id,
      respondent_name,
      nps_score,
      nps_comment,
      event_overall,
      event_organization,
      event_team,
      child_experience,
      expectations,
      favorite_moment,
      improvements,
      continue_events,
      source,
      created_at
    FROM bee_family_survey_responses
    ORDER BY id DESC
    LIMIT 1000
  `).all();

  res.json({ responses: rows });
});

router.get('/summary', authRequired, (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      ROUND(AVG(nps_score), 2) AS average_nps,
      ROUND(AVG(event_overall), 2) AS average_event_overall,
      ROUND(AVG(event_organization), 2) AS average_event_organization,
      ROUND(AVG(event_team), 2) AS average_event_team,
      ROUND(AVG(child_experience), 2) AS average_child_experience
    FROM bee_family_survey_responses
  `).get();

  const promoters = db.prepare('SELECT COUNT(*) AS total FROM bee_family_survey_responses WHERE nps_score >= 9').get().total;
  const detractors = db.prepare('SELECT COUNT(*) AS total FROM bee_family_survey_responses WHERE nps_score <= 6').get().total;
  const total = Number(totals.total || 0);
  const nps = total ? Math.round(((Number(promoters) - Number(detractors)) / total) * 100) : 0;

  const expectations = db.prepare(`
    SELECT expectations AS label, COUNT(*) AS total
    FROM bee_family_survey_responses
    GROUP BY expectations
    ORDER BY total DESC
  `).all();

  const continueEvents = db.prepare(`
    SELECT continue_events AS label, COUNT(*) AS total
    FROM bee_family_survey_responses
    GROUP BY continue_events
    ORDER BY total DESC
  `).all();

  res.json({
    ...totals,
    nps,
    expectations,
    continue_events: continueEvents,
  });
});

module.exports = router;
