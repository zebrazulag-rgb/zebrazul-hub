export const annualPlanCoverFields = [
  { label: 'Nome da empresa', name: 'company' },
  { label: 'Ano do plano', name: 'year_label', placeholder: 'Ex.: 2026' },
  { label: 'Responsável Zebrazul', name: 'lead' },
  { label: 'Responsável interno', name: 'owner' },
  { label: 'Início do ciclo', name: 'start', type: 'date' },
  { label: 'Última revisão', name: 'review', type: 'date' },
  { label: 'Mensagem de capa', name: 'cover_note', full: true, placeholder: 'Direção estratégica, projetos, responsáveis e indicadores para o ciclo anual.' },
];

const text = (label, name, placeholder = '') => ({ label, name, type: 'textarea', placeholder });
const input = (label, name, placeholder = '') => ({ label, name, type: 'input', placeholder });

export const annualPlanSections = [
  {
    n: '01', title: 'Síntese estratégica', desc: 'Conecte o diagnóstico à direção anual.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Resumo do diagnóstico', 'diag'), text('Problema central', 'problem'),
      text('Tese estratégica', 'thesis'), text('Mudança esperada', 'change'),
    ] }],
  },
  {
    n: '02', title: 'Objetivo do ano', desc: 'Defina a transformação central e os critérios de sucesso.',
    blocks: [
      { type: 'note', text: 'O objetivo anual deve indicar o que queremos mudar, por que isso importa e quais movimentos sustentarão o avanço.' },
      { type: 'grid', cols: 3, fields: [text('O que queremos', 'goal_what'), text('Para que queremos', 'goal_why'), text('Como faremos', 'goal_how')] },
      { type: 'grid', cols: 2, fields: [text('Meta principal', 'main_target'), text('Critérios de sucesso', 'success')] },
    ],
  },
  {
    n: '03', title: 'Princípios e premissas', desc: 'Registre condições, limites e escolhas que protegem o foco.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Princípios do plano', 'principles'), text('Premissas necessárias', 'assumptions'),
      text('Restrições conhecidas', 'constraints'), text('O que não será prioridade', 'not_priority'),
    ] }],
  },
  {
    n: '04', title: 'Pilares estratégicos', desc: 'Defina as grandes frentes que orientarão o ano.',
    blocks: [{ type: 'cards', count: 5, title: 'Pilar estratégico', prefix: 'pillar', fields: [
      input('Nome', 'name'), text('Objetivo', 'goal'), text('Problema que resolve', 'problem'),
      text('Movimentos principais', 'moves'), text('Indicadores', 'kpis'), text('Resultado esperado', 'result'),
    ] }],
  },
  {
    n: '05', title: 'Metas anuais', desc: 'Converta a direção em resultados mensuráveis.',
    blocks: [{ type: 'table', id: 'goals', rows: 6, columns: ['Meta', 'Indicador', 'Ponto de partida', 'Resultado esperado', 'Prazo', 'Responsável', 'Status'] }],
  },
  {
    n: '06', title: 'Roadmap trimestral', desc: 'Organize o ano em quatro ciclos de execução e revisão.',
    blocks: [{ type: 'namedCards', names: ['1º trimestre', '2º trimestre', '3º trimestre', '4º trimestre'], prefix: 'q', fields: [
      text('Objetivo do trimestre', 'goal'), text('Prioridades', 'priorities'), text('Projetos e campanhas', 'projects'),
      text('Indicadores e meta', 'kpis'), text('Riscos e dependências', 'risks'),
    ] }],
  },
  {
    n: '07', title: 'Calendário anual', desc: 'Distribua prioridades, ações, marcos e responsáveis nos 12 meses.',
    blocks: [{ type: 'months' }],
  },
  {
    n: '08', title: 'Portfólio de iniciativas', desc: 'Registre os projetos possíveis e priorize a execução.',
    blocks: [{ type: 'table', id: 'initiatives', rows: 8, columns: ['Iniciativa', 'Pilar', 'Objetivo', 'Impacto', 'Urgência', 'Esforço', 'Trimestre', 'Responsável', 'Investimento', 'Status'] }],
  },
  {
    n: '09', title: 'Marketing e comunicação', desc: 'Organize campanhas, canais, mensagens e indicadores.',
    blocks: [{ type: 'table', id: 'marketing', rows: 8, columns: ['Ação', 'Objetivo', 'Público', 'Canal', 'Mensagem', 'Período', 'Responsável', 'Indicador', 'Status'] }],
  },
  {
    n: '10', title: 'Comercial e relacionamento', desc: 'Conecte aquisição, conversão, experiência e fidelização.',
    blocks: [{ type: 'table', id: 'commercial', rows: 7, columns: ['Ação', 'Etapa da jornada', 'Problema', 'Período', 'Responsável', 'Indicador', 'Meta', 'Status'] }],
  },
  {
    n: '11', title: 'Projetos estruturantes', desc: 'Defina projetos que resolvem causas-raiz e fortalecem a operação.',
    blocks: [{ type: 'cards', count: 4, title: 'Projeto estruturante', prefix: 'sp', fields: [
      input('Nome', 'name'), input('Pilar', 'pillar'), text('Problema que resolve', 'problem'), text('Resultado esperado', 'result'),
      text('Etapas', 'steps'), text('Dependências', 'dependencies'), input('Início', 'start'), input('Conclusão', 'end'), input('Investimento', 'budget'),
    ] }],
  },
  {
    n: '12', title: 'Ganhos rápidos', desc: 'Liste ações menores com impacto perceptível no curto prazo.',
    blocks: [{ type: 'table', id: 'quick', rows: 5, columns: ['Ação', 'Problema', 'Impacto esperado', 'Prazo', 'Responsável', 'Status'] }],
  },
  {
    n: '13', title: 'Capacidade de execução', desc: 'Proteja a margem, o foco e a qualidade da entrega.',
    blocks: [
      { type: 'grid', cols: 3, fields: [input('Capacidade mensal contratada', 'capacity_total'), input('Reserva estratégica', 'capacity_reserve'), input('Projetos simultâneos', 'parallel')] },
      { type: 'note', text: 'Quando a capacidade for ultrapassada, a decisão deverá ser: substituir prioridades, ampliar temporariamente a estrutura ou contratar o projeto à parte.' },
      { type: 'table', id: 'capacity', rows: 12, columns: ['Mês', 'Capacidade disponível', 'Capacidade planejada', 'Reserva', 'Projetos principais', 'Decisão'] },
    ],
  },
  {
    n: '14', title: 'Investimentos e orçamento', desc: 'Separe mensalidade, mídia, projetos e reservas.',
    blocks: [
      { type: 'table', id: 'budget', rows: 7, columns: ['Categoria', 'Descrição', 'Valor previsto', 'Período', 'Aprovador', 'Status'] },
      { type: 'grid', cols: 3, fields: [input('Orçamento anual', 'annual_budget'), input('Verba anual de mídia', 'media_budget'), input('Reserva para extras', 'extra_budget')] },
    ],
  },
  {
    n: '15', title: 'Indicadores do plano', desc: 'Defina métricas de negócio, marketing, comercial e operação.',
    blocks: [{ type: 'table', id: 'kpis', rows: 8, columns: ['Indicador', 'Categoria', 'Ponto de partida', 'Meta', 'Fonte', 'Frequência', 'Responsável'] }],
  },
  {
    n: '16', title: 'Governança e reuniões', desc: 'Defina o ritmo de acompanhamento e tomada de decisão.',
    blocks: [
      { type: 'grid', cols: 2, fields: [input('Reunião anual', 'annual_meeting'), input('Revisões trimestrais', 'quarterly_meetings'), input('Reunião mensal', 'monthly_meeting'), input('Check-in operacional', 'checkin')] },
      { type: 'table', id: 'governance', rows: 5, columns: ['Ritual', 'Objetivo', 'Participantes', 'Frequência', 'Responsável', 'Registro'] },
    ],
  },
  {
    n: '17', title: 'Responsabilidades', desc: 'Separe claramente o que depende de cada parte.',
    blocks: [
      { type: 'grid', cols: 2, fields: [text('Responsabilidades da Zebrazul', 'resp_z'), text('Responsabilidades do cliente', 'resp_c')] },
      { type: 'table', id: 'ram', rows: 6, columns: ['Ação ou decisão', 'Zebrazul', 'Cliente', 'Aprovador', 'Prazo padrão'] },
    ],
  },
  {
    n: '18', title: 'Riscos e contingências', desc: 'Antecipe obstáculos, sinais de alerta e respostas.',
    blocks: [{ type: 'table', id: 'risks', rows: 6, columns: ['Risco', 'Probabilidade', 'Impacto', 'Sinal de alerta', 'Prevenção', 'Resposta', 'Responsável'] }],
  },
  {
    n: '19', title: 'Dependências e pendências', desc: 'Registre o que precisa acontecer para o plano avançar.',
    blocks: [{ type: 'table', id: 'dependencies', rows: 7, columns: ['Dependência', 'Tipo', 'Responsável', 'Prazo', 'Impacto do atraso', 'Status'] }],
  },
  {
    n: '20', title: 'Revisões do plano', desc: 'Mantenha o histórico das mudanças e suas justificativas.',
    blocks: [{ type: 'table', id: 'revisions', rows: 5, columns: ['Data', 'Mudança', 'Motivo', 'Impacto', 'Aprovadores'] }],
  },
  {
    n: '21', title: 'Aprovação e próximos passos', desc: 'Formalize o início da execução e as decisões finais.',
    blocks: [
      { type: 'grid', cols: 2, fields: [text('Pontos aprovados', 'approved'), text('Ajustes solicitados', 'changes'), text('Próximos passos imediatos', 'next'), text('Mensagem de encerramento', 'closing')] },
      { type: 'grid', cols: 3, fields: [input('Responsável Zebrazul', 'sign_z'), input('Responsável cliente', 'sign_c'), input('Data de aprovação', 'approval')] },
    ],
  },
];

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export { MONTHS };

