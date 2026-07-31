const db = require('../db/database');
const {
  locateMediaFile,
  getMediaStorageStatus,
} = require('../services/mediaStorage');

const MEDIA_PATTERN = /\/api\/media\/([a-f0-9]{32,128}(?:\.[a-z0-9]{1,12})?)/gi;

function collectFromValue(value, output) {
  if (!value) return;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let match;
  while ((match = MEDIA_PATTERN.exec(text)) !== null) output.add(match[1]);
}

function collectReferences() {
  const references = new Set();
  const queries = [
    ['posts', 'SELECT media_data, media_gallery FROM posts'],
    ['tasks', 'SELECT attachment_data, media_gallery FROM tasks'],
    ['clients', 'SELECT avatar_data FROM clients'],
    ['users', 'SELECT avatar_data FROM users'],
    ['agencies', 'SELECT logo_data FROM agencies'],
  ];

  for (const [table, sql] of queries) {
    try {
      const rows = db.prepare(sql).all();
      for (const row of rows) {
        for (const value of Object.values(row)) collectFromValue(value, references);
      }
    } catch (error) {
      console.warn(`[MEDIA CHECK] Tabela ${table} ignorada: ${error.message}`);
    }
  }
  return references;
}

const references = collectReferences();
const missing = [];
let repaired = 0;

for (const filename of references) {
  const located = locateMediaFile(filename);
  if (!located) missing.push(filename);
  else if (located.repaired) repaired += 1;
}

const result = {
  ok: missing.length === 0,
  storage: getMediaStorageStatus(),
  references: references.size,
  found: references.size - missing.length,
  repaired,
  missing: missing.length,
  missing_sample: missing.slice(0, 20),
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
