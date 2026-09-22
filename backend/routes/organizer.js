const express = require('express');
const db = require('../db/database');

const router = express.Router();

const EVENT_TYPES = new Set(['post', 'recording', 'meeting', 'personal', 'other']);
const VISIBILITIES = new Set(['team', 'private']);

function cleanText(value, max = 4000) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeDateTime(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(text) ? text : null;
}

function eventById(id, agencyId) {
  return db.prepare(`
    SELECT e.*, u.name AS user_name, u.avatar_data AS user_avatar, u.avatar_color AS user_avatar_color,
           c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color
    FROM organizer_events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN clients c ON c.id = e.client_id
    WHERE e.id = ? AND e.agency_id = ?
  `).get(Number(id), Number(agencyId));
}

router.get('/events', (req, res) => {
  const from = normalizeDate(req.query.from);
  const to = normalizeDate(req.query.to);
  const scope = req.query.scope === 'mine' ? 'mine' : 'team';
  const clientId = Number(req.query.client_id || 0);

  if (!from || !to) return res.status(400).json({ error: 'Informe o período da agenda.' });

  const clauses = ['e.agency_id = ?', 'date(e.start_at) BETWEEN date(?) AND date(?)'];
  const params = [req.user.agency_id, from, to];

  if (scope === 'mine') {
    clauses.push('e.user_id = ?');
    params.push(req.user.id);
  } else {
    clauses.push("(e.visibility = 'team' OR e.user_id = ?)");
    params.push(req.user.id);
  }

  if (clientId) {
    clauses.push('e.client_id = ?');
    params.push(clientId);
  }

  const events = db.prepare(`
    SELECT e.*, u.name AS user_name, u.avatar_data AS user_avatar, u.avatar_color AS user_avatar_color,
           c.name AS client_name, c.avatar_data AS client_avatar, c.logo_color AS client_color
    FROM organizer_events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN clients c ON c.id = e.client_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.start_at ASC, e.id ASC
  `).all(...params);

  res.json({ events });
});

