import {
  createPlanningDocumentData,
  mergePlanningDocumentData,
  planningDocumentProgress,
} from './planningDocumentUtils.js';

const text = (label, name, placeholder = '', full = false) => ({ label, name, type: 'textarea', placeholder, full });
const input = (label, name, placeholder = '', type = 'text', full = false) => ({ label, name, type, placeholder, full });

export const MONTHLY_WEEKS = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5 — quando aplicável'];
export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const monthlyPlanningCoverFields = [
  input('Nome da empresa', 'company_name'),
  input('Mês de referência', 'month_reference', 'Ex.: Agosto de 2026'),
  input('Ciclo de 90 dias relacionado', 'cycle_reference', 'Ex.: Ciclo 1 — Fundamento e Organização'),
  input('Responsável Zebrazul', 'zebrazul_owner', 'Nome do estrategista'),
  input('Responsável interno do cliente', 'client_owner', 'Nome e função'),
  input('Data da reunião mensal', 'monthly_meeting', '', 'date'),
  input('Mensagem de capa', 'cover_note', 'Prioridades claras, capacidade protegida e execução acompanhada.', 'text', true),
];

export const monthlyPlanningSections = [
  {
    n: '01', title: 'Leitura do mês anterior', desc: 'Comece pelo que aconteceu antes de decidir o próximo movimento.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('O que foi concluído', 'previous_done', 'Principais entregas, ações e decisões do mês anterior.'),
      text('Resultados observados', 'previous_results', 'O que mudou ou gerou resultado?'),
      text('Pendências trazidas para este mês', 'previous_pending', 'O que precisa continuar ou ser resolvido?'),
      text('Aprendizados do mês anterior', 'previous_learnings', 'O que deve ser repetido, ajustado ou interrompido?'),
    ] }],
  },
  {
    n: '02', title: 'Conexão com o ciclo de 90 dias', desc: 'Garanta que o mês esteja conectado à prioridade trimestral.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Objetivo do ciclo relacionado', 'cycle_goal', 'Qual objetivo dos 90 dias este mês ajuda a alcançar?'),
      text('Prioridades do ciclo relacionadas', 'cycle_priorities', 'Quais prioridades do ciclo serão trabalhadas agora?'),
      text('Resultado esperado no ciclo', 'cycle_expected_result', 'Qual avanço este mês precisa gerar para o ciclo?'),
      text('O que mudou desde o início do ciclo', 'cycle_changes', 'Mudanças, oportunidades ou restrições recentes.'),
    ] }],
  },
  {
    n: '03', title: 'Objetivo do mês', desc: 'Defina uma transformação clara para o período.',
    blocks: [
      { type: 'note', text: 'O objetivo do mês deve responder: qual é o principal movimento que a empresa precisa realizar agora para se aproximar do objetivo do ciclo?' },
      { type: 'grid', cols: 3, fields: [
        text('O que queremos', 'month_what', 'Resultado central do mês.'),
        text('Para que queremos', 'month_why', 'Impacto esperado no negócio.'),
        text('Como faremos', 'month_how', 'Grandes movimentos do mês.'),
      ] },
      { type: 'grid', cols: 2, fields: [
        text('Resultado-chave do mês', 'month_key_result', 'Qual resultado demonstrará que houve avanço?'),
        text('Critérios de sucesso', 'month_success', 'Quais condições precisam ser atendidas?'),
      ] },
    ],
  },
  {
    n: '04', title: 'Prioridades do mês', desc: 'Limite o planejamento ao que realmente importa.',
    blocks: [{
      type: 'cards', count: 3, title: 'Prioridade', prefix: 'priority', fields: [
        input('Nome', 'name'),
        text('Por que é importante', 'reason'),
        text('Resultado esperado', 'result'),
        text('Projetos e ações relacionados', 'actions'),
        text('Indicadores', 'kpis'),
      ],
    }],
  },
  {
    n: '05', title: 'O que não será prioridade', desc: 'Proteja o foco e evite que o mês vire uma lista ilimitada.',
    blocks: [{ type: 'grid', cols: 2, fields: [
      text('Temas adiados', 'month_not_priority', 'O que não será tratado neste mês?'),
      text('Justificativa', 'month_not_priority_reason', 'Por que esses temas devem aguardar?'),
      text('Demandas que poderão substituir prioridades', 'replacement_rules', 'Que tipo de urgência justificaria uma troca?'),
      text('Demandas que exigirão orçamento adicional', 'extra_scope', 'Quais projetos ficam fora da capacidade mensal?'),
    ] }],
  },
  {
    n: '06', title: 'Projetos do mês', desc: 'Registre projetos com começo, fim e resultado esperado.',
    blocks: [{ type: 'table', id: 'projects', rows: 8, columns: ['Projeto', 'Prioridade relacionada', 'Objetivo', 'Início', 'Conclusão', 'Responsável', 'Dependências', 'Investimento', 'Status'] }],
  },
  {
    n: '07', title: 'Campanhas e ações estratégicas', desc: 'Organize campanhas, ativações, lançamentos e movimentos de relacionamento.',
    blocks: [{ type: 'table', id: 'campaigns', rows: 7, columns: ['Campanha ou ação', 'Objetivo', 'Público', 'Canal', 'Mensagem central', 'Período', 'Responsável', 'Indicador', 'Status'] }],
  },
  {
    n: '08', title: 'Conteúdo e comunicação', desc: 'Defina conteúdos a partir das prioridades do mês, e não de uma cota rígida.',
    blocks: [{ type: 'table', id: 'content', rows: 10, columns: ['Conteúdo ou peça', 'Objetivo estratégico', 'Formato', 'Canal', 'CTA', 'Prazo', 'Responsável', 'Status'] }],
  },
  {
    n: '09', title: 'Comercial, atendimento e relacionamento', desc: 'Registre ações que influenciam conversão, pós-venda e fidelização.',
    blocks: [{ type: 'table', id: 'commercial', rows: 7, columns: ['Ação', 'Etapa da jornada', 'Problema que resolve', 'Período', 'Responsável', 'Indicador', 'Meta', 'Status'] }],
  },
  {
    n: '10', title: 'Plano das semanas', desc: 'Distribua o trabalho em um ritmo de execução realista.',
    blocks: [{
      type: 'collectionCards', names: MONTHLY_WEEKS, prefix: 'week', cols: 2, fields: [
        input('Objetivo da semana', 'goal'),
        input('Responsável principal', 'owner'),
        text('Ações e entregas', 'actions'),
        text('Aprovações e dependências', 'dependencies'),
        text('Bloqueios ou decisões', 'blocks'),
      ],
    }],
  },
  {
    n: '11', title: 'Backlog de tarefas', desc: 'Liste tarefas operacionais e acompanhe responsáveis e prazos.',
    blocks: [{ type: 'table', id: 'tasks', rows: 12, columns: ['Tarefa', 'Projeto relacionado', 'Responsável', 'Data de início', 'Prazo', 'Prioridade', 'Dependência', 'Status'] }],
  },
  {
    n: '12', title: 'Capacidade mensal', desc: 'Controle carga, margem e possibilidade de demandas adicionais.',
    blocks: [
      { type: 'grid', cols: 3, fields: [
        input('Capacidade mensal contratada', 'monthly_capacity', 'Ex.: 20 pontos'),
        input('Reserva estratégica', 'strategic_reserve', 'Ex.: 15%'),
        input('Limite de projetos simultâneos', 'parallel_limit', 'Ex.: 3'),
      ] },
      { type: 'note', text: 'Se a capacidade for ultrapassada, a equipe deverá escolher entre substituir uma prioridade, ampliar temporariamente a estrutura ou contratar a demanda adicionalmente.' },
      {
        type: 'capacityCards', names: MONTHLY_WEEKS.slice(0, 4), prefix: 'capacity', cols: 4, fields: [
          input('Disponível', 'available', '5'),
          input('Planejado', 'planned', '0'),
          text('Observações', 'notes', 'Projetos pesados, urgências, reservas ou extras.'),
        ],
      },
    ],
  },
  {
    n: '13', title: 'Aprovações e materiais do cliente', desc: 'Registre o que depende de validação, informação ou participação da empresa.',
    blocks: [{ type: 'table', id: 'approvals', rows: 7, columns: ['Item', 'Tipo', 'Responsável pelo envio', 'Responsável pela aprovação', 'Data necessária', 'Impacto do atraso', 'Status'] }],
  },
  {
    n: '14', title: 'Indicadores e metas', desc: 'Defina como o mês será acompanhado.',
    blocks: [{ type: 'table', id: 'kpis', rows: 8, columns: ['Indicador', 'Categoria', 'Ponto de partida', 'Meta do mês', 'Fonte', 'Frequência', 'Responsável'] }],
  },
  {
    n: '15', title: 'Investimentos e despesas adicionais', desc: 'Separe mensalidade, mídia, impressão e projetos extras.',
    blocks: [
      { type: 'table', id: 'budget', rows: 6, columns: ['Categoria', 'Descrição', 'Valor previsto', 'Período', 'Aprovador', 'Status'] },
      { type: 'grid', cols: 3, fields: [
        input('Verba de mídia', 'media_budget', 'R$'),
        input('Verba de fornecedores', 'supplier_budget', 'R$'),
        input('Reserva para extras', 'extra_budget', 'R$'),
      ] },
    ],
  },
  {
    n: '16', title: 'Riscos, bloqueios e decisões', desc: 'Antecipe o que pode comprometer a execução.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('Principais riscos', 'main_risks', 'O que pode comprometer o mês?'),
        text('Bloqueios atuais', 'current_blocks', 'O que já está impedindo o avanço?'),
        text('Decisões necessárias', 'needed_decisions', 'Quais decisões precisam ser tomadas e por quem?'),
        text('Plano de resposta', 'response_plan', 'Como a equipe reagirá aos principais riscos?'),
      ] },
      { type: 'table', id: 'risks', rows: 5, columns: ['Risco ou bloqueio', 'Probabilidade', 'Impacto', 'Sinal de alerta', 'Resposta', 'Responsável'] },
    ],
  },
  {
    n: '17', title: 'Ritmo de acompanhamento', desc: 'Defina reuniões, check-ins e registros.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        input('Reunião de planejamento', 'planning_meeting', 'Data'),
        input('Check-in semanal', 'weekly_checkin', 'Dia e horário'),
        input('Reunião de resultados', 'results_meeting', 'Data'),
        input('Canal oficial de acompanhamento', 'official_channel', 'Ex.: ZebraHub'),
      ] },
      { type: 'table', id: 'governance', rows: 5, columns: ['Ritual', 'Objetivo', 'Participantes', 'Frequência', 'Responsável', 'Registro'] },
    ],
  },
  {
    n: '18', title: 'Fechamento do mês', desc: 'Registre resultados, aprendizados e direcionamento para o próximo mês.',
    blocks: [
      { type: 'grid', cols: 2, fields: [
        text('O que foi concluído', 'closing_done', 'Principais entregas e avanços.'),
        text('Resultados alcançados', 'closing_results', 'Resultados de negócio, marketing e operação.'),
        text('O que ficou pendente', 'closing_pending', 'Pendências e causas.'),
        text('Principais aprendizados', 'closing_learnings', 'O que deve ser repetido ou alterado?'),
        text('O que deve continuar', 'closing_continue', 'Práticas e projetos que seguem.'),
        text('O que deve parar', 'closing_stop', 'Ações que não geraram valor.'),
        text('O que deve começar', 'closing_start', 'Novos movimentos para o próximo mês.'),
        text('Hipótese para o próximo mês', 'next_month_hypothesis', 'Qual deve ser a próxima prioridade?'),
      ] },
      { type: 'table', id: 'final_results', rows: 6, columns: ['Indicador ou resultado', 'Meta', 'Resultado final', 'Avaliação', 'Observação'] },
    ],
  },
  {
    n: '19', title: 'Aprovação do planejamento', desc: 'Formalize escolhas, responsáveis e início da execução.',
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

export function createMonthlyPlanningData() {
  return createPlanningDocumentData(monthlyPlanningCoverFields, monthlyPlanningSections);
}

export function mergeMonthlyPlanningData(rawData) {
  return mergePlanningDocumentData(rawData, monthlyPlanningCoverFields, monthlyPlanningSections);
}

export function monthlyPlanningProgress(data) {
  return planningDocumentProgress(data, monthlyPlanningCoverFields, monthlyPlanningSections);
}
