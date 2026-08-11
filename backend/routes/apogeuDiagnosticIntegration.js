const express = require('express');
const { timingSafeEqual, randomUUID } = require('crypto');
const db = require('../db/database');

const router = express.Router();

const DEFAULT_STAGES = [
  { stage_key: 'new_lead', name: 'Novo lead', subtitle: 'Entrada', probability: 10, color_key: 'blue', position: 0, stage_type: 'open', is_system: 0 },
  { stage_key: 'contacted', name: 'Contato feito', subtitle: 'Conexão', probability: 20, color_key: 'indigo', position: 1, stage_type: 'open', is_system: 0 },
  { stage_key: 'meeting', name: 'Diagnóstico', subtitle: 'Leitura', probability: 35, color_key: 'violet', position: 2, stage_type: 'open', is_system: 0 },
  { stage_key: 'proposal', name: 'Proposta enviada', subtitle: 'Proposta', probability: 55, color_key: 'amber', position: 3, stage_type: 'open', is_system: 0 },
  { stage_key: 'negotiation', name: 'Negociação', subtitle: 'Decisão', probability: 75, color_key: 'orange', position: 4, stage_type: 'open', is_system: 0 },
  { stage_key: 'won', name: 'Negócio ganho', subtitle: 'Resultado', probability: 100, color_key: 'emerald', position: 5, stage_type: 'won', is_system: 1 },
  { stage_key: 'lost', name: 'Perdido', subtitle: 'Encerrado', probability: 0, color_key: 'rose', position: 6, stage_type: 'lost', is_system: 1 },
];

