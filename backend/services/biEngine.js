// Motor de análise do BI (Relatórios). Funções PURAS: recebem dados e devolvem análises.
// Princípios: nada é inventado; dado ausente ("não informado") nunca vira zero; métrica só é calculada quando
// TODOS os insumos existem; sempre devolvemos os insumos usados; correlação nunca é apresentada como causalidade.
const { CATALOG, INDEX, slug } = require('./biCatalog');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const round = (v, d = 2) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const monthIndex = (r) => Number(r.year) * 12 + (Number(r.month) - 1);
const periodKey = (r) => `${r.year}-${String(r.month).padStart(2, '0')}`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const periodLabel = (r) => `${MONTHS[Number(r.month) - 1] || '?'} de ${r.year}`;

function fmt(value, unit = 'int') {
  if (!isNum(value)) return '—';
  const br = (v, min, max) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  switch (unit) {
    case 'brl': return `R$ ${br(value, 2, 2)}`;
    case 'pct': return `${br(value, 0, 1)}%`;
    case 'dec': return br(value, 0, 2);
    case 'sec': return value >= 120 ? `${br(value / 60, 0, 1)} min` : `${br(value, 0, 0)} s`;
    case 'hours': return `${br(value, 0, 1)} h`;
    case 'int': return br(value, 0, 0);
    default: return `${br(value, 0, 2)} ${unit}`;
  }
}

// ---------------------------------------------------------------- derivadas
const DERIVED_TRAFFIC = [
  { key: 'ctr', label: 'CTR', unit: 'pct', polarity: 'up', formula: 'cliques ÷ impressões × 100', need: ['clicks', 'impressions'], calc: (v) => (v.clicks / v.impressions) * 100 },
  { key: 'cpc', label: 'CPC', unit: 'brl', polarity: 'down', formula: 'investimento ÷ cliques', need: ['spend', 'clicks'], calc: (v) => v.spend / v.clicks },
  { key: 'cpm', label: 'CPM', unit: 'brl', polarity: 'down', formula: 'investimento ÷ impressões × 1.000', need: ['spend', 'impressions'], calc: (v) => (v.spend / v.impressions) * 1000 },
  { key: 'cost_per_message', label: 'Custo por mensagem', unit: 'brl', polarity: 'down', formula: 'investimento ÷ mensagens', need: ['spend', 'messages'], calc: (v) => v.spend / v.messages },
  { key: 'cpl', label: 'Custo por lead (CPL)', unit: 'brl', polarity: 'down', formula: 'investimento ÷ leads', need: ['spend', 'leads'], calc: (v) => v.spend / v.leads },
  { key: 'cost_per_conversion', label: 'Custo por conversão', unit: 'brl', polarity: 'down', formula: 'investimento ÷ conversões', need: ['spend', 'conversions'], calc: (v) => v.spend / v.conversions },
  { key: 'cost_per_appointment', label: 'Custo por agendamento', unit: 'brl', polarity: 'down', formula: 'investimento ÷ agendamentos', need: ['spend', 'appointments'], calc: (v) => v.spend / v.appointments },
  { key: 'cost_per_sale', label: 'Custo por venda', unit: 'brl', polarity: 'down', formula: 'investimento ÷ vendas', need: ['spend', 'sales'], calc: (v) => v.spend / v.sales },
  { key: 'roas', label: 'ROAS', unit: 'dec', polarity: 'up', formula: 'valor de conversão ÷ investimento', need: ['conversion_value', 'spend'], calc: (v) => v.conversion_value / v.spend },
];

function trafficDerived(vals) {
  const out = [];
  const withFreq = vals.frequency === undefined && isNum(vals.impressions) && isNum(vals.reach) && vals.reach > 0
    ? { ...vals, frequency: vals.impressions / vals.reach } : vals;
  if (vals.frequency === undefined && withFreq.frequency !== undefined) {
    out.push({ key: 'frequency', label: 'Frequência', unit: 'dec', polarity: 'neutral', value: withFreq.frequency, formula: 'impressões ÷ alcance', inputs: [['Impressões', vals.impressions, 'int'], ['Alcance', vals.reach, 'int']] });
  }
  for (const d of DERIVED_TRAFFIC) {
    if (!d.need.every((k) => isNum(vals[k]))) continue;
    if (d.key !== 'roas' && !(vals[d.need[1]] > 0)) continue;
    if (d.key === 'roas' && !(vals.spend > 0)) continue;
    const labels = { spend: 'Investimento', clicks: 'Cliques', impressions: 'Impressões', messages: 'Mensagens', leads: 'Leads', conversions: 'Conversões', appointments: 'Agendamentos', sales: 'Vendas', conversion_value: 'Valor de conversão' };
    const units = { spend: 'brl', conversion_value: 'brl' };
    out.push({ key: d.key, label: d.label, unit: d.unit, polarity: d.polarity, value: d.calc(vals), formula: d.formula, inputs: d.need.map((k) => [labels[k] || k, vals[k], units[k] || 'int']) });
  }
  return out;
}

const RATE_DEFS = [
  { key: 'rate_lead_to_appointment', label: 'Lead → agendamento', need: ['leads_received', 'appointments'], calc: (v) => (v.appointments / v.leads_received) * 100, div: 'leads_received', formula: 'agendamentos ÷ leads recebidos × 100', labels: ['Leads recebidos', 'Agendamentos'] },
  { key: 'rate_appointment_to_attendance', label: 'Agendamento → comparecimento', need: ['appointments', 'attendances'], calc: (v) => (v.attendances / v.appointments) * 100, div: 'appointments', formula: 'comparecimentos ÷ agendamentos × 100', labels: ['Agendamentos', 'Comparecimentos'] },
  { key: 'rate_attendance_to_sale', label: 'Comparecimento → venda', need: ['attendances', 'sales'], calc: (v) => (v.sales / v.attendances) * 100, div: 'attendances', formula: 'vendas ÷ comparecimentos × 100', labels: ['Comparecimentos', 'Vendas'] },
  { key: 'rate_lead_to_sale', label: 'Lead → venda', need: ['leads_received', 'sales'], calc: (v) => (v.sales / v.leads_received) * 100, div: 'leads_received', formula: 'vendas ÷ leads recebidos × 100', labels: ['Leads recebidos', 'Vendas'] },
  { key: 'loss_rate', label: 'Taxa de perda', need: ['leads_received', 'lost'], calc: (v) => (v.lost / v.leads_received) * 100, div: 'leads_received', polarity: 'down', formula: 'perdidos ÷ leads recebidos × 100', labels: ['Leads recebidos', 'Perdidos'] },
];

