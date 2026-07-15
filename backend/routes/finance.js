const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin'));

function normalizeEntry(entry) {
  if (!entry) return entry;
  const today = new Date().toISOString().slice(0, 10);
  const computedStatus = entry.status === 'pending' && entry.due_date < today ? 'overdue' : entry.status;
  return { ...entry, status: computedStatus, recurring: Boolean(entry.recurring) };
}

function buildFilters(query) {
  const clauses = [];
  const params = [];

  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    clauses.push("substr(financial_entries.due_date, 1, 7) = ?");
    params.push(query.month);
  }

  if (query.client_id && query.client_id !== 'all') {
    clauses.push('financial_entries.client_id = ?');
    params.push(Number(query.client_id));
  }

  if (query.type && ['income', 'expense'].includes(query.type)) {
    clauses.push('financial_entries.type = ?');
    params.push(query.type);
  }

  if (query.status && ['pending', 'paid', 'overdue', 'cancelled'].includes(query.status)) {
    if (query.status === 'overdue') {
      clauses.push("financial_entries.status = 'pending' AND financial_entries.due_date < date('now')");
    } else if (query.status === 'pending') {
      clauses.push("financial_entries.status = 'pending' AND financial_entries.due_date >= date('now')");
    } else {
      clauses.push('financial_entries.status = ?');
      params.push(query.status);
    }
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

router.get('/', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(
    `SELECT financial_entries.*, clients.name AS client_name
     FROM financial_entries
     LEFT JOIN clients ON clients.id = financial_entries.client_id
     ${where}
     ORDER BY financial_entries.due_date ASC, financial_entries.id DESC`
  ).all(...params).map(normalizeEntry);

  const summary = rows.reduce((acc, item) => {
    if (item.status === 'cancelled') return acc;

    if (item.type === 'income') {
      acc.income_total += item.amount;
      if (item.status === 'paid') acc.income_paid += item.amount;
      else acc.income_pending += item.amount;
    } else {
      acc.expense_total += item.amount;
      if (item.status === 'paid') acc.expense_paid += item.amount;
      else acc.expense_pending += item.amount;
    }

    return acc;
  }, {
    income_total: 0,
    income_paid: 0,
    income_pending: 0,
    expense_total: 0,
    expense_paid: 0,
    expense_pending: 0
  });

  summary.balance_realized = summary.income_paid - summary.expense_paid;
  summary.balance_projected = summary.income_total - summary.expense_total;

  res.json({ entries: rows, summary });
});

router.post('/', (req, res) => {
  const {
    client_id,
    type,
    category,
    description,
    amount,
    due_date,
    paid_date,
    status,
    payment_method,
    recurring,
    notes
  } = req.body;

  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'Tipo financeiro invalido' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Descricao e obrigatoria' });
  }
  if (!Number(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valor deve ser maior que zero' });
  }
  if (!due_date) {
    return res.status(400).json({ error: 'Data de vencimento e obrigatoria' });
  }

  const normalizedStatus = ['pending', 'paid', 'cancelled'].includes(status) ? status : 'pending';
  const normalizedPaidDate = normalizedStatus === 'paid' ? (paid_date || new Date().toISOString().slice(0, 10)) : null;

  const info = db.prepare(
    `INSERT INTO financial_entries
      (client_id, created_by, type, category, description, amount, due_date, paid_date, status, payment_method, recurring, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    client_id ? Number(client_id) : null,
    req.user.id,
    type,
    category || 'Outros',
    String(description).trim(),
    Number(amount),
    due_date,
    normalizedPaidDate,
    normalizedStatus,
    payment_method || null,
    recurring ? 1 : 0,
    notes || null
  );

  const entry = db.prepare(
    `SELECT financial_entries.*, clients.name AS client_name
     FROM financial_entries
     LEFT JOIN clients ON clients.id = financial_entries.client_id
     WHERE financial_entries.id = ?`
  ).get(info.lastInsertRowid);

  res.status(201).json({ entry: normalizeEntry(entry) });
});

router.put('/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM financial_entries WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Lancamento nao encontrado' });

  const next = {
    client_id: req.body.client_id === '' ? null : (req.body.client_id ?? current.client_id),
    type: req.body.type ?? current.type,
    category: req.body.category ?? current.category,
    description: req.body.description ?? current.description,
    amount: req.body.amount ?? current.amount,
    due_date: req.body.due_date ?? current.due_date,
    paid_date: req.body.paid_date ?? current.paid_date,
    status: req.body.status ?? current.status,
    payment_method: req.body.payment_method ?? current.payment_method,
    recurring: req.body.recurring ?? Boolean(current.recurring),
    notes: req.body.notes ?? current.notes
  };

  if (!['income', 'expense'].includes(next.type)) {
    return res.status(400).json({ error: 'Tipo financeiro invalido' });
  }
  if (!String(next.description || '').trim()) {
    return res.status(400).json({ error: 'Descricao e obrigatoria' });
  }
  if (!Number(next.amount) || Number(next.amount) <= 0) {
    return res.status(400).json({ error: 'Valor deve ser maior que zero' });
  }
  if (!next.due_date) {
    return res.status(400).json({ error: 'Data de vencimento e obrigatoria' });
  }
  if (!['pending', 'paid', 'cancelled'].includes(next.status)) next.status = 'pending';
  if (next.status === 'paid' && !next.paid_date) next.paid_date = new Date().toISOString().slice(0, 10);
  if (next.status !== 'paid') next.paid_date = null;

  db.prepare(
    `UPDATE financial_entries SET
      client_id = ?, type = ?, category = ?, description = ?, amount = ?, due_date = ?,
      paid_date = ?, status = ?, payment_method = ?, recurring = ?, notes = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    next.client_id ? Number(next.client_id) : null,
    next.type,
    next.category || 'Outros',
    String(next.description).trim(),
    Number(next.amount),
    next.due_date,
    next.paid_date || null,
    next.status,
    next.payment_method || null,
    next.recurring ? 1 : 0,
    next.notes || null,
    req.params.id
  );

  const entry = db.prepare(
    `SELECT financial_entries.*, clients.name AS client_name
     FROM financial_entries
     LEFT JOIN clients ON clients.id = financial_entries.client_id
     WHERE financial_entries.id = ?`
  ).get(req.params.id);

  res.json({ entry: normalizeEntry(entry) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM financial_entries WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Lancamento nao encontrado' });
  res.json({ ok: true });
});

module.exports = router;
