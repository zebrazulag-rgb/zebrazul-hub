const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const DEFAULT_YEAR = 2027;
const STAGES = [
  { key: 'base_validated', name: 'Base validada', short: 'Base', color: 'slate', description: 'Aluno, família, turma, condição e contatos conferidos.' },
  { key: 'health_classified', name: 'Saúde classificada', short: 'Saúde', color: 'cyan', description: 'Risco e intenção definidos.' },
  { key: 'eligible', name: 'Elegível', short: 'Elegível', color: 'blue', description: 'Vaga, pendências e política verificadas.' },
  { key: 'proposal_sent', name: 'Proposta enviada', short: 'Proposta', color: 'indigo', description: 'Condição e prazo apresentados.' },
  { key: 'contact_confirmed', name: 'Contato confirmado', short: 'Contato', color: 'violet', description: 'Família recebeu e compreendeu.' },
  { key: 'in_decision', name: 'Em decisão', short: 'Decisão', color: 'amber', description: 'Próxima ação e data registradas.' },
  { key: 'positive_intent', name: 'Intenção positiva', short: 'Intenção +', color: 'orange', description: 'Confirmação verbal pendente de formalização.' },
  { key: 'concluded', name: 'Rematrícula concluída', short: 'Concluída', color: 'emerald', description: 'Contrato, documentos e financeiro confirmados.' },
  { key: 'not_renewed', name: 'Não renovada', short: 'Saída', color: 'rose', description: 'Motivo e destino registrados.' },
];
const STAGE_KEYS = new Set(STAGES.map((stage) => stage.key));
const FINAL_STAGES = new Set(['concluded', 'not_renewed']);

function normalizeText(value, max = 5000) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null) {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null) {
  const number = normalizeNumber(value, min, max, fallback);
  return number == null ? fallback : Math.round(number);
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' ? 1 : 0;
}

function normalizeDate(value) {
  const text = normalizeText(value, 32);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : text.slice(0, 10);
}

