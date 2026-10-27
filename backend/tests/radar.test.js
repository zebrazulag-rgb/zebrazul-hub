const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-radar-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
const authPath = require.resolve('../middleware/auth.js'); const realAuth = require(authPath);
let CUR = {};
require.cache[authPath].exports = { ...realAuth, authRequired: (req, res, next) => { req.user = CUR; next(); } };
const feed = require('../services/radarFeed');
const { buildPrompt } = require('../services/radarPrompts');
const { apiPermissionForRequest } = require('../services/permissions');
const db = require('../db/database'); const express = require('express');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (1, ?, 'Adm', 'adm@t.com', 'x', 'admin')").run(agencyId);
const mk = (n) => Number(db.prepare("INSERT INTO clients (agency_id, name, segment, status) VALUES (?, ?, 'Odontologia', 'active')").run(agencyId, n).lastInsertRowid);
const A = mk('Clínica A'); const B = mk('Clínica B');
const admin = { id: 1, agency_id: agencyId, role: 'admin' };

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Blog Odonto</title><link>https://odonto.test/</link>
<item><title><![CDATA[Clareamento: o que muda em 2026]]></title><link>/p/clareamento</link><guid>g1</guid><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Novas regras &amp; <b>cuidados</b> para o clareamento.</p>]]></description></item>
<item><title>Implantes &amp; próteses</title><link>https://odonto.test/p/implantes</link><guid>g2</guid><pubDate>Sun, 25 Oct 2026 10:00:00 GMT</pubDate><description>Texto simples sobre implantes.</description></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Vet</title><link rel="alternate" href="https://vet.test/"/><link rel="self" href="https://vet.test/atom"/>
<entry><title>Vacinas de inverno</title><link rel="alternate" href="https://vet.test/vacinas"/><id>tag:vet,1</id><published>2026-10-24T12:00:00Z</published><summary>Resumo das vacinas.</summary></entry></feed>`;
const HTML = `<html><head><link rel="alternate" type="application/rss+xml" title="Feed" href="/blog/rss.xml"></head><body>oi</body></html>`;

let routes = {}; let calls = [];
feed.setFetcherForTests(async (url, headers) => {
  calls.push(url.toString());
  const r = routes[url.toString()];
  if (!r) return { status: 404, headers: {}, body: Buffer.from('nf') };
  return typeof r === 'function' ? r(headers) : r;
});
const ok = (body, extra = {}) => ({ status: 200, headers: { etag: '"v1"', ...extra }, body: Buffer.from(body) });

test('SSRF: bloqueia endereços privados e esquemas inválidos', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(feed.isPrivateAddress(a), true, a);
  assert.equal(feed.isPrivateAddress('8.8.8.8'), false);
  assert.throws(() => feed.normalizeUrl('file:///etc/passwd'));
  assert.throws(() => feed.normalizeUrl('http://localhost:3000/x'));
  assert.throws(() => feed.normalizeUrl('http://127.0.0.1/x'));
  assert.throws(() => feed.normalizeUrl('http://user:pw@site.com/'));
  assert.equal(feed.normalizeUrl('site.com/feed').toString(), 'https://site.com/feed');
});

test('parser RSS: título, trecho limpo, link absoluto, data e CDATA', () => {
  const p = feed.parseFeed(RSS, 'https://odonto.test/feed');
  assert.equal(p.type, 'rss'); assert.equal(p.title, 'Blog Odonto'); assert.equal(p.items.length, 2);
  assert.equal(p.items[0].title, 'Clareamento: o que muda em 2026');
  assert.equal(p.items[0].summary, 'Novas regras & cuidados para o clareamento.');
  assert.equal(p.items[0].link, 'https://odonto.test/p/clareamento');
  assert.equal(p.items[0].published_at, '2026-10-26T10:00:00.000Z');
  assert.equal(p.items[1].title, 'Implantes & próteses');
});

test('parser Atom e rejeição de HTML', () => {
  const p = feed.parseFeed(ATOM, 'https://vet.test/atom');
  assert.equal(p.type, 'atom'); assert.equal(p.items[0].link, 'https://vet.test/vacinas'); assert.equal(p.site_url, 'https://vet.test/');
  assert.throws(() => feed.parseFeed('<html><body>oi</body></html>'), /feed RSS ou Atom/);
});

test('descoberta: usa o link declarado na página; aceita feed direto', async () => {
  routes = { 'https://odonto.test/': ok(HTML), 'https://odonto.test/blog/rss.xml': ok(RSS) };
  const found = await feed.discoverFeeds('odonto.test');
  assert.equal(found[0].feed_url, 'https://odonto.test/blog/rss.xml'); assert.equal(found[0].sample_count, 2);
  routes = { 'https://vet.test/atom': ok(ATOM) };
  const direct = await feed.discoverFeeds('https://vet.test/atom');
  assert.equal(direct[0].type, 'atom');
});

test('descoberta: tenta endereços comuns e segue redirecionamento', async () => {
  routes = {
    'https://x.test/': ok('<html>sem link</html>'),
    'https://x.test/feed': { status: 301, headers: { location: 'https://x.test/novo-feed' }, body: Buffer.alloc(0) },
    'https://x.test/novo-feed': ok(RSS),
  };
  const found = await feed.discoverFeeds('x.test');
  assert.equal(found.length, 1); assert.equal(found[0].feed_url, 'https://x.test/novo-feed');
  routes = { 'https://nada.test/': ok('<html>nada</html>') };
  assert.deepEqual(await feed.discoverFeeds('nada.test'), []);
});

test('redirecionamento para rede interna é bloqueado', async () => {
  routes = { 'https://evil.test/f': { status: 302, headers: { location: 'http://127.0.0.1/admin' }, body: Buffer.alloc(0) } };
  await assert.rejects(() => feed.fetchUrl('https://evil.test/f'), /não permitido/);
});

test('prompts: incluem cliente, referências, dados da notícia e instruções', () => {
  const client = { name: 'Clínica A', segment: 'Odontologia', editorial_references: 'Tom acolhedor, estilo @perfilx.' };
  const item = { title: 'Clareamento 2026', summary: 'Trecho X', link: 'https://odonto.test/p', published_at: '2026-10-26T10:00:00.000Z' };
  const c = buildPrompt({ kind: 'carousel', client, item, source: { name: 'Blog Odonto' }, angle: 'foco em mitos' });
  for (const t of ['Clínica A', 'Tom acolhedor, estilo @perfilx.', 'Clareamento 2026', 'Trecho X', 'Blog Odonto', '26/10/2026', 'https://odonto.test/p', 'CARROSSEL', 'foco em mitos', '[CONFIRMAR]']) assert.ok(c.includes(t), t);
  const v = buildPrompt({ kind: 'video', client: { name: 'Clínica A' }, item, source: { name: 'Blog' } });
  assert.ok(v.includes('ROTEIRO DE VÍDEO')); assert.ok(v.includes('Nenhuma referência cadastrada'));
  assert.throws(() => buildPrompt({ kind: 'x', client, item }));
});

test('mapeamento de permissões das rotas /radar', () => {
  const p = (path, method = 'GET') => apiPermissionForRequest({ path, method, user: {}, body: {} });
  assert.equal(p('/radar/clients/1/items'), 'radar.view');
  assert.equal(p('/radar/clients/1/refresh', 'POST'), 'radar.refresh');
  assert.equal(p('/radar/items/9/prompt', 'POST'), 'radar.prompts');
  assert.equal(p('/radar/clients/1/history'), 'radar.history');
  assert.equal(p('/radar/clients/1/sources'), 'radar.sources');
  assert.equal(p('/radar/sources/3', 'DELETE'), 'radar.sources');
  assert.equal(p('/radar/clients/1/editorial', 'PUT'), 'radar.sources');
  assert.deepEqual(p('/radar/clients/1/editorial'), ['radar.prompts', 'radar.sources']);
});

// ---------- rotas ----------
const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = CUR; next(); }); app.use('/r', require('../routes/radar'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/r`; });
test.after(() => server.close());
const call = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };

