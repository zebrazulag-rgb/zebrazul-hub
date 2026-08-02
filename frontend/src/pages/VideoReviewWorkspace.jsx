import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileVideo2,
  FolderCheck,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import VideoReviewUploadModal from '../components/VideoReviewUploadModal.jsx';
import {
  formatBytes,
  formatTimestamp,
  videoAssetUrl,
  videoStatus,
} from '../utils/videoReviews.js';

function dateTime(value) {
  if (!value) return '—';
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function eventDescription(event) {
  const version = event.version_number ? `V${event.version_number}` : '';
  const map = {
    review_created: `Enviou ${version || 'o vídeo'} para aprovação`,
    version_uploaded: `Enviou ${version || 'uma nova versão'} para aprovação`,
    approved: `Aprovou ${version}`,
    changes_requested: `Solicitou ajustes em ${version}`,
    rejected: `Reprovou ${version}`,
    comment_added: 'Adicionou um feedback',
    comment_resolved: 'Marcou um feedback como resolvido',
    comment_reopened: 'Reabriu um feedback',
    drive_exported: 'Enviou a versão aprovada ao Google Drive',
    review_updated: 'Atualizou as informações da revisão',
    archived: 'Arquivou a revisão',
  };
  return map[event.event_type] || event.message || event.event_type;
}

export default function VideoReviewWorkspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [review, setReview] = useState(null);
  const [versions, setVersions] = useState([]);
  const [comments, setComments] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [markAtCurrentTime, setMarkAtCurrentTime] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [decisionFeedback, setDecisionFeedback] = useState('');
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReview = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/video-reviews/${id}`);
      setReview(data.review);
      setVersions(data.versions || []);
      setComments(data.comments || []);
      setEvents(data.events || []);
      setSelectedVersionId((current) => {
        if (current && (data.versions || []).some((version) => Number(version.id) === Number(current))) return current;
        return data.review?.current_version_id || data.versions?.[0]?.id || null;
      });
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível abrir esta revisão.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadReview(); }, [loadReview]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !busy && !showNewVersion) loadReview({ silent: true });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [busy, showNewVersion, loadReview]);

  const selectedVersion = useMemo(
    () => versions.find((version) => Number(version.id) === Number(selectedVersionId)) || review?.current_version || null,
    [versions, selectedVersionId, review],
  );
  const selectedComments = useMemo(() => comments
    .filter((comment) => Number(comment.version_id) === Number(selectedVersion?.id))
    .filter((comment) => showResolved || comment.status !== 'resolved'), [comments, selectedVersion?.id, showResolved]);
  const openComments = comments.filter((comment) => comment.status === 'open').length;
  const status = videoStatus(review?.status);
  const canManage = ['admin', 'team'].includes(user?.role);
  const viewingCurrentVersion = Number(selectedVersion?.id) === Number(review?.current_version_id);
  const canDecide = Boolean(review?.current_version_id)
    && viewingCurrentVersion
    && ['pending_approval', 'changes_requested'].includes(review?.status);

  function seekTo(seconds) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Number(seconds || 0);
    videoRef.current.play().catch(() => {});
    window.setTimeout(() => videoRef.current?.pause(), 120);
  }

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }

  async function addComment() {
    if (!commentText.trim() || !selectedVersion) return;
    setBusy('comment');
    try {
      await api.post(`/video-reviews/${review.id}/comments`, {
        version_id: selectedVersion.id,
        message: commentText.trim(),
        timestamp_seconds: markAtCurrentTime ? currentTime : null,
      });
      setCommentText('');
      await loadReview({ silent: true });
      flash(markAtCurrentTime ? `Feedback adicionado em ${formatTimestamp(currentTime)}.` : 'Comentário geral adicionado.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível enviar o comentário.');
    } finally {
      setBusy('');
    }
  }

  async function toggleComment(comment) {
    setBusy(`comment-${comment.id}`);
    try {
      await api.put(`/video-reviews/${review.id}/comments/${comment.id}`, {
        status: comment.status === 'resolved' ? 'open' : 'resolved',
      });
      await loadReview({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o feedback.');
    } finally {
      setBusy('');
    }
  }

  async function decide(decision) {
    if (['request_changes', 'reject'].includes(decision) && !decisionFeedback.trim()) {
      setError('Descreva os ajustes necessários ou o motivo da reprovação.');
      return;
    }
    const labels = { approve: 'aprovar esta versão', request_changes: 'solicitar ajustes', reject: 'reprovar esta versão' };
    if (!window.confirm(`Confirmar: ${labels[decision]}?`)) return;
    setBusy(decision);
    setError('');
    try {
      await api.post(`/video-reviews/${review.id}/decision`, {
        decision,
        feedback: decisionFeedback.trim(),
      });
      setDecisionFeedback('');
      await loadReview({ silent: true });
      flash(decision === 'approve' ? 'Vídeo aprovado!' : decision === 'request_changes' ? 'Ajustes solicitados à equipe.' : 'Vídeo reprovado.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível registrar a decisão.');
    } finally {
      setBusy('');
    }
  }

  async function exportDrive() {
    setBusy('drive');
    setError('');
    try {
      await api.post(`/video-reviews/${review.id}/export-drive`);
      await loadReview({ silent: true });
      flash('Versão aprovada enviada ao Google Drive.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível enviar ao Google Drive.');
      await loadReview({ silent: true });
    } finally {
      setBusy('');
    }
  }

  async function archiveReview() {
    if (!window.confirm('Arquivar esta revisão? O histórico e os arquivos serão preservados.')) return;
    setBusy('archive');
    try {
      await api.delete(`/video-reviews/${review.id}`);
      navigate('/aprovacao/videos');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível arquivar a revisão.');
      setBusy('');
    }
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" /> Carregando revisão...</div>;
  }

  if (!review) {
    return (
      <div className="surface-card p-8 text-center">
        <AlertTriangle size={28} className="mx-auto text-amber-500" />
        <p className="mt-3 text-slate-900">{error || 'Revisão não encontrada.'}</p>
        <Link to="/aprovacao/videos" className="btn-secondary mt-5 inline-flex">Voltar aos vídeos</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Link to="/aprovacao/videos" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"><ArrowLeft size={16} /> Voltar aos vídeos</Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">{review.client_name}</span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">V{review.current_version?.version_number || 1}</span>
            {review.task_title && <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">Tarefa: {review.task_title}</span>}
          </div>
          <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-slate-900">{review.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{review.description || 'Assista à versão atual e registre os feedbacks necessários.'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowHistory((value) => !value)} className="btn-secondary inline-flex items-center gap-2"><History size={16} /> Histórico</button>
          {canManage && <button onClick={() => setShowNewVersion(true)} className="btn-primary inline-flex items-center gap-2"><UploadCloud size={16} /> Nova versão</button>}
          {canManage && <button onClick={archiveReview} className="btn-secondary inline-flex items-center gap-2 text-rose-600"><MoreHorizontal size={16} /> Arquivar</button>}
        </div>
      </div>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.75fr)]">
        <section className="surface-card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FileVideo2 size={18} /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Versão {selectedVersion?.version_number}</p>
                <p className="truncate text-xs text-slate-400">{selectedVersion?.original_name} · {formatBytes(selectedVersion?.file_size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedVersion?.download_url && <a href={videoAssetUrl(selectedVersion.download_url)} className="btn-secondary inline-flex items-center gap-2 text-sm"><Download size={15} /> Baixar</a>}
              <button onClick={() => loadReview()} className="btn-secondary p-2.5" title="Atualizar"><RefreshCw size={16} /></button>
            </div>
          </div>

          <div className="relative flex min-h-[330px] items-center justify-center bg-black lg:min-h-[560px]">
            {selectedVersion?.stream_url ? (
              <video
                key={selectedVersion.id}
                ref={videoRef}
                src={videoAssetUrl(selectedVersion.stream_url)}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                className="max-h-[74vh] w-full bg-black object-contain"
              />
            ) : (
              <div className="text-center text-white/50"><Play size={32} className="mx-auto mb-2" /> Vídeo indisponível</div>
            )}
          </div>

          <div className="border-t border-slate-200/70 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Adicionar feedback</p>
                <p className="mt-0.5 text-xs text-slate-400">Pause no ponto exato ou envie um comentário geral.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <input type="checkbox" checked={markAtCurrentTime} onChange={(event) => setMarkAtCurrentTime(event.target.checked)} />
                Marcar em {formatTimestamp(currentTime)}
              </label>
            </div>
            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') addComment();
                }}
                className="input-field min-h-[52px] flex-1 resize-none"
                placeholder="Ex.: trocar esta cena, reduzir a música, corrigir a legenda..."
              />
              <button onClick={addComment} disabled={busy === 'comment' || !commentText.trim()} className="btn-primary inline-flex min-w-32 items-center justify-center gap-2 self-stretch disabled:opacity-50">
                {busy === 'comment' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar
              </button>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="surface-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Feedbacks da V{selectedVersion?.version_number}</p>
                <p className="mt-0.5 text-xs text-slate-400">{selectedComments.length} exibido(s) · {openComments} pendente(s) no projeto</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} /> Resolvidos</label>
            </div>

            <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {selectedComments.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-400">
                  <MessageSquare size={23} className="mx-auto mb-2" /> Nenhum feedback nesta versão.
                </div>
              )}
              {selectedComments.map((comment) => (
                <div key={comment.id} className={`rounded-2xl border p-3 ${comment.status === 'resolved' ? 'border-emerald-200 bg-emerald-50/70 opacity-75' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-700">{comment.user_name || 'Usuário'} <span className="font-normal text-slate-400">· {comment.user_role === 'client' ? 'cliente' : 'equipe'}</span></p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{dateTime(comment.created_at)}</p>
                    </div>
                    {comment.timestamp_seconds != null ? (
                      <button onClick={() => seekTo(comment.timestamp_seconds)} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">{formatTimestamp(comment.timestamp_seconds)}</button>
                    ) : <span className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-400">Geral</span>}
                  </div>
                  <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-5 ${comment.status === 'resolved' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{comment.message}</p>
                  {canManage && (
                    <button onClick={() => toggleComment(comment)} disabled={busy === `comment-${comment.id}`} className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${comment.status === 'resolved' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {comment.status === 'resolved' ? <RotateCcw size={13} /> : <Check size={13} />} {comment.status === 'resolved' ? 'Reabrir' : 'Marcar resolvido'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card p-4">
            <p className="text-sm font-semibold text-slate-900">Versões</p>
            <div className="mt-3 space-y-2">
              {versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => setSelectedVersionId(version.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${Number(selectedVersion?.id) === Number(version.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${version.decision_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : version.decision_status === 'changes_requested' ? 'bg-orange-100 text-orange-700' : version.decision_status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>V{version.version_number}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{version.original_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{dateTime(version.submitted_at)} · {version.uploaded_by_name}</p>
                  </div>
                  {version.decision_status === 'approved' && <CheckCircle2 size={16} className="text-emerald-500" />}
                  {version.decision_status === 'changes_requested' && <RefreshCw size={15} className="text-orange-500" />}
                  {version.decision_status === 'rejected' && <XCircle size={15} className="text-rose-500" />}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {!viewingCurrentVersion && ['pending_approval', 'changes_requested'].includes(review.status) && (
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm text-amber-800">Você está vendo uma versão antiga. Volte à versão atual para aprovar, reprovar ou solicitar ajustes.</p>
          <button onClick={() => setSelectedVersionId(review.current_version_id)} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-amber-950">Abrir versão atual</button>
        </section>
      )}

      {canDecide && (
        <section className="surface-card p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-lg font-semibold text-slate-900">Decisão da versão atual</p>
              <p className="mt-1 text-sm text-slate-500">Aprovar encerra o ciclo. Para ajustes ou reprovação, descreva claramente o que precisa mudar.</p>
              <textarea value={decisionFeedback} onChange={(event) => setDecisionFeedback(event.target.value)} className="input-field mt-3 min-h-24 resize-y" placeholder="Feedback consolidado para a equipe..." />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[520px]">
              <button onClick={() => decide('request_changes')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 disabled:opacity-50"><RefreshCw size={16} /> Solicitar ajustes</button>
              <button onClick={() => decide('reject')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"><XCircle size={16} /> Reprovar</button>
              <button onClick={() => decide('approve')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] transition hover:bg-emerald-600 disabled:opacity-50">{busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar</button>
            </div>
          </div>
        </section>
      )}

      {review.status === 'changes_requested' && canManage && (
        <section className="flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-orange-800">O cliente solicitou ajustes</p>
            <p className="mt-1 text-sm text-orange-700/75">Revise os feedbacks pendentes, aplique as correções e envie uma nova versão.</p>
          </div>
          <button onClick={() => setShowNewVersion(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"><UploadCloud size={16} /> Enviar versão corrigida</button>
        </section>
      )}

      {review.status === 'approved' && review.approved_version && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FolderCheck size={22} /></div>
              <div>
                <p className="font-semibold text-emerald-800">Versão final aprovada · V{review.approved_version.version_number}</p>
                <p className="mt-1 text-sm text-emerald-700/75">Aprovada por {review.approved_by_name || 'usuário'} em {dateTime(review.approved_at)}. O arquivo continua disponível no ZebraHub.</p>
                {review.drive_upload_status === 'error' && <p className="mt-2 text-xs text-rose-700">Erro no Drive: {review.drive_last_error}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={videoAssetUrl(review.approved_version.download_url)} className="btn-secondary inline-flex items-center gap-2"><Download size={16} /> Baixar final</a>
              {review.drive_web_view_link ? (
                <a href={review.drive_web_view_link} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2"><ExternalLink size={16} /> Abrir no Drive</a>
              ) : canManage && review.drive_configured ? (
                <button onClick={exportDrive} disabled={busy === 'drive' || review.drive_upload_status === 'sending'} className="btn-primary inline-flex items-center gap-2">
                  {(busy === 'drive' || review.drive_upload_status === 'sending') ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {review.drive_upload_status === 'error' ? 'Tentar novamente' : review.drive_upload_status === 'sending' ? 'Enviando...' : 'Enviar ao Drive'}
                </button>
              ) : canManage ? (
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Drive ainda não configurado no Railway</span>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {showHistory && (
        <section className="surface-card p-5">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-slate-900">Histórico da aprovação</p><p className="mt-1 text-xs text-slate-400">Todas as versões e decisões ficam registradas.</p></div>
            <button onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-900"><X size={17} /></button>
          </div>
          <div className="mt-5 space-y-4 border-l border-slate-200 pl-5">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 ring-1 ring-blue-200" />
                <p className="text-sm text-slate-700"><strong className="font-semibold text-slate-900">{event.user_name || 'Sistema'}</strong> {eventDescription(event)}</p>
                {event.message && !['review_created', 'version_uploaded'].includes(event.event_type) && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{event.message}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{dateTime(event.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {showNewVersion && (
        <VideoReviewUploadModal
          clients={[]}
          review={review}
          onClose={() => setShowNewVersion(false)}
          onSaved={async () => { setShowNewVersion(false); await loadReview(); flash('Nova versão enviada para aprovação.'); }}
        />
      )}
    </div>
  );
}