function normalizeDateTime(value) {
  const text = normalizeText(value, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isBeeName(value) {
  const name = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return name === 'bee' || name.startsWith('bee ') || name.includes('bee christian') || name.includes('bee light');
}

function resolveScope(req, requestedClientId) {
  const clientId = req.user.role === 'client' ? Number(req.user.client_id) : Number(requestedClientId);
  if (!clientId) return { error: 'Selecione a Bee para abrir Rematrículas.' };
  if (!canAccessClient(req.user, clientId)) return { error: 'Você não possui acesso a este cliente.', status: 403 };
  const client = db.prepare('SELECT id, agency_id, name, logo_color, avatar_data FROM clients WHERE id = ? AND agency_id = ? AND status != ?')
    .get(clientId, req.user.agency_id, 'archived');
  if (!client) return { error: 'Cliente não encontrado.', status: 404 };
  if (!isBeeName(client.name)) return { error: 'O módulo de Rematrículas está disponível somente para a Bee.', status: 403 };
  return { clientId, client };
}

function campaignYear(value) {
  return normalizeInteger(value, 2025, 2100, DEFAULT_YEAR) || DEFAULT_YEAR;
}

function ensureCampaign(agencyId, clientId, year, userId) {
  let campaign = db.prepare(`
    SELECT * FROM reenrollment_campaigns
    WHERE agency_id = ? AND client_id = ? AND campaign_year = ?
  `).get(agencyId, clientId, year);
  if (campaign) return campaign;

  const info = db.prepare(`
    INSERT INTO reenrollment_campaigns (
      agency_id, client_id, campaign_year, name, target_rate,
      target_classified_rate, target_unexplained_losses, created_by
    ) VALUES (?, ?, ?, ?, 92, 100, 0, ?)
  `).run(agencyId, clientId, year, `Rematrículas ${year}`, userId);
  campaign = db.prepare('SELECT * FROM reenrollment_campaigns WHERE id = ?').get(info.lastInsertRowid);
  return campaign;
}

function campaignForRequest(req, clientId, year = DEFAULT_YEAR) {
  return ensureCampaign(req.user.agency_id, clientId, campaignYear(year), req.user.id);
}

function campaignUsers(agencyId, clientId) {
  return db.prepare(`
    SELECT DISTINCT u.id, u.name, u.role, u.avatar_color, u.avatar_data,
           u.is_operations_head, u.is_commercial_team
    FROM users u
    LEFT JOIN user_client_access uca ON uca.user_id = u.id AND uca.client_id = ?
    WHERE u.agency_id = ?
      AND (
        u.role = 'admin'
        OR u.is_operations_head = 1
        OR (u.role = 'client' AND u.client_id = ?)
        OR (u.role = 'team' AND uca.client_id = ?)
      )
    ORDER BY CASE WHEN u.role = 'client' THEN 1 WHEN u.role = 'admin' THEN 2 ELSE 3 END, u.name
  `).all(clientId, agencyId, clientId, clientId).map((row) => ({
    ...row,
    is_operations_head: Number(row.is_operations_head) === 1,
    is_commercial_team: Number(row.is_commercial_team) === 1,
  }));
}

function ensureOwner(ownerUserId, agencyId, clientId) {
  const owner = normalizeInteger(ownerUserId, 1, Number.MAX_SAFE_INTEGER, null);
  if (!owner) return null;
  return campaignUsers(agencyId, clientId).some((user) => Number(user.id) === owner) ? owner : null;
}

function normalizeStringArray(value) {
  const array = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;\n|]+/)
      : [];
  return [...new Set(array.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 50);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function riskFromScores(scores) {
  const values = [scores.experience, scores.intention, scores.financial, scores.behavior];
  if (values.some((value) => value == null || !Number.isFinite(Number(value)))) {
    return { score: null, band: 'unclassified' };
  }
  const score = Number(scores.experience) + Number(scores.intention) + Number(scores.financial) + Number(scores.behavior);
  if (score <= 2) return { score, band: 'promoter' };
  if (score <= 4) return { score, band: 'neutral' };
  if (score <= 6) return { score, band: 'undecided' };
  return { score, band: 'high_risk' };
}

function normalizedFamilyPayload(payload, existing = {}) {
  const scoreExperience = normalizeInteger(payload.score_experience ?? existing.score_experience, 0, 3, null);
  const scoreIntention = normalizeInteger(payload.score_intention ?? existing.score_intention, 0, 3, null);
  const scoreFinancial = normalizeInteger(payload.score_financial ?? existing.score_financial, 0, 2, null);
  const scoreBehavior = normalizeInteger(payload.score_behavior ?? existing.score_behavior, 0, 2, null);
  const risk = riskFromScores({
    experience: scoreExperience,
    intention: scoreIntention,
    financial: scoreFinancial,
    behavior: scoreBehavior,
  });

  const stage = STAGE_KEYS.has(String(payload.stage_key || existing.stage_key || 'base_validated'))
    ? String(payload.stage_key || existing.stage_key || 'base_validated')
    : 'base_validated';
  const students = normalizeStringArray(payload.student_names ?? parseJsonArray(existing.student_names_json));
  const studentCount = normalizeInteger(payload.students_count ?? existing.students_count, 1, 20, Math.max(1, students.length || 1));
  const signals = normalizeStringArray(payload.signals ?? parseJsonArray(existing.signals_json));

  return {
    family_name: normalizeText(payload.family_name ?? existing.family_name, 180),
    responsible_name: normalizeText(payload.responsible_name ?? existing.responsible_name, 180),
    phone: normalizeText(payload.phone ?? existing.phone, 80),
    email: normalizeText(payload.email ?? existing.email, 180),
    unit: normalizeText(payload.unit ?? existing.unit, 80),
    current_class: normalizeText(payload.current_class ?? existing.current_class, 120),
    future_class: normalizeText(payload.future_class ?? existing.future_class, 120),
    student_names_json: JSON.stringify(students),
    students_count: studentCount,
    financial_profile: normalizeText(payload.financial_profile ?? existing.financial_profile, 64) || 'paying',
    scholarship_percent: normalizeNumber(payload.scholarship_percent ?? existing.scholarship_percent, 0, 100, 0) || 0,
    monthly_value: normalizeNumber(payload.monthly_value ?? existing.monthly_value, 0, 1000000, 0) || 0,
    financial_notes: normalizeText(payload.financial_notes ?? existing.financial_notes, 3000),
    pendencies: normalizeText(payload.pendencies ?? existing.pendencies, 3000),
    stage_key: stage,
    intention: normalizeText(payload.intention ?? existing.intention, 64),
    objection_type: normalizeText(payload.objection_type ?? existing.objection_type, 80),
    objection_notes: normalizeText(payload.objection_notes ?? existing.objection_notes, 3000),
    signals_json: JSON.stringify(signals),
    score_experience: scoreExperience,
    score_intention: scoreIntention,
    score_financial: scoreFinancial,
    score_behavior: scoreBehavior,
    risk_score: risk.score,
    risk_band: risk.band,
    owner_user_id: payload.owner_user_id ?? existing.owner_user_id,
    next_action: normalizeText(payload.next_action ?? existing.next_action, 500),
    next_action_date: normalizeDate(payload.next_action_date ?? existing.next_action_date),
    decision_deadline: normalizeDate(payload.decision_deadline ?? existing.decision_deadline),
    proposal_amount: normalizeNumber(payload.proposal_amount ?? existing.proposal_amount, 0, 1000000, 0) || 0,
    proposal_sent_at: normalizeDateTime(payload.proposal_sent_at ?? existing.proposal_sent_at),
    last_contact_at: normalizeDateTime(payload.last_contact_at ?? existing.last_contact_at),
    exit_reason: normalizeText(payload.exit_reason ?? existing.exit_reason, 300),
    exit_destination: normalizeText(payload.exit_destination ?? existing.exit_destination, 300),
    vacancy_confirmed: normalizeBoolean(payload.vacancy_confirmed ?? existing.vacancy_confirmed),
    financial_clearance: normalizeBoolean(payload.financial_clearance ?? existing.financial_clearance),
    policy_clearance: normalizeBoolean(payload.policy_clearance ?? existing.policy_clearance),
    contract_confirmed: normalizeBoolean(payload.contract_confirmed ?? existing.contract_confirmed),
    documents_confirmed: normalizeBoolean(payload.documents_confirmed ?? existing.documents_confirmed),
    finance_confirmed: normalizeBoolean(payload.finance_confirmed ?? existing.finance_confirmed),
    notes: normalizeText(payload.notes ?? existing.notes, 8000),
  };
}

function validateStage(payload) {
  if (payload.stage_key === 'not_renewed') {
    if (!payload.exit_reason) return 'Registre o motivo da não renovação antes de encerrar a família.';
    return null;
  }

  const index = STAGES.findIndex((stage) => stage.key === payload.stage_key);
  if (index >= 1 && (payload.risk_score == null || !payload.intention)) {
    return 'Para avançar da base validada, registre os quatro blocos do score e a intenção da família.';
  }
  if (index >= 2 && (!payload.vacancy_confirmed || !payload.financial_clearance || !payload.policy_clearance)) {
    return 'Para avançar como elegível, confirme vaga, pendências financeiras e política/condições.';
  }
  if (index >= 3 && (!payload.proposal_sent_at || !payload.decision_deadline)) {
    return 'Proposta enviada exige data de envio e prazo real de decisão.';
  }
  if (index >= 4 && !payload.last_contact_at) {
    return 'Contato confirmado exige ao menos um contato registrado com a família.';
  }
  if ((payload.stage_key === 'in_decision' || payload.stage_key === 'positive_intent') && (!payload.next_action || !payload.next_action_date)) {
    return 'Em decisão exige próxima ação e data registradas.';
  }
  if (payload.stage_key === 'positive_intent' && payload.intention !== 'positive') {
    return 'Intenção positiva exige intenção da família marcada como positiva.';
  }
  if (payload.stage_key === 'concluded' && (!payload.contract_confirmed || !payload.documents_confirmed || !payload.finance_confirmed)) {
    return 'Rematrícula concluída exige contrato, documentos e financeiro confirmados.';
  }
  return null;
}

function familySelect(where = '') {
  return `
    SELECT f.*,
           u.name AS owner_name, u.avatar_color AS owner_color, u.avatar_data AS owner_avatar,
           creator.name AS created_by_name,
           (SELECT COUNT(*) FROM reenrollment_activities a WHERE a.family_id = f.id AND a.agency_id = f.agency_id) AS activity_count
    FROM reenrollment_families f
    LEFT JOIN users u ON u.id = f.owner_user_id AND u.agency_id = f.agency_id
    LEFT JOIN users creator ON creator.id = f.created_by AND creator.agency_id = f.agency_id
    ${where}
  `;
}

function serializeFamily(row) {
  if (!row) return null;
  return {
    ...row,
    student_names: parseJsonArray(row.student_names_json),
    signals: parseJsonArray(row.signals_json),
    vacancy_confirmed: Number(row.vacancy_confirmed) === 1,
    financial_clearance: Number(row.financial_clearance) === 1,
    policy_clearance: Number(row.policy_clearance) === 1,
    contract_confirmed: Number(row.contract_confirmed) === 1,
    documents_confirmed: Number(row.documents_confirmed) === 1,
    finance_confirmed: Number(row.finance_confirmed) === 1,
  };
}

function getFamily(id, agencyId, campaignId) {
  return serializeFamily(db.prepare(familySelect('WHERE f.id = ? AND f.agency_id = ? AND f.campaign_id = ?'))
    .get(Number(id), agencyId, campaignId));
}

function listFamilies(agencyId, campaignId) {
  return db.prepare(familySelect('WHERE f.agency_id = ? AND f.campaign_id = ? ORDER BY f.updated_at DESC, f.id DESC'))
    .all(agencyId, campaignId).map(serializeFamily);
}

function dashboardFor(families, targetRate) {
  const baseStudents = families.reduce((sum, family) => sum + Number(family.students_count || 0), 0);
  const concluded = families.filter((family) => family.stage_key === 'concluded');
  const notRenewed = families.filter((family) => family.stage_key === 'not_renewed');
  const concludedStudents = concluded.reduce((sum, family) => sum + Number(family.students_count || 0), 0);
  const notRenewedStudents = notRenewed.reduce((sum, family) => sum + Number(family.students_count || 0), 0);
  const classified = families.filter((family) => family.risk_score != null);
  const highRisk = families.filter((family) => family.risk_band === 'high_risk' && !FINAL_STAGES.has(family.stage_key));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = families.filter((family) => !FINAL_STAGES.has(family.stage_key) && family.next_action_date && String(family.next_action_date).slice(0, 10) < today);
  const withoutNextAction = families.filter((family) => !FINAL_STAGES.has(family.stage_key) && (!family.next_action || !family.next_action_date));
  const unexplainedLosses = notRenewed.filter((family) => !family.exit_reason);
  const protectedRevenue = concluded.reduce((sum, family) => sum + Number(family.monthly_value || 0), 0);
  const targetStudents = Math.ceil(baseStudents * (Number(targetRate || 92) / 100));

  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage.key, { families: 0, students: 0 }]));
  const riskCounts = { unclassified: 0, promoter: 0, neutral: 0, undecided: 0, high_risk: 0 };
  const unitMap = new Map();

  for (const family of families) {
    if (stageCounts[family.stage_key]) {
      stageCounts[family.stage_key].families += 1;
      stageCounts[family.stage_key].students += Number(family.students_count || 0);
    }
    riskCounts[family.risk_band || 'unclassified'] = Number(riskCounts[family.risk_band || 'unclassified'] || 0) + 1;
    const unit = family.unit || 'Sem unidade';
    const current = unitMap.get(unit) || { unit, families: 0, students: 0, concluded_students: 0, not_renewed_students: 0 };
    current.families += 1;
    current.students += Number(family.students_count || 0);
    if (family.stage_key === 'concluded') current.concluded_students += Number(family.students_count || 0);
    if (family.stage_key === 'not_renewed') current.not_renewed_students += Number(family.students_count || 0);
    unitMap.set(unit, current);
  }

  return {
    families: families.length,
    base_students: baseStudents,
    target_students: targetStudents,
    target_rate: Number(targetRate || 92),
    concluded_families: concluded.length,
    concluded_students: concludedStudents,
    not_renewed_families: notRenewed.length,
    not_renewed_students: notRenewedStudents,
    retention_rate: baseStudents ? (concludedStudents / baseStudents) * 100 : 0,
    target_progress: targetStudents ? Math.min(100, (concludedStudents / targetStudents) * 100) : 0,
    classified_families: classified.length,
    classified_rate: families.length ? (classified.length / families.length) * 100 : 0,
    high_risk_families: highRisk.length,
    overdue_actions: overdue.length,
    without_next_action: withoutNextAction.length,
    unexplained_losses: unexplainedLosses.length,
    protected_revenue: protectedRevenue,
    stage_counts: stageCounts,
    risk_counts: riskCounts,
    units: [...unitMap.values()].map((unit) => ({
      ...unit,
      retention_rate: unit.students ? (unit.concluded_students / unit.students) * 100 : 0,
    })).sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR')),
  };
}

