const express = require('express');
const { timingSafeEqual, randomUUID } = require('crypto');
const db = require('../db/database');

const router = express.Router();

const QUESTIONS = [
  { key: 'nr1', label: 'NR-1 e gestão de riscos' },
  { key: 'normas', label: 'Normas Regulamentadoras' },
  { key: 'leis', label: 'Leis e obrigações' },
  { key: 'fiscalizacao', label: 'Fiscalização' },
  { key: 'treinamentos', label: 'Treinamentos' },
  { key: 'documentacao', label: 'Documentação e realidade' },
  { key: 'rotina', label: 'Rotina preventiva' },
];

const ANSWER_LABELS = {
  nr1: {
    2: 'Estruturada e atualizada',
    1: 'Parcialmente estruturada',
    0: 'Sem estrutura clara',
  },
  normas: {
    2: 'Sim, e acompanhamos',
    1: 'Conhecemos parcialmente',
    0: 'Não temos clareza',
  },
  leis: {
    2: 'Acompanhamento contínuo',
    1: 'Acompanhamento pontual',
    0: 'Sem acompanhamento',
  },
  fiscalizacao: {
    2: 'Estamos preparados',
    1: 'Teríamos que organizar',
    0: 'Existe risco importante',
  },
  treinamentos: {
    2: 'Controle completo',
    1: 'Controle parcial',
    0: 'Sem controle confiável',
  },
  documentacao: {
    2: 'Sim, estão coerentes',
    1: 'Precisam de revisão',
    0: 'Não sabemos',
  },
  rotina: {
    2: 'Faz parte da gestão',
    1: 'Ainda é irregular',
    0: 'É principalmente reativa',
  },
};

const DEFAULT_STAGES = [
  { stage_key: 'new_lead', name: 'Novo lead', subtitle: 'Entrada', probability: 10, color_key: 'blue', position: 0, stage_type: 'open', is_system: 0 },
  { stage_key: 'contacted', name: 'Contato feito', subtitle: 'Conexão', probability: 20, color_key: 'indigo', position: 1, stage_type: 'open', is_system: 0 },
  { stage_key: 'meeting', name: 'Diagnóstico', subtitle: 'Leitura', probability: 35, color_key: 'violet', position: 2, stage_type: 'open', is_system: 0 },
  { stage_key: 'proposal', name: 'Proposta enviada', subtitle: 'Proposta', probability: 55, color_key: 'amber', position: 3, stage_type: 'open', is_system: 0 },
  { stage_key: 'negotiation', name: 'Negociação', subtitle: 'Decisão', probability: 75, color_key: 'orange', position: 4, stage_type: 'open', is_system: 0 },
  { stage_key: 'won', name: 'Negócio ganho', subtitle: 'Resultado', probability: 100, color_key: 'emerald', position: 5, stage_type: 'won', is_system: 1 },
  { stage_key: 'lost', name: 'Perdido', subtitle: 'Encerrado', probability: 0, color_key: 'rose', position: 6, stage_type: 'lost', is_system: 1 },
];

