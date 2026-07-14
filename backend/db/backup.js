// Copia o arquivo do banco de dados atual para a pasta de backups, com timestamp no nome.
// Uso via terminal: npm run backup
// Também é chamado automaticamente pelo server.js a cada início (sem derrubar o processo em caso de erro).
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./database');

function runBackup() {
  const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(path.dirname(DB_PATH), 'backups');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Banco de dados não encontrado em: ' + DB_PATH);
  }
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupDir, `zebrazul_hub-${timestamp}.sqlite`);
  fs.copyFileSync(DB_PATH, destination);

  const retention = Number(process.env.BACKUP_RETENTION) || 14;
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith('zebrazul_hub-') && f.endsWith('.sqlite'))
    .sort();

  if (files.length > retention) {
    files.slice(0, files.length - retention).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));
  }

  return destination;
}

module.exports = runBackup;

// Executado diretamente via `npm run backup` — nesse caso, pode encerrar o processo com erro.
if (require.main === module) {
  try {
    const destination = runBackup();
    console.log('Backup criado em:', destination);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
