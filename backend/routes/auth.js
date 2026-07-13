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
    user: { id: user.id, name: user.name, email: user.email, role: user.role, client_id: user.client_id, avatar_color: user.avatar_color }
  });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, client_id, avatar_color FROM users WHERE id = ?').get(req.user.id);
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

module.exports = router;
