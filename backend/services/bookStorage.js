const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { databasePath } = require('../db/config');
const { normalizeEnvironmentPath, resolveEnvironmentPath } = require('../utils/environmentPath');

// Pasta PRIVADA dos livros. Fica ao lado do banco (volume persistente) e NUNCA é servida
// de forma estática: o único caminho de leitura é GET /api/books/:id/file, com login e dono.
const configured = resolveEnvironmentPath(process.env.BOOKS_STORAGE_DIR);
const booksDirectory = configured || path.join(path.dirname(databasePath), 'books');
const incomingDirectory = path.join(booksDirectory, '_incoming');
fs.mkdirSync(incomingDirectory, { recursive: true });

const MAX_FILE_MB = Number(process.env.BOOKS_MAX_FILE_MB || 80);
const MAX_USER_MB = Number(process.env.BOOKS_MAX_USER_MB || 600);

function newStorageName() {
  return `${crypto.randomBytes(20).toString('hex')}.pdf`;
}

// Só aceita nomes gerados por nós (hex + .pdf): impede qualquer travessia de diretório.
function safePath(storageName) {
  if (!/^[0-9a-f]{40}\.pdf$/.test(String(storageName || ''))) return null;
  return path.join(booksDirectory, storageName);
}

function isPdfFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const read = fs.readSync(fd, buffer, 0, 1024, 0);
    fs.closeSync(fd);
    return buffer.subarray(0, read).includes('%PDF-');
  } catch { return false; }
}

function removeFile(storageName) {
  const target = safePath(storageName);
  if (!target) return;
  try { fs.unlinkSync(target); } catch { /* já removido */ }
}

module.exports = { booksDirectory, incomingDirectory, MAX_FILE_MB, MAX_USER_MB, newStorageName, safePath, isPdfFile, removeFile };
