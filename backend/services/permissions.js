const db = require('../db/database');

const PERMISSION_CATALOG = [
  { key: 'dashboard.view', group: 'Geral', label: 'Painel', description: 'Visualizar o painel principal.' },
  { key: 'work_queue.view', group: 'Geral', label: 'Minha fila', description: 'Acessar a fila pessoal de trabalho.' },
  { key: 'alerts.view', group: 'Geral', label: 'Alertas', description: 'Acessar alertas operacionais.' },
  { key: 'calendar.view', group: 'Geral', label: 'Calendário', description: 'Acessar o calendário operacional unificado.' },
  { key: 'intelligence.view', group: 'Geral', label: 'Inteligência', description: 'Acessar a inteligência operacional.' },
  { key: 'designer.view', group: 'Design', label: 'Design', description: 'Acessar a área de produção de design.' },
  { key: 'approval.view', group: 'Design', label: 'Grade', description: 'Visualizar a grade e o fluxo de aprovação interno.' },
  { key: 'site_lp.view', group: 'Site/LP', label: 'Site/LP', description: 'Acessar demandas de site e landing pages.' },
  { key: 'scheduling.view', group: 'Social Media', label: 'Agendamento', description: 'Acessar a fila e o calendário de agendamento de publicações.' },
  { key: 'moodboard.view', group: 'Design', label: 'Moodboard', description: 'Acessar moodboards e referências visuais.' },
  { key: 'reader.view', group: 'Geral', label: 'Zebra Leitor', description: 'Acessar a biblioteca Zebra Leitor.' },
  { key: 'tasks.view', group: 'Tarefas', label: 'Visualizar tarefas', description: 'Acessar Kanban, calendário e tarefas dos clientes permitidos.' },
  { key: 'tasks.create', group: 'Tarefas', label: 'Criar e editar tarefas', description: 'Criar tarefas, editar conteúdo e atualizar status.' },
  { key: 'tasks.approval', group: 'Social Media', label: 'Aprovação na grade', description: 'Registrar decisões e feedbacks de aprovação nos conteúdos exibidos na grade.' },
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
  { key: 'social.messages', group: 'Social Media', label: 'Mensagens do Instagram', description: 'Visualizar conversas e responder DMs da conta profissional conectada.' },
  { key: 'social.reports', group: 'Social Media', label: 'Insights', description: 'Acessar relatórios orgânicos e de mídia paga.' },
  { key: 'social.connections', group: 'Social Media', label: 'Conexões Meta/Instagram', description: 'Gerenciar conexões e sincronizações das redes.' },
  { key: 'reports.view', group: 'Relatórios (BI)', label: 'Ver Relatórios', description: 'Consultar relatórios mensais, histórico e apresentação.' },
  { key: 'reports.edit', group: 'Relatórios (BI)', label: 'Criar e editar Relatórios', description: 'Criar relatórios, preencher módulos, anexar fontes, finalizar e reabrir.' },
  { key: 'radar.view', group: 'Radar de Conteúdo', label: 'Ver Radar de Conteúdo', description: 'Ver as notícias coletadas das fontes do cliente.' },
  { key: 'radar.refresh', group: 'Radar de Conteúdo', label: 'Atualizar notícias', description: 'Forçar a atualização das fontes do cliente.' },
  { key: 'radar.sources', group: 'Radar de Conteúdo', label: 'Gerenciar fontes e referências', description: 'Adicionar, ativar, desativar e remover fontes RSS/Atom e editar as referências editoriais do cliente.' },
  { key: 'radar.prompts', group: 'Radar de Conteúdo', label: 'Gerar prompts', description: 'Gerar prompts de carrossel e roteiro de vídeo a partir das notícias.' },
  { key: 'radar.history', group: 'Radar de Conteúdo', label: 'Histórico de prompts', description: 'Ver o histórico de prompts gerados por cliente.' },
  { key: 'commercial.view', group: 'Comercial', label: 'Comercial', description: 'Acessar o pipeline comercial.' },
  { key: 'commercial.manage', group: 'Comercial', label: 'Gerenciar pipeline', description: 'Criar/editar leads e organizar quadros.' },
  { key: 'commercial.import', group: 'Comercial', label: 'Importar leads', description: 'Importar listas de leads em CSV.' },
  { key: 'audiovisual.view', group: 'Audiovisual', label: 'Acessar Audiovisual', description: 'Visualizar painel, agenda, produção e saúde audiovisual dos clientes.' },
  { key: 'audiovisual.manage', group: 'Audiovisual', label: 'Gerenciar gravações', description: 'Criar, remarcar, concluir e cancelar gravações e configurar cadências.' },
  { key: 'audiovisual.edit', group: 'Audiovisual', label: 'Gerenciar edições', description: 'Mover vídeos para edição e concluir edição com links finais.' },
  { key: 'audiovisual.publish', group: 'Audiovisual', label: 'Agendar e postar vídeos', description: 'Registrar datas de publicação e marcar vídeos como postados.' },
  { key: 'audiovisual.calendar', group: 'Audiovisual', label: 'Conectar Google Agenda', description: 'Conectar ou desconectar o Google Agenda usado nas gravações.' },
  { key: 'product.view', group: 'Produto', label: 'Acessar Produto', description: 'Visualizar painel, backlog, desenvolvimento, QA e releases do ZebraHub.' },
  { key: 'product.create', group: 'Produto', label: 'Criar demandas', description: 'Criar bugs, melhorias, novas funções e débitos técnicos.' },
  { key: 'product.manage', group: 'Produto', label: 'Gerenciar desenvolvimento', description: 'Editar demandas, responsáveis, prioridades, status e releases em preparação.' },
  { key: 'product.qa', group: 'Produto', label: 'Executar QA', description: 'Preencher o checklist de testes antes da validação final.' },
  { key: 'product.release', group: 'Produto', label: 'Aprovar produção', description: 'Aprovar demandas e confirmar deploys em produção.', admin_only: true },
  { key: 'reenrollments.view', group: 'Rematrículas', label: 'Rematrículas', description: 'Acessar o CRM de rematrículas da Bee.' },
  { key: 'materials.view', group: 'Materiais', label: 'Materiais', description: 'Acessar biblioteca, links e rascunhos.' },
  { key: 'organizer.view', group: 'Organização', label: 'Agenda, notas e checklist', description: 'Acessar a organização diária da equipe.' },
  { key: 'activity.view_own', group: 'Atividade', label: 'Ver própria atividade', description: 'Visualizar o próprio histórico de ações e presença recente.' },
  { key: 'activity.view_team', group: 'Atividade', label: 'Ver atividade da equipe', description: 'Visualizar histórico, presença e filtros de todos os usuários da agência.' },
  { key: 'activity.export', group: 'Atividade', label: 'Exportar histórico', description: 'Baixar o histórico filtrado da equipe em CSV.' },
  { key: 'finance.view', group: 'Financeiro', label: 'Financeiro', description: 'Acessar entradas, saídas e indicadores financeiros.' },
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
    'dashboard.view', 'work_queue.view', 'alerts.view', 'calendar.view', 'intelligence.view',
    'designer.view', 'approval.view', 'site_lp.view', 'scheduling.view', 'moodboard.view', 'reader.view',
    'tasks.view', 'tasks.create', 'tasks.approval', 'tasks.import', 'tasks.export', 'tasks.share_calendar',
    'compass.view', 'social.view', 'social.feed', 'social.feed_create', 'social.feed_share', 'social.link_social_media',
    'social.covers', 'social.published', 'social.compare', 'social.calendar', 'social.stories', 'social.messages', 'social.reports', 'social.connections',
    'audiovisual.view', 'audiovisual.manage', 'audiovisual.edit', 'audiovisual.publish', 'audiovisual.calendar',
    'radar.view', 'radar.refresh', 'radar.sources', 'radar.prompts', 'radar.history', 'reports.view', 'reports.edit',
    'reenrollments.view', 'materials.view', 'organizer.view', 'activity.view_own', 'activity.view_team', 'activity.export', 'settings.clients',
  ]),
  team: new Set([
    'dashboard.view', 'work_queue.view', 'alerts.view', 'calendar.view', 'intelligence.view',
    'designer.view', 'approval.view', 'site_lp.view', 'scheduling.view', 'moodboard.view', 'reader.view',
    'tasks.view', 'tasks.create', 'tasks.approval', 'tasks.import', 'tasks.export', 'tasks.share_calendar',
    'compass.view', 'social.view', 'social.feed', 'social.feed_create', 'social.feed_share', 'social.link_social_media',
    'social.covers', 'social.published', 'social.compare', 'social.calendar', 'social.stories', 'social.messages', 'social.reports', 'social.connections',
    'audiovisual.view', 'audiovisual.manage', 'audiovisual.edit', 'audiovisual.publish',
    'radar.view', 'radar.refresh', 'radar.prompts', 'radar.history', 'reports.view', 'reports.edit',
    'reenrollments.view', 'materials.view', 'organizer.view', 'activity.view_own', 'settings.clients',
  ]),
  commercial_team: new Set([
    'dashboard.view', 'designer.view', 'tasks.view', 'tasks.create', 'tasks.export', 'commercial.view', 'commercial.manage', 'commercial.import', 'reenrollments.view', 'organizer.view', 'activity.view_own',
  ]),
  client: new Set([
    'tasks.view', 'tasks.approval', 'social.view', 'social.feed', 'social.calendar', 'social.reports',
    'materials.view', 'radar.view',
  ]),
};

