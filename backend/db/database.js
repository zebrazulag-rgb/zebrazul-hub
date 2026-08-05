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
  is_operations_head INTEGER DEFAULT 0,
  is_commercial_team INTEGER DEFAULT 0,
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
  feed_visible INTEGER DEFAULT 1,
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
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','posted')),
  is_featured INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS commercial_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  stage_key TEXT NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT,
  probability INTEGER DEFAULT 10,
  color_key TEXT DEFAULT 'blue',
  position INTEGER DEFAULT 0,
  stage_type TEXT DEFAULT 'open' CHECK(stage_type IN ('open','won','lost')),
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE(agency_id, client_id, stage_key)
);

CREATE TABLE IF NOT EXISTS commercial_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER,
  created_by INTEGER NOT NULL,
  owner_user_id INTEGER,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  stage TEXT DEFAULT 'new_lead' CHECK(stage IN ('new_lead','contacted','meeting','proposal','negotiation','won','lost')),
  stage_key TEXT,
  estimated_value REAL DEFAULT 0,
  probability INTEGER DEFAULT 10,
  next_action TEXT,
  next_action_date TEXT,
  notes TEXT,
  lost_reason TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commercial_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  activity_type TEXT DEFAULT 'note' CHECK(activity_type IN ('note','call','meeting','email','stage_change','follow_up')),
  description TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES commercial_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
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
  strategic_diagnosis_json TEXT DEFAULT '{}',
  strategic_diagnosis_progress INTEGER DEFAULT 0,
  annual_plan_json TEXT DEFAULT '{}',
  annual_plan_progress INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS planning_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('cycle_90','monthly')),
  period_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT,
  data_json TEXT DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agency_id, client_id, type, period_key),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'shared' CHECK(status IN ('shared','in_progress','submitted','archived')),
  answers_json TEXT DEFAULT '{}',
  scores_json TEXT,
  overall_score REAL DEFAULT 0,
  progress INTEGER DEFAULT 0,
  respondent_name TEXT,
  created_by INTEGER,
  submitted_at TEXT,
  last_saved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_dme_consolidations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  assessment_ids_json TEXT NOT NULL DEFAULT '[]',
  source_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  usage_json TEXT,
  response_ids_json TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agency_id, client_id, source_hash),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS material_boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  data_json TEXT NOT NULL DEFAULT '{"version":1,"background":"#f8fafc","elements":[]}',
  revision INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Material interativo',
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'text/html',
  file_size INTEGER NOT NULL DEFAULT 0,
  seed_key TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agency_id, client_id, seed_key),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);



