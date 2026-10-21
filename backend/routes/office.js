const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const { roleNameForUser } = require('../services/permissions');

// Nosso Escritório (Painel): equipe da agência, avatar e status DECLARADO.
// "Online" vem apenas do batimento já existente do app aberto (user_presence.last_seen).
// Não lê nem expõe a página/cliente em que a pessoa está, e não mede teclado ou mouse.
const router = express.Router();
router.use(authRequired);
router.use((req, res, next) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'O escritório é restrito à equipe.' });
  return next();
});

const STATUSES = ['available', 'focus', 'meeting', 'away', 'offline'];
const STYLES = ['short', 'long', 'bun', 'curly', 'bald'];
const ACCS = ['none', 'glasses', 'cap'];
const ONLINE_SECONDS = 70; // batimento do app a cada 20 s
const STALE_STATUS_HOURS = 12; // status declarado há muito tempo volta a "disponível"
const MAX_TEAM = 12;

function defaultLook(id) {
  return { skin: id % 5, hc: (id * 3) % 6, shirt: (id * 5) % 6, style: STYLES[id % 5], acc: 'none' };
}

function cleanLook(input, fallback) {
  const src = input && typeof input === 'object' ? input : {};
  const idx = (value, max, fb) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < max ? n : fb;
  };
  return {
    skin: idx(src.skin, 5, fallback.skin),
    hc: idx(src.hc, 6, fallback.hc),
    shirt: idx(src.shirt, 6, fallback.shirt),
    style: STYLES.includes(src.style) ? src.style : fallback.style,
    acc: ACCS.includes(src.acc) ? src.acc : fallback.acc,
  };
}

function parseLook(json, id) {
  let parsed = null;
  try { parsed = json ? JSON.parse(json) : null; } catch { parsed = null; }
  return cleanLook(parsed, defaultLook(id));
}

function hasCustomRole() {
  try { return db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'custom_role_id'); } catch { return false; }
}

function snapshot(agencyId, viewerId) {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.role, u.agency_id, u.is_platform_owner, u.is_operations_head, u.is_commercial_team, ${hasCustomRole() ? 'u.custom_role_id' : 'NULL AS custom_role_id'},
           p.look_json, p.status AS declared, p.status_updated_at,
           CASE WHEN up.last_seen IS NOT NULL AND datetime(up.last_seen) >= datetime('now', ?) THEN 1 ELSE 0 END AS online,
           CASE WHEN p.status_updated_at IS NOT NULL AND datetime(p.status_updated_at) >= datetime('now', ?) THEN 1 ELSE 0 END AS fresh
    FROM users u
    LEFT JOIN office_profiles p ON p.agency_id = u.agency_id AND p.user_id = u.id
    LEFT JOIN user_presence up ON up.agency_id = u.agency_id AND up.user_id = u.id
    WHERE u.agency_id = ? AND u.role IN ('admin', 'team')
    ORDER BY u.name COLLATE NOCASE, u.id
    LIMIT ?
  `).all(`-${ONLINE_SECONDS} seconds`, `-${STALE_STATUS_HOURS} hours`, Number(agencyId), MAX_TEAM);
  return rows.map((row) => {
    const declared = STATUSES.includes(row.declared) && row.fresh ? row.declared : 'available';
    const isViewer = Number(row.id) === Number(viewerId);
    // O próprio usuário está com o app aberto neste momento, mesmo se o batimento ainda não chegou.
    const online = isViewer ? true : !!row.online;
    return {
      id: Number(row.id),
      name: row.name,
      role_label: roleNameForUser(row) || 'Equipe',
      look: parseLook(row.look_json, Number(row.id)),
      declared_status: declared,
      status: online ? declared : 'offline',
      online,
      is_me: isViewer,
    };
  });
}

router.get('/', (req, res) => {
  res.json({ team: snapshot(req.user.agency_id, req.user.id), statuses: STATUSES });
});

router.put('/me', (req, res) => {
  const body = req.body || {};
  const agencyId = Number(req.user.agency_id);
  const userId = Number(req.user.id);
  const current = db.prepare('SELECT look_json, status FROM office_profiles WHERE agency_id = ? AND user_id = ?').get(agencyId, userId);
  if (body.status !== undefined && !STATUSES.includes(body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const fallback = parseLook(current?.look_json, userId);
  const look = body.look !== undefined ? cleanLook(body.look, fallback) : fallback;
  const statusChanged = body.status !== undefined;
  const status = statusChanged ? body.status : (current?.status || 'available');
  db.prepare(`
    INSERT INTO office_profiles (agency_id, user_id, look_json, status, status_updated_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(agency_id, user_id) DO UPDATE SET look_json = excluded.look_json, status = excluded.status,
      status_updated_at = ${statusChanged ? "datetime('now')" : 'office_profiles.status_updated_at'}, updated_at = datetime('now')
  `).run(agencyId, userId, JSON.stringify(look), status);
  const me = snapshot(agencyId, userId).find((member) => member.is_me);
  res.json({ me: me || null });
});

module.exports = router;
