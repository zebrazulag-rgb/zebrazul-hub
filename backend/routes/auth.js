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
const { resolveAgency } = require('../services/tenant');

const router = express.Router();
const VALID_ROLES = ['admin', 'team', 'operations_head', 'commercial_team', 'client'];

function normalizeAccessRole(value) {
  const requested = String(value || '');
  return {
    requested,
    role: ['operations_head', 'commercial_team'].includes(requested) ? 'team' : requested,
    isOperationsHead: requested === 'operations_head',
    isCommercialTeam: requested === 'commercial_team',
  };
}

function accessRoleOf(user) {
  if (Number(user?.is_operations_head) === 1) return 'operations_head';
  if (Number(user?.is_commercial_team) === 1) return 'commercial_team';
  return user?.role;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeClientIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function validateClientIds(clientIds, agencyId) {
  if (!clientIds.length) return true;
  const placeholders = clientIds.map(() => '?').join(',');
  const count = db.prepare(`
    SELECT COUNT(*) AS total FROM clients
    WHERE agency_id = ? AND id IN (${placeholders})
  `).get(agencyId, ...clientIds).total;
  return Number(count) === clientIds.length;
}

function replaceUserClientAccess(userId, clientIds, agencyId) {
  db.prepare('DELETE FROM user_client_access WHERE user_id = ?').run(userId);
  if (!clientIds.length) return;
  const validIds = normalizeClientIds(clientIds);
  if (!validateClientIds(validIds, agencyId)) throw new Error('CLIENT_SCOPE_INVALID');
  const insert = db.prepare('INSERT OR IGNORE INTO user_client_access (user_id, client_id) VALUES (?, ?)');
  validIds.forEach((clientId) => insert.run(userId, clientId));
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
    agency_id: hydrated.agency_id,
    agency: hydrated.agency,
    is_platform_owner: hydrated.is_platform_owner,
    is_agency_owner: hydrated.is_agency_owner,
    is_operations_head: hydrated.is_operations_head,
    is_commercial_team: hydrated.is_commercial_team,
  };
}

function attachUserAccess(users, agencyId) {
  if (!users.length) return users;
  const accessRows = db.prepare(`
    SELECT uca.user_id, c.id AS client_id, c.name AS client_name
    FROM user_client_access uca
    JOIN clients c ON c.id = uca.client_id
    WHERE c.agency_id = ?
    ORDER BY c.name
  `).all(agencyId);
  const byUser = new Map();
  accessRows.forEach((row) => {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ id: Number(row.client_id), name: row.client_name });
  });
  return users.map((user) => {
    const operationsHead = Number(user.is_operations_head) === 1;
    const commercialTeam = Number(user.is_commercial_team) === 1;
    const accesses = operationsHead
      ? db.prepare('SELECT id, name FROM clients WHERE agency_id = ? ORDER BY name').all(agencyId)
      : user.role === 'team' ? (byUser.get(user.id) || []) : [];
    return {
      ...user,
      is_platform_owner: Number(user.is_platform_owner) === 1,
      is_agency_owner: Number(user.is_agency_owner) === 1,
      is_operations_head: operationsHead,
      is_commercial_team: commercialTeam,
      client_ids: accesses.map((client) => client.id),
      client_names: accesses.map((client) => client.name),
    };
  });
}

