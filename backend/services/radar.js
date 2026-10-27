// Radar de Conteúdo — coleta e persistência. Sem IA, sem scraping.
const db = require('../db/database');
const { fetchUrl, parseFeed, truncate } = require('./radarFeed');

// O Radar só guarda e mostra notícias dos últimos 30 dias (pode ser reduzido por RADAR_RETENTION_DAYS, nunca aumentado).
const RETENTION_DAYS = Math.min(30, Math.max(7, Number(process.env.RADAR_RETENTION_DAYS || 30)));
const cutoffIso = () => new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
const MANUAL_MIN_GAP_MS = 60 * 1000;
const FAILURE_BACKOFF_THRESHOLD = 5;

function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function saveItems(source, parsed) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO radar_items (agency_id, client_id, source_id, guid, title, summary, link, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let added = 0;
  const run = db.transaction(() => {
    const cutoff = cutoffIso();
    for (const item of parsed.items) {
      const published = item.published_at || new Date().toISOString();
      if (published < cutoff) continue; // mais velha que o período do Radar
      const result = insert.run(source.agency_id, source.client_id, source.id, item.guid, item.title, item.summary || null, item.link, published);
      added += result.changes;
    }
  });
  run();
  return added;
}

async function refreshSource(sourceId) {
  const source = db.prepare('SELECT * FROM radar_sources WHERE id = ?').get(Number(sourceId));
  if (!source) return { ok: false, error: 'Fonte não encontrada.' };
  const headers = {};
  if (source.etag) headers['If-None-Match'] = source.etag;
  if (source.last_modified) headers['If-Modified-Since'] = source.last_modified;
  try {
    const response = await fetchUrl(source.feed_url, { headers });
    if (response.status === 304) {
      db.prepare(`UPDATE radar_sources SET last_fetched_at = ?, last_success_at = ?, last_status = 'ok', last_error = NULL, consecutive_failures = 0 WHERE id = ?`)
        .run(nowSql(), nowSql(), source.id);
      return { ok: true, added: 0, unchanged: true };
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`O site respondeu ${response.status}.`);
    const parsed = parseFeed(response.body.toString('utf8'), response.finalUrl);
    const added = saveItems(source, parsed);
    db.prepare(`
      UPDATE radar_sources
      SET last_fetched_at = ?, last_success_at = ?, last_status = 'ok', last_error = NULL, consecutive_failures = 0,
          feed_type = ?, etag = ?, last_modified = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nowSql(), nowSql(), parsed.type, response.headers.etag || null, response.headers['last-modified'] || null, source.id);
    return { ok: true, added, total: parsed.items.length };
  } catch (error) {
    const message = truncate(error.message || 'Falha ao ler o feed.', 300);
    db.prepare(`
      UPDATE radar_sources
      SET last_fetched_at = ?, last_status = 'error', last_error = ?, consecutive_failures = consecutive_failures + 1
      WHERE id = ?
    `).run(nowSql(), message, source.id);
    return { ok: false, error: message };
  }
}

async function refreshClient(clientId, { force = false } = {}) {
  const sources = db.prepare('SELECT id, last_fetched_at FROM radar_sources WHERE client_id = ? AND is_active = 1').all(Number(clientId));
  const summary = { sources: 0, added: 0, failed: 0, skipped: 0, errors: [] };
  for (const source of sources) {
    const last = source.last_fetched_at ? Date.parse(`${source.last_fetched_at.replace(' ', 'T')}Z`) : 0;
    if (!force && last && Date.now() - last < MANUAL_MIN_GAP_MS) { summary.skipped += 1; continue; }
    const result = await refreshSource(source.id);
    summary.sources += 1;
    if (result.ok) summary.added += result.added || 0;
    else { summary.failed += 1; summary.errors.push(result.error); }
  }
  pruneOldItems();
  return summary;
}

// Atualização automática: fontes com muitas falhas seguidas passam a ser tentadas só 1x por dia.
async function refreshAllActive() {
  const sources = db.prepare(`
    SELECT s.id, s.consecutive_failures, s.last_fetched_at
    FROM radar_sources s JOIN clients c ON c.id = s.client_id
    WHERE s.is_active = 1 AND c.status != 'inactive'
  `).all();
  const result = { sources: 0, added: 0, failed: 0 };
  for (const source of sources) {
    if (source.consecutive_failures >= FAILURE_BACKOFF_THRESHOLD && source.last_fetched_at) {
      const last = Date.parse(`${source.last_fetched_at.replace(' ', 'T')}Z`);
      if (Date.now() - last < 24 * 60 * 60 * 1000) continue;
    }
    const outcome = await refreshSource(source.id);
    result.sources += 1;
    if (outcome.ok) result.added += outcome.added || 0; else result.failed += 1;
  }
  pruneOldItems();
  return result;
}

function pruneOldItems() {
  return db.prepare(`DELETE FROM radar_items WHERE published_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`).run(`-${RETENTION_DAYS} days`).changes;
}

module.exports = { cutoffIso, refreshSource, refreshClient, refreshAllActive, pruneOldItems, RETENTION_DAYS };
