const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { authRequired, canAccessClient, hydrateUserAccess } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');

const router = express.Router();
router.use(authRequired);

const ALLOWED_STAGE_COLORS = new Set(['blue', 'indigo', 'violet', 'amber', 'orange', 'emerald', 'rose', 'cyan', 'teal', 'pink', 'slate']);
const LEGACY_STAGE_KEYS = new Set(['new_lead', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost']);
const DEFAULT_STAGES = [
  { stage_key: 'new_lead', name: 'Novo lead', subtitle: 'Entrada', probability: 10, color_key: 'blue', position: 0, stage_type: 'open', is_system: 0 },
  { stage_key: 'contacted', name: 'Contato feito', subtitle: 'Conexão', probability: 20, color_key: 'indigo', position: 1, stage_type: 'open', is_system: 0 },
  { stage_key: 'meeting', name: 'Diagnóstico', subtitle: 'Leitura', probability: 35, color_key: 'violet', position: 2, stage_type: 'open', is_system: 0 },
  { stage_key: 'proposal', name: 'Proposta enviada', subtitle: 'Proposta', probability: 55, color_key: 'amber', position: 3, stage_type: 'open', is_system: 0 },
  { stage_key: 'negotiation', name: 'Negociação', subtitle: 'Decisão', probability: 75, color_key: 'orange', position: 4, stage_type: 'open', is_system: 0 },
  { stage_key: 'won', name: 'Negócio ganho', subtitle: 'Resultado', probability: 100, color_key: 'emerald', position: 5, stage_type: 'won', is_system: 1 },
  { stage_key: 'lost', name: 'Perdido', subtitle: 'Encerrado', probability: 0, color_key: 'rose', position: 6, stage_type: 'lost', is_system: 1 },
];

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function normalizeProbability(value, fallback = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(0, Math.min(100, Math.round(Number(fallback || 0))));
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizePriority(value) {
  const key = normalizeLookup(value);
  if (!key) return 'medium';
  if (['alta', 'alto', 'high', 'urgente'].includes(key)) return 'high';
  if (['baixa', 'baixo', 'low'].includes(key)) return 'low';
  if (['media', 'medio', 'medium', 'normal'].includes(key)) return 'medium';
  return key.slice(0, 30);
}

function normalizeImportMoney(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return normalizeMoney(value);
  let text = String(value).trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function normalizeImportDate(value) {
  const text = String(value || '').trim();
  if (!text) return { value: null, valid: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00`);
    return { value: Number.isNaN(date.getTime()) ? null : text, valid: !Number.isNaN(date.getTime()) };
  }
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) {
    const iso = `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
    const date = new Date(`${iso}T12:00:00`);
    return { value: Number.isNaN(date.getTime()) ? null : iso, valid: !Number.isNaN(date.getTime()) };
  }
  return { value: null, valid: false };
}

function meaningful(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function duplicateCandidates(row) {
  const candidates = [];
  const cnpj = digitsOnly(row.cnpj);
  const email = normalizeLookup(row.email);
  const whatsapp = digitsOnly(row.whatsapp);
  const phone = digitsOnly(row.phone);
  const company = normalizeLookup(row.company_name);
  const contact = normalizeLookup(row.contact_name);
  if (cnpj.length >= 8) candidates.push(['CNPJ', `cnpj:${cnpj}`]);
  if (email) candidates.push(['e-mail', `email:${email}`]);
  if (whatsapp.length >= 8) candidates.push(['WhatsApp', `phone:${whatsapp.slice(-11)}`]);
  if (phone.length >= 8) candidates.push(['telefone', `phone:${phone.slice(-11)}`]);
  if (company && contact) candidates.push(['empresa + contato', `company:${company}|${contact}`]);
  return candidates;
}

function buildDuplicateIndex(leads) {
  const index = new Map();
  for (const lead of leads) {
    for (const [, key] of duplicateCandidates(lead)) {
      if (!index.has(key)) index.set(key, lead);
    }
  }
  return index;
}

function resolveImportStage(stages, requested, fallbackKey) {
  const raw = String(requested || '').trim();
  if (raw) {
    const key = normalizeLookup(raw);
    const match = stages.find((stage) => normalizeLookup(stage.stage_key) === key || normalizeLookup(stage.name) === key);
    if (match) return { stage: match, invalid: false };
    return { stage: null, invalid: true };
  }
  const fallback = stages.find((stage) => stage.stage_key === fallbackKey)
    || stages.find((stage) => stage.stage_type === 'open')
    || stages[0];
  return { stage: fallback || null, invalid: false };
}

function resolveImportOwner(users, requested, fallbackId, currentUserId) {
  if (meaningful(requested)) {
    const numeric = Number(requested);
    let match = Number.isFinite(numeric) && numeric > 0 ? users.find((user) => Number(user.id) === numeric) : null;
    if (!match) {
      const key = normalizeLookup(requested);
      match = users.find((user) => normalizeLookup(user.name) === key || normalizeLookup(user.email) === key);
    }
    if (match) return { ownerId: Number(match.id), ownerName: match.name, invalid: false };
    return { ownerId: null, ownerName: null, invalid: true };
  }
  const fallback = users.find((user) => Number(user.id) === Number(fallbackId))
    || users.find((user) => Number(user.id) === Number(currentUserId))
    || users[0];
  return { ownerId: fallback ? Number(fallback.id) : null, ownerName: fallback?.name || null, invalid: false };
}

function prepareLeadImport(req, clientId, rows, defaults = {}) {
  ensureDefaultStages(req.user.agency_id, clientId);
  const stages = getStages(req.user.agency_id, clientId);
  const users = commercialUsers(clientId, req.user.agency_id);
  const existing = db.prepare(leadQuery('WHERE l.agency_id = ? AND l.client_id = ?'))
    .all(Number(req.user.agency_id), Number(clientId));
  const duplicateIndex = buildDuplicateIndex(existing);
  const seenInFile = new Map();
  const prepared = [];

  rows.forEach((sourceRow, index) => {
    const row = sourceRow && typeof sourceRow === 'object' ? sourceRow : {};
    const rowNumber = Number(row.__row_number || index + 2);
    const errors = [];
    const warnings = [];
    const companyName = String(row.company_name || '').trim();
    if (!companyName) errors.push('Empresa é obrigatória');

    const stageResult = resolveImportStage(stages, row.stage, defaults.default_stage_key);
    if (stageResult.invalid) errors.push(`Etapa não encontrada: ${row.stage}`);
    if (!stageResult.stage) errors.push('Nenhuma etapa disponível no pipeline');

    const ownerRequested = meaningful(row.owner_user_id) ? row.owner_user_id : row.owner;
    const ownerResult = resolveImportOwner(users, ownerRequested, defaults.default_owner_user_id, req.user.id);
    if (ownerResult.invalid) warnings.push(`Responsável não encontrado: ${ownerRequested}. Será usado o responsável padrão.`);
    const fallbackOwner = ownerResult.invalid
      ? resolveImportOwner(users, null, defaults.default_owner_user_id, req.user.id)
      : ownerResult;

    const nextActionDate = normalizeImportDate(row.next_action_date);
    if (!nextActionDate.valid) errors.push(`Data inválida: ${row.next_action_date}`);

    const email = String(row.email || '').trim().toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) warnings.push('E-mail parece inválido');

    const stage = stageResult.stage;
    const payload = {
      company_name: companyName,
      contact_name: normalizeText(row.contact_name),
      email: normalizeText(email),
      phone: normalizeText(row.phone),
      whatsapp: normalizeText(row.whatsapp),
      cnpj: normalizeText(row.cnpj),
      instagram: normalizeText(row.instagram),
      website: normalizeText(row.website),
      segment: normalizeText(row.segment || defaults.default_segment),
      position_title: normalizeText(row.position_title),
      city: normalizeText(row.city),
      state: normalizeText(row.state),
      priority: normalizePriority(row.priority || defaults.default_priority),
      source: normalizeText(row.source || defaults.default_source),
      stage: stage?.stage_key || null,
      stage_legacy: stage ? legacyStageFor(stage) : 'new_lead',
      stage_name: stage?.name || null,
      stage_type: stage?.stage_type || 'open',
      estimated_value: normalizeImportMoney(row.estimated_value),
      probability: normalizeProbability(row.probability, stage?.probability || 10),
      owner_user_id: fallbackOwner.ownerId,
      owner_name: fallbackOwner.ownerName,
      next_action: normalizeText(row.next_action),
      next_action_date: nextActionDate.value,
      notes: normalizeText(row.notes),
      lost_reason: stage?.stage_type === 'lost' ? normalizeText(row.lost_reason) : null,
    };

    let duplicateId = null;
    let duplicateReason = null;
    let duplicateInFile = false;
    for (const [label, key] of duplicateCandidates(payload)) {
      const found = duplicateIndex.get(key);
      if (found) {
        duplicateId = Number(found.id);
        duplicateReason = label;
        break;
      }
      if (seenInFile.has(key)) {
        duplicateInFile = true;
        duplicateReason = `${label} repetido no arquivo`;
        break;
      }
    }
    for (const [, key] of duplicateCandidates(payload)) {
      if (!seenInFile.has(key)) seenInFile.set(key, rowNumber);
    }

    const providedFields = Object.entries(row)
      .filter(([key, value]) => key !== '__row_number' && meaningful(value))
      .map(([key]) => key);
    if (meaningful(defaults.default_stage_key) && !providedFields.includes('stage')) providedFields.push('stage');
    if (meaningful(defaults.default_owner_user_id) && !providedFields.includes('owner') && !providedFields.includes('owner_user_id')) providedFields.push('owner_user_id');
    if (meaningful(defaults.default_source) && !providedFields.includes('source')) providedFields.push('source');
    if (meaningful(defaults.default_priority) && !providedFields.includes('priority')) providedFields.push('priority');
    if (meaningful(defaults.default_segment) && !providedFields.includes('segment')) providedFields.push('segment');

    prepared.push({
      row_number: rowNumber,
      valid: errors.length === 0,
      errors,
      warnings,
      duplicate_id: duplicateId,
      duplicate_reason: duplicateReason,
      duplicate_in_file: duplicateInFile,
      payload,
      provided_fields: providedFields,
    });
  });

  return {
    rows: prepared,
    stats: {
      total: prepared.length,
      valid: prepared.filter((row) => row.valid).length,
      errors: prepared.filter((row) => !row.valid).length,
      duplicates: prepared.filter((row) => row.valid && (row.duplicate_id || row.duplicate_in_file)).length,
    },
  };
}

function resolveClientId(req, requestedClientId) {
  const clientId = req.user.role === 'client'
    ? Number(req.user.client_id)
    : Number(requestedClientId);

  if (!clientId) return { error: 'Selecione um cliente para abrir o Comercial' };
  if (!canAccessClient(req.user, clientId)) return { error: 'Você não tem acesso ao Comercial deste cliente', status: 403 };
  return { clientId };
}

function accessibleClients(user) {
  if (user.role === 'admin') {
    return db.prepare('SELECT id, name, logo_color FROM clients WHERE agency_id = ? AND status != ? ORDER BY name')
      .all(user.agency_id, 'archived');
  }
  if (user.role === 'client') {
    return user.client_id
      ? db.prepare('SELECT id, name, logo_color FROM clients WHERE id = ? AND agency_id = ?').all(user.client_id, user.agency_id)
      : [];
  }
  if (!Array.isArray(user.client_ids) || !user.client_ids.length) return [];
  const placeholders = user.client_ids.map(() => '?').join(',');
  return db.prepare(`SELECT id, name, logo_color FROM clients WHERE agency_id = ? AND id IN (${placeholders}) AND status != ? ORDER BY name`)
    .all(user.agency_id, ...user.client_ids, 'archived');
}

function commercialUsers(clientId, agencyId) {
  const rows = db.prepare(`
    SELECT id, name, email, role, client_id, agency_id, avatar_color, avatar_data,
           is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team, custom_role_id
    FROM users
    WHERE agency_id = ? AND role IN ('admin','team','client')
    ORDER BY name
  `).all(agencyId);

  return rows
    .map((user) => hydrateUserAccess(user))
    .filter((user) => hasPermission(user, 'commercial.view') && canAccessClient(user, clientId))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_color: user.avatar_color,
      avatar_data: user.avatar_data,
      is_commercial_team: Boolean(user.is_commercial_team),
      permission_role_name: user.permission_role_name,
    }));
}

function ensureOwner(ownerUserId, agencyId, clientId) {
  if (!ownerUserId) return null;
  const allowed = commercialUsers(clientId, agencyId).some((user) => Number(user.id) === Number(ownerUserId));
  return allowed ? Number(ownerUserId) : null;
}

function ensureDefaultStages(agencyId, clientId) {
  const count = db.prepare('SELECT COUNT(*) AS total FROM commercial_stages WHERE agency_id = ? AND client_id = ?')
    .get(Number(agencyId), Number(clientId));
  if (Number(count?.total || 0) > 0) return;

  const insert = db.prepare(`
    INSERT INTO commercial_stages (
      agency_id, client_id, stage_key, name, subtitle, probability,
      color_key, position, stage_type, is_system
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    for (const stage of DEFAULT_STAGES) {
      insert.run(
        Number(agencyId), Number(clientId), stage.stage_key, stage.name, stage.subtitle,
        stage.probability, stage.color_key, stage.position, stage.stage_type, stage.is_system
      );
    }
    db.prepare(`
      UPDATE commercial_leads
      SET stage_key = stage
      WHERE agency_id = ? AND client_id = ? AND (stage_key IS NULL OR trim(stage_key) = '')
    `).run(Number(agencyId), Number(clientId));
  });
  seed();
}

function getStages(agencyId, clientId) {
  ensureDefaultStages(agencyId, clientId);
  return db.prepare(`
    SELECT id, agency_id, client_id, stage_key, name, subtitle, probability,
           color_key, position, stage_type, is_system, created_at, updated_at
    FROM commercial_stages
    WHERE agency_id = ? AND client_id = ?
    ORDER BY position ASC, id ASC
  `).all(Number(agencyId), Number(clientId));
}

function getStageByKey(agencyId, clientId, key) {
  ensureDefaultStages(agencyId, clientId);
  return db.prepare(`
    SELECT id, agency_id, client_id, stage_key, name, subtitle, probability,
           color_key, position, stage_type, is_system
    FROM commercial_stages
    WHERE agency_id = ? AND client_id = ? AND stage_key = ?
  `).get(Number(agencyId), Number(clientId), String(key || ''));
}

function resolveStage(agencyId, clientId, requestedKey, fallbackKey) {
  let stage = requestedKey ? getStageByKey(agencyId, clientId, requestedKey) : null;
  if (!stage && fallbackKey) stage = getStageByKey(agencyId, clientId, fallbackKey);
  if (!stage) {
    stage = getStages(agencyId, clientId).find((item) => item.stage_type === 'open') || getStages(agencyId, clientId)[0];
  }
  return stage || null;
}

function legacyStageFor(stage) {
  if (!stage) return 'new_lead';
  if (stage.stage_type === 'won') return 'won';
  if (stage.stage_type === 'lost') return 'lost';
  return LEGACY_STAGE_KEYS.has(stage.stage_key) ? stage.stage_key : 'new_lead';
}

function makeStageKey(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'etapa';
  return `${slug}_${randomUUID().slice(0, 8)}`;
}

function leadQuery(whereClause = '') {
  return `
    SELECT
      l.id, l.agency_id, l.client_id, l.created_by, l.owner_user_id,
      l.company_name, l.contact_name, l.email, l.phone, l.whatsapp, l.cnpj,
      l.instagram, l.website, l.segment, l.position_title, l.city, l.state, l.priority, l.source,
      COALESCE(NULLIF(l.stage_key, ''), l.stage) AS stage,
      l.estimated_value, l.probability,
      l.next_action, l.next_action_date, l.notes, l.lost_reason,
      l.closed_at, l.created_at, l.updated_at,
      c.name AS client_name,
      u.name AS owner_name, u.avatar_color AS owner_color, u.avatar_data AS owner_avatar,
      creator.name AS created_by_name,
      cs.name AS stage_name, cs.stage_type, cs.color_key AS stage_color_key,
      cs.position AS stage_position,
      d.submission_id AS diagnostic_submission_id,
      d.objective AS diagnostic_objective,
      d.role AS diagnostic_role,
      d.segment AS diagnostic_segment,
      d.experience AS diagnostic_experience,
      d.team_size AS diagnostic_team_size,
      d.city AS diagnostic_city,
      d.score AS diagnostic_score,
      d.classification AS diagnostic_classification,
      d.primary_gap AS diagnostic_primary_gap,
      d.pain_statement AS diagnostic_pain_statement,
      d.reason_now AS diagnostic_reason_now,
      d.timeframe AS diagnostic_timeframe,
      d.investment_intent AS diagnostic_investment_intent,
      d.fit_score AS diagnostic_fit_score,
      d.priority AS diagnostic_priority,
      d.answers_json AS diagnostic_answers_json,
      (SELECT COUNT(*) FROM commercial_activities a WHERE a.lead_id = l.id AND a.agency_id = l.agency_id) AS activity_count
    FROM commercial_leads l
    JOIN clients c ON c.id = l.client_id AND c.agency_id = l.agency_id
    LEFT JOIN commercial_stages cs
      ON cs.agency_id = l.agency_id
     AND cs.client_id = l.client_id
     AND cs.stage_key = COALESCE(NULLIF(l.stage_key, ''), l.stage)
    LEFT JOIN commercial_lead_diagnostics d
      ON d.lead_id = l.id
     AND d.agency_id = l.agency_id
     AND d.client_id = l.client_id
    LEFT JOIN users u ON u.id = l.owner_user_id AND u.agency_id = l.agency_id
    LEFT JOIN users creator ON creator.id = l.created_by AND creator.agency_id = l.agency_id
    ${whereClause}
  `;
}

function getLead(id, agencyId, clientId) {
  return db.prepare(leadQuery('WHERE l.id = ? AND l.agency_id = ? AND l.client_id = ?'))
    .get(Number(id), Number(agencyId), Number(clientId));
}

function addActivity(agencyId, leadId, userId, type, description) {
  if (!description) return;
  db.prepare(`
    INSERT INTO commercial_activities (agency_id, lead_id, created_by, activity_type, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(agencyId), Number(leadId), Number(userId), type, description);
}

function syncNichesFromLeads(agencyId, clientId, createdBy) {
  const values = db.prepare(`
    SELECT DISTINCT trim(segment) AS name
    FROM commercial_leads
    WHERE agency_id = ? AND client_id = ?
      AND segment IS NOT NULL AND trim(segment) != ''
    ORDER BY name COLLATE NOCASE
  `).all(Number(agencyId), Number(clientId));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO commercial_niches (agency_id, client_id, created_by, name)
    VALUES (?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    values.forEach((item) => insert.run(Number(agencyId), Number(clientId), Number(createdBy), item.name));
  });
  run();
}

function listNiches(agencyId, clientId, createdBy) {
  syncNichesFromLeads(agencyId, clientId, createdBy);
  return db.prepare(`
    SELECT n.id, n.name, n.created_at, n.updated_at,
      (SELECT COUNT(*) FROM commercial_leads l
       WHERE l.agency_id = n.agency_id AND l.client_id = n.client_id
         AND lower(trim(COALESCE(l.segment, ''))) = lower(trim(n.name))) AS lead_count
    FROM commercial_niches n
    WHERE n.agency_id = ? AND n.client_id = ?
    ORDER BY n.name COLLATE NOCASE
  `).all(Number(agencyId), Number(clientId));
}

router.get('/clients', (req, res) => {
  res.json({ clients: accessibleClients(req.user) });
});

router.get('/users', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  res.json({ users: commercialUsers(scope.clientId, req.user.agency_id) });
});

