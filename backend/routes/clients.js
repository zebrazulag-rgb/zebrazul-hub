const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const SOCIAL_PLATFORMS = new Set([
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'google_business',
  'youtube',
]);

function normalizeSocialAccounts(value) {
  if (!value) return null;

  const source = Array.isArray(value)
    ? value
    : Object.entries(value).map(([platform, handle]) => ({ platform, handle }));

  return source
    .filter((account) => SOCIAL_PLATFORMS.has(account?.platform))
    .map((account) => ({
      platform: account.platform,
      handle: String(account.handle || '').trim(),
    }))
    .filter((account) => account.handle);
}

function replaceSocialAccounts(clientId, accounts) {
  if (accounts === null) return;

  db.prepare('DELETE FROM social_accounts WHERE client_id = ?').run(clientId);
  const insert = db.prepare(
    'INSERT INTO social_accounts (client_id, platform, handle, connected) VALUES (?, ?, ?, 1)'
  );
  for (const account of accounts) {
    insert.run(clientId, account.platform, account.handle);
  }
}

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Voce nao tem acesso a este cliente' });
    return false;
  }
  return true;
}

router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM clients ORDER BY name').all();
  } else if (req.user.role === 'client') {
    rows = req.user.client_id
      ? db.prepare('SELECT * FROM clients WHERE id = ?').all(req.user.client_id)
      : [];
  } else if (req.user.client_ids.length) {
    const placeholders = req.user.client_ids.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM clients WHERE id IN (${placeholders}) ORDER BY name`).all(...req.user.client_ids);
  } else {
    rows = [];
  }
  res.json({ clients: rows });
});

router.get('/:id', (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });

  const accounts = db.prepare(
    'SELECT * FROM social_accounts WHERE client_id = ? ORDER BY platform'
  ).all(req.params.id);
  res.json({ client, accounts });
});

router.post('/', requireRole('admin', 'team'), (req, res) => {
  const {
    name,
    segment,
    cnpj,
    address,
    phone,
    email,
    logo_color,
    status,
    social_accounts,
    socials,
  } = req.body;

  if (!String(name || '').trim()) {
    return res.status(400).json({ error: 'Nome do cliente e obrigatorio' });
  }

  const accounts = normalizeSocialAccounts(social_accounts ?? socials);

  const createClient = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO clients (
        name, segment, cnpj, address, phone, email,
        logo_color, status, responsible_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(name).trim(),
      segment || null,
      cnpj || null,
      address || null,
      phone || null,
      email || null,
      logo_color || '#0ea5e9',
      status || 'active',
      req.user.id
    );

    replaceSocialAccounts(info.lastInsertRowid, accounts);
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

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'name') && !String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'Nome do cliente e obrigatorio' });
  }

  const allowedFields = [
    'name',
    'segment',
    'cnpj',
    'address',
    'phone',
    'email',
    'logo_color',
    'status',
    'avatar_data',
    'avatar_mime',
    'bio',
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
      db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`)
        .run(...values, req.params.id);
    }
    replaceSocialAccounts(req.params.id, accounts);
  });

  updateClient();
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/feed-share', requireRole('admin', 'team'), (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });

  let token = client.feed_share_token;
  if (!token) {
    token = require('crypto').randomBytes(16).toString('hex');
    db.prepare('UPDATE clients SET feed_share_token = ? WHERE id = ?').run(token, req.params.id);
  }
  res.json({ token });
});

router.post('/:id/accounts', requireRole('admin', 'team'), (req, res) => {
  if (!ensureClientAccess(req, res, req.params.id)) return;
  const { platform, handle } = req.body;
  if (!SOCIAL_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: 'Plataforma invalida' });
  }
  if (!String(handle || '').trim()) {
    return res.status(400).json({ error: 'Perfil ou link e obrigatorio' });
  }

  const info = db.prepare(
    'INSERT INTO social_accounts (client_id, platform, handle, connected) VALUES (?, ?, ?, 1)'
  ).run(req.params.id, platform, String(handle).trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/accounts/:accountId', requireRole('admin', 'team'), (req, res) => {
  const account = db.prepare('SELECT client_id FROM social_accounts WHERE id = ?').get(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Conta social nao encontrada' });
  if (!ensureClientAccess(req, res, account.client_id)) return;
  db.prepare('DELETE FROM social_accounts WHERE id = ?').run(req.params.accountId);
  res.json({ ok: true });
});

module.exports = router;
