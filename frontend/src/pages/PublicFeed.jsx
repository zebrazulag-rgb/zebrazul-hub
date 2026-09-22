import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageSquareText, XCircle } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));

export default function PublicFeed() {
  const { token } = useParams();
  const [client, setClient] = useState(null);
  const [posts, setPosts] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [openPost, setOpenPost] = useState(null);
  const [approvalFeedback, setApprovalFeedback] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.get(`/public/feed/${token}`)
      .then((res) => {
        setClient(res.data.client);
        setHighlights(res.data.highlights || []);
        setPosts([...(res.data.posts || [])].sort((a, b) => {
          const pinDifference = Number(b.is_pinned || 0) - Number(a.is_pinned || 0);
          if (pinDifference !== 0) return pinDifference;
          return new Date(b.scheduled_at) - new Date(a.scheduled_at);
        }));
      })
      .catch(() => setError('Este link não é válido ou expirou.'))
      .finally(() => setLoading(false));
  }, [token]);

  function openGridPost(post) {
    setOpenPost(post);
    setApprovalFeedback(post?.client_feedback || '');
    setApprovalNotice('');
  }

  async function decide(status) {
    if (!openPost?.id || !['approved', 'rejected'].includes(status)) return;
    setApprovalLoading(true);
    setApprovalNotice('');
    try {
      const { data } = await publicApi.put(`/public/feed/${token}/posts/${openPost.id}`, {
        status,
        client_feedback: approvalFeedback.trim() || null,
      });
      const updated = { ...openPost, status: data.status, client_feedback: data.client_feedback };
      setOpenPost(updated);
      setPosts((current) => current.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item));
      setApprovalNotice(status === 'approved' ? 'Conteúdo aprovado com sucesso.' : 'Ajustes solicitados com sucesso.');
    } catch (err) {
      setApprovalNotice(err.response?.data?.error || 'Não foi possível registrar sua decisão.');
    } finally {
      setApprovalLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Carregando...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><div className="card p-8 max-w-sm text-center"><p className="text-slate-600">{error}</p></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-8 flex justify-center">
      <InstagramProfileMockup client={client} highlights={highlights} posts={posts} onPostClick={openGridPost} />
      {openPost && (
        <ModalBackdrop onClose={() => setOpenPost(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-slate-800">{openPost.title}</h2><button onClick={() => setOpenPost(null)} className="text-slate-400 text-xl">×</button></div>
            <InstagramPreview
              clientName={client.name}
              clientUsername={client.instagram_username}
              clientColor={client.logo_color}
              avatarSrc={client.avatar_data}
              imageSrc={openPost.media_data}
              images={openPost.media_gallery}
              caption={openPost.caption}
              contentType={openPost.content_type}
            />
            <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Aprovação na grade</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {openPost.status === 'approved' ? 'Conteúdo aprovado' : openPost.status === 'rejected' ? 'Ajustes solicitados' : 'Revise e sinalize sua decisão'}
                  </p>
                </div>
                <StatusBadge status={openPost.status} />
              </div>

              {openPost.client_feedback && (
                <div className="mt-3 flex gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <MessageSquareText size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{openPost.client_feedback}</span>
                </div>
              )}

              <textarea
                value={approvalFeedback}
                onChange={(event) => setApprovalFeedback(event.target.value)}
                rows={3}
                placeholder="Comentário ou ajuste (opcional)"
                className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide('rejected')}
                  disabled={approvalLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {approvalLoading ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={16} />} Solicitar ajustes
                </button>
                <button
                  type="button"
                  onClick={() => decide('approved')}
                  disabled={approvalLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approvalLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar
                </button>
              </div>

              {approvalNotice && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">{approvalNotice}</p>
              )}
            </section>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
