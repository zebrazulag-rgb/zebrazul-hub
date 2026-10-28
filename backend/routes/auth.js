const express = require('express');
const bcrypt = require('bcryptjs');
const { checkLoginAllowed, recordLoginFailure, recordLoginSuccess } = require('../middleware/loginRateLimit');
const { comparePassword } = require('../utils/passwordCompare');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const {
  JWT_SECRET,
  authRequired,
  getUserClientIds,
  hydrateUserAccess,
} = require('../middleware/auth');
const { resolveAgency } = require('../services/tenant');
const { hasPermission } = require('../services/permissions');
const { recordActivity, updatePresence } = require('../services/activity');

const { persistMedia } = require('../services/mediaStorage');
const router = express.Router();
const VALID_ROLES = ['admin', 'team', 'operations_head', 'commercial_team', 'client'];

function canManageUsers(req) {
  return req.user?.role === 'admin' && hasPermission(req.user, 'settings.users');
}

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

function normalizeCustomRoleId(value, agencyId) {
  const id = Number(value) || null;
  if (!id) return null;
  const role = db.prepare('SELECT id FROM custom_roles WHERE id = ? AND agency_id = ?').get(id, agencyId);
  return role ? Number(role.id) : null;
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
    custom_role_id: hydrated.custom_role_id,
    permission_role_key: hydrated.permission_role_key,
    permission_role_name: hydrated.permission_role_name,
    permissions: hydrated.permissions,
    client_name: hydrated.client_name || null,
    client_stage: hydrated.client_stage || 'client',
    trial: hydrated.trial || { is_trial: false, expired: false },
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
    const customRole = user.custom_role_id
      ? db.prepare('SELECT id, name, slug FROM custom_roles WHERE id = ? AND agency_id = ?').get(user.custom_role_id, agencyId)
      : null;
    return {
      ...user,
      custom_role_id: customRole ? Number(customRole.id) : null,
      custom_role_name: customRole?.name || null,
      custom_role_slug: customRole?.slug || null,
      is_platform_owner: Number(user.is_platform_owner) === 1,
      is_agency_owner: Number(user.is_agency_owner) === 1,
      is_operations_head: operationsHead,
      is_commercial_team: commercialTeam,
      client_ids: accesses.map((client) => client.id),
      client_names: accesses.map((client) => client.name),
    };
  });
}


const trialSignupBuckets = new Map();
function trialSignupAllowed(req) {
  const now = Date.now();
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const previous = trialSignupBuckets.get(ip) || [];
  const recent = previous.filter((stamp) => now - stamp < 60 * 60 * 1000);
  if (recent.length >= 8) return false;
  recent.push(now);
  trialSignupBuckets.set(ip, recent);
  return true;
}

