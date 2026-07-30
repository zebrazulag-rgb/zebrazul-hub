function text(value) {
  return String(value ?? '').trim();
}

function compact(values, separator = '\n\n') {
  const seen = new Set();
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(text)
    .filter((value) => {
      const normalized = value.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(separator);
}

function labeled(label, value) {
  const content = text(value);
  return content ? `${label}: ${content}` : '';
}

function rowHasContent(row) {
  return Array.isArray(row) && row.some((value) => text(value));
}

function nonEmptyRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(rowHasContent);
}

function fitRow(row, size) {
  return Array.from({ length: size }, (_, index) => text(row?.[index]));
}

function fitRows(rows, columns, minimumRows = 0) {
  const filled = nonEmptyRows(rows).map((row) => fitRow(row, columns));
  while (filled.length < minimumRows) filled.push(Array.from({ length: columns }, () => ''));
  return filled;
}

function splitItems(value) {
  return text(value)
    .split(/\n|;|•|\u2022|\|/)
    .map((item) => item.replace(/^[-–—\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function isBlank(value) {
  return !text(value);
}

function isTableBlank(rows) {
  return !nonEmptyRows(rows).length;
}

function cloneData(data) {
  return {
    ...data,
    fields: { ...(data?.fields || {}) },
    tables: Object.fromEntries(
      Object.entries(data?.tables || {}).map(([key, rows]) => [
        key,
        Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? [...row] : []) : [],
      ]),
    ),
    stageImport: data?.stageImport && typeof data.stageImport === 'object'
      ? {
        ...data.stageImport,
        fieldKeys: Array.isArray(data.stageImport.fieldKeys) ? [...data.stageImport.fieldKeys] : [],
        tableKeys: Array.isArray(data.stageImport.tableKeys) ? [...data.stageImport.tableKeys] : [],
      }
      : null,
  };
}

export function stageSourceSignature(source) {
  const normalized = source && typeof source === 'object'
    ? { fields: source.fields || {}, tables: source.tables || {} }
    : source || {};
  const raw = JSON.stringify(normalized);
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16)}`;
}

function applyMapping(currentData, mapping, options) {
  const next = cloneData(currentData);
  const previousImport = next.stageImport || {};
  const trackedFields = new Set(previousImport.fieldKeys || []);
  const trackedTables = new Set(previousImport.tableKeys || []);
  const appliedFields = new Set(trackedFields);
  const appliedTables = new Set(trackedTables);
  const mode = options.mode || 'empty';

  Object.entries(mapping.fields || {}).forEach(([key, rawValue]) => {
    const value = text(rawValue);
    if (!value) return;
    const canApply = isBlank(next.fields[key]) || (mode === 'refresh' && trackedFields.has(key));
    if (!canApply) return;
    next.fields[key] = value;
    appliedFields.add(key);
  });

  Object.entries(mapping.tables || {}).forEach(([key, rows]) => {
    const normalizedRows = nonEmptyRows(rows);
    if (!normalizedRows.length) return;
    const canApply = isTableBlank(next.tables[key]) || (mode === 'refresh' && trackedTables.has(key));
    if (!canApply) return;
    const existingColumnCount = Math.max(
      ...(next.tables[key] || []).map((row) => Array.isArray(row) ? row.length : 0),
      ...(normalizedRows || []).map((row) => Array.isArray(row) ? row.length : 0),
      1,
    );
    next.tables[key] = fitRows(normalizedRows, existingColumnCount, (next.tables[key] || []).length);
    appliedTables.add(key);
  });

  next.stageImport = {
    sourceType: options.sourceType,
    sourceLabel: options.sourceLabel,
    sourcePeriodKey: options.sourcePeriodKey || '',
    sourcePeriodLabel: options.sourcePeriodLabel || '',
    sourceSignature: options.sourceSignature,
    sourceUpdatedAt: options.sourceUpdatedAt || null,
    importedAt: new Date().toISOString(),
    fieldKeys: [...appliedFields],
    tableKeys: [...appliedTables],
  };

  return next;
}

export function detachImportedField(data, fieldKey) {
  if (!data?.stageImport) return data;
  return {
    ...data,
    stageImport: {
      ...data.stageImport,
      fieldKeys: (data.stageImport.fieldKeys || []).filter((key) => key !== fieldKey),
    },
  };
}

export function detachImportedTable(data, tableKey) {
  if (!data?.stageImport) return data;
  return {
    ...data,
    stageImport: {
      ...data.stageImport,
      tableKeys: (data.stageImport.tableKeys || []).filter((key) => key !== tableKey),
    },
  };
}

function diagnosisToAnnualMapping(diagnosis, context) {
  const f = diagnosis?.fields || {};
  const t = diagnosis?.tables || {};
  const fields = {
    company: compact([f.company_name, f.id_company, context.clientName]),
    year_label: String(context.year || ''),
    lead: compact([f.project_lead, f.sign_zebrazul]),
    owner: compact([f.internal_owner, f.id_internal, f.sign_client]),
    cover_note: compact([f.strategic_conclusion, f.cover_note, f.current_summary]),
    diag: compact([f.strategic_conclusion, f.current_summary, f.dme_reading]),
    problem: compact([
      f.central_problem,
      labeled('Por que este é o problema central', f.problem_reason),
      labeled('Como se manifesta', f.problem_manifestations),
    ]),
    thesis: compact([f.strategic_thesis, f.thesis_explanation]),
    change: compact([f.main_goal, f.cycle_goal, f.success_definition]),
    goal_what: compact([f.goal_what, f.main_goal]),
    goal_why: compact([f.goal_why, f.success_definition]),
    goal_how: compact([f.goal_how, f.next_steps]),
    main_target: compact([f.main_goal, f.cycle_goal, f.quick_result, f.struct_result]),
    success: compact([f.success_definition, labeled('Indicador principal', f.main_kpi)]),
    principles: compact([f.values, f.essence]),
    assumptions: compact([f.assumptions, f.resources_current]),
    constraints: compact([f.capacity, f.resources_needed, f.risk_execution]),
    not_priority: compact([f.not_priority, f.not_priority_reason]),
    capacity_total: f.capacity,
    resp_z: f.resp_zebrazul,
    resp_c: f.resp_client,
    approved: f.approved_points,
    changes: f.requested_changes,
    next: compact([f.next_steps, f.decisions]),
    closing: compact([f.closing_message, f.strategic_conclusion]),
    sign_z: compact([f.sign_zebrazul, f.project_lead]),
    sign_c: compact([f.sign_client, f.internal_owner]),
  };

  for (let index = 0; index < 5; index += 1) {
    fields[`pillar_${index}_name`] = f[`strategy_pillar_${index}_name`] || '';
    fields[`pillar_${index}_goal`] = f[`strategy_pillar_${index}_goal`] || '';
    fields[`pillar_${index}_problem`] = f[`strategy_pillar_${index}_problem`] || '';
    fields[`pillar_${index}_moves`] = f[`strategy_pillar_${index}_moves`] || '';
    fields[`pillar_${index}_kpis`] = index === 0 ? f.main_kpi || '' : '';
    fields[`pillar_${index}_result`] = f[`priority_${index}_result`] || '';
  }

  const priorities = Array.from({ length: 3 }, (_, index) => ({
    name: f[`priority_${index}_name`],
    reason: f[`priority_${index}_reason`],
    result: f[`priority_${index}_result`],
    owners: f[`priority_${index}_owners`],
  })).filter((item) => compact(Object.values(item)));

  const cycleFronts = Array.from({ length: 3 }, (_, index) => ({
    goal: f[`cycle_front_${index}_goal`],
    projects: f[`cycle_front_${index}_projects`],
  }));

  fields.q_0_goal = compact([f.cycle_goal, f.main_goal]);
  fields.q_0_priorities = compact(priorities.map((item) => item.name), '\n');
  fields.q_0_projects = compact([cycleFronts.map((item) => item.projects), f.struct_project, f.quick_action], '\n');
  fields.q_0_kpis = compact([f.main_kpi, f.quick_result, f.struct_result], '\n');
  fields.q_0_risks = compact([f.risk_execution, f.risk_internal, f.risk_external, f.resources_needed]);

  priorities.forEach((priority, index) => {
    fields[`m_${index}_priority`] = priority.name;
    fields[`m_${index}_actions`] = compact([cycleFronts[index]?.projects, priority.result]);
    fields[`m_${index}_owner`] = priority.owners;
    fields[`m_${index}_kpi`] = f.main_kpi;
  });

  fields.sp_0_name = f.struct_project;
  fields.sp_0_problem = f.struct_problem;
  fields.sp_0_result = f.struct_result;
  fields.sp_0_steps = f.struct_steps;
  fields.sp_0_end = f.struct_deadline;

  const goals = priorities.map((priority) => [
    priority.name,
    f.main_kpi,
    '',
    priority.result,
    '',
    priority.owners,
    'Planejada',
  ]);
  if (f.main_goal || f.cycle_goal) {
    goals.unshift([f.main_goal || f.cycle_goal, f.main_kpi, '', f.success_definition, '', f.internal_owner, 'Planejada']);
  }

  const initiatives = nonEmptyRows(t.priority_matrix).map((row) => [
    row[0], '', '', row[1], row[2], row[4], '1º trimestre', '', '', row[5] || 'Planejada',
  ]);
  if (f.struct_project) initiatives.push([f.struct_project, '', f.struct_result, 'Alto', '', '', '1º trimestre', f.internal_owner, f.investments, 'Planejada']);
  if (f.quick_action) initiatives.push([f.quick_action, '', f.quick_result, 'Rápido', 'Alta', '', '1º trimestre', f.internal_owner, '', 'Planejada']);

  const kpis = nonEmptyRows(t.kpi_table).map((row) => [row[0], row[1], '', '', row[2], row[3], row[4]]);
  if (f.main_kpi) kpis.unshift([f.main_kpi, 'Estratégico', '', '', '', f.main_kpi_frequency, f.internal_owner]);

  return {
    fields,
    tables: {
      goals,
      initiatives,
      quick: f.quick_action ? [[f.quick_action, f.quick_reason, f.quick_result, f.quick_deadline, f.internal_owner, 'Planejada']] : [],
      kpis,
      risks: [
        [f.risk_internal, '', '', '', f.risk_prevention, '', f.internal_owner],
        [f.risk_external, '', '', '', f.risk_prevention, '', f.internal_owner],
        [f.risk_execution, '', '', '', f.risk_prevention, '', f.internal_owner],
      ],
      dependencies: f.resources_needed ? [[f.resources_needed, 'Recurso', f.internal_owner, '', 'Pode limitar a execução', 'Pendente']] : [],
      governance: [
        ['Revisão trimestral', 'Acompanhar execução e ajustar prioridades', 'Zebrazul e cliente', 'Trimestral', f.project_lead, 'ZebraHub'],
        ['Reunião mensal', 'Revisar indicadores e decisões', 'Responsáveis do plano', 'Mensal', f.internal_owner, 'ZebraHub'],
      ],
    },
  };
}

export function buildAnnualPlanFromDiagnosis(currentData, diagnosis, context, mode = 'empty') {
  return applyMapping(currentData, diagnosisToAnnualMapping(diagnosis, context), {
    mode,
    sourceType: 'strategic_diagnosis',
    sourceLabel: 'Diagnóstico Estratégico',
    sourcePeriodKey: String(context.year || ''),
    sourcePeriodLabel: String(context.year || ''),
    sourceSignature: stageSourceSignature(diagnosis),
    sourceUpdatedAt: context.sourceUpdatedAt,
  });
}

function annualToCycleMapping(annual, context) {
  const f = annual?.fields || {};
  const t = annual?.tables || {};
  const quarter = Number(context.quarter) || 1;
  const quarterIndex = Math.max(0, Math.min(3, quarter - 1));
  const monthStart = quarterIndex * 3;
  const fields = {
    company_name: compact([f.company, context.clientName]),
    cycle_name: `Ciclo ${quarter} — ${context.quarterLabel || 'Execução estratégica'}`,
    cycle_start: context.startDate,
    cycle_end: context.endDate,
    zebrazul_owner: compact([f.lead, f.sign_z]),
    client_owner: compact([f.owner, f.sign_c]),
    cover_note: compact([f.cover_note, f.change]),
    annual_goal: compact([f.goal_what, f.main_target, f.change]),
    related_pillars: compact(Array.from({ length: 5 }, (_, index) => f[`pillar_${index}_name`]), '\n'),
    cycle_diagnosis: compact([f.diag, f.problem, f.thesis]),
    cycle_change: compact([f[`q_${quarterIndex}_goal`], f.change, f.main_target]),
    cycle_what: compact([f[`q_${quarterIndex}_goal`], f.goal_what]),
    cycle_why: f.goal_why,
    cycle_how: compact([f[`q_${quarterIndex}_priorities`], f.goal_how]),
    cycle_key_result: compact([f[`q_${quarterIndex}_kpis`], f.main_target]),
    cycle_success: f.success,
    cycle_thesis: f.thesis,
    cycle_hypotheses: f.assumptions,
    cycle_focus: compact([f[`q_${quarterIndex}_priorities`], Array.from({ length: 3 }, (_, index) => f[`m_${monthStart + index}_priority`])], '\n'),
    cycle_out: f.not_priority,
    cycle_capacity: f.capacity_total,
    cycle_reserve: f.capacity_reserve,
    parallel_projects: f.parallel,
    zebrazul_responsibilities: f.resp_z,
    client_responsibilities: f.resp_c,
    kickoff_meeting: f.annual_meeting,
    monthly_review: f.monthly_meeting,
    weekly_checkin: f.checkin,
    approved_points: f.approved,
    requested_changes: f.changes,
    immediate_steps: f.next,
    closing_message: f.closing,
    sign_zebrazul: f.sign_z,
    sign_client: f.sign_c,
    approval_date: f.approval,
  };

  const quarterPriorityItems = splitItems(f[`q_${quarterIndex}_priorities`]);
  for (let index = 0; index < 3; index += 1) {
    const pillarIndex = Math.min(index, 4);
    fields[`priority_${index}_name`] = quarterPriorityItems[index] || f[`pillar_${pillarIndex}_name`] || f[`m_${monthStart + index}_priority`] || '';
    fields[`priority_${index}_reason`] = f[`pillar_${pillarIndex}_problem`] || f.problem || '';
    fields[`priority_${index}_result`] = f[`pillar_${pillarIndex}_result`] || f[`q_${quarterIndex}_goal`] || '';
    fields[`priority_${index}_projects`] = compact([f[`pillar_${pillarIndex}_moves`], f[`m_${monthStart + index}_actions`]]);
    fields[`priority_${index}_kpis`] = compact([f[`pillar_${pillarIndex}_kpis`], f[`m_${monthStart + index}_kpi`], f[`q_${quarterIndex}_kpis`]]);

    fields[`month_${index}_goal`] = compact([f[`m_${monthStart + index}_priority`], index === 0 ? f[`q_${quarterIndex}_goal`] : '']);
    fields[`month_${index}_deliveries`] = f[`m_${monthStart + index}_actions`];
    fields[`month_${index}_milestones`] = f[`m_${monthStart + index}_dates`];
    fields[`month_${index}_kpis`] = f[`m_${monthStart + index}_kpi`];
    fields[`month_${index}_risks`] = f[`q_${quarterIndex}_risks`];

    fields[`capacity_${index}_available`] = f.capacity_total;
    fields[`capacity_${index}_planned`] = '';
    fields[`capacity_${index}_notes`] = f[`m_${monthStart + index}_actions`];
  }

  const quarterLabelPattern = new RegExp(`${quarter}(º|o)?\\s*trimestre|q${quarter}`, 'i');
  const initiatives = nonEmptyRows(t.initiatives);
  const quarterProjects = initiatives.filter((row) => !text(row[6]) || quarterLabelPattern.test(text(row[6])));
  const projectRows = (quarterProjects.length ? quarterProjects : initiatives).map((row) => [
    row[0], row[1], row[2], '', '', row[7], '', row[8], row[9],
  ]);

  const outcomes = nonEmptyRows(t.goals).map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[6]]);
  const backlog = [
    ...nonEmptyRows(t.quick).map((row) => [row[0], 'Ganho rápido', '', row[4], row[3], 'Baixo', row[2], row[5]]),
    ...quarterProjects.map((row) => [row[0], 'Projeto', row[1], row[7], '', row[5], row[3], row[9]]),
  ];

  return {
    fields,
    tables: {
      outcomes,
      projects: projectRows,
      backlog,
      kpis: nonEmptyRows(t.kpis).map((row) => fitRow(row, 7)),
      responsibilities: nonEmptyRows(t.ram).map((row) => fitRow(row, 5)),
      governance: nonEmptyRows(t.governance).map((row) => fitRow(row, 6)),
      risks: nonEmptyRows(t.risks).map((row) => fitRow(row, 7)),
      dependencies: nonEmptyRows(t.dependencies).map((row) => fitRow(row, 6)),
    },
  };
}

export function buildCycleFromAnnual(currentData, annual, context, mode = 'empty') {
  return applyMapping(currentData, annualToCycleMapping(annual, context), {
    mode,
    sourceType: 'annual_plan',
    sourceLabel: 'Plano de Ação Anual',
    sourcePeriodKey: String(context.year || ''),
    sourcePeriodLabel: String(context.year || ''),
    sourceSignature: stageSourceSignature(annual),
    sourceUpdatedAt: context.sourceUpdatedAt,
  });
}

function cycleToMonthlyMapping(cycle, context) {
  const f = cycle?.fields || {};
  const t = cycle?.tables || {};
  const monthInQuarter = Math.max(0, Math.min(2, Number(context.monthInQuarter) || 0));
  const weekStart = monthInQuarter * 4;
  const weekCount = monthInQuarter === 2 ? 5 : 4;
  const fields = {
    company_name: compact([f.company_name, context.clientName]),
    month_reference: context.periodLabel,
    cycle_reference: compact([f.cycle_name, context.cyclePeriodLabel]),
    zebrazul_owner: f.zebrazul_owner,
    client_owner: f.client_owner,
    cover_note: compact([f.cover_note, f.cycle_change]),
    cycle_goal: compact([f.cycle_what, f.annual_goal]),
    cycle_priorities: compact(Array.from({ length: 3 }, (_, index) => f[`priority_${index}_name`]), '\n'),
    cycle_expected_result: compact([f.cycle_key_result, f.cycle_change]),
    cycle_changes: compact([f[`review_${Math.max(0, monthInQuarter - 1)}_adjustments`], f[`month_${monthInQuarter}_risks`]]),
    month_what: compact([f[`month_${monthInQuarter}_goal`], f.cycle_what]),
    month_why: f.cycle_why,
    month_how: compact([f[`month_${monthInQuarter}_deliveries`], f.cycle_how]),
    month_key_result: compact([f[`month_${monthInQuarter}_kpis`], f.cycle_key_result]),
    month_success: f.cycle_success,
    month_not_priority: f.cycle_out,
    month_not_priority_reason: f.cycle_thesis,
    monthly_capacity: f[`capacity_${monthInQuarter}_available`] || f.cycle_capacity,
    strategic_reserve: f.cycle_reserve,
    parallel_limit: f.parallel_projects,
    main_risks: compact([f[`month_${monthInQuarter}_risks`], nonEmptyRows(t.risks).map((row) => row[0])]),
    current_blocks: compact(nonEmptyRows(t.dependencies).map((row) => row[0]), '\n'),
    needed_decisions: compact(nonEmptyRows(t.decisions).map((row) => row[1]), '\n'),
    response_plan: compact(nonEmptyRows(t.risks).map((row) => row[5]), '\n'),
    planning_meeting: f.kickoff_meeting,
    weekly_checkin: f.weekly_checkin,
    results_meeting: f.monthly_review,
    official_channel: 'ZebraHub',
    approved_points: f.approved_points,
    requested_changes: f.requested_changes,
    immediate_steps: f.immediate_steps,
    closing_message: f.closing_message,
    sign_zebrazul: f.sign_zebrazul,
    sign_client: f.sign_client,
    approval_date: f.approval_date,
  };

  if (monthInQuarter > 0) {
    const previousIndex = monthInQuarter - 1;
    fields.previous_done = f[`review_${previousIndex}_done`];
    fields.previous_results = f[`review_${previousIndex}_results`];
    fields.previous_learnings = f[`review_${previousIndex}_learning`];
    fields.previous_pending = f[`review_${previousIndex}_adjustments`];
  }

  for (let index = 0; index < 3; index += 1) {
    fields[`priority_${index}_name`] = f[`priority_${index}_name`];
    fields[`priority_${index}_reason`] = f[`priority_${index}_reason`];
    fields[`priority_${index}_result`] = f[`priority_${index}_result`];
    fields[`priority_${index}_actions`] = f[`priority_${index}_projects`];
    fields[`priority_${index}_kpis`] = f[`priority_${index}_kpis`];
  }

  for (let index = 0; index < weekCount; index += 1) {
    const sourceIndex = weekStart + index;
    fields[`week_${index}_goal`] = f[`week_${sourceIndex}_goal`];
    fields[`week_${index}_owner`] = f[`week_${sourceIndex}_owner`];
    fields[`week_${index}_actions`] = f[`week_${sourceIndex}_actions`];
    fields[`week_${index}_dependencies`] = f[`week_${sourceIndex}_blocks`];
    fields[`week_${index}_blocks`] = f[`week_${sourceIndex}_blocks`];
  }

  for (let index = 0; index < 4; index += 1) {
    fields[`capacity_${index}_available`] = f[`capacity_${monthInQuarter}_available`] || f.cycle_capacity;
    fields[`capacity_${index}_planned`] = '';
    fields[`capacity_${index}_notes`] = f[`capacity_${monthInQuarter}_notes`];
  }

  const projects = nonEmptyRows(t.projects).map((row) => fitRow(row, 9));
  const backlog = nonEmptyRows(t.backlog);
  const campaigns = backlog
    .filter((row) => /campanha|marketing|comunica/i.test(text(row[1])))
    .map((row) => [row[0], row[6], '', '', '', row[4], row[3], '', row[7]]);
  const commercial = backlog
    .filter((row) => /comercial|venda|relacionamento|atendimento/i.test(text(row[1])))
    .map((row) => [row[0], row[1], row[6], row[4], row[3], '', '', row[7]]);
  const tasks = backlog.map((row) => [row[0], row[2], row[3], '', row[4], row[6], '', row[7]]);

  return {
    fields,
    tables: {
      projects,
      campaigns,
      commercial,
      tasks,
      kpis: nonEmptyRows(t.kpis).map((row) => fitRow(row, 7)),
      risks: nonEmptyRows(t.risks).map((row) => [row[0], row[1], row[2], row[3], row[5], row[6]]),
      governance: nonEmptyRows(t.governance).map((row) => fitRow(row, 6)),
    },
  };
}

export function buildMonthlyFromCycle(currentData, cycle, context, mode = 'empty') {
  return applyMapping(currentData, cycleToMonthlyMapping(cycle, context), {
    mode,
    sourceType: 'cycle_90',
    sourceLabel: 'Ciclo Estratégico de 90 Dias',
    sourcePeriodKey: context.cyclePeriodKey,
    sourcePeriodLabel: context.cyclePeriodLabel,
    sourceSignature: stageSourceSignature(cycle),
    sourceUpdatedAt: context.sourceUpdatedAt,
  });
}
