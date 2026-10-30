// Camada de IA do Ayrton: OPCIONAL, cacheada e registrada. Regras sempre rodam primeiro; a IA só interpreta
// contas com sinais cruzados (2+ tipos de alerta) e só quando a situação mudou (hash). Sem OPENAI_API_KEY, não finge.
const crypto = require('crypto');
const ayrton = require('./ayrton');

const URL = 'https://api.openai.com/v1/responses';
const PRICE = { in: Number(process.env.AYRTON_PRICE_IN_PER_1M || 1.25), out: Number(process.env.AYRTON_PRICE_OUT_PER_1M || 10) };
const model = () => process.env.AYRTON_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const available = () => Boolean(process.env.OPENAI_API_KEY);

function log(db, row) {
  db.prepare('INSERT INTO agent_ai_log (agency_id, agent, client_id, reason, model, input_hash, input_tokens, output_tokens, estimated_cost, cached, ok, result) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.agency_id, 'ayrton', row.client_id, row.reason, row.model || null, row.hash, row.in || 0, row.out || 0, row.cost || 0, row.cached ? 1 : 0, row.ok === false ? 0 : 1, String(row.result || '').slice(0, 500));
}

async function interpretAccount(db, agencyId, clientId, { fetchImpl = fetch } = {}) {
  ayrton.ensureSchema(db);
  const alerts = db.prepare("SELECT a.*, c.name AS client_name FROM agent_alerts a JOIN clients c ON c.id = a.client_id WHERE a.agency_id = ? AND a.agent = 'ayrton' AND a.status = 'open' AND a.client_id = ? AND a.level != 'normal'").all(agencyId, clientId);
  if (alerts.length < 2) return { skipped: 'sem sinais cruzados (regras simples não usam IA)' };
  const facts = alerts.map((a) => { let ev = {}; try { ev = JSON.parse(a.evidence_json); } catch { /* */ } return { tipo: a.type, nivel: a.level, resumo: a.message, itens: (ev.items || []).slice(0, 6).map((i) => `${i.title}: ${i.detail || ''}`) }; });
  const hash = crypto.createHash('sha1').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
  if (alerts.every((a) => a.ai_hash === hash && a.ai_insight)) { log(db, { agency_id: agencyId, client_id: clientId, reason: 'interpretação de sinais cruzados', hash, cached: true, result: 'cache (situação inalterada)' }); return { cached: true }; }
  if (!available()) return { skipped: 'OPENAI_API_KEY não configurada' };
  const body = {
    model: model(),
    instructions: 'Você é o Ayrton, guardião de contas de uma agência de marketing. Com base APENAS nos fatos fornecidos, explique em até 3 frases se há relação entre os alertas e qual a próxima ação mais útil. Nunca invente causa: use "Há indícios de…", "Vale verificar…", "Não há dados suficientes para concluir…". Tom profissional, direto, sem piada.',
    input: JSON.stringify({ cliente: alerts[0].client_name, alertas: facts }),
    max_output_tokens: 300,
  };
  try {
    const r = await fetchImpl(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
    const text = (data.output_text || (data.output || []).flatMap((o) => o.content || []).filter((p) => p.type === 'output_text').map((p) => p.text).join('\n')).trim();
    const inT = data.usage?.input_tokens || 0; const outT = data.usage?.output_tokens || 0;
    const cost = (inT * PRICE.in + outT * PRICE.out) / 1e6;
    db.prepare("UPDATE agent_alerts SET ai_insight = ?, ai_hash = ? WHERE agency_id = ? AND agent = 'ayrton' AND status = 'open' AND client_id = ?").run(text, hash, agencyId, clientId);
    log(db, { agency_id: agencyId, client_id: clientId, reason: 'interpretação de sinais cruzados', model: body.model, hash, in: inT, out: outT, cost, result: text });
    return { ok: true, insight: text };
  } catch (e) {
    log(db, { agency_id: agencyId, client_id: clientId, reason: 'interpretação de sinais cruzados', model: body.model, hash, ok: false, result: e.message });
    return { error: 'A interpretação por IA falhou; as regras seguem funcionando.' };
  }
}

module.exports = { interpretAccount, available };
