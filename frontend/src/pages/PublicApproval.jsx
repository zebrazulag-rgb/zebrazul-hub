import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import axios from 'axios';
import InstagramPreview from '../components/InstagramPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

export default function PublicApproval() {
  const { token } = useParams();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decisionMade, setDecisionMade] = useState('');

  async function load() {
    try {
      const { data } = await publicApi.get(`/public/posts/${token}`);
      setPost(data.post);
      setComments(data.comments);
      setFeedback(data.post.client_feedback || '');
    } catch (err) {
      setError('Este link de aprovação não é válido ou expirou.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function handleDecision(status) {
    await publicApi.put(`/public/posts/${token}`, { status, client_feedback: feedback });
    setDecisionMade(status);
    load();
  }

  async function sendComment() {
    if (!commentText.trim()) return;
    await publicApi.post(`/public/posts/${token}/comments`, { message: commentText });
    setCommentText('');
    load();
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Carregando...</div>;
  }

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
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Aprovação de conteúdo</p>
          <h1 className="text-xl font-bold text-slate-800 mt-1">{post.client_name}</h1>
        </div>

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

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-slate-800">{post.title}</p>
            <StatusBadge status={post.status} />
          </div>

          {['pending_approval', 'approved', 'rejected'].includes(post.status) && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700 block">Observações (opcional)</label>
              <textarea
                className="input-field min-h-[80px]"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Deixe aqui qualquer ajuste que gostaria de pedir..."
              />
              <div className="flex gap-3">
                <button onClick={() => handleDecision('rejected')} className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg py-2.5 font-medium transition-colors">
                  <ThumbsDown size={16} /> Reprovar
                </button>
                <button onClick={() => handleDecision('approved')} className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg py-2.5 font-medium transition-colors">
                  <ThumbsUp size={16} /> Aprovar
                </button>
              </div>
              {decisionMade && (
                <p className="text-sm text-center text-emerald-600 font-medium pt-1">
                  Obrigado! Sua decisão foi registrada.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-1">
            <MessageSquare size={13} /> Comentários
          </p>
          <div className="space-y-2 mb-3">
            {comments.length === 0 && <p className="text-sm text-slate-400">Nenhum comentário ainda.</p>}
            {comments.map((c, idx) => (
              <div key={idx} className="text-sm bg-slate-50 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{c.user_name}</span>
                <p className="text-slate-600 mt-0.5">{c.message}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input-field"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escreva um comentário..."
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
            />
            <button onClick={sendComment} className="btn-secondary shrink-0">Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
