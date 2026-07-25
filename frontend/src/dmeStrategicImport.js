import { ATTENTION, DIAGNOSTIC_PILLARS, RECOMMENDATIONS } from './diagnosticConfig.js';
import { strategicDiagnosisCoverFields, strategicDiagnosisSections } from './strategicDiagnosisConfig.js';

const PILLAR_FIELD_SUFFIXES = {
  situation: 'Situação atual',
  evidence: 'Evidências',
  strengths: 'Forças',
  weaknesses: 'Fragilidades',
  consequences: 'Consequências',
  recommendation: 'Recomendação',
  priority: 'Nível de prioridade',
};

const STRATEGY_FIELD_SUFFIXES = {
  name: 'Nome',
  goal: 'Objetivo',
  problem: 'Problema que resolve',
  moves: 'Movimentos principais',
};

const PRIORITY_FIELD_SUFFIXES = {
  name: 'Nome',
  reason: 'Por que é prioritária',
  result: 'Resultado esperado',
  owners: 'Responsáveis e dependências',
};

const JOURNEY_FIELD_SUFFIXES = {
  current: 'Situação atual',
  gaps: 'Gargalos',
  opportunities: 'Oportunidades',
};

const JOURNEY_STAGES = ['Descoberta', 'Consideração', 'Contato', 'Decisão', 'Experiência', 'Relacionamento'];
const CYCLE_FRONTS = ['Fundamento', 'Ativação', 'Conversão ou Relacionamento'];

function clean(value) {
  return String(value ?? '').trim();
}

function compactLines(values) {
  return values.map(clean).filter(Boolean).join('\n');
}

function formatScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '';
  return number.toFixed(1).replace('.', ',');
}

function maturity(score) {
  if (score < 1.8) return { title: 'Nível 1 — Estrutura inicial', description: 'As práticas ainda são pouco estruturadas. O foco deve estar nos fundamentos antes de acelerar investimentos.' };
  if (score < 2.8) return { title: 'Nível 2 — Em organização', description: 'Já existem iniciativas relevantes, mas ainda irregulares. O próximo passo é transformar esforços isolados em processos.' };
  if (score < 3.8) return { title: 'Nível 3 — Em desenvolvimento', description: 'A empresa possui base funcional. O desafio é ampliar integração, acompanhamento e consistência.' };
  if (score < 4.5) return { title: 'Nível 4 — Estrutura consistente', description: 'As práticas estão bem estabelecidas. A prioridade passa a ser integração, indicadores e escala.' };
  return { title: 'Nível 5 — Maturidade avançada', description: 'A empresa demonstra alto nível de clareza e organização. O foco deve estar em inovação e expansão.' };
}

function scoreBand(score) {
  if (score <= 1.8) return 'estrutura inicial';
  if (score <= 2.8) return 'em organização';
  if (score <= 3.8) return 'em desenvolvimento';
  if (score <= 4.5) return 'estrutura consistente';
  return 'maturidade avançada';
}

function priorityFromScore(score) {
  if (score <= 2.2) return 'Crítica';
  if (score <= 3) return 'Alta';
  if (score <= 3.8) return 'Média';
  return 'Baixa';
}

function calculateScores(answers = {}, diagnosticScores = null) {
  const sourcePillars = Array.isArray(diagnosticScores?.pillars) ? diagnosticScores.pillars : [];
  const sourceById = new Map(sourcePillars.map((pillar) => [pillar.id, pillar]));

  const pillars = DIAGNOSTIC_PILLARS.map((pillar) => {
    const serverScore = Number(sourceById.get(pillar.id)?.score);
    if (Number.isFinite(serverScore) && serverScore > 0) {
      return { ...pillar, score: serverScore };
    }

    const values = pillar.questions
      .map((_, index) => Number(answers[`${pillar.id}_${index}`]))
      .filter((value) => value >= 1 && value <= 5);
    const score = values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    return { ...pillar, score: Number(score.toFixed(2)) };
  });

  const scoredPillars = pillars.filter((pillar) => pillar.score > 0);
  const serverOverall = Number(diagnosticScores?.overall);
  const overall = Number.isFinite(serverOverall) && serverOverall > 0
    ? serverOverall
    : scoredPillars.length
      ? scoredPillars.reduce((total, pillar) => total + pillar.score, 0) / scoredPillars.length
      : 0;

  return {
    overall: Number(overall.toFixed(2)),
    maturity: diagnosticScores?.maturity?.title
      ? diagnosticScores.maturity
      : maturity(overall),
    pillars,
  };
}

