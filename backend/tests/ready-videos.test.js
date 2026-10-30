const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-rv-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
process.env.MEDIA_STORAGE_DIR = path.join(tmpDir, 'media');
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = { id: 1, name: 'Adm', role: 'admin', client_ids: [] };
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
let PERMS = () => true;
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: (u, k) => PERMS(k) } };
const db = require('../db/database'); const express = require('express');
const media = require('../services/mediaStorage');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id); CUR.agency_id = agencyId;
db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (1, ?, 'Adm', 'adm@t.com', 'x', 'admin')").run(agencyId);
const client = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'Altus', 'active')").run(agencyId).lastInsertRowid);
const rv = require('../routes/readyVideos');
const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = CUR; next(); }); app.use('/rv', rv); app.use('/cv', rv.client); app.use('/api/media', require('../routes/media'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const send = (body, file) => { const f = new FormData(); for (const [k, v] of Object.entries(body)) f.append(k, v); if (file) f.append('file', new Blob([file], { type: 'video/mp4' }), 'v.mp4'); return fetch(`${base}/rv`, { method: 'POST', body: f }); };
const post = (url, body = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const n = (sql, ...a) => db.prepare(sql).get(...a).n;
let fileId, linkId, fileUrl;

test('envia arquivo e link; exige vídeo ou link e título', async () => {
  assert.equal((await send({ client_id: client, title: '' }, Buffer.from('abc'))).status, 400);
  assert.equal((await send({ client_id: client, title: 'Sem nada' })).status, 400);
  const a = await (await send({ client_id: client, title: 'Reel 1' }, Buffer.alloc(2048, 1))).json();
  fileId = a.video.id; fileUrl = a.video.media_url;
  assert.match(fileUrl, /^\/api\/media\/[a-f0-9]{32}\.mp4$/);
  const b = await (await send({ client_id: client, title: 'Reel 2', link_url: 'https://drive.google.com/file/d/abc/view' })).json();
  linkId = b.video.id; assert.equal(b.video.source, 'link');
  const list = await (await fetch(`${base}/rv`)).json();
  assert.equal(list.counts.direction, 2); assert.equal(list.counts.ready, 0);
});

test('arquivo é servido e pode ser baixado', async () => {
  const r = await fetch(base + fileUrl + '?download=Reel%201.mp4');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment; filename="Reel 1.mp4"/);
});


const ADMIN = () => ({ id: 1, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId });
const CLIENT = () => ({ id: 77, name: 'Cliente Altus', role: 'client', client_id: client, client_ids: [client], agency_id: agencyId });
const stageOf = async (id) => (await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === id).stage;

test('fluxo: direção -> cliente -> aprovado; só então pode agendar', async () => {
  const created = await (await send({ client_id: client, title: 'Fluxo' }, Buffer.alloc(300, 3))).json();
  const flowId = created.video.id; const flowUrl = created.video.media_url;
  assert.equal(await stageOf(flowId), 'direction');
  assert.equal((await post(`/rv/${flowId}/schedule`)).status, 409); // ainda não aprovado
  // cliente não vê nem aprova antes da direção
  CUR = CLIENT();
  assert.equal((await (await fetch(`${base}/cv`)).json()).videos.length, 0);
  assert.equal((await post(`/cv/${flowId}/approve`)).status, 409);
  assert.equal((await fetch(`${base}/rv`)).status, 403);
  // direção pede correção sem nota -> 400; só direção aprova
  CUR = ADMIN(); CUR.role = 'team'; CUR.is_operations_head = 0;
  assert.equal((await post(`/rv/${flowId}/direction-approve`)).status, 403);
  CUR = ADMIN();
  assert.equal((await post(`/rv/${flowId}/direction-correction`, {})).status, 400);
  assert.equal((await post(`/rv/${flowId}/direction-correction`, { note: 'Cortar o início' })).status, 200);
  assert.equal(await stageOf(flowId), 'correction');
  // audiovisual reenvia com novo link e volta para a direção
  const fd = new FormData(); fd.append('link_url', 'https://drive.google.com/file/d/novo/view');
  assert.equal((await fetch(`${base}/rv/${flowId}/resubmit`, { method: 'POST', body: fd })).status, 200);
  assert.equal(await stageOf(flowId), 'direction');
  assert.equal(media.locateMediaFile(path.basename(flowUrl)), null); // arquivo antigo trocado e apagado
  assert.equal((await post(`/rv/${flowId}/direction-approve`)).status, 200);
  assert.equal(await stageOf(flowId), 'client');
  // cliente: pede ajuste, depois aprova
  CUR = CLIENT();
  assert.equal((await (await fetch(`${base}/cv`)).json()).videos.length, 1);
  assert.equal((await post(`/cv/${flowId}/request-changes`, {})).status, 400);
  assert.equal((await post(`/cv/${flowId}/request-changes`, { note: 'Trocar música' })).status, 200);
  CUR = ADMIN();
  assert.equal(await stageOf(flowId), 'correction');
  const fd2 = new FormData(); fd2.append('link_url', 'https://drive.google.com/file/d/v3/view');
  await fetch(`${base}/rv/${flowId}/resubmit`, { method: 'POST', body: fd2 });
  await post(`/rv/${flowId}/direction-approve`);
  CUR = CLIENT();
  assert.equal((await post(`/cv/${flowId}/approve`)).status, 200);
  CUR = ADMIN();
  assert.equal(await stageOf(flowId), 'approved');
  // outro cliente não acessa
  CUR = { ...CLIENT(), client_id: 9999 };
  assert.equal((await post(`/cv/${flowId}/approve`)).status, 404);
  CUR = ADMIN();
});

test('aprova o vídeo de arquivo para os próximos testes', () => {
  db.prepare("UPDATE ready_videos SET stage = 'approved' WHERE id = ?").run(fileId);
});

test('sem permissão de publicar não marca como agendado', async () => {
  PERMS = (k) => k === 'audiovisual.view';
  assert.equal((await post(`/rv/${fileId}/schedule`)).status, 403);
  PERMS = () => true;
});

test('marcar como agendado define prazo; arquivo continua até vencer', async () => {
  assert.equal((await post(`/rv/${fileId}/schedule`, { platform: 'instagram', scheduled_for: '2026-11-02' })).status, 200);
  assert.equal((await post(`/rv/${fileId}/schedule`)).status, 409);
  const v = (await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === fileId);
  assert.equal(v.status, 'scheduled'); assert.equal(v.days_until_purge, 3);
  assert.equal(rv.purgeExpired(), 0);
  assert.ok(media.locateMediaFile(path.basename(fileUrl)));
  // desfazer enquanto o arquivo existe
  assert.equal((await post(`/rv/${fileId}/unschedule`)).status, 200);
  assert.equal((await post(`/rv/${fileId}/schedule`, { platform: 'tiktok' })).status, 200);
});

test('depois do prazo apaga o arquivo e mantém o registro', async () => {
  db.prepare("UPDATE ready_videos SET purge_after = datetime('now','-1 minute') WHERE id = ?").run(fileId);
  assert.equal(rv.purgeExpired(), 1);
  assert.equal(media.locateMediaFile(path.basename(fileUrl)), null);
  const v = (await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === fileId);
  assert.equal(v.media_url, null); assert.ok(v.file_deleted_at); assert.equal(v.scheduled_platform, 'tiktok');
  assert.equal((await post(`/rv/${fileId}/unschedule`)).status, 409);
  assert.equal(rv.purgeExpired(), 0);
});

test('vídeo por link agendado não tem prazo nem apaga nada', async () => {
  db.prepare("UPDATE ready_videos SET stage = 'approved' WHERE id = ?").run(linkId);
  await post(`/rv/${linkId}/schedule`, { platform: 'instagram' });
  const v = (await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === linkId);
  assert.equal(v.days_until_purge, null); assert.equal(rv.purgeExpired(), 0);
});

test('apagar remove registro e arquivo; 404 em outra agência', async () => {
  const a = await (await send({ client_id: client, title: 'Temp' }, Buffer.alloc(100, 2))).json();
  const f = path.basename(a.video.media_url);
  assert.equal((await fetch(`${base}/rv/${a.video.id}`, { method: 'DELETE' })).status, 200);
  assert.equal(media.locateMediaFile(f), null);
  assert.equal(n('SELECT COUNT(*) n FROM ready_videos WHERE id = ?', a.video.id), 0);
  assert.equal((await fetch(`${base}/rv/99999`, { method: 'DELETE' })).status, 404);
});

test('edita título e legenda; título vazio é recusado', async () => {
  const put = (id, body) => fetch(`${base}/rv/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put(linkId, { title: '  Novo título  ', caption: 'Legenda #teste' })).status, 200);
  const v = (await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === linkId);
  assert.equal(v.title, 'Novo título'); assert.equal(v.caption, 'Legenda #teste');
  assert.equal((await put(linkId, { title: '   ' })).status, 400);
  assert.equal((await put(linkId, { caption: 'só legenda' })).status, 200);
  assert.equal((await (await fetch(`${base}/rv`)).json()).videos.find((x) => x.id === linkId).title, 'Novo título');
  PERMS = (k) => k === 'audiovisual.view';
  assert.equal((await put(linkId, { title: 'x' })).status, 403);
  PERMS = () => true;
});
