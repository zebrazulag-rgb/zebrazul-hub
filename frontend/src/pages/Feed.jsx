import { useEffect, useState } from 'react';
import { Image as ImageIcon, Grid3x3 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';

export default function Feed() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (selectedClient?.id || ''));
  const [posts, setPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => {
        setClients(res.data.clients);
        if (!clientId && res.data.clients.length) setClientId(selectedClient?.id || res.data.clients[0].id);
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'client' && selectedClient) setClientId(selectedClient.id);
  }, [selectedClient, user]);

  useEffect(() => {
    if (!clientId) return;
    api.get(`/posts?client_id=${clientId}`).then((res) => {
      const upcoming = res.data.posts
        .filter((p) => p.scheduled_at && ['pending_approval', 'approved', 'scheduled'].includes(p.status))
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      setPosts(upcoming);
    });
  }, [clientId]);

  const currentClient = clients.find((c) => String(c.id) === String(clientId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Feed</h1>
          <p className="text-slate-500 mt-1">Prévia de como o perfil vai ficar, com os próximos posts em ordem de data.</p>
        </div>
        {user?.role !== 'client' && clients.length > 0 && (
          <select className="input-field w-56" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {!clientId && (
        <p className="text-sm text-slate-400 py-12 text-center">Selecione um cliente para ver o feed.</p>
      )}

      {clientId && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
            {currentClient?.avatar_data ? (
              <img src={currentClient.avatar_data} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: currentClient?.logo_color }}>
                {currentClient?.name?.[0]}
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-800">
                {currentClient?.name?.toLowerCase().replace(/\s+/g, '_')}
              </p>
              <p className="text-xs text-slate-400">{posts.length} publicações programadas</p>
            </div>
          </div>

          {posts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">Nenhum post agendado para este cliente ainda.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpenPost(p)}
                  className="relative aspect-square bg-slate-100 overflow-hidden group"
                >
                  {p.media_data ? (
                    <img src={p.media_data} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={24} className="text-slate-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    <Grid3x3 size={16} className="text-white" />
                    <span className="text-white text-[10px] font-medium px-2 text-center">
                      {new Date(p.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {openPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-800">{openPost.title}</h2>
                <StatusBadge status={openPost.status} />
              </div>
              <button onClick={() => setOpenPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <InstagramPreview
              clientName={currentClient?.name}
              clientColor={currentClient?.logo_color}
              imageSrc={openPost.media_data}
              caption={openPost.caption}
              contentType={openPost.content_type}
            />
            <p className="text-xs text-slate-400 text-center mt-3">
              Programado para {new Date(openPost.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
