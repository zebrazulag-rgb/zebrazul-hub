import {
  createPlanningDocumentData,
  mergePlanningDocumentData,
  planningDocumentProgress,
} from './planningDocumentUtils.js';

const text = (label, name, placeholder = '', full = false) => ({ label, name, type: 'textarea', placeholder, full });
const input = (label, name, placeholder = '', type = 'text', full = false) => ({ label, name, type, placeholder, full });

export const CYCLE_MONTHS = ['Mês 1 — Fundamento', 'Mês 2 — Ativação', 'Mês 3 — Consolidação'];
export const CYCLE_WEEKS = Array.from({ length: 13 }, (_, index) => `Semana ${index + 1}`);

export const cycle90CoverFields = [
  input('Nome da empresa', 'company_name'),
  input('Nome do ciclo', 'cycle_name', 'Ex.: Ciclo 1 — Fundamento e Organização'),
  input('Data de início', 'cycle_start', '', 'date'),
  input('Data de encerramento', 'cycle_end', '', 'date'),
  input('Responsável Zebrazul', 'zebrazul_owner', 'Nome do estrategista'),
  input('Responsável interno do cliente', 'client_owner', 'Nome e função'),
  input('Mensagem de capa', 'cover_note', 'Foco, execução e aprendizado conectados ao objetivo anual.', 'text', true),
];

