const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const storage = require('../services/bookStorage');

// Zebra Leitor — biblioteca pessoal. Cada livro pertence a UM usuário (agency_id + user_id);
// não existe listagem nem leitura cruzada entre usuários.
const router = express.Router();
router.use(authRequired);
router.use((req, res, next) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'O Zebra Leitor é restrito à equipe.' });
  return next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, storage.incomingDirectory),
    filename: (req, file, cb) => cb(null, `${storage.newStorageName()}.part`),
  }),
  limits: { fileSize: storage.MAX_FILE_MB * 1024 * 1024, files: 1 },
});

const int = (value, fallback = 0) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? n : fallback; };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const COVER_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const TEXT_STATUS = ['unknown', 'has_text', 'no_text'];

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author || '',
    original_name: row.original_name || '',
    size_bytes: row.size_bytes,
    page_count: row.page_count,
    cover_data: row.cover_data || null,
    text_status: row.text_status,
    current_page: row.current_page,
    max_page: row.max_page,
    percent: row.percent,
    playback_rate: row.playback_rate,
    narration_page: row.narration_page,
    narration_chunk: row.narration_chunk,
    last_opened_at: row.last_opened_at,
    created_at: row.created_at,
  };
}

function ownBook(req, res) {
  const row = db.prepare('SELECT * FROM zl_books WHERE id = ? AND agency_id = ? AND user_id = ?')
    .get(Number(req.params.id), Number(req.user.agency_id), Number(req.user.id));
  if (!row) { res.status(404).json({ error: 'Livro não encontrado.' }); return null; }
  return row;
}

function percentFor(maxPage, pageCount) {
  if (!pageCount || !maxPage) return 0;
  return Math.max(0, Math.min(100, Math.round((maxPage / pageCount) * 100)));
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM zl_books WHERE agency_id = ? AND user_id = ? ORDER BY COALESCE(last_opened_at, created_at) DESC, id DESC')
    .all(Number(req.user.agency_id), Number(req.user.id));
  const used = rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  res.json({ books: rows.map(shape), usage: { used_bytes: used, max_bytes: storage.MAX_USER_MB * 1024 * 1024, max_file_bytes: storage.MAX_FILE_MB * 1024 * 1024 } });
});

router.post('/', (req, res) => {
  upload.single('file')(req, res, (uploadError) => {
    const file = req.file;
    const discard = () => { if (file?.path) { try { fs.unlinkSync(file.path); } catch { /* ok */ } } };
    if (uploadError) {
      discard();
      if (uploadError.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `O arquivo passa do limite de ${storage.MAX_FILE_MB} MB.` });
      return res.status(400).json({ error: 'Não foi possível receber o arquivo.' });
    }
    if (!file) return res.status(400).json({ error: 'Envie um arquivo PDF.' });
    if (!storage.isPdfFile(file.path)) { discard(); return res.status(400).json({ error: 'O arquivo não é um PDF válido.' }); }

    const agencyId = Number(req.user.agency_id);
    const userId = Number(req.user.id);
    const used = Number(db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS n FROM zl_books WHERE agency_id = ? AND user_id = ?').get(agencyId, userId).n);
    if (used + file.size > storage.MAX_USER_MB * 1024 * 1024) {
      discard();
      return res.status(413).json({ error: `Sua biblioteca chegou ao limite de ${storage.MAX_USER_MB} MB. Exclua algum livro para continuar.` });
    }

    const originalName = clean(Buffer.from(file.originalname || '', 'latin1').toString('utf8') || file.originalname, 200);
    const title = clean(req.body.title, 200) || originalName.replace(/\.pdf$/i, '') || 'Livro sem título';
    const author = clean(req.body.author, 200);
    const pageCount = Math.max(0, Math.min(100000, int(req.body.page_count)));
    const cover = COVER_RE.test(String(req.body.cover_data || '')) && String(req.body.cover_data).length <= 400000 ? req.body.cover_data : null;
    const textStatus = TEXT_STATUS.includes(req.body.text_status) ? req.body.text_status : 'unknown';

    const storageName = storage.newStorageName();
    try {
      fs.renameSync(file.path, storage.safePath(storageName));
      const info = db.prepare(`
        INSERT INTO zl_books (agency_id, user_id, title, author, original_name, storage_name, size_bytes, page_count, cover_data, text_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(agencyId, userId, title, author, originalName, storageName, file.size, pageCount, cover, textStatus);
      const row = db.prepare('SELECT * FROM zl_books WHERE id = ?').get(info.lastInsertRowid);
      return res.status(201).json({ book: shape(row) });
    } catch (error) {
      storage.removeFile(storageName);
      discard();
      console.error('[ZEBRA LEITOR] falha ao salvar livro:', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar o livro.' });
    }
  });
});

router.get('/:id', (req, res) => {
  const row = ownBook(req, res);
  if (row) res.json({ book: shape(row) });
});

// Editar informações (título/autor) e metadados extraídos no navegador (páginas, capa, texto).
router.patch('/:id', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const body = req.body || {};
  const title = body.title !== undefined ? clean(body.title, 200) : row.title;
  if (!title) return res.status(400).json({ error: 'O título não pode ficar vazio.' });
  const author = body.author !== undefined ? clean(body.author, 200) : row.author;
  const pageCount = body.page_count !== undefined ? Math.max(0, Math.min(100000, int(body.page_count))) : row.page_count;
  const cover = body.cover_data !== undefined
    ? (COVER_RE.test(String(body.cover_data)) && String(body.cover_data).length <= 400000 ? body.cover_data : row.cover_data)
    : row.cover_data;
  const textStatus = TEXT_STATUS.includes(body.text_status) ? body.text_status : row.text_status;
  db.prepare("UPDATE zl_books SET title = ?, author = ?, page_count = ?, cover_data = ?, text_status = ?, percent = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, author, pageCount, cover, textStatus, percentFor(row.max_page, pageCount), row.id);
  res.json({ book: shape(db.prepare('SELECT * FROM zl_books WHERE id = ?').get(row.id)) });
});

// Progresso: página, velocidade preferida e posição da narração. Abrir o livro também passa por aqui.
router.put('/:id/progress', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const body = req.body || {};
  const pageCount = row.page_count || 0;
  const maxAllowed = pageCount > 0 ? pageCount : 100000;
  const page = body.current_page !== undefined ? Math.max(1, Math.min(maxAllowed, int(body.current_page, row.current_page))) : row.current_page;
  const maxPage = Math.max(row.max_page || 0, page);
  const rate = body.playback_rate !== undefined ? Math.max(0.5, Math.min(3, Number(body.playback_rate) || row.playback_rate)) : row.playback_rate;
  const nPage = body.narration_page !== undefined ? (body.narration_page === null ? null : Math.max(1, Math.min(maxAllowed, int(body.narration_page)))) : row.narration_page;
  const nChunk = body.narration_chunk !== undefined ? (body.narration_chunk === null ? null : Math.max(0, Math.min(100000, int(body.narration_chunk)))) : row.narration_chunk;
  db.prepare(`
    UPDATE zl_books SET current_page = ?, max_page = ?, percent = ?, playback_rate = ?, narration_page = ?, narration_chunk = ?,
      last_opened_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(page, maxPage, percentFor(maxPage, pageCount), rate, nPage, nChunk, row.id);
  res.json({ book: shape(db.prepare('SELECT * FROM zl_books WHERE id = ?').get(row.id)) });
});

// Único caminho de leitura do arquivo: autenticado e somente para o dono. Aceita Range (PDF.js).
router.get('/:id/file', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const filePath = storage.safePath(row.storage_name);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'O arquivo deste livro não foi encontrado no servidor.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="livro.pdf"');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
  return res.sendFile(filePath, { acceptRanges: true, cacheControl: false, headers: {} });
});

router.delete('/:id', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  db.transaction(() => {
    db.prepare('DELETE FROM zl_marks WHERE book_id = ?').run(row.id);
    db.prepare('DELETE FROM zl_books WHERE id = ?').run(row.id);
  })();
  storage.removeFile(row.storage_name);
  res.json({ ok: true });
});

// ---- Marcações: favoritos, trechos salvos e anotações (por livro e por usuário) ----
const KINDS = ['bookmark', 'highlight', 'note'];

router.get('/:id/marks', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const marks = db.prepare('SELECT id, kind, page, quote, note, created_at, updated_at FROM zl_marks WHERE book_id = ? AND user_id = ? ORDER BY page ASC, id ASC')
    .all(row.id, Number(req.user.id));
  res.json({ marks });
});