function addActivity(agencyId, campaignId, familyId, userId, type, description) {
  const text = normalizeText(description, 8000);
  if (!text) return;
  const allowedTypes = new Set(['note', 'call', 'whatsapp', 'meeting', 'email', 'stage_change', 'system']);
  const activityType = allowedTypes.has(String(type)) ? String(type) : 'note';
  db.prepare(`
    INSERT INTO reenrollment_activities (agency_id, campaign_id, family_id, created_by, activity_type, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(agencyId, campaignId, familyId, userId, activityType, text);
}

router.get('/context', (req, res) => {
  const scope = resolveScope(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.query.year);
  const families = listFamilies(req.user.agency_id, campaign.id);
  return res.json({
    client: scope.client,
    campaign,
    stages: STAGES,
    families,
    users: campaignUsers(req.user.agency_id, scope.clientId),
    dashboard: dashboardFor(families, campaign.target_rate),
  });
});

router.patch('/campaign', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const targetRate = normalizeNumber(req.body.target_rate, 0, 100, campaign.target_rate) ?? campaign.target_rate;
  const name = normalizeText(req.body.name, 180) || campaign.name;
  const status = ['planning', 'active', 'closed'].includes(String(req.body.status)) ? String(req.body.status) : campaign.status;
  db.prepare(`
    UPDATE reenrollment_campaigns
    SET name = ?, target_rate = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(name, targetRate, status, campaign.id, req.user.agency_id);
  const updated = db.prepare('SELECT * FROM reenrollment_campaigns WHERE id = ?').get(campaign.id);
  const families = listFamilies(req.user.agency_id, campaign.id);
  res.json({ campaign: updated, dashboard: dashboardFor(families, updated.target_rate) });
});

