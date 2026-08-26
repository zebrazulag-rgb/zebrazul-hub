const DEFAULTS = {
  admin: new Set(['*']),
  operations_head: new Set([
    'dashboard.view','tasks.view','tasks.create','tasks.approval','tasks.import','tasks.export','tasks.share_calendar','compass.view',
    'social.view','social.feed','social.feed_create','social.feed_share','social.link_social_media','social.covers','social.published','social.compare','social.calendar','social.stories','social.reports','social.connections',
    'reenrollments.view','materials.view','chat.view','activity.view_own','activity.view_team','activity.export','settings.clients'
  ]),
  team: new Set([
    'dashboard.view','tasks.view','tasks.create','tasks.approval','tasks.import','tasks.export','tasks.share_calendar','compass.view',
    'social.view','social.feed','social.feed_create','social.feed_share','social.link_social_media','social.covers','social.published','social.compare','social.calendar','social.stories','social.reports','social.connections',
    'reenrollments.view','materials.view','chat.view','activity.view_own','settings.clients'
  ]),
  commercial_team: new Set(['dashboard.view','tasks.view','tasks.create','tasks.export','commercial.view','commercial.manage','commercial.import','reenrollments.view','activity.view_own']),
  client: new Set(['tasks.view','tasks.approval','social.view','social.feed','social.calendar','social.reports','materials.view']),
};

export function permissionRoleKey(user) {
  if (!user) return 'guest';
  if (user.permission_role_key) return user.permission_role_key;
  if (user.role === 'admin') return 'admin';
  if (user.role === 'client') return 'client';
  if (user.custom_role_id) return `custom:${user.custom_role_id}`;
  if (user.is_operations_head) return 'operations_head';
  if (user.is_commercial_team) return 'commercial_team';
  return 'team';
}

export function hasPermission(user, key) {
  if (!user) return false;
  let allowed;
  if (user.permissions && Object.prototype.hasOwnProperty.call(user.permissions, key)) allowed = Boolean(user.permissions[key]);
  else {
    const roleKey = permissionRoleKey(user);
    const defaults = roleKey.startsWith('custom:') ? DEFAULTS.team : (DEFAULTS[roleKey] || new Set());
    allowed = defaults.has('*') || defaults.has(key);
  }
  if (!allowed) return false;
  if (key.startsWith('social.') && key !== 'social.view') {
    const feedChildren = new Set([
      'social.feed_create', 'social.feed_share', 'social.link_social_media', 'social.covers',
      'social.published', 'social.compare', 'social.calendar'
    ]);
    if (!hasPermission(user, 'social.view')) return false;
    if (feedChildren.has(key) && !hasPermission(user, 'social.feed')) return false;
    return true;
  }
  if (key.startsWith('tasks.') && key !== 'tasks.view') {
    return hasPermission(user, 'tasks.view');
  }
  if (key.startsWith('commercial.') && key !== 'commercial.view') {
    return hasPermission(user, 'commercial.view');
  }
  return true;
}

export function anyPermission(user, keys = []) {
  return keys.some((key) => hasPermission(user, key));
}
