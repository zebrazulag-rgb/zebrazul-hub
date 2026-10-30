import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Download, Film, Loader2, Search, Undo2, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';
import { downloadHref } from '../utils/videoEmbed.js';
import { CaptionBox, EditableTitle, Modal, PLATFORMS, Player, fmtDate, fmtSize, inputCls, platformLabel } from '../components/ReadyVideoParts.jsx';

function Card({ video, canSchedule, canEditText, onEdit, onSchedule, onUnschedule }) {
  const dl = downloadHref(video);
  const scheduled = video.status === 'scheduled';
  const removed = Boolean(video.file_deleted_at);
  return (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="truncate text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: video.client_color || '#3A85FD' }}>{video.client_name}</p>
      <EditableTitle video={video} canEdit={canEditText} onSave={onEdit} />
      {removed ? (
        <div className="mt-3 flex aspect-video items-center justify-center rounded-xl bg-slate-50 text-center text-[11px] font-semibold text-slate-400"><span>Arquivo apagado em {fmtDate(video.file_deleted_at)}<br />(fica só o registro)</span></div>
      ) : <Player video={video} />}
      <CaptionBox video={video} canEdit={canEditText} onSave={onEdit} />
      {video.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">{video.notes}</p> : null}
      <p className="mt-3 text-[10px] text-slate-400">Enviado {fmtDate(video.created_at)}{video.uploaded_by_name ? ` por ${video.uploaded_by_name}` : ''}{video.size_bytes ? ` · ${fmtSize(video.size_bytes)}` : ''}</p>
      {scheduled && (
        <p className="mt-1 text-[11px] font-bold text-emerald-700">
          Agendado em {platformLabel(video.scheduled_platform)}{video.scheduled_for ? ` para ${fmtDate(video.scheduled_for)}` : ''}{video.scheduled_by_name ? ` · ${video.scheduled_by_name}` : ''}
          {video.days_until_purge !== null && <span className="block font-semibold text-amber-600">O arquivo será apagado em {video.days_until_purge} dia(s).</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!removed && dl && <a href={dl} target={video.media_url ? undefined : '_blank'} rel="noreferrer" download={video.media_url ? '' : undefined} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-[#3A85FD] hover:text-[#3A85FD]"><Download size={13} /> Baixar</a>}
        {canSchedule && !scheduled && <button type="button" onClick={() => onSchedule(video)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#17181C] px-3 py-2 text-[11px] font-bold text-white hover:bg-black"><CalendarCheck size={13} /> Marcar como agendado</button>}
        {canSchedule && scheduled && !removed && <button type="button" onClick={() => onUnschedule(video)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-500"><Undo2 size={13} /> Voltar para a fila</button>}
      </div>
    </article>
  );
}

export default function VideoScheduling() {
  const { user } = useAuth();
  const canSchedule = hasPermission(user, 'audiovisual.manage') || hasPermission(user, 'audiovisual.publish');
  const canEditText = canSchedule || hasPermission(user, 'audiovisual.edit');
  const [data, setData] = useState({ videos: [], counts: {}, purge_days: 3 });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('approved');
  const [clientFilter, setClientFilter] = useState('');
  const [query, setQuery] = useState('');
  const [schedule, setSchedule] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: list }, { data: cl }] = await Promise.all([api.get('/ready-videos'), api.get('/clients', { params: { summary: '1' } })]);
      setData(list); setClients(cl.clients || []); setError('');
    } catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar os vídeos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => data.videos.filter((v) => (view === 'approved' ? v.status === 'ready' && v.stage === 'approved' : v.status === 'scheduled')
    && (!clientFilter || String(v.client_id) === String(clientFilter))
    && (!query || `${v.title} ${v.client_name} ${v.caption}`.toLowerCase().includes(query.toLowerCase()))), [data.videos, view, clientFilter, query]);

  async function editVideo(v, patch) {
    try { await api.put(`/ready-videos/${v.id}`, patch); setData((d) => ({ ...d, videos: d.videos.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) })); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível salvar.'); await load(); }
  }
  async function confirmSchedule() {
    setBusy(true);
    try { await api.post(`/ready-videos/${schedule.id}/schedule`, { platform: schedule.platform, scheduled_for: schedule.scheduled_for }); setSchedule(null); setNotice(`Marcado como agendado. O arquivo será apagado em ${data.purge_days} dias.`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível marcar como agendado.'); }
    finally { setBusy(false); }
  }
  async function unschedule(v) {
    try { await api.post(`/ready-videos/${v.id}/unschedule`); await load(); } catch (e) { setError(e.response?.data?.error || 'Não foi possível voltar para a fila.'); }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando vídeos...</div>;
  const counts = data.counts || {};

  return (
    <div className="space-y-4">
      {error && <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{notice}</span><button type="button" onClick={() => setNotice('')}><X size={15} /></button></div>}
      <div className="toolbar-panel flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5">
          {[['approved', 'Para agendar', counts.approved || 0], ['scheduled', 'Agendados (histórico)', counts.scheduled || 0]].map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setView(key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${view === key ? 'border-[#17181C] bg-[#17181C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{label}<span className={view === key ? 'text-[#C9FF2F]' : 'text-slate-300'}>{count}</span></button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="w-36 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-[#3A85FD]" /></div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">{view === 'approved' ? 'Só aparecem aqui vídeos aprovados pela direção e pelo cliente. Baixe, agende na plataforma e marque como agendado.' : `Depois de marcado como agendado, o arquivo é apagado em ${data.purge_days} dias. Vídeos por link não são apagados. O registro fica como histórico.`}</p>
      {visible.length === 0 ? (
        <div className="surface-card flex min-h-[260px] items-center justify-center p-8 text-center"><div><Film className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm text-slate-500">{view === 'approved' ? 'Nenhum vídeo aprovado esperando agendamento.' : 'Nenhum vídeo agendado ainda.'}</p></div></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((v) => <Card key={v.id} video={v} canSchedule={canSchedule} canEditText={canEditText} onEdit={editVideo} onSchedule={(x) => setSchedule({ id: x.id, title: x.title, platform: 'instagram', scheduled_for: '' })} onUnschedule={unschedule} />)}
        </div>
      )}
      {schedule && (
        <Modal title="Marcar como agendado" subtitle={`"${schedule.title}" — o arquivo será apagado em ${data.purge_days} dias; o registro fica no histórico.`} onClose={() => setSchedule(null)} busy={busy}>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">Plataforma<select value={schedule.platform} onChange={(e) => setSchedule({ ...schedule, platform: e.target.value })} className={inputCls}>{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-600">Data prevista de publicação (opcional)<input type="date" value={schedule.scheduled_for} onChange={(e) => setSchedule({ ...schedule, scheduled_for: e.target.value })} className={inputCls} /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setSchedule(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={confirmSchedule} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Confirmar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
