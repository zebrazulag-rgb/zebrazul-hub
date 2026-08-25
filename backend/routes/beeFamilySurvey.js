const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const FOLLOW_UP_STATUSES = new Set(['new', 'in_follow_up', 'resolved']);

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isBeeName(value) {
  const name = normalizeName(value);
  return name === 'bee' || name.startsWith('bee ') || name.includes('bee christian') || name.includes('bee light');
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveScope(req) {
  const clientId = req.user.role === 'client' ? Number(req.user.client_id) : Number(req.query.client_id || req.body?.client_id);
  if (!clientId) return { error: 'Selecione a Bee para abrir a pesquisa.' };
  if (!canAccessClient(req.user, clientId)) return { error: 'Você não possui acesso a este cliente.', status: 403 };
  const client = db.prepare('SELECT id, agency_id, name FROM clients WHERE id = ? AND agency_id = ? AND status != ?')
    .get(clientId, req.user.agency_id, 'archived');
  if (!client) return { error: 'Cliente não encontrado.', status: 404 };
  if (!isBeeName(client.name)) return { error: 'A pesquisa de famílias está disponível somente para a Bee.', status: 403 };
  return { client };
}

function mapResponse(row) {
  return {
    ...row,
    contact_requested: Number(row.contact_requested) === 1,
    risk_signals: parseJsonArray(row.risk_signals_json),
  };
}

router.get('/', (req, res) => {
  const scope = resolveScope(req);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });

  const responses = db.prepare(`
    SELECT s.*, f.family_name, u.name AS handled_by_name
    FROM bee_family_survey_responses s
    LEFT JOIN reenrollment_families f ON f.id = s.family_id AND f.agency_id = s.agency_id
    LEFT JOIN users u ON u.id = s.handled_by AND u.agency_id = s.agency_id
    WHERE s.agency_id = ? AND s.client_id = ?
    ORDER BY
      CASE s.risk_level WHEN 'high' THEN 1 WHEN 'attention' THEN 2 WHEN 'stable' THEN 3 ELSE 4 END,
      s.contact_requested DESC,
      s.received_at DESC
  `).all(scope.client.agency_id, scope.client.id).map(mapResponse);

  const total = responses.length;
  const promoters = responses.filter((item) => Number(item.nps) >= 9).length;
  const detractors = responses.filter((item) => Number(item.nps) <= 6).length;
  const summary = {
    total,
    average_health: total ? Math.round(responses.reduce((sum, item) => sum + Number(item.health_score || 0), 0) / total) : 0,
    nps: total ? Math.round(((promoters - detractors) / total) * 100) : 0,
    promoters,
    detractors,
    strong: responses.filter((item) => item.risk_level === 'strong').length,
    stable: responses.filter((item) => item.risk_level === 'stable').length,
    attention: responses.filter((item) => item.risk_level === 'attention').length,
    high: responses.filter((item) => item.risk_level === 'high').length,
    contact_requested: responses.filter((item) => item.contact_requested).length,
    pending_follow_up: responses.filter((item) => item.follow_up_status !== 'resolved' && (item.risk_level === 'high' || item.risk_level === 'attention' || item.contact_requested)).length,
  };

  return res.json({ client: scope.client, summary, responses });
});

router.patch('/:id', (req, res) => {
  const scope = resolveScope(req);
  if (scope.error) return res.status(scope.status || 400).json({ error: scope.error });

  const id = Number(req.params.id);
  const current = db.prepare(`
    SELECT * FROM bee_family_survey_responses
    WHERE id = ? AND agency_id = ? AND client_id = ?
  `).get(id, scope.client.agency_id, scope.client.id);
  if (!current) return res.status(404).json({ error: 'Resposta não encontrada.' });

  const status = FOLLOW_UP_STATUSES.has(String(req.body?.follow_up_status || ''))
    ? String(req.body.follow_up_status)
    : current.follow_up_status;
  const notes = String(req.body?.follow_up_notes ?? current.follow_up_notes ?? '').trim().slice(0, 5000) || null;
  const handled = status === 'new' ? null : req.user.id;
  const handledAt = status === 'resolved' ? new Date().toISOString() : current.handled_at;

  db.prepare(`
    UPDATE bee_family_survey_responses
    SET follow_up_status = ?, follow_up_notes = ?, handled_by = ?, handled_at = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND client_id = ?
  `).run(status, notes, handled, handledAt, id, scope.client.agency_id, scope.client.id);

  const updated = db.prepare(`
    SELECT s.*, f.family_name, u.name AS handled_by_name
    FROM bee_family_survey_responses s
    LEFT JOIN reenrollment_families f ON f.id = s.family_id AND f.agency_id = s.agency_id
    LEFT JOIN users u ON u.id = s.handled_by AND u.agency_id = s.agency_id
    WHERE s.id = ? AND s.agency_id = ? AND s.client_id = ?
  `).get(id, scope.client.agency_id, scope.client.id);

  return res.json({ response: mapResponse(updated) });
});

module.exports = router;
