import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalOwnerMeta,
  correctionFeedbackFor,
  correctionSourceFor,
  directionIsApproved,
  effectiveWorkflowStage,
  inferApprovalState,
  isHeldForDirection,
  normalizeWorkflowStage,
  serverWorkflowStage,
  taskNeedsCorrection,
} from '../src/utils/workflowState.js';

test('normaliza aliases de aprovação e status legado', () => {
  assert.equal(normalizeWorkflowStage('internal_approval'), 'approval');
  assert.equal(normalizeWorkflowStage('external_approval'), 'approval');
  assert.equal(normalizeWorkflowStage('', 'done'), 'approved');
  assert.equal(normalizeWorkflowStage('', 'posted'), 'posted');
  assert.equal(serverWorkflowStage('approval'), 'internal_approval');
});

test('peça aprovada pela direção e ainda retida continua com a direção', () => {
  const item = { workflow_stage: 'approval', approval_status: 'completed', direction_status: 'approved', client_status: 'waiting' };
  assert.equal(directionIsApproved(item), true);
  assert.equal(isHeldForDirection(item), true);
  assert.deepEqual(approvalOwnerMeta(item), { label: 'DIREÇÃO · ENVIAR', tone: 'ink' });
});

test('pending_approval legado significa direção aprovada e cliente pendente', () => {
  const state = inferApprovalState({ workflow_stage: 'approval', approval_status: 'pending_approval', direction_status: 'pending', client_status: 'waiting' });
  assert.equal(state.directionStatus, 'approved');
  assert.equal(state.clientStatus, 'pending');
  assert.equal(isHeldForDirection({ workflow_stage: 'approval', approval_status: 'pending_approval', direction_status: 'pending', client_status: 'waiting' }), false);
});

test('aprovação do cliente vence etapa approval e vira approved', () => {
  const item = { workflow_stage: 'approval', approval_status: 'approved', direction_status: 'approved', client_status: 'approved' };
  assert.equal(effectiveWorkflowStage(item), 'approved');
  assert.deepEqual(approvalOwnerMeta(item), { label: 'PRONTO', tone: 'lime' });
});

test('correção sempre tem precedência operacional', () => {
  const item = { workflow_stage: 'approved', approval_status: 'changes_requested', direction_status: 'approved', client_status: 'changes_requested', client_feedback: 'Trocar a chamada.' };
  assert.equal(effectiveWorkflowStage(item), 'correction');
  assert.equal(taskNeedsCorrection(item), true);
  assert.equal(correctionSourceFor(item), 'Cliente');
  assert.equal(correctionFeedbackFor(item), 'Trocar a chamada.');
  assert.deepEqual(approvalOwnerMeta(item), { label: 'DESIGNER', tone: 'pink' });
});

test('subtarefa em correção sinaliza a tarefa mãe', () => {
  assert.equal(taskNeedsCorrection({ workflow_stage: 'approved', subtask_correction: 2 }), true);
});
