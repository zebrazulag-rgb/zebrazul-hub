import { useRef, useState } from 'react';
import { Download, FileUp, Loader2 } from 'lucide-react';
import api from '../../api';
import { MONTHS } from './biUtils.js';
import { Modal } from '../ReadyVideoParts.jsx';

const ACTION = { create: ['Novo rascunho', 'bg-emerald-50 text-emerald-700'], merge: ['Atualiza rascunho', 'bg-blue-50 text-blue-700'], skip_final: ['Finalizado — será ignorado', 'bg-slate-100 text-slate-500'] };

export default function BiImportModal({ catalog, onClose, onDone }) {
  const [mods, setMods] = useState([]);
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const ref = useRef(null);

  async function download() {
    const { data } = await api.get('/bi-reports/import/template', { params: { modules: mods.join(',') }, responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = 'modelo-relatorios-zebrahub.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  const form = (f) => { const fd = new FormData(); fd.append('file', f); return fd; };
  const cfg = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };
  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPlan(null); setErr(''); setBusy(true);
    try { const { data } = await api.post('/bi-reports/import/preview', form(f), cfg); setPlan(data); }
    catch (x) { setErr(x.response?.data?.error || 'Não foi possível ler o arquivo.'); }
    finally { setBusy(false); e.target.value = ''; }
  }
  async function commit() {
    setBusy(true); setErr('');
    try { const { data } = await api.post('/bi-reports/import/commit', form(file), cfg); setResult(data); onDone(); }
    catch (x) { setErr(x.response?.data?.error || 'Não foi possível importar.'); }
    finally { setBusy(false); }
  }
  const importable = plan?.reports.filter((r) => r.action !== 'skip_final').length || 0;

  return (
    <Modal title="Importar relatórios (CSV)" subtitle="Um arquivo pode ter vários clientes e vários meses. Nada é gravado até você confirmar." onClose={onClose} busy={busy}>
      {result ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Importação concluída: {result.created} relatório(s) criado(s), {result.merged} atualizado(s), {result.metrics} métricas gravadas. Eles ficaram como <b>rascunho</b> para você revisar e finalizar.</p>
          {result.skipped.length > 0 && <p className="text-xs text-slate-500">Ignorados: {result.skipped.join('; ')}.</p>}
          <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-[#17181C] px-4 py-2 text-xs font-bold text-white">Fechar</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">1. Baixe o modelo</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Uma linha por métrica. Preencha a coluna <b>valor</b>, troque “Nome do cliente” e duplique as linhas para outros clientes/meses. Valor em branco = não informado.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(catalog?.catalog || {}).filter(([k]) => k !== 'other').map(([k, d]) => <button key={k} type="button" onClick={() => setMods(mods.includes(k) ? mods.filter((x) => x !== k) : [...mods, k])} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${mods.includes(k) ? 'border-[#3A85FD] bg-blue-50 text-[#3A85FD]' : 'border-slate-200 text-slate-500'}`}>{d.label}</button>)}</div>
            <button type="button" onClick={download} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-3.5 py-2 text-xs font-bold text-white"><Download size={14} /> Baixar modelo {mods.length ? `(${mods.length} módulo${mods.length > 1 ? 's' : ''})` : '(todos)'}</button>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">2. Envie o arquivo preenchido</p>
            <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
            <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} {file ? 'Trocar arquivo' : 'Escolher CSV'}</button>
            {file && <span className="ml-2 text-[11px] text-slate-500">{file.name}</span>}
          </div>
          {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
          {plan && (
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">3. Confira a prévia</p>
              <p className="mt-1 text-[11px] text-slate-500">{plan.used_rows} linhas válidas · {plan.skipped_empty} em branco (não informadas){plan.custom_metrics ? ` · ${plan.custom_metrics} métrica(s) não padrão entrarão como personalizadas` : ''}</p>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {plan.reports.map((r) => (
                  <div key={`${r.client_id}-${r.year}-${r.month}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <div><p className="text-xs font-bold text-slate-800">{r.client_name} · {MONTHS[r.month - 1]}/{r.year}</p><p className="text-[10px] text-slate-400">{r.modules.map((m) => `${m.label || m.module_key}: ${m.metrics}`).join(' · ')}</p></div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ACTION[r.action][1]}`}>{ACTION[r.action][0]}</span>
                  </div>
                ))}
              </div>
              {plan.errors.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] font-black uppercase text-amber-800">{plan.errors.length} linha(s) com problema (serão ignoradas)</p>
                  <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-amber-900">{plan.errors.slice(0, 30).map((e, i) => <li key={i}>Linha {e.line}: {e.error}</li>)}</ul></div>
              )}
              <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-bold text-slate-500">Cancelar</button>
                <button type="button" disabled={busy || !importable} onClick={commit} className="rounded-xl bg-[#3A85FD] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Importar {importable} relatório(s)</button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
