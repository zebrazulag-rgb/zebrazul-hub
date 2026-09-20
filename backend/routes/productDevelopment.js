const express = require('express');
const db = require('../db/database');
const { hasPermission } = require('../services/permissions');

const router = express.Router();

const STATUSES = [
  'backlog',
  'analysis',
  'ready',
  'development',
  'testing',
  'awaiting_owner',
  'ready_production',
  'done',
];

const TYPES = new Set(['bug', 'improvement', 'feature', 'tech_debt']);
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const ENVIRONMENTS = new Set(['local', 'staging', 'production']);
const RELEASE_STATUSES = new Set(['draft', 'ready', 'production', 'rolled_back']);

const QA_CHECKS = [
  ['desktop', 'Desktop testado'],
  ['mobile', 'Mobile testado'],
  ['permissions', 'Permissões testadas'],
  ['client_profile', 'Perfil de cliente testado'],
  ['admin_profile', 'Perfil administrativo testado'],
  ['database_preserved', 'Banco e dados preservados'],
  ['regression', 'Regressão básica realizada'],
];

function requirePermission(key) {
  return (req, res, next) => {
    if (!hasPermission(req.user, key)) {
      return res.status(403).json({ error: 'Você não possui permissão para esta ação.' });
    }
    next();
  };
}

function requireProductMutation(req, res, next) {
  if (
    hasPermission(req.user, 'product.manage') ||
    hasPermission(req.user, 'product.qa') ||
    hasPermission(req.user, 'product.release')
  ) return next();
  return res.status(403).json({ error: 'Você não possui permissão para alterar Produto.' });
}

