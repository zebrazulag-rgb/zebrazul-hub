const db = require('../db/database');

const PERMISSION_CATALOG = [
  { key: 'dashboard.view', group: 'Geral', label: 'Painel', description: 'Visualizar o painel principal.' },
  { key: 'tasks.view', group: 'Tarefas', label: 'Visualizar tarefas', description: 'Acessar Kanban, calendário e tarefas dos clientes permitidos.' },
  { key: 'tasks.create', group: 'Tarefas', label: 'Criar e editar tarefas', description: 'Criar tarefas, editar conteúdo e atualizar status.' },
  { key: 'tasks.approval', group: 'Tarefas', label: 'Aprovação', description: 'Visualizar a área de aprovação dentro de Tarefas.' },
  { key: 'tasks.import', group: 'Tarefas', label: 'Importar CSV', description: 'Importar tarefas e subtarefas em massa.' },
  { key: 'tasks.export', group: 'Tarefas', label: 'Exportar CSV', description: 'Exportar tarefas filtradas.' },
  { key: 'tasks.share_calendar', group: 'Tarefas', label: 'Compartilhar calendário', description: 'Gerar links públicos do calendário mensal.' },
  { key: 'compass.view', group: 'Bússola', label: 'Bússola', description: 'Acessar DME, diagnóstico e briefings estratégicos.' },
  { key: 'social.view', group: 'Social Media', label: 'Acessar Social Media', description: 'Exibir a área Social Media no menu.' },
  { key: 'social.feed', group: 'Social Media', label: 'Feed planejado', description: 'Visualizar a grade planejada do cliente.' },
  { key: 'social.feed_create', group: 'Social Media', label: 'Criar e editar publicações', description: 'Criar, editar, ocultar e organizar posts do Feed.' },
  { key: 'social.feed_share', group: 'Social Media', label: 'Compartilhar feed', description: 'Gerar o link público do Feed para o cliente.' },
  { key: 'social.link_social_media', group: 'Social Media', label: 'LINK SOCIAL MEDIA', description: 'Gerar o link operacional para quem publica.' },
  { key: 'social.covers', group: 'Social Media', label: 'Inteligência de capas', description: 'Visualizar e executar a análise visual de capas.' },
  { key: 'social.published', group: 'Social Media', label: 'Feed publicado', description: 'Visualizar e sincronizar o feed real do Instagram.' },
  { key: 'social.compare', group: 'Social Media', label: 'Comparar feeds', description: 'Comparar planejado e publicado lado a lado.' },
  { key: 'social.calendar', group: 'Social Media', label: 'Calendário do Feed', description: 'Visualizar o calendário editorial do Feed.' },
  { key: 'social.stories', group: 'Social Media', label: 'Stories', description: 'Acessar menções, repostagens e Stories.' },
  { key: 'social.reports', group: 'Social Media', label: 'Relatórios', description: 'Acessar relatórios orgânicos e de mídia paga.' },
  { key: 'social.connections', group: 'Social Media', label: 'Conexões Meta/Instagram', description: 'Gerenciar conexões e sincronizações das redes.' },
  { key: 'commercial.view', group: 'Comercial', label: 'Comercial', description: 'Acessar o pipeline comercial.' },
  { key: 'commercial.manage', group: 'Comercial', label: 'Gerenciar pipeline', description: 'Criar/editar leads e organizar quadros.' },
  { key: 'commercial.import', group: 'Comercial', label: 'Importar leads', description: 'Importar listas de leads em CSV.' },
  { key: 'reenrollments.view', group: 'Rematrículas', label: 'Rematrículas', description: 'Acessar o CRM de rematrículas da Bee.' },
  { key: 'materials.view', group: 'Materiais', label: 'Materiais', description: 'Acessar biblioteca, links e rascunhos.' },
  { key: 'activity.view_own', group: 'Atividade', label: 'Ver própria atividade', description: 'Visualizar o próprio histórico de ações e presença recente.' },
  { key: 'activity.view_team', group: 'Atividade', label: 'Ver atividade da equipe', description: 'Visualizar histórico, presença e filtros de todos os usuários da agência.' },
  { key: 'activity.export', group: 'Atividade', label: 'Exportar histórico', description: 'Baixar o histórico filtrado da equipe em CSV.' },
  { key: 'finance.view', group: 'Financeiro', label: 'Financeiro', description: 'Acessar entradas, saídas e indicadores financeiros.', admin_only: true },
  { key: 'vault.view', group: 'Senhas', label: 'Cofre de senhas', description: 'Acessar credenciais criptografadas.', admin_only: true },
  { key: 'settings.clients', group: 'Configurações', label: 'Clientes', description: 'Gerenciar clientes da agência.' },
  { key: 'settings.users', group: 'Configurações', label: 'Usuários', description: 'Criar e editar usuários.', admin_only: true },
  { key: 'settings.brand', group: 'Configurações', label: 'Marca', description: 'Editar identidade e configurações da agência.', admin_only: true },
  { key: 'settings.permissions', group: 'Configurações', label: 'Cargos e permissões', description: 'Editar cargos, permissões e recursos em teste.', admin_only: true },
];

