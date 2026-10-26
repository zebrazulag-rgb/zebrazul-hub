const test = require('node:test');
const assert = require('node:assert/strict');
const {
  designerApprovalReady,
  effectiveWorkflowStage,
  inferApprovalState,
  isHeldForDirection,
  legacyStatusForWorkflow,
  normalizeWorkflowStage,
  workflowStageFromLegacy,
} = require('../utils/workflowState');

test('workflow canônico mantém compatibilidade com aliases legados', () => {
  assert.equal(normalizeWorkflowStage('internal_approval'), 'approval');
  assert.equal(normalizeWorkflowStage('external_approval'), 'approval');
  assert.equal(workflowStageFromLegacy('done'), 'approved');
  assert.equal(legacyStatusForWorkflow('approval'), 'in_progress');
  assert.equal(legacyStatusForWorkflow('scheduled'), 'done');
});

test('direção aprovada mas não enviada ao cliente fica retida', () => {
  const item = { workflow_stage: 'approval', approval_status: 'completed', direction_status: 'approved', client_status: 'waiting' };
  assert.equal(isHeldForDirection(item), true);
  assert.equal(designerApprovalReady(item), false);
});

test('estado legado pending_approval é interpretado como cliente pendente', () => {
  const item = { workflow_stage: 'approval', approval_status: 'pending_approval', direction_status: 'pending', client_status: 'waiting' };
  const state = inferApprovalState(item);
  assert.equal(state.directionStatus, 'approved');
  assert.equal(state.clientStatus, 'pending');
  assert.equal(designerApprovalReady(item), true);
});

test('decisão do cliente aprovada resulta em etapa efetiva approved', () => {
  const item = { workflow_stage: 'approval', approval_status: 'approved', direction_status: 'approved', client_status: 'approved' };
  assert.equal(effectiveWorkflowStage(item), 'approved');
});

test('correção vence estados conflitantes', () => {
  const item = { workflow_stage: 'approved', approval_status: 'changes_requested', direction_status: 'approved', client_status: 'changes_requested' };
  assert.equal(effectiveWorkflowStage(item), 'correction');
});