function isPlatformOwner(user) {
  return Number(user?.is_platform_owner) === 1 || user?.is_platform_owner === true;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeText(value, max = 20000) {
  return String(value || '').trim().slice(0, max);
}

function detectHighRisk(moduleName, affectedFiles) {
  const source = `${moduleName || ''}\n${affectedFiles || ''}`.toLowerCase();
  const patterns = [
    'server.js',
    'database.js',
    'permissions.js',
    'auth',
    'finance',
    'financeiro',
    'oauth',
    'railway',
    'deploy',
    'infra',
    'migration',
    'migração',
    'pagamento',
    'payment',
    'segurança',
    'security',
  ];
  return patterns.some((pattern) => source.includes(pattern)) ? 1 : 0;
}

function itemRowSql(where = '') {
  return `
    SELECT
      i.*,
      assignee.name AS assignee_name,
      requester.name AS requester_name,
      approver.name AS approved_by_name,
      COALESCE((
        SELECT COUNT(*) FROM product_qa_checks q
        WHERE q.item_id = i.id
      ), 0) AS qa_total,
      COALESCE((
        SELECT COUNT(*) FROM product_qa_checks q
        WHERE q.item_id = i.id AND q.checked = 1
      ), 0) AS qa_checked,
      COALESCE((
        SELECT COUNT(*) FROM product_release_items pri
        WHERE pri.item_id = i.id
      ), 0) AS releases_count
    FROM product_items i
    LEFT JOIN users assignee ON assignee.id = i.assignee_id
    LEFT JOIN users requester ON requester.id = i.requester_id
    LEFT JOIN users approver ON approver.id = i.approved_by
    ${where}
  `;
}

function getItem(agencyId, id) {
  const item = db.prepare(`${itemRowSql('WHERE i.agency_id = ? AND i.id = ?')} LIMIT 1`).get(agencyId, id);
  if (!item) return null;
  item.qa = db.prepare(`
    SELECT q.*, u.name AS checked_by_name
    FROM product_qa_checks q
    LEFT JOIN users u ON u.id = q.checked_by
    WHERE q.item_id = ?
    ORDER BY q.id
  `).all(id);
  item.events = db.prepare(`
    SELECT e.*, u.name AS user_name
    FROM product_item_events e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.item_id = ?
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 40
  `).all(id);
  return item;
}

function addEvent(itemId, userId, type, message = '', data = {}) {
  db.prepare(`
    INSERT INTO product_item_events (item_id, user_id, event_type, message, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(itemId, userId || null, type, normalizeText(message, 4000), JSON.stringify(data || {}));
}

function seedQa(itemId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO product_qa_checks (item_id, check_key, label, checked)
    VALUES (?, ?, ?, 0)
  `);
  QA_CHECKS.forEach(([key, label]) => insert.run(itemId, key, label));
}

function allQaChecked(itemId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN checked = 1 THEN 1 ELSE 0 END) AS checked
    FROM product_qa_checks
    WHERE item_id = ?
  `).get(itemId);
  return Number(row?.total || 0) > 0 && Number(row?.total || 0) === Number(row?.checked || 0);
}

function usersForAgency(agencyId) {
  return db.prepare(`
    SELECT
      id, name, email, role, is_platform_owner, is_agency_owner,
      is_operations_head, is_commercial_team
    FROM users
    WHERE agency_id = ? AND role <> 'client'
    ORDER BY name COLLATE NOCASE
  `).all(agencyId);
}

router.use((req, res, next) => {
  if (req.user?.role === 'client') {
    return res.status(403).json({ error: 'Produto / Desenvolvimento é uma área interna da agência.' });
  }
  next();
});
router.use(requirePermission('product.view'));

router.get('/dashboard', (req, res) => {
  const agencyId = req.user.agency_id;
  const statsRow = db.prepare(`
    SELECT
      SUM(CASE WHEN status <> 'done' THEN 1 ELSE 0 END) AS total_open,
      SUM(CASE WHEN priority = 'critical' AND status <> 'done' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN status = 'development' THEN 1 ELSE 0 END) AS development,
      SUM(CASE WHEN status = 'testing' THEN 1 ELSE 0 END) AS testing,
      SUM(CASE WHEN status = 'awaiting_owner' THEN 1 ELSE 0 END) AS awaiting_owner,
      SUM(CASE WHEN status = 'ready_production' THEN 1 ELSE 0 END) AS ready_production,
      SUM(CASE WHEN status = 'done' AND substr(COALESCE(published_at, updated_at), 1, 7) = substr(date('now'), 1, 7) THEN 1 ELSE 0 END) AS delivered_month,
      SUM(CASE WHEN blocked_reason IS NOT NULL AND trim(blocked_reason) <> '' AND status <> 'done' THEN 1 ELSE 0 END) AS blocked
    FROM product_items
    WHERE agency_id = ? AND archived_at IS NULL
  `).get(agencyId);

  const priority = db.prepare(`
    ${itemRowSql(`
      WHERE i.agency_id = ?
        AND i.archived_at IS NULL
        AND i.status <> 'done'
        AND (
          i.priority = 'critical'
          OR (i.blocked_reason IS NOT NULL AND trim(i.blocked_reason) <> '')
          OR i.high_risk = 1
        )
    `)}
    ORDER BY
      CASE WHEN i.priority = 'critical' THEN 0 ELSE 1 END,
      CASE WHEN i.blocked_reason IS NOT NULL AND trim(i.blocked_reason) <> '' THEN 0 ELSE 1 END,
      i.high_risk DESC,
      i.updated_at DESC
    LIMIT 8
  `).all(agencyId);

  const recentReleases = db.prepare(`
    SELECT r.*, u.name AS created_by_name, a.name AS approved_by_name,
      COALESCE((SELECT COUNT(*) FROM product_release_items ri WHERE ri.release_id = r.id), 0) AS items_count
    FROM product_releases r
    LEFT JOIN users u ON u.id = r.created_by
    LEFT JOIN users a ON a.id = r.approved_by
    WHERE r.agency_id = ?
    ORDER BY COALESCE(r.deployed_at, r.updated_at) DESC, r.id DESC
    LIMIT 5
  `).all(agencyId);

  res.json({
    stats: {
      total_open: Number(statsRow?.total_open || 0),
      critical: Number(statsRow?.critical || 0),
      development: Number(statsRow?.development || 0),
      testing: Number(statsRow?.testing || 0),
      awaiting_owner: Number(statsRow?.awaiting_owner || 0),
      ready_production: Number(statsRow?.ready_production || 0),
      delivered_month: Number(statsRow?.delivered_month || 0),
      blocked: Number(statsRow?.blocked || 0),
    },
    priority,
    recent_releases: recentReleases,
    users: usersForAgency(agencyId),
    can_approve_production: isPlatformOwner(req.user) && hasPermission(req.user, 'product.release'),
  });
});

router.get('/items', (req, res) => {
  const agencyId = req.user.agency_id;
  const status = normalizeText(req.query.status, 40);
  const search = normalizeText(req.query.search, 200);
  const type = normalizeText(req.query.type, 40);
  const priority = normalizeText(req.query.priority, 40);
  const assigneeId = numberOrNull(req.query.assignee_id);

  const clauses = ['i.agency_id = ?', 'i.archived_at IS NULL'];
  const params = [agencyId];

  if (status && STATUSES.includes(status)) {
    clauses.push('i.status = ?');
    params.push(status);
  }
  if (type && TYPES.has(type)) {
    clauses.push('i.type = ?');
    params.push(type);
  }
  if (priority && PRIORITIES.has(priority)) {
    clauses.push('i.priority = ?');
    params.push(priority);
  }
  if (assigneeId) {
    clauses.push('i.assignee_id = ?');
    params.push(assigneeId);
  }
  if (search) {
    clauses.push(`(
      i.title LIKE ?
      OR i.module LIKE ?
      OR i.problem LIKE ?
      OR i.expected_behavior LIKE ?
    )`);
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const items = db.prepare(`
    ${itemRowSql(`WHERE ${clauses.join(' AND ')}`)}
    ORDER BY
      CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      i.sort_order ASC,
      i.updated_at DESC
    LIMIT 600
  `).all(...params);

  res.json({ items });
});

router.get('/items/:id', (req, res) => {
  const item = getItem(req.user.agency_id, Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Demanda não encontrada.' });
  res.json({ item });
});

router.post('/items', requirePermission('product.create'), (req, res) => {
  const title = normalizeText(req.body.title, 300);
  if (!title) return res.status(400).json({ error: 'Informe o título da demanda.' });

  const type = TYPES.has(req.body.type) ? req.body.type : 'improvement';
  const priority = PRIORITIES.has(req.body.priority) ? req.body.priority : 'medium';
  const environment = ENVIRONMENTS.has(req.body.environment) ? req.body.environment : 'local';
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'backlog';
  const affectedFiles = normalizeText(req.body.affected_files, 12000);
  const moduleName = normalizeText(req.body.module, 120);
  const highRisk = detectHighRisk(moduleName, affectedFiles);

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO product_items (
        agency_id, title, type, priority, module,
        problem, current_behavior, expected_behavior, proposed_solution,
        acceptance_criteria, status, assignee_id, requester_id, due_date,
        origin_url, links_text, affected_files, environment, branch_name,
        commit_ref, pr_url, testing_notes, blocked_reason, high_risk
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.agency_id,
      title,
      type,
      priority,
      moduleName,
      normalizeText(req.body.problem),
      normalizeText(req.body.current_behavior),
      normalizeText(req.body.expected_behavior),
      normalizeText(req.body.proposed_solution),
      normalizeText(req.body.acceptance_criteria),
      status,
      numberOrNull(req.body.assignee_id),
      req.user.id,
      normalizeText(req.body.due_date, 20) || null,
      normalizeText(req.body.origin_url, 1000),
      normalizeText(req.body.links_text, 12000),
      affectedFiles,
      environment,
      normalizeText(req.body.branch_name, 300),
      normalizeText(req.body.commit_ref, 300),
      normalizeText(req.body.pr_url, 1000),
      normalizeText(req.body.testing_notes, 12000),
      normalizeText(req.body.blocked_reason, 4000),
      highRisk
    );
    const id = Number(info.lastInsertRowid);
    seedQa(id);
    addEvent(id, req.user.id, 'created', 'Demanda criada.', { status, priority, type });
    return id;
  });

  const id = create();
  res.status(201).json({ id, item: getItem(req.user.agency_id, id) });
});

router.put('/items/:id', requirePermission('product.manage'), (req, res) => {
  const id = Number(req.params.id);
  const existing = getItem(req.user.agency_id, id);
  if (!existing) return res.status(404).json({ error: 'Demanda não encontrada.' });

  const fields = [
    'title', 'type', 'priority', 'module',
    'problem', 'current_behavior', 'expected_behavior', 'proposed_solution',
    'acceptance_criteria', 'assignee_id', 'due_date', 'origin_url',
    'links_text', 'affected_files', 'environment', 'branch_name',
    'commit_ref', 'pr_url', 'testing_notes', 'blocked_reason',
  ];

  const next = { ...existing };
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) next[field] = req.body[field];
  });

  const title = normalizeText(next.title, 300);
  if (!title) return res.status(400).json({ error: 'Informe o título da demanda.' });

  const type = TYPES.has(next.type) ? next.type : existing.type;
  const priority = PRIORITIES.has(next.priority) ? next.priority : existing.priority;
  const environment = ENVIRONMENTS.has(next.environment) ? next.environment : existing.environment;
  const affectedFiles = normalizeText(next.affected_files, 12000);
  const moduleName = normalizeText(next.module, 120);
  const highRisk = detectHighRisk(moduleName, affectedFiles);

  db.prepare(`
    UPDATE product_items SET
      title = ?, type = ?, priority = ?, module = ?,
      problem = ?, current_behavior = ?, expected_behavior = ?, proposed_solution = ?,
      acceptance_criteria = ?, assignee_id = ?, due_date = ?, origin_url = ?,
      links_text = ?, affected_files = ?, environment = ?, branch_name = ?,
      commit_ref = ?, pr_url = ?, testing_notes = ?, blocked_reason = ?,
      high_risk = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    title,
    type,
    priority,
    moduleName,
    normalizeText(next.problem),
    normalizeText(next.current_behavior),
    normalizeText(next.expected_behavior),
    normalizeText(next.proposed_solution),
    normalizeText(next.acceptance_criteria),
    numberOrNull(next.assignee_id),
    normalizeText(next.due_date, 20) || null,
    normalizeText(next.origin_url, 1000),
    normalizeText(next.links_text, 12000),
    affectedFiles,
    environment,
    normalizeText(next.branch_name, 300),
    normalizeText(next.commit_ref, 300),
    normalizeText(next.pr_url, 1000),
    normalizeText(next.testing_notes, 12000),
    normalizeText(next.blocked_reason, 4000),
    highRisk,
    id,
    req.user.agency_id
  );

  addEvent(id, req.user.id, 'updated', 'Dados da demanda atualizados.');
  res.json({ item: getItem(req.user.agency_id, id) });
});

