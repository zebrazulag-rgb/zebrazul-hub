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
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  if (located.repaired) res.setHeader('X-Zebrahub-Media-Repaired', '1');

  const range = req.headers.range;
  if (includeBody && range && String(mime).startsWith('video/')) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        return fs.createReadStream(located.filePath, { start, end }).pipe(res);
      }
    }
  }

  res.setHeader('Content-Length', String(stat.size));
  if (!includeBody) return res.status(200).end();
  return res.sendFile(path.resolve(located.filePath));
}

router.head('/:filename', (req, res) => sendMedia(req, res, false));
router.get('/:filename', (req, res) => sendMedia(req, res, true));

module.exports = router;
