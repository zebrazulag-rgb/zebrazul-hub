const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/database');
const { authRequired, requireRole, canAccessClient } = require('../middleware/auth');
const { videoStorageDirectory } = require('../db/config');
const { driveConfig, uploadApprovedVideo } = require('../services/googleDriveVideo');

fs.mkdirSync(videoStorageDirectory, { recursive: true });

const router = express.Router();
router.use(authRequired);

const requestedMaxUploadMb = Number(process.env.VIDEO_MAX_UPLOAD_MB || 750);
const MAX_VIDEO_MB = Number.isFinite(requestedMaxUploadMb) && requestedMaxUploadMb > 0
  ? Math.max(25, requestedMaxUploadMb)
  : 750;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const allowedMimeTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

function sanitizeFileName(value) {
  return String(value || 'video')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160) || 'video';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, videoStorageDirectory),
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname || '') || '.mp4';
      const base = sanitizeFileName(path.basename(file.originalname || 'video', ext));
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${base}${ext.toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      return callback(new Error('Formato de vídeo não suportado. Envie MP4, WebM, MOV ou M4V.'));
    }
    callback(null, true);
  },
});

function removeUploadedFile(file) {
  if (!file?.path) return;
  try { fs.unlinkSync(file.path); } catch {}
}

function ensureClientAccess(req, res, clientId) {
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não tem acesso a este cliente' });
    return false;
  }
  return true;
}

function scopedReview(req, reviewId) {
  const review = db.prepare(`
    SELECT vr.*, c.name AS client_name, c.avatar_data AS client_avatar,
           t.title AS task_title, p.title AS post_title,
           creator.name AS created_by_name,
           approver.name AS approved_by_name
    FROM video_reviews vr
    JOIN clients c ON c.id = vr.client_id AND c.agency_id = vr.agency_id
    LEFT JOIN tasks t ON t.id = vr.task_id AND t.agency_id = vr.agency_id
    LEFT JOIN posts p ON p.id = vr.post_id AND p.agency_id = vr.agency_id
    LEFT JOIN users creator ON creator.id = vr.created_by
    LEFT JOIN users approver ON approver.id = vr.approved_by
    WHERE vr.id = ? AND vr.agency_id = ?
  `).get(Number(reviewId), Number(req.user.agency_id));
  if (!review || !canAccessClient(req.user, review.client_id)) return null;
  return review;
}

function appendAccessScope(req, query, params) {
  query += ' AND vr.agency_id = ?';
  params.push(Number(req.user.agency_id));
  if (req.user.role === 'admin' || req.user.is_operations_head) return query;
  if (req.user.role === 'client') {
    query += ' AND vr.client_id = ?';
    params.push(Number(req.user.client_id));
    return query;
  }
  const ids = Array.isArray(req.user.client_ids) ? req.user.client_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return `${query} AND 0`;
  query += ` AND vr.client_id IN (${ids.map(() => '?').join(',')})`;
  params.push(...ids);
  return query;
}

function versionStreamUrl(version) {
  return version?.stream_token ? `/public/video-reviews/stream/${version.stream_token}` : null;
}

function normalizeVersion(version) {
  if (!version) return null;
  return {
    ...version,
    file_size: Number(version.file_size || 0),
    version_number: Number(version.version_number || 0),
    stream_url: versionStreamUrl(version),
    download_url: versionStreamUrl(version) ? `${versionStreamUrl(version)}?download=1` : null,
  };
}

