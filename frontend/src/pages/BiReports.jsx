import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, ChevronRight, FileUp, Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import AreaSwitch from '../components/AreaSwitch.jsx';
import BiImportModal from '../components/bi/BiImportModal.jsx';
import BiHistory from '../components/bi/BiHistory.jsx';
import { Empty } from '../components/bi/BiParts.jsx';
import { MONTHS, STATE_CLS, STATE_LABEL, useBiCatalog } from '../components/bi/biUtils.js';
import { Modal, inputCls } from '../components/ReadyVideoParts.jsx';

function NewReport({ clients, catalog, defaultClient, onClose, onCreated }) {
  const now = new Date();
  const [f, setF] = useState({ client_id: defaultClient || '', year: now.getFullYear(), month: now.getMonth() + 1, responsible_name: '', modules: [] });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toggle = (k) => setF({ ...f, modules: f.modules.includes(k) ? f.modules.filter((x) => x !== k) : [...f.modules, k] });
  async function create() {
    setBusy(true); setErr('');
    try { const { data } = await api.post('/bi-reports', { ...f, client_id: Number(f.client_id) }); onCreated(data.id); }
    catch (e) { setErr(e.response?.data?.error || 'Não foi possível criar.'); if (e.response?.data?.id) onCreated(e.response.data.id, true); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Novo relatório" subtitle="Escolha só os módulos que fazem sentido agora. Dá para adicionar outros depois." onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Cliente
          <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} className={inputCls}><option value="">Selecione...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-600">Mês<select value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })} className={inputCls}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label className="block text-xs font-semibold text-slate-600">Ano<input type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} className={inputCls} /></label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">Responsável<input value={f.responsible_name} onChange={(e) => setF({ ...f, responsible_name: e.target.value })} placeholder="Padrão: você" className={inputCls} /></label>
        <div><p className="mb-1.5 text-xs font-semibold text-slate-600">Módulos</p>
          <div className="flex flex-wrap gap-2">{Object.entries(catalog?.catalog || {}).filter(([k]) => k !== 'other').map(([k, d]) => <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${f.modules.includes(k) ? 'border-[#3A85FD] bg-blue-50 text-[#3A85FD]' : 'border-slate-200 text-slate-600'}`}>{d.label}</button>)}</div>
        </div>
        {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-bold text-slate-500">Cancelar</button><button type="button" disabled={busy || !f.client_id} onClick={create} className="rounded-xl bg-[#3A85FD] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Criar relatório</button></div>
      </div>
    </Modal>
  );
}

export default function BiReports({ portal = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = useClientFilter();
  const catalog = useBiCatalog();
  const canEdit = !portal && hasPermission(user, 'reports.edit');
  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState({ client_id: String(filter?.selectedClient?.id || ''), year: '', month: '', status: '' });
  const view = params.get('aba') === 'historico' ? 'historico' : 'lista';
  const base = portal ? '/cliente/relatorios-mensais' : '/relatorios';

  useEffect(() => { if (!portal) api.get('/clients', { params: { summary: '1' } }).then(({ data }) => setClients(data.clients || [])).catch(() => {}); }, [portal]);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/bi-reports', { params: Object.fromEntries(Object.entries(q).filter(([, v]) => v)) }); setReports(data.reports); }
    finally { setLoading(false); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (view === 'historico' && !portal && !q.client_id && clients.length) setQ((o) => ({ ...o, client_id: String(clients[0].id) })); }, [view, portal, q.client_id, clients]);

  const years = useMemo(() => { const y = new Date().getFullYear(); return [y + 1, y, y - 1, y - 2, y - 3]; }, []);
  const historyClient = portal ? user?.client_id : q.client_id;
  const sel = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700';

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="brand-display flex items-center gap-2 text-2xl font-black text-slate-950"><BarChart3 size={22} className="text-[#3A85FD]" /> Relatórios</h1>
          <p className="text-xs text-slate-500">Relatórios mensais por cliente, com histórico, comparações e leitura do período.</p>
        </div>
        {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setImporting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><FileUp size={15} /> Importar CSV</button><button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#2f74e6]"><Plus size={15} /> Novo relatório</button></div>}
      </div>

      <AreaSwitch value={view === 'historico' ? 'historico' : 'lista'} onChange={(k) => setParams(k === 'historico' ? { aba: 'historico' } : {}, { replace: true })} options={[{ key: 'lista', label: 'Relatórios' }, { key: 'historico', label: 'Histórico' }]} />

      <div className="flex flex-wrap gap-2">
        {!portal && <select value={q.client_id} onChange={(e) => setQ({ ...q, client_id: e.target.value })} className={sel}><option value="">Todos os clientes</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {view === 'lista' && (
          <>
            <select value={q.year} onChange={(e) => setQ({ ...q, year: e.target.value })} className={sel}><option value="">Todos os anos</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
            <select value={q.month} onChange={(e) => setQ({ ...q, month: e.target.value })} className={sel}><option value="">Todos os meses</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            {!portal && <select value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })} className={sel}><option value="">Qualquer status</option><option value="draft">Rascunho</option><option value="final">Finalizado</option></select>}
          </>
        )}
      </div>

      {view === 'historico' ? <BiHistory clientId={historyClient} onOpen={(id) => navigate(`${base}/${id}`)} /> : (
        loading ? <Empty>Carregando...</Empty> : reports.length === 0 ? <Empty>{portal ? 'Nenhum relatório disponível ainda.' : 'Nenhum relatório encontrado. Clique em “Novo relatório” para começar.'}</Empty> : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <button key={r.id} type="button" onClick={() => navigate(`${base}/${r.id}`)} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#3A85FD]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: r.client_color || '#3A85FD' }}>{r.client_name}</p><p className="brand-display mt-0.5 text-base font-black text-slate-950">{r.label}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${r.status === 'final' ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-slate-100 text-slate-500'}`}>{r.status === 'final' ? 'Finalizado' : 'Rascunho'}</span>
                </div>
                <div className="mt-3 flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#3A85FD]" style={{ width: `${r.completeness}%` }} /></div><b className="text-[11px] text-slate-600">{r.completeness}%</b></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{r.areas.map((a) => <span key={a.key} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_CLS[a.state]}`}>{a.label.split(' ')[0]}: {STATE_LABEL[a.state]}</span>)}</div>
                <p className="mt-3 flex items-center justify-between text-[10px] text-slate-400"><span>{r.responsible_name || '—'} · v{r.version}</span><ChevronRight size={14} /></p>
              </button>
            ))}
          </div>
        )
      )}
      {importing && <BiImportModal catalog={catalog} onClose={() => setImporting(false)} onDone={load} />}
      {creating && <NewReport clients={clients} catalog={catalog} defaultClient={q.client_id} onClose={() => setCreating(false)} onCreated={(id) => navigate(`${base}/${id}`)} />}
    </div>
  );
}