const BUILTIN_ROLES = [
  { key: 'admin', name: 'Administrador', protected: true },
  { key: 'operations_head', name: 'Head de Operação', protected: false },
  { key: 'team', name: 'Equipe da agência', protected: false },
  { key: 'commercial_team', name: 'Equipe Comercial', protected: false },
  { key: 'client', name: 'Cliente', protected: false },
];

const TEAM_ROLE_PRESETS = [
  {
    slug: 'design',
    name: 'Design',
    permissions: new Set([
      'dashboard.view', 'designer.view', 'tasks.view', 'approval.view', 'organizer.view',
    ]),
  },
  {
    slug: 'audiovisual',
    name: 'Audiovisual',
    permissions: new Set([
      'dashboard.view', 'approval.view', 'tasks.view', 'audiovisual.view', 'audiovisual.manage', 'audiovisual.edit',
      'audiovisual.publish', 'audiovisual.calendar', 'organizer.view',
    ]),
  },
  {
    slug: 'social-media',
    name: 'Social Media',
    permissions: new Set([
      ...DEFAULTS.team,
      'work_queue.view', 'alerts.view', 'calendar.view', 'intelligence.view',
      'designer.view', 'approval.view', 'site_lp.view', 'scheduling.view', 'moodboard.view', 'reader.view',
    ]),
  },
  {
    slug: 'branding',
    name: 'Branding',
    permissions: new Set([
      ...DEFAULTS.team,
      'work_queue.view', 'alerts.view', 'calendar.view', 'intelligence.view',
      'designer.view', 'approval.view', 'moodboard.view', 'reader.view',
      'social.reports',
    ]),
    denied: new Set([
      'commercial.view', 'commercial.manage', 'commercial.import',
      'site_lp.view', 'scheduling.view',
      'social.view', 'social.feed', 'social.feed_create', 'social.feed_share', 'social.link_social_media',
      'social.covers', 'social.published', 'social.compare', 'social.calendar', 'social.stories',
      'social.messages', 'social.connections',
    ]),
  },
];

