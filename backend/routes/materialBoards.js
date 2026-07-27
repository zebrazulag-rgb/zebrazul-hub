const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const MAX_BOARD_BYTES = 2 * 1024 * 1024;
const MAX_ELEMENTS = 600;
const ALLOWED_ELEMENT_TYPES = new Set(['sticky', 'text', 'rectangle', 'circle', 'checklist', 'drawing']);

function normalizeOptionalClientId(value) {
  if (value === undefined || value === null || value === '' || value === 'global') return null;
  const clientId = Number(value);
  return Number.isInteger(clientId) && clientId > 0 ? clientId : NaN;
}

function canUseGlobalBoard(user) {
  return user.role === 'admin' || user.is_operations_head;
}

function boardAccessibleByUser(user, board) {
  if (!board || Number(board.agency_id) !== Number(user.agency_id)) return false;
  if (!board.client_id) return true;
  return canAccessClient(user, board.client_id);
}

function fetchBoard(id, agencyId) {
  return db.prepare(`
    SELECT b.*, c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color,
           creator.name AS created_by_name, updater.name AS updated_by_name
    FROM material_boards b
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN users creator ON creator.id = b.created_by
    LEFT JOIN users updater ON updater.id = b.updated_by
    WHERE b.id = ? AND b.agency_id = ?
  `).get(id, agencyId);
}

function boardSummary(row) {
  let elementCount = 0;
  try {
    const parsed = JSON.parse(row.data_json || '{}');
    elementCount = Array.isArray(parsed.elements) ? parsed.elements.length : 0;
  } catch {
    elementCount = 0;
  }
  const { data_json, ...summary } = row;
  return { ...summary, element_count: elementCount };
}

function buildAccessWhere(user, values) {
  if (user.role === 'admin' || user.is_operations_head) return '1 = 1';
  if (user.role === 'client') {
    values.push(Number(user.client_id || 0));
    return '(b.client_id IS NULL OR b.client_id = ?)';
  }
  const clientIds = Array.isArray(user.client_ids) ? user.client_ids.map(Number).filter(Boolean) : [];
  if (!clientIds.length) return 'b.client_id IS NULL';
  values.push(...clientIds);
  return `(b.client_id IS NULL OR b.client_id IN (${clientIds.map(() => '?').join(',')}))`;
}

function validateBoardData(input) {
  const data = input && typeof input === 'object' ? input : null;
  if (!data || !Array.isArray(data.elements)) throw new Error('Estrutura do rascunho invalida.');
  if (data.elements.length > MAX_ELEMENTS) throw new Error(`O rascunho pode ter no maximo ${MAX_ELEMENTS} elementos.`);

  const normalized = {
    version: Number(data.version || 1),
    background: typeof data.background === 'string' ? data.background.slice(0, 32) : '#f8fafc',
    elements: data.elements.map((element, index) => {
      if (!element || typeof element !== 'object' || !ALLOWED_ELEMENT_TYPES.has(element.type)) {
        throw new Error(`Elemento invalido na posicao ${index + 1}.`);
      }
      const normalizedElement = {
        ...element,
        id: String(element.id || `element-${index}`).slice(0, 120),
        type: element.type,
        x: Number.isFinite(Number(element.x)) ? Number(element.x) : 0,
        y: Number.isFinite(Number(element.y)) ? Number(element.y) : 0,
        w: Math.min(1600, Math.max(40, Number(element.w) || 180)),
        h: Math.min(1200, Math.max(30, Number(element.h) || 120)),
        z: Number.isFinite(Number(element.z)) ? Number(element.z) : index + 1,
      };
      if (typeof normalizedElement.text === 'string') normalizedElement.text = normalizedElement.text.slice(0, 20000);
      if (typeof normalizedElement.color === 'string') normalizedElement.color = normalizedElement.color.slice(0, 32);
      if (typeof normalizedElement.stroke === 'string') normalizedElement.stroke = normalizedElement.stroke.slice(0, 32);
      if (Array.isArray(normalizedElement.points)) {
        normalizedElement.points = normalizedElement.points.slice(0, 8000).map((point) => ({
          x: Number(point?.x) || 0,
          y: Number(point?.y) || 0,
        }));
      }
      return normalizedElement;
    }),
  };

  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BOARD_BYTES) throw new Error('O rascunho ficou grande demais para salvar.');
  return { normalized, serialized };
}

router.get('/', (req, res) => {
  const values = [req.user.agency_id];
  const accessWhere = buildAccessWhere(req.user, values);
  const requestedClientId = normalizeOptionalClientId(req.query.client_id);
  if (Number.isNaN(requestedClientId)) return res.status(400).json({ error: 'Cliente invalido.' });

  let clientWhere = '';
  if (requestedClientId) {
    if (!canAccessClient(req.user, requestedClientId)) return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
    clientWhere = 'AND (b.client_id IS NULL OR b.client_id = ?)';
    values.push(requestedClientId);
  }

  const rows = db.prepare(`
    SELECT b.*, c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color,
           creator.name AS created_by_name, updater.name AS updated_by_name
    FROM material_boards b
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN users creator ON creator.id = b.created_by
    LEFT JOIN users updater ON updater.id = b.updated_by
    WHERE b.agency_id = ?
      AND b.is_active = 1
      AND ${accessWhere}
      ${clientWhere}
    ORDER BY b.updated_at DESC, b.id DESC
  `).all(...values);

  res.json({ boards: rows.map(boardSummary) });
});

