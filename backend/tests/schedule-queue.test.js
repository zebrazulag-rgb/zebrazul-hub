// Fila de agendamento da Social Media: só peças aprovadas pelo cliente; marcar agendado/postado.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-sched-test-'));
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
const cA = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'A', 'active')").run(agencyId).lastInsertRowid);
const cB = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'B', 'active')").run(agencyId).lastInsertRowid);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function mk(title, o = {}) {
  return Number(db.prepare(`
    INSERT INTO tasks (agency_id, client_id, created_by, task_type, title, caption, status, workflow_stage, approval_status, client_status, is_backlog,
                       attachment_data, attachment_mime, due_date)
    VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, 'image/png', '2026-10-12')
  `).run(agencyId, o.client || cA, uid, o.type || 'post', title, o.caption ?? 'Legenda #teste', o.stage || 'approved',
    o.approval || 'approved', o.cs || 'approved', o.backlog || 0, PNG).lastInsertRowid);
}

const ok = mk('Pronta');
const sch = mk('Já agendada', { stage: 'scheduled' });
const pst = mk('Já postada', { stage: 'posted' });
const naoAprov = mk('Aguardando cliente', { stage: 'approval', approval: 'pending_approval', cs: 'pending' });
const bk = mk('No backlog', { backlog: 1 });
const video = mk('Vídeo', { type: 'video' });
const outro = mk('Outro cliente', { client: cB });

const app = express();
app.use(express.json());
app.use('/t', require('../routes/tasks'));
let server; let base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/t`; });
test.after(() => server.close());
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

test('fila traz só peças aprovadas pelo cliente (sem backlog, vídeo ou não aprovadas)', async () => {
  const { body } = await call('GET', `/schedule-queue?client_id=${cA}`);
  const ids = body.items.map((i) => i.id);
  assert.deepEqual(ids.sort(), [ok, sch, pst].sort());
  assert.ok(![naoAprov, bk, video, outro].some((id) => ids.includes(id)));
  assert.deepEqual(body.counts, { approved: 1, scheduled: 1, posted: 1 });
});

test('peça pronta traz legenda e imagem para copiar/baixar; postada não carrega imagem', async () => {
  const { body } = await call('GET', `/schedule-queue?client_id=${cA}`);
  const item = body.items.find((i) => i.id === ok);
  assert.equal(item.caption, 'Legenda #teste');
  assert.equal(item.image_count, 1);
  assert.equal(body.items.find((i) => i.id === pst).image_count, 0);
});

test('sem filtro de cliente, admin vê todos os clientes', async () => {
  const { body } = await call('GET', '/schedule-queue');
  assert.ok(body.items.some((i) => i.id === outro));
});

test('marcar como postado e desfazer', async () => {
  let r = await call('POST', `/${ok}/schedule-status`, { stage: 'posted' });
  assert.equal(r.status, 200);
  let row = db.prepare('SELECT status, workflow_stage, posted_at, posted_by FROM tasks WHERE id = ?').get(ok);
  assert.equal(row.status, 'posted'); assert.equal(row.workflow_stage, 'posted'); assert.ok(row.posted_at); assert.equal(row.posted_by, 1);
  r = await call('POST', `/${ok}/schedule-status`, { stage: 'approved' });
  row = db.prepare('SELECT status, workflow_stage, posted_at FROM tasks WHERE id = ?').get(ok);
  assert.equal(row.workflow_stage, 'approved'); assert.equal(row.status, 'done'); assert.equal(row.posted_at, null);
});

test('não deixa agendar/postar peça que o cliente não aprovou', async () => {
  const r = await call('POST', `/${naoAprov}/schedule-status`, { stage: 'posted' });
  assert.equal(r.status, 400);
  assert.equal((await call('POST', `/${ok}/schedule-status`, { stage: 'todo' })).status, 400);
});

test('cliente (login de cliente) não acessa; equipe só vê clientes com acesso', async () => {
  CUR = { ...CUR, role: 'client', client_id: cA };
  assert.equal((await call('GET', '/schedule-queue')).status, 403);
  CUR = { id: 7, role: 'team', agency_id: agencyId, client_ids: [cB], is_operations_head: 0 };
  const { body } = await call('GET', '/schedule-queue');
  assert.deepEqual(body.items.map((i) => i.id), [outro]);
  assert.equal((await call('GET', `/schedule-queue?client_id=${cA}`)).status, 403);
  assert.equal((await call('POST', `/${ok}/schedule-status`, { stage: 'posted' })).status, 403);
});
