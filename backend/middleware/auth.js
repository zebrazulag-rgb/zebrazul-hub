const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { publicAgency } = require('../services/tenant');

const JWT_SECRET = process.env.JWT_SECRET || 'zebrazul-hub-dev-secret-troque-em-producao';

function getUserClientIds(userId, agencyId) {
  return db.prepare(`
    SELECT uca.client_id
    FROM user_client_access uca
    JOIN clients c ON c.id = uca.client_id
    WHERE uca.user_id = ? AND c.agency_id = ?
    ORDER BY uca.client_id
  `).all(userId, agencyId).map((row) => Number(row.client_id));
}

function hydrateUserAccess(user) {
  if (!user) return user;
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(user.agency_id);
  const base = {
    ...user,
    agency_id: Number(user.agency_id),
    is_platform_owner: Number(user.is_platform_owner) === 1,
    is_agency_owner: Number(user.is_agency_owner) === 1,
    is_operations_head: Number(user.is_operations_head) === 1,
    agency: publicAgency(agency),
  };
  if (user.role === 'admin') return { ...base, client_ids: [] };
  if (base.is_operations_head) {
    const clientIds = db.prepare('SELECT id FROM clients WHERE agency_id = ? ORDER BY id').all(user.agency_id).map((row) => Number(row.id));
    return { ...base, client_ids: clientIds };
  }
  if (user.role === 'client') return { ...base, client_ids: user.client_id ? [Number(user.client_id)] : [] };
  return { ...base, client_ids: getUserClientIds(user.id, user.agency_id) };
}

function canAccessClient(user, clientId) {
  if (!user) return false;
  const normalizedClientId = Number(clientId);
  if (!normalizedClientId) return false;

  const client = db.prepare('SELECT id, agency_id FROM clients WHERE id = ?').get(normalizedClientId);
  if (!client || Number(client.agency_id) !== Number(user.agency_id)) return false;

  if (user.role === 'admin' || user.is_operations_head) return true;
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
    const currentUser = db.prepare(`
      SELECT id, name, email, role, client_id, agency_id,
             is_platform_owner, is_agency_owner, is_operations_head
      FROM users WHERE id = ?
    `).get(payload.id);

    if (!currentUser) {
      return res.status(401).json({ error: 'Usuario nao existe mais ou teve o acesso removido' });
    }

    const agency = db.prepare('SELECT status FROM agencies WHERE id = ?').get(currentUser.agency_id);
    if (!agency || agency.status !== 'active') {
      return res.status(403).json({ error: 'Agência suspensa ou indisponível' });
    }

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

function requirePlatformOwner(req, res, next) {
  if (!req.user?.is_platform_owner) {
    return res.status(403).json({ error: 'Acesso exclusivo do administrador da plataforma' });
  }
  next();
}

module.exports = {
  authRequired,
  requireRole,
  requirePlatformOwner,
  JWT_SECRET,
  canAccessClient,
  getUserClientIds,
  hydrateUserAccess,
};