test('cadastrar fonte coleta notícias, não duplica e respeita o cliente', async () => {
  CUR = admin; routes = { 'https://odonto.test/feed': ok(RSS) };
  const created = await call('POST', `/clients/${A}/sources`, { feed_url: 'https://odonto.test/feed', name: 'Blog Odonto' });
  assert.equal(created.status, 201); assert.equal(created.body.collected, 2); assert.equal(created.body.source.feed_type, 'rss');
  assert.equal((await call('POST', `/clients/${A}/sources`, { feed_url: 'https://odonto.test/feed' })).status, 409);
  // mesma fonte pode existir em outro cliente (fontes são por cliente)
  assert.equal((await call('POST', `/clients/${B}/sources`, { feed_url: 'https://odonto.test/feed' })).status, 201);
  const itemsA = await call('GET', `/clients/${A}/items`);
  assert.equal(itemsA.body.total, 2); assert.equal(itemsA.body.items[0].title, 'Clareamento: o que muda em 2026');
  assert.equal(itemsA.body.items[0].source_name, 'Blog Odonto');
});

test('feed inválido: 422 com opção de forçar', async () => {
  CUR = admin; routes = { 'https://ruim.test/f': ok('<html>nope</html>') };
  const r = await call('POST', `/clients/${A}/sources`, { feed_url: 'https://ruim.test/f' });
  assert.equal(r.status, 422); assert.equal(r.body.can_force, true);
  const f = await call('POST', `/clients/${A}/sources`, { feed_url: 'https://ruim.test/f', force: true, name: 'Manual' });
  assert.equal(f.status, 201); assert.ok(f.body.warning);
  const src = (await call('GET', `/clients/${A}/sources`)).body.sources.find((s) => s.name === 'Manual');
  assert.equal(src.last_status, 'error');
});

