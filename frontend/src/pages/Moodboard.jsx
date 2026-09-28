import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Check, ExternalLink, FileText, GripVertical, Image as ImageIcon,
  Link2, MoreHorizontal, Palette, Pencil, Plus, Save, Sparkles, Trash2, Upload, X
} from 'lucide-react';
import api from '../api';
import TopbarPortal from '../components/TopbarPortal.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const CATEGORIES = ['Geral', 'Layout', 'Fotografia', 'Tipografia', 'Cores', 'Ilustração', 'Motion', 'Não fazer'];
const ITEM_TYPES = [
  { key: 'image', label: 'Imagem', icon: ImageIcon },
  { key: 'link', label: 'Link', icon: Link2 },
  { key: 'text', label: 'Texto', icon: FileText },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Abrir referência';
  }
}

function DesignerNav() {
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition';
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <NavLink to="/designer" end className={({ isActive }) => `${base} ${isActive ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>Demandas</NavLink>
      <NavLink to="/designer/moodboard" className={({ isActive }) => `${base} ${isActive ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>Moodboard</NavLink>
    </div>
  );
}

function EmptyClientState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Palette size={22} /></div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um cliente no topo</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">O Moodboard pertence ao cliente. Ao selecionar um cliente, você verá as referências, coleções e a direção criativa dele.</p>
    </div>
  );
}

