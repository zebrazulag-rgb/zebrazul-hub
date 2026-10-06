// Testes do Painel do Gestor (services/managerDashboard.js). Banco temporário e isolado.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-mgr-test-'));
process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = path.join(tmpDir, 'zebrazul_hub.sqlite');
process.env.AUTO_BACKUP_ON_START = 'false';

const db = require('../db/database');
const { buildManagerDashboard, addDays, daysBetween } = require('../services/managerDashboard');
const { apiPermissionForRequest } = require('../services/permissions');

const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const TODAY = '2026-10-06';

const user = (name) => Number(db.prepare('INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
  .run(agencyId, name, `${name.toLowerCase()}@t.com`, 'x', 'team').lastInsertRowid);
const client = (name, status = 'active') => Number(db.prepare('INSERT INTO clients (agency_id, name, status) VALUES (?, ?, ?)').run(agencyId, name, status).lastInsertRowid);
const creator = user('Criador');
const erick = user('Erick');
const julia = user('Julia');

function task(o) {
  const id = Number(db.prepare(`
    INSERT INTO tasks (agency_id, client_id, created_by, parent_task_id, task_type, title, status, workflow_stage,
                       approval_status, direction_status, client_status, due_date, updated_at, created_at)
    VALUES (@agency_id, @client_id, @created_by, @parent_task_id, 'post', @title, @status, @workflow_stage,
            @approval_status, @direction_status, @client_status, @due_date, @updated_at, @updated_at)
  `).run({
    agency_id: agencyId, client_id: null, created_by: creator, parent_task_id: null,
    status: 'in_progress', workflow_stage: 'in_progress', approval_status: 'completed',
    direction_status: 'pending', client_status: 'waiting', due_date: null, ...o,
  }).lastInsertRowid);
  (o.assignees || []).forEach((uid) => db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').run(id, uid));
  return id;
}

const stamp = (daysAgo) => `${addDays(TODAY, -daysAgo)} 10:00:00`;

const altus = client('Altus');
const espinel = client('Espinel');
const saudavel = client('Saudavel');
const pausado = client('Pausado', 'paused');

// Altus: tarefa-mãe com 4 subtarefas em situações diferentes
const altusParent = task({ client_id: altus, title: 'Cronograma Altus', status: 'done', workflow_stage: 'approved', updated_at: stamp(1) });
const sCorrecao = task({ client_id: altus, parent_task_id: altusParent, title: 'Sub correção', workflow_stage: 'correction', status: 'in_progress', direction_status: 'changes_requested', updated_at: stamp(2), due_date: addDays(TODAY, 2), assignees: [erick] });
const sAprovDirecao = task({ client_id: altus, parent_task_id: altusParent, title: 'Sub aprovação direção', workflow_stage: 'approval', updated_at: stamp(4), due_date: addDays(TODAY, 3), assignees: [erick] });
const sAprovCliente = task({ client_id: altus, parent_task_id: altusParent, title: 'Sub aguardando cliente', workflow_stage: 'approval', direction_status: 'approved', client_status: 'pending', updated_at: stamp(6), due_date: addDays(TODAY, 4), assignees: [julia] });
const sPronta = task({ client_id: altus, parent_task_id: altusParent, title: 'Sub pronta', status: 'done', workflow_stage: 'approved', updated_at: stamp(0), due_date: addDays(TODAY, 1), assignees: [julia] });

// Espinel: atrasada, sem responsável, e uma abandonada
const atrasada = task({ client_id: espinel, title: 'Atrasada Espinel', workflow_stage: 'in_progress', status: 'in_progress', due_date: addDays(TODAY, -6), updated_at: stamp(1), assignees: [erick] });
const semResp = task({ client_id: espinel, title: 'Sem responsável', workflow_stage: 'todo', status: 'pending', due_date: addDays(TODAY, 2), updated_at: stamp(0) });
const velha = task({ client_id: espinel, title: 'Tarefa de agosto', workflow_stage: 'in_progress', status: 'in_progress', due_date: addDays(TODAY, -40), updated_at: stamp(45), assignees: [erick] });

// Saudavel: tudo pronto + postado recentemente
task({ client_id: saudavel, title: 'Pronta A', status: 'done', workflow_stage: 'scheduled', due_date: addDays(TODAY, 1), updated_at: stamp(0), assignees: [julia] });
task({ client_id: saudavel, title: 'Pronta B', status: 'done', workflow_stage: 'approved', due_date: addDays(TODAY, 3), updated_at: stamp(0), assignees: [julia] });
task({ client_id: saudavel, title: 'Postada ontem', status: 'posted', workflow_stage: 'posted', due_date: addDays(TODAY, -1), updated_at: stamp(1), assignees: [julia] });

// Cliente pausado nunca entra
task({ client_id: pausado, title: 'Do pausado', due_date: addDays(TODAY, -10), updated_at: stamp(10) });

const result = buildManagerDashboard(db, { agencyId, today: TODAY });
const queueIds = result.queue.map((q) => q.id);

test('tarefa-mãe com subtarefas não entra na fila (sem dupla contagem)', () => {
  assert.ok(!queueIds.includes(altusParent));
});

test('correção pedida vira item de severidade 3 com origem identificada', () => {
  const item = result.queue.find((q) => q.id === sCorrecao);
  assert.equal(item.type, 'correction');
  assert.equal(item.severity, 3);
  assert.equal(item.source, 'direção');
  assert.equal(item.parent_title, 'Cronograma Altus');
});

test('aprovação parada aguarda a direção e herda dias parados', () => {
  const item = result.queue.find((q) => q.id === sAprovDirecao);
  assert.equal(item.type, 'approval_direction');
  assert.equal(item.days, 4);
  assert.equal(item.severity, 3);
});

test('aprovação do cliente só entra na fila depois de 2 dias, e vale cobrar', () => {
  const item = result.queue.find((q) => q.id === sAprovCliente);
  assert.equal(item.type, 'approval_client');
  assert.equal(item.severity, 3);
  assert.match(item.detail, /cobrar/);
});

test('atrasada aparece com dias de atraso', () => {
  const item = result.queue.find((q) => q.id === atrasada);
  assert.equal(item.type, 'overdue');
  assert.equal(item.days, 6);
});

test('peça pronta e peça postada não entram na fila', () => {
  assert.ok(!queueIds.includes(sPronta));
});

test('tarefa sem movimento há 30+ dias vai para "abandonadas", não polui a fila', () => {
  assert.ok(!queueIds.includes(velha));
  assert.ok(result.abandoned.some((a) => a.id === velha));
  assert.equal(result.summary.abandoned, 1);
});

test('cliente pausado é ignorado em tudo', () => {
  assert.ok(!result.clients.some((c) => c.name === 'Pausado'));
  assert.ok(!queueIds.some((id) => result.queue.find((q) => q.id === id)?.client_name === 'Pausado'));
});

test('fila ordenada por severidade e depois por dias', () => {
  for (let i = 1; i < result.queue.length; i += 1) {
    const a = result.queue[i - 1];
    const b = result.queue[i];
    assert.ok(a.severity > b.severity || (a.severity === b.severity && a.days >= b.days));
  }
});

test('saúde dos clientes: verde para quem tem tudo pronto, vermelho/amarelo para os demais', () => {
  const by = Object.fromEntries(result.clients.map((c) => [c.name, c]));
  assert.equal(by.Saudavel.level, 'green');
  assert.equal(by.Saudavel.days_since_last_post, 1);
  assert.equal(by.Espinel.level, 'red'); // atrasada há 6 dias
  assert.match(by.Espinel.reasons[0].text, /atrasada/);
  assert.equal(by.Altus.level, 'red'); // cliente sem responder há 6 dias
  assert.ok(by.Altus.reasons.some((r) => /Cliente sem responder/.test(r.text)));
  assert.equal(result.clients[0].level, 'red');
  assert.equal(result.clients.at(-1).level, 'green');
});

test('cliente sem nada planejado e sem post recente fica vermelho', () => {
  const vazio = client('Vazio');
  const fresh = buildManagerDashboard(db, { agencyId, today: TODAY });
  const row = fresh.clients.find((c) => c.client_id === vazio);
  assert.equal(row.level, 'red');
  assert.match(row.reasons[0].text, /Nada planejado/);
});

test('carga da equipe: "Sem responsável" no topo, abandonadas fora da contagem', () => {
  assert.equal(result.team[0].name, 'Sem responsável');
  const e = result.team.find((t) => t.name === 'Erick');
  // Erick: correção, aprovação direção, atrasada (a velha de agosto é abandonada e não conta)
  assert.equal(e.open, 3);
  assert.equal(e.overdue, 1);
  assert.equal(e.correction, 1);
  assert.equal(e.waiting_approval, 1);
});

test('subtarefa sem responsável herda os da tarefa-mãe', () => {
  const pai = task({ client_id: altus, title: 'Mãe com responsável', status: 'done', workflow_stage: 'approved', updated_at: stamp(0), assignees: [julia] });
  const filha = task({ client_id: altus, parent_task_id: pai, title: 'Filha herda', workflow_stage: 'approval', updated_at: stamp(0) });
  const r = buildManagerDashboard(db, { agencyId, today: TODAY });
  const item = r.queue.find((q) => q.id === filha);
  assert.deepEqual(item.assignees.map((a) => a.name), ['Julia']);
});

test('fluxo: contagem por fase e postados dos últimos 7 dias', () => {
  const f = Object.fromEntries(result.funnel.map((x) => [x.phase, x]));
  assert.equal(f.correction.count, 1);
  assert.equal(f.approval_direction.count, 1);
  assert.equal(f.approval_client.count, 1);
  assert.equal(f.ready.count, 3); // sub pronta + 2 do Saudavel
  assert.equal(result.summary.posted_last_7_days, 1);
});

test('somente leitura: nenhuma tarefa foi alterada pelo cálculo', () => {
  const before = db.prepare('SELECT COUNT(*) n, SUM(length(updated_at)) s FROM tasks').get();
  buildManagerDashboard(db, { agencyId, today: TODAY });
  assert.deepEqual(db.prepare('SELECT COUNT(*) n, SUM(length(updated_at)) s FROM tasks').get(), before);
});

test('isolamento por agência: outra agência não vê estes dados', () => {
  const other = buildManagerDashboard(db, { agencyId: agencyId + 999, today: TODAY });
  assert.equal(other.queue_total, 0);
  assert.equal(other.clients.length, 0);
});

test('permissões: rota do gestor mapeia para dashboard.view', () => {
  assert.equal(apiPermissionForRequest({ method: 'GET', path: '/manager-dashboard', user: { role: 'admin' } }), 'dashboard.view');
});

test('datas: utilitários', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-10-01', '2026-10-06'), 5);
});
