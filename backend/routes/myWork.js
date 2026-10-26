const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { buildMyWork } = require('../services/myWork');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  if (req.user?.role === 'client') {
    return res.status(403).json({ error: 'A Minha Fila é exclusiva para a equipe interna.' });
  }

  const requestedClientId = Number(req.query.client_id || 0) || null;
  if (requestedClientId && !canAccessClient(req.user, requestedClientId)) {
    return res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
  }

  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.today_date || ''))
    ? String(req.query.today_date)
    : undefined;

  try {
    return res.json(buildMyWork(db, {
      user: req.user,
      today,
      clientId: requestedClientId,
      canSeeTasks: hasPermission(req.user, 'tasks.view'),
      canSeeAudiovisual: hasPermission(req.user, 'audiovisual.view'),
    }));
  } catch (error) {
    console.error('[MY-WORK]', error);
    return res.status(500).json({ error: 'Não foi possível montar sua fila agora.' });
  }
});

module.exports = router;
