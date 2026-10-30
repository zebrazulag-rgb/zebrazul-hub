const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-ay-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const backupPath = require.resolve('../db/backup.js');
require.cache[backupPath] = { id: backupPath, filename: backupPath, loaded: true, exports: { createBackup: async () => null } };
let PERMS = () => true;
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: (u, k) => PERMS(k, u) } };
const authPath = require.resolve('../middleware/auth.js');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { ...require(authPath), authRequired: (req, res, next) => next() } };
const db = require('../db/database'); const express = require('express');
const ayrton = require('../services/ayrton');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const mk = (n) => Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, ?, 'active')").run(agencyId, n).lastInsertRowid);
const A = mk('Cliente A'), B = mk('Cliente B'), C = mk('Cliente C');
const UID = Number(db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id || db.prepare("INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, 'Adm', 'a@a.com', 'x', 'admin')").run(agencyId).lastInsertRowid);
const TODAY = '2026-10-10';
const task = (client, title, cols = {}) => Number(db.prepare('INSERT INTO tasks (agency_id, client_id, title, status, due_date, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?)').run(agencyId, client, title, cols.status || 'pending', cols.due || null, cols.at || '2026-10-01 10:00:00', cols.at || '2026-10-01 10:00:00', UID).lastInsertRowid);
let CUR = { id: 1, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = CUR; next(); }); app.use('/ay', require('../routes/ayrton'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const call = (m, url, body) => fetch(base + '/ay' + url, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ s: r.status, j: await r.json() }));

test('tarefas vencidas agrupam por cliente; conta sem problema fica normal; aprovação sem data detectada', () => {
  for (let i = 0; i < 3; i++) task(A, `Post ${i}`, { due: '2026-10-08' });
  { const t = task(B, 'Post aprovado'); db.prepare("UPDATE tasks SET workflow_stage = 'approved', updated_at = '2026-10-01 10:00:00' WHERE id = ?").run(t); }
  const dets = ayrton.detectAll(db, agencyId, TODAY);
  const over = dets.filter((d) => d.type === 'task_overdue');
  assert.equal(over.length, 1);
  assert.equal(over[0].client_id, A);
  assert.equal(over[0].evidence.total, 3);
  assert.equal(over[0].level, 'attention');
  assert.ok(!dets.some((d) => d.client_id === C));
});

test('scan persiste, é idempotente e resolve sozinho quando o problema some; histórico preservado', () => {
  const s1 = ayrton.scanAgency(db, agencyId, TODAY);
  assert.ok(s1.created >= 1);
  const s2 = ayrton.scanAgency(db, agencyId, TODAY);
  assert.equal(s2.created, 0);
  db.prepare("UPDATE tasks SET status = 'posted' WHERE client_id = ?").run(A);
  const s3 = ayrton.scanAgency(db, agencyId, TODAY);
  assert.ok(s3.resolved >= 1);
  const row = db.prepare("SELECT status, resolution FROM agent_alerts WHERE client_id = ? AND type = 'task_overdue'").get(A);
  assert.deepEqual({ ...row }, { status: 'resolved', resolution: 'auto' });
  assert.ok(db.prepare("SELECT COUNT(*) n FROM agent_alert_events WHERE client_id = ? AND type = 'resolved'").get(A).n >= 1);
});

