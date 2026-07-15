const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const {
  JWT_SECRET,
  authRequired,
  getUserClientIds,
  hydrateUserAccess,
} = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = ['admin', 'team', 'client'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeClientIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function validateClientIds(clientIds) {
  if (!clientIds.length) return true;
  const placeholders = clientIds.map(() => '?').join(',');
  const count = db.prepare(`SELECT COUNT(*) AS total FROM clients WHERE id IN (${placeholders})`).get(...clientIds).total;
  return Number(count) === clientIds.length;
}

function replaceUserClientAccess(userId, clientIds) {
  db.prepare('DELETE FROM user_client_access WHERE user_id = ?').run(userId);
  if (!clientIds.length) return;
  const insert = db.prepare('INSERT OR IGNORE INTO user_client_access (user_id, client_id) VALUES (?, ?)');
  clientIds.forEach((clientId) => insert.run(userId, clientId));
}

function publicUser(user) {
  const hydrated = hydrateUserAccess(user);
  return {
    id: hydrated.id,
    name: hydrated.name,
    email: hydrated.email,
    role: hydrated.role,
    client_id: hydrated.client_id,
    client_ids: hydrated.client_ids,
    avatar_color: hydrated.avatar_color,
    avatar_data: hydrated.avatar_data,
    avatar_mime: hydrated.avatar_mime,
  };
}

function attachUserAccess(users) {
  if (!users.length) return users;
  const accessRows = db.prepare(`
    SELECT uca.user_id, c.id AS client_id, c.name AS client_name
    FROM user_client_access uca
    JOIN clients c ON c.id = uca.client_id
    ORDER BY c.name
  `).all();
  const byUser = new Map();
  accessRows.forEach((row) => {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ id: Number(row.client_id), name: row.client_name });
  });
  return users.map((user) => {
    const accesses = user.role === 'team' ? (byUser.get(user.id) || []) : [];
    return {
      ...user,
      client_ids: accesses.map((client) => client.id),
      client_names: accesses.map((client) => client.name),
    };
  });
}

router.post('/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha sao obrigatorios' });

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciais invalidas' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais invalidas' });

  const token = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ user: publicUser(user) });
});

