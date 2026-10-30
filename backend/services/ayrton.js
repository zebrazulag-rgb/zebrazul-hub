// AYRTON — Guardião da Conta. REGRAS detectam → AYRTON agrupa e prioriza → (IA interpreta, opcional) → humano decide.
// Nada aqui publica, aprova, fala com cliente ou altera datas/responsáveis: Ayrton só observa, sugere e registra.
const crypto = require('crypto');
const { phaseOf, daysBetween, addDays } = require('./managerDashboard');
const { todayInFortaleza } = require('./myWork');
const voice = require('./ayrtonVoice');

const AGENT = 'ayrton';
const LEVEL_RANK = { critical: 4, attention: 3, opportunity: 2, normal: 1 };
const LEVEL_BASE = { critical: 300, attention: 200, opportunity: 100, normal: 0 };
const TYPE_PERMISSION = { task_overdue: 'tasks.view', approval_stuck: 'tasks.view', approved_undated: 'tasks.view', next_month_calendar: 'tasks.view', recording_no_prep: 'audiovisual.view' };
const TYPE_LABEL = {
  task_overdue: 'Tarefas vencidas', approval_stuck: 'Aprovação parada', approved_undated: 'Aprovado sem data',
  next_month_calendar: 'Calendário do próximo mês', recording_no_prep: 'Gravação sem preparação',
};
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      agent TEXT NOT NULL DEFAULT 'ayrton',
      client_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
      level TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      message TEXT,
      action TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      evidence_hash TEXT,
      ai_insight TEXT,
      ai_hash TEXT,
      related_users_json TEXT DEFAULT '[]',
      detected_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolution TEXT,
      resolution_note TEXT,
      resolved_by_name TEXT,
      ignored_until TEXT,
      ignored_forever INTEGER NOT NULL DEFAULT 0,
      ignored_level TEXT,
      ignored_by_name TEXT,
      ignored_at TEXT,
      task_id INTEGER,
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_alerts_open ON agent_alerts(agency_id, agent, dedupe_key) WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS idx_agent_alerts_scope ON agent_alerts(agency_id, agent, status, client_id);
    CREATE TABLE IF NOT EXISTS agent_alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      alert_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      agent TEXT NOT NULL DEFAULT 'ayrton',
      type TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      note TEXT,
      data_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (alert_id) REFERENCES agent_alerts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_agent_events_alert ON agent_alert_events(alert_id, id);
    CREATE TABLE IF NOT EXISTS agent_ai_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      agent TEXT NOT NULL DEFAULT 'ayrton',
      client_id INTEGER,
      reason TEXT NOT NULL,
      model TEXT,
      input_hash TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      estimated_cost REAL,
      cached INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL DEFAULT 1,
      result TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_ai_log_hash ON agent_ai_log(agency_id, agent, input_hash);
    CREATE TABLE IF NOT EXISTS agent_settings (
      agency_id INTEGER NOT NULL,
      agent TEXT NOT NULL,
      paused INTEGER NOT NULL DEFAULT 0,
      last_scan_at TEXT,
      scanning INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (agency_id, agent)
    );
  `);
}

const toDay = (v) => { const t = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
const ageFrom = (ts, today) => Math.max(0, daysBetween(toDay(ts) || today, today));
const clip = (v, n = 140) => { const t = String(v || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const hashOf = (obj) => crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
const hasTable = (db, name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const plural = voice.plural;

// ---------------------------------------------------------------- coleta
function leafTasks(db, agencyId) {
  const das = hasTable(db, 'designer_approval_states');
  return db.prepare(`
    SELECT t.id, t.parent_task_id, COALESCE(t.client_id, p.client_id) AS client_id, t.title, t.status, t.workflow_stage,
           t.approval_status, t.direction_status, t.client_status, t.direction_feedback, t.client_feedback,
           t.direction_at, t.client_at, t.due_date, t.updated_at, t.created_at, t.task_type, t.front_name,
           t.assignee_id, p.assignee_id AS parent_assignee_id, p.title AS parent_title, c.name AS client_name,
           ${das ? 'das.direction_status AS das_direction, das.client_status AS das_client, das.direction_feedback AS das_direction_feedback, das.client_feedback AS das_client_feedback' : 'NULL AS das_direction, NULL AS das_client, NULL AS das_direction_feedback, NULL AS das_client_feedback'}
    FROM tasks t
    LEFT JOIN tasks p ON p.id = t.parent_task_id AND p.agency_id = t.agency_id
    LEFT JOIN clients c ON c.id = COALESCE(t.client_id, p.client_id) AND c.agency_id = t.agency_id
    ${das ? 'LEFT JOIN designer_approval_states das ON das.task_id = t.id AND das.agency_id = t.agency_id' : ''}
    WHERE t.agency_id = ? AND c.id IS NOT NULL AND c.status = 'active'
      AND COALESCE(t.is_backlog, 0) = 0 AND COALESCE(p.is_backlog, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.agency_id = t.agency_id)
      AND t.status != 'posted'
  `).all(agencyId);
}

function assigneeNames(db, agencyId, rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.id, r.parent_task_id]).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const users = new Map(db.prepare('SELECT id, name FROM users WHERE agency_id = ?').all(agencyId).map((u) => [u.id, u.name]));
  const add = (taskId, uid) => { if (uid && users.has(uid)) { const s = map.get(taskId) || new Map(); s.set(uid, users.get(uid)); map.set(taskId, s); } };
  for (const r of rows) { add(r.id, r.assignee_id); add(r.id, r.parent_assignee_id); }
  const ph = ids.map(() => '?').join(',');
  for (const a of db.prepare(`SELECT task_id, user_id FROM task_assignees WHERE task_id IN (${ph})`).all(...ids)) {
    for (const r of rows) if (r.id === a.task_id || r.parent_task_id === a.task_id) add(r.id, a.user_id);
  }
  return map;
}

// ---------------------------------------------------------------- detectores (REGRAS)
function itemOf(row, extra = {}, names) {
  const who = names.get(row.id);
  return {
    kind: 'task', id: row.id, title: clip(row.title, 90), parent: row.parent_title ? clip(row.parent_title, 60) : null,
    due_date: toDay(row.due_date), link: `/designer?task_id=${row.parent_task_id || row.id}`,
    assignees: who ? [...who.values()] : [], assignee_ids: who ? [...who.keys()] : [], ...extra,
  };
}

function detectTaskBased(db, agencyId, today) {
  const out = [];
  const rows = leafTasks(db, agencyId);
  const names = assigneeNames(db, agencyId, rows);
  const horizon = addDays(today, 7);
  const by = { overdue: new Map(), approval: new Map(), undated: new Map() };
  const push = (m, cid, name, item) => { const e = m.get(cid) || { client_name: name, items: [] }; e.items.push(item); m.set(cid, e); };

  for (const r of rows) {
    const ph = phaseOf(r).phase;
    const due = toDay(r.due_date);
    if (['approval_direction', 'approval_held', 'approval_client'].includes(ph)) {
      const since = ph === 'approval_client' ? (toDay(r.direction_at) || toDay(r.updated_at) || toDay(r.created_at)) : (toDay(r.updated_at) || toDay(r.created_at));
      const age = ageFrom(since, today);
      const where = ph === 'approval_client' ? 'cliente' : (ph === 'approval_held' ? 'direção (falta enviar ao cliente)' : 'direção');
      push(by.approval, r.client_id, r.client_name, itemOf(r, { age_days: age, waiting: where, at_risk: Boolean(due && due <= horizon), detail: `Aguardando ${where} há ${age}d${due ? ` · prazo ${due.split('-').reverse().join('/')}` : ''}` }, names));
    } else if (['todo', 'in_progress', 'correction'].includes(ph) && due && due < today) {
      const late = daysBetween(due, today);
      push(by.overdue, r.client_id, r.client_name, itemOf(r, { late_days: late, detail: `Venceu há ${late}d (${due.split('-').reverse().join('/')})${ph === 'correction' ? ' · em correção' : ''}` }, names));
    } else if (ph === 'ready' && !phaseOf(r).scheduled && !due && r.task_type !== 'video' && String(r.front_name || '').trim().toLowerCase() !== 'site/lp') {
      const age = ageFrom(toDay(r.client_at) || toDay(r.updated_at), today);
      push(by.undated, r.client_id, r.client_name, itemOf(r, { age_days: age, detail: `Aprovada há ${age}d e sem data de publicação` }, names));
    }
  }

  // vídeos prontos (fluxo Direção → Cliente → Agendamento)
  if (hasTable(db, 'ready_videos')) {
    const vids = db.prepare(`SELECT v.id, v.client_id, v.title, v.stage, v.created_at, v.reviewed_at, c.name AS client_name FROM ready_videos v JOIN clients c ON c.id = v.client_id AND c.agency_id = v.agency_id WHERE v.agency_id = ? AND v.status = 'ready' AND c.status = 'active'`).all(agencyId);
    for (const v of vids) {
      const age = ageFrom(toDay(v.reviewed_at) || toDay(v.created_at), today);
      if (v.stage === 'direction' || v.stage === 'client') push(by.approval, v.client_id, v.client_name, { kind: 'video', id: v.id, title: clip(v.title, 90), age_days: age, waiting: v.stage === 'client' ? 'cliente' : 'direção', at_risk: false, assignees: [], assignee_ids: [], link: '/aprovacao?area=audiovisual', detail: `Vídeo aguardando ${v.stage === 'client' ? 'cliente' : 'direção'} há ${age}d` });
      else if (v.stage === 'approved') push(by.undated, v.client_id, v.client_name, { kind: 'video', id: v.id, title: clip(v.title, 90), age_days: age, assignees: [], assignee_ids: [], link: '/agendamento?area=audiovisual', detail: `Vídeo aprovado há ${age}d e ainda sem agendamento` });
    }
  }

  for (const [cid, e] of by.overdue) {
    const n = e.items.length; const maxLate = Math.max(...e.items.map((i) => i.late_days));
    const level = (maxLate >= 7 || n >= 6) ? 'critical' : ((maxLate >= 2 || n >= 2) ? 'attention' : 'normal');
    out.push({ type: 'task_overdue', client_id: cid, client_name: e.client_name, level, score: maxLate * 4 + n * 3,
      title: n === 1 ? 'Tarefa vencida' : `${n} tarefas vencidas`,
      message: `${n === 1 ? '1 tarefa passou' : `${n} tarefas passaram`} do prazo e continua${n === 1 ? '' : 'm'} pendente${n === 1 ? '' : 's'}. A mais antiga venceu há ${maxLate} ${plural(maxLate, 'dia', 'dias')}.`,
      action: n === 1 ? 'Destravar a tarefa ou renegociar o prazo.' : 'Destravar as tarefas mais antigas primeiro e renegociar prazos que não fazem mais sentido.',
      ctx: { maxLate, n }, evidence: { items: e.items.sort((a, b) => b.late_days - a.late_days).slice(0, 12), total: n, why: [`${n} ${plural(n, 'tarefa vencida', 'tarefas vencidas')} e ainda não concluída${n === 1 ? '' : 's'}`, `atraso máximo de ${maxLate} ${plural(maxLate, 'dia', 'dias')}`] } });
  }

  for (const [cid, e] of by.approval) {
    const items = e.items; const n = items.length; const maxAge = Math.max(...items.map((i) => i.age_days));
    const atRisk = items.filter((i) => i.at_risk).length;
    if (maxAge < 2) continue;
    let level = 'normal';
    if ((maxAge >= 5 && atRisk >= 1) || maxAge >= 10) level = 'critical';
    else if (maxAge >= 3 || (atRisk >= 1 && maxAge >= 2)) level = 'attention';
    const risk = atRisk >= 1 && level !== 'normal';
    const waitClient = items.filter((i) => i.waiting === 'cliente').length;
    out.push({ type: 'approval_stuck', client_id: cid, client_name: e.client_name, level, score: maxAge * 3 + n * 2 + atRisk * 12,
      title: risk ? 'Calendário em risco' : (n === 1 ? 'Aprovação parada' : 'Aprovações paradas'),
      message: risk
        ? `${n} ${plural(n, 'material aguarda', 'materiais aguardam')} aprovação há até ${maxAge} dias e ${atRisk} ${plural(atRisk, 'deles tem', 'deles têm')} prazo nos próximos 7 dias (ou já vencido).`
        : `${n} ${plural(n, 'material aguarda', 'materiais aguardam')} aprovação há até ${maxAge} dias.`,
      action: waitClient === n ? 'Cobrar o cliente hoje e confirmar as datas das publicações que dependem disso.' : 'Cobrar as aprovações pendentes hoje e revisar as datas das publicações afetadas.',
      ctx: { maxAge, n, atRisk }, evidence: { items: items.sort((a, b) => b.age_days - a.age_days).slice(0, 12), total: n, why: [`${n} ${plural(n, 'material', 'materiais')} aguardando aprovação`, `parado há até ${maxAge} dias`, ...(atRisk ? [`${atRisk} com prazo em até 7 dias ou já vencido`] : [])] } });
  }

  for (const [cid, e] of by.undated) {
    const items = e.items; const n = items.length; const maxAge = Math.max(...items.map((i) => i.age_days));
    const level = maxAge >= 7 || n >= 6 ? 'attention' : (maxAge >= 3 ? 'attention' : 'opportunity');
    out.push({ type: 'approved_undated', client_id: cid, client_name: e.client_name, level, score: maxAge * 2 + n * 2,
      title: n === 1 ? 'Publicação aprovada sem data' : 'Publicações aprovadas sem data',
      message: `${n} ${plural(n, 'conteúdo aprovado ainda não tem', 'conteúdos aprovados ainda não têm')} data de publicação${maxAge ? ` (o mais antigo, há ${maxAge} dias)` : ''}.`,
      action: 'Definir as datas no Agendamento para fechar o calendário.',
      ctx: { maxAge, n }, evidence: { items: items.sort((a, b) => b.age_days - a.age_days).slice(0, 12), total: n, why: [`${n} ${plural(n, 'peça aprovada', 'peças aprovadas')} sem data`, `a mais antiga está aprovada há ${maxAge} dias`] } });
  }
  return out;
}

function detectNextMonthCalendar(db, agencyId, today) {
  const out = [];
  const [y, m, d] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = lastDay - d;
  if (daysLeft > 10) return out;
  const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1;
  const periodKey = `${ny}-${String(nm).padStart(2, '0')}`;
  const next = periodKey;
  const clients = db.prepare("SELECT id, name FROM clients WHERE agency_id = ? AND status = 'active'").all(agencyId);
  const cutoff = addDays(today, -45);
  for (const c of clients) {
    const recent = db.prepare("SELECT COUNT(*) n FROM tasks WHERE agency_id = ? AND client_id = ? AND COALESCE(is_backlog,0)=0 AND substr(COALESCE(updated_at, created_at),1,10) >= ?").get(agencyId, c.id, cutoff).n;
    if (!recent) continue; // conta sem movimento recente: não cobra calendário
    const doc = db.prepare("SELECT progress FROM planning_documents WHERE agency_id = ? AND client_id = ? AND type = 'monthly' AND period_key = ?").get(agencyId, c.id, periodKey);
    const nextTasks = db.prepare("SELECT COUNT(*) n FROM tasks WHERE agency_id = ? AND client_id = ? AND COALESCE(is_backlog,0)=0 AND substr(due_date,1,7) = ?").get(agencyId, c.id, next).n;
    const progress = Number(doc?.progress || 0);
    if (progress >= 20 || nextTasks >= 3) continue;
    const level = daysLeft <= 3 ? 'critical' : 'attention';
    const label = `${MONTHS[nm - 1]}/${ny}`;
    out.push({ type: 'next_month_calendar', client_id: c.id, client_name: c.name, level, score: (10 - daysLeft) * 5 + 10,
      title: `Calendário de ${MONTHS[nm - 1]} não iniciado`,
      message: `${voice.daysToMonthEnd(daysLeft)} ${doc ? `O planejamento de ${label} está em ${progress}%` : `Não há planejamento de ${label}`} e há ${nextTasks} ${plural(nextTasks, 'tarefa datada', 'tarefas datadas')} no mês.`,
      action: `Abrir o planejamento mensal de ${label} e definir as peças e datas principais.`,
      ctx: { daysLeft }, evidence: { items: [{ kind: 'calendar', id: c.id, title: `Planejamento mensal ${label}`, detail: doc ? `${progress}% preenchido` : 'não criado', link: '/planejamento-mensal' }, { kind: 'calendar', id: c.id, title: `Tarefas datadas em ${label}`, detail: `${nextTasks} encontrada(s)`, link: '/calendario' }], total: 2, why: [(daysLeft <= 0 ? 'hoje é o último dia do mês' : `${daysLeft === 1 ? 'falta 1 dia' : `faltam ${daysLeft} dias`} para o fim do mês`), doc ? `planejamento de ${label} em ${progress}%` : `sem planejamento de ${label}`, `${nextTasks} tarefas datadas no próximo mês`] } });
  }
  return out;
}

function detectRecordings(db, agencyId, today) {
  const out = [];
  if (!hasTable(db, 'audiovisual_recordings')) return out;
  const rows = db.prepare(`
    SELECT r.id, r.client_id, r.title, r.scheduled_start, r.notes, r.responsible_name, c.name AS client_name,
           (SELECT COUNT(*) FROM audiovisual_scripts s WHERE s.recording_id = r.id) AS scripts
    FROM audiovisual_recordings r JOIN clients c ON c.id = r.client_id AND c.agency_id = r.agency_id
    WHERE r.agency_id = ? AND r.status = 'scheduled' AND c.status = 'active'
  `).all(agencyId);
  const by = new Map();
  for (const r of rows) {
    const day = toDay(r.scheduled_start); if (!day) continue;
    const until = daysBetween(today, day);
    if (until < 0 || until > 3) continue;
    if (Number(r.scripts) > 0 || String(r.notes || '').trim()) continue; // há roteiro/pauta/preparação
    const e = by.get(r.client_id) || { client_name: r.client_name, items: [] };
    e.items.push({ kind: 'recording', id: r.id, title: clip(r.title, 90), due_date: day, until, assignees: r.responsible_name ? [r.responsible_name] : [], assignee_ids: [], link: '/audiovisual', detail: `${until === 0 ? 'Hoje' : (until === 1 ? 'Amanhã' : `Em ${until} dias`)} (${day.split('-').reverse().join('/')}) · sem roteiro e sem pauta` });
    by.set(r.client_id, e);
  }
  for (const [cid, e] of by) {
    const minUntil = Math.min(...e.items.map((i) => i.until)); const n = e.items.length;
    out.push({ type: 'recording_no_prep', client_id: cid, client_name: e.client_name, level: minUntil <= 1 ? 'critical' : 'attention', score: (4 - minUntil) * 10 + n * 4,
      title: n === 1 ? 'Gravação próxima sem preparação' : `${n} gravações próximas sem preparação`,
      message: `${n === 1 ? 'A gravação' : `${n} gravações`} ${minUntil === 0 ? 'é hoje' : (minUntil === 1 ? 'é amanhã' : `está${n === 1 ? '' : 'o'} chegando (${minUntil} dias)`)} e não há roteiro, pauta ou anotações de preparação no ZebraHub.`,
      action: 'Garantir roteiro ou pauta antes da gravação (ou registrar onde ele está, se já existe fora do sistema).',
      ctx: { minUntil, n }, evidence: { items: e.items.sort((a, b) => a.until - b.until), total: n, why: [`gravação em até 3 dias`, 'nenhum roteiro vinculado', 'sem anotações de pauta'] } });
  }
  return out;
}

function detectAll(db, agencyId, today) {
  const list = [...detectTaskBased(db, agencyId, today), ...detectNextMonthCalendar(db, agencyId, today), ...detectRecordings(db, agencyId, today)];
  for (const d of list) {
    d.score = LEVEL_BASE[d.level] + Math.min(99, d.score);
    d.dedupe_key = `${d.type}:${d.client_id}`;
    d.related_users = [...new Set((d.evidence.items || []).flatMap((i) => i.assignee_ids || []))];
    d.quip = voice.quip(d.type, d.level, d.ctx || {}, `${today}:${d.client_id}`);
    d.message_full = d.quip ? `${d.message} ${d.quip}` : d.message;
  }
  return list;
}

// ---------------------------------------------------------------- persistência, histórico, resolução automática
function logEvent(db, alert, type, { user = null, note = '', data = null } = {}) {
  db.prepare('INSERT INTO agent_alert_events (agency_id, alert_id, client_id, agent, type, user_id, user_name, note, data_json) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(alert.agency_id, alert.id, alert.client_id, AGENT, type, user?.id || null, user?.name || (user ? null : 'Ayrton'), note || null, data ? JSON.stringify(data) : null);
}

const RESOLVED_NOTE = {
  task_overdue: 'Nenhuma tarefa vencida pendente nesta conta.', approval_stuck: 'Nenhuma aprovação parada nesta conta.',
  approved_undated: 'Todas as peças aprovadas já têm data.', next_month_calendar: 'O calendário do próximo mês passou a existir.',
  recording_no_prep: 'A gravação recebeu preparação ou saiu da janela de risco.',
};

function scanAgency(db, agencyId, today = todayInFortaleza()) {
  ensureSchema(db);
  db.prepare('INSERT INTO agent_settings (agency_id, agent, scanning) VALUES (?,?,1) ON CONFLICT(agency_id, agent) DO UPDATE SET scanning = 1').run(agencyId, AGENT);
  const stats = { detected: 0, created: 0, updated: 0, resolved: 0, escalated: 0 };
  try {
    const detections = detectAll(db, agencyId, today);
    const open = db.prepare("SELECT * FROM agent_alerts WHERE agency_id = ? AND agent = ? AND status = 'open'").all(agencyId, AGENT);
    const openByKey = new Map(open.map((a) => [a.dedupe_key, a]));
    const seen = new Set();
    const tx = db.transaction(() => {
      for (const d of detections) {
        stats.detected += 1; seen.add(d.dedupe_key);
        const evidence = { ...d.evidence, ctx: d.ctx };
        const evHash = hashOf({ items: (d.evidence.items || []).map((i) => [i.kind, i.id, i.detail]), level: d.level });
        const cur = openByKey.get(d.dedupe_key);
        if (!cur) {
          const info = db.prepare('INSERT INTO agent_alerts (agency_id, agent, client_id, type, dedupe_key, level, score, title, message, action, evidence_json, evidence_hash, related_users_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(agencyId, AGENT, d.client_id, d.type, d.dedupe_key, d.level, d.score, d.title, d.message_full, d.action, JSON.stringify(evidence), evHash, JSON.stringify(d.related_users));
          logEvent(db, { id: info.lastInsertRowid, agency_id: agencyId, client_id: d.client_id }, 'detected', { note: `${d.title}. ${d.message}`, data: { level: d.level, total: d.evidence.total } });
          stats.created += 1; continue;
        }
        const escalated = LEVEL_RANK[d.level] > LEVEL_RANK[cur.level];
        const changed = cur.evidence_hash !== evHash;
        db.prepare(`UPDATE agent_alerts SET level = ?, score = ?, title = ?, message = ?, action = ?, evidence_json = ?, evidence_hash = ?, related_users_json = ?, last_seen_at = datetime('now') WHERE id = ?`)
          .run(d.level, d.score, d.title, d.message_full, d.action, JSON.stringify(evidence), evHash, JSON.stringify(d.related_users), cur.id);
        if (escalated) { logEvent(db, cur, 'escalated', { note: `Prioridade subiu de ${cur.level} para ${d.level}.`, data: { from: cur.level, to: d.level } }); stats.escalated += 1; }
        else if (changed) { logEvent(db, cur, 'updated', { note: `Situação mudou: ${d.message}`, data: { total: d.evidence.total } }); stats.updated += 1; }
        // Ignorado, mas a situação agravou para crítica: o Ayrton reavalia e traz de volta.
        const ignoredNow = cur.ignored_forever || (cur.ignored_until && cur.ignored_until >= today);
        if (ignoredNow && d.level === 'critical' && cur.ignored_level !== 'critical') {
          db.prepare('UPDATE agent_alerts SET ignored_until = NULL, ignored_forever = 0 WHERE id = ?').run(cur.id);
          logEvent(db, cur, 'reopened', { note: 'A situação ignorada ficou crítica; o Ayrton trouxe o caso de volta.' });
        }
      }
      for (const cur of open) {
        if (seen.has(cur.dedupe_key)) continue;
        db.prepare("UPDATE agent_alerts SET status = 'resolved', resolution = 'auto', resolved_at = datetime('now'), resolution_note = ? WHERE id = ?").run(RESOLVED_NOTE[cur.type] || 'A situação deixou de existir.', cur.id);
        logEvent(db, cur, 'resolved', { note: `Alerta resolvido automaticamente. ${RESOLVED_NOTE[cur.type] || ''}`.trim(), data: { resolution: 'auto' } });
        stats.resolved += 1;
      }
    });
    tx();
  } finally {
    db.prepare("UPDATE agent_settings SET scanning = 0, last_scan_at = datetime('now') WHERE agency_id = ? AND agent = ?").run(agencyId, AGENT);
  }
  return stats;
}

const lastScanMemo = new Map();
function ensureFresh(db, agencyId, today, { maxAgeMs = 90 * 1000, force = false } = {}) {
  ensureSchema(db);
  const row = db.prepare('SELECT paused FROM agent_settings WHERE agency_id = ? AND agent = ?').get(agencyId, AGENT);
  if (row?.paused) return { skipped: 'paused' };
  const key = `${agencyId}:${today}`;
  if (!force && Date.now() - (lastScanMemo.get(key) || 0) < maxAgeMs) return { skipped: 'fresh' };
  lastScanMemo.set(key, Date.now());
  return scanAgency(db, agencyId, today);
}

// ---------------------------------------------------------------- visão por usuário (permissões + clientes)
function parse(a) {
  let evidence = {}; try { evidence = JSON.parse(a.evidence_json || '{}'); } catch { /* ignore */ }
  return { ...a, evidence, ignored_forever: !!a.ignored_forever };
}
const isIgnored = (a, today) => a.ignored_forever || (a.ignored_until && a.ignored_until >= today);

function visibleAlerts(db, user, today, { can, canAccess, clientId = null }) {
  return db.prepare("SELECT a.*, c.name AS client_name, c.responsible_user_id FROM agent_alerts a JOIN clients c ON c.id = a.client_id WHERE a.agency_id = ? AND a.agent = ? AND a.status = 'open'")
    .all(user.agency_id, AGENT).map(parse)
    .filter((a) => (!clientId || a.client_id === Number(clientId)) && canAccess(user, a.client_id) && can(user, TYPE_PERMISSION[a.type] || 'alerts.view'));
}

function accountCard(alerts, today) {
  const sorted = [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.score - a.score);
  const main = sorted[0];
  return {
    client_id: main.client_id, client_name: main.client_name, level: main.level,
    main: slim(main), others: sorted.slice(1).map(slim), alert_ids: sorted.map((a) => a.id),
  };
}
function slim(a) {
  return { id: a.id, type: a.type, type_label: TYPE_LABEL[a.type], level: a.level, title: a.title, message: a.message, action: a.action, total: a.evidence?.total || 0, detected_at: a.detected_at, task_id: a.task_id || null, has_ai: Boolean(a.ai_insight) };
}

function buildView(db, user, today, opts) {
  ensureSchema(db);
  const settings = db.prepare('SELECT * FROM agent_settings WHERE agency_id = ? AND agent = ?').get(user.agency_id, AGENT) || {};
  const all = visibleAlerts(db, user, today, opts);
  const active = all.filter((a) => !isIgnored(a, today));
  const ignored = all.filter((a) => isIgnored(a, today));
  const universe = db.prepare("SELECT id, name FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name").all(user.agency_id).filter((c) => (!opts.clientId || c.id === Number(opts.clientId)) && opts.canAccess(user, c.id));
  const byClient = new Map();
  for (const a of active) { const list = byClient.get(a.client_id) || []; list.push(a); byClient.set(a.client_id, list); }
  const cards = []; const normal = [];
  for (const c of universe) {
    const list = byClient.get(c.id) || [];
    const raised = list.filter((a) => a.level !== 'normal');
    if (raised.length) cards.push(accountCard(raised, today));
    else normal.push({ client_id: c.id, client_name: c.name, notes: list.map((a) => ({ id: a.id, title: a.title, message: a.message })), quip: voice.okAccount(`${today}:${c.id}`) });
  }
  cards.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.main.total - a.main.total);
  const counts = { verified: universe.length, critical: cards.filter((c) => c.level === 'critical').length, attention: cards.filter((c) => c.level === 'attention').length, opportunity: cards.filter((c) => c.level === 'opportunity').length, normal: normal.length };
  const hour = opts.hour ?? Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', hour: 'numeric', hour12: false }).format(new Date()));
  const top = cards[0] || null;
  const parts = [`${voice.greeting(hour)}. Fiz minha ronda.`];
  let headline;
  if (!universe.length) headline = 'Ainda não há contas ativas visíveis para você.';
  else if (!cards.length) headline = voice.okAll(`${today}:${user.id}`);
  else if (counts.critical) headline = counts.critical === 1 ? `Existe 1 conta que realmente precisa da sua atenção agora.` : `Existem ${counts.critical} contas críticas. Eu começaria pela primeira.`;
  else headline = `Existem ${counts.attention + counts.opportunity} ${plural(counts.attention + counts.opportunity, 'conta', 'contas')} pedindo olhar, nada pegando fogo.`;
  let priority = null;
  if (top) priority = { client_id: top.client_id, client_name: top.client_name, level: top.level, text: `${top.client_name}. ${top.main.title}: ${top.main.message.split('. ')[0].replace(/\.$/, '')}.`, alert_id: top.main.id };
  const status = settings.paused ? 'PAUSADO' : (settings.scanning ? 'ANALISANDO' : (counts.critical || counts.attention ? 'AGUARDANDO AÇÃO' : (cards.length || ignored.length ? 'MONITORANDO' : (universe.length ? 'TUDO CERTO' : 'MONITORANDO'))));
  return {
    agent: { key: 'ayrton', name: 'Ayrton', role: 'Guardião da Conta', status, paused: !!settings.paused, last_scan_at: settings.last_scan_at || null },
    today, summary: { greeting: parts[0], headline, counts, priority, closer: cards.length ? voice.closer(`${today}:${user.id}`) : null },
    accounts: cards, normal_accounts: normal, ignored: ignored.map((a) => ({ ...slim(a), client_id: a.client_id, client_name: a.client_name, ignored_until: a.ignored_until, ignored_forever: a.ignored_forever })),
  };
}

// ---------------------------------------------------------------- detalhes, ações, histórico
function alertDetail(db, user, id, today, opts) {
  const a = db.prepare('SELECT a.*, c.name AS client_name, c.responsible_user_id FROM agent_alerts a JOIN clients c ON c.id = a.client_id WHERE a.id = ? AND a.agency_id = ? AND a.agent = ?').get(id, user.agency_id, AGENT);
  if (!a) return { code: 404, error: 'Alerta não encontrado.' };
  if (!opts.canAccess(user, a.client_id) || !opts.can(user, TYPE_PERMISSION[a.type] || 'alerts.view')) return { code: 403, error: 'Você não possui acesso a este alerta.' };
  const p = parse(a);
  const events = db.prepare('SELECT type, user_name, note, created_at FROM agent_alert_events WHERE alert_id = ? ORDER BY id').all(a.id);
  const users = new Map(db.prepare('SELECT id, name FROM users WHERE agency_id = ?').all(user.agency_id).map((u) => [u.id, u.name]));
  let related = []; try { related = JSON.parse(a.related_users_json || '[]'); } catch { /* ignore */ }
  return {
    alert: { ...slim(p), client_id: a.client_id, client_name: a.client_name, status: a.status, detected_at: a.detected_at, last_seen_at: a.last_seen_at, resolved_at: a.resolved_at, resolution: a.resolution, resolution_note: a.resolution_note, ignored_until: a.ignored_until, ignored_forever: !!a.ignored_forever, ai_insight: a.ai_insight || null, priority_score: a.score,
      why: p.evidence.why || [], data_used: p.evidence.items || [], related_users: related.map((i) => ({ id: i, name: users.get(i) })).filter((u) => u.name) },
    events,
  };
}

function ignoreAlert(db, user, id, mode, opts, today) {
  const a = db.prepare("SELECT * FROM agent_alerts WHERE id = ? AND agency_id = ? AND agent = ? AND status = 'open'").get(id, user.agency_id, AGENT);
  if (!a) return { code: 404, error: 'Alerta não encontrado.' };
  if (!opts.canAccess(user, a.client_id)) return { code: 403, error: 'Sem acesso a este cliente.' };
  const days = { tomorrow: 1, '3d': 3, '7d': 7 }[mode];
  if (!days && mode !== 'forever') return { code: 400, error: 'Escolha: até amanhã, 3 dias, 7 dias ou definitivamente.' };
  const until = days ? addDays(today, days) : null;
  db.prepare('UPDATE agent_alerts SET ignored_until = ?, ignored_forever = ?, ignored_level = ?, ignored_by_name = ?, ignored_at = datetime(\'now\') WHERE id = ?').run(until, days ? 0 : 1, a.level, user.name || null, a.id);
  logEvent(db, a, 'ignored', { user, note: days ? `Ignorado até ${until.split('-').reverse().join('/')}.` : 'Ignorado definitivamente (este caso).', data: { mode } });
  return { ok: true, ignored_until: until, forever: !days };
}

function unignoreAlert(db, user, id, opts) {
  const a = db.prepare("SELECT * FROM agent_alerts WHERE id = ? AND agency_id = ? AND agent = ? AND status = 'open'").get(id, user.agency_id, AGENT);
  if (!a) return { code: 404, error: 'Alerta não encontrado.' };
  if (!opts.canAccess(user, a.client_id)) return { code: 403, error: 'Sem acesso a este cliente.' };
  db.prepare('UPDATE agent_alerts SET ignored_until = NULL, ignored_forever = 0 WHERE id = ?').run(a.id);
  logEvent(db, a, 'reopened', { user, note: 'Voltou a ser acompanhado.' });
  return { ok: true };
}

function resolveManually(db, user, id, note, opts) {
  const a = db.prepare("SELECT * FROM agent_alerts WHERE id = ? AND agency_id = ? AND agent = ? AND status = 'open'").get(id, user.agency_id, AGENT);
  if (!a) return { code: 404, error: 'Alerta não encontrado.' };
  if (!opts.canAccess(user, a.client_id)) return { code: 403, error: 'Sem acesso a este cliente.' };
  db.prepare("UPDATE agent_alerts SET status = 'resolved', resolution = 'manual', resolved_at = datetime('now'), resolved_by_name = ?, resolution_note = ? WHERE id = ?").run(user.name || null, String(note || '').slice(0, 300) || 'Marcado como resolvido manualmente.', a.id);
  logEvent(db, a, 'resolved', { user, note: `Resolvido manualmente${note ? `: ${String(note).slice(0, 200)}` : '.'}`, data: { resolution: 'manual' } });
  return { ok: true };
}

function taskDraft(db, user, id, today, opts) {
  const d = alertDetail(db, user, id, today, opts);
  if (d.error) return d;
  const a = d.alert;
  const titles = {
    approval_stuck: `Revisar aprovações pendentes — ${a.client_name}`, task_overdue: `Destravar tarefas vencidas — ${a.client_name}`,
    approved_undated: `Definir datas de publicação — ${a.client_name}`, next_month_calendar: `${a.title} — ${a.client_name}`,
    recording_no_prep: `Preparar roteiro da gravação — ${a.client_name}`,
  };
  const list = a.data_used.slice(0, 8).map((i) => `• ${i.title}${i.detail ? ` — ${i.detail}` : ''}`).join('\n');
  const description = `${a.message}\n\n${list}\n\nOrigem: sugestão do Ayrton.\nAção recomendada: ${a.action}`;
  const respUser = db.prepare('SELECT responsible_user_id AS id FROM clients WHERE id = ?').get(a.client_id)?.id;
  const sug = new Map();
  for (const u of a.related_users) sug.set(u.id, u.name);
  const all = new Map(db.prepare('SELECT id, name FROM users WHERE agency_id = ?').all(user.agency_id).map((u) => [u.id, u.name]));
  if (respUser && all.has(respUser)) sug.set(respUser, all.get(respUser));
  return { draft: { client_id: a.client_id, title: titles[a.type] || a.title, description, priority: a.level === 'critical' ? 'high' : 'medium', due_date: addDays(today, a.level === 'critical' ? 1 : 3), suggested_assignees: [...sug.entries()].map(([id, name]) => ({ id, name })), origin: 'Sugestão do Ayrton' } };
}

function linkTask(db, user, id, taskId, opts) {
  const a = db.prepare("SELECT * FROM agent_alerts WHERE id = ? AND agency_id = ? AND agent = ?").get(id, user.agency_id, AGENT);
  if (!a) return { code: 404, error: 'Alerta não encontrado.' };
  if (!opts.canAccess(user, a.client_id)) return { code: 403, error: 'Sem acesso a este cliente.' };
  const t = db.prepare('SELECT id, title FROM tasks WHERE id = ? AND agency_id = ?').get(Number(taskId), user.agency_id);
  if (!t) return { code: 404, error: 'Tarefa não encontrada.' };
  db.prepare('UPDATE agent_alerts SET task_id = ? WHERE id = ?').run(t.id, a.id);
  logEvent(db, a, 'task_created', { user, note: `Tarefa criada a partir da sugestão: ${clip(t.title, 90)}.`, data: { task_id: t.id } });
  return { ok: true };
}

function history(db, user, { clientId = null, limit = 80 }, opts) {
  const rows = db.prepare(`
    SELECT e.id, e.alert_id, e.client_id, e.type, e.user_name, e.note, e.created_at, c.name AS client_name, a.type AS alert_type, a.level AS alert_level
    FROM agent_alert_events e JOIN agent_alerts a ON a.id = e.alert_id JOIN clients c ON c.id = e.client_id
    WHERE e.agency_id = ? AND e.agent = ? ${clientId ? 'AND e.client_id = ?' : ''} ORDER BY e.id DESC LIMIT 400
  `).all(user.agency_id, AGENT, ...(clientId ? [Number(clientId)] : []))
    .filter((e) => opts.canAccess(user, e.client_id) && opts.can(user, TYPE_PERMISSION[e.alert_type] || 'alerts.view'));
  return { events: rows.slice(0, limit).map((e) => ({ ...e, type_label: TYPE_LABEL[e.alert_type] })) };
}

function clientHealth(db, user, clientId, today, opts) {
  if (!opts.canAccess(user, clientId)) return { code: 403, error: 'Sem acesso a este cliente.' };
  const c = db.prepare("SELECT id, name FROM clients WHERE id = ? AND agency_id = ?").get(clientId, user.agency_id);
  if (!c) return { code: 404, error: 'Cliente não encontrado.' };
  const all = visibleAlerts(db, user, today, { ...opts, clientId }).filter((a) => !isIgnored(a, today));
  const level = all.reduce((m, a) => (LEVEL_RANK[a.level] > LEVEL_RANK[m] ? a.level : m), 'normal');
  const label = { critical: 'CRÍTICO', attention: 'ATENÇÃO', opportunity: 'ATENÇÃO', normal: 'NORMAL' }[level];
  const h = history(db, user, { clientId, limit: 10 }, opts);
  return { client: c, health: { level, label }, alerts: all.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]).map(slim), recent: h.events, quip: all.length ? null : voice.okAccount(`${today}:${clientId}`) };
}

function setPaused(db, agencyId, paused) {
  ensureSchema(db);
  db.prepare('INSERT INTO agent_settings (agency_id, agent, paused) VALUES (?,?,?) ON CONFLICT(agency_id, agent) DO UPDATE SET paused = excluded.paused').run(agencyId, AGENT, paused ? 1 : 0);
}

module.exports = { ensureSchema, scanAgency, ensureFresh, buildView, alertDetail, ignoreAlert, unignoreAlert, resolveManually, taskDraft, linkTask, history, clientHealth, setPaused, visibleAlerts, isIgnored, slim, TYPE_LABEL, TYPE_PERMISSION, LEVEL_RANK, detectAll, AGENT };
