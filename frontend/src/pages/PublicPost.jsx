import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import InstagramPreview from '../components/InstagramPreview.jsx';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));

function formatScheduledAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
}

export default function PublicPost() {
  const { token } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    publicApi.get(`/public/view-posts/${token}`)
      .then((res) => {
        if (active) setPost(res.data.post);
      })
      .catch(() => {
        if (active) setError('Este link não é válido ou foi desativado.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Carregando post...</div>;
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-slate-800">Post indisponível</p>
          <p className="mt-2 text-sm text-slate-500">{error || 'Não foi possível carregar este conteúdo.'}</p>
        </div>
      </div>
    );
  }

  const scheduledLabel = formatScheduledAt(post.scheduled_at);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
      <main className="mx-auto w-full max-w-md space-y-4">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Conteúdo compartilhado</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            {post.client_display_name || post.client_name}
          </h1>
        </header>

        <InstagramPreview
          clientName={post.client_name}
          clientUsername={post.client_username}
          clientColor={post.client_color}
          avatarSrc={post.client_avatar}
          imageSrc={post.media_data || post.media_url}
          images={post.media_gallery}
          caption={post.caption}
          contentType={post.content_type}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-900 break-words">{post.title}</p>
          {scheduledLabel && (
            <div className="mt-3 flex items-start gap-2 text-sm text-slate-500">
              <CalendarDays size={16} className="mt-0.5 shrink-0" />
              <span>Publicação prevista: {scheduledLabel}</span>
            </div>
          )}
        </section>

        <p className="pb-2 text-center text-xs text-slate-400">Visualização individual do ZebraHub</p>
      </main>
    </div>
  );
}