// Apenas admin pode criar novos usuarios.
router.post('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode criar usuarios' });

  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const { password, role } = req.body;
  const clientId = role === 'client' ? Number(req.body.client_id) || null : null;
  const clientIds = role === 'team' ? normalizeClientIds(req.body.client_ids) : [];

  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Campos obrigatorios faltando' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
  if (role === 'client' && !clientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });
  if (role === 'team' && !validateClientIds(clientIds)) return res.status(400).json({ error: 'Um ou mais clientes selecionados sao invalidos' });

  try {
    const createUser = db.transaction(() => {
      const passwordHash = bcrypt.hashSync(password, 10);
      const info = db.prepare(
        'INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)'
      ).run(name, email, passwordHash, role, clientId);
      replaceUserClientAccess(info.lastInsertRowid, clientIds);
      return info.lastInsertRowid;
    });
    const id = createUser();
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

// Lista membros da equipe/admin, usada para atribuir responsáveis em tarefas.
router.get('/team-users', authRequired, (req, res) => {
  let users = db.prepare(
    `SELECT id, name, role, avatar_color, avatar_data FROM users WHERE role IN ('admin','team') ORDER BY name`
  ).all().map((user) => ({
    ...user,
    client_ids: user.role === 'admin' ? [] : getUserClientIds(user.id),
  }));
  if (req.user.role === 'client') {
    const clientId = Number(req.user.client_id);
    users = users.filter((user) => user.role === 'admin' || user.client_ids.includes(clientId));
  }
  res.json({ users });
});

// Lista todos os usuários para o admin gerenciar.
router.get('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.client_id, u.avatar_color, u.avatar_data, u.avatar_mime,
            c.name as client_name
     FROM users u
     LEFT JOIN clients c ON c.id = u.client_id
     ORDER BY CASE u.role WHEN 'admin' THEN 1 WHEN 'team' THEN 2 ELSE 3 END, u.name`
  ).all();
  res.json({ users: attachUserAccess(users) });
});

// Usuário atualiza o próprio perfil.
router.put('/me', authRequired, (req, res) => {
  const { name, avatar_data: avatarData, avatar_mime: avatarMime } = req.body;
  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), avatar_data = COALESCE(?, avatar_data), avatar_mime = COALESCE(?, avatar_mime) WHERE id = ?'
  ).run(name ? String(name).trim() : null, avatarData, avatarMime, req.user.id);

  const user = db.prepare(
    'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ user: publicUser(user) });
});

// Admin edita nome, email, papel, clientes, foto e senha.
router.put('/users/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode editar usuarios' });

  const targetId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'Usuario nao encontrado' });

  const nextRole = req.body.role === undefined ? existing.role : req.body.role;
  if (!VALID_ROLES.includes(nextRole)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  if (targetId === req.user.id && nextRole !== existing.role) {
    return res.status(400).json({ error: 'Voce nao pode alterar o proprio papel de acesso' });
  }

  if (existing.role === 'admin' && nextRole !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'").get().total;
    if (adminCount <= 1) return res.status(400).json({ error: 'O sistema precisa manter pelo menos um administrador' });
  }

  const nextName = req.body.name === undefined ? existing.name : String(req.body.name || '').trim();
  const nextEmail = req.body.email === undefined ? existing.email : normalizeEmail(req.body.email);
  if (!nextName || !nextEmail) return res.status(400).json({ error: 'Nome e email sao obrigatorios' });

  let nextClientId = existing.client_id;
  if (nextRole !== 'client') {
    nextClientId = null;
  } else if (req.body.client_id !== undefined) {
    nextClientId = Number(req.body.client_id) || null;
  }
  if (nextRole === 'client' && !nextClientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });

  const nextClientIds = nextRole === 'team'
    ? (req.body.client_ids === undefined ? getUserClientIds(targetId) : normalizeClientIds(req.body.client_ids))
    : [];
  if (nextRole === 'team' && !validateClientIds(nextClientIds)) {
    return res.status(400).json({ error: 'Um ou mais clientes selecionados sao invalidos' });
  }

  let nextPasswordHash = existing.password_hash;
  if (req.body.password !== undefined && req.body.password !== '') {
    if (String(req.body.password).length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
    }
    nextPasswordHash = bcrypt.hashSync(req.body.password, 10);
  }

  const nextAvatarData = req.body.avatar_data === undefined ? existing.avatar_data : req.body.avatar_data;
  const nextAvatarMime = req.body.avatar_mime === undefined ? existing.avatar_mime : req.body.avatar_mime;

  try {
    const updateUser = db.transaction(() => {
      db.prepare(
        `UPDATE users SET
          name = ?, email = ?, password_hash = ?, role = ?, client_id = ?,
          avatar_data = ?, avatar_mime = ?
         WHERE id = ?`
      ).run(
        nextName,
        nextEmail,
        nextPasswordHash,
        nextRole,
        nextClientId,
        nextAvatarData,
        nextAvatarMime,
        targetId
      );
      replaceUserClientAccess(targetId, nextClientIds);
    });
    updateUser();

    const updatedUser = db.prepare(
      'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
    ).get(targetId);
    res.json({ ok: true, user: publicUser(updatedUser) });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

const deleteUserTransaction = db.transaction((targetId, replacementUserId) => {
  db.prepare('UPDATE clients SET responsible_user_id = NULL WHERE responsible_user_id = ?').run(targetId);
  db.prepare('UPDATE posts SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('UPDATE tasks SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?').run(targetId);
  db.prepare('UPDATE financial_entries SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
});

router.delete('/users/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode apagar usuarios' });

  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Voce nao pode apagar o proprio usuario' });

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuario nao encontrado' });

  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'").get().total;
    if (adminCount <= 1) return res.status(400).json({ error: 'O sistema precisa manter pelo menos um administrador' });
  }

  try {
    deleteUserTransaction(targetId, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao apagar usuario:', err);
    res.status(400).json({ error: 'Nao foi possivel apagar este usuario' });
  }
});

module.exports = router;
