/**
 * Helpers for carrying information between the strategic planning stages.
 * The functions are deliberately defensive because old records may have
 * slightly different shapes in the database.
 */

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join('\n');
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function clonePlanningData(value) {
  const source = asObject(value);
  return {
    ...source,
    fields: { ...asObject(source.fields) },
    tables: Object.fromEntries(
      Object.entries(asObject(source.tables)).map(([id, rows]) => [
        id,
        Array.isArray(rows)
          ? rows.map((row) => (Array.isArray(row) ? [...row] : []))
          : [],
      ]),
    ),
    stageImport: source.stageImport && typeof source.stageImport === 'object'
      ? {
        ...source.stageImport,
        importedFields: Array.isArray(source.stageImport.importedFields)
          ? [...source.stageImport.importedFields]
          : [],
        importedTables: Array.isArray(source.stageImport.importedTables)
          ? [...source.stageImport.importedTables]
          : [],
      }
      : null,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stageSourceSignature(source) {
  try {
    return simpleHash(JSON.stringify(stableValue(source ?? null)));
  } catch {
    return simpleHash(String(source ?? ''));
  }
}

function removeImportedItem(data, kind, id) {
  const next = clonePlanningData(data);
  if (!next.stageImport) return next;

  const key = kind === 'field' ? 'importedFields' : 'importedTables';
  next.stageImport = {
    ...next.stageImport,
    [key]: (next.stageImport[key] || []).filter((item) => item !== id),
  };

  if (!(next.stageImport.importedFields || []).length && !(next.stageImport.importedTables || []).length) {
    next.stageImport = null;
  }
  return next;
}

export function detachImportedField(data, fieldName) {
  return removeImportedItem(data, 'field', fieldName);
}

export function detachImportedTable(data, tableId) {
  return removeImportedItem(data, 'table', tableId);
}

function sourceFields(source) {
  const record = asObject(source);
  return { ...record, ...asObject(record.fields) };
}

function firstText(fields, names) {
  for (const name of names) {
    const value = cleanText(fields[name]);
    if (value) return value;
  }
  return '';
}

function combineTexts(fields, names) {
  return names.map((name) => cleanText(fields[name])).filter(Boolean).join('\n\n');
}

function mayWrite(currentValue, mode) {
  return mode === 'refresh' || !cleanText(currentValue);
}

function writeMappedFields(target, mappings, source, mode, importedFields) {
  for (const [targetName, sourceNames] of Object.entries(mappings)) {
    const value = Array.isArray(sourceNames)
      ? firstText(source, sourceNames)
      : cleanText(source[sourceNames]);
    if (!value || !mayWrite(target.fields[targetName], mode)) continue;
    target.fields[targetName] = value;
    importedFields.push(targetName);
  }
}

function setStageImport(target, metadata) {
  target.stageImport = {
    sourceType: metadata.sourceType,
    sourceSignature: stageSourceSignature(metadata.source),
    sourceUpdatedAt: metadata.context?.sourceUpdatedAt || null,
    importedAt: new Date().toISOString(),
    importedFields: [...new Set(metadata.importedFields)],
    importedTables: [...new Set(metadata.importedTables)],
  };
  return target;
}

export function buildAnnualPlanFromDiagnosis(current, source, context = {}, mode = 'empty') {
  const next = clonePlanningData(current);
  const fields = sourceFields(source);
  const importedFields = [];
  const importedTables = [];

  writeMappedFields(next, {
    company: ['id_company', 'company_name', 'companyName'],
    lead: ['project_lead', 'sign_zebrazul'],
    owner: ['id_internal', 'respondent', 'sign_client'],
    diag: ['strategic_conclusion', 'current_summary', 'dme_reading', 'presentation_text'],
    problem: ['central_problem', 'oneProblem', 'growthBarrier'],
    thesis: ['strategic_thesis', 'position_hypothesis', 'main_recommendation'],
    change: ['desired_change', 'position_desired', 'twelveMonths'],
    goal_what: ['goal_what', 'main_goal', 'twelveMonths'],
    goal_why: ['goal_why', 'success_definition', 'expectation'],
    goal_how: ['goal_how', 'strategic_recommendations', 'next_steps'],
    main_target: ['main_goal', 'priority_goal', 'twelveMonths'],
    success: ['success_definition', 'success'],
    principles: ['values', 'essence'],
    assumptions: ['assumptions', 'assets'],
    constraints: ['pressures', 'risk_internal', 'risk_execution'],
    not_priority: ['not_the_problem', 'position_avoid'],
    resp_c: ['client_responsibilities', 'next_steps'],
    resp_z: ['zebrazul_responsibilities', 'strategic_recommendations'],
    risks: ['risk_internal', 'risk_external', 'risk_execution'],
    next: ['next_steps'],
    approved: ['approved_points'],
    changes: ['requested_changes'],
    closing: ['closing_message', 'strategic_conclusion'],
    sign_z: ['sign_zebrazul', 'project_lead'],
    sign_c: ['sign_client', 'id_internal'],
  }, fields, mode, importedFields);

  if (context.clientName && mayWrite(next.fields.company, mode)) {
    next.fields.company = context.clientName;
    importedFields.push('company');
  }
  if (context.year && mayWrite(next.fields.year_label, mode)) {
    next.fields.year_label = String(context.year);
    importedFields.push('year_label');
  }

  // Build a concise strategic summary when no dedicated field exists.
  if (mayWrite(next.fields.diag, mode)) {
    const summary = combineTexts(fields, ['current_summary', 'central_problem', 'strengths', 'weaknesses', 'opp_priority']);
    if (summary) {
      next.fields.diag = summary;
      importedFields.push('diag');
    }
  }

  return setStageImport(next, {
    sourceType: 'strategic_diagnosis',
    source,
    context,
    importedFields,
    importedTables,
  });
}

export function buildCycleFromAnnual(current, source, context = {}, mode = 'empty') {
  const next = clonePlanningData(current);
  const fields = sourceFields(source);
  const importedFields = [];
  const importedTables = [];

  writeMappedFields(next, {
    company_name: ['company', 'company_name'],
    annual_goal: ['main_target', 'goal_what'],
    annual_context: ['diag', 'problem', 'thesis'],
    cycle_priority: ['q_0_priorities', 'q_1_priorities', 'q_2_priorities', 'q_3_priorities'],
    expected_result: ['change', 'success'],
    risks: ['constraints', 'risks'],
    cover_note: ['cover_note'],
  }, fields, mode, importedFields);

  if (context.clientName && mayWrite(next.fields.company_name, mode)) {
    next.fields.company_name = context.clientName;
    importedFields.push('company_name');
  }

  return setStageImport(next, {
    sourceType: 'annual_plan',
    source,
    context,
    importedFields,
    importedTables,
  });
}

export function buildMonthlyFromCycle(current, source, context = {}, mode = 'empty') {
  const next = clonePlanningData(current);
  const fields = sourceFields(source);
  const importedFields = [];
  const importedTables = [];

  writeMappedFields(next, {
    company_name: ['company_name', 'company'],
    month_priority: ['cycle_priority', 'main_priority', 'priority'],
    cycle_reference: ['cycle_name'],
    expected_result: ['expected_result', 'success'],
    risks: ['risks', 'constraints'],
    cover_note: ['cover_note'],
  }, fields, mode, importedFields);

  if (context.clientName && mayWrite(next.fields.company_name, mode)) {
    next.fields.company_name = context.clientName;
    importedFields.push('company_name');
  }
  if (context.periodLabel && mayWrite(next.fields.month_reference, mode)) {
    next.fields.month_reference = context.periodLabel;
    importedFields.push('month_reference');
  }

  return setStageImport(next, {
    sourceType: 'cycle_90',
    source,
    context,
    importedFields,
    importedTables,
  });
}
