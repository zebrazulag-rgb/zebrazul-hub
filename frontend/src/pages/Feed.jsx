import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, Grid3x3, Pencil, Check, Link2, CalendarDays } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';
import CalendarView from './CalendarView.jsx';

export default function Feed() {
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get('view') === 'calendar' ? 'calendar' : 'grid';
  const [clients, setClients] = useState([]);
  const requestedClientId = searchParams.get('client_id');
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (requestedClientId || selectedClient?.id || ''));
  const [posts, setPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => {
        const availableClients = res.data.clients || [];
        setClients(availableClients);
        const requested = requestedClientId
          ? availableClients.find((client) => String(client.id) === String(requestedClientId))
          : null;
        const nextClient = requested || selectedClient || availableClients[0] || null;
        setClientId((current) => requested?.id || current || nextClient?.id || '');
        if (requested) setSelectedClient(requested);
      });
    } else if (user?.client_id) {
      api.get(`/clients/${user.client_id}`).then((res) => setClients([res.data.client]));
    }
  }, [user, selectedClient, requestedClientId, setSelectedClient]);

  useEffect(() => {
    if (user?.role !== 'client' && selectedClient) setClientId(selectedClient.id);
  }, [selectedClient, user]);

  useEffect(() => {
    if (!clientId) {
      setPosts([]);
      return;
    }

    api.get(`/posts?client_id=${clientId}`).then((res) => {
      const upcoming = res.data.posts
        .filter((post) => post.scheduled_at && ['pending_approval', 'approved', 'scheduled', 'draft'].includes(post.status))
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      setPosts(upcoming);
    });
  }, [clientId]);

  const currentClient = clients.find((client) => String(client.id) === String(clientId));

  function switchView(view) {
    setOpenPost(null);
    setSearchParams(view === 'calendar' ? { view: 'calendar', client_id: String(clientId || '') } : { client_id: String(clientId || '') }, { replace: true });
  }

  function startEditBio() {
    setBioDraft(currentClient?.bio || '');
    setEditingBio(true);
  }

  async function saveBio() {
    setSavingBio(true);
    try {
      await api.put(`/clients/${clientId}`, { bio: bioDraft });
      setClients((previous) => previous.map((client) => (
        String(client.id) === String(clientId) ? { ...client, bio: bioDraft } : client
      )));
      setEditingBio(false);
    } finally {
      setSavingBio(false);
    }
  }

  async function shareFeed() {
    const { data } = await api.post(`/clients/${clientId}/feed-share`);
    const url = `${window.location.origin}/grade/${data.token}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">Feed</h1>
          <p className="text-slate-500 mt-1">
            {activeView === 'calendar'
              ? 'Visualize as datas de publicação dentro do planejamento do feed.'
              : 'Prévia de como o perfil vai ficar, com os próximos posts em ordem de data.'}
          </p>
        </div>
        {user?.role !== 'client' && clients.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input-field w-56"
              value={clientId}
              onChange={(event) => {
                const nextId = event.target.value;
                setClientId(nextId);
                const nextClient = clients.find((client) => String(client.id) === String(nextId));
                if (nextClient) setSelectedClient(nextClient);
                setSearchParams(activeView === 'calendar'
                  ? { view: 'calendar', client_id: nextId }
                  : { client_id: nextId }, { replace: true });
              }}
            >
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            {activeView === 'grid' && (
              <button onClick={shareFeed} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
                {linkCopied ? 'Link copiado!' : 'Compartilhar feed'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="inline-flex max-w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => switchView('grid')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'grid' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Grid3x3 size={17} /> Prévia do feed
        </button>
        <button
          onClick={() => switchView('calendar')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'calendar' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CalendarDays size={17} /> Calendário
        </button>
      </div>

      {!clientId && (
        <p className="text-sm text-slate-400 py-12 text-center">Selecione um cliente para visualizar o feed.</p>
      )}

      {clientId && activeView === 'calendar' && (
        <CalendarView embedded clientId={clientId} />
      )}

      {clientId && activeView === 'grid' && (
        <div className="flex justify-center">
          <div className="w-full max-w-[380px] bg-slate-900 rounded-[2.5rem] p-3 shadow-xl">
            <div className="bg-white rounded-[2rem] overflow-hidden">
              <div className="h-6 flex items-center justify-center">
                <div className="w-20 h-4 bg-slate-900 rounded-full" />
              </div>

              <div className="px-4 pb-4">
                <div className="flex items-center gap-4 mb-3">
                  {currentClient?.avatar_data ? (
                    <img src={currentClient.avatar_data} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                      style={{ backgroundColor: currentClient?.logo_color }}
                    >
                      {currentClient?.name?.[0]}
                    </div>
                  )}
                  <div className="flex gap-4 text-center flex-1">
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{posts.length}</p>
                      <p className="text-[11px] text-slate-400">publicações</p>
                    </div>
                  </div>
                </div>

                <p className="font-semibold text-sm text-slate-800 break-words">
                  {currentClient?.name?.toLowerCase().replace(/\s+/g, '_')}
                </p>

                {editingBio ? (
                  <div className="mt-1.5 space-y-2">
                    <textarea
                      className="input-field text-xs min-h-[60px]"
                      value={bioDraft}
                      onChange={(event) => setBioDraft(event.target.value)}
                      placeholder="Escreva a bio do perfil..."
                      maxLength={150}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingBio(false)} className="btn-secondary text-xs flex-1 py-1.5">Cancelar</button>
                      <button onClick={saveBio} disabled={savingBio} className="btn-primary text-xs flex-1 py-1.5 flex items-center justify-center gap-1">
                        <Check size={12} /> {savingBio ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 mt-1 min-w-0">
                    <p className="text-xs text-slate-500 whitespace-pre-wrap break-words flex-1 min-w-0">
                      {currentClient?.bio || <span className="text-slate-300">Sem bio definida ainda.</span>}
                    </p>
                    {user?.role !== 'client' && (
                      <button onClick={startEditBio} className="text-slate-300 hover:text-zebrazul-600 shrink-0 mt-0.5" aria-label="Editar bio">
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100" />

              {posts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12 px-4">Nenhum post agendado para este cliente ainda.</p>
              ) : (
                <div className="grid grid-cols-3 gap-[2px] bg-slate-100">
                  {posts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setOpenPost(post)}
                      className="relative aspect-[4/5] bg-white overflow-hidden group"
                    >
                      {post.media_data ? (
                        <img src={post.media_data} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50">
                          <ImageIcon size={20} className="text-slate-300" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <Grid3x3 size={14} className="text-white" />
                        <span className="text-white text-[9px] font-medium px-2 text-center">
                          {new Date(post.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-4 min-w-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 break-words">{openPost.title}</h2>
                <StatusBadge status={openPost.status} />
              </div>
              <button onClick={() => setOpenPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" aria-label="Fechar">×</button>
            </div>
            <InstagramPreview
              clientName={currentClient?.name}
              clientColor={currentClient?.logo_color}
              imageSrc={openPost.media_data}
              images={openPost.media_gallery}
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
