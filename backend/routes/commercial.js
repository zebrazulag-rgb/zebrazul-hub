const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requireRole('admin', 'team'));

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

function ensureOwner(ownerUserId, agencyId) {
  if (!ownerUserId) return null;
  const user = db.prepare(`
    SELECT id FROM users
    WHERE id = ? AND agency_id = ? AND role IN ('admin','team')
  `).get(Number(ownerUserId), Number(agencyId));
  return user ? Number(user.id) : null;
}

function leadQuery(whereClause = '') {
  return `
    SELECT
      l.id, l.agency_id, l.created_by, l.owner_user_id,
      l.company_name, l.contact_name, l.email, l.phone, l.source,
      l.stage, l.estimated_value, l.probability,
      l.next_action, l.next_action_date, l.notes, l.lost_reason,
      l.closed_at, l.created_at, l.updated_at,
      u.name AS owner_name, u.avatar_color AS owner_color, u.avatar_data AS owner_avatar,
      creator.name AS created_by_name,
      (SELECT COUNT(*) FROM commercial_activities a WHERE a.lead_id = l.id AND a.agency_id = l.agency_id) AS activity_count
    FROM commercial_leads l
    LEFT JOIN users u ON u.id = l.owner_user_id AND u.agency_id = l.agency_id
    LEFT JOIN users creator ON creator.id = l.created_by AND creator.agency_id = l.agency_id
    ${whereClause}
  `;
}

function getLead(id, agencyId) {
  return db.prepare(leadQuery('WHERE l.id = ? AND l.agency_id = ?')).get(Number(id), Number(agencyId));
}

function addActivity(agencyId, leadId, userId, type, description) {
  if (!description) return;
  db.prepare(`
    INSERT INTO commercial_activities (agency_id, lead_id, created_by, activity_type, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(agencyId), Number(leadId), Number(userId), type, description);
}

router.get('/leads', (req, res) => {
  const { stage, owner_user_id: ownerUserId, search } = req.query;
  let query = leadQuery('WHERE l.agency_id = ?');
  const params = [Number(req.user.agency_id)];

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

  res.json({ leads: db.prepare(query).all(...params) });
});

router.get('/leads/:id', (req, res) => {
  const lead = getLead(req.params.id, req.user.agency_id);
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
  const companyName = String(req.body.company_name || '').trim();
  if (!companyName) return res.status(400).json({ error: 'Informe o nome da empresa ou oportunidade' });

  const stage = normalizeStage(req.body.stage);
  const ownerUserId = ensureOwner(req.body.owner_user_id, req.user.agency_id) || Number(req.user.id);
  const estimatedValue = normalizeMoney(req.body.estimated_value);
  const probability = normalizeProbability(req.body.probability, stage);
  const closedAt = stage === 'won' || stage === 'lost' ? new Date().toISOString() : null;

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO commercial_leads (
        agency_id, created_by, owner_user_id, company_name, contact_name, email, phone, source,
        stage, estimated_value, probability, next_action, next_action_date, notes, lost_reason, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id), Number(req.user.id), ownerUserId, companyName,
      normalizeText(req.body.contact_name), normalizeText(req.body.email), normalizeText(req.body.phone), normalizeText(req.body.source),
      stage, estimatedValue, probability, normalizeText(req.body.next_action), normalizeText(req.body.next_action_date),
      normalizeText(req.body.notes), stage === 'lost' ? normalizeText(req.body.lost_reason) : null, closedAt
    );
    addActivity(req.user.agency_id, info.lastInsertRowid, req.user.id, 'note', 'Oportunidade criada no pipeline comercial.');
    return info.lastInsertRowid;
  });

  const id = create();
  res.status(201).json({ lead: getLead(id, req.user.agency_id) });
});

router.put('/leads/:id', (req, res) => {
  const existing = getLead(req.params.id, req.user.agency_id);
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
    else if (field === 'owner_user_id') values.push(ensureOwner(req.body.owner_user_id, req.user.agency_id));
    else values.push(normalizeText(req.body[field]));
  }

  if (nextStage !== existing.stage) {
    updates.push('closed_at = ?');
    values.push(nextStage === 'won' || nextStage === 'lost' ? new Date().toISOString() : null);
    if (!Object.prototype.hasOwnProperty.call(req.body, 'probability')) {
      updates.push('probability = ?');
      values.push(DEFAULT_PROBABILITY[nextStage] ?? existing.probability);
    }
    if (nextStage !== 'lost' && !Object.prototype.hasOwnProperty.call(req.body, 'lost_reason')) {
      updates.push('lost_reason = NULL');
    }
  }

  if (!updates.length) return res.json({ lead: existing });
  updates.push("updated_at = datetime('now')");

  const update = db.transaction(() => {
    db.prepare(`UPDATE commercial_leads SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
      .run(...values, Number(req.params.id), Number(req.user.agency_id));
    if (nextStage !== existing.stage) {
      addActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_change', `Etapa alterada de ${existing.stage} para ${nextStage}.`);
    }
    const note = normalizeText(req.body.activity_note);
    if (note) addActivity(req.user.agency_id, req.params.id, req.user.id, 'note', note);
  });
  update();

  res.json({ lead: getLead(req.params.id, req.user.agency_id) });
});

router.post('/leads/:id/activities', (req, res) => {
  const lead = getLead(req.params.id, req.user.agency_id);
  if (!lead) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  const description = String(req.body.description || '').trim();
  if (!description) return res.status(400).json({ error: 'Descreva a atividade' });
  const allowedTypes = new Set(['note', 'call', 'meeting', 'email', 'follow_up']);
  const type = allowedTypes.has(String(req.body.activity_type)) ? String(req.body.activity_type) : 'note';
  addActivity(req.user.agency_id, req.params.id, req.user.id, type, description);
  res.status(201).json({ ok: true });
});

router.delete('/leads/:id', (req, res) => {
  const lead = getLead(req.params.id, req.user.agency_id);
  if (!lead) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  db.prepare('DELETE FROM commercial_leads WHERE id = ? AND agency_id = ?')
    .run(Number(req.params.id), Number(req.user.agency_id));
  res.json({ ok: true });
});

module.exports = router;
