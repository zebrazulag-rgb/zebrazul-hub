import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';

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
  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><div className="card p-8 max-w-sm text-center"><p className="text-slate-600">{error}</p></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-8 flex justify-center">
      <InstagramProfileMockup client={client} posts={posts} onPostClick={setOpenPost} />
      {openPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-slate-800">{openPost.title}</h2><button onClick={() => setOpenPost(null)} className="text-slate-400 text-xl">×</button></div>
            <InstagramPreview clientName={client.name} clientColor={client.logo_color} imageSrc={openPost.media_data} images={openPost.media_gallery} caption={openPost.caption} contentType={openPost.content_type} />
          </div>
        </div>
      )}
    </div>
  );
}