function cleanTrialText(value, limit = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

router.post('/trial-signup', async (req, res) => {
  if (!trialSignupAllowed(req)) return res.status(429).json({ error: 'Muitas tentativas de cadastro. Tente novamente mais tarde.' });

  const agency = resolveAgency(req);
  if (!agency) return res.status(404).json({ error: 'Ambiente ZebraHub não encontrado.' });

  const name = cleanTrialText(req.body?.name, 120);
  const companyName = cleanTrialText(req.body?.company_name, 140);
  const segment = cleanTrialText(req.body?.segment, 120);
  const phone = cleanTrialText(req.body?.phone, 40);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const acceptedTerms = req.body?.accepted_terms === true;

  if (!name || !companyName || !segment || !phone || !email || !password) {
    return res.status(400).json({ error: 'Preencha nome, empresa, segmento, WhatsApp, e-mail e senha.' });
  }
  if (!acceptedTerms) return res.status(400).json({ error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND agency_id = ?').get(email, agency.id);
  if (existing) return res.status(409).json({ error: 'Este e-mail já possui acesso ao ZebraHub. Entre com sua conta existente.' });

  const startedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const created = db.transaction(() => {
      const clientInfo = db.prepare(`
        INSERT INTO clients (
          agency_id, name, segment, phone, email, logo_color, status, lifecycle_stage,
          trial_started_at, trial_expires_at, trial_progress_json
        ) VALUES (?, ?, ?, ?, ?, '#3A85FD', 'active', 'trial', ?, ?, '[]')
      `).run(agency.id, companyName, segment, phone, email, startedAt, expiresAt);
      const clientId = Number(clientInfo.lastInsertRowid);
      const passwordHash = bcrypt.hashSync(password, 10);
      const userInfo = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, client_id, agency_id)
        VALUES (?, ?, ?, 'client', ?, ?)
      `).run(name, email, passwordHash, clientId, agency.id);
      const userId = Number(userInfo.lastInsertRowid);
      db.prepare('UPDATE clients SET responsible_user_id = ? WHERE id = ?').run(userId, clientId);
      return { clientId, userId };
    })();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(created.userId);
    const token = jwt.sign({ id: user.id, agency_id: user.agency_id }, JWT_SECRET, { expiresIn: '7d' });
    recordActivity({
      agencyId: agency.id, userId: user.id, clientId: created.clientId,
      module: 'trial', action: 'created', entityType: 'client', entityId: created.clientId, entityLabel: companyName,
      summary: 'Iniciou o ZebraHub Experience por 30 dias', path: '/auth/trial-signup', method: 'POST'
    });
    return res.status(201).json({ token, user: publicUser(user), trial_expires_at: expiresAt });
  } catch (error) {
    console.error('[TRIAL] Falha ao criar experiência:', error);
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    return res.status(500).json({ error: 'Não foi possível iniciar sua experiência agora. Tente novamente.' });
  }
});


function parseTrialJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const TRIAL_ONBOARDING_LIMITS = {
  services: 1200,
  audience: 1200,
  competitors: 1200,
  instagram: 220,
  site: 300,
  objective: 1200,
  weekly_focus: 1200,
  notes: 5000,
};

function sanitizeTrialOnboarding(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const next = {};
  for (const [key, limit] of Object.entries(TRIAL_ONBOARDING_LIMITS)) {
    next[key] = String(source[key] || '').trim().slice(0, limit);
  }
  return next;
}

function sanitizeTrialProgress(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().slice(0, 64)).filter(Boolean))].slice(0, 40);
}

function getTrialClient(req) {
  if (req.user?.role !== 'client' || !req.user?.client_id) return null;
  return db.prepare(`
    SELECT id, agency_id, name, segment, phone, email, lifecycle_stage,
           trial_started_at, trial_expires_at, trial_converted_at,
           trial_onboarding_json, trial_progress_json
    FROM clients
    WHERE id = ? AND agency_id = ?
  `).get(req.user.client_id, req.user.agency_id) || null;
}

router.get('/trial-experience', authRequired, (req, res) => {
  const client = getTrialClient(req);
  if (!client) return res.status(404).json({ error: 'Experiência não encontrada.' });
  if (String(client.lifecycle_stage || 'client') !== 'trial') {
    return res.status(409).json({ error: 'Esta conta já foi convertida em cliente.' });
  }
  res.json({
    client: {
      id: Number(client.id),
      name: client.name,
      segment: client.segment || '',
      phone: client.phone || '',
      email: client.email || '',
    },
    onboarding: sanitizeTrialOnboarding(parseTrialJson(client.trial_onboarding_json, {})),
    progress: sanitizeTrialProgress(parseTrialJson(client.trial_progress_json, [])),
    trial: req.user.trial || { is_trial: true, expired: false },
  });
});

router.put('/trial-experience', authRequired, (req, res) => {
  const client = getTrialClient(req);
  if (!client) return res.status(404).json({ error: 'Experiência não encontrada.' });
  if (String(client.lifecycle_stage || 'client') !== 'trial') {
    return res.status(409).json({ error: 'Esta conta já foi convertida em cliente.' });
  }
  if (req.user?.trial?.expired) {
    return res.status(403).json({ error: 'Seu período de 30 dias terminou. Seus dados continuam salvos, mas a edição está bloqueada.' });
  }

  const currentOnboarding = sanitizeTrialOnboarding(parseTrialJson(client.trial_onboarding_json, {}));
  const currentProgress = sanitizeTrialProgress(parseTrialJson(client.trial_progress_json, []));
  const onboarding = Object.prototype.hasOwnProperty.call(req.body || {}, 'onboarding')
    ? sanitizeTrialOnboarding({ ...currentOnboarding, ...(req.body.onboarding || {}) })
    : currentOnboarding;
  const progress = Object.prototype.hasOwnProperty.call(req.body || {}, 'progress')
    ? sanitizeTrialProgress(req.body.progress)
    : currentProgress;

  db.prepare(`
    UPDATE clients
    SET trial_onboarding_json = ?, trial_progress_json = ?
    WHERE id = ? AND agency_id = ?
  `).run(JSON.stringify(onboarding), JSON.stringify(progress), client.id, req.user.agency_id);

  recordActivity({
    agencyId: req.user.agency_id,
    userId: req.user.id,
    clientId: client.id,
    module: 'trial',
    action: 'progress',
    entityType: 'client',
    entityId: client.id,
    entityLabel: client.name,
    summary: `Atualizou o ZebraHub Experience (${progress.length} etapas registradas)`,
    path: '/auth/trial-experience',
    method: 'PUT',
  });

  res.json({
    ok: true,
    onboarding,
    progress,
    trial: req.user.trial || { is_trial: true, expired: false },
  });
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha sao obrigatorios' });

  // [FASE 1] Limite de tentativas (veja middleware/loginRateLimit.js).
  const gate = checkLoginAllowed(req, email);
  if (gate.blocked) {
    res.setHeader('Retry-After', String(gate.retryAfterSeconds));
    const minutes = Math.ceil(gate.retryAfterSeconds / 60);
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${minutes} minuto(s).` });
  }

  const agency = resolveAgency(req);
  if (!agency) return res.status(401).json({ error: 'Agência não encontrada' });

  let user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND agency_id = ?').get(email, agency.id);
  // O dono da plataforma pode entrar pelo domínio principal mesmo que o cabeçalho
  // de tenant esteja ausente durante uma manutenção.
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND is_platform_owner = 1').get(email);
  }
  if (!user) { recordLoginFailure(req, email); return res.status(401).json({ error: 'Credenciais invalidas' }); }

  const userAgency = db.prepare('SELECT status FROM agencies WHERE id = ?').get(user.agency_id);
  if (!userAgency || userAgency.status !== 'active') return res.status(403).json({ error: 'Agência suspensa ou indisponível' });

  // [FASE 1] compare fora da thread principal (bcrypt nativo; fallback bcryptjs). Ver utils/passwordCompare.js.
  const valid = await comparePassword(password, user.password_hash);
  if (!valid) { recordLoginFailure(req, email); return res.status(401).json({ error: 'Credenciais invalidas' }); }
  recordLoginSuccess(req, email);

  const token = jwt.sign({ id: user.id, agency_id: user.agency_id }, JWT_SECRET, { expiresIn: '7d' });
  recordActivity({
    agencyId: user.agency_id, userId: user.id, clientId: user.client_id || null,
    module: 'auth', action: 'login', entityType: 'user', entityId: user.id, entityLabel: user.name,
    summary: 'Entrou no ZebraHub', path: '/auth/login', method: 'POST'
  });
  updatePresence({ agencyId: user.agency_id, userId: user.id, path: '/login', clientId: user.client_id || null });
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
           agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team, custom_role_id
    FROM users WHERE id = ?
  `).get(req.user.id);
  res.json({ user: publicUser(user) });
});

router.post('/users', authRequired, (req, res) => {
  if (!canManageUsers(req)) return res.status(403).json({ error: 'Seu cargo não possui permissão para criar usuários.' });

  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const accessRole = normalizeAccessRole(req.body.role);
  const role = accessRole.role;
  const clientId = role === 'client' ? Number(req.body.client_id) || null : null;
  const clientIds = role === 'team' && !accessRole.isOperationsHead ? normalizeClientIds(req.body.client_ids) : [];
  const requestedCustomRoleId = role === 'team' && !accessRole.isOperationsHead && !accessRole.isCommercialTeam
    ? (Number(req.body.custom_role_id) || null)
    : null;
  const customRoleId = requestedCustomRoleId ? normalizeCustomRoleId(requestedCustomRoleId, req.user.agency_id) : null;

  if (!name || !email || !password || !accessRole.requested) return res.status(400).json({ error: 'Campos obrigatorios faltando' });
  if (!VALID_ROLES.includes(accessRole.requested)) return res.status(400).json({ error: 'Papel de usuario invalido' });
  if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
  if (role === 'client' && !clientId) return res.status(400).json({ error: 'Selecione um cliente para este usuario' });
  if (requestedCustomRoleId && !customRoleId) return res.status(400).json({ error: 'Cargo personalizado inválido para esta agência' });
  if (role === 'client' && !validateClientIds([clientId], req.user.agency_id)) return res.status(400).json({ error: 'Cliente inválido para esta agência' });
  if (role === 'team' && !accessRole.isOperationsHead && !validateClientIds(clientIds, req.user.agency_id)) return res.status(400).json({ error: 'Um ou mais clientes selecionados sao invalidos' });

  const plan = db.prepare('SELECT max_users FROM agencies WHERE id = ?').get(req.user.agency_id);
  const currentCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM users u
    LEFT JOIN clients c ON c.id = u.client_id AND c.agency_id = u.agency_id
    WHERE u.agency_id = ? AND NOT (u.role = 'client' AND COALESCE(c.lifecycle_stage, 'client') = 'trial')
  `).get(req.user.agency_id).total;
  if (!req.user.is_platform_owner && Number(currentCount) >= Number(plan?.max_users || 5)) {
    return res.status(403).json({ error: 'Limite de usuários do plano atingido' });
  }

  try {
    const createUser = db.transaction(() => {
      const passwordHash = bcrypt.hashSync(password, 10);
      const info = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, client_id, agency_id, is_operations_head, is_commercial_team, custom_role_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, email, passwordHash, role, clientId, req.user.agency_id, accessRole.isOperationsHead ? 1 : 0, accessRole.isCommercialTeam ? 1 : 0, customRoleId);
      replaceUserClientAccess(info.lastInsertRowid, clientIds, req.user.agency_id);
      return info.lastInsertRowid;
    });
    const id = createUser();
    recordActivity({
      agencyId: req.user.agency_id, userId: req.user.id, clientId: clientId || null,
      module: 'users', action: 'created', entityType: 'user', entityId: id, entityLabel: name,
      summary: 'Criou um usuário da equipe', details: { role: accessRole.requested, custom_role_id: customRoleId, client_ids: clientIds },
      path: '/auth/users', method: 'POST'
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: 'Email ja cadastrado ou dados invalidos' });
  }
});