router.get('/stages', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  res.json({ stages: getStages(req.user.agency_id, scope.clientId), client_id: scope.clientId });
});

router.get('/niches', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const unclassified = db.prepare(`
    SELECT COUNT(*) AS total FROM commercial_leads
    WHERE agency_id = ? AND client_id = ? AND (segment IS NULL OR trim(segment) = '')
  `).get(Number(req.user.agency_id), scope.clientId);
  res.json({
    niches: listNiches(req.user.agency_id, scope.clientId, req.user.id),
    unclassified_count: Number(unclassified?.total || 0),
  });
});

router.post('/niches', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome do nicho' });
  if (name.length > 80) return res.status(400).json({ error: 'Use um nome de nicho com até 80 caracteres' });

  db.prepare(`
    INSERT OR IGNORE INTO commercial_niches (agency_id, client_id, created_by, name)
    VALUES (?, ?, ?, ?)
  `).run(Number(req.user.agency_id), scope.clientId, Number(req.user.id), name);

  let updatedCount = 0;
  if (req.body.apply_to_unclassified === true) {
    const result = db.prepare(`
      UPDATE commercial_leads
      SET segment = ?, updated_at = datetime('now')
      WHERE agency_id = ? AND client_id = ? AND (segment IS NULL OR trim(segment) = '')
    `).run(name, Number(req.user.agency_id), scope.clientId);
    updatedCount = Number(result.changes || 0);
  }

  res.status(201).json({
    niches: listNiches(req.user.agency_id, scope.clientId, req.user.id),
    updated_count: updatedCount,
  });
});

