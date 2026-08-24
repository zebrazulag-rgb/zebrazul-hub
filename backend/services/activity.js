const db = require('../db/database');

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'token', 'access_token', 'refresh_token', 'secret', 'app_secret',
  'client_secret', 'credential', 'credentials', 'password_value', 'encrypted_password', 'api_key',
  'authorization', 'cookie', 'media_data', 'attachment_data', 'avatar_data', 'cover_data', 'logo_data',
]);

const MODULE_LABELS = {
  tasks: 'Tarefas',
  posts: 'Social Media',
  social: 'Social Media',
  commercial: 'Comercial',
  clients: 'Clientes',
  highlights: 'Destaques',
  materials: 'Materiais',
  finance: 'Financeiro',
  permissions: 'Permissões',
  users: 'Usuários',
  compass: 'Bússola',
  reenrollments: 'Rematrículas',
  reports: 'Relatórios',
  credentials: 'Senhas',
  system: 'Sistema',
  auth: 'Acesso',
};

function safeJson(value) {
  try { return JSON.stringify(value ?? {}); } catch { return '{}'; }
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sanitizeValue(value, depth = 0) {
  if (depth > 3) return '[resumido]';
  if (Array.isArray(value)) {
    if (value.length > 20) return [...value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1)), `+${value.length - 20} item(ns)`];
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      const normalized = String(key).toLowerCase();
      if (SENSITIVE_KEYS.has(normalized) || normalized.includes('password') || normalized.includes('secret') || normalized.includes('token')) return;
      result[key] = sanitizeValue(item, depth + 1);
    });
    return result;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function summarizeRequest(body) {
  if (!body || typeof body !== 'object') return {};
  const summary = { fields: [] };
  const allowedValues = new Set([
    'status', 'priority', 'stage', 'stage_key', 'due_date', 'scheduled_at', 'client_id', 'clientId',
    'assignee_id', 'owner_user_id', 'responsible_user_id', 'visible', 'feed_visible', 'name', 'title',
    'project_name', 'front_name', 'default_stage_key', 'default_priority', 'default_segment',
  ]);
  Object.entries(body).forEach(([key, value]) => {
    const normalized = String(key).toLowerCase();
    if (SENSITIVE_KEYS.has(normalized) || normalized.includes('password') || normalized.includes('secret') || normalized.includes('token') || normalized.includes('data')) return;
    summary.fields.push(key);
    if (allowedValues.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null)) {
      summary[key] = typeof value === 'string' ? value.slice(0, 180) : value;
    }
    if (Array.isArray(value)) summary[`${key}_count`] = value.length;
  });
  summary.fields = summary.fields.slice(0, 40);
  return summary;
}

function summarizeResponse(body) {
  if (!body || typeof body !== 'object') return {};
  const summary = {};
  ['id', 'created', 'updated', 'ignored', 'failed', 'total', 'count', 'ok'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key) && ['string', 'number', 'boolean'].includes(typeof body[key])) summary[key] = body[key];
  });
  if (Array.isArray(body.errors)) summary.errors_count = body.errors.length;
  if (Array.isArray(body.results)) summary.results_count = body.results.length;
  return summary;
}

function normalizePath(path) {
  return String(path || '').split('?')[0] || '/';
}

function pathParts(path) {
  return normalizePath(path).split('/').filter(Boolean);
}