function buildFieldMetadata() {
  const fields = new Map();
  const tables = new Map();

  strategicDiagnosisCoverFields.forEach((field) => {
    fields.set(field.name, { label: field.label, section: 'Identificação do projeto' });
  });

  strategicDiagnosisSections.forEach((section) => {
    section.blocks.forEach((block) => {
      if (block.type === 'textarea') fields.set(block.name, { label: block.label, section: section.title });
      if (block.type === 'grid') block.fields.forEach(([label, name]) => fields.set(name, { label, section: section.title }));
      if (block.type === 'gridTextareas') block.items.forEach(([label, name]) => fields.set(name, { label, section: section.title }));
      if (block.type === 'table') tables.set(block.id, { label: section.title, section: section.title });
      if (block.type === 'pillarGroup') {
        block.pillars.forEach((pillar, index) => {
          Object.entries(PILLAR_FIELD_SUFFIXES).forEach(([suffix, label]) => {
            fields.set(`pillar_${index}_${suffix}`, { label: `${pillar} — ${label}`, section: section.title });
          });
        });
      }
      if (block.type === 'causeCards') {
        Array.from({ length: block.count }).forEach((_, index) => {
          ['title', 'description', 'evidence', 'impact'].forEach((suffix) => {
            fields.set(`cause_${index}_${suffix}`, { label: `Causa ${index + 1} — ${suffix}`, section: section.title });
          });
        });
      }
      if (block.type === 'tripleCards') {
        block.items.forEach(([title, key]) => {
          fields.set(`${key}_description`, { label: `${title} — Descrição`, section: section.title });
          fields.set(`${key}_action`, { label: `${title} — Ação`, section: section.title });
        });
      }
      if (block.type === 'journey') {
        JOURNEY_STAGES.forEach((stage, index) => {
          Object.entries(JOURNEY_FIELD_SUFFIXES).forEach(([suffix, label]) => {
            fields.set(`journey_${index}_${suffix}`, { label: `${stage} — ${label}`, section: section.title });
          });
        });
      }
      if (block.type === 'strategicPillars') {
        Array.from({ length: block.count }).forEach((_, index) => {
          Object.entries(STRATEGY_FIELD_SUFFIXES).forEach(([suffix, label]) => {
            fields.set(`strategy_pillar_${index}_${suffix}`, { label: `Pilar estratégico ${index + 1} — ${label}`, section: section.title });
          });
        });
      }
      if (block.type === 'priorityCards') {
        Array.from({ length: block.count }).forEach((_, index) => {
          Object.entries(PRIORITY_FIELD_SUFFIXES).forEach(([suffix, label]) => {
            fields.set(`priority_${index}_${suffix}`, { label: `Prioridade ${index + 1} — ${label}`, section: section.title });
          });
        });
      }
      if (block.type === 'cycleFronts') {
        CYCLE_FRONTS.forEach((front, index) => {
          fields.set(`cycle_front_${index}_goal`, { label: `${front} — Objetivo`, section: section.title });
          fields.set(`cycle_front_${index}_projects`, { label: `${front} — Projetos possíveis`, section: section.title });
        });
      }
    });
  });

  return { fields, tables };
}

const FIELD_METADATA = buildFieldMetadata();

