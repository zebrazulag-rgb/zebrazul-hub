const PILLARS = [
  { id: 'positioning', number: '02', title: 'Propósito e Posicionamento', short: 'Posicionamento', description: 'Clareza da identidade, proposta de valor e percepção desejada.', questions: [
    'A empresa possui propósito, visão e valores claramente definidos.',
    'Existe um posicionamento claro e compreendido pelos principais líderes.',
    'Os colaboradores conseguem explicar os diferenciais da empresa.',
    'Os clientes percebem por que deveriam escolher a empresa.',
    'Existe coerência entre aquilo que a empresa promete e entrega.'
  ], open: 'Qual é, hoje, o principal diferencial da empresa?' },
  { id: 'brand', number: '03', title: 'Marca e Comunicação', short: 'Marca', description: 'Consistência visual, clareza da mensagem, reconhecimento e confiança.', questions: [
    'A identidade visual é aplicada de forma consistente.',
    'A comunicação transmite profissionalismo e está alinhada ao posicionamento.',
    'A empresa possui mensagens claras para apresentar produtos e serviços.',
    'A marca é reconhecida e lembrada pelo público desejado.',
    'Os materiais institucionais representam a qualidade da empresa.'
  ], open: 'Como você acredita que o mercado enxerga a empresa hoje?' },
  { id: 'marketing', number: '04', title: 'Marketing e Aquisição', short: 'Marketing', description: 'Planejamento, geração de oportunidades, investimento e resultados.', questions: [
    'Existe planejamento de marketing conectado aos objetivos do negócio.',
    'Cada ação possui objetivo e público definidos.',
    'O marketing gera oportunidades comerciais de forma recorrente.',
    'Existe investimento planejado em comunicação, mídia ou aquisição.',
    'Os resultados das ações são acompanhados e analisados.'
  ], open: 'Qual ação de marketing trouxe mais resultado até hoje?' },
  { id: 'sales', number: '05', title: 'Comercial e Conversão', short: 'Comercial', description: 'Atendimento, acompanhamento dos contatos e transformação em vendas.', questions: [
    'Existe um processo comercial claro, com etapas e responsáveis.',
    'O atendimento segue um padrão de qualidade.',
    'Os contatos recebem resposta em tempo adequado.',
    'Os leads são acompanhados até uma definição.',
    'A conversão e os motivos de perda são conhecidos.'
  ], open: 'Qual é o maior desafio comercial da empresa hoje?' },
  { id: 'relationship', number: '06', title: 'Relacionamento e Fidelização', short: 'Relacionamento', description: 'Pós-venda, recompra, indicação e vínculo com a base.', questions: [
    'A empresa realiza pós-venda de forma estruturada.',
    'Existem ações recorrentes para clientes que já compraram.',
    'A empresa estimula e acompanha indicações.',
    'Existe uma base organizada de clientes e contatos.',
    'Recompra, retenção ou recorrência são acompanhadas.'
  ], open: 'Como a empresa mantém contato com quem já comprou?' },
  { id: 'processes', number: '07', title: 'Processos e Organização', short: 'Processos', description: 'Responsabilidades, documentação, demandas e alinhamento interno.', questions: [
    'Os principais processos estão documentados ou claramente conhecidos.',
    'As responsabilidades de cada função estão definidas.',
    'As demandas são planejadas e acompanhadas.',
    'As áreas trabalham com bom nível de alinhamento.',
    'A operação consegue absorver crescimento sem perder qualidade.'
  ], open: 'Qual processo interno mais precisa melhorar?' },
  { id: 'management', number: '08', title: 'Gestão e Indicadores', short: 'Gestão', description: 'Metas, reuniões, dados e capacidade de decisão.', questions: [
    'A empresa possui metas claras para o ano e ciclos menores.',
    'Existem indicadores definidos para acompanhar resultados.',
    'As decisões são tomadas com base em dados.',
    'Existem reuniões periódicas de acompanhamento.',
    'Há visão clara de faturamento, custos, margens e desempenho.'
  ], open: 'Qual indicador é acompanhado com maior frequência?' },
  { id: 'growth', number: '09', title: 'Crescimento e Inovação', short: 'Crescimento', description: 'Visão de futuro, expansão, adaptação e novas oportunidades.', questions: [
    'Existe uma visão clara de crescimento para os próximos anos.',
    'Há planejamento para expansão, novos produtos ou mercados.',
    'A empresa acompanha mudanças no comportamento dos clientes e no setor.',
    'Existe abertura para testar novas ideias e aprender.',
    'A melhoria contínua faz parte da rotina.'
  ], open: 'Onde você deseja que a empresa esteja daqui a três anos?' }
];

