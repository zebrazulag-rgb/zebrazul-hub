function text(value) {
  return String(value ?? '').trim();
}

function hasRowContent(row) {
  return Array.isArray(row) && row.some((value) => text(value));
}

function tableHasContent(rows) {
  return Array.isArray(rows) && rows.some(hasRowContent);
}

function fieldDescriptor(field, key, section, context = '') {
  return {
    key,
    label: [context, field?.label || key].filter(Boolean).join(' — '),
    section,
    type: field?.type || 'text',
    placeholder: field?.placeholder || '',
  };
}

function tableDescriptor(block, section) {
  return {
    id: block.id,
    label: block.title || section,
    section,
    columns: Array.isArray(block.columns) ? block.columns : [],
    maxRows: Math.max(1, Number(block.rows || 4)),
  };
}

function registerBlock(block, section, fields, tables) {
  if (!block || typeof block !== 'object') return;

  if (block.type === 'grid') {
    (block.fields || []).forEach((field) => fields.push(fieldDescriptor(field, field.name, section)));
    return;
  }

  if (block.type === 'table') {
    tables.push(tableDescriptor(block, section));
    return;
  }

  if (block.type === 'cards') {
    Array.from({ length: Number(block.count || 0) }).forEach((_, index) => {
      (block.fields || []).forEach((field) => fields.push(fieldDescriptor(
        field,
        `${block.prefix}_${index}_${field.name}`,
        section,
        `${block.title || 'Item'} ${index + 1}`,
      )));
    });
    return;
  }

  if (block.type === 'namedCards' || block.type === 'collectionCards' || block.type === 'capacityCards') {
    (block.names || []).forEach((name, index) => {
      (block.fields || []).forEach((field) => fields.push(fieldDescriptor(
        field,
        `${block.prefix}_${index}_${field.name}`,
        section,
        name,
      )));
    });
    return;
  }

  if (block.type === 'months') {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const labels = {
      priority: 'Prioridade do mês',
      actions: 'Ações e entregas',
      dates: 'Datas e marcos',
      owner: 'Responsável',
      kpi: 'Indicador e meta',
    };
    months.forEach((month, index) => {
      Object.entries(labels).forEach(([suffix, label]) => fields.push({
        key: `m_${index}_${suffix}`,
        label: `${month} — ${label}`,
        section,
        type: suffix === 'owner' ? 'text' : 'textarea',
        placeholder: '',
      }));
    });
  }
}

export function buildPlanningAiSchema(coverFields, sections, coverTitle = 'Identificação') {
  const fields = [];
  const tables = [];

  (coverFields || []).forEach((field) => fields.push(fieldDescriptor(field, field.name, coverTitle)));
  (sections || []).forEach((section) => {
    const sectionLabel = `${section.n || ''} ${section.title || ''}`.trim();
    (section.blocks || []).forEach((block) => registerBlock(block, sectionLabel, fields, tables));
  });

  return { fields, tables };
}

export function planningAiTargets(schema, data) {
  const fields = (schema?.fields || []).filter((field) => !text(data?.fields?.[field.key]));
  const tables = (schema?.tables || []).filter((table) => !tableHasContent(data?.tables?.[table.id]));
  return { fields, tables };
}

export function planningAiTargetCount(schema, data) {
  const targets = planningAiTargets(schema, data);
  return targets.fields.length + targets.tables.length;
}

function normalizeRows(rows, columns, maxRows) {
  const columnCount = Math.max(1, Number(columns || 0));
  return (Array.isArray(rows) ? rows : [])
    .filter(hasRowContent)
    .slice(0, Math.max(1, Number(maxRows || 4)))
    .map((row) => Array.from({ length: columnCount }, (_, index) => text(row?.[index])));
}

export function applyPlanningAiResult(currentData, result, metadata = {}) {
  const next = {
    ...currentData,
    fields: { ...(currentData?.fields || {}) },
    tables: Object.fromEntries(
      Object.entries(currentData?.tables || {}).map(([key, rows]) => [
        key,
        Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? [...row] : []) : [],
      ]),
    ),
  };

  const appliedFields = [];
  const appliedTables = [];

  Object.entries(result?.fields || {}).forEach(([key, rawValue]) => {
    const value = text(rawValue);
    if (!value || text(next.fields[key])) return;
    next.fields[key] = value;
    appliedFields.push(key);
  });

  Object.entries(result?.tables || {}).forEach(([id, rawRows]) => {
    if (tableHasContent(next.tables[id])) return;
    const currentRows = Array.isArray(next.tables[id]) ? next.tables[id] : [];
    const columns = Math.max(1, ...currentRows.map((row) => Array.isArray(row) ? row.length : 0));
    const normalized = normalizeRows(rawRows, columns, Math.max(currentRows.length, rawRows?.length || 0));
    if (!normalized.length) return;
    while (normalized.length < currentRows.length) normalized.push(Array.from({ length: columns }, () => ''));
    next.tables[id] = normalized;
    appliedTables.push(id);
  });

  next.aiImport = {
    sourceType: metadata.sourceType || '',
    sourceLabel: metadata.sourceLabel || '',
    sourcePeriodLabel: metadata.sourcePeriodLabel || '',
    generatedAt: new Date().toISOString(),
    model: result?.model || metadata.model || '',
    fieldKeys: appliedFields,
    tableKeys: appliedTables,
    summary: result?.summary || '',
  };

  return next;
}
