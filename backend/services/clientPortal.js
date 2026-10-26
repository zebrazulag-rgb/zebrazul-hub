const crypto = require('crypto');
const db = require('../db/database');
const { buildPostedReport, validMonth } = require('./postedReport');

function ensurePortalStorage() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_portal_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agency_id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_client_portal_links_token
      ON client_portal_links(token);
  `);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function ensureFeedToken(client) {
  let token = String(client?.feed_share_token || '').trim();
  if (token) return token;
  token = randomToken(16);
  db.prepare(`
    UPDATE clients SET feed_share_token = ?
    WHERE id = ? AND agency_id = ?
  `).run(token, Number(client.id), Number(client.agency_id));
  return token;
}

function ensureTaskRequestToken({ agencyId, clientId, createdBy }) {
  try {
    let row = db.prepare(`
      SELECT id, token, active
      FROM client_task_request_links
      WHERE agency_id = ? AND client_id = ?
      LIMIT 1
    `).get(Number(agencyId), Number(clientId));

    if (!row) {
      const token = randomToken(32);
      const info = db.prepare(`
        INSERT INTO client_task_request_links (agency_id, client_id, token, active, created_by)
        VALUES (?, ?, ?, 1, ?)
      `).run(Number(agencyId), Number(clientId), token, createdBy ? Number(createdBy) : null);
      row = db.prepare(`SELECT id, token, active FROM client_task_request_links WHERE id = ?`).get(info.lastInsertRowid);
    } else if (Number(row.active) !== 1) {
      db.prepare(`
        UPDATE client_task_request_links
        SET active = 1, updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(Number(row.id), Number(agencyId));
      row = db.prepare(`SELECT id, token, active FROM client_task_request_links WHERE id = ?`).get(Number(row.id));
    }
    return row?.token || null;
  } catch (error) {
    console.warn('[CLIENT_PORTAL] Link de solicitação indisponível:', error.message);
    return null;
  }
}

function ensurePortalLink({ agencyId, clientId, createdBy = null }) {
  ensurePortalStorage();
  const client = db.prepare(`
    SELECT id, agency_id, name, status, feed_share_token
    FROM clients
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(clientId), Number(agencyId));
  if (!client) return null;

  let link = db.prepare(`
    SELECT id, agency_id, client_id, token, active, created_at, updated_at
    FROM client_portal_links
    WHERE agency_id = ? AND client_id = ?
    LIMIT 1
  `).get(Number(agencyId), Number(clientId));

  if (!link) {
    const info = db.prepare(`
      INSERT INTO client_portal_links (agency_id, client_id, token, active, created_by)
      VALUES (?, ?, ?, 1, ?)
    `).run(Number(agencyId), Number(clientId), randomToken(32), createdBy ? Number(createdBy) : null);
    link = db.prepare(`SELECT * FROM client_portal_links WHERE id = ?`).get(info.lastInsertRowid);
  } else if (Number(link.active) !== 1) {
    db.prepare(`
      UPDATE client_portal_links
      SET active = 1, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(Number(link.id), Number(agencyId));
    link = db.prepare(`SELECT * FROM client_portal_links WHERE id = ?`).get(Number(link.id));
  }

  const feedToken = ensureFeedToken(client);
  const requestToken = ensureTaskRequestToken({ agencyId, clientId, createdBy });
  return { ...link, feed_token: feedToken, request_token: requestToken };
}

function portalClientByToken(token) {
  ensurePortalStorage();
  return db.prepare(`
    SELECT
      l.id AS portal_link_id, l.token AS portal_token, l.active AS portal_active,
      c.id, c.agency_id, c.name, c.segment, c.logo_color, c.avatar_data, c.bio,
      c.instagram_username, c.instagram_display_name, c.feed_share_token, c.status,
      a.name AS agency_name, a.logo_data AS agency_logo, a.support_email, a.support_whatsapp
    FROM client_portal_links l
    JOIN clients c ON c.id = l.client_id AND c.agency_id = l.agency_id
    JOIN agencies a ON a.id = l.agency_id
    WHERE l.token = ? AND l.active = 1
    LIMIT 1
  `).get(String(token || '').trim());
}

