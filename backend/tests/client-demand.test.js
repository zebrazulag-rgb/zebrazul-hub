const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-demand-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id); CUR.agency_id = agencyId;
const cid = Number(db.prepare('INSERT INTO clients (agency_id, name) VALUES (?, ?)').run(agencyId, 'Cli').lastInsertRowid);
const app = express(); app.use(express.json()); app.use('/h', require('../routes/clientHealth'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/h`; });
test.after(() => server.close());
const put = (body) => fetch(`${base}/${cid}/demand`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('gestor define A/B/C, limpa e valida', async () => {
  assert.equal((await put({ demand_level: 'a' })).status, 200);
  assert.equal((await (await fetch(base)).json()).demand[cid], 'A');
  assert.equal((await put({ demand_level: 'Z' })).status, 400);
  assert.equal((await put({ demand_level: null })).status, 200);
  assert.equal((await (await fetch(base)).json()).demand[cid], undefined);
});
test('não-gestor não altera', async () => {
  CUR = { id: 2, role: 'user', agency_id: agencyId, client_ids: [cid], is_operations_head: 0 };
  assert.equal((await put({ demand_level: 'B' })).status, 403);
});
