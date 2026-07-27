const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { databasePath } = require('../db/config');

const materialsDirectory = process.env.MATERIALS_DIR
  ? path.resolve(process.env.MATERIALS_DIR)
  : path.join(path.dirname(databasePath), 'materials');

function ensureMaterialsDirectory() {
  fs.mkdirSync(materialsDirectory, { recursive: true });
  return materialsDirectory;
}

function safeStoredPath(storedName) {
  const normalized = path.basename(String(storedName || ''));
  if (!normalized || normalized !== storedName) throw new Error('Nome de arquivo de material invalido');
  return path.join(ensureMaterialsDirectory(), normalized);
}

function removeStoredFile(storedName) {
  try {
    const filePath = safeStoredPath(storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('[MATERIAIS] Nao foi possivel remover arquivo:', error.message);
  }
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function seedBuiltInMaterials() {
  ensureMaterialsDirectory();
  const sourcePath = path.join(__dirname, '..', 'assets', 'materials', 'guia-influenciadores-instituto-espinel.html');
  if (!fs.existsSync(sourcePath)) {
    console.warn('[MATERIAIS] Guia inicial do Instituto Espinel nao foi encontrado no pacote.');
    return;
  }

  const matchingClients = db.prepare(`
    SELECT id, agency_id, name
    FROM clients
    WHERE status != 'archived'
    ORDER BY id
  `).all().filter((client) => normalizeName(client.name).includes('instituto espinel'));

  if (!matchingClients.length) {
    console.log('[MATERIAIS] Instituto Espinel ainda nao encontrado; guia inicial sera tentado no proximo startup.');
    return;
  }

  const insert = db.prepare(`
    INSERT INTO materials (
      agency_id, client_id, title, description, category,
      original_name, stored_name, mime_type, file_size, seed_key, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'text/html', ?, ?, NULL)
  `);

  for (const client of matchingClients) {
    const seedKey = 'instituto-espinel-guia-influenciadores-agosto-v1';
    const migrationKey = `materials_seed_${seedKey}_${client.agency_id}_${client.id}`;
    const migration = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(migrationKey);
    const existing = db.prepare(`
      SELECT id, stored_name FROM materials
      WHERE agency_id = ? AND client_id = ? AND seed_key = ?
    `).get(client.agency_id, client.id, seedKey);

    if (migration) {
      if (existing) {
        const destination = safeStoredPath(existing.stored_name);
        if (!fs.existsSync(destination)) fs.copyFileSync(sourcePath, destination);
      }
      continue;
    }

    const storedName = `seed-${client.agency_id}-${client.id}-${randomUUID()}.html`;
    const destination = safeStoredPath(storedName);
    fs.copyFileSync(sourcePath, destination);
    const size = fs.statSync(destination).size;

    const transaction = db.transaction(() => {
      if (!existing) {
        insert.run(
          client.agency_id,
          client.id,
          'Guia das Influenciadoras — Agosto',
          'Direção criativa para influenciadores apresentarem os cuidados masculinos do Instituto Espinel com naturalidade e autoridade médica.',
          'Guia interativo',
          'Guia das Influenciadoras - Agosto - Instituto Espinel.html',
          storedName,
          size,
          seedKey
        );
      } else if (!fs.existsSync(safeStoredPath(existing.stored_name))) {
        fs.copyFileSync(sourcePath, safeStoredPath(existing.stored_name));
      }
      db.prepare(`
        INSERT INTO system_meta (key, value, updated_at)
        VALUES (?, '1', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = datetime('now')
      `).run(migrationKey);
    });

    try {
      transaction();
      if (existing && storedName !== existing.stored_name) removeStoredFile(storedName);
      console.log(`[MATERIAIS] Guia inicial vinculado ao cliente ${client.name}.`);
    } catch (error) {
      removeStoredFile(storedName);
      console.error(`[MATERIAIS] Falha ao cadastrar guia para ${client.name}:`, error.message);
    }
  }
}

module.exports = {
  materialsDirectory,
  ensureMaterialsDirectory,
  safeStoredPath,
  removeStoredFile,
  seedBuiltInMaterials,
};
