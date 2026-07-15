const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'zebrazul-hub-dev-secret-troque-em-producao';

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const currentUser = db.prepare(
      'SELECT id, name, email, role, client_id FROM users WHERE id = ?'
    ).get(payload.id);

    if (!currentUser) {
      return res.status(401).json({ error: 'Usuario nao existe mais ou teve o acesso removido' });
    }

    // Usa sempre o papel e o cliente atuais do banco. Assim, exclusões e mudanças
    // de permissão passam a valer imediatamente, sem esperar o JWT expirar.
    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado para este papel de usuario' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole, JWT_SECRET };
