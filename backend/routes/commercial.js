const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use((req, res, next) => {
  const allowed = req.user?.role === 'admin' || req.user?.role === 'client' || req.user?.is_commercial_team;
  if (!allowed) return res.status(403).json({ error: 'Acesso exclusivo de clientes, administradores e equipe comercial' });
  next();
});

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
  return db.prepare(`
    SELECT DISTINCT u.id, u.name, u.role, u.avatar_color, u.avatar_data,
           u.is_commercial_team
    FROM users u
    LEFT JOIN user_client_access uca ON uca.user_id = u.id AND uca.client_id = ?
    WHERE u.agency_id = ?
      AND (
        u.role = 'admin'
        OR (u.role = 'client' AND u.client_id = ?)
        OR (u.role = 'team' AND u.is_commercial_team = 1 AND uca.client_id = ?)
      )
    ORDER BY CASE WHEN u.role = 'client' THEN 1 WHEN u.is_commercial_team = 1 THEN 2 ELSE 3 END, u.name
  `).all(clientId, agencyId, clientId, clientId).map((user) => ({
    ...user,
    is_commercial_team: Number(user.is_commercial_team) === 1,
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
      l.company_name, l.contact_name, l.email, l.phone, l.source,
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
        agency_id, client_id, created_by, owner_user_id, company_name, contact_name, email, phone, source,
        stage, stage_key, estimated_value, probability, next_action, next_action_date, notes, lost_reason, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id), scope.clientId, Number(req.user.id), ownerUserId, companyName,
      normalizeText(req.body.contact_name), normalizeText(req.body.email), normalizeText(req.body.phone), normalizeText(req.body.source),
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
    'company_name', 'contact_name', 'email', 'phone', 'source', 'estimated_value',
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