function parseGallery(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function firstMedia(row) {
  const gallery = parseGallery(row.media_gallery);
  const first = gallery.find((item) => item?.data || item?.url || item?.src);
  return first?.data || first?.url || first?.src || row.media_data || row.media_url || null;
}

function parsePlatforms(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializePost(row) {
  return {
    id: Number(row.id),
    title: row.title || 'Conteúdo',
    caption: row.caption || '',
    content_type: row.content_type || 'feed',
    platforms: parsePlatforms(row.platforms),
    scheduled_at: row.scheduled_at || null,
    status: row.status || 'draft',
    client_feedback: row.client_feedback || '',
    image: firstMedia(row),
    gallery_count: Math.max(parseGallery(row.media_gallery).length, row.media_data ? 1 : 0),
    updated_at: row.updated_at || null,
  };
}

function listPortalMaterials(client) {
  try {
    return db.prepare(`
      SELECT id, title, description, category, original_name, mime_type, file_size, created_at, updated_at,
             CASE WHEN client_id IS NULL THEN 1 ELSE 0 END AS is_global
      FROM materials
      WHERE agency_id = ? AND is_active = 1
        AND (client_id IS NULL OR client_id = ?)
      ORDER BY CASE WHEN client_id = ? THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 30
    `).all(Number(client.agency_id), Number(client.id), Number(client.id)).map((item) => ({
      ...item,
      id: Number(item.id),
      file_size: Number(item.file_size || 0),
      is_global: Number(item.is_global) === 1,
    }));
  } catch (error) {
    console.warn('[CLIENT_PORTAL] Materiais indisponíveis:', error.message);
    return [];
  }
}

function currentRequestToken(client) {
  try {
    return db.prepare(`
      SELECT token
      FROM client_task_request_links
      WHERE agency_id = ? AND client_id = ? AND active = 1
      LIMIT 1
    `).get(Number(client.agency_id), Number(client.id))?.token || null;
  } catch {
    return null;
  }
}

function buildPortalContext({ client, month = null }) {
  const reportMonth = validMonth(month);
  const postRows = db.prepare(`
    SELECT id, title, caption, content_type, platforms, media_url, media_data, media_mime, media_gallery,
           scheduled_at, status, client_feedback, updated_at
    FROM posts
    WHERE agency_id = ? AND client_id = ?
      AND COALESCE(feed_visible, 1) = 1
      AND status IN ('draft','pending_approval','approved','scheduled','published')
    ORDER BY COALESCE(scheduled_at, updated_at, created_at) DESC, id DESC
    LIMIT 120
  `).all(Number(client.agency_id), Number(client.id));

  const posts = postRows.map(serializePost);
  const approvals = posts.filter((post) => post.status === 'pending_approval');

  const today = new Date().toISOString().slice(0, 10);
  const allUpcoming = posts
    .filter((post) => post.scheduled_at && String(post.scheduled_at).slice(0, 10) >= today && post.status !== 'published')
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const upcoming = allUpcoming.slice(0, 24);

  let corrections = 0;
  try {
    corrections = Number(db.prepare(`
      SELECT COUNT(*) AS total
      FROM tasks t
      LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
      WHERE t.agency_id = ?
        AND COALESCE(t.client_id, parent.client_id) = ?
        AND t.workflow_stage = 'correction'
        AND COALESCE(t.is_backlog, 0) = 0
    `).get(Number(client.agency_id), Number(client.id))?.total || 0);
  } catch {}

  const report = buildPostedReport({
    agencyId: Number(client.agency_id),
    clientId: Number(client.id),
    month: reportMonth,
  });

  const feedToken = String(client.feed_share_token || '').trim();
  const requestToken = currentRequestToken(client);
  const materials = listPortalMaterials(client);

  return {
    client: {
      id: Number(client.id),
      name: client.name,
      segment: client.segment || '',
      logo_color: client.logo_color || '#3A85FD',
      avatar_data: client.avatar_data || null,
      bio: client.bio || '',
      instagram_username: client.instagram_username || '',
      instagram_display_name: client.instagram_display_name || '',
    },
    agency: {
      name: client.agency_name || 'Zebrazul',
      logo_data: client.agency_logo || null,
      support_email: client.support_email || '',
      support_whatsapp: client.support_whatsapp || '',
    },
    links: {
      feed_token: feedToken || null,
      request_token: requestToken || null,
    },
    summary: {
      approval_pending: approvals.length,
      corrections,
      upcoming: allUpcoming.length,
      posted_month: Number(report.total || 0),
      materials: materials.length,
    },
    approvals: approvals.slice(0, 18),
    upcoming,
    report,
    materials,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  ensurePortalStorage,
  ensurePortalLink,
  portalClientByToken,
  buildPortalContext,
};
