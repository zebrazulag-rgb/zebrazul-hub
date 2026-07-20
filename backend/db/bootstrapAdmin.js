const bcrypt = require('bcryptjs');
const db = require('./database');
const { isProduction } = require('./config');

function bootstrapAdminIfNeeded() {
  const totalUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (totalUsers > 0) return false;

  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');

  if (!name || !email || password.length < 8) {
    const message = [
      'O banco persistente esta vazio e nenhum administrador inicial foi configurado.',
      'Defina BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD.',
      'A senha inicial deve ter pelo menos 8 caracteres.'
    ].join(' ');

    if (isProduction) throw new Error(message);
    console.warn(message);
    return false;
  }

  const agency = db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get();
  if (!agency) throw new Error('Agência principal não foi criada.');
  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, client_id, agency_id, is_platform_owner, is_agency_owner, avatar_color)
     VALUES (?, ?, ?, 'admin', NULL, ?, 1, 1, '#1d4ed8')`
  ).run(name, email, passwordHash, agency.id);

  console.log(`Administrador inicial criado: ${email}`);
  return true;
}

module.exports = bootstrapAdminIfNeeded;
