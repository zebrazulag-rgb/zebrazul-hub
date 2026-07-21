const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { databasePath, legacyDatabasePath, persistenceConfigured, storageSafe } = require('./config');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

// Migração automática da instalação antiga: se um banco existia dentro da pasta
// do código e agora DATABASE_PATH aponta para um volume persistente vazio,
// transfere o banco antigo antes de abrir a aplicação.
if (databasePath !== legacyDatabasePath && !fs.existsSync(databasePath) && fs.existsSync(legacyDatabasePath)) {
  fs.copyFileSync(legacyDatabasePath, databasePath);
  for (const suffix of ['-wal', '-shm']) {
    const source = legacyDatabasePath + suffix;
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, databasePath + suffix);
    }
  }
  console.log('Banco anterior migrado para o armazenamento persistente.');
}

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS system_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  plan TEXT DEFAULT 'essential',
  product_name TEXT DEFAULT 'Zebrahub',
  logo_data TEXT,
  logo_mime TEXT,
  primary_color TEXT DEFAULT '#0969ff',
  secondary_color TEXT DEFAULT '#4f8cff',
  sidebar_color TEXT DEFAULT '#121620',
  login_background_color TEXT DEFAULT '#121620',
  support_email TEXT,
  support_whatsapp TEXT,
  footer_text TEXT DEFAULT 'Tecnologia ZebraHub',
  show_powered_by INTEGER DEFAULT 1,
  max_clients INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 5,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','team','client')),
  client_id INTEGER,
  agency_id INTEGER,
  is_platform_owner INTEGER DEFAULT 0,
  is_agency_owner INTEGER DEFAULT 0,
  avatar_color TEXT DEFAULT '#2563eb',
  avatar_data TEXT,
  avatar_mime TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  segment TEXT,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_color TEXT DEFAULT '#0ea5e9',
  avatar_data TEXT,
  avatar_mime TEXT,
  bio TEXT,
  feed_share_token TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  responsible_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_client_access (
  user_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, client_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook','tiktok','linkedin','google_business','youtube')),
  handle TEXT,
  connected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  content_type TEXT DEFAULT 'feed' CHECK(content_type IN ('feed','reels','story','carrossel','artigo')),
  platforms TEXT DEFAULT '[]',
  media_url TEXT,
  media_data TEXT,
  media_mime TEXT,
  media_gallery TEXT,
  scheduled_at TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','rejected','scheduled','published')),
  client_feedback TEXT,
  share_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER,
  created_by INTEGER NOT NULL,
  assignee_id INTEGER,
  parent_task_id INTEGER,
  task_type TEXT DEFAULT 'basic' CHECK(task_type IN ('basic','post','video')),
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT,
  caption TEXT,
  video_link TEXT,
  media_gallery TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done')),
  attachment_data TEXT,
  attachment_mime TEXT,
  attachment_filename TEXT,
  feed_post_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (feed_post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER,
  created_by INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  category TEXT DEFAULT 'Outros',
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  paid_date TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
  payment_method TEXT,
  recurring INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook','tiktok','linkedin','google_ads','meta_ads','google_business','youtube')),
  metric_date TEXT NOT NULL,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  followers_delta INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  spend REAL DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);




CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL UNIQUE,
  account_id TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  currency TEXT,
  timezone_name TEXT,
  account_status INTEGER,
  last_synced_at TEXT,
  last_sync_status TEXT DEFAULT 'never' CHECK(last_sync_status IN ('never','syncing','success','error')),
  last_sync_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meta_account_id INTEGER NOT NULL,
  metric_date TEXT NOT NULL,
  reach REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  frequency REAL DEFAULT 0,
  clicks REAL DEFAULT 0,
  inline_link_clicks REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  conversations REAL DEFAULT 0,
  leads REAL DEFAULT 0,
  conversions REAL DEFAULT 0,
  results REAL DEFAULT 0,
  result_type TEXT,
  cost_per_conversation REAL DEFAULT 0,
  cost_per_lead REAL DEFAULT 0,
  cost_per_result REAL DEFAULT 0,
  actions_json TEXT DEFAULT '[]',
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(meta_account_id, metric_date),
  FOREIGN KEY (meta_account_id) REFERENCES meta_ad_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_report_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meta_account_id INTEGER NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  reach REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  frequency REAL DEFAULT 0,
  clicks REAL DEFAULT 0,
  inline_link_clicks REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  conversations REAL DEFAULT 0,
  leads REAL DEFAULT 0,
  conversions REAL DEFAULT 0,
  results REAL DEFAULT 0,
  result_type TEXT,
  cost_per_conversation REAL DEFAULT 0,
  cost_per_lead REAL DEFAULT 0,
  cost_per_result REAL DEFAULT 0,
  actions_json TEXT DEFAULT '[]',
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(meta_account_id, date_from, date_to),
  FOREIGN KEY (meta_account_id) REFERENCES meta_ad_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_campaign_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meta_account_id INTEGER NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  reach REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  frequency REAL DEFAULT 0,
  clicks REAL DEFAULT 0,
  inline_link_clicks REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  conversations REAL DEFAULT 0,
  leads REAL DEFAULT 0,
  conversions REAL DEFAULT 0,
  results REAL DEFAULT 0,
  result_type TEXT,
  cost_per_conversation REAL DEFAULT 0,
  cost_per_lead REAL DEFAULT 0,
  cost_per_result REAL DEFAULT 0,
  actions_json TEXT DEFAULT '[]',
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(meta_account_id, date_from, date_to, campaign_id),
  FOREIGN KEY (meta_account_id) REFERENCES meta_ad_accounts(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS meta_organic_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL UNIQUE,
  asset_key TEXT NOT NULL UNIQUE,
  page_id TEXT UNIQUE,
  page_name TEXT,
  page_username TEXT,
  page_picture_url TEXT,
  instagram_account_id TEXT UNIQUE,
  instagram_username TEXT,
  instagram_name TEXT,
  instagram_picture_url TEXT,
  last_synced_at TEXT,
  last_sync_status TEXT DEFAULT 'never' CHECK(last_sync_status IN ('never','syncing','success','error')),
  last_sync_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_organic_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organic_account_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram')),
  metric_date TEXT NOT NULL,
  reach REAL DEFAULT 0,
  views REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  interactions REAL DEFAULT 0,
  engaged_accounts REAL DEFAULT 0,
  followers REAL DEFAULT 0,
  followers_delta REAL DEFAULT 0,
  profile_views REAL DEFAULT 0,
  website_clicks REAL DEFAULT 0,
  posts_published REAL DEFAULT 0,
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(organic_account_id, platform, metric_date),
  FOREIGN KEY (organic_account_id) REFERENCES meta_organic_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_organic_report_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organic_account_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  followers REAL DEFAULT 0,
  followers_delta REAL DEFAULT 0,
  reach REAL DEFAULT 0,
  views REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  interactions REAL DEFAULT 0,
  engaged_accounts REAL DEFAULT 0,
  profile_views REAL DEFAULT 0,
  website_clicks REAL DEFAULT 0,
  posts_count REAL DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(organic_account_id, platform, date_from, date_to),
  FOREIGN KEY (organic_account_id) REFERENCES meta_organic_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_organic_content_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organic_account_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT,
  caption TEXT,
  permalink TEXT,
  thumbnail_url TEXT,
  published_at TEXT,
  reach REAL DEFAULT 0,
  views REAL DEFAULT 0,
  impressions REAL DEFAULT 0,
  interactions REAL DEFAULT 0,
  likes REAL DEFAULT 0,
  comments REAL DEFAULT 0,
  shares REAL DEFAULT 0,
  saves REAL DEFAULT 0,
  clicks REAL DEFAULT 0,
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(organic_account_id, platform, date_from, date_to, content_id),
  FOREIGN KEY (organic_account_id) REFERENCES meta_organic_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  what_we_want TEXT,
  why_we_want TEXT,
  how_we_will_do TEXT,
  manifesto TEXT,
  diagnosis TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(client_id, year),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_plan_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done')),
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (action_plan_id) REFERENCES action_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_meta_organic_accounts_client ON meta_organic_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_organic_daily_account_date ON meta_organic_daily_metrics(organic_account_id, platform, metric_date);
CREATE INDEX IF NOT EXISTS idx_meta_organic_report_period ON meta_organic_report_snapshots(organic_account_id, platform, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_meta_organic_content_period ON meta_organic_content_snapshots(organic_account_id, platform, date_from, date_to, interactions);
CREATE INDEX IF NOT EXISTS idx_meta_accounts_client ON meta_ad_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_daily_account_date ON meta_daily_metrics(meta_account_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_meta_report_period ON meta_report_snapshots(meta_account_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_period ON meta_campaign_snapshots(meta_account_id, date_from, date_to, spend);
CREATE INDEX IF NOT EXISTS idx_action_plans_client_year ON action_plans(client_id, year);
CREATE INDEX IF NOT EXISTS idx_action_plan_tasks_plan ON action_plan_tasks(action_plan_id, status);

CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_client ON financial_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_client ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_metrics_client_date ON report_metrics(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_status ON tasks(parent_task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_user_client_access_client ON user_client_access(client_id, user_id);
`);

// Migração leve: adiciona colunas novas em bancos já existentes (não falha se já existirem)
function tryAddColumn(table, column, definition) {
  try {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
  } catch (err) {
    // coluna já existe — ignora
  }
}
tryAddColumn('posts', 'media_data', 'TEXT');
tryAddColumn('posts', 'media_mime', 'TEXT');
tryAddColumn('posts', 'share_token', 'TEXT');
tryAddColumn('users', 'avatar_data', 'TEXT');
tryAddColumn('users', 'avatar_mime', 'TEXT');
tryAddColumn('clients', 'avatar_data', 'TEXT');
tryAddColumn('clients', 'avatar_mime', 'TEXT');
tryAddColumn('clients', 'bio', 'TEXT');
tryAddColumn('clients', 'cnpj', 'TEXT');
tryAddColumn('clients', 'address', 'TEXT');
tryAddColumn('clients', 'phone', 'TEXT');
tryAddColumn('clients', 'email', 'TEXT');
tryAddColumn('clients', 'instagram_username', 'TEXT');
tryAddColumn('clients', 'instagram_display_name', 'TEXT');
tryAddColumn('clients', 'instagram_posts_count', 'INTEGER');
tryAddColumn('clients', 'instagram_followers_count', 'INTEGER');
tryAddColumn('clients', 'instagram_following_count', 'INTEGER');
tryAddColumn('clients', 'instagram_link', 'TEXT');
tryAddColumn('clients', 'instagram_primary_action', 'TEXT');
tryAddColumn('clients', 'instagram_secondary_action', 'TEXT');
tryAddColumn('clients', 'instagram_tertiary_action', 'TEXT');
tryAddColumn('tasks', 'parent_task_id', 'INTEGER REFERENCES tasks(id)');
tryAddColumn('tasks', 'content_type', 'TEXT');
tryAddColumn('tasks', 'caption', 'TEXT');
tryAddColumn('tasks', 'feed_post_id', 'INTEGER REFERENCES posts(id)');
tryAddColumn('tasks', 'task_type', "TEXT DEFAULT 'basic'");
tryAddColumn('tasks', 'video_link', 'TEXT');
tryAddColumn('posts', 'media_gallery', 'TEXT');
tryAddColumn('tasks', 'media_gallery', 'TEXT');
tryAddColumn('clients', 'feed_share_token', 'TEXT');

// Fundação multiagência / cobranding. As colunas são adicionadas sem apagar
// registros existentes e, logo abaixo, todos os dados atuais são vinculados
// automaticamente à agência principal.
tryAddColumn('users', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('users', 'is_platform_owner', 'INTEGER DEFAULT 0');
tryAddColumn('users', 'is_agency_owner', 'INTEGER DEFAULT 0');
tryAddColumn('clients', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('social_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('posts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('tasks', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('financial_entries', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('report_metrics', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('meta_ad_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('meta_organic_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('action_plans', 'agency_id', 'INTEGER REFERENCES agencies(id)');

// Migração do módulo financeiro para bancos criados nas primeiras versões.
// A primeira estrutura usava `type = revenue` e `is_recurring`. A versão atual
// usa `type = income`, `recurring`, `payment_method` e `notes`. Como o SQLite
// não permite alterar uma CHECK constraint diretamente, a tabela antiga é
// reconstruída preservando todos os registros.
function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
}

function tableHasColumn(table, column) {
  return tableColumns(table).includes(column);
}

function migrateFinancialEntries() {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'financial_entries'"
  ).get();
  if (!tableInfo) return;

  const originalSql = String(tableInfo.sql || '');
  const columns = tableColumns('financial_entries');
  const usesLegacyRevenueType = originalSql.includes("'revenue'");

  if (usesLegacyRevenueType) {
    const paymentMethodExpression = columns.includes('payment_method') ? 'payment_method' : 'NULL';
    const recurringExpression = columns.includes('recurring')
      ? 'COALESCE(recurring, 0)'
      : columns.includes('is_recurring')
        ? 'COALESCE(is_recurring, 0)'
        : '0';
    const notesExpression = columns.includes('notes') ? 'notes' : 'NULL';

    const migrate = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS financial_entries_migrated');
      db.exec(`
        CREATE TABLE financial_entries_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER,
          client_id INTEGER,
          created_by INTEGER,
          type TEXT NOT NULL CHECK(type IN ('income','expense')),
          category TEXT DEFAULT 'Outros',
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          due_date TEXT NOT NULL,
          paid_date TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
          payment_method TEXT,
          recurring INTEGER DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        );
      `);

      db.exec(`
        INSERT INTO financial_entries_migrated (
          id, agency_id, client_id, created_by, type, category, description, amount,
          due_date, paid_date, status, payment_method, recurring, notes,
          created_at, updated_at
        )
        SELECT
          id,
          agency_id,
          client_id,
          created_by,
          CASE WHEN type = 'revenue' THEN 'income' ELSE type END,
          COALESCE(category, 'Outros'),
          description,
          amount,
          due_date,
          paid_date,
          status,
          ${paymentMethodExpression},
          ${recurringExpression},
          ${notesExpression},
          created_at,
          updated_at
        FROM financial_entries;
      `);

      db.exec('DROP TABLE financial_entries');
      db.exec('ALTER TABLE financial_entries_migrated RENAME TO financial_entries');
      db.exec('CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_entries(due_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_financial_client ON financial_entries(client_id)');
    });

    migrate();
    console.log('[DB] Tabela financeira antiga migrada de revenue/is_recurring para income/recurring.');
    return;
  }

  tryAddColumn('financial_entries', 'payment_method', 'TEXT');
  tryAddColumn('financial_entries', 'recurring', 'INTEGER DEFAULT 0');
  tryAddColumn('financial_entries', 'notes', 'TEXT');

  if (tableHasColumn('financial_entries', 'is_recurring') && tableHasColumn('financial_entries', 'recurring')) {
    db.exec(`
      UPDATE financial_entries
      SET recurring = COALESCE(is_recurring, 0)
      WHERE COALESCE(recurring, 0) = 0
    `);
  }
}

migrateFinancialEntries();

// Cria a agência principal e migra toda a instalação atual para ela.
// O slug pode ser alterado com DEFAULT_AGENCY_SLUG, mas permanece estável
// depois da primeira inicialização para não quebrar links já publicados.
const defaultAgencySlug = String(process.env.DEFAULT_AGENCY_SLUG || 'zebrazul')
  .trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'zebrazul';
const defaultAgencyName = String(process.env.DEFAULT_AGENCY_NAME || 'Zebrazul').trim() || 'Zebrazul';
let defaultAgency = db.prepare('SELECT * FROM agencies WHERE slug = ?').get(defaultAgencySlug);
if (!defaultAgency) {
  const info = db.prepare(`
    INSERT INTO agencies (name, slug, status, plan, product_name)
    VALUES (?, ?, 'active', 'essential', 'Zebrahub')
  `).run(defaultAgencyName, defaultAgencySlug);
  defaultAgency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(info.lastInsertRowid);
}
const defaultAgencyId = Number(defaultAgency.id);

const initializeAgencyScope = db.transaction(() => {
  db.prepare('UPDATE users SET agency_id = ? WHERE agency_id IS NULL').run(defaultAgencyId);
  db.prepare('UPDATE clients SET agency_id = ? WHERE agency_id IS NULL').run(defaultAgencyId);
  db.prepare(`UPDATE social_accounts SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = social_accounts.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE posts SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = posts.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE tasks SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = tasks.client_id), (SELECT agency_id FROM users WHERE users.id = tasks.created_by), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE financial_entries SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = financial_entries.client_id), (SELECT agency_id FROM users WHERE users.id = financial_entries.created_by), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE report_metrics SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = report_metrics.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE meta_ad_accounts SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = meta_ad_accounts.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE meta_organic_accounts SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = meta_organic_accounts.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);
  db.prepare(`UPDATE action_plans SET agency_id = COALESCE((SELECT agency_id FROM clients WHERE clients.id = action_plans.client_id), ?) WHERE agency_id IS NULL`).run(defaultAgencyId);

  const platformOwner = db.prepare('SELECT id FROM users WHERE is_platform_owner = 1 LIMIT 1').get();
  if (!platformOwner) {
    const firstAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND agency_id = ? ORDER BY id LIMIT 1").get(defaultAgencyId);
    if (firstAdmin) {
      db.prepare('UPDATE users SET is_platform_owner = 1, is_agency_owner = 1 WHERE id = ?').run(firstAdmin.id);
    }
  }
});
initializeAgencyScope();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id, role);
  CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id, status, name);
  CREATE INDEX IF NOT EXISTS idx_tasks_agency ON tasks(agency_id, status, due_date);
  CREATE INDEX IF NOT EXISTS idx_posts_agency ON posts(agency_id, status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_financial_agency ON financial_entries(agency_id, due_date);
`);

const installationId = db.prepare("SELECT value FROM system_meta WHERE key = 'installation_id'").get();
if (!installationId) {
  db.prepare("INSERT INTO system_meta (key, value) VALUES ('installation_id', ?)").run(randomUUID());
}

// Na primeira atualização para o controle por cliente, preserva o comportamento
// anterior: membros de equipe já existentes começam com acesso aos clientes atuais.
// Depois disso, novos acessos passam a ser definidos explicitamente pelo administrador.
const accessMigration = db.prepare("SELECT value FROM system_meta WHERE key = 'team_client_access_initialized'").get();
if (!accessMigration) {
  const initializeTeamAccess = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO user_client_access (user_id, client_id)
      SELECT u.id, c.id
      FROM users u
      JOIN clients c ON c.agency_id = u.agency_id
      WHERE u.role = 'team'
    `).run();
    db.prepare("INSERT INTO system_meta (key, value) VALUES ('team_client_access_initialized', '1')").run();
  });
  initializeTeamAccess();
}

db.prepare(
  `INSERT INTO system_meta (key, value, updated_at)
   VALUES ('schema_version', '18', datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
).run();

Object.defineProperties(db, {
  storagePath: { value: databasePath, enumerable: true },
  persistenceConfigured: { value: persistenceConfigured, enumerable: true },
  storageSafe: { value: storageSafe, enumerable: true },
});

module.exports = db;