router.post('/:id/marks', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const kind = String(req.body?.kind || '');
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Tipo de marcação inválido.' });
  const page = Math.max(1, Math.min(row.page_count || 100000, int(req.body?.page, 1)));
  const quote = clean(req.body?.quote, 2000);
  const note = String(req.body?.note ?? '').trim().slice(0, 4000);
  if (kind === 'highlight' && !quote) return res.status(400).json({ error: 'Não há trecho para salvar.' });
  if (kind === 'note' && !note) return res.status(400).json({ error: 'Escreva a anotação.' });
  if (kind === 'bookmark') {
    const existing = db.prepare("SELECT id FROM zl_marks WHERE book_id = ? AND user_id = ? AND kind = 'bookmark' AND page = ?").get(row.id, Number(req.user.id), page);
    if (existing) return res.json({ mark: db.prepare('SELECT id, kind, page, quote, note, created_at, updated_at FROM zl_marks WHERE id = ?').get(existing.id) });
  }
  const info = db.prepare('INSERT INTO zl_marks (book_id, agency_id, user_id, kind, page, quote, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(row.id, Number(req.user.agency_id), Number(req.user.id), kind, page, quote || null, note || null);
  res.status(201).json({ mark: db.prepare('SELECT id, kind, page, quote, note, created_at, updated_at FROM zl_marks WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/:id/marks/:markId', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const mark = db.prepare('SELECT * FROM zl_marks WHERE id = ? AND book_id = ? AND user_id = ?').get(Number(req.params.markId), row.id, Number(req.user.id));
  if (!mark) return res.status(404).json({ error: 'Marcação não encontrada.' });
  const note = String(req.body?.note ?? '').trim().slice(0, 4000);
  if (mark.kind === 'note' && !note) return res.status(400).json({ error: 'Escreva a anotação.' });
  db.prepare("UPDATE zl_marks SET note = ?, updated_at = datetime('now') WHERE id = ?").run(note || null, mark.id);
  res.json({ mark: db.prepare('SELECT id, kind, page, quote, note, created_at, updated_at FROM zl_marks WHERE id = ?').get(mark.id) });
});

router.delete('/:id/marks/:markId', (req, res) => {
  const row = ownBook(req, res);
  if (!row) return;
  const info = db.prepare('DELETE FROM zl_marks WHERE id = ? AND book_id = ? AND user_id = ?').run(Number(req.params.markId), row.id, Number(req.user.id));
  if (!info.changes) return res.status(404).json({ error: 'Marcação não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