function commercialDerived(v) {
  const out = [];
  for (const r of RATE_DEFS) {
    if (!r.need.every((k) => isNum(v[k])) || !(v[r.div] > 0)) continue;
    out.push({ key: r.key, label: r.label, unit: 'pct', polarity: r.polarity || 'up', value: r.calc(v), formula: r.formula, inputs: r.need.map((k, i) => [r.labels[i === 0 ? 0 : 1] === r.labels[0] && i === 0 ? r.labels[0] : r.labels[i], v[k], 'int']) });
  }
  // taxa de fechamento: vendas ÷ propostas (ou ÷ negociações quando não há propostas)
  if (isNum(v.sales)) {
    if (isNum(v.proposals) && v.proposals > 0) out.push({ key: 'closing_rate', label: 'Taxa de fechamento', unit: 'pct', polarity: 'up', value: (v.sales / v.proposals) * 100, formula: 'vendas ÷ propostas × 100', inputs: [['Vendas', v.sales, 'int'], ['Propostas', v.proposals, 'int']] });
    else if (isNum(v.negotiations) && v.negotiations > 0) out.push({ key: 'closing_rate', label: 'Taxa de fechamento', unit: 'pct', polarity: 'up', value: (v.sales / v.negotiations) * 100, formula: 'vendas ÷ negociações × 100', inputs: [['Vendas', v.sales, 'int'], ['Negociações', v.negotiations, 'int']] });
  }
  return out;
}

// ---------------------------------------------------------------- flatten
function modulePrefix(mod) {
  return mod.module_key === 'other' ? `other:${slug(mod.label || 'outro')}` : mod.module_key;
}

function setFlat(flat, key, entry) { if (isNum(entry.value)) flat[key] = entry; }