router.post('/events', (req, res) => {
  const title = cleanText(req.body?.title, 220);
  const eventType = EVENT_TYPES.has(req.body?.event_type) ? req.body.event_type : 'other';
  const startAt = normalizeDateTime(req.body?.start_at);
  const endAt = normalizeDateTime(req.body?.end_at) || startAt;
  const allDay = req.body?.all_day ? 1 : 0;
  const clientId = Number(req.body?.client_id || 0) || null;
  const visibility = VISIBILITIES.has(req.body?.visibility) ? req.body.visibility : (eventType === 'personal' ? 'private' : 'team');
  const notes = cleanText(req.body?.notes, 6000);

  if (!title || !startAt) return res.status(400).json({ error: 'Informe título e data do compromisso.' });

  if (clientId) {
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
    if (!client) return res.status(400).json({ error: 'Cliente inválido.' });
  }

  const info = db.prepare(`
    INSERT INTO organizer_events (
      agency_id, user_id, client_id, title, event_type, start_at, end_at,
      all_day, visibility, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.agency_id,
    req.user.id,
    clientId,
    title,
    eventType,
    startAt,
    endAt,
    allDay,
    visibility,
    notes,
  );

  res.status(201).json({ event: eventById(info.lastInsertRowid, req.user.agency_id) });
});

router.put('/events/:id', (req, res) => {
  const existing = eventById(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' });
  if (Number(existing.user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Você só pode editar seus próprios compromissos.' });
  }

  const title = cleanText(req.body?.title ?? existing.title, 220);
  const eventType = EVENT_TYPES.has(req.body?.event_type) ? req.body.event_type : existing.event_type;
  const startAt = normalizeDateTime(req.body?.start_at) || existing.start_at;
  const endAt = normalizeDateTime(req.body?.end_at) || startAt;
  const allDay = req.body?.all_day == null ? Number(existing.all_day) : (req.body.all_day ? 1 : 0);
  const clientId = req.body?.client_id === undefined ? existing.client_id : (Number(req.body.client_id || 0) || null);
  const visibility = VISIBILITIES.has(req.body?.visibility) ? req.body.visibility : existing.visibility;
  const notes = req.body?.notes === undefined ? existing.notes : cleanText(req.body.notes, 6000);

  if (clientId) {
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.user.agency_id);
    if (!client) return res.status(400).json({ error: 'Cliente inválido.' });
  }

  db.prepare(`
    UPDATE organizer_events
    SET client_id = ?, title = ?, event_type = ?, start_at = ?, end_at = ?,
        all_day = ?, visibility = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(clientId, title, eventType, startAt, endAt, allDay, visibility, notes, existing.id, req.user.agency_id);

  res.json({ event: eventById(existing.id, req.user.agency_id) });
});

router.delete('/events/:id', (req, res) => {
  const existing = eventById(req.params.id, req.user.agency_id);
  if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' });
  if (Number(existing.user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Você só pode excluir seus próprios compromissos.' });
  }
  db.prepare('DELETE FROM organizer_events WHERE id = ? AND agency_id = ?').run(existing.id, req.user.agency_id);
  res.json({ ok: true });
});

router.get('/notes', (req, res) => {
  const notes = db.prepare(`
    SELECT * FROM organizer_notes
    WHERE agency_id = ? AND user_id = ?
    ORDER BY pinned DESC, updated_at DESC, id DESC
  `).all(req.user.agency_id, req.user.id);
  res.json({ notes });
});

router.post('/notes', (req, res) => {
  const title = cleanText(req.body?.title, 180) || 'Nota';
  const content = cleanText(req.body?.content, 12000) || '';
  const pinned = req.body?.pinned ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO organizer_notes (agency_id, user_id, title, content, pinned)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.agency_id, req.user.id, title, content, pinned);
  const note = db.prepare('SELECT * FROM organizer_notes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ note });
});

router.put('/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM organizer_notes WHERE id = ? AND agency_id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.agency_id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

  const title = cleanText(req.body?.title ?? note.title, 180) || 'Nota';
  const content = req.body?.content === undefined ? note.content : (cleanText(req.body.content, 12000) || '');
  const pinned = req.body?.pinned == null ? Number(note.pinned) : (req.body.pinned ? 1 : 0);
  db.prepare(`
    UPDATE organizer_notes
    SET title = ?, content = ?, pinned = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).run(title, content, pinned, note.id, req.user.agency_id, req.user.id);
  res.json({ note: db.prepare('SELECT * FROM organizer_notes WHERE id = ?').get(note.id) });
});

router.delete('/notes/:id', (req, res) => {
  db.prepare('DELETE FROM organizer_notes WHERE id = ? AND agency_id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user.agency_id, req.user.id);
  res.json({ ok: true });
});

router.get('/checklist', (req, res) => {
  const date = normalizeDate(req.query.date);
  if (!date) return res.status(400).json({ error: 'Informe a data do checklist.' });
  const items = db.prepare(`
    SELECT * FROM organizer_checklist_items
    WHERE agency_id = ? AND user_id = ? AND item_date = ?
    ORDER BY completed ASC, position ASC, id ASC
  `).all(req.user.agency_id, req.user.id, date);
  res.json({ items });
});

router.post('/checklist', (req, res) => {
  const date = normalizeDate(req.body?.item_date);
  const title = cleanText(req.body?.title, 500);
  if (!date || !title) return res.status(400).json({ error: 'Informe a data e o item.' });

  const next = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS position
    FROM organizer_checklist_items
    WHERE agency_id = ? AND user_id = ? AND item_date = ?
  `).get(req.user.agency_id, req.user.id, date);

  const info = db.prepare(`
    INSERT INTO organizer_checklist_items (agency_id, user_id, item_date, title, position)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.agency_id, req.user.id, date, title, Number(next?.position || 0));

  const item = db.prepare('SELECT * FROM organizer_checklist_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

router.put('/checklist/:id', (req, res) => {
  const item = db.prepare(`
    SELECT * FROM organizer_checklist_items
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).get(Number(req.params.id), req.user.agency_id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' });

  const title = req.body?.title === undefined ? item.title : (cleanText(req.body.title, 500) || item.title);
  const completed = req.body?.completed == null ? Number(item.completed) : (req.body.completed ? 1 : 0);
  const position = Number.isFinite(Number(req.body?.position)) ? Number(req.body.position) : Number(item.position);
  db.prepare(`
    UPDATE organizer_checklist_items
    SET title = ?, completed = ?, position = ?, completed_at = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).run(
    title,
    completed,
    position,
    completed ? (item.completed_at || new Date().toISOString()) : null,
    item.id,
    req.user.agency_id,
    req.user.id,
  );
  res.json({ item: db.prepare('SELECT * FROM organizer_checklist_items WHERE id = ?').get(item.id) });
});

router.delete('/checklist/:id', (req, res) => {
  db.prepare('DELETE FROM organizer_checklist_items WHERE id = ? AND agency_id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user.agency_id, req.user.id);
  res.json({ ok: true });
});


// Financeiro pessoal do Meu Espaço. Cada usuário enxerga apenas os próprios lançamentos.
function normalizePersonalFinanceEntry(entry) {
  if (!entry) return entry;
  const today = new Date().toISOString().slice(0, 10);
  const computedStatus = entry.status === 'pending' && entry.due_date < today ? 'overdue' : entry.status;
  return { ...entry, status: computedStatus, recurring: Boolean(entry.recurring) };
}

function personalFinanceFilters(query, agencyId, userId) {
  const clauses = ['agency_id = ?', 'user_id = ?'];
  const params = [agencyId, userId];

  if (query.month && /^\d{4}-\d{2}$/.test(String(query.month))) {
    clauses.push("substr(due_date, 1, 7) = ?");
    params.push(String(query.month));
  }

  if (query.type && ['income', 'expense'].includes(query.type)) {
    clauses.push('type = ?');
    params.push(query.type);
  }

  if (query.status && ['pending', 'paid', 'overdue', 'cancelled'].includes(query.status)) {
    if (query.status === 'overdue') {
      clauses.push("status = 'pending' AND due_date < date('now')");
    } else if (query.status === 'pending') {
      clauses.push("status = 'pending' AND due_date >= date('now')");
    } else {
      clauses.push('status = ?');
      params.push(query.status);
    }
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

router.get('/finance', (req, res) => {
  const { where, params } = personalFinanceFilters(req.query, req.user.agency_id, req.user.id);
  const rows = db.prepare(`
    SELECT * FROM organizer_financial_entries
    ${where}
    ORDER BY due_date ASC, id DESC
  `).all(...params).map(normalizePersonalFinanceEntry);

  const summary = rows.reduce((acc, item) => {
    if (item.status === 'cancelled') return acc;
    const amount = Number(item.amount || 0);
    if (item.type === 'income') {
      acc.income_total += amount;
      if (item.status === 'paid') acc.income_paid += amount;
      else acc.income_pending += amount;
    } else {
      acc.expense_total += amount;
      if (item.status === 'paid') acc.expense_paid += amount;
      else acc.expense_pending += amount;
    }
    return acc;
  }, {
    income_total: 0,
    income_paid: 0,
    income_pending: 0,
    expense_total: 0,
    expense_paid: 0,
    expense_pending: 0,
  });

  summary.balance_realized = summary.income_paid - summary.expense_paid;
  summary.balance_projected = summary.income_total - summary.expense_total;
  res.json({ entries: rows, summary });
});

router.post('/finance', (req, res) => {
  const type = ['income', 'expense'].includes(req.body?.type) ? req.body.type : null;
  const category = cleanText(req.body?.category, 120);
  const description = cleanText(req.body?.description, 240);
  const amount = Number(req.body?.amount || 0);
  const dueDate = normalizeDate(req.body?.due_date);
  const status = ['pending', 'paid', 'cancelled'].includes(req.body?.status) ? req.body.status : 'pending';
  const paymentMethod = cleanText(req.body?.payment_method, 80);
  const notes = cleanText(req.body?.notes, 6000);
  const recurring = req.body?.recurring ? 1 : 0;
  const paidDate = status === 'paid'
    ? (normalizeDate(req.body?.paid_date) || new Date().toISOString().slice(0, 10))
    : null;

  if (!type) return res.status(400).json({ error: 'Selecione receita ou despesa.' });
  if (!description) return res.status(400).json({ error: 'Informe a descrição.' });
  if (!category) return res.status(400).json({ error: 'Informe uma categoria.' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Informe um valor válido.' });
  if (!dueDate) return res.status(400).json({ error: 'Informe a data do lançamento.' });

  const info = db.prepare(`
    INSERT INTO organizer_financial_entries (
      agency_id, user_id, type, category, description, amount, due_date,
      paid_date, status, payment_method, recurring, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.agency_id,
    req.user.id,
    type,
    category,
    description,
    amount,
    dueDate,
    paidDate,
    status,
    paymentMethod,
    recurring,
    notes,
  );

  const entry = db.prepare(`
    SELECT * FROM organizer_financial_entries
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).get(info.lastInsertRowid, req.user.agency_id, req.user.id);

  res.status(201).json({ entry: normalizePersonalFinanceEntry(entry) });
});

router.put('/finance/:id', (req, res) => {
  const current = db.prepare(`
    SELECT * FROM organizer_financial_entries
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).get(Number(req.params.id), req.user.agency_id, req.user.id);

  if (!current) return res.status(404).json({ error: 'Lançamento não encontrado.' });

  const next = {
    type: req.body?.type ?? current.type,
    category: req.body?.category === undefined ? current.category : cleanText(req.body.category, 120),
    description: req.body?.description === undefined ? current.description : cleanText(req.body.description, 240),
    amount: req.body?.amount === undefined ? Number(current.amount) : Number(req.body.amount),
    due_date: req.body?.due_date === undefined ? current.due_date : normalizeDate(req.body.due_date),
    paid_date: req.body?.paid_date === undefined ? current.paid_date : normalizeDate(req.body.paid_date),
    status: req.body?.status ?? current.status,
    payment_method: req.body?.payment_method === undefined ? current.payment_method : cleanText(req.body.payment_method, 80),
    recurring: req.body?.recurring === undefined ? Number(current.recurring) : (req.body.recurring ? 1 : 0),
    notes: req.body?.notes === undefined ? current.notes : cleanText(req.body.notes, 6000),
  };

  if (!['income', 'expense'].includes(next.type)) return res.status(400).json({ error: 'Tipo financeiro inválido.' });
  if (!next.description) return res.status(400).json({ error: 'Informe a descrição.' });
  if (!next.category) return res.status(400).json({ error: 'Informe uma categoria.' });
  if (!Number.isFinite(next.amount) || next.amount <= 0) return res.status(400).json({ error: 'Informe um valor válido.' });
  if (!next.due_date) return res.status(400).json({ error: 'Informe a data do lançamento.' });
  if (!['pending', 'paid', 'cancelled'].includes(next.status)) next.status = 'pending';
  if (next.status === 'paid' && !next.paid_date) next.paid_date = new Date().toISOString().slice(0, 10);
  if (next.status !== 'paid') next.paid_date = null;

  db.prepare(`
    UPDATE organizer_financial_entries
    SET type = ?, category = ?, description = ?, amount = ?, due_date = ?,
        paid_date = ?, status = ?, payment_method = ?, recurring = ?, notes = ?,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).run(
    next.type,
    next.category,
    next.description,
    next.amount,
    next.due_date,
    next.paid_date,
    next.status,
    next.payment_method,
    next.recurring,
    next.notes,
    current.id,
    req.user.agency_id,
    req.user.id,
  );

  const entry = db.prepare(`
    SELECT * FROM organizer_financial_entries
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).get(current.id, req.user.agency_id, req.user.id);
  res.json({ entry: normalizePersonalFinanceEntry(entry) });
});

router.delete('/finance/:id', (req, res) => {
  const info = db.prepare(`
    DELETE FROM organizer_financial_entries
    WHERE id = ? AND agency_id = ? AND user_id = ?
  `).run(Number(req.params.id), req.user.agency_id, req.user.id);

  if (!info.changes) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
