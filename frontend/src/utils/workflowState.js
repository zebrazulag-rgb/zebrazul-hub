const CANONICAL_STAGES = new Set(['todo', 'in_progress', 'correction', 'approval', 'approved', 'scheduled', 'posted']);
const DIRECTION_STATES = new Set(['pending', 'approved', 'changes_requested']);
const CLIENT_STATES = new Set(['waiting', 'pending', 'approved', 'changes_requested']);

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeWorkflowStage(stage, legacyStatus = '') {
  const raw = lower(stage);
  if (raw === 'internal_approval' || raw === 'external_approval') return 'approval';
  if (CANONICAL_STAGES.has(raw)) return raw;

  const status = lower(legacyStatus);
  if (status === 'posted') return 'posted';
  if (status === 'done') return 'approved';
  if (status === 'in_progress') return 'in_progress';
  return 'todo';
}

export function serverWorkflowStage(stage) {
  const normalized = normalizeWorkflowStage(stage);
  return normalized === 'approval' ? 'internal_approval' : normalized;
}

export function inferApprovalState(item) {
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

  return {
    stage,
    approvalStatus,
    directionStatus,
    clientStatus,
    correction,
  };
}

export function isHeldForDirection(item) {
  if (!item) return false;
  const state = inferApprovalState(item);
  const approvalStatus = lower(item.approval_status);
  const rawWorkflow = lower(item.workflow_stage);
  return state.directionStatus === 'approved'
    && state.clientStatus === 'waiting'
    && !['pending_approval', 'send', 'approved'].includes(approvalStatus)
    && !['external_approval', 'approved'].includes(rawWorkflow);
}

export function effectiveWorkflowStage(item) {
  const state = inferApprovalState(item);
  if (state.correction) return 'correction';
  if (['scheduled', 'posted'].includes(state.stage)) return state.stage;
  if (state.clientStatus === 'approved' || state.approvalStatus === 'approved') return 'approved';
  return state.stage;
}


export function workflowStagePresentation(item) {
  const stage = effectiveWorkflowStage(item);
  const meta = {
    todo: { stage, label: 'A fazer', tone: 'ink' },
    in_progress: { stage, label: 'Em produção', tone: 'blue' },
    correction: { stage, label: 'Correção', tone: 'pink' },
    approval: { stage, label: 'Na aprovação', tone: 'ink' },
    approved: { stage, label: 'Aprovada', tone: 'lime' },
    scheduled: { stage, label: 'Agendada', tone: 'lime' },
    posted: { stage, label: 'Postada', tone: 'blue' },
  };
  return meta[stage] || meta.todo;
}

export function directionIsApproved(item) {
  return inferApprovalState(item).directionStatus === 'approved';
}

export function clientIsApproved(item) {
  return inferApprovalState(item).clientStatus === 'approved';
}

export function isCorrectionItem(item) {
  return inferApprovalState(item).correction;
}

export function taskNeedsCorrection(item) {
  return isCorrectionItem(item) || Number(item?.subtask_correction || 0) > 0;
}

export function statusForDirection(item) {
  const state = inferApprovalState(item);
  if (state.directionStatus === 'approved') return 'approved';
  if (state.directionStatus === 'changes_requested') return 'rejected';
  return 'pending_approval';
}

export function statusForClient(item) {
  const state = inferApprovalState(item);
  if (state.clientStatus === 'approved') return 'approved';
  if (state.clientStatus === 'changes_requested') return 'rejected';
  return 'pending_approval';
}

export function directionStatusLabel(item) {
  const state = inferApprovalState(item);
  if (isHeldForDirection(item)) return 'Aprovada · não enviada ao cliente';
  if (state.directionStatus === 'approved') return 'Direção aprovada · enviada ao cliente';
  if (state.directionStatus === 'changes_requested') return 'Correção solicitada';
  return 'Aguardando direção';
}

export function clientStatusLabel(item) {
  const state = inferApprovalState(item);
  if (state.directionStatus !== 'approved') return 'Aguardando direção';
  if (state.clientStatus === 'approved') return 'Cliente aprovou';
  if (state.clientStatus === 'changes_requested') return 'Cliente pediu correção';
  return 'Aguardando cliente';
}

export function correctionFeedbackFor(item) {
  if (!item) return '';
  const state = inferApprovalState(item);
  const clientFeedback = String(item.client_feedback || '').trim();
  const directionFeedback = String(item.direction_feedback || '').trim();
  const correctionFeedback = String(item.correction_feedback || '').trim();
  if (state.clientStatus === 'changes_requested' && clientFeedback) return clientFeedback;
  if (state.directionStatus === 'changes_requested' && directionFeedback) return directionFeedback;
  return correctionFeedback || clientFeedback || directionFeedback;
}

export function correctionSourceFor(item) {
  if (lower(item?.correction_source) === 'client') return 'Cliente';
  if (inferApprovalState(item).clientStatus === 'changes_requested') return 'Cliente';
  return 'Direção';
}

export function approvalAgeDays(item, now = Date.now()) {
  const source = item?.updated_at || item?.direction_at || item?.client_at || item?.created_at || item?.due_date || item?.scheduled_at;
  const stamp = source ? new Date(source).getTime() : 0;
  if (!stamp || Number.isNaN(stamp)) return 0;
  return Math.max(0, Math.floor((Number(now) - stamp) / 86400000));
}

export function isStalledApproval(item, now = Date.now()) {
  if (!item || clientIsApproved(item)) return false;
  if (['approved', 'scheduled', 'posted'].includes(effectiveWorkflowStage(item))) return false;
  return approvalAgeDays(item, now) >= 3;
}

export function approvalOwnerMeta(item) {
  if (isCorrectionItem(item)) return { label: 'DESIGNER', tone: 'pink' };
  if (!directionIsApproved(item)) return { label: 'DIREÇÃO', tone: 'ink' };
  if (isHeldForDirection(item)) return { label: 'DIREÇÃO · ENVIAR', tone: 'ink' };
  if (clientIsApproved(item)) return { label: 'PRONTO', tone: 'lime' };
  return { label: 'CLIENTE', tone: 'blue' };
}

export function needsActionForApprovalMode(item, mode) {
  if (mode === 'correction') return isCorrectionItem(item);
  if (mode === 'client') return directionIsApproved(item) && !isHeldForDirection(item) && !isCorrectionItem(item) && !clientIsApproved(item);
  return !isCorrectionItem(item) && (!directionIsApproved(item) || isHeldForDirection(item));
}

export function legacyApprovalState(item) {
  const state = inferApprovalState(item);
  return { direction_status: state.directionStatus, client_status: state.clientStatus };
}
