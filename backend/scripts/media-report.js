#!/usr/bin/env node
/**
 * Relatório de mídia órfã do Zebrahub — SOMENTE LEITURA.
 *
 * Este script NÃO apaga, move nem altera nada: não existe opção de exclusão nele.
 * Serve para medir quanto espaço está preso em arquivos que nenhum registro usa mais,
 * e para achar o problema inverso (registros que apontam para arquivo que não existe).
 *
 * Como decide que um arquivo é "referenciado" (critério conservador, para não criar falso órfão):
 *   o hash SHA-256 do nome do arquivo aparece em QUALQUER coluna de texto de QUALQUER tabela
 *   (galerias JSON, anexos, avatares, logos, moodboards, materiais...). Não depende de lista de colunas.
 *
 * Uso (recomendado: contra uma CÓPIA do banco e da pasta de mídia, não em produção):
 *   node scripts/media-report.js --db /caminho/zebrazul_hub.sqlite --media-dir /caminho/media
 *
 * Sem argumentos, usa as mesmas variáveis do servidor (DATABASE_PATH, MEDIA_STORAGE_DIR,
 * PERSISTENT_DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH).
 *
 * Opções:
 *   --db <arquivo>            banco SQLite (aberto somente leitura; se necessário, trabalha numa cópia temporária)
 *   --media-dir <pasta>       pasta de mídia (pode repetir)
 *   --min-age-days <n>       idade mínima para um órfão ser "candidato seguro" (padrão: 7)
 *   --json <arquivo>          grava o relatório completo em JSON
 *   --csv <arquivo>           grava a lista de órfãos em CSV
 *   --top <n>                 quantos maiores órfãos mostrar no terminal (padrão: 10)
 *
 * Limites conhecidos (leia antes de agir sobre o resultado):
 *   - Só olha o banco informado. Referências em outro lugar (ex.: HTML estático, outro ambiente que
 *     compartilhe a mesma pasta de mídia) não são vistas.
 *   - Vídeos de revisão (video-reviews) e a pasta de materiais usam armazenamento próprio: fora do escopo.
 *   - Upload recente pode ainda não ter sido gravado em nenhum registro: por isso existe a idade mínima.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const HASH_RE = /[a-f0-9]{64}/gi;
const URL_REF_RE = /\/api\/media\/([a-f0-9]{64})/gi;
const MANAGED_NAME_RE = /^([a-f0-9]{64})\.([a-z0-9]+)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { mediaDirs: [], minAgeDays: 7, top: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Faltou o valor para ${flag}`);
      i += 1;
      return argv[i];
    };
    if (flag === '--db') args.db = next();
    else if (flag === '--media-dir') args.mediaDirs.push(next());
    else if (flag === '--min-age-days') args.minAgeDays = Number(next());
    else if (flag === '--json') args.json = next();
    else if (flag === '--csv') args.csv = next();
    else if (flag === '--top') args.top = Number(next());
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`Opção desconhecida: ${flag}`);
  }
  if (!Number.isFinite(args.minAgeDays) || args.minAgeDays < 0) throw new Error('--min-age-days inválido');
  if (!Number.isInteger(args.top) || args.top < 0) throw new Error('--top inválido');
  return args;
}

// Valores colados no painel do Railway costumam vir com aspas.
function cleanPath(value) {
  let text = String(value || '').trim();
  for (let i = 0; i < 3 && text.length >= 2; i += 1) {
    const a = text[0];
    const b = text[text.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) text = text.slice(1, -1).trim();
    else break;
  }
  return text;
}

function defaultsFromEnvironment() {
  const volume = cleanPath(process.env.PERSISTENT_DATA_DIR || process.env.RENDER_DISK_MOUNT_PATH || process.env.RAILWAY_VOLUME_MOUNT_PATH);
  const dbEnv = cleanPath(process.env.DATABASE_PATH);
  const db = dbEnv || (volume ? path.join(volume, 'zebrazul_hub.sqlite') : '');
  const dirs = [
    cleanPath(process.env.MEDIA_STORAGE_DIR),
    db ? path.join(path.dirname(db), 'media') : '',
    volume ? path.join(volume, 'media') : '',
    '/data/media',
  ].filter(Boolean);
  return { db, dirs };
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// Abre o banco sem escrever nele. Se o modo somente leitura falhar (comum com WAL em pasta
// sem permissão), trabalha numa cópia temporária e o original permanece intocado.
function openDatabase(file) {
  try {
    return { db: new Database(file, { readonly: true, fileMustExist: true }), cleanup() {}, usedCopy: false };
  } catch (firstError) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-media-report-'));
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, path.join(tmp, `db.sqlite${suffix}`));
    }
    try {
      const db = new Database(path.join(tmp, 'db.sqlite'), { fileMustExist: true });
      return { db, cleanup() { try { db.close(); } catch { /* ignora */ } fs.rmSync(tmp, { recursive: true, force: true }); }, usedCopy: true };
    } catch (secondError) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(`Não foi possível abrir o banco (${firstError.message}; cópia: ${secondError.message})`);
    }
  }
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function scanDatabase(db) {
  const referenced = new Map();   // hash -> Set("tabela.coluna")  (qualquer ocorrência de 64 hex)
  const urlRefs = new Map();      // hash -> Set("tabela.coluna")  (formato /api/media/<hash>)
  const stats = { tables: 0, columns: 0, text_values: 0, blob_columns_skipped: 0 };

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name: table } of tables) {
    stats.tables += 1;
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
    for (const column of columns) {
      stats.columns += 1;
      const label = `${table}.${column.name}`;
      const sql = `SELECT ${quoteIdentifier(column.name)} FROM ${quoteIdentifier(table)} WHERE typeof(${quoteIdentifier(column.name)}) = 'text'`;
      if (String(column.type || '').toUpperCase().includes('BLOB')) stats.blob_columns_skipped += 1;
      for (const value of db.prepare(sql).pluck().iterate()) {
        stats.text_values += 1;
        for (const match of value.matchAll(HASH_RE)) {
          const hash = match[0].toLowerCase();
          if (!referenced.has(hash)) referenced.set(hash, new Set());
          referenced.get(hash).add(label);
        }
        if (value.includes('/api/media/')) {
          for (const match of value.matchAll(URL_REF_RE)) {
            const hash = match[1].toLowerCase();
            if (!urlRefs.has(hash)) urlRefs.set(hash, new Set());
            urlRefs.get(hash).add(label);
          }
        }
      }
    }
  }
  return { referenced, urlRefs, stats };
}

