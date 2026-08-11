const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { encryptSecret, decryptSecret, vaultUsesDedicatedKey } = require('../services/credentialVault');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function normalizeText(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function getClient(clientId, agencyId) {
  if (!clientId) return null;
  return db.prepare('SELECT id, name FROM clients WHERE id = ? AND agency_id = ?').get(Number(clientId), Number(agencyId));
}

function getCredentialRow(id, agencyId) {
  return db.prepare(`
    SELECT c.*, clients.name AS client_name,
           users.name AS created_by_name,
           (
             SELECT MAX(log.created_at)
             FROM credential_access_logs log
             WHERE log.credential_id = c.id AND log.action IN ('reveal_password','view_details')
           ) AS last_viewed_at
    FROM client_credentials c
    LEFT JOIN clients ON clients.id = c.client_id AND clients.agency_id = c.agency_id
    LEFT JOIN users ON users.id = c.created_by
    WHERE c.id = ? AND c.agency_id = ?
  `).get(Number(id), Number(agencyId));
}

function publicCredential(row, { includeNotes = false } = {}) {
  if (!row) return null;
  let login = '';
  let url = '';
  let notes = '';
  try {
    login = decryptSecret(row.login_encrypted, row.agency_id);
    url = decryptSecret(row.url_encrypted, row.agency_id);
    if (includeNotes) notes = decryptSecret(row.notes_encrypted, row.agency_id);
  } catch (error) {
    console.error('[VAULT] Falha ao descriptografar credencial', row.id, error.message);
    login = '••••••••';
    url = '';
    if (includeNotes) notes = '';
  }

  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name || null,
    service: row.service,
    login,
    url,
    notes: includeNotes ? notes : undefined,
    has_password: Boolean(row.password_encrypted),
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_viewed_at: row.last_viewed_at || null,
  };
}

