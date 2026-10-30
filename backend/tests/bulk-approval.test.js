const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-ba-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false'; process.env.MEDIA_STORAGE_DIR = path.join(tmpDir, 'media');
const backupPath = require.resolve('../db/backup.js');
require.cache[backupPath] = { id: backupPath, filename: backupPath, loaded: true, exports: { createBackup: async () => null } };
const authPath = require.resolve('../middleware/auth.js');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { ...require(authPath), authRequired: (q, r, n) => n(), requireRole: () => (q, r, n) => n() } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const client = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'Altus', 'active')").run(agencyId).lastInsertRowid);
const uid = Number(db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id || db.prepare("INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, 'Adm', 'a@a.com', 'x', 'admin')").run(agencyId).lastInsertRowid);
let CUR = { id: uid, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
const app = express(); app.use(express.json({ limit: '5mb' })); app.use((q, r, n) => { q.user = CUR; n(); }); app.use('/t', require('../routes/tasks'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const post = async (u) => { const r = await fetch(base + '/t' + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"decision":"approved"}' }); return { s: r.status, j: await r.json() }; };
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const mk = () => Number(db.prepare("INSERT INTO tasks (agency_id, client_id, created_by, title, status, workflow_stage, attachment_data, attachment_mime) VALUES (?,?,?,?,?,?,?,?)").run(agencyId, client, uid, 'Peça', 'pending', 'approval', IMG, 'image/png').lastInsertRowid);

test('aprovação do cliente pela direção: exige liberação, funciona depois do envio, bloqueia não-admin', async () => {
  const id = mk();
  assert.equal((await post(`/${id}/client-approval`)).s, 409); // direção ainda não aprovou
  assert.equal((await post(`/${id}/direction-approval`)).s, 200);
  assert.equal((await post(`/${id}/client-approval`)).s, 409); // aprovada mas retida
  assert.equal((await post(`/${id}/send-to-client`)).s, 200);
  const ok = await post(`/${id}/client-approval`);
  assert.equal(ok.s, 200); assert.equal(ok.j.state.client_status, 'approved');
  const row = db.prepare('SELECT client_status, approval_status FROM tasks WHERE id = ?').get(id);
  assert.equal(row.client_status, 'approved'); assert.equal(row.approval_status, 'approved');
  CUR = { id: 99, name: 'Func', role: 'team', client_ids: [client], agency_id: agencyId };
  assert.equal((await post(`/${mk()}/client-approval`)).s, 403);
  CUR = { id: uid, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
});
