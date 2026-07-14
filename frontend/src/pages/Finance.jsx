import { useEffect, useState } from 'react';
import { Plus, TrendingUp, TrendingDown, Wallet, Users, Trash2, Download, Check, RotateCcw, Ban } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';

function currency(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL = { pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' };
const STATUS_BADGE = { pending: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500' };

export default function Finance() {
  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'expense', description: '', category: '', amount: '', due_date: new Date().toISOString().slice(0, 10), client_id: '', is_recurring: false });
  const [editingFeeId, setEditingFeeId] = useState(null);
  const [feeDraft, setFeeDraft] = useState('');

  useEffect(() => { loadAll(); }, [month, filterClient, filterType, filterStatus]);

  function buildParams() {
    const params = new URLSearchParams({ month });
    if (filterClient) params.set('client_id', filterClient);
    if (filterType) params.set('type', filterType);
    if (filterStatus) params.set('status', filterStatus);
    return params.toString();
  }

  async function loadAll() {
    const qs = buildParams();
    const results = await Promise.all([
      api.get('/finance/summary?month=' + month),
      api.get('/finance/entries?' + qs),
      api.get('/finance/clients'),
      api.get('/finance/cashflow?month=' + month)
    ]);
    setSummary(results[0].data);
    setEntries(results[1].data.entries);
    setClients(results[2].data.clients);
    setCashflow(results[3].data.days);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description || !form.amount || !form.due_date) return;
    await api.post('/finance/entries', { ...form, amount: Number(form.amount) });
    setForm({ type: 'expense', description: '', category: '', amount: '', due_date: new Date().toISOString().slice(0, 10), client_id: '', is_recurring: false });
    setShowForm(false);
    loadAll();
  }

  async function settleEntry(id) {
    await api.put('/finance/entries/' + id + '/settle');
    loadAll();
  }

  async function cancelEntry(id) {
    await api.put('/finance/entries/' + id + '/cancel');
    loadAll();
  }

  async function reopenEntry(id) {
    await api.put('/finance/entries/' + id + '/reopen');
    loadAll();
  }

  async function deleteEntry(id) {
    await api.delete('/finance/entries/' + id);
    loadAll();
  }

  async function saveFee(clientId) {
    await api.put('/finance/clients/' + clientId + '/fee', { monthly_fee: Number(feeDraft) || 0 });
    setEditingFeeId(null);
    loadAll();
  }

  async function exportCsv() {
    const qs = buildParams();
    const res = await api.get('/finance/entries/export?' + qs, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'financeiro-' + month + '.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  const chartData = cashflow.map((d) => ({
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Receita: d.revenue,
    Despesa: d.expense
  }));

  if (!summary) return <p className="text-slate-400">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financeiro</h1>
          <p className="text-slate-500 mt-1">Receitas recebidas, a receber, despesas e saldo do mês.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" className="input-field" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={exportCsv} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> CSV
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Users size={18} /></div>
          <p className="text-xl font-bold text-slate-800 mt-2">{summary.active_clients}</p>
          <p className="text-xs text-slate-500">Clientes ativos</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp size={18} /></div>
          <p className="text-xl font-bold text-slate-800 mt-2">{currency(summary.receitas_recebidas + summary.recurring_revenue)}</p>
          <p className="text-xs text-slate-500">Receitas recebidas</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><TrendingUp size={18} /></div>
          <p className="text-xl font-bold text-slate-800 mt-2">{currency(summary.valores_a_receber)}</p>
          <p className="text-xs text-slate-500">A receber</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><TrendingDown size={18} /></div>
          <p className="text-xl font-bold text-slate-800 mt-2">{currency(summary.despesas_pagas)}</p>
          <p className="text-xs text-slate-500">Despesas pagas</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><TrendingDown size={18} /></div>
          <p className="text-xl font-bold text-slate-800 mt-2">{currency(summary.despesas_a_pagar)}</p>
          <p className="text-xs text-slate-500">A pagar</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 rounded-lg bg-zebrazul-50 text-zebrazul-600 flex items-center justify-center"><Wallet size={18} /></div>
          <p className={'text-xl font-bold mt-2 ' + (summary.saldo_projetado >= 0 ? 'text-slate-800' : 'text-red-600')}>{currency(summary.saldo_projetado)}</p>
          <p className="text-xs text-slate-500">Saldo projetado</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Fluxo de caixa previsto (por vencimento)</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Nenhum lançamento neste mês.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
              <YAxis fontSize={12} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Mensalidade por cliente (receita recorrente)</h2>
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3">
              {c.avatar_data ? (
                <img src={c.avatar_data} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: c.logo_color }}>{c.name[0]}</div>
              )}
              <p className="text-sm text-slate-700 flex-1">{c.name}</p>
              <span className={'badge ' + (c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{c.status === 'active' ? 'Ativo' : c.status}</span>
              {editingFeeId === c.id ? (
                <div className="flex items-center gap-2">
                  <input type="number" className="input-field w-28" value={feeDraft} onChange={(e) => setFeeDraft(e.target.value)} autoFocus />
                  <button onClick={() => saveFee(c.id)} className="btn-primary text-xs px-3 py-1.5">Salvar</button>
                </div>
              ) : (
                <button onClick={() => { setEditingFeeId(c.id); setFeeDraft(String(c.monthly_fee || 0)); }} className="text-sm font-medium text-slate-700 hover:text-zebrazul-600">
                  {currency(c.monthly_fee)}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-semibold text-slate-800">Lançamentos</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input-field w-40" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input-field w-32" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tipo: todos</option>
              <option value="revenue">Receita</option>
              <option value="expense">Despesa</option>
            </select>
            <select className="input-field w-36" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Situação: todas</option>
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhum lançamento com esse filtro.</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3 flex-wrap">
              <span className={'badge ' + (e.type === 'revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                {e.type === 'revenue' ? 'Receita' : 'Despesa'}
              </span>
              <span className={'badge ' + STATUS_BADGE[e.status]}>{STATUS_LABEL[e.status]}</span>
              {!!e.is_recurring && <span className="badge bg-blue-100 text-blue-700">Recorrente</span>}
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm text-slate-700">{e.description}</p>
                <p className="text-xs text-slate-400">
                  Vence {new Date(e.due_date).toLocaleDateString('pt-BR')}
                  {e.paid_date ? ' · Pago em ' + new Date(e.paid_date).toLocaleDateString('pt-BR') : ''}
                  {e.category ? ' · ' + e.category : ''}
                  {e.client_name ? ' · ' + e.client_name : ''}
                </p>
              </div>
              <p className={'text-sm font-medium ' + (e.type === 'revenue' ? 'text-emerald-600' : 'text-red-600')}>
                {e.type === 'revenue' ? '+' : '-'}{currency(e.amount)}
              </p>
              <div className="flex items-center gap-1">
                {e.status === 'pending' && (
                  <>
                    <button onClick={() => settleEntry(e.id)} title="Dar baixa" className="p-1.5 text-slate-400 hover:text-emerald-600"><Check size={15} /></button>
                    <button onClick={() => cancelEntry(e.id)} title="Cancelar" className="p-1.5 text-slate-400 hover:text-amber-600"><Ban size={15} /></button>
                  </>
                )}
                {e.status !== 'pending' && (
                  <button onClick={() => reopenEntry(e.id)} title="Reabrir" className="p-1.5 text-slate-400 hover:text-zebrazul-600"><RotateCcw size={15} /></button>
                )}
                <button onClick={() => deleteEntry(e.id)} title="Excluir" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Novo lançamento</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({ ...form, type: 'revenue' })} className={'py-2 rounded-lg text-sm font-medium border ' + (form.type === 'revenue' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300')}>Receita</button>
                <button type="button" onClick={() => setForm({ ...form, type: 'expense' })} className={'py-2 rounded-lg text-sm font-medium border ' + (form.type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300')}>Despesa</button>
              </div>
              <input className="input-field" placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <input className="input-field" placeholder="Categoria (opcional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <input type="number" step="0.01" className="input-field" placeholder="Valor (R$)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <div>
                <label className="text-xs text-slate-500 block mb-1">Data de vencimento</label>
                <input type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <select className="input-field" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Sem cliente vinculado</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })} />
                Lançamento recorrente
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
