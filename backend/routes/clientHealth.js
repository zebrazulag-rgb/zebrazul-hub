const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { CRITERIA, normalizeScores, computeTotal, levelOf } = require('../services/clientHealth');

const router = express.Router();
router.use(authRequired);

const isManager = (user) => user.role === 'admin' || Number(user.is_operations_head) === 1;

router.use((req, res, next) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  return next();
});

function parseScores(text) {
  try { return JSON.parse(text || '{}') || {}; } catch { return {}; }
}

function shape(row) {
  const scores = parseScores(row.scores);
  const total = computeTotal(scores);
  return {
    client_id: Number(row.client_id),
    scores,
    notes: row.notes || '',
    total,
    level: levelOf(total),
    updated_at: row.updated_at || null,
  };
}

// Lista as pontuações dos clientes que o usuário pode ver (para o seletor de clientes).
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM client_health_scores WHERE agency_id = ?').all(req.user.agency_id)
    .filter((row) => canAccessClient(req.user, row.client_id));
  res.json({ criteria: CRITERIA, can_edit: isManager(req.user), scores: rows.map(shape) });
});

router.get('/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  const row = db.prepare('SELECT * FROM client_health_scores WHERE agency_id = ? AND client_id = ?').get(req.user.agency_id, clientId);
  const history = db.prepare(`
    SELECT total, created_at FROM client_health_history
    WHERE agency_id = ? AND client_id = ? ORDER BY id DESC LIMIT 12
  `).all(req.user.agency_id, clientId).reverse();
  res.json({
    criteria: CRITERIA,
    can_edit: isManager(req.user),
    health: row ? shape(row) : { client_id: clientId, scores: {}, notes: '', total: null, level: 'none', updated_at: null },
    history,
  });
});

router.put('/:clientId', (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Somente o gestor pode pontuar clientes.' });
  const clientId = Number(req.params.clientId);
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

  let scores;
  try { scores = normalizeScores(req.body?.scores || {}); } catch (error) { return res.status(400).json({ error: error.message }); }
  const total = computeTotal(scores);
  const notes = String(req.body?.notes || '').slice(0, 2000);

  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO client_health_scores (agency_id, client_id, scores, notes, total, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (agency_id, client_id) DO UPDATE SET
        scores = excluded.scores, notes = excluded.notes, total = excluded.total,
        updated_by = excluded.updated_by, updated_at = datetime('now')
    `).run(req.user.agency_id, clientId, JSON.stringify(scores), notes, total, req.user.id);
    db.prepare('INSERT INTO client_health_history (agency_id, client_id, scores, total, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.agency_id, clientId, JSON.stringify(scores), total, req.user.id);
  });
  save();
  const row = db.prepare('SELECT * FROM client_health_scores WHERE agency_id = ? AND client_id = ?').get(req.user.agency_id, clientId);
  res.json({ ok: true, health: shape(row) });
});

module.exports = router;