function numericPart(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function routeContext(req) {
  const path = normalizePath(req.path);
  const parts = pathParts(path);
  const method = String(req.method || 'GET').toUpperCase();
  let module = parts[0] || 'system';
  let entityType = module;
  let entityId = null;
  let action = method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated';
  let summary = method === 'POST' ? 'Criou um registro' : method === 'DELETE' ? 'Excluiu um registro' : 'Atualizou um registro';

  if (module === 'tasks') {
    entityType = 'task';
    entityId = numericPart(parts[1]);
    if (path.includes('/import')) { action = 'imported'; summary = 'Importou tarefas por CSV'; }
    else if (path.includes('/status')) { action = 'status_changed'; summary = 'Alterou o status de uma tarefa'; }
    else if (path.includes('/assignee') || path.includes('/responsible')) { action = 'assignee_changed'; summary = 'Alterou o responsável de uma tarefa'; }
    else if (method === 'POST') summary = 'Criou uma tarefa';
    else if (method === 'DELETE') summary = 'Excluiu uma tarefa';
    else summary = 'Atualizou uma tarefa';
  } else if (module === 'posts') {
    entityType = 'post';
    entityId = numericPart(parts[1]);
    if (path.includes('/share')) { action = 'shared'; summary = 'Gerou ou atualizou um link do Feed'; }
    else if (path.includes('/feed-visible')) { action = 'visibility_changed'; summary = 'Alterou a visibilidade de uma publicação'; }
    else if (method === 'POST') summary = 'Criou uma publicação';
    else if (method === 'DELETE') summary = 'Excluiu uma publicação';
    else summary = 'Atualizou uma publicação';
  } else if (module === 'commercial') {
    entityType = path.includes('/leads') ? 'lead' : 'commercial';
    const leadIndex = parts.indexOf('leads');
    if (leadIndex >= 0) entityId = numericPart(parts[leadIndex + 1]);
    if (path.includes('/import')) { action = 'imported'; summary = 'Importou leads no Comercial'; }
    else if (path.includes('/stages')) { entityType = 'pipeline_stage'; summary = method === 'POST' ? 'Criou uma etapa do pipeline' : method === 'DELETE' ? 'Excluiu uma etapa do pipeline' : 'Alterou uma etapa do pipeline'; }
    else if (path.includes('/segments') || path.includes('/niches')) { entityType = 'commercial_segment'; summary = 'Alterou nichos do Comercial'; }
    else if (method === 'POST') summary = 'Criou uma oportunidade comercial';
    else if (method === 'DELETE') summary = 'Excluiu uma oportunidade comercial';
    else summary = 'Atualizou uma oportunidade comercial';
  } else if (module === 'clients') {
    const clientId = numericPart(parts[1]);
    entityId = clientId;
    entityType = 'client';
    if (path.includes('/feed-highlights')) {
      module = 'highlights';
      entityType = 'highlight';
      const idx = parts.indexOf('feed-highlights');
      entityId = numericPart(parts[idx + 1]);
      if (method === 'POST') summary = 'Criou um destaque do Feed';
      else if (method === 'DELETE') summary = 'Excluiu um destaque do Feed';
      else summary = 'Atualizou um destaque do Feed';
    } else if (path.includes('/feed-profile')) {
      module = 'social';
      entityType = 'feed_profile';
      summary = 'Atualizou o perfil visual do Feed';
    } else if (path.includes('/social-media-share')) {
      module = 'social';
      entityType = 'social_media_link';
      summary = 'Atualizou o LINK SOCIAL MEDIA';
    } else if (method === 'POST') summary = 'Criou um cliente';
    else if (method === 'DELETE') summary = 'Excluiu um cliente';
    else summary = 'Atualizou um cliente';
  } else if (module === 'permissions') {
    entityType = 'permission';
    module = 'permissions';
    if (path.includes('/roles') && method === 'POST') summary = 'Criou um cargo';
    else if (path.includes('/roles') && method === 'DELETE') summary = 'Excluiu um cargo';
    else if (path.includes('/owner-only')) summary = 'Alterou a visibilidade de uma permissão';
    else summary = 'Alterou cargos ou permissões';
  } else if (module === 'materials' || module === 'material-boards') {
    module = 'materials'; entityType = 'material'; entityId = numericPart(parts[1]);
    summary = method === 'POST' ? 'Criou um material' : method === 'DELETE' ? 'Excluiu um material' : 'Atualizou um material';
  } else if (module === 'finance') {
    module = 'finance'; entityType = 'finance_entry'; entityId = numericPart(parts[1]);
    summary = method === 'POST' ? 'Criou um lançamento financeiro' : method === 'DELETE' ? 'Excluiu um lançamento financeiro' : 'Atualizou um lançamento financeiro';
  } else if (module === 'credentials') {
    module = 'credentials'; entityType = 'credential'; entityId = numericPart(parts[1]);
    summary = method === 'POST' ? 'Cadastrou uma credencial no cofre' : method === 'DELETE' ? 'Excluiu uma credencial do cofre' : 'Atualizou uma credencial do cofre';
  } else if (module === 'reenrollments') {
    module = 'reenrollments'; entityType = 'reenrollment'; entityId = numericPart(parts[1]);
    summary = method === 'POST' ? 'Criou um registro de rematrícula' : method === 'DELETE' ? 'Excluiu um registro de rematrícula' : 'Atualizou uma rematrícula';
  } else if (['diagnostics', 'action-plans', 'planning-documents', 'bee-campaign-briefing'].includes(module)) {
    module = 'compass'; entityType = 'strategic_item'; entityId = numericPart(parts[1]);
    summary = 'Atualizou conteúdo estratégico da Bússola';
  } else if (['meta', 'meta-organic', 'instagram-stories', 'feed-intelligence'].includes(module)) {
    const sourceModule = module;
    module = 'social'; entityType = 'social_operation';
    if (path.includes('sync')) summary = 'Sincronizou dados de Social Media';
    else if (sourceModule === 'feed-intelligence') summary = 'Executou análise de capas';
    else summary = 'Atualizou uma integração de Social Media';
  } else if (module === 'reports') {
    module = 'reports'; entityType = 'report'; summary = 'Atualizou dados de relatório';
  }

  return { path, method, module, entityType, entityId, action, summary };
}

function snapshotEntity(context, agencyId) {
  const id = numericPart(context.entityId);
  if (!id || !agencyId) return null;
  try {
    if (context.entityType === 'task') {
      return db.prepare(`SELECT id, client_id, title, status, assignee_id, due_date, priority, project_name, front_name FROM tasks WHERE id = ? AND agency_id = ?`).get(id, agencyId) || null;
    }
    if (context.entityType === 'post') {
      return db.prepare(`SELECT id, client_id, title, status, scheduled_at, feed_visible, content_type FROM posts WHERE id = ? AND agency_id = ?`).get(id, agencyId) || null;
    }
    if (context.entityType === 'lead') {
      return db.prepare(`SELECT id, client_id, company_name, contact_name, stage_key, owner_user_id, priority, next_action, next_action_date FROM commercial_leads WHERE id = ? AND agency_id = ?`).get(id, agencyId) || null;
    }
    if (context.entityType === 'highlight') {
      return db.prepare(`SELECT id, client_id, name, sort_order, visible FROM feed_highlights WHERE id = ? AND agency_id = ?`).get(id, agencyId) || null;
    }
    if (context.entityType === 'client') {
      return db.prepare(`SELECT id, name, segment, status, responsible_user_id FROM clients WHERE id = ? AND agency_id = ?`).get(id, agencyId) || null;
    }
  } catch (error) {
    console.warn('[ACTIVITY] Não foi possível capturar estado anterior:', error.message);
  }
  return null;
}

const CHANGE_LABELS = {
  status: 'Status',
  assignee_id: 'Responsável',
  due_date: 'Prazo',
  priority: 'Prioridade',
  scheduled_at: 'Data de postagem',
  feed_visible: 'Visibilidade no Feed',
  stage_key: 'Etapa',
  owner_user_id: 'Responsável',
  next_action: 'Próxima ação',
  next_action_date: 'Data da próxima ação',
  visible: 'Visibilidade',
  sort_order: 'Ordem',
  name: 'Nome',
  segment: 'Segmento',
  responsible_user_id: 'Responsável',
};

function displayUser(id, agencyId) {
  if (!id) return 'Sem responsável';
  const user = db.prepare('SELECT name FROM users WHERE id = ? AND agency_id = ?').get(Number(id), Number(agencyId));
  return user?.name || `Usuário #${id}`;
}

function displayValue(field, value, agencyId) {
  if (['assignee_id', 'owner_user_id', 'responsible_user_id'].includes(field)) return displayUser(value, agencyId);
  if (field === 'feed_visible' || field === 'visible') return Number(value) === 1 || value === true ? 'Visível' : 'Oculto';
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status') {
    const labels = { pending: 'Pendente', in_progress: 'Em andamento', done: 'Concluída', posted: 'Postado', draft: 'Rascunho', pending_approval: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Reprovado', scheduled: 'Agendado', published: 'Publicado' };
    return labels[String(value)] || String(value);
  }
  if (field === 'priority') {
    const labels = { low: 'Baixa', medium: 'Média', high: 'Alta' };
    return labels[String(value)] || String(value);
  }
  return String(value);
}

function diffSnapshots(before, after, agencyId) {
  if (!before || !after) return [];
  return Object.keys(CHANGE_LABELS).flatMap((field) => {
    if (!Object.prototype.hasOwnProperty.call(before, field) || !Object.prototype.hasOwnProperty.call(after, field)) return [];
    const left = before[field] ?? null;
    const right = after[field] ?? null;
    if (String(left ?? '') === String(right ?? '')) return [];
    return [{
      field,
      label: CHANGE_LABELS[field],
      from: displayValue(field, left, agencyId),
      to: displayValue(field, right, agencyId),
    }];
  });
}

function resolveClientId(req, context, before, after, responseBody) {
  const candidates = [
    req.body?.client_id, req.body?.clientId,
    req.query?.client_id, req.query?.clientId,
    after?.client_id, before?.client_id,
    responseBody?.client_id, responseBody?.clientId,
  ];
  if (context.path.startsWith('/clients/')) candidates.unshift(pathParts(context.path)[1]);
  return candidates.map(numericPart).find(Boolean) || null;
}

function resolveEntityId(context, responseBody) {
  if (numericPart(context.entityId)) return numericPart(context.entityId);
  return numericPart(responseBody?.id) || numericPart(responseBody?.task?.id) || numericPart(responseBody?.post?.id) || numericPart(responseBody?.lead?.id) || null;
}

function resolveEntityLabel(context, entityId, clientId, agencyId, req) {
  const body = req.body || {};
  const candidates = [body.title, body.name, body.company_name, body.companyName, body.contact_name];
  const direct = candidates.find((value) => String(value || '').trim());
  if (direct) return String(direct).trim().slice(0, 180);
  const id = numericPart(entityId);
  try {
    if (context.entityType === 'task' && id) return db.prepare('SELECT title FROM tasks WHERE id = ? AND agency_id = ?').get(id, agencyId)?.title || null;
    if (context.entityType === 'post' && id) return db.prepare('SELECT title FROM posts WHERE id = ? AND agency_id = ?').get(id, agencyId)?.title || null;
    if (context.entityType === 'lead' && id) return db.prepare('SELECT company_name FROM commercial_leads WHERE id = ? AND agency_id = ?').get(id, agencyId)?.company_name || null;
    if (context.entityType === 'highlight' && id) return db.prepare('SELECT name FROM feed_highlights WHERE id = ? AND agency_id = ?').get(id, agencyId)?.name || null;
    if (context.entityType === 'client' && id) return db.prepare('SELECT name FROM clients WHERE id = ? AND agency_id = ?').get(id, agencyId)?.name || null;
    if (clientId && ['feed_profile', 'social_media_link'].includes(context.entityType)) return db.prepare('SELECT name FROM clients WHERE id = ? AND agency_id = ?').get(clientId, agencyId)?.name || null;
  } catch {}
  return null;
}

function recordActivity({ agencyId, userId = null, actorName: actorNameOverride = null, clientId = null, module = 'system', action = 'updated', entityType = null, entityId = null, entityLabel = null, summary = 'Atividade registrada', details = {}, path = null, method = null }) {
  if (!agencyId) return null;
  try {
    const actorName = actorNameOverride || (userId
      ? (db.prepare('SELECT name FROM users WHERE id = ? AND agency_id = ?').get(Number(userId), Number(agencyId))?.name || null)
      : null);
    const info = db.prepare(`
      INSERT INTO activity_logs (
        agency_id, user_id, actor_name, client_id, module, action, entity_type, entity_id,
        entity_label, summary, details_json, path, method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(agencyId), userId ? Number(userId) : null, actorName, clientId ? Number(clientId) : null,
      String(module || 'system'), String(action || 'updated'), entityType ? String(entityType) : null,
      entityId != null ? String(entityId) : null, entityLabel ? String(entityLabel).slice(0, 180) : null,
      String(summary || 'Atividade registrada').slice(0, 220), safeJson(sanitizeValue(details)),
      path ? String(path).slice(0, 255) : null, method ? String(method).slice(0, 12) : null
    );
    return Number(info.lastInsertRowid);
  } catch (error) {
    console.error('[ACTIVITY] Falha ao registrar atividade:', error.message);
    return null;
  }
}

function updatePresence({ agencyId, userId, path = null, clientId = null }) {
  if (!agencyId || !userId) return;
  try {
    db.prepare(`
      INSERT INTO user_presence (agency_id, user_id, last_seen, last_path, last_client_id, updated_at)
      VALUES (?, ?, datetime('now'), ?, ?, datetime('now'))
      ON CONFLICT(agency_id, user_id)
      DO UPDATE SET last_seen = datetime('now'), last_path = excluded.last_path,
                    last_client_id = excluded.last_client_id, updated_at = datetime('now')
    `).run(Number(agencyId), Number(userId), path ? String(path).slice(0, 255) : null, clientId ? Number(clientId) : null);
  } catch (error) {
    console.warn('[ACTIVITY] Falha ao atualizar presença:', error.message);
  }
}

function activityMutationMiddleware(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = normalizePath(req.path);
  if (!req.user || ['GET', 'HEAD', 'OPTIONS'].includes(method) || path.startsWith('/activity')) return next();

  const context = routeContext(req);
  const before = snapshotEntity(context, req.user.agency_id);
  let responseBody = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const entityId = resolveEntityId(context, responseBody);
    const finalContext = { ...context, entityId };
    const after = snapshotEntity(finalContext, req.user.agency_id);
    const changes = diffSnapshots(before, after, req.user.agency_id);
    const clientId = resolveClientId(req, finalContext, before, after, responseBody);
    const entityLabel = resolveEntityLabel(finalContext, entityId, clientId, req.user.agency_id, req)
      || before?.title || before?.company_name || before?.name || null;
    const details = {
      changes,
      request: summarizeRequest(req.body || {}),
      response: summarizeResponse(responseBody && typeof responseBody === 'object' ? responseBody : {}),
    };
    recordActivity({
      agencyId: req.user.agency_id,
      userId: req.user.id,
      clientId,
      module: finalContext.module,
      action: finalContext.action,
      entityType: finalContext.entityType,
      entityId,
      entityLabel,
      summary: finalContext.summary,
      details,
      path: finalContext.path,
      method: finalContext.method,
    });
  });

  next();
}

function moduleLabel(module) {
  return MODULE_LABELS[module] || String(module || 'Sistema');
}

module.exports = {
  activityMutationMiddleware,
  recordActivity,
  updatePresence,
  parseJson,
  sanitizeValue,
  moduleLabel,
};