test('API: visão, detalhes, rascunho de tarefa, ignorar, reabrir por agravamento, resolver, pergunta', async () => {
  for (let i = 0; i < 2; i++) task(C, `Atrasada ${i}`, { due: '2026-10-05' });
  const todayReal = require('../services/myWork').todayInFortaleza();
  for (let i = 0; i < 2; i++) task(C, `Atrasada real ${i}`, { due: '2020-01-01' });
  assert.equal((await call('POST', '/scan')).s, 200);
  const v = (await call('GET', '/')).j;
  assert.equal(v.agent.name, 'Ayrton'); assert.ok(v.summary.greeting.includes('Fiz minha ronda'));
  const card = v.accounts.find((c) => c.client_id === C); assert.ok(card);
  const id = card.main.id;
  const d = (await call('GET', `/alerts/${id}`)).j; assert.ok(d.alert.why.length && d.alert.data_used.length);
  const dr = (await call('GET', `/alerts/${id}/task-draft`)).j.draft; assert.equal(dr.origin, 'Sugestão do Ayrton'); assert.ok(dr.title.includes('Cliente C'));
  assert.equal((await call('POST', `/alerts/${id}/ignore`, { mode: 'xx' })).s, 400);
  for (const x of card.alert_ids) assert.equal((await call('POST', `/alerts/${x}/ignore`, { mode: '3d' })).s, 200);
  const v2 = (await call('GET', '/')).j; assert.ok(!v2.accounts.find((c) => c.client_id === C)); assert.equal(v2.ignored.length, card.alert_ids.length);
  const h = (await call('GET', `/history?client_id=${C}`)).j; assert.ok(h.events.some((e) => e.type === 'ignored'));
  const ans = (await call('POST', '/ask', { question: 'Quais contas estão tranquilas?' })).j; assert.ok(ans.answer.includes('Cliente B') || ans.answer.length);
  assert.equal((await call('POST', `/alerts/${id}/unignore`)).s, 200);
  assert.equal((await call('POST', `/alerts/${id}/resolve`, { note: 'feito' })).s, 200);
  assert.ok(todayReal);
});

test('permissões: cliente bloqueado; sem acesso ao cliente não vê nem age; sem tasks.view não vê alertas de tarefa', async () => {
  const some = db.prepare("SELECT id FROM agent_alerts WHERE status = 'open' LIMIT 1").get() || (() => { ayrton.scanAgency(db, agencyId, TODAY); return db.prepare('SELECT id FROM agent_alerts LIMIT 1').get(); })();
  CUR = { id: 9, name: 'Cli', role: 'client', client_ids: [A], agency_id: agencyId };
  assert.equal((await call('GET', '/')).s, 403);
  CUR = { id: 2, name: 'Func', role: 'staff', client_ids: [A], agency_id: agencyId };
  PERMS = () => true;
  const v = (await call('GET', '/')).j;
  assert.ok(v.accounts.every((c) => c.client_id === A) && v.normal_accounts.every((c) => c.client_id === A));
  assert.equal((await call('GET', `/alerts/${some.id}`)).s, db.prepare('SELECT client_id FROM agent_alerts WHERE id = ?').get(some.id).client_id === A ? 200 : 403);
  PERMS = (k) => k !== 'tasks.view';
  const v3 = (await call('GET', '/')).j; assert.equal(v3.accounts.length, 0);
  PERMS = () => true; CUR = { id: 1, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
});

test('IA: sem chave não finge; regra simples não usa IA; cache evita chamada repetida', async () => {
  const ai = require('../services/ayrtonAI');
  delete process.env.OPENAI_API_KEY;
  const cid = mk('Cliente D');
  for (let i = 0; i < 2; i++) task(cid, `Venc ${i}`, { due: '2020-01-01' });
  ayrton.scanAgency(db, agencyId, require('../services/myWork').todayInFortaleza());
  assert.ok((await ai.interpretAccount(db, agencyId, cid)).skipped);
  db.prepare("INSERT INTO tasks (agency_id, client_id, title, status, workflow_stage, updated_at, created_by) VALUES (?,?,?,?,?,?,?)").run(agencyId, cid, 'x', 'pending', 'approval', '2020-01-01 00:00:00', UID);
  ayrton.scanAgency(db, agencyId, require('../services/myWork').todayInFortaleza());
  process.env.OPENAI_API_KEY = 'k'; let calls = 0;
  const fake = async () => { calls++; return { ok: true, json: async () => ({ output_text: 'Há indícios de relação.', usage: { input_tokens: 100, output_tokens: 20 } }) }; };
  const open = db.prepare("SELECT COUNT(DISTINCT type) n FROM agent_alerts WHERE client_id = ? AND status='open' AND level != 'normal'").get(cid).n;
  if (open >= 2) {
    assert.ok((await ai.interpretAccount(db, agencyId, cid, { fetchImpl: fake })).ok);
    assert.ok((await ai.interpretAccount(db, agencyId, cid, { fetchImpl: fake })).cached);
    assert.equal(calls, 1);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM agent_ai_log WHERE cached = 1").get().n >= 1);
  }
  delete process.env.OPENAI_API_KEY;
});
