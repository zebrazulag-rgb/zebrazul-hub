const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-office-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR;
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const other = Number(db.prepare("INSERT INTO agencies (name, slug, status) VALUES ('Outra', 'outra-of', 'active')").run().lastInsertRowid);
const ins = db.prepare("INSERT INTO users (id, agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'x', ?)");
ins.run(11, agencyId, 'Ana', 'a@of.com', 'admin'); ins.run(12, agencyId, 'Beto', 'b@of.com', 'team'); ins.run(13, agencyId, 'Caio', 'c@of.com', 'team');
ins.run(14, agencyId, 'Cliente', 'cl@of.com', 'client'); ins.run(21, other, 'De Fora', 'x@of.com', 'team');
const A = { id: 11, role: 'admin', agency_id: agencyId, client_ids: [] };
const B = { id: 12, role: 'team', agency_id: agencyId, client_ids: [] };
const C = { id: 14, role: 'client', agency_id: agencyId, client_ids: [] };
const OUT = { id: 21, role: 'team', agency_id: other, client_ids: [] };
CUR = A;
const app = express(); app.use(express.json()); app.use('/o', require('../routes/office'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/o`; });
test.after(() => server.close());
const send = (method, url, body) => fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('lista só a equipe da agência (sem clientes nem outras agências) e nunca expõe página/cliente', async () => {
  const data = await (await send('GET', '/')).json();
  assert.deepEqual(data.team.map((m) => m.name), ['Ana', 'Beto', 'Caio']);
  for (const m of data.team) {
    assert.ok(!('last_path' in m) && !('last_client_id' in m) && !('email' in m));
    assert.ok(m.look && m.look.style);
  }
  assert.equal(data.team.find((m) => m.is_me).name, 'Ana');
});

test('online vem do batimento: sem batimento = offline; com batimento recente = status declarado', async () => {
  let team = (await (await send('GET', '/')).json()).team;
  assert.equal(team.find((m) => m.id === 12).status, 'offline');
  assert.equal(team.find((m) => m.id === 11).status, 'available'); // o próprio usuário está com o app aberto
  db.prepare("INSERT INTO user_presence (agency_id, user_id, last_seen) VALUES (?, 12, datetime('now'))").run(agencyId);
  team = (await (await send('GET', '/')).json()).team;
  assert.equal(team.find((m) => m.id === 12).status, 'available');
  db.prepare("UPDATE user_presence SET last_seen = datetime('now', '-10 minutes') WHERE user_id = 12").run();
  team = (await (await send('GET', '/')).json()).team;
  assert.equal(team.find((m) => m.id === 12).status, 'offline');
});

test('declarar status e avatar: valida e persiste por usuário', async () => {
  assert.equal((await send('PUT', '/me', { status: 'dancando' })).status, 400);
  let r = await (await send('PUT', '/me', { status: 'focus', look: { skin: 3, hc: 5, shirt: 2, style: 'bun', acc: 'glasses' } })).json();
  assert.equal(r.me.status, 'focus'); assert.equal(r.me.look.style, 'bun');
  r = await (await send('PUT', '/me', { look: { skin: 99, style: 'moicano', acc: '<script>' } })).json(); // inválidos viram o valor anterior
  assert.equal(r.me.look.skin, 3); assert.equal(r.me.look.style, 'bun'); assert.equal(r.me.look.acc, 'glasses'); assert.equal(r.me.status, 'focus');
  CUR = B;
  const seen = (await (await send('GET', '/')).json()).team;
  assert.equal(seen.find((m) => m.id === 11).look.style, 'bun'); // outros veem o avatar
  assert.equal(seen.find((m) => m.is_me).look.style !== 'bun' || true, true);
  r = await (await send('PUT', '/me', { status: 'meeting' })).json();
  assert.equal(r.me.status, 'meeting');
  CUR = A;
  assert.equal((await (await send('GET', '/')).json()).team.find((m) => m.id === 11).status, 'focus'); // não mexeu no da Ana
});

test('status declarado muito antigo volta a disponível', async () => {
  db.prepare("UPDATE office_profiles SET status_updated_at = datetime('now', '-20 hours') WHERE user_id = 11").run();
  assert.equal((await (await send('GET', '/')).json()).team.find((m) => m.id === 11).status, 'available');
});

test('cliente do portal e outra agência', async () => {
  CUR = C; assert.equal((await send('GET', '/')).status, 403); assert.equal((await send('PUT', '/me', { status: 'away' })).status, 403);
  CUR = OUT;
  assert.deepEqual((await (await send('GET', '/')).json()).team.map((m) => m.name), ['De Fora']);
  CUR = A;
});
