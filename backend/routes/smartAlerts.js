const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { buildSmartAlerts } = require('../services/smartAlerts');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  if (req.user?.role === 'client') return res.status(403).json({ error: 'O radar é exclusivo para a equipe interna.' });
  const requestedClientId = Number(req.query.client_id || 0) || null;
  if (requestedClientId && !canAccessClient(req.user, requestedClientId)) {
    return res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
  }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.today_date || '')) ? String(req.query.today_date) : undefined;
  try {
    return res.json(buildSmartAlerts(db, {
      user: req.user,
      today,
      clientId: requestedClientId,
      canSeeTasks: hasPermission(req.user, 'tasks.view'),
      canSeeAudiovisual: hasPermission(req.user, 'audiovisual.view'),
      canSeeSocial: hasPermission(req.user, 'social.view'),
    }));
  } catch (error) {
    console.error('[SMART-ALERTS]', error);
    return res.status(500).json({ error: 'Não foi possível montar o radar agora.' });
  }
});

module.exports = router;
