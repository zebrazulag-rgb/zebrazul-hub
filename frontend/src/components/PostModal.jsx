import { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Trash2 } from 'lucide-react';
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
    media_gallery: parseGallery(post),
  };
}

export default function PostModal({ clients, defaultClientId, post, onClose, onSaved }) {
  const isEditing = Boolean(post?.id);
  const [form, setForm] = useState(() => postToForm(post, defaultClientId));
  const initialFormRef = useRef(postToForm(post, defaultClientId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextForm = postToForm(post, defaultClientId);
    initialFormRef.current = nextForm;
    setForm(nextForm);
  }, [post, defaultClientId]);


  function togglePlatform(platform) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform],
    }));
  }

  async function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const tooLarge = files.find((file) => file.size > 8 * 1024 * 1024);
    if (tooLarge) {
      setError(`A imagem “${tooLarge.name}” ultrapassa 8MB.`);
      event.target.value = '';
      return;
    }

    const converted = await Promise.all(files.map(async (file) => ({
      data: await fileToBase64(file),
      mime: file.type,
      filename: file.name,
    })));

    setForm((current) => ({
      ...current,
      media_gallery: [...current.media_gallery, ...converted],
    }));
    setError('');
    event.target.value = '';
  }

  function removeMedia(index) {
    setForm((current) => ({
      ...current,
      media_gallery: current.media_gallery.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function persistPost() {
    setError('');

    if (!form.client_id || !form.title.trim()) {
      setError('Selecione o cliente e informe um título.');
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
      } else {
        await api.post('/posts', payload);
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar o conteúdo.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const saved = await persistPost();
    if (saved) onSaved?.();
  }

  async function handleRequestClose() {
    if (!isEditing || !formChanged(initialFormRef.current, form)) {
      onClose();
      return;
    }

    const saved = await persistPost();
    if (saved) onSaved?.();
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
              <label className="text-sm font-medium text-slate-700 block mb-1">Imagens do conteúdo</label>
              <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-4 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                <ImagePlus size={18} />
                Adicionar uma ou mais imagens
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              </label>
              {form.media_gallery.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {form.media_gallery.map((item, index) => (
                    <div key={`${item.filename || 'imagem'}-${index}`} className="relative aspect-[4/5] rounded-lg overflow-hidden bg-slate-100 group">
                      <img src={item.data} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeMedia(index)}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/95 text-red-600 shadow flex items-center justify-center opacity-90 hover:opacity-100"
                        title="Remover imagem"
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white rounded-full px-2 py-0.5 text-[10px]">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">A primeira imagem será usada como capa na grade.</p>
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
                <label className="text-sm font-medium text-slate-700 block mb-1">Data/hora agendada</label>
                <input
                  type="datetime-local"
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar conteúdo'}
              </button>
            </div>
          </form>

          <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-start min-w-0 max-w-full overflow-hidden">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-3 self-start">Prévia do Instagram</p>
            <InstagramPreview
              clientName={selectedClient?.name}
              clientColor={selectedClient?.logo_color}
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