function text(value, max = 2000) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function integer(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function providedKey(req) {
  const direct = String(req.get('X-Apogeu-Integration-Key') || '').trim();
  if (direct) return direct;
  const auth = String(req.get('Authorization') || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function integrationAuth(req, res, next) {
  const configured = String(process.env.APOGEU_DIAGNOSTIC_INTEGRATION_KEY || '').trim();
  if (!configured) {
    return res.status(503).json({ error: 'Integração APOGEU não configurada no Zebrahub' });
  }
  if (!secureEqual(providedKey(req), configured)) {
    return res.status(401).json({ error: 'Chave de integração inválida' });
  }
  next();
}

function resolveAgency() {
  const agencyId = Number(process.env.APOGEU_DIAGNOSTIC_AGENCY_ID || 0);
  if (agencyId) return db.prepare("SELECT id, name, slug FROM agencies WHERE id = ? AND status != 'archived'").get(agencyId);

  const slug = String(process.env.APOGEU_DIAGNOSTIC_AGENCY_SLUG || process.env.DEFAULT_AGENCY_SLUG || 'zebrazul')
    .trim().toLowerCase();
  return db.prepare("SELECT id, name, slug FROM agencies WHERE lower(slug) = lower(?) AND status != 'archived'").get(slug);
}

function resolveClient(agencyId) {
  const clientId = Number(process.env.APOGEU_DIAGNOSTIC_CLIENT_ID || 0);
  if (clientId) {
    return db.prepare("SELECT id, name FROM clients WHERE id = ? AND agency_id = ? AND status != 'archived'")
      .get(clientId, agencyId);
  }
  const name = String(process.env.APOGEU_DIAGNOSTIC_CLIENT_NAME || 'APOGEU').trim();
  return db.prepare("SELECT id, name FROM clients WHERE agency_id = ? AND lower(name) = lower(?) AND status != 'archived' ORDER BY id LIMIT 1")
    .get(agencyId, name);
}

function resolveUser(agencyId) {
  const configuredUserId = Number(process.env.APOGEU_DIAGNOSTIC_OWNER_USER_ID || 0);
  if (configuredUserId) {
    const configured = db.prepare(`
      SELECT id, name FROM users
      WHERE id = ? AND agency_id = ? AND role IN ('admin','team')
    `).get(configuredUserId, agencyId);
    if (configured) return configured;
  }

  return db.prepare(`
    SELECT id, name FROM users
    WHERE agency_id = ? AND role = 'admin'
    ORDER BY is_agency_owner DESC, is_platform_owner DESC, id ASC
    LIMIT 1
  `).get(agencyId);
}

function ensureDefaultStages(agencyId, clientId) {
  const count = db.prepare('SELECT COUNT(*) AS total FROM commercial_stages WHERE agency_id = ? AND client_id = ?')
    .get(agencyId, clientId);
  if (Number(count?.total || 0) > 0) return;

  const insert = db.prepare(`
    INSERT INTO commercial_stages (
      agency_id, client_id, stage_key, name, subtitle, probability,
      color_key, position, stage_type, is_system
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = db.transaction(() => {
    for (const stage of DEFAULT_STAGES) {
      insert.run(
        agencyId, clientId, stage.stage_key, stage.name, stage.subtitle, stage.probability,
        stage.color_key, stage.position, stage.stage_type, stage.is_system
      );
    }
  });
  seed();
}

function buildNotes(lead) {
  const rows = [
    'DIAGNÓSTICO APOGEU',
    lead.score_diagnostico ? `Diagnóstico: ${lead.score_diagnostico}/40${lead.classificacao ? ` · ${lead.classificacao}` : ''}` : null,
    lead.fit_score ? `Fit: ${lead.fit_score}/100${lead.prioridade_lead ? ` · ${lead.prioridade_lead}` : ''}` : null,
    lead.principal_gargalo ? `Principal área de treino: ${lead.principal_gargalo}` : null,
    lead.dor_declarada ? `Dor declarada: ${lead.dor_declarada}` : null,
    lead.objetivo_principal ? `Objetivo: ${lead.objetivo_principal}` : null,
    lead.cargo ? `Posição: ${lead.cargo}` : null,
    lead.segmento ? `Segmento: ${lead.segmento}` : null,
    lead.experiencia ? `Experiência: ${lead.experiencia}` : null,
    lead.equipe ? `Equipe: ${lead.equipe}` : null,
    lead.prazo ? `Prazo: ${lead.prazo}` : null,
    lead.intencao_investimento ? `Intenção: ${lead.intencao_investimento}` : null,
    lead.motivo_agora ? `Por que agora: ${lead.motivo_agora}` : null,
  ].filter(Boolean);
  return rows.join('\n\n').slice(0, 12000);
}

function nextActionFor(priority) {
  const value = String(priority || '').toUpperCase();
  if (value.includes('ALTA')) return 'Contato prioritário: falar com o lead o quanto antes';
  if (value.includes('MÉDIA') || value.includes('MEDIA')) return 'Entrar em contato e validar aderência ao APOGEU';
  return 'Realizar triagem do diagnóstico e definir próximo passo';
}

router.get('/health', integrationAuth, (req, res) => {
  const agency = resolveAgency();
  const client = agency ? resolveClient(agency.id) : null;
  const user = agency ? resolveUser(agency.id) : null;
  res.json({
    ok: Boolean(agency && client && user),
    agency: agency ? { id: agency.id, name: agency.name, slug: agency.slug } : null,
    client: client ? { id: client.id, name: client.name } : null,
    owner: user ? { id: user.id, name: user.name } : null,
  });
});

router.post('/', integrationAuth, (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : payload;

  const name = text(lead.nome || lead.name, 180);
  const email = text(lead.email, 180);
  const phone = text(lead.whatsapp || lead.phone, 80);
  if (!name || (!email && !phone)) {
    return res.status(422).json({ error: 'Informe nome e pelo menos e-mail ou WhatsApp' });
  }

  const agency = resolveAgency();
  if (!agency) return res.status(409).json({ error: 'Agência da integração APOGEU não encontrada' });

  const client = resolveClient(agency.id);
  if (!client) {
    return res.status(409).json({
      error: 'Cliente APOGEU não encontrado no Zebrahub',
      code: 'APOGEU_CLIENT_NOT_FOUND',
      hint: 'Cadastre um cliente chamado APOGEU ou configure APOGEU_DIAGNOSTIC_CLIENT_ID no Railway.',
    });
  }

  const owner = resolveUser(agency.id);
  if (!owner) return res.status(409).json({ error: 'Nenhum administrador disponível para receber o lead APOGEU' });

  ensureDefaultStages(agency.id, client.id);
  const stage = db.prepare(`
    SELECT stage_key, probability FROM commercial_stages
    WHERE agency_id = ? AND client_id = ? AND stage_type = 'open'
    ORDER BY CASE WHEN stage_key = 'new_lead' THEN 0 ELSE 1 END, position ASC, id ASC
    LIMIT 1
  `).get(agency.id, client.id);
  if (!stage) return res.status(409).json({ error: 'Pipeline APOGEU sem etapa aberta' });

  const submissionId = text(payload.submission_id || lead.submission_id, 120) || randomUUID();
  const existing = db.prepare(`
    SELECT d.lead_id
    FROM commercial_lead_diagnostics d
    WHERE d.agency_id = ? AND d.client_id = ? AND d.submission_id = ?
  `).get(agency.id, client.id, submissionId);
  if (existing) {
    return res.status(200).json({ ok: true, duplicate: true, lead_id: existing.lead_id, client_id: client.id });
  }

  const score = integer(lead.score_diagnostico, 0, 40);
  const fitScore = integer(lead.fit_score, 0, 100);
  const companyName = text(lead.empresa, 220) || name;
  const notes = buildNotes(lead);
  const today = new Date().toISOString().slice(0, 10);

  const answers = {};
  for (let i = 1; i <= 8; i += 1) answers[`q${i}`] = lead[`q${i}`] ?? null;

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO commercial_leads (
        agency_id, client_id, created_by, owner_user_id,
        company_name, contact_name, email, phone, source,
        stage, stage_key, estimated_value, probability,
        next_action, next_action_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new_lead', ?, 0, ?, ?, ?, ?)
    `).run(
      agency.id, client.id, owner.id, owner.id,
      companyName, name, email, phone, 'Diagnóstico APOGEU',
      stage.stage_key, Number(stage.probability || 10),
      nextActionFor(lead.prioridade_lead), today, notes
    );

    const leadId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO commercial_lead_diagnostics (
        agency_id, client_id, lead_id, submission_id,
        objective, role, segment, experience, team_size, city,
        score, classification, primary_gap, pain_statement, reason_now,
        timeframe, investment_intent, fit_score, priority,
        answers_json, raw_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agency.id, client.id, leadId, submissionId,
      text(lead.objetivo_principal, 300), text(lead.cargo, 200), text(lead.segmento, 200),
      text(lead.experiencia, 160), text(lead.equipe, 160), text(lead.cidade, 180),
      score, text(lead.classificacao, 220), text(lead.principal_gargalo, 220),
      text(lead.dor_declarada, 1000), text(lead.motivo_agora, 3000), text(lead.prazo, 180),
      text(lead.intencao_investimento, 300), fitScore, text(lead.prioridade_lead, 120),
      JSON.stringify(answers), JSON.stringify(lead).slice(0, 30000)
    );

    db.prepare(`
      INSERT INTO commercial_activities (agency_id, lead_id, created_by, activity_type, description)
      VALUES (?, ?, ?, 'note', ?)
    `).run(agency.id, leadId, owner.id, `Lead criado automaticamente pelo Diagnóstico APOGEU · Fit ${fitScore ?? '-'} · Score ${score ?? '-'}/40.`);

    return leadId;
  });

  const leadId = create();
  return res.status(201).json({
    ok: true,
    lead_id: leadId,
    client_id: client.id,
    client_name: client.name,
    stage: stage.stage_key,
    fit_score: fitScore,
    priority: text(lead.prioridade_lead, 120),
  });
});

module.exports = router;
