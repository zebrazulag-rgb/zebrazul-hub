const crypto = require('crypto');
const db = require('../db/database');

function ensureDesignerApprovalStorage() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS designer_approval_states (
      task_id INTEGER PRIMARY KEY,
      agency_id INTEGER NOT NULL,
      client_id INTEGER,
      direction_status TEXT NOT NULL DEFAULT 'pending',
      direction_feedback TEXT,
      direction_by INTEGER,
      direction_at TEXT,
      client_status TEXT NOT NULL DEFAULT 'waiting',
      client_feedback TEXT,
      client_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (direction_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_designer_approval_states_agency_client
      ON designer_approval_states(agency_id, client_id);

    CREATE TABLE IF NOT EXISTS designer_approval_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agency_id, client_id),
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_designer_approval_links_token
      ON designer_approval_links(token);
  `);
}

ensureDesignerApprovalStorage();

function parseGallery(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function imageGalleryForTask(task) {
  const gallery = parseGallery(task?.media_gallery).filter((item) => {
    const mime = String(item?.mime || item?.type || '').toLowerCase();
    const data = String(item?.data || item?.url || item?.src || '');
    return Boolean(data) && (
      mime.startsWith('image/') ||
      data.startsWith('data:image/') ||
      /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data)
    );
  });

  if (gallery.length) {
    return gallery.map((item) => ({
      data: item.data || item.url || item.src || '',
      mime: item.mime || item.type || 'image/jpeg',
      filename: item.filename || item.name || '',
    }));
  }

  const attachmentData = String(task?.attachment_data || '');
  const attachmentMime = String(task?.attachment_mime || '').toLowerCase();
  const attachmentIsImage = Boolean(attachmentData) && (
    attachmentMime.startsWith('image/') ||
    attachmentData.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(attachmentData)
  );

  return attachmentIsImage
    ? [{ data: attachmentData, mime: task?.attachment_mime || 'image/jpeg', filename: task?.attachment_filename || '' }]
    : [];
}

function defaultApprovalState(task) {
  return {
    task_id: Number(task?.id || 0),
    agency_id: Number(task?.agency_id || 0),
    client_id: task?.client_id ? Number(task.client_id) : null,
    direction_status: 'pending',
    direction_feedback: null,
    direction_by: null,
    direction_at: null,
    client_status: 'waiting',
    client_feedback: null,
    client_at: null,
  };
}

function getApprovalState(taskId, agencyId) {
  ensureDesignerApprovalStorage();
  const row = db.prepare(`
    SELECT task_id, agency_id, client_id, direction_status, direction_feedback,
           direction_by, direction_at, client_status, client_feedback, client_at,
           created_at, updated_at
    FROM designer_approval_states
    WHERE task_id = ? AND agency_id = ?
  `).get(Number(taskId), Number(agencyId));
  return row || null;
}

function getApprovalStates(taskIds, agencyId) {
  ensureDesignerApprovalStorage();
  const ids = [...new Set((taskIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT task_id, agency_id, client_id, direction_status, direction_feedback,
           direction_by, direction_at, client_status, client_feedback, client_at,
           created_at, updated_at
    FROM designer_approval_states
    WHERE agency_id = ? AND task_id IN (${placeholders})
  `).all(Number(agencyId), ...ids);
  rows.forEach((row) => map.set(Number(row.task_id), row));
  return map;
}

function resetApprovalForTask(task) {
  if (!task?.id || !task?.agency_id) return;
  ensureDesignerApprovalStorage();
  db.prepare(`
    INSERT INTO designer_approval_states (
      task_id, agency_id, client_id,
      direction_status, direction_feedback, direction_by, direction_at,
      client_status, client_feedback, client_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', NULL, NULL, NULL, 'waiting', NULL, NULL, datetime('now'), datetime('now'))
    ON CONFLICT(task_id) DO UPDATE SET
      agency_id = excluded.agency_id,
      client_id = excluded.client_id,
      direction_status = 'pending',
      direction_feedback = NULL,
      direction_by = NULL,
      direction_at = NULL,
      client_status = 'waiting',
      client_feedback = NULL,
      client_at = NULL,
      updated_at = datetime('now')
  `).run(Number(task.id), Number(task.agency_id), task.client_id ? Number(task.client_id) : null);
}