function ensureTeamRolePresets(agencyId) {
  const normalizedAgencyId = Number(agencyId);
  if (!normalizedAgencyId) return [];

  const ensure = db.transaction(() => TEAM_ROLE_PRESETS.map((preset) => {
    let role = db.prepare('SELECT id, name, slug FROM custom_roles WHERE agency_id = ? AND slug = ?').get(normalizedAgencyId, preset.slug);
    if (!role) {
      const info = db.prepare('INSERT INTO custom_roles (agency_id, name, slug) VALUES (?, ?, ?)').run(normalizedAgencyId, preset.name, preset.slug);
      role = { id: Number(info.lastInsertRowid), name: preset.name, slug: preset.slug };
    } else if (role.name !== preset.name) {
      db.prepare("UPDATE custom_roles SET name = ?, updated_at = datetime('now') WHERE id = ?").run(preset.name, role.id);
      role.name = preset.name;
    }

    // Estes cargos são presets oficiais do ZebraHub. Sincronize SEMPRE a matriz inteira,
    // inclusive permissões que já existiam no banco. Antes, apenas permissões ausentes
    // eram inseridas; por isso um Design criado numa versão anterior podia continuar
    // vendo Minha fila, Alertas, Calendário, Site/LP, Leitor etc. mesmo depois do preset
    // ser reduzido. A sincronização exata evita esse vazamento em todos os presets.
    db.prepare('DELETE FROM custom_role_permissions WHERE custom_role_id = ?').run(role.id);
    const insertPermission = db.prepare('INSERT INTO custom_role_permissions (custom_role_id, permission_key, allowed) VALUES (?, ?, ?)');
    ALL_KEYS.forEach((key) => {
      const allowed = preset.denied?.has(key) ? false : preset.permissions.has(key);
      insertPermission.run(role.id, key, allowed ? 1 : 0);
    });
    return { id: Number(role.id), name: preset.name, slug: preset.slug };
  }));

  return ensure();
}

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
  const role = db.prepare('SELECT id, slug FROM custom_roles WHERE id = ? AND agency_id = ?').get(customRoleId, agencyId);
  if (!role) return getBuiltInPermissionMap(agencyId, 'team');

  // Presets oficiais são avaliados diretamente pela configuração atual do código.
  // Assim, mesmo antes de o administrador abrir a tela de Permissões, usuários de
  // Design/Audiovisual/Social Media/Branding já recebem o acesso correto após deploy.
  const preset = TEAM_ROLE_PRESETS.find((item) => item.slug === role.slug);
  if (preset) {
    return Object.fromEntries(ALL_KEYS.map((key) => [
      key,
      preset.denied?.has(key) ? false : preset.permissions.has(key),
    ]));
  }

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

  // ZebraHub Experience: o potencial cliente usa o mesmo papel `client`, porém com
  // um escopo próprio. Isso impede que aprovação, tarefas, relatórios e operação da
  // agência vazem para o experimental antes da conversão.
  if (user?.role === 'client' && user?.client_stage === 'trial') {
    ALL_KEYS.forEach((key) => { map[key] = false; });
    if (!user?.trial?.expired) {
      ['radar.view', 'radar.refresh', 'radar.prompts', 'radar.history'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(map, key)) map[key] = true;
      });
    }
  }

  // Financeiro fica dentro de Meu Espaço e é liberado para todas as contas internas da equipe.
  // O portal de cliente permanece sem acesso.
  map['finance.view'] = Boolean(user && user.role !== 'client');
  return map;
}