function addEvent(reviewId, versionId, userId, eventType, message = null, metadata = {}) {
  db.prepare(`
    INSERT INTO video_review_events (review_id, version_id, user_id, event_type, message, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(reviewId, versionId || null, userId || null, eventType, message || null, JSON.stringify(metadata || {}));
}

function validateLinks(req, res, { clientId, taskId, postId }) {
  if (taskId) {
    const task = db.prepare('SELECT id, client_id FROM tasks WHERE id = ? AND agency_id = ?').get(taskId, req.user.agency_id);
    if (!task || Number(task.client_id) !== Number(clientId)) {
      res.status(400).json({ error: 'A tarefa selecionada não pertence ao cliente do vídeo' });
      return false;
    }
  }
  if (postId) {
    const post = db.prepare('SELECT id, client_id FROM posts WHERE id = ? AND agency_id = ?').get(postId, req.user.agency_id);
    if (!post || Number(post.client_id) !== Number(clientId)) {
      res.status(400).json({ error: 'A publicação selecionada não pertence ao cliente do vídeo' });
      return false;
    }
  }
  return true;
}


async function exportApprovedReviewToDrive(reviewId, actorUserId) {
  const review = db.prepare(`
    SELECT vr.*, c.name AS client_name
    FROM video_reviews vr
    JOIN clients c ON c.id = vr.client_id AND c.agency_id = vr.agency_id
    WHERE vr.id = ?
  `).get(Number(reviewId));
  if (!review) throw new Error('Revisão de vídeo não encontrada');
  if (review.status !== 'approved' || !review.approved_version_id) {
    throw new Error('Apenas a versão aprovada pode ser enviada ao Google Drive');
  }

  const version = db.prepare('SELECT * FROM video_review_versions WHERE id = ? AND review_id = ?')
    .get(review.approved_version_id, review.id);
  if (!version) throw new Error('Versão aprovada não encontrada');

  const filePath = path.join(videoStorageDirectory, path.basename(version.stored_name));
  if (!fs.existsSync(filePath)) throw new Error('Arquivo aprovado não está disponível no armazenamento');

  db.prepare("UPDATE video_reviews SET drive_upload_status = 'sending', drive_last_error = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(review.id);

  try {
    const ext = path.extname(version.original_name || '') || '.mp4';
    const approvedName = `${sanitizeFileName(review.client_name)}_${sanitizeFileName(review.title)}_v${String(version.version_number).padStart(2, '0')}_APROVADO${ext.toLowerCase()}`;
    const result = await uploadApprovedVideo({
      filePath,
      fileName: approvedName,
      mimeType: version.mime_type,
      fileSize: version.file_size,
      clientName: review.client_name,
      approvedAt: review.approved_at ? new Date(`${review.approved_at}Z`) : new Date(),
    });

    db.prepare(`
      UPDATE video_reviews
      SET drive_file_id = ?, drive_file_name = ?, drive_web_view_link = ?, drive_web_content_link = ?,
          drive_upload_status = 'sent', drive_last_error = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(result.id || null, result.name || approvedName, result.webViewLink || null, result.webContentLink || null, review.id);
    addEvent(review.id, version.id, actorUserId, 'drive_exported', 'Versão aprovada enviada ao Google Drive', {
      file_id: result.id,
      file_name: result.name,
    });
    return result;
  } catch (error) {
    db.prepare("UPDATE video_reviews SET drive_upload_status = 'error', drive_last_error = ?, updated_at = datetime('now') WHERE id = ?")
      .run(String(error.message || 'Falha ao enviar ao Drive').slice(0, 1000), review.id);
    throw error;
  }
}

router.get('/config', (req, res) => {
  res.json({
    max_upload_mb: Math.round(MAX_VIDEO_MB),
    accepted_formats: ['MP4', 'WebM', 'MOV', 'M4V'],
    google_drive_configured: driveConfig().configured,
  });
});