const ALL_KEYS = PERMISSION_CATALOG.map((item) => item.key);

const DEFAULTS = {
  admin: new Set(ALL_KEYS),
  operations_head: new Set([
    'dashboard.view', 'tasks.view', 'tasks.create', 'tasks.approval', 'tasks.import', 'tasks.export', 'tasks.share_calendar',
    'compass.view', 'social.view', 'social.feed', 'social.feed_create', 'social.feed_share', 'social.link_social_media',
    'social.covers', 'social.published', 'social.compare', 'social.calendar', 'social.stories', 'social.reports', 'social.connections',
    'reenrollments.view', 'materials.view', 'activity.view_own', 'activity.view_team', 'activity.export', 'settings.clients',
  ]),
  team: new Set([
    'dashboard.view', 'tasks.view', 'tasks.create', 'tasks.approval', 'tasks.import', 'tasks.export', 'tasks.share_calendar',
    'compass.view', 'social.view', 'social.feed', 'social.feed_create', 'social.feed_share', 'social.link_social_media',
    'social.covers', 'social.published', 'social.compare', 'social.calendar', 'social.stories', 'social.reports', 'social.connections',
    'reenrollments.view', 'materials.view', 'activity.view_own', 'settings.clients',
  ]),
  commercial_team: new Set([
    'dashboard.view', 'tasks.view', 'tasks.create', 'tasks.export', 'commercial.view', 'commercial.manage', 'commercial.import', 'reenrollments.view', 'activity.view_own',
  ]),
  client: new Set([
    'tasks.view', 'tasks.approval', 'social.view', 'social.feed', 'social.calendar', 'social.reports',
    'materials.view',
  ]),
};

const BUILTIN_ROLES = [
  { key: 'admin', name: 'Administrador', protected: true },
  { key: 'operations_head', name: 'Head de Operação', protected: false },
  { key: 'team', name: 'Equipe da agência', protected: false },
  { key: 'commercial_team', name: 'Equipe Comercial', protected: false },
  { key: 'client', name: 'Cliente', protected: false },
];

function roleKeyForUser(user) {
  if (!user) return 'guest';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'client') return 'client';
  if (Number(user.custom_role_id) > 0) return `custom:${Number(user.custom_role_id)}`;
  if (Number(user.is_operations_head) === 1 || user.is_operations_head === true) return 'operations_head';
  if (Number(user.is_commercial_team) === 1 || user.is_commercial_team === true) return 'commercial_team';
  return 'team';
}

function defaultPermission(roleKey, permissionKey) {
  const defaults = DEFAULTS[roleKey] || new Set();
  return defaults.has(permissionKey);
}

function getOwnerOnlyMap(agencyId) {
  const rows = db.prepare(`
    SELECT permission_key, owner_only FROM agency_permission_visibility
    WHERE agency_id = ?
  `).all(agencyId);
  return Object.fromEntries(rows.map((row) => [row.permission_key, Number(row.owner_only) === 1]));
}

function getBuiltInPermissionMap(agencyId, roleKey) {
  const map = Object.fromEntries(ALL_KEYS.map((key) => [key, defaultPermission(roleKey, key)]));
  const rows = db.prepare(`
    SELECT permission_key, allowed FROM agency_role_permissions
    WHERE agency_id = ? AND role_key = ?
  `).all(agencyId, roleKey);
  rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(map, row.permission_key)) map[row.permission_key] = Number(row.allowed) === 1;
  });
  return map;
}

function getCustomPermissionMap(agencyId, customRoleId) {
  const role = db.prepare('SELECT id FROM custom_roles WHERE id = ? AND agency_id = ?').get(customRoleId, agencyId);
  if (!role) return getBuiltInPermissionMap(agencyId, 'team');
  const map = Object.fromEntries(ALL_KEYS.map((key) => [key, false]));
  const rows = db.prepare(`
    SELECT permission_key, allowed FROM custom_role_permissions
    WHERE custom_role_id = ?
  `).all(customRoleId);
  rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(map, row.permission_key)) map[row.permission_key] = Number(row.allowed) === 1;
  });
  return map;
}

function getPermissionMapForRole(agencyId, roleKey) {
  const map = String(roleKey).startsWith('custom:')
    ? getCustomPermissionMap(agencyId, Number(String(roleKey).split(':')[1]))
    : getBuiltInPermissionMap(agencyId, roleKey);
  if (roleKey !== 'admin') {
    PERMISSION_CATALOG.filter((item) => item.admin_only).forEach((item) => { map[item.key] = false; });
  }
  return map;
}

function getPermissionSetForUser(user) {
  if (!user?.agency_id) return Object.fromEntries(ALL_KEYS.map((key) => [key, false]));
  const roleKey = roleKeyForUser(user);
  const map = getPermissionMapForRole(Number(user.agency_id), roleKey);
  const ownerOnly = getOwnerOnlyMap(Number(user.agency_id));
  const isOwner = Boolean(user.is_agency_owner || user.is_platform_owner);
  ALL_KEYS.forEach((key) => {
    if (ownerOnly[key] && !isOwner) map[key] = false;
  });
  // Financeiro é uma área de Super Administrador: administrador comum nunca recebe acesso.
  map['finance.view'] = Boolean(user.is_platform_owner);
  return map;
}