router.get('/team-users', authRequired, (req, res) => {
  let users = db.prepare(`
    SELECT id, name, role, avatar_color, avatar_data, is_operations_head, is_commercial_team, custom_role_id
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
  if (!canManageUsers(req)) return res.status(403).json({ error: 'Seu cargo não possui permissão para visualizar usuários.' });
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.client_id, u.avatar_color, u.avatar_data, u.avatar_mime,
           u.is_platform_owner, u.is_agency_owner, u.is_operations_head, u.is_commercial_team, u.custom_role_id, c.name as client_name
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
  `).run(name ? String(name).trim() : null, persistMedia(avatarData, avatarMime || 'image/jpeg'), avatarMime, req.user.id, req.user.agency_id);

  const user = db.prepare(`
    SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
           agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team, custom_role_id
    FROM users WHERE id = ? AND agency_id = ?
  `).get(req.user.id, req.user.agency_id);
  recordActivity({
    agencyId: req.user.agency_id, userId: req.user.id, clientId: req.user.client_id || null,
    module: 'users', action: 'profile_updated', entityType: 'user', entityId: req.user.id, entityLabel: user?.name || req.user.name,
    summary: 'Atualizou o próprio perfil', details: { name_changed: Boolean(name), avatar_changed: Boolean(avatarData) },
    path: '/auth/me', method: 'PUT'
  });
  res.json({ user: publicUser(user) });
});

