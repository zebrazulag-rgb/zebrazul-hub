import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageSquareText, XCircle } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import zebrazulMark from '../assets/zebrazul-mark-dark.png';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));

export default function PublicFeed({ token: tokenProp = null, embedded = false } = {}) {
  const params = useParams();
  const token = tokenProp || params.token;
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
          // Ordem manual da agência (quando existir); peças novas, sem posição, ficam no topo.
          const aHas = a.grid_position !== null && a.grid_position !== undefined;
          const bHas = b.grid_position !== null && b.grid_position !== undefined;
          if (aHas && bHas && a.grid_position !== b.grid_position) return a.grid_position - b.grid_position;
          if (aHas !== bHas) return aHas ? 1 : -1;
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
    if (status === 'rejected' && !approvalFeedback.trim()) {
      setApprovalNotice('Escreva o que precisa ser corrigido antes de solicitar ajustes.');
      return;
    }
    setApprovalLoading(true);
    setApprovalNotice('');
    try {
      const { data } = await publicApi.put(`/public/feed/${token}/posts/${openPost.id}`, {
        status,
        client_feedback: approvalFeedback.trim() || null,
      });
      const updated = { ...openPost, status: data.status, client_feedback: data.client_feedback };
      setOpenPost(updated);
      setPosts((current) => status === 'rejected'
        ? current.filter((item) => Number(item.id) !== Number(updated.id))
        : current.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item));
      setApprovalNotice(status === 'approved' ? 'Conteúdo aprovado com sucesso.' : 'Ajustes solicitados com sucesso. A peça voltou para correção.');
    } catch (err) {
      setApprovalNotice(err.response?.data?.error || 'Não foi possível registrar sua decisão.');
    } finally {
      setApprovalLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F5F3EE] text-sm font-semibold text-slate-400">Puxando a grade...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[#F5F3EE] p-4"><div className="max-w-sm border-l-4 border-[#EC0567] bg-white p-8 text-center"><img src={zebrazulMark} alt="Zebrazul" className="mx-auto mb-5 w-28" /><p className="text-sm font-semibold text-slate-600">{error}</p></div></div>;

  return (
    <div className={embedded ? 'px-3 py-5' : 'min-h-screen bg-[#F5F3EE] px-3 py-7'}>
      <div className="mx-auto mb-6 flex w-full max-w-[560px] items-end justify-between gap-4 border-b border-[#17181C]/10 pb-4">
        <div className="min-w-0">
          {!embedded && <img src={zebrazulMark} alt="Zebrazul" className="w-28" />}
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#3A85FD]">Aprovação do cliente</p>
          <h1 className="brand-display mt-1 text-3xl font-black uppercase leading-none text-[#17181C]">A BOLA TÁ COM VOCÊ.</h1>
          <p className="mt-2 text-sm leading-5 text-slate-500">Abra uma peça, revise e diga se ela segue ou volta para ajuste.</p>
        </div>
        <div className="shrink-0 bg-[#C9FF2F] px-3 py-2 text-center text-[#17181C]">
          <p className="text-[9px] font-black uppercase tracking-[0.12em]">Na grade</p>
          <p className="brand-display text-2xl font-black leading-none">{posts.length}</p>
        </div>
      </div>
      <div className="flex justify-center">
        <InstagramProfileMockup client={client} highlights={highlights} posts={posts} onPostClick={openGridPost} />
      </div>
      {openPost && (
        <ModalBackdrop onClose={() => setOpenPost(null)}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#17181C]/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3A85FD]">Sua decisão</p><h2 className="mt-1 font-bold text-[#17181C]">{openPost.title}</h2></div><button onClick={() => setOpenPost(null)} className="flex h-9 w-9 items-center justify-center bg-[#17181C] text-lg font-bold text-white">×</button></div>
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
            <section className="mt-4 border-t-4 border-[#3A85FD] bg-[#F5F3EE] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3A85FD]">Aprovação na grade</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {openPost.status === 'approved' ? 'Conteúdo aprovado' : openPost.status === 'rejected' ? 'Ajustes solicitados' : 'Revise e sinalize sua decisão'}
                  </p>
                </div>
                <StatusBadge status={openPost.status} />
              </div>

              {openPost.client_feedback && (
                <div className="mt-3 flex gap-2 border-l-4 border-[#EC0567] bg-white px-3 py-2 text-xs text-slate-600">
                  <MessageSquareText size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{openPost.client_feedback}</span>
                </div>
              )}

              <textarea
                value={approvalFeedback}
                onChange={(event) => setApprovalFeedback(event.target.value)}
                rows={3}
                placeholder="Descreva o ajuste. Obrigatório ao solicitar correção."
                className="mt-3 w-full resize-none border border-[#17181C]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3A85FD] focus:ring-2 focus:ring-[#3A85FD]/10"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide('rejected')}
                  disabled={approvalLoading}
                  className="inline-flex items-center justify-center gap-2 bg-[#EC0567] px-3 py-2.5 text-sm font-black text-white hover:bg-[#c90458] disabled:opacity-50"
                >
                  {approvalLoading ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={16} />} Solicitar ajustes
                </button>
                <button
                  type="button"
                  onClick={() => decide('approved')}
                  disabled={approvalLoading}
                  className="inline-flex items-center justify-center gap-2 bg-[#C9FF2F] px-3 py-2.5 text-sm font-black text-[#17181C] hover:bg-[#b7ee20] disabled:opacity-50"
                >
                  {approvalLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar
                </button>
              </div>

              {approvalNotice && (
                <p className="mt-3 border-l-4 border-[#3A85FD] bg-white px-3 py-2 text-xs font-semibold text-slate-600">{approvalNotice}</p>
              )}
            </section>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
