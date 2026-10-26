const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clampDays,
  percent,
  stageForTask,
  isCorrectionTouched,
  demandTypeLabel,
  buildSignals,
} = require('../utils/operationalIntelligence');

test('clampDays aceita apenas janelas suportadas', () => {
  assert.equal(clampDays(60), 60);
  assert.equal(clampDays('180'), 180);
  assert.equal(clampDays(12), 30);
});

test('percent evita divisão por zero', () => {
  assert.equal(percent(3, 10), 30);
  assert.equal(percent(2, 0), 0);
});

test('stageForTask respeita correção canônica', () => {
  assert.equal(stageForTask({ workflow_stage: 'approved', approval_status: 'changes_requested' }), 'correction');
  assert.equal(stageForTask({ workflow_stage: 'internal_approval', direction_status: 'approved', client_status: 'pending' }), 'approval');
});

test('correção histórica pode ser inferida pelo feedback persistido', () => {
  assert.equal(isCorrectionTouched({ workflow_stage: 'approved', direction_feedback: 'Ajustar capa' }), true);
  assert.equal(isCorrectionTouched({ workflow_stage: 'approved' }), false);
});

test('tipo do briefing prevalece sobre tipo legado', () => {
  assert.equal(demandTypeLabel({ briefing_json: JSON.stringify({ type: 'landing_page' }), task_type: 'basic' }), 'Landing Page');
});

test('sinais detectam prazo e retrabalho sem transformar equipe em ranking', () => {
  const signals = buildSignals({
    summary: { open: 10, overdue_open: 3, correction_rate: 40, created: 10, approved_without_date: 0, waiting_client: 1, waiting_direction: 1 },
    stages: [],
    team: [{ name: 'A', open: 8 }, { name: 'B', open: 3 }],
    clients: [],
    audiovisual: {},
  });
  assert.ok(signals.some((item) => item.title === 'PRAZO TÁ VAZANDO.'));
  assert.ok(signals.some((item) => item.title === 'RETRABALHO TÁ COBRANDO.'));
  assert.ok(signals.some((item) => item.title === 'A CARGA NÃO TÁ BEM DIVIDIDA.'));
});
