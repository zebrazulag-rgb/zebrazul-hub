const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient, JWT_SECRET } = require('../middleware/auth');
const { ensureMaterialsDirectory, safeStoredPath, removeStoredFile } = require('../services/materials');

const router = express.Router();
router.use(authRequired);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, ensureMaterialsDirectory());
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${randomUUID()}.html`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (extension !== '.html' && extension !== '.htm' && mime !== 'text/html') {
      return callback(new Error('Envie um arquivo HTML valido.'));
    }
    callback(null, true);
  },
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (req.file?.filename) removeStoredFile(req.file.filename);
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'O arquivo HTML deve ter no maximo 12 MB.' });
    return res.status(400).json({ error: error.message || 'Nao foi possivel enviar o arquivo.' });
  });
}

function normalizeOptionalClientId(value) {
  if (value === undefined || value === null || value === '' || value === 'global') return null;
  const clientId = Number(value);
  return Number.isInteger(clientId) && clientId > 0 ? clientId : NaN;
}

function materialAccessibleByUser(user, material) {
  if (!material || Number(material.agency_id) !== Number(user.agency_id)) return false;
  if (!material.client_id) return true;
  return canAccessClient(user, material.client_id);
}

function fetchMaterial(id, agencyId) {
  return db.prepare(`
    SELECT m.*, c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color,
           u.name AS created_by_name
    FROM materials m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.id = ? AND m.agency_id = ?
  `).get(id, agencyId);
}

function buildAccessWhere(user, values) {
  if (user.role === 'admin' || user.is_operations_head) return '1 = 1';
  if (user.role === 'client') {
    values.push(Number(user.client_id || 0));
    return '(m.client_id IS NULL OR m.client_id = ?)';
  }
  const clientIds = Array.isArray(user.client_ids) ? user.client_ids.map(Number).filter(Boolean) : [];
  if (!clientIds.length) return 'm.client_id IS NULL';
  values.push(...clientIds);
  return `(m.client_id IS NULL OR m.client_id IN (${clientIds.map(() => '?').join(',')}))`;
}

router.get('/', (req, res) => {
  const values = [req.user.agency_id];
  const accessWhere = buildAccessWhere(req.user, values);
  const requestedClientId = normalizeOptionalClientId(req.query.client_id);
  if (Number.isNaN(requestedClientId)) return res.status(400).json({ error: 'Cliente invalido.' });

  let clientWhere = '';
  if (requestedClientId) {
    if (!canAccessClient(req.user, requestedClientId)) return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
    clientWhere = 'AND (m.client_id IS NULL OR m.client_id = ?)';
    values.push(requestedClientId);
  }

  const materials = db.prepare(`
    SELECT m.id, m.client_id, m.title, m.description, m.category, m.original_name,
           m.mime_type, m.file_size, m.is_active, m.created_at, m.updated_at,
           c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color,
           u.name AS created_by_name
    FROM materials m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.agency_id = ?
      AND m.is_active = 1
      AND ${accessWhere}
      ${clientWhere}
    ORDER BY COALESCE(c.name, ''), m.created_at DESC, m.id DESC
  `).all(...values);

  res.json({ materials });
});

router.get('/:id', (req, res) => {
  const material = fetchMaterial(req.params.id, req.user.agency_id);
  if (!material || !materialAccessibleByUser(req.user, material) || Number(material.is_active) !== 1) {
    return res.status(404).json({ error: 'Material nao encontrado.' });
  }
  res.json({ material });
});

router.post('/', requireRole('admin'), uploadSingle, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo HTML.' });

  const clientId = normalizeOptionalClientId(req.body.client_id);
  if (Number.isNaN(clientId)) {
    removeStoredFile(req.file.filename);
    return res.status(400).json({ error: 'Cliente invalido.' });
  }
  if (clientId && !canAccessClient(req.user, clientId)) {
    removeStoredFile(req.file.filename);
    return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
  }

  const title = String(req.body.title || '').trim();
  if (!title) {
    removeStoredFile(req.file.filename);
    return res.status(400).json({ error: 'Informe o titulo do material.' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO materials (
        agency_id, client_id, title, description, category, original_name,
        stored_name, mime_type, file_size, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'text/html', ?, ?)
    `).run(
      req.user.agency_id,
      clientId,
      title,
      String(req.body.description || '').trim() || null,
      String(req.body.category || '').trim() || 'Material interativo',
      path.basename(String(req.file.originalname || 'material.html')),
      req.file.filename,
      Number(req.file.size || 0),
      req.user.id
    );
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (error) {
    removeStoredFile(req.file.filename);
    console.error('[MATERIAIS] Erro ao cadastrar material:', error);
    res.status(500).json({ error: 'Nao foi possivel cadastrar o material.' });
  }
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const material = fetchMaterial(req.params.id, req.user.agency_id);
  if (!material) return res.status(404).json({ error: 'Material nao encontrado.' });

  const updates = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Informe o titulo do material.' });
    updates.push('title = ?');
    values.push(title);
  }
  for (const field of ['description', 'category']) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field} = ?`);
      values.push(String(req.body[field] || '').trim() || null);
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'client_id')) {
    const clientId = normalizeOptionalClientId(req.body.client_id);
    if (Number.isNaN(clientId)) return res.status(400).json({ error: 'Cliente invalido.' });
    if (clientId && !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
    updates.push('client_id = ?');
    values.push(clientId);
  }

  if (!updates.length) return res.json({ ok: true });
  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE materials SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
    .run(...values, material.id, req.user.agency_id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const material = fetchMaterial(req.params.id, req.user.agency_id);
  if (!material) return res.status(404).json({ error: 'Material nao encontrado.' });

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM materials WHERE id = ? AND agency_id = ?').run(material.id, req.user.agency_id);
  });
  transaction();
  removeStoredFile(material.stored_name);
  res.json({ ok: true });
});

router.get('/:id/access', (req, res) => {
  const material = fetchMaterial(req.params.id, req.user.agency_id);
  if (!material || !materialAccessibleByUser(req.user, material) || Number(material.is_active) !== 1) {
    return res.status(404).json({ error: 'Material nao encontrado.' });
  }

  try {
    const filePath = safeStoredPath(material.stored_name);
    if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'O arquivo deste material nao esta disponivel.' });
  } catch {
    return res.status(410).json({ error: 'O arquivo deste material nao esta disponivel.' });
  }

  const accessToken = jwt.sign({
    scope: 'material_access',
    material_id: Number(material.id),
    agency_id: Number(material.agency_id),
    user_id: Number(req.user.id),
  }, JWT_SECRET, { expiresIn: '10m', audience: 'zebrahub-material' });

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  const base = `${protocol}://${host}/api/public/materials/${material.id}`;
  const encodedToken = encodeURIComponent(accessToken);

  res.json({
    material,
    expires_in: 600,
    view_url: `${base}/view?token=${encodedToken}`,
    download_url: `${base}/download?token=${encodedToken}`,
  });
});

module.exports = router;