router.post('/leads/bulk-niche', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Selecione um nicho' });
  db.prepare(`
    INSERT OR IGNORE INTO commercial_niches (agency_id, client_id, created_by, name)
    VALUES (?, ?, ?, ?)
  `).run(Number(req.user.agency_id), scope.clientId, Number(req.user.id), name);

  const ids = Array.isArray(req.body.lead_ids) ? req.body.lead_ids.map(Number).filter(Boolean) : [];
  let result;
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    result = db.prepare(`
      UPDATE commercial_leads SET segment = ?, updated_at = datetime('now')
      WHERE agency_id = ? AND client_id = ? AND id IN (${placeholders})
    `).run(name, Number(req.user.agency_id), scope.clientId, ...ids);
  } else if (req.body.only_unclassified === true) {
    result = db.prepare(`
      UPDATE commercial_leads SET segment = ?, updated_at = datetime('now')
      WHERE agency_id = ? AND client_id = ? AND (segment IS NULL OR trim(segment) = '')
    `).run(name, Number(req.user.agency_id), scope.clientId);
  } else {
    return res.status(400).json({ error: 'Informe os leads que deseja classificar' });
  }
  res.json({ updated_count: Number(result?.changes || 0), niches: listNiches(req.user.agency_id, scope.clientId, req.user.id) });
});

