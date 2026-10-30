// Vídeos prontos: o audiovisual envia o vídeo (arquivo ou link) -> Direção aprova -> Cliente aprova ->
// aparece no Agendamento (baixar, legenda, marcar como agendado). O ARQUIVO é apagado 3 dias depois de agendado; fica só o registro.
// stage: direction (com a direção) | client (com o cliente) | correction (voltou p/ ajuste) | approved (liberado p/ agendar).
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db/database');
const { canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { mediaStorageDirectory, locateMediaFile } = require('../services/mediaStorage');

const router = express.Router();
const PURGE_DAYS = Math.max(1, Number(process.env.READY_VIDEO_PURGE_DAYS || 3));
const PLATFORMS = new Set(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'other']);
const EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v', 'video/mpeg': 'mpg' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!String(file.mimetype || '').toLowerCase().startsWith('video/')) return cb(new Error('Envie um arquivo de vídeo válido.'));
    cb(null, true);
  },
});

const hasAny = (user, keys) => keys.some((k) => hasPermission(user, k));
const isDirection = (u) => Boolean(u && (u.role === 'admin' || u.is_agency_owner || u.is_platform_owner || u.is_operations_head));
const isClientUser = (u) => u?.role === 'client';
const text = (v, max = 300) => String(v ?? '').trim().slice(0, max);

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ready_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'file' CHECK(source IN ('file','link')),
      media_url TEXT,
      link_url TEXT,
      original_filename TEXT,
      size_bytes INTEGER,
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','scheduled')),
      uploaded_by INTEGER,
      uploaded_by_name TEXT,
      scheduled_at TEXT,
      scheduled_by INTEGER,
      scheduled_by_name TEXT,
      scheduled_platform TEXT,
      scheduled_for TEXT,
      purge_after TEXT,
      file_deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ready_videos_scope ON ready_videos(agency_id, client_id, status);
    CREATE INDEX IF NOT EXISTS idx_ready_videos_purge ON ready_videos(status, purge_after, file_deleted_at);
  `);
}
ensureSchema();
{
  const cols = db.prepare('PRAGMA table_info(ready_videos)').all().map((c) => c.name);
  const add = (name, ddl) => { if (!cols.includes(name)) db.exec(`ALTER TABLE ready_videos ADD COLUMN ${name} ${ddl}`); };
  const hadStage = cols.includes('stage');
  add('caption', 'TEXT');
  add('stage', "TEXT NOT NULL DEFAULT 'direction'");
  add('review_note', 'TEXT');
  add('reviewed_by_name', 'TEXT');
  add('reviewed_at', 'TEXT');
  // Vídeos já agendados antes do fluxo de aprovação contam como aprovados.
  if (!hadStage) db.exec("UPDATE ready_videos SET stage = 'approved' WHERE status = 'scheduled'");
}

function present(row, now = Date.now()) {
  const purgeAt = row.purge_after ? Date.parse(`${row.purge_after.replace(' ', 'T')}Z`) : null;
  return {
    id: row.id, client_id: row.client_id, client_name: row.client_name || '', client_color: row.client_color || null,
    title: row.title, caption: row.caption || '', notes: row.notes || '', source: row.source,
    media_url: row.file_deleted_at ? null : row.media_url,
    link_url: row.link_url, original_filename: row.original_filename, size_bytes: row.size_bytes,
    status: row.status, stage: row.stage || 'direction', review_note: row.review_note || '', reviewed_by_name: row.reviewed_by_name || null, reviewed_at: row.reviewed_at || null, uploaded_by_name: row.uploaded_by_name, created_at: row.created_at,
    scheduled_at: row.scheduled_at, scheduled_by_name: row.scheduled_by_name,
    scheduled_platform: row.scheduled_platform, scheduled_for: row.scheduled_for,
    purge_after: row.purge_after, file_deleted_at: row.file_deleted_at,
    days_until_purge: row.source === 'file' && row.status === 'scheduled' && !row.file_deleted_at && purgeAt
      ? Math.max(0, Math.ceil((purgeAt - now) / 86400000)) : null,
  };
}

function deleteFile(mediaUrl) {
  const name = path.basename(String(mediaUrl || ''));
  // Só apaga se o arquivo pertence a um registro desta área (nome aleatório e exclusivo).
  if (!db.prepare('SELECT 1 FROM ready_videos WHERE media_url = ?').get(`/api/media/${name}`)) return false;
  const located = locateMediaFile(name);
  if (!located) return false;
  try { fs.unlinkSync(located.filePath); return true; } catch { return false; }
}

// Apaga os arquivos cujo prazo venceu. Mantém o registro como histórico.
function purgeExpired() {
  const rows = db.prepare(`
    SELECT id, media_url FROM ready_videos
    WHERE status = 'scheduled' AND source = 'file' AND file_deleted_at IS NULL
      AND purge_after IS NOT NULL AND purge_after <= datetime('now')
  `).all();
  for (const row of rows) {
    deleteFile(row.media_url);
    db.prepare("UPDATE ready_videos SET file_deleted_at = datetime('now') WHERE id = ?").run(row.id);
  }
  return rows.length;
}

router.get('/', (req, res) => {
  if (isClientUser(req.user)) return res.status(403).json({ error: 'Acesso restrito à equipe.' });
  const rows = db.prepare(`
    SELECT r.*, c.name AS client_name, c.logo_color AS client_color FROM ready_videos r
    JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 1000
  `).all(req.user.agency_id).filter((r) => canAccessClient(req.user, r.client_id));
  const videos = rows.map((r) => present(r));
  res.json({
    videos,
    counts: {
      direction: videos.filter((v) => v.status === 'ready' && v.stage === 'direction').length,
      client: videos.filter((v) => v.status === 'ready' && v.stage === 'client').length,
      correction: videos.filter((v) => v.status === 'ready' && v.stage === 'correction').length,
      approved: videos.filter((v) => v.status === 'ready' && v.stage === 'approved').length,
      ready: videos.filter((v) => v.status === 'ready' && v.stage === 'approved').length,
      scheduled: videos.filter((v) => v.status === 'scheduled').length,
    },
    purge_days: PURGE_DAYS,
  });
});

router.post('/', (req, res) => {
  if (isClientUser(req.user) || !hasAny(req.user, ['audiovisual.manage', 'audiovisual.edit'])) return res.status(403).json({ error: 'Você não possui permissão para enviar vídeos.' });
  upload.single('file')(req, res, (uploadError) => {
    if (uploadError) {
      if (uploadError.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'O envio direto aceita até 120 MB. Para arquivos maiores, cole o link do Drive.' });
      return res.status(400).json({ error: uploadError.message || 'Não foi possível enviar o vídeo.' });
    }
    const clientId = Number(req.body.client_id);
    if (!clientId || !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const title = text(req.body.title, 160);
    if (!title) return res.status(400).json({ error: 'Dê um título ao vídeo.' });
    const link = text(req.body.link_url, 800);
    if (!req.file?.buffer && !/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'Envie um arquivo de vídeo ou cole um link (http/https).' });

    let mediaUrl = null; let source = 'link';
    if (req.file?.buffer) {
      const ext = EXT[String(req.file.mimetype).toLowerCase()] || 'mp4';
      const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`; // 128 bits aleatórios: nunca coincide com arquivos de outras áreas (hash do conteúdo)
      fs.mkdirSync(mediaStorageDirectory, { recursive: true });
      fs.writeFileSync(path.join(mediaStorageDirectory, filename), req.file.buffer, { flag: 'wx' });
      mediaUrl = `/api/media/${filename}`; source = 'file';
    }
    const info = db.prepare(`
      INSERT INTO ready_videos (agency_id, client_id, title, caption, notes, source, media_url, link_url, original_filename, size_bytes, uploaded_by, uploaded_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.agency_id, clientId, title, text(req.body.caption, 5000), text(req.body.notes, 1000), source, mediaUrl, source === 'link' ? link : (/^https?:\/\//i.test(link) ? link : null),
      req.file?.originalname ? text(req.file.originalname, 200) : null, req.file?.size || null, req.user.id, req.user.name || null);
    const row = db.prepare('SELECT r.*, c.name AS client_name, c.logo_color AS client_color FROM ready_videos r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').get(info.lastInsertRowid);
    res.status(201).json({ video: present(row) });
  });
});

function loadVideo(req, res) {
  const row = db.prepare('SELECT * FROM ready_videos WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!row) { res.status(404).json({ error: 'Vídeo não encontrado.' }); return null; }
  if (!canAccessClient(req.user, row.client_id)) { res.status(403).json({ error: 'Você não possui acesso a este cliente.' }); return null; }
  return row;
}

// Edita título e legenda (quem envia ou quem agenda).
router.put('/:id', (req, res) => {
  if (isClientUser(req.user) || !hasAny(req.user, ['audiovisual.manage', 'audiovisual.edit', 'audiovisual.publish'])) return res.status(403).json({ error: 'Você não possui permissão para editar.' });
  const row = loadVideo(req, res); if (!row) return;
  const title = req.body.title === undefined ? row.title : text(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'O título não pode ficar vazio.' });
  const caption = req.body.caption === undefined ? (row.caption || '') : text(req.body.caption, 5000);
  db.prepare('UPDATE ready_videos SET title = ?, caption = ? WHERE id = ? AND agency_id = ?').run(title, caption, row.id, req.user.agency_id);
  res.json({ ok: true, title, caption });
});

router.post('/:id/schedule', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) return res.status(403).json({ error: 'Você não possui permissão para marcar como agendado.' });
  const row = loadVideo(req, res); if (!row) return;
  if (row.status === 'scheduled') return res.status(409).json({ error: 'Este vídeo já foi marcado como agendado.' });
  if (row.stage !== 'approved') return res.status(409).json({ error: 'O vídeo ainda não foi aprovado pela direção e pelo cliente.' });
  const platform = PLATFORMS.has(String(req.body.platform)) ? String(req.body.platform) : 'instagram';
  const forDate = text(req.body.scheduled_for, 40) || null;
  db.prepare(`
    UPDATE ready_videos SET status = 'scheduled', scheduled_at = datetime('now'), scheduled_by = ?, scheduled_by_name = ?,
      scheduled_platform = ?, scheduled_for = ?,
      purge_after = CASE WHEN source = 'file' THEN datetime('now', '+${PURGE_DAYS} days') ELSE NULL END
    WHERE id = ? AND agency_id = ?
  `).run(req.user.id, req.user.name || null, platform, forDate, row.id, req.user.agency_id);
  res.json({ ok: true, purge_days: PURGE_DAYS });
});

// Desfaz o "agendado" enquanto o arquivo ainda existe.
router.post('/:id/unschedule', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) return res.status(403).json({ error: 'Você não possui permissão.' });
  const row = loadVideo(req, res); if (!row) return;
  if (row.status !== 'scheduled') return res.status(409).json({ error: 'O vídeo não está marcado como agendado.' });
  if (row.file_deleted_at) return res.status(409).json({ error: 'O arquivo já foi apagado; não dá para voltar para a fila.' });
  db.prepare("UPDATE ready_videos SET status = 'ready', scheduled_at = NULL, scheduled_by = NULL, scheduled_by_name = NULL, scheduled_platform = NULL, scheduled_for = NULL, purge_after = NULL WHERE id = ? AND agency_id = ?")
    .run(row.id, req.user.agency_id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage'])) return res.status(403).json({ error: 'Você não possui permissão para apagar vídeos.' });
  const row = loadVideo(req, res); if (!row) return;
  if (row.source === 'file' && !row.file_deleted_at) deleteFile(row.media_url);
  db.prepare('DELETE FROM ready_videos WHERE id = ? AND agency_id = ?').run(row.id, req.user.agency_id);
  res.json({ ok: true });
});

// ---- Aprovação (equipe) ----
const REVIEWABLE = "status = 'ready'";
router.post('/:id/direction-approve', (req, res) => {
  if (!isDirection(req.user)) return res.status(403).json({ error: 'A aprovação da direção é restrita à administração.' });
  const row = loadVideo(req, res); if (!row) return;
  if (row.status !== 'ready' || row.stage !== 'direction') return res.status(409).json({ error: 'Este vídeo não está aguardando a direção.' });
  db.prepare("UPDATE ready_videos SET stage = 'client', review_note = NULL, reviewed_by_name = ?, reviewed_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(req.user.name || null, row.id, req.user.agency_id);
  res.json({ ok: true, stage: 'client' });
});

router.post('/:id/direction-correction', (req, res) => {
  if (!isDirection(req.user)) return res.status(403).json({ error: 'A aprovação da direção é restrita à administração.' });
  const row = loadVideo(req, res); if (!row) return;
  if (row.status !== 'ready' || row.stage !== 'direction') return res.status(409).json({ error: 'Este vídeo não está aguardando a direção.' });
  const note = text(req.body.note, 1500);
  if (!note) return res.status(400).json({ error: 'Descreva o que precisa ser corrigido.' });
  db.prepare("UPDATE ready_videos SET stage = 'correction', review_note = ?, reviewed_by_name = ?, reviewed_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(note, `${req.user.name || 'Direção'} (direção)`, row.id, req.user.agency_id);
  res.json({ ok: true, stage: 'correction' });
});

// O audiovisual corrige (troca arquivo/link, opcionalmente) e devolve para a direção.
router.post('/:id/resubmit', (req, res) => {
  if (isClientUser(req.user) || !hasAny(req.user, ['audiovisual.manage', 'audiovisual.edit'])) return res.status(403).json({ error: 'Você não possui permissão para reenviar vídeos.' });
  upload.single('file')(req, res, (uploadError) => {
    if (uploadError) return res.status(uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: uploadError.code === 'LIMIT_FILE_SIZE' ? 'O envio direto aceita até 120 MB.' : (uploadError.message || 'Não foi possível enviar o vídeo.') });
    const row = loadVideo(req, res); if (!row) return;
    if (row.status !== 'ready' || row.stage !== 'correction') return res.status(409).json({ error: 'Este vídeo não está em correção.' });
    const link = text(req.body.link_url, 800);
    let mediaUrl = row.media_url; let source = row.source; let linkUrl = row.link_url; let original = row.original_filename; let size = row.size_bytes;
    if (req.file?.buffer) {
      const ext = EXT[String(req.file.mimetype).toLowerCase()] || 'mp4';
      const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
      fs.mkdirSync(mediaStorageDirectory, { recursive: true });
      fs.writeFileSync(path.join(mediaStorageDirectory, filename), req.file.buffer, { flag: 'wx' });
      if (row.source === 'file' && row.media_url) deleteFile(row.media_url);
      mediaUrl = `/api/media/${filename}`; source = 'file'; linkUrl = null; original = text(req.file.originalname, 200); size = req.file.size;
    } else if (/^https?:\/\//i.test(link)) {
      if (row.source === 'file' && row.media_url) deleteFile(row.media_url);
      source = 'link'; linkUrl = link; mediaUrl = null; original = null; size = null;
    }
    db.prepare("UPDATE ready_videos SET stage = 'direction', source = ?, media_url = ?, link_url = ?, original_filename = ?, size_bytes = ?, review_note = NULL, reviewed_by_name = NULL, reviewed_at = NULL WHERE id = ? AND agency_id = ?")
      .run(source, mediaUrl, linkUrl, original, size, row.id, req.user.agency_id);
    res.json({ ok: true, stage: 'direction' });
  });
});

// ---- Portal do cliente ----
const clientRouter = express.Router();
const clientRow = (req, res) => {
  if (!isClientUser(req.user) || !req.user.client_id) { res.status(403).json({ error: 'Acesso restrito ao cliente.' }); return null; }
  const row = db.prepare('SELECT * FROM ready_videos WHERE id = ? AND agency_id = ? AND client_id = ?').get(req.params.id, req.user.agency_id, req.user.client_id);
  if (!row) { res.status(404).json({ error: 'Vídeo não encontrado.' }); return null; }
  return row;
};
clientRouter.get('/', (req, res) => {
  if (!isClientUser(req.user) || !req.user.client_id) return res.status(403).json({ error: 'Acesso restrito ao cliente.' });
  const rows = db.prepare(`
    SELECT r.*, c.name AS client_name FROM ready_videos r JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ? AND r.client_id = ? AND (r.stage IN ('client','approved') OR (r.stage = 'correction' AND r.reviewed_by_name LIKE '%(cliente)'))
    ORDER BY CASE r.stage WHEN 'client' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200
  `).all(req.user.agency_id, req.user.client_id);
  res.json({ videos: rows.map((r) => present(r)) });
});
clientRouter.post('/:id/approve', (req, res) => {
  const row = clientRow(req, res); if (!row) return;
  if (row.status !== 'ready' || row.stage !== 'client') return res.status(409).json({ error: 'Este vídeo não está aguardando sua aprovação.' });
  db.prepare("UPDATE ready_videos SET stage = 'approved', review_note = NULL, reviewed_by_name = ?, reviewed_at = datetime('now') WHERE id = ?")
    .run(`${req.user.name || 'Cliente'} (cliente)`, row.id);
  res.json({ ok: true, stage: 'approved' });
});
clientRouter.post('/:id/request-changes', (req, res) => {
  const row = clientRow(req, res); if (!row) return;
  if (row.status !== 'ready' || row.stage !== 'client') return res.status(409).json({ error: 'Este vídeo não está aguardando sua aprovação.' });
  const note = text(req.body.note, 1500);
  if (!note) return res.status(400).json({ error: 'Conte o que precisa mudar.' });
  db.prepare("UPDATE ready_videos SET stage = 'correction', review_note = ?, reviewed_by_name = ?, reviewed_at = datetime('now') WHERE id = ?")
    .run(note, `${req.user.name || 'Cliente'} (cliente)`, row.id);
  res.json({ ok: true, stage: 'correction' });
});

module.exports = router;
module.exports.client = clientRouter;
module.exports.purgeExpired = purgeExpired;
module.exports.ensureSchema = ensureSchema;