router.get('/', (req, res) => {
  const { client_id, status, search } = req.query;
  let query = `
    SELECT vr.*, c.name AS client_name, c.avatar_data AS client_avatar,
           creator.name AS created_by_name,
           current_version.version_number AS current_version_number,
           current_version.original_name AS current_version_name,
           current_version.file_size AS current_version_size,
           current_version.mime_type AS current_version_mime,
           current_version.stream_token AS current_stream_token,
           (SELECT COUNT(*) FROM video_review_versions v WHERE v.review_id = vr.id) AS version_count,
           (SELECT COUNT(*) FROM video_review_comments vc WHERE vc.review_id = vr.id AND vc.status = 'open') AS open_comment_count,
           (SELECT COUNT(*) FROM video_review_comments vc WHERE vc.review_id = vr.id) AS comment_count
    FROM video_reviews vr
    JOIN clients c ON c.id = vr.client_id AND c.agency_id = vr.agency_id
    LEFT JOIN users creator ON creator.id = vr.created_by
    LEFT JOIN video_review_versions current_version ON current_version.id = vr.current_version_id
    WHERE vr.status != 'archived'
  `;
  const params = [];
  query = appendAccessScope(req, query, params);

  if (client_id) {
    if (!ensureClientAccess(req, res, client_id)) return;
    query += ' AND vr.client_id = ?';
    params.push(Number(client_id));
  }
  if (status && status !== 'all') {
    query += ' AND vr.status = ?';
    params.push(String(status));
  }
  if (search) {
    query += " AND (lower(vr.title) LIKE ? OR lower(c.name) LIKE ? OR lower(COALESCE(vr.description, '')) LIKE ?)";
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term);
  }
  query += ' ORDER BY CASE vr.status WHEN \'pending_approval\' THEN 0 WHEN \'changes_requested\' THEN 1 ELSE 2 END, vr.updated_at DESC';

  const reviews = db.prepare(query).all(...params).map((row) => ({
    ...row,
    version_count: Number(row.version_count || 0),
    open_comment_count: Number(row.open_comment_count || 0),
    comment_count: Number(row.comment_count || 0),
    current_version: row.current_version_id ? normalizeVersion({
      id: row.current_version_id,
      version_number: row.current_version_number,
      original_name: row.current_version_name,
      file_size: row.current_version_size,
      mime_type: row.current_version_mime,
      stream_token: row.current_stream_token,
    }) : null,
  }));

  const statsQueryBase = `SELECT status, COUNT(*) AS total FROM video_reviews vr WHERE vr.status != 'archived'`;
  const statsParams = [];
  let statsQuery = appendAccessScope(req, statsQueryBase, statsParams);
  if (client_id) {
    statsQuery += ' AND vr.client_id = ?';
    statsParams.push(Number(client_id));
  }
  statsQuery += ' GROUP BY status';
  const statusRows = db.prepare(statsQuery).all(...statsParams);
  const stats = { total: 0, pending_approval: 0, changes_requested: 0, approved: 0, rejected: 0, draft: 0 };
  statusRows.forEach((row) => {
    stats[row.status] = Number(row.total || 0);
    stats.total += Number(row.total || 0);
  });

  res.json({ reviews, stats });
});

router.get('/:id', (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });

  const versions = db.prepare(`
    SELECT v.*, u.name AS uploaded_by_name
    FROM video_review_versions v
    LEFT JOIN users u ON u.id = v.uploaded_by
    WHERE v.review_id = ?
    ORDER BY v.version_number DESC
  `).all(review.id).map(normalizeVersion);

  const comments = db.prepare(`
    SELECT vc.*, u.name AS user_name, u.role AS user_role,
           resolver.name AS resolved_by_name,
           v.version_number
    FROM video_review_comments vc
    JOIN video_review_versions v ON v.id = vc.version_id
    LEFT JOIN users u ON u.id = vc.user_id
    LEFT JOIN users resolver ON resolver.id = vc.resolved_by
    WHERE vc.review_id = ?
    ORDER BY vc.status ASC, COALESCE(vc.timestamp_seconds, 999999) ASC, vc.created_at ASC
  `).all(review.id).map((comment) => ({
    ...comment,
    timestamp_seconds: comment.timestamp_seconds == null ? null : Number(comment.timestamp_seconds),
  }));

  const events = db.prepare(`
    SELECT ve.*, u.name AS user_name, v.version_number
    FROM video_review_events ve
    LEFT JOIN users u ON u.id = ve.user_id
    LEFT JOIN video_review_versions v ON v.id = ve.version_id
    WHERE ve.review_id = ?
    ORDER BY ve.created_at DESC, ve.id DESC
  `).all(review.id).map((event) => {
    let metadata = {};
    try { metadata = JSON.parse(event.metadata_json || '{}'); } catch {}
    return { ...event, metadata };
  });

  res.json({
    review: {
      ...review,
      current_version: versions.find((version) => Number(version.id) === Number(review.current_version_id)) || null,
      approved_version: versions.find((version) => Number(version.id) === Number(review.approved_version_id)) || null,
      drive_configured: driveConfig().configured,
    },
    versions,
    comments,
    events,
  });
});

