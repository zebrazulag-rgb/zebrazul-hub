const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { databasePath } = require('../db/config');
const { normalizeEnvironmentPath, resolveEnvironmentPath } = require('../utils/environmentPath');

const configuredMediaDirectory = resolveEnvironmentPath(process.env.MEDIA_STORAGE_DIR);
const mediaStorageDirectory = configuredMediaDirectory || path.join(path.dirname(databasePath), 'media');

fs.mkdirSync(mediaStorageDirectory, { recursive: true });

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const EXTENSION_MIMES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  bin: 'application/octet-stream',
};

function uniqueResolvedPaths(values) {
  return [...new Set(values
    .map((value) => normalizeEnvironmentPath(value))
    .filter(Boolean)
    .map((value) => path.resolve(value)))];
}

/**
 * Besides the configured folder, keep compatibility with locations used by
 * previous ZebraHub deployments. This recovers media that is already present
 * on the Railway volume even when MEDIA_STORAGE_DIR was pasted with quotes or
 * changed after the first migration.
 */
function getMediaSearchDirectories() {
  const persistentRoots = [
    process.env.PERSISTENT_DATA_DIR,
    process.env.RENDER_DISK_MOUNT_PATH,
    process.env.RAILWAY_VOLUME_MOUNT_PATH,
  ];

  return uniqueResolvedPaths([
    mediaStorageDirectory,
    path.join(path.dirname(databasePath), 'media'),
    ...persistentRoots.map((root) => {
      const normalized = normalizeEnvironmentPath(root);
      return normalized ? path.join(normalized, 'media') : '';
    }),
    '/data/media',
  ]);
}

function extensionForMime(mime) {
  return MIME_EXTENSIONS[String(mime || '').toLowerCase()] || 'bin';
}

function isManagedMediaUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('/api/media/') || trimmed.includes('/api/media/');
}

function decodeData(value, fallbackMime = 'application/octet-stream') {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const dataUri = trimmed.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (dataUri) {
    const mime = dataUri[1] || fallbackMime;
    const payload = dataUri[3] || '';
    const buffer = dataUri[2]
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { buffer, mime };
  }

  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    try {
      const buffer = Buffer.from(trimmed, 'base64');
      if (buffer.length > 32) return { buffer, mime: fallbackMime };
    } catch {}
  }
  return null;
}

function persistMedia(value, fallbackMime = 'application/octet-stream') {
  if (!value || isManagedMediaUrl(value) || /^https?:\/\//i.test(String(value))) return value || null;
  const decoded = decodeData(value, fallbackMime);
  if (!decoded) return value;

  const hash = crypto.createHash('sha256').update(decoded.buffer).digest('hex');
  const extension = extensionForMime(decoded.mime);
  const filename = `${hash}.${extension}`;
  const destination = path.join(mediaStorageDirectory, filename);
  fs.mkdirSync(mediaStorageDirectory, { recursive: true });
  if (!fs.existsSync(destination)) {
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, decoded.buffer, { flag: 'wx' });
    fs.renameSync(temporary, destination);
  }
  return `/api/media/${filename}`;
}

function normalizeGalleryItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const data = persistMedia(item, 'image/jpeg');
    return data ? { data, mime: 'image/jpeg', filename: '' } : null;
  }
  if (typeof item !== 'object') return null;
  const mime = item.mime || item.type || item.media_mime || 'image/jpeg';
  const source = item.data || item.url || item.src || item.preview || item.dataUrl || item.media_data || item.file_data;
  if (!source) return null;
  const data = persistMedia(source, mime);
  return {
    ...item,
    data,
    url: data,
    mime,
    filename: item.filename || item.name || '',
  };
}

function externalizeGallery(value, fallbackData = null, fallbackMime = null) {
  let source = value;
  for (let attempt = 0; attempt < 3 && typeof source === 'string'; attempt += 1) {
    try { source = JSON.parse(source); } catch { break; }
  }
  if (source && !Array.isArray(source) && typeof source === 'object') {
    source = source.media_gallery || source.gallery || source.images || source.items || source.files || [];
  }
  const gallery = Array.isArray(source) ? source.map(normalizeGalleryItem).filter(Boolean) : [];
  if (!gallery.length && fallbackData) {
    const data = persistMedia(fallbackData, fallbackMime || 'image/jpeg');
    if (data) gallery.push({ data, url: data, mime: fallbackMime || 'image/jpeg', filename: '' });
  }
  return gallery;
}

