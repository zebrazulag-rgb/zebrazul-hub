import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Grid3x3, Check, Link2, CalendarDays } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import AvatarUpload from '../components/AvatarUpload.jsx';
import CalendarView from './CalendarView.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

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
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
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

  function startEditProfile() {
    setProfileDraft({
      instagram_username: currentClient?.instagram_username || currentClient?.name?.toLowerCase().replace(/[^a-z0-9]+/gi, '') || '',
      instagram_display_name: currentClient?.instagram_display_name || currentClient?.name || '',
      bio: currentClient?.bio || '',
      instagram_posts_count: currentClient?.instagram_posts_count ?? posts.length,
      instagram_followers_count: currentClient?.instagram_followers_count ?? 0,
      instagram_following_count: currentClient?.instagram_following_count ?? 0,
      instagram_link: currentClient?.instagram_link || '',
      instagram_primary_action: currentClient?.instagram_primary_action || 'Seguindo',
      instagram_secondary_action: currentClient?.instagram_secondary_action || 'Mensagem',
      instagram_tertiary_action: currentClient?.instagram_tertiary_action || 'Contato',
      avatar_data: currentClient?.avatar_data || null,
      avatar_mime: currentClient?.avatar_mime || null,
    });
    setEditingProfile(true);
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api.put(`/clients/${clientId}`, profileDraft);
      setClients((previous) => previous.map((client) => (
        String(client.id) === String(clientId) ? { ...client, ...profileDraft } : client
      )));
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  }

  function normalizeGalleryValue(value) {
    let source = value;

    for (let attempt = 0; attempt < 3 && typeof source === 'string'; attempt += 1) {
      try {
        source = JSON.parse(source);
      } catch {
        break;
      }
    }

    if (source && !Array.isArray(source) && typeof source === 'object') {
      source = source.media_gallery || source.gallery || source.images || source.items || source.files || [];
    }

    if (!Array.isArray(source)) return [];

    return source
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') return { data: item };
        if (typeof item !== 'object') return null;

        const data = item.data || item.url || item.src || item.preview || item.dataUrl || item.media_data || item.file_data;
        return data ? { ...item, data } : null;
      })
      .filter(Boolean);
  }

  function galleryFromPost(post) {
    if (!post) return [];
    const candidates = [
      post.media_gallery,
      post.gallery,
      post.images,
      post.media_files,
      post.attachments,
    ].map(normalizeGalleryValue);

    const richest = candidates.reduce((best, current) => (
      current.length > best.length ? current : best
    ), []);

    if (richest.length) return richest;
    return post.media_data ? [{ data: post.media_data, mime: post.media_mime || 'image/jpeg' }] : [];
  }

  async function openFeedPost(post) {
    // Abre imediatamente com os dados já disponíveis na grade.
    const listGallery = galleryFromPost(post);
    setOpenPost({ ...post, media_gallery: listGallery });

    try {
      const [detailResult, galleryResult] = await Promise.allSettled([
        api.get(`/posts/${post.id}`),
        api.get(`/posts/${post.id}/gallery`),
      ]);

      const detailedPost = detailResult.status === 'fulfilled'
        ? detailResult.value.data.post
        : null;
      const endpointGallery = galleryResult.status === 'fulfilled'
        ? normalizeGalleryValue(galleryResult.value.data.gallery)
        : [];
      const detailedGallery = galleryFromPost(detailedPost);

      const richestGallery = [listGallery, detailedGallery, endpointGallery]
        .reduce((best, current) => (current.length > best.length ? current : best), []);

      setOpenPost({
        ...post,
        ...(detailedPost || {}),
        media_gallery: richestGallery,
        media_data: richestGallery[0]?.data || detailedPost?.media_data || post.media_data || null,
      });
    } catch {
      // Mantém a prévia aberta com os dados da listagem.
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
          <InstagramProfileMockup
            client={currentClient}
            posts={posts}
            onPostClick={openFeedPost}
            editable={user?.role !== 'client'}
            onEdit={startEditProfile}
          />
        </div>
      )}

      {editingProfile && (
        <ModalBackdrop onClose={() => setEditingProfile(false)} disabled={savingProfile} className="bg-black/45">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-800">Editar perfil do Feed</h2><p className="text-sm text-slate-500">As informações abaixo aparecem na prévia do Instagram.</p></div>
              <button onClick={() => setEditingProfile(false)} className="text-2xl text-slate-400">×</button>
            </div>
            <div className="mb-5 flex items-center gap-4">
              <AvatarUpload imageSrc={profileDraft.avatar_data} fallbackText={currentClient?.name} fallbackColor={currentClient?.logo_color} size={86} onChange={(data, mime) => setProfileDraft((v) => ({ ...v, avatar_data: data, avatar_mime: mime }))} />
              <p className="text-sm text-slate-500">Clique na foto para alterar o avatar do perfil.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Usuário do Instagram" value={profileDraft.instagram_username} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_username: v }))} placeholder="institutoespinel" />
              <Field label="Nome exibido" value={profileDraft.instagram_display_name} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_display_name: v }))} placeholder="Instituto Espinel | Natal RN" />
              <Field label="Posts" type="number" value={profileDraft.instagram_posts_count} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_posts_count: Number(v) }))} />
              <Field label="Seguidores" type="number" value={profileDraft.instagram_followers_count} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_followers_count: Number(v) }))} />
              <Field label="Seguindo" type="number" value={profileDraft.instagram_following_count} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_following_count: Number(v) }))} />
              <Field label="Link da bio" value={profileDraft.instagram_link} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_link: v }))} placeholder="linktr.ee/perfil" />
              <Field label="Botão 1" value={profileDraft.instagram_primary_action} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_primary_action: v }))} />
              <Field label="Botão 2" value={profileDraft.instagram_secondary_action} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_secondary_action: v }))} />
              <Field label="Botão 3" value={profileDraft.instagram_tertiary_action} onChange={(v) => setProfileDraft((p) => ({ ...p, instagram_tertiary_action: v }))} />
              <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Bio</label><textarea className="input-field min-h-[110px]" value={profileDraft.bio || ''} onChange={(e) => setProfileDraft((p) => ({ ...p, bio: e.target.value }))} /></div>
            </div>
            <div className="mt-6 flex gap-3 border-t border-slate-100 pt-4"><button onClick={() => setEditingProfile(false)} className="btn-secondary flex-1">Cancelar</button><button onClick={saveProfile} disabled={savingProfile} className="btn-primary flex-1">{savingProfile ? 'Salvando...' : 'Salvar perfil'}</button></div>
          </div>
        </ModalBackdrop>
      )}

      {openPost && (
        <ModalBackdrop onClose={() => setOpenPost(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 min-w-0" role="dialog" aria-modal="true">
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
        </ModalBackdrop>
      )}
    </div>
  );
}


function Field({ label, value, onChange, placeholder = '', type = 'text' }) {
  return <div><label className="mb-1 block text-sm font-medium text-slate-700">{label}</label><input type={type} className="input-field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}
