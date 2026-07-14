import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Download,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const emptySummary = {
  income_total: 0,
  income_paid: 0,
  income_pending: 0,
  expense_total: 0,
  expense_paid: 0,
  expense_pending: 0,
  balance_realized: 0,
  balance_projected: 0
};

const incomeCategories = ['Mensalidade', 'Projeto avulso', 'Tráfego pago', 'Consultoria', 'Comissão', 'Outros'];
const expenseCategories = ['Equipe', 'Ferramentas', 'Impostos', 'Mídia', 'Infraestrutura', 'Fornecedores', 'Outros'];
const paymentMethods = ['Pix', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro', 'Outro'];

export default function Finance() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [clientId, setClientId] = useState(selectedClient?.id ? String(selectedClient.id) : 'all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(createInitialForm(currentMonth(), selectedClient?.id));

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data.clients || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setClientId(selectedClient?.id ? String(selectedClient.id) : 'all');
  }, [selectedClient]);

  useEffect(() => {
    loadFinance();
  }, [month, clientId, typeFilter, statusFilter]);

  async function loadFinance() {
    setLoading(true);
    setError('');
    try {
      const params = { month };
      if (clientId !== 'all') params.client_id = clientId;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/finance', { params });
      setEntries(data.entries || []);
      setSummary(data.summary || emptySummary);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar os dados financeiros.');
    } finally {
      setLoading(false);
    }
  }

  function openNewEntry() {
    setEditingEntry(null);
    setForm(createInitialForm(month, clientId !== 'all' ? clientId : selectedClient?.id));
    setShowForm(true);
  }

  function openEditEntry(entry) {
    setEditingEntry(entry);
    setForm({
      client_id: entry.client_id ? String(entry.client_id) : '',
      type: entry.type,
      category: entry.category || 'Outros',
      description: entry.description || '',
      amount: String(entry.amount ?? ''),
      due_date: entry.due_date || '',
      paid_date: entry.paid_date || '',
      status: entry.status === 'overdue' ? 'pending' : entry.status,
      payment_method: entry.payment_method || '',
      recurring: Boolean(entry.recurring),
      notes: entry.notes || ''
    });
    setShowForm(true);
  }

  async function saveEntry(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        client_id: form.client_id || null,
        amount: Number(form.amount),
        paid_date: form.status === 'paid' ? form.paid_date || today() : null
      };

      if (editingEntry) await api.put(`/finance/${editingEntry.id}`, payload);
      else await api.post('/finance', payload);

      setShowForm(false);
      setEditingEntry(null);
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  async function markAsPaid(entry) {
    setError('');
    try {
      await api.put(`/finance/${entry.id}`, { status: 'paid', paid_date: today() });
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível dar baixa no lançamento.');
    }
  }

  async function deleteEntry(entry) {
    const confirmed = window.confirm(`Excluir o lançamento “${entry.description}”?`);
    if (!confirmed) return;
    setError('');
    try {
      await api.delete(`/finance/${entry.id}`);
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir o lançamento.');
    }
  }

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return entries;
    return entries.filter((entry) =>
      [entry.description, entry.category, entry.client_name, entry.payment_method]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term))
    );
  }, [entries, search]);

  const chartData = useMemo(() => {
    const grouped = new Map();
    entries.forEach((entry) => {
      if (entry.status === 'cancelled') return;
      const key = entry.due_date;
      if (!grouped.has(key)) grouped.set(key, { date: key, Receitas: 0, Despesas: 0 });
      const item = grouped.get(key);
      if (entry.type === 'income') item.Receitas += Number(entry.amount);
      else item.Despesas += Number(entry.amount);
    });
    return Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        label: formatDate(item.date, { day: '2-digit', month: '2-digit' })
      }));
  }, [entries]);

  function exportCsv() {
    const header = ['Tipo', 'Descrição', 'Cliente', 'Categoria', 'Vencimento', 'Status', 'Valor'];
    const rows = visibleEntries.map((entry) => [
      entry.type === 'income' ? 'Receita' : 'Despesa',
      entry.description,
      entry.client_name || 'Zebrazul',
      entry.category,
      entry.due_date,
      statusLabel(entry.status),
      Number(entry.amount).toFixed(2).replace('.', ',')
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro-zebrazul-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-zebrazul-50 text-zebrazul-600 flex items-center justify-center">
              <WalletCards size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Financeiro</h1>
              <p className="text-slate-500 mt-0.5">Controle de receitas, despesas e recebimentos da operação.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportCsv} className="btn-secondary flex items-center gap-2">
            <Download size={17} /> Exportar
          </button>
          <button type="button" onClick={openNewEntry} className="btn-primary flex items-center gap-2">
            <Plus size={17} /> Novo lançamento
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Mês de referência</label>
            <input type="month" className="input-field" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Cliente</label>
            <select className="input-field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="all">Todos os clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Tipo</label>
            <select className="input-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Receitas e despesas</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Situação</label>
            <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todas as situações</option>
              <option value="paid">Pago</option>
              <option value="pending">Pendente</option>
              <option value="overdue">Vencido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Receitas recebidas"
          value={summary.income_paid}
          detail={`${formatMoney(summary.income_total)} previstos`}
          icon={TrendingUp}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <SummaryCard
          label="Valores a receber"
          value={summary.income_pending}
          detail="Pendentes e vencidos"
          icon={CircleDollarSign}
          iconClass="bg-amber-50 text-amber-600"
        />
        <SummaryCard
          label="Despesas pagas"
          value={summary.expense_paid}
          detail={`${formatMoney(summary.expense_total)} previstas`}
          icon={TrendingDown}
          iconClass="bg-red-50 text-red-600"
        />
        <SummaryCard
          label="Saldo realizado"
          value={summary.balance_realized}
          detail={`Projetado: ${formatMoney(summary.balance_projected)}`}
          icon={WalletCards}
          iconClass={summary.balance_realized >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}
          valueClass={summary.balance_realized < 0 ? 'text-red-600' : 'text-slate-800'}
        />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)] gap-6">
        <div className="card p-5 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-semibold text-slate-800">Fluxo previsto no mês</h2>
              <p className="text-xs text-slate-400 mt-1">Distribuição dos lançamentos pela data de vencimento.</p>
            </div>
          </div>
          {chartData.length === 0 ? (
            <EmptyState text="Cadastre lançamentos para visualizar o fluxo financeiro." />
          ) : (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={compactMoney} />
                <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={(label) => `Vencimento: ${label}`} />
                <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-800">Resumo do período</h2>
          <div className="mt-5 space-y-4">
            <BalanceRow label="Receita prevista" value={summary.income_total} />
            <BalanceRow label="Despesa prevista" value={summary.expense_total} negative />
            <div className="border-t border-slate-200 pt-4">
              <BalanceRow label="Saldo projetado" value={summary.balance_projected} strong />
            </div>
            <div className="rounded-xl bg-slate-50 p-4 mt-5">
              <p className="text-xs text-slate-500">Comprometimento da receita</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{commitmentRate(summary)}%</p>
              <div className="h-2 bg-slate-200 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-zebrazul-600 rounded-full" style={{ width: `${Math.min(commitmentRate(summary), 100)}%` }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Relação entre despesas previstas e receitas previstas.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Lançamentos</h2>
            <p className="text-xs text-slate-400 mt-1">{visibleEntries.length} registro(s) no período selecionado.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field pl-9"
              placeholder="Buscar lançamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Carregando informações financeiras...</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-6"><EmptyState text="Nenhum lançamento encontrado para os filtros selecionados." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Lançamento</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold text-right">Valor</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entry.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                          {entry.type === 'income' ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800 truncate">{entry.description}</p>
                            {entry.recurring && <Repeat2 size={14} className="text-slate-400 shrink-0" title="Recorrente" />}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{entry.category}{entry.payment_method ? ` · ${entry.payment_method}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{entry.client_name || 'Zebrazul'}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(entry.due_date)}</td>
                    <td className="px-4 py-4"><FinanceStatus status={entry.status} /></td>
                    <td className={`px-4 py-4 text-right font-semibold ${entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {entry.type === 'expense' ? '− ' : '+ '}{formatMoney(entry.amount)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {entry.status !== 'paid' && entry.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => markAsPaid(entry)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Marcar como pago"
                          >
                            <Check size={17} />
                          </button>
                        )}
                        <button type="button" onClick={() => openEditEntry(entry)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="Editar">
                          <Pencil size={17} />
                        </button>
                        {user?.role === 'admin' && (
                          <button type="button" onClick={() => deleteEntry(entry)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Excluir">
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-6 shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
              <div>
                <h2 className="font-semibold text-slate-800">{editingEntry ? 'Editar lançamento' : 'Novo lançamento'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Registre uma receita ou despesa da operação.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={21} />
              </button>
            </div>

            <form onSubmit={saveEntry} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, type: 'income', category: incomeCategories[0] }))}
                  className={`rounded-xl border p-4 text-left transition-colors ${form.type === 'income' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <TrendingUp size={20} className={form.type === 'income' ? 'text-emerald-600' : 'text-slate-400'} />
                  <p className="font-semibold text-slate-800 mt-2">Receita</p>
                  <p className="text-xs text-slate-500 mt-0.5">Valor que entra na operação.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, type: 'expense', category: expenseCategories[0] }))}
                  className={`rounded-xl border p-4 text-left transition-colors ${form.type === 'expense' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <TrendingDown size={20} className={form.type === 'expense' ? 'text-red-600' : 'text-slate-400'} />
                  <p className="font-semibold text-slate-800 mt-2">Despesa</p>
                  <p className="text-xs text-slate-500 mt-0.5">Valor que sai da operação.</p>
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Descrição" className="md:col-span-2">
                  <input
                    required
                    className="input-field"
                    placeholder={form.type === 'income' ? 'Ex.: Mensalidade de gestão de redes' : 'Ex.: Assinatura de ferramenta'}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
                <Field label="Cliente relacionado">
                  <select className="input-field" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">Zebrazul / Interno</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </Field>
                <Field label="Categoria">
                  <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {(form.type === 'income' ? incomeCategories : expenseCategories).map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Valor">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="input-field pl-10"
                      placeholder="0,00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                </Field>
                <Field label="Vencimento">
                  <input required type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </Field>
                <Field label="Situação">
                  <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value, paid_date: e.target.value === 'paid' ? form.paid_date || today() : '' })}>
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </Field>
                <Field label="Forma de pagamento">
                  <select className="input-field" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="">Não informada</option>
                    {paymentMethods.map((method) => <option key={method}>{method}</option>)}
                  </select>
                </Field>
                {form.status === 'paid' && (
                  <Field label="Data do pagamento">
                    <input type="date" className="input-field" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
                  </Field>
                )}
                <Field label="Observações" className="md:col-span-2">
                  <textarea className="input-field min-h-20 resize-y" placeholder="Informações complementares..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
              </div>

              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 p-4">
                <input type="checkbox" className="w-4 h-4" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
                <div>
                  <p className="text-sm font-medium text-slate-700">Lançamento recorrente</p>
                  <p className="text-xs text-slate-400">Identifica mensalidades, assinaturas e compromissos recorrentes.</p>
                </div>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary min-w-32">
                  {saving ? 'Salvando...' : editingEntry ? 'Salvar alterações' : 'Adicionar lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, iconClass, valueClass = 'text-slate-800' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className={`text-2xl font-bold mt-2 truncate ${valueClass}`}>{formatMoney(value)}</p>
          <p className="text-xs text-slate-400 mt-1">{detail}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function BalanceRow({ label, value, negative = false, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`${strong ? 'font-semibold text-slate-800' : 'text-sm text-slate-500'}`}>{label}</span>
      <span className={`${strong ? 'text-lg font-bold' : 'text-sm font-semibold'} ${negative ? 'text-red-600' : value < 0 ? 'text-red-600' : 'text-slate-800'}`}>
        {negative ? '− ' : ''}{formatMoney(Math.abs(value))}
      </span>
    </div>
  );
}

function Field({ label, className = '', children }) {
  return (
    <label className={className}>
      <span className="text-sm font-medium text-slate-700 block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function FinanceStatus({ status }) {
  const styles = {
    paid: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    overdue: 'bg-red-50 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500'
  };
  return <span className={`badge ${styles[status] || styles.pending}`}>{statusLabel(status)}</span>;
}

function EmptyState({ text }) {
  return (
    <div className="min-h-40 flex flex-col items-center justify-center text-center">
      <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
        <WalletCards size={20} />
      </div>
      <p className="text-sm text-slate-400 mt-3">{text}</p>
    </div>
  );
}

function createInitialForm(month, clientId) {
  const date = month === currentMonth() ? today() : `${month}-01`;
  return {
    client_id: clientId ? String(clientId) : '',
    type: 'income',
    category: incomeCategories[0],
    description: '',
    amount: '',
    due_date: date,
    paid_date: '',
    status: 'pending',
    payment_method: '',
    recurring: false,
    notes: ''
  };
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function compactMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(1)} mi`;
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(0)} mil`;
  return `R$ ${number}`;
}

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', options);
}

function statusLabel(status) {
  const labels = { paid: 'Pago', pending: 'Pendente', overdue: 'Vencido', cancelled: 'Cancelado' };
  return labels[status] || status;
}

function commitmentRate(summary) {
  if (!summary.income_total) return summary.expense_total ? 100 : 0;
  return Math.round((summary.expense_total / summary.income_total) * 100);
}
