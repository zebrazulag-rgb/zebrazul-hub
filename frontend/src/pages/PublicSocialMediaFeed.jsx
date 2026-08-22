import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  Loader2,
  Share2,
  X,
} from 'lucide-react';
import { attachMediaResolver } from '../utils/mediaUrl';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));

function normalizeGallery(post) {
  let source = post?.media_gallery;
  for (let attempt = 0; attempt < 3 && typeof source === 'string'; attempt += 1) {
    try { source = JSON.parse(source); } catch { break; }
  }
  const list = Array.isArray(source) ? source : [];
  const normalized = list
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return { data: item };
      const data = item.data || item.url || item.src || item.preview || item.media_data || item.file_data;
      return data ? { ...item, data } : null;
    })
    .filter(Boolean);
  if (!normalized.length && post?.media_data) {
    normalized.push({ data: post.media_data, mime: post.media_mime || 'image/jpeg' });
  }
  return normalized;
}

function safeFilename(value) {
  return String(value || 'publicacao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'publicacao';
}

function extensionFor(item, url) {
  const mime = String(item?.mime || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  const clean = String(url || '').split('?')[0];
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

async function downloadAsset(url, filename) {
  if (!url) return;
  try {
    if (/^data:/i.test(url)) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('download-failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
  } catch {
    // Fallback para navegadores que bloqueiam fetch cross-origin. O arquivo é
    // aberto em nova aba para permitir salvar manualmente.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function statusLabel(status) {
  return {
    draft: 'Rascunho',
    pending_approval: 'Em aprovação',
    approved: 'Aprovado',
    scheduled: 'Agendado',
    posted: 'Postado',
  }[status] || status || 'Planejado';
}

export default function PublicSocialMediaFeed() {
  const { token } = useParams();
  const [client, setClient] = useState(null);
  const [posts, setPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    setLoading(true);
    publicApi.get(`/public/social-media/${token}`)
      .then((res) => {
        setClient(res.data.client);
        setPosts(res.data.posts || []);
      })
      .catch((err) => setError(err.response?.data?.error || 'Este link não é válido ou foi desativado.'))
      .finally(() => setLoading(false));
  }, [token]);

  const summary = useMemo(() => {
    const posted = posts.filter((post) => post.status === 'posted').length;
    return { total: posts.length, posted, pending: Math.max(0, posts.length - posted) };
  }, [posts]);

  async function copyCaption() {
    if (!openPost) return;
    try {
      await navigator.clipboard.writeText(openPost.caption || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setActionError('Não foi possível copiar a legenda neste navegador.');
    }
  }

  async function downloadImages() {
    if (!openPost || actionLoading) return;
    const gallery = normalizeGallery(openPost);
    if (!gallery.length) {
      setActionError('Esta publicação ainda não possui mídia para baixar.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    const base = safeFilename(openPost.title);
    for (let index = 0; index < gallery.length; index += 1) {
      const item = gallery[index];
      const extension = extensionFor(item, item.data);
      const filename = gallery.length > 1
        ? `${base}-${String(index + 1).padStart(2, '0')}.${extension}`
        : `${base}.${extension}`;
      // Pequeno intervalo reduz bloqueios de múltiplos downloads no navegador.
      // eslint-disable-next-line no-await-in-loop
      await downloadAsset(item.data, filename);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2200);
    setActionLoading(false);
  }

  async function confirmPosted() {
    if (!openPost || openPost.status === 'posted' || actionLoading) return;
    const confirmed = window.confirm('Confirmar que esta publicação já foi postada?');
    if (!confirmed) return;
    setActionLoading(true);
    setActionError('');
    try {
      await publicApi.put(`/public/social-media/${token}/posts/${openPost.id}/posted`);
      const next = { ...openPost, status: 'posted' };
      setOpenPost(next);
      setPosts((current) => current.map((post) => (
        String(post.id) === String(openPost.id) ? { ...post, status: 'posted' } : post
      )));
    } catch (err) {
      setActionError(err.response?.data?.error || 'Não foi possível confirmar a postagem.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleOpenPost(post) {
    setCopied(false);
    setDownloaded(false);
    setActionError('');
    setOpenPost({ ...post, media_gallery: normalizeGallery(post) });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">
        <Loader2 className="mr-2 animate-spin" size={20} /> Carregando Link Social Media...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 p-5 flex items-center justify-center">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <p className="font-semibold text-slate-900">Link Social Media indisponível</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-zebrazul-600">
              <Share2 size={13} /> Link Social Media
            </div>
            <h1 className="truncate text-lg font-bold text-slate-900">{client?.name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{summary.pending} a publicar</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{summary.posted} postados</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[760px] justify-center px-3 py-6 sm:px-6 sm:py-8">
        <InstagramProfileMockup
          client={client}
          posts={posts}
          onPostClick={handleOpenPost}
          editable={false}
          showCoverBadges={false}
        />
      </main>

      {openPost && (
        <ModalBackdrop onClose={() => !actionLoading && setOpenPost(null)}>
          <div className="flex max-h-[94vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[26px] bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-slate-900">{openPost.title}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                    openPost.status === 'posted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {statusLabel(openPost.status)}
                  </span>
                </div>
                {openPost.scheduled_at && (
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(`${String(openPost.scheduled_at).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenPost(null)}
                disabled={actionLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={downloadImages}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={17} className="animate-spin" /> : downloaded ? <Check size={17} /> : <Download size={17} />}
                  {downloaded ? 'Baixado' : normalizeGallery(openPost).length > 1 ? 'Baixar imagens' : 'Baixar imagem'}
                </button>
                <button
                  type="button"
                  onClick={copyCaption}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check size={17} /> : <Clipboard size={17} />}
                  {copied ? 'Legenda copiada' : 'Copiar legenda'}
                </button>
                <button
                  type="button"
                  onClick={confirmPosted}
                  disabled={actionLoading || openPost.status === 'posted'}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition disabled:cursor-default ${
                    openPost.status === 'posted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-60'
                  }`}
                >
                  {actionLoading ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  {openPost.status === 'posted' ? 'Postado confirmado' : 'Confirmar postado'}
                </button>
              </div>

              {actionError && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</div>
              )}

              <InstagramPreview
                clientName={client?.name}
                clientUsername={client?.instagram_username}
                clientColor={client?.logo_color}
                avatarSrc={client?.avatar_data}
                imageSrc={openPost.media_data}
                images={openPost.media_gallery}
                caption={openPost.caption}
                contentType={openPost.content_type}
              />
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
