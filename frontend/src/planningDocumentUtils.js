function registerField(target, name) {
  if (name && !Object.prototype.hasOwnProperty.call(target, name)) target[name] = '';
}

function registerBlock(block, fields, tables) {
  if (block.type === 'grid') {
    block.fields.forEach((field) => registerField(fields, field.name));
    return;
  }

  if (block.type === 'table') {
    tables[block.id] = Array.from({ length: block.rows || 3 }, () => block.columns.map(() => ''));
    return;
  }

  if (block.type === 'cards') {
    Array.from({ length: block.count }).forEach((_, index) => {
      block.fields.forEach((field) => registerField(fields, `${block.prefix}_${index}_${field.name}`));
    });
    return;
  }

  if (block.type === 'collectionCards' || block.type === 'capacityCards') {
    block.names.forEach((_, index) => {
      block.fields.forEach((field) => registerField(fields, `${block.prefix}_${index}_${field.name}`));
    });
  }
}

export function createPlanningDocumentData(coverFields, sections) {
  const fields = {};
  const tables = {};
  coverFields.forEach((field) => registerField(fields, field.name));
  sections.forEach((section) => section.blocks.forEach((block) => registerBlock(block, fields, tables)));
  return { fields, tables };
}

export function mergePlanningDocumentData(rawData, coverFields, sections) {
  const defaults = createPlanningDocumentData(coverFields, sections);
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  return {
    fields: { ...defaults.fields, ...(source.fields || {}) },
    tables: Object.fromEntries(
      Object.entries(defaults.tables).map(([id, rows]) => [
        id,
        Array.isArray(source.tables?.[id]) ? source.tables[id] : rows,
      ])
    ),
  };
}

export function planningDocumentProgress(data, coverFields, sections) {
  const normalized = mergePlanningDocumentData(data, coverFields, sections);
  let total = Object.keys(normalized.fields).length;
  let completed = Object.values(normalized.fields).filter((value) => String(value || '').trim()).length;

  Object.values(normalized.tables).forEach((rows) => rows.forEach((row) => row.forEach((value) => {
    total += 1;
    if (String(value || '').trim()) completed += 1;
  })));

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
