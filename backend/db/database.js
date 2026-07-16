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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','team','client')),
  client_id INTEGER,
  avatar_color TEXT DEFAULT '#2563eb',
  avatar_data TEXT,
  avatar_mime TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
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
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook','tiktok','linkedin','google_business','youtube')),
  handle TEXT,
  connected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (feed_post_id) REFERENCES posts(id) ON DELETE SET NULL
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS report_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS action_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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
tryAddColumn('tasks', 'parent_task_id', 'INTEGER REFERENCES tasks(id)');
tryAddColumn('tasks', 'content_type', 'TEXT');
tryAddColumn('tasks', 'caption', 'TEXT');
tryAddColumn('tasks', 'feed_post_id', 'INTEGER REFERENCES posts(id)');
tryAddColumn('tasks', 'task_type', "TEXT DEFAULT 'basic'");
tryAddColumn('tasks', 'video_link', 'TEXT');
tryAddColumn('posts', 'media_gallery', 'TEXT');
tryAddColumn('tasks', 'media_gallery', 'TEXT');
tryAddColumn('clients', 'feed_share_token', 'TEXT');


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
      FROM users u CROSS JOIN clients c
      WHERE u.role = 'team'
    `).run();
    db.prepare("INSERT INTO system_meta (key, value) VALUES ('team_client_access_initialized', '1')").run();
  });
  initializeTeamAccess();
}

db.prepare(
  `INSERT INTO system_meta (key, value, updated_at)
   VALUES ('schema_version', '15', datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
).run();

Object.defineProperties(db, {
  storagePath: { value: databasePath, enumerable: true },
  persistenceConfigured: { value: persistenceConfigured, enumerable: true },
  storageSafe: { value: storageSafe, enumerable: true },
});

module.exports = db;