function flatten(report) {
  const flat = {};
  const mods = report.modules || [];
  for (const mod of mods) {
    const def = CATALOG[mod.module_key];
    if (!def) continue;
    const prefix = modulePrefix(mod);
    const moduleLabel = mod.module_key === 'other' ? (mod.label || 'Outro') : def.label;
    const metrics = mod.metrics || [];

    if (mod.module_key === 'traffic') {
      const rows = { overall: {}, platform: {}, campaign: {} };
      for (const x of metrics) {
        const value = num(x.value_num ?? x.value);
        if (!isNum(value) || x.is_custom) continue;
        const st = x.scope_type === 'platform' ? 'platform' : (x.scope_type === 'campaign' ? 'campaign' : 'overall');
        const sc = st === 'overall' ? '' : String(x.scope || '');
        rows[st][sc] = rows[st][sc] || {};
        rows[st][sc][x.key] = value;
      }
      const sources = Object.keys(rows.platform).length ? Object.values(rows.platform) : (Object.keys(rows.campaign).length ? Object.values(rows.campaign) : (Object.keys(rows.overall).length ? Object.values(rows.overall) : []));
      const total = {};
      const adds = Object.values(INDEX.traffic).filter((d) => d.additive).map((d) => d.key);
      for (const k of adds) {
        const vals = sources.map((s) => s[k]).filter(isNum);
        if (vals.length) total[k] = vals.reduce((a, b) => a + b, 0);
      }
      // alcance e frequência não são somáveis entre plataformas/campanhas (públicos se sobrepõem)
      const reachSources = Object.keys(rows.overall).length && isNum(rows.overall[''].reach) ? [rows.overall[''].reach] : sources.map((s) => s.reach).filter(isNum);
      if (reachSources.length === 1) total.reach = reachSources[0];
      if (Object.keys(rows.overall).length && isNum(rows.overall[''].frequency)) total.frequency = rows.overall[''].frequency;
      for (const [k, value] of Object.entries(total)) {
        const d = INDEX.traffic[k];
        setFlat(flat, `traffic.${k}`, { value, label: d.label, unit: d.unit, polarity: d.polarity, module: 'traffic', moduleLabel });
      }
      for (const d of trafficDerived(total)) setFlat(flat, `traffic.${d.key}`, { ...d, module: 'traffic', moduleLabel, derived: true });
      mod._traffic = { rows, total };
      continue;
    }

    const vals = {};
    for (const x of metrics) {
      const value = num(x.value_num ?? x.value);
      if (!isNum(value)) continue;
      if (x.is_custom || !INDEX[mod.module_key]?.[x.key]) {
        const label = x.label || x.key;
        setFlat(flat, `${prefix}.c_${slug(label)}`, { value, label, unit: x.unit || 'dec', polarity: 'neutral', module: prefix, moduleLabel, custom: true });
        continue;
      }
      const d = INDEX[mod.module_key][x.key];
      if (d.dist) continue; // listas (cidades, páginas...) ficam só nos dados completos
      vals[x.key] = value;
      setFlat(flat, `${prefix}.${x.key}`, { value, label: d.label, unit: d.unit, polarity: d.polarity, module: prefix, moduleLabel, stock: !!d.stock });
    }

    if (def.group === 'social') {
      const a = def.audienceKey; const A = def.audienceLabel;
      const s = vals[`${a}_start`]; const e = vals[`${a}_end`];
      const gained = vals[a === 'followers' ? 'new_followers' : 'new_subscribers']; const lost = vals[a === 'followers' ? 'lost_followers' : 'lost_subscribers'];
      if (isNum(s) && isNum(e)) {
        setFlat(flat, `${prefix}.${a}_net`, { value: e - s, label: `Crescimento líquido de ${A.toLowerCase()}`, unit: 'int', polarity: 'up', module: prefix, moduleLabel, derived: true, formula: `${A.toLowerCase()} no final − ${A.toLowerCase()} no início`, inputs: [[`${A} no início`, s, 'int'], [`${A} no final`, e, 'int']] });
        if (s > 0) setFlat(flat, `${prefix}.${a}_growth_pct`, { value: ((e - s) / s) * 100, label: `Crescimento de ${A.toLowerCase()} (%)`, unit: 'pct', polarity: 'up', module: prefix, moduleLabel, derived: true, formula: '(final − início) ÷ início × 100', inputs: [[`${A} no início`, s, 'int'], [`${A} no final`, e, 'int']] });
      } else if (isNum(gained) && isNum(lost)) {
        setFlat(flat, `${prefix}.${a}_net`, { value: gained - lost, label: `Crescimento líquido de ${A.toLowerCase()}`, unit: 'int', polarity: 'up', module: prefix, moduleLabel, derived: true, formula: 'novos − perdidos', inputs: [['Novos', gained, 'int'], ['Perdidos', lost, 'int']] });
      }
      if (mod.module_key === 'instagram' && isNum(vals.interactions) && isNum(vals.reach) && vals.reach > 0) {
        setFlat(flat, 'instagram.engagement_rate', { value: (vals.interactions / vals.reach) * 100, label: 'Taxa de engajamento (interações ÷ alcance)', unit: 'pct', polarity: 'up', module: prefix, moduleLabel, derived: true, formula: 'interações ÷ alcance × 100', inputs: [['Interações', vals.interactions, 'int'], ['Alcance', vals.reach, 'int']] });
      }
      if (mod.module_key === 'instagram') {
        const counts = ['posts_count', 'carousels_count', 'reels_count', 'stories_count', 'lives_count'].filter((k) => isNum(vals[k]));
        if (counts.length) setFlat(flat, 'instagram.content_total', { value: counts.reduce((acc, k) => acc + vals[k], 0), label: 'Total de conteúdos publicados', unit: 'int', polarity: 'neutral', module: prefix, moduleLabel, derived: true, formula: 'posts + carrosséis + Reels + Stories + Lives (informados)', inputs: counts.map((k) => [INDEX.instagram[k].label, vals[k], 'int']) });
      }
    }
    if (mod.module_key === 'commercial') for (const d of commercialDerived(vals)) setFlat(flat, `commercial.${d.key}`, { ...d, module: prefix, moduleLabel, derived: true });
  }

  // consolidado social: só soma o que é compatível (audiência = pessoas que seguem)
  const audienceKeys = [['instagram', 'followers'], ['facebook', 'followers'], ['tiktok', 'followers'], ['linkedin', 'followers'], ['youtube', 'subscribers']];
  const parts = audienceKeys.map(([mk, a]) => [mk, flat[`${mk}.${a}_end`]]).filter(([, e]) => e);
  if (parts.length) setFlat(flat, 'social.followers_total', { value: parts.reduce((acc, [, e]) => acc + e.value, 0), label: 'Audiência total (seguidores + inscritos)', unit: 'int', polarity: 'up', module: 'social', moduleLabel: 'Redes sociais', derived: true, formula: 'soma de seguidores/inscritos no final do período das redes informadas', inputs: parts.map(([mk, e]) => [CATALOG[mk].label, e.value, 'int']) });

  // vendas / negócio (usa investimento do tráfego)
  const sv = {}; for (const mod of mods) if (mod.module_key === 'sales') for (const x of mod.metrics || []) { const v = num(x.value_num ?? x.value); if (isNum(v) && !x.is_custom) sv[x.key] = v; }
  const spend = flat['traffic.spend']?.value;
  if (isNum(sv.revenue) && isNum(sv.sales_count) && sv.sales_count > 0) setFlat(flat, 'sales.avg_ticket', { value: sv.revenue / sv.sales_count, label: 'Ticket médio', unit: 'brl', polarity: 'up', module: 'sales', moduleLabel: 'Vendas / Faturamento', derived: true, formula: 'faturamento ÷ número de vendas', inputs: [['Faturamento', sv.revenue, 'brl'], ['Vendas', sv.sales_count, 'int']] });
  if (isNum(spend) && spend > 0) {
    const base = { module: 'sales', moduleLabel: 'Vendas / Faturamento', derived: true };
    if (isNum(sv.new_customers) && sv.new_customers > 0) setFlat(flat, 'sales.cac', { ...base, value: spend / sv.new_customers, label: 'CAC (custo de aquisição de cliente)', unit: 'brl', polarity: 'down', formula: 'investimento em mídia ÷ novos clientes', inputs: [['Investimento em mídia', spend, 'brl'], ['Novos clientes', sv.new_customers, 'int']] });
    else if (isNum(sv.sales_count) && sv.sales_count > 0) setFlat(flat, 'sales.cac', { ...base, value: spend / sv.sales_count, label: 'CAC (por venda — novos clientes não informados)', unit: 'brl', polarity: 'down', formula: 'investimento em mídia ÷ número de vendas', inputs: [['Investimento em mídia', spend, 'brl'], ['Vendas', sv.sales_count, 'int']] });
    if (isNum(sv.revenue)) {
      setFlat(flat, 'sales.roi', { ...base, value: ((sv.revenue - spend) / spend) * 100, label: 'Retorno sobre investimento (ROI)', unit: 'pct', polarity: 'up', formula: '(faturamento − investimento) ÷ investimento × 100', inputs: [['Faturamento', sv.revenue, 'brl'], ['Investimento em mídia', spend, 'brl']] });
      setFlat(flat, 'sales.roas_business', { ...base, value: sv.revenue / spend, label: 'ROAS (faturamento ÷ investimento)', unit: 'dec', polarity: 'up', formula: 'faturamento ÷ investimento em mídia', inputs: [['Faturamento', sv.revenue, 'brl'], ['Investimento em mídia', spend, 'brl']] });
    }
    if (isNum(sv.sales_count) && sv.sales_count > 0) setFlat(flat, 'sales.cost_per_sale', { ...base, value: spend / sv.sales_count, label: 'Custo por venda', unit: 'brl', polarity: 'down', formula: 'investimento em mídia ÷ número de vendas', inputs: [['Investimento em mídia', spend, 'brl'], ['Vendas', sv.sales_count, 'int']] });
  }
  return flat;
}

