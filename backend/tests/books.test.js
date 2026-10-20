const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-books-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
process.env.BOOKS_STORAGE_DIR = path.join(tmpDir, 'books'); process.env.BOOKS_MAX_FILE_MB = '1'; process.env.BOOKS_MAX_USER_MB = '2';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const userA = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
const userB = { id: 2, role: 'team', agency_id: agencyId, client_ids: [] };
const client = { id: 3, role: 'client', agency_id: agencyId, client_id: 1 };
CUR = userA;
const app = express(); app.use(express.json()); app.use('/b', require('../routes/books'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/b`; });
test.after(() => server.close());

const pdfBytes = (extra = 0) => Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), Buffer.alloc(extra, 32)]);
const upload = async (bytes, fields = {}, name = 'Meu Livro.pdf') => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  return fetch(base, { method: 'POST', body: form });
};
const json = (method, url, body) => fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

let bookId;
test('upload de PDF válido cria o livro do usuário com metadados', async () => {
  const r = await upload(pdfBytes(5000), { title: '  Pequeno Príncipe ', author: 'Saint-Exupéry', page_count: '96', text_status: 'has_text' });
  assert.equal(r.status, 201);
  const { book } = await r.json();
  bookId = book.id;
  assert.equal(book.title, 'Pequeno Príncipe');
  assert.equal(book.page_count, 96);
  assert.equal(book.percent, 0);
  assert.ok(!('storage_name' in book));
  const files = fs.readdirSync(process.env.BOOKS_STORAGE_DIR).filter((f) => f.endsWith('.pdf'));
  assert.equal(files.length, 1);
});

test('rejeita arquivo que não é PDF e não deixa sobras', async () => {
  const r = await upload(Buffer.from('isto nao e um pdf'), {}, 'x.pdf');
  assert.equal(r.status, 400);
  assert.equal(fs.readdirSync(path.join(process.env.BOOKS_STORAGE_DIR, '_incoming')).length, 0);
});

test('limite de tamanho por arquivo e por biblioteca', async () => {
  assert.equal((await upload(pdfBytes(1.2 * 1024 * 1024))).status, 413);
  assert.equal((await upload(pdfBytes(900 * 1024))).status, 201);
  assert.equal((await upload(pdfBytes(900 * 1024))).status, 201); // ~1,8 MB usados
  assert.equal((await upload(pdfBytes(900 * 1024))).status, 413); // passaria de 2 MB
});

test('cada usuário só enxerga e altera os próprios livros', async () => {
  CUR = userB;
  assert.deepEqual((await (await fetch(base)).json()).books, []);
  for (const [method, url, body] of [
    ['GET', `/${bookId}`], ['GET', `/${bookId}/file`], ['PATCH', `/${bookId}`, { title: 'hack' }],
    ['PUT', `/${bookId}/progress`, { current_page: 5 }], ['DELETE', `/${bookId}`],
    ['GET', `/${bookId}/marks`], ['POST', `/${bookId}/marks`, { kind: 'bookmark', page: 1 }],
  ]) {
    assert.equal((await json(method, url, body)).status, 404, `${method} ${url}`);
  }
  CUR = userA;
  assert.ok((await (await fetch(base)).json()).books.some((b) => b.id === bookId));
});

test('cliente (portal) não acessa o Zebra Leitor', async () => {
  CUR = client;
  assert.equal((await fetch(base)).status, 403);
  CUR = userA;
});

test('arquivo é servido só ao dono, com suporte a Range', async () => {
  const full = await fetch(`${base}/${bookId}/file`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'application/pdf');
  assert.match(full.headers.get('cache-control'), /private/);
  const buf = Buffer.from(await full.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  const part = await fetch(`${base}/${bookId}/file`, { headers: { Range: 'bytes=0-9' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
});

test('progresso: página, máximo alcançado, percentual e velocidade persistem', async () => {
  let r = await (await json('PUT', `/${bookId}/progress`, { current_page: 24, playback_rate: 1.5, narration_page: 24, narration_chunk: 7 })).json();
  assert.equal(r.book.current_page, 24);
  assert.equal(r.book.percent, 25);
  assert.equal(r.book.playback_rate, 1.5);
  assert.equal(r.book.narration_chunk, 7);
  assert.ok(r.book.last_opened_at);
  r = await (await json('PUT', `/${bookId}/progress`, { current_page: 10 })).json(); // voltou: percentual não cai
  assert.equal(r.book.current_page, 10);
  assert.equal(r.book.percent, 25);
  r = await (await json('PUT', `/${bookId}/progress`, { current_page: 9999 })).json(); // limitado ao total
  assert.equal(r.book.current_page, 96);
  assert.equal(r.book.percent, 100);
  const again = (await (await fetch(`${base}/${bookId}`)).json()).book;
  assert.equal(again.current_page, 96);
  assert.equal(again.playback_rate, 1.5);
});

test('editar título/autor e metadados', async () => {
  assert.equal((await json('PATCH', `/${bookId}`, { title: '   ' })).status, 400);
  const r = await (await json('PATCH', `/${bookId}`, { title: 'O Pequeno Príncipe', author: 'Antoine', page_count: 100, text_status: 'has_text' })).json();
  assert.equal(r.book.title, 'O Pequeno Príncipe');
  assert.equal(r.book.page_count, 100);
  assert.equal(r.book.percent, 96); // max_page 96 de 100
});

test('marcações: favorito (idempotente), trecho, anotação, editar e excluir', async () => {
  const a = await (await json('POST', `/${bookId}/marks`, { kind: 'bookmark', page: 5 })).json();
  const b = await (await json('POST', `/${bookId}/marks`, { kind: 'bookmark', page: 5 })).json();
  assert.equal(a.mark.id, b.mark.id);
  assert.equal((await json('POST', `/${bookId}/marks`, { kind: 'highlight', page: 6 })).status, 400);
  const h = await (await json('POST', `/${bookId}/marks`, { kind: 'highlight', page: 6, quote: 'Trecho importante.' })).json();
  const n = await (await json('POST', `/${bookId}/marks`, { kind: 'note', page: 2, note: 'Ver depois' })).json();
  assert.equal((await json('POST', `/${bookId}/marks`, { kind: 'xx', page: 1 })).status, 400);
  let list = (await (await fetch(`${base}/${bookId}/marks`)).json()).marks;
  assert.deepEqual(list.map((m) => m.page), [2, 5, 6]);
  const up = await (await json('PATCH', `/${bookId}/marks/${n.mark.id}`, { note: 'Ver amanhã' })).json();
  assert.equal(up.mark.note, 'Ver amanhã');
  assert.equal((await json('DELETE', `/${bookId}/marks/${h.mark.id}`)).status, 200);
  list = (await (await fetch(`${base}/${bookId}/marks`)).json()).marks;
  assert.equal(list.length, 2);
  CUR = userB;
  assert.equal((await json('DELETE', `/${bookId}/marks/${a.mark.id}`)).status, 404);
  CUR = userA;
});

test('compartilhar com a agência: outros leem, mostram progresso próprio e só o dono altera', async () => {
  const ins = db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'x', ?)");
  ins.run(1, agencyId, 'Ana', 'ana@t.com', 'admin'); ins.run(2, agencyId, 'Beto', 'beto@t.com', 'team');
  const other = db.prepare("INSERT INTO agencies (name, slug, status) VALUES ('Outra', 'outra-zl', 'active')").run().lastInsertRowid;
  const userC = { id: 9, role: 'team', agency_id: Number(other), client_ids: [] };

  // privado por padrão: B não vê
  CUR = userB;
  assert.equal((await fetch(`${base}/${bookId}`)).status, 404);
  CUR = userA;
  const shared = await (await json('PATCH', `/${bookId}`, { visibility: 'agency' })).json();
  assert.equal(shared.book.visibility, 'agency');
  assert.equal(shared.book.is_owner, true);

  CUR = userB;
  const list = (await (await fetch(base)).json()).books;
  const seen = list.find((b) => b.id === bookId);
  assert.ok(seen); assert.equal(seen.is_owner, false); assert.equal(seen.owner_name, 'Ana');
  assert.equal(seen.percent, 0); // progresso de B começa do zero, não herda o da Ana
  assert.equal((await fetch(`${base}/${bookId}/file`)).status, 200);
  // B lê: progresso próprio
  let r = await (await json('PUT', `/${bookId}/progress`, { current_page: 50, playback_rate: 2 })).json();
  assert.equal(r.book.current_page, 50); assert.equal(r.book.percent, 50);
  // mas não altera nem exclui
  assert.equal((await json('PATCH', `/${bookId}`, { title: 'hack' })).status, 403);
  assert.equal((await json('DELETE', `/${bookId}`)).status, 403);
  // marcações próprias de B não aparecem para a Ana
  await json('POST', `/${bookId}/marks`, { kind: 'bookmark', page: 40 });
  CUR = userA;
  assert.deepEqual((await (await fetch(`${base}/${bookId}/marks`)).json()).marks.map((m) => m.page), [2, 5]);
  // a Ana mantém o próprio progresso e vê quem está lendo
  const mine = (await (await fetch(`${base}/${bookId}`)).json()).book;
  assert.equal(mine.current_page, 96); assert.equal(mine.playback_rate, 1.5);
  assert.equal(mine.readers_count, 2); assert.equal(mine.finished_count, 0); assert.equal(mine.reading_count, 2);
  const beto = mine.readers.find((x) => x.name === 'Beto');
  assert.equal(beto.percent, 50); assert.equal(beto.current_page, 50);

  // outra agência nunca vê
  CUR = userC;
  assert.equal((await fetch(`${base}/${bookId}`)).status, 404);
  assert.equal((await fetch(`${base}/${bookId}/file`)).status, 404);
  assert.deepEqual((await (await fetch(base)).json()).books, []);

  // voltar a privado esconde de novo
  CUR = userA;
  await json('PATCH', `/${bookId}`, { visibility: 'private' });
  CUR = userB;
  assert.equal((await fetch(`${base}/${bookId}`)).status, 404);
  CUR = userA;
  assert.equal((await (await fetch(`${base}/${bookId}`)).json()).book.readers, undefined);
});

test('excluir remove o arquivo e as marcações', async () => {
  const before = fs.readdirSync(process.env.BOOKS_STORAGE_DIR).filter((f) => f.endsWith('.pdf')).length;
  assert.equal((await json('DELETE', `/${bookId}`)).status, 200);
  const after = fs.readdirSync(process.env.BOOKS_STORAGE_DIR).filter((f) => f.endsWith('.pdf')).length;
  assert.equal(after, before - 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM zl_marks WHERE book_id = ?').get(bookId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM zl_progress WHERE book_id = ?').get(bookId).n, 0);
  assert.equal((await fetch(`${base}/${bookId}/file`)).status, 404);
});
