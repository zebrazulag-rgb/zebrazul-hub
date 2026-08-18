import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileVideo2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
  Video,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import VideoReviewUploadModal from '../components/VideoReviewUploadModal.jsx';
import { formatBytes, videoAssetUrl, videoStatus } from '../utils/videoReviews.js';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending_approval', label: 'Aguardando aprovação' },
  { key: 'changes_requested', label: 'Ajustes solicitados' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Reprovados' },
];

function formatDueDate(value) {
  if (!value) return 'Sem prazo definido';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem prazo definido';
  return `Prazo: ${date.toLocaleDateString('pt-BR')}`;
}

function primeVideoFrame(event) {
  const video = event.currentTarget;
  try {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(0.12, video.duration / 2);
    }
  } catch {
    // Alguns navegadores bloqueiam o seek durante o carregamento inicial.
  }
}

export default function VideoApprovals() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending_approval: 0, changes_requested: 0, approved: 0, rejected: 0 });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState('');

  const loadClients = useCallback(async () => {
    if (user?.role === 'client') {
      const { data } = await api.get(`/clients/${user.client_id}`);
      setClients(data.client ? [data.client] : []);
      return;
    }
    const { data } = await api.get('/clients');
    setClients(data.clients || []);
  }, [user]);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedClient?.id) params.set('client_id', selectedClient.id);
      if (filter !== 'all') params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());
      const { data } = await api.get(`/video-reviews?${params.toString()}`);
      setReviews(data.reviews || []);
      setStats(data.stats || {});
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar os vídeos.');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClient?.id, filter, search]);

  useEffect(() => { loadClients().catch(() => setClients([])); }, [loadClients]);
  useEffect(() => {
    const timer = setTimeout(() => loadReviews(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadReviews, search]);

  const metrics = useMemo(() => [
    { label: 'Total', value: stats.total || 0, icon: FileVideo2, color: 'text-blue-500' },
    { label: 'Aguardando', value: stats.pending_approval || 0, icon: Clock3, color: 'text-amber-500' },
    { label: 'Em ajustes', value: stats.changes_requested || 0, icon: RefreshCw, color: 'text-orange-500' },
    { label: 'Aprovados', value: stats.approved || 0, icon: CheckCircle2, color: 'text-emerald-500' },
  ], [stats]);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <PageHero
        title="Aprovação de vídeos"
        description={user?.role === 'client'
          ? 'Assista às versões, deixe feedbacks no tempo exato e aprove quando estiver pronto.'
          : 'Centralize versões, comentários, ajustes e aprovações sem perder o histórico de cada entrega.'}
        actions={user?.role !== 'client' && (
          <button onClick={() => setShowUpload(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={17} /> Novo vídeo
          </button>
        )}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-slate-500"><item.icon size={14} className={item.color} /> {item.label}</div>
              <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <div className="toolbar-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="segmented-control overflow-x-auto">
          <button onClick={() => navigate('/tarefas?area=aprovacao')} className="segmented-control-button whitespace-nowrap">Publicações</button>
          <button className="segmented-control-button segmented-control-button-active whitespace-nowrap">Vídeos</button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row lg:max-w-2xl lg:justify-end">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-9" placeholder="Buscar vídeo ou cliente..." />
          </div>
          <button onClick={loadReviews} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw size={15} /> Atualizar</button>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200/70 px-4 py-3">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${filter === item.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-slate-400"><RefreshCw size={18} className="mr-2 animate-spin" /> Carregando vídeos...</div>
          ) : reviews.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Video size={26} /></div>
              <h3 className="mt-4 font-semibold text-slate-900">Nenhum vídeo neste filtro</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Envie a primeira versão para iniciar o fluxo de comentários, ajustes e aprovação.</p>
              {user?.role !== 'client' && <button onClick={() => setShowUpload(true)} className="btn-primary mt-5 inline-flex items-center gap-2"><UploadCloud size={16} /> Enviar vídeo</button>}
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => {
                const status = videoStatus(review.status);
                const streamUrl = review.current_version?.stream_url ? videoAssetUrl(review.current_version.stream_url) : '';
                return (
                  <Link
                    key={review.id}
                    to={`/aprovacao/videos/${review.id}`}
                    className="group grid min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:grid-cols-[220px_minmax(0,1fr)_auto]"
                  >
                    <div className="relative flex min-h-40 items-center justify-center overflow-hidden bg-slate-950 md:min-h-[150px]">
                      {streamUrl ? (
                        <video
                          src={streamUrl}
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={primeVideoFrame}
                          className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
                        />
                      ) : (
                        <Video size={30} className="text-white/60" />
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white shadow-lg backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-blue-600">
                          <Video size={19} fill="currentColor" />
                        </div>
                      </div>
                      <span className="absolute left-3 top-3 rounded-lg border border-white/15 bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">V{review.current_version?.version_number || review.current_version_number || 1}</span>
                    </div>

                    <div className="min-w-0 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><CalendarDays size={13} /> {formatDueDate(review.due_date)}</span>
                      </div>
                      <div className="mt-3 flex min-w-0 items-start gap-3">
                        {review.client_avatar ? <img src={review.client_avatar} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">{review.client_name?.[0]}</div>}
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-base font-semibold leading-6 text-slate-900">{review.title}</h3>
                          <p className="mt-0.5 truncate text-sm text-slate-500">{review.client_name}</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-500">{review.description || 'Sem descrição adicional.'}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                        <span>{review.version_count} versão(ões) · {formatBytes(review.current_version?.file_size || 0)}</span>
                        <span className="inline-flex items-center gap-1.5"><MessageSquare size={13} /> {review.open_comment_count} feedback(s) pendente(s)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 md:flex-col md:justify-center md:border-l md:border-t-0 md:px-5">
                      <span className="text-xs font-medium text-slate-400">Abrir revisão</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white transition group-hover:bg-blue-600"><ArrowRight size={18} /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <VideoReviewUploadModal
          clients={clients}
          defaultClientId={selectedClient?.id || (user?.role === 'client' ? user.client_id : '')}
          onClose={() => setShowUpload(false)}
          onSaved={async () => { setShowUpload(false); await loadReviews(); }}
        />
      )}
    </div>
  );
}