function questionList(pillar, answers, predicate) {
  return pillar.questions
    .map((question, index) => ({ question, score: Number(answers[`${pillar.id}_${index}`]) }))
    .filter(({ score }) => score >= 1 && score <= 5 && predicate(score))
    .map(({ question, score }) => `${score}/5 — ${question}`);
}

function fullEvidence(pillar, answers) {
  const lines = pillar.questions
    .map((question, index) => ({ question, score: Number(answers[`${pillar.id}_${index}`]) }))
    .filter(({ score }) => score >= 1 && score <= 5)
    .map(({ question, score }) => `${score}/5 — ${question}`);
  const open = clean(answers[`${pillar.id}_open`]);
  if (open) lines.push(`Percepção aberta do cliente: ${open}`);
  return lines.join('\n');
}

function listPillars(pillars) {
  return pillars.map((pillar) => `${pillar.title} (${formatScore(pillar.score)}/5)`).join('\n');
}

function recommendationSentence(pillar) {
  const recommendation = RECOMMENDATIONS[pillar.id] || 'estruturar este pilar';
  return `Priorizar ${recommendation}.`;
}

function addCandidate(candidates, type, target, value, kind, sourceKeys = []) {
  if (type === 'field' && !clean(value)) return;
  if (type === 'table' && (!Array.isArray(value) || !value.length)) return;
  const metadata = type === 'field' ? FIELD_METADATA.fields.get(target) : FIELD_METADATA.tables.get(target);
  candidates.push({
    id: `${type}:${target}`,
    targetType: type,
    target,
    label: metadata?.label || target,
    section: metadata?.section || 'Diagnóstico Estratégico',
    value,
    kind,
    sourceKeys,
  });
}