const REQUIRED_IDENTIFICATION = ['companyName', 'respondent'];
const TOTAL_REQUIRED = PILLARS.reduce((total, pillar) => total + pillar.questions.length, 0) + REQUIRED_IDENTIFICATION.length;

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeAnswers(value) {
  const answers = safeObject(value);
  const normalized = {};
  for (const [key, raw] of Object.entries(answers)) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'number') normalized[key] = raw;
    else normalized[key] = String(raw).slice(0, 12000);
  }
  return normalized;
}

function calculateProgress(answers) {
  const source = normalizeAnswers(answers);
  let answered = REQUIRED_IDENTIFICATION.filter((key) => String(source[key] || '').trim()).length;
  for (const pillar of PILLARS) {
    pillar.questions.forEach((_, index) => {
      const value = Number(source[`${pillar.id}_${index}`]);
      if (value >= 1 && value <= 5) answered += 1;
    });
  }
  return Math.round((answered / TOTAL_REQUIRED) * 100);
}

function validateComplete(answers) {
  const source = normalizeAnswers(answers);
  const missing = [];
  if (!String(source.companyName || '').trim()) missing.push('nome da empresa');
  if (!String(source.respondent || '').trim()) missing.push('responsável pelas respostas');
  for (const pillar of PILLARS) {
    const complete = pillar.questions.every((_, index) => {
      const value = Number(source[`${pillar.id}_${index}`]);
      return value >= 1 && value <= 5;
    });
    if (!complete) missing.push(pillar.short);
  }
  return { complete: missing.length === 0, missing };
}

function maturity(score) {
  if (score < 1.8) return { key: 'initial', title: 'Nível 1 — Estrutura inicial', description: 'As práticas ainda são pouco estruturadas. O foco deve estar nos fundamentos antes de acelerar investimentos.' };
  if (score < 2.8) return { key: 'organizing', title: 'Nível 2 — Em organização', description: 'Já existem iniciativas relevantes, mas ainda irregulares. O próximo passo é transformar esforços isolados em processos.' };
  if (score < 3.8) return { key: 'developing', title: 'Nível 3 — Em desenvolvimento', description: 'A empresa possui base funcional. O desafio é ampliar integração, acompanhamento e consistência.' };
  if (score < 4.5) return { key: 'consistent', title: 'Nível 4 — Estrutura consistente', description: 'As práticas estão bem estabelecidas. A prioridade passa a ser integração, indicadores e escala.' };
  return { key: 'advanced', title: 'Nível 5 — Maturidade avançada', description: 'A empresa demonstra alto nível de clareza e organização. O foco deve estar em inovação e expansão.' };
}

function calculateScores(answers) {
  const source = normalizeAnswers(answers);
  const pillars = PILLARS.map((pillar) => {
    const values = pillar.questions.map((_, index) => Number(source[`${pillar.id}_${index}`])).filter((value) => value >= 1 && value <= 5);
    const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return { id: pillar.id, title: pillar.title, short: pillar.short, score: Number(score.toFixed(2)) };
  });
  const overall = pillars.length ? pillars.reduce((sum, pillar) => sum + pillar.score, 0) / pillars.length : 0;
  return { overall: Number(overall.toFixed(2)), maturity: maturity(overall), pillars };
}

module.exports = {
  PILLARS,
  TOTAL_REQUIRED,
  normalizeAnswers,
  calculateProgress,
  validateComplete,
  calculateScores,
};