function hasPermission(user, permissionKey) {
  if (!ALL_KEYS.includes(permissionKey)) return false;
  // O Super Administrador nunca perde acesso operacional a importar/exportar tarefas,
  // mesmo se existir uma configuração antiga de permissões da agência no banco.
  if ((Number(user?.is_platform_owner) === 1 || user?.is_platform_owner === true) &&
      (permissionKey === 'tasks.import' || permissionKey === 'tasks.export')) {
    return true;
  }
  const map = getPermissionSetForUser(user);
  if (permissionKey.startsWith('social.') && permissionKey !== 'social.view') {
    if (permissionKey === 'social.reports') return Boolean(map[permissionKey]);
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
  if (permissionKey.startsWith('audiovisual.') && permissionKey !== 'audiovisual.view') {
    return Boolean(map['audiovisual.view'] && map[permissionKey]);
  }
  if (permissionKey.startsWith('product.') && permissionKey !== 'product.view') {
    return Boolean(map['product.view'] && map[permissionKey]);
  }
  return Boolean(map[permissionKey]);
}

function roleNameForUser(user) {
  if (!user) return '';
  if (Number(user.is_platform_owner) === 1 || user.is_platform_owner === true) return 'Super Administrador';
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
    if (/^\/clients\/\d+\/portal-share$/.test(path)) return null;
    if (/^\/clients\/\d+\/feed-share$/.test(path)) return 'social.feed_share';
    if (/^\/clients\/\d+\/social-media-share$/.test(path)) return 'social.link_social_media';
    if (/^\/clients\/\d+\/feed-profile$/.test(path)) return 'social.feed_create';
    if (/^\/clients\/\d+\/feed-highlights(?:\/.*)?$/.test(path)) return method === 'GET' ? 'social.feed' : 'social.feed_create';
    if (/^\/clients\/\d+\/accounts$/.test(path)) return 'social.connections';
    return method === 'GET' ? null : 'settings.clients';
  }
  if (path === '/bi-reports' || path.startsWith('/bi-reports/')) return method === 'GET' ? 'reports.view' : 'reports.edit';
  if (path === '/radar' || path.startsWith('/radar/')) {
    if (/^\/radar\/clients\/\d+\/(items|overview|seen)$/.test(path) || path === '/radar/summary' || /^\/radar\/items\/\d+\/save$/.test(path)) return 'radar.view';
    if (/^\/radar\/clients\/\d+\/refresh$/.test(path)) return 'radar.refresh';
    if (/^\/radar\/items\/\d+\/prompt$/.test(path)) return 'radar.prompts';
    if (/^\/radar\/clients\/\d+\/history$/.test(path)) return 'radar.history';
    if (/^\/radar\/clients\/\d+\/editorial$/.test(path)) return method === 'GET' ? ['radar.prompts', 'radar.sources'] : 'radar.sources';
    return 'radar.sources'; // fontes, descoberta de feed, edição e remoção
  }
  if (path === '/manager-dashboard' || path.startsWith('/manager-dashboard/')) return 'dashboard.view';
  if (path === '/my-work' || path.startsWith('/my-work/')) return 'work_queue.view';
  if (path === '/smart-alerts' || path.startsWith('/smart-alerts/') || path === '/ayrton' || path.startsWith('/ayrton/')) return 'alerts.view';
  if (path === '/operational-calendar' || path.startsWith('/operational-calendar/')) return 'calendar.view';
  if (path === '/operational-intelligence' || path.startsWith('/operational-intelligence/')) return 'intelligence.view';
  if (path === '/automations' || path.startsWith('/automations/')) return 'dashboard.view';
  if (path.startsWith('/moodboards')) return method === 'GET' ? 'moodboard.view' : 'tasks.create';
  if (path.startsWith('/competitors')) return 'compass.view';
  if (path === '/tasks/schedule-queue' || path === '/tasks/posted-report' || path === '/tasks/posted-report/link' || /^\/tasks\/\d+\/schedule-status$/.test(path) || /^\/tasks\/\d+\/date$/.test(path) || /^\/tasks\/\d+\/platforms$/.test(path) || /^\/tasks\/posts\/\d+\/date$/.test(path)) {
    return 'scheduling.view';
  }
  if (path === '/tasks' || path.startsWith('/tasks/')) {
    // [FASE 1.5] Check de produção do designer: marcar/desmarcar a própria subtarefa exige apenas
    // visualizar tarefas, e não "Criar e editar tarefas". Antes, qualquer escrita em /tasks/* caía em
    // tasks.create, bloqueando designers com cargo personalizado antes de a rota rodar.
    // Cobre os DOIS caminhos (PATCH dedicado e PUT só com designer_completed), pois o front usa o PUT.
    // Clientes ficam de fora. A checagem de "subtarefa atribuída a você" continua dentro das rotas
    // (routes/tasks.js), então esta exceção só remove o bloqueio genérico e não concede edição.
    if (req.user?.role !== 'client') {
      if (method === 'PATCH' && /^\/tasks\/\d+\/designer-completed$/.test(path)) return 'tasks.view';
      if (method === 'PUT' && /^\/tasks\/\d+$/.test(path) && req.body && typeof req.body === 'object') {
        const keys = Object.keys(req.body);
        if (keys.length === 1 && keys[0] === 'designer_completed') return 'tasks.view';
      }
    }
    if (path.includes('/import')) return 'tasks.import';
    if (path.includes('/export')) return 'tasks.export';
    if (path.includes('/calendar-share')) return 'tasks.share_calendar';
    return method === 'GET' ? 'tasks.view' : 'tasks.create';
  }
  if (path === '/posts' || path.startsWith('/posts/')) {
    if (method === 'GET') return ['social.feed', 'tasks.approval', 'approval.view'];
    if (/\/comments$/.test(path) || /\/share$/.test(path)) return 'tasks.approval';
    if (method === 'PUT' && req.body && Object.keys(req.body).every((key) => ['status', 'client_feedback'].includes(key))) return 'tasks.approval';
    return 'social.feed_create';
  }
  if (path.startsWith('/feed-intelligence')) return path.includes('covers') || path.includes('analyze-covers') ? 'social.covers' : 'social.published';
  if (path.startsWith('/instagram-stories')) return 'social.stories';
  if (path.startsWith('/instagram-messages')) return 'social.messages';
  if (path.startsWith('/reports')) return 'social.reports';
  if (path.startsWith('/meta-organic')) return ['social.reports', 'social.published'];
  if (path.startsWith('/meta-oauth') || path.startsWith('/instagram-oauth') || path.startsWith('/meta')) return 'social.connections';
  if (path.startsWith('/commercial')) return path.includes('import') ? 'commercial.import' : (method === 'GET' ? 'commercial.view' : 'commercial.manage');
  if (path.startsWith('/ready-videos')) return method === 'GET' ? ['approval.view', 'scheduling.view', 'audiovisual.view'] : ['approval.view', 'scheduling.view', 'audiovisual.manage', 'audiovisual.edit', 'audiovisual.publish'];
  if (path.startsWith('/audiovisual')) return method === 'GET' ? 'audiovisual.view' : ['audiovisual.manage', 'audiovisual.edit', 'audiovisual.publish'];
  if (path.startsWith('/product')) return method === 'GET'
    ? 'product.view'
    : ['product.create', 'product.manage', 'product.qa', 'product.release'];
  if (path.startsWith('/site-lp')) return 'site_lp.view';
  if (path.startsWith('/books')) return 'reader.view';
  if (path.startsWith('/organizer')) return 'organizer.view';
  if (path.startsWith('/activity')) return ['activity.view_own', 'activity.view_team'];
  if (path.startsWith('/reenrollments')) return 'reenrollments.view';
  if (path.startsWith('/materials') || path.startsWith('/material-boards')) return 'materials.view';
  if (path.startsWith('/finance')) return 'finance.view';
  if (path.startsWith('/credentials')) return 'vault.view';
  if (path.startsWith('/video-reviews')) return 'tasks.approval';
  if (path.startsWith('/task-request-links')) return 'tasks.create';
  if (path.startsWith('/presence-diagnostics')) return req.user?.role === 'client' ? null : 'compass.view';
  if (path.startsWith('/diagnostics') || path.startsWith('/action-plans') || path.startsWith('/planning-documents') || path.startsWith('/bee-campaign-briefing') || path.startsWith('/bee-family-survey')) return 'compass.view';
  if (path.startsWith('/ai')) return 'compass.view';
  return null;
}

module.exports = {
  PERMISSION_CATALOG,
  ALL_KEYS,
  BUILTIN_ROLES,
  DEFAULTS,
  TEAM_ROLE_PRESETS,
  ensureTeamRolePresets,
  roleKeyForUser,
  roleNameForUser,
  getPermissionMapForRole,
  getPermissionSetForUser,
  getOwnerOnlyMap,
  hasPermission,
  apiPermissionForRequest,
};
