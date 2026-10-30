import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import AreaSwitch from '../components/AreaSwitch.jsx';
import ClientVideoApproval from './ClientVideoApproval.jsx';
import PublicFeed from './PublicFeed.jsx';

// Aprovação do cliente logado: grade de perfil (posts) e, quando houver, vídeos para aprovar.
export default function ClientApproval() {
  const { user } = useAuth();
  const clientId = user?.client_id;
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [videos, setVideos] = useState([]);
  const [area, setArea] = useState('posts');

  useEffect(() => {
    if (!clientId) return;
    api.get(`/clients/${clientId}/feed-token`)
      .then(({ data }) => setToken(data.token))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível abrir a aprovação.'));
    api.get('/client-videos').then(({ data }) => {
      const list = data.videos || [];
      setVideos(list);
      // Se só há vídeos esperando e nada mais, abre direto em Vídeos.
      if (list.some((v) => v.stage === 'client')) setArea('videos');
    }).catch(() => {});
  }, [clientId]);

  const pending = videos.filter((v) => v.stage === 'client').length;
  const showSwitch = videos.length > 0;

  if (error) return <p className="m-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  return (
    <div className="space-y-4">
      {showSwitch && <AreaSwitch value={area} onChange={setArea} options={[{ key: 'posts', label: 'Posts' }, { key: 'videos', label: 'Vídeos', badge: pending || null }]} />}
      {area === 'videos' && showSwitch
        ? <ClientVideoApproval onChanged={setVideos} />
        : (token ? <PublicFeed token={token} embedded /> : <p className="m-6 text-sm font-semibold text-slate-400">Carregando a grade...</p>)}
    </div>
  );
}
