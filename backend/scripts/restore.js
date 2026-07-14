const fs = require('fs');
const path = require('path');
const { databasePath, backupDirectory } = require('../db/config');

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  console.error('Uso: npm run restore -- /caminho/do/backup.sqlite');
  process.exit(1);
}

const source = path.resolve(sourceArgument);
if (!fs.existsSync(source)) {
  console.error(`Backup não encontrado: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(backupDirectory, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (fs.existsSync(databasePath)) {
  const safetyCopy = path.join(backupDirectory, `antes-da-restauracao-${stamp}.sqlite`);
  fs.copyFileSync(databasePath, safetyCopy);
  console.log(`Cópia de segurança do banco atual: ${safetyCopy}`);
}

for (const suffix of ['', '-wal', '-shm']) {
  const target = databasePath + suffix;
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

const temporaryTarget = `${databasePath}.restore-temp`;
fs.copyFileSync(source, temporaryTarget);
fs.renameSync(temporaryTarget, databasePath);
console.log(`Banco restaurado em: ${databasePath}`);
console.log('Reinicie o backend antes de voltar a usar o sistema.');
