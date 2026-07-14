const express = require('express');
const db = require('../db/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin', 'team'));

function monthBounds(month) {
  const parts = month.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const start = month + '-01';
  const lastDay = new Date(y, m, 0).getDate();
  const end = month + '-' + String(lastDay).padStart(2, '0');
  return { start: start, end: end };
}

router.get('/summary', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(month);
  const start = bounds.start;
  const end = bounds.end;

  const recurringRevenue = db.prepare(
    "SELECT COALESCE(SUM(monthly_fee), 0) as total FROM clients WHERE status = 'active'"
  ).get().total;

  function row(type, status, dateField) {
    const q = 'SELECT COALESCE(SUM(amount), 0) as total FROM financial_entries WHERE type = ? AND status = ? AND ' + dateField + ' BETWEEN ? AND ?';
    return db.prepare(q).get(type, status, start, end).total;
  }

  const receitasRecebidas = row('revenue', 'paid', 'paid_date');
  const valoresAReceber = row('revenue', 'pending', 'due_date');
  const despesasPagas = row('expense', 'paid', 'paid_date');
  const despesasAPagar = row('expense', 'pending', 'due_date');

  const saldoRealizado = (recurringRevenue + receitasRecebidas) - despesasPagas;
  const saldoProjetado = saldoRealizado + valoresAReceber - despesasAPagar;

  res.json({
    month: month,
    recurring_revenue: recurringRevenue,
    receitas_recebidas: receitasRecebidas,
    valores_a_receber: valoresAReceber,
    despesas_pagas: despesasPagas,
    despesas_a_pagar: despesasAPagar,
    saldo_realizado: saldoRealizado,
    saldo_projetado: saldoProjetado,
    active_clients: db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'active'").get().c
  });
});

function buildEntriesQuery(req) {
  const month = req.query.month;
  const client_id = req.query.client_id;
  const type = req.query.type;
  const status = req.query.status;
  let query = 'SELECT fe.*, c.name as client_name FROM financial_entries fe LEFT JOIN clients c ON c.id = fe.client_id WHERE 1=1';
  const params = [];
  if (month) {
    const bounds = monthBounds(month);
    query += ' AND fe.due_date BETWEEN ? AND ?';
    params.push(bounds.start, bounds.end);
  }
  if (client_id) { query += ' AND fe.client_id = ?'; params.push(client_id); }
  if (type) { query += ' AND fe.type = ?'; params.push(type); }
  if (status) { query += ' AND fe.status = ?'; params.push(status); }
  query += ' ORDER BY fe.due_date DESC';
  return { query: query, params: params };
}

router.get('/entries', (req, res) => {
  const built = buildEntriesQuery(req);
  res.json({ entries: db.prepare(built.query).all(...built.params) });
});

router.get('/entries/export', (req, res) => {
  const built = buildEntriesQuery(req);
  const entries = db.prepare(built.query).all(...built.params);

  const header = 'Tipo,Descricao,Categoria,Valor,Vencimento,Pagamento,Situacao,Recorrente,Cliente\n';
  const rows = entries.map(function (e) {
    return [
      e.type === 'revenue' ? 'Receita' : 'Despesa',
      '"' + (e.description || '').replace(/"/g, '""') + '"',
      e.category || '',
      e.amount,
      e.due_date,
      e.paid_date || '',
      e.status === 'paid' ? 'Pago' : e.status === 'cancelled' ? 'Cancelado' : 'Pendente',
      e.is_recurring ? 'Sim' : 'Não',
      e.client_name || ''
    ].join(',');
  });

  const csv = header + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="financeiro.csv"');
  res.send('\uFEFF' + csv);
});

router.get('/cashflow', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(month);

  const entries = db.prepare(
    "SELECT due_date, type, amount FROM financial_entries WHERE status != 'cancelled' AND due_date BETWEEN ? AND ? ORDER BY due_date ASC"
  ).all(bounds.start, bounds.end);

  const byDay = {};
  entries.forEach(function (e) {
    if (!byDay[e.due_date]) byDay[e.due_date] = { date: e.due_date, revenue: 0, expense: 0 };
    if (e.type === 'revenue') byDay[e.due_date].revenue += e.amount;
    else byDay[e.due_date].expense += e.amount;
  });

  res.json({ days: Object.values(byDay) });
});

router.post('/entries', (req, res) => {
  const type = req.body.type;
  const description = req.body.description;
  const category = req.body.category;
  const amount = req.body.amount;
  const due_date = req.body.due_date;
  const client_id = req.body.client_id;
  const is_recurring = req.body.is_recurring;

  if (!type || !description || !amount || !due_date) {
    return res.status(400).json({ error: 'Preencha tipo, descrição, valor e vencimento' });
  }
  const info = db.prepare(
    'INSERT INTO financial_entries (type, description, category, amount, due_date, client_id, created_by, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(type, description, category || null, amount, due_date, client_id || null, req.user.id, is_recurring ? 1 : 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/entries/:id', (req, res) => {
  const description = req.body.description;
  const category = req.body.category;
  const amount = req.body.amount;
  const due_date = req.body.due_date;
  const client_id = req.body.client_id;
  const is_recurring = req.body.is_recurring;

  db.prepare(
    "UPDATE financial_entries SET description = COALESCE(?, description), category = COALESCE(?, category), amount = COALESCE(?, amount), due_date = COALESCE(?, due_date), client_id = ?, is_recurring = COALESCE(?, is_recurring), updated_at = datetime('now') WHERE id = ?"
  ).run(description, category, amount, due_date, client_id || null, is_recurring === undefined ? null : (is_recurring ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

router.put('/entries/:id/settle', (req, res) => {
  const paidDate = req.body.paid_date || new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE financial_entries SET status = 'paid', paid_date = ?, updated_at = datetime('now') WHERE id = ?")
    .run(paidDate, req.params.id);
  res.json({ ok: true });
});

router.put('/entries/:id/cancel', (req, res) => {
  db.prepare("UPDATE financial_entries SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.put('/entries/:id/reopen', (req, res) => {
  db.prepare("UPDATE financial_entries SET status = 'pending', paid_date = NULL, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/entries/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem excluir lançamentos' });
  db.prepare('DELETE FROM financial_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/clients', (req, res) => {
  const clients = db.prepare("SELECT id, name, status, monthly_fee, logo_color, avatar_data FROM clients ORDER BY name").all();
  res.json({ clients: clients });
});

router.put('/clients/:id/fee', (req, res) => {
  const monthly_fee = req.body.monthly_fee;
  db.prepare('UPDATE clients SET monthly_fee = ? WHERE id = ?').run(monthly_fee || 0, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
