const express = require('express');
const db = require('../db/database');
const { googleNewsFeedUrl } = require('../services/radarFeed');
const { refreshSource } = require('../services/radar');

const router = express.Router();

function safeJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function clean(value, limit = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function getTrialClient(req) {
  if (req.user?.role !== 'client' || !req.user?.client_id) return null;
  return db.prepare(`
    SELECT * FROM clients
    WHERE id = ? AND agency_id = ? AND COALESCE(lifecycle_stage, 'client') = 'trial'
  `).get(req.user.client_id, req.user.agency_id) || null;
}

function trialMeta(client) {
  const now = Date.now();
  const expires = client?.trial_expires_at ? Date.parse(client.trial_expires_at) : NaN;
  const diff = Number.isFinite(expires) ? expires - now : 0;
  return {
    started_at: client?.trial_started_at || null,
    expires_at: client?.trial_expires_at || null,
    expired: Number.isFinite(expires) ? diff <= 0 : false,
    days_left: Number.isFinite(expires) ? Math.max(0, Math.ceil(diff / 86400000)) : 30,
  };
}

function planFor(client, onboarding = {}, presenceResult = null) {
  const segment = clean(onboarding.segment || client.segment || 'seu mercado', 100);
  const objective = clean(onboarding.objective || 'ganhar clareza e presença digital', 180);
  const challenge = clean(onboarding.challenge || 'organizar a comunicação e transformar atenção em oportunidade', 180);
  const audience = clean(onboarding.target_audience || 'o público que mais valoriza sua solução', 180);
  const city = clean(onboarding.city || '', 100);
  const local = city ? ` em ${city}` : '';
  const topNeed = clean(presenceResult?.top_need_name || '', 100);
  const topEnvironment = clean(presenceResult?.priority_environments?.[0]?.name || '', 80);

  return [
    {
      week: 1,
      title: 'Clareza antes de conteúdo',
      description: `Organize o posicionamento de ${client.name} para o mercado de ${segment}${local}.`,
      actions: [
        { id: 'w1-promise', text: `Escreva em uma frase por que ${audience} deveria escolher sua empresa.` },
        { id: 'w1-objective', text: `Transforme o objetivo “${objective}” em uma meta observável para os próximos 30 dias.` },
        { id: 'w1-bio', text: 'Revise bio, descrição, contato e chamada para ação dos seus canais principais.' },
      ],
    },
    {
      week: 2,
      title: 'Conteúdo com direção',
      description: topNeed ? `Seu Mapa da Marca aponta ${topNeed} como prioridade. Transforme isso em linha editorial recorrente.` : 'Pare de pensar em posts isolados e construa assuntos que reforçam percepção de marca.',
      actions: [
        { id: 'w2-pillars', text: `Defina 3 pilares: autoridade em ${segment}, prova/confiança e desejo pelo que você entrega.` },
        { id: 'w2-radar', text: 'Abra o Radar do ZebraHub e salve pelo menos 3 assuntos que fazem sentido para sua empresa.' },
        { id: 'w2-ideas', text: 'Escolha 2 ideias abaixo e transforme em conteúdo nesta semana.' },
      ],
    },
    {
      week: 3,
      title: 'Consistência e oportunidade',
      description: topEnvironment ? `Leve a prioridade para a prática: ${topEnvironment} é hoje um dos ambientes que mais merece energia.` : `Ataque o gargalo principal: ${challenge}.`,
      actions: [
        { id: 'w3-proof', text: 'Publique uma prova real: bastidor, processo, resultado, depoimento ou antes/depois permitido.' },
        { id: 'w3-cta', text: 'Defina uma única chamada para ação para o período: conversar, solicitar orçamento, agendar ou visitar.' },
        { id: 'w3-frequency', text: 'Escolha uma frequência que sua empresa consegue sustentar sem depender de improviso.' },
      ],
    },
    {
      week: 4,
      title: 'Leitura do que funcionou',
      description: 'Feche o ciclo identificando sinais de atenção, interesse e oportunidade comercial.',
      actions: [
        { id: 'w4-review', text: 'Liste os 3 conteúdos que mais geraram resposta, conversa ou retenção.' },
        { id: 'w4-learnings', text: 'Anote o que deve continuar, o que deve parar e o que merece um novo teste.' },
        { id: 'w4-next', text: 'Defina a prioridade dos próximos 30 dias antes de aumentar volume ou investimento.' },
      ],
    },
  ];
}

function contentIdeas(client, onboarding = {}, presenceResult = null) {
  const segment = clean(onboarding.segment || client.segment || 'seu segmento', 100);
  const audience = clean(onboarding.target_audience || 'seu cliente ideal', 160);
  const challenge = clean(onboarding.challenge || 'o principal problema do cliente', 160);
  const objective = clean(onboarding.objective || 'crescer com mais direção', 160);
  const topNeed = clean(presenceResult?.top_need_name || '', 100);
  return [
    { format: 'Carrossel', title: `3 erros que fazem ${audience} perder tempo antes de contratar uma empresa de ${segment}` },
    { format: 'Reels', title: `O que ninguém te explica sobre ${challenge}` },
    { format: 'Post', title: `Antes de buscar “mais alcance”, sua empresa precisa responder isto` },
    { format: 'Reels', title: `Bastidor: como uma boa empresa de ${segment} toma decisões que o cliente não vê` },
    { format: 'Carrossel', title: `Se o objetivo é ${objective}, acompanhe estes 3 sinais` },
    { format: 'Post', title: topNeed ? `Como sua marca pode transformar ${topNeed.toLowerCase()} em vantagem percebida` : `Uma opinião que sua marca deveria ter coragem de defender no seu mercado` },
  ];
}

function diagnostic(client, onboarding = {}) {
  const checks = [
    Boolean(clean(onboarding.objective)),
    Boolean(clean(onboarding.challenge)),
    Boolean(clean(onboarding.target_audience)),
    Boolean(clean(onboarding.city)),
    Boolean(clean(onboarding.instagram)),
    Boolean(clean(onboarding.differential)),
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const level = score >= 80 ? 'Boa base' : score >= 50 ? 'Em construção' : 'Começando';
  return {
    score,
    level,
    message: score >= 80
      ? 'Você já deu contexto suficiente para transformar intenção em um plano mais direcionado.'
      : score >= 50
        ? 'A base já existe. Completar os pontos que faltam vai deixar as próximas decisões mais objetivas.'
        : 'Quanto mais clareza você colocar aqui, mais útil fica sua experiência no ZebraHub.',
  };
}

function latestPresenceDiagnostic(clientId, agencyId) {
  const row = db.prepare(`
    SELECT id, status, progress, result_json, submitted_at, updated_at
    FROM presence_diagnostics
    WHERE client_id = ? AND agency_id = ? AND status <> 'archived'
    ORDER BY CASE WHEN status = 'submitted' THEN 0 ELSE 1 END,
             COALESCE(submitted_at, updated_at) DESC, id DESC
    LIMIT 1
  `).get(clientId, agencyId);
  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    progress: Number(row.progress || 0),
    result: safeJson(row.result_json, null),
    submitted_at: row.submitted_at || null,
    updated_at: row.updated_at || null,
  };
}

async function ensureTrialRadarSource(req, client, onboarding) {
  const current = db.prepare('SELECT COUNT(*) AS total FROM radar_sources WHERE client_id = ? AND agency_id = ?').get(client.id, req.user.agency_id);
  if (Number(current?.total || 0) > 0) return null;

  const segment = clean(onboarding.segment || client.segment, 100);
  if (!segment) return null;
  const city = clean(onboarding.city, 80);
  const query = [segment, city, 'tendências mercado'].filter(Boolean).join(' ');
  const feedUrl = googleNewsFeedUrl(query, { days: 30 });
  const info = db.prepare(`
    INSERT OR IGNORE INTO radar_sources (
      agency_id, client_id, name, site_url, feed_url, feed_type, is_active, client_visible, created_by
    ) VALUES (?, ?, ?, 'https://news.google.com/', ?, 'rss', 1, 1, ?)
  `).run(req.user.agency_id, client.id, `Radar inicial: ${segment}`, feedUrl, req.user.id);
  const sourceId = Number(info.lastInsertRowid || 0);
  if (!sourceId) return null;
  try {
    const refresh = await refreshSource(sourceId);
    return { source_id: sourceId, collected: refresh?.ok ? Number(refresh.added || 0) : 0 };
  } catch (error) {
    console.warn('[TRIAL] Fonte inicial criada, mas a primeira coleta falhou:', error.message);
    return { source_id: sourceId, collected: 0 };
  }
}

router.get('/me', (req, res) => {
  const client = getTrialClient(req);
  if (!client) return res.status(404).json({ error: 'Esta conta não está em modo experimental.' });
  const onboarding = safeJson(client.trial_onboarding_json, {});
  const progress = safeJson(client.trial_progress_json, []);
  const accounts = db.prepare('SELECT platform, handle FROM social_accounts WHERE client_id = ? AND agency_id = ? ORDER BY platform')
    .all(client.id, req.user.agency_id);
  const presenceDiagnostic = latestPresenceDiagnostic(client.id, req.user.agency_id);
  res.json({
    client: {
      id: client.id,
      name: client.name,
      segment: client.segment,
      phone: client.phone,
      email: client.email,
      lifecycle_stage: client.lifecycle_stage,
    },
    trial: trialMeta(client),
    onboarding,
    onboarding_complete: Boolean(String(client.trial_onboarding_json || '').trim()),
    progress: Array.isArray(progress) ? progress : [],
    plan: planFor(client, onboarding, presenceDiagnostic?.result),
    content_ideas: contentIdeas(client, onboarding, presenceDiagnostic?.result),
    diagnostic: diagnostic(client, onboarding),
    presence_diagnostic: presenceDiagnostic,
    accounts,
  });
});

router.put('/onboarding', async (req, res) => {
  const client = getTrialClient(req);
  if (!client) return res.status(404).json({ error: 'Esta conta não está em modo experimental.' });
  const meta = trialMeta(client);
  if (meta.expired) return res.status(403).json({ error: 'Seu período experimental terminou. Seus dados continuam salvos para uma futura ativação.' });

  const onboarding = {
    segment: clean(req.body?.segment || client.segment, 120),
    city: clean(req.body?.city, 120),
    objective: clean(req.body?.objective, 220),
    challenge: clean(req.body?.challenge, 280),
    target_audience: clean(req.body?.target_audience, 240),
    differential: clean(req.body?.differential, 280),
    instagram: clean(req.body?.instagram, 160),
  };
  if (!onboarding.segment || !onboarding.objective || !onboarding.challenge || !onboarding.target_audience) {
    return res.status(400).json({ error: 'Preencha segmento, objetivo, principal desafio e público.' });
  }

  db.prepare(`
    UPDATE clients
    SET segment = ?, trial_onboarding_json = ?
    WHERE id = ? AND agency_id = ?
  `).run(onboarding.segment, JSON.stringify(onboarding), client.id, req.user.agency_id);

  if (onboarding.instagram) {
    db.prepare("DELETE FROM social_accounts WHERE client_id = ? AND agency_id = ? AND platform = 'instagram'")
      .run(client.id, req.user.agency_id);
    db.prepare(`
      INSERT INTO social_accounts (agency_id, client_id, platform, handle, connected)
      VALUES (?, ?, 'instagram', ?, 0)
    `).run(req.user.agency_id, client.id, onboarding.instagram);
  }

  const radar = await ensureTrialRadarSource(req, client, onboarding);
  const refreshedClient = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?').get(client.id, req.user.agency_id);
  res.json({
    ok: true,
    onboarding,
    diagnostic: diagnostic(refreshedClient, onboarding),
    plan: planFor(refreshedClient, onboarding),
    content_ideas: contentIdeas(refreshedClient, onboarding),
    radar,
  });
});

router.patch('/progress', (req, res) => {
  const client = getTrialClient(req);
  if (!client) return res.status(404).json({ error: 'Esta conta não está em modo experimental.' });
  const meta = trialMeta(client);
  if (meta.expired) return res.status(403).json({ error: 'Seu período experimental terminou.' });
  const completed = Array.isArray(req.body?.completed)
    ? [...new Set(req.body.completed.map((item) => clean(item, 60)).filter(Boolean))].slice(0, 100)
    : [];
  db.prepare('UPDATE clients SET trial_progress_json = ? WHERE id = ? AND agency_id = ?')
    .run(JSON.stringify(completed), client.id, req.user.agency_id);
  res.json({ ok: true, completed });
});

router.post('/convert/:clientId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem converter um experimental em cliente.' });
  const client = db.prepare(`
    SELECT * FROM clients WHERE id = ? AND agency_id = ?
  `).get(Number(req.params.clientId), req.user.agency_id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (client.lifecycle_stage !== 'trial') return res.status(409).json({ error: 'Esta conta já é um cliente ativo.' });
  db.prepare(`
    UPDATE clients
    SET lifecycle_stage = 'client', trial_converted_at = datetime('now'), status = 'active'
    WHERE id = ? AND agency_id = ?
  `).run(client.id, req.user.agency_id);
  res.json({ ok: true, client_id: client.id });
});

module.exports = router;
