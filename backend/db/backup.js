const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const db = require('./database');
const { backupDirectory } = require('./config');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function verifyBackup(filePath) {
  const checkDb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const result = checkDb.pragma('integrity_check', { simple: true });
    if (String(result).toLowerCase() !== 'ok') {
      throw new Error(`Falha na verificacao de integridade: ${result}`);
    }
    return true;
  } finally {
    checkDb.close();
  }
}

async function createBackup(label = 'manual') {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '-');
  const destination = path.join(
    backupDirectory,
    `zebrahub-${safeLabel}-${timestamp()}.sqlite`
  );

  await db.backup(destination);
  verifyBackup(destination);
  pruneBackups(Number(process.env.BACKUP_RETENTION || 5));
  return destination;
}

function listBackups() {
  if (!fs.existsSync(backupDirectory)) return [];

  return fs.readdirSync(backupDirectory)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const fullPath = path.join(backupDirectory, name);
      const stats = fs.statSync(fullPath);
      return {
        filename: name,
        created_at: stats.mtime.toISOString(),
        size_bytes: stats.size,
        fullPath,
        mtime: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function findBackup(filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName || safeName !== filename || !safeName.endsWith('.sqlite')) return null;
  const candidate = path.join(backupDirectory, safeName);
  return fs.existsSync(candidate) ? candidate : null;
}

function pruneBackups(retention) {
  if (!Number.isFinite(retention) || retention < 1 || !fs.existsSync(backupDirectory)) return;

  const backups = listBackups();
  for (const backup of backups.slice(retention)) {
    fs.unlinkSync(backup.fullPath);
  }
}

module.exports = { createBackup, listBackups, findBackup, verifyBackup };
