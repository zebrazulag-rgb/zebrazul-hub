const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET, authRequired } = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = ['admin', 'team', 'client'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    client_id: user.client_id,
    avatar_color: user.avatar_color,
    avatar_data: user.avatar_data,
    avatar_mime: user.avatar_mime
  };
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
    { id: user.id, name: user.name, role: user.role, client_id: user.client_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ user });
});

// Apenas admin pode criar novos usuarios (equipe ou clientes)
router.post('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode criar usuarios' });

  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const { password, role } = req.body;
  const clientId = role === 'client' ? Number(req.body.client_id) || null : null;

  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Campos obrigatorios faltando' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
  if (role === 'client' && !clientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, passwordHash, role, clientId);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

// Lista membros da equipe/admin, usada para atribuir responsáveis em tarefas
router.get('/team-users', authRequired, (req, res) => {
  if (!['admin', 'team'].includes(req.user.role)) return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare(
    `SELECT id, name, avatar_color, avatar_data FROM users WHERE role IN ('admin','team') ORDER BY name`
  ).all();
  res.json({ users });
});

// Lista todos os usuários para o admin gerenciar
router.get('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.client_id, u.avatar_color, u.avatar_data, u.avatar_mime,
            c.name as client_name
     FROM users u
     LEFT JOIN clients c ON c.id = u.client_id
     ORDER BY CASE u.role WHEN 'admin' THEN 1 WHEN 'team' THEN 2 ELSE 3 END, u.name`
  ).all();
  res.json({ users });
});

// Usuário atualiza o próprio perfil (nome e/ou foto)
router.put('/me', authRequired, (req, res) => {
  const { name, avatar_data: avatarData, avatar_mime: avatarMime } = req.body;
  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), avatar_data = COALESCE(?, avatar_data), avatar_mime = COALESCE(?, avatar_mime) WHERE id = ?'
  ).run(name ? String(name).trim() : null, avatarData, avatarMime, req.user.id);

  const user = db.prepare(
    'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ user });
});

// Admin edita nome, email, papel, cliente, foto e senha de qualquer usuário
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

    const updatedUser = db.prepare(
      'SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?'
    ).get(targetId);
    res.json({ ok: true, user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

const deleteUserTransaction = db.transaction((targetId, replacementUserId) => {
  // Mantém conteúdos, tarefas e lançamentos. A autoria técnica passa para o admin
  // que executou a exclusão; atribuições pessoais são removidas.
  db.prepare('UPDATE clients SET responsible_user_id = NULL WHERE responsible_user_id = ?').run(targetId);
  db.prepare('UPDATE posts SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('UPDATE tasks SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?').run(targetId);
  db.prepare('UPDATE financial_entries SET created_by = ? WHERE created_by = ?').run(replacementUserId, targetId);
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
});

// Admin apaga usuários, sem apagar os conteúdos e dados operacionais criados por eles
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