function hasPermission(user, permissionKey) {
  if (!ALL_KEYS.includes(permissionKey)) return false;
  const map = getPermissionSetForUser(user);
  if (permissionKey.startsWith('social.') && permissionKey !== 'social.view') {
    const feedChildren = new Set([
      'social.feed_create', 'social.feed_share', 'social.link_social_media', 'social.covers',
      'social.published', 'social.compare', 'social.calendar'
    ]);
    const parentAllowed = feedChildren.has(permissionKey)
      ? Boolean(map['social.view'] && map['social.feed'])
      : Boolean(map['social.view']);
    return Boolean(parentAllowed && map[permissionKey]);
  }
  if (permissionKey.startsWith('tasks.') && permissionKey !== 'tasks.view') {
    return Boolean(map['tasks.view'] && map[permissionKey]);
  }
  if (permissionKey.startsWith('commercial.') && permissionKey !== 'commercial.view') {
    return Boolean(map['commercial.view'] && map[permissionKey]);
  }
  return Boolean(map[permissionKey]);
}

function roleNameForUser(user) {
  if (!user) return '';
  if (Number(user.custom_role_id) > 0) {
    const custom = db.prepare('SELECT name FROM custom_roles WHERE id = ? AND agency_id = ?').get(user.custom_role_id, user.agency_id);
    if (custom?.name) return custom.name;
  }
  const key = roleKeyForUser(user);
  return BUILTIN_ROLES.find((item) => item.key === key)?.name || key;
}

function apiPermissionForRequest(req) {
  const path = String(req.path || '');
  const method = String(req.method || 'GET').toUpperCase();
  if (path === '/clients' || path.startsWith('/clients/')) {
    if (/^\/clients\/\d+\/feed-share$/.test(path)) return 'social.feed_share';
    if (/^\/clients\/\d+\/social-media-share$/.test(path)) return 'social.link_social_media';
    if (/^\/clients\/\d+\/feed-profile$/.test(path)) return 'social.feed_create';
    if (/^\/clients\/\d+\/feed-highlights(?:\/.*)?$/.test(path)) return method === 'GET' ? 'social.feed' : 'social.feed_create';
    if (/^\/clients\/\d+\/accounts$/.test(path)) return 'social.connections';
    return method === 'GET' ? null : 'settings.clients';
  }
  if (path === '/tasks' || path.startsWith('/tasks/')) {
    if (path.includes('/import')) return 'tasks.import';
    if (path.includes('/export')) return 'tasks.export';
    if (path.includes('/calendar-share')) return 'tasks.share_calendar';
    return method === 'GET' ? 'tasks.view' : 'tasks.create';
  }
  if (path === '/posts' || path.startsWith('/posts/')) {
    if (method === 'GET') return ['social.feed', 'tasks.approval'];
    if (/\/comments$/.test(path) || /\/share$/.test(path)) return 'tasks.approval';
    if (method === 'PUT' && req.body && Object.keys(req.body).every((key) => ['status', 'client_feedback'].includes(key))) return 'tasks.approval';
    return 'social.feed_create';
  }
  if (path.startsWith('/feed-intelligence')) return path.includes('covers') || path.includes('analyze-covers') ? 'social.covers' : 'social.published';
  if (path.startsWith('/instagram-stories')) return 'social.stories';
  if (path.startsWith('/reports')) return 'social.reports';
  if (path.startsWith('/meta-organic')) return ['social.reports', 'social.published'];
  if (path.startsWith('/meta-oauth') || path.startsWith('/instagram-oauth') || path.startsWith('/meta')) return 'social.connections';
  if (path.startsWith('/commercial')) return path.includes('import') ? 'commercial.import' : (method === 'GET' ? 'commercial.view' : 'commercial.manage');
  if (path.startsWith('/activity')) return ['activity.view_own', 'activity.view_team'];
  if (path.startsWith('/reenrollments')) return 'reenrollments.view';
  if (path.startsWith('/materials') || path.startsWith('/material-boards')) return 'materials.view';
  if (path.startsWith('/finance')) return 'finance.view';
  if (path.startsWith('/credentials')) return 'vault.view';
  if (path.startsWith('/video-reviews')) return 'tasks.approval';
  if (path.startsWith('/task-request-links')) return 'tasks.create';
  if (path.startsWith('/diagnostics') || path.startsWith('/action-plans') || path.startsWith('/planning-documents') || path.startsWith('/bee-campaign-briefing') || path.startsWith('/bee-family-survey')) return 'compass.view';
  if (path.startsWith('/ai')) return 'compass.view';
  return null;
}

module.exports = {
  PERMISSION_CATALOG,
  ALL_KEYS,
  BUILTIN_ROLES,
  DEFAULTS,
  roleKeyForUser,
  roleNameForUser,
  getPermissionMapForRole,
  getPermissionSetForUser,
  getOwnerOnlyMap,
  hasPermission,
  apiPermissionForRequest,
};
