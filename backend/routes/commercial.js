const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use((req, res, next) => {
  const allowed = req.user?.role === 'admin' || req.user?.role === 'client' || req.user?.is_commercial_team;
  if (!allowed) return res.status(403).json({ error: 'Acesso exclusivo de clientes, administradores e equipe comercial' });
  next();
});

const STAGES = new Set(['new_lead', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost']);
const DEFAULT_PROBABILITY = {
  new_lead: 10,
  contacted: 20,
  meeting: 35,
  proposal: 55,
  negotiation: 75,
  won: 100,
  lost: 0,
};

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeStage(value, fallback = 'new_lead') {
  const stage = String(value || fallback);
  return STAGES.has(stage) ? stage : fallback;
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function normalizeProbability(value, stage) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PROBABILITY[stage] ?? 10;
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

function leadQuery(whereClause = '') {
  return `
    SELECT
      l.id, l.agency_id, l.client_id, l.created_by, l.owner_user_id,
      l.company_name, l.contact_name, l.email, l.phone, l.source,
      l.stage, l.estimated_value, l.probability,
      l.next_action, l.next_action_date, l.notes, l.lost_reason,
      l.closed_at, l.created_at, l.updated_at,
      c.name AS client_name,
      u.name AS owner_name, u.avatar_color AS owner_color, u.avatar_data AS owner_avatar,
      creator.name AS created_by_name,
      (SELECT COUNT(*) FROM commercial_activities a WHERE a.lead_id = l.id AND a.agency_id = l.agency_id) AS activity_count
    FROM commercial_leads l
    JOIN clients c ON c.id = l.client_id AND c.agency_id = l.agency_id
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

router.get('/leads', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });

  const { stage, owner_user_id: ownerUserId, search } = req.query;
  let query = leadQuery('WHERE l.agency_id = ? AND l.client_id = ?');
  const params = [Number(req.user.agency_id), scope.clientId];

  if (stage && STAGES.has(String(stage))) {
    query += ' AND l.stage = ?';
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
    CASE l.stage
      WHEN 'negotiation' THEN 1 WHEN 'proposal' THEN 2 WHEN 'meeting' THEN 3
      WHEN 'contacted' THEN 4 WHEN 'new_lead' THEN 5 WHEN 'won' THEN 6 ELSE 7
    END,
    CASE WHEN l.next_action_date IS NULL THEN 1 ELSE 0 END,
    l.next_action_date ASC,
    l.updated_at DESC`;

  res.json({ leads: db.prepare(query).all(...params), client_id: scope.clientId });
});

router.get('/leads/:id', (req, res) => {
  const scope = resolveClientId(req, req.query.client_id);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });
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

  const stage = normalizeStage(req.body.stage);
  const ownerUserId = ensureOwner(req.body.owner_user_id, req.user.agency_id, scope.clientId) || Number(req.user.id);
  const estimatedValue = normalizeMoney(req.body.estimated_value);
  const probability = normalizeProbability(req.body.probability, stage);
  const closedAt = stage === 'won' || stage === 'lost' ? new Date().toISOString() : null;

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO commercial_leads (
        agency_id, client_id, created_by, owner_user_id, company_name, contact_name, email, phone, source,
        stage, estimated_value, probability, next_action, next_action_date, notes, lost_reason, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id), scope.clientId, Number(req.user.id), ownerUserId, companyName,
      normalizeText(req.body.contact_name), normalizeText(req.body.email), normalizeText(req.body.phone), normalizeText(req.body.source),
      stage, estimatedValue, probability, normalizeText(req.body.next_action), normalizeText(req.body.next_action_date),
      normalizeText(req.body.notes), stage === 'lost' ? normalizeText(req.body.lost_reason) : null, closedAt
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
  const existing = getLead(req.params.id, req.user.agency_id, scope.clientId);
  if (!existing) return res.status(404).json({ error: 'Oportunidade não encontrada' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'company_name') && !String(req.body.company_name || '').trim()) {
    return res.status(400).json({ error: 'Informe o nome da empresa ou oportunidade' });
  }

  const allowed = [
    'company_name', 'contact_name', 'email', 'phone', 'source', 'stage', 'estimated_value',
    'probability', 'next_action', 'next_action_date', 'notes', 'lost_reason', 'owner_user_id',
  ];
  const updates = [];
  const values = [];
  let nextStage = existing.stage;

  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
    updates.push(`${field} = ?`);
    if (field === 'company_name') values.push(String(req.body.company_name).trim());
    else if (field === 'stage') {
      nextStage = normalizeStage(req.body.stage, existing.stage);
      values.push(nextStage);
    } else if (field === 'estimated_value') values.push(normalizeMoney(req.body.estimated_value));
    else if (field === 'probability') values.push(normalizeProbability(req.body.probability, nextStage));
    else if (field === 'owner_user_id') values.push(ensureOwner(req.body.owner_user_id, req.user.agency_id, scope.clientId));
    else values.push(normalizeText(req.body[field]));
  }

  if (nextStage !== existing.stage) {
    updates.push('closed_at = ?');
    values.push(nextStage === 'won' || nextStage === 'lost' ? new Date().toISOString() : null);
    if (!Object.prototype.hasOwnProperty.call(req.body, 'probability')) {
      updates.push('probability = ?');
      values.push(DEFAULT_PROBABILITY[nextStage] ?? existing.probability);
    }
    if (nextStage !== 'lost' && !Object.prototype.hasOwnProperty.call(req.body, 'lost_reason')) updates.push('lost_reason = NULL');
  }

  if (!updates.length) return res.json({ lead: existing });
  updates.push("updated_at = datetime('now')");

  const update = db.transaction(() => {
    db.prepare(`UPDATE commercial_leads SET ${updates.join(', ')} WHERE id = ? AND agency_id = ? AND client_id = ?`)
      .run(...values, Number(req.params.id), Number(req.user.agency_id), scope.clientId);
    if (nextStage !== existing.stage) {
      addActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_change', `Etapa alterada de ${existing.stage} para ${nextStage}.`);
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
