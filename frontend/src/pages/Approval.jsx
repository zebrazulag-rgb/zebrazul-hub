import { useEffect, useState, useCallback } from 'react';
import { Plus, ThumbsUp, ThumbsDown, MessageSquare, Calendar } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PostModal from '../components/PostModal.jsx';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending_approval', label: 'Aguardando aprovação' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Reprovados' },
  { key: 'draft', label: 'Rascunhos' }
];

export default function Approval() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadPosts = useCallback(async () => {
    const { data } = await api.get('/posts');
    setPosts(data.posts);
  }, []);

  useEffect(() => {
    loadPosts();
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => setClients(res.data.clients));
    }
  }, [loadPosts, user]);

  async function openPost(post) {
    const { data } = await api.get(`/posts/${post.id}`);
    setSelectedPost(data.post);
    setComments(data.comments);
    setFeedback(data.post.client_feedback || '');
  }

  async function handleDecision(status) {
    await api.put(`/posts/${selectedPost.id}`, { status, client_feedback: feedback });
    await openPost(selectedPost);
    loadPosts();
  }

  async function sendComment() {
    if (!commentText.trim()) return;
    await api.post(`/posts/${selectedPost.id}/comments`, { message: commentText });
    setCommentText('');
    openPost(selectedPost);
  }

  async function sendForApproval(post) {
    await api.put(`/posts/${post.id}`, { status: 'pending_approval' });
    loadPosts();
  }

  const filtered = filter === 'all' ? posts : posts.filter((p) => p.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendário & Aprovação</h1>
          <p className="text-slate-500 mt-1">
            {user?.role === 'client'
              ? 'Revise e aprove os conteúdos preparados pela equipe Zebrazul.'
              : 'Gerencie o fluxo de criação, aprovação e agendamento de conteúdo.'}
          </p>
        </div>
        {user?.role !== 'client' && (
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo conteúdo
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-zebrazul-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">Nenhum conteúdo neste filtro.</p>
        )}
        {filtered.map((post) => (
          <div key={post.id} className="card p-4 flex items-center justify-between gap-4 hover:border-zebrazul-300 transition-colors">
            <button onClick={() => openPost(post)} className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-slate-800 truncate">{post.title}</span>
                <StatusBadge status={post.status} />
              </div>
              <p className="text-sm text-slate-500 truncate">{post.caption || 'Sem legenda ainda'}</p>
              {post.scheduled_at && (
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                  <Calendar size={12} />
                  {new Date(post.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </button>
            {user?.role !== 'client' && post.status === 'draft' && (
              <button onClick={() => sendForApproval(post)} className="btn-secondary text-sm shrink-0">
                Enviar p/ aprovação
              </button>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <PostModal
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadPosts(); }}
        />
      )}

      {selectedPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="font-semibold text-slate-800">{selectedPost.title}</h2>
                <StatusBadge status={selectedPost.status} />
              </div>
              <button onClick={() => setSelectedPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Legenda proposta</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{selectedPost.caption || 'Sem legenda'}</p>
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Formato: <strong className="text-slate-700">{selectedPost.content_type}</strong></span>
                {selectedPost.scheduled_at && (
                  <span>Agendado: <strong className="text-slate-700">{new Date(selectedPost.scheduled_at).toLocaleString('pt-BR')}</strong></span>
                )}
              </div>

              {user?.role === 'client' && ['pending_approval', 'approved', 'rejected'].includes(selectedPost.status) && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <label className="text-sm font-medium text-slate-700 block">Observações para a equipe (opcional)</label>
                  <textarea
                    className="input-field min-h-[80px]"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Ex: trocar a foto de capa, ajustar o CTA..."
                  />
                  <div className="flex gap-3">
                    <button onClick={() => handleDecision('rejected')} className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg py-2 font-medium transition-colors">
                      <ThumbsDown size={16} /> Reprovar
                    </button>
                    <button onClick={() => handleDecision('approved')} className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg py-2 font-medium transition-colors">
                      <ThumbsUp size={16} /> Aprovar
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
                  <MessageSquare size={13} /> Comentários
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                  {comments.length === 0 && <p className="text-sm text-slate-400">Nenhum comentário ainda.</p>}
                  {comments.map((c) => (
                    <div key={c.id} className="text-sm bg-slate-50 rounded-lg p-2.5">
                      <span className="font-medium text-slate-700">{c.user_name}</span>
                      <span className="text-slate-400 text-xs ml-2">{c.user_role === 'client' ? 'cliente' : 'equipe'}</span>
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
        </div>
      )}
    </div>
  );
}
