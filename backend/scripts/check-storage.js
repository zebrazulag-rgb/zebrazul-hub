const fs = require('fs');
const path = require('path');
const {
  databasePath,
  backupDirectory,
  persistenceConfigured,
  storageSafe,
  databaseInsideCode,
  databaseInsideTemp,
} = require('../db/config');

function writable(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.zebrazul-write-test-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
  return true;
}

try {
  writable(path.dirname(databasePath));
  writable(backupDirectory);

  console.log(JSON.stringify({
    ok: storageSafe,
    persistenceConfigured,
    storageSafe,
    databaseInsideCode,
    databaseInsideTemp,
    databasePath,
    backupDirectory,
    writable: true,
  }, null, 2));

  if (!storageSafe) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
