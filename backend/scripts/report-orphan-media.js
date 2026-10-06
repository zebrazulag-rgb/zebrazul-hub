#!/usr/bin/env node
'use strict';

/**
 * Read-only audit of ZebraHub managed media.
 *
 * It scans every user table and every TEXT-like column in SQLite looking for
 * /api/media/<sha256-ish filename> references, including URLs embedded inside
 * JSON/text. Then it compares those references with the files found in the
 * configured/legacy media directories.
 *
 * IMPORTANT: this script never deletes or modifies database rows or files.
 *
 * Usage:
 *   node scripts/report-orphan-media.js
 *   node scripts/report-orphan-media.js --database=/data/zebrazul_hub.sqlite
 *   node scripts/report-orphan-media.js --media-dir=/data/media
 *   node scripts/report-orphan-media.js --json=/tmp/media-report.json
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MEDIA_PATTERN = /(?:https?:\/\/[^\s"']+)?\/api\/media\/([a-f0-9]{32,128}(?:\.[a-z0-9]{1,12})?)/gi;
const MANAGED_FILE_PATTERN = /^[a-f0-9]{32,128}(?:\.[a-z0-9]{1,12})?$/i;

function argValue(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function normalizeEnvPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function uniqueResolved(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

function resolveDatabasePath() {
  const explicit = normalizeEnvPath(argValue('database'));
  if (explicit) return path.resolve(explicit);

  const envDatabase = normalizeEnvPath(process.env.DATABASE_PATH);
  if (envDatabase) return path.resolve(envDatabase);

  const persistentRoot = normalizeEnvPath(
    process.env.PERSISTENT_DATA_DIR
      || process.env.RENDER_DISK_MOUNT_PATH
      || process.env.RAILWAY_VOLUME_MOUNT_PATH
  );
  if (persistentRoot) return path.resolve(persistentRoot, 'zebrazul_hub.sqlite');

  return path.resolve(__dirname, '..', 'db', 'zebrazul_hub.sqlite');
}

function resolveMediaDirectories(databasePath) {
  const explicit = normalizeEnvPath(argValue('media-dir'));
  const configured = normalizeEnvPath(process.env.MEDIA_STORAGE_DIR);
  const persistentRoots = [
    process.env.PERSISTENT_DATA_DIR,
    process.env.RENDER_DISK_MOUNT_PATH,
    process.env.RAILWAY_VOLUME_MOUNT_PATH,
  ].map(normalizeEnvPath).filter(Boolean);

  return uniqueResolved([
    explicit,
    configured,
    path.join(path.dirname(databasePath), 'media'),
    ...persistentRoots.map((root) => path.join(root, 'media')),
    '/data/media',
  ]);
}

function humanBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes || 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function collectReferences(db) {
  const references = new Map();
  const tableRows = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  let scannedCells = 0;
  const scannedTables = [];

  for (const { name: tableName } of tableRows) {
    const safeTable = String(tableName).replace(/"/g, '""');
    let columns;
    try {
      columns = db.prepare(`PRAGMA table_info("${safeTable}")`).all();
    } catch {
      continue;
    }

    const textColumns = columns.filter((column) => {
      const type = String(column.type || '').toUpperCase();
      return !type || type.includes('TEXT') || type.includes('CHAR') || type.includes('CLOB') || type.includes('JSON');
    });
    if (!textColumns.length) continue;

    const idColumn = columns.find((column) => column.pk)?.name || columns.find((column) => column.name === 'id')?.name || null;
    const selectParts = [];
    if (idColumn) selectParts.push(`"${String(idColumn).replace(/"/g, '""')}" AS __row_id`);
    for (const column of textColumns) {
      selectParts.push(`"${String(column.name).replace(/"/g, '""')}"`);
    }

    let rows;
    try {
      rows = db.prepare(`SELECT ${selectParts.join(', ')} FROM "${safeTable}"`).all();
    } catch {
      continue;
    }

    scannedTables.push({ table: tableName, rows: rows.length, text_columns: textColumns.map((column) => column.name) });

    for (const row of rows) {
      for (const column of textColumns) {
        const value = row[column.name];
        if (typeof value !== 'string' || !value.includes('/api/media/')) continue;
        scannedCells += 1;
        MEDIA_PATTERN.lastIndex = 0;
        let match;
        while ((match = MEDIA_PATTERN.exec(value)) !== null) {
          const filename = path.basename(match[1]);
          if (!MANAGED_FILE_PATTERN.test(filename)) continue;
          if (!references.has(filename)) references.set(filename, []);
          const locations = references.get(filename);
          if (locations.length < 25) {
            locations.push({ table: tableName, column: column.name, row_id: row.__row_id ?? null });
          }
        }
      }
    }
  }

  return { references, scannedCells, scannedTables };
}

function collectFiles(directories) {
  const files = new Map();
  const directoryStatus = [];

  for (const directory of directories) {
    const status = { directory, exists: fs.existsSync(directory), files: 0, bytes: 0 };
    if (!status.exists) {
      directoryStatus.push(status);
      continue;
    }

    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch {}
    for (const entry of entries) {
      if (!entry.isFile() || !MANAGED_FILE_PATTERN.test(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch {}
      status.files += 1;
      status.bytes += size;
      if (!files.has(entry.name)) files.set(entry.name, []);
      files.get(entry.name).push({ directory, path: fullPath, size });
    }
    directoryStatus.push(status);
  }

  return { files, directoryStatus };
}

function main() {
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) {
    console.error(`[MEDIA REPORT] Banco não encontrado: ${databasePath}`);
    process.exitCode = 2;
    return;
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');

  const { references, scannedCells, scannedTables } = collectReferences(db);
  db.close();

  const mediaDirectories = resolveMediaDirectories(databasePath);
  const { files, directoryStatus } = collectFiles(mediaDirectories);

  const missing = [];
  for (const [filename, locations] of references.entries()) {
    if (!files.has(filename)) missing.push({ filename, references: locations });
  }

  const orphaned = [];
  let orphanBytes = 0;
  for (const [filename, copies] of files.entries()) {
    if (references.has(filename)) continue;
    const bytes = copies.reduce((total, copy) => total + copy.size, 0);
    orphanBytes += bytes;
    orphaned.push({ filename, bytes, copies });
  }

  const duplicatePhysicalFiles = [...files.entries()]
    .filter(([, copies]) => copies.length > 1)
    .map(([filename, copies]) => ({ filename, copies }));

  orphaned.sort((a, b) => b.bytes - a.bytes);

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'READ_ONLY',
    database: databasePath,
    media_directories: directoryStatus,
    scan: {
      tables_scanned: scannedTables.length,
      cells_with_media_urls: scannedCells,
      referenced_unique_files: references.size,
      physical_unique_files: files.size,
    },
    health: {
      missing_referenced_files: missing.length,
      orphaned_unique_files: orphaned.length,
      orphaned_bytes: orphanBytes,
      orphaned_human: humanBytes(orphanBytes),
      duplicate_physical_files: duplicatePhysicalFiles.length,
    },
    missing_referenced_files: missing,
    orphaned_files: orphaned,
    duplicate_physical_files: duplicatePhysicalFiles,
    scanned_tables: scannedTables,
  };

  const outputPath = normalizeEnvPath(argValue('json'));
  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  console.error(
    `[MEDIA REPORT] ${references.size} referências únicas; ${files.size} arquivos físicos; `
    + `${missing.length} referências ausentes; ${orphaned.length} órfãos (${humanBytes(orphanBytes)}). `
    + 'Nenhum arquivo foi alterado.'
  );

  // Missing referenced media is a production integrity problem; orphans are not.
  if (missing.length > 0) process.exitCode = 1;
}

main();
