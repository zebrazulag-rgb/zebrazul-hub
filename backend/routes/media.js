const express = require('express');
const fs = require('fs');
const path = require('path');
const { mediaFileFromName, detectMimeFromFile } = require('../services/mediaStorage');

const router = express.Router();

router.get('/:filename', (req, res) => {
  const file = mediaFileFromName(req.params.filename);
  if (!file) return res.status(404).json({ error: 'Arquivo nao encontrado' });

  const mime = detectMimeFromFile(file);
  const stat = fs.statSync(file);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(path.resolve(file));
});

module.exports = router;
