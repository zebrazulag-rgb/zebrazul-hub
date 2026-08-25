const express = require('express');
const db = require('../db/database');
const { resolveAgency } = require('../services/tenant');

const router = express.Router();

function cleanText(value, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function requiredInteger(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '').slice(-11);
}

function isBeeName(value) {
  const name = normalizeName(value);
  return name === 'bee' || name.startsWith('bee ') || name.includes('bee christian') || name.includes('bee light');
}

function scale(value, weight) {
  return ((value - 1) / 4) * weight;
}

function calculateHealth(payload) {
  const healthScore = Math.round(
    scale(payload.experience, 10) +
    scale(payload.wellbeing, 15) +
    scale(payload.development, 10) +
    scale(payload.christian_alignment, 10) +
    scale(payload.communication, 10) +
    scale(payload.support, 10) +
    scale(payload.value_perception, 10) +
    scale(payload.future_fit, 10) +
    scale(payload.relationship, 5) +
    payload.nps
  );

  const signals = [];
  if (payload.wellbeing <= 2) signals.push('wellbeing');
  if (payload.christian_alignment <= 2) signals.push('christian_alignment');
  if (payload.value_perception <= 2) signals.push('value_perception');
  if (payload.future_fit <= 2) signals.push('future_fit');
  if (payload.nps <= 6) signals.push('detractor');
  if (payload.contact_requested) signals.push('contact_requested');

  let riskLevel = healthScore >= 85 ? 'strong' : healthScore >= 70 ? 'stable' : healthScore >= 55 ? 'attention' : 'high';
  if (signals.length >= 2 && (riskLevel === 'strong' || riskLevel === 'stable')) riskLevel = 'attention';
  if (signals.length >= 3 || payload.wellbeing === 1 || payload.future_fit === 1) riskLevel = 'high';

  return { healthScore, riskLevel, signals };
}

function parseStudentNames(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findFamily(client, payload) {
  const responsible = normalizeName(payload.responsible_name);
  const student = normalizeName(payload.student_name);
  const phone = normalizePhone(payload.whatsapp);
  const candidates = db.prepare(`
    SELECT id, responsible_name, phone, student_names_json
    FROM reenrollment_families
    WHERE agency_id = ? AND client_id = ?
    ORDER BY updated_at DESC
  `).all(client.agency_id, client.id);

  const exact = candidates.find((family) => {
    const familyStudents = parseStudentNames(family.student_names_json).map(normalizeName);
    const sameStudent = student && familyStudents.includes(student);
    const sameResponsible = responsible && normalizeName(family.responsible_name) === responsible;
    const samePhone = phone && normalizePhone(family.phone) === phone;
    return sameStudent && (sameResponsible || samePhone);
  });
  if (exact) return exact.id;

  const studentOnly = candidates.find((family) => parseStudentNames(family.student_names_json).map(normalizeName).includes(student));
  return studentOnly?.id || null;
}

router.post('/', (req, res) => {
  try {
    if (req.get('X-Survey-Source') !== 'bee-family-experience') {
      return res.status(403).json({ error: 'Origem da pesquisa não reconhecida.' });
    }

    const payload = {
      submission_id: cleanText(req.body?.submission_id, 80),
      responsible_name: cleanText(req.body?.responsible_name, 180),
      student_name: cleanText(req.body?.student_name, 180),
      whatsapp: cleanText(req.body?.whatsapp, 80),
      email: cleanText(req.body?.email, 180),
      unit: cleanText(req.body?.unit, 80),
      school: cleanText(req.body?.school, 180),
      class_group: cleanText(req.body?.class_group, 120),
      experience: requiredInteger(req.body?.experience, 1, 5),
      wellbeing: requiredInteger(req.body?.wellbeing, 1, 5),
      development: requiredInteger(req.body?.development, 1, 5),
      christian_alignment: requiredInteger(req.body?.christian_alignment, 1, 5),
      communication: requiredInteger(req.body?.communication, 1, 5),
      support: requiredInteger(req.body?.support, 1, 5),
      value_perception: requiredInteger(req.body?.value_perception, 1, 5),
      future_fit: requiredInteger(req.body?.future_fit, 1, 5),
      relationship: requiredInteger(req.body?.relationship, 1, 5),
      nps: requiredInteger(req.body?.nps, 0, 10),
      trust_strength: cleanText(req.body?.trust_strength, 4000),
      improvement: cleanText(req.body?.improvement, 4000),
      contact_requested: req.body?.contact_requested === true || req.body?.contact_requested === 1,
      created_at: cleanText(req.body?.created_at, 64),
    };

    const requiredText = ['submission_id', 'responsible_name', 'student_name', 'whatsapp', 'unit', 'school', 'class_group'];
    const requiredScores = ['experience', 'wellbeing', 'development', 'christian_alignment', 'communication', 'support', 'value_perception', 'future_fit', 'relationship', 'nps'];
    if (requiredText.some((key) => !payload[key]) || requiredScores.some((key) => payload[key] == null)) {
      return res.status(400).json({ error: 'Resposta incompleta.' });
    }

    const existing = db.prepare('SELECT id FROM bee_family_survey_responses WHERE submission_id = ?').get(payload.submission_id);
    if (existing) return res.status(200).json({ ok: true, duplicate: true });

    const agency = resolveAgency(req);
    if (!agency) return res.status(404).json({ error: 'Agência não encontrada.' });

    const clients = db.prepare(`
      SELECT id, agency_id, name
      FROM clients
      WHERE agency_id = ? AND status != 'archived'
      ORDER BY id
    `).all(agency.id);
    const client = clients.find((item) => isBeeName(item.name));
    if (!client) return res.status(503).json({ error: 'Cliente Bee não configurado no ZebraHub.' });

    const health = calculateHealth(payload);
    const familyId = findFamily(client, payload);
    const receivedAt = payload.created_at && !Number.isNaN(new Date(payload.created_at).getTime())
      ? new Date(payload.created_at).toISOString()
      : new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO bee_family_survey_responses (
        submission_id, agency_id, client_id, family_id,
        responsible_name, student_name, whatsapp, email, unit, school, class_group,
        experience, wellbeing, development, christian_alignment, communication,
        support, value_perception, future_fit, relationship, nps,
        trust_strength, improvement, contact_requested,
        health_score, risk_level, risk_signals_json, received_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      payload.submission_id, client.agency_id, client.id, familyId,
      payload.responsible_name, payload.student_name, payload.whatsapp, payload.email,
      payload.unit, payload.school, payload.class_group,
      payload.experience, payload.wellbeing, payload.development, payload.christian_alignment,
      payload.communication, payload.support, payload.value_perception, payload.future_fit,
      payload.relationship, payload.nps, payload.trust_strength, payload.improvement,
      payload.contact_requested ? 1 : 0,
      health.healthScore, health.riskLevel, JSON.stringify(health.signals), receivedAt
    );

    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (error) {
    console.error('[Bee family survey] Falha ao receber resposta:', error);
    return res.status(500).json({ error: 'Não foi possível registrar a resposta.' });
  }
});

module.exports = router;
