const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function scopeClientId(req) {
  // Clientes so podem ver o proprio registro
  return req.user.role === 'client' ? req.user.client_id : null;
}

router.get('/', (req, res) => {
  const forcedId = scopeClientId(req);
  const rows = forcedId
    ? db.prepare('SELECT * FROM clients WHERE id = ?').all(forcedId)
    : db.prepare('SELECT * FROM clients ORDER BY name').all();
  res.json({ clients: rows });
});

router.get('/:id', (req, res) => {
  const forcedId = scopeClientId(req);
  if (forcedId && Number(req.params.id) !== forcedId) return res.status(403).json({ error: 'Acesso negado' });
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  const accounts = db.prepare('SELECT * FROM social_accounts WHERE client_id = ?').all(req.params.id);
  res.json({ client, accounts });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const { name, segment, logo_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do cliente e obrigatorio' });
  const info = db.prepare(
    'INSERT INTO clients (name, segment, logo_color, responsible_user_id) VALUES (?, ?, ?, ?)'
  ).run(name, segment || null, logo_color || '#0ea5e9', req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requireRole('admin', 'team'), (req, res) => {
  const { name, segment, logo_color, status } = req.body;
  db.prepare(
    'UPDATE clients SET name = COALESCE(?, name), segment = COALESCE(?, segment), logo_color = COALESCE(?, logo_color), status = COALESCE(?, status) WHERE id = ?'
  ).run(name, segment, logo_color, status, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/accounts', requireRole('admin', 'team'), (req, res) => {
  const { platform, handle } = req.body;
  if (!platform) return res.status(400).json({ error: 'Plataforma e obrigatoria' });
  const info = db.prepare(
    'INSERT INTO social_accounts (client_id, platform, handle, connected) VALUES (?, ?, ?, 1)'
  ).run(req.params.id, platform, handle || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/accounts/:accountId', requireRole('admin', 'team'), (req, res) => {
  db.prepare('DELETE FROM social_accounts WHERE id = ?').run(req.params.accountId);
  res.json({ ok: true });
});

module.exports = router;
