const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { updatePresence, parseJson, moduleLabel } = require('../services/activity');

const router = express.Router();
router.use(authRequired);

function canViewAny(req) {
  return hasPermission(req.user, 'activity.view_own') || hasPermission(req.user, 'activity.view_team');
}

function canViewTeam(req) {
  return hasPermission(req.user, 'activity.view_team');
}

function ensureView(req, res, next) {
  if (!canViewAny(req)) return res.status(403).json({ error: 'Seu cargo não possui acesso ao histórico de atividade.' });
  next();
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function effectiveUserId(req) {
  if (!canViewTeam(req)) return Number(req.user.id);
  const requested = Number(req.query.user_id);
  return Number.isInteger(requested) && requested > 0 ? requested : null;
}

function whereFor(req, alias = 'al') {
  const clauses = [`${alias}.agency_id = ?`];
  const params = [Number(req.user.agency_id)];
  const userId = effectiveUserId(req);
  if (userId) { clauses.push(`${alias}.user_id = ?`); params.push(userId); }
  const clientId = Number(req.query.client_id);
  if (Number.isInteger(clientId) && clientId > 0) { clauses.push(`${alias}.client_id = ?`); params.push(clientId); }
  const module = String(req.query.module || '').trim();
  if (module) { clauses.push(`${alias}.module = ?`); params.push(module); }
  const action = String(req.query.action || '').trim();
  if (action) { clauses.push(`${alias}.action = ?`); params.push(action); }
  const from = normalizeDate(req.query.from);
  const to = normalizeDate(req.query.to);
  const days = clampInt(req.query.days, 1, 365, 7);
  if (from) { clauses.push(`datetime(${alias}.created_at) >= datetime(?)`); params.push(`${from} 00:00:00`); }
  else { clauses.push(`datetime(${alias}.created_at) >= datetime('now', ?)`); params.push(`-${days - 1} days`,); }
  if (to) { clauses.push(`datetime(${alias}.created_at) < datetime(?, '+1 day')`); params.push(`${to} 00:00:00`); }
  const search = String(req.query.search || '').trim();
  if (search) {
    clauses.push(`(lower(${alias}.summary) LIKE ? OR lower(COALESCE(${alias}.entity_label,'')) LIKE ? OR lower(COALESCE(u.name,'')) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ?)`);
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term, term, term);
  }
  return { clauses, params };
}

router.post('/presence', (req, res) => {
  const clientId = Number(req.body.client_id);
  updatePresence({
    agencyId: req.user.agency_id,
    userId: req.user.id,
    path: String(req.body.path || '').trim() || null,
    clientId: Number.isInteger(clientId) && clientId > 0 ? clientId : null,
  });
  res.json({ ok: true, tracking: true });
});

router.get('/filters', ensureView, (req, res) => {
  const canTeam = canViewTeam(req);
  const users = canTeam ? db.prepare(`
    SELECT id, name, email, role, avatar_color, avatar_data, custom_role_id,
           is_operations_head, is_commercial_team
    FROM users WHERE agency_id = ? AND role IN ('admin','team') ORDER BY name
  `).all(req.user.agency_id) : db.prepare(`
    SELECT id, name, email, role, avatar_color, avatar_data, custom_role_id,
           is_operations_head, is_commercial_team
    FROM users WHERE agency_id = ? AND id = ?
  `).all(req.user.agency_id, req.user.id);
  const clients = db.prepare(`SELECT id, name, logo_color, avatar_data FROM clients WHERE agency_id = ? AND status != 'archived' ORDER BY name`).all(req.user.agency_id);
  const modules = db.prepare(`SELECT DISTINCT module FROM activity_logs WHERE agency_id = ? ORDER BY module`).all(req.user.agency_id).map((row) => ({ key: row.module, label: moduleLabel(row.module) }));
  res.json({ users, clients, modules, can_view_team: canTeam, can_export: hasPermission(req.user, 'activity.export') });
});

router.get('/logs', ensureView, (req, res) => {
  const limit = clampInt(req.query.limit, 1, 200, 80);
  const offset = clampInt(req.query.offset, 0, 100000, 0);
  const { clauses, params } = whereFor(req);
  const where = clauses.join(' AND ');
  const rows = db.prepare(`
    SELECT al.*, COALESCE(al.actor_name, u.name, 'Sistema') AS user_name, u.avatar_color AS user_avatar_color, u.avatar_data AS user_avatar_data,
           c.name AS client_name, c.logo_color AS client_logo_color, c.avatar_data AS client_avatar_data
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${where}
    ORDER BY datetime(al.created_at) DESC, al.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset).map((row) => ({
    ...row,
    id: Number(row.id),
    user_id: row.user_id ? Number(row.user_id) : null,
    client_id: row.client_id ? Number(row.client_id) : null,
    details: parseJson(row.details_json, {}),
    module_label: moduleLabel(row.module),
  }));
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS total FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${where}
  `).get(...params)?.total || 0);
  res.json({ logs: rows, total, limit, offset });
});