router.post('/stages', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome do quadro' });

  const currentStages = getStages(req.user.agency_id, scope.clientId);
  const firstResult = currentStages.find((stage) => stage.stage_type !== 'open');
  const position = firstResult ? Number(firstResult.position) : currentStages.length;
  const key = makeStageKey(name);
  const colorKey = ALLOWED_STAGE_COLORS.has(String(req.body.color_key)) ? String(req.body.color_key) : 'cyan';
  const probability = normalizeProbability(req.body.probability, 20);

  const create = db.transaction(() => {
    db.prepare(`
      UPDATE commercial_stages
      SET position = position + 1, updated_at = datetime('now')
      WHERE agency_id = ? AND client_id = ? AND position >= ?
    `).run(Number(req.user.agency_id), scope.clientId, position);

    db.prepare(`
      INSERT INTO commercial_stages (
        agency_id, client_id, stage_key, name, subtitle, probability,
        color_key, position, stage_type, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0)
    `).run(
      Number(req.user.agency_id), scope.clientId, key, name,
      normalizeText(req.body.subtitle), probability, colorKey, position
    );
  });
  create();
  res.status(201).json({ stages: getStages(req.user.agency_id, scope.clientId) });
});

router.put('/stages/reorder', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const keys = Array.isArray(req.body.stage_keys) ? req.body.stage_keys.map(String) : [];
  const current = getStages(req.user.agency_id, scope.clientId);
  const currentKeys = current.map((stage) => stage.stage_key);
  if (keys.length !== currentKeys.length || keys.some((key) => !currentKeys.includes(key))) {
    return res.status(400).json({ error: 'A lista de quadros está incompleta ou inválida' });
  }

  const reorder = db.transaction(() => {
    const update = db.prepare(`
      UPDATE commercial_stages
      SET position = ?, updated_at = datetime('now')
      WHERE agency_id = ? AND client_id = ? AND stage_key = ?
    `);
    keys.forEach((key, index) => update.run(index, Number(req.user.agency_id), scope.clientId, key));
  });
  reorder();
  res.json({ stages: getStages(req.user.agency_id, scope.clientId) });
});