function text(value, max = 3000) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function providedKey(req) {
  const direct = String(req.get('X-Basalto-Integration-Key') || '').trim();
  if (direct) return direct;
  const auth = String(req.get('Authorization') || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function integrationAuth(req, res, next) {
  const configured = String(process.env.BASALTO_DIAGNOSTIC_INTEGRATION_KEY || '').trim();
  if (!configured) {
    return res.status(503).json({ error: 'Integração Basalto não configurada no ZebraHub' });
  }
  if (!secureEqual(providedKey(req), configured)) {
    return res.status(401).json({ error: 'Chave de integração inválida' });
  }
  next();
}

function resolveAgency() {
  const agencyId = Number(process.env.BASALTO_DIAGNOSTIC_AGENCY_ID || 0);
  if (agencyId) {
    return db.prepare("SELECT id, name, slug FROM agencies WHERE id = ? AND status != 'archived'")
      .get(agencyId);
  }

  const slug = String(
    process.env.BASALTO_DIAGNOSTIC_AGENCY_SLUG ||
    process.env.DEFAULT_AGENCY_SLUG ||
    'zebrazul'
  ).trim().toLowerCase();

  return db.prepare(
    "SELECT id, name, slug FROM agencies WHERE lower(slug) = lower(?) AND status != 'archived'"
  ).get(slug);
}

function resolveClient(agencyId) {
  const clientId = Number(process.env.BASALTO_DIAGNOSTIC_CLIENT_ID || 0);
  if (clientId) {
    return db.prepare(`
      SELECT id, name, responsible_user_id
      FROM clients
      WHERE id = ? AND agency_id = ? AND status != 'archived'
    `).get(clientId, agencyId);
  }

  const exactName = String(process.env.BASALTO_DIAGNOSTIC_CLIENT_NAME || 'Basalto').trim();
  const exact = db.prepare(`
    SELECT id, name, responsible_user_id
    FROM clients
    WHERE agency_id = ? AND lower(trim(name)) = lower(trim(?)) AND status != 'archived'
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(agencyId, exactName);
  if (exact) return exact;

  return db.prepare(`
    SELECT id, name, responsible_user_id
    FROM clients
    WHERE agency_id = ? AND lower(name) LIKE '%basalto%' AND status != 'archived'
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(agencyId);
}

function resolveUser(agencyId, client) {
  const configuredUserId = Number(process.env.BASALTO_DIAGNOSTIC_OWNER_USER_ID || 0);
  if (configuredUserId) {
    const configured = db.prepare(`
      SELECT id, name
      FROM users
      WHERE id = ? AND agency_id = ? AND role IN ('admin','team')
    `).get(configuredUserId, agencyId);
    if (configured) return configured;
  }

  if (Number(client?.responsible_user_id || 0)) {
    const responsible = db.prepare(`
      SELECT id, name
      FROM users
      WHERE id = ? AND agency_id = ?
    `).get(Number(client.responsible_user_id), agencyId);
    if (responsible) return responsible;
  }

  return db.prepare(`
    SELECT id, name
    FROM users
    WHERE agency_id = ? AND role = 'admin'
    ORDER BY is_platform_owner DESC, is_agency_owner DESC, id ASC
    LIMIT 1
  `).get(agencyId);
}

function ensureDefaultStages(agencyId, clientId) {
  const count = db.prepare(
    'SELECT COUNT(*) AS total FROM commercial_stages WHERE agency_id = ? AND client_id = ?'
  ).get(agencyId, clientId);

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
        agencyId, clientId, stage.stage_key, stage.name, stage.subtitle,
        stage.probability, stage.color_key, stage.position,
        stage.stage_type, stage.is_system
      );
    }
  });
  seed();
}

function numericScore(value) {
  if (value && typeof value === 'object') {
    if (value.score !== undefined) return numericScore(value.score);
    if (value.value !== undefined) return numericScore(value.value);
  }

  if (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value ?? '').trim())) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0 && number <= 2) return Math.round(number);
  }

  const normalized = String(value ?? '').toLowerCase();
  if (!normalized) return null;

  const high = [
    'estruturada', 'atualizada', 'acompanhamos', 'contínuo', 'continuo',
    'preparados', 'completo', 'coerentes', 'faz parte da gestão', 'faz parte da gestao'
  ];
  const medium = [
    'parcial', 'pontual', 'organizar', 'revisão', 'revisao', 'irregular'
  ];
  const low = [
    'sem estrutura', 'não temos', 'nao temos', 'não sabemos', 'nao sabemos',
    'risco importante', 'sem controle', 'reativa', 'reativo'
  ];

  if (low.some((token) => normalized.includes(token))) return 0;
  if (medium.some((token) => normalized.includes(token))) return 1;
  if (high.some((token) => normalized.includes(token))) return 2;
  return null;
}

function normalizedAnswers(payload) {
  const source = payload?.answers && typeof payload.answers === 'object'
    ? payload.answers
    : payload;

  const result = {};
  QUESTIONS.forEach((question, index) => {
    let value = source?.[question.key];
    if (value === undefined) value = source?.[`q${index + 1}`];
    if (value === undefined && Array.isArray(source)) value = source[index];
    result[question.key] = numericScore(value);
  });
  return result;
}

function classification(score) {
  const percent = Math.round((score / 14) * 100);
  if (percent <= 39) {
    return {
      key: 'critical',
      title: 'Situação crítica',
      priority: 'high',
      message: 'Há sinais importantes de exposição. A estrutura de SST merece revisão prioritária.',
    };
  }
  if (percent <= 69) {
    return {
      key: 'attention',
      title: 'Atenção necessária',
      priority: 'medium',
      message: 'Há uma base existente, mas ainda existem brechas que precisam ser organizadas.',
    };
  }
  return {
    key: 'structured',
    title: 'Base estruturada',
    priority: 'low',
    message: 'A empresa demonstra boa organização e deve manter a rotina preventiva atualizada.',
  };
}