export const cycle90Sections = [
  {
    n: '01', title: 'Conexão com o plano anual', desc: 'Mostre como este ciclo contribui para o objetivo do ano.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Objetivo anual relacionado', 'annual_goal', 'Qual objetivo anual este ciclo ajuda a alcançar?'),
      text('Pilares estratégicos relacionados', 'related_pillars', 'Quais pilares do plano anual serão trabalhados?'),
      text('Diagnóstico que orienta o ciclo', 'cycle_diagnosis', 'Qual leitura estratégica justifica este ciclo?'),
      text('Mudança esperada ao final dos 90 dias', 'cycle_change', 'O que precisa estar diferente ao final do período?'),
    ] }],
  },
  {
    n: '02', title: 'Objetivo do ciclo', desc: 'Defina uma transformação central para os 90 dias.',
    blocks: [
      { type: 'note', text: 'O ciclo deve possuir um objetivo claro, limitado e observável. Ele não deve tentar resolver todos os desafios do negócio ao mesmo tempo.' },
      { type: 'grid', cols: 3, fields: [
        text('O que queremos', 'cycle_what', 'Resultado central dos 90 dias.'),
        text('Para que queremos', 'cycle_why', 'Impacto esperado no negócio.'),
        text('Como faremos', 'cycle_how', 'Grandes movimentos do ciclo.'),
      ] },
      { type: 'grid', cols: 2, fields: [
        text('Resultado-chave do ciclo', 'cycle_key_result', 'Qual resultado demonstrará que o ciclo avançou?'),
        text('Critérios de sucesso', 'cycle_success', 'Quais condições precisam ser atendidas?'),
      ] },
    ],
  },
  {
    n: '03', title: 'Tese e foco estratégico', desc: 'Registre a lógica que sustenta as escolhas do ciclo.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Tese estratégica do ciclo', 'cycle_thesis', 'Qual caminho possui maior potencial neste momento?'),
      text('Hipóteses que serão testadas', 'cycle_hypotheses', 'Quais suposições precisam ser confirmadas?'),
      text('O que será priorizado', 'cycle_focus', 'O que receberá atenção e capacidade?'),
      text('O que ficará de fora', 'cycle_out', 'O que será adiado para proteger o foco?'),
    ] }],
  },
  {
    n: '04', title: 'Três prioridades centrais', desc: 'Limite o ciclo às prioridades que realmente movem o objetivo.',
    blocks: [{
      type: 'cards', count: 3, title: 'Prioridade', prefix: 'priority', fields: [
        input('Nome da prioridade', 'name'),
        text('Por que é prioritária', 'reason'),
        text('Resultado esperado', 'result'),
        text('Projetos relacionados', 'projects'),
        text('Indicadores', 'kpis'),
      ],
    }],
  },
  {
    n: '05', title: 'Resultados esperados', desc: 'Defina resultados mensuráveis para o encerramento do ciclo.',
    blocks: [{ type: 'table', id: 'outcomes', rows: 6, columns: ['Resultado esperado', 'Indicador', 'Ponto de partida', 'Meta em 90 dias', 'Prazo', 'Responsável', 'Status'] }],
  },
  {
    n: '06', title: 'Plano dos três meses', desc: 'Organize o ciclo em fundamento, ativação e consolidação.',
    blocks: [{
      type: 'collectionCards', names: CYCLE_MONTHS, prefix: 'month', cols: 3, fields: [
        input('Objetivo do mês', 'goal'),
        text('Principais entregas e projetos', 'deliveries'),
        text('Marcos e decisões', 'milestones'),
        text('Indicadores do mês', 'kpis'),
        text('Riscos e dependências', 'risks'),
      ],
    }],
  },
  {
    n: '07', title: 'Plano das 13 semanas', desc: 'Transforme os objetivos mensais em ritmo semanal.',
    blocks: [{
      type: 'collectionCards', names: CYCLE_WEEKS, prefix: 'week', cols: 2, fields: [
        input('Objetivo da semana', 'goal'),
        input('Responsável principal', 'owner'),
        text('Ações e entregas', 'actions'),
        text('Bloqueios e decisões', 'blocks'),
      ],
    }],
  },
  {
    n: '08', title: 'Portfólio de projetos', desc: 'Registre todos os projetos que compõem o ciclo.',
    blocks: [{ type: 'table', id: 'projects', rows: 8, columns: ['Projeto', 'Prioridade relacionada', 'Objetivo', 'Início', 'Conclusão', 'Responsável', 'Dependências', 'Investimento', 'Status'] }],
  },
  {
    n: '09', title: 'Backlog de ações', desc: 'Liste ações menores, tarefas e oportunidades do ciclo.',
    blocks: [{ type: 'table', id: 'backlog', rows: 10, columns: ['Ação', 'Tipo', 'Prioridade', 'Responsável', 'Prazo', 'Esforço', 'Impacto', 'Status'] }],
  },
  {
    n: '10', title: 'Capacidade de execução', desc: 'Proteja a margem e mantenha o ciclo viável.',
    blocks: [
      { type: 'grid', cols: 3, fields: [
        input('Capacidade total do ciclo', 'cycle_capacity', 'Ex.: 60 pontos'),
        input('Reserva estratégica', 'cycle_reserve', 'Ex.: 15%'),
        input('Limite de projetos simultâneos', 'parallel_projects', 'Ex.: 3'),
      ] },
      { type: 'note', text: 'Quando a capacidade planejada ultrapassar o limite, será necessário substituir ações, ampliar temporariamente a estrutura ou contratar o projeto adicionalmente.' },
      {
        type: 'capacityCards', names: CYCLE_MONTHS, prefix: 'capacity', cols: 3, fields: [
          input('Capacidade disponível', 'available', '20'),
          input('Capacidade planejada', 'planned', '0'),
          text('Observações', 'notes', 'Demandas pesadas, reservas, extras ou substituições.'),
        ],
      },
    ],
  },
  {
    n: '11', title: 'Indicadores do ciclo', desc: 'Defina métricas de negócio, marketing, comercial e execução.',
    blocks: [{ type: 'table', id: 'kpis', rows: 8, columns: ['Indicador', 'Categoria', 'Ponto de partida', 'Meta', 'Fonte', 'Frequência', 'Responsável'] }],
  },
  {
    n: '12', title: 'Responsabilidades', desc: 'Separe o que depende da Zebrazul e da empresa.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('Responsabilidades da Zebrazul', 'zebrazul_responsibilities', 'Planejamento, coordenação, produção, análise...'),
        text('Responsabilidades do cliente', 'client_responsibilities', 'Dados, aprovações, execução interna, equipe, investimento...'),
      ] },
      { type: 'table', id: 'responsibilities', rows: 6, columns: ['Ação ou decisão', 'Zebrazul', 'Cliente', 'Aprovador final', 'Prazo padrão'] },
    ],
  },
  {
    n: '13', title: 'Governança e reuniões', desc: 'Defina o ritmo de acompanhamento dos 90 dias.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        input('Reunião de abertura', 'kickoff_meeting', 'Data'),
        input('Check-in semanal', 'weekly_checkin', 'Dia e horário'),
        input('Revisão mensal', 'monthly_review', 'Regra ou datas'),
        input('Reunião de encerramento', 'closing_meeting', 'Data'),
      ] },
      { type: 'table', id: 'governance', rows: 5, columns: ['Ritual', 'Objetivo', 'Participantes', 'Frequência', 'Responsável', 'Registro'] },
    ],
  },
  {
    n: '14', title: 'Riscos e respostas', desc: 'Antecipe obstáculos que podem comprometer o ciclo.',
    blocks: [{ type: 'table', id: 'risks', rows: 6, columns: ['Risco', 'Probabilidade', 'Impacto', 'Sinal de alerta', 'Prevenção', 'Resposta', 'Responsável'] }],
  },
  {
    n: '15', title: 'Dependências e pendências', desc: 'Registre tudo o que precisa acontecer para o ciclo avançar.',
    blocks: [{ type: 'table', id: 'dependencies', rows: 7, columns: ['Dependência ou pendência', 'Tipo', 'Responsável', 'Prazo', 'Impacto do atraso', 'Status'] }],
  },
  {
    n: '16', title: 'Registro de decisões', desc: 'Mantenha histórico das escolhas feitas ao longo do ciclo.',
    blocks: [{ type: 'table', id: 'decisions', rows: 6, columns: ['Data', 'Decisão', 'Motivo', 'Impacto no ciclo', 'Responsáveis pela aprovação'] }],
  },
  {
    n: '17', title: 'Acompanhamento mensal', desc: 'Registre resultados, aprendizados e ajustes ao fim de cada mês.',
    blocks: [{
      type: 'collectionCards', names: CYCLE_MONTHS, prefix: 'review', cols: 3, fields: [
        text('O que foi concluído', 'done'),
        text('Resultados observados', 'results'),
        text('Aprendizados', 'learning'),
        text('Ajustes para o próximo mês', 'adjustments'),
      ],
    }],
  },
  {
    n: '18', title: 'Encerramento do ciclo', desc: 'Avalie o resultado final dos 90 dias.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('Resultados alcançados', 'final_results', 'Quais resultados foram alcançados?'),
        text('Resultados não alcançados', 'not_achieved', 'O que ficou abaixo do esperado?'),
        text('Principais aprendizados', 'final_learnings', 'O que a empresa e a Zebrazul aprenderam?'),
        text('Mudanças percebidas', 'perceived_changes', 'O que está diferente em relação ao início?'),
      ] },
      { type: 'table', id: 'final_score', rows: 6, columns: ['Resultado ou indicador', 'Meta', 'Resultado final', 'Avaliação', 'Observação'] },
    ],
  },
  {
    n: '19', title: 'Direção para o próximo ciclo', desc: 'Transforme aprendizados em novas prioridades.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('O que deve continuar', 'continue_actions', 'Quais práticas ou projetos devem seguir?'),
        text('O que deve parar', 'stop_actions', 'O que não deve ser repetido?'),
        text('O que deve começar', 'start_actions', 'Quais novos movimentos devem iniciar?'),
        text('Hipótese para o próximo ciclo', 'next_hypothesis', 'Qual deve ser a próxima direção estratégica?'),
      ] },
      { type: 'grid', cols: 3, fields: [
        input('Próximo ciclo', 'next_cycle_name', 'Nome sugerido'),
        input('Data prevista de início', 'next_cycle_start', 'dd/mm/aaaa'),
        input('Responsável pela preparação', 'next_cycle_owner', 'Nome'),
      ] },
    ],
  },
  {
    n: '20', title: 'Aprovação do ciclo', desc: 'Formalize decisões, responsáveis e início da execução.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('Pontos aprovados', 'approved_points'),
        text('Ajustes solicitados', 'requested_changes'),
        text('Próximos passos imediatos', 'immediate_steps'),
        text('Mensagem de encerramento', 'closing_message'),
      ] },
      { type: 'grid', cols: 3, fields: [
        input('Responsável Zebrazul', 'sign_zebrazul'),
        input('Responsável pelo cliente', 'sign_client'),
        input('Data de aprovação', 'approval_date', 'dd/mm/aaaa'),
      ] },
    ],
  },
];

export function createCycle90Data() {
  return createPlanningDocumentData(cycle90CoverFields, cycle90Sections);
}

export function mergeCycle90Data(rawData) {
  return mergePlanningDocumentData(rawData, cycle90CoverFields, cycle90Sections);
}

export function cycle90Progress(data) {
  return planningDocumentProgress(data, cycle90CoverFields, cycle90Sections);
}