export function buildDmeStrategicSuggestions(diagnostic, options = {}) {
  const answers = diagnostic?.answers && typeof diagnostic.answers === 'object' ? diagnostic.answers : {};
  const scores = calculateScores(answers, diagnostic?.scores);
  const candidates = [];
  const companyName = clean(answers.companyName) || clean(options.clientName);
  const scoredPillars = scores.pillars.filter((pillar) => pillar.score > 0);
  const strongest = [...scoredPillars].sort((a, b) => b.score - a.score);
  const weakest = [...scoredPillars].sort((a, b) => a.score - b.score);
  const topStrengths = strongest.slice(0, 2);
  const topWeaknesses = weakest.slice(0, 3);
  const mainWeakness = topWeaknesses[0];
  const mainStrength = topStrengths[0];
  const oneProblem = clean(answers.oneProblem);
  const growthBarrier = clean(answers.growthBarrier);
  const twelveMonths = clean(answers.twelveMonths);
  const success = clean(answers.success);
  const expectation = clean(answers.expectation);
  const businessDescription = clean(answers.businessDescription);
  const positioningOpen = clean(answers.positioning_open);
  const brandOpen = clean(answers.brand_open);
  const growthOpen = clean(answers.growth_open);

  addCandidate(candidates, 'field', 'company_name', companyName, 'direct', ['companyName']);
  addCandidate(candidates, 'field', 'id_company', companyName, 'direct', ['companyName']);
  addCandidate(candidates, 'field', 'id_segment', answers.segment, 'direct', ['segment']);
  addCandidate(candidates, 'field', 'id_year', answers.foundation, 'direct', ['foundation']);
  addCandidate(candidates, 'field', 'id_region', answers.city, 'direct', ['city']);
  addCandidate(candidates, 'field', 'id_employees', answers.employees, 'direct', ['employees']);
  addCandidate(candidates, 'field', 'id_internal', answers.respondent, 'direct', ['respondent']);
  addCandidate(candidates, 'field', 'business_model', businessDescription, 'direct', ['businessDescription']);

  if (companyName) {
    addCandidate(
      candidates,
      'field',
      'presentation_text',
      `Este Diagnóstico Estratégico consolida a leitura inicial de ${companyName} a partir das respostas do DME — Diagnóstico de Maturidade Empresarial. Os dados importados abaixo funcionam como ponto de partida e devem ser complementados pela imersão, por evidências operacionais, comerciais e financeiras e pela análise da equipe responsável.`,
      'suggestion',
      ['companyName'],
    );
  }

  if (scores.overall > 0) {
    addCandidate(candidates, 'field', 'dme_score', `${formatScore(scores.overall)} de 5`, 'direct', ['scores.overall']);
    addCandidate(candidates, 'field', 'dme_level', scores.maturity?.title, 'direct', ['scores.maturity']);
    addCandidate(
      candidates,
      'table',
      'dme_table',
      scores.pillars.map((pillar) => [
        pillar.title,
        pillar.score > 0 ? `${formatScore(pillar.score)}/5` : '',
        pillar.score > 0
          ? `${scoreBand(pillar.score)}${clean(answers[`${pillar.id}_open`]) ? ` — ${clean(answers[`${pillar.id}_open`])}` : ''}`
          : '',
      ]),
      'direct',
      ['scores.pillars'],
    );
    addCandidate(candidates, 'field', 'dme_highs', listPillars(topStrengths), 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'dme_lows', listPillars(topWeaknesses), 'suggestion', ['scores.pillars']);

    const contrast = mainStrength && mainWeakness
      ? `A principal força aparece em ${mainStrength.title}, enquanto a maior necessidade de estruturação está em ${mainWeakness.title}.`
      : '';
    addCandidate(
      candidates,
      'field',
      'dme_reading',
      compactLines([
        `A maturidade geral registrada no DME foi de ${formatScore(scores.overall)}/5 — ${scores.maturity?.title || scoreBand(scores.overall)}.`,
        scores.maturity?.description,
        contrast,
      ]),
      'suggestion',
      ['scores.overall', 'scores.pillars'],
    );

    addCandidate(
      candidates,
      'field',
      'current_summary',
      compactLines([
        `${companyName || 'A empresa'} apresenta maturidade geral de ${formatScore(scores.overall)}/5, enquadrada em ${scores.maturity?.title || scoreBand(scores.overall)}.`,
        mainStrength ? `A base mais consistente está em ${mainStrength.title}.` : '',
        mainWeakness ? `O principal espaço de evolução está em ${mainWeakness.title}.` : '',
        oneProblem ? `O problema apontado pelo cliente é: ${oneProblem}` : '',
      ]),
      'suggestion',
      ['scores.overall', 'scores.pillars', 'oneProblem'],
    );
    addCandidate(
      candidates,
      'field',
      'current_traits',
      compactLines([
        topStrengths.length ? `Forças percebidas:\n${listPillars(topStrengths)}` : '',
        topWeaknesses.length ? `Pontos de atenção:\n${listPillars(topWeaknesses)}` : '',
      ]),
      'suggestion',
      ['scores.pillars'],
    );
  }

  addCandidate(candidates, 'field', 'pressures', compactLines([oneProblem, growthBarrier]), 'direct', ['oneProblem', 'growthBarrier']);
  addCandidate(candidates, 'field', 'main_goal', twelveMonths, 'direct', ['twelveMonths']);
  addCandidate(candidates, 'field', 'goal_what', twelveMonths, 'direct', ['twelveMonths']);
  addCandidate(candidates, 'field', 'success_definition', success, 'direct', ['success']);
  addCandidate(candidates, 'field', 'central_problem', oneProblem || (mainWeakness ? `A empresa ainda não possui estrutura consistente em ${mainWeakness.title}, o que limita sua capacidade de avançar com previsibilidade.` : ''), oneProblem ? 'direct' : 'suggestion', oneProblem ? ['oneProblem'] : ['scores.pillars']);
  addCandidate(candidates, 'field', 'problem_reason', growthBarrier, 'direct', ['growthBarrier']);

  scores.pillars.forEach((pillar, index) => {
    if (pillar.score <= 0) return;
    const openAnswer = clean(answers[`${pillar.id}_open`]);
    const strengths = questionList(pillar, answers, (score) => score >= 4);
    const weaknesses = questionList(pillar, answers, (score) => score <= 2);
    const developing = questionList(pillar, answers, (score) => score === 3);

    addCandidate(
      candidates,
      'field',
      `pillar_${index}_situation`,
      compactLines([
        `${pillar.title} apresenta nota ${formatScore(pillar.score)}/5, em estágio de ${scoreBand(pillar.score)}.`,
        openAnswer ? `Percepção do cliente: ${openAnswer}` : '',
      ]),
      'suggestion',
      [`${pillar.id}_*`, `${pillar.id}_open`],
    );
    addCandidate(candidates, 'field', `pillar_${index}_evidence`, fullEvidence(pillar, answers), 'direct', [`${pillar.id}_*`, `${pillar.id}_open`]);
    addCandidate(candidates, 'field', `pillar_${index}_strengths`, strengths.join('\n'), 'suggestion', [`${pillar.id}_*`]);
    addCandidate(candidates, 'field', `pillar_${index}_weaknesses`, compactLines([...weaknesses, ...developing]), 'suggestion', [`${pillar.id}_*`]);
    addCandidate(candidates, 'field', `pillar_${index}_consequences`, ATTENTION[pillar.id], 'suggestion', [`${pillar.id}_*`]);
    addCandidate(candidates, 'field', `pillar_${index}_recommendation`, recommendationSentence(pillar), 'suggestion', [`${pillar.id}_*`]);
    addCandidate(candidates, 'field', `pillar_${index}_priority`, priorityFromScore(pillar.score), 'suggestion', [`${pillar.id}_*`]);
  });

  if (topWeaknesses.length) {
    const weakQuestionLines = topWeaknesses.flatMap((pillar) => questionList(pillar, answers, (score) => score <= 3).slice(0, 3));
    addCandidate(candidates, 'field', 'problem_manifestations', weakQuestionLines.join('\n'), 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'consequences', topWeaknesses.map((pillar) => `• ${pillar.title}: ${ATTENTION[pillar.id]}`).join('\n'), 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'priority_consequence', mainWeakness ? ATTENTION[mainWeakness.id] : '', 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'weaknesses', listPillars(topWeaknesses), 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'weakness_impact', topWeaknesses.map((pillar) => `• ${ATTENTION[pillar.id]}`).join('\n'), 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'opp_priority', mainWeakness ? recommendationSentence(mainWeakness) : '', 'suggestion', ['scores.pillars']);
  }

  if (topStrengths.length) {
    addCandidate(candidates, 'field', 'strengths', listPillars(topStrengths), 'suggestion', ['scores.pillars']);
    const declaredAssets = compactLines([
      positioningOpen ? `Diferencial declarado: ${positioningOpen}` : '',
      clean(answers.marketing_open) ? `Ação de marketing com melhor resultado: ${clean(answers.marketing_open)}` : '',
      clean(answers.relationship_open) ? `Relacionamento atual: ${clean(answers.relationship_open)}` : '',
    ]);
    addCandidate(candidates, 'field', 'assets', declaredAssets, 'direct', ['positioning_open', 'marketing_open', 'relationship_open']);
  }

  const byId = new Map(scores.pillars.map((pillar) => [pillar.id, pillar]));
  const recommend = (...ids) => ids
    .map((id) => byId.get(id))
    .filter((pillar) => pillar?.score > 0)
    .sort((a, b) => a.score - b.score)
    .map((pillar) => `• ${pillar.title}: ${recommendationSentence(pillar)}`)
    .join('\n');

  addCandidate(candidates, 'field', 'opp_internal', recommend('processes', 'management', 'growth'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'opp_sales', recommend('sales', 'marketing'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'opp_comms', recommend('positioning', 'brand', 'marketing'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'opp_relationship', recommend('relationship'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'opp_market', growthOpen, 'direct', ['growth_open']);

  const internalRiskPillars = ['processes', 'management', 'sales']
    .map((id) => byId.get(id))
    .filter((pillar) => pillar?.score > 0 && pillar.score < 3.8)
    .sort((a, b) => a.score - b.score);
  addCandidate(candidates, 'field', 'risk_internal', internalRiskPillars.map((pillar) => `• ${pillar.title}: ${ATTENTION[pillar.id]}`).join('\n'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'risk_execution', internalRiskPillars.map((pillar) => `• ${pillar.title}: ${recommendationSentence(pillar)}`).join('\n'), 'suggestion', ['scores.pillars']);
  addCandidate(candidates, 'field', 'risk_prevention', internalRiskPillars.map((pillar) => recommendationSentence(pillar)).join('\n'), 'suggestion', ['scores.pillars']);

  if (mainStrength) {
    addCandidate(candidates, 'field', 'promoter_description', `${mainStrength.title} é o pilar mais bem avaliado, com ${formatScore(mainStrength.score)}/5.`, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'promoter_action', `Usar a consistência de ${mainStrength.title} como prova, alavanca de confiança e base para sustentar os próximos movimentos.`, 'suggestion', ['scores.pillars']);
  }
  if (mainWeakness) {
    addCandidate(candidates, 'field', 'detractor_description', `${mainWeakness.title} é o pilar de menor maturidade, com ${formatScore(mainWeakness.score)}/5. ${ATTENTION[mainWeakness.id]}`, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'detractor_action', recommendationSentence(mainWeakness), 'suggestion', ['scores.pillars']);
  }
  if (topWeaknesses[1]) {
    const accelerator = topWeaknesses[1];
    addCandidate(candidates, 'field', 'accelerator_description', `A evolução de ${accelerator.title} pode acelerar a transformação porque conecta estrutura, execução e resultado.`, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', 'accelerator_action', recommendationSentence(accelerator), 'suggestion', ['scores.pillars']);
  }

  addCandidate(candidates, 'field', 'position_current', brandOpen, 'direct', ['brand_open']);
  if (companyName && (clean(answers.segment) || positioningOpen)) {
    const segment = clean(answers.segment) || 'seu segmento';
    addCandidate(candidates, 'field', 'position_hypothesis', `${companyName} é uma empresa de ${segment} que se diferencia por ${positioningOpen || 'sua forma de entregar valor ao cliente'}.`, 'suggestion', ['companyName', 'segment', 'positioning_open']);
  }
  addCandidate(candidates, 'field', 'value_prop', positioningOpen, 'direct', ['positioning_open']);
  addCandidate(candidates, 'field', 'central_message', positioningOpen, 'direct', ['positioning_open']);

  if (mainWeakness) {
    addCandidate(
      candidates,
      'field',
      'strategic_thesis',
      `${companyName || 'A empresa'} não precisa apenas ampliar esforços isolados; precisa estruturar ${mainWeakness.title} para transformar suas forças atuais em crescimento mais previsível.`,
      'suggestion',
      ['scores.pillars'],
    );
    addCandidate(
      candidates,
      'field',
      'thesis_explanation',
      compactLines([
        `O DME registrou maturidade geral de ${formatScore(scores.overall)}/5.`,
        mainStrength ? `${mainStrength.title} aparece como força com ${formatScore(mainStrength.score)}/5.` : '',
        `${mainWeakness.title} concentra a principal lacuna, com ${formatScore(mainWeakness.score)}/5.`,
        growthBarrier ? `O cliente aponta como barreira: ${growthBarrier}` : '',
      ]),
      'suggestion',
      ['scores.overall', 'scores.pillars', 'growthBarrier'],
    );
  }

  topWeaknesses.slice(0, 4).forEach((pillar, index) => {
    addCandidate(candidates, 'field', `strategy_pillar_${index}_name`, pillar.title, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', `strategy_pillar_${index}_goal`, `Elevar a maturidade de ${pillar.title} e criar uma rotina consistente de execução e acompanhamento.`, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', `strategy_pillar_${index}_problem`, ATTENTION[pillar.id], 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', `strategy_pillar_${index}_moves`, recommendationSentence(pillar), 'suggestion', ['scores.pillars']);
  });

  topWeaknesses.slice(0, 3).forEach((pillar, index) => {
    addCandidate(candidates, 'field', `priority_${index}_name`, pillar.title, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', `priority_${index}_reason`, `${pillar.title} recebeu ${formatScore(pillar.score)}/5 e está entre os pilares de menor maturidade. ${ATTENTION[pillar.id]}`, 'suggestion', ['scores.pillars']);
    addCandidate(candidates, 'field', `priority_${index}_result`, `Criar maior consistência, clareza de processo e capacidade de acompanhamento em ${pillar.title}.`, 'suggestion', ['scores.pillars']);
  });

  if (twelveMonths || mainWeakness) {
    addCandidate(
      candidates,
      'field',
      'cycle_goal',
      compactLines([
        mainWeakness ? `Estruturar os fundamentos de ${mainWeakness.title} nos próximos 90 dias.` : '',
        twelveMonths ? `Este ciclo deve contribuir para o objetivo de 12 meses: ${twelveMonths}` : '',
      ]),
      'suggestion',
      ['scores.pillars', 'twelveMonths'],
    );
  }

  if (expectation) {
    addCandidate(candidates, 'field', 'resp_zebrazul', expectation, 'direct', ['expectation']);
  }

  return {
    source: {
      assessmentId: Number(diagnostic?.id) || null,
      title: clean(diagnostic?.title) || 'DME',
      status: clean(diagnostic?.status),
      progress: Number(diagnostic?.progress || 0),
      overallScore: scores.overall,
      respondent: clean(answers.respondent),
      submittedAt: diagnostic?.submitted_at || null,
      updatedAt: diagnostic?.last_saved_at || diagnostic?.updated_at || null,
    },
    candidates,
  };
}

function tableHasMeaningfulData(rows, target) {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    if (!Array.isArray(row)) return false;
    return row.some((cell, index) => {
      if (target === 'dme_table' && index === 0) return false;
      return Boolean(clean(cell));
    });
  });
}

export function prepareDmeImportCandidates(candidates, diagnosis, source) {
  const fields = diagnosis?.fields || {};
  const tables = diagnosis?.tables || {};
  const fieldSources = diagnosis?.sources || {};
  const tableSources = diagnosis?.tableSources || {};

  return candidates.map((candidate) => {
    const existingSource = candidate.targetType === 'field'
      ? fieldSources[candidate.target]
      : tableSources[candidate.target];
    const hasCurrentValue = candidate.targetType === 'field'
      ? Boolean(clean(fields[candidate.target]))
      : tableHasMeaningfulData(tables[candidate.target], candidate.target);
    const imported = ['dme', 'dme_ai'].includes(existingSource?.origin);
    const existingAssessmentIds = Array.isArray(existingSource?.assessmentIds)
      ? existingSource.assessmentIds.map(Number).filter(Boolean)
      : [Number(existingSource?.assessmentId)].filter(Boolean);
    const sourceAssessmentIds = Array.isArray(source?.assessmentIds)
      ? source.assessmentIds.map(Number).filter(Boolean)
      : [Number(source?.assessmentId)].filter(Boolean);
    const sameAssessment = imported
      && existingAssessmentIds.length === sourceAssessmentIds.length
      && existingAssessmentIds.every((id) => sourceAssessmentIds.includes(id));
    const state = !hasCurrentValue ? 'empty' : imported ? 'imported' : 'manual';

    return {
      ...candidate,
      state,
      sameAssessment,
      currentValue: candidate.targetType === 'field' ? clean(fields[candidate.target]) : tables[candidate.target],
      defaultSelected: state === 'empty' || state === 'imported',
    };
  });
}

export function candidatePreview(candidate) {
  if (candidate.targetType === 'table') return `${candidate.value.length} linhas serão preenchidas`;
  return clean(candidate.value);
}
