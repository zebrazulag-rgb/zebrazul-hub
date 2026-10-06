// Backlog: fora dos contadores, do painel, da aprovação e do calendário; volta ao fluxo ao ser promovida.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(process.env.TEST_TMP_DIR || os.tmpdir(), 'zh-backlog-test-'));
process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = path.join(tmpDir, 'zebrazul_hub.sqlite');
process.env.AUTO_BACKUP_ON_START = 'false';

const db = require('../db/database');
const { buildManagerDashboard } = require('../services/managerDashboard');

const agencyId = Number(db.prepare('SELECT id FROM agencies ORDER BY id LIMIT 1').get().id);
const clientId = Number(db.prepare('INSERT INTO clients (agency_id, name, status) VALUES (?, ?, ?)').run(agencyId, 'Bee', 'active').lastInsertRowid);
const uid = Number(db.prepare('INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(agencyId, 'U', 'u@t.com', 'x', 'admin').lastInsertRowid);
const mk = (title, extra = {}) => Number(db.prepare(`
  INSERT INTO tasks (agency_id, client_id, created_by, task_type, title, status, workflow_stage, is_backlog, parent_task_id, due_date)
  VALUES (?, ?, ?, 'basic', ?, 'pending', 'todo', ?, ?, ?)`)
  .run(agencyId, clientId, uid, title, extra.is_backlog || 0, extra.parent || null, extra.due || '2020-01-01').lastInsertRowid);

const ativa = mk('Ativa');
const bk = mk('Ideia futura', { is_backlog: 1 });
const bkSub = mk('Sub da ideia', { parent: bk });

test('coluna is_backlog existe e o padrão é 0', () => {
  assert.equal(db.prepare('SELECT is_backlog FROM tasks WHERE id = ?').get(ativa).is_backlog, 0);
});

test('painel do gestor ignora backlog e subtarefas do backlog', () => {
  const r = buildManagerDashboard(db, { agencyId, today: '2026-10-06' });
  const ids = [...r.queue, ...r.abandoned].map((q) => q.id);
  assert.ok(ids.includes(ativa));
  assert.ok(!ids.includes(bk));
  assert.ok(!ids.includes(bkSub));
});

test('promover tira do backlog e a tarefa passa a contar', () => {
  db.prepare('UPDATE tasks SET is_backlog = 0 WHERE id = ?').run(bk);
  const r = buildManagerDashboard(db, { agencyId, today: '2026-10-06' });
  const ids = [...r.queue, ...r.abandoned].map((q) => q.id);
  assert.ok(ids.includes(bkSub) || ids.includes(bk));
});
