const bcrypt = require('bcryptjs');
const db = require('./database');

const hash = (pw) => bcrypt.hashSync(pw, 10);

function seed() {
  const agency = db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get();
  if (!agency) throw new Error('Agência principal não encontrada.');
  const agencyId = Number(agency.id);
  const clientCount = db.prepare('SELECT COUNT(*) as c FROM clients WHERE agency_id = ?').get(agencyId).c;
  if (clientCount > 0) {
    console.log('Banco ja possui dados. Seed ignorado.');
    return;
  }

  const insertClient = db.prepare(
    `INSERT INTO clients (agency_id, name, segment, logo_color, status) VALUES (?, ?, ?, ?, 'active')`
  );
  const dentoessence = insertClient.run(agencyId, 'Dentoessence SP', 'Odontologia', '#0ea5e9');
  const kiPureza = insertClient.run(agencyId, 'Ki-Pureza', 'Alimentos', '#22c55e');
  const dmais = insertClient.run(agencyId, "Óticas D'Mais", 'Ótica', '#f59e0b');

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, client_id, agency_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  insertUser.run('Saulo Pinheiro', 'saulo@zebrazul.com', hash('zebrazul123'), 'admin', null, agencyId, '#1d4ed8');
  insertUser.run('Equipe Zebrazul', 'equipe@zebrazul.com', hash('zebrazul123'), 'team', null, agencyId, '#7c3aed');
  insertUser.run('Cliente Dentoessence', 'dentoessence@cliente.com', hash('cliente123'), 'client', dentoessence.lastInsertRowid, agencyId, '#0ea5e9');
  insertUser.run('Cliente Ki-Pureza', 'kipureza@cliente.com', hash('cliente123'), 'client', kiPureza.lastInsertRowid, agencyId, '#22c55e');
  insertUser.run("Cliente D'Mais", 'dmais@cliente.com', hash('cliente123'), 'client', dmais.lastInsertRowid, agencyId, '#f59e0b');

  const insertAccount = db.prepare(
    `INSERT INTO social_accounts (agency_id, client_id, platform, handle, connected) VALUES (?, ?, ?, ?, 1)`
  );
  insertAccount.run(agencyId, dentoessence.lastInsertRowid, 'instagram', '@dentoessence.sp');
  insertAccount.run(agencyId, kiPureza.lastInsertRowid, 'instagram', '@kipureza');
  insertAccount.run(agencyId, dmais.lastInsertRowid, 'instagram', '@oticasdmais');

  const insertPost = db.prepare(
    `INSERT INTO posts (agency_id, client_id, created_by, title, caption, content_type, platforms, scheduled_at, status)
     VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)`
  );
  insertPost.run(
    agencyId, dentoessence.lastInsertRowid,
    'Sorriso de verão',
    'Aquele sorriso que você não esconde de ninguém 😁✨ Agende sua avaliação e comece o verão com o sorriso que você sempre quis.\n\n📲 Clique no link da bio e agende agora.\n\n#Dentoessence #OdontologiaSantos #SorrisoPerfeito',
    'feed',
    '["instagram","facebook"]',
    new Date(Date.now() + 2 * 86400000).toISOString(),
    'pending_approval'
  );
  insertPost.run(
    agencyId, kiPureza.lastInsertRowid,
    'Alho descascado - praticidade',
    'Chega de perder tempo descascando alho! 🧄 Praticidade que cabe na sua rotina, com a qualidade Ki-Pureza.\n\n#KiPureza #Praticidade #CozinhaDeVerdade',
    'reels',
    '["instagram"]',
    new Date(Date.now() + 1 * 86400000).toISOString(),
    'approved'
  );
  insertPost.run(
    agencyId, dmais.lastInsertRowid,
    'Coleção nova de armações',
    'Nova coleção chegou pra você ficar ainda mais estiloso 😎 Confira as novidades na loja mais próxima.\n\n#OticasDMais #Óculos #Estilo',
    'carrossel',
    '["instagram","facebook"]',
    null,
    'draft'
  );

  const insertMetric = db.prepare(
    `INSERT INTO report_metrics (agency_id, client_id, platform, metric_date, reach, impressions, engagement, followers_delta, clicks, leads, spend, conversions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    insertMetric.run(agencyId, dentoessence.lastInsertRowid, 'meta_ads', dateStr,
      1200 + Math.round(Math.random() * 400), 2000 + Math.round(Math.random() * 800),
      80 + Math.round(Math.random() * 40), 3 + Math.round(Math.random() * 5),
      45 + Math.round(Math.random() * 20), 2 + Math.round(Math.random() * 3),
      35 + Math.random() * 15, 1 + Math.round(Math.random() * 2));
    insertMetric.run(agencyId, kiPureza.lastInsertRowid, 'instagram', dateStr,
      800 + Math.round(Math.random() * 300), 1500 + Math.round(Math.random() * 500),
      60 + Math.round(Math.random() * 30), 2 + Math.round(Math.random() * 4),
      20 + Math.round(Math.random() * 15), 0, 0, 0);
  }

  console.log('Seed concluido com sucesso.');
  console.log('Login admin: saulo@zebrazul.com / zebrazul123');
  console.log('Login equipe: equipe@zebrazul.com / zebrazul123');
  console.log('Login cliente: dentoessence@cliente.com / cliente123');
}

module.exports = seed;

// Permite continuar rodando manualmente: node db/seed.js
if (require.main === module) {
  seed();
}
