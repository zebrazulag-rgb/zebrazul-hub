export const strategicDiagnosisSections = [
{
n:"01", title:"Apresentação", desc:"Contextualize a finalidade do documento e as fontes utilizadas.",
blocks:[
{type:"textarea", label:"Texto de apresentação", name:"presentation_text", placeholder:"Este documento apresenta a leitura estratégica da realidade atual da empresa...", help:"Inclua DME, reunião de imersão, canais analisados, dados e documentos utilizados."}
]},
{
n:"02", title:"Nota metodológica", desc:"Explique os limites, a natureza dinâmica e a lógica integrada do diagnóstico.",
blocks:[
{type:"textarea", label:"Nota metodológica", name:"method_note", placeholder:"O diagnóstico representa uma leitura do momento atual da empresa...", help:"Reforce que marketing, comercial, atendimento, processos e gestão são analisados de forma integrada."}
]},
{
n:"03", title:"Identificação da empresa", desc:"Registre as informações essenciais do negócio.",
blocks:[
{type:"grid", cols:3, fields:[
["Nome da empresa","id_company"],["Segmento","id_segment"],["Ano de fundação","id_year"],
["Cidade / região","id_region"],["Número de colaboradores","id_employees"],["Responsável interno","id_internal"],
["Sócios ou gestores","id_leaders"],["Principais canais","id_channels"],["Site e redes sociais","id_links"]
]}
]},
{
n:"04", title:"Contexto do negócio", desc:"Descreva o modelo de negócio, produtos, receita, sazonalidade e capacidade.",
blocks:[
{type:"textarea", label:"Como a empresa funciona", name:"business_model", placeholder:"A empresa atua no segmento de..."},
{type:"table", id:"products_table", columns:["Produto ou serviço","Participação","Margem percebida","Potencial","Prioridade"], rows:3},
{type:"textarea", label:"Forma de geração de receita", name:"revenue_model", placeholder:"Descreva como a empresa gera receita."},
{type:"textarea", label:"Sazonalidade", name:"seasonality", placeholder:"Meses fortes, fracos, datas e ciclos relevantes."},
{type:"textarea", label:"Capacidade operacional atual", name:"capacity", placeholder:"Quanto a empresa consegue atender sem comprometer a qualidade?"}
]},
{
n:"05", title:"História e identidade", desc:"Registre origem, marcos, essência e valores.",
blocks:[
{type:"textarea", label:"Origem da empresa", name:"origin", placeholder:"Como a empresa surgiu?"},
{type:"textarea", label:"Motivação de origem", name:"origin_motivation", placeholder:"Por que ela foi criada?"},
{type:"textarea", label:"Marcos importantes", name:"milestones", placeholder:"Liste fatos importantes da trajetória."},
{type:"textarea", label:"Essência percebida", name:"essence", placeholder:"O que não pode ser perdido durante o crescimento?"},
{type:"textarea", label:"Valores praticados", name:"values", placeholder:"Quais valores aparecem na prática?"},
{type:"textarea", label:"Possíveis contradições", name:"contradictions", placeholder:"Onde existe distância entre discurso e prática?"}
]},
{
n:"06", title:"Momento atual", desc:"Crie uma síntese clara do estágio atual da empresa.",
blocks:[
{type:"textarea", label:"Síntese do momento", name:"current_summary", placeholder:"A empresa possui... porém..."},
{type:"textarea", label:"Características do momento atual", name:"current_traits", placeholder:"Liste os principais traços do momento."},
{type:"textarea", label:"Principais mudanças recentes", name:"recent_changes", placeholder:"Mudanças de equipe, produto, mercado, estrutura ou direção."},
{type:"textarea", label:"Pressões atuais", name:"pressures", placeholder:"Pressões financeiras, comerciais, operacionais ou de mercado."}
]},
{
n:"07", title:"Objetivos da empresa", desc:"Transforme desejos em objetivos claros e mensuráveis.",
blocks:[
{type:"textarea", label:"Objetivo principal dos próximos 12 meses", name:"main_goal", placeholder:"Qual é o principal resultado desejado?"},
{type:"grid", cols:3, fields:[["O que queremos","goal_what"],["Para que queremos","goal_why"],["Como avançaremos","goal_how"]]},
{type:"textarea", label:"Objetivos complementares", name:"secondary_goals", placeholder:"Liste objetivos de apoio."},
{type:"textarea", label:"Definição de sucesso", name:"success_definition", placeholder:"Quais resultados demonstrarão que a parceria deu certo?"}
]},
{
n:"08", title:"Resultado do DME", desc:"Consolide a nota geral e a leitura dos oito pilares.",
blocks:[
{type:"grid", cols:2, fields:[["Nota geral de maturidade","dme_score"],["Nível identificado","dme_level"]]},
{type:"table", id:"dme_table", columns:["Pilar","Nota","Leitura resumida"], fixedRows:[
["Propósito e Posicionamento","",""],["Marca e Comunicação","",""],["Marketing e Aquisição","",""],
["Comercial e Conversão","",""],["Relacionamento e Fidelização","",""],["Processos e Organização","",""],
["Gestão e Indicadores","",""],["Crescimento e Inovação","",""]
]},
{type:"textarea", label:"Maiores notas", name:"dme_highs", placeholder:"Quais pilares aparecem como forças?"},
{type:"textarea", label:"Menores notas", name:"dme_lows", placeholder:"Quais pilares exigem maior atenção?"},
{type:"textarea", label:"Leitura principal do DME", name:"dme_reading", placeholder:"Explique o que a combinação das notas demonstra."}
]},
{
n:"09", title:"Diagnóstico por pilar", desc:"Aprofunde cada pilar com evidências, causas, consequências e recomendações.",
blocks:[
{type:"pillarGroup", pillars:["Propósito e Posicionamento","Marca e Comunicação","Marketing e Aquisição","Comercial e Conversão","Relacionamento e Fidelização","Processos e Organização","Gestão e Indicadores","Crescimento e Inovação"]}
]},
{
n:"10", title:"Problema central", desc:"Formule a principal limitação que concentra os efeitos observados.",
blocks:[
{type:"textarea", label:"Formulação do problema central", name:"central_problem", placeholder:"A empresa possui... mas ainda não..."},
{type:"textarea", label:"Por que este é o problema central", name:"problem_reason", placeholder:"Justifique com evidências."},
{type:"textarea", label:"Como o problema se manifesta", name:"problem_manifestations", placeholder:"Liste sintomas concretos."},
{type:"textarea", label:"O que não deve ser confundido com o problema", name:"not_the_problem", placeholder:"Diferencie causas, sintomas e consequências."}
]},
{
n:"11", title:"Causas-raiz", desc:"Identifique as causas que sustentam o problema central.",
blocks:[
{type:"causeCards", count:3}
]},
{
n:"12", title:"Consequências atuais", desc:"Mostre os impactos comerciais, financeiros, operacionais e de marca.",
blocks:[
{type:"textarea", label:"Consequências identificadas", name:"consequences", placeholder:"Liste as consequências atuais."},
{type:"textarea", label:"Consequência prioritária", name:"priority_consequence", placeholder:"Qual consequência possui maior impacto?"}
]},
{
n:"13", title:"Forças estratégicas", desc:"Registre os ativos que podem sustentar o avanço.",
blocks:[
{type:"textarea", label:"Principais forças identificadas", name:"strengths", placeholder:"Liste e explique as principais forças."},
{type:"textarea", label:"Ativos que a empresa já possui", name:"assets", placeholder:"Reputação, equipe, estrutura, carteira, conhecimento, parcerias..."}
]},
{
n:"14", title:"Fragilidades estratégicas", desc:"Registre os fatores que reduzem valor ou dificultam o crescimento.",
blocks:[
{type:"textarea", label:"Principais fragilidades", name:"weaknesses", placeholder:"Liste e explique as fragilidades."},
{type:"textarea", label:"Impacto das fragilidades", name:"weakness_impact", placeholder:"Como elas dificultam o objetivo?"}
]},
{
n:"15", title:"Oportunidades", desc:"Mapeie oportunidades internas, comerciais, de comunicação, relacionamento e mercado.",
blocks:[
{type:"gridTextareas", items:[
["Oportunidades internas","opp_internal"],["Oportunidades comerciais","opp_sales"],
["Oportunidades de comunicação","opp_comms"],["Oportunidades de relacionamento","opp_relationship"],
["Oportunidades de mercado","opp_market"],["Oportunidade prioritária","opp_priority"]
]}
]},
{
n:"16", title:"Riscos", desc:"Registre riscos internos, externos e de execução.",
blocks:[
{type:"gridTextareas", items:[
["Riscos internos","risk_internal"],["Riscos externos","risk_external"],
["Riscos de execução","risk_execution"],["Medidas de prevenção","risk_prevention"]
]}
]},
{
n:"17", title:"Promotor, Detrator e Acelerador", desc:"Condense a leitura estratégica em três forças centrais.",
blocks:[
{type:"tripleCards", items:[
["Promotor","promoter","O que já favorece o crescimento?","Como aproveitar?"],
["Detrator","detractor","O que reduz valor ou impede avanço?","Como neutralizar?"],
["Acelerador","accelerator","Qual movimento pode ampliar resultados?","Como ativar?"]
]}
]},
{
n:"18", title:"Público prioritário", desc:"Defina quem deve ser priorizado e como esse público decide.",
blocks:[
{type:"textarea", label:"Público atual", name:"audience_current", placeholder:"Quem compra hoje?"},
{type:"textarea", label:"Público desejado", name:"audience_desired", placeholder:"Quem a empresa deseja alcançar?"},
{type:"textarea", label:"Diferença entre atual e desejado", name:"audience_gap", placeholder:"Explique a distância entre eles."},
{type:"grid", cols:2, fields:[
["Quem é","persona_who"],["O que deseja","persona_desire"],["Problema que enfrenta","persona_problem"],
["O que teme","persona_fear"],["Objeções","persona_objections"],["O que gera confiança","persona_trust"],
["Como toma decisão","persona_decision"],["Onde pode ser alcançado","persona_channels"]
]}
]},
{
n:"19", title:"Jornada do cliente", desc:"Analise descoberta, consideração, contato, decisão, experiência e relacionamento.",
blocks:[
{type:"journey"}
]},
{
n:"20", title:"Posicionamento atual e desejado", desc:"Compare percepção atual, desejada e a percepção que deve ser evitada.",
blocks:[
{type:"gridTextareas", items:[
["Percepção atual","position_current"],["Percepção desejada","position_desired"],
["Percepção a evitar","position_avoid"],["Distância entre o atual e o desejado","position_gap"]
]},
{type:"textarea", label:"Hipótese de posicionamento", name:"position_hypothesis", placeholder:"[Empresa] é [categoria] que ajuda [público] a [resultado] por meio de [diferencial]."},
{type:"textarea", label:"Proposta de valor preliminar", name:"value_prop", placeholder:"Escreva uma proposta de valor inicial."},
{type:"textarea", label:"Mensagem central preliminar", name:"central_message", placeholder:"Qual mensagem deve orientar a comunicação?"}
]},
{
n:"21", title:"Tese estratégica", desc:"Formule a conclusão central que direcionará o Plano de Ação.",
blocks:[
{type:"textarea", label:"Tese estratégica", name:"strategic_thesis", placeholder:"A empresa não precisa inicialmente... precisa..."},
{type:"textarea", label:"Explicação da tese", name:"thesis_explanation", placeholder:"Explique a lógica e as evidências por trás da tese."}
]},
{
n:"22", title:"Pilares estratégicos recomendados", desc:"Defina de três a cinco grandes frentes para orientar o plano.",
blocks:[
{type:"strategicPillars", count:4}
]},
{
n:"23", title:"Matriz de prioridades", desc:"Avalie iniciativas por impacto, urgência, viabilidade e esforço.",
blocks:[
{type:"table", id:"priority_matrix", columns:["Iniciativa","Impacto 1–5","Urgência 1–5","Viabilidade 1–5","Esforço 1–5","Decisão"], rows:5}
]},
{
n:"24", title:"Prioridades estratégicas", desc:"Defina as três prioridades que orientarão o primeiro ciclo.",
blocks:[
{type:"priorityCards", count:3}
]},
{
n:"25", title:"O que não será prioridade agora", desc:"Registre temas que serão adiados para proteger o foco.",
blocks:[
{type:"textarea", label:"Temas que não serão tratados neste ciclo", name:"not_priority", placeholder:"Liste temas relevantes, mas não prioritários."},
{type:"textarea", label:"Justificativa", name:"not_priority_reason", placeholder:"Explique por que devem aguardar."}
]},
{
n:"26", title:"Direção para os próximos 90 dias", desc:"Estruture objetivo e frentes do primeiro ciclo.",
blocks:[
{type:"textarea", label:"Objetivo do ciclo", name:"cycle_goal", placeholder:"Qual transformação deve acontecer em 90 dias?"},
{type:"cycleFronts"}
]},
{
n:"27", title:"Ganho rápido", desc:"Defina uma ação com impacto perceptível em curto prazo.",
blocks:[
{type:"grid", cols:2, fields:[["Ação de ganho rápido","quick_action"],["Prazo sugerido","quick_deadline"],["Por que fazer agora","quick_reason"],["Resultado esperado","quick_result"]]}
]},
{
n:"28", title:"Projeto estruturante", desc:"Defina o projeto que resolve uma causa-raiz.",
blocks:[
{type:"grid", cols:2, fields:[["Nome do projeto","struct_project"],["Prazo sugerido","struct_deadline"],["Problema que resolve","struct_problem"],["Resultado esperado","struct_result"]]},
{type:"textarea", label:"Etapas do projeto", name:"struct_steps", placeholder:"1. ...\n2. ...\n3. ..."}
]},
{
n:"29", title:"Indicadores recomendados", desc:"Defina o indicador principal e os indicadores de apoio.",
blocks:[
{type:"grid", cols:3, fields:[["Indicador principal","main_kpi"],["Por que acompanhar","main_kpi_reason"],["Frequência","main_kpi_frequency"]]},
{type:"table", id:"kpi_table", columns:["Indicador","Objetivo","Fonte","Frequência","Responsável"], rows:5}
]},
{
n:"30", title:"Responsabilidades", desc:"Separe claramente o que depende da Zebrazul e do cliente.",
blocks:[
{type:"gridTextareas", items:[["Responsabilidades da Zebrazul","resp_zebrazul"],["Responsabilidades do cliente","resp_client"]]},
{type:"grid", cols:3, fields:[["Responsável interno","internal_owner"],["Função","internal_role"],["Nível de autonomia","internal_autonomy"]]}
]},
{
n:"31", title:"Recursos e investimentos", desc:"Mapeie recursos existentes, necessidades e projetos adicionais.",
blocks:[
{type:"gridTextareas", items:[
["Recursos existentes","resources_current"],["Recursos necessários","resources_needed"],
["Investimentos possíveis","investments"],["Projetos adicionais","extra_projects"]
]}
]},
{
n:"32", title:"Premissas do plano", desc:"Registre condições necessárias para a execução.",
blocks:[
{type:"textarea", label:"Premissas", name:"assumptions", placeholder:"Participação dos sócios, disponibilidade de dados, aprovações, verba, capacidade..."}
]},
{
n:"33", title:"Conclusão estratégica", desc:"Consolide potencial, limitação, direção, foco e papel da parceria.",
blocks:[
{type:"textarea", label:"Conclusão estratégica", name:"strategic_conclusion", placeholder:"Escreva de três a cinco parágrafos conectando forças, gargalos, prioridades e atuação da Zebrazul."}
]},
{
n:"34", title:"Próximos passos", desc:"Registre a sequência de decisões e implantação.",
blocks:[
{type:"textarea", label:"Próximos passos", name:"next_steps", placeholder:"1. Validar conclusões\n2. Aprovar pilares\n3. Construir Plano de Ação..."}
]},
{
n:"35", title:"Aprovação do diagnóstico", desc:"Registre decisões, ajustes e pendências.",
blocks:[
{type:"gridTextareas", items:[["Pontos aprovados","approved_points"],["Ajustes solicitados","requested_changes"],["Decisões tomadas","decisions"]]},
{type:"table", id:"pending_table", columns:["Pendência","Responsável","Prazo"], rows:4}
]},
{
n:"36", title:"Assinatura metodológica", desc:"Finalize o documento com a direção da Zebrazul.",
blocks:[
{type:"textarea", label:"Mensagem final", name:"closing_message", placeholder:"A estratégia escolhe a entrega. Antes de produzir, compreendemos..."},
{type:"grid", cols:2, fields:[["Responsável Zebrazul","sign_zebrazul"],["Responsável pelo cliente","sign_client"]]}
]}
];

