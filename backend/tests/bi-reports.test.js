const os = require('os'); const fs = require('fs'); const path = require('path');
const test = require('node:test'); const assert = require('node:assert/strict');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-bi-'));
process.env.NODE_ENV = 'development'; process.env.DATABASE_PATH = path.join(tmpDir, 'z.sqlite'); process.env.AUTO_BACKUP_ON_START = 'false';
process.env.MEDIA_STORAGE_DIR = path.join(tmpDir, 'media');
const backupPath = require.resolve('../db/backup.js');
require.cache[backupPath] = { id: backupPath, filename: backupPath, loaded: true, exports: { createBackup: async () => null } };
let PERMS = () => true;
const permPath = require.resolve('../services/permissions.js');
require.cache[permPath] = { id: permPath, filename: permPath, loaded: true, exports: { ...require(permPath), hasPermission: (u, k) => PERMS(k, u) } };
const db = require('../db/database'); const express = require('express');
const engine = require('../services/biEngine');
const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const client = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'Altus', 'active')").run(agencyId).lastInsertRowid);
const other = Number(db.prepare("INSERT INTO clients (agency_id, name, status) VALUES (?, 'Outro', 'active')").run(agencyId).lastInsertRowid);
let CUR = { id: 1, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = CUR; next(); }); app.use('/bi', require('../routes/biReports'));
let server, base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const call = (m, url, body) => fetch(base + '/bi' + url, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const J = async (r) => r.json();
const mod = (r, key) => r.report.modules.find((m) => m.module_key === key);

test('motor: ausente não vira zero; derivadas só com todos os insumos; sem somar incompatíveis', () => {
  const r = { id: 1, year: 2026, month: 10, modules: [
    { module_key: 'traffic', metrics: [
      { key: 'spend', value: 1000, scope_type: 'platform', scope: 'Meta Ads' }, { key: 'leads', value: 50, scope_type: 'platform', scope: 'Meta Ads' },
      { key: 'spend', value: 500, scope_type: 'platform', scope: 'Google Ads' }, { key: 'reach', value: 9000, scope_type: 'platform', scope: 'Meta Ads' }, { key: 'reach', value: 7000, scope_type: 'platform', scope: 'Google Ads' }] },
    { module_key: 'sales', metrics: [{ key: 'revenue', value: 9000 }] },
  ] };
  const f = engine.flatten(r);
  assert.equal(f['traffic.spend'].value, 1500);
  assert.equal(f['traffic.leads'].value, 50);
  assert.equal(f['traffic.reach'], undefined); // alcance de várias plataformas não é somado
  assert.equal(f['traffic.cpl'].value, 30);
  assert.equal(f['traffic.cpc'], undefined); // sem cliques
  assert.equal(f['sales.avg_ticket'], undefined); // sem nº de vendas
  assert.equal(f['sales.roas_business'].value, 6);
  assert.ok(f['sales.roi'].inputs.length === 2);
});

test('motor: comparação respeita polaridade e estabilidade', () => {
  const mk = (id, m, spend, leads) => ({ id, year: 2026, month: m, modules: [{ module_key: 'traffic', metrics: [{ key: 'spend', value: spend }, { key: 'leads', value: leads }] }] });
  const a = mk(1, 9, 1000, 50); const b = mk(2, 10, 1000, 100);
  const out = engine.analyze(b, [{ report: a, flat: engine.flatten(a) }]);
  assert.equal(out.comparisons['traffic.leads'].tone, 'good');
  assert.equal(out.comparisons['traffic.spend'].direction, 'stable');
  assert.equal(out.comparisons['traffic.cpl'].tone, 'good'); // custo caiu = bom
  const first = engine.analyze(a, []);
  assert.equal(first.baseline.available, false); assert.deepEqual(first.comparisons, {});
});

let rid;
test('cria Out/2026 só com Instagram, salva módulo, anexa fonte, não duplica mês', async () => {
  const c = await call('POST', '/', { client_id: client, year: 2026, month: 10, modules: ['instagram'] });
  assert.equal(c.status, 201); rid = (await J(c)).id;
  assert.equal((await call('POST', '/', { client_id: client, year: 2026, month: 10 })).status, 409);
  let r = await J(await call('GET', `/${rid}`));
  assert.equal(r.report.modules.length, 1);
  assert.equal(r.analysis.completeness.areas.find((a) => a.key === 'traffic').state, 'not_informed');
  const m = mod(r, 'instagram');
  const save = await call('PUT', `/${rid}/modules/${m.id}`, { metrics: [{ key: 'followers_start', value: '1.000' }, { key: 'followers_end', value: 1100 }, { key: 'reach', value: '' }, { label: 'Cliques no WhatsApp', value: 12, unit: 'int', is_custom: true }], contents: [{ rank_type: 'best', title: 'Reel A', reach: 9000 }, { rank_type: 'worst', title: 'Post B', reach: 100 }], source: 'mLabs' });
  assert.equal(save.status, 200);
  r = await J(await call('GET', `/${rid}`));
  const mm = mod(r, 'instagram');
  assert.equal(mm.metrics.length, 3); // reach vazio não foi gravado
  assert.ok(!mm.metrics.some((x) => x.key === 'reach'));
  assert.equal(r.analysis.flat['instagram.followers_net'].value, 100);
  assert.equal(mm.contents.length, 2);
  const f = new FormData(); f.append('file', new Blob([Buffer.alloc(500, 1)], { type: 'image/png' }), 'print.png'); f.append('module_key', 'instagram');
  const up = await fetch(`${base}/bi/${rid}/sources`, { method: 'POST', body: f });
  assert.equal(up.status, 201); assert.match((await J(up)).source.media_url, /^\/api\/media\//);
  assert.equal((await call('POST', `/${rid}/notes`, { text: 'Campanha Dia das Crianças', chart_marker: true })).status, 201);
});

test('finaliza trava edição; reabrir preserva versão anterior; adiciona Comercial depois', async () => {
  assert.equal((await call('POST', `/${rid}/finalize`)).status, 200);
  let r = await J(await call('GET', `/${rid}`));
  assert.equal((await call('PUT', `/${rid}/modules/${mod(r, 'instagram').id}`, { metrics: [{ key: 'reach', value: 1 }] })).status, 409);
  assert.equal((await call('POST', `/${rid}/reopen`, { reason: 'Corrigir alcance' })).status, 200);
  const add = await call('POST', `/${rid}/modules`, { module_key: 'commercial' });
  assert.equal(add.status, 201);
  const v = await J(await call('GET', `/${rid}/versions`));
  assert.equal(v.versions.length, 1); assert.equal(v.versions[0].version, 1); assert.equal(v.current.version, 2);
  assert.equal(v.versions[0].snapshot.modules[0].metrics.length, 3);
  r = await J(await call('GET', `/${rid}`));
  assert.equal(r.analysis.completeness.areas.find((a) => a.key === 'commercial').state, 'not_informed'); // módulo vazio
  await call('POST', `/${rid}/finalize`);
});

test('Nov/2026 compara com Out; histórico monta séries; cliente só vê os próprios finalizados', async () => {
  const c = await J(await call('POST', '/', { client_id: client, year: 2026, month: 11, modules: ['instagram', 'commercial'] }));
  let r = await J(await call('GET', `/${c.id}`));
  await call('PUT', `/${c.id}/modules/${mod(r, 'instagram').id}`, { metrics: [{ key: 'followers_start', value: 1100 }, { key: 'followers_end', value: 1300 }] });
  await call('PUT', `/${c.id}/modules/${mod(r, 'commercial').id}`, { metrics: [{ key: 'leads_received', value: 40 }, { key: 'appointments', value: 20 }] });
  r = await J(await call('GET', `/${c.id}`));
  assert.equal(r.analysis.baseline.available, true);
  assert.equal(r.analysis.comparisons['instagram.followers_net'].tone, 'good');
  assert.equal(r.analysis.flat['commercial.rate_lead_to_appointment'].value, 50);
  const h = await J(await call('GET', `/history?client_id=${client}`));
  assert.equal(h.periods.length, 2); assert.equal(h.series['instagram.followers_net'].points.length, 2);
  assert.equal(h.markers.length, 1);
  // cliente
  CUR = { id: 9, role: 'client', client_id: client, client_ids: [client], agency_id: agencyId };
  const list = await J(await call('GET', '/'));
  assert.deepEqual(list.reports.map((x) => x.id), [rid]); // rascunho de novembro não aparece
  assert.equal((await call('GET', `/${c.id}`)).status, 403);
  assert.equal((await call('PUT', `/${rid}`, { notes: 'x' })).status, 403);
  CUR = { id: 10, role: 'client', client_id: other, client_ids: [other], agency_id: agencyId };
  assert.equal((await call('GET', `/${rid}`)).status, 403);
  CUR = { id: 1, name: 'Adm', role: 'admin', client_ids: [], agency_id: agencyId };
  assert.equal((await call('DELETE', `/${c.id}`)).status, 200);
});

test('importação CSV: modelo, prévia, criação em lote, mescla em rascunho, pula finalizado, erros por linha', async () => {
  const t = await fetch(`${base}/bi/import/template?modules=instagram,traffic&client=Altus`);
  assert.equal(t.status, 200); const buf = Buffer.from(await t.arrayBuffer()); const tpl = buf.toString("utf8"); assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(tpl, /^﻿cliente;ano;mes;modulo/); assert.match(tpl, /Seguidores no final do período/); assert.match(tpl, /plataforma;Meta Ads;Investimento/);
  const csv = [
    'cliente;ano;mes;modulo;escopo_tipo;escopo;metrica;valor;unidade;observacao',
    'Altus;2026;12;Instagram;;;Seguidores no início do período;"2.000";;',
    'Altus;2026;dezembro;Instagram;;;Seguidores no final do período;2.150;;',
    'Altus;2026;12;Instagram;;;Alcance;;;', // vazio = não informado
    'Altus;2026;12;Instagram;;;Cliques no WhatsApp;37;;campanha natal', // personalizada
    'Altus;2026;12;Tráfego pago;plataforma;Meta Ads;Investimento;"R$ 1.500,50";;',
    'Altus;2026;12;Tráfego pago;plataforma;Meta Ads;Leads;30;;',
    'Altus;2026;12;Instagram;item;Natal;Principais cidades;40;;',
    'Altus;2026;10;Instagram;;;Alcance;999;;', // out/2026 já finalizado -> pula
    'Fantasma;2026;12;Instagram;;;Alcance;5;;',
    'Altus;2026;12;Instagram;;;Alcance;abc;;',
    'Altus;2026;13;Instagram;;;Alcance;5;;',
    'Altus;2026;12;Podcast;;;Alcance;5;;',
  ].join('\n');
  const f = () => { const fd = new FormData(); fd.append('file', new Blob([csv], { type: 'text/csv' }), 'x.csv'); return fd; };
  const pv = await J(await fetch(`${base}/bi/import/preview`, { method: 'POST', body: f() }));
  assert.equal(pv.errors.length, 4); assert.equal(pv.skipped_empty, 1); assert.equal(pv.custom_metrics, 1);
  assert.equal(pv.reports.find((r) => r.month === 12).action, 'create'); assert.equal(pv.reports.find((r) => r.month === 10).action, 'skip_final');
  const before = db.prepare("SELECT COUNT(*) n FROM bi_reports WHERE month = 12").get().n;
  assert.equal(before, 0); // prévia não grava
  const done = await J(await fetch(`${base}/bi/import/commit`, { method: 'POST', body: f() }));
  assert.equal(done.created, 1); assert.equal(done.skipped.length, 1);
  const list = (await J(await call('GET', `/?client_id=${client}&month=12`))).reports; assert.equal(list.length, 1);
  const r = await J(await call('GET', `/${list[0].id}`));
  assert.equal(r.analysis.flat['instagram.followers_net'].value, 150);
  assert.equal(r.analysis.flat['traffic.spend'].value, 1500.5);
  assert.equal(r.analysis.flat['instagram.reach'], undefined);
  assert.ok(r.analysis.flat['instagram.c_cliques-no-whatsapp'] || Object.keys(r.analysis.flat).some((k) => k.includes('whatsapp')));
  // reimportar mescla sem duplicar
  const again = await J(await fetch(`${base}/bi/import/commit`, { method: 'POST', body: f() }));
  assert.equal(again.created, 0); assert.equal(again.merged, 1);
  const r2 = await J(await call('GET', `/${list[0].id}`));
  assert.equal(mod(r2, 'traffic').metrics.filter((x) => x.key === 'spend').length, 1);
  assert.equal(db.prepare("SELECT status FROM bi_reports WHERE id = ?").get(rid).status, 'final'); // finalizado intacto
});