function safeMediaName(filename) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(filename || ''));
  } catch {
    decoded = String(filename || '');
  }
  return path.basename(decoded).trim();
}

function mediaStem(filename) {
  const extension = path.extname(filename);
  return extension ? filename.slice(0, -extension.length) : filename;
}

function candidateMediaNames(requestedName, directory = mediaStorageDirectory) {
  const safe = safeMediaName(requestedName);

  // Managed files use a SHA-256 hash. Keep compatibility with old links that
  // had a shortened hash, no extension or a different extension.
  if (!/^[a-f0-9]{32,128}(?:\.[a-z0-9]{1,12})?$/i.test(safe)) return [];

  const safeLower = safe.toLowerCase();
  const requestedStem = mediaStem(safeLower);
  const exactCandidates = [safe, requestedStem];
  const prefixMatches = [];

  try {
    for (const entry of fs.readdirSync(directory)) {
      const normalized = String(entry).toLowerCase();
      const entryStem = mediaStem(normalized);

      if (
        normalized === safeLower ||
        normalized === requestedStem ||
        entryStem === requestedStem
      ) {
        exactCandidates.push(entry);
        continue;
      }

      if (requestedStem.length >= 32 && entryStem.startsWith(requestedStem)) {
        prefixMatches.push(entry);
      }
    }
  } catch {}

  const uniqueExact = [...new Set(exactCandidates.map((value) => path.basename(value)))];
  if (prefixMatches.length === 1) uniqueExact.push(path.basename(prefixMatches[0]));
  return [...new Set(uniqueExact)];
}

function locateMediaFile(filename) {
  for (const directory of getMediaSearchDirectories()) {
    for (const candidate of candidateMediaNames(filename, directory)) {
      const fullPath = path.join(directory, candidate);
      try {
        if (!fs.statSync(fullPath).isFile()) continue;

        // If the file was found in a legacy folder, copy it to the current
        // configured directory so the repair is permanent for future requests.
        if (path.resolve(directory) !== path.resolve(mediaStorageDirectory)) {
          try {
            fs.mkdirSync(mediaStorageDirectory, { recursive: true });
            const repairedPath = path.join(mediaStorageDirectory, path.basename(fullPath));
            if (!fs.existsSync(repairedPath)) fs.copyFileSync(fullPath, repairedPath);
            return { filePath: repairedPath, sourceDirectory: directory, repaired: true };
          } catch {
            return { filePath: fullPath, sourceDirectory: directory, repaired: false };
          }
        }

        return { filePath: fullPath, sourceDirectory: directory, repaired: false };
      } catch {}
    }
  }
  return null;
}

function mediaFileFromName(filename) {
  return locateMediaFile(filename)?.filePath || null;
}

function detectMimeFromFile(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension && EXTENSION_MIMES[extension]) return EXTENSION_MIMES[extension];

  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(64);
    fs.readSync(descriptor, header, 0, header.length, 0);

    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
    if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (header.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (header.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
    if (header.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
    const text = header.toString('utf8').trimStart().toLowerCase();
    if (text.startsWith('<svg') || text.startsWith('<?xml')) return 'image/svg+xml';
  } catch {
    return 'application/octet-stream';
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
  return 'application/octet-stream';
}

function directorySize(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return total + directorySize(fullPath);
    try { return total + fs.statSync(fullPath).size; } catch { return total; }
  }, 0);
}

function directoryFileCount(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile()).length;
  } catch {
    return 0;
  }
}

function getMediaStorageStatus() {
  const directories = getMediaSearchDirectories().map((directory) => ({
    directory,
    primary: path.resolve(directory) === path.resolve(mediaStorageDirectory),
    exists: fs.existsSync(directory),
    file_count: directoryFileCount(directory),
    size_bytes: directorySize(directory),
  }));

  return {
    configured: Boolean(configuredMediaDirectory),
    primary_directory: mediaStorageDirectory,
    directories,
    total_files: directories.reduce((total, item) => total + item.file_count, 0),
  };
}

module.exports = {
  mediaStorageDirectory,
  getMediaSearchDirectories,
  getMediaStorageStatus,
  persistMedia,
  externalizeGallery,
  isManagedMediaUrl,
  locateMediaFile,
  mediaFileFromName,
  detectMimeFromFile,
  directorySize,
};
