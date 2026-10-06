// Aprovação da direção NÃO libera ao cliente; só "Enviar ao cliente" libera.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-hold-test-'));
process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = path.join(tmpDir, 'zebrazul_hub.sqlite');
process.env.AUTO_BACKUP_ON_START = 'false';

const db = require('../db/database');
const svc = require('../services/designerApprovals');
const { buildManagerDashboard } = require('../services/managerDashboard');

const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const userId = Number(db.prepare('INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
  .run(agencyId, 'Dir', 'dir@t.com', 'x', 'admin').lastInsertRowid);
const clientId = Number(db.prepare('INSERT INTO clients (agency_id, name, status) VALUES (?, ?, ?)').run(agencyId, 'Dentoessence', 'active').lastInsertRowid);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function newTask(title) {
  return Number(db.prepare(`
    INSERT INTO tasks (agency_id, client_id, created_by, task_type, title, status, workflow_stage, approval_status,
                       attachment_data, attachment_mime, attachment_filename)
    VALUES (?, ?, ?, 'post', ?, 'in_progress', 'approval', 'completed', ?, 'image/png', 'a.png')
  `).run(agencyId, clientId, userId, title, PNG).lastInsertRowid);
}
const row = (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
const link = () => svc.getOrCreateClientApprovalLink({ agencyId, clientId, createdBy: userId });
const publicItems = () => svc.getPublicApprovalItems(svc.getLinkByToken(link().token));
const feedCount = () => db.prepare('SELECT COUNT(*) n FROM posts WHERE agency_id = ? AND feed_visible = 1').get(agencyId).n;

test('aprovar pela direção retém a peça: não vai ao link do cliente nem à grade', () => {
  const id = newTask('Facetas');
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  const t = row(id);
  assert.equal(t.direction_status, 'approved');
  assert.equal(t.client_status, 'waiting');
  assert.equal(t.approval_status, 'completed');
  assert.ok(svc.isHeldForDirection(t));
  assert.ok(!publicItems().some((i) => i.id === id));
  assert.equal(feedCount(), 0);
});

test('sincronização da grade não libera peça retida', () => {
  svc.syncClientApprovalTasksToFeed?.(agencyId, clientId);
  assert.equal(feedCount(), 0);
});

test('cliente não consegue decidir sobre peça retida (mesmo conhecendo o id)', () => {
  const id = newTask('Retida B');
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  const r = svc.setClientDecision({ token: link().token, taskId: id, decision: 'approved' });
  assert.equal(r.error, 'NOT_READY');
  assert.equal(row(id).client_status, 'waiting');
});

test('Enviar ao cliente libera para o link e para a grade', () => {
  const id = newTask('Enviar C');
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  const res = svc.sendToClient({ task: row(id) });
  assert.equal(res.ok, true);
  assert.equal(row(id).client_status, 'pending');
  assert.equal(row(id).approval_status, 'pending_approval');
  assert.ok(!svc.isHeldForDirection(row(id)));
  const item = publicItems().find((i) => i.id === id);
  assert.ok(item);
  assert.equal(item.client_status, 'pending');
  assert.ok(feedCount() >= 1);
  // cliente agora consegue aprovar
  assert.equal(svc.setClientDecision({ token: link().token, taskId: id, decision: 'approved' }).ok, true);
});

test('enviar duas vezes é idempotente; enviar sem aprovação da direção falha', () => {
  const id = newTask('Idem D');
  assert.throws(() => svc.sendToClient({ task: row(id) }), /direção precisa aprovar/);
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  svc.sendToClient({ task: row(id) });
  assert.equal(svc.sendToClient({ task: row(id) }).already_sent, true);
});

test('correção da direção continua tirando a peça do cliente', () => {
  const id = newTask('Correção E');
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  svc.sendToClient({ task: row(id) });
  svc.setDirectionDecision({ task: row(id), userId, decision: 'changes_requested', feedback: 'ajustar título' });
  assert.ok(!publicItems().some((i) => i.id === id));
  assert.equal(row(id).workflow_stage, 'correction');
});

test('peças já enviadas antes da mudança (client_status pending) seguem visíveis', () => {
  const id = newTask('Legada F');
  db.prepare(`UPDATE tasks SET direction_status='approved', client_status='pending', approval_status='pending_approval' WHERE id=?`).run(id);
  assert.ok(!svc.isHeldForDirection(row(id)));
  assert.ok(publicItems().some((i) => i.id === id));
});

test('painel do gestor mostra peça retida como "enviar ao cliente"', () => {
  const id = newTask('Painel G');
  svc.setDirectionDecision({ task: row(id), userId, decision: 'approved' });
  const r = buildManagerDashboard(db, { agencyId, today: new Date().toISOString().slice(0, 10) });
  const q = r.queue.find((x) => x.id === id);
  assert.ok(q, 'item na fila');
  assert.equal(q.type, 'send_to_client');
  assert.equal(r.funnel.find((f) => f.phase === 'approval_held').count >= 1, true);
  assert.ok(r.summary.send_to_client >= 1);
});
