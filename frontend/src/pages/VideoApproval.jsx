import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Film, Loader2, MessageSquareWarning, Plus, RotateCcw, Search, Send, Trash2, Upload, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';
import { CaptionBox, EditableTitle, Modal, Player, fmtDate, fmtSize, inputCls } from '../components/ReadyVideoParts.jsx';

const STAGES = [
  { key: 'direction', label: 'Com a direção' },
  { key: 'client', label: 'Com o cliente' },
  { key: 'correction', label: 'Em correção' },
  { key: 'approved', label: 'Aprovados' },
];

function StageCard({ video, isDirection, canUpload, canDelete, canEditText, onEdit, onApprove, onCorrection, onResubmit, onDelete }) {
  return (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: video.client_color || '#3A85FD' }}>{video.client_name}</p>
          <EditableTitle video={video} canEdit={canEditText} onSave={onEdit} />
        </div>
        {canDelete && <button type="button" title="Apagar" aria-label="Apagar vídeo" onClick={() => onDelete(video)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-[#EC0567]"><Trash2 size={14} /></button>}
      </div>
      <Player video={video} />
      <CaptionBox video={video} canEdit={canEditText} onSave={onEdit} />
      {video.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">{video.notes}</p> : null}
      <p className="mt-3 text-[10px] text-slate-400">Enviado {fmtDate(video.created_at)}{video.uploaded_by_name ? ` por ${video.uploaded_by_name}` : ''}{video.size_bytes ? ` · ${fmtSize(video.size_bytes)}` : ''}</p>

      {video.stage === 'correction' && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-600">Correção pedida{video.reviewed_by_name ? ` · ${video.reviewed_by_name}` : ''}</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-rose-800">{video.review_note || 'Sem detalhes.'}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {video.stage === 'direction' && (isDirection ? (
          <>
            <button type="button" onClick={() => onApprove(video)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A85FD] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#2f74e6]"><Send size={13} /> Aprovar e enviar ao cliente</button>
            <button type="button" onClick={() => onCorrection(video)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"><MessageSquareWarning size={13} /> Pedir correção</button>
          </>
        ) : <p className="text-[11px] font-semibold text-slate-400">Aguardando a decisão da direção.</p>)}
        {video.stage === 'client' && <p className="text-[11px] font-semibold text-slate-400">Direção aprovou{video.reviewed_by_name ? ` (${video.reviewed_by_name})` : ''}. Aguardando o cliente.</p>}
        {video.stage === 'correction' && canUpload && <button type="button" onClick={() => onResubmit(video)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#17181C] px-3 py-2 text-[11px] font-bold text-white"><RotateCcw size={13} /> Corrigir e reenviar</button>}
        {video.stage === 'approved' && <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700"><Check size={13} /> Aprovado pela direção e pelo cliente — já está no Agendamento.</p>}
      </div>
    </article>
  );
}

export default function VideoApproval() {
  const { user } = useAuth();
  const canUpload = hasPermission(user, 'audiovisual.manage') || hasPermission(user, 'audiovisual.edit');
  const canDelete = hasPermission(user, 'audiovisual.manage');
  const canEditText = canUpload || hasPermission(user, 'audiovisual.publish');
  const isDirection = user?.role === 'admin' || Boolean(user?.is_agency_owner) || Boolean(user?.is_platform_owner) || Number(user?.is_operations_head) === 1;

  const [data, setData] = useState({ videos: [], counts: {} });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stage, setStage] = useState('direction');
  const [clientFilter, setClientFilter] = useState('');
  const [query, setQuery] = useState('');
  const [upload, setUpload] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [resubmit, setResubmit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: list }, { data: cl }] = await Promise.all([api.get('/ready-videos'), api.get('/clients', { params: { summary: '1' } })]);
      setData(list); setClients(cl.clients || []); setError('');
    } catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar os vídeos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => data.videos.filter((v) => v.status === 'ready' && v.stage === stage
    && (!clientFilter || String(v.client_id) === String(clientFilter))
    && (!query || `${v.title} ${v.client_name} ${v.caption}`.toLowerCase().includes(query.toLowerCase()))), [data.videos, stage, clientFilter, query]);

  const act = async (fn, okMsg) => { setBusy(true); setError(''); try { await fn(); if (okMsg) setNotice(okMsg); await load(); return true; } catch (e) { setError(e.response?.data?.error || 'Não foi possível concluir a ação.'); return false; } finally { setBusy(false); } };

  async function editVideo(v, patch) {
    try { await api.put(`/ready-videos/${v.id}`, patch); setData((d) => ({ ...d, videos: d.videos.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) })); }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível salvar.'); await load(); }
  }
  const approve = (v) => act(() => api.post(`/ready-videos/${v.id}/direction-approve`), 'Aprovado pela direção e enviado ao cliente.');
  async function sendCorrection() {
    if (!correction.note.trim()) { setError('Descreva o que precisa ser corrigido.'); return; }
    if (await act(() => api.post(`/ready-videos/${correction.id}/direction-correction`, { note: correction.note }), 'Correção enviada ao audiovisual.')) setCorrection(null);
  }
  async function sendResubmit() {
    const fd = new FormData();
    if (resubmit.file) fd.append('file', resubmit.file);
    if (resubmit.link_url) fd.append('link_url', resubmit.link_url);
    if (await act(() => api.post(`/ready-videos/${resubmit.id}/resubmit`, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 }), 'Vídeo reenviado para a direção.')) { setResubmit(null); setStage('direction'); }
  }
  async function sendUpload() {
    if (!upload?.client_id || !upload.title?.trim() || (!upload.file && !upload.link_url?.trim())) { setError('Escolha o cliente, dê um título e anexe o vídeo ou cole um link.'); return; }
    const fd = new FormData();
    ['client_id', 'title', 'caption', 'notes', 'link_url'].forEach((k) => { if (upload[k]) fd.append(k, upload[k]); });
    if (upload.file) fd.append('file', upload.file);
    if (await act(() => api.post('/ready-videos', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 }), 'Vídeo enviado para a direção.')) { setUpload(null); setStage('direction'); }
  }
  async function remove(v) {
    if (!window.confirm(`Apagar "${v.title}"? O arquivo e o registro serão removidos.`)) return;
    await act(() => api.delete(`/ready-videos/${v.id}`));
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando vídeos...</div>;
  const counts = data.counts || {};

  return (
    <div className="space-y-4">
      {error && <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{notice}</span><button type="button" onClick={() => setNotice('')}><X size={15} /></button></div>}

      <div className="toolbar-panel flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGES.map((item) => (
            <button key={item.key} type="button" onClick={() => setStage(item.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${stage === item.key ? 'border-[#17181C] bg-[#17181C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
              {item.label}<span className={stage === item.key ? 'text-[#C9FF2F]' : 'text-slate-300'}>{counts[item.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="w-36 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-[#3A85FD]" /></div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {canUpload && <button type="button" onClick={() => setUpload({ client_id: clientFilter || '', title: '', caption: '', notes: '', link_url: '', file: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A85FD] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#2f74e6]"><Plus size={14} /> Enviar vídeo</button>}
        </div>
      </div>

      <p className="text-xs text-slate-500">Fluxo dos vídeos: <strong>Direção</strong> → <strong>Cliente</strong> → <strong>Agendamento</strong>. Depois de aprovado pelos dois, o vídeo aparece em Agendamento → Vídeos.</p>

      {visible.length === 0 ? (
        <div className="surface-card flex min-h-[260px] items-center justify-center p-8 text-center"><div><Film className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm text-slate-500">Nenhum vídeo nesta etapa.</p></div></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((v) => <StageCard key={v.id} video={v} isDirection={isDirection} canUpload={canUpload} canDelete={canDelete} canEditText={canEditText} onEdit={editVideo} onApprove={approve} onCorrection={(x) => setCorrection({ id: x.id, title: x.title, note: '' })} onResubmit={(x) => setResubmit({ id: x.id, title: x.title, link_url: '', file: null })} onDelete={remove} />)}
        </div>
      )}

      {upload && (
        <Modal title="Enviar vídeo para aprovação" subtitle="O vídeo vai primeiro para a direção, depois para o cliente." onClose={() => setUpload(null)} busy={busy}>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">Cliente
              <select value={upload.client_id} onChange={(e) => setUpload({ ...upload, client_id: e.target.value })} className={inputCls}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block text-xs font-bold text-slate-600">Título<input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} maxLength={160} className={inputCls} placeholder="Ex.: Reel – 3 erros de postura" /></label>
            <label className="block text-xs font-bold text-slate-600">Arquivo de vídeo (até 120 MB)<input type="file" accept="video/*" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} className={`${inputCls} text-xs`} /></label>
            <label className="block text-xs font-bold text-slate-600">…ou link (Drive, YouTube, Vimeo)<input value={upload.link_url} onChange={(e) => setUpload({ ...upload, link_url: e.target.value })} className={inputCls} placeholder="https://drive.google.com/file/d/…" /></label>
            <p className="text-[11px] leading-4 text-slate-400">No Drive, deixe o compartilhamento como “qualquer pessoa com o link” para o vídeo tocar aqui.</p>
            <label className="block text-xs font-bold text-slate-600">Legenda (opcional)<textarea value={upload.caption} onChange={(e) => setUpload({ ...upload, caption: e.target.value })} rows={4} maxLength={5000} className={inputCls} placeholder="Legenda com CTA e hashtags" /></label>
            <label className="block text-xs font-bold text-slate-600">Observações (opcional)<textarea value={upload.notes} onChange={(e) => setUpload({ ...upload, notes: e.target.value })} rows={2} className={inputCls} /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setUpload(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={sendUpload} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Enviar</button>
          </div>
        </Modal>
      )}

      {correction && (
        <Modal title="Pedir correção" subtitle={`"${correction.title}" volta para o audiovisual.`} onClose={() => setCorrection(null)} busy={busy}>
          <label className="block text-xs font-bold text-slate-600">O que precisa mudar?<textarea autoFocus value={correction.note} onChange={(e) => setCorrection({ ...correction, note: e.target.value })} rows={5} className={inputCls} placeholder="Ex.: cortar os 3 primeiros segundos, trocar a música…" /></label>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setCorrection(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={sendCorrection} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#EC0567] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Enviar correção</button>
          </div>
        </Modal>
      )}

      {resubmit && (
        <Modal title="Corrigir e reenviar" subtitle={`"${resubmit.title}" — envie a nova versão (ou deixe em branco se o arquivo/link já foi atualizado no mesmo lugar).`} onClose={() => setResubmit(null)} busy={busy}>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">Novo arquivo (até 120 MB)<input type="file" accept="video/*" onChange={(e) => setResubmit({ ...resubmit, file: e.target.files?.[0] || null })} className={`${inputCls} text-xs`} /></label>
            <label className="block text-xs font-bold text-slate-600">…ou novo link<input value={resubmit.link_url} onChange={(e) => setResubmit({ ...resubmit, link_url: e.target.value })} className={inputCls} placeholder="https://drive.google.com/file/d/…" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setResubmit(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button type="button" onClick={sendResubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Reenviar para a direção</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
