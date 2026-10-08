// Remover imagens de uma tarefa via PUT (o formulário envia media_gallery = [] e attachment_data = null).
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-media-test-'));
process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = path.join(tmpDir, 'zebrazul_hub.sqlite');
process.env.AUTO_BACKUP_ON_START = 'false';

const authPath = require.resolve('../middleware/auth.js');
const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };

const db = require('../db/database');
const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
CUR.agency_id = agencyId;
const uid = Number(db.prepare('INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(agencyId, 'U', 'u@t.com', 'x', 'admin').lastInsertRowid);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const gallery = JSON.stringify([{ data: PNG, mime: 'image/png', filename: 'a.png' }, { data: PNG, mime: 'image/png', filename: 'b.png' }]);
const mk = () => Number(db.prepare(`INSERT INTO tasks (agency_id, created_by, task_type, title, status, workflow_stage, media_gallery, attachment_data, attachment_mime, attachment_filename)
  VALUES (?, ?, 'basic', 'FRASE', 'pending', 'correction', ?, ?, 'image/png', 'a.png')`).run(agencyId, uid, gallery, PNG).lastInsertRowid);

const app = express(); app.use(express.json({ limit: '20mb' })); app.use('/t', require('../routes/tasks'));
let server; let base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/t`; });
test.after(() => server.close());
const put = async (id, body) => { const r = await fetch(`${base}/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const row = (id) => db.prepare('SELECT media_gallery, attachment_data, attachment_mime, attachment_filename FROM tasks WHERE id = ?').get(id);

test('remover uma das duas imagens mantém a outra como principal', async () => {
  const id = mk();
  const r = await put(id, { title: 'FRASE', media_gallery: [{ data: PNG, mime: 'image/png', filename: 'b.png' }], attachment_data: PNG, attachment_mime: 'image/png', attachment_filename: 'b.png' });
  assert.equal(r.status, 200);
  const t = row(id);
  assert.equal(JSON.parse(t.media_gallery).length, 1);
  assert.equal(t.attachment_filename, 'b.png');
});

test('remover todas as imagens limpa galeria e anexo', async () => {
  const id = mk();
  const r = await put(id, { title: 'FRASE', media_gallery: [], attachment_data: null, attachment_mime: null, attachment_filename: null });
  assert.equal(r.status, 200);
  const t = row(id);
  assert.equal(t.media_gallery, null);
  assert.equal(t.attachment_data, null);
  const media = await (await fetch(`${base}/${id}/media`)).json();
  assert.equal(media.media.media_gallery.length, 0);
  assert.equal(media.media.attachment_data, null);
});