router.put('/users/:id', authRequired, (req, res) => {
  if (!canManageUsers(req)) return res.status(403).json({ error: 'Seu cargo não possui permissão para editar usuários.' });

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

  const requestedCustomRoleId = nextRole === 'team' && !nextAccess.isOperationsHead && !nextAccess.isCommercialTeam
    ? (req.body.custom_role_id === undefined ? existing.custom_role_id : (Number(req.body.custom_role_id) || null))
    : null;
  const nextCustomRoleId = requestedCustomRoleId ? normalizeCustomRoleId(requestedCustomRoleId, req.user.agency_id) : null;
  if (requestedCustomRoleId && !nextCustomRoleId) return res.status(400).json({ error: 'Cargo personalizado inválido para esta agência' });

  let nextPasswordHash = existing.password_hash;
  if (req.body.password !== undefined && req.body.password !== '') {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
    nextPasswordHash = bcrypt.hashSync(req.body.password, 10);
  }

  const nextAvatarData = req.body.avatar_data === undefined ? existing.avatar_data : persistMedia(req.body.avatar_data, req.body.avatar_mime || existing.avatar_mime || 'image/jpeg');
  const nextAvatarMime = req.body.avatar_mime === undefined ? existing.avatar_mime : req.body.avatar_mime;

  try {
    const updateUser = db.transaction(() => {
      db.prepare(`
        UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, client_id = ?,
          avatar_data = ?, avatar_mime = ?, is_operations_head = ?, is_commercial_team = ?, custom_role_id = ?
        WHERE id = ? AND agency_id = ?
      `).run(nextName, nextEmail, nextPasswordHash, nextRole, nextClientId, nextAvatarData, nextAvatarMime, nextAccess.isOperationsHead ? 1 : 0, nextAccess.isCommercialTeam ? 1 : 0, nextCustomRoleId, targetId, req.user.agency_id);
      replaceUserClientAccess(targetId, nextClientIds, req.user.agency_id);
    });
    updateUser();

    const updatedUser = db.prepare(`
      SELECT id, name, email, role, client_id, avatar_color, avatar_data, avatar_mime,
             agency_id, is_platform_owner, is_agency_owner, is_operations_head, is_commercial_team, custom_role_id
      FROM users WHERE id = ? AND agency_id = ?
    `).get(targetId, req.user.agency_id);
    recordActivity({
      agencyId: req.user.agency_id, userId: req.user.id, clientId: updatedUser?.client_id || null,
      module: 'users', action: 'updated', entityType: 'user', entityId: targetId, entityLabel: updatedUser?.name || nextName,
      summary: 'Atualizou um usuário da equipe', details: { role: requestedAccessRole, custom_role_id: nextCustomRoleId, client_ids: nextClientIds },
      path: `/auth/users/${targetId}`, method: 'PUT'
    });
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
  if (!canManageUsers(req)) return res.status(403).json({ error: 'Seu cargo não possui permissão para remover usuários.' });

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
    const targetName = db.prepare('SELECT name FROM users WHERE id = ? AND agency_id = ?').get(targetId, req.user.agency_id)?.name || `Usuário #${targetId}`;
    deleteUserTransaction(targetId, req.user.id, req.user.agency_id);
    recordActivity({
      agencyId: req.user.agency_id, userId: req.user.id,
      module: 'users', action: 'deleted', entityType: 'user', entityId: targetId, entityLabel: targetName,
      summary: 'Removeu um usuário da equipe', path: `/auth/users/${targetId}`, method: 'DELETE'
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao apagar usuario:', err);
    res.status(400).json({ error: 'Nao foi possivel apagar este usuario' });
  }
});

module.exports = router;