// ---------------------------------------------------------------- comparação
const STABLE_PCT = 2; const STABLE_PP = 0.5;

function buildBaseline(type, report, priors) {
  const cur = monthIndex(report);
  const list = (priors || []).filter((p) => monthIndex(p.report) < cur).sort((a, b) => monthIndex(b.report) - monthIndex(a.report));
  let picked = []; let label = '';
  if (type === 'avg3') { picked = list.filter((p) => cur - monthIndex(p.report) <= 3); label = 'média dos últimos 3 meses'; }
  else if (type === 'avg6') { picked = list.filter((p) => cur - monthIndex(p.report) <= 6); label = 'média dos últimos 6 meses'; }
  else if (type === 'yoy') { picked = list.filter((p) => cur - monthIndex(p.report) === 12); label = 'mesmo mês do ano anterior'; }
  else { picked = list.slice(0, 1); type = 'prev'; label = picked[0] ? `período anterior (${periodLabel(picked[0].report)})` : 'período anterior'; }
  const values = {};
  for (const p of picked) for (const [k, e] of Object.entries(p.flat)) { (values[k] = values[k] || []).push(e.value); }
  const out = {};
  for (const [k, arr] of Object.entries(values)) out[k] = { value: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length };
  return { type, label, available: picked.length > 0, reports: picked.map((p) => ({ id: p.report.id, period: periodKey(p.report), label: periodLabel(p.report) })), values: out };
}

function compare(curFlat, baseline) {
  const cmp = {};
  if (!baseline?.available) return cmp;
  for (const [k, e] of Object.entries(curFlat)) {
    const b = baseline.values[k];
    if (!b || !isNum(b.value)) continue;
    const abs = e.value - b.value;
    const isRate = e.unit === 'pct';
    const pct = b.value !== 0 ? (abs / Math.abs(b.value)) * 100 : null;
    const stable = isRate ? Math.abs(abs) < STABLE_PP : (pct === null ? abs === 0 : Math.abs(pct) < STABLE_PCT);
    const direction = stable ? 'stable' : (abs > 0 ? 'up' : 'down');
    let tone = 'neutral';
    if (stable) tone = 'stable';
    else if (e.polarity === 'up') tone = abs > 0 ? 'good' : 'bad';
    else if (e.polarity === 'down') tone = abs > 0 ? 'bad' : 'good';
    cmp[k] = { value: e.value, base: b.value, n: b.n, abs: round(abs, 4), pct: round(pct, 2), pp: isRate ? round(abs, 2) : null, direction, tone, unit: e.unit };
  }
  return cmp;
}

// ---------------------------------------------------------------- seleções de KPIs / funil
const pick = (flat, keys) => { for (const k of keys) if (flat[k]) return { key: k, ...flat[k] }; return null; };
const SOCIAL = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'];

function primaryReach(flat) {
  for (const n of SOCIAL) if (flat[`${n}.reach`]) return { key: `${n}.reach`, network: CATALOG[n].label, ...flat[`${n}.reach`] };
  return null;
}

const leadsPick = (flat) => pick(flat, ['commercial.leads_received', 'traffic.leads', 'site.leads']);
const salesPick = (flat) => pick(flat, ['sales.sales_count', 'commercial.sales', 'traffic.sales']);

function executiveKpis(flat, cmp) {
  const items = [];
  const add = (entry, label, group) => { if (!entry) return; items.push({ key: entry.key, label: label || entry.label, value: entry.value, unit: entry.unit, group, polarity: entry.polarity, cmp: cmp[entry.key] || null, derived: !!entry.derived, formula: entry.formula || null, inputs: entry.inputs || null }); };
  const t = (k) => (flat[k] ? { key: k, ...flat[k] } : null);
  add(t('social.followers_total'), 'Seguidores / inscritos', 'Audiência');
  for (const n of SOCIAL) if (flat[`${n}.reach`]) add(t(`${n}.reach`), `Alcance · ${CATALOG[n].label}`, 'Audiência');
  for (const n of SOCIAL) if (!flat[`${n}.reach`] && n === 'tiktok' && flat['tiktok.video_views']) add(t('tiktok.video_views'), 'Visualizações · TikTok', 'Audiência');
  if (!flat['youtube.reach'] && flat['youtube.views']) add(t('youtube.views'), 'Visualizações · YouTube', 'Audiência');
  add(t('instagram.engagement_rate'), 'Engajamento · Instagram', 'Audiência');
  add(t('traffic.spend'), 'Investimento em mídia', 'Tráfego');
  add(t('traffic.cpl'), null, 'Tráfego');
  add(t('traffic.roas'), 'ROAS (plataformas)', 'Tráfego');
  add(leadsPick(flat), 'Leads', 'Comercial');
  add(t('commercial.appointments'), 'Agendamentos', 'Comercial');
  add(t('commercial.attendances'), 'Comparecimentos', 'Comercial');
  add(salesPick(flat), 'Vendas', 'Vendas');
  add(t('sales.revenue'), 'Faturamento', 'Vendas');
  add(t('sales.avg_ticket'), null, 'Vendas');
  add(t('sales.roas_business'), 'ROAS (faturamento ÷ investimento)', 'Vendas');
  add(t('site.users'), 'Usuários do site', 'Site');
  return items;
}