function ensureApprovalState(task) {
  let state = getApprovalState(task.id, task.agency_id);
  if (state) return state;
  resetApprovalForTask(task);
  state = getApprovalState(task.id, task.agency_id);
  return state || defaultApprovalState(task);
}

function legacyStatusForWorkflow(stage) {
  if (stage === 'posted') return 'posted';
  if (stage === 'approved' || stage === 'scheduled') return 'done';
  if (['in_progress', 'correction', 'approval'].includes(stage)) return 'in_progress';
  return 'pending';
}

function updateTaskWorkflow(taskId, agencyId, stage) {
  const designerCompleted = stage === 'correction' ? 0 : (['approval', 'approved', 'scheduled', 'posted'].includes(stage) ? 1 : null);
  if (designerCompleted === null) {
    db.prepare(`
      UPDATE tasks
      SET workflow_stage = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(stage, legacyStatusForWorkflow(stage), Number(taskId), Number(agencyId));
    return;
  }
  db.prepare(`
    UPDATE tasks
    SET workflow_stage = ?, status = ?, designer_completed = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(stage, legacyStatusForWorkflow(stage), designerCompleted, Number(taskId), Number(agencyId));
}

function normalizeFeedContentType(contentType) {
  if (contentType === 'carrossel') return 'carrossel';
  if (contentType === 'story' || contentType === 'stories') return 'story';
  return 'feed';
}

function promoteTaskToFeed(task) {
  if (!task?.client_id) throw new Error('A tarefa precisa estar vinculada a um cliente');
  const images = imageGalleryForTask(task);
  if (!images.length) throw new Error('A tarefa precisa ter uma imagem para entrar na grade');

  const galleryJson = images.length ? JSON.stringify(images) : null;
  const mediaData = images[0]?.data || task.attachment_data || null;
  const mediaMime = images[0]?.mime || task.attachment_mime || 'image/jpeg';
  const contentType = normalizeFeedContentType(task.content_type);
  const creatorId = Number(task.created_by || 0) || null;

  if (task.feed_post_id) {
    const existing = db.prepare('SELECT id FROM posts WHERE id = ? AND agency_id = ?').get(Number(task.feed_post_id), Number(task.agency_id));
    if (existing) {
      db.prepare(`
        UPDATE posts
        SET title = ?, caption = ?, content_type = ?, media_data = ?, media_mime = ?, media_gallery = ?,
            scheduled_at = COALESCE(?, scheduled_at), status = 'draft', workflow_stage = 'approved',
            feed_visible = 1, updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(
        task.title,
        task.caption || '',
        contentType,
        mediaData,
        mediaMime,
        galleryJson,
        task.due_date || null,
        Number(existing.id),
        Number(task.agency_id)
      );
      return Number(existing.id);
    }
  }

  const info = db.prepare(`
    INSERT INTO posts (
      agency_id, client_id, created_by, title, caption, content_type, platforms,
      media_data, media_mime, media_gallery, scheduled_at, status, workflow_stage, feed_visible
    ) VALUES (?, ?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, ?, 'draft', 'approved', 1)
  `).run(
    Number(task.agency_id),
    Number(task.client_id),
    creatorId,
    task.title,
    task.caption || '',
    contentType,
    mediaData,
    mediaMime,
    galleryJson,
    task.due_date || null
  );

  db.prepare(`
    UPDATE tasks SET feed_post_id = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(Number(info.lastInsertRowid), Number(task.id), Number(task.agency_id));

  return Number(info.lastInsertRowid);
}

function hideTaskFeed(task, stage = 'correction') {
  if (!task?.feed_post_id) return;
  db.prepare(`
    UPDATE posts
    SET workflow_stage = ?, feed_visible = 0, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(stage, Number(task.feed_post_id), Number(task.agency_id));
}

function setDirectionDecision({ task, userId, decision, feedback = null }) {
  ensureDesignerApprovalStorage();
  if (!task?.id || !task?.agency_id) throw new Error('Tarefa inválida');
  if (!['approved', 'changes_requested'].includes(decision)) throw new Error('Decisão inválida');

  ensureApprovalState(task);
  const now = new Date().toISOString();
  const directionFeedback = String(feedback || '').trim() || null;

  if (decision === 'approved') {
    db.prepare(`
      UPDATE designer_approval_states
      SET direction_status = 'approved', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'pending', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE task_id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    const currentState = getApprovalState(task.id, task.agency_id);
    if (currentState?.client_status !== 'approved') {
      updateTaskWorkflow(task.id, task.agency_id, 'approval');
      db.prepare(`UPDATE tasks SET approval_status = 'pending_approval', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));
    }
  } else {
    db.prepare(`
      UPDATE designer_approval_states
      SET direction_status = 'changes_requested', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'waiting', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE task_id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    updateTaskWorkflow(task.id, task.agency_id, 'correction');
    db.prepare(`UPDATE tasks SET approval_status = 'changes_requested', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
      .run(Number(task.id), Number(task.agency_id));
    try {
      hideTaskFeed(task, 'correction');
    } catch (feedError) {
      console.warn('[DESIGNER_APPROVAL] Não foi possível ocultar o post durante a correção:', feedError.message);
    }
  }

  return getApprovalState(task.id, task.agency_id);
}

function getClientApprovalLink(agencyId, clientId) {
  ensureDesignerApprovalStorage();
  return db.prepare(`
    SELECT id, agency_id, client_id, token, active, created_by, created_at, updated_at
    FROM designer_approval_links
    WHERE agency_id = ? AND client_id = ? AND active = 1
    LIMIT 1
  `).get(Number(agencyId), Number(clientId)) || null;
}

function getOrCreateClientApprovalLink({ agencyId, clientId, createdBy }) {
  ensureDesignerApprovalStorage();
  const existing = getClientApprovalLink(agencyId, clientId);
  if (existing) return existing;

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO designer_approval_links (agency_id, client_id, token, active, created_by)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(agency_id, client_id) DO UPDATE SET
      token = excluded.token,
      active = 1,
      created_by = excluded.created_by,
      updated_at = datetime('now')
  `).run(Number(agencyId), Number(clientId), token, createdBy ? Number(createdBy) : null);

  return getClientApprovalLink(agencyId, clientId);
}

function getLinkByToken(token) {
  ensureDesignerApprovalStorage();
  return db.prepare(`
    SELECT id, agency_id, client_id, token, active, created_by, created_at, updated_at
    FROM designer_approval_links
    WHERE token = ? AND active = 1
    LIMIT 1
  `).get(String(token || '')) || null;
}

function getPublicClientProfile(link) {
  if (!link) return null;
  return db.prepare(`
    SELECT id, agency_id, name, logo_color, avatar_data, bio,
           instagram_username, instagram_display_name,
           instagram_posts_count, instagram_followers_count, instagram_following_count,
           instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action
    FROM clients
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(link.client_id), Number(link.agency_id)) || null;
}

function getPublicApprovalItems(link) {
  if (!link) return [];
  ensureDesignerApprovalStorage();
  const rows = db.prepare(`
    SELECT
      t.id, t.agency_id, t.client_id, t.parent_task_id, t.created_by, t.task_type,
      t.title, t.content_type, t.content_tag, t.front_name, t.caption,
      t.due_date, t.status, t.workflow_stage,
      t.attachment_data, t.attachment_mime, t.attachment_filename, t.media_gallery,
      t.feed_post_id, t.created_at, t.updated_at,
      s.direction_status, s.direction_feedback, s.direction_at,
      s.client_status, s.client_feedback, s.client_at
    FROM tasks t
    JOIN designer_approval_states s ON s.task_id = t.id AND s.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND t.client_id = ?
      AND t.task_type != 'video'
      AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
      AND t.workflow_stage IN ('approval', 'internal_approval', 'external_approval', 'approved', 'correction')
      AND s.direction_status = 'approved'
      AND s.client_status IN ('pending', 'approved', 'changes_requested')
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC
  `).all(Number(link.agency_id), Number(link.client_id));

  return rows.map((task) => {
    const images = imageGalleryForTask(task);
    return {
      id: Number(task.id),
      parent_task_id: task.parent_task_id ? Number(task.parent_task_id) : null,
      title: task.title,
      content_type: task.content_type,
      content_tag: task.content_tag,
      caption: task.caption,
      due_date: task.due_date,
      workflow_stage: 'approval',
      direction_status: task.direction_status || 'approved',
      client_status: task.client_status || 'pending',
      images,
      image_count: images.length,
      updated_at: task.updated_at,
    };
  }).filter((item) => item.image_count > 0);
}

function setClientDecision({ token, taskId, decision, feedback = null }) {
  ensureDesignerApprovalStorage();
  if (!['approved', 'changes_requested'].includes(decision)) throw new Error('Decisão inválida');

  const link = getLinkByToken(token);
  if (!link) return { error: 'LINK_NOT_FOUND' };

  const task = db.prepare(`
    SELECT * FROM tasks
    WHERE id = ? AND agency_id = ? AND client_id = ?
    LIMIT 1
  `).get(Number(taskId), Number(link.agency_id), Number(link.client_id));
  if (!task) return { error: 'TASK_NOT_FOUND' };

  const state = getApprovalState(task.id, task.agency_id);
  if (!state || state.direction_status !== 'approved') return { error: 'NOT_READY' };
  if (!['approval', 'internal_approval', 'external_approval'].includes(String(task.workflow_stage || ''))) {
    return { error: 'NOT_READY' };
  }

  const clientFeedback = String(feedback || '').trim() || null;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    if (decision === 'approved') {
      db.prepare(`
        UPDATE designer_approval_states
        SET client_status = 'approved', client_feedback = ?, client_at = ?, updated_at = datetime('now')
        WHERE task_id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      updateTaskWorkflow(task.id, task.agency_id, 'approved');
      db.prepare(`UPDATE tasks SET approval_status = 'approved', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));
      const refreshed = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(task.id), Number(task.agency_id));
      promoteTaskToFeed(refreshed);
    } else {
      db.prepare(`
        UPDATE designer_approval_states
        SET client_status = 'changes_requested', client_feedback = ?, client_at = ?, updated_at = datetime('now')
        WHERE task_id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      updateTaskWorkflow(task.id, task.agency_id, 'correction');
      db.prepare(`UPDATE tasks SET approval_status = 'changes_requested', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));
      try {
        hideTaskFeed(task, 'correction');
      } catch (feedError) {
        console.warn('[DESIGNER_APPROVAL] Não foi possível ocultar o post durante a correção do cliente:', feedError.message);
      }
    }
  });

  transaction();
  return {
    ok: true,
    decision,
    task_id: Number(task.id),
    state: getApprovalState(task.id, task.agency_id),
  };
}

module.exports = {
  ensureDesignerApprovalStorage,
  getApprovalState,
  getApprovalStates,
  resetApprovalForTask,
  setDirectionDecision,
  getClientApprovalLink,
  getOrCreateClientApprovalLink,
  getLinkByToken,
  getPublicClientProfile,
  getPublicApprovalItems,
  setClientDecision,
  imageGalleryForTask,
};
