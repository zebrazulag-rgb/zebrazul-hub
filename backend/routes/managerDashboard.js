const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const { buildManagerDashboard } = require('../services/managerDashboard');

const router = express.Router();
router.use(authRequired);

// Somente leitura. Visão da agência inteira, restrita à gestão (admin ou chefe de operações).
router.get('/', (req, res) => {
  const user = req.user;
  const isManager = user.role === 'admin' || Number(user.is_operations_head) === 1;
  if (!isManager) {
    return res.status(403).json({ error: 'O Painel do Gestor é exclusivo para administradores e chefia de operações.' });
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const today = datePattern.test(String(req.query.today_date || '')) ? String(req.query.today_date) : undefined;
  const options = {};
  const stalled = Number(req.query.stalled_days);
  if (Number.isInteger(stalled) && stalled >= 1 && stalled <= 30) options.stalledDays = stalled;

  try {
    return res.json(buildManagerDashboard(db, { agencyId: user.agency_id, today, options }));
  } catch (error) {
    console.error('[MANAGER-DASHBOARD]', error);
    return res.status(500).json({ error: 'Não foi possível montar o Painel do Gestor.' });
  }
});

module.exports = router;