router.put('/stages/:id', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id || req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const existing = db.prepare(`
    SELECT * FROM commercial_stages
    WHERE id = ? AND agency_id = ? AND client_id = ?
  `).get(Number(req.params.id), Number(req.user.agency_id), scope.clientId);
  if (!existing) return res.status(404).json({ error: 'Quadro não encontrado' });

  const name = Object.prototype.hasOwnProperty.call(req.body, 'name') ? String(req.body.name || '').trim() : existing.name;
  if (!name) return res.status(400).json({ error: 'Informe o nome do quadro' });
  const colorKey = Object.prototype.hasOwnProperty.call(req.body, 'color_key') && ALLOWED_STAGE_COLORS.has(String(req.body.color_key))
    ? String(req.body.color_key)
    : existing.color_key;
  const probability = Object.prototype.hasOwnProperty.call(req.body, 'probability')
    ? normalizeProbability(req.body.probability, existing.probability)
    : Number(existing.probability || 0);
  const subtitle = Object.prototype.hasOwnProperty.call(req.body, 'subtitle') ? normalizeText(req.body.subtitle) : existing.subtitle;

  db.prepare(`
    UPDATE commercial_stages
    SET name = ?, subtitle = ?, probability = ?, color_key = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND client_id = ?
  `).run(name, subtitle, probability, colorKey, Number(req.params.id), Number(req.user.agency_id), scope.clientId);

  res.json({ stages: getStages(req.user.agency_id, scope.clientId) });
});

