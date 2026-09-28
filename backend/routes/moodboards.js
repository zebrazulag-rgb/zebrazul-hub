const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { persistMedia } = require('../services/mediaStorage');

const router = express.Router();
router.use(authRequired);

const CATEGORIES = new Set(['Geral', 'Layout', 'Fotografia', 'Tipografia', 'Cores', 'Ilustração', 'Motion', 'Não fazer']);
const ITEM_TYPES = new Set(['image', 'link', 'text']);
const MAX_TEXT = 12000;
const MAX_TITLE = 160;
const MAX_NOTE = 3000;

function normalizeClientId(value) {
  const clientId = Number(value);
  return Number.isInteger(clientId) && clientId > 0 ? clientId : null;
}

function ensureClient(req, res, value) {
  const clientId = normalizeClientId(value);
  if (!clientId) {
    res.status(400).json({ error: 'Selecione um cliente para usar o Moodboard.' });
    return null;
  }
  if (!canAccessClient(req.user, clientId)) {
    res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
    return null;
  }
  return clientId;
}

function canEdit(req) {
  return req.user?.role === 'admin' || req.user?.role === 'team';
}

function requireEdit(req, res) {
  if (!canEdit(req)) {
    res.status(403).json({ error: 'Seu acesso permite apenas visualizar este Moodboard.' });
    return false;
  }
  return true;
}

function cleanText(value, max = MAX_TEXT) {
  return String(value || '').trim().slice(0, max);
}

