const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { createBackup, listBackups } = require('../db/backup');
const { databasePath, backupDirectory, persistenceConfigured, storageSafe } = require('../db/config');

const router = express.Router();

router.use(authRequired, requireRole('admin'));

router.get('/status', (req, res) => {
  const databaseExists = fs.existsSync(databasePath);
  const databaseSize = databaseExists ? fs.statSync(databasePath).size : 0;
  const backups = listBackups();
  const installation = db.prepare("SELECT value FROM system_meta WHERE key = 'installation_id'").get();

  res.json({
    persistent_storage: persistenceConfigured,
    storage_safe: storageSafe,
    database_file: path.basename(databasePath),
    database_directory: path.dirname(databasePath),
    backup_directory: backupDirectory,
    database_size_bytes: databaseSize,
    installation_id: installation?.value || null,
    last_backup: backups[0] ? {
      filename: backups[0].filename,
      created_at: backups[0].created_at,
      size_bytes: backups[0].size_bytes,
    } : null,
  });
});

router.post('/backup', async (req, res) => {
  try {
    const destination = await createBackup('manual');
    res.status(201).json({
      ok: true,
      filename: path.basename(destination),
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Erro ao criar backup manual:', error);
    res.status(500).json({ error: 'Nao foi possivel criar o backup' });
  }
});

router.get('/backup/download', async (req, res) => {
  try {
    const destination = await createBackup('download');
    res.download(destination, path.basename(destination));
  } catch (error) {
    console.error('Erro ao preparar backup para download:', error);
    res.status(500).json({ error: 'Nao foi possivel preparar o backup' });
  }
});

module.exports = router;