function registerField(target, name) {
  if (name && !Object.prototype.hasOwnProperty.call(target, name)) target[name] = '';
}

function registerBlock(block, fields, tables) {
  if (block.type === 'grid') block.fields.forEach((field) => registerField(fields, field.name));
  if (block.type === 'table') tables[block.id] = Array.from({ length: block.rows || 3 }, () => block.columns.map(() => ''));
  if (block.type === 'cards') {
    Array.from({ length: block.count }).forEach((_, index) => block.fields.forEach((field) => registerField(fields, `${block.prefix}_${index}_${field.name}`)));
  }
  if (block.type === 'namedCards') {
    block.names.forEach((_, index) => block.fields.forEach((field) => registerField(fields, `${block.prefix}_${index}_${field.name}`)));
  }
  if (block.type === 'months') {
    MONTHS.forEach((_, index) => ['priority', 'actions', 'dates', 'owner', 'kpi'].forEach((suffix) => registerField(fields, `m_${index}_${suffix}`)));
  }
}

export function createAnnualPlanData() {
  const fields = {};
  const tables = {};
  annualPlanCoverFields.forEach((field) => registerField(fields, field.name));
  annualPlanSections.forEach((section) => section.blocks.forEach((block) => registerBlock(block, fields, tables)));
  return { fields, tables };
}

export function mergeAnnualPlanData(rawData) {
  const defaults = createAnnualPlanData();
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  return {
    fields: { ...defaults.fields, ...(source.fields || {}) },
    tables: Object.fromEntries(Object.entries(defaults.tables).map(([id, rows]) => [id, Array.isArray(source.tables?.[id]) ? source.tables[id] : rows])),
  };
}

export function annualPlanProgress(data) {
  const normalized = mergeAnnualPlanData(data);
  let total = Object.keys(normalized.fields).length;
  let completed = Object.values(normalized.fields).filter((value) => String(value || '').trim()).length;
  Object.values(normalized.tables).forEach((rows) => rows.forEach((row) => row.forEach((value) => {
    total += 1;
    if (String(value || '').trim()) completed += 1;
  })));
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}
