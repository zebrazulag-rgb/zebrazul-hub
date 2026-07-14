import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Calendar,
  Link2,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PostModal from '../components/PostModal.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending_approval', label: 'Aguardando aprovação' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Reprovados' },
  { key: 'draft', label: 'Rascunhos' },
];

export default function Approval() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const loadPosts = useCallback(async () => {
    const params = selectedClient ? `?client_id=${selectedClient.id}` : '';
    const { data } = await api.get(`/posts${params}`);
    setPosts(data.posts);
  }, [selectedClient]);

  useEffect(() => {
    loadPosts();
    if (user?.role !== 'client') {
      api.get('/clients').then((response) => setClients(response.data.clients));
    }
  }, [loadPosts, user]);

  async function openPost(post) {
    const { data } = await api.get(`/posts/${post.id}`);
    setSelectedPost(data.post);
    setComments(data.comments);
    setFeedback(data.post.client_feedback || '');
    setLinkCopied(false);

    if (user?.role === 'client' && !clients.find((client) => client.id === data.post.client_id)) {
      const clientResponse = await api.get(`/clients/${data.post.client_id}`);
      setClients((current) => [...current, clientResponse.data.client]);
    }
  }

  function openCreate() {
    setEditingPost(null);
    setShowEditor(true);
  }

  async function openEditor(post) {
    const { data } = await api.get(`/posts/${post.id}`);
    setEditingPost(data.post);
    setShowEditor(true);
  }

  async function handleEditorSaved() {
    const editedId = editingPost?.id;
    setShowEditor(false);
    setEditingPost(null);
    await loadPosts();

    if (editedId && selectedPost?.id === editedId) {
      const { data } = await api.get(`/posts/${editedId}`);
      setSelectedPost(data.post);
      setComments(data.comments);
      setFeedback(data.post.client_feedback || '');
    }
  }

  async function deletePost(post) {
    const confirmed = window.confirm(
      `Apagar o conteúdo “${post.title}”? Essa ação também remove os comentários e não pode ser desfeita.`
    );
    if (!confirmed) return;

    await api.delete(`/posts/${post.id}`);
    if (selectedPost?.id === post.id) setSelectedPost(null);
    await loadPosts();
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

  async function copyApprovalLink() {
    const { data } = await api.post(`/posts/${selectedPost.id}/share`);
    const url = `${window.location.origin}/aprovar/${data.token}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  const clientOfSelected = clients.find((client) => client.id === selectedPost?.client_id);
  const filtered = filter === 'all' ? posts : posts.filter((post) => post.status === filter);

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-4 flex-wrap min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">Aprovação de conteúdo</h1>
          <p className="text-slate-500 mt-1">
            {user?.role === 'client'
              ? 'Revise e aprove os conteúdos preparados pela equipe Zebrazul.'
              : 'Gerencie, edite e acompanhe o fluxo de aprovação dos conteúdos.'}
          </p>
        </div>
        {user?.role !== 'client' && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo conteúdo
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === item.key
                ? 'bg-zebrazul-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 min-w-0 max-w-full">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">Nenhum conteúdo neste filtro.</p>
        )}

        {filtered.map((post) => (
          <div
            key={post.id}
            className="card p-4 w-full min-w-0 max-w-full overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zebrazul-300 transition-colors"
          >
            <button
              onClick={() => openPost(post)}
              className="w-full flex-1 flex items-center gap-3 text-left min-w-0 overflow-hidden"
            >
              {post.media_data && (
                <img src={post.media_data} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 min-w-0 flex-wrap">
                  <span className="font-medium text-slate-800 min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                    {post.title}
                  </span>
                  <StatusBadge status={post.status} />
                </div>
                <p className="text-sm text-slate-500 max-w-full overflow-hidden line-clamp-2 break-words [overflow-wrap:anywhere]">
                  {post.caption || 'Sem legenda ainda'}
                </p>
                {post.scheduled_at && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <Calendar size={12} />
                    {new Date(post.scheduled_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>
            </button>

            {user?.role !== 'client' && (
              <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                {post.status === 'draft' && (
                  <button
                    onClick={() => sendForApproval(post)}
                    className="btn-secondary text-sm flex-1 sm:flex-none"
                  >
                    Enviar p/ aprovação
                  </button>
                )}
                <button
                  onClick={() => openEditor(post)}
                  className="btn-secondary text-sm flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                  title="Editar conteúdo"
                >
                  <Pencil size={15} /> Editar
                </button>
                <button
                  onClick={() => deletePost(post)}
                  className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  title="Apagar conteúdo"
                  aria-label="Apagar conteúdo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showEditor && (
        <PostModal
          clients={clients}
          defaultClientId={selectedClient?.id}
          post={editingPost}
          onClose={() => {
            setShowEditor(false);
            setEditingPost(null);
          }}
          onSaved={handleEditorSaved}
        />
      )}

      {selectedPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white rounded-t-2xl z-10 min-w-0">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">
                  {selectedPost.title}
                </h2>
                <StatusBadge status={selectedPost.status} />
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6 p-6 min-w-0 max-w-full">
              <div className="space-y-4 min-w-0 max-w-full">
                <div className="flex gap-4 text-xs text-slate-500 flex-wrap min-w-0">
                  <span>Formato: <strong className="text-slate-700">{selectedPost.content_type}</strong></span>
                  {selectedPost.scheduled_at && (
                    <span>
                      Agendado:{' '}
                      <strong className="text-slate-700">
                        {new Date(selectedPost.scheduled_at).toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  )}
                </div>

                {user?.role !== 'client' && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => openEditor(selectedPost)}
                      className="btn-secondary text-sm flex items-center gap-2 justify-center"
                    >
                      <Pencil size={16} /> Editar conteúdo
                    </button>
                    <button
                      onClick={() => deletePost(selectedPost)}
                      className="text-sm flex items-center gap-2 justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 transition-colors"
                    >
                      <Trash2 size={16} /> Apagar
                    </button>
                    <button
                      onClick={copyApprovalLink}
                      className="btn-secondary text-sm flex items-center gap-2 w-full justify-center sm:col-span-2"
                    >
                      {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
                      {linkCopied ? 'Link copiado!' : 'Copiar link de aprovação para o cliente'}
                    </button>
                  </div>
                )}

                {user?.role === 'client' && ['pending_approval', 'approved', 'rejected'].includes(selectedPost.status) && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <label className="text-sm font-medium text-slate-700 block">
                      Observações para a equipe (opcional)
                    </label>
                    <textarea
                      className="input-field min-h-[80px]"
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder="Ex: trocar a foto de capa, ajustar o CTA..."
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDecision('rejected')}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg py-2 font-medium transition-colors"
                      >
                        <ThumbsDown size={16} /> Reprovar
                      </button>
                      <button
                        onClick={() => handleDecision('approved')}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg py-2 font-medium transition-colors"
                      >
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
                    {comments.length === 0 && (
                      <p className="text-sm text-slate-400">Nenhum comentário ainda.</p>
                    )}
                    {comments.map((comment) => (
                      <div key={comment.id} className="text-sm bg-slate-50 rounded-lg p-2.5">
                        <span className="font-medium text-slate-700">{comment.user_name}</span>
                        <span className="text-slate-400 text-xs ml-2">
                          {comment.user_role === 'client' ? 'cliente' : 'equipe'}
                        </span>
                        <p className="text-slate-600 mt-0.5 break-words [overflow-wrap:anywhere]">
                          {comment.message}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 min-w-0">
                    <input
                      className="input-field min-w-0"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Escreva um comentário..."
                      onKeyDown={(event) => event.key === 'Enter' && sendComment()}
                    />
                    <button onClick={sendComment} className="btn-secondary shrink-0">Enviar</button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center min-w-0 max-w-full overflow-hidden">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-3 self-start">Prévia do Instagram</p>
                <InstagramPreview
                  clientName={clientOfSelected?.name}
                  clientColor={clientOfSelected?.logo_color}
                  imageSrc={selectedPost.media_data}
                  caption={selectedPost.caption}
                  contentType={selectedPost.content_type}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
