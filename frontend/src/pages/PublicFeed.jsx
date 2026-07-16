import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import axios from 'axios';
import InstagramPreview from '../components/InstagramPreview.jsx';

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

export default function PublicFeed() {
  const { token } = useParams();
  const [client, setClient] = useState(null);
  const [posts, setPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.get(`/public/feed/${token}`)
      .then((res) => { setClient(res.data.client); setPosts(res.data.posts); })
      .catch(() => setError('Este link não é válido ou expirou.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Carregando...</div>;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="card p-8 max-w-sm text-center">
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex justify-center">
      <div className="w-full max-w-[380px] bg-slate-900 rounded-[2.5rem] p-3 shadow-xl h-fit">
        <div className="bg-white rounded-[2rem] overflow-hidden">
          <div className="h-6 flex items-center justify-center">
            <div className="w-20 h-4 bg-slate-900 rounded-full" />
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-center gap-4 mb-3">
              {client.avatar_data ? (
                <img src={client.avatar_data} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: client.logo_color }}>
                  {client.name?.[0]}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm text-slate-800">{posts.length}</p>
                <p className="text-[11px] text-slate-400">publicações</p>
              </div>
            </div>
            <p className="font-semibold text-sm text-slate-800">
              {client.name?.toLowerCase().replace(/\s+/g, '_')}
            </p>
            <p className="text-xs text-slate-500 whitespace-pre-wrap mt-1">
              {client.bio || <span className="text-slate-300">Sem bio definida ainda.</span>}
            </p>
          </div>

          <div className="border-t border-slate-100" />

          {posts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12 px-4">Nenhum post agendado ainda.</p>
          ) : (
            <div className="grid grid-cols-3 gap-[2px] bg-slate-100">
              {posts.map((p) => (
                <button key={p.id} onClick={() => setOpenPost(p)} className="relative aspect-[4/5] bg-white overflow-hidden">
                  {p.media_data ? (
                    <img src={p.media_data} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50">
                      <ImageIcon size={20} className="text-slate-300" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {openPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{openPost.title}</h2>
              <button onClick={() => setOpenPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <InstagramPreview
              clientName={client.name}
              clientColor={client.logo_color}
              imageSrc={openPost.media_data}
              images={openPost.media_gallery}
              caption={openPost.caption}
              contentType={openPost.content_type}
            />
            {openPost.scheduled_at && (
              <p className="text-xs text-slate-400 text-center mt-3">
                Programado para {new Date(openPost.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