router.get('/:id', (req, res) => {
  const board = fetchBoard(req.params.id, req.user.agency_id);
  if (!board || !boardAccessibleByUser(req.user, board) || Number(board.is_active) !== 1) {
    return res.status(404).json({ error: 'Rascunho nao encontrado.' });
  }

  let data = { version: 1, background: '#f8fafc', elements: [] };
  try { data = JSON.parse(board.data_json || '{}'); } catch { /* usa vazio */ }
  const { data_json, ...metadata } = board;
  res.json({ board: { ...metadata, data } });
});

router.post('/', (req, res) => {
  let clientId = normalizeOptionalClientId(req.body.client_id);
  if (Number.isNaN(clientId)) return res.status(400).json({ error: 'Cliente invalido.' });

  if (req.user.role === 'client') clientId = Number(req.user.client_id || 0) || null;
  if (!clientId && !canUseGlobalBoard(req.user)) {
    return res.status(400).json({ error: 'Escolha um cliente para criar o rascunho.' });
  }
  if (clientId && !canAccessClient(req.user, clientId)) {
    return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
  }

  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Informe o titulo do rascunho.' });

  const initialData = JSON.stringify({ version: 1, background: '#f8fafc', elements: [] });
  const info = db.prepare(`
    INSERT INTO material_boards (
      agency_id, client_id, title, description, data_json, revision, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    req.user.agency_id,
    clientId,
    title.slice(0, 180),
    String(req.body.description || '').trim().slice(0, 1200) || null,
    initialData,
    req.user.id,
    req.user.id
  );

  res.status(201).json({ id: Number(info.lastInsertRowid), revision: 1 });
});

router.put('/:id', (req, res) => {
  const board = fetchBoard(req.params.id, req.user.agency_id);
  if (!board || !boardAccessibleByUser(req.user, board) || Number(board.is_active) !== 1) {
    return res.status(404).json({ error: 'Rascunho nao encontrado.' });
  }

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Informe o titulo do rascunho.' });
    updates.push('title = ?');
    values.push(title.slice(0, 180));
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
    updates.push('description = ?');
    values.push(String(req.body.description || '').trim().slice(0, 1200) || null);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'client_id')) {
    if (!canUseGlobalBoard(req.user)) return res.status(403).json({ error: 'Somente administradores podem transferir o rascunho.' });
    const clientId = normalizeOptionalClientId(req.body.client_id);
    if (Number.isNaN(clientId)) return res.status(400).json({ error: 'Cliente invalido.' });
    if (clientId && !canAccessClient(req.user, clientId)) return res.status(403).json({ error: 'Voce nao tem acesso a este cliente.' });
    updates.push('client_id = ?');
    values.push(clientId);
  }

  const hasData = Object.prototype.hasOwnProperty.call(req.body, 'data');
  if (hasData) {
    const expectedRevision = Number(req.body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return res.status(400).json({ error: 'Revisao do rascunho invalida.' });
    }
    if (expectedRevision !== Number(board.revision)) {
      return res.status(409).json({
        error: 'Este rascunho foi alterado em outra sessao. Recarregue antes de continuar.',
        current_revision: Number(board.revision),
      });
    }
    try {
      const { serialized } = validateBoardData(req.body.data);
      updates.push('data_json = ?', 'revision = revision + 1');
      values.push(serialized);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  if (!updates.length) return res.json({ ok: true, revision: Number(board.revision) });
  updates.push("updated_by = ?", "updated_at = datetime('now')");
  values.push(req.user.id);

  db.prepare(`UPDATE material_boards SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
    .run(...values, board.id, req.user.agency_id);

  const updated = fetchBoard(board.id, req.user.agency_id);
  res.json({ ok: true, revision: Number(updated.revision), updated_at: updated.updated_at });
});

router.delete('/:id', (req, res) => {
  const board = fetchBoard(req.params.id, req.user.agency_id);
  if (!board || !boardAccessibleByUser(req.user, board)) return res.status(404).json({ error: 'Rascunho nao encontrado.' });
  const canDelete = req.user.role === 'admin' || req.user.is_operations_head || Number(board.created_by) === Number(req.user.id);
  if (!canDelete) return res.status(403).json({ error: 'Somente o criador ou um administrador pode excluir este rascunho.' });

  db.prepare("UPDATE material_boards SET is_active = 0, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(req.user.id, board.id, req.user.agency_id);
  res.json({ ok: true });
});

module.exports = router;
