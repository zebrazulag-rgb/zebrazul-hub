const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const {
  PERMISSION_CATALOG,
  ALL_KEYS,
  BUILTIN_ROLES,
  getPermissionMapForRole,
  getOwnerOnlyMap,
  hasPermission,
} = require('../services/permissions');

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin' || !hasPermission(req.user, 'settings.permissions')) {
    return res.status(403).json({ error: 'Você não possui permissão para gerenciar cargos e permissões.' });
  }
  next();
}

function rolesReadAllowed(req, res, next) {
  const allowed = req.user?.role === 'admin' && (
    hasPermission(req.user, 'settings.permissions') || hasPermission(req.user, 'settings.users')
  );
  if (!allowed) return res.status(403).json({ error: 'Você não possui permissão para visualizar os cargos.' });
  next();
}

function normalizePermissions(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(ALL_KEYS.map((key) => {
    const item = PERMISSION_CATALOG.find((entry) => entry.key === key);
    return [key, item?.admin_only ? false : Boolean(source[key])];
  }));
}

function serializeRoles(agencyId) {
  const builtins = BUILTIN_ROLES.map((role) => ({
    ...role,
    type: 'builtin',
    permissions: getPermissionMapForRole(agencyId, role.key),
    users_count: 0,
  }));

  const counts = db.prepare(`
    SELECT
      CASE
        WHEN role = 'admin' THEN 'admin'
        WHEN role = 'client' THEN 'client'
        WHEN custom_role_id IS NOT NULL THEN 'custom:' || custom_role_id
        WHEN is_operations_head = 1 THEN 'operations_head'
        WHEN is_commercial_team = 1 THEN 'commercial_team'
        ELSE 'team'
      END AS role_key,
      COUNT(*) AS total
    FROM users
    WHERE agency_id = ?
    GROUP BY role_key
  `).all(agencyId);
  const countMap = Object.fromEntries(counts.map((row) => [row.role_key, Number(row.total)]));
  builtins.forEach((role) => { role.users_count = countMap[role.key] || 0; });

  const customs = db.prepare(`
    SELECT id, name, slug, created_at FROM custom_roles
    WHERE agency_id = ? ORDER BY name
  `).all(agencyId).map((role) => ({
    key: `custom:${role.id}`,
    id: Number(role.id),
    name: role.name,
    slug: role.slug,
    type: 'custom',
    protected: false,
    users_count: countMap[`custom:${role.id}`] || 0,
    permissions: getPermissionMapForRole(agencyId, `custom:${role.id}`),
  }));

  return [...builtins, ...customs];
}

router.get('/', authRequired, adminOnly, (req, res) => {
  res.json({
    catalog: PERMISSION_CATALOG,
    roles: serializeRoles(req.user.agency_id),
    owner_only: getOwnerOnlyMap(req.user.agency_id),
  });
});

router.get('/roles', authRequired, rolesReadAllowed, (req, res) => {
  res.json({ roles: serializeRoles(req.user.agency_id) });
});

router.post('/roles', authRequired, adminOnly, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome do cargo.' });
  const slugBase = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cargo';
  let slug = slugBase;
  let suffix = 2;
  while (db.prepare('SELECT id FROM custom_roles WHERE agency_id = ? AND slug = ?').get(req.user.agency_id, slug)) slug = `${slugBase}-${suffix++}`;

  const sourceKey = String(req.body.copy_from || 'team');
  const sourcePermissions = getPermissionMapForRole(req.user.agency_id, sourceKey);
  const create = db.transaction(() => {
    const info = db.prepare('INSERT INTO custom_roles (agency_id, name, slug) VALUES (?, ?, ?)').run(req.user.agency_id, name, slug);
    const roleId = Number(info.lastInsertRowid);
    const insert = db.prepare('INSERT INTO custom_role_permissions (custom_role_id, permission_key, allowed) VALUES (?, ?, ?)');
    ALL_KEYS.forEach((key) => insert.run(roleId, key, sourcePermissions[key] ? 1 : 0));
    return roleId;
  });
  const id = create();
  res.status(201).json({ id, key: `custom:${id}` });
});

