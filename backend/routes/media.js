const express = require('express');
const path = require('path');
const { mediaFileFromName } = require('../services/mediaStorage');

const router = express.Router();

router.get('/:filename', (req, res) => {
  const file = mediaFileFromName(req.params.filename);
  if (!file) return res.status(404).json({ error: 'Arquivo nao encontrado' });
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(path.resolve(file));
});

module.exports = router;
