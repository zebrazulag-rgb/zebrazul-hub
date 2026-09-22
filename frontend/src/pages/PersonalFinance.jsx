import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const emptySummary = {
  income_total: 0,
  income_paid: 0,
  income_pending: 0,
  expense_total: 0,
  expense_paid: 0,
  expense_pending: 0,
  balance_realized: 0,
  balance_projected: 0,
};

const paymentMethods = ['Pix', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro', 'Outro'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

function createInitialForm(month = currentMonth()) {
  const date = month === currentMonth() ? today() : `${month}-01`;
  return {
    type: 'expense',
    category: '',
    description: '',
    amount: '',
    due_date: date,
    paid_date: '',
    status: 'pending',
    payment_method: '',
    recurring: false,
    notes: '',
  };
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function dateLabel(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function statusLabel(status) {
  if (status === 'paid') return 'Pago';
  if (status === 'overdue') return 'Atrasado';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendente';
}

function statusClass(status) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'overdue') return 'bg-red-50 text-red-700 border-red-100';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

export default function PersonalFinance() {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(() => createInitialForm());
  const descriptionRef = useRef(null);

  useEffect(() => {
    loadFinance();
  }, [month, typeFilter, statusFilter]);

  async function loadFinance() {
    setLoading(true);
    setError('');
    try {
      const params = { month };
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/organizer/finance', { params });
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setSummary(data?.summary || emptySummary);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar seu financeiro pessoal.');
    } finally {
      setLoading(false);
    }
  }

  function openNewEntry() {
    setEditingEntry(null);
    setForm(createInitialForm(month));
    setError('');
    setShowForm(true);
    window.setTimeout(() => descriptionRef.current?.focus(), 80);
  }

  function openEditEntry(entry) {
    setEditingEntry(entry);
    setForm({
      type: entry.type || 'expense',
      category: entry.category || '',
      description: entry.description || '',
      amount: String(entry.amount ?? ''),
      due_date: entry.due_date || today(),
      paid_date: entry.paid_date || '',
      status: entry.status === 'overdue' ? 'pending' : (entry.status || 'pending'),
      payment_method: entry.payment_method || '',
      recurring: Boolean(entry.recurring),
      notes: entry.notes || '',
    });
    setError('');
    setShowForm(true);
  }

  async function saveEntry(event) {
    event?.preventDefault?.();
    setError('');

    if (!form.description.trim() || !form.category.trim() || !form.amount || !form.due_date) {
      setError('Preencha descrição, categoria, valor e data.');
      return;
    }

    const amount = Number(String(form.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor válido.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description.trim(),
        category: form.category.trim(),
        amount,
        paid_date: form.status === 'paid' ? (form.paid_date || today()) : null,
      };

      if (editingEntry) await api.put(`/organizer/finance/${editingEntry.id}`, payload);
      else await api.post('/organizer/finance', payload);

      setShowForm(false);
      setEditingEntry(null);
      setNotice(editingEntry ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
      window.setTimeout(() => setNotice(''), 2400);
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  async function markAsPaid(entry) {
    try {
      await api.put(`/organizer/finance/${entry.id}`, { status: 'paid', paid_date: today() });
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível dar baixa no lançamento.');
    }
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Excluir “${entry.description}”?`)) return;
    try {
      await api.delete(`/organizer/finance/${entry.id}`);
      await loadFinance();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir o lançamento.');
    }
  }

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return entries;
    return entries.filter((entry) =>
      [entry.description, entry.category, entry.payment_method, entry.notes]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term))
    );
  }, [entries, search]);

  function exportCsv() {
    const headers = ['Tipo', 'Descrição', 'Categoria', 'Valor', 'Data', 'Situação', 'Forma de pagamento', 'Recorrente', 'Observações'];
    const rows = visibleEntries.map((entry) => [
      entry.type === 'income' ? 'Receita' : 'Despesa',
      entry.description,
      entry.category || '',
      Number(entry.amount || 0).toFixed(2).replace('.', ','),
      entry.due_date || '',
      statusLabel(entry.status),
      entry.payment_method || '',
      entry.recurring ? 'Sim' : 'Não',
      entry.notes || '',
    ]);
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meu-financeiro-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">Financeiro pessoal</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Meu financeiro</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Controle suas receitas, despesas e compromissos financeiros sem vínculo com clientes da agência.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Download size={16} /> Exportar
          </button>
          <button onClick={openNewEntry} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
            <Plus size={17} /> Novo lançamento
          </button>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Receitas recebidas" value={summary.income_paid} icon={TrendingUp} tone="emerald" detail={`${money(summary.income_total)} previstos`} />
        <SummaryCard label="Despesas pagas" value={summary.expense_paid} icon={TrendingDown} tone="red" detail={`${money(summary.expense_total)} previstas`} />
        <SummaryCard label="Saldo realizado" value={summary.balance_realized} icon={WalletCards} tone="blue" detail="Entradas menos saídas pagas" />
        <SummaryCard label="Saldo projetado" value={summary.balance_projected} icon={CircleDollarSign} tone="violet" detail="Considerando o mês inteiro" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[170px_160px_180px_1fr]">
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Mês</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Tipo</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white">
              <option value="all">Todos</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Situação</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white">
              <option value="all">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
              <option value="overdue">Atrasados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Buscar</span>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Descrição ou categoria..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
            </div>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-black text-slate-900">Lançamentos do mês</p>
            <p className="mt-0.5 text-xs text-slate-400">{visibleEntries.length} lançamento(s)</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando seu financeiro...</div>
        ) : visibleEntries.length === 0 ? (
          <div className="py-16 text-center">
            <WalletCards size={30} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Nenhum lançamento neste período</p>
            <p className="mt-1 text-xs text-slate-400">Adicione uma receita ou despesa pessoal para começar.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleEntries.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 lg:flex-row lg:items-center">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {entry.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-800">{entry.description}</p>
                    {entry.recurring ? <Repeat2 size={13} className="text-slate-400" /> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{entry.category || 'Sem categoria'}</span>
                    <span>{dateLabel(entry.due_date)}</span>
                    {entry.payment_method && <span>{entry.payment_method}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 lg:ml-auto">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>
                  <p className={`min-w-[110px] text-right text-sm font-black ${entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entry.type === 'income' ? '+' : '-'} {money(entry.amount)}
                  </p>
                  <div className="flex items-center gap-1">
                    {entry.status !== 'paid' && entry.status !== 'cancelled' && (
                      <button onClick={() => markAsPaid(entry)} title="Marcar como pago" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><Check size={15} /></button>
                    )}
                    <button onClick={() => openEditEntry(entry)} title="Editar" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={15} /></button>
                    <button onClick={() => deleteEntry(entry)} title="Excluir" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <ModalBackdrop onClose={() => !saving && setShowForm(false)} disabled={saving}>
          <form onSubmit={saveEntry} className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-black text-slate-900">{editingEntry ? 'Editar lançamento' : 'Novo lançamento'}</h3>
                <p className="mt-0.5 text-xs text-slate-500">Registre uma receita ou despesa da sua vida pessoal.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={17} /></button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm((f) => ({ ...f, type: 'income' }))} className={`rounded-2xl border p-4 text-left transition ${form.type === 'income' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <TrendingUp size={18} className="text-emerald-500" />
                  <p className="mt-3 text-sm font-black text-slate-800">Receita</p>
                  <p className="mt-0.5 text-xs text-slate-500">Dinheiro que entra para você.</p>
                </button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, type: 'expense' }))} className={`rounded-2xl border p-4 text-left transition ${form.type === 'expense' ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <TrendingDown size={18} className="text-red-500" />
                  <p className="mt-3 text-sm font-black text-slate-800">Despesa</p>
                  <p className="mt-0.5 text-xs text-slate-500">Dinheiro que sai do seu orçamento.</p>
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Descrição</span>
                  <input ref={descriptionRef} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex.: Mercado do mês" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Categoria</span>
                  <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Ex.: Mercado, lazer, aluguel..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Valor</span>
                  <input inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="R$ 0,00" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Data</span>
                  <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Situação</span>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Forma de pagamento</span>
                  <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                    <option value="">Não informada</option>
                    {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>

                {form.status === 'paid' && (
                  <label>
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Data do pagamento</span>
                    <input type="date" value={form.paid_date || today()} onChange={(e) => setForm((f) => ({ ...f, paid_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                  </label>
                )}

                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Observações</span>
                  <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Informações complementares..." className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>

                <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} className="mt-1" />
                  <div>
                    <p className="text-sm font-bold text-slate-700">Lançamento recorrente</p>
                    <p className="mt-0.5 text-xs text-slate-500">Use para aluguel, assinaturas, salário e outros compromissos pessoais recorrentes.</p>
                  </div>
                </label>
              </div>

              {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
              <button type="button" disabled={saving} onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Salvando...' : editingEntry ? 'Salvar alterações' : 'Adicionar lançamento'}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone, detail }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone] || tones.blue}`}><Icon size={17} /></div>
      <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight text-slate-900">{money(value)}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </div>
  );
}
