const { effectiveWorkflowStage } = require('./workflowState');

function normalizeDay(value) {
  const text = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeScope(value) {
  return String(value || '').toLowerCase() === 'mine' ? 'mine' : 'team';
}

function classifyTask(task) {
  const stage = effectiveWorkflowStage(task || {});
  if (stage === 'correction' || stage === 'approval') {
    return { type: 'approval', label: stage === 'correction' ? 'Correção' : 'Aprovação', stage };
  }
  if (stage === 'scheduled' || stage === 'posted') {
    return { type: 'post', label: stage === 'posted' ? 'Publicado' : 'Postagem', stage };
  }
  return { type: 'delivery', label: 'Entrega', stage };
}

function headlineForSummary(summary = {}) {
  const total = Number(summary.total || 0);
  const recordings = Number(summary.recording || 0);
  const approvals = Number(summary.approval || 0);
  const deliveries = Number(summary.delivery || 0);
  if (!total) return 'TEM ESPAÇO AQUI. MILAGRE.';
  if (total >= 24) return 'SEMANA CHEIA. ORGANIZA O JOGO.';
  if (recordings >= 4) return 'TEM GRAVAÇÃO NA RUA.';
  if (approvals >= 5) return 'TEM APROVAÇÃO PEDINDO RITMO.';
  if (deliveries >= 8) return 'A ENTREGA TÁ PUXADA.';
  return 'A OPERAÇÃO TÁ NO MAPA.';
}

function splitList(value) {
  return String(value || '').split('|').map((item) => item.trim()).filter(Boolean);
}

module.exports = {
  normalizeDay,
  normalizeScope,
  classifyTask,
  headlineForSummary,
  splitList,
};
