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
db.exec('CREATE TABLE IF NOT EXISTS feed_highlights (id INTEGER PRIMARY KEY, agency_id INTEGER, client_id INTEGER, name TEXT, cover_data TEXT, cover_mime TEXT, sort_order INTEGER DEFAULT 0, visible INTEGER DEFAULT 1)');
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
app.use('/p', require('../routes/public'));
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

test('peça agendada/postada não volta para a área de aprovação (approval-grid)', async () => {
  db.prepare("UPDATE tasks SET direction_status = 'approved' WHERE id IN (?, ?)").run(sch, pst);
  const { status, body } = await call('GET', `/approval-grid?client_id=${cA}`);
  assert.equal(status, 200);
  const ids = body.items.map((i) => i.id);
  assert.ok(!ids.includes(sch) && !ids.includes(pst));
  assert.ok(ids.includes(ok));
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

test('peça criada direto na Aprovação (post em aprovação com imagem) aparece na grade da direção', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const created = await call('POST', '/', {
    task_type: 'post', title: 'Peça direta', caption: 'Legenda', content_type: 'feed', client_id: cA,
    workflow_stage: 'internal_approval', due_date: '2026-10-20',
    media_gallery: [{ data: PNG, mime: 'image/png', filename: 'a.png' }], attachment_data: PNG, attachment_mime: 'image/png', attachment_filename: 'a.png',
  });
  assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
  const id = created.body.task.id;
  const { body } = await call('GET', `/approval-grid?client_id=${cA}`);
  const item = body.items.find((i) => i.id === id);
  assert.ok(item, 'peça deve aparecer na grade');
  assert.equal(item.workflow_stage, 'approval');
  assert.equal(item.direction_status, 'pending');
  assert.equal(item.image_count, 1);
});

test('excluir peça pela Aprovação: apaga a peça e o post ligado; bloqueia se tiver subtarefas', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const postId = Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, status) VALUES (?, ?, ?, 'p', 'draft')").run(agencyId, cA, uid).lastInsertRowid);
  const solo = mk('Para excluir');
  db.prepare('UPDATE tasks SET feed_post_id = ? WHERE id = ?').run(postId, solo);
  const r = await call('DELETE', `/${solo}?piece=1`);
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE id = ?').get(solo).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM posts WHERE id = ?').get(postId).n, 0);

  const parent = mk('Pai');
  const child = mk('Filho');
  db.prepare('UPDATE tasks SET parent_task_id = ? WHERE id = ?').run(parent, child);
  const blocked = await call('DELETE', `/${parent}?piece=1`);
  assert.equal(blocked.status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE id IN (?, ?)').get(parent, child).n, 2);
});

test('posts antigos do feed (sem tarefa) aparecem na grade interna só do cliente escolhido', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const mkPost = (title, status, client = cA) => Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, status, scheduled_at, media_data, media_mime) VALUES (?, ?, ?, ?, ?, '2026-09-10T12:00:00', ?, 'image/png')").run(agencyId, client, uid, title, status, PNG).lastInsertRowid);
  const antigo = mkPost('Post antigo', 'approved');
  const outroCliente = mkPost('De outro cliente', 'approved', cB);
  const ligado = mkPost('Ligado a tarefa', 'approved');
  db.prepare('UPDATE tasks SET feed_post_id = ? WHERE id = ?').run(ligado, ok);
  const { body } = await call('GET', `/approval-grid?client_id=${cA}`);
  const legacy = body.items.filter((i) => i.legacy_post);
  assert.ok(legacy.some((i) => i.post_id === antigo && i.client_status === 'approved' && i.image_count === 1));
  assert.ok(!legacy.some((i) => i.post_id === outroCliente || i.post_id === ligado));
  const semFiltro = await call('GET', '/approval-grid');
  assert.ok(!semFiltro.body.items.some((i) => i.legacy_post));
});

test('ordem manual da grade: salva, volta em grid_position e valida entrada', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const a = mk('Ordem A'); const b = mk('Ordem B');
  const r = await call('PUT', '/approval-grid/order', { client_id: cA, keys: [`task:${b}`, `task:${a}`] });
  assert.equal(r.status, 200);
  const { body } = await call('GET', `/approval-grid?client_id=${cA}`);
  const pa = body.items.find((i) => i.id === a).grid_position;
  const pb = body.items.find((i) => i.id === b).grid_position;
  assert.equal(pb, 0); assert.equal(pa, 1);
  assert.equal((await call('PUT', '/approval-grid/order', { client_id: cA, keys: ['x'] })).status, 400);
  CUR = { id: 7, role: 'team', agency_id: agencyId, client_ids: [cB], is_operations_head: 0 };
  assert.equal((await call('PUT', '/approval-grid/order', { client_id: cA, keys: [`task:${a}`] })).status, 403);
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
});

