const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const SOCIAL_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'google_business', 'youtube']);

function normalizeSocialAccounts(value) {
  if (!value) return null;
  const source = Array.isArray(value) ? value : Object.entries(value).map(([platform, handle]) => ({ platform, handle }));
  return source
    .filter((account) => SOCIAL_PLATFORMS.has(account?.platform))
    .map((account) => ({ platform: account.platform, handle: String(account.handle || '').trim() }))
    .filter((account) => account.handle);
}

function replaceSocialAccounts(clientId, accounts, agencyId) {
  if (accounts === null) return;
  db.prepare('DELETE FROM social_accounts WHERE client_id = ? AND agency_id = ?').run(clientId, agencyId);
  const insert = db.prepare(`
    INSERT INTO social_accounts (agency_id, client_id, platform, handle, connected)
    VALUES (?, ?, ?, ?, 1)
  `);
  for (const account of accounts) insert.run(agencyId, clientId, account.platform, account.handle);
}

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente' });
    return false;
  }
  return true;
}

router.get('/', (req, res) => {
  const fields = req.query.summary === '1' || req.query.summary === 'dashboard'
    ? 'id, name, status, logo_color'
    : '*';
  let rows;
  if (req.user.role === 'admin' || req.user.is_operations_head) {
    rows = db.prepare(`SELECT ${fields} FROM clients WHERE agency_id = ? ORDER BY name`).all(req.user.agency_id);
  } else if (req.user.role === 'client') {
    rows = req.user.client_id
      ? db.prepare(`SELECT ${fields} FROM clients WHERE id = ? AND agency_id = ?`).all(req.user.client_id, req.user.agency_id)
      : [];
  } else if (req.user.client_ids.length) {
    const placeholders = req.user.client_ids.map(() => '?').join(',');
    rows = db.prepare(`SELECT ${fields} FROM clients WHERE agency_id = ? AND id IN (${placeholders}) ORDER BY name`)
      .all(req.user.agency_id, ...req.user.client_ids);
  } else rows = [];
  res.json({ clients: rows });
});

router.get('/:id', (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  const accounts = db.prepare('SELECT * FROM social_accounts WHERE client_id = ? AND agency_id = ? ORDER BY platform')
    .all(req.params.id, req.user.agency_id);
  res.json({ client, accounts });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const { name, segment, cnpj, address, phone, email, logo_color, status, social_accounts, socials } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Nome do cliente e obrigatorio' });

  const agency = db.prepare('SELECT max_clients FROM agencies WHERE id = ?').get(req.user.agency_id);
  const currentCount = db.prepare('SELECT COUNT(*) AS total FROM clients WHERE agency_id = ?').get(req.user.agency_id).total;
  if (!req.user.is_platform_owner && Number(currentCount) >= Number(agency?.max_clients || 10)) {
    return res.status(403).json({ error: 'Limite de clientes do plano atingido' });
  }

  const accounts = normalizeSocialAccounts(social_accounts ?? socials);
  const createClient = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO clients (
        agency_id, name, segment, cnpj, address, phone, email,
        logo_color, status, responsible_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.agency_id,
      String(name).trim(), segment || null, cnpj || null, address || null,
      phone || null, email || null, logo_color || '#0ea5e9', status || 'active', req.user.id
    );
    replaceSocialAccounts(info.lastInsertRowid, accounts, req.user.agency_id);
    if (req.user.role === 'team') {
      db.prepare('INSERT OR IGNORE INTO user_client_access (user_id, client_id) VALUES (?, ?)')
        .run(req.user.id, info.lastInsertRowid);
    }
    return info.lastInsertRowid;
  });

  const id = createClient();
  res.status(201).json({ id });
});

router.put('/:id', requireRole('admin', 'team'), (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'name') && !String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'Nome do cliente e obrigatorio' });
  }

  const allowedFields = [
    'name', 'segment', 'cnpj', 'address', 'phone', 'email', 'logo_color', 'status',
    'avatar_data', 'avatar_mime', 'bio', 'instagram_username', 'instagram_display_name',
    'instagram_posts_count', 'instagram_followers_count', 'instagram_following_count',
    'instagram_link', 'instagram_primary_action', 'instagram_secondary_action', 'instagram_tertiary_action'
  ];
  const updates = [];
  const values = [];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field} = ?`);
      values.push(field === 'name' ? String(req.body[field]).trim() : (req.body[field] || null));
    }
  }
  const accounts = normalizeSocialAccounts(req.body.social_accounts ?? req.body.socials);
  const updateClient = db.transaction(() => {
    if (updates.length > 0) {
      db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
        .run(...values, req.params.id, req.user.agency_id);
    }
    replaceSocialAccounts(req.params.id, accounts, req.user.agency_id);
  });
  updateClient();
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  db.prepare('DELETE FROM clients WHERE id = ? AND agency_id = ?').run(req.params.id, req.user.agency_id);
  res.json({ ok: true });
});

router.post('/:id/feed-share', requireRole('admin', 'team'), (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  let token = client.feed_share_token;
  if (!token) {
    token = require('crypto').randomBytes(16).toString('hex');
    db.prepare('UPDATE clients SET feed_share_token = ? WHERE id = ? AND agency_id = ?').run(token, req.params.id, req.user.agency_id);
  }
  res.json({ token });
});

router.post('/:id/accounts', requireRole('admin', 'team'), (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const { platform, handle } = req.body;
  if (!SOCIAL_PLATFORMS.has(platform)) return res.status(400).json({ error: 'Plataforma invalida' });
  if (!String(handle || '').trim()) return res.status(400).json({ error: 'Perfil ou link e obrigatorio' });
  const info = db.prepare(`
    INSERT INTO social_accounts (agency_id, client_id, platform, handle, connected)
    VALUES (?, ?, ?, ?, 1)
  `).run(req.user.agency_id, req.params.id, platform, String(handle).trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/accounts/:accountId', requireRole('admin', 'team'), (req, res) => {
  const account = db.prepare('SELECT client_id FROM social_accounts WHERE id = ? AND agency_id = ?')
    .get(req.params.accountId, req.user.agency_id);
  if (!account) return res.status(404).json({ error: 'Conta social nao encontrada' });
  if (!ensureClientAccess(req, res, account.client_id)) return;
  db.prepare('DELETE FROM social_accounts WHERE id = ? AND agency_id = ?').run(req.params.accountId, req.user.agency_id);
  res.json({ ok: true });
});

module.exports = router;
