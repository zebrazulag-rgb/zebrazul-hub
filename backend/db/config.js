const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const backendRoot = path.resolve(__dirname, '..');
const legacyDatabasePath = path.join(__dirname, 'zebrazul_hub.sqlite');

const persistentRoot =
  process.env.PERSISTENT_DATA_DIR ||
  process.env.RENDER_DISK_MOUNT_PATH ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  '';

const configuredDatabasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : persistentRoot
    ? path.resolve(persistentRoot, 'zebrazul_hub.sqlite')
    : legacyDatabasePath;

const backupDirectory = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(configuredDatabasePath), 'backups');

const persistenceConfigured = Boolean(process.env.DATABASE_PATH || persistentRoot);

module.exports = {
  backendRoot,
  legacyDatabasePath,
  databasePath: configuredDatabasePath,
  backupDirectory,
  persistenceConfigured,
};
