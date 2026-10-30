// Importação em lote de relatórios (CSV). Formato "longo": uma linha por métrica.
// cliente;ano;mes;modulo;escopo_tipo;escopo;metrica;valor;unidade;observacao
// Nada é gravado aqui: só interpretamos e montamos um plano (usado na prévia e na confirmação).
const { CATALOG, slug } = require('./biCatalog');
const { num } = require('./biEngine');

const HEADERS = ['cliente', 'ano', 'mes', 'modulo', 'escopo_tipo', 'escopo', 'metrica', 'valor', 'unidade', 'observacao'];
const MONTH_NAMES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(input) {
  const text = String(input || '').replace(/^﻿/, '');
  const d = detectDelimiter(text);
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function lookupFor(moduleKey) {
  const def = CATALOG[moduleKey]; const map = new Map();
  for (const b of def.blocks || []) for (const m of b.metrics) { map.set(slug(m.label), { ...m, block: b.key }); map.set(slug(m.key), { ...m, block: b.key }); }
  return map;
}
const MODULE_ALIASES = { 'redes sociais': null, 'trafego pago': 'traffic', trafego: 'traffic', vendas: 'sales', faturamento: 'sales', 'vendas faturamento': 'sales', 'vendas / faturamento': 'sales' };

function resolveModule(raw) {
  const s = slug(raw);
  if (!s) return null;
  for (const [k, d] of Object.entries(CATALOG)) if (k !== 'other' && (slug(k) === s || slug(d.label) === s)) return { key: k, label: '' };
  if (MODULE_ALIASES[s]) return { key: MODULE_ALIASES[s], label: '' };
  const m = String(raw).match(/^\s*outro\s*[:\-]\s*(.+)$/i);
  if (m) return { key: 'other', label: m[1].trim().slice(0, 80) };
  return null;
}

function resolveMonth(v) {
  const s = slug(v);
  if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12) return +s;
  const i = MONTH_NAMES.findIndex((n) => s === n || s === n.slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

function resolveClient(raw, clients) {
  const s = slug(raw);
  if (!s) return { error: 'cliente em branco' };
  const exact = clients.filter((c) => slug(c.name) === s);
  if (exact.length === 1) return { client: exact[0] };
  const part = clients.filter((c) => slug(c.name).includes(s) || s.includes(slug(c.name)));
  if (part.length === 1) return { client: part[0] };
  return { error: part.length > 1 ? `cliente "${raw}" ambíguo (${part.slice(0, 3).map((c) => c.name).join(', ')})` : `cliente "${raw}" não encontrado` };
}

// Interpreta o CSV e devolve o plano: relatórios -> módulos -> métricas, mais erros por linha.
function buildPlan(csvText, clients) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { error: 'O arquivo está vazio ou sem linhas de dados.', reports: [], errors: [] };
  const head = rows[0].map((h) => slug(h).replace(/\s+/g, '_'));
  const idx = {}; HEADERS.forEach((h) => { idx[h] = head.indexOf(h); });
  const missing = ['cliente', 'ano', 'mes', 'modulo', 'metrica', 'valor'].filter((h) => idx[h] < 0);
  if (missing.length) return { error: `Colunas obrigatórias ausentes: ${missing.join(', ')}. Baixe o modelo para ver o formato.`, reports: [], errors: [] };
  const get = (r, h) => (idx[h] >= 0 ? String(r[idx[h]] ?? '').trim() : '');
  const reports = new Map(); const errors = []; let skippedEmpty = 0; let usedRows = 0;
  const lookups = {};
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const valueRaw = get(r, 'valor');
    if (valueRaw === '') { skippedEmpty += 1; return; } // vazio = não informado
    const fail = (msg) => errors.push({ line, error: msg });
    const c = resolveClient(get(r, 'cliente'), clients); if (c.error) return fail(c.error);
    const year = Number(get(r, 'ano')); const month = resolveMonth(get(r, 'mes'));
    if (!(year >= 2000 && year <= 2100)) return fail(`ano inválido "${get(r, 'ano')}"`);
    if (!month) return fail(`mês inválido "${get(r, 'mes')}"`);
    const mod = resolveModule(get(r, 'modulo')); if (!mod) return fail(`módulo desconhecido "${get(r, 'modulo')}"`);
    const cleaned = valueRaw.replace(/R\$|%|\s/g, '');
    const value = num(cleaned);
    if (value === null) return fail(`valor não numérico "${valueRaw}"`);
    const rid = `${c.client.id}|${year}|${month}`;
    if (!reports.has(rid)) reports.set(rid, { client_id: c.client.id, client_name: c.client.name, year, month, modules: new Map() });
    const rep = reports.get(rid);
    const mid = `${mod.key}|${mod.label}`;
    if (!rep.modules.has(mid)) rep.modules.set(mid, { module_key: mod.key, label: mod.label, metrics: [] });
    const m = rep.modules.get(mid);
    lookups[mod.key] = lookups[mod.key] || (mod.key === 'other' ? new Map() : lookupFor(mod.key));
    const name = get(r, 'metrica'); const def = lookups[mod.key].get(slug(name));
    const stype = slug(get(r, 'escopo_tipo')); const scope = get(r, 'escopo');
    const note = get(r, 'observacao'); const unit = get(r, 'unidade');
    usedRows += 1;
    if (!def) {
      m.metrics.push({ is_custom: true, label: name, value, unit: /^(r\$|%)$/i.test(unit) ? (unit === '%' ? 'pct' : 'brl') : unit, note });
    } else if (def.dist) {
      if (!scope) return fail(`"${name}" precisa do item na coluna escopo (ex.: nome da cidade)`);
      m.metrics.push({ key: def.key, label: scope, value });
    } else if (CATALOG[mod.key].scoped) {
      const st = /^plataforma/.test(stype) ? 'platform' : (/^campanha/.test(stype) ? 'campaign' : null);
      if (st && !scope) return fail('escopo em branco para plataforma/campanha');
      m.metrics.push({ key: def.key, value, scope_type: st, scope: st ? scope : null });
    } else m.metrics.push({ key: def.key, value, note });
  });
  const list = [...reports.values()].map((rep) => ({ ...rep, modules: [...rep.modules.values()] }));
  const unknownMetrics = list.reduce((n, rep) => n + rep.modules.reduce((k, m) => k + m.metrics.filter((x) => x.is_custom).length, 0), 0);
  return { reports: list, errors, skipped_empty: skippedEmpty, used_rows: usedRows, custom_metrics: unknownMetrics };
}

function buildTemplate({ modules, clientName = 'Nome do cliente', year, month }) {
  const keys = (modules && modules.length ? modules : Object.keys(CATALOG)).filter((k) => CATALOG[k] && k !== 'other');
  const lines = [HEADERS.join(';')];
  const UN = { brl: 'R$', pct: '%', int: '', dec: '', sec: 'seg', hours: 'h' };
  const row = (mod, st, sc, m, label) => lines.push([clientName, year, month, mod, st, sc, label || m.label, '', UN[m.unit] ?? m.unit, ''].map(csvEscape).join(';'));
  for (const k of keys) {
    const def = CATALOG[k];
    for (const b of def.blocks) for (const m of b.metrics) {
      if (def.scoped) { for (const p of def.platforms.slice(0, 3)) row(def.label, 'plataforma', p, m); }
      else if (m.dist) row(def.label, 'item', `(nome do item)`, m);
      else row(def.label, '', '', m);
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { parseCsv, buildPlan, buildTemplate, HEADERS };
