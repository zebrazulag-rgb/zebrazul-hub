const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-avt-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
let ALLOW = true;
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: () => ALLOW } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id); CUR.agency_id = agencyId;
db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (1, ?, 'Adm', 'adm@t.com', 'x', 'admin')").run(agencyId);
const other = Number(db.prepare("INSERT INTO agencies (name, slug, status) VALUES ('Outra', 'outra-av', 'active')").run().lastInsertRowid);
const mkClient = (ag, name) => Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, ?, 'active')").run(ag, name).lastInsertRowid);
const a = mkClient(agencyId, 'Grava'); const b = mkClient(agencyId, 'Nao grava'); const foreign = mkClient(other, 'De fora');
const app = express(); app.use(express.json()); app.use('/a', require('../routes/audiovisual'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/a`; });
test.after(() => server.close());
const put = (url, body) => fetch(`${base}${url}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const flag = (id) => db.prepare('SELECT is_recording_client AS v FROM audiovisual_client_settings WHERE agency_id = ? AND client_id = ?').get(agencyId, id)?.v;

test('tirar e devolver um cliente mexe só nele e preserva histórico e configuração', async () => {
  assert.equal((await put(`/clients/${a}/recording`, { is_recording_client: true })).status, 200);
  assert.equal((await put(`/clients/${b}/recording`, { is_recording_client: true })).status, 200);
  assert.equal((await put(`/clients/${b}/settings`, { videos_per_period: 5, cadence_period: 'month' })).status, 200);
  db.prepare("INSERT INTO audiovisual_recordings (agency_id, client_id, created_by, title, scheduled_start, status) VALUES (?, ?, 1, 'G', '2099-01-01T10:00:00', 'scheduled')").run(agencyId, b);
  const off = await (await put(`/clients/${b}/recording`, { is_recording_client: false })).json();
  assert.equal(off.is_recording_client, false); assert.equal(off.scheduled_recordings, 1);
  assert.equal(flag(b), 0); assert.equal(flag(a), 1); // o outro não é tocado
  const kept = db.prepare('SELECT videos_per_period v, cadence_period c FROM audiovisual_client_settings WHERE client_id = ?').get(b);
  assert.deepEqual({ ...kept }, { v: 5, c: 'month' }); // cadência continua salva
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?').get(b).n, 1); // histórico intacto
  assert.equal((await put(`/clients/${b}/recording`, { is_recording_client: true })).status, 200);
  assert.equal(flag(b), 1);
});

test('tirar funciona mesmo para cliente que nunca teve configuração', async () => {
  const c = mkClient(agencyId, 'Novo');
  assert.equal((await put(`/clients/${c}/recording`, { is_recording_client: false })).status, 200);
  assert.equal(flag(c), 0);
});

test('validações: corpo vazio, cliente de outra agência, sem permissão', async () => {
  assert.equal((await put(`/clients/${a}/recording`, {})).status, 400);
  assert.ok([403, 404].includes((await put(`/clients/${foreign}/recording`, { is_recording_client: false })).status));
  assert.notEqual(flag(foreign), 0);
  ALLOW = false;
  assert.equal((await put(`/clients/${a}/recording`, { is_recording_client: false })).status, 403);
  ALLOW = true; assert.equal(flag(a), 1);
});