router.get('/families/:id/activities', (req, res) => {
  const scope = resolveScope(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.query.year);
  const family = getFamily(req.params.id, req.user.agency_id, campaign.id);
  if (!family) return res.status(404).json({ error: 'Família não encontrada.' });
  const activities = db.prepare(`
    SELECT a.*, u.name AS created_by_name, u.avatar_color AS created_by_color, u.avatar_data AS created_by_avatar
    FROM reenrollment_activities a
    LEFT JOIN users u ON u.id = a.created_by AND u.agency_id = a.agency_id
    WHERE a.agency_id = ? AND a.campaign_id = ? AND a.family_id = ?
    ORDER BY a.created_at DESC, a.id DESC
  `).all(req.user.agency_id, campaign.id, family.id);
  res.json({ activities });
});

router.post('/families', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const payload = normalizedFamilyPayload(req.body);
  if (!payload.family_name) return res.status(400).json({ error: 'Informe o nome da família.' });
  const owner = ensureOwner(payload.owner_user_id, req.user.agency_id, scope.clientId);
  const stageError = validateStage({ ...payload, owner_user_id: owner });
  if (stageError) return res.status(400).json({ error: stageError });

  const info = db.prepare(`
    INSERT INTO reenrollment_families (
      agency_id, client_id, campaign_id, created_by, owner_user_id,
      family_name, responsible_name, phone, email, unit, current_class, future_class,
      student_names_json, students_count, financial_profile, scholarship_percent, monthly_value,
      financial_notes, pendencies, stage_key, intention, objection_type, objection_notes, signals_json,
      score_experience, score_intention, score_financial, score_behavior, risk_score, risk_band,
      next_action, next_action_date, decision_deadline, proposal_amount, proposal_sent_at, last_contact_at,
      exit_reason, exit_destination, vacancy_confirmed, financial_clearance, policy_clearance,
      contract_confirmed, documents_confirmed, finance_confirmed, notes
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    req.user.agency_id, scope.clientId, campaign.id, req.user.id, owner,
    payload.family_name, payload.responsible_name, payload.phone, payload.email, payload.unit, payload.current_class, payload.future_class,
    payload.student_names_json, payload.students_count, payload.financial_profile, payload.scholarship_percent, payload.monthly_value,
    payload.financial_notes, payload.pendencies, payload.stage_key, payload.intention, payload.objection_type, payload.objection_notes, payload.signals_json,
    payload.score_experience, payload.score_intention, payload.score_financial, payload.score_behavior, payload.risk_score, payload.risk_band,
    payload.next_action, payload.next_action_date, payload.decision_deadline, payload.proposal_amount, payload.proposal_sent_at, payload.last_contact_at,
    payload.exit_reason, payload.exit_destination, payload.vacancy_confirmed, payload.financial_clearance, payload.policy_clearance,
    payload.contract_confirmed, payload.documents_confirmed, payload.finance_confirmed, payload.notes,
  );
  addActivity(req.user.agency_id, campaign.id, info.lastInsertRowid, req.user.id, 'system', 'Rematrícula criada no CRM.');
  res.status(201).json({ family: getFamily(info.lastInsertRowid, req.user.agency_id, campaign.id) });
});

router.put('/families/:id', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const existing = getFamily(req.params.id, req.user.agency_id, campaign.id);
  if (!existing) return res.status(404).json({ error: 'Família não encontrada.' });
  const payload = normalizedFamilyPayload(req.body, existing);
  if (!payload.family_name) return res.status(400).json({ error: 'Informe o nome da família.' });
  const owner = ensureOwner(payload.owner_user_id, req.user.agency_id, scope.clientId);
  const stageError = validateStage({ ...payload, owner_user_id: owner });
  if (stageError) return res.status(400).json({ error: stageError });

  db.prepare(`
    UPDATE reenrollment_families SET
      owner_user_id = ?, family_name = ?, responsible_name = ?, phone = ?, email = ?, unit = ?,
      current_class = ?, future_class = ?, student_names_json = ?, students_count = ?, financial_profile = ?,
      scholarship_percent = ?, monthly_value = ?, financial_notes = ?, pendencies = ?, stage_key = ?,
      intention = ?, objection_type = ?, objection_notes = ?, signals_json = ?, score_experience = ?,
      score_intention = ?, score_financial = ?, score_behavior = ?, risk_score = ?, risk_band = ?,
      next_action = ?, next_action_date = ?, decision_deadline = ?, proposal_amount = ?, proposal_sent_at = ?,
      last_contact_at = ?, exit_reason = ?, exit_destination = ?, vacancy_confirmed = ?, financial_clearance = ?,
      policy_clearance = ?, contract_confirmed = ?, documents_confirmed = ?, finance_confirmed = ?, notes = ?,
      concluded_at = CASE WHEN ? = 'concluded' THEN COALESCE(concluded_at, datetime('now')) ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND campaign_id = ?
  `).run(
    owner, payload.family_name, payload.responsible_name, payload.phone, payload.email, payload.unit,
    payload.current_class, payload.future_class, payload.student_names_json, payload.students_count, payload.financial_profile,
    payload.scholarship_percent, payload.monthly_value, payload.financial_notes, payload.pendencies, payload.stage_key,
    payload.intention, payload.objection_type, payload.objection_notes, payload.signals_json, payload.score_experience,
    payload.score_intention, payload.score_financial, payload.score_behavior, payload.risk_score, payload.risk_band,
    payload.next_action, payload.next_action_date, payload.decision_deadline, payload.proposal_amount, payload.proposal_sent_at,
    payload.last_contact_at, payload.exit_reason, payload.exit_destination, payload.vacancy_confirmed, payload.financial_clearance,
    payload.policy_clearance, payload.contract_confirmed, payload.documents_confirmed, payload.finance_confirmed, payload.notes,
    payload.stage_key, existing.id, req.user.agency_id, campaign.id,
  );

  if (existing.stage_key !== payload.stage_key) {
    const from = STAGES.find((stage) => stage.key === existing.stage_key)?.name || existing.stage_key;
    const to = STAGES.find((stage) => stage.key === payload.stage_key)?.name || payload.stage_key;
    addActivity(req.user.agency_id, campaign.id, existing.id, req.user.id, 'stage_change', `Etapa alterada de “${from}” para “${to}”.`);
  }
  res.json({ family: getFamily(existing.id, req.user.agency_id, campaign.id) });
});

router.patch('/families/:id/stage', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const existing = getFamily(req.params.id, req.user.agency_id, campaign.id);
  if (!existing) return res.status(404).json({ error: 'Família não encontrada.' });
  const payload = normalizedFamilyPayload({ ...existing, stage_key: req.body.stage_key }, existing);
  const stageError = validateStage(payload);
  if (stageError) return res.status(400).json({ error: stageError });
  if (existing.stage_key === payload.stage_key) return res.json({ family: existing });

  db.prepare(`
    UPDATE reenrollment_families
    SET stage_key = ?, concluded_at = CASE WHEN ? = 'concluded' THEN COALESCE(concluded_at, datetime('now')) ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND campaign_id = ?
  `).run(payload.stage_key, payload.stage_key, existing.id, req.user.agency_id, campaign.id);
  const from = STAGES.find((stage) => stage.key === existing.stage_key)?.name || existing.stage_key;
  const to = STAGES.find((stage) => stage.key === payload.stage_key)?.name || payload.stage_key;
  addActivity(req.user.agency_id, campaign.id, existing.id, req.user.id, 'stage_change', `Etapa alterada de “${from}” para “${to}”.`);
  res.json({ family: getFamily(existing.id, req.user.agency_id, campaign.id) });
});

router.post('/families/:id/activities', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const family = getFamily(req.params.id, req.user.agency_id, campaign.id);
  if (!family) return res.status(404).json({ error: 'Família não encontrada.' });
  const description = normalizeText(req.body.description, 8000);
  if (!description) return res.status(400).json({ error: 'Escreva o registro do contato.' });
  addActivity(req.user.agency_id, campaign.id, family.id, req.user.id, req.body.activity_type, description);
  const now = new Date().toISOString();
  if (['call', 'whatsapp', 'meeting', 'email'].includes(String(req.body.activity_type))) {
    db.prepare('UPDATE reenrollment_families SET last_contact_at = ?, updated_at = datetime(\'now\') WHERE id = ? AND agency_id = ?')
      .run(now, family.id, req.user.agency_id);
  }
  res.status(201).json({ ok: true, family: getFamily(family.id, req.user.agency_id, campaign.id) });
});

router.post('/families/import', (req, res) => {
  const scope = resolveScope(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.body.year);
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 1500) : [];
  if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha válida para importar.' });

  const insert = db.prepare(`
    INSERT INTO reenrollment_families (
      agency_id, client_id, campaign_id, created_by, owner_user_id,
      family_name, responsible_name, phone, email, unit, current_class, future_class,
      student_names_json, students_count, financial_profile, scholarship_percent, monthly_value,
      financial_notes, pendencies, stage_key, intention, objection_type, objection_notes, signals_json,
      score_experience, score_intention, score_financial, score_behavior, risk_score, risk_band,
      next_action, next_action_date, decision_deadline, proposal_amount, proposal_sent_at, last_contact_at,
      exit_reason, exit_destination, vacancy_confirmed, financial_clearance, policy_clearance,
      contract_confirmed, documents_confirmed, finance_confirmed, notes
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  let imported = 0;
  let skipped = 0;
  const errors = [];
  const runImport = db.transaction(() => {
    rows.forEach((row, index) => {
      const payload = normalizedFamilyPayload(row || {});
      if (!payload.family_name) {
        skipped += 1;
        if (errors.length < 15) errors.push(`Linha ${index + 2}: nome da família ausente.`);
        return;
      }
      const owner = ensureOwner(payload.owner_user_id, req.user.agency_id, scope.clientId);
      try {
        const info = insert.run(
          req.user.agency_id, scope.clientId, campaign.id, req.user.id, owner,
          payload.family_name, payload.responsible_name, payload.phone, payload.email, payload.unit, payload.current_class, payload.future_class,
          payload.student_names_json, payload.students_count, payload.financial_profile, payload.scholarship_percent, payload.monthly_value,
          payload.financial_notes, payload.pendencies, payload.stage_key, payload.intention, payload.objection_type, payload.objection_notes, payload.signals_json,
          payload.score_experience, payload.score_intention, payload.score_financial, payload.score_behavior, payload.risk_score, payload.risk_band,
          payload.next_action, payload.next_action_date, payload.decision_deadline, payload.proposal_amount, payload.proposal_sent_at, payload.last_contact_at,
          payload.exit_reason, payload.exit_destination, payload.vacancy_confirmed, payload.financial_clearance, payload.policy_clearance,
          payload.contract_confirmed, payload.documents_confirmed, payload.finance_confirmed, payload.notes,
        );
        addActivity(req.user.agency_id, campaign.id, info.lastInsertRowid, req.user.id, 'system', 'Rematrícula importada para o CRM.');
        imported += 1;
      } catch (error) {
        skipped += 1;
        if (errors.length < 15) errors.push(`Linha ${index + 2}: ${error.message}`);
      }
    });
  });
  runImport();
  res.status(201).json({ imported, skipped, errors });
});

router.delete('/families/:id', (req, res) => {
  const scope = resolveScope(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const campaign = campaignForRequest(req, scope.clientId, req.query.year);
  const family = getFamily(req.params.id, req.user.agency_id, campaign.id);
  if (!family) return res.status(404).json({ error: 'Família não encontrada.' });
  if (req.user.role !== 'admin' && req.user.role !== 'client') return res.status(403).json({ error: 'Somente administrador ou cliente Bee pode excluir registros.' });
  db.prepare('DELETE FROM reenrollment_families WHERE id = ? AND agency_id = ? AND campaign_id = ?')
    .run(family.id, req.user.agency_id, campaign.id);
  res.json({ ok: true });
});

module.exports = router;
