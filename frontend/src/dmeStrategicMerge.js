function clean(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return clean(value).toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function uniqueByText(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = normalized(entry.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function average(values) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function formatScore(value) {
  return Number(value || 0).toFixed(1).replace('.', ',');
}

function maturityForScore(score) {
  if (score < 1.8) return { title: 'Nível 1 — Estrutura inicial', description: 'As práticas ainda são pouco estruturadas. O foco deve estar nos fundamentos antes de acelerar investimentos.' };
  if (score < 2.8) return { title: 'Nível 2 — Em organização', description: 'Já existem iniciativas relevantes, mas ainda irregulares. O próximo passo é transformar esforços isolados em processos.' };
  if (score < 3.8) return { title: 'Nível 3 — Em desenvolvimento', description: 'A empresa possui base funcional. O desafio é ampliar integração, acompanhamento e consistência.' };
  if (score < 4.5) return { title: 'Nível 4 — Estrutura consistente', description: 'As práticas estão bem estabelecidas. A prioridade passa a ser integração, indicadores e escala.' };
  return { title: 'Nível 5 — Maturidade avançada', description: 'A empresa demonstra alto nível de clareza e organização. O foco deve estar em inovação e expansão.' };
}

function respondentLabel(result, index) {
  return clean(result.source?.respondent)
    || clean(result.source?.title)
    || `Resposta ${index + 1}`;
}

function fieldEntries(group) {
  return group.map(({ result, candidate }, index) => ({
    assessmentId: result.source?.assessmentId,
    assessmentTitle: result.source?.title,
    respondent: respondentLabel(result, index),
    kind: candidate.kind,
    value: clean(candidate.value),
  })).filter((entry) => entry.value);
}

function mostFrequentValue(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    const key = normalized(entry.value);
    if (!key) return;
    const current = counts.get(key) || { count: 0, value: entry.value };
    current.count += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.value || '';
}

const FACTUAL_SINGLE_VALUE_TARGETS = new Set([
  'company_name',
  'id_company',
  'id_segment',
  'id_year',
  'id_region',
  'id_employees',
]);

function mergeFieldValue(target, entries) {
  const unique = uniqueByText(entries);
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0].value;

  if (target === 'id_internal') {
    return unique.map((entry) => entry.value).join(', ');
  }

  if (FACTUAL_SINGLE_VALUE_TARGETS.has(target)) {
    return mostFrequentValue(entries);
  }

  return unique.map((entry) => `${entry.respondent}: ${entry.value}`).join('\n\n');
}

function parseTableScore(value) {
  const match = clean(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function mergeDmeTable(group) {
  const rowsByName = new Map();
  group.forEach(({ result, candidate }, sourceIndex) => {
    const respondent = respondentLabel(result, sourceIndex);
    (Array.isArray(candidate.value) ? candidate.value : []).forEach((row) => {
      if (!Array.isArray(row) || !clean(row[0])) return;
      const key = clean(row[0]);
      if (!rowsByName.has(key)) rowsByName.set(key, { scores: [], readings: [] });
      const current = rowsByName.get(key);
      const score = parseTableScore(row[1]);
      if (score > 0) current.scores.push(score);
      if (clean(row[2])) current.readings.push({ respondent, value: clean(row[2]) });
    });
  });

  return [...rowsByName.entries()].map(([name, data]) => {
    const score = average(data.scores);
    const readings = uniqueByText(data.readings);
    const readingText = readings.length <= 1
      ? readings[0]?.value || ''
      : readings.map((entry) => `${entry.respondent}: ${entry.value}`).join(' | ');
    return [name, score > 0 ? `${formatScore(score)}/5` : '', readingText];
  });
}

export function mergeDmeSuggestionResults(results = []) {
  const validResults = results.filter((result) => result?.source && Array.isArray(result.candidates));
  if (!validResults.length) return { source: null, candidates: [] };
  if (validResults.length === 1) {
    const result = validResults[0];
    return {
      source: {
        ...result.source,
        assessmentIds: [result.source.assessmentId].filter(Boolean),
        assessmentTitles: [result.source.title].filter(Boolean),
        respondents: [result.source.respondent].filter(Boolean),
        count: 1,
      },
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        sourceEntries: fieldEntries([{ result, candidate }]),
        sourceCount: 1,
        distinctValueCount: 1,
      })),
    };
  }

  const groups = new Map();
  validResults.forEach((result) => {
    result.candidates.forEach((candidate) => {
      if (!groups.has(candidate.id)) groups.set(candidate.id, []);
      groups.get(candidate.id).push({ result, candidate });
    });
  });

  const overallScore = average(validResults.map((result) => result.source.overallScore));
  const respondents = [...new Set(validResults.map((result) => clean(result.source.respondent)).filter(Boolean))];
  const titles = validResults.map((result) => clean(result.source.title)).filter(Boolean);
  const assessmentIds = validResults.map((result) => Number(result.source.assessmentId)).filter(Boolean);

  const candidates = [...groups.values()].map((group) => {
    const base = group[0].candidate;
    const entries = fieldEntries(group);
    let value;

    if (base.targetType === 'table' && base.target === 'dme_table') {
      value = mergeDmeTable(group);
    } else if (base.targetType === 'table') {
      value = Array.isArray(base.value) ? base.value.map((row) => [...row]) : [];
    } else if (base.target === 'dme_score') {
      value = overallScore > 0 ? `${formatScore(overallScore)} de 5` : '';
    } else if (base.target === 'dme_level') {
      value = overallScore > 0 ? maturityForScore(overallScore).title : '';
    } else {
      value = mergeFieldValue(base.target, entries);
    }

    return {
      ...base,
      value,
      kind: group.every(({ candidate }) => candidate.kind === 'direct') ? 'direct' : 'suggestion',
      sourceKeys: [...new Set(group.flatMap(({ candidate }) => candidate.sourceKeys || []))],
      sourceEntries: entries,
      sourceCount: group.length,
      distinctValueCount: uniqueByText(entries).length,
      merged: true,
    };
  }).filter((candidate) => (
    candidate.targetType === 'table'
      ? Array.isArray(candidate.value) && candidate.value.length > 0
      : clean(candidate.value)
  ));

  return {
    source: {
      assessmentId: assessmentIds[0] || null,
      assessmentIds,
      assessmentTitles: titles,
      title: `${validResults.length} DMEs consolidados`,
      status: 'combined',
      progress: Math.round(average(validResults.map((result) => result.source.progress))),
      overallScore: Number(overallScore.toFixed(2)),
      maturity: maturityForScore(overallScore),
      respondent: respondents.join(', '),
      respondents,
      submittedAt: null,
      updatedAt: new Date().toISOString(),
      count: validResults.length,
    },
    candidates,
  };
}

export function buildAiCandidatePayload(candidates = [], selectedIds = new Set()) {
  return candidates
    .filter((candidate) => selectedIds.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      targetType: candidate.targetType,
      target: candidate.target,
      label: candidate.label,
      section: candidate.section,
      kind: candidate.kind,
      currentValue: candidate.value,
      sources: (candidate.sourceEntries || []).map((entry) => ({
        assessmentId: entry.assessmentId,
        assessmentTitle: entry.assessmentTitle,
        respondent: entry.respondent,
        value: entry.value,
      })),
    }));
}

export function applyAiConsolidationToCandidates(candidates = [], result = null) {
  const byId = new Map((result?.items || []).map((item) => [item.id, item]));
  return candidates.map((candidate) => {
    const aiItem = byId.get(candidate.id);
    if (!aiItem || candidate.targetType !== 'field' || !clean(aiItem.unified_value)) return candidate;
    return {
      ...candidate,
      value: clean(aiItem.unified_value),
      kind: 'ai',
      aiGenerated: true,
      aiMeta: {
        confidence: Number(aiItem.confidence || 0),
        consensusPoints: aiItem.consensus_points || [],
        divergences: aiItem.divergences || [],
        missingInformation: aiItem.missing_information || [],
        model: result.model,
        cached: Boolean(result.cached),
        generatedAt: result.created_at || new Date().toISOString(),
      },
    };
  });
}
