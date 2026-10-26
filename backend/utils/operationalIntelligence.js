const { effectiveWorkflowStage, inferApprovalState } = require('./workflowState');

function clampDays(value) {
  const parsed = Number(value);
  if (![30, 60, 90, 180].includes(parsed)) return 30;
  return parsed;
}

function safeStamp(value) {
  if (!value) return 0;
  const stamp = new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z')).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function hoursBetween(from, to) {
  const start = safeStamp(from);
  const end = safeStamp(to);
  if (!start || !end || end < start) return null;
  return Math.round(((end - start) / 3600000) * 10) / 10;
}

function ageDays(value, now = Date.now()) {
  const stamp = safeStamp(value);
  if (!stamp) return 0;
  return Math.max(0, Math.floor((Number(now) - stamp) / 86400000));
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, item) => sum + item, 0) / nums.length) * 10) / 10;
}

function percent(part, total) {
  const a = Number(part || 0);
  const b = Number(total || 0);
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function stageForTask(task) {
  return effectiveWorkflowStage(task || {});
}

function isCorrectionTouched(task) {
  const state = inferApprovalState(task || {});
  return Boolean(
    state.correction
    || String(task?.direction_feedback || '').trim()
    || String(task?.client_feedback || '').trim()
  );
}

function correctionSource(task) {
  const direction = String(task?.direction_feedback || '').trim();
  const client = String(task?.client_feedback || '').trim();
  const state = inferApprovalState(task || {});
  if (client || state.clientStatus === 'changes_requested') return 'client';
  if (direction || state.directionStatus === 'changes_requested') return 'direction';
  return null;
}

function completionStamp(task) {
  const stage = stageForTask(task);
  if (stage === 'posted') return task?.posted_at || task?.updated_at || null;
  if (['approved', 'scheduled'].includes(stage)) return task?.client_at || task?.direction_at || task?.updated_at || null;
  return null;
}

function isOnTime(task) {
  if (!task?.due_date) return null;
  const completed = completionStamp(task);
  if (!completed) return null;
  const due = safeStamp(`${String(task.due_date).slice(0, 10)}T23:59:59`);
  const completedStamp = safeStamp(completed);
  if (!due || !completedStamp) return null;
  return completedStamp <= due;
}

function parseBriefingType(task) {
  try {
    const parsed = typeof task?.briefing_json === 'string' ? JSON.parse(task.briefing_json) : task?.briefing_json;
    const raw = String(parsed?.type || parsed?.demand_type || '').trim();
    if (raw) return raw;
  } catch {}
  return String(task?.content_type || task?.task_type || 'outro').trim() || 'outro';
}

const TYPE_LABELS = {
  static_post: 'Post estático',
  post: 'Post',
  carousel: 'Carrossel',
  carrossel: 'Carrossel',
  reels: 'Reels',
  reel: 'Reels',
  stories: 'Stories',
  story: 'Stories',
  campaign: 'Campanha',
  landing_page: 'Landing Page',
  branding: 'Branding',
  print: 'Material impresso',
  event: 'Evento',
  audiovisual: 'Audiovisual',
  video: 'Audiovisual',
  traffic: 'Tráfego/Mídia',
  feed: 'Post',
  basic: 'Demanda',
  other: 'Outro',
  outro: 'Outro',
};

function demandTypeLabel(task) {
  const key = parseBriefingType(task).toLowerCase().replace(/[\s-]+/g, '_');
  return TYPE_LABELS[key] || parseBriefingType(task);
}

function stageLabel(stage) {
  return ({
    todo: 'A fazer',
    in_progress: 'Produção',
    correction: 'Correção',
    approval: 'Aprovação',
    approved: 'Aprovado',
    scheduled: 'Agendado',
    posted: 'Postado',
  })[stage] || 'Operação';
}

function buildSignals({ summary = {}, stages = [], team = [], clients = [], audiovisual = {} } = {}) {
  const signals = [];
  const open = Number(summary.open || 0);
  const overdue = Number(summary.overdue_open || 0);
  const correctionRate = Number(summary.correction_rate || 0);
  const approvedUndated = Number(summary.approved_without_date || 0);
  const waitingClient = Number(summary.waiting_client || 0);
  const waitingDirection = Number(summary.waiting_direction || 0);
  const overdueRate = percent(overdue, open);

  if (overdue >= 3 && overdueRate >= 20) {
    signals.push({ tone: 'pink', title: 'PRAZO TÁ VAZANDO.', body: `${overdueRate}% do trabalho aberto já passou do prazo.`, action: 'Olhe primeiro o que está vencido e redistribua antes de puxar coisa nova.' });
  }
  if (correctionRate >= 30 && Number(summary.created || 0) >= 5) {
    signals.push({ tone: 'pink', title: 'RETRABALHO TÁ COBRANDO.', body: `${correctionRate}% das demandas do período têm sinal de correção registrado.`, action: 'Vale olhar briefing, alinhamento e o momento em que a peça entra em aprovação.' });
  }
  if (approvedUndated >= 2) {
    signals.push({ tone: 'lime', title: 'APROVOU E PAROU.', body: `${approvedUndated} peças estão aprovadas sem data definida.`, action: 'O gargalo agora não é criação. É transformar aprovação em publicação.' });
  }
  if (waitingClient >= 4 && waitingClient > waitingDirection * 1.4) {
    signals.push({ tone: 'blue', title: 'A BOLA TÁ MAIS COM O CLIENTE.', body: `${waitingClient} peças aguardam cliente contra ${waitingDirection} aguardando direção.`, action: 'Agrupe cobranças e tire aprovações antigas da fila.' });
  }
  if (waitingDirection >= 4 && waitingDirection > waitingClient * 1.4) {
    signals.push({ tone: 'ink', title: 'O CLIENTE NÃO É O PROBLEMA.', body: `${waitingDirection} peças aguardam direção contra ${waitingClient} aguardando cliente.`, action: 'O maior represamento está antes do envio externo.' });
  }

  const teamLoads = team.map((member) => Number(member.open || 0)).filter((value) => value > 0).sort((a, b) => a - b);
  if (teamLoads.length >= 2) {
    const max = Math.max(...teamLoads);
    const minPositive = Math.min(...teamLoads);
    if (max >= 6 && max >= minPositive * 2) {
      signals.push({ tone: 'blue', title: 'A CARGA NÃO TÁ BEM DIVIDIDA.', body: `A maior fila individual tem ${max} itens; a menor fila ativa tem ${minPositive}.`, action: 'Use isso como sinal de capacidade, não como ranking de pessoas.' });
    }
  }

  const stalled = stages.find((item) => Number(item.avg_idle_days || 0) >= 4 && Number(item.count || 0) >= 2);
  if (stalled) {
    signals.push({ tone: 'ink', title: 'TEM ETAPA ENVELHECENDO.', body: `${stalled.label} está com média de ${stalled.avg_idle_days} dias sem movimento.`, action: 'Abra essa etapa e descubra se falta decisão, informação ou responsável.' });
  }

  if (Number(audiovisual.ready_unpublished || 0) >= 2) {
    signals.push({ tone: 'lime', title: 'TEM VÍDEO PRONTO PRA SAIR.', body: `${audiovisual.ready_unpublished} vídeos já passaram da edição e ainda não foram publicados.`, action: 'A produção terminou; o próximo gargalo é distribuição.' });
  }

  const topClient = clients.find((client) => Number(client.correction_rate || 0) >= 40 && Number(client.created || 0) >= 4);
  if (topClient) {
    signals.push({ tone: 'pink', title: 'TEM UM CLIENTE PEDINDO MAIS VOLTAS.', body: `${topClient.name}: ${topClient.correction_rate}% das demandas do período têm sinal de correção.`, action: 'Antes de culpar a aprovação, revise se briefing e expectativa estão alinhados.' });
  }

  if (!signals.length) {
    signals.push({ tone: 'lime', title: 'OPERAÇÃO RESPIRANDO.', body: 'Nenhum sinal forte de gargalo apareceu com os dados disponíveis neste recorte.', action: 'Continue olhando tendência e contexto — um número isolado não manda na operação.' });
  }

  return signals.slice(0, 6);
}

module.exports = {
  clampDays,
  safeStamp,
  hoursBetween,
  ageDays,
  average,
  percent,
  stageForTask,
  stageLabel,
  isCorrectionTouched,
  correctionSource,
  completionStamp,
  isOnTime,
  demandTypeLabel,
  buildSignals,
};
