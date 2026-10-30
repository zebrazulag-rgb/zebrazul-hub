import { useCallback, useEffect, useState } from 'react';
import { Check, Film, Loader2, MessageSquareWarning, X } from 'lucide-react';
import api from '../api';
import { Modal, Player, fmtDate, inputCls } from '../components/ReadyVideoParts.jsx';

export default function ClientVideoApproval({ onChanged }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changes, setChanges] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/client-videos'); setVideos(data.videos || []); setError(''); onChanged?.(data.videos || []); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar os vídeos.'); }
    finally { setLoading(false); }
  }, [onChanged]);
  useEffect(() => { load(); }, [load]);

  async function approve(v) {
    setBusy(true);
    try { await api.post(`/client-videos/${v.id}/approve`); setNotice('Vídeo aprovado. Obrigado!'); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível aprovar.'); } finally { setBusy(false); }
  }
  async function sendChanges() {
    if (!changes.note.trim()) { setError('Conte o que precisa mudar.'); return; }
    setBusy(true);
    try { await api.post(`/client-videos/${changes.id}/request-changes`, { note: changes.note }); setChanges(null); setNotice('Pedido de ajuste enviado à equipe.'); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível enviar.'); } finally { setBusy(false); }
  }

  if (loading) return <div className="flex min-h-[30vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando vídeos...</div>;
  const pending = videos.filter((v) => v.stage === 'client');
  const done = videos.filter((v) => v.stage !== 'client');

  const Card = ({ v, actions }) => (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black leading-5 text-slate-950">{v.title}</h3>
      <Player video={v} />
      {v.caption ? <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Legenda</p><p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-slate-600">{v.caption}</p></div> : null}
      <p className="mt-3 text-[10px] text-slate-400">Enviado {fmtDate(v.created_at)}</p>
      {actions}
    </article>
  );

  return (
    <div className="space-y-5 p-1">
      {error && <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{notice}</span><button type="button" onClick={() => setNotice('')}><X size={15} /></button></div>}
      <section>
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Aguardando sua aprovação ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="mt-3 flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center"><div><Film className="mx-auto text-slate-300" size={32} /><p className="mt-2 text-sm text-slate-500">Nenhum vídeo esperando você.</p></div></div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((v) => <Card key={v.id} v={v} actions={(
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => approve(v)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={13} /> Aprovar</button>
                <button type="button" disabled={busy} onClick={() => setChanges({ id: v.id, title: v.title, note: '' })} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"><MessageSquareWarning size={13} /> Pedir ajuste</button>
              </div>
            )} />)}
          </div>
        )}
      </section>
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Já respondidos</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {done.map((v) => <Card key={v.id} v={v} actions={<p className={`mt-2 text-[11px] font-bold ${v.stage === 'approved' ? 'text-emerald-700' : 'text-rose-600'}`}>{v.stage === 'approved' ? 'Aprovado' : `Ajuste pedido: ${v.review_note}`}</p>} />)}
          </div>
        </section>
      )}
      {changes && (
        <Modal title="Pedir ajuste" subtitle={`"${changes.title}"`} onClose={() => setChanges(null)} busy={busy}>
          <label className="block text-xs font-bold text-slate-600">O que precisa mudar?<textarea autoFocus value={changes.note} onChange={(e) => setChanges({ ...changes, note: e.target.value })} rows={5} className={inputCls} /></label>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setChanges(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={sendChanges} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#EC0567] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Enviar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
