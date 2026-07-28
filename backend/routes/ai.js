const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const {
  PROMPT_VERSION,
  OpenAIIntegrationError,
  consolidateDmeCandidates,
} = require('../services/openaiDme');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team'));

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function clean(value, maxLength = 12000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function average(values) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildScoreSummary(rows) {
  const pillarMap = new Map();
  rows.forEach((row) => {
    const scores = parseJson(row.scores_json, {});
    (Array.isArray(scores?.pillars) ? scores.pillars : []).forEach((pillar) => {
      if (!pillar?.id || Number(pillar.score || 0) <= 0) return;
      if (!pillarMap.has(pillar.id)) {
        pillarMap.set(pillar.id, {
          id: pillar.id,
          title: pillar.title || pillar.short || pillar.id,
          scores: [],
        });
      }
      pillarMap.get(pillar.id).scores.push(Number(pillar.score));
    });
  });

  return {
    overall_average: Number(average(rows.map((row) => row.overall_score)).toFixed(2)),
    pillars: [...pillarMap.values()].map((pillar) => ({
      id: pillar.id,
      title: pillar.title,
      average: Number(average(pillar.scores).toFixed(2)),
      response_count: pillar.scores.length,
    })),
  };
}

function sanitizeCandidate(candidate) {
  const targetType = clean(candidate?.targetType, 30);
  if (targetType !== 'field') return null;
  const sources = (Array.isArray(candidate?.sources) ? candidate.sources : []).slice(0, 10).map((source) => ({
    assessmentId: Number(source?.assessmentId) || null,
    value: clean(source?.value, 6000),
  })).filter((source) => source.value);
  if (!sources.length) return null;
  return {
    id: clean(candidate?.id, 180),
    targetType,
    target: clean(candidate?.target, 180),
    label: clean(candidate?.label, 260),
    section: clean(candidate?.section, 260),
    kind: clean(candidate?.kind, 40),
    sources,
  };
}

function normalizedText(value) {
  return clean(value, 6000).toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function needsAiConsolidation(candidate) {
  const distinct = new Set((candidate?.sources || []).map((source) => normalizedText(source.value)).filter(Boolean));
  return distinct.size > 1;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function aggregateHighlights(items, key, limit = 8) {
  const seen = new Set();
  const output = [];
  items.forEach((item) => {
    (item?.[key] || []).forEach((value) => {
      const text = clean(value, 500);
      const normalized = text.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
      if (!text || seen.has(normalized) || output.length >= limit) return;
      seen.add(normalized);
      output.push(text);
    });
  });
  return output;
}

router.post('/dme/consolidate', async (req, res) => {
  if (req.user?.is_commercial_team) {
    return res.status(403).json({ error: 'A Equipe Comercial não possui acesso às análises estratégicas com IA.' });
  }

  const clientId = Number(req.body.client_id);
  const assessmentIds = [...new Set((Array.isArray(req.body.assessment_ids) ? req.body.assessment_ids : []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  const force = Boolean(req.body.force);
  if (!clientId) return res.status(400).json({ error: 'Selecione um cliente.' });
  if (!canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Você não tem acesso a este cliente.' });
  if (assessmentIds.length < 2) return res.status(400).json({ error: 'Selecione pelo menos dois DMEs para unificar com IA.' });
  if (assessmentIds.length > 8) return res.status(400).json({ error: 'Selecione no máximo oito DMEs por consolidação.' });

  const placeholders = assessmentIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT d.id, d.client_id, d.title, d.status, d.progress, d.overall_score,
           d.scores_json, d.answers_json, d.respondent_name, d.updated_at, d.last_saved_at,
           c.name AS client_name
    FROM diagnostic_assessments d
    JOIN clients c ON c.id = d.client_id
    WHERE d.agency_id = ? AND d.client_id = ? AND d.id IN (${placeholders})
    ORDER BY d.id
  `).all(req.user.agency_id, clientId, ...assessmentIds);

  if (rows.length !== assessmentIds.length) {
    return res.status(404).json({ error: 'Um ou mais DMEs não foram encontrados para este cliente.' });
  }

  const candidates = (Array.isArray(req.body.candidates) ? req.body.candidates : [])
    .slice(0, 160)
    .map(sanitizeCandidate)
    .filter(Boolean);
  if (!candidates.length) return res.status(400).json({ error: 'Selecione ao menos um campo com conteúdo para consolidar.' });
  const requestedFieldCount = Math.max(candidates.length, Number(req.body.requested_field_count || 0));

  const sourceIds = new Set(assessmentIds);
  const invalidSource = candidates.some((candidate) => candidate.sources.some((source) => source.assessmentId && !sourceIds.has(source.assessmentId)));
  if (invalidSource) return res.status(400).json({ error: 'Os campos enviados possuem uma origem que não pertence aos DMEs selecionados.' });

  const aiCandidates = candidates.filter(needsAiConsolidation);
  const model = clean(process.env.OPENAI_DME_MODEL || process.env.OPENAI_MODEL, 120) || 'gpt-5.6-luna';
  const scoreSummary = buildScoreSummary(rows);
  const assessments = rows.map((row) => {
    const answers = parseJson(row.answers_json, {});
    return {
      id: Number(row.id),
      title: row.title,
      respondent: clean(answers.respondent || row.respondent_name, 160),
      status: row.status,
      progress: Number(row.progress || 0),
      overall_score: Number(row.overall_score || 0),
    };
  });

  const hashPayload = {
    promptVersion: PROMPT_VERSION,
    model,
    agencyId: Number(req.user.agency_id),
    clientId,
    assessmentIds,
    scoreSummary,
    candidates: aiCandidates,
  };
  const sourceHash = stableHash(hashPayload);

  if (!aiCandidates.length) {
    return res.json({
      summary: 'Os campos selecionados já possuem respostas iguais ou uma união determinística pronta. Nenhuma chamada à IA foi necessária.',
      items: [],
      consensus: [],
      divergences: [],
      missing_information: [],
      model,
      cached: false,
      deterministic: true,
      created_at: new Date().toISOString(),
      score_summary: scoreSummary,
      assessment_ids: assessmentIds,
      requested_fields: requestedFieldCount,
      ai_fields: 0,
      skipped_fields: requestedFieldCount,
      processing_ms: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    });
  }

  if (!force) {
    const cached = db.prepare(`
      SELECT result_json, usage_json, model, created_at
      FROM ai_dme_consolidations
      WHERE agency_id = ? AND client_id = ? AND source_hash = ?
      LIMIT 1
    `).get(req.user.agency_id, clientId, sourceHash);
    if (cached) {
      const result = parseJson(cached.result_json, {});
      return res.json({
        ...result,
        cached: true,
        model: cached.model,
        usage: parseJson(cached.usage_json, null),
        created_at: cached.created_at,
        score_summary: scoreSummary,
      });
    }
  }

  const startedAt = Date.now();
  try {
    const result = await consolidateDmeCandidates({
      clientName: rows[0].client_name,
      scoreSummary,
      assessments,
      candidates: aiCandidates,
    });
    const createdAt = new Date().toISOString();
    const response = {
      summary: result.summary,
      items: result.items,
      consensus: aggregateHighlights(result.items, 'consensus_points'),
      divergences: aggregateHighlights(result.items, 'divergences'),
      missing_information: aggregateHighlights(result.items, 'missing_information'),
      model: result.model,
      cached: false,
      created_at: createdAt,
      score_summary: scoreSummary,
      assessment_ids: assessmentIds,
      requested_fields: requestedFieldCount,
      ai_fields: aiCandidates.length,
      skipped_fields: Math.max(0, requestedFieldCount - aiCandidates.length),
      chunk_count: Number(result.chunkCount || 0),
      processing_ms: Date.now() - startedAt,
    };

    db.prepare(`
      INSERT INTO ai_dme_consolidations
        (agency_id, client_id, assessment_ids_json, source_hash, prompt_version, model,
         result_json, usage_json, response_ids_json, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agency_id, client_id, source_hash) DO UPDATE SET
        assessment_ids_json = excluded.assessment_ids_json,
        prompt_version = excluded.prompt_version,
        model = excluded.model,
        result_json = excluded.result_json,
        usage_json = excluded.usage_json,
        response_ids_json = excluded.response_ids_json,
        created_by = excluded.created_by,
        created_at = excluded.created_at
    `).run(
      req.user.agency_id,
      clientId,
      JSON.stringify(assessmentIds),
      sourceHash,
      PROMPT_VERSION,
      result.model,
      JSON.stringify(response),
      JSON.stringify(result.usage || {}),
      JSON.stringify(result.responseIds || []),
      req.user.id,
      createdAt,
    );

    return res.json({ ...response, usage: result.usage || null });
  } catch (error) {
    if (error instanceof OpenAIIntegrationError) {
      console.error('[OPENAI DME]', error.code, error.details || error.message);
      return res.status(error.status || 502).json({ error: error.message, code: error.code });
    }
    console.error('[OPENAI DME] Erro inesperado:', error);
    return res.status(500).json({ error: 'Ocorreu um erro inesperado ao consolidar os DMEs com IA.' });
  }
});

module.exports = router;
