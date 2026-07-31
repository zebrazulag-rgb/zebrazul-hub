const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  locateMediaFile,
  detectMimeFromFile,
  getMediaStorageStatus,
} = require('../services/mediaStorage');

const router = express.Router();

router.get('/_health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...getMediaStorageStatus() });
});

function sendMedia(req, res, includeBody = true) {
  const located = locateMediaFile(req.params.filename);
  if (!located) {
    res.setHeader('Cache-Control', 'no-store');
    console.warn('[MEDIA] Arquivo nao encontrado:', req.params.filename, getMediaStorageStatus());
    return res.status(404).json({ error: 'Arquivo nao encontrado' });
  }

  const mime = detectMimeFromFile(located.filePath);
  const stat = fs.statSync(located.filePath);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (located.repaired) res.setHeader('X-Zebrahub-Media-Repaired', '1');

  if (!includeBody) return res.status(200).end();
  return res.sendFile(path.resolve(located.filePath));
}

router.head('/:filename', (req, res) => sendMedia(req, res, false));
router.get('/:filename', (req, res) => sendMedia(req, res, true));

module.exports = router;
