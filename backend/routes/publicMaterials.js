const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const { safeStoredPath } = require('../services/materials');

const router = express.Router();

function authorizedMaterial(req, res) {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(401).json({ error: 'Token de acesso nao fornecido.' });
    return null;
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { audience: 'zebrahub-material' });
  } catch {
    res.status(401).json({ error: 'Link expirado ou invalido.' });
    return null;
  }

  if (payload.scope !== 'material_access' || Number(payload.material_id) !== Number(req.params.id)) {
    res.status(403).json({ error: 'Acesso negado.' });
    return null;
  }

  const material = db.prepare(`
    SELECT * FROM materials
    WHERE id = ? AND agency_id = ? AND is_active = 1
  `).get(req.params.id, payload.agency_id);
  if (!material) {
    res.status(404).json({ error: 'Material nao encontrado.' });
    return null;
  }

  let filePath;
  try {
    filePath = safeStoredPath(material.stored_name);
  } catch {
    res.status(410).json({ error: 'Arquivo indisponivel.' });
    return null;
  }
  if (!fs.existsSync(filePath)) {
    res.status(410).json({ error: 'Arquivo indisponivel.' });
    return null;
  }

  return { material, filePath };
}

router.get('/:id/view', (req, res) => {
  const access = authorizedMaterial(req, res);
  if (!access) return;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  );
  fs.createReadStream(access.filePath).pipe(res);
});

router.get('/:id/download', (req, res) => {
  const access = authorizedMaterial(req, res);
  if (!access) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.download(access.filePath, access.material.original_name || 'material.html');
});

module.exports = router;
