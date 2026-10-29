import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Download, ExternalLink, Film, Loader2, Maximize2, Play, Plus, Search, Trash2, Undo2, Upload, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { downloadHref, videoPlayback } from '../utils/videoEmbed.js';

const PLATFORMS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['other', 'Outro']];
const platformLabel = (k) => (PLATFORMS.find(([key]) => key === k) || [k, k || '—'])[1];
const fmtDate = (v) => { if (!v) return '—'; const d = new Date(String(v).includes('T') || String(v).includes('Z') ? v : `${String(v).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR'); };
const fmtSize = (b) => (b ? `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB` : '');

function PlayerMedia({ video, p, big, vertical }) {
  if (p.kind === 'iframe') {
    const box = big ? 'h-[80vh] w-full' : vertical ? 'h-[520px] w-full' : 'aspect-video w-full';
    return <iframe title={video.title} src={p.src} allow="autoplay; fullscreen" allowFullScreen className={`${box} rounded-xl border-0 bg-black`} />;
  }
  // Arquivo: mantém a proporção original (vertical ou horizontal), sem cortar.
  return <video src={p.src} controls autoPlay={!big} playsInline preload="metadata" className={`mx-auto block w-auto max-w-full rounded-xl bg-black ${big ? 'max-h-[85vh]' : 'max-h-[460px]'}`} />;
}

function Player({ video }) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState(false);
  const [vertical, setVertical] = useState(false);
  const p = videoPlayback(video);
  if (p.kind === 'none') return null;
  if (p.kind === 'link') {
    return <a href={p.open} target="_blank" rel="noreferrer" className="mt-3 flex aspect-video items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-bold text-[#3A85FD]"><ExternalLink size={14} /> Abrir link do vídeo</a>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="group relative mt-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-[#17181C]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9FF2F] text-[#17181C] transition group-hover:scale-110"><Play size={20} fill="currentColor" /></span>
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wider text-white/60">Assistir aqui</span>
      </button>
    );
  }
  return (
    <div className="mt-3">
      <PlayerMedia video={video} p={p} vertical={vertical} />
      <div className="mt-2 flex items-center justify-end gap-2">
        {p.kind === 'iframe' && <button type="button" onClick={() => setVertical((v) => !v)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]">{vertical ? 'Formato horizontal' : 'Formato vertical'}</button>}
        <button type="button" onClick={() => setBig(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]"><Maximize2 size={11} /> Ampliar</button>
      </div>
      {big && (
        <ModalBackdrop onClose={() => setBig(false)}>
          <div className="w-full max-w-5xl rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm font-black text-slate-950">{video.client_name} · {video.title}</h2><button type="button" onClick={() => setBig(false)} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700"><X size={16} /></button></div>
            <PlayerMedia video={video} p={p} big />
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

function VideoCard({ video, canSchedule, canDelete, onSchedule, onUnschedule, onDelete }) {
  const dl = downloadHref(video);
  const scheduled = video.status === 'scheduled';
  const removed = Boolean(video.file_deleted_at);
  return (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: video.client_color || '#3A85FD' }}>{video.client_name}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950">{video.title}</h3>
        </div>
        {canDelete && <button type="button" title="Apagar" aria-label="Apagar vídeo" onClick={() => onDelete(video)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-[#EC0567]"><Trash2 size={14} /></button>}
      </div>
      {removed ? (
        <div className="mt-3 flex aspect-video items-center justify-center rounded-xl bg-slate-50 text-center text-[11px] font-semibold text-slate-400"><span>Arquivo apagado em {fmtDate(video.file_deleted_at)}<br />(fica só o registro)</span></div>
      ) : <Player video={video} />}
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

function Modal({ title, subtitle, onClose, children, busy }) {
  return (
    <ModalBackdrop onClose={onClose} disabled={busy}>
      <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700"><X size={17} /></button>
        </div>
        {children}
      </div>
    </ModalBackdrop>
  );
}
const inputCls = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A85FD]';

export default function ReadyVideosTab({ canUpload, canSchedule, canDelete }) {
  const [data, setData] = useState({ videos: [], counts: { ready: 0, scheduled: 0 }, purge_days: 3 });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('ready');
  const [clientFilter, setClientFilter] = useState('');
  const [query, setQuery] = useState('');
  const [upload, setUpload] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: list }, { data: cl }] = await Promise.all([api.get('/audiovisual/ready-videos'), api.get('/clients', { params: { summary: '1' } })]);
      setData(list); setClients(cl.clients || []); setError('');
    } catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar os vídeos prontos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => data.videos.filter((v) => (
    (view === 'ready' ? v.status === 'ready' : v.status === 'scheduled')
    && (!clientFilter || String(v.client_id) === String(clientFilter))
    && (!query || `${v.title} ${v.client_name} ${v.notes}`.toLowerCase().includes(query.toLowerCase()))
  )), [data.videos, view, clientFilter, query]);

  const clientsWithVideos = useMemo(() => {
    const ids = new Map();
    data.videos.filter((v) => v.status === 'ready').forEach((v) => ids.set(v.client_id, (ids.get(v.client_id) || 0) + 1));
    return ids;
  }, [data.videos]);

  async function sendUpload() {
    if (!upload?.client_id || !upload.title?.trim() || (!upload.file && !upload.link_url?.trim())) { setError('Escolha o cliente, dê um título e anexe o vídeo ou cole um link.'); return; }
    const fd = new FormData();
    fd.append('client_id', upload.client_id); fd.append('title', upload.title); fd.append('notes', upload.notes || '');
    if (upload.link_url) fd.append('link_url', upload.link_url);
    if (upload.file) fd.append('file', upload.file);
    setBusy(true); setError('');
    try { await api.post('/audiovisual/ready-videos', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 }); setUpload(null); setNotice('Vídeo enviado para a fila.'); setView('ready'); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível enviar o vídeo.'); }
    finally { setBusy(false); }
  }
  async function confirmSchedule() {
    setBusy(true);
    try { await api.post(`/audiovisual/ready-videos/${schedule.id}/schedule`, { platform: schedule.platform, scheduled_for: schedule.scheduled_for }); setSchedule(null); setNotice(`Marcado como agendado. O arquivo será apagado em ${data.purge_days} dias.`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível marcar como agendado.'); }
    finally { setBusy(false); }
  }
  async function unschedule(v) {
    try { await api.post(`/audiovisual/ready-videos/${v.id}/unschedule`); await load(); } catch (e) { setError(e.response?.data?.error || 'Não foi possível voltar para a fila.'); }
  }
  async function remove(v) {
    if (!window.confirm(`Apagar "${v.title}"? O arquivo e o registro serão removidos.`)) return;
    try { await api.delete(`/audiovisual/ready-videos/${v.id}`); await load(); } catch (e) { setError(e.response?.data?.error || 'Não foi possível apagar.'); }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando vídeos...</div>;

  return (
    <div className="space-y-4">
      {error && <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{notice}</span><button type="button" onClick={() => setNotice('')}><X size={15} /></button></div>}

      <div className="toolbar-panel flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5">
          {[['ready', 'Para agendar', data.counts.ready], ['scheduled', 'Agendados (histórico)', data.counts.scheduled]].map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setView(key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${view === key ? 'border-[#17181C] bg-[#17181C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{label}<span className={view === key ? 'text-[#C9FF2F]' : 'text-slate-300'}>{count}</span></button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="w-36 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-[#3A85FD]" /></div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{view === 'ready' && clientsWithVideos.get(c.id) ? ` (${clientsWithVideos.get(c.id)})` : ''}</option>)}
          </select>
          {canUpload && <button type="button" onClick={() => setUpload({ client_id: clientFilter || '', title: '', notes: '', link_url: '', file: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A85FD] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#2f74e6]"><Plus size={14} /> Enviar vídeo</button>}
        </div>
      </div>

      {view === 'scheduled' && <p className="text-xs text-slate-500">Depois de marcado como agendado, o arquivo é apagado em {data.purge_days} dias. Vídeos enviados por link não são apagados. O registro permanece como histórico.</p>}

      {visible.length === 0 ? (
        <div className="surface-card flex min-h-[280px] items-center justify-center p-8 text-center"><div><Film className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm text-slate-500">{view === 'ready' ? 'Nenhum vídeo esperando agendamento.' : 'Nenhum vídeo agendado ainda.'}</p></div></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((v) => <VideoCard key={v.id} video={v} canSchedule={canSchedule} canDelete={canDelete} onSchedule={(x) => setSchedule({ id: x.id, title: x.title, platform: 'instagram', scheduled_for: '' })} onUnschedule={unschedule} onDelete={remove} />)}
        </div>
      )}

      {upload && (
        <Modal title="Enviar vídeo pronto" subtitle="O social media vai ver, assistir, baixar e agendar a partir daqui." onClose={() => setUpload(null)} busy={busy}>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">Cliente
              <select value={upload.client_id} onChange={(e) => setUpload({ ...upload, client_id: e.target.value })} className={inputCls}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block text-xs font-bold text-slate-600">Título<input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} maxLength={160} className={inputCls} placeholder="Ex.: Reel – 3 erros de postura" /></label>
            <label className="block text-xs font-bold text-slate-600">Arquivo de vídeo (até 120 MB)
              <input type="file" accept="video/*" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} className={`${inputCls} text-xs`} />
            </label>
            <label className="block text-xs font-bold text-slate-600">…ou link (Drive, YouTube, Vimeo)<input value={upload.link_url} onChange={(e) => setUpload({ ...upload, link_url: e.target.value })} className={inputCls} placeholder="https://drive.google.com/file/d/…" /></label>
            <p className="text-[11px] leading-4 text-slate-400">No Drive, deixe o compartilhamento como “qualquer pessoa com o link” para o vídeo tocar aqui.</p>
            <label className="block text-xs font-bold text-slate-600">Observações para o social media (opcional)<textarea value={upload.notes} onChange={(e) => setUpload({ ...upload, notes: e.target.value })} rows={3} className={inputCls} placeholder="Legenda sugerida, horário, música…" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setUpload(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={sendUpload} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Enviar</button>
          </div>
        </Modal>
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
