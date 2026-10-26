const CANONICAL_STAGES = new Set(['todo', 'in_progress', 'correction', 'approval', 'approved', 'scheduled', 'posted']);
const DIRECTION_STATES = new Set(['pending', 'approved', 'changes_requested']);
const CLIENT_STATES = new Set(['waiting', 'pending', 'approved', 'changes_requested']);

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeWorkflowStage(stage, legacyStatus = '') {
  const raw = lower(stage);
  if (raw === 'internal_approval' || raw === 'external_approval') return 'approval';
  if (CANONICAL_STAGES.has(raw)) return raw;
  const status = lower(legacyStatus);
  if (status === 'posted') return 'posted';
  if (status === 'done') return 'approved';
  if (status === 'in_progress') return 'in_progress';
  return 'todo';
}

function legacyStatusForWorkflow(stage) {
  const normalized = normalizeWorkflowStage(stage);
  if (normalized === 'posted') return 'posted';
  if (normalized === 'approved' || normalized === 'scheduled') return 'done';
  if (['in_progress', 'correction', 'approval'].includes(normalized)) return 'in_progress';
  return 'pending';
}

function workflowStageFromLegacy(status) {
  return normalizeWorkflowStage('', status);
}

function inferApprovalState(item) {
  const approvalStatus = lower(item?.approval_status);
  const rawWorkflow = lower(item?.workflow_stage);
  const stage = normalizeWorkflowStage(rawWorkflow, item?.status);
  let directionStatus = DIRECTION_STATES.has(lower(item?.direction_status)) ? lower(item.direction_status) : 'pending';
  let clientStatus = CLIENT_STATES.has(lower(item?.client_status)) ? lower(item.client_status) : 'waiting';

  const correction = approvalStatus === 'changes_requested'
    || stage === 'correction'
    || directionStatus === 'changes_requested'
    || clientStatus === 'changes_requested';

  // Correção sempre vence marcadores antigos de aprovado/approval. Isso evita
  // a mesma peça aparecer como aprovada em uma tela e em correção em outra.
  if (correction) {
    if (clientStatus === 'changes_requested' || lower(item?.correction_source) === 'client') {
      directionStatus = 'approved';
      clientStatus = 'changes_requested';
    } else {
      directionStatus = 'changes_requested';
      clientStatus = 'waiting';
    }
  } else {
    // Estado explícito do cliente é o sinal mais forte da etapa de aprovação.
    if (clientStatus === 'approved' || clientStatus === 'pending') directionStatus = 'approved';

    // Compatibilidade com versões antigas que gravavam a decisão só nesses campos.
    if (approvalStatus === 'approved' || rawWorkflow === 'approved') {
      directionStatus = 'approved';
      clientStatus = 'approved';
    } else if (['pending_approval', 'send'].includes(approvalStatus) || rawWorkflow === 'external_approval') {
      if (directionStatus === 'pending') directionStatus = 'approved';
      if (clientStatus === 'waiting') clientStatus = 'pending';
    }
  }

  return { stage, approvalStatus, directionStatus, clientStatus, correction };
}

function effectiveWorkflowStage(item) {
  const state = inferApprovalState(item);
  if (state.correction) return 'correction';
  if (['scheduled', 'posted'].includes(state.stage)) return state.stage;
  if (state.clientStatus === 'approved' || state.approvalStatus === 'approved') return 'approved';
  return state.stage;
}

function isHeldForDirection(item) {
  if (!item) return false;
  const state = inferApprovalState(item);
  const approvalStatus = lower(item.approval_status);
  const rawWorkflow = lower(item.workflow_stage);
  return state.directionStatus === 'approved'
    && state.clientStatus === 'waiting'
    && !['pending_approval', 'send', 'approved'].includes(approvalStatus)
    && !['external_approval', 'approved'].includes(rawWorkflow);
}

function designerApprovalReady(item) {
  if (!item || isHeldForDirection(item)) return false;
  const state = inferApprovalState(item);
  return state.directionStatus === 'approved';
}

module.exports = {
  normalizeWorkflowStage,
  legacyStatusForWorkflow,
  workflowStageFromLegacy,
  inferApprovalState,
  effectiveWorkflowStage,
  isHeldForDirection,
  designerApprovalReady,
};