router.post('/items/:id/status', requirePermission('product.manage'), (req, res) => {
  const id = Number(req.params.id);
  const status = normalizeText(req.body.status, 50);
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

  const existing = getItem(req.user.agency_id, id);
  if (!existing) return res.status(404).json({ error: 'Demanda não encontrada.' });

  if (status === 'awaiting_owner' && !allQaChecked(id)) {
    return res.status(400).json({
      error: 'Conclua todo o checklist de QA antes de enviar para Aguardando Arthur.',
      code: 'QA_INCOMPLETE',
    });
  }

  if (status === 'ready_production') {
    return res.status(400).json({ error: 'Use a aprovação do proprietário para liberar esta demanda para produção.' });
  }

  if (status === 'done' && !isPlatformOwner(req.user)) {
    return res.status(403).json({ error: 'Somente o Super Administrador pode concluir uma demanda sem um deploy registrado.' });
  }

  const publishedAt = status === 'done' ? "datetime('now')" : 'published_at';
  db.prepare(`
    UPDATE product_items
    SET status = ?, updated_at = datetime('now'), published_at = ${publishedAt}
    WHERE id = ? AND agency_id = ?
  `).run(status, id, req.user.agency_id);

  addEvent(id, req.user.id, 'status', `Status alterado para ${status}.`, { from: existing.status, to: status });
  res.json({ item: getItem(req.user.agency_id, id) });
});

