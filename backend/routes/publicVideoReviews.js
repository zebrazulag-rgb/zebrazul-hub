const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { videoStorageDirectory } = require('../db/config');

const router = express.Router();

function safeStoredPath(storedName) {
  const normalized = path.basename(String(storedName || ''));
  return path.join(videoStorageDirectory, normalized);
}

router.get('/stream/:token', (req, res) => {
  const version = db.prepare(`
    SELECT v.*, r.status AS review_status
    FROM video_review_versions v
    JOIN video_reviews r ON r.id = v.review_id
    WHERE v.stream_token = ? AND r.status != 'archived'
  `).get(req.params.token);

  if (!version) return res.status(404).json({ error: 'Vídeo não encontrado' });
  const filePath = safeStoredPath(version.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo de vídeo indisponível' });

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const mime = version.mime_type || 'video/mp4';
  const forceDownload = String(req.query.download || '') === '1';

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (forceDownload) {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.original_name || 'video.mp4')}`);
  }

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', total);
    return fs.createReadStream(filePath).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`);
    return res.end();
  }

  const start = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  const end = Math.min(requestedEnd, total - 1);
  if (!Number.isFinite(start) || start < 0 || start >= total || end < start) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`);
    return res.end();
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', end - start + 1);
  return fs.createReadStream(filePath, { start, end }).pipe(res);
});

module.exports = router;
