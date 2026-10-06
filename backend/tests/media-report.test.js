// Testes do relatório de mídia órfã (scripts/media-report.js).
// Garante: números corretos, nenhum falso órfão e, principalmente, que NADA é alterado.
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const script = path.join(__dirname, '..', 'scripts', 'media-report.js');
const root = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-media-test-'));
const mediaDir = path.join(root, 'media');
const legacyDir = path.join(root, 'legacy-media');
fs.mkdirSync(mediaDir);
fs.mkdirSync(legacyDir);

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const H = { A: sha('A'), B: sha('B'), C: sha('C'), D: sha('D'), E: sha('E'), F: sha('F'), TOKEN: sha('token-publico') };

function writeMedia(dir, name, size, ageDays = 0) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.alloc(size, 1));
  const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, when, when);
  return file;
}

// Arquivos em disco
writeMedia(mediaDir, `${H.A}.jpg`, 1000, 40);   // referenciado (JSON com URL completa)
writeMedia(mediaDir, `${H.B}.png`, 2000, 40);   // referenciado (/api/media/...)
writeMedia(mediaDir, `${H.C}.jpg`, 5000, 30);   // ÓRFÃO antigo
writeMedia(mediaDir, `${H.D}.webp`, 700, 0);    // ÓRFÃO recente
writeMedia(mediaDir, `${H.E}.png`, 300, 60);    // referenciado só por hash "solto" (avatar)
writeMedia(mediaDir, `${H.F}.jpg.123.456.tmp`, 50, 2); // sobra de upload
writeMedia(mediaDir, 'logo-antigo.png', 400, 90);      // fora do padrão: nunca vira órfão
writeMedia(legacyDir, `${H.A}.jpg`, 1000, 40);  // mesma mídia numa pasta legada (não pode contar duas vezes)

// Banco
const dbFile = path.join(root, 'zebrazul_hub.sqlite');
const db = new Database(dbFile);
db.exec(`
  CREATE TABLE posts (id INTEGER PRIMARY KEY, media_gallery TEXT, media_data TEXT);
  CREATE TABLE tasks (id INTEGER PRIMARY KEY, attachment_data TEXT);
  CREATE TABLE users (id INTEGER PRIMARY KEY, avatar_data TEXT);
  CREATE TABLE clients (id INTEGER PRIMARY KEY, feed_share_token TEXT);
`);
db.prepare('INSERT INTO posts (media_gallery) VALUES (?)').run(JSON.stringify([{ url: `https://app.zebrazul.com.br/api/media/${H.A}.jpg`, mime: 'image/jpeg' }]));
db.prepare('INSERT INTO posts (media_data) VALUES (?)').run(`/api/media/${H.F}.jpg`);          // aponta p/ arquivo que NÃO existe
db.prepare('INSERT INTO tasks (attachment_data) VALUES (?)').run(`/api/media/${H.B}.png`);
db.prepare('INSERT INTO users (avatar_data) VALUES (?)').run(H.E);                             // hash solto, sem URL
db.prepare('INSERT INTO clients (feed_share_token) VALUES (?)').run(H.TOKEN);                  // 64 hex que NÃO é mídia
db.close();

const fingerprint = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tree = () => [mediaDir, legacyDir].flatMap((d) => fs.readdirSync(d).map((n) => `${d}/${n}:${fs.statSync(path.join(d, n)).size}`)).sort();

const dbBefore = fingerprint(dbFile);
const treeBefore = tree();
const jsonOut = path.join(root, 'out.json');
const csvOut = path.join(root, 'out.csv');
const stdout = execFileSync(process.execPath, [script, '--db', dbFile, '--media-dir', mediaDir, '--media-dir', legacyDir, '--min-age-days', '7', '--json', jsonOut, '--csv', csvOut], { encoding: 'utf8' });
const report = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));

test('contagem: arquivos únicos não duplicam por pasta legada', () => {
  assert.equal(report.disk.unique_managed_files, 5); // A, B, C, D, E (o .tmp e o logo ficam de fora)
  assert.equal(report.media_directories.length, 2);
});

test('em uso: URL completa, /api/media/ e hash solto contam como referenciados', () => {
  assert.equal(report.referenced.files, 3); // A, B, E
  assert.equal(report.referenced.bytes, 1000 + 2000 + 300);
});

test('órfãos: só C e D, separados por idade', () => {
  assert.equal(report.orphans.count, 2);
  assert.equal(report.orphans.bytes, 5000 + 700);
  assert.equal(report.orphans.safe_candidates.count, 1);
  assert.equal(report.orphans.safe_candidates.bytes, 5000);
  assert.equal(report.orphans.recent.count, 1);
  assert.equal(report.orphans.items[0].file, `${H.C}.jpg`); // ordenado do maior para o menor
  assert.equal(report.orphans.items[0].classe, 'orfao_candidato_seguro');
  assert.equal(report.orphans.items[1].classe, 'orfao_recente');
});

test('sobras .tmp e arquivos fora do padrão nunca viram órfãos', () => {
  assert.equal(report.leftover_tmp_files.count, 1);
  assert.equal(report.unrecognized_files.count, 1);
  assert.ok(!report.orphans.items.some((o) => o.file.includes('logo-antigo') || o.file.endsWith('.tmp')));
});

test('referência quebrada: registro aponta para arquivo inexistente; token de 64 hex não conta', () => {
  assert.equal(report.broken_references.count, 1);
  assert.equal(report.broken_references.items[0].hash, H.F);
  assert.deepEqual(report.broken_references.items[0].referenced_in, ['posts.media_data']);
});

test('CSV lista os órfãos', () => {
  const lines = fs.readFileSync(csvOut, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3); // cabeçalho + 2
  assert.ok(lines[1].startsWith(`${H.C}.jpg`));
});

test('SOMENTE LEITURA: banco e pastas de mídia ficam byte a byte iguais', () => {
  assert.equal(report.read_only, true);
  assert.equal(fingerprint(dbFile), dbBefore);
  assert.deepEqual(tree(), treeBefore);
  assert.ok(stdout.includes('nada foi alterado'));
});

test('erros claros: banco inexistente', () => {
  assert.throws(
    () => execFileSync(process.execPath, [script, '--db', path.join(root, 'nao-existe.sqlite')], { encoding: 'utf8', stdio: 'pipe' }),
    (error) => /Banco não encontrado/.test(String(error.stderr))
  );
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
