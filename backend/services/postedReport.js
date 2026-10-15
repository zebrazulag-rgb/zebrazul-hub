const db = require('../db/database');

const SCHEDULE_PLATFORMS = ['instagram_feed', 'instagram_stories', 'instagram_reels', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'pinterest', 'google'];

function parsePlatforms(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return SCHEDULE_PLATFORMS.filter((key) => Array.isArray(list) && list.includes(key));
  } catch { return []; }
}

function parseGallery(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function coverImage(row) {
  const gallery = parseGallery(row.media_gallery).filter((item) => {
    const mime = String(item?.mime || item?.type || '').toLowerCase();
    const data = String(item?.data || item?.url || item?.src || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data) || data.startsWith('data:image/') || data.startsWith('/api/media/');
  });
  if (gallery.length) return { data: gallery[0].data || gallery[0].url || gallery[0].src, count: gallery.length };
  const mime = String(row.attachment_mime || '').toLowerCase();
  const data = String(row.attachment_data || '');
  if (data && (mime.startsWith('image/') || data.startsWith('data:image/') || data.startsWith('/api/media/'))) return { data, count: 1 };
  return { data: null, count: 0 };
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')) ? String(value) : new Date().toISOString().slice(0, 7);
}

// Peças postadas no mês (pela data de postagem da peça). clientIds: restringe a esses clientes (equipe com escopo).
function buildPostedReport({ agencyId, month, clientId = null, clientIds = null }) {
  month = validMonth(month);
  let query = `
    SELECT t.id, COALESCE(t.client_id, parent.client_id) AS client_id, t.title, t.content_type, t.due_date, t.posted_at,
           t.scheduled_platforms, t.attachment_data, t.attachment_mime, t.media_gallery, c.name AS client_name
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN clients c ON c.id = COALESCE(t.client_id, parent.client_id) AND c.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND t.workflow_stage = 'posted'
      AND COALESCE(t.is_backlog, 0) = 0
      AND COALESCE(parent.is_backlog, 0) = 0
      AND t.task_type != 'video'
      AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
      AND substr(COALESCE(t.due_date, t.posted_at, t.updated_at), 1, 7) = ?
  `;
  const params = [Number(agencyId), month];
  if (clientId) {
    query += ' AND COALESCE(t.client_id, parent.client_id) = ?';
    params.push(Number(clientId));
  } else if (Array.isArray(clientIds)) {
    if (!clientIds.length) return { month, total: 0, items: [], by_platform: {}, by_type: {}, by_client: {} };
    query += ` AND COALESCE(t.client_id, parent.client_id) IN (${clientIds.map(() => '?').join(',')})`;
    params.push(...clientIds.map(Number));
  }
  query += ' ORDER BY COALESCE(t.due_date, t.posted_at) ASC, t.id ASC';

  const byPlatform = {}; const byType = {}; const byClient = {};
  const items = db.prepare(query).all(...params).map((row) => {
    const platforms = parsePlatforms(row.scheduled_platforms);
    platforms.forEach((key) => { byPlatform[key] = (byPlatform[key] || 0) + 1; });
    const type = row.content_type || 'outro';
    byType[type] = (byType[type] || 0) + 1;
    const clientName = row.client_name || 'Sem cliente';
    byClient[clientName] = (byClient[clientName] || 0) + 1;
    const cover = coverImage(row);
    return {
      id: row.id,
      client_id: row.client_id,
      client_name: clientName,
      title: row.title,
      content_type: row.content_type,
      date: String(row.due_date || row.posted_at || '').slice(0, 10),
      platforms,
      image: cover.data,
      image_count: cover.count,
    };
  });
  return { month, total: items.length, items, by_platform: byPlatform, by_type: byType, by_client: byClient };
}

module.exports = { buildPostedReport, validMonth };