function futureDate(days = 2) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function answerLabel(key, score) {
  return ANSWER_LABELS[key]?.[score] || 'Não respondido';
}

function tableColumns(table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name));
  } catch {
    return new Set();
  }
}

function insertCommercialLead(values) {
  const columns = tableColumns('commercial_leads');
  const ordered = [
    'agency_id', 'client_id', 'created_by', 'owner_user_id',
    'company_name', 'contact_name', 'email', 'phone',
    'source', 'stage', 'stage_key', 'estimated_value',
    'probability', 'next_action', 'next_action_date', 'notes',
    'cnpj', 'segment', 'priority'
  ].filter((key) => columns.has(key));

  const placeholders = ordered.map(() => '?').join(', ');
  const sql = `INSERT INTO commercial_leads (${ordered.join(', ')}) VALUES (${placeholders})`;
  return db.prepare(sql).run(...ordered.map((key) => values[key]));
}

router.get('/health', integrationAuth, (req, res) => {
  const agency = resolveAgency();
  const client = agency ? resolveClient(agency.id) : null;
  const user = agency && client ? resolveUser(agency.id, client) : null;
  res.json({
    ok: Boolean(agency && client && user),
    agency: agency ? { id: agency.id, name: agency.name, slug: agency.slug } : null,
    client: client ? { id: client.id, name: client.name } : null,
    owner: user ? { id: user.id, name: user.name } : null,
  });
});

