const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-avp-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: () => true } };
// dublês: backup e Google Agenda
const events = []; let backups = 0; let backupFails = false;
const gcPath = require.resolve('../services/googleCalendar.js');
require.cache[gcPath] = { id: gcPath, filename: gcPath, loaded: true, exports: { ...require(gcPath), deleteRecordingEvent: async ({ recording }) => { events.push(recording.id); } } };
const bkPath = require.resolve('../db/backup.js');
require.cache[bkPath] = { id: bkPath, filename: bkPath, loaded: true, exports: { ...require(bkPath), createBackup: async () => { if (backupFails) throw new Error('disco cheio'); backups += 1; return 'x'; } } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id); CUR.agency_id = agencyId;
db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (1, ?, 'Adm', 'adm@t.com', 'x', 'admin')").run(agencyId);
const mkClient = (name) => Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, ?, 'active')").run(agencyId, name).lastInsertRowid);
const out = mkClient('Fora'); const keep = mkClient('Grava');
const rec = (client, status, ev = null) => Number(db.prepare("INSERT INTO audiovisual_recordings (agency_id, client_id, created_by, title, scheduled_start, status, google_event_id) VALUES (?, ?, 1, 'G', '2026-10-13T14:00:00', ?, ?)").run(agencyId, client, status, ev).lastInsertRowid);
const vid = (client, recording, n, status) => Number(db.prepare("INSERT INTO audiovisual_videos (agency_id, client_id, recording_id, video_number, title, status) VALUES (?, ?, ?, ?, 'V', ?)").run(agencyId, client, recording, n, status).lastInsertRowid);
const r1 = rec(out, 'recorded'); const r2 = rec(out, 'scheduled', 'ev-2'); const r3 = rec(keep, 'recorded');
const v1 = vid(out, r1, 1, 'posted'); vid(out, r1, 2, 'edited'); vid(keep, r3, 1, 'recorded');
const postId = Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, content_type, status) VALUES (?, ?, 1, 'Post do feed', 'feed', 'approved')").run(agencyId, out).lastInsertRowid);
db.prepare("INSERT INTO audiovisual_video_schedules (agency_id, video_id, feed_post_id, scheduled_at, status) VALUES (?, ?, ?, '2026-10-20T10:00', 'posted')").run(agencyId, v1, postId);
db.prepare("INSERT INTO audiovisual_scripts (agency_id, client_id, recording_id, title) VALUES (?, ?, ?, 'Roteiro')").run(agencyId, out, r1);
db.prepare("INSERT INTO audiovisual_client_settings (agency_id, client_id, is_recording_client, videos_per_period) VALUES (?, ?, 0, 7)").run(agencyId, out);
db.prepare("INSERT INTO audiovisual_client_settings (agency_id, client_id, is_recording_client) VALUES (?, ?, 1)").run(agencyId, keep);
const app = express(); app.use(express.json()); app.use('/a', require('../routes/audiovisual'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/a`; });
test.after(() => server.close());
const purge = (id, body = { confirm: true }) => fetch(`${base}/clients/${id}/recording-history`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const n = (sql, ...a) => db.prepare(sql).get(...a).n;

test('catálogo informa o tamanho do histórico de cada cliente', async () => {
  const { clients } = await (await fetch(`${base}/client-selection`)).json();
  const row = clients.find((c) => c.id === out);
  assert.equal(row.history_recordings, 2); assert.equal(row.history_videos, 2); assert.equal(row.history_posted_videos, 1); assert.equal(row.history_scheduled, 1);
});

test('recusa sem confirmação e recusa cliente que ainda grava', async () => {
  assert.equal((await purge(out, {})).status, 400);
  assert.equal((await purge(keep)).status, 409);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?', out), 2);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?', keep), 1);
});

test('se o backup falhar, nada é apagado', async () => {
  backupFails = true;
  const r = await purge(out); assert.equal(r.status, 500);
  backupFails = false;
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?', out), 2);
  assert.equal(events.length, 0);
});

test('apaga o histórico só do cliente fora, com backup, sem tocar em posts nem configuração', async () => {
  const body = await (await purge(out)).json();
  assert.deepEqual(body.deleted, { recordings: 2, videos: 2, posted_videos: 1 });
  assert.equal(backups, 1);
  assert.deepEqual(events, [r2]); // só a gravação ainda marcada tinha evento ativo
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?', out), 0);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE client_id = ?', out), 0);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_scripts WHERE recording_id = ?', r1), 0);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_video_schedules WHERE video_id = ?', v1), 0);
  assert.equal(n('SELECT COUNT(*) n FROM posts WHERE id = ?', postId), 1); // post do feed continua
  assert.equal(n('SELECT videos_per_period n FROM audiovisual_client_settings WHERE client_id = ?', out), 7);
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_recordings WHERE client_id = ?', keep), 1); // outro cliente intacto
  assert.equal(n('SELECT COUNT(*) n FROM audiovisual_videos WHERE client_id = ?', keep), 1);
});

test('sem histórico: responde ok sem criar backup à toa', async () => {
  const before = backups;
  const body = await (await purge(out)).json();
  assert.equal(body.ok, true); assert.equal(body.backup, false); assert.equal(backups, before);
});