router.put('/roles/:roleKey/permissions', authRequired, adminOnly, (req, res) => {
  const roleKey = decodeURIComponent(req.params.roleKey || '');
  const permissions = normalizePermissions(req.body.permissions);
  if (roleKey === 'admin') return res.status(400).json({ error: 'O Administrador mantém acesso total. Use “Somente proprietário” para esconder uma função dos demais administradores.' });

  const save = db.transaction(() => {
    if (roleKey.startsWith('custom:')) {
      const id = Number(roleKey.split(':')[1]);
      const role = db.prepare('SELECT id FROM custom_roles WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
      if (!role) throw new Error('ROLE_NOT_FOUND');
      db.prepare('DELETE FROM custom_role_permissions WHERE custom_role_id = ?').run(id);
      const insert = db.prepare('INSERT INTO custom_role_permissions (custom_role_id, permission_key, allowed) VALUES (?, ?, ?)');
      ALL_KEYS.forEach((key) => insert.run(id, key, permissions[key] ? 1 : 0));
    } else {
      if (!BUILTIN_ROLES.some((role) => role.key === roleKey)) throw new Error('ROLE_NOT_FOUND');
      db.prepare('DELETE FROM agency_role_permissions WHERE agency_id = ? AND role_key = ?').run(req.user.agency_id, roleKey);
      const insert = db.prepare('INSERT INTO agency_role_permissions (agency_id, role_key, permission_key, allowed) VALUES (?, ?, ?, ?)');
      ALL_KEYS.forEach((key) => insert.run(req.user.agency_id, roleKey, key, permissions[key] ? 1 : 0));
    }
  });

  try {
    save();
    res.json({ ok: true, permissions: getPermissionMapForRole(req.user.agency_id, roleKey) });
  } catch (err) {
    if (err.message === 'ROLE_NOT_FOUND') return res.status(404).json({ error: 'Cargo não encontrado.' });
    console.error('[PERMISSIONS] Falha ao salvar permissões:', err);
    res.status(500).json({ error: 'Não foi possível salvar as permissões.' });
  }
});

router.put('/roles/custom/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome do cargo.' });
  const info = db.prepare('UPDATE custom_roles SET name = ?, updated_at = datetime(\'now\') WHERE id = ? AND agency_id = ?').run(name, id, req.user.agency_id);
  if (!info.changes) return res.status(404).json({ error: 'Cargo não encontrado.' });
  res.json({ ok: true });
});

router.delete('/roles/custom/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare('SELECT id FROM custom_roles WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
  if (!role) return res.status(404).json({ error: 'Cargo não encontrado.' });
  const used = Number(db.prepare('SELECT COUNT(*) AS total FROM users WHERE agency_id = ? AND custom_role_id = ?').get(req.user.agency_id, id)?.total || 0);
  if (used > 0) return res.status(400).json({ error: `Este cargo ainda está atribuído a ${used} usuário(s). Troque o cargo deles antes de excluir.` });
  db.prepare('DELETE FROM custom_roles WHERE id = ? AND agency_id = ?').run(id, req.user.agency_id);
  res.json({ ok: true });
});

router.put('/owner-only/:permissionKey', authRequired, adminOnly, (req, res) => {
  const permissionKey = decodeURIComponent(req.params.permissionKey || '');
  if (!ALL_KEYS.includes(permissionKey)) return res.status(400).json({ error: 'Permissão inválida.' });
  const enabled = Boolean(req.body.enabled);
  db.prepare(`
    INSERT INTO agency_permission_visibility (agency_id, permission_key, owner_only)
    VALUES (?, ?, ?)
    ON CONFLICT(agency_id, permission_key)
    DO UPDATE SET owner_only = excluded.owner_only, updated_at = datetime('now')
  `).run(req.user.agency_id, permissionKey, enabled ? 1 : 0);
  res.json({ ok: true, owner_only: enabled });
});

module.exports = router;
