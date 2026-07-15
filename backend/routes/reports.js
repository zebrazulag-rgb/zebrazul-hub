const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente' });
    return false;
  }
  return true;
}

router.get('/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;

  const { from, to } = req.query;
  let query = 'SELECT * FROM report_metrics WHERE client_id = ?';
  const params = [clientId];
  if (from) { query += ' AND metric_date >= ?'; params.push(from); }
  if (to) { query += ' AND metric_date <= ?'; params.push(to); }
  query += ' ORDER BY metric_date ASC';

  const rows = db.prepare(query).all(...params);

  const totals = rows.reduce((acc, r) => {
    acc.reach += r.reach; acc.impressions += r.impressions; acc.engagement += r.engagement;
    acc.clicks += r.clicks; acc.leads += r.leads; acc.spend += r.spend; acc.conversions += r.conversions;
    return acc;
  }, { reach: 0, impressions: 0, engagement: 0, clicks: 0, leads: 0, spend: 0, conversions: 0 });

  res.json({ metrics: rows, totals });
});

router.post('/:clientId', requireRole('admin', 'team'), (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!ensureClientAccess(req, res, clientId)) return;

  const { platform, metric_date, reach, impressions, engagement, followers_delta, clicks, leads, spend, conversions } = req.body;
  if (!platform || !metric_date) return res.status(400).json({ error: 'platform e metric_date sao obrigatorios' });

  const info = db.prepare(
    `INSERT INTO report_metrics (client_id, platform, metric_date, reach, impressions, engagement, followers_delta, clicks, leads, spend, conversions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clientId, platform, metric_date,
    reach || 0, impressions || 0, engagement || 0, followers_delta || 0,
    clicks || 0, leads || 0, spend || 0, conversions || 0
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/entry/:id', requireRole('admin', 'team'), (req, res) => {
  const metric = db.prepare('SELECT client_id FROM report_metrics WHERE id = ?').get(req.params.id);
  if (!metric) return res.status(404).json({ error: 'Metrica nao encontrada' });
  if (!ensureClientAccess(req, res, metric.client_id)) return;
  db.prepare('DELETE FROM report_metrics WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