function scanDisk(directories, now) {
  const files = new Map();        // nome do arquivo -> { hash, ext, size, mtimeMs, paths[] }
  const tmpFiles = [];
  const unrecognized = [];
  const perDirectory = [];

  for (const directory of directories) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    let count = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(directory, entry.name);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      count += 1;
      bytes += stat.size;
      const match = MANAGED_NAME_RE.exec(entry.name);
      if (match) {
        const key = entry.name.toLowerCase();
        const existing = files.get(key);
        if (existing) existing.paths.push(fullPath);
        else files.set(key, { name: entry.name, hash: match[1].toLowerCase(), ext: match[2].toLowerCase(), size: stat.size, mtimeMs: stat.mtimeMs, paths: [fullPath] });
      } else if (entry.name.endsWith('.tmp')) {
        tmpFiles.push({ name: entry.name, size: stat.size, ageDays: (now - stat.mtimeMs) / DAY_MS, path: fullPath });
      } else {
        unrecognized.push({ name: entry.name, size: stat.size, path: fullPath });
      }
    }
    perDirectory.push({ directory, files: count, bytes });
  }
  return { files, tmpFiles, unrecognized, perDirectory };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildReport({ dbFile, directories, minAgeDays, now }) {
  const opened = openDatabase(dbFile);
  let scan;
  try { scan = scanDatabase(opened.db); } finally { opened.cleanup(); }

  const disk = scanDisk(directories, now);
  const orphans = [];
  let referencedFiles = 0;
  let referencedBytes = 0;

  for (const file of disk.files.values()) {
    if (scan.referenced.has(file.hash)) {
      referencedFiles += 1;
      referencedBytes += file.size;
    } else {
      const ageDays = (now - file.mtimeMs) / DAY_MS;
      orphans.push({
        file: file.name,
        size_bytes: file.size,
        modified: new Date(file.mtimeMs).toISOString(),
        age_days: Math.floor(ageDays),
        classe: ageDays >= minAgeDays ? 'orfao_candidato_seguro' : 'orfao_recente',
        paths: file.paths,
      });
    }
  }
  orphans.sort((a, b) => b.size_bytes - a.size_bytes);

  const safe = orphans.filter((o) => o.classe === 'orfao_candidato_seguro');
  const recent = orphans.filter((o) => o.classe === 'orfao_recente');
  const sum = (list) => list.reduce((total, item) => total + item.size_bytes, 0);

  const broken = [];
  for (const [hash, where] of scan.urlRefs) {
    const exists = [...disk.files.values()].some((file) => file.hash === hash);
    if (!exists) broken.push({ hash, referenced_in: [...where].sort() });
  }

  const uniqueBytes = [...disk.files.values()].reduce((total, file) => total + file.size, 0);
  return {
    generated_at: new Date(now).toISOString(),
    read_only: true,
    database: dbFile,
    database_opened_via_temporary_copy: opened.usedCopy,
    media_directories: disk.perDirectory,
    min_age_days: minAgeDays,
    scanned: scan.stats,
    disk: { unique_managed_files: disk.files.size, unique_managed_bytes: uniqueBytes },
    referenced: { files: referencedFiles, bytes: referencedBytes, distinct_hashes_in_database: scan.referenced.size },
    orphans: {
      count: orphans.length,
      bytes: sum(orphans),
      safe_candidates: { count: safe.length, bytes: sum(safe) },
      recent: { count: recent.length, bytes: sum(recent) },
      items: orphans,
    },
    leftover_tmp_files: { count: disk.tmpFiles.length, bytes: disk.tmpFiles.reduce((t, f) => t + f.size, 0), items: disk.tmpFiles },
    unrecognized_files: { count: disk.unrecognized.length, items: disk.unrecognized.slice(0, 50) },
    broken_references: { count: broken.length, items: broken },
  };
}

