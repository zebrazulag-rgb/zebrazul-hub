const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const backendRoot = path.resolve(__dirname, '..');

// Em projetos locais, o backend normalmente está em /projeto/backend.
// No Railway, o conteúdo do backend pode ser copiado diretamente para /app.
// Evita que projectRoot vire "/" e classifique /data como parte do código.
const projectRoot =
  path.basename(backendRoot) === 'backend'
    ? path.resolve(backendRoot, '..')
    : backendRoot;

const legacyDatabasePath = path.join(__dirname, 'zebrazul_hub.sqlite');
const nodeEnvironment = String(process.env.NODE_ENV || 'production').toLowerCase();
const isProduction = nodeEnvironment === 'production';
const allowUnsafeStorage = String(process.env.ALLOW_UNSAFE_STORAGE || 'false').toLowerCase() === 'true';

const persistentRoot =
  process.env.PERSISTENT_DATA_DIR ||
  process.env.RENDER_DISK_MOUNT_PATH ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  '';

const persistenceConfigured = Boolean(process.env.DATABASE_PATH || persistentRoot);

const configuredDatabasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : persistentRoot
    ? path.resolve(persistentRoot, 'zebrazul_hub.sqlite')
    : legacyDatabasePath;

const backupDirectory = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(configuredDatabasePath), 'backups');

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const databaseInsideCode = isInside(configuredDatabasePath, projectRoot);
const databaseInsideTemp = isInside(configuredDatabasePath, path.resolve(os.tmpdir()));
const storageSafe = persistenceConfigured && !databaseInsideCode && !databaseInsideTemp;

if (isProduction && !allowUnsafeStorage && !storageSafe) {
  const reasons = [];
  if (!persistenceConfigured) reasons.push('DATABASE_PATH ou PERSISTENT_DATA_DIR nao foi configurado');
  if (databaseInsideCode) reasons.push('o banco esta dentro da pasta do codigo');
  if (databaseInsideTemp) reasons.push('o banco esta dentro de uma pasta temporaria');

  throw new Error(
    [
      'INICIALIZACAO BLOQUEADA PARA PROTEGER OS DADOS.',
      ...reasons.map((reason) => `- ${reason}.`),
      'Configure um volume/disco persistente e use, por exemplo:',
      'DATABASE_PATH=/data/zebrazul_hub.sqlite',
      'BACKUP_DIR=/data/backups',
      'O sistema nao iniciara com banco descartavel em producao.'
    ].join('\n')
  );
}

module.exports = {
  backendRoot,
  projectRoot,
  legacyDatabasePath,
  databasePath: configuredDatabasePath,
  backupDirectory,
  persistenceConfigured,
  databaseInsideCode,
  databaseInsideTemp,
  storageSafe,
  isProduction,
  allowUnsafeStorage,
};