function funnel(flat, cmp) {
  const reach = primaryReach(flat);
  const leads = leadsPick(flat);
  const steps = [];
  const push = (key, label, entry, kind) => { if (entry) steps.push({ key, label, value: entry.value, unit: entry.unit, kind, source: entry.key, cmp: cmp[entry.key] || null }); };
  push('reach', reach ? `Pessoas alcançadas · ${reach.network}` : '', reach, 'exposure');
  push('leads', 'Leads', leads, 'count');
  push('appointments', 'Agendamentos', pick(flat, ['commercial.appointments', 'traffic.appointments']), 'count');
  push('attendances', 'Comparecimentos', pick(flat, ['commercial.attendances']), 'count');
  push('sales', 'Vendas', salesPick(flat), 'count');
  push('revenue', 'Faturamento', pick(flat, ['sales.revenue']), 'money');
  for (let i = 1; i < steps.length; i += 1) {
    const a = steps[i - 1]; const b = steps[i];
    b.rate_from_previous = (a.kind === 'count' && b.kind === 'count' && a.value > 0) ? round((b.value / a.value) * 100, 2) : null;
  }
  return steps;
}

// ---------------------------------------------------------------- regras (destaques, atenção, cruzamentos)
const P = (cmp, key) => (cmp[key] ? cmp[key] : null);
const pctTxt = (v) => `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function analyzeRules(flat, cmp, baseline) {
  const highlights = []; const attention = []; const cross = [];
  if (!baseline?.available) return { highlights, attention, cross, pairs: [] };

  // genéricas: variação relevante, interpretada pela polaridade da métrica
  const generic = [];
  for (const [k, c] of Object.entries(cmp)) {
    const e = flat[k]; if (!e || e.polarity === 'neutral' || e.stock || /_start$/.test(k) || c.direction === 'stable') continue;
    const isRate = e.unit === 'pct';
    const strong = isRate ? Math.abs(c.pp) >= 2 : (c.pct !== null && Math.abs(c.pct) >= 10);
    if (!strong) continue;
    const verb = c.abs > 0 ? 'aumentou' : 'caiu';
    const mag = isRate ? `${Math.abs(c.pp).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.` : pctTxt(c.pct);
    generic.push({ id: `g:${k}`, type: c.tone === 'good' ? 'highlight' : 'attention', metrics: [k], strength: isRate ? Math.abs(c.pp) * 5 : Math.abs(c.pct), text: `${e.moduleLabel ? `${e.moduleLabel} · ` : ''}${e.label} ${verb} ${mag} (de ${fmt(c.base, e.unit)} para ${fmt(c.value, e.unit)}).` });
  }
  generic.sort((a, b) => b.strength - a.strength);
  for (const g of generic) (g.type === 'highlight' ? highlights : attention).push(g);

  const add = (arr, id, text, metrics) => arr.push({ id, type: arr === highlights ? 'highlight' : 'attention', text, metrics, strength: 999 });
  const leadsK = leadsPick(flat)?.key; const salesK = salesPick(flat)?.key;
  const reachK = primaryReach(flat); const net = reachK && reachK.network;
  const pctOf = (k) => (k && cmp[k] ? cmp[k].pct : null);

  // sinais cruzados (só quando TODOS os dados existem no período e na base)
  if (reachK && leadsK && pctOf(reachK.key) !== null && pctOf(leadsK) !== null && pctOf(reachK.key) >= 15 && pctOf(leadsK) < 5) {
    cross.push({ id: 'reach_up_leads_flat', tone: 'attention', metrics: [reachK.key, leadsK], text: `Distribuição cresceu sem crescimento proporcional de geração de oportunidades (alcance ${net} ${pctTxt(pctOf(reachK.key))} acima; leads ${pctOf(leadsK) >= 0 ? 'variaram' : 'caíram'} ${pctTxt(pctOf(leadsK))}).` });
  }
  if (leadsK && salesK && pctOf(leadsK) !== null && pctOf(salesK) !== null && pctOf(leadsK) >= 10 && pctOf(salesK) <= -5) {
    cross.push({ id: 'leads_up_sales_down', tone: 'attention', metrics: [leadsK, salesK], text: `Topo do funil cresceu, mas a eficiência comercial caiu (leads +${pctTxt(pctOf(leadsK))}; vendas −${pctTxt(pctOf(salesK))}).` });
  }
  if (P(cmp, 'traffic.spend') && P(cmp, 'traffic.cpl') && cmp['traffic.spend'].pct >= 10 && cmp['traffic.cpl'].pct <= -5) {
    cross.push({ id: 'spend_up_cpl_down', tone: 'good', metrics: ['traffic.spend', 'traffic.cpl'], text: `O aumento de investimento veio acompanhado de ganho de eficiência (investimento +${pctTxt(cmp['traffic.spend'].pct)}; custo por lead −${pctTxt(cmp['traffic.cpl'].pct)}).` });
  }
  if (P(cmp, 'traffic.spend') && salesK && pctOf(salesK) !== null && Math.abs(cmp['traffic.spend'].pct) <= 10 && pctOf(salesK) >= 10) {
    cross.push({ id: 'sales_up_spend_stable', tone: 'good', metrics: ['traffic.spend', salesK], text: `O período apresentou melhora de eficiência comercial (vendas +${pctTxt(pctOf(salesK))} com investimento estável).` });
  }
  const att = P(cmp, 'commercial.rate_appointment_to_attendance');
  if (att && att.pp <= -5) {
    cross.push({ id: 'attendance_down', tone: 'attention', metrics: ['commercial.rate_appointment_to_attendance'], text: `Existe um possível gargalo entre agendamento e atendimento (taxa de comparecimento ${Math.abs(att.pp).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. menor).` });
  }
  if (reachK && P(cmp, 'instagram.profile_visits') && pctOf(reachK.key) >= 10 && cmp['instagram.profile_visits'].pct <= -5) {
    cross.push({ id: 'reach_up_profile_down', tone: 'attention', metrics: [reachK.key, 'instagram.profile_visits'], text: 'Alcance cresceu, mas visitas ao perfil caíram.' });
  }
  const nets = ['instagram.followers_net', 'tiktok.followers_net', 'facebook.followers_net', 'linkedin.followers_net', 'youtube.subscribers_net'];
  for (const k of nets) {
    const c = cmp[k];
    if (c && c.base > 0 && c.value >= 0 && c.value < c.base * 0.8) cross.push({ id: `growth_slowed:${k}`, tone: 'attention', metrics: [k], text: `${flat[k].moduleLabel}: seguidores cresceram menos que no período de comparação (${fmt(c.value)} contra ${fmt(c.base)}).` });
  }
  if (P(cmp, 'traffic.cpl') && cmp['traffic.cpl'].pct >= 10 && !cross.some((c) => c.id === 'spend_up_cpl_down')) {
    cross.push({ id: 'cpl_up', tone: 'attention', metrics: ['traffic.cpl'], text: `O custo por lead subiu ${pctTxt(cmp['traffic.cpl'].pct)}.` });
  }
  const sr = P(cmp, 'instagram.stories_retention');
  if (sr && sr.pp <= -3) cross.push({ id: 'stories_retention_down', tone: 'attention', metrics: ['instagram.stories_retention'], text: 'Stories perderam retenção.' });
  if (P(cmp, 'instagram.reels_reach') && cmp['instagram.reels_reach'].pct >= 10) cross.push({ id: 'reels_reach_up', tone: 'good', metrics: ['instagram.reels_reach'], text: 'Reels alcançaram mais pessoas que no período de comparação.' });
  if (P(cmp, 'instagram.profile_visits') && cmp['instagram.profile_visits'].pct >= 10) cross.push({ id: 'profile_visits_up', tone: 'good', metrics: ['instagram.profile_visits'], text: 'Perfil recebeu mais visitas.' });
  for (const c of cross) (c.tone === 'good' ? highlights : attention).unshift({ id: c.id, type: c.tone === 'good' ? 'highlight' : 'attention', text: c.text, metrics: c.metrics, strength: 1000 });

  // pares de análise cruzada (correlação, nunca causalidade)
  const defs = [
    ['Investimento × leads', 'traffic.spend', leadsK], ['Leads × agendamentos', 'commercial.leads_received', 'commercial.appointments'],
    ['Agendamentos × comparecimentos', 'commercial.appointments', 'commercial.attendances'], ['Comparecimentos × vendas', 'commercial.attendances', salesK],
    ['Investimento × faturamento', 'traffic.spend', 'sales.revenue'], ['Alcance × leads', reachK && reachK.key, leadsK],
    ['Quantidade de conteúdo × alcance', 'instagram.content_total', 'instagram.reach'], ['Visualizações × novos seguidores', 'instagram.views', 'instagram.new_followers'],
    ['Visitas ao perfil × cliques no link', 'instagram.profile_visits', 'instagram.link_clicks'], ['Leads × vendas', leadsK, salesK],
  ];
  const pairs = [];
  for (const [title, ka, kb] of defs) {
    if (!ka || !kb || ka === kb) continue;
    const a = cmp[ka]; const b = cmp[kb];
    if (!a || !b || flat[ka] === undefined || flat[kb] === undefined) continue;
    const dir = (c) => (c.direction === 'stable' ? 'estável' : (c.abs > 0 ? 'subiu' : 'caiu'));
    const da = dir(a); const db = dir(b);
    let reading;
    if (da === 'subiu' && db === 'subiu') reading = 'Os dois indicadores evoluíram conjuntamente no período.';
    else if (da === 'caiu' && db === 'caiu') reading = 'Os dois indicadores recuaram no período.';
    else if (da === 'subiu' && db !== 'subiu') reading = `${flat[ka].label} cresceu, mas ${flat[kb].label} não acompanhou.`;
    else if (da !== 'subiu' && db === 'subiu') reading = `${flat[kb].label} cresceu mesmo sem crescimento de ${flat[ka].label}.`;
    else reading = 'Sem movimento relevante nos dois indicadores.';
    pairs.push({ title, a: { key: ka, label: flat[ka].label, unit: flat[ka].unit, value: a.value, base: a.base, pct: a.pct }, b: { key: kb, label: flat[kb].label, unit: flat[kb].unit, value: b.value, base: b.base, pct: b.pct }, reading, note: 'Correlação observada entre indicadores; não prova relação de causa sem dados de atribuição.' });
  }
  highlights.splice(8); attention.splice(8);
  return { highlights, attention, cross, pairs };
}

// ---------------------------------------------------------------- leitura estratégica (regras, sem IA)
const NEXT_STEPS = {
  reach_up_leads_flat: 'Revisar CTAs, perfil, páginas de destino e a distribuição das ofertas: o gargalo parece estar entre atenção e conversão.',
  leads_up_sales_down: 'Revisar qualificação dos leads, tempo de resposta e o processo comercial antes de ampliar o topo do funil.',
  spend_up_cpl_down: 'Considerar manter a estrutura que ganhou eficiência e testar escalar com cautela.',
  sales_up_spend_stable: 'Documentar o que mudou no comercial/criativos e repetir no próximo período.',
  attendance_down: 'Reforçar confirmação de agendamentos (lembretes, contato prévio) e investigar os motivos das faltas.',
  reach_up_profile_down: 'Revisar chamadas para o perfil (CTA no conteúdo, bio e destaques).',
  cpl_up: 'Revisar públicos, criativos e ofertas das campanhas; checar frequência e saturação.',
  stories_retention_down: 'Revisar ritmo, duração e narrativa dos Stories.',
  reels_reach_up: 'Manter e ampliar o formato que performou (ganchos e temas dos Reels de melhor resultado).',
  profile_visits_up: 'Garantir que o perfil converta: bio, destaques, link e CTA atualizados.',
};

function buildReading(ctx) {
  const { report, flat, cmp, baseline, rules, funnelSteps } = ctx;
  const happened = []; const meaning = []; const next = [];
  const kpis = executiveKpis(flat, cmp);
  const withCmp = kpis.filter((k) => k.cmp && k.cmp.direction !== 'stable');
  if (!Object.keys(flat).length) return { happened: ['Ainda não há dados preenchidos neste relatório.'], meaning: [], next: ['Preencha ao menos um módulo para gerar a leitura.'] };
  if (!baseline?.available) {
    happened.push(`Primeiro período registrado (${periodLabel(report)}): sem base de comparação. Os números abaixo ficam como ponto de partida para os próximos meses.`);
    kpis.slice(0, 5).forEach((k) => happened.push(`${k.label}: ${fmt(k.value, k.unit)}.`));
    next.push('Registrar o próximo mês para habilitar comparações e leituras de tendência.');
    return { happened, meaning, next };
  }
  happened.push(`Comparação com ${baseline.label}.`);
  const ups = withCmp.filter((k) => k.cmp.tone === 'good').slice(0, 3);
  const downs = withCmp.filter((k) => k.cmp.tone === 'bad').slice(0, 3);
  const others = withCmp.filter((k) => k.cmp.tone === 'neutral').slice(0, 2);
  const line = (k) => `${k.label} ${k.cmp.abs > 0 ? 'subiu' : 'caiu'}${k.cmp.pp !== null ? ` ${Math.abs(k.cmp.pp).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.` : (k.cmp.pct !== null ? ` ${pctTxt(k.cmp.pct)}` : '')} (${fmt(k.cmp.base, k.unit)} → ${fmt(k.value, k.unit)}).`;
  ups.forEach((k) => happened.push(`Melhorou: ${line(k)}`));
  downs.forEach((k) => happened.push(`Piorou: ${line(k)}`));
  others.forEach((k) => happened.push(`Variou: ${line(k)}`));
  if (!ups.length && !downs.length && !others.length) happened.push('Os indicadores principais ficaram estáveis em relação à base de comparação.');
  for (const c of rules.cross) { meaning.push(c.text); if (NEXT_STEPS[c.id]) next.push(NEXT_STEPS[c.id]); else if (c.id.startsWith('growth_slowed')) next.push('Revisar frequência, formatos e CTAs de crescimento de audiência.'); }
  const steps = funnelSteps.filter((s) => isNum(s.rate_from_previous));
  if (steps.length >= 2) {
    const worst = [...steps].sort((a, b) => a.rate_from_previous - b.rate_from_previous)[0];
    meaning.push(`No funil comercial, a menor taxa de passagem do período está em "${worst.label}" (${worst.rate_from_previous.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da etapa anterior).`);
  }
  if (!meaning.length) meaning.push('Sem sinais cruzados relevantes com os dados informados. Quanto mais módulos preenchidos (tráfego, comercial, vendas), mais conclusões o sistema consegue apontar.');
  if (!next.length) next.push('Manter a rotina atual e registrar o contexto do período (campanhas, promoções, eventos) para explicar variações futuras.');
  if (!['traffic', 'commercial', 'sales'].every((m) => (report.modules || []).some((x) => x.module_key === m))) next.push('Adicionar os módulos de Tráfego, Comercial e Vendas para habilitar o funil completo e as análises de eficiência.');
  return { happened, meaning, next: [...new Set(next)] };
}

// ---------------------------------------------------------------- completude
function moduleState(mod) {
  const n = (mod.metrics || []).filter((x) => num(x.value_num ?? x.value) !== null || (x.value_text && String(x.value_text).trim())).length;
  const c = (mod.contents || []).length;
  if (mod.complete) return 'complete';
  return n + c > 0 ? 'partial' : 'empty';
}

function completeness(report) {
  const mods = (report.modules || []).map((m) => ({ id: m.id, module_key: m.module_key, label: m.module_key === 'other' ? (m.label || 'Outro') : CATALOG[m.module_key]?.label, state: moduleState(m), metrics: (m.metrics || []).length }));
  const score = mods.length ? mods.reduce((acc, m) => acc + (m.state === 'complete' ? 1 : (m.state === 'partial' ? 0.5 : 0)), 0) / mods.length : 0;
  const areas = [
    { key: 'social', label: 'Redes sociais', keys: ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] },
    { key: 'traffic', label: 'Tráfego pago', keys: ['traffic'] },
    { key: 'commercial', label: 'Comercial', keys: ['commercial'] },
    { key: 'sales', label: 'Vendas / Faturamento', keys: ['sales'] },
  ].map((a) => {
    const ms = mods.filter((m) => a.keys.includes(m.module_key));
    const state = !ms.length ? 'not_informed' : (ms.every((m) => m.state === 'complete') ? 'complete' : (ms.some((m) => m.state !== 'empty') ? 'partial' : 'not_informed'));
    return { key: a.key, label: a.label, state };
  });
  const present = (k) => areas.find((a) => a.key === k)?.state !== 'not_informed';
  const unlocks = [
    { label: 'Comparação com períodos anteriores', ok: true },
    { label: 'Funil comercial e taxas de conversão', ok: present('commercial') },
    { label: 'CPL, CPC, CPM, ROAS por plataforma', ok: present('traffic') },
    { label: 'ROI, CAC e ticket médio', ok: present('traffic') && present('sales') },
    { label: 'Visão do negócio (alcance → faturamento)', ok: present('social') && present('commercial') && present('sales') },
  ];
  return { percent: Math.round(score * 100), modules: mods, areas, unlocks };
}

// ---------------------------------------------------------------- análise completa de um relatório
function analyze(report, priors, baselineType = 'prev') {
  const flat = flatten(report);
  const baseline = buildBaseline(baselineType, report, priors);
  const cmp = compare(flat, baseline);
  const rules = analyzeRules(flat, cmp, baseline);
  const funnelSteps = funnel(flat, cmp);
  const kpis = executiveKpis(flat, cmp);
  const reading = buildReading({ report, flat, cmp, baseline, rules, funnelSteps });

  // consolidado de redes (apenas métricas compatíveis)
  const networks = SOCIAL.filter((n) => (report.modules || []).some((m) => m.module_key === n)).map((n) => {
    const def = CATALOG[n]; const a = def.audienceKey;
    const g = (k) => (flat[`${n}.${k}`] ? { value: flat[`${n}.${k}`].value, cmp: cmp[`${n}.${k}`] || null } : null);
    return { key: n, label: def.label, audience_label: def.audienceLabel, audience: g(`${a}_end`), net: g(`${a}_net`), growth_pct: g(`${a}_growth_pct`), reach: g('reach'), views: g(n === 'tiktok' ? 'video_views' : 'views'), engagement: g('engagement_rate'), content: g('content_total') || g(n === 'tiktok' || n === 'youtube' ? 'videos_published' : 'posts_count') };
  });
  const leaders = {};
  const best = (list, f) => list.filter((x) => f(x) !== null && f(x) !== undefined).sort((x, y) => f(y) - f(x))[0];
  if (networks.length > 1) {
    const g = best(networks, (x) => x.growth_pct?.value); if (g) leaders.growth = { network: g.label, value: g.growth_pct.value };
    const r = best(networks, (x) => x.reach?.value); if (r) leaders.reach = { network: r.label, value: r.reach.value, note: 'Cada rede mede alcance de um jeito; não somamos entre plataformas.' };
    const e = best(networks, (x) => x.engagement?.value); if (e) leaders.engagement = { network: e.label, value: e.engagement.value, note: 'Só compara taxas informadas; as plataformas calculam de formas diferentes.' };
  }
  return { period: { key: periodKey(report), label: periodLabel(report) }, baseline: { type: baseline.type, label: baseline.label, available: baseline.available, reports: baseline.reports }, flat, comparisons: cmp, kpis, funnel: funnelSteps, highlights: rules.highlights, attention: rules.attention, cross: rules.cross, pairs: rules.pairs, reading, networks, leaders, completeness: completeness(report) };
}

// ---------------------------------------------------------------- histórico
function polarityScore(polarity, change) { return polarity === 'down' ? -change : (polarity === 'up' ? change : null); }

function buildHistory(items, notes = []) {
  const sorted = [...items].sort((a, b) => monthIndex(a.report) - monthIndex(b.report));
  const series = {};
  for (const { report, flat } of sorted) {
    for (const [k, e] of Object.entries(flat)) {
      const s = series[k] = series[k] || { key: k, label: e.label, unit: e.unit, polarity: e.polarity, module: e.module, moduleLabel: e.moduleLabel, derived: !!e.derived, points: [] };
      s.points.push({ period: periodKey(report), label: periodLabel(report), value: round(e.value, 4), report_id: report.id, status: report.status });
    }
  }
  const insights = {};
  const moves = [];
  for (const s of Object.values(series)) {
    const pts = s.points; const vals = pts.map((p) => p.value);
    const maxP = pts.reduce((a, b) => (b.value > a.value ? b : a)); const minP = pts.reduce((a, b) => (b.value < a.value ? b : a));
    const bestP = s.polarity === 'down' ? minP : maxP; const worstP = s.polarity === 'down' ? maxP : minP;
    let trend = null;
    if (pts.length >= 4) {
      const last = vals.slice(-3).reduce((a, b) => a + b, 0) / 3; const prev = vals.slice(-6, -3).reduce((a, b) => a + b, 0) / Math.max(1, vals.slice(-6, -3).length);
      const ch = prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;
      if (ch !== null) trend = { change_pct: round(ch, 1), label: Math.abs(ch) < 3 ? 'estagnado' : (ch > 0 ? (s.polarity === 'down' ? 'subindo' : 'crescendo') : (s.polarity === 'down' ? 'caindo' : 'caindo')), good: polarityScore(s.polarity, ch) === null ? null : polarityScore(s.polarity, ch) > 0 };
    } else if (pts.length >= 2) {
      const ch = vals[vals.length - 2] !== 0 ? ((vals[vals.length - 1] - vals[vals.length - 2]) / Math.abs(vals[vals.length - 2])) * 100 : null;
      if (ch !== null) trend = { change_pct: round(ch, 1), label: Math.abs(ch) < 3 ? 'estável' : (ch > 0 ? 'em alta' : 'em queda'), good: polarityScore(s.polarity, ch) === null ? null : polarityScore(s.polarity, ch) > 0, short: true };
    }
    insights[s.key] = { best: { period: bestP.period, label: bestP.label, value: bestP.value }, worst: { period: worstP.period, label: worstP.label, value: worstP.value }, peak: { period: maxP.period, label: maxP.label, value: maxP.value }, trough: { period: minP.period, label: minP.label, value: minP.value }, trend, months: pts.length };
    if (pts.length >= 2 && s.polarity !== 'neutral') {
      const prior = vals.slice(0, -1).reduce((a, b) => a + b, 0) / (vals.length - 1);
      if (prior !== 0) moves.push({ key: s.key, label: s.label, moduleLabel: s.moduleLabel, unit: s.unit, change_pct: round(((vals[vals.length - 1] - prior) / Math.abs(prior)) * 100, 1), score: polarityScore(s.polarity, ((vals[vals.length - 1] - prior) / Math.abs(prior)) * 100) });
    }
  }
  moves.sort((a, b) => b.score - a.score);
  const markers = [];
  for (const n of notes) if (n.chart_marker && n.period) markers.push({ period: n.period, text: n.text, tag: n.tag || '' });
  return {
    periods: sorted.map(({ report }) => ({ period: periodKey(report), label: periodLabel(report), report_id: report.id, status: report.status })),
    series, insights, markers,
    most_improved: moves.filter((m) => m.score > 0).slice(0, 3), most_worsened: [...moves].reverse().filter((m) => m.score < 0).slice(0, 3),
  };
}

module.exports = { flatten, buildBaseline, compare, analyze, completeness, buildHistory, executiveKpis, funnel, monthIndex, periodKey, periodLabel, fmt, num, moduleState };
