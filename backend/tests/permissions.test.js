// Testes do portão de permissões da API (services/permissions.js).
// Rodar: npm test   (usa o runner nativo do Node, sem dependências novas)
//
// Banco temporário e isolado. NUNCA aponta para o banco de produção.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-perm-test-'));
process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = path.join(tmpDir, 'zebrazul_hub.sqlite');
process.env.AUTO_BACKUP_ON_START = 'false';

const db = require('../db/database');
const { apiPermissionForRequest, hasPermission } = require('../services/permissions');

// O repositório ainda não cria estas 4 tabelas (ver relatório, item 1; serão migradas na Fase 2).
// Aqui elas existem só para o teste, com as colunas que o código de permissões consulta.
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, agency_id INTEGER, name TEXT, slug TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS custom_role_permissions (custom_role_id INTEGER, permission_key TEXT, allowed INTEGER);
  CREATE TABLE IF NOT EXISTS agency_role_permissions (agency_id INTEGER, role_key TEXT, permission_key TEXT, allowed INTEGER);
  CREATE TABLE IF NOT EXISTS agency_permission_visibility (agency_id INTEGER, permission_key TEXT, owner_only INTEGER);
`);

const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);

function makeCustomRole(name, keys) {
  const info = db.prepare('INSERT INTO custom_roles (agency_id, name, slug) VALUES (?, ?, ?)').run(agencyId, name, name.toLowerCase());
  const id = Number(info.lastInsertRowid);
  const insert = db.prepare('INSERT INTO custom_role_permissions (custom_role_id, permission_key, allowed) VALUES (?, ?, 1)');
  keys.forEach((key) => insert.run(id, key));
  return id;
}

// Designer com cargo personalizado: vê tarefas, mas NÃO tem "Criar e editar tarefas".
const designerRoleId = makeCustomRole('Designer', ['tasks.view']);

const designer = { id: 10, role: 'team', agency_id: agencyId, custom_role_id: designerRoleId };
const teamDefault = { id: 11, role: 'team', agency_id: agencyId };
const client = { id: 12, role: 'client', agency_id: agencyId, client_id: 1 };

const req = (method, p, body, user) => ({ method, path: p, body, user });

// Reproduz a decisão que server.js toma com o resultado de apiPermissionForRequest.
function gateAllows(user, request) {
  const key = apiPermissionForRequest(request);
  return Array.isArray(key) ? key.some((k) => hasPermission(user, k)) : (!key || hasPermission(user, key));
}

test('mapeamento: check do designer exige só tasks.view (PATCH dedicado)', () => {
  assert.equal(apiPermissionForRequest(req('PATCH', '/tasks/5/designer-completed', { completed: 1 }, designer)), 'tasks.view');
});

test('mapeamento: check do designer exige só tasks.view (PUT só com designer_completed, caminho que o front usa)', () => {
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', { designer_completed: 1 }, designer)), 'tasks.view');
});

test('mapeamento: PUT com qualquer outro campo continua exigindo tasks.create', () => {
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', { designer_completed: 1, title: 'x' }, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', { title: 'x' }, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', {}, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', undefined, designer)), 'tasks.create');
});

test('mapeamento: DELETE, POST e id inválido não ganham a exceção', () => {
  assert.equal(apiPermissionForRequest(req('DELETE', '/tasks/5', { designer_completed: 1 }, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('POST', '/tasks', { designer_completed: 1 }, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PATCH', '/tasks/abc/designer-completed', {}, designer)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PATCH', '/tasks/5/outra-coisa', {}, designer)), 'tasks.create');
});

test('mapeamento: cliente NÃO recebe a exceção (sem ampliar acesso)', () => {
  assert.equal(apiPermissionForRequest(req('PUT', '/tasks/5', { designer_completed: 1 }, client)), 'tasks.create');
  assert.equal(apiPermissionForRequest(req('PATCH', '/tasks/5/designer-completed', {}, client)), 'tasks.create');
});

test('mapeamento: regras antigas de /tasks seguem iguais', () => {
  assert.equal(apiPermissionForRequest(req('GET', '/tasks', undefined, designer)), 'tasks.view');
  assert.equal(apiPermissionForRequest(req('POST', '/tasks/import', {}, designer)), 'tasks.import');
  assert.equal(apiPermissionForRequest(req('GET', '/tasks/export', undefined, designer)), 'tasks.export');
  assert.equal(apiPermissionForRequest(req('POST', '/tasks/1/calendar-share', {}, designer)), 'tasks.share_calendar');
});

test('portão: designer com cargo personalizado (só tasks.view) PASSA no check', () => {
  assert.equal(gateAllows(designer, req('PUT', '/tasks/5', { designer_completed: 1 }, designer)), true);
  assert.equal(gateAllows(designer, req('PATCH', '/tasks/5/designer-completed', { completed: 1 }, designer)), true);
});

test('portão: esse mesmo designer continua BARRADO para editar, criar e apagar tarefas', () => {
  assert.equal(gateAllows(designer, req('PUT', '/tasks/5', { title: 'novo' }, designer)), false);
  assert.equal(gateAllows(designer, req('PUT', '/tasks/5', { designer_completed: 1, status: 'done' }, designer)), false);
  assert.equal(gateAllows(designer, req('POST', '/tasks', { title: 'x' }, designer)), false);
  assert.equal(gateAllows(designer, req('DELETE', '/tasks/5', undefined, designer)), false);
});

test('portão: cargo sem tasks.view não passa nem no check', () => {
  const semAcessoId = makeCustomRole('SemTarefas', ['dashboard.view']);
  const user = { id: 13, role: 'team', agency_id: agencyId, custom_role_id: semAcessoId };
  assert.equal(gateAllows(user, req('PUT', '/tasks/5', { designer_completed: 1 }, user)), false);
});

test('portão: equipe padrão segue podendo tudo que podia (regressão)', () => {
  assert.equal(gateAllows(teamDefault, req('PUT', '/tasks/5', { designer_completed: 1 }, teamDefault)), true);
  assert.equal(gateAllows(teamDefault, req('PUT', '/tasks/5', { title: 'x' }, teamDefault)), true);
  assert.equal(gateAllows(teamDefault, req('DELETE', '/tasks/5', undefined, teamDefault)), true);
});

test('portão: cliente continua sem poder escrever em tarefas por esta camada', () => {
  assert.equal(gateAllows(client, req('PUT', '/tasks/5', { designer_completed: 1 }, client)), false);
});

test.after(() => {
  try { db.close(); } catch { /* ignora */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
