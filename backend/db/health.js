const fs = require('fs');
const path = require('path');
const db = require('./database');
const config = require('./config');
const { listBackups } = require('./backup');
const packageInfo = require('../package.json');

function getDiskStats(targetPath) {
  try {
    const stats = fs.statfsSync(path.dirname(targetPath));
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return {
      total_bytes: total,
      available_bytes: available,
      used_percent: total > 0 ? Number((((total - available) / total) * 100).toFixed(2)) : null,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getHealthStatus() {
  let databaseOk = false;
  let integrity = null;
  let queryError = null;

  try {
    db.prepare('SELECT 1 AS ok').get();
    integrity = db.pragma('quick_check', { simple: true });
    databaseOk = String(integrity).toLowerCase() === 'ok';
  } catch (error) {
    queryError = error.message;
  }

  const databaseExists = fs.existsSync(config.databasePath);
  const databaseSize = databaseExists ? fs.statSync(config.databasePath).size : 0;
  const backups = listBackups();
  const latestBackup = backups[0] || null;
  const backupMaxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS || 36);
  const backupAgeHours = latestBackup
    ? (Date.now() - new Date(latestBackup.created_at).getTime()) / 3600000
    : null;
  const backupFresh = latestBackup
    ? !Number.isFinite(backupMaxAgeHours) || backupAgeHours <= backupMaxAgeHours
    : false;

  const healthy = Boolean(
    databaseOk &&
    databaseExists &&
    (!config.isProduction || config.storageSafe)
  );

  return {
    ok: healthy,
    service: 'zebrahub-backend',
    version: packageInfo.version,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    database: {
      ok: databaseOk,
      exists: databaseExists,
      integrity,
      error: queryError,
      size_bytes: databaseSize,
      file: path.basename(config.databasePath),
      directory: path.dirname(config.databasePath),
    },
    storage: {
      persistence_configured: config.persistenceConfigured,
      safe: config.storageSafe,
      inside_code: config.databaseInsideCode,
      inside_temp: config.databaseInsideTemp,
      disk: getDiskStats(config.databasePath),
    },
    backup: {
      directory: config.backupDirectory,
      total: backups.length,
      fresh: backupFresh,
      max_age_hours: backupMaxAgeHours,
      last: latestBackup ? {
        filename: latestBackup.filename,
        created_at: latestBackup.created_at,
        size_bytes: latestBackup.size_bytes,
        age_hours: Number(backupAgeHours.toFixed(2)),
      } : null,
    },
  };
}

module.exports = { getHealthStatus };