test('aba Cliente espelha o link: in_client_view, posts rejeitados/rascunho com data e ordem manual no link público', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const cC = Number(db.prepare("INSERT INTO clients (agency_id, name, status, feed_share_token) VALUES (?, 'C', 'active', 'tok-espelho')").run(agencyId).lastInsertRowid);
  const mkPost = (title, status, scheduled = '2026-09-10T12:00:00', extra = '') => Number(db.prepare(`INSERT INTO posts (agency_id, client_id, created_by, title, status, scheduled_at, media_data, media_mime, feed_visible${extra ? ', is_pinned' : ''}) VALUES (?, ?, ?, ?, ?, ?, ?, 'image/png', 1${extra ? ', 1' : ''})`).run(agencyId, cC, uid, title, status, scheduled, PNG).lastInsertRowid);
  const pApproved = mkPost('Aprovado', 'approved');
  const pDraft = mkPost('Rascunho com data', 'draft');
  const pDraftSemData = Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, status, media_data, media_mime, feed_visible) VALUES (?, ?, ?, 'Rascunho sem data', 'draft', ?, 'image/png', 1)").run(agencyId, cC, uid, PNG).lastInsertRowid);
  // tarefa postada, mas ainda no link do cliente
  const tPosted = Number(db.prepare("INSERT INTO tasks (agency_id, client_id, created_by, task_type, title, status, workflow_stage, approval_status, client_status, direction_status, attachment_data, attachment_mime) VALUES (?, ?, ?, 'post', 'Tarefa postada', 'posted', 'posted', 'approved', 'approved', 'approved', ?, 'image/png')").run(agencyId, cC, uid, PNG).lastInsertRowid);
  const pLinked = mkPost('Post da tarefa', 'approved');
  db.prepare('UPDATE tasks SET feed_post_id = ? WHERE id = ?').run(pLinked, tPosted);
  // tarefa em aprovação interna (não está no link)
  const tInterna = mk('Interna', { client: cC, stage: 'approval', approval: 'completed', cs: 'waiting' });

  const grid = (await call('GET', `/approval-grid?client_id=${cC}`)).body.items;
  const inView = grid.filter((i) => i.in_client_view).map((i) => (i.legacy_post ? `post:${i.post_id}` : `task:${i.id}`)).sort();
  assert.deepEqual(inView, [`post:${pApproved}`, `post:${pDraft}`, `task:${tPosted}`].sort());
  assert.ok(!grid.find((i) => i.id === tInterna).in_client_view);
  assert.ok(!inView.includes(`post:${pDraftSemData}`));

  // o link público devolve exatamente os mesmos posts (por id) e a ordem manual
  await call('PUT', '/approval-grid/order', { client_id: cC, keys: [`post:${pDraft}`, `task:${tPosted}`, `post:${pApproved}`] });
  const pub = await fetch(`${base.replace(/\/t$/, '')}/p/feed/tok-espelho`);
  assert.equal(pub.status, 200);
  const data = await pub.json();
  assert.deepEqual(data.posts.map((p) => p.id).sort((x, y) => x - y), [pApproved, pDraft, pLinked].sort((x, y) => x - y));
  const pos = Object.fromEntries(data.posts.map((p) => [p.id, p.grid_position]));
  assert.equal(pos[pDraft], 0); assert.equal(pos[pLinked], 1); assert.equal(pos[pApproved], 2);
});

test('corrigir data de postagem: tarefa (sincroniza o post ligado) e post antigo; valida data e acesso', async () => {
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
  const t = mk('Data tarefa');
  const postId = Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, status, scheduled_at) VALUES (?, ?, ?, 'p', 'approved', '2026-09-10T14:30:00')").run(agencyId, cA, uid).lastInsertRowid);
  db.prepare('UPDATE tasks SET feed_post_id = ? WHERE id = ?').run(postId, t);
  let r = await call('PUT', `/${t}/date`, { date: '2026-10-20' });
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT due_date FROM tasks WHERE id = ?').get(t).due_date, '2026-10-20');
  assert.equal(db.prepare('SELECT scheduled_at FROM posts WHERE id = ?').get(postId).scheduled_at, '2026-10-20T14:30:00');

  const legacy = Number(db.prepare("INSERT INTO posts (agency_id, client_id, created_by, title, status, scheduled_at) VALUES (?, ?, ?, 'l', 'approved', '2026-09-01T12:00:00')").run(agencyId, cA, uid).lastInsertRowid);
  r = await call('PUT', `/posts/${legacy}/date`, { date: '2026-11-02' });
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT scheduled_at FROM posts WHERE id = ?').get(legacy).scheduled_at, '2026-11-02T12:00:00');

  assert.equal((await call('PUT', `/${t}/date`, { date: '31/12/2026' })).status, 400);
  assert.equal((await call('PUT', `/${t}/date`, { date: '2026-02-31' })).status, 400);
  CUR = { id: 7, role: 'team', agency_id: agencyId, client_ids: [cB], is_operations_head: 0 };
  assert.equal((await call('PUT', `/${t}/date`, { date: '2026-10-21' })).status, 403);
  CUR = { id: 1, role: 'admin', agency_id: agencyId, client_ids: [] };
});
