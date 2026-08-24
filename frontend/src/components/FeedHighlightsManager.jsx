import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../api';
import AvatarUpload from './AvatarUpload.jsx';

const EMPTY_FORM = {
  id: null,
  name: '',
  cover_data: null,
  cover_mime: null,
  visible: true,
};

export default function FeedHighlightsManager({ clientId, highlights = [], onHighlightsChange }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(null);
    setError('');
  }, [clientId]);

  async function refresh() {
    const { data } = await api.get(`/clients/${clientId}/feed-highlights`);
    onHighlightsChange?.(data.highlights || []);
  }

  function startCreate() {
    setError('');
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(item) {
    setError('');
    setForm({
      id: item.id,
      name: item.name || '',
      cover_data: item.cover_data || null,
      cover_mime: item.cover_mime || null,
      visible: Number(item.visible ?? 1) !== 0,
    });
  }

  async function save() {
    const name = String(form?.name || '').trim();
    if (!name) {
      setError('Informe o nome do destaque.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        cover_data: form.cover_data,
        cover_mime: form.cover_mime,
        visible: form.visible ? 1 : 0,
      };
      if (form.id) await api.put(`/clients/${clientId}/feed-highlights/${form.id}`, payload);
      else await api.post(`/clients/${clientId}/feed-highlights`, payload);
      await refresh();
      setForm(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o destaque.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(item) {
    setBusyId(item.id);
    setError('');
    try {
      await api.put(`/clients/${clientId}/feed-highlights/${item.id}`, {
        visible: Number(item.visible ?? 1) === 0 ? 1 : 0,
      });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível alterar a visibilidade.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Excluir o destaque “${item.name}”?`)) return;
    setBusyId(item.id);
    setError('');
    try {
      await api.delete(`/clients/${clientId}/feed-highlights/${item.id}`);
      await refresh();
      if (form?.id === item.id) setForm(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir o destaque.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(item, direction) {
    const index = highlights.findIndex((highlight) => String(highlight.id) === String(item.id));
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= highlights.length) return;
    const ordered = [...highlights];
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    onHighlightsChange?.(ordered);
    setBusyId(item.id);
    setError('');
    try {
      await api.put(`/clients/${clientId}/feed-highlights/reorder`, { ids: ordered.map((highlight) => highlight.id) });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível reorganizar os destaques.');
      await refresh().catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-800">Destaques do perfil</h3>
          <p className="mt-1 text-sm text-slate-500">Escolha a capa, o nome e a ordem em que aparecem na prévia do Instagram.</p>
        </div>
        <button type="button" onClick={startCreate} className="btn-secondary inline-flex items-center justify-center gap-2">
          <Plus size={16} /> Novo destaque
        </button>
      </div>

      {highlights.length > 0 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {highlights.map((item, index) => {
            const hidden = Number(item.visible ?? 1) === 0;
            const busy = String(busyId) === String(item.id);
            return (
              <div key={item.id} className={`w-[142px] shrink-0 rounded-2xl border p-3 ${hidden ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
                <div className="mx-auto h-[70px] w-[70px] overflow-hidden rounded-full border-[3px] border-slate-200 bg-slate-100">
                  {item.cover_data ? (
                    <img src={item.cover_data} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-400">{item.name?.[0]?.toUpperCase() || '?'}</div>
                  )}
                </div>
                <p className="mt-2 truncate text-center text-xs font-bold text-slate-800" title={item.name}>{item.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => move(item, -1)} disabled={busy || index === 0} className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="Mover para a esquerda"><ChevronLeft size={15} /></button>
                  <button type="button" onClick={() => move(item, 1)} disabled={busy || index === highlights.length - 1} className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="Mover para a direita"><ChevronRight size={15} /></button>
                  <button type="button" onClick={() => startEdit(item)} disabled={busy} className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Editar"><Pencil size={14} /></button>
                  <button type="button" onClick={() => toggleVisible(item)} disabled={busy} className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title={hidden ? 'Mostrar' : 'Ocultar'}>{hidden ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                </div>
                <button type="button" onClick={() => remove(item)} disabled={busy} className="mt-1 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Excluir
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-7 text-center text-sm text-slate-400">
          Nenhum destaque criado ainda.
        </div>
      )}

      {form && (
        <div className="mt-4 rounded-2xl border border-zebrazul-100 bg-zebrazul-50/40 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <AvatarUpload
              imageSrc={form.cover_data}
              fallbackText={form.name || 'D'}
              fallbackColor="#64748b"
              size={88}
              onChange={(data, mime) => setForm((current) => ({ ...current, cover_data: data, cover_mime: mime }))}
            />
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700">Nome do destaque</label>
              <input
                className="input-field"
                value={form.name}
                maxLength={40}
                placeholder="Ex.: Portfólio"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-400">Clique no círculo para escolher a foto de capa.</p>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.visible} onChange={(event) => setForm((current) => ({ ...current, visible: event.target.checked }))} />
            Mostrar este destaque no perfil
          </label>

          {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setForm(null)} disabled={saving} className="btn-secondary flex-1">Cancelar</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : form.id ? 'Salvar destaque' : 'Criar destaque'}</button>
          </div>
        </div>
      )}

      {!form && error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
