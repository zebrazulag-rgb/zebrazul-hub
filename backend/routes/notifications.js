const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
  const notifications = db.prepare(`
    SELECT id, type, title, message, entity_type, entity_id, link, read_at, created_at
    FROM notifications
    WHERE agency_id = ? AND user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(req.user.agency_id, req.user.id, limit);
  const unread = Number(db.prepare(`
    SELECT COUNT(*) AS total
    FROM notifications
    WHERE agency_id = ? AND user_id = ? AND read_at IS NULL
  `).get(req.user.agency_id, req.user.id)?.total || 0);
  res.json({ notifications, unread });
});

router.put('/:id/read', (req, res) => {
  db.prepare(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, datetime('now'))
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).run(Number(req.params.id), req.user.agency_id, req.user.id);
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  db.prepare(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, datetime('now'))
    WHERE agency_id = ? AND user_id = ? AND read_at IS NULL
  `).run(req.user.agency_id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