router.post('/', integrationAuth, (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : payload;

    const rawSourceSite = text(payload.source_site || payload.sourceSite, 180) || 'diagnostico.basaltosst.com.br';
    const allowedSourceSites = new Set([
      'diagnostico.basaltosst.com.br',
      'carbone.basaltosst.com.br',
    ]);
    const sourceSite = allowedSourceSites.has(rawSourceSite.toLowerCase())
      ? rawSourceSite.toLowerCase()
      : 'diagnostico.basaltosst.com.br';

    const name = text(contact.name || contact.nome, 180);
    const company = text(contact.company || contact.empresa || contact.razao_social, 220);
    const email = text(contact.email, 180);
    const phone = text(contact.phone || contact.whatsapp || contact.telefone, 80);
    const cnpj = text(contact.cnpj, 40);

    if (!name) return res.status(422).json({ error: 'Informe o nome do responsável' });
    if (!email && !phone && !cnpj) {
      return res.status(422).json({ error: 'Informe e-mail, telefone/WhatsApp ou CNPJ' });
    }

    const answers = normalizedAnswers(payload);
    const missing = QUESTIONS.filter((question) => answers[question.key] === null);
    if (missing.length > 0) {
      return res.status(422).json({
        error: 'O diagnóstico precisa conter as 7 respostas',
        missing: missing.map((question) => question.key),
      });
    }

    const score = QUESTIONS.reduce((sum, question) => sum + Number(answers[question.key]), 0);
    const percent = Math.round((score / 14) * 100);
    const result = classification(score);

    const agency = resolveAgency();
    if (!agency) return res.status(409).json({ error: 'Agência da integração Basalto não encontrada' });

    const client = resolveClient(agency.id);
    if (!client) {
      return res.status(409).json({
        error: 'Cliente Basalto não encontrado no ZebraHub',
        code: 'BASALTO_CLIENT_NOT_FOUND',
        hint: 'Cadastre a Basalto como cliente ou configure BASALTO_DIAGNOSTIC_CLIENT_ID no Railway.',
      });
    }

    const owner = resolveUser(agency.id, client);
    if (!owner) return res.status(409).json({ error: 'Nenhum usuário disponível para receber o lead da Basalto' });

    ensureDefaultStages(agency.id, client.id);
    const stage = db.prepare(`
      SELECT stage_key, probability
      FROM commercial_stages
      WHERE agency_id = ? AND client_id = ? AND stage_type = 'open'
      ORDER BY CASE WHEN stage_key = 'new_lead' THEN 0 ELSE 1 END, position ASC, id ASC
      LIMIT 1
    `).get(agency.id, client.id);

    if (!stage) return res.status(409).json({ error: 'Pipeline da Basalto sem etapa aberta' });

    const submissionId = text(payload.submission_id || payload.submissionId, 120) || randomUUID();

    const diagnosticColumns = tableColumns('commercial_lead_diagnostics');
    if (diagnosticColumns.size > 0) {
      const existing = db.prepare(`
        SELECT lead_id
        FROM commercial_lead_diagnostics
        WHERE agency_id = ? AND client_id = ? AND submission_id = ?
        LIMIT 1
      `).get(agency.id, client.id, submissionId);

      if (existing) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          lead_id: existing.lead_id,
          client_id: client.id,
        });
      }
    } else {
      const duplicate = db.prepare(`
        SELECT id
        FROM commercial_leads
        WHERE agency_id = ? AND client_id = ? AND notes LIKE ?
        LIMIT 1
      `).get(agency.id, client.id, `%BASALTO_SUBMISSION_ID:${submissionId}%`);
      if (duplicate) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          lead_id: duplicate.id,
          client_id: client.id,
        });
      }
    }

    const diagnosis = {
      version: 1,
      source: sourceSite,
      submission_id: submissionId,
      score,
      max_score: 14,
      percent,
      classification: result.title,
      classification_key: result.key,
      answers,
      contact: {
        name,
        company: company || '',
        email: email || '',
        phone: phone || '',
        cnpj: cnpj || '',
      },
      created_at: new Date().toISOString(),
    };

    const notes = [
      `Diagnóstico Basalto · ${result.title} · ${percent}% (${score}/14)`,
      '',
      ...QUESTIONS.map((question, index) =>
        `${index + 1}. ${question.label}: ${answerLabel(question.key, answers[question.key])}`
      ),
      '',
      `Origem: ${sourceSite}`,
      `BASALTO_SUBMISSION_ID:${submissionId}`,
      '',
      `DIAGNOSTICO_BASALTO_JSON:${JSON.stringify(diagnosis)}`,
    ].join('\n').slice(0, 20000);

    const companyName = company || (cnpj ? `Empresa · ${cnpj}` : name);

    const create = db.transaction(() => {
      const leadInfo = insertCommercialLead({
        agency_id: agency.id,
        client_id: client.id,
        created_by: owner.id,
        owner_user_id: owner.id,
        company_name: companyName,
        contact_name: name,
        email,
        phone,
        source: sourceSite === 'carbone.basaltosst.com.br'
          ? 'Diagnóstico Basalto · Carbone'
          : 'Diagnóstico Basalto',
        stage: 'new_lead',
        stage_key: stage.stage_key,
        estimated_value: 0,
        probability: Number(stage.probability || 10),
        next_action: 'Realizar devolutiva do diagnóstico de SST',
        next_action_date: futureDate(2),
        notes,
        cnpj,
        segment: 'SST',
        priority: result.priority,
      });

      const leadId = Number(leadInfo.lastInsertRowid);

      if (diagnosticColumns.size > 0) {
        db.prepare(`
          INSERT INTO commercial_lead_diagnostics (
            agency_id, client_id, lead_id, submission_id,
            segment, score, classification, priority,
            answers_json, raw_payload_json
          ) VALUES (?, ?, ?, ?, 'SST', ?, ?, ?, ?, ?)
        `).run(
          agency.id,
          client.id,
          leadId,
          submissionId,
          score,
          result.title,
          result.priority,
          JSON.stringify(answers),
          JSON.stringify(payload).slice(0, 30000)
        );
      }

      db.prepare(`
        INSERT INTO commercial_activities (
          agency_id, lead_id, created_by, activity_type, description
        ) VALUES (?, ?, ?, 'note', ?)
      `).run(
        agency.id,
        leadId,
        owner.id,
        `Diagnóstico público da Basalto recebido via ${sourceSite} · ${result.title} · ${percent}% (${score}/14).`
      );

      return leadId;
    });

    const leadId = create();

    return res.status(201).json({
      ok: true,
      duplicate: false,
      lead_id: leadId,
      client_id: client.id,
      client_name: client.name,
      stage: stage.stage_key,
      score,
      max_score: 14,
      percent,
      classification: result.title,
      classification_key: result.key,
    });
  } catch (error) {
    console.error('[BASALTO DIAGNOSTIC] Erro ao registrar diagnóstico:', error);
    return res.status(500).json({ error: 'Não foi possível registrar o diagnóstico no ZebraHub' });
  }
});

module.exports = router;