router.post('/', requireRole('admin', 'team'), upload.single('video'), (req, res) => {
  try {
    const clientId = Number(req.body.client_id);
    const title = String(req.body.title || '').trim();
    const taskId = req.body.task_id ? Number(req.body.task_id) : null;
    const postId = req.body.post_id ? Number(req.body.post_id) : null;
    if (!clientId || !title || !req.file) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'Cliente, título e arquivo de vídeo são obrigatórios' });
    }
    if (!ensureClientAccess(req, res, clientId)) {
      removeUploadedFile(req.file);
      return;
    }
    if (!validateLinks(req, res, { clientId, taskId, postId })) {
      removeUploadedFile(req.file);
      return;
    }

    const transaction = db.transaction(() => {
      const reviewInfo = db.prepare(`
        INSERT INTO video_reviews (
          agency_id, client_id, task_id, post_id, title, description, status, due_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)
      `).run(
        req.user.agency_id,
        clientId,
        taskId,
        postId,
        title,
        String(req.body.description || '').trim() || null,
        req.body.due_date || null,
        req.user.id
      );
      const reviewId = Number(reviewInfo.lastInsertRowid);
      const versionInfo = db.prepare(`
        INSERT INTO video_review_versions (
          review_id, version_number, original_name, stored_name, mime_type, file_size, stream_token, notes, uploaded_by
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reviewId,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        crypto.randomBytes(24).toString('hex'),
        String(req.body.version_notes || '').trim() || null,
        req.user.id
      );
      const versionId = Number(versionInfo.lastInsertRowid);
      db.prepare(`UPDATE video_reviews SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(versionId, reviewId);
      addEvent(reviewId, versionId, req.user.id, 'review_created', 'Vídeo enviado para aprovação', { version_number: 1 });
      return { reviewId, versionId };
    });

    const result = transaction();
    res.status(201).json({ id: result.reviewId, version_id: result.versionId });
  } catch (error) {
    removeUploadedFile(req.file);
    throw error;
  }
});