function cleanUrl(value) {
  const raw = String(value || '').trim().slice(0, 2500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function ensureDefaultCollection(clientId, agencyId, userId) {
  let collection = db.prepare(`
    SELECT * FROM moodboard_collections
    WHERE agency_id = ? AND client_id = ? AND is_active = 1
    ORDER BY position ASC, id ASC
    LIMIT 1
  `).get(agencyId, clientId);

  if (!collection) {
    const info = db.prepare(`
      INSERT INTO moodboard_collections (agency_id, client_id, title, position, created_by)
      VALUES (?, ?, 'Geral', 0, ?)
    `).run(agencyId, clientId, userId || null);
    collection = db.prepare('SELECT * FROM moodboard_collections WHERE id = ?').get(info.lastInsertRowid);
  }
  return collection;
}

function getCollection(id, agencyId) {
  return db.prepare(`
    SELECT * FROM moodboard_collections
    WHERE id = ? AND agency_id = ? AND is_active = 1
  `).get(Number(id), Number(agencyId));
}

function getItem(id, agencyId) {
  return db.prepare(`
    SELECT * FROM moodboard_items
    WHERE id = ? AND agency_id = ?
  `).get(Number(id), Number(agencyId));
}

function serializeBoard(clientId, agencyId, userId) {
  ensureDefaultCollection(clientId, agencyId, userId);
  const profile = db.prepare(`
    SELECT concept, feeling, avoid_notes, updated_at
    FROM moodboard_profiles
    WHERE agency_id = ? AND client_id = ?
  `).get(agencyId, clientId) || { concept: '', feeling: '', avoid_notes: '', updated_at: null };

  const collections = db.prepare(`
    SELECT id, client_id, title, position, created_at, updated_at,
           (SELECT COUNT(*) FROM moodboard_items mi WHERE mi.collection_id = mc.id AND mi.agency_id = mc.agency_id) AS item_count
    FROM moodboard_collections mc
    WHERE agency_id = ? AND client_id = ? AND is_active = 1
    ORDER BY position ASC, id ASC
  `).all(agencyId, clientId);

  const items = db.prepare(`
    SELECT mi.id, mi.client_id, mi.collection_id, mi.item_type, mi.category, mi.title, mi.note,
           mi.source_url, mi.media_url, mi.text_content, mi.position, mi.created_at, mi.updated_at
    FROM moodboard_items mi
    JOIN moodboard_collections mc ON mc.id = mi.collection_id AND mc.agency_id = mi.agency_id AND mc.is_active = 1
    WHERE mi.agency_id = ? AND mi.client_id = ?
    ORDER BY mi.collection_id ASC, mi.position ASC, mi.id ASC
  `).all(agencyId, clientId);

  return { profile, collections, items };
}

router.get('/', (req, res) => {
  const clientId = ensureClient(req, res, req.query.client_id);
  if (!clientId) return;
  return res.json(serializeBoard(clientId, Number(req.user.agency_id), Number(req.user.id)));
});

router.put('/profile', (req, res) => {
  if (!requireEdit(req, res)) return;
  const clientId = ensureClient(req, res, req.body.client_id);
  if (!clientId) return;

  const concept = cleanText(req.body.concept, 700);
  const feeling = cleanText(req.body.feeling, 700);
  const avoidNotes = cleanText(req.body.avoid_notes, 1200);

  db.prepare(`
    INSERT INTO moodboard_profiles (agency_id, client_id, concept, feeling, avoid_notes, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(agency_id, client_id) DO UPDATE SET
      concept = excluded.concept,
      feeling = excluded.feeling,
      avoid_notes = excluded.avoid_notes,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(req.user.agency_id, clientId, concept, feeling, avoidNotes, req.user.id);

  return res.json({ profile: serializeBoard(clientId, Number(req.user.agency_id), Number(req.user.id)).profile });
});

router.post('/collections', (req, res) => {
  if (!requireEdit(req, res)) return;
  const clientId = ensureClient(req, res, req.body.client_id);
  if (!clientId) return;
  const title = cleanText(req.body.title, 80);
  if (!title) return res.status(400).json({ error: 'Informe um nome para a coleção.' });

  const next = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_position
    FROM moodboard_collections WHERE agency_id = ? AND client_id = ? AND is_active = 1
  `).get(req.user.agency_id, clientId)?.next_position || 0;

  const info = db.prepare(`
    INSERT INTO moodboard_collections (agency_id, client_id, title, position, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.agency_id, clientId, title, Number(next), req.user.id);

  return res.status(201).json({ collection: getCollection(info.lastInsertRowid, req.user.agency_id) });
});

router.put('/collections/:id', (req, res) => {
  if (!requireEdit(req, res)) return;
  const collection = getCollection(req.params.id, req.user.agency_id);
  if (!collection || !canAccessClient(req.user, collection.client_id)) return res.status(404).json({ error: 'Coleção não encontrada.' });

  const title = req.body.title !== undefined ? cleanText(req.body.title, 80) : collection.title;
  const position = Number.isFinite(Number(req.body.position)) ? Math.max(0, Number(req.body.position)) : collection.position;
  if (!title) return res.status(400).json({ error: 'Informe um nome para a coleção.' });

  db.prepare(`UPDATE moodboard_collections SET title = ?, position = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
    .run(title, position, collection.id, req.user.agency_id);
  return res.json({ collection: getCollection(collection.id, req.user.agency_id) });
});

router.delete('/collections/:id', (req, res) => {
  if (!requireEdit(req, res)) return;
  const collection = getCollection(req.params.id, req.user.agency_id);
  if (!collection || !canAccessClient(req.user, collection.client_id)) return res.status(404).json({ error: 'Coleção não encontrada.' });
  const count = db.prepare(`SELECT COUNT(*) AS total FROM moodboard_collections WHERE agency_id = ? AND client_id = ? AND is_active = 1`).get(req.user.agency_id, collection.client_id)?.total || 0;
  if (Number(count) <= 1) return res.status(400).json({ error: 'O Moodboard precisa manter ao menos uma coleção.' });
  db.prepare(`UPDATE moodboard_collections SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`).run(collection.id, req.user.agency_id);
  return res.json({ ok: true });
});

router.post('/items', (req, res) => {
  if (!requireEdit(req, res)) return;
  const clientId = ensureClient(req, res, req.body.client_id);
  if (!clientId) return;
  const collection = getCollection(req.body.collection_id, req.user.agency_id);
  if (!collection || Number(collection.client_id) !== Number(clientId)) return res.status(400).json({ error: 'Coleção inválida para este cliente.' });

  const itemType = ITEM_TYPES.has(req.body.item_type) ? req.body.item_type : 'image';
  const category = CATEGORIES.has(req.body.category) ? req.body.category : 'Geral';
  const title = cleanText(req.body.title, MAX_TITLE);
  const note = cleanText(req.body.note, MAX_NOTE);
  const sourceUrl = cleanUrl(req.body.source_url);
  const textContent = cleanText(req.body.text_content, MAX_TEXT);
  let mediaUrl = '';

  if (itemType === 'image' && req.body.media_data) {
    const mime = String(req.body.media_mime || 'image/jpeg').toLowerCase();
    if (!mime.startsWith('image/')) return res.status(400).json({ error: 'Envie somente arquivos de imagem para esta referência.' });
    mediaUrl = persistMedia(req.body.media_data, mime) || '';
  }

  if (itemType === 'image' && !mediaUrl && !sourceUrl) return res.status(400).json({ error: 'Envie uma imagem ou informe o link da imagem.' });
  if (itemType === 'link' && !sourceUrl) return res.status(400).json({ error: 'Informe um link válido.' });
  if (itemType === 'text' && !textContent) return res.status(400).json({ error: 'Escreva o conteúdo da referência.' });

  const next = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_position
    FROM moodboard_items WHERE agency_id = ? AND client_id = ? AND collection_id = ?
  `).get(req.user.agency_id, clientId, collection.id)?.next_position || 0;

  const info = db.prepare(`
    INSERT INTO moodboard_items (
      agency_id, client_id, collection_id, item_type, category, title, note,
      source_url, media_url, text_content, position, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.agency_id, clientId, collection.id, itemType, category, title, note,
    sourceUrl || null, mediaUrl || null, textContent || null, Number(next), req.user.id, req.user.id
  );

  return res.status(201).json({ item: getItem(info.lastInsertRowid, req.user.agency_id) });
});

router.put('/items/reorder', (req, res) => {
  if (!requireEdit(req, res)) return;
  const clientId = ensureClient(req, res, req.body.client_id);
  if (!clientId) return;
  const collection = getCollection(req.body.collection_id, req.user.agency_id);
  if (!collection || Number(collection.client_id) !== Number(clientId)) return res.status(400).json({ error: 'Coleção inválida.' });
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number).filter(Boolean) : [];
  if (itemIds.length > 500) return res.status(400).json({ error: 'Quantidade de referências inválida.' });

  const update = db.prepare(`UPDATE moodboard_items SET position = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ? AND client_id = ? AND collection_id = ?`);
  const transaction = db.transaction(() => itemIds.forEach((id, index) => update.run(index, req.user.id, id, req.user.agency_id, clientId, collection.id)));
  transaction();
  return res.json({ ok: true });
});

router.put('/items/:id', (req, res) => {
  if (!requireEdit(req, res)) return;
  const item = getItem(req.params.id, req.user.agency_id);
  if (!item || !canAccessClient(req.user, item.client_id)) return res.status(404).json({ error: 'Referência não encontrada.' });
  const collection = req.body.collection_id ? getCollection(req.body.collection_id, req.user.agency_id) : getCollection(item.collection_id, req.user.agency_id);
  if (!collection || Number(collection.client_id) !== Number(item.client_id)) return res.status(400).json({ error: 'Coleção inválida.' });

  const itemType = ITEM_TYPES.has(req.body.item_type) ? req.body.item_type : item.item_type;
  const category = CATEGORIES.has(req.body.category) ? req.body.category : item.category;
  const title = req.body.title !== undefined ? cleanText(req.body.title, MAX_TITLE) : item.title;
  const note = req.body.note !== undefined ? cleanText(req.body.note, MAX_NOTE) : item.note;
  const sourceUrl = req.body.source_url !== undefined ? cleanUrl(req.body.source_url) : (item.source_url || '');
  const textContent = req.body.text_content !== undefined ? cleanText(req.body.text_content, MAX_TEXT) : (item.text_content || '');
  let mediaUrl = item.media_url || '';

  if (itemType === 'image' && req.body.media_data) {
    const mime = String(req.body.media_mime || 'image/jpeg').toLowerCase();
    if (!mime.startsWith('image/')) return res.status(400).json({ error: 'Envie somente arquivos de imagem.' });
    mediaUrl = persistMedia(req.body.media_data, mime) || mediaUrl;
  }

  db.prepare(`
    UPDATE moodboard_items SET
      collection_id = ?, item_type = ?, category = ?, title = ?, note = ?, source_url = ?, media_url = ?, text_content = ?,
      updated_by = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(collection.id, itemType, category, title, note, sourceUrl || null, mediaUrl || null, textContent || null, req.user.id, item.id, req.user.agency_id);

  return res.json({ item: getItem(item.id, req.user.agency_id) });
});

router.delete('/items/:id', (req, res) => {
  if (!requireEdit(req, res)) return;
  const item = getItem(req.params.id, req.user.agency_id);
  if (!item || !canAccessClient(req.user, item.client_id)) return res.status(404).json({ error: 'Referência não encontrada.' });
  db.prepare('DELETE FROM moodboard_items WHERE id = ? AND agency_id = ?').run(item.id, req.user.agency_id);
  return res.json({ ok: true });
});

module.exports = router;
