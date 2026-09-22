import { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Video, Trash2, GripVertical, ChevronLeft, ChevronRight, Pin, Instagram, Send, CalendarClock, Link2, LoaderCircle } from 'lucide-react';
import api from '../api';
import InstagramPreview from './InstagramPreview.jsx';
import ModalBackdrop from './ModalBackdrop.jsx';
import { formChanged } from '../utils/formState.js';

const PLATFORM_OPTIONS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
const CONTENT_TYPES = ['feed', 'reels', 'story', 'carrossel', 'artigo'];
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'pending_approval', label: 'Aguardando aprovação' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Reprovado' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'published', label: 'Publicado' },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parsePlatforms(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseGallery(post) {
  if (Array.isArray(post?.media_gallery)) return post.media_gallery;
  try {
    const parsed = JSON.parse(post?.media_gallery || '[]');
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return post?.media_data
    ? [{ data: post.media_data, mime: post.media_mime || 'image/jpeg', filename: '' }]
    : [];
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function emptyForm(defaultClientId) {
  return {
    client_id: defaultClientId || '',
    title: '',
    caption: '',
    content_type: 'feed',
    platforms: ['instagram'],
    scheduled_at: '',
    status: 'draft',
    is_pinned: false,
    media_gallery: [],
  };
}

function postToForm(post, defaultClientId) {
  if (!post) return emptyForm(defaultClientId);
  return {
    client_id: post.client_id || defaultClientId || '',
    title: post.title || '',
    caption: post.caption || '',
    content_type: post.content_type || 'feed',
    platforms: parsePlatforms(post.platforms),
    scheduled_at: toLocalDateTimeInput(post.scheduled_at),
    status: post.status || 'draft',
    is_pinned: Boolean(Number(post.is_pinned || 0)),
    media_gallery: parseGallery(post),
  };
}

export default function PostModal({ clients, defaultClientId, post, onClose, onSaved, lockClient = false, requireSchedule = false }) {
  const isEditing = Boolean(post?.id);
  const [form, setForm] = useState(() => postToForm(post, defaultClientId));
  const initialFormRef = useRef(postToForm(post, defaultClientId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isUploadDropActive, setIsUploadDropActive] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [instagramConnection, setInstagramConnection] = useState(null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [publicationAction, setPublicationAction] = useState('');
  const uploadDragDepthRef = useRef(0);
  const draggedMediaIndexRef = useRef(null);

  useEffect(() => {
    const nextForm = postToForm(post, defaultClientId);
    initialFormRef.current = nextForm;
    setForm(nextForm);
  }, [post, defaultClientId]);


  async function loadInstagramConnection(targetClientId = form.client_id) {
    if (!targetClientId) { setInstagramConnection(null); return; }
    try {
      const { data } = await api.get(`/instagram-oauth/status/${targetClientId}`, { params: { _ts: Date.now() } });
      setInstagramConnection(data.connection || null);
    } catch { setInstagramConnection(null); }
  }

  useEffect(() => { loadInstagramConnection(form.client_id); }, [form.client_id]);

  useEffect(() => {
    function onMessage(event) {
      const payload = event.data;
      if (!payload || payload.type !== 'zebrahub-instagram-oauth') return;
      if (Number(payload.clientId) !== Number(form.client_id)) return;
      setInstagramLoading(false);
      if (payload.ok) loadInstagramConnection(form.client_id);
      else setError(payload.message || 'Não foi possível conectar o Instagram.');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [form.client_id]);

  async function connectInstagram() {
    if (!form.client_id) return setError('Selecione o cliente antes de conectar o Instagram.');
    try {
      setInstagramLoading(true); setError('');
      const { data } = await api.post(`/instagram-oauth/start/${form.client_id}`, { origin: window.location.origin });
      const popup = window.open(data.authorization_url, 'zebrahub-instagram-oauth', 'width=620,height=760,resizable=yes,scrollbars=yes');
      if (!popup) { setInstagramLoading(false); setError('O navegador bloqueou a janela do Instagram. Libere pop-ups e tente novamente.'); }
    } catch (err) { setInstagramLoading(false); setError(err.response?.data?.error || 'Não foi possível iniciar a conexão com o Instagram.'); }
  }

  function togglePlatform(platform) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform],
    }));
  }

  async function addMediaFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const wantsVideo = form.content_type === 'reels';
    const invalidFile = files.find((file) => wantsVideo ? !file.type?.startsWith('video/') : !file.type?.startsWith('image/'));
    if (invalidFile) {
      setError(wantsVideo ? `O arquivo “${invalidFile.name}” não é um vídeo válido.` : `O arquivo “${invalidFile.name}” não é uma imagem válida.`);
      return;
    }
    if (wantsVideo && files.length > 1) {
      setError('Adicione um vídeo por Reel.');
      return;
    }

    const tooLarge = files.find((file) => file.size > (wantsVideo ? 80 : 8) * 1024 * 1024);
    if (tooLarge) {
      setError(`${wantsVideo ? 'O vídeo' : 'A imagem'} “${tooLarge.name}” ultrapassa ${wantsVideo ? 80 : 8}MB.`);
      return;
    }

    try {
      setUploadingMedia(true);
      let converted;
      if (wantsVideo) {
        const body = new FormData();
        body.append('file', files[0]);
        const { data } = await api.post('/posts/upload-media', body, { headers: { 'Content-Type': 'multipart/form-data' } });
        converted = [{ data: data.url, mime: data.mime || files[0].type, filename: data.filename || files[0].name }];
      } else {
        converted = await Promise.all(files.map(async (file) => ({
          data: await fileToBase64(file), mime: file.type, filename: file.name,
        })));
      }
      setForm((current) => ({
        ...current,
        media_gallery: wantsVideo ? converted : [...current.media_gallery, ...converted],
      }));
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o arquivo. Tente novamente.');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleFileChange(event) {
    await addMediaFiles(event.target.files);
    event.target.value = '';
  }

  function handleUploadDragEnter(event) {
    event.preventDefault(); event.stopPropagation(); uploadDragDepthRef.current += 1; setIsUploadDropActive(true);
  }
  function handleUploadDragOver(event) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; }
  function handleUploadDragLeave(event) {
    event.preventDefault(); event.stopPropagation(); uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1);
    if (uploadDragDepthRef.current === 0) setIsUploadDropActive(false);
  }
  async function handleUploadDrop(event) {
    event.preventDefault(); event.stopPropagation(); uploadDragDepthRef.current = 0; setIsUploadDropActive(false);
    await addMediaFiles(event.dataTransfer.files);
  }

  function removeMedia(index) {
    setForm((current) => ({
      ...current,
      media_gallery: current.media_gallery.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function moveMedia(fromIndex, toIndex) {
    setForm((current) => {
      if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= current.media_gallery.length
        || toIndex >= current.media_gallery.length
      ) return current;

      const nextGallery = [...current.media_gallery];
      const [moved] = nextGallery.splice(fromIndex, 1);
      nextGallery.splice(toIndex, 0, moved);
      return { ...current, media_gallery: nextGallery };
    });
  }

  function handleMediaDragStart(event, index) {
    draggedMediaIndexRef.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function handleMediaDrop(event, targetIndex) {
    event.preventDefault();
    const storedIndex = Number(event.dataTransfer.getData('text/plain'));
    const sourceIndex = Number.isInteger(storedIndex) ? storedIndex : draggedMediaIndexRef.current;
    if (Number.isInteger(sourceIndex)) moveMedia(sourceIndex, targetIndex);
    draggedMediaIndexRef.current = null;
  }

  async function persistPost() {
    setError('');

    if (!form.client_id || !form.title.trim()) {
      setError('Selecione o cliente e informe um título.');
      return false;
    }

    if (requireSchedule && !form.scheduled_at) {
      setError('Informe a data e o horário para que a publicação apareça no Feed.');
      return false;
    }

    setSaving(true);
    try {
      const firstMedia = form.media_gallery[0] || null;
      const payload = {
        ...form,
        client_id: Number(form.client_id),
        title: form.title.trim(),
        media_data: firstMedia?.data || null,
        media_mime: firstMedia?.mime || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      };

      if (isEditing) {
        await api.put(`/posts/${post.id}`, payload);
        return post.id;
      } else {
        const { data } = await api.post('/posts', payload);
        return data.id;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar o conteúdo.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const savedId = await persistPost();
    if (savedId) onSaved?.();
  }

  async function handleRequestClose() {
    if (!isEditing || !formChanged(initialFormRef.current, form)) {
      onClose();
      return;
    }

    const savedId = await persistPost();
    if (savedId) onSaved?.();
  }


  async function publishInstagramNow() {
    if (!instagramConnection || instagramConnection.status !== 'connected') return setError('Conecte o Instagram profissional deste cliente primeiro.');
    setPublicationAction('publish'); setError('');
    try {
      const postId = await persistPost();
      if (!postId) return;
      await api.post(`/posts/${postId}/publish-instagram`);
      onSaved?.();
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível publicar no Instagram.'); }
    finally { setPublicationAction(''); }
  }

  async function scheduleInstagram() {
    if (!instagramConnection || instagramConnection.status !== 'connected') return setError('Conecte o Instagram profissional deste cliente primeiro.');
    if (!form.scheduled_at) return setError('Escolha a data e o horário para agendar.');
    setPublicationAction('schedule'); setError('');
    try {
      const postId = await persistPost();
      if (!postId) return;
      await api.post(`/posts/${postId}/schedule-instagram`, { scheduled_at: new Date(form.scheduled_at).toISOString() });
      onSaved?.();
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível agendar no Instagram.'); }
    finally { setPublicationAction(''); }
  }

  const selectedClient = clients.find((client) => String(client.id) === String(form.client_id));

  return (
    <ModalBackdrop onClose={handleRequestClose} disabled={saving} className="z-[60]">
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto overflow-x-hidden min-w-0"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Editar conteúdo' : 'Novo conteúdo'}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="font-semibold text-slate-800">
              {isEditing ? 'Editar conteúdo' : 'Novo conteúdo'}
            </h2>
            {isEditing && <p className="text-xs text-slate-400 mt-0.5">As alterações aparecem imediatamente na aprovação e no feed.</p>}
          </div>
          <button onClick={handleRequestClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6 p-6 min-w-0 max-w-full">
          <form onSubmit={handleSubmit} className="space-y-4 min-w-0 max-w-full">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Cliente</label>
              {lockClient ? (
                <div className="input-field flex items-center bg-slate-50 text-slate-700">
                  {selectedClient?.name || 'Cliente selecionado na barra lateral'}
                </div>
              ) : (
                <select
                  className="input-field"
                  value={form.client_id}
                  onChange={(event) => setForm({ ...form, client_id: event.target.value })}
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Título / referência interna</label>
              <input
                className="input-field"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Ex: Post institucional - dia das mães"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">{form.content_type === 'reels' ? 'Vídeo do Reel' : 'Imagens do conteúdo'}</label>
              <label
                onDragEnter={handleUploadDragEnter}
                onDragOver={handleUploadDragOver}
                onDragLeave={handleUploadDragLeave}
                onDrop={handleUploadDrop}
                className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition-all ${
                  isUploadDropActive
                    ? 'border-zebrazul-500 bg-zebrazul-50 text-zebrazul-700 shadow-sm'
                    : 'border-slate-300 text-slate-500 hover:border-zebrazul-400 hover:bg-slate-50'
                }`}
              >
                {form.content_type === 'reels' ? <Video size={20} /> : <ImagePlus size={20} />}
                <span className="font-medium">
                  {isUploadDropActive ? (form.content_type === 'reels' ? 'Solte o vídeo aqui' : 'Solte as imagens aqui') : (form.content_type === 'reels' ? 'Arraste o vídeo para cá' : 'Arraste as imagens para cá')}
                </span>
                <span className="text-xs text-slate-400">ou clique para escolher no computador</span>
                <input type="file" accept={form.content_type === 'reels' ? 'video/mp4,video/webm,video/quicktime,video/x-m4v' : 'image/*'} multiple={form.content_type !== 'reels'} className="hidden" onChange={handleFileChange} disabled={uploadingMedia} />
              </label>
              {form.media_gallery.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {form.media_gallery.map((item, index) => (
                    <div
                      key={`${item.filename || item.data?.slice(-24) || 'imagem'}-${index}`}
                      draggable
                      onDragStart={(event) => handleMediaDragStart(event, index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleMediaDrop(event, index)}
                      className="relative aspect-[4/5] cursor-grab overflow-hidden rounded-lg bg-slate-100 shadow-sm group active:cursor-grabbing"
                    >
                      {item.mime?.startsWith('video/') ? <video src={item.data} className="w-full h-full object-cover bg-black" muted playsInline /> : <img src={item.data} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />}
                      <span className="absolute left-1.5 top-1.5 flex h-7 items-center gap-1 rounded-full bg-slate-950/70 px-2 text-[10px] font-semibold text-white">
                        <GripVertical size={12} /> {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMedia(index)}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/95 text-red-600 shadow flex items-center justify-center opacity-90 hover:opacity-100"
                        title="Remover imagem"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveMedia(index, index - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Mover slide ${index + 1} para a esquerda`}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={index === form.media_gallery.length - 1}
                          onClick={() => moveMedia(index, index + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Mover slide ${index + 1} para a direita`}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">{form.content_type === 'reels' ? (uploadingMedia ? 'Enviando vídeo...' : 'MP4, WebM, MOV ou M4V, até 80 MB. O vídeo fica armazenado fora do banco de dados.') : 'Arraste as imagens ou use as setas para mudar a ordem. A primeira será a capa na grade.'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Legenda</label>
              <textarea
                className="input-field min-h-[120px]"
                value={form.caption}
                onChange={(event) => setForm({ ...form, caption: event.target.value })}
                placeholder="Escreva a legenda com CTA e hashtags..."
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Formato</label>
                <select
                  className="input-field"
                  value={form.content_type}
                  onChange={(event) => setForm({ ...form, content_type: event.target.value })}
                >
                  {CONTENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Data/hora agendada{requireSchedule ? ' *' : ''}</label>
                <input
                  type="datetime-local"
                  required={requireSchedule}
                  className="input-field"
                  value={form.scheduled_at}
                  onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Plataformas</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((platform) => (
                  <button
                    type="button"
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.platforms.includes(platform)
                        ? 'bg-zebrazul-600 text-white border-zebrazul-600'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {platform}
                  </button>
                ))}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${instagramConnection?.status === 'connected' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${instagramConnection?.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-pink-600'}`}><Instagram size={19} /></span>
                  <div className="min-w-0">
                    <strong className="block text-sm text-slate-800">Instagram</strong>
                    <span className="block truncate text-xs text-slate-500">{instagramConnection?.status === 'connected' ? `@${instagramConnection.username || 'conta conectada'} • conectado` : 'Conecte uma vez para publicar e agendar pelo ZebraHub'}</span>
                  </div>
                </div>
                {instagramConnection?.status !== 'connected' && <button type="button" onClick={connectInstagram} disabled={instagramLoading} className="btn-secondary shrink-0 text-xs">{instagramLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />} {instagramLoading ? 'Abrindo...' : 'Conectar'}</button>}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Status</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {(isEditing ? STATUS_OPTIONS : STATUS_OPTIONS.slice(0, 2)).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
              form.is_pinned
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}>
              <input
                type="checkbox"
                checked={Boolean(form.is_pinned)}
                onChange={(event) => setForm({ ...form, is_pinned: event.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                form.is_pinned ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 text-slate-400'
              }`}>
                <Pin size={16} />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-slate-800">Fixar no topo do feed</strong>
                <small className="mt-0.5 block text-xs leading-5 text-slate-500">O post aparece antes dos demais, independentemente da data agendada.</small>
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-2 pt-2">
              {form.platforms.includes('instagram') && form.content_type !== 'story' && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={scheduleInstagram} disabled={saving || Boolean(publicationAction)} className="btn-secondary flex items-center justify-center gap-2"><CalendarClock size={16} /> {publicationAction === 'schedule' ? 'Agendando...' : 'Agendar no Instagram'}</button>
                  <button type="button" onClick={publishInstagramNow} disabled={saving || Boolean(publicationAction)} className="btn-primary flex items-center justify-center gap-2"><Send size={16} /> {publicationAction === 'publish' ? 'Publicando...' : 'Publicar agora'}</button>
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={saving || Boolean(publicationAction)} className="btn-secondary flex-1">{saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar rascunho'}</button>
              </div>
            </div>
          </form>

          <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-start min-w-0 max-w-full overflow-hidden">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-3 self-start">Prévia do Instagram</p>
            <InstagramPreview
              clientName={selectedClient?.name}
              clientUsername={selectedClient?.instagram_username}
              clientColor={selectedClient?.logo_color}
              avatarSrc={selectedClient?.avatar_data}
              images={form.media_gallery}
              caption={form.caption}
              contentType={form.content_type}
            />
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
