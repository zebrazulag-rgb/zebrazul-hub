const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'zebrazul_hub.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
  logo_color TEXT DEFAULT '#0ea5e9',
  avatar_data TEXT,
  avatar_mime TEXT,
  bio TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  responsible_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
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
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT,
  caption TEXT,
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

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_posts_client ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_metrics_client_date ON report_metrics(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
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
tryAddColumn('tasks', 'parent_task_id', 'INTEGER REFERENCES tasks(id)');
tryAddColumn('tasks', 'content_type', 'TEXT');
tryAddColumn('tasks', 'caption', 'TEXT');
tryAddColumn('tasks', 'feed_post_id', 'INTEGER REFERENCES posts(id)');

module.exports = db;