CREATE TABLE IF NOT EXISTS video_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  task_id INTEGER,
  post_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('draft','pending_approval','changes_requested','approved','rejected','archived')),
  due_date TEXT,
  current_version_id INTEGER,
  approved_version_id INTEGER,
  drive_file_id TEXT,
  drive_file_name TEXT,
  drive_web_view_link TEXT,
  drive_web_content_link TEXT,
  drive_upload_status TEXT DEFAULT 'not_sent' CHECK(drive_upload_status IN ('not_sent','sending','sent','error')),
  drive_last_error TEXT,
  created_by INTEGER,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS video_review_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  stream_token TEXT NOT NULL UNIQUE,
  notes TEXT,
  decision_status TEXT DEFAULT 'pending' CHECK(decision_status IN ('pending','approved','changes_requested','rejected','superseded')),
  uploaded_by INTEGER,
  submitted_at TEXT DEFAULT (datetime('now')),
  decision_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(review_id, version_number),
  FOREIGN KEY (review_id) REFERENCES video_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS video_review_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  user_id INTEGER,
  timestamp_seconds REAL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolved_by INTEGER,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (review_id) REFERENCES video_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES video_review_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS video_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  version_id INTEGER,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (review_id) REFERENCES video_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES video_review_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS meta_oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL UNIQUE,
  provider_user_id TEXT,
  provider_user_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  page_access_token_encrypted TEXT,
  token_expires_at TEXT,
  scopes_json TEXT DEFAULT '[]',
  selected_page_id TEXT,
  selected_instagram_account_id TEXT,
  selected_ad_account_id TEXT,
  status TEXT DEFAULT 'connected' CHECK(status IN ('connected','expired','error','disconnected')),
  last_error TEXT,
  connected_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meta_oauth_states (
  nonce TEXT PRIMARY KEY,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  frontend_origin TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS instagram_oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL UNIQUE,
  instagram_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  profile_picture_url TEXT,
  account_type TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TEXT,
  scopes_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'connected' CHECK(status IN ('connected','expired','error','disconnected')),
  last_error TEXT,
  connected_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS instagram_oauth_states (
  nonce TEXT PRIMARY KEY,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  frontend_origin TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS instagram_story_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL UNIQUE,
  enabled INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'manual' CHECK(mode IN ('manual','automatic')),
  allowed_usernames_json TEXT DEFAULT '[]',
  subscribed_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS instagram_story_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  oauth_connection_id INTEGER,
  instagram_oauth_connection_id INTEGER,
  event_key TEXT NOT NULL UNIQUE,
  meta_message_id TEXT,
  source_kind TEXT DEFAULT 'media_message' CHECK(source_kind IN ('story_mention','media_message')),
  sender_igsid TEXT,
  sender_username TEXT,
  sender_name TEXT,
  sender_profile_picture_url TEXT,
  source_media_url TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_type TEXT CHECK(media_type IN ('image','video')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','publishing','published','ignored','failed','expired')),
  published_container_id TEXT,
  published_media_id TEXT,
  publish_channel TEXT DEFAULT 'instagram_login',
  tagging_username TEXT,
  tagging_payload_json TEXT,
  tagging_meta_response_json TEXT,
  error_message TEXT,
  raw_payload_json TEXT DEFAULT '{}',
  received_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  published_at TEXT,
  ignored_at TEXT,
  ignored_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (oauth_connection_id) REFERENCES meta_oauth_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (instagram_oauth_connection_id) REFERENCES instagram_oauth_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (ignored_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS instagram_story_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  object_type TEXT,
  payload_json TEXT NOT NULL,
  status TEXT DEFAULT 'received' CHECK(status IN ('received','processed','ignored','failed')),
  error_message TEXT,
  received_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_video_reviews_scope ON video_reviews(agency_id, client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_versions_review ON video_review_versions(review_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_video_comments_review ON video_review_comments(review_id, version_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_video_events_review ON video_review_events(review_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_oauth_client ON meta_oauth_connections(agency_id, client_id);
CREATE INDEX IF NOT EXISTS idx_meta_oauth_state_expiry ON meta_oauth_states(expires_at, used_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_oauth_user ON instagram_oauth_connections(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_client ON instagram_oauth_connections(agency_id, client_id);
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_state_expiry ON instagram_oauth_states(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_story_settings_client ON instagram_story_settings(agency_id, client_id);
CREATE INDEX IF NOT EXISTS idx_story_mentions_scope ON instagram_story_mentions(agency_id, client_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_mentions_sender ON instagram_story_mentions(client_id, sender_username, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_webhook_status ON instagram_story_webhook_events(status, received_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_planning_documents_client_period ON planning_documents(agency_id, client_id, type, year, period_key);
CREATE INDEX IF NOT EXISTS idx_diagnostics_client_created ON diagnostic_assessments(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostics_agency_status ON diagnostic_assessments(agency_id, status, updated_at DESC);

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
tryAddColumn('posts', 'feed_visible', 'INTEGER DEFAULT 1');
tryAddColumn('tasks', 'media_gallery', 'TEXT');
tryAddColumn('tasks', 'is_featured', 'INTEGER DEFAULT 0');
tryAddColumn('clients', 'feed_share_token', 'TEXT');

// Fundação multiagência / cobranding. As colunas são adicionadas sem apagar
// registros existentes e, logo abaixo, todos os dados atuais são vinculados
// automaticamente à agência principal.
tryAddColumn('users', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('users', 'is_platform_owner', 'INTEGER DEFAULT 0');
tryAddColumn('users', 'is_agency_owner', 'INTEGER DEFAULT 0');
tryAddColumn('users', 'is_operations_head', 'INTEGER DEFAULT 0');
tryAddColumn('users', 'is_commercial_team', 'INTEGER DEFAULT 0');
tryAddColumn('commercial_leads', 'client_id', 'INTEGER REFERENCES clients(id)');
tryAddColumn('commercial_leads', 'stage_key', 'TEXT');
tryAddColumn('clients', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('social_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('posts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('tasks', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('financial_entries', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('report_metrics', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('meta_ad_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('meta_organic_accounts', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('meta_ad_accounts', 'oauth_connection_id', 'INTEGER REFERENCES meta_oauth_connections(id)');
tryAddColumn('meta_organic_accounts', 'oauth_connection_id', 'INTEGER REFERENCES meta_oauth_connections(id)');
tryAddColumn('instagram_story_mentions', 'instagram_oauth_connection_id', 'INTEGER');
tryAddColumn('instagram_story_mentions', 'publish_channel', "TEXT DEFAULT 'instagram_login'");
tryAddColumn('instagram_story_mentions', 'tagging_username', 'TEXT');
tryAddColumn('instagram_story_mentions', 'tagging_payload_json', 'TEXT');
tryAddColumn('instagram_story_mentions', 'tagging_meta_response_json', 'TEXT');
tryAddColumn('action_plans', 'agency_id', 'INTEGER REFERENCES agencies(id)');
tryAddColumn('action_plans', 'strategic_diagnosis_json', "TEXT DEFAULT '{}'");
tryAddColumn('action_plans', 'strategic_diagnosis_progress', 'INTEGER DEFAULT 0');
tryAddColumn('action_plans', 'annual_plan_json', "TEXT DEFAULT '{}'");
tryAddColumn('action_plans', 'annual_plan_progress', 'INTEGER DEFAULT 0');

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

// A primeira versão do módulo de tarefas limitava o status a três etapas.
// Como o SQLite não permite editar uma CHECK constraint existente, a tabela
// é reconstruída uma única vez para incluir a etapa final "posted" sem perder
// tarefas, subtarefas, responsáveis, anexos ou vínculos com o Feed.
function migrateTaskStatuses() {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
  ).get();
  if (!tableInfo) return;

  const originalSql = String(tableInfo.sql || '');
  if (originalSql.includes("'posted'")) return;

  const foreignKeysWereEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  db.pragma('foreign_keys = OFF');

  try {
    const migrate = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS tasks_migrated');
      db.exec(`
        CREATE TABLE tasks_migrated (
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
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','posted')),
          is_featured INTEGER DEFAULT 0,
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
      `);

      db.exec(`
        INSERT INTO tasks_migrated (
          id, agency_id, client_id, created_by, assignee_id, parent_task_id,
          task_type, title, description, content_type, caption, video_link,
          media_gallery, due_date, status, is_featured, attachment_data,
          attachment_mime, attachment_filename, feed_post_id, created_at, updated_at
        )
        SELECT
          id, COALESCE(agency_id, (SELECT id FROM agencies ORDER BY id LIMIT 1), 1),
          client_id, created_by, assignee_id, parent_task_id,
          COALESCE(task_type, 'basic'), title, description, content_type, caption,
          video_link, media_gallery, due_date, status, COALESCE(is_featured, 0),
          attachment_data, attachment_mime, attachment_filename, feed_post_id,
          created_at, updated_at
        FROM tasks;
      `);

      db.exec('DROP TABLE tasks');
      db.exec('ALTER TABLE tasks_migrated RENAME TO tasks');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent_status ON tasks(parent_task_id, status)');
    });

    migrate();
    console.log('[DB] Status "posted" adicionado às tarefas.');
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysWereEnabled ? 'ON' : 'OFF'}`);
  }

  const violations = db.pragma('foreign_key_check');
  if (violations.length) {
    console.warn('[DB] A migração de tarefas concluiu com avisos de integridade:', violations);
  }
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

migrateTaskStatuses();
migrateFinancialEntries();

// Posts antigos devem continuar visíveis na grade após a criação da coluna.
if (tableHasColumn('posts', 'feed_visible')) {
  db.exec('UPDATE posts SET feed_visible = 1 WHERE feed_visible IS NULL');
}

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

// O módulo Comercial agora pertence a cada cliente. Registros criados na versão
// anterior não tinham client_id. Quando uma agência possui apenas um cliente,
// a associação é inequívoca e pode ser feita automaticamente sem perder dados.
const commercialClientScopeMigration = db.prepare("SELECT value FROM system_meta WHERE key = 'commercial_client_scope_initialized'").get();
if (!commercialClientScopeMigration) {
  const initializeCommercialClientScope = db.transaction(() => {
    db.exec(`
      UPDATE commercial_leads
      SET client_id = (
        SELECT MIN(c.id)
        FROM clients c
        WHERE c.agency_id = commercial_leads.agency_id
      )
      WHERE client_id IS NULL
        AND 1 = (
          SELECT COUNT(*)
          FROM clients c
          WHERE c.agency_id = commercial_leads.agency_id
        )
    `);
    db.prepare("INSERT INTO system_meta (key, value) VALUES ('commercial_client_scope_initialized', '1')").run();
  });
  initializeCommercialClientScope();
}

// Preserva o valor das etapas antigas e passa a usar `stage_key` para permitir
// quadros personalizados sem reconstruir a tabela legada, que possui CHECK fixo.
if (tableHasColumn('commercial_leads', 'stage_key')) {
  db.exec(`
    UPDATE commercial_leads
    SET stage_key = stage
    WHERE stage_key IS NULL OR trim(stage_key) = ''
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id, role);
  CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id, status, name);
  CREATE INDEX IF NOT EXISTS idx_tasks_agency ON tasks(agency_id, status, due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_featured ON tasks(agency_id, is_featured, status, due_date);
  CREATE INDEX IF NOT EXISTS idx_commercial_leads_stage ON commercial_leads(agency_id, stage, updated_at);
  CREATE INDEX IF NOT EXISTS idx_commercial_leads_stage_key ON commercial_leads(agency_id, client_id, stage_key, updated_at);
  CREATE INDEX IF NOT EXISTS idx_commercial_stages_client_position ON commercial_stages(agency_id, client_id, position);
  CREATE INDEX IF NOT EXISTS idx_commercial_leads_client_stage ON commercial_leads(agency_id, client_id, stage, updated_at);
  CREATE INDEX IF NOT EXISTS idx_commercial_leads_next_action ON commercial_leads(agency_id, next_action_date);
  CREATE INDEX IF NOT EXISTS idx_commercial_activities_lead ON commercial_activities(agency_id, lead_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_agency ON posts(agency_id, status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_financial_agency ON financial_entries(agency_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_ai_dme_consolidations_client ON ai_dme_consolidations(agency_id, client_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_material_boards_agency_client ON material_boards(agency_id, client_id, is_active, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_materials_agency_client ON materials(agency_id, client_id, is_active, created_at DESC);
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
   VALUES ('schema_version', '29', datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
).run();

Object.defineProperties(db, {
  storagePath: { value: databasePath, enumerable: true },
  persistenceConfigured: { value: persistenceConfigured, enumerable: true },
  storageSafe: { value: storageSafe, enumerable: true },
});

module.exports = db;
