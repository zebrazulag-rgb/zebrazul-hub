import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Grid3x3, Check, Link2, CalendarDays, ListOrdered, GripVertical, ChevronLeft, ChevronRight, Loader2, Plus, Pencil, EyeOff, Eye, Trash2, RotateCcw, RefreshCw, Radio, Columns3, Share2, Sparkles } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import InstagramPreview from '../components/InstagramPreview.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import AvatarUpload from '../components/AvatarUpload.jsx';
import CalendarView from './CalendarView.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import PostModal from '../components/PostModal.jsx';
import FeedCoverDashboard, { coverAnalysisKey, isVideoContent } from '../components/FeedCoverDashboard.jsx';
import { formChanged } from '../utils/formState.js';
import { hasPermission } from '../permissions.js';

export default function Feed() {
  const { user } = useAuth();

  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const canFeedCreate = hasPermission(user, 'social.feed_create');
  const canShareFeed = hasPermission(user, 'social.feed_share');
  const canSocialMediaLink = hasPermission(user, 'social.link_social_media');
  const canCovers = hasPermission(user, 'social.covers');
  const canPublished = hasPermission(user, 'social.published');
  const canCompare = hasPermission(user, 'social.compare');
  const canCalendar = hasPermission(user, 'social.calendar');
  const canConnections = hasPermission(user, 'social.connections');
  const requestedAllowed = requestedView === 'covers' ? canCovers
    : requestedView === 'published' ? canPublished
      : requestedView === 'compare' ? canCompare
        : requestedView === 'calendar' ? canCalendar
          : true;
  const activeView = requestedAllowed && ['calendar', 'published', 'compare', 'covers'].includes(requestedView) ? requestedView : 'grid';
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (selectedClient?.id || ''));
  const [posts, setPosts] = useState([]);
  const [hiddenPosts, setHiddenPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [showHiddenPosts, setShowHiddenPosts] = useState(false);
  const [postActionLoading, setPostActionLoading] = useState(null);
  const [postActionError, setPostActionError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const initialProfileDraftRef = useRef({});
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [socialMediaLinkCopied, setSocialMediaLinkCopied] = useState(false);
  const [postLinkCopiedId, setPostLinkCopiedId] = useState(null);
  const [reorderingPost, setReorderingPost] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState([]);
  const [savingGalleryOrder, setSavingGalleryOrder] = useState(false);
  const [galleryOrderError, setGalleryOrderError] = useState('');
  const [creatingPost, setCreatingPost] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [publishedPosts, setPublishedPosts] = useState([]);
  const [publishedConnection, setPublishedConnection] = useState(null);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedError, setPublishedError] = useState('');
  const [syncingPublished, setSyncingPublished] = useState(false);
  const [coverAnalyses, setCoverAnalyses] = useState({});
  const [coverAnalyzing, setCoverAnalyzing] = useState(false);
  const [coverError, setCoverError] = useState('');
  const autoAnalysisSignatureRef = useRef('');
  const draggedGalleryIndexRef = useRef(null);

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => {
        const availableClients = res.data.clients || [];
        setClients(availableClients);
        const selected = selectedClient
          ? availableClients.find((client) => String(client.id) === String(selectedClient.id))
          : null;
        setClientId(selected?.id || '');
      });
    } else if (user?.client_id) {
      api.get(`/clients/${user.client_id}`).then((res) => setClients([res.data.client]));
    }
  }, [user, selectedClient]);

  useEffect(() => {
    if (user?.role === 'client') return;
    setClientId(selectedClient?.id || '');
    if (!selectedClient) {
      setPosts([]);
      setHiddenPosts([]);
      setOpenPost(null);
      setPostLinkCopiedId(null);
      setEditingPost(null);
      setShowHiddenPosts(false);
      setCreatingPost(false);
      setPublishedPosts([]);
      setPublishedConnection(null);
      setPublishedError('');
      setCoverAnalyses({});
      setCoverError('');
      autoAnalysisSignatureRef.current = '';
    }
  }, [selectedClient, user]);

  async function loadPosts(targetClientId = clientId) {
    if (!targetClientId) {
      setPosts([]);
      setHiddenPosts([]);
      return;
    }

    const res = await api.get(`/posts?client_id=${targetClientId}`);
    const upcoming = res.data.posts
      .filter((post) => post.scheduled_at && ['pending_approval', 'approved', 'scheduled', 'draft'].includes(post.status))
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
    setPosts(upcoming.filter((post) => Number(post.feed_visible ?? 1) !== 0));
    setHiddenPosts(upcoming.filter((post) => Number(post.feed_visible ?? 1) === 0));
  }

  useEffect(() => {
    loadPosts(clientId).catch(() => { setPosts([]); setHiddenPosts([]); });
  }, [clientId]);

  const currentClient = clients.find((client) => String(client.id) === String(clientId));

  async function loadPublishedFeed(targetClientId = clientId) {
    if (!targetClientId) {
      setPublishedPosts([]);
      setPublishedConnection(null);
      return;
    }
    setPublishedLoading(true);
    setPublishedError('');
    try {
      const { data } = await api.get(`/feed-intelligence/client/${targetClientId}/published`, { params: { limit: 30 } });
      setPublishedPosts(data.items || []);
      setPublishedConnection(data.connection || null);
      if (!data.connection) setPublishedError('Conecte o Instagram deste cliente em Relatórios para visualizar o feed publicado.');
    } catch (err) {
      setPublishedPosts([]);
      setPublishedConnection(null);
      setPublishedError(err.response?.data?.error || 'Não foi possível carregar o feed publicado.');
    } finally {
      setPublishedLoading(false);
    }
  }

  async function loadCoverAnalyses(targetClientId = clientId) {
    if (!targetClientId) { setCoverAnalyses({}); return; }
    try {
      const { data } = await api.get(`/feed-intelligence/client/${targetClientId}/covers`);
      setCoverAnalyses(data.analyses || {});
    } catch {
      setCoverAnalyses({});
    }
  }

  async function analyzeCovers({ force = false, silent = false, includePublished = true } = {}) {
    if (!clientId || coverAnalyzing) return;
    const plannedIds = posts.filter((item) => isVideoContent(item.content_type)).map((item) => item.id);
    const instagramIds = includePublished ? publishedPosts.filter((item) => isVideoContent(item.content_type)).map((item) => item.content_id) : [];
    if (!plannedIds.length && !instagramIds.length) return;
    setCoverAnalyzing(true);
    if (!silent) setCoverError('');
    try {
      const { data } = await api.post(`/feed-intelligence/client/${clientId}/analyze-covers`, {
        planned_ids: plannedIds,
        instagram_ids: instagramIds,
        force,
      });
      setCoverAnalyses((current) => ({ ...current, ...(data.analyses || {}) }));
      const failures = (data.results || []).filter((item) => !item.ok);
      if (failures.length && !silent) setCoverError(failures[0]?.error || 'Algumas capas não puderam ser analisadas.');
    } catch (err) {
      if (!silent) setCoverError(err.response?.data?.error || 'Não foi possível analisar as capas agora.');
    } finally {
      setCoverAnalyzing(false);
    }
  }

  async function syncInstagramFeed() {
    if (!clientId || syncingPublished) return;
    setSyncingPublished(true);
    setPublishedError('');
    try {
      const now = new Date();
      const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const to = now.toISOString().slice(0, 10);
      const from = since.toISOString().slice(0, 10);
      await api.post(`/meta-organic/client/${clientId}/sync`, { from, to });
      await loadPublishedFeed(clientId);
      await loadCoverAnalyses(clientId);
    } catch (err) {
      setPublishedError(err.response?.data?.error || 'Não foi possível sincronizar o Instagram agora.');
    } finally {
      setSyncingPublished(false);
    }
  }

  function openPublishedPost(post) {
    if (post?.permalink) window.open(post.permalink, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    if (!clientId) return;
    if (canPublished || canCompare || canCovers) loadPublishedFeed(clientId);
    if (canCovers) loadCoverAnalyses(clientId);
  }, [clientId, canPublished, canCompare, canCovers]);

  useEffect(() => {
    if (!clientId || !canCovers || coverAnalyzing) return;
    // Analisa automaticamente apenas os vídeos planejados: é onde o alerta
    // evita que um Reels chegue à publicação sem capa. O feed já publicado
    // também pode ser analisado pelo botão, sem gerar custo a cada abertura.
    const pendingKeys = posts.filter((item) => isVideoContent(item.content_type)).map((item) => ({
      key: coverAnalysisKey('planned', item.id),
      imageRef: item.media_data || item.media_gallery?.[0]?.data || null,
    })).filter((item) => !coverAnalyses[item.key] || coverAnalyses[item.key]?.image_ref !== item.imageRef).map((item) => item.key);
    if (!pendingKeys.length) return;
    const signature = pendingKeys.sort().join('|');
    if (!signature || autoAnalysisSignatureRef.current === signature) return;
    autoAnalysisSignatureRef.current = signature;
    analyzeCovers({ silent: true, includePublished: false });
  }, [clientId, posts, publishedPosts, coverAnalyses, canCovers]);

  function switchView(view) {
    setOpenPost(null);
    setSearchParams(view === 'grid' ? {} : { view }, { replace: true });
  }

  function openCalendarPostInFeed(post) {
    // O calendário deve abrir exatamente o mesmo modal usado pela grade do Feed.
    // Mantemos a visualização em Calendário e apenas reutilizamos o fluxo openFeedPost.
    if (!post?.id) return;
    openFeedPost(post);
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
      await api.put(`/clients/${clientId}/feed-profile`, profileDraft);
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


  async function shareSocialMediaLink() {
    if (!clientId) return;
    setPostActionError('');
    try {
      const { data } = await api.post(`/clients/${clientId}/social-media-share`);
      const url = `${window.location.origin}/link-social-media/${data.token}`;
      await navigator.clipboard.writeText(url);
      setSocialMediaLinkCopied(true);
      setTimeout(() => setSocialMediaLinkCopied(false), 2500);
    } catch (err) {
      const status = err.response?.status ? ` (HTTP ${err.response.status})` : '';
      window.alert((err.response?.data?.error || 'Não foi possível gerar o LINK SOCIAL MEDIA.') + status);
    }
  }

  async function shareSinglePost(post) {
    if (!post?.id) return;
    setPostActionLoading(`share-${post.id}`);
    setPostActionError('');
    try {
      const { data } = await api.post(`/posts/${post.id}/view-share`);
      const url = `${window.location.origin}/post/${data.token}`;
      await navigator.clipboard.writeText(url);
      setPostLinkCopiedId(post.id);
      setTimeout(() => {
        setPostLinkCopiedId((current) => (String(current) === String(post.id) ? null : current));
      }, 2500);
    } catch (err) {
      setPostActionError(err.response?.data?.error || 'Não foi possível gerar o link deste post.');
    } finally {
      setPostActionLoading(null);
    }
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


  function startEditPost(post = openPost) {
    if (!post) return;
    setPostActionError('');
    setReorderingPost(false);
    setGalleryDraft([]);
    setOpenPost(null);
    setShowHiddenPosts(false);
    setEditingPost(post);
  }

  async function updatePostVisibility(post, visible) {
    if (!post?.id) return;
    setPostActionLoading(`visibility-${post.id}`);
    setPostActionError('');
    try {
      await api.put(`/posts/${post.id}`, { feed_visible: visible ? 1 : 0 });
      setOpenPost(null);
      await loadPosts(clientId);
      setCalendarRefreshKey((current) => current + 1);
    } catch (err) {
      setPostActionError(err.response?.data?.error || 'Não foi possível atualizar a exibição do post.');
    } finally {
      setPostActionLoading(null);
    }
  }

  async function deletePost(post) {
    if (!post?.id) return;
    const confirmed = window.confirm(`Excluir definitivamente “${post.title}”? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    setPostActionLoading(`delete-${post.id}`);
    setPostActionError('');
    try {
      await api.delete(`/posts/${post.id}`);
      setOpenPost(null);
      await loadPosts(clientId);
      setCalendarRefreshKey((current) => current + 1);
    } catch (err) {
      setPostActionError(err.response?.data?.error || 'Não foi possível excluir o post.');
    } finally {
      setPostActionLoading(null);
    }
  }

  const publishedClient = currentClient ? {
    ...currentClient,
    instagram_username: publishedConnection?.instagram_username || currentClient.instagram_username,
    instagram_display_name: publishedConnection?.instagram_name || currentClient.instagram_display_name,
    avatar_data: publishedConnection?.instagram_picture_url || currentClient.avatar_data,
  } : currentClient;

  const viewDescription = {
    grid: 'Feed planejado no ZebraHub, com a grade limpa para organizar a sequência das publicações.',
    covers: 'Área exclusiva para revisar capas de Reels e vídeos antes e depois da publicação.',
    published: 'Feed publicado no Instagram, usando a última sincronização disponível.',
    compare: 'Compare lado a lado o que foi planejado no ZebraHub com o que está publicado.',
    calendar: 'Visualize as datas de publicação dentro do planejamento do feed.',
  }[activeView];

  return (
    <div className="feed-page space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">Feed em tempo real</h1>
          <p className="text-slate-500 mt-1">{viewDescription}</p>
        </div>
        {clientId && (canFeedCreate || canShareFeed || canSocialMediaLink) && (
          <div className="flex items-center gap-2 flex-wrap">
            {canFeedCreate && <button
              type="button"
              onClick={() => setCreatingPost(true)}
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Plus size={17} /> Nova publicação
            </button>}
            {canFeedCreate && activeView === 'grid' && hiddenPosts.length > 0 && (
              <button
                type="button"
                onClick={() => { setPostActionError(''); setShowHiddenPosts(true); }}
                className="btn-secondary flex items-center gap-2 whitespace-nowrap"
              >
                <EyeOff size={16} /> Fora da grade ({hiddenPosts.length})
              </button>
            )}
            {activeView === 'grid' && (
              <>
                {canShareFeed && <button onClick={shareFeed} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                  {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
                  {linkCopied ? 'Link copiado!' : 'Compartilhar feed'}
                </button>}
                {canSocialMediaLink && <button onClick={shareSocialMediaLink} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                  {socialMediaLinkCopied ? <Check size={16} /> : <Share2 size={16} />}
                  {socialMediaLinkCopied ? 'LINK SOCIAL MEDIA copiado!' : 'LINK SOCIAL MEDIA'}
                </button>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => switchView('grid')}
          className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'grid' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Grid3x3 size={17} /> Planejado
        </button>
        {canCovers && (
        <button
          onClick={() => switchView('covers')}
          className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'covers' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Sparkles size={17} /> Capas
        </button>
        )}
        {canPublished && (
        <button
          onClick={() => switchView('published')}
          className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'published' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Radio size={17} /> Publicado
        </button>
        )}
        {canCompare && (
        <button
          onClick={() => switchView('compare')}
          className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'compare' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Columns3 size={17} /> Comparar
        </button>
        )}
        {canCalendar && (
        <button
          onClick={() => switchView('calendar')}
          className={`flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'calendar' ? 'bg-zebrazul-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CalendarDays size={17} /> Calendário
        </button>
        )}
      </div>

      {!clientId && (
        <p className="text-sm text-slate-400 py-12 text-center">Selecione um cliente para visualizar o feed.</p>
      )}

      {clientId && activeView === 'covers' && (
        <div className="space-y-5">
          <FeedCoverDashboard
            plannedPosts={posts}
            publishedPosts={publishedPosts}
            analyses={coverAnalyses}
            analyzing={coverAnalyzing}
            onAnalyze={() => analyzeCovers({ force: true })}
            error={coverError}
          />

          <div className={`grid items-start gap-6 ${publishedPosts.some((item) => isVideoContent(item.content_type)) ? '2xl:grid-cols-2' : ''}`}>
            <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">Capas do feed planejado</h3>
                  <p className="mt-1 text-xs text-slate-500">Somente Reels e vídeos aparecem nesta revisão.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {posts.filter((item) => isVideoContent(item.content_type)).length} vídeos
                </span>
              </div>
              {posts.some((item) => isVideoContent(item.content_type)) ? (
                <InstagramProfileMockup
                  client={currentClient}
                  posts={posts.filter((item) => isVideoContent(item.content_type))}
                  onPostClick={openFeedPost}
                  editable={false}
                  coverAnalyses={coverAnalyses}
                  sourceType="planned"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-400">Nenhum vídeo planejado para revisar.</div>
              )}
            </section>

            {publishedPosts.some((item) => isVideoContent(item.content_type)) && (
              <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Capas já publicadas</h3>
                    <p className="mt-1 text-xs text-slate-500">Confira visualmente os Reels que já chegaram ao Instagram.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {publishedPosts.filter((item) => isVideoContent(item.content_type)).length} vídeos
                  </span>
                </div>
                <InstagramProfileMockup
                  client={publishedClient}
                  posts={publishedPosts.filter((item) => isVideoContent(item.content_type))}
                  onPostClick={openPublishedPost}
                  coverAnalyses={coverAnalyses}
                  sourceType="instagram"
                />
              </section>
            )}
          </div>
        </div>
      )}

      {clientId && activeView === 'calendar' && (
        <CalendarView key={`${clientId}-${calendarRefreshKey}`} embedded clientId={clientId} onOpenPost={openCalendarPostInFeed} />
      )}

      {clientId && activeView === 'grid' && (
        <div className="instagram-preview-stage flex justify-center">
          <InstagramProfileMockup
            client={currentClient}
            posts={posts}
            onPostClick={openFeedPost}
            editable={canFeedCreate}
            onEdit={startEditProfile}
            showCoverBadges={false}
          />
        </div>
      )}

      {clientId && activeView === 'published' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Instagram publicado</p>
              <p className="text-xs text-slate-500">
                {publishedConnection?.last_synced_at ? `Última sincronização: ${new Date(`${String(publishedConnection.last_synced_at).replace(' ', 'T')}Z`).toLocaleString('pt-BR')}` : 'Ainda não sincronizado.'}
              </p>
            </div>
            {canConnections && (
              <button type="button" onClick={syncInstagramFeed} disabled={syncingPublished} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50">
                {syncingPublished ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {syncingPublished ? 'Sincronizando...' : 'Sincronizar Instagram'}
              </button>
            )}
          </div>
          {publishedError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{publishedError}</div>}
          {publishedLoading ? (
            <div className="flex justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="instagram-preview-stage flex justify-center">
              <InstagramProfileMockup
                client={publishedClient}
                posts={publishedPosts}
                onPostClick={openPublishedPost}
                showCoverBadges={false}
              />
            </div>
          )}
        </div>
      )}

      {clientId && activeView === 'compare' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Planejado x publicado</p>
              <p className="text-xs text-slate-500">Use esta visão para conferir composição e sequência antes que o feed real se afaste do planejamento.</p>
            </div>
            {canConnections && (
              <button type="button" onClick={syncInstagramFeed} disabled={syncingPublished} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50">
                {syncingPublished ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Atualizar publicado
              </button>
            )}
          </div>
          {publishedError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{publishedError}</div>}
          <div className="grid items-start gap-6 2xl:grid-cols-2">
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-800">Planejado no ZebraHub</h3><span className="text-xs font-semibold text-slate-400">{posts.length} itens</span></div>
              <InstagramProfileMockup client={currentClient} posts={posts} onPostClick={openFeedPost} showCoverBadges={false} />
            </section>
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-800">Publicado no Instagram</h3><span className="text-xs font-semibold text-slate-400">{publishedPosts.length} itens</span></div>
              <InstagramProfileMockup client={publishedClient} posts={publishedPosts} onPostClick={openPublishedPost} showCoverBadges={false} />
            </section>
          </div>
        </div>
      )}

      {canFeedCreate && creatingPost && clientId && (
        <PostModal
          clients={currentClient ? [currentClient] : clients.filter((client) => String(client.id) === String(clientId))}
          defaultClientId={clientId}
          lockClient
          requireSchedule
          onClose={() => setCreatingPost(false)}
          onSaved={async () => {
            setCreatingPost(false);
            await loadPosts(clientId);
            setCalendarRefreshKey((current) => current + 1);
          }}
        />
      )}


      {canFeedCreate && editingPost && clientId && (
        <PostModal
          clients={currentClient ? [currentClient] : clients.filter((client) => String(client.id) === String(clientId))}
          defaultClientId={clientId}
          post={editingPost}
          lockClient
          requireSchedule
          onClose={() => setEditingPost(null)}
          onSaved={async () => {
            setEditingPost(null);
            await loadPosts(clientId);
            setCalendarRefreshKey((current) => current + 1);
          }}
        />
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

      {showHiddenPosts && (
        <ModalBackdrop onClose={() => setShowHiddenPosts(false)} disabled={Boolean(postActionLoading)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Posts fora da grade</h2>
                <p className="text-sm text-slate-500">Eles continuam salvos e podem permanecer no calendário, mas não aparecem na prévia nem no link compartilhado do feed.</p>
              </div>
              <button type="button" onClick={() => setShowHiddenPosts(false)} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="Fechar">×</button>
            </div>

            {postActionError && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{postActionError}</p>
            )}

            <div className="space-y-3">
              {hiddenPosts.map((post) => (
                <div key={post.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {post.media_data ? <img src={post.media_data} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 break-words">{post.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sem data'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => updatePostVisibility(post, true)}
                      disabled={Boolean(postActionLoading)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {postActionLoading === `visibility-${post.id}` ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      Voltar à grade
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditPost(post)}
                      disabled={Boolean(postActionLoading)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-zebrazul-300 hover:text-zebrazul-700 disabled:opacity-50"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePost(post)}
                      disabled={Boolean(postActionLoading)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {postActionLoading === `delete-${post.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {hiddenPosts.length === 0 && (
                <div className="py-12 text-center">
                  <RotateCcw size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-400">Nenhum post está fora da grade.</p>
                </div>
              )}
            </div>
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
                </div>
              </div>
              <button onClick={() => setOpenPost(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" aria-label="Fechar">×</button>
            </div>

            {canFeedCreate && !reorderingPost && (
              <div className="mb-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={startGalleryReorder}
                    disabled={galleryFromPost(openPost).length < 2 || Boolean(postActionLoading)}
                    title={galleryFromPost(openPost).length < 2 ? 'Disponível para posts com duas ou mais imagens' : 'Alterar a ordem das imagens do carrossel'}
                    aria-label="Editar ordem das imagens"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-zebrazul-300 hover:bg-zebrazul-50 hover:text-zebrazul-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ListOrdered size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => shareSinglePost(openPost)}
                    disabled={Boolean(postActionLoading)}
                    title={String(postLinkCopiedId) === String(openPost.id) ? 'Link copiado!' : 'Copiar link deste post'}
                    aria-label={String(postLinkCopiedId) === String(openPost.id) ? 'Link copiado' : 'Copiar link deste post'}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
                      String(postLinkCopiedId) === String(openPost.id)
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-zebrazul-300 hover:bg-zebrazul-50 hover:text-zebrazul-700'
                    }`}
                  >
                    {postActionLoading === `share-${openPost.id}`
                      ? <Loader2 size={16} className="animate-spin" />
                      : String(postLinkCopiedId) === String(openPost.id)
                        ? <Check size={17} />
                        : <Link2 size={17} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditPost(openPost)}
                    disabled={Boolean(postActionLoading)}
                    title="Editar post"
                    aria-label="Editar post"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-zebrazul-300 hover:bg-zebrazul-50 hover:text-zebrazul-700 disabled:opacity-50"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePostVisibility(openPost, false)}
                    disabled={Boolean(postActionLoading)}
                    title="Tirar da grade"
                    aria-label="Tirar da grade"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    {postActionLoading === `visibility-${openPost.id}` ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePost(openPost)}
                    disabled={Boolean(postActionLoading)}
                    title="Excluir post"
                    aria-label="Excluir post"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {postActionLoading === `delete-${openPost.id}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
              </div>
            )}

            {postActionError && !reorderingPost && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{postActionError}</p>
            )}

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