function audit(req, credentialId, action) {
  try {
    db.prepare(`
      INSERT INTO credential_access_logs (agency_id, credential_id, user_id, action, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Number(req.user.agency_id),
      Number(credentialId),
      Number(req.user.id),
      action,
      normalizeText(req.ip || req.headers['x-forwarded-for'] || '', 120) || null
    );
  } catch (error) {
    console.error('[VAULT] Falha ao registrar auditoria:', error.message);
  }
}

router.get('/security', (req, res) => {
  res.json({ dedicated_key_configured: vaultUsesDedicatedKey() });
});

router.get('/', (req, res) => {
  const params = [Number(req.user.agency_id)];
  let clientClause = '';
  if (req.query.client_id && req.query.client_id !== 'all') {
    clientClause = 'AND c.client_id = ?';
    params.push(Number(req.query.client_id));
  }

  const rows = db.prepare(`
    SELECT c.*, clients.name AS client_name,
           users.name AS created_by_name,
           (
             SELECT MAX(log.created_at)
             FROM credential_access_logs log
             WHERE log.credential_id = c.id AND log.action IN ('reveal_password','view_details')
           ) AS last_viewed_at
    FROM client_credentials c
    LEFT JOIN clients ON clients.id = c.client_id AND clients.agency_id = c.agency_id
    LEFT JOIN users ON users.id = c.created_by
    WHERE c.agency_id = ? ${clientClause}
    ORDER BY COALESCE(clients.name, 'ZZZ'), lower(c.service), c.id DESC
  `).all(...params);

  let credentials = rows.map((row) => publicCredential(row));
  const q = normalizeText(req.query.q, 120).toLocaleLowerCase('pt-BR');
  if (q) {
    credentials = credentials.filter((item) => [item.service, item.login, item.client_name, item.url]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(q)));
  }

  res.json({ credentials });
});

router.get('/:id', (req, res) => {
  const row = getCredentialRow(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Credencial nao encontrada' });
  audit(req, row.id, 'view_details');
  res.json({ credential: publicCredential(row, { includeNotes: true }) });
});

router.post('/:id/reveal', (req, res) => {
  const row = getCredentialRow(req.params.id, req.user.agency_id);
  if (!row) return res.status(404).json({ error: 'Credencial nao encontrada' });

  try {
    const password = decryptSecret(row.password_encrypted, row.agency_id);
    audit(req, row.id, 'reveal_password');
    res.set('Cache-Control', 'no-store');
    return res.json({ password });
  } catch (error) {
    console.error('[VAULT] Erro ao revelar senha:', error.message);
    return res.status(500).json({ error: 'Nao foi possivel abrir esta senha. Verifique a chave do cofre.' });
  }
});

router.post('/', (req, res) => {
  const clientId = req.body.client_id ? Number(req.body.client_id) : null;
  const client = clientId ? getClient(clientId, req.user.agency_id) : null;
  if (clientId && !client) return res.status(400).json({ error: 'Cliente invalido para esta agencia' });

  const service = normalizeText(req.body.service, 120);
  const login = normalizeText(req.body.login, 300);
  const password = String(req.body.password || '');
  const url = normalizeText(req.body.url, 1000);
  const notes = normalizeText(req.body.notes, 5000);

  if (!service) return res.status(400).json({ error: 'Informe o servico ou plataforma' });
  if (!password) return res.status(400).json({ error: 'Informe a senha' });
  if (password.length > 4000) return res.status(400).json({ error: 'Senha muito longa' });

  const info = db.prepare(`
    INSERT INTO client_credentials
      (agency_id, client_id, created_by, service, login_encrypted, password_encrypted, url_encrypted, notes_encrypted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(req.user.agency_id),
    clientId,
    Number(req.user.id),
    service,
    encryptSecret(login, req.user.agency_id),
    encryptSecret(password, req.user.agency_id),
    encryptSecret(url, req.user.agency_id),
    encryptSecret(notes, req.user.agency_id)
  );

  audit(req, info.lastInsertRowid, 'create');
  const row = getCredentialRow(info.lastInsertRowid, req.user.agency_id);
  res.status(201).json({ credential: publicCredential(row) });
});

router.put('/:id', (req, res) => {
  const current = getCredentialRow(req.params.id, req.user.agency_id);
  if (!current) return res.status(404).json({ error: 'Credencial nao encontrada' });

  const clientId = req.body.client_id === '' || req.body.client_id === null
    ? null
    : (req.body.client_id !== undefined ? Number(req.body.client_id) : current.client_id);
  const client = clientId ? getClient(clientId, req.user.agency_id) : null;
  if (clientId && !client) return res.status(400).json({ error: 'Cliente invalido para esta agencia' });

  const service = req.body.service !== undefined ? normalizeText(req.body.service, 120) : current.service;
  const login = req.body.login !== undefined ? normalizeText(req.body.login, 300) : decryptSecret(current.login_encrypted, current.agency_id);
  const url = req.body.url !== undefined ? normalizeText(req.body.url, 1000) : decryptSecret(current.url_encrypted, current.agency_id);
  const notes = req.body.notes !== undefined ? normalizeText(req.body.notes, 5000) : decryptSecret(current.notes_encrypted, current.agency_id);
  const password = req.body.password !== undefined ? String(req.body.password || '') : null;

  if (!service) return res.status(400).json({ error: 'Informe o servico ou plataforma' });
  if (password && password.length > 4000) return res.status(400).json({ error: 'Senha muito longa' });

  db.prepare(`
    UPDATE client_credentials
    SET client_id = ?, service = ?, login_encrypted = ?, password_encrypted = ?, url_encrypted = ?, notes_encrypted = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    clientId,
    service,
    encryptSecret(login, req.user.agency_id),
    password ? encryptSecret(password, req.user.agency_id) : current.password_encrypted,
    encryptSecret(url, req.user.agency_id),
    encryptSecret(notes, req.user.agency_id),
    Number(current.id),
    Number(req.user.agency_id)
  );

  audit(req, current.id, 'update');
  const row = getCredentialRow(current.id, req.user.agency_id);
  res.json({ credential: publicCredential(row) });
});

router.delete('/:id', (req, res) => {
  const current = getCredentialRow(req.params.id, req.user.agency_id);
  if (!current) return res.status(404).json({ error: 'Credencial nao encontrada' });

  audit(req, current.id, 'delete');
  db.prepare('DELETE FROM client_credentials WHERE id = ? AND agency_id = ?').run(Number(current.id), Number(req.user.agency_id));
  res.json({ ok: true });
});

module.exports = router;