function DirectionPanel({ profile, onSave, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  async function submit() {
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const blocks = [
    { key: 'concept', label: 'Conceito', placeholder: 'Ex.: luxo silencioso, urbano, leve...' },
    { key: 'feeling', label: 'Sensação', placeholder: 'Ex.: intimista, tecnológico, sofisticado...' },
    { key: 'avoid_notes', label: 'Evitar', placeholder: 'Ex.: excesso de elementos, estética genérica...' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Direção do Moodboard</p>
          <p className="mt-1 text-sm text-slate-500">O que o designer precisa sentir antes de começar.</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {editing ? <X size={14} /> : <Pencil size={14} />}{editing ? 'Cancelar' : 'Editar direção'}
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {blocks.map((block) => (
          <div key={block.key} className="min-w-0 rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{block.label}</p>
            {editing ? (
              <textarea
                value={form[block.key] || ''}
                onChange={(event) => setForm((current) => ({ ...current, [block.key]: event.target.value }))}
                placeholder={block.placeholder}
                className="mt-2 min-h-[96px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{profile[block.key] || <span className="text-slate-400">Ainda não definido.</span>}</p>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={saving} onClick={submit} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Save size={15} /> {saving ? 'Salvando...' : 'Salvar direção'}
          </button>
        </div>
      )}
    </section>
  );
}

function ReferenceModal({ item, collectionId, onClose, onSave }) {
  const [form, setForm] = useState({
    item_type: item?.item_type || 'image',
    category: item?.category || 'Geral',
    title: item?.title || '',
    note: item?.note || '',
    source_url: item?.source_url || '',
    text_content: item?.text_content || '',
    media_data: '',
    media_mime: '',
    media_name: '',
  });
  const [preview, setPreview] = useState(item?.media_url || (item?.item_type === 'image' ? item?.source_url : '') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function useFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setError('Escolha um arquivo de imagem.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 10 MB.');
      return;
    }
    const data = await fileToBase64(file);
    setPreview(data);
    setForm((current) => ({ ...current, item_type: 'image', media_data: data, media_mime: file.type || 'image/jpeg', media_name: file.name || 'imagem' }));
    setError('');
  }

  async function handlePaste(event) {
    const image = Array.from(event.clipboardData?.items || []).find((entry) => entry.type?.startsWith('image/'));
    const file = image?.getAsFile?.();
    if (file) {
      event.preventDefault();
      await useFile(file);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, collection_id: collectionId });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a referência.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={() => !saving && onClose()} className="z-[70]">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">{item ? 'Editar referência' : 'Adicionar referência'}</h2>
            <p className="mt-0.5 text-xs text-slate-400">Imagem, link ou bloco de texto.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-2">
            {ITEM_TYPES.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setForm((current) => ({ ...current, item_type: key }))} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${form.item_type === key ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          {form.item_type === 'image' && (
            <div className="space-y-3">
              <button type="button" onClick={() => fileRef.current?.click()} onPaste={handlePaste} className="group flex min-h-44 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center hover:border-blue-300 hover:bg-blue-50/40">
                {preview ? <img src={preview} alt="Prévia" className="max-h-72 w-full object-contain" /> : <><Upload size={24} className="text-slate-400" /><span className="mt-2 text-sm font-semibold text-slate-600">Clique para enviar ou cole uma imagem aqui</span><span className="mt-1 text-xs text-slate-400">PNG, JPG ou WEBP · até 10 MB</span></>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => useFile(event.target.files?.[0])} />
              <div>
                <label className="text-xs font-semibold text-slate-600">Ou use um link de imagem</label>
                <input value={form.source_url} onChange={(event) => { setForm((current) => ({ ...current, source_url: event.target.value })); if (!form.media_data) setPreview(event.target.value); }} placeholder="https://..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          )}

          {form.item_type === 'link' && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Link da referência</label>
              <input value={form.source_url} onChange={(event) => setForm((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://pinterest.com/..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
            </div>
          )}

          {form.item_type === 'text' && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Texto da referência</label>
              <textarea value={form.text_content} onChange={(event) => setForm((current) => ({ ...current, text_content: event.target.value }))} placeholder="Escreva uma direção, ideia, frase ou observação..." className="mt-1.5 min-h-36 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-600">Categoria</label>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Título <span className="font-normal text-slate-400">(opcional)</span></label>
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Luz e enquadramento" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Por que essa referência está aqui?</label>
            <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Ex.: aproveitar luz natural, enquadramento lateral e espaço negativo. Não copiar a paleta." className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </div>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Check size={15} /> {saving ? 'Salvando...' : 'Salvar referência'}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

function CollectionModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave(title.trim());
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar a coleção.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} className="z-[70]">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-semibold text-slate-900">Nova coleção</h2><p className="mt-1 text-xs text-slate-400">Separe referências por campanha, produto ou direção.</p></div>
          <button type="button" onClick={onClose} className="text-slate-400"><X size={18} /></button>
        </div>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Campanha 2027" className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button><button disabled={saving || !title.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Criando...' : 'Criar coleção'}</button></div>
      </form>
    </ModalBackdrop>
  );
}

function ReferenceCard({ item, canEdit, onEdit, onDelete, onDragStart, onDrop, onMove }) {
  const imageSrc = item.media_url || (item.item_type === 'image' ? item.source_url : '');
  const danger = item.category === 'Não fazer';
  return (
    <article
      draggable={canEdit}
      onDragStart={(event) => onDragStart?.(event, item.id)}
      onDragOver={(event) => canEdit && event.preventDefault()}
      onDrop={(event) => { if (canEdit) { event.preventDefault(); onDrop?.(event, item.id); } }}
      className={`group mb-4 break-inside-avoid overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg ${danger ? 'border-rose-200' : 'border-slate-200'}`}
    >
      {item.item_type === 'image' && imageSrc && <img src={imageSrc} alt={item.title || 'Referência visual'} className="max-h-[520px] w-full bg-slate-100 object-cover" />}
      {item.item_type === 'link' && (
        <a href={item.source_url} target="_blank" rel="noreferrer" className="flex min-h-32 flex-col justify-between bg-slate-950 p-4 text-white">
          <Link2 size={20} className="text-slate-400" />
          <div className="mt-8"><p className="line-clamp-2 text-base font-semibold">{item.title || hostLabel(item.source_url)}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-400">{hostLabel(item.source_url)} <ExternalLink size={11} /></p></div>
        </a>
      )}
      {item.item_type === 'text' && <div className="bg-[#fffdf4] px-5 py-6"><p className="whitespace-pre-wrap text-[15px] font-medium leading-7 text-slate-800">{item.text_content}</p></div>}

      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${danger ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.category}</span>
            {item.title && item.item_type !== 'link' && <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.title}</h3>}
          </div>
          {canEdit && <GripVertical size={16} className="mt-1 shrink-0 cursor-grab text-slate-300" />}
        </div>
        {item.note && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-500">{item.note}</p>}
        {item.source_url && item.item_type === 'image' && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><ExternalLink size={12} /> Ver origem</a>}
        {canEdit && (
          <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => onMove(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Mover para cima"><ArrowUp size={14} /></button>
            <button type="button" onClick={() => onMove(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Mover para baixo"><ArrowDown size={14} /></button>
            <div className="flex-1" />
            <button type="button" onClick={() => onEdit(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar"><Pencil size={14} /></button>
            <button type="button" onClick={() => onDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function Moodboard() {
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const canEdit = user?.role !== 'client' && hasPermission(user, 'tasks.create');
  const clientId = selectedClient?.id ? Number(selectedClient.id) : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({ concept: '', feeling: '', avoid_notes: '' });
  const [collections, setCollections] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [category, setCategory] = useState('Todos');
  const [showReference, setShowReference] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showCollection, setShowCollection] = useState(false);
  const [collectionMenu, setCollectionMenu] = useState(false);
  const [draggedId, setDraggedId] = useState(null);

  const loadBoard = useCallback(async () => {
    if (!clientId) {
      setCollections([]); setItems([]); setActiveCollectionId(null); setProfile({ concept: '', feeling: '', avoid_notes: '' });
      return;
    }
    setLoading(true); setError('');
    try {
      const response = await api.get('/moodboards', { params: { client_id: clientId } });
      setProfile(response.data.profile || { concept: '', feeling: '', avoid_notes: '' });
      setCollections(response.data.collections || []);
      setItems(response.data.items || []);
      setActiveCollectionId((current) => {
        const valid = (response.data.collections || []).some((collection) => Number(collection.id) === Number(current));
        return valid ? current : (response.data.collections?.[0]?.id || null);
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o Moodboard.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const activeCollection = collections.find((collection) => Number(collection.id) === Number(activeCollectionId));
  const collectionItems = useMemo(() => items.filter((item) => Number(item.collection_id) === Number(activeCollectionId)).sort((a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id)), [items, activeCollectionId]);
  const visibleItems = useMemo(() => category === 'Todos' ? collectionItems : collectionItems.filter((item) => item.category === category), [collectionItems, category]);

  async function saveProfile(next) {
    const response = await api.put('/moodboards/profile', { client_id: clientId, ...next });
    setProfile(response.data.profile || next);
  }

  async function saveReference(payload) {
    if (editingItem) await api.put(`/moodboards/items/${editingItem.id}`, payload);
    else await api.post('/moodboards/items', { client_id: clientId, ...payload });
    await loadBoard();
    setEditingItem(null);
  }

  async function createCollection(title) {
    const response = await api.post('/moodboards/collections', { client_id: clientId, title });
    await loadBoard();
    setActiveCollectionId(response.data.collection?.id || null);
  }

  async function deleteCollection() {
    if (!activeCollection || collections.length <= 1) return;
    const ok = window.confirm(`Excluir a coleção “${activeCollection.title}” e todas as referências dela?`);
    if (!ok) return;
    try {
      await api.delete(`/moodboards/collections/${activeCollection.id}`);
      setCollectionMenu(false);
      await loadBoard();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir a coleção.');
    }
  }

  async function deleteItem(item) {
    if (!window.confirm('Excluir esta referência do Moodboard?')) return;
    await api.delete(`/moodboards/items/${item.id}`);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  async function persistOrder(next) {
    const orderedIds = next.map((entry) => entry.id);
    setItems((current) => {
      const positions = new Map(orderedIds.map((id, index) => [Number(id), index]));
      return current.map((entry) => Number(entry.collection_id) === Number(activeCollectionId) && positions.has(Number(entry.id)) ? { ...entry, position: positions.get(Number(entry.id)) } : entry);
    });
    await api.put('/moodboards/items/reorder', { client_id: clientId, collection_id: activeCollectionId, item_ids: orderedIds });
  }

  async function moveItem(id, delta) {
    if (category !== 'Todos') setCategory('Todos');
    const current = [...collectionItems];
    const index = current.findIndex((entry) => Number(entry.id) === Number(id));
    const target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    await persistOrder(current);
  }

  function handleDrop(_event, targetId) {
    if (!draggedId || Number(draggedId) === Number(targetId) || category !== 'Todos') return;
    const current = [...collectionItems];
    const from = current.findIndex((entry) => Number(entry.id) === Number(draggedId));
    const to = current.findIndex((entry) => Number(entry.id) === Number(targetId));
    if (from < 0 || to < 0) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    setDraggedId(null);
    persistOrder(current).catch(() => loadBoard());
  }

  return (
    <div className="space-y-4">
      <TopbarPortal><DesignerNav /></TopbarPortal>

      {!clientId ? <EmptyClientState /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Sparkles size={16} className="text-blue-600" /><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Direção criativa</p></div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Moodboard · {selectedClient?.name || 'Cliente'}</h1>
              <p className="mt-1 text-sm text-slate-500">Referências visuais organizadas para o designer entender a intenção, não apenas copiar a aparência.</p>
            </div>
            {canEdit && <button type="button" onClick={() => { setEditingItem(null); setShowReference(true); }} disabled={!activeCollectionId} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={16} /> Adicionar referência</button>}
          </div>

          <DirectionPanel profile={profile} onSave={saveProfile} canEdit={canEdit} />

          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                {collections.map((collection) => (
                  <button key={collection.id} type="button" onClick={() => { setActiveCollectionId(collection.id); setCategory('Todos'); setCollectionMenu(false); }} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${Number(collection.id) === Number(activeCollectionId) ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {collection.title} <span className="ml-1 opacity-60">{collection.item_count || 0}</span>
                  </button>
                ))}
                {canEdit && <button type="button" onClick={() => setShowCollection(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600"><Plus size={13} /> Coleção</button>}
                {canEdit && activeCollection && collections.length > 1 && (
                  <div className="relative">
                    <button type="button" onClick={() => setCollectionMenu((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50"><MoreHorizontal size={16} /></button>
                    {collectionMenu && <div className="absolute left-0 top-11 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" onClick={deleteCollection} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Excluir coleção</button></div>}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {['Todos', ...CATEGORIES].map((filter) => (
                  <button key={filter} type="button" onClick={() => setCategory(filter)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${category === filter ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>{filter}</button>
                ))}
              </div>
            </div>
          </section>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white py-20 text-center text-sm text-slate-400">Carregando Moodboard...</div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><ImageIcon size={22} /></div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{category === 'Todos' ? 'Essa coleção ainda está vazia' : `Nenhuma referência em “${category}”`}</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Adicione imagens, links ou textos e explique o que o designer deve aproveitar em cada referência.</p>
              {canEdit && category === 'Todos' && <button type="button" onClick={() => setShowReference(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Primeira referência</button>}
            </div>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
              {visibleItems.map((item) => (
                <ReferenceCard key={item.id} item={item} canEdit={canEdit} onEdit={(entry) => { setEditingItem(entry); setShowReference(true); }} onDelete={deleteItem} onDragStart={(_event, id) => setDraggedId(id)} onDrop={handleDrop} onMove={moveItem} />
              ))}
            </div>
          )}
        </>
      )}

      {showReference && activeCollectionId && <ReferenceModal item={editingItem} collectionId={activeCollectionId} onClose={() => { setShowReference(false); setEditingItem(null); }} onSave={saveReference} />}
      {showCollection && <CollectionModal onClose={() => setShowCollection(false)} onSave={createCollection} />}
    </div>
  );
}