test('filtros: data, fonte e palavras-chave (E / OU)', async () => {
  CUR = admin;
  const sources = (await call('GET', `/clients/${A}/sources`)).body.sources;
  const blog = sources.find((s) => s.name === 'Blog Odonto');
  assert.equal((await call('GET', `/clients/${A}/items?q=clareamento`)).body.total, 1);
  assert.equal((await call('GET', `/clients/${A}/items?q=clareamento%20implantes`)).body.total, 0);
  assert.equal((await call('GET', `/clients/${A}/items?q=clareamento%20implantes&match=any`)).body.total, 2);
  assert.equal((await call('GET', `/clients/${A}/items?from=2026-10-26&to=2026-10-26`)).body.total, 1);
  assert.equal((await call('GET', `/clients/${A}/items?source_id=${blog.id}`)).body.total, 2);
  assert.equal((await call('GET', `/clients/${A}/items?q=100%25`)).body.total, 0); // % tratado como texto
});

test('desativar esconde notícias e para a coleta; reativar volta; remover apaga', async () => {
  CUR = admin;
  const blog = (await call('GET', `/clients/${B}/sources`)).body.sources[0];
  await call('PUT', `/sources/${blog.id}`, { is_active: false });
  assert.equal((await call('GET', `/clients/${B}/items`)).body.total, 0);
  calls = []; const r = await call('POST', `/clients/${B}/refresh`);
  assert.equal(r.body.sources, 0); assert.equal(calls.length, 0);
  await call('PUT', `/sources/${blog.id}`, { is_active: true });
  assert.equal((await call('GET', `/clients/${B}/items`)).body.total, 2);
  assert.equal((await call('DELETE', `/sources/${blog.id}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM radar_items WHERE source_id = ?').get(blog.id).n, 0);
});

test('atualização usa cache condicional e registra falha', async () => {
  CUR = admin;
  const src = (await call('GET', `/clients/${A}/sources`)).body.sources.find((s) => s.name === 'Blog Odonto');
  const { refreshSource } = require('../services/radar');
  let seen = null; routes['https://odonto.test/feed'] = (h) => { seen = h; return { status: 304, headers: {}, body: Buffer.alloc(0) }; };
  const r = await refreshSource(src.id);
  assert.equal(r.unchanged, true); assert.equal(seen['If-None-Match'], '"v1"');
  routes['https://odonto.test/feed'] = { status: 500, headers: {}, body: Buffer.from('x') };
  const f = await refreshSource(src.id);
  assert.equal(f.ok, false);
  const row = db.prepare('SELECT last_status, consecutive_failures FROM radar_sources WHERE id = ?').get(src.id);
  assert.equal(row.last_status, 'error'); assert.equal(row.consecutive_failures, 1);
});

test('prompt: salva histórico por cliente; histórico mantém texto se a notícia sumir', async () => {
  CUR = admin;
  const item = (await call('GET', `/clients/${A}/items?q=clareamento`)).body.items[0];
  await call('PUT', `/clients/${A}/editorial`, { editorial_references: 'Tom acolhedor. Referência: @perfilx' });
  const g = await call('POST', `/items/${item.id}/prompt`, { kind: 'carousel', angle: 'mitos' });
  assert.equal(g.status, 201);
  for (const t of ['Clínica A', 'Tom acolhedor. Referência: @perfilx', item.title, 'Blog Odonto', item.link, 'mitos']) assert.ok(g.body.prompt.includes(t), t);
  assert.equal((await call('POST', `/items/${item.id}/prompt`, { kind: 'poema' })).status, 400);
  await call('POST', `/items/${item.id}/prompt`, { kind: 'video' });
  const h = await call('GET', `/clients/${A}/history`);
  assert.equal(h.body.total, 2); assert.equal(h.body.history[0].kind, 'video');
  assert.equal((await call('GET', `/clients/${A}/history?kind=carousel`)).body.total, 1);
  assert.equal((await call('GET', `/clients/${B}/history`)).body.total, 0);
  db.prepare('DELETE FROM radar_items WHERE id = ?').run(item.id);
  const h2 = await call('GET', `/clients/${A}/history?kind=carousel`);
  assert.ok(h2.body.history[0].prompt_text.includes(item.title));
});

test('isolamento: equipe sem acesso ao cliente não vê nem gera; cliente só vê o próprio e fontes visíveis', async () => {
  CUR = { id: 5, agency_id: agencyId, role: 'team', client_ids: [B] };
  assert.equal((await call('GET', `/clients/${A}/items`)).status, 403);
  assert.equal((await call('GET', `/clients/${A}/sources`)).status, 403);
  const itemA = db.prepare('SELECT id FROM radar_items WHERE client_id = ? LIMIT 1').get(A);
  assert.equal((await call('POST', `/items/${itemA.id}/prompt`, { kind: 'video' })).status, 403);
  CUR = admin;
  const blog = (await call('GET', `/clients/${A}/sources`)).body.sources.find((s) => s.name === 'Blog Odonto');
  CUR = { id: 9, agency_id: agencyId, role: 'client', client_id: A, client_ids: [A] };
  assert.equal((await call('GET', `/clients/${B}/items`)).status, 403);
  assert.ok((await call('GET', `/clients/${A}/items`)).body.total >= 1);
  CUR = admin; await call('PUT', `/sources/${blog.id}`, { client_visible: false });
  CUR = { id: 9, agency_id: agencyId, role: 'client', client_id: A, client_ids: [A] };
  assert.equal((await call('GET', `/clients/${A}/items`)).body.total, 0);
});

test('permissões padrão por função', () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id INTEGER, name TEXT, slug TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS custom_role_permissions (custom_role_id INTEGER, permission_key TEXT, allowed INTEGER);
    CREATE TABLE IF NOT EXISTS agency_role_permissions (agency_id INTEGER, role_key TEXT, permission_key TEXT, allowed INTEGER);
    CREATE TABLE IF NOT EXISTS agency_permission_visibility (agency_id INTEGER, permission_key TEXT, owner_only INTEGER);
  `);
  const { hasPermission } = require('../services/permissions');
  const u = (extra) => ({ id: 77, agency_id: agencyId, ...extra });
  const keys = ['radar.view', 'radar.refresh', 'radar.sources', 'radar.prompts', 'radar.history'];
  const got = (user) => keys.map((k) => hasPermission(user, k));
  assert.deepEqual(got(u({ role: 'admin' })), [true, true, true, true, true]);
  assert.deepEqual(got(u({ role: 'team', is_operations_head: 1 })), [true, true, true, true, true]);
  assert.deepEqual(got(u({ role: 'team' })), [true, true, false, true, true]);
  assert.deepEqual(got(u({ role: 'client', client_id: A })), [true, false, false, false, false]);
  assert.deepEqual(got(u({ role: 'team', is_commercial_team: 1 })), [false, false, false, false, false]);
});


// ---------- página do Radar ----------
test('"em alta": conta termos em notícias diferentes e ignora palavras comuns', () => {
  const { trendingTerms } = require('../services/radarInsights');
  const out = trendingTerms(['Clareamento dental: o que muda', 'Clareamento a laser, vale a pena?', 'Implante dental em 2026', 'Como escolher um dentista'], { minCount: 2 });
  assert.deepEqual(out.map((e) => [e.term, e.count]), [['clareamento', 2], ['dental', 2]]);
});

test('visão geral, novidades desde a última visita e salvos', async () => {
  const C = mk('Clínica C'); CUR = admin;
  routes = { 'https://odonto.test/feed': ok(RSS) };
  await call('POST', `/clients/${C}/sources`, { feed_url: 'https://odonto.test/feed', name: 'Blog Odonto' });
  let ov = (await call('GET', `/clients/${C}/overview`)).body;
  assert.equal(ov.stats.new_since_visit, 2); assert.equal(ov.stats.total, 2); assert.equal(ov.stats.sources_active, 1); assert.equal(ov.stats.prompts_total, 0);
  let list = (await call('GET', `/clients/${C}/items`)).body.items;
  assert.ok(list.every((i) => i.is_new === true && i.saved === false));
  assert.equal((await call('POST', `/clients/${C}/seen`)).status, 200);
  ov = (await call('GET', `/clients/${C}/overview`)).body;
  assert.equal(ov.stats.new_since_visit, 0);
  list = (await call('GET', `/clients/${C}/items`)).body.items;
  assert.ok(list.every((i) => i.is_new === false));
  assert.equal((await call('GET', `/clients/${C}/items?only_new=1`)).body.total, 0);
  // salvar é por usuário
  assert.equal((await call('POST', `/items/${list[0].id}/save`)).body.saved, true);
  assert.equal((await call('GET', `/clients/${C}/items?saved=1`)).body.total, 1);
  CUR = { ...admin, id: 2 };
  db.prepare("INSERT OR IGNORE INTO users (id, agency_id, name, email, password_hash, role) VALUES (2, ?, 'Outro', 'o@t.com', 'x', 'admin')").run(agencyId);
  assert.equal((await call('GET', `/clients/${C}/items?saved=1`)).body.total, 0);
  CUR = admin;
  assert.equal((await call('DELETE', `/items/${list[0].id}/save`)).body.saved, false);
  assert.equal((await call('GET', `/clients/${C}/items?saved=1`)).body.total, 0);
});

test('resumo por cliente respeita o acesso; cliente não vê contagem de prompts', async () => {
  CUR = admin;
  const all = (await call('GET', '/summary')).body;
  assert.ok(all.clients.length >= 3);
  CUR = { id: 5, agency_id: agencyId, role: 'team', client_ids: [B] };
  const mine = (await call('GET', '/summary')).body;
  assert.deepEqual(mine.clients.map((c) => c.id), [B]);
  const firstClient = all.clients[0].id;
  CUR = { id: 9, agency_id: agencyId, role: 'client', client_id: A, client_ids: [A] };
  assert.deepEqual((await call('GET', '/summary')).body.clients.map((c) => c.id), [A]);
  assert.equal((await call('GET', `/clients/${A}/overview`)).body.stats.prompts_total, null);
  assert.equal((await call('GET', `/clients/${firstClient === A ? B : firstClient}/overview`)).status, 403);
  const p = (path, method = 'GET') => apiPermissionForRequest({ path, method, user: {}, body: {} });
  for (const x of ['/radar/summary', '/radar/clients/1/overview', '/radar/clients/1/seen', '/radar/items/3/save']) assert.equal(p(x, x.endsWith('seen') ? 'POST' : 'GET'), 'radar.view');
});

test('lookup protegido funciona nos dois formatos do Node (all:true e all:false) e bloqueia IP interno', async () => {
  const lookup = (host, opts) => new Promise((resolve) => feed.guardedLookup(host, opts, (err, a, f) => resolve({ err, a, f })));
  const one = await lookup('localhost', { all: false });
  assert.ok(one.err, 'localhost deve ser bloqueado');
  const many = await lookup('localhost', { all: true });
  assert.ok(many.err, 'localhost deve ser bloqueado também com all:true');
  const ip = await lookup('8.8.8.8', { all: true });
  assert.ok(!ip.err && Array.isArray(ip.a) && ip.a[0].address === '8.8.8.8');
});

test('requisição real passa pelo lookup protegido (servidor local é bloqueado, não "Invalid IP")', async () => {
  const http = require('http');
  const srv = http.createServer((q, r) => r.end('x')); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  feed.setFetcherForTests(null); // usa o leitor real
  try {
    await assert.rejects(() => feed.fetchUrl(`http://127.0.0.1:${srv.address().port}/`), /não permitido/);
    await assert.rejects(() => feed.fetchUrl(`http://localhost:${srv.address().port}/`), /não permitido/);
  } finally { srv.close(); }
});

test('conexão real de ponta a ponta (Node atual) lê RSS, gzip e segue redirecionamento', async () => {
  const http = require('http'); const zlib = require('zlib');
  const srv = http.createServer((q, r) => {
    if (q.url === '/old') { r.writeHead(301, { Location: '/feed' }); return r.end(); }
    r.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Content-Encoding': 'gzip' }); r.end(zlib.gzipSync(RSS));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  feed.setFetcherForTests(null); feed.setAllowPrivateForTests(true);
  try {
    const { feed: parsed } = await feed.tryParseFeed(`http://localhost:${srv.address().port}/old`);
    assert.equal(parsed.items.length, 2);
  } finally { feed.setAllowPrivateForTests(false); feed.setFetcherForTests(async (url) => { const r = routes[url.toString()]; return r || { status: 404, headers: {}, body: Buffer.from('nf') }; }); srv.close(); }
});

test('descoberta por padrões: BBC (tópico) e links <a> de RSS; resumo igual ao título é descartado', async () => {
  const guesses = feed.guessFeedUrls('https://www.bbc.com/portuguese/topics/c06gq6k9d9qt').map((g) => g.feed_url);
  assert.ok(guesses.includes('https://feeds.bbci.co.uk/portuguese/topics/c06gq6k9d9qt/rss.xml'));
  assert.ok(guesses.includes('https://www.bbc.com/portuguese/topics/c06gq6k9d9qt/rss.xml'));
  const links = feed.findFeedLinksInHtml('<a href="/rss/saude">RSS</a><a href="/contato">x</a><a href="https://x.test/feed.xml">f</a>', 'https://x.test/p');
  assert.deepEqual(links.map((l) => l.feed_url), ['https://x.test/rss/saude', 'https://x.test/feed.xml']);
  routes = { 'https://bbc.test/pt/topics/abc': ok('<html>sem feed</html>'), 'https://bbc.test/pt/topics/abc/rss.xml': ok(RSS) };
  const found = await feed.discoverFeeds('https://bbc.test/pt/topics/abc');
  assert.equal(found[0].feed_url, 'https://bbc.test/pt/topics/abc/rss.xml'); assert.equal(found[0].method, 'padrão da seção');
  const g = feed.parseFeed('<rss><channel><title>G</title><item><title>Saúde mental cresce - Folha</title><link>https://n.test/1</link><description>&lt;a href="x"&gt;Saúde mental cresce&lt;/a&gt; Folha</description></item></channel></rss>');
  assert.equal(g.items[0].summary, '');
});

test('acompanhar assunto cria fonte do Google Notícias (RSS) e coleta', async () => {
  CUR = admin;
  const url = feed.googleNewsFeedUrl('saúde mental', { days: 7 });
  assert.match(url, /^https:\/\/news\.google\.com\/rss\/search\?q=sa%C3%BAde%20mental%20when%3A7d&hl=pt-BR/);
  assert.throws(() => feed.googleNewsFeedUrl(' '));
  routes = { [url]: ok(ATOM.replace('<feed', '<feed')) };
  const r = await call('POST', `/clients/${B}/topic-source`, { query: 'saúde mental', days: 7 });
  assert.equal(r.status, 201); assert.equal(r.body.source.name, 'Assunto: saúde mental'); assert.equal(r.body.collected, 1);
  assert.equal((await call('POST', `/clients/${B}/topic-source`, { query: 'saúde mental', days: 7 })).status, 409);
  assert.equal((await call('POST', `/clients/${B}/topic-source`, { query: '' })).status, 400);
});

test('referências editoriais longas são salvas por inteiro (sem limite de 4000)', async () => {
  CUR = admin; const big = 'Referência editorial. '.repeat(1000); // ~22 mil caracteres
  const r = await call('PUT', `/clients/${A}/editorial`, { editorial_references: big });
  assert.equal(r.status, 200); assert.equal(r.body.editorial_references.length, big.trim().length);
  assert.equal((await call('GET', `/clients/${A}/editorial`)).body.editorial_references.length, big.trim().length);
});
