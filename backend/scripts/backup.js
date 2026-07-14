const db = require('../db/database');
const { createBackup } = require('../db/backup');

(async () => {
  try {
    const destination = await createBackup('manual');
    console.log(`Backup criado: ${destination}`);
    db.close();
  } catch (error) {
    console.error('Falha ao criar backup:', error);
    process.exitCode = 1;
  }
})();