router.post('/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha sao obrigatorios' });

  const agency = resolveAgency(req);
  if (!agency) return res.status(401).json({ error: 'Agência não encontrada' });

  let user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND agency_id = ?').get(email, agency.id);
  // O dono da plataforma pode entrar pelo domínio principal mesmo que o cabeçalho
  // de tenant esteja ausente durante uma manutenção.
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND is_platform_owner = 1').get(email);
  }
  if (!user) return res.status(401).json({ error: 'Credenciais invalidas' });

  const userAgency = db.prepare('SELECT status FROM agencies WHERE id = ?').get(user.agency_id);
  if (!userAgency || userAgency.status !== 'active') return res.status(403).json({ error: 'Agência suspensa ou indisponível' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais invalidas' });

  const token = jwt.sign({ id: user.id, agency_id: user.agency_id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
           agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team
    FROM users WHERE id = ?
  `).get(req.user.id);
  res.json({ user: publicUser(user) });
});

router.post('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode criar usuarios' });

  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const accessRole = normalizeAccessRole(req.body.role);
  const role = accessRole.role;
  const clientId = role === 'client' ? Number(req.body.client_id) || null : null;
  const clientIds = role === 'team' && !accessRole.isOperationsHead ? normalizeClientIds(req.body.client_ids) : [];

  if (!name || !email || !password || !accessRole.requested) return res.status(400).json({ error: 'Campos obrigatorios faltando' });
  if (!VALID_ROLES.includes(accessRole.requested)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
  if (role === 'client' && !clientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });
  if (role === 'client' && !validateClientIds([clientId], req.user.agency_id)) return res.status(400).json({ error: 'Cliente inválido para esta agência' });
  if (role === 'team' && !accessRole.isOperationsHead && !validateClientIds(clientIds, req.user.agency_id)) return res.status(400).json({ error: 'Um ou mais clientes selecionados sao invalidos' });

  const plan = db.prepare('SELECT max_users FROM agencies WHERE id = ?').get(req.user.agency_id);
  const currentCount = db.prepare('SELECT COUNT(*) AS total FROM users WHERE agency_id = ?').get(req.user.agency_id).total;
  if (!req.user.is_platform_owner && Number(currentCount) >= Number(plan?.max_users || 5)) {
    return res.status(403).json({ error: 'Limite de usuários do plano atingido' });
  }

  try {
    const createUser = db.transaction(() => {
      const passwordHash = bcrypt.hashSync(password, 10);
      const info = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, client_id, agency_id, is_operations_head, is_commercial_team)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, email, passwordHash, role, clientId, req.user.agency_id, accessRole.isOperationsHead ? 1 : 0, accessRole.isCommercialTeam ? 1 : 0);
      replaceUserClientAccess(info.lastInsertRowid, clientIds, req.user.agency_id);
      return info.lastInsertRowid;
    });
    const id = createUser();
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

router.get('/team-users', authRequired, (req, res) => {
  let users = db.prepare(`
    SELECT id, name, role, avatar_color, avatar_data, is_operations_head, is_commercial_team
    FROM users
    WHERE agency_id = ? AND role IN ('admin','team')
    ORDER BY name
  `).all(req.user.agency_id).map((user) => ({
    ...user,
    is_operations_head: Number(user.is_operations_head) === 1,
    client_ids: user.role === 'admin' || Number(user.is_operations_head) === 1
      ? []
      : getUserClientIds(user.id, req.user.agency_id),
  }));
  if (req.user.role === 'client') {
    const clientId = Number(req.user.client_id);
    users = users.filter((user) => user.role === 'admin' || user.is_operations_head || user.client_ids.includes(clientId));
  }
  res.json({ users });
});

router.get('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.client_id, u.avatar_color, u.avatar_data, u.avatar_mime,
           u.is_platform_owner, u.is_agency_owner, u.is_operations_head, u.is_commercial_team, c.name as client_name
    FROM users u
    LEFT JOIN clients c ON c.id = u.client_id AND c.agency_id = u.agency_id
    WHERE u.agency_id = ?
    ORDER BY CASE WHEN u.role = 'admin' THEN 1 WHEN u.is_operations_head = 1 THEN 2 WHEN u.is_commercial_team = 1 THEN 3 WHEN u.role = 'team' THEN 4 ELSE 5 END, u.name
  `).all(req.user.agency_id);
  res.json({ users: attachUserAccess(users, req.user.agency_id) });
});

router.put('/me', authRequired, (req, res) => {
  const { name, avatar_data: avatarData, avatar_mime: avatarMime } = req.body;
  db.prepare(`
    UPDATE users SET name = COALESCE(?, name), avatar_data = COALESCE(?, avatar_data),
      avatar_mime = COALESCE(?, avatar_mime)
    WHERE id = ? AND agency_id = ?
  `).run(name ? String(name).trim() : null, avatarData, avatarMime, req.user.id, req.user.agency_id);

  const user = db.prepare(`
    SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
           agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team
    FROM users WHERE id = ? AND agency_id = ?
  `).get(req.user.id, req.user.agency_id);
  res.json({ user: publicUser(user) });
});

router.put('/users/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode editar usuarios' });

  const targetId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND agency_id = ?').get(targetId, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Usuario nao encontrado' });

  const existingAccessRole = accessRoleOf(existing);
  const requestedAccessRole = req.body.role === undefined ? existingAccessRole : req.body.role;
  if (!VALID_ROLES.includes(requestedAccessRole)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  const nextAccess = normalizeAccessRole(requestedAccessRole);
  const nextRole = nextAccess.role;
  if (targetId === req.user.id && requestedAccessRole !== existingAccessRole) return res.status(400).json({ error: 'Voce nao pode alterar o proprio papel de acesso' });
  if (existing.is_agency_owner && requestedAccessRole !== 'admin') return res.status(400).json({ error: 'O responsável principal da agência deve permanecer administrador' });

  if (existing.role === 'admin' && nextRole !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND agency_id = ?").get(req.user.agency_id).total;
    if (adminCount <= 1) return res.status(400).json({ error: 'A agência precisa manter pelo menos um administrador' });
  }

  const nextName = req.body.name === undefined ? existing.name : String(req.body.name || '').trim();
  const nextEmail = req.body.email === undefined ? existing.email : normalizeEmail(req.body.email);
  if (!nextName || !nextEmail) return res.status(400).json({ error: 'Nome e email sao obrigatorios' });

  let nextClientId = existing.client_id;
  if (nextRole !== 'client') nextClientId = null;
  else if (req.body.client_id !== undefined) nextClientId = Number(req.body.client_id) || null;
  if (nextRole === 'client' && !nextClientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });
  if (nextClientId && !validateClientIds([nextClientId], req.user.agency_id)) return res.status(400).json({ error: 'Cliente inválido para esta agência' });

  const nextClientIds = nextRole === 'team' && !nextAccess.isOperationsHead
    ? (req.body.client_ids === undefined ? getUserClientIds(targetId, req.user.agency_id) : normalizeClientIds(req.body.client_ids))
    : [];
  if (nextRole === 'team' && !nextAccess.isOperationsHead && !validateClientIds(nextClientIds, req.user.agency_id)) return res.status(400).json({ error: 'Um ou mais clientes selecionados sao invalidos' });

  let nextPasswordHash = existing.password_hash;
  if (req.body.password !== undefined && req.body.password !== '') {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
    nextPasswordHash = bcrypt.hashSync(req.body.password, 10);
  }

  const nextAvatarData = req.body.avatar_data === undefined ? existing.avatar_data : req.body.avatar_data;
  const nextAvatarMime = req.body.avatar_mime === undefined ? existing.avatar_mime : req.body.avatar_mime;

  try {
    const updateUser = db.transaction(() => {
      db.prepare(`
        UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, client_id = ?,
          avatar_data = ?, avatar_mime = ?, is_operations_head = ?, is_commercial_team = ?
        WHERE id = ? AND agency_id = ?
      `).run(nextName, nextEmail, nextPasswordHash, nextRole, nextClientId, nextAvatarData, nextAvatarMime, nextAccess.isOperationsHead ? 1 : 0, nextAccess.isCommercialTeam ? 1 : 0, targetId, req.user.agency_id);
      replaceUserClientAccess(targetId, nextClientIds, req.user.agency_id);
    });
    updateUser();

    const updatedUser = db.prepare(`
      SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
             agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team
      FROM users WHERE id = ? AND agency_id = ?
    `).get(targetId, req.user.agency_id);
    res.json({ ok: true, user: publicUser(updatedUser) });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

const deleteUserTransaction = db.transaction((targetId, replacementUserId, agencyId) => {
  db.prepare('UPDATE clients SET responsible_user_id = NULL WHERE responsible_user_id = ? AND agency_id = ?').run(targetId, agencyId);
  db.prepare('UPDATE posts SET created_by = ? WHERE created_by = ? AND agency_id = ?').run(replacementUserId, targetId, agencyId);
  db.prepare('UPDATE tasks SET created_by = ? WHERE created_by = ? AND agency_id = ?').run(replacementUserId, targetId, agencyId);
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ? AND agency_id = ?').run(targetId, agencyId);
  db.prepare('UPDATE financial_entries SET created_by = ? WHERE created_by = ? AND agency_id = ?').run(replacementUserId, targetId, agencyId);
  db.prepare('UPDATE commercial_leads SET created_by = ? WHERE created_by = ? AND agency_id = ?').run(replacementUserId, targetId, agencyId);
  db.prepare('UPDATE commercial_leads SET owner_user_id = NULL WHERE owner_user_id = ? AND agency_id = ?').run(targetId, agencyId);
  db.prepare('UPDATE commercial_activities SET created_by = ? WHERE created_by = ? AND agency_id = ?').run(replacementUserId, targetId, agencyId);
  db.prepare('DELETE FROM users WHERE id = ? AND agency_id = ?').run(targetId, agencyId);
});

router.delete('/users/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode apagar usuarios' });

  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Voce nao pode apagar o proprio usuario' });

  const target = db.prepare('SELECT id, role, is_agency_owner FROM users WHERE id = ? AND agency_id = ?').get(targetId, req.user.agency_id);
  if (!target) return res.status(404).json({ error: 'Usuario nao encontrado' });
  if (target.is_agency_owner) return res.status(400).json({ error: 'O responsável principal da agência não pode ser removido' });

  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND agency_id = ?").get(req.user.agency_id).total;
    if (adminCount <= 1) return res.status(400).json({ error: 'A agência precisa manter pelo menos um administrador' });
  }

  try {
    deleteUserTransaction(targetId, req.user.id, req.user.agency_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao apagar usuario:', err);
    res.status(400).json({ error: 'Nao foi possivel apagar este usuario' });
  }
});

module.exports = router;
