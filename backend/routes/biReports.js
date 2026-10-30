// Relatórios (BI): relatórios mensais por cliente, modulares e persistentes.
// Um relatório por cliente/mês. Cada módulo (Instagram, Tráfego, Comercial...) é salvo separadamente.
// Relatório finalizado fica travado: para alterar é preciso reabrir e a versão anterior é guardada.
const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { persistMediaBuffer } = require('../services/mediaStorage');
const { CATALOG, SOURCES, CORE_AREAS } = require('../services/biCatalog');
const engine = require('../services/biEngine');

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS bi_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    period_start TEXT,
    period_end TEXT,
    responsible_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final')),
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    finalized_at TEXT,
    finalized_by_name TEXT,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(agency_id, client_id, year, month),
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bi_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    module_key TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    complete INTEGER NOT NULL DEFAULT 0,
    source TEXT,
    notes TEXT,
    updated_by_name TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(report_id, module_key, label),
    FOREIGN KEY (report_id) REFERENCES bi_reports(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bi_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    label TEXT,
    value_num REAL,
    value_text TEXT,
    unit TEXT,
    scope_type TEXT,
    scope TEXT,
    category TEXT,
    note TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (module_id) REFERENCES bi_modules(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bi_metrics_module ON bi_metrics(module_id);
  CREATE TABLE IF NOT EXISTS bi_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    rank_type TEXT NOT NULL DEFAULT 'best' CHECK(rank_type IN ('best','worst')),
    format TEXT,
    title TEXT,
    url TEXT,
    published_at TEXT,
    reach REAL, views REAL, interactions REAL, saves REAL, shares REAL, comments REAL, likes REAL,
    note TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (module_id) REFERENCES bi_modules(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bi_contents_module ON bi_contents(module_id);
  CREATE TABLE IF NOT EXISTS bi_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    module_key TEXT,
    filename TEXT,
    media_url TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER,
    note TEXT,
    uploaded_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES bi_reports(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bi_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    tag TEXT,
    chart_marker INTEGER NOT NULL DEFAULT 0,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES bi_reports(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bi_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    reason TEXT,
    saved_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES bi_reports(id) ON DELETE CASCADE
  );
`);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ok = /^(image\/|application\/pdf$|text\/csv$|application\/vnd\.(ms-excel|openxmlformats))/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Envie imagem, PDF ou planilha.'), ok);
  },
});

const isClientUser = (u) => u?.role === 'client';
const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const userName = (u) => u?.name || u?.email || 'Usuário';
const canEdit = (u) => !isClientUser(u) && hasPermission(u, 'reports.edit');

function loadReport(id, agencyId) {
  const r = db.prepare('SELECT r.*, c.name AS client_name, c.logo_color AS client_color FROM bi_reports r JOIN clients c ON c.id = r.client_id WHERE r.id = ? AND r.agency_id = ?').get(id, agencyId);
  if (!r) return null;
  const modules = db.prepare('SELECT * FROM bi_modules WHERE report_id = ? ORDER BY id').all(id).map((m) => ({
    ...m, complete: !!m.complete,
    metrics: db.prepare('SELECT * FROM bi_metrics WHERE module_id = ? ORDER BY sort, id').all(m.id).map((x) => ({ ...x, is_custom: !!x.is_custom })),
    contents: db.prepare('SELECT * FROM bi_contents WHERE module_id = ? ORDER BY rank_type, sort, id').all(m.id),
  }));
  return {
    ...r, modules,
    sources: db.prepare('SELECT * FROM bi_sources WHERE report_id = ? ORDER BY id').all(id),
    notes_list: db.prepare('SELECT * FROM bi_notes WHERE report_id = ? ORDER BY id').all(id),
  };
}

// Todos os relatórios do cliente já "achatados" (para comparações e histórico).
function clientReports(agencyId, clientId, onlyFinal = false) {
  const ids = db.prepare(`SELECT id FROM bi_reports WHERE agency_id = ? AND client_id = ? ${onlyFinal ? "AND status = 'final'" : ''} ORDER BY year, month`).all(agencyId, clientId);
  return ids.map(({ id }) => { const report = loadReport(id, agencyId); return { report, flat: engine.flatten(report) }; });
}

// Gate de acesso: equipe -> canAccessClient; cliente -> só o próprio e só relatórios finalizados.
function access(req, report, { write = false } = {}) {
  if (!report) return { code: 404, error: 'Relatório não encontrado.' };
  if (isClientUser(req.user)) {
    if (write) return { code: 403, error: 'Sem permissão para editar.' };
    if (!hasPermission(req.user, 'reports.view') || Number(req.user.client_id) !== Number(report.client_id) || report.status !== 'final') return { code: 403, error: 'Relatório indisponível.' };
    return null;
  }
  if (!canAccessClient(req.user, report.client_id)) return { code: 403, error: 'Sem acesso a este cliente.' };
  if (write && !canEdit(req.user)) return { code: 403, error: 'Você não possui permissão para editar relatórios.' };
  return null;
}

function snapshot(report) {
  const { client_name, client_color, ...rest } = report;
  return JSON.stringify(rest);
}

function saveVersion(report, user, reason) {
  db.prepare('INSERT INTO bi_versions (report_id, version, snapshot, reason, saved_by_name) VALUES (?,?,?,?,?)').run(report.id, report.version, snapshot(report), txt(reason, 200), userName(user));
}

function touch(id) { db.prepare("UPDATE bi_reports SET updated_at = datetime('now') WHERE id = ?").run(id); }
const locked = (report) => (report.status === 'final' ? { code: 409, error: 'Relatório finalizado. Reabra para editar (a versão atual será preservada).' } : null);

function summary(report) {
  const c = engine.completeness(report);
  return {
    id: report.id, client_id: report.client_id, client_name: report.client_name, client_color: report.client_color,
    year: report.year, month: report.month, period: engine.periodKey(report), label: engine.periodLabel(report),
    period_start: report.period_start, period_end: report.period_end, responsible_name: report.responsible_name,
    status: report.status, version: report.version, updated_at: report.updated_at, finalized_at: report.finalized_at,
    completeness: c.percent, areas: c.areas, modules: c.modules.map((m) => ({ module_key: m.module_key, label: m.label, state: m.state })),
  };
}

// ------------------------------------------------------------------ rotas
router.get('/catalog', (req, res) => {
  res.json({ catalog: CATALOG, sources: SOURCES, core_areas: CORE_AREAS });
});

router.get('/', (req, res) => {
  const { client_id, year, month, status, from, to } = req.query;
  let sql = 'SELECT id FROM bi_reports WHERE agency_id = ?'; const args = [req.user.agency_id];
  if (isClientUser(req.user)) {
    if (!hasPermission(req.user, 'reports.view') || !req.user.client_id) return res.json({ reports: [] });
    sql += " AND client_id = ? AND status = 'final'"; args.push(req.user.client_id);
  } else if (client_id) { sql += ' AND client_id = ?'; args.push(Number(client_id)); }
  if (year) { sql += ' AND year = ?'; args.push(Number(year)); }
  if (month) { sql += ' AND month = ?'; args.push(Number(month)); }
  if (status && ['draft', 'final'].includes(status)) { sql += ' AND status = ?'; args.push(status); }
  if (from && /^\d{4}-\d{2}$/.test(from)) { sql += " AND (year*100+month) >= ?"; args.push(Number(from.replace('-', ''))); }
  if (to && /^\d{4}-\d{2}$/.test(to)) { sql += " AND (year*100+month) <= ?"; args.push(Number(to.replace('-', ''))); }
  sql += ' ORDER BY year DESC, month DESC, id DESC LIMIT 500';
  const rows = db.prepare(sql).all(...args).map(({ id }) => loadReport(id, req.user.agency_id))
    .filter((r) => r && (isClientUser(req.user) || canAccessClient(req.user, r.client_id)));
  res.json({ reports: rows.map(summary) });
});

router.get('/history', (req, res) => {
  let clientId = Number(req.query.client_id);
  if (isClientUser(req.user)) {
    if (!hasPermission(req.user, 'reports.view')) return res.status(403).json({ error: 'Sem permissão.' });
    clientId = Number(req.user.client_id);
  } else if (!clientId || !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Selecione um cliente com acesso.' });
  let items = clientReports(req.user.agency_id, clientId, isClientUser(req.user));
  const { from, to } = req.query;
  const k = (r) => engine.periodKey(r);
  if (from && /^\d{4}-\d{2}$/.test(from)) items = items.filter((i) => k(i.report) >= from);
  if (to && /^\d{4}-\d{2}$/.test(to)) items = items.filter((i) => k(i.report) <= to);
  const notes = [];
  for (const { report } of items) for (const n of report.notes_list) notes.push({ ...n, period: engine.periodKey(report), report_id: report.id });
  res.json({ client_id: clientId, ...engine.buildHistory(items, notes), reports: items.map((i) => summary(i.report)) });
});

router.post('/', (req, res) => {
  if (!canEdit(req.user)) return res.status(403).json({ error: 'Você não possui permissão para criar relatórios.' });
  const clientId = Number(req.body.client_id); const year = Number(req.body.year); const month = Number(req.body.month);
  if (!clientId || !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Cliente inválido.' });
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) return res.status(400).json({ error: 'Informe mês e ano válidos.' });
  const exists = db.prepare('SELECT id FROM bi_reports WHERE agency_id = ? AND client_id = ? AND year = ? AND month = ?').get(req.user.agency_id, clientId, year, month);
  if (exists) return res.status(409).json({ error: 'Já existe um relatório deste cliente neste mês.', id: exists.id });
  const keys = [...new Set((Array.isArray(req.body.modules) ? req.body.modules : []).filter((k) => CATALOG[k]))];
  const pad = (n) => String(n).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  const create = db.transaction(() => {
    const info = db.prepare('INSERT INTO bi_reports (agency_id, client_id, year, month, period_start, period_end, responsible_name, created_by_name, notes) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.user.agency_id, clientId, year, month, txt(req.body.period_start, 10) || `${year}-${pad(month)}-01`, txt(req.body.period_end, 10) || `${year}-${pad(month)}-${pad(last)}`, txt(req.body.responsible_name, 120) || userName(req.user), userName(req.user), txt(req.body.notes, 2000));
    for (const k of keys) if (k !== 'other') db.prepare("INSERT INTO bi_modules (report_id, module_key, label, source, updated_by_name) VALUES (?,?,?,?,?)").run(info.lastInsertRowid, k, '', CATALOG[k].defaultSource || null, userName(req.user));
    return info.lastInsertRowid;
  });
  const id = create();
  res.status(201).json({ id, report: summary(loadReport(id, req.user.agency_id)) });
});

router.get('/:id', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const baselineType = ['prev', 'avg3', 'avg6', 'yoy'].includes(req.query.baseline) ? req.query.baseline : 'prev';
  const priors = clientReports(req.user.agency_id, report.client_id, isClientUser(req.user)).filter((i) => i.report.id !== report.id);
  const analysis = engine.analyze(report, priors, baselineType);
  const baselines = {};
  for (const t of ['prev', 'avg3', 'avg6', 'yoy']) baselines[t] = engine.buildBaseline(t, report, priors).available;
  const view = { ...report };
  if (isClientUser(req.user)) { view.created_by_name = undefined; }
  res.json({ report: view, analysis, baselines_available: baselines, can_edit: !isClientUser(req.user) && canEdit(req.user) });
});

router.put('/:id', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const b = req.body || {};
  db.prepare('UPDATE bi_reports SET responsible_name = ?, notes = ?, period_start = ?, period_end = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(txt(b.responsible_name ?? report.responsible_name, 120), txt(b.notes ?? report.notes, 4000), txt(b.period_start ?? report.period_start, 10), txt(b.period_end ?? report.period_end, 10), report.id);
  res.json({ ok: true, report: summary(loadReport(report.id, req.user.agency_id)) });
});

router.post('/:id/modules', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const key = txt(req.body.module_key, 40);
  if (!CATALOG[key]) return res.status(400).json({ error: 'Módulo inválido.' });
  const label = key === 'other' ? txt(req.body.label, 80) : '';
  if (key === 'other' && !label) return res.status(400).json({ error: 'Dê um nome ao módulo.' });
  if (db.prepare('SELECT 1 FROM bi_modules WHERE report_id = ? AND module_key = ? AND label = ?').get(report.id, key, label)) return res.status(409).json({ error: 'Módulo já adicionado.' });
  const info = db.prepare('INSERT INTO bi_modules (report_id, module_key, label, source, updated_by_name) VALUES (?,?,?,?,?)').run(report.id, key, label, CATALOG[key].defaultSource || null, userName(req.user));
  touch(report.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:id/modules/:moduleId', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  db.prepare('DELETE FROM bi_modules WHERE id = ? AND report_id = ?').run(Number(req.params.moduleId), report.id);
  touch(report.id);
  res.json({ ok: true });
});

// Salva UM módulo inteiro (métricas + conteúdos). Vazio = "não informado" (a linha não é gravada, nunca vira zero).
router.put('/:id/modules/:moduleId', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const mod = db.prepare('SELECT * FROM bi_modules WHERE id = ? AND report_id = ?').get(Number(req.params.moduleId), report.id);
  if (!mod) return res.status(404).json({ error: 'Módulo não encontrado.' });
  const b = req.body || {};
  const tx = db.transaction(() => {
    db.prepare("UPDATE bi_modules SET source = ?, notes = ?, complete = ?, updated_by_name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(txt(b.source ?? mod.source, 80), txt(b.notes ?? mod.notes, 4000), b.complete === undefined ? mod.complete : (b.complete ? 1 : 0), userName(req.user), mod.id);
    if (Array.isArray(b.metrics)) {
      db.prepare('DELETE FROM bi_metrics WHERE module_id = ?').run(mod.id);
      const ins = db.prepare('INSERT INTO bi_metrics (module_id, key, label, value_num, value_text, unit, scope_type, scope, category, note, is_custom, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      b.metrics.slice(0, 600).forEach((x, i) => {
        const n = engine.num(x.value_num ?? x.value);
        const t = txt(x.value_text, 300);
        if (n === null && !t) return; // não informado
        const custom = x.is_custom || !x.key ? 1 : 0;
        const key = custom ? `custom_${i}_${Date.now() % 100000}` : txt(x.key, 60);
        ins.run(mod.id, key, txt(x.label, 120), n, t || null, txt(x.unit, 20) || null, ['platform', 'campaign'].includes(x.scope_type) ? x.scope_type : null, txt(x.scope, 120) || null, txt(x.category, 60) || null, txt(x.note, 300) || null, custom, i);
      });
    }
    if (Array.isArray(b.contents)) {
      db.prepare('DELETE FROM bi_contents WHERE module_id = ?').run(mod.id);
      const ins = db.prepare('INSERT INTO bi_contents (module_id, rank_type, format, title, url, published_at, reach, views, interactions, saves, shares, comments, likes, note, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      b.contents.slice(0, 60).forEach((c, i) => {
        if (!txt(c.title) && !txt(c.url)) return;
        ins.run(mod.id, c.rank_type === 'worst' ? 'worst' : 'best', txt(c.format, 40), txt(c.title, 200), txt(c.url, 500), txt(c.published_at, 10), ...['reach', 'views', 'interactions', 'saves', 'shares', 'comments', 'likes'].map((k) => engine.num(c[k])), txt(c.note, 300), i);
      });
    }
  });
  tx();
  touch(report.id);
  res.json({ ok: true });
});

router.post('/:id/sources', upload.single('file'), (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo.' });
  const url = persistMediaBuffer(req.file.buffer, req.file.mimetype);
  if (!url) return res.status(400).json({ error: 'Arquivo inválido.' });
  const info = db.prepare('INSERT INTO bi_sources (report_id, module_key, filename, media_url, mime, size_bytes, note, uploaded_by_name) VALUES (?,?,?,?,?,?,?,?)')
    .run(report.id, txt(req.body.module_key, 40) || null, txt(req.file.originalname, 200), url, req.file.mimetype, req.file.size, txt(req.body.note, 300) || null, userName(req.user));
  touch(report.id);
  res.status(201).json({ source: db.prepare('SELECT * FROM bi_sources WHERE id = ?').get(info.lastInsertRowid) });
});

// Fontes anexadas permanecem mesmo com o relatório finalizado (são a evidência); só dá para anexar mais com ele aberto.
router.delete('/:id/sources/:sourceId', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  db.prepare('DELETE FROM bi_sources WHERE id = ? AND report_id = ?').run(Number(req.params.sourceId), report.id);
  touch(report.id);
  res.json({ ok: true });
});

// Contexto do período (campanhas, promoções, eventos...). Pode ser registrado mesmo após finalizar.
router.post('/:id/notes', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true });
  if (denied) return res.status(denied.code).json({ error: denied.error });
  const text = txt(req.body.text, 1000);
  if (!text) return res.status(400).json({ error: 'Escreva a anotação.' });
  const info = db.prepare('INSERT INTO bi_notes (report_id, text, tag, chart_marker, created_by_name) VALUES (?,?,?,?,?)').run(report.id, text, txt(req.body.tag, 40) || null, req.body.chart_marker ? 1 : 0, userName(req.user));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:id/notes/:noteId', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true });
  if (denied) return res.status(denied.code).json({ error: denied.error });
  db.prepare('DELETE FROM bi_notes WHERE id = ? AND report_id = ?').run(Number(req.params.noteId), report.id);
  res.json({ ok: true });
});

router.post('/:id/finalize', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true }) || locked(report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  if (!report.modules.some((m) => engine.moduleState(m) !== 'empty')) return res.status(400).json({ error: 'Preencha ao menos um módulo antes de finalizar.' });
  db.prepare("UPDATE bi_reports SET status = 'final', finalized_at = datetime('now'), finalized_by_name = ?, updated_at = datetime('now') WHERE id = ?").run(userName(req.user), report.id);
  res.json({ ok: true });
});

// Reabrir: guarda a versão finalizada antes de liberar a edição; ao finalizar de novo a versão sobe.
router.post('/:id/reopen', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true });
  if (denied) return res.status(denied.code).json({ error: denied.error });
  if (report.status !== 'final') return res.status(409).json({ error: 'O relatório já está em rascunho.' });
  const tx = db.transaction(() => {
    saveVersion(report, req.user, txt(req.body.reason, 200) || 'Reaberto para edição');
    db.prepare("UPDATE bi_reports SET status = 'draft', version = version + 1, updated_at = datetime('now') WHERE id = ?").run(report.id);
  });
  tx();
  res.json({ ok: true, version: report.version + 1 });
});

router.get('/:id/versions', (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report);
  if (denied) return res.status(denied.code).json({ error: denied.error });
  if (isClientUser(req.user)) return res.status(403).json({ error: 'Restrito à equipe.' });
  const rows = db.prepare('SELECT id, version, reason, saved_by_name, created_at, snapshot FROM bi_versions WHERE report_id = ? ORDER BY id DESC').all(report.id);
  res.json({
    current: { version: report.version, status: report.status, updated_at: report.updated_at, finalized_by_name: report.finalized_by_name },
    versions: rows.map((v) => { let snap = null; try { snap = JSON.parse(v.snapshot); } catch { /* ignore */ } return { id: v.id, version: v.version, reason: v.reason, saved_by_name: v.saved_by_name, created_at: v.created_at, finalized_at: snap?.finalized_at || null, finalized_by_name: snap?.finalized_by_name || null, modules: (snap?.modules || []).map((m) => ({ module_key: m.module_key, metrics: (m.metrics || []).length })), snapshot: snap }; }),
  });
});

router.delete('/:id', async (req, res) => {
  const report = loadReport(Number(req.params.id), req.user.agency_id);
  const denied = access(req, report, { write: true });
  if (denied) return res.status(denied.code).json({ error: denied.error });
  try { await require('../db/backup').createBackup('antes-excluir-relatorio-bi'); } catch { /* backup é best-effort */ }
  db.prepare('DELETE FROM bi_reports WHERE id = ?').run(report.id);
  res.json({ ok: true });
});

module.exports = router;