router.get('/summary', ensureView, (req, res) => {
  const { clauses, params } = whereFor(req);
  const where = clauses.join(' AND ');
  const summary = db.prepare(`
    SELECT COUNT(*) AS actions,
           COUNT(DISTINCT al.user_id) AS users,
           COUNT(DISTINCT al.client_id) AS clients
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${where}
  `).get(...params) || {};

  const byModule = db.prepare(`
    SELECT al.module, COUNT(*) AS total
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${where}
    GROUP BY al.module ORDER BY total DESC LIMIT 12
  `).all(...params).map((row) => ({ module: row.module, label: moduleLabel(row.module), total: Number(row.total) }));

  const byUser = db.prepare(`
    SELECT al.user_id, COALESCE(MAX(al.actor_name), u.name, 'Sistema') AS name, u.avatar_color, u.avatar_data, COUNT(*) AS total
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${where}
    GROUP BY al.user_id, u.name, u.avatar_color, u.avatar_data
    ORDER BY total DESC LIMIT 12
  `).all(...params).map((row) => ({ ...row, user_id: row.user_id ? Number(row.user_id) : null, total: Number(row.total) }));

  res.json({
    actions: Number(summary.actions || 0),
    users: Number(summary.users || 0),
    clients: Number(summary.clients || 0),
    by_module: byModule,
    by_user: byUser,
  });
});

router.get('/users', ensureView, (req, res) => {
  const days = clampInt(req.query.days, 1, 365, 7);
  const params = [Number(req.user.agency_id), `-${days - 1} days`];
  let userRestriction = '';
  if (!canViewTeam(req)) {
    userRestriction = 'AND u.id = ?';
    params.push(Number(req.user.id));
  }
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, u.avatar_data,
           up.last_seen, up.last_path, up.last_client_id, lc.name AS last_client_name,
           COUNT(al.id) AS actions_period,
           SUM(CASE WHEN date(al.created_at) = date('now') THEN 1 ELSE 0 END) AS actions_today
    FROM users u
    LEFT JOIN user_presence up ON up.agency_id = u.agency_id AND up.user_id = u.id
    LEFT JOIN clients lc ON lc.id = up.last_client_id
    LEFT JOIN activity_logs al ON al.agency_id = u.agency_id AND al.user_id = u.id
      AND datetime(al.created_at) >= datetime('now', ?)
    WHERE u.agency_id = ? AND u.role IN ('admin','team') ${userRestriction}
    GROUP BY u.id, u.name, u.email, u.avatar_color, u.avatar_data, up.last_seen, up.last_path, up.last_client_id, lc.name
    ORDER BY CASE WHEN up.last_seen IS NULL THEN 1 ELSE 0 END, datetime(up.last_seen) DESC, u.name
  `).all(params[1], params[0], ...(params.slice(2))).map((row) => ({
    ...row,
    id: Number(row.id),
    last_client_id: row.last_client_id ? Number(row.last_client_id) : null,
    actions_period: Number(row.actions_period || 0),
    actions_today: Number(row.actions_today || 0),
    active_now: row.last_seen ? Number(db.prepare("SELECT CASE WHEN datetime(?) >= datetime('now','-3 minutes') THEN 1 ELSE 0 END AS active").get(row.last_seen)?.active || 0) === 1 : false,
  }));
  res.json({ users: rows });
});

router.get('/export', ensureView, (req, res) => {
  if (!hasPermission(req.user, 'activity.export')) return res.status(403).json({ error: 'Seu cargo não possui permissão para exportar o histórico.' });
  const { clauses, params } = whereFor(req);
  const rows = db.prepare(`
    SELECT al.created_at, COALESCE(al.actor_name,u.name,'Sistema') AS user_name, COALESCE(c.name,'') AS client_name,
           al.module, al.summary, COALESCE(al.entity_label,'') AS entity_label, al.details_json
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN clients c ON c.id = al.client_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY datetime(al.created_at) DESC, al.id DESC
    LIMIT 10000
  `).all(...params);
  const q = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [['Data','Usuário','Cliente','Área','Ação','Item','Alterações'].map(q).join(',')];
  rows.forEach((row) => {
    const details = parseJson(row.details_json, {});
    const changes = Array.isArray(details.changes) ? details.changes.map((item) => `${item.label}: ${item.from} → ${item.to}`).join(' | ') : '';
    lines.push([row.created_at, row.user_name, row.client_name, moduleLabel(row.module), row.summary, row.entity_label, changes].map(q).join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="atividade-zebrahub-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(`\uFEFF${lines.join('\n')}`);
});

module.exports = router;