export const strategicDiagnosisCoverFields = [
  { label: 'Nome da empresa', name: 'company_name', placeholder: 'Ex.: Empresa Exemplo' },
  { label: 'Período analisado', name: 'analysis_period', placeholder: 'Ex.: Julho de 2026' },
  { label: 'Responsável pelo projeto', name: 'project_lead', placeholder: 'Nome do estrategista' },
  { label: 'Data da apresentação', name: 'presentation_date', type: 'date' },
  { label: 'Subtítulo ou observação de capa', name: 'cover_note', placeholder: 'Diagnóstico, planejamento e execução conectados aos objetivos do negócio.', full: true },
];

function registerScalar(target, name) {
  if (name && !Object.prototype.hasOwnProperty.call(target, name)) target[name] = '';
}

function registerBlockFields(block, fields, tables) {
  if (block.type === 'textarea') registerScalar(fields, block.name);
  if (block.type === 'grid') block.fields.forEach((field) => registerScalar(fields, field[1]));
  if (block.type === 'gridTextareas') block.items.forEach((item) => registerScalar(fields, item[1]));
  if (block.type === 'table') {
    const rows = block.fixedRows
      ? block.fixedRows.map((row) => [...row])
      : Array.from({ length: block.rows || 3 }, () => block.columns.map(() => ''));
    tables[block.id] = rows;
  }
  if (block.type === 'pillarGroup') {
    block.pillars.forEach((_, index) => {
      ['situation', 'evidence', 'strengths', 'weaknesses', 'consequences', 'recommendation', 'priority']
        .forEach((suffix) => registerScalar(fields, `pillar_${index}_${suffix}`));
    });
  }
  if (block.type === 'causeCards') {
    Array.from({ length: block.count }).forEach((_, index) => {
      ['title', 'description', 'evidence', 'impact'].forEach((suffix) => registerScalar(fields, `cause_${index}_${suffix}`));
    });
  }
  if (block.type === 'tripleCards') {
    block.items.forEach((item) => {
      registerScalar(fields, `${item[1]}_description`);
      registerScalar(fields, `${item[1]}_action`);
    });
  }
  if (block.type === 'journey') {
    Array.from({ length: 6 }).forEach((_, index) => {
      ['current', 'gaps', 'opportunities'].forEach((suffix) => registerScalar(fields, `journey_${index}_${suffix}`));
    });
  }
  if (block.type === 'strategicPillars') {
    Array.from({ length: block.count }).forEach((_, index) => {
      ['name', 'goal', 'problem', 'moves'].forEach((suffix) => registerScalar(fields, `strategy_pillar_${index}_${suffix}`));
    });
  }
  if (block.type === 'priorityCards') {
    Array.from({ length: block.count }).forEach((_, index) => {
      ['name', 'reason', 'result', 'owners'].forEach((suffix) => registerScalar(fields, `priority_${index}_${suffix}`));
    });
  }
  if (block.type === 'cycleFronts') {
    Array.from({ length: 3 }).forEach((_, index) => {
      registerScalar(fields, `cycle_front_${index}_goal`);
      registerScalar(fields, `cycle_front_${index}_projects`);
    });
  }
}