router.delete('/stages/:id', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const stage = db.prepare(`
    SELECT * FROM commercial_stages
    WHERE id = ? AND agency_id = ? AND client_id = ?
  `).get(Number(req.params.id), Number(req.user.agency_id), scope.clientId);
  if (!stage) return res.status(404).json({ error: 'Quadro não encontrado' });
  if (stage.stage_type !== 'open' || Number(stage.is_system) === 1) {
    return res.status(400).json({ error: 'Quadros de resultado não podem ser apagados. Você pode renomeá-los.' });
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM commercial_leads
    WHERE agency_id = ? AND client_id = ?
      AND COALESCE(NULLIF(stage_key, ''), stage) = ?
  `).get(Number(req.user.agency_id), scope.clientId, stage.stage_key);
  const leadCount = Number(countRow?.total || 0);
  let target = null;
  if (leadCount > 0) {
    target = getStageByKey(req.user.agency_id, scope.clientId, req.query.move_to);
    if (!target || target.stage_key === stage.stage_key) {
      return res.status(409).json({
        error: 'Escolha outro quadro para receber as oportunidades antes da exclusão.',
        requires_move: true,
        lead_count: leadCount,
      });
    }
  }

  const remove = db.transaction(() => {
    if (leadCount > 0 && target) {
      const closedAt = ['won', 'lost'].includes(target.stage_type) ? new Date().toISOString() : null;
      db.prepare(`
        UPDATE commercial_leads
        SET stage_key = ?, stage = ?, probability = ?, closed_at = ?,
            lost_reason = CASE WHEN ? = 'lost' THEN lost_reason ELSE NULL END,
            updated_at = datetime('now')
        WHERE agency_id = ? AND client_id = ?
          AND COALESCE(NULLIF(stage_key, ''), stage) = ?
      `).run(
        target.stage_key, legacyStageFor(target), Number(target.probability || 0), closedAt,
        target.stage_type, Number(req.user.agency_id), scope.clientId, stage.stage_key
      );
    }
    db.prepare('DELETE FROM commercial_stages WHERE id = ? AND agency_id = ? AND client_id = ?')
      .run(Number(stage.id), Number(req.user.agency_id), scope.clientId);
    const remaining = db.prepare(`
      SELECT id FROM commercial_stages
      WHERE agency_id = ? AND client_id = ?
      ORDER BY position ASC, id ASC
    `).all(Number(req.user.agency_id), scope.clientId);
    const update = db.prepare('UPDATE commercial_stages SET position = ? WHERE id = ?');
    remaining.forEach((item, index) => update.run(index, item.id));
  });
  remove();

  res.json({ stages: getStages(req.user.agency_id, scope.clientId), moved_count: leadCount });
});

router.get('/dashboard-summary', (req, res) => {
  let clientIds;
  if (req.query.client_id) {
    const scope = resolveClientId(req, req.query.client_id);
    if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
    clientIds = [scope.clientId];
  } else {
    clientIds = accessibleClients(req.user).map((client) => Number(client.id)).filter(Boolean);
  }

  clientIds.forEach((clientId) => ensureDefaultStages(req.user.agency_id, clientId));
  if (!clientIds.length) {
    return res.json({ stats: { open: 0, meeting: 0, proposal: 0, negotiation: 0 } });
  }

  const placeholders = clientIds.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN cs.stage_type = 'open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN COALESCE(NULLIF(l.stage_key, ''), l.stage) = 'meeting' THEN 1 ELSE 0 END) AS meeting,
      SUM(CASE WHEN COALESCE(NULLIF(l.stage_key, ''), l.stage) = 'proposal' THEN 1 ELSE 0 END) AS proposal,
      SUM(CASE WHEN COALESCE(NULLIF(l.stage_key, ''), l.stage) = 'negotiation' THEN 1 ELSE 0 END) AS negotiation
    FROM commercial_leads l
    LEFT JOIN commercial_stages cs
      ON cs.agency_id = l.agency_id
     AND cs.client_id = l.client_id
     AND cs.stage_key = COALESCE(NULLIF(l.stage_key, ''), l.stage)
    WHERE l.agency_id = ? AND l.client_id IN (${placeholders})
  `).get(Number(req.user.agency_id), ...clientIds) || {};

  res.json({
    stats: {
      open: Number(row.open || 0),
      meeting: Number(row.meeting || 0),
      proposal: Number(row.proposal || 0),
      negotiation: Number(row.negotiation || 0),
    },
  });
});

router.get('/imports', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const imports = db.prepare(`
    SELECT i.id, i.filename, i.total_rows, i.valid_rows, i.created_count, i.updated_count,
           i.skipped_count, i.error_count, i.duplicate_mode, i.created_at, u.name AS created_by_name
    FROM commercial_lead_imports i
    LEFT JOIN users u ON u.id = i.created_by AND u.agency_id = i.agency_id
    WHERE i.agency_id = ? AND i.client_id = ?
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT 8
  `).all(Number(req.user.agency_id), scope.clientId);
  res.json({ imports });
});

