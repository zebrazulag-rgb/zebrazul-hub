const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team'));

function clientRecord(req, res) {
  const clientId = Number(req.params.clientId);
  if (!clientId) {
    res.status(400).json({ error: 'Cliente inválido' });
    return null;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return null;
  }
  const client = db.prepare(`
    SELECT id, name, status, logo_color, avatar_data
    FROM clients
    WHERE id = ? AND agency_id = ?
  `).get(clientId, req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado' });
    return null;
  }
  return client;
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function publicLinkRow(clientId, agencyId) {
  return db.prepare(`
    SELECT id, client_id, token, active, created_at, updated_at
    FROM client_task_request_links
    WHERE agency_id = ? AND client_id = ?
  `).get(Number(agencyId), Number(clientId));
}

router.get('/:clientId', (req, res) => {
  const client = clientRecord(req, res);
  if (!client) return;
  const link = publicLinkRow(client.id, req.user.agency_id) || null;
  res.json({ client, link });
});

router.post('/:clientId', (req, res) => {
  const client = clientRecord(req, res);
  if (!client) return;

  let link = publicLinkRow(client.id, req.user.agency_id);
  if (!link) {
    const info = db.prepare(`
      INSERT INTO client_task_request_links (agency_id, client_id, token, active, created_by)
      VALUES (?, ?, ?, 1, ?)
    `).run(req.user.agency_id, client.id, createToken(), req.user.id);
    link = db.prepare(`
      SELECT id, client_id, token, active, created_at, updated_at
      FROM client_task_request_links WHERE id = ?
    `).get(info.lastInsertRowid);
  } else if (Number(link.active) !== 1) {
    db.prepare(`
      UPDATE client_task_request_links
      SET active = 1, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(link.id, req.user.agency_id);
    link = publicLinkRow(client.id, req.user.agency_id);
  }

  res.status(201).json({ client, link });
});

router.post('/:clientId/regenerate', (req, res) => {
  const client = clientRecord(req, res);
  if (!client) return;

  const existing = publicLinkRow(client.id, req.user.agency_id);
  if (!existing) {
    const info = db.prepare(`
      INSERT INTO client_task_request_links (agency_id, client_id, token, active, created_by)
      VALUES (?, ?, ?, 1, ?)
    `).run(req.user.agency_id, client.id, createToken(), req.user.id);
    const link = db.prepare(`
      SELECT id, client_id, token, active, created_at, updated_at
      FROM client_task_request_links WHERE id = ?
    `).get(info.lastInsertRowid);
    return res.status(201).json({ client, link });
  }

  db.prepare(`
    UPDATE client_task_request_links
    SET token = ?, active = 1, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(createToken(), existing.id, req.user.agency_id);

  res.json({ client, link: publicLinkRow(client.id, req.user.agency_id) });
});

router.put('/:clientId/status', (req, res) => {
  const client = clientRecord(req, res);
  if (!client) return;
  const link = publicLinkRow(client.id, req.user.agency_id);
  if (!link) return res.status(404).json({ error: 'Gere o link antes de alterar o status' });

  const active = req.body?.active === true || Number(req.body?.active) === 1 ? 1 : 0;
  db.prepare(`
    UPDATE client_task_request_links
    SET active = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(active, link.id, req.user.agency_id);

  res.json({ client, link: publicLinkRow(client.id, req.user.agency_id) });
});

module.exports = router;
