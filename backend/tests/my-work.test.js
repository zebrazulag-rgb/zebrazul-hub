const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTaskForUser, severityForDue, sortWorkItems } = require('../services/myWork');

const today = '2026-10-26';

function item(overrides = {}) {
  return {
    id: 1,
    phase: 'todo',
    due_date: null,
    idle_days: 0,
    feedback: null,
    source: null,
    ...overrides,
  };
}

test('prazo vencido recebe severidade máxima', () => {
  assert.equal(severityForDue('2026-10-25', today), 3);
  assert.equal(severityForDue('2026-10-26', today), 2);
  assert.equal(severityForDue('2026-10-28', today), 1);
  assert.equal(severityForDue('2026-11-10', today), 0);
});

test('correção atribuída ao usuário vira ação urgente', () => {
  const result = classifyTaskForUser(item({ phase: 'correction', feedback: 'Trocar a foto.' }), {
    isManager: false,
    assignedToUser: true,
    today,
  });
  assert.equal(result.bucket, 'action');
  assert.equal(result.action, 'Corrigir');
  assert.equal(result.severity, 3);
  assert.equal(result.reason, 'Trocar a foto.');
});

test('aprovação da direção fica com gestor mesmo sem atribuição', () => {
  const result = classifyTaskForUser(item({ phase: 'approval_direction', idle_days: 2 }), {
    isManager: true,
    assignedToUser: false,
    today,
  });
  assert.equal(result.bucket, 'action');
  assert.equal(result.action, 'Aprovar direção');
  assert.equal(result.severity, 2);
});

test('peça em aprovação fica fora da mão do designer', () => {
  const result = classifyTaskForUser(item({ phase: 'approval_client' }), {
    isManager: false,
    assignedToUser: true,
    today,
  });
  assert.equal(result.bucket, 'waiting');
  assert.equal(result.reason, 'Aguardando cliente');
});

test('tarefa não atribuída não entra na fila pessoal do membro', () => {
  const result = classifyTaskForUser(item({ phase: 'in_progress', idle_days: 5 }), {
    isManager: false,
    assignedToUser: false,
    today,
  });
  assert.equal(result, null);
});

test('ordenação põe urgência e atraso antes', () => {
  const rows = [
    { id: 3, severity: 1, late_days: 0, due_date: '2026-10-27' },
    { id: 2, severity: 3, late_days: 1, due_date: '2026-10-25' },
    { id: 1, severity: 3, late_days: 4, due_date: '2026-10-22' },
  ].sort(sortWorkItems);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
});
