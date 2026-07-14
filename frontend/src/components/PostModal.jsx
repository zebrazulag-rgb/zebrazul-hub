import { useState, useEffect } from 'react';
import { X, ImagePlus } from 'lucide-react';
import api from '../api';
import InstagramPreview from './InstagramPreview.jsx';

const PLATFORM_OPTIONS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
const CONTENT_TYPES = ['feed', 'reels', 'story', 'carrossel', 'artigo'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PostModal({ clients, defaultClientId, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: defaultClientId || '',
    title: '',
    caption: '',
    content_type: 'feed',
    platforms: ['instagram'],
    scheduled_at: '',
    status: 'draft',
    media_data: '',
    media_mime: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultClientId) setForm((f) => ({ ...f, client_id: defaultClientId }));
  }, [defaultClientId]);

  function togglePlatform(p) {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p]
    }));
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Imagem muito grande — envie um arquivo de até 8MB.');
      return;
    }
    const dataUrl = await fileToBase64(file);
    setForm((f) => ({ ...f, media_data: dataUrl, media_mime: file.type }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.client_id || !form.title) {
      setError('Selecione o cliente e informe um título.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/posts', {
        ...form,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar o conteúdo.');
    } finally {
      setSaving(false);
    }
  }

  const selectedClient = clients.find((c) => String(c.id) === String(form.client_id));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-slate-800">Novo conteúdo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
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
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Título / referência interna</label>
              <input
                className="input-field"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Post institucional - dia das mães"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Imagem do post</label>
              <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-4 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                <ImagePlus size={18} />
                {form.media_data ? 'Trocar imagem' : 'Clique para anexar uma imagem'}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Legenda</label>
              <textarea
                className="input-field min-h-[110px]"
                value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
                placeholder="Escreva a legenda com CTA e hashtags..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Formato</label>
                <select
                  className="input-field"
                  value={form.content_type}
                  onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                >
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Data/hora agendada</label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Plataformas</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.platforms.includes(p)
                        ? 'bg-zebrazul-600 text-white border-zebrazul-600'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Status inicial</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="draft">Rascunho</option>
                <option value="pending_approval">Enviar para aprovação do cliente</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar conteúdo'}
              </button>
            </div>
          </form>

          <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-start min-w-0 max-w-full overflow-hidden">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-3 self-start">Prévia do Instagram</p>
            <InstagramPreview
              clientName={selectedClient?.name}
              clientColor={selectedClient?.logo_color}
              imageSrc={form.media_data}
              caption={form.caption}
              contentType={form.content_type}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
