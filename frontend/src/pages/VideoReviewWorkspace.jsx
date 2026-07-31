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
    return <div className="flex min-h-[60vh] items-center justify-center text-white/[0.45]"><Loader2 size={20} className="mr-2 animate-spin" /> Carregando revisão...</div>;
  }

  if (!review) {
    return (
      <div className="surface-card p-8 text-center">
        <AlertTriangle size={28} className="mx-auto text-amber-300" />
        <p className="mt-3 text-white">{error || 'Revisão não encontrada.'}</p>
        <Link to="/aprovacao/videos" className="btn-secondary mt-5 inline-flex">Voltar aos vídeos</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Link to="/aprovacao/videos" className="inline-flex items-center gap-2 text-sm font-medium text-white/[0.45] transition hover:text-white"><ArrowLeft size={16} /> Voltar aos vídeos</Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-xs text-white/[0.45]">{review.client_name}</span>
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-xs text-white/[0.45]">V{review.current_version?.version_number || 1}</span>
            {review.task_title && <span className="rounded-lg border border-blue-400/15 bg-blue-400/[0.06] px-2.5 py-1 text-xs text-blue-200/70">Tarefa: {review.task_title}</span>}
            {review.post_title && <span className="rounded-lg border border-violet-400/15 bg-violet-400/[0.06] px-2.5 py-1 text-xs text-violet-200/70">Post: {review.post_title}</span>}
          </div>
          <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-white">{review.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/[0.45]">{review.description || 'Assista à versão atual e registre os feedbacks necessários.'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowHistory((value) => !value)} className="btn-secondary inline-flex items-center gap-2"><History size={16} /> Histórico</button>
          {canManage && <button onClick={() => setShowNewVersion(true)} className="btn-primary inline-flex items-center gap-2"><UploadCloud size={16} /> Nova versão</button>}
          {canManage && <button onClick={archiveReview} className="btn-secondary inline-flex items-center gap-2 text-rose-300"><MoreHorizontal size={16} /> Arquivar</button>}
        </div>
      </div>

      {notice && <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-300"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
        <section className="min-w-0 overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#080b10] shadow-[0_22px_60px_rgba(0,0,0,0.3)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300"><FileVideo2 size={18} /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Versão {selectedVersion?.version_number}</p>
                <p className="truncate text-xs text-white/[0.35]">{selectedVersion?.original_name} · {formatBytes(selectedVersion?.file_size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedVersion?.download_url && <a href={videoAssetUrl(selectedVersion.download_url)} className="btn-secondary inline-flex items-center gap-2 text-sm"><Download size={15} /> Baixar</a>}
              <button onClick={() => loadReview()} className="btn-secondary p-2.5" title="Atualizar"><RefreshCw size={16} /></button>
            </div>
          </div>

          <div className="relative flex min-h-[330px] items-center justify-center bg-black lg:min-h-[520px]">
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
                className="max-h-[72vh] w-full bg-black object-contain"
              />
            ) : (
              <div className="text-center text-white/[0.35]"><Play size={32} className="mx-auto mb-2" /> Vídeo indisponível</div>
            )}
          </div>

          <div className="border-t border-white/[0.08] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Adicionar feedback</p>
                <p className="mt-0.5 text-xs text-white/[0.35]">Pause no ponto exato ou envie um comentário geral.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/[0.55]">
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
                className="input-field min-h-[48px] flex-1 resize-none"
                placeholder="Ex.: trocar esta cena, reduzir a música, corrigir a legenda..."
              />
              <button onClick={addComment} disabled={busy === 'comment' || !commentText.trim()} className="btn-primary inline-flex min-w-32 items-center justify-center gap-2 self-stretch disabled:opacity-50">
                {busy === 'comment' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar
              </button>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[24px] border border-white/[0.09] bg-[#0a0e15] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Feedbacks da V{selectedVersion?.version_number}</p>
                <p className="mt-0.5 text-xs text-white/[0.35]">{selectedComments.length} exibido(s) · {openComments} pendente(s) no projeto</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white/[0.40]"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Resolvidos</label>
            </div>

            <div className="mt-4 max-h-[530px] space-y-2 overflow-y-auto pr-1">
              {selectedComments.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/[0.09] px-4 py-10 text-center text-sm text-white/[0.35]">
                  <MessageSquare size={23} className="mx-auto mb-2" /> Nenhum feedback nesta versão.
                </div>
              )}
              {selectedComments.map((comment) => (
                <div key={comment.id} className={`rounded-2xl border p-3 ${comment.status === 'resolved' ? 'border-emerald-400/15 bg-emerald-400/[0.04] opacity-70' : 'border-white/[0.08] bg-white/[0.025]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white/[0.75]">{comment.user_name || 'Usuário'} <span className="font-normal text-white/[0.30]">· {comment.user_role === 'client' ? 'cliente' : 'equipe'}</span></p>
                      <p className="mt-0.5 text-[11px] text-white/[0.30]">{dateTime(comment.created_at)}</p>
                    </div>
                    {comment.timestamp_seconds != null ? (
                      <button onClick={() => seekTo(comment.timestamp_seconds)} className="rounded-lg border border-blue-400/20 bg-blue-400/10 px-2 py-1 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20">{formatTimestamp(comment.timestamp_seconds)}</button>
                    ) : <span className="rounded-lg border border-white/[0.07] px-2 py-1 text-[10px] text-white/[0.35]">Geral</span>}
                  </div>
                  <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-5 ${comment.status === 'resolved' ? 'text-white/[0.40] line-through' : 'text-white/[0.68]'}`}>{comment.message}</p>
                  {canManage && (
                    <button onClick={() => toggleComment(comment)} disabled={busy === `comment-${comment.id}`} className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${comment.status === 'resolved' ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {comment.status === 'resolved' ? <RotateCcw size={13} /> : <Check size={13} />} {comment.status === 'resolved' ? 'Reabrir' : 'Marcar resolvido'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/[0.09] bg-[#0a0e15] p-4">
            <p className="text-sm font-semibold text-white">Versões</p>
            <div className="mt-3 space-y-2">
              {versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => setSelectedVersionId(version.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${Number(selectedVersion?.id) === Number(version.id) ? 'border-blue-400/35 bg-blue-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.045]'}`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${version.decision_status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : version.decision_status === 'changes_requested' ? 'bg-orange-500/15 text-orange-300' : version.decision_status === 'rejected' ? 'bg-rose-500/15 text-rose-300' : 'bg-blue-500/12 text-blue-300'}`}>V{version.version_number}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/[0.75]">{version.original_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-white/[0.30]">{dateTime(version.submitted_at)} · {version.uploaded_by_name}</p>
                  </div>
                  {version.decision_status === 'approved' && <CheckCircle2 size={16} className="text-emerald-300" />}
                  {version.decision_status === 'changes_requested' && <RefreshCw size={15} className="text-orange-300" />}
                  {version.decision_status === 'rejected' && <XCircle size={15} className="text-rose-300" />}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {!viewingCurrentVersion && ['pending_approval', 'changes_requested'].includes(review.status) && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-sm text-amber-200/80">Você está vendo uma versão antiga. Volte à versão atual para aprovar, reprovar ou solicitar ajustes.</p>
          <button onClick={() => setSelectedVersionId(review.current_version_id)} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-black">Abrir versão atual</button>
        </section>
      )}

      {canDecide && (
        <section className="rounded-[26px] border border-white/[0.09] bg-[#0a0e15] p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-lg font-semibold text-white">Decisão da versão atual</p>
              <p className="mt-1 text-sm text-white/[0.40]">Aprovar encerra o ciclo. Para ajustes ou reprovação, descreva claramente o que precisa mudar.</p>
              <textarea value={decisionFeedback} onChange={(e) => setDecisionFeedback(e.target.value)} className="input-field mt-3 min-h-24 resize-y" placeholder="Feedback consolidado para a equipe..." />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[520px]">
              <button onClick={() => decide('request_changes')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-400/25 bg-orange-400/10 px-4 py-3 text-sm font-semibold text-orange-300 transition hover:bg-orange-400/15 disabled:opacity-50"><RefreshCw size={16} /> Solicitar ajustes</button>
              <button onClick={() => decide('reject')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/15 disabled:opacity-50"><XCircle size={16} /> Reprovar</button>
              <button onClick={() => decide('approve')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] transition hover:bg-emerald-400 disabled:opacity-50">{busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar</button>
            </div>
          </div>
        </section>
      )}

      {review.status === 'changes_requested' && canManage && (
        <section className="flex flex-col gap-4 rounded-[26px] border border-orange-400/20 bg-orange-400/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-orange-200">O cliente solicitou ajustes</p>
            <p className="mt-1 text-sm text-orange-100/55">Revise os feedbacks pendentes, aplique as correções e envie uma nova versão.</p>
          </div>
          <button onClick={() => setShowNewVersion(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"><UploadCloud size={16} /> Enviar versão corrigida</button>
        </section>
      )}

      {review.status === 'approved' && review.approved_version && (
        <section className="rounded-[26px] border border-emerald-400/20 bg-emerald-400/[0.055] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><FolderCheck size={22} /></div>
              <div>
                <p className="font-semibold text-emerald-200">Versão final aprovada · V{review.approved_version.version_number}</p>
                <p className="mt-1 text-sm text-emerald-100/50">Aprovada por {review.approved_by_name || 'usuário'} em {dateTime(review.approved_at)}. O arquivo continua disponível no ZebraHub.</p>
                {review.drive_upload_status === 'error' && <p className="mt-2 text-xs text-rose-300">Erro no Drive: {review.drive_last_error}</p>}
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
                <span className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/[0.35]">Drive ainda não configurado no Railway</span>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {showHistory && (
        <section className="rounded-[26px] border border-white/[0.09] bg-[#0a0e15] p-5">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-white">Histórico da aprovação</p><p className="mt-1 text-xs text-white/[0.35]">Todas as versões e decisões ficam registradas.</p></div>
            <button onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-white/[0.35] hover:bg-white/[0.05] hover:text-white"><X size={17} /></button>
          </div>
          <div className="mt-5 space-y-4 border-l border-white/[0.10] pl-5">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0e15] bg-blue-500 ring-1 ring-blue-500/30" />
                <p className="text-sm text-white/[0.70]"><strong className="font-semibold text-white">{event.user_name || 'Sistema'}</strong> {eventDescription(event)}</p>
                {event.message && !['review_created', 'version_uploaded'].includes(event.event_type) && <p className="mt-1 whitespace-pre-wrap text-sm text-white/[0.40]">{event.message}</p>}
                <p className="mt-1 text-[11px] text-white/[0.25]">{dateTime(event.created_at)}</p>
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