function printSummary(report, top) {
  const line = (text = '') => process.stdout.write(`${text}\n`);
  line('=== Relatório de mídia do Zebrahub (SOMENTE LEITURA — nada foi alterado) ===');
  line(`Banco: ${report.database}${report.database_opened_via_temporary_copy ? '  (aberto via cópia temporária; original intocado)' : ''}`);
  line('Pastas de mídia lidas:');
  if (!report.media_directories.length) line('  (nenhuma encontrada — confira --media-dir)');
  report.media_directories.forEach((d) => line(`  - ${d.directory}: ${d.files} arquivo(s), ${formatBytes(d.bytes)}`));
  line(`Varredura do banco: ${report.scanned.tables} tabelas, ${report.scanned.columns} colunas, ${report.scanned.text_values} valores de texto`);
  line();
  line(`Arquivos de mídia (únicos):  ${report.disk.unique_managed_files}  (${formatBytes(report.disk.unique_managed_bytes)})`);
  line(`  em uso:                    ${report.referenced.files}  (${formatBytes(report.referenced.bytes)})`);
  line(`  ÓRFÃOS:                    ${report.orphans.count}  (${formatBytes(report.orphans.bytes)})`);
  line(`    candidatos seguros (>= ${report.min_age_days} dias): ${report.orphans.safe_candidates.count}  (${formatBytes(report.orphans.safe_candidates.bytes)})`);
  line(`    recentes (< ${report.min_age_days} dias, não mexer): ${report.orphans.recent.count}  (${formatBytes(report.orphans.recent.bytes)})`);
  line(`Sobras de upload (.tmp):     ${report.leftover_tmp_files.count}  (${formatBytes(report.leftover_tmp_files.bytes)})`);
  line(`Arquivos fora do padrão:     ${report.unrecognized_files.count}  (ignorados; nunca contados como órfãos)`);
  line();
  line(`REFERÊNCIAS QUEBRADAS (registro aponta para arquivo que não existe): ${report.broken_references.count}`);
  report.broken_references.items.slice(0, 10).forEach((b) => line(`  - ${b.hash.slice(0, 12)}…  em ${b.referenced_in.join(', ')}`));
  if (report.broken_references.count > 10) line(`  … e mais ${report.broken_references.count - 10} (veja o JSON)`);
  if (top > 0 && report.orphans.items.length) {
    line();
    line(`Maiores órfãos (${Math.min(top, report.orphans.items.length)} de ${report.orphans.count}):`);
    report.orphans.items.slice(0, top).forEach((o) => line(`  ${formatBytes(o.size_bytes).padStart(9)}  ${String(o.age_days).padStart(4)}d  ${o.file.slice(0, 16)}…${path.extname(o.file)}  [${o.classe}]`));
  }
  line();
  line('Antes de apagar QUALQUER coisa: confira a lista, faça backup do volume e trate "recentes" como em uso.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const header = fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*\*/, '').replace(/^ \* ?/gm, '');
    process.stdout.write(`${header}\n`);
    return;
  }
  const defaults = defaultsFromEnvironment();
  const dbFile = cleanPath(args.db) || defaults.db;
  if (!dbFile) throw new Error('Informe --db ou configure DATABASE_PATH / PERSISTENT_DATA_DIR.');
  if (!fs.existsSync(dbFile)) throw new Error(`Banco não encontrado: ${dbFile}`);
  const requested = args.mediaDirs.length ? args.mediaDirs.map(cleanPath) : defaults.dirs;
  const directories = [...new Set(requested.filter(Boolean).map((dir) => path.resolve(dir)))].filter((dir) => fs.existsSync(dir));

  const report = buildReport({ dbFile: path.resolve(dbFile), directories, minAgeDays: args.minAgeDays, now: Date.now() });

  if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (args.csv) {
    const rows = [['arquivo', 'tamanho_bytes', 'modificado', 'idade_dias', 'classe', 'caminhos']];
    report.orphans.items.forEach((o) => rows.push([o.file, o.size_bytes, o.modified, o.age_days, o.classe, o.paths.join(' | ')]));
    fs.writeFileSync(args.csv, `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  }
  printSummary(report, args.top);
  if (args.json) process.stdout.write(`JSON: ${args.json}\n`);
  if (args.csv) process.stdout.write(`CSV:  ${args.csv}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Erro: ${error.message}\n`);
  process.exitCode = 1;
}
