import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Pencil, Presentation, Printer, RotateCcw, Trash2 } from 'lucide-react';
import api from '../api';
import BiEditor from '../components/bi/BiEditor.jsx';
import BiPresentation from '../components/bi/BiPresentation.jsx';
import { Card } from '../components/bi/BiParts.jsx';
import { periodName, STATE_CLS, STATE_LABEL, useBiCatalog } from '../components/bi/biUtils.js';
import { Modal, inputCls } from '../components/ReadyVideoParts.jsx';

function Versions({ id }) {
  const [v, setV] = useState(null);
  useEffect(() => { api.get(`/bi-reports/${id}/versions`).then(({ data }) => setV(data)).catch(() => setV({ versions: [], current: null })); }, [id]);
  if (!v) return null;
  return (
    <Card title="Histórico de versões" subtitle="Cada reabertura de um relatório finalizado guarda a versão anterior — nada é sobrescrito em silêncio.">
      {v.current && <p className="mb-2 text-xs text-slate-600">Versão atual: <b>v{v.current.version}</b> · {v.current.status === 'final' ? `finalizada${v.current.finalized_by_name ? ` por ${v.current.finalized_by_name}` : ''}` : 'em edição'}</p>}
      {v.versions.length === 0 ? <p className="text-xs text-slate-400">Nenhuma versão anterior guardada.</p> : v.versions.map((x) => (
        <div key={x.id} className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <b>v{x.version}</b> · guardada em {new Date(`${x.created_at.replace(' ', 'T')}Z`).toLocaleString('pt-BR')} por {x.saved_by_name}{x.finalized_by_name ? ` (finalizada por ${x.finalized_by_name})` : ''}
          <p className="text-[11px] text-slate-400">Motivo: {x.reason || '—'} · {x.modules.map((m) => `${m.module_key}: ${m.metrics} métricas`).join(' · ')}</p>
        </div>
      ))}
    </Card>
  );
}

export default function BiReportDetail({ portal = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const catalog = useBiCatalog();
  const [payload, setPayload] = useState(null);
  const [baseline, setBaseline] = useState('prev');
  const [mode, setMode] = useState('present');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState('');
  const modeSet = useRef(false);

  const load = useCallback(async (b = baseline) => {
    try { const { data } = await api.get(`/bi-reports/${id}`, { params: { baseline: b } }); setPayload(data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar o relatório.'); }
  }, [id, baseline]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (payload && !modeSet.current) { modeSet.current = true; if (payload.can_edit && payload.report.status === 'draft') setMode('edit'); } }, [payload]);

  const back = portal ? '/cliente/relatorios-mensais' : '/relatorios';
  if (error) return <div className="mx-auto max-w-3xl p-6"><button type="button" onClick={() => navigate(back)} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-[#3A85FD]"><ArrowLeft size={14} /> Voltar</button><p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p></div>;
  if (!payload || !catalog) return <div className="flex justify-center p-12 text-slate-400"><Loader2 className="animate-spin" /></div>;

  const { report, analysis, can_edit: canEdit } = payload;
  const locked = report.status === 'final';
  const run = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (e) { alert(e.response?.data?.error || 'Não foi possível concluir.'); } finally { setBusy(false); } };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <div className="print:hidden"><button type="button" onClick={() => navigate(back)} className="inline-flex items-center gap-1 text-xs font-bold text-[#3A85FD]"><ArrowLeft size={14} /> Relatórios</button></div>

      <header className="rounded-[26px] bg-[#17181C] p-5 text-white sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: report.client_color || '#C9FF2F' }}>{report.client_name}</p>
        <h1 className="brand-display mt-1 text-2xl font-black sm:text-3xl">Relatório de {periodName(report)}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2.5 py-1 font-black uppercase ${locked ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-white/15 text-white'}`}>{locked ? 'Finalizado' : 'Rascunho'}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">v{report.version}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">Completude {analysis.completeness.percent}%</span>
          {report.responsible_name && <span className="text-white/60">Responsável: {report.responsible_name}</span>}
          {report.period_start && <span className="text-white/60">{report.period_start.split('-').reverse().join('/')} a {(report.period_end || '').split('-').reverse().join('/')}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">{analysis.completeness.areas.map((x) => <span key={x.key} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATE_CLS[x.state]}`}>{x.label}: {STATE_LABEL[x.state]}</span>)}</div>
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {canEdit && (
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
            {[['edit', 'Editar dados', Pencil], ['present', 'Apresentação', Presentation]].map(([k, l, Icon]) => <button key={k} type="button" onClick={() => setMode(k)} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${mode === k ? 'bg-[#17181C] text-white' : 'text-slate-500'}`}><Icon size={13} /> {l}</button>)}
          </div>
        )}
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><Printer size={13} /> Imprimir / PDF</button>
        {canEdit && !locked && <button type="button" disabled={busy} onClick={() => run(() => api.post(`/bi-reports/${id}/finalize`))} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A85FD] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"><Lock size={13} /> Finalizar relatório</button>}
        {canEdit && locked && <button type="button" disabled={busy} onClick={() => setReopen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800"><RotateCcw size={13} /> Reabrir para editar</button>}
        {canEdit && <button type="button" onClick={async () => { if (!window.confirm('Excluir este relatório e todos os dados dele? Um backup é feito antes.')) return; await run(() => api.delete(`/bi-reports/${id}`)); navigate(back); }} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#EC0567]"><Trash2 size={13} /> Excluir</button>}
      </div>

      {canEdit && mode === 'edit'
        ? <><BiEditor report={report} catalog={catalog} locked={locked} onChanged={() => load()} />{canEdit && <Versions id={id} />}</>
        : <BiPresentation data={analysis} report={report} catalog={catalog} baseline={baseline} onBaseline={(b) => { setBaseline(b); load(b); }} />}

      {reopen && (
        <Modal title="Reabrir relatório" subtitle="A versão finalizada atual será guardada no histórico de versões antes de liberar a edição." onClose={() => setReopen(false)}>
          <label className="text-xs font-semibold text-slate-600">Motivo da alteração<input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="Ex.: corrigir alcance do Instagram" /></label>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReopen(false)} className="px-3 py-2 text-xs font-bold text-slate-500">Cancelar</button><button type="button" onClick={async () => { await run(() => api.post(`/bi-reports/${id}/reopen`, { reason })); setReopen(false); setReason(''); setMode('edit'); }} className="rounded-xl bg-[#17181C] px-4 py-2 text-xs font-bold text-white">Reabrir</button></div>
        </Modal>
      )}
    </div>
  );
}
