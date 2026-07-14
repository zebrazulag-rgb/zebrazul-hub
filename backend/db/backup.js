const fs = require('fs');
const path = require('path');
const db = require('./database');
const { backupDirectory } = require('./config');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createBackup(label = 'manual') {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '-');
  const destination = path.join(
    backupDirectory,
    `zebrazul-hub-${safeLabel}-${timestamp()}.sqlite`
  );

  await db.backup(destination);
  pruneBackups(Number(process.env.BACKUP_RETENTION || 20));
  return destination;
}

function pruneBackups(retention) {
  if (!Number.isFinite(retention) || retention < 1 || !fs.existsSync(backupDirectory)) return;

  const backups = fs.readdirSync(backupDirectory)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const fullPath = path.join(backupDirectory, name);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const backup of backups.slice(retention)) {
    fs.unlinkSync(backup.fullPath);
  }
}

module.exports = { createBackup };