router.get('/leads', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  ensureDefaultStages(req.user.agency_id, scope.clientId);

  const { stage, owner_user_id: ownerUserId, search } = req.query;
  let query = leadQuery('WHERE l.agency_id = ? AND l.client_id = ?');
  const params = [Number(req.user.agency_id), scope.clientId];

  if (stage && getStageByKey(req.user.agency_id, scope.clientId, stage)) {
    query += " AND COALESCE(NULLIF(l.stage_key, ''), l.stage) = ?";
    params.push(String(stage));
  }
  if (ownerUserId) {
    query += ' AND l.owner_user_id = ?';
    params.push(Number(ownerUserId));
  }
  if (search) {
    query += ` AND (
      lower(l.company_name) LIKE ? OR lower(COALESCE(l.contact_name, '')) LIKE ? OR
      lower(COALESCE(l.email, '')) LIKE ? OR COALESCE(l.phone, '') LIKE ?
    )`;
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY
    COALESCE(cs.position, 999) ASC,
    CASE WHEN l.next_action_date IS NULL THEN 1 ELSE 0 END,
    l.next_action_date ASC,
    l.updated_at DESC`;

  res.json({ leads: db.prepare(query).all(...params), client_id: scope.clientId });
});

router.post('/leads/import/preview', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha encontrada para validar' });
  if (rows.length > 3000) return res.status(400).json({ error: 'O limite por importação é de 3.000 leads' });

  const preview = prepareLeadImport(req, scope.clientId, rows, req.body.defaults || {});
  res.json(preview);
});

router.post('/leads/import', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha encontrada para importar' });
  if (rows.length > 3000) return res.status(400).json({ error: 'O limite por importação é de 3.000 leads' });

  const duplicateMode = ['skip', 'create', 'update'].includes(String(req.body.duplicate_mode))
    ? String(req.body.duplicate_mode)
    : 'skip';
  const defaults = req.body.defaults || {};
  const preview = prepareLeadImport(req, scope.clientId, rows, defaults);
  const results = { created: 0, updated: 0, skipped: 0, errors: preview.stats.errors, rows: [] };

  const insertLead = db.prepare(`
    INSERT INTO commercial_leads (
      agency_id, client_id, created_by, owner_user_id, company_name, contact_name, email, phone, whatsapp, cnpj,
      instagram, website, segment, position_title, city, state, priority, source,
      stage, stage_key, estimated_value, probability, next_action, next_action_date, notes, lost_reason, closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateColumns = [
    'company_name', 'contact_name', 'email', 'phone', 'whatsapp', 'cnpj', 'instagram', 'website',
    'segment', 'position_title', 'city', 'state', 'priority', 'source', 'estimated_value', 'probability',
    'next_action', 'next_action_date', 'notes', 'lost_reason', 'owner_user_id',
  ];

  const runImport = db.transaction(() => {
    for (const item of preview.rows) {
      if (!item.valid) {
        results.rows.push({ row_number: item.row_number, status: 'error', errors: item.errors });
        continue;
      }

      if (item.duplicate_in_file && !item.duplicate_id && duplicateMode !== 'create') {
        results.skipped += 1;
        results.rows.push({ row_number: item.row_number, status: 'skipped', reason: item.duplicate_reason || 'Duplicado no arquivo' });
        continue;
      }

      const p = item.payload;
      if (item.duplicate_id && duplicateMode === 'skip') {
        results.skipped += 1;
        results.rows.push({ row_number: item.row_number, status: 'skipped', lead_id: item.duplicate_id, reason: `Duplicado por ${item.duplicate_reason}` });
        continue;
      }

      if (item.duplicate_id && duplicateMode === 'update') {
        const allowedProvided = new Set(item.provided_fields || []);
        const updates = [];
        const values = [];
        const columnValue = {
          company_name: p.company_name,
          contact_name: p.contact_name,
          email: p.email,
          phone: p.phone,
          whatsapp: p.whatsapp,
          cnpj: p.cnpj,
          instagram: p.instagram,
          website: p.website,
          segment: p.segment,
          position_title: p.position_title,
          city: p.city,
          state: p.state,
          priority: p.priority,
          source: p.source,
          estimated_value: p.estimated_value,
          probability: p.probability,
          next_action: p.next_action,
          next_action_date: p.next_action_date,
          notes: p.notes,
          lost_reason: p.lost_reason,
          owner_user_id: p.owner_user_id,
        };
        for (const column of updateColumns) {
          const ownerProvided = column === 'owner_user_id' && (allowedProvided.has('owner') || allowedProvided.has('owner_user_id'));
          if (!allowedProvided.has(column) && !ownerProvided) continue;
          updates.push(`${column} = ?`);
          values.push(columnValue[column] ?? null);
        }
        if (allowedProvided.has('stage')) {
          updates.push('stage = ?', 'stage_key = ?', 'closed_at = ?');
          values.push(
            p.stage_legacy,
            p.stage,
            ['won', 'lost'].includes(p.stage_type) ? new Date().toISOString() : null
          );
        }
        if (updates.length) {
          updates.push("updated_at = datetime('now')");
          db.prepare(`UPDATE commercial_leads SET ${updates.join(', ')} WHERE id = ? AND agency_id = ? AND client_id = ?`)
            .run(...values, Number(item.duplicate_id), Number(req.user.agency_id), scope.clientId);
          addActivity(req.user.agency_id, item.duplicate_id, req.user.id, 'note', 'Oportunidade atualizada por importação CSV.');
        }
        results.updated += 1;
        results.rows.push({ row_number: item.row_number, status: 'updated', lead_id: item.duplicate_id });
        continue;
      }

      const closedAt = ['won', 'lost'].includes(p.stage_type) ? new Date().toISOString() : null;
      const info = insertLead.run(
        Number(req.user.agency_id), scope.clientId, Number(req.user.id), p.owner_user_id,
        p.company_name, p.contact_name, p.email, p.phone, p.whatsapp, p.cnpj,
        p.instagram, p.website, p.segment, p.position_title, p.city, p.state, p.priority, p.source,
        p.stage_legacy, p.stage, p.estimated_value, p.probability, p.next_action, p.next_action_date,
        p.notes, p.lost_reason, closedAt
      );
      addActivity(req.user.agency_id, info.lastInsertRowid, req.user.id, 'note', 'Oportunidade criada por importação CSV.');
      results.created += 1;
      results.rows.push({ row_number: item.row_number, status: 'created', lead_id: Number(info.lastInsertRowid) });
    }

    db.prepare(`
      INSERT INTO commercial_lead_imports (
        agency_id, client_id, created_by, filename, total_rows, valid_rows,
        created_count, updated_count, skipped_count, error_count, duplicate_mode, mapping_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id), scope.clientId, Number(req.user.id), normalizeText(req.body.filename),
      preview.stats.total, preview.stats.valid, results.created, results.updated, results.skipped, results.errors,
      duplicateMode, JSON.stringify(req.body.mapping || {})
    );
  });

  runImport();
  res.status(201).json({
    ok: true,
    stats: {
      total: preview.stats.total,
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors,
    },
    rows: results.rows,
  });
});

router.get('/leads/:id', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  ensureDefaultStages(req.user.agency_id, scope.clientId);
  const lead = getLead(req.params.id, req.user.agency_id, scope.clientId);
  if (!lead) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  const activities = db.prepare(`
    SELECT a.id, a.activity_type, a.description, a.created_at, u.name AS created_by_name
    FROM commercial_activities a
    LEFT JOIN users u ON u.id = a.created_by AND u.agency_id = a.agency_id
    WHERE a.lead_id = ? AND a.agency_id = ?
    ORDER BY a.created_at DESC, a.id DESC
  `).all(Number(req.params.id), Number(req.user.agency_id));
  res.json({ lead, activities });
});

router.post('/leads', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const companyName = String(req.body.company_name || '').trim();
  if (!companyName) return res.status(400).json({ error: 'Informe o nome da empresa ou oportunidade' });

  const stage = resolveStage(req.user.agency_id, scope.clientId, req.body.stage);
  if (!stage) return res.status(400).json({ error: 'Crie pelo menos um quadro no pipeline' });
  const ownerUserId = ensureOwner(req.body.owner_user_id, req.user.agency_id, scope.clientId) || Number(req.user.id);
  const estimatedValue = normalizeMoney(req.body.estimated_value);
  const probability = normalizeProbability(req.body.probability, stage.probability);
  const closedAt = ['won', 'lost'].includes(stage.stage_type) ? new Date().toISOString() : null;

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO commercial_leads (
        agency_id, client_id, created_by, owner_user_id, company_name, contact_name, email, phone, whatsapp, cnpj,
        instagram, website, segment, position_title, city, state, priority, source,
        stage, stage_key, estimated_value, probability, next_action, next_action_date, notes, lost_reason, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id), scope.clientId, Number(req.user.id), ownerUserId, companyName,
      normalizeText(req.body.contact_name), normalizeText(req.body.email), normalizeText(req.body.phone),
      normalizeText(req.body.whatsapp), normalizeText(req.body.cnpj), normalizeText(req.body.instagram), normalizeText(req.body.website),
      normalizeText(req.body.segment), normalizeText(req.body.position_title), normalizeText(req.body.city), normalizeText(req.body.state),
      normalizePriority(req.body.priority), normalizeText(req.body.source),
      legacyStageFor(stage), stage.stage_key, estimatedValue, probability,
      normalizeText(req.body.next_action), normalizeText(req.body.next_action_date), normalizeText(req.body.notes),
      stage.stage_type === 'lost' ? normalizeText(req.body.lost_reason) : null, closedAt
    );
    addActivity(req.user.agency_id, info.lastInsertRowid, req.user.id, 'note', 'Oportunidade criada no pipeline comercial.');
    return info.lastInsertRowid;
  });

  const id = create();
  res.status(201).json({ lead: getLead(id, req.user.agency_id, scope.clientId) });
});

router.put('/leads/:id', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id || req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  ensureDefaultStages(req.user.agency_id, scope.clientId);
  const existing = getLead(req.params.id, req.user.agency_id, scope.clientId);
  if (!existing) return res.status(404).json({ error: 'Oportunidade não encontrada' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'company_name') && !String(req.body.company_name || '').trim()) {
    return res.status(400).json({ error: 'Informe o nome da empresa ou oportunidade' });
  }

  const existingStage = resolveStage(req.user.agency_id, scope.clientId, existing.stage);
  const requestedStage = Object.prototype.hasOwnProperty.call(req.body, 'stage')
    ? resolveStage(req.user.agency_id, scope.clientId, req.body.stage, existing.stage)
    : existingStage;
  if (!requestedStage) return res.status(400).json({ error: 'Etapa comercial inválida' });

  const allowed = [
    'company_name', 'contact_name', 'email', 'phone', 'whatsapp', 'cnpj', 'instagram', 'website',
    'segment', 'position_title', 'city', 'state', 'priority', 'source', 'estimated_value',
    'probability', 'next_action', 'next_action_date', 'notes', 'lost_reason', 'owner_user_id',
  ];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'company_name') values.push(String(req.body.company_name).trim());
    else if (field === 'estimated_value') values.push(normalizeMoney(req.body.estimated_value));
    else if (field === 'probability') values.push(normalizeProbability(req.body.probability, requestedStage.probability));
    else if (field === 'owner_user_id') values.push(ensureOwner(req.body.owner_user_id, req.user.agency_id, scope.clientId));
    else if (field === 'priority') values.push(normalizePriority(req.body.priority));
    else values.push(normalizeText(req.body[field]));
  }

  const stageChanged = requestedStage.stage_key !== existing.stage;
  if (stageChanged) {
    updates.push('stage_key = ?', 'stage = ?', 'closed_at = ?');
    values.push(
      requestedStage.stage_key,
      legacyStageFor(requestedStage),
      ['won', 'lost'].includes(requestedStage.stage_type) ? new Date().toISOString() : null
    );
    if (!Object.prototype.hasOwnProperty.call(req.body, 'probability')) {
      updates.push('probability = ?');
      values.push(Number(requestedStage.probability || 0));
    }
    if (requestedStage.stage_type !== 'lost' && !Object.prototype.hasOwnProperty.call(req.body, 'lost_reason')) {
      updates.push('lost_reason = NULL');
    }
  }

  if (!updates.length) return res.json({ lead: existing });
  updates.push("updated_at = datetime('now')");

  const update = db.transaction(() => {
    db.prepare(`UPDATE commercial_leads SET ${updates.join(', ')} WHERE id = ? AND agency_id = ? AND client_id = ?`)
      .run(...values, Number(req.params.id), Number(req.user.agency_id), scope.clientId);
    if (stageChanged) {
      addActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_change', `Etapa alterada de ${existing.stage_name || existing.stage} para ${requestedStage.name}.`);
    }
    const note = normalizeText(req.body.activity_note);
    if (note) addActivity(req.user.agency_id, req.params.id, req.user.id, 'note', note);
  });
  update();

  res.json({ lead: getLead(req.params.id, req.user.agency_id, scope.clientId) });
});

router.post('/leads/:id/activities', (req, res) => {
  const scope = resolveClientId(req, req.body.client_id || req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const lead = getLead(req.params.id, req.user.agency_id, scope.clientId);
  if (!lead) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  const description = String(req.body.description || '').trim();
  if (!description) return res.status(400).json({ error: 'Descreva a atividade' });
  const allowedTypes = new Set(['note', 'call', 'meeting', 'email', 'follow_up']);
  const type = allowedTypes.has(String(req.body.activity_type)) ? String(req.body.activity_type) : 'note';
  addActivity(req.user.agency_id, req.params.id, req.user.id, type, description);
  res.status(201).json({ ok: true });
});

router.delete('/leads/:id', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
  const lead = getLead(req.params.id, req.user.agency_id, scope.clientId);
  if (!lead) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  db.prepare('DELETE FROM commercial_leads WHERE id = ? AND agency_id = ? AND client_id = ?')
    .run(Number(req.params.id), Number(req.user.agency_id), scope.clientId);
  res.json({ ok: true });
});

module.exports = router;
