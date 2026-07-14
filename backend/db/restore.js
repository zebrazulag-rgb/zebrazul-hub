// Restaura o banco de dados a partir de um arquivo de backup.
// Uso: npm run restore -- /caminho/para/o/backup.sqlite
// Sem argumento, restaura o backup mais recente da pasta de backups.
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./database');

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(DB_PATH), 'backups');

const argPath = process.argv[2];
let sourceFile = argPath ? path.resolve(argPath) : null;

if (!sourceFile) {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error('Nenhuma pasta de backups encontrada em:', BACKUP_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('zebrazul_hub-') && f.endsWith('.sqlite'))
    .sort();
  if (files.length === 0) {
    console.error('Nenhum backup encontrado em:', BACKUP_DIR);
    process.exit(1);
  }
  sourceFile = path.join(BACKUP_DIR, files[files.length - 1]);
}

if (!fs.existsSync(sourceFile)) {
  console.error('Arquivo de backup não encontrado:', sourceFile);
  process.exit(1);
}

// Guarda uma cópia de segurança do banco atual antes de sobrescrever
if (fs.existsSync(DB_PATH)) {
  const safetyCopy = DB_PATH + '.antes-da-restauracao';
  fs.copyFileSync(DB_PATH, safetyCopy);
  console.log('Cópia de segurança do banco atual salva em:', safetyCopy);
}

fs.copyFileSync(sourceFile, DB_PATH);
console.log('Banco restaurado a partir de:', sourceFile);
console.log('Reinicie o backend para aplicar.');
