const fs = require('fs');
const db = require('../db/database');
const { databasePath } = require('../db/config');
const { persistMedia, externalizeGallery } = require('./mediaStorage');

const MIGRATION_KEY = 'media_externalization_v1';

function migratePosts() {
  const rows = db.prepare('SELECT id, media_data, media_mime, media_gallery FROM posts').all();
  const update = db.prepare('UPDATE posts SET media_data = ?, media_gallery = ?, updated_at = datetime(\'now\') WHERE id = ?');
  let changed = 0;
  const transaction = db.transaction(() => {
    rows.forEach((row) => {
      const gallery = externalizeGallery(row.media_gallery, row.media_data, row.media_mime);
      const first = gallery[0] || null;
      const mediaData = first?.data || (row.media_data ? persistMedia(row.media_data, row.media_mime || 'image/jpeg') : null);
      const galleryValue = gallery.length ? JSON.stringify(gallery) : null;
      if (mediaData !== row.media_data || galleryValue !== row.media_gallery) {
        update.run(mediaData, galleryValue, row.id);
        changed += 1;
      }
    });
  });
  transaction();
  return { total: rows.length, changed };
}

function migrateTasks() {
  const rows = db.prepare('SELECT id, attachment_data, attachment_mime, media_gallery FROM tasks').all();
  const update = db.prepare('UPDATE tasks SET attachment_data = ?, media_gallery = ?, updated_at = datetime(\'now\') WHERE id = ?');
  let changed = 0;
  const transaction = db.transaction(() => {
    rows.forEach((row) => {
      const attachment = row.attachment_data ? persistMedia(row.attachment_data, row.attachment_mime || 'application/octet-stream') : null;
      const gallery = externalizeGallery(row.media_gallery);
      const galleryValue = gallery.length ? JSON.stringify(gallery) : null;
      if (attachment !== row.attachment_data || galleryValue !== row.media_gallery) {
        update.run(attachment, galleryValue, row.id);
        changed += 1;
      }
    });
  });
  transaction();
  return { total: rows.length, changed };
}

function migrateSimpleImages(table, idField, dataField, mimeField) {
  const rows = db.prepare(`SELECT ${idField} AS id, ${dataField} AS data, ${mimeField} AS mime FROM ${table} WHERE ${dataField} IS NOT NULL AND length(${dataField}) > 0`).all();
  const update = db.prepare(`UPDATE ${table} SET ${dataField} = ? WHERE ${idField} = ?`);
  let changed = 0;
  const transaction = db.transaction(() => {
    rows.forEach((row) => {
      const next = persistMedia(row.data, row.mime || 'image/jpeg');
      if (next !== row.data) {
        update.run(next, row.id);
        changed += 1;
      }
    });
  });
  transaction();
  return { total: rows.length, changed };
}

function runMediaMigration({ force = false, vacuum = true } = {}) {
  const completed = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(MIGRATION_KEY);
  if (completed && !force) return { skipped: true, reason: 'already_completed', completed_at: completed.value };

  const beforeBytes = fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0;
  const result = {
    skipped: false,
    posts: migratePosts(),
    tasks: migrateTasks(),
    clients: migrateSimpleImages('clients', 'id', 'avatar_data', 'avatar_mime'),
    users: migrateSimpleImages('users', 'id', 'avatar_data', 'avatar_mime'),
    agencies: migrateSimpleImages('agencies', 'id', 'logo_data', 'logo_mime'),
  };

  db.pragma('wal_checkpoint(TRUNCATE)');
  if (vacuum) db.exec('VACUUM');
  const afterBytes = fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0;
  const completedAt = new Date().toISOString();
  db.prepare(`INSERT INTO system_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(MIGRATION_KEY, completedAt);

  return { ...result, before_bytes: beforeBytes, after_bytes: afterBytes, saved_bytes: Math.max(0, beforeBytes - afterBytes), completed_at: completedAt };
}

module.exports = { runMediaMigration, MIGRATION_KEY };
