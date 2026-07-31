import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
import { formatBytes, videoStatus } from '../utils/videoReviews.js';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending_approval', label: 'Aguardando aprovação' },
  { key: 'changes_requested', label: 'Ajustes solicitados' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Reprovados' },
];

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
    { label: 'Total', value: stats.total || 0, icon: FileVideo2, color: 'text-blue-300' },
    { label: 'Aguardando', value: stats.pending_approval || 0, icon: Clock3, color: 'text-amber-300' },
    { label: 'Em ajustes', value: stats.changes_requested || 0, icon: RefreshCw, color: 'text-orange-300' },
    { label: 'Aprovados', value: stats.approved || 0, icon: CheckCircle2, color: 'text-emerald-300' },
  ], [stats]);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <PageHero
        title="Aprovação de vídeos"
        description={user?.role === 'client'
          ? 'Assista às versões, deixe feedbacks exatamente no tempo do vídeo e aprove quando estiver pronto.'
          : 'Centralize versões, comentários, ajustes e aprovações sem perder o histórico de cada entrega.'}
        actions={user?.role !== 'client' && (
          <button onClick={() => setShowUpload(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={17} /> Novo vídeo
          </button>
        )}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/[0.10] bg-white/[0.045] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/[0.45]"><item.icon size={14} className={item.color} /> {item.label}</div>
              <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/[0.08] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="segmented-control overflow-x-auto">
            <button onClick={() => navigate('/feed')} className="segmented-control-button whitespace-nowrap">Voltar ao Feed</button>
            <button className="segmented-control-button segmented-control-button-active whitespace-nowrap">Vídeos</button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row lg:max-w-2xl lg:justify-end">
            <div className="relative min-w-0 flex-1 lg:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/[0.35]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-9" placeholder="Buscar vídeo ou cliente..." />
            </div>
            <button onClick={loadReviews} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw size={15} /> Atualizar</button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-white/[0.08] px-4 py-3">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${filter === item.key ? 'bg-blue-600 text-white shadow-[0_10px_26px_rgba(37,99,235,0.25)]' : 'text-white/[0.50] hover:bg-white/[0.05] hover:text-white'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          {error && <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-300">{error}</p>}
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-white/[0.40]"><RefreshCw size={18} className="mr-2 animate-spin" /> Carregando vídeos...</div>
          ) : reviews.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300"><Video size={26} /></div>
              <h3 className="mt-4 font-semibold text-white">Nenhum vídeo neste filtro</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-white/[0.40]">Envie a primeira versão para iniciar um fluxo de comentários, ajustes e aprovação.</p>
              {user?.role !== 'client' && <button onClick={() => setShowUpload(true)} className="btn-primary mt-5 inline-flex items-center gap-2"><UploadCloud size={16} /> Enviar vídeo</button>}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reviews.map((review) => {
                const status = videoStatus(review.status);
                return (
                  <button
                    key={review.id}
                    onClick={() => navigate(`/aprovacao/videos/${review.id}`)}
                    className="group overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0a0e15] text-left transition hover:-translate-y-1 hover:border-blue-400/35 hover:shadow-[0_22px_55px_rgba(0,0,0,0.34)]"
                  >
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(37,99,235,0.25),transparent_46%),linear-gradient(145deg,#101725,#070a0f)]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.15] bg-black/35 text-white shadow-xl backdrop-blur transition group-hover:scale-110 group-hover:bg-blue-600"><Video size={23} fill="currentColor" /></div>
                      <span className="absolute left-3 top-3 rounded-lg border border-white/[0.10] bg-black/45 px-2 py-1 text-[11px] font-semibold text-white/[0.70] backdrop-blur">V{review.current_version?.version_number || review.current_version_number || 1}</span>
                      <span className={`absolute right-3 top-3 rounded-lg border px-2 py-1 text-[11px] font-semibold backdrop-blur ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {review.client_avatar ? <img src={review.client_avatar} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white">{review.client_name?.[0]}</div>}
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 font-semibold leading-5 text-white">{review.title}</h3>
                          <p className="mt-1 truncate text-xs text-white/[0.40]">{review.client_name}</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-white/[0.45]">{review.description || 'Sem descrição adicional.'}</p>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-xs text-white/[0.40]">
                        <span>{review.version_count} versão(ões) · {formatBytes(review.current_version?.file_size || 0)}</span>
                        <span className="inline-flex items-center gap-1.5"><MessageSquare size={13} /> {review.open_comment_count} pendente(s)</span>
                      </div>
                    </div>
                  </button>
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