router.put('/items/:id/qa/:checkKey', requirePermission('product.qa'), (req, res) => {
  const id = Number(req.params.id);
  const checkKey = normalizeText(req.params.checkKey, 80);
  const item = getItem(req.user.agency_id, id);
  if (!item) return res.status(404).json({ error: 'Demanda não encontrada.' });

  if (!QA_CHECKS.some(([key]) => key === checkKey)) {
    return res.status(400).json({ error: 'Item de QA inválido.' });
  }

  const checked = Boolean(req.body.checked);
  db.prepare(`
    UPDATE product_qa_checks
    SET checked = ?, checked_by = ?, checked_at = ?, updated_at = datetime('now')
    WHERE item_id = ? AND check_key = ?
  `).run(
    checked ? 1 : 0,
    checked ? req.user.id : null,
    checked ? new Date().toISOString() : null,
    id,
    checkKey
  );

  addEvent(id, req.user.id, 'qa', `${checked ? 'Concluiu' : 'Reabriu'}: ${checkKey}.`);
  res.json({ item: getItem(req.user.agency_id, id) });
});

router.post('/items/:id/approve', requirePermission('product.release'), (req, res) => {
  if (!isPlatformOwner(req.user)) {
    return res.status(403).json({ error: 'A aprovação para produção é exclusiva do Super Administrador.' });
  }

  const id = Number(req.params.id);
  const item = getItem(req.user.agency_id, id);
  if (!item) return res.status(404).json({ error: 'Demanda não encontrada.' });
  if (item.status !== 'awaiting_owner') {
    return res.status(400).json({ error: 'A demanda precisa estar em Aguardando Arthur para ser aprovada.' });
  }
  if (!allQaChecked(id)) {
    return res.status(400).json({ error: 'O checklist de QA ainda não está completo.' });
  }

  db.prepare(`
    UPDATE product_items
    SET status = 'ready_production',
        approved_by = ?,
        approved_at = datetime('now'),
        rejection_notes = NULL,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(req.user.id, id, req.user.agency_id);

  addEvent(id, req.user.id, 'approved', 'Aprovado por Arthur para produção.');
  res.json({ item: getItem(req.user.agency_id, id) });
});

router.post('/items/:id/request-changes', requirePermission('product.release'), (req, res) => {
  if (!isPlatformOwner(req.user)) {
    return res.status(403).json({ error: 'A validação final é exclusiva do Super Administrador.' });
  }

  const id = Number(req.params.id);
  const item = getItem(req.user.agency_id, id);
  if (!item) return res.status(404).json({ error: 'Demanda não encontrada.' });

  const notes = normalizeText(req.body.notes, 6000);
  db.prepare(`
    UPDATE product_items
    SET status = 'development',
        rejection_notes = ?,
        approved_by = NULL,
        approved_at = NULL,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(notes, id, req.user.agency_id);

  addEvent(id, req.user.id, 'changes_requested', notes || 'Ajustes solicitados.');
  res.json({ item: getItem(req.user.agency_id, id) });
});

router.delete('/items/:id', requirePermission('product.manage'), (req, res) => {
  const id = Number(req.params.id);
  const item = getItem(req.user.agency_id, id);
  if (!item) return res.status(404).json({ error: 'Demanda não encontrada.' });
  db.prepare(`
    UPDATE product_items
    SET archived_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(id, req.user.agency_id);
  addEvent(id, req.user.id, 'archived', 'Demanda arquivada.');
  res.json({ ok: true });
});

router.get('/releases', (req, res) => {
  const releases = db.prepare(`
    SELECT
      r.*,
      creator.name AS created_by_name,
      approver.name AS approved_by_name,
      deployer.name AS deployed_by_name,
      COALESCE((
        SELECT COUNT(*) FROM product_release_items ri WHERE ri.release_id = r.id
      ), 0) AS items_count
    FROM product_releases r
    LEFT JOIN users creator ON creator.id = r.created_by
    LEFT JOIN users approver ON approver.id = r.approved_by
    LEFT JOIN users deployer ON deployer.id = r.deployed_by
    WHERE r.agency_id = ?
    ORDER BY COALESCE(r.deployed_at, r.updated_at) DESC, r.id DESC
    LIMIT 100
  `).all(req.user.agency_id);

  const itemRows = db.prepare(`
    SELECT ri.release_id, i.id, i.title, i.type, i.priority, i.status
    FROM product_release_items ri
    JOIN product_items i ON i.id = ri.item_id
    JOIN product_releases r ON r.id = ri.release_id
    WHERE r.agency_id = ?
    ORDER BY i.id
  `).all(req.user.agency_id);

  const byRelease = {};
  itemRows.forEach((row) => {
    if (!byRelease[row.release_id]) byRelease[row.release_id] = [];
    byRelease[row.release_id].push(row);
  });

  releases.forEach((release) => {
    release.items = byRelease[release.id] || [];
  });

  res.json({ releases });
});

router.post('/releases', requirePermission('product.manage'), (req, res) => {
  const version = normalizeText(req.body.version, 120);
  if (!version) return res.status(400).json({ error: 'Informe a versão da release.' });

  const itemIds = Array.isArray(req.body.item_ids)
    ? [...new Set(req.body.item_ids.map(Number).filter(Boolean))]
    : [];

  const validItems = itemIds.length
    ? db.prepare(`
        SELECT id, status
        FROM product_items
        WHERE agency_id = ? AND archived_at IS NULL AND id IN (${itemIds.map(() => '?').join(',')})
      `).all(req.user.agency_id, ...itemIds)
    : [];

  if (validItems.some((item) => item.status !== 'ready_production')) {
    return res.status(400).json({ error: 'Uma release só pode incluir demandas aprovadas e prontas para produção.' });
  }

  try {
    const create = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO product_releases (
          agency_id, version, title, status, notes, files_changed,
          migration_required, env_vars, rollback_plan, created_by
        ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.agency_id,
        version,
        normalizeText(req.body.title, 300) || version,
        normalizeText(req.body.notes, 12000),
        normalizeText(req.body.files_changed, 12000),
        req.body.migration_required ? 1 : 0,
        normalizeText(req.body.env_vars, 12000),
        normalizeText(req.body.rollback_plan, 12000),
        req.user.id
      );
      const releaseId = Number(info.lastInsertRowid);
      const link = db.prepare(`
        INSERT INTO product_release_items (release_id, item_id)
        VALUES (?, ?)
      `);
      validItems.forEach((item) => link.run(releaseId, item.id));
      return releaseId;
    });

    const id = create();
    res.status(201).json({ id });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'Já existe uma release com essa versão.' });
    }
    throw error;
  }
});

router.put('/releases/:id', requirePermission('product.manage'), (req, res) => {
  const id = Number(req.params.id);
  const release = db.prepare('SELECT * FROM product_releases WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
  if (!release) return res.status(404).json({ error: 'Release não encontrada.' });
  if (release.status === 'production') return res.status(400).json({ error: 'Uma release já publicada não pode ser editada.' });

  const status = RELEASE_STATUSES.has(req.body.status) ? req.body.status : release.status;
  db.prepare(`
    UPDATE product_releases SET
      version = ?, title = ?, status = ?, notes = ?, files_changed = ?,
      migration_required = ?, env_vars = ?, rollback_plan = ?,
      updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(
    normalizeText(req.body.version, 120) || release.version,
    normalizeText(req.body.title, 300) || release.title,
    status,
    normalizeText(req.body.notes, 12000),
    normalizeText(req.body.files_changed, 12000),
    req.body.migration_required ? 1 : 0,
    normalizeText(req.body.env_vars, 12000),
    normalizeText(req.body.rollback_plan, 12000),
    id,
    req.user.agency_id
  );

  res.json({ ok: true });
});

router.post('/releases/:id/deploy', requirePermission('product.release'), (req, res) => {
  if (!isPlatformOwner(req.user)) {
    return res.status(403).json({ error: 'Somente o Super Administrador pode confirmar um deploy em produção.' });
  }

  const id = Number(req.params.id);
  const release = db.prepare('SELECT * FROM product_releases WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
  if (!release) return res.status(404).json({ error: 'Release não encontrada.' });

  const items = db.prepare(`
    SELECT i.id, i.status
    FROM product_release_items ri
    JOIN product_items i ON i.id = ri.item_id
    WHERE ri.release_id = ? AND i.agency_id = ?
  `).all(id, req.user.agency_id);

  if (items.some((item) => item.status !== 'ready_production')) {
    return res.status(400).json({ error: 'Todas as demandas da release precisam estar prontas para produção.' });
  }

  const deploy = db.transaction(() => {
    db.prepare(`
      UPDATE product_releases
      SET status = 'production',
          approved_by = ?,
          approved_at = COALESCE(approved_at, datetime('now')),
          deployed_by = ?,
          deployed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(req.user.id, req.user.id, id, req.user.agency_id);

    const updateItem = db.prepare(`
      UPDATE product_items
      SET status = 'done',
          published_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `);
    items.forEach((item) => {
      updateItem.run(item.id, req.user.agency_id);
      addEvent(item.id, req.user.id, 'deployed', `Publicado na release ${release.version}.`, { release_id: id });
    });
  });

  deploy();
  res.json({ ok: true });
});

router.post('/releases/:id/rollback', requirePermission('product.release'), (req, res) => {
  if (!isPlatformOwner(req.user)) {
    return res.status(403).json({ error: 'Somente o Super Administrador pode registrar rollback.' });
  }
  const id = Number(req.params.id);
  const release = db.prepare('SELECT * FROM product_releases WHERE id = ? AND agency_id = ?').get(id, req.user.agency_id);
  if (!release) return res.status(404).json({ error: 'Release não encontrada.' });

  db.prepare(`
    UPDATE product_releases
    SET status = 'rolled_back',
        rollback_plan = CASE
          WHEN ? <> '' THEN ?
          ELSE rollback_plan
        END,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(normalizeText(req.body.notes, 12000), normalizeText(req.body.notes, 12000), id, req.user.agency_id);

  res.json({ ok: true });
});

module.exports = router;
