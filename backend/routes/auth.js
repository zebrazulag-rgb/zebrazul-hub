const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha sao obrigatorios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciais invalidas' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais invalidas' });

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, client_id: user.client_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, client_id: user.client_id, avatar_color: user.avatar_color, avatar_data: user.avatar_data }
  });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, client_id, avatar_color, avatar_data FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Apenas admin pode criar novos usuarios (equipe ou clientes)
router.post('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode criar usuarios' });
  const { name, email, password, role, client_id } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Campos obrigatorios faltando' });

  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, password_hash, role, client_id || null);
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

// Lista todos os usuários (para o admin gerenciar/editar fotos)
router.get('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.client_id, u.avatar_color, u.avatar_data, c.name as client_name
     FROM users u LEFT JOIN clients c ON c.id = u.client_id ORDER BY u.role, u.name`
  ).all();
  res.json({ users });
});

// Usuário atualiza o próprio perfil (nome e/ou foto)
router.put('/me', authRequired, (req, res) => {
  const { name, avatar_data, avatar_mime } = req.body;
  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), avatar_data = COALESCE(?, avatar_data), avatar_mime = COALESCE(?, avatar_mime) WHERE id = ?'
  ).run(name, avatar_data, avatar_mime, req.user.id);
  const user = db.prepare('SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Admin atualiza dados/foto de qualquer usuário
router.put('/users/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode editar usuarios' });
  const { name, avatar_data, avatar_mime, role, client_id } = req.body;
  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), avatar_data = COALESCE(?, avatar_data), avatar_mime = COALESCE(?, avatar_mime), role = COALESCE(?, role), client_id = COALESCE(?, client_id) WHERE id = ?'
  ).run(name, avatar_data, avatar_mime, role, client_id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
