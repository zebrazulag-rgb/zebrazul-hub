const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'zebrazul-hub-dev-secret-troque-em-producao';

function getUserClientIds(userId) {
  return db.prepare(
    'SELECT client_id FROM user_client_access WHERE user_id = ? ORDER BY client_id'
  ).all(userId).map((row) => Number(row.client_id));
}

function hydrateUserAccess(user) {
  if (!user) return user;
  if (user.role === 'admin') return { ...user, client_ids: [] };
  if (user.role === 'client') return { ...user, client_ids: user.client_id ? [Number(user.client_id)] : [] };
  return { ...user, client_ids: getUserClientIds(user.id) };
}

function canAccessClient(user, clientId) {
  if (!user) return false;
  const normalizedClientId = Number(clientId);
  if (!normalizedClientId) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'client') return Number(user.client_id) === normalizedClientId;
  return Array.isArray(user.client_ids) && user.client_ids.includes(normalizedClientId);
}

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

    // Usa sempre o papel e os clientes atuais do banco. Mudanças de permissão
    // passam a valer imediatamente, sem esperar o JWT expirar.
    req.user = hydrateUserAccess(currentUser);
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

module.exports = {
  authRequired,
  requireRole,
  JWT_SECRET,
  canAccessClient,
  getUserClientIds,
  hydrateUserAccess,
};