export function createStrategicDiagnosisData() {
  const fields = {};
  const tables = {};
  strategicDiagnosisCoverFields.forEach((field) => registerScalar(fields, field.name));
  strategicDiagnosisSections.forEach((section) => section.blocks.forEach((block) => registerBlockFields(block, fields, tables)));
  return { fields, tables };
}

export function mergeStrategicDiagnosisData(rawData) {
  const defaults = createStrategicDiagnosisData();
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  return {
    fields: { ...defaults.fields, ...(source.fields || {}) },
    tables: Object.fromEntries(
      Object.entries(defaults.tables).map(([tableId, rows]) => [
        tableId,
        Array.isArray(source.tables?.[tableId]) ? source.tables[tableId] : rows,
      ])
    ),
  };
}

export function strategicDiagnosisProgress(data) {
  const normalized = mergeStrategicDiagnosisData(data);
  const values = Object.values(normalized.fields);
  let completed = values.filter((value) => String(value || '').trim()).length;
  let total = values.length;

  strategicDiagnosisSections.forEach((section) => section.blocks.forEach((block) => {
    if (block.type !== 'table') return;
    const rows = normalized.tables[block.id] || [];
    rows.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const isFixedLabel = Boolean(block.fixedRows && columnIndex === 0 && block.fixedRows[rowIndex]?.[0]);
        if (isFixedLabel) return;
        total += 1;
        if (String(value || '').trim()) completed += 1;
      });
    });
  }));

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