router.put('/:id', requireRole('admin', 'team'), (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });

  const allowed = ['title', 'description', 'due_date', 'task_id', 'post_id'];
  const updates = [];
  const values = [];
  const nextTaskId = Object.prototype.hasOwnProperty.call(req.body, 'task_id') ? (req.body.task_id ? Number(req.body.task_id) : null) : review.task_id;
  const nextPostId = Object.prototype.hasOwnProperty.call(req.body, 'post_id') ? (req.body.post_id ? Number(req.body.post_id) : null) : review.post_id;
  if (!validateLinks(req, res, { clientId: review.client_id, taskId: nextTaskId, postId: nextPostId })) return;

  allowed.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) return;
    if (field === 'title' && !String(req.body.title || '').trim()) return;
    updates.push(`${field} = ?`);
    if (['task_id', 'post_id'].includes(field)) values.push(req.body[field] ? Number(req.body[field]) : null);
    else values.push(String(req.body[field] || '').trim() || null);
  });
  if (!updates.length) return res.json({ ok: true });
  db.prepare(`UPDATE video_reviews SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
    .run(...values, review.id, req.user.agency_id);
  addEvent(review.id, review.current_version_id, req.user.id, 'review_updated', 'Informações da revisão atualizadas');
  res.json({ ok: true });
});

router.post('/:id/versions', requireRole('admin', 'team'), upload.single('video'), (req, res) => {
  try {
    const review = scopedReview(req, req.params.id);
    if (!review) {
      removeUploadedFile(req.file);
      return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
    }
    if (!req.file) return res.status(400).json({ error: 'Selecione o arquivo da nova versão' });

    const transaction = db.transaction(() => {
      const currentMax = db.prepare('SELECT MAX(version_number) AS max_version FROM video_review_versions WHERE review_id = ?').get(review.id);
      const versionNumber = Number(currentMax?.max_version || 0) + 1;
      db.prepare(`
        UPDATE video_review_versions
        SET decision_status = CASE WHEN decision_status = 'pending' THEN 'superseded' ELSE decision_status END
        WHERE review_id = ?
      `).run(review.id);
      const info = db.prepare(`
        INSERT INTO video_review_versions (
          review_id, version_number, original_name, stored_name, mime_type, file_size, stream_token, notes, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        review.id,
        versionNumber,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        crypto.randomBytes(24).toString('hex'),
        String(req.body.notes || '').trim() || null,
        req.user.id
      );
      const versionId = Number(info.lastInsertRowid);
      db.prepare(`
        UPDATE video_reviews
        SET current_version_id = ?, status = 'pending_approval', approved_version_id = NULL,
            approved_by = NULL, approved_at = NULL,
            drive_file_id = NULL, drive_file_name = NULL, drive_web_view_link = NULL, drive_web_content_link = NULL,
            drive_upload_status = 'not_sent', drive_last_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(versionId, review.id);
      addEvent(review.id, versionId, req.user.id, 'version_uploaded', `Versão ${versionNumber} enviada para aprovação`, { version_number: versionNumber });
      return { versionId, versionNumber };
    });
    const result = transaction();
    res.status(201).json({ version_id: result.versionId, version_number: result.versionNumber });
  } catch (error) {
    removeUploadedFile(req.file);
    throw error;
  }
});

router.post('/:id/comments', (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
  const versionId = Number(req.body.version_id || review.current_version_id);
  const version = db.prepare('SELECT id, version_number FROM video_review_versions WHERE id = ? AND review_id = ?').get(versionId, review.id);
  if (!version) return res.status(400).json({ error: 'Versão inválida' });
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Escreva o feedback' });
  const timestamp = req.body.timestamp_seconds == null || req.body.timestamp_seconds === ''
    ? null
    : Math.max(0, Number(req.body.timestamp_seconds));
  if (timestamp != null && !Number.isFinite(timestamp)) return res.status(400).json({ error: 'Tempo do vídeo inválido' });

  const info = db.prepare(`
    INSERT INTO video_review_comments (review_id, version_id, user_id, timestamp_seconds, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(review.id, version.id, req.user.id, timestamp, message);
  addEvent(review.id, version.id, req.user.id, 'comment_added', timestamp == null ? 'Comentário geral adicionado' : 'Comentário marcado no vídeo', { comment_id: info.lastInsertRowid, timestamp_seconds: timestamp });
  db.prepare("UPDATE video_reviews SET updated_at = datetime('now') WHERE id = ?").run(review.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id/comments/:commentId', (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
  const comment = db.prepare('SELECT * FROM video_review_comments WHERE id = ? AND review_id = ?').get(req.params.commentId, review.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    if (!['admin', 'team'].includes(req.user.role)) return res.status(403).json({ error: 'Somente a equipe pode resolver feedbacks' });
    const nextStatus = req.body.status === 'resolved' ? 'resolved' : 'open';
    db.prepare(`
      UPDATE video_review_comments
      SET status = ?, resolved_by = ?, resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, nextStatus === 'resolved' ? req.user.id : null, nextStatus, comment.id);
    addEvent(review.id, comment.version_id, req.user.id, nextStatus === 'resolved' ? 'comment_resolved' : 'comment_reopened', nextStatus === 'resolved' ? 'Feedback marcado como resolvido' : 'Feedback reaberto', { comment_id: comment.id });
  }
  res.json({ ok: true });
});

router.post('/:id/decision', (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
  if (!review.current_version_id) return res.status(400).json({ error: 'Nenhuma versão disponível para decisão' });
  if (!['pending_approval', 'changes_requested'].includes(review.status)) {
    return res.status(409).json({ error: 'Esta revisão não está aguardando uma decisão' });
  }
  const decision = String(req.body.decision || '');
  const feedback = String(req.body.feedback || '').trim();
  if (!['approve', 'request_changes', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decisão inválida' });
  }
  if (['request_changes', 'reject'].includes(decision) && !feedback) {
    return res.status(400).json({ error: 'Descreva o motivo ou os ajustes necessários' });
  }

  const version = db.prepare('SELECT * FROM video_review_versions WHERE id = ? AND review_id = ?').get(review.current_version_id, review.id);
  const transaction = db.transaction(() => {
    if (decision === 'approve') {
      db.prepare(`
        UPDATE video_reviews
        SET status = 'approved', approved_version_id = ?, approved_by = ?, approved_at = datetime('now'),
            drive_upload_status = CASE WHEN drive_file_id IS NULL THEN 'not_sent' ELSE drive_upload_status END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(version.id, req.user.id, review.id);
      db.prepare("UPDATE video_review_versions SET decision_status = 'approved', decision_at = datetime('now') WHERE id = ?").run(version.id);
      addEvent(review.id, version.id, req.user.id, 'approved', `Versão ${version.version_number} aprovada`, { version_number: version.version_number });
    } else {
      const status = decision === 'request_changes' ? 'changes_requested' : 'rejected';
      const versionStatus = decision === 'request_changes' ? 'changes_requested' : 'rejected';
      db.prepare(`
        UPDATE video_reviews
        SET status = ?, approved_version_id = NULL, approved_by = NULL, approved_at = NULL,
            drive_upload_status = 'not_sent', drive_last_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(status, review.id);
      db.prepare('UPDATE video_review_versions SET decision_status = ?, decision_at = datetime(\'now\') WHERE id = ?').run(versionStatus, version.id);
      const info = db.prepare(`
        INSERT INTO video_review_comments (review_id, version_id, user_id, timestamp_seconds, message)
        VALUES (?, ?, ?, NULL, ?)
      `).run(review.id, version.id, req.user.id, feedback);
      addEvent(review.id, version.id, req.user.id, decision === 'request_changes' ? 'changes_requested' : 'rejected', feedback, { comment_id: info.lastInsertRowid, version_number: version.version_number });
    }
  });
  transaction();

  const autoDrive = decision === 'approve'
    && driveConfig().configured
    && String(process.env.GOOGLE_DRIVE_AUTO_EXPORT || 'false').toLowerCase() === 'true';
  if (autoDrive) {
    db.prepare("UPDATE video_reviews SET drive_upload_status = 'sending', drive_last_error = NULL WHERE id = ?").run(review.id);
    setImmediate(() => {
      exportApprovedReviewToDrive(review.id, req.user.id).catch((error) => {
        console.error('[VIDEO DRIVE] Falha no envio automático:', error.message);
      });
    });
  }

  res.json({ ok: true, drive_auto_export_started: autoDrive });
});

router.post('/:id/export-drive', requireRole('admin', 'team'), async (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
  try {
    const result = await exportApprovedReviewToDrive(review.id, req.user.id);
    return res.json({ ok: true, file: result });
  } catch (error) {
    return res.status(error.code === 'DRIVE_NOT_CONFIGURED' ? 400 : 502).json({
      error: error.message || 'Falha ao enviar ao Google Drive',
    });
  }
});

router.delete('/:id', requireRole('admin', 'team'), (req, res) => {
  const review = scopedReview(req, req.params.id);
  if (!review) return res.status(404).json({ error: 'Revisão de vídeo não encontrada' });
  const files = db.prepare('SELECT stored_name FROM video_review_versions WHERE review_id = ?').all(review.id);
  db.prepare("UPDATE video_reviews SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(review.id);
  // Mantém os arquivos para auditoria e recuperação. A limpeza definitiva pode ser
  // feita por uma política futura, evitando apagar uma aprovação por engano.
  addEvent(review.id, review.current_version_id, req.user.id, 'archived', 'Revisão arquivada', { files_preserved: files.length });
  res.json({ ok: true });
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `O vídeo excede o limite de ${Math.round(MAX_VIDEO_MB)} MB` });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error?.message?.includes('Formato de vídeo')) return res.status(400).json({ error: error.message });
  next(error);
});

module.exports = router;
