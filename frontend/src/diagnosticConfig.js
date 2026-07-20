export const DIAGNOSTIC_PILLARS = [
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

export const IDENTIFICATION_FIELDS = [
  ['companyName', 'Nome da empresa', true],
  ['respondent', 'Responsável pelas respostas', true],
  ['segment', 'Segmento', false],
  ['foundation', 'Ano de fundação', false],
  ['employees', 'Número de colaboradores', false],
  ['city', 'Cidade / região', false],
];

export const FINAL_FIELDS = [
  ['oneProblem', 'Se pudesse resolver apenas um problema da empresa neste ano, qual seria?'],
  ['growthBarrier', 'O que mais impede a empresa de crescer hoje?'],
  ['twelveMonths', 'Onde a empresa deseja estar daqui a 12 meses?'],
  ['expectation', 'O que espera da atuação da agência?'],
  ['success', 'Como saberemos que essa parceria deu certo?'],
  ['additional', 'Existe alguma informação importante que ainda não perguntamos?'],
];

export const DIAGNOSTIC_TOTAL_REQUIRED = DIAGNOSTIC_PILLARS.length * 5 + 2;

export function calculateDiagnosticProgress(answers = {}) {
  let answered = ['companyName', 'respondent'].filter((key) => String(answers[key] || '').trim()).length;
  DIAGNOSTIC_PILLARS.forEach((pillar) => {
    pillar.questions.forEach((_, index) => {
      const value = Number(answers[`${pillar.id}_${index}`]);
      if (value >= 1 && value <= 5) answered += 1;
    });
  });
  return Math.round((answered / DIAGNOSTIC_TOTAL_REQUIRED) * 100);
}

export const RECOMMENDATIONS = {
  positioning: 'clarificar posicionamento, diferenciais e proposta de valor',
  brand: 'organizar a identidade e tornar a comunicação mais coerente',
  marketing: 'conectar o marketing aos objetivos comerciais',
  sales: 'estruturar atendimento, acompanhamento e conversão',
  relationship: 'ativar a base, fortalecer pós-venda, recompra e indicação',
  processes: 'organizar responsabilidades, fluxos e capacidade operacional',
  management: 'definir metas, indicadores e rotina de acompanhamento',
  growth: 'construir visão de expansão com testes e prioridades claras',
};

export const ATTENTION = {
  positioning: 'Sem posicionamento claro, a comunicação tende a ser genérica e comparada por preço.',
  brand: 'Inconsistência de marca pode reduzir confiança e esconder a qualidade real.',
  marketing: 'Ações sem objetivo e acompanhamento podem consumir recursos sem gerar aprendizado.',
  sales: 'Oportunidades podem ser perdidas por demora ou falta de acompanhamento.',
  relationship: 'A empresa pode depender demais de novos clientes e aproveitar pouco sua base.',
  processes: 'O crescimento pode aumentar retrabalho, atrasos e perda de qualidade.',
  management: 'Sem indicadores, decisões importantes podem depender apenas de percepção.',
  growth: 'Sem visão futura, a empresa tende a reagir ao mercado em vez de conduzir seu avanço.',
};
