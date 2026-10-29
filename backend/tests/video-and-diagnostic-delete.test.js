const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-vdd-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: () => true } };
let backups = 0; let backupFails = false;
const bkPath = require.resolve('../db/backup.js');
require.cache[bkPath] = { id: bkPath, filename: bkPath, loaded: true, exports: { ...require(bkPath), createBackup: async () => { if (backupFails) throw new Error('disco cheio'); backups += 1; return 'x'; } } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id); CUR.agency_id = agencyId;
db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (1, ?, 'Adm', 'adm@t.com', 'x', 'admin')").run(agencyId);
const client = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'Altus', 'active')").run(agencyId).lastInsertRowid);
const rec = Number(db.prepare("INSERT INTO audiovisual_recordings (agency_id, client_id, created_by, title, scheduled_start, status) VALUES (?, ?, 1, 'G', '2026-10-13T14:00:00', 'recorded')").run(agencyId, client).lastInsertRowid);
const vid = (n, status) => Number(db.prepare("INSERT INTO audiovisual_videos (agency_id, client_id, recording_id, video_number, title, status) VALUES (?, ?, ?, ?, 'V', ?)").run(agencyId, client, rec, n, status).lastInsertRowid);
const vDraft = vid(1, 'dated'); const vPosted = vid(2, 'posted'); const vKeep = vid(3, 'edited');
const post = (st) => Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, content_type, status) VALUES (?, ?, 1, 'P', 'feed', ?)").run(agencyId, client, st).lastInsertRowid);
const pPending = post('approved'); const pPublished = post('published');
db.prepare("INSERT INTO audiovisual_video_schedules (agency_id, video_id, feed_post_id, scheduled_at, status) VALUES (?, ?, ?, '2026-10-20T10:00', 'dated')").run(agencyId, vDraft, pPending);
db.prepare("INSERT INTO audiovisual_video_schedules (agency_id, video_id, feed_post_id, scheduled_at, status) VALUES (?, ?, ?, '2026-10-20T10:00', 'posted')").run(agencyId, vPosted, pPublished);
const diag = (status) => Number(db.prepare("INSERT INTO presence_diagnostics (agency_id, client_id, status, answers_json, result_json) VALUES (?, ?, ?, '{\"a\":1}', '{}')").run(agencyId, client, status).lastInsertRowid);
const dDone = diag('submitted'); const dOther = diag('draft');
const app = express(); app.use(express.json());
app.use('/a', require('../routes/audiovisual')); app.use('/d', require('../routes/presenceDiagnostics'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const del = (url, body) => fetch(base + url, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const n = (sql, ...a) => db.prepare(sql).get(...a).n;

test('apaga vídeo não postado e remove o post pendente do feed', async () => {
  assert.equal((await del(`/a/videos/${vDraft}`)).status, 200);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE id = ?', vDraft), 0);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_video_schedules WHERE video_id = ?', vDraft), 0);
  assert.equal(n('SELECT COUNT(*) n FROM posts WHERE id = ?', pPending), 0);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE id = ?', vKeep), 1);
});

test('vídeo postado pede confirmação e preserva post publicado', async () => {
  assert.equal((await del(`/a/videos/${vPosted}`)).status, 409);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE id = ?', vPosted), 1);
  assert.equal((await del(`/a/videos/${vPosted}`, { confirm: true })).status, 200);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE id = ?', vPosted), 0);
  assert.equal(n('SELECT COUNT(*) n FROM posts WHERE id = ?', pPublished), 1);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE id = ?', rec), 1);
});

test('vídeo inexistente dá 404', async () => {
  assert.equal((await del('/a/videos/99999')).status, 404);
});

test('diagnóstico: exige confirmação, equipe e backup; apaga o concluído', async () => {
  assert.equal((await del(`/d/${dDone}/permanent`)).status, 400);
  CUR = { ...CUR, role: 'client', client_id: client };
  assert.equal((await del(`/d/${dDone}/permanent`, { confirm: true })).status, 403);
  CUR = { id: 1, role: 'admin', client_ids: [], agency_id: agencyId };
  backupFails = true;
  assert.equal((await del(`/d/${dDone}/permanent`, { confirm: true })).status, 500);
  backupFails = false;
  assert.equal(n('SELECT COUNT(*) n FROM presence_diagnostics WHERE id = ?', dDone), 1);
  assert.equal((await del(`/d/${dDone}/permanent`, { confirm: true })).status, 200);
  assert.equal(backups, 1);
  assert.equal(n('SELECT COUNT(*) n FROM presence_diagnostics WHERE id = ?', dDone), 0);
  assert.equal(n('SELECT COUNT(*) n FROM presence_diagnostics WHERE id = ?', dOther), 1);
});
