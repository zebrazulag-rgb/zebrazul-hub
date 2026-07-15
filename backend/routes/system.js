const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { createBackup, listBackups, findBackup, verifyBackup } = require('../db/backup');
const { getHealthStatus } = require('../db/health');
const { databasePath, backupDirectory, persistenceConfigured, storageSafe } = require('../db/config');

const router = express.Router();

router.use(authRequired, requireRole('admin'));

router.get('/status', (req, res) => {
  const health = getHealthStatus();
  const installation = db.prepare("SELECT value FROM system_meta WHERE key = 'installation_id'").get();

  res.json({
    ...health,
    persistent_storage: persistenceConfigured,
    storage_safe: storageSafe,
    database_file: path.basename(databasePath),
    database_directory: path.dirname(databasePath),
    backup_directory: backupDirectory,
    database_size_bytes: health.database.size_bytes,
    installation_id: installation?.value || null,
    last_backup: health.backup.last,
  });
});

router.get('/backups', (req, res) => {
  res.json(listBackups().map(({ fullPath, mtime, ...backup }) => backup));
});

router.post('/backup', async (req, res) => {
  try {
    const destination = await createBackup('manual');
    res.status(201).json({
      ok: true,
      filename: path.basename(destination),
      created_at: new Date().toISOString(),
      integrity: 'ok',
    });
  } catch (error) {
    console.error('[BACKUP] Erro ao criar backup manual:', error);
    res.status(500).json({ error: 'Nao foi possivel criar o backup' });
  }
});

router.get('/backup/download', async (req, res) => {
  try {
    const destination = await createBackup('download');
    res.download(destination, path.basename(destination));
  } catch (error) {
    console.error('[BACKUP] Erro ao preparar backup para download:', error);
    res.status(500).json({ error: 'Nao foi possivel preparar o backup' });
  }
});

router.post('/restore', async (req, res) => {
  const filename = String(req.body?.filename || '');
  const confirmation = String(req.body?.confirmation || '');

  if (confirmation !== 'RESTAURAR BACKUP') {
    return res.status(400).json({
      error: 'Confirmacao invalida. Envie confirmation: RESTAURAR BACKUP',
    });
  }

  const source = findBackup(filename);
  if (!source) {
    return res.status(404).json({ error: 'Backup nao encontrado' });
  }

  try {
    verifyBackup(source);
    const stagedSource = path.join(backupDirectory, `.restore-source-${Date.now()}.tmp`);
    fs.copyFileSync(source, stagedSource);
    verifyBackup(stagedSource);
    const safetyCopy = await createBackup('antes-da-restauracao');

    res.status(202).json({
      ok: true,
      message: 'Restauracao agendada. O servico sera reiniciado automaticamente.',
      source: filename,
      safety_backup: path.basename(safetyCopy),
    });

    setTimeout(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();

        for (const suffix of ['', '-wal', '-shm']) {
          const target = databasePath + suffix;
          if (fs.existsSync(target)) fs.unlinkSync(target);
        }

        const temporaryTarget = `${databasePath}.restore-temp`;
        fs.copyFileSync(stagedSource, temporaryTarget);
        fs.renameSync(temporaryTarget, databasePath);
        if (fs.existsSync(stagedSource)) fs.unlinkSync(stagedSource);
        console.log(`[RESTORE] Banco restaurado a partir de ${filename}. Reiniciando processo.`);
        process.exit(0);
      } catch (error) {
        console.error('[RESTORE] Falha critica durante restauracao:', error);
        process.exit(1);
      }
    }, 1000);
  } catch (error) {
    console.error('[RESTORE] Nao foi possivel preparar restauracao:', error);
    res.status(500).json({ error: 'Nao foi possivel preparar a restauracao' });
  }
});

module.exports = router;
