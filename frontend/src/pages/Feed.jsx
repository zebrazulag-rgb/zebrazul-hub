import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Grid3x3, Check, Link2, CalendarDays, ListOrdered, GripVertical, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import AvatarUpload from '../components/AvatarUpload.jsx';
import CalendarView from './CalendarView.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { formChanged } from '../utils/formState.js';

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
  const initialProfileDraftRef = useRef({});
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reorderingPost, setReorderingPost] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState([]);
  const [savingGalleryOrder, setSavingGalleryOrder] = useState(false);
  const [galleryOrderError, setGalleryOrderError] = useState('');
  const draggedGalleryIndexRef = useRef(null);

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
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setPosts(upcoming);
    });
  }, [clientId]);

  const currentClient = clients.find((client) => String(client.id) === String(clientId));

  function switchView(view) {
    setOpenPost(null);
    setSearchParams(view === 'calendar' ? { view: 'calendar', client_id: String(clientId || '') } : { client_id: String(clientId || '') }, { replace: true });
  }

  function startEditProfile() {
    const nextDraft = {
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
    };
    initialProfileDraftRef.current = nextDraft;
    setProfileDraft(nextDraft);
    setProfileError('');
    setEditingProfile(true);
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError('');
    try {
      await api.put(`/clients/${clientId}`, profileDraft);
      setClients((previous) => previous.map((client) => (
        String(client.id) === String(clientId) ? { ...client, ...profileDraft } : client
      )));
      setEditingProfile(false);
      return true;
    } catch (err) {
      setProfileError(err.response?.data?.error || 'Não foi possível salvar o perfil do Feed.');
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleProfileRequestClose() {
    if (!formChanged(initialProfileDraftRef.current, profileDraft)) {
      setEditingProfile(false);
      return;
    }

    await saveProfile();
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
    setReorderingPost(false);
    setGalleryDraft([]);
    setGalleryOrderError('');
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

  function moveGalleryItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
      return items;
    }
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function startGalleryReorder() {
    const gallery = galleryFromPost(openPost);
    setGalleryDraft(gallery);
    setGalleryOrderError('');
    setReorderingPost(true);
  }

  function cancelGalleryReorder() {
    setReorderingPost(false);
    setGalleryDraft([]);
    setGalleryOrderError('');
  }

  function moveGallerySlide(fromIndex, toIndex) {
    setGalleryDraft((current) => moveGalleryItem(current, fromIndex, toIndex));
  }

  function handleGalleryDragStart(event, index) {
    draggedGalleryIndexRef.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function handleGalleryDrop(event, targetIndex) {
    event.preventDefault();
    const storedIndex = Number(event.dataTransfer.getData('text/plain'));
    const sourceIndex = Number.isInteger(storedIndex) ? storedIndex : draggedGalleryIndexRef.current;
    if (Number.isInteger(sourceIndex)) moveGallerySlide(sourceIndex, targetIndex);
    draggedGalleryIndexRef.current = null;
  }

  async function saveGalleryOrder() {
    if (!openPost?.id || galleryDraft.length < 2) return;
    setSavingGalleryOrder(true);
    setGalleryOrderError('');
    try {
      await api.put(`/posts/${openPost.id}`, { media_gallery: galleryDraft });
      const nextPost = {
        ...openPost,
        media_gallery: galleryDraft,
        media_data: galleryDraft[0]?.data || null,
        media_mime: galleryDraft[0]?.mime || null,
      };
      setOpenPost(nextPost);
      setPosts((current) => current.map((post) => (
        String(post.id) === String(openPost.id) ? { ...post, ...nextPost } : post
      )));
      setReorderingPost(false);
      setGalleryDraft([]);
    } catch (err) {
      setGalleryOrderError(err.response?.data?.error || 'Não foi possível salvar a nova ordem.');
    } finally {
      setSavingGalleryOrder(false);
    }
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">Feed</h1>
          <p className="text-slate-500 mt-1">
            {activeView === 'calendar'
              ? 'Visualize as datas de publicação dentro do planejamento do feed.'
              : 'Prévia do feed com as datas mais futuras no topo e as mais próximas na base.'}
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
        <ModalBackdrop onClose={handleProfileRequestClose} disabled={savingProfile} className="bg-black/45">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-800">Editar perfil do Feed</h2><p className="text-sm text-slate-500">As informações abaixo aparecem na prévia do Instagram.</p></div>
              <button onClick={handleProfileRequestClose} className="text-2xl text-slate-400">×</button>
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
            {profileError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{profileError}</p>}
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
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={openPost.status} />
                  {user?.role !== 'client' && galleryFromPost(openPost).length > 1 && !reorderingPost && (
                    <button
                      type="button"
                      onClick={startGalleryReorder}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-zebrazul-300 hover:text-zebrazul-700"
                    >
                      <ListOrdered size={13} /> Editar ordem
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => setOpenPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" aria-label="Fechar">×</button>
            </div>

            {reorderingPost && (
              <div className="mb-4 rounded-xl border border-zebrazul-100 bg-zebrazul-50/60 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Ordem do carrossel</p>
                    <p className="text-xs text-slate-500">Arraste os slides ou use as setas. O slide 1 será a capa do feed.</p>
                  </div>
                  <GripVertical size={18} className="mt-0.5 shrink-0 text-slate-400" />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {galleryDraft.map((item, index) => (
                    <div
                      key={`${item.filename || item.data?.slice(-24) || 'slide'}-${index}`}
                      draggable={!savingGalleryOrder}
                      onDragStart={(event) => handleGalleryDragStart(event, index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleGalleryDrop(event, index)}
                      className="group relative h-32 w-24 shrink-0 cursor-grab overflow-hidden rounded-lg border border-white bg-slate-100 shadow-sm active:cursor-grabbing"
                      title={`Slide ${index + 1}`}
                    >
                      <img src={item.data} alt={`Slide ${index + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-slate-950/75 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          disabled={index === 0 || savingGalleryOrder}
                          onClick={() => moveGallerySlide(index, index - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Mover slide ${index + 1} para a esquerda`}
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={index === galleryDraft.length - 1 || savingGalleryOrder}
                          onClick={() => moveGallerySlide(index, index + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Mover slide ${index + 1} para a direita`}
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {galleryOrderError && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{galleryOrderError}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={cancelGalleryReorder} disabled={savingGalleryOrder} className="btn-secondary flex-1 py-2 text-sm">
                    Cancelar
                  </button>
                  <button type="button" onClick={saveGalleryOrder} disabled={savingGalleryOrder} className="btn-primary flex flex-1 items-center justify-center gap-2 py-2 text-sm">
                    {savingGalleryOrder && <Loader2 size={15} className="animate-spin" />}
                    {savingGalleryOrder ? 'Salvando...' : 'Salvar ordem'}
                  </button>
                </div>
              </div>
            )}

            <InstagramPreview
              clientName={currentClient?.name}
              clientUsername={currentClient?.instagram_username}
              clientColor={currentClient?.logo_color}
              avatarSrc={currentClient?.avatar_data}
              imageSrc={reorderingPost ? galleryDraft[0]?.data : openPost.media_data}
              images={reorderingPost ? galleryDraft : openPost.media_gallery}
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
