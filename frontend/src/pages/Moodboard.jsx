import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ExternalLink, Frame, Hand, Image as ImageIcon, Link2, Maximize2, Minus, MousePointer2,
  ArrowRight, Circle, Copy, Move, Palette, Pencil, Plus, Presentation, Save, Shapes, Square, StickyNote, Trash2, Triangle, Type, Upload, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const WORLD_W = 5200;
const WORLD_H = 3400;
const CATEGORIES = ['Geral', 'Layout', 'Fotografia', 'Tipografia', 'Cores', 'Ilustração', 'Motion', 'Não fazer'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Referência'; }
}

function EmptyClientState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <Palette className="mx-auto text-blue-600" size={26} />
      <h2 className="mt-3 font-bold text-slate-900">Selecione um cliente no topo</h2>
      <p className="mt-1 text-sm text-slate-500">Cada cliente possui seu próprio quadro criativo.</p>
    </div>
  );
}

function DirectionModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({ concept: profile.concept || '', feeling: profile.feeling || '', avoid_notes: profile.avoid_notes || '' });
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  }
  return (
    <ModalBackdrop onClose={onClose} className="z-[90]">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-bold text-slate-900">Direção criativa</h2><p className="text-xs text-slate-400">Um resumo rápido para orientar quem vai criar.</p></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {[['concept','Conceito','Ex.: luxo silencioso'],['feeling','Sensação','Ex.: intimista, tecnológico'],['avoid_notes','Evitar','Ex.: excesso de elementos']].map(([key,label,placeholder]) => (
            <label key={key} className="text-xs font-semibold text-slate-600">{label}
              <textarea value={form[key]} onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))} placeholder={placeholder} className="mt-2 min-h-36 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

function ItemModal({ kind, item, onClose, onSave }) {
  const type = kind === 'note' ? 'text' : (kind || item?.item_type || 'image');
  const [form, setForm] = useState({
    item_type: type,
    category: item?.category || 'Geral',
    title: item?.title || '',
    note: item?.note || '',
    source_url: item?.source_url || '',
    text_content: item?.text_content || '',
    media_data: '', media_mime: '', media_name: '',
  });
  const [preview, setPreview] = useState(item?.media_url || (item?.item_type === 'image' ? item?.source_url : '') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function useFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) return setError('Escolha uma imagem.');
    if (file.size > 10 * 1024 * 1024) return setError('A imagem deve ter no máximo 10 MB.');
    const data = await fileToBase64(file);
    setPreview(data);
    setForm((c) => ({ ...c, item_type: 'image', media_data: data, media_mime: file.type || 'image/jpeg', media_name: file.name || 'imagem' }));
  }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await onSave(form, kind); onClose(); } catch (err) { setError(err.response?.data?.error || 'Não foi possível salvar.'); } finally { setSaving(false); }
  }

  const label = kind === 'note' ? 'Post-it' : type === 'image' ? 'Imagem' : type === 'link' ? 'Link' : 'Texto';
  return (
    <ModalBackdrop onClose={onClose} className="z-[90]">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">{item ? 'Editar' : 'Adicionar'} {label}</h2><p className="text-xs text-slate-400">Vai direto para o quadro.</p></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button></div>
        <div className="space-y-4 p-5">
          {type === 'image' && <>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-44 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
              {preview ? <img src={preview} alt="Prévia" className="max-h-64 w-full object-contain" /> : <div className="text-center"><Upload className="mx-auto text-slate-400" size={24} /><p className="mt-2 text-sm font-semibold text-slate-600">Enviar imagem</p></div>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => useFile(e.target.files?.[0])} />
            <input value={form.source_url} onChange={(e) => { setForm((c) => ({ ...c, source_url: e.target.value })); if (!form.media_data) setPreview(e.target.value); }} placeholder="Ou cole o link da imagem" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300" />
          </>}
          {type === 'link' && <input autoFocus value={form.source_url} onChange={(e) => setForm((c) => ({ ...c, source_url: e.target.value }))} placeholder="https://instagram.com/..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300" />}
          {type === 'text' && <textarea autoFocus value={form.text_content} onChange={(e) => setForm((c) => ({ ...c, text_content: e.target.value }))} placeholder={kind === 'note' ? 'Escreva uma anotação rápida...' : 'Escreva a direção, frase ou observação...'} className="min-h-36 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-300" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Título (opcional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300" />
            <select value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-300">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <textarea value={form.note} onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))} placeholder="Por que essa referência está aqui? (opcional)" className="min-h-20 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-300" />
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Check size={15} />{saving ? 'Salvando...' : 'Adicionar ao quadro'}</button></div>
      </form>
    </ModalBackdrop>
  );
}

function BoardItem({ item, layout, selected, presentation, onSelect, onPointerDown, onResizeStart, onEdit, onDelete }) {
  const imageSrc = item.media_url || (item.item_type === 'image' ? item.source_url : '');
  const kind = layout.kind || item.item_type;
  return (
    <div
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button, a, input, textarea, select, [data-no-drag="true"]')) return;
        onPointerDown(event, item);
      }}
      onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}
      className={`absolute overflow-visible ${presentation ? '' : 'group'} ${selected && !presentation ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
      style={{ left: layout.x, top: layout.y, width: layout.w, minHeight: layout.h, zIndex: layout.z || 2 }}
    >
      <div className={`h-full w-full overflow-hidden border ${kind === 'note' ? 'border-amber-200 bg-amber-50' : kind === 'text' ? 'border-transparent bg-transparent' : 'rounded-2xl border-slate-200 bg-white shadow-sm'}`} style={{ borderRadius: kind === 'note' ? 6 : undefined }}>
        {item.item_type === 'image' && imageSrc && <img draggable={false} src={imageSrc} alt={item.title || 'Referência'} className="block h-auto w-full select-none object-cover" />}
        {item.item_type === 'link' && <a href={item.source_url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} className="flex min-h-32 flex-col justify-between bg-slate-950 p-4 text-white"><Link2 size={20} className="text-slate-400" /><div className="mt-8"><p className="text-base font-bold">{item.title || hostLabel(item.source_url)}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-400">{hostLabel(item.source_url)} <ExternalLink size={11} /></p></div></a>}
        {item.item_type === 'text' && <div className={`${kind === 'note' ? 'p-5' : 'p-2'} whitespace-pre-wrap text-[15px] font-medium leading-6 text-slate-800`}>{item.text_content}</div>}
        {(item.title || item.note || item.category !== 'Geral') && kind !== 'text' && kind !== 'note' && <div className="p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{item.category}</span>{item.title && <p className="mt-2 text-sm font-bold text-slate-900">{item.title}</p>}</div></div>{item.note && <p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>}</div>}
      </div>
      {selected && !presentation && <>
        <div data-no-drag="true" onPointerDown={(e) => e.stopPropagation()} className="absolute -top-11 right-0 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" title="Editar"><Pencil size={14} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 size={14} /></button>
        </div>
        <button type="button" onPointerDown={(e) => onResizeStart(e, item.id)} className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow" title="Redimensionar" />
      </>}
    </div>
  );
}


const SHAPE_TYPES = [
  { key: 'rectangle', label: 'Retângulo', icon: Square },
  { key: 'circle', label: 'Círculo', icon: Circle },
  { key: 'triangle', label: 'Triângulo', icon: Triangle },
  { key: 'line', label: 'Linha', icon: Minus },
  { key: 'arrow', label: 'Seta', icon: ArrowRight },
];

function shapeLabel(type) {
  return SHAPE_TYPES.find((entry) => entry.key === type)?.label || 'Forma';
}

function ShapeElement({ shape, selected, presentation, onSelect, onPointerDown, onResizeStart, onChange, onDelete, onDuplicate }) {
  const width = Math.max(12, Number(shape.w) || 120);
  const height = Math.max(12, Number(shape.h) || 90);
  const stroke = shape.stroke || '#2563eb';
  const fill = shape.fill || '#dbeafe';
  const strokeWidth = Math.max(1, Number(shape.strokeWidth) || 3);
  const isLinear = shape.type === 'line' || shape.type === 'arrow';
  const pad = Math.max(5, strokeWidth + 2);
  const x1 = shape.flipX ? width - pad : pad;
  const x2 = shape.flipX ? pad : width - pad;
  const y1 = shape.flipY ? height - pad : pad;
  const y2 = shape.flipY ? pad : height - pad;
  const lineX1 = shape.flatX ? width / 2 : x1;
  const lineX2 = shape.flatX ? width / 2 : x2;
  const lineY1 = shape.flatY ? height / 2 : y1;
  const lineY2 = shape.flatY ? height / 2 : y2;
  const markerId = `arrow-${String(shape.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button, input, select, [data-no-drag="true"]')) return;
        onPointerDown(event, shape);
      }}
      onClick={(event) => { event.stopPropagation(); onSelect(shape.id); }}
      className={`absolute overflow-visible ${presentation ? '' : 'group'} ${!presentation ? 'touch-none' : ''}`}
      style={{ left: shape.x, top: shape.y, width, height, zIndex: selected && !presentation ? 1000001 : (Number(shape.z) || 1), opacity: shape.opacity ?? 1 }}
    >
      {shape.type === 'rectangle' && <div className="h-full w-full" style={{ background: fill, border: `${strokeWidth}px solid ${stroke}`, borderRadius: Number(shape.radius) || 0 }} />}
      {shape.type === 'circle' && <div className="h-full w-full rounded-full" style={{ background: fill, border: `${strokeWidth}px solid ${stroke}` }} />}
      {shape.type === 'triangle' && (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block overflow-visible">
          <polygon points={`${width / 2},${pad} ${width - pad},${height - pad} ${pad},${height - pad}`} fill={fill === 'transparent' ? 'none' : fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {isLinear && (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block overflow-visible">
          {shape.type === 'arrow' && <defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill={stroke} /></marker></defs>}
          <line x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={shape.type === 'arrow' ? `url(#${markerId})` : undefined} />
        </svg>
      )}

      {selected && !presentation && <>
        <div className="pointer-events-none absolute -inset-1.5 rounded-md border border-dashed border-blue-500" />
        <div data-no-drag="true" onPointerDown={(e) => e.stopPropagation()} className="absolute -top-14 left-0 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {!isLinear && <>
            <label className="flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[10px] font-bold text-slate-500" title="Cor do preenchimento">
              <span>Fundo</span>
              <input type="color" value={fill === 'transparent' ? '#ffffff' : fill} onChange={(e) => onChange(shape.id, { fill: e.target.value })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
            </label>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(shape.id, { fill: fill === 'transparent' ? '#dbeafe' : 'transparent' }); }} className="h-8 rounded-lg px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100" title="Alternar preenchimento">{fill === 'transparent' ? 'Com fundo' : 'Sem fundo'}</button>
          </>}
          <label className="flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[10px] font-bold text-slate-500" title="Cor do contorno">
            <span>{isLinear ? 'Cor' : 'Borda'}</span>
            <input type="color" value={stroke} onChange={(e) => onChange(shape.id, { stroke: e.target.value })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>
          <select value={strokeWidth} onChange={(e) => onChange(shape.id, { strokeWidth: Number(e.target.value) })} className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600" title="Espessura">
            {[1,2,3,5,8,12].map((value) => <option key={value} value={value}>{value}px</option>)}
          </select>
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(shape.id, { z: 1 }); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-black text-slate-500 hover:bg-slate-100" title="Enviar para trás">↓</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(shape.id, { z: 999999 }); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-black text-slate-500 hover:bg-slate-100" title="Trazer para frente">↑</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(shape); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" title="Duplicar"><Copy size={14} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(shape.id); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 size={14} /></button>
        </div>
        <button type="button" onPointerDown={(e) => onResizeStart(e, shape.id)} className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow" title="Redimensionar" />
      </>}
    </div>
  );
}

export default function Moodboard() {
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const canEdit = user?.role !== 'client' && hasPermission(user, 'tasks.create');
  const clientId = selectedClient?.id ? Number(selectedClient.id) : null;
  const [profile, setProfile] = useState({ concept: '', feeling: '', avoid_notes: '', canvas: { version: 2, elements: {}, frames: [], shapes: [] } });
  const [collections, setCollections] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [viewport, setViewport] = useState({ x: -320, y: -180, zoom: 0.72 });
  const [presentation, setPresentation] = useState(false);
  const [directionOpen, setDirectionOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [canvas, setCanvas] = useState({ version: 2, elements: {}, frames: [], shapes: [] });
  const viewportRef = useRef(null);
  const gestureRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastPointerRef = useRef({ x: 900, y: 600 });

  const loadBoard = useCallback(async () => {
    if (!clientId) { setItems([]); setCollections([]); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/moodboards', { params: { client_id: clientId } });
      setProfile(data.profile || {}); setCollections(data.collections || []); setItems(data.items || []);
      const loadedCanvas = data.profile?.canvas || {};
      const nextCanvas = {
        version: 2,
        elements: loadedCanvas.elements && typeof loadedCanvas.elements === 'object' ? loadedCanvas.elements : {},
        frames: Array.isArray(loadedCanvas.frames) ? loadedCanvas.frames : [],
        shapes: Array.isArray(loadedCanvas.shapes) ? loadedCanvas.shapes : [],
      };
      setCanvas(nextCanvas);
      setSelectedId(null);
      setSelectedShapeId(null);
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível carregar o Moodboard.'); } finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  const defaultCollectionId = collections[0]?.id || null;

  const layoutFor = useCallback((item, index) => {
    const saved = canvas.elements?.[String(item.id)];
    if (saved) return { x: 380, y: 320, w: 280, h: 180, z: 2, kind: item.item_type, ...saved };
    const col = index % 5; const row = Math.floor(index / 5);
    return { x: 480 + col * 330, y: 420 + row * 320, w: item.item_type === 'text' ? 300 : 280, h: item.item_type === 'text' ? 150 : 220, z: 2 + index, kind: item.item_type };
  }, [canvas.elements]);

  useEffect(() => {
    if (!items.length || !clientId) return;
    const missing = items.filter((item) => !canvas.elements?.[String(item.id)]);
    if (!missing.length) return;
    setCanvas((current) => {
      const elements = { ...(current.elements || {}) };
      items.forEach((item, index) => { if (!elements[String(item.id)]) elements[String(item.id)] = layoutFor(item, index); });
      return { ...current, elements };
    });
  }, [items, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistCanvas = useCallback((nextCanvas) => {
    if (!clientId || !canEdit) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.put('/moodboards/profile', { client_id: clientId, canvas: nextCanvas }).catch(() => {});
    }, 500);
  }, [clientId, canEdit]);

  function updateCanvas(updater, persist = true) {
    setCanvas((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (persist) persistCanvas(next);
      return next;
    });
  }

  function worldPoint(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 900, y: 600 };
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom };
  }

  function centerWorldPoint() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 900, y: 600 };
    return worldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  async function saveDirection(form) {
    const { data } = await api.put('/moodboards/profile', { client_id: clientId, ...form, canvas });
    setProfile(data.profile || { ...profile, ...form });
  }

  async function saveItem(form, kind) {
    if (!defaultCollectionId) throw new Error('Coleção indisponível');
    const payload = { ...form, collection_id: defaultCollectionId };
    let saved;
    if (editingItem) {
      const { data } = await api.put(`/moodboards/items/${editingItem.id}`, payload); saved = data.item;
      setItems((current) => current.map((entry) => Number(entry.id) === Number(saved.id) ? saved : entry));
    } else {
      const { data } = await api.post('/moodboards/items', { client_id: clientId, ...payload }); saved = data.item;
      setItems((current) => [...current, saved]);
      const point = centerWorldPoint();
      updateCanvas((current) => ({ ...current, elements: { ...(current.elements || {}), [String(saved.id)]: { x: point.x - 140, y: point.y - 100, w: 280, h: kind === 'note' ? 210 : form.item_type === 'text' ? 150 : 220, z: Date.now() % 1000000, kind: kind || form.item_type } } }));
      setSelectedId(saved.id);
    }
    setEditingItem(null);
  }

  async function deleteItem(item) {
    if (!window.confirm('Excluir esta referência?')) return;
    const itemId = Number(item.id);
    const previousItems = items;

    // Remove imediatamente da tela para o comando responder no clique.
    setItems((current) => current.filter((entry) => Number(entry.id) !== itemId));
    setSelectedId(null);

    try {
      await api.delete(`/moodboards/items/${itemId}`);
      updateCanvas((current) => {
        const elements = { ...(current.elements || {}) };
        delete elements[String(itemId)];
        return { ...current, elements };
      });
    } catch (err) {
      // Se o servidor recusar, restaura a referência e mostra o motivo.
      setItems(previousItems);
      setError(err.response?.data?.error || 'Não foi possível excluir esta referência.');
    }
  }

  function addFrame() {
    if (!canEdit) return;
    const title = window.prompt('Nome do frame', 'Direção visual');
    if (!title) return;
    const p = centerWorldPoint();
    const frame = { id: `frame_${Date.now()}`, title: title.slice(0, 80), x: p.x - 300, y: p.y - 220, w: 600, h: 440, z: 0 };
    updateCanvas((current) => ({ ...current, frames: [...(current.frames || []), frame].slice(0, 100) }));
  }

  function removeFrame(id) { updateCanvas((c) => ({ ...c, frames: (c.frames || []).filter((f) => f.id !== id) })); }

  function updateShape(id, patch, persist = true) {
    updateCanvas((current) => ({
      ...current,
      shapes: (current.shapes || []).map((shape) => shape.id === id ? { ...shape, ...patch } : shape),
    }), persist);
  }

  function deleteShape(id) {
    updateCanvas((current) => ({ ...current, shapes: (current.shapes || []).filter((shape) => shape.id !== id) }));
    setSelectedShapeId((current) => current === id ? null : current);
  }

  function duplicateShape(shape) {
    const copy = { ...shape, id: `shape_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, x: Number(shape.x || 0) + 28, y: Number(shape.y || 0) + 28, z: Math.max(1, Number(shape.z) || 1) + 1 };
    updateCanvas((current) => ({ ...current, shapes: [...(current.shapes || []), copy].slice(0, 500) }));
    setSelectedId(null);
    setSelectedShapeId(copy.id);
  }

  function pointerDownShape(event, shape) {
    if (!canEdit || presentation || tool !== 'select' || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current = { type: 'move-shape', id: shape.id, startX: event.clientX, startY: event.clientY, x: Number(shape.x) || 0, y: Number(shape.y) || 0 };
    setSelectedId(null);
    setSelectedShapeId(shape.id);
  }

  function resizeStartShape(event, id) {
    event.stopPropagation(); event.preventDefault();
    const shape = (canvas.shapes || []).find((entry) => entry.id === id); if (!shape) return;
    gestureRef.current = { type: 'resize-shape', id, startX: event.clientX, startY: event.clientY, w: Math.max(12, Number(shape.w) || 120), h: Math.max(12, Number(shape.h) || 90) };
  }

  function pointerDownItem(event, item) {
    if (!canEdit || presentation || tool !== 'select' || event.button !== 0) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId);
    const layout = layoutFor(item, items.findIndex((entry) => entry.id === item.id));
    gestureRef.current = { type: 'move', id: item.id, startX: event.clientX, startY: event.clientY, x: layout.x, y: layout.y };
    setSelectedShapeId(null);
    setSelectedId(item.id);
  }

  function resizeStart(event, id) {
    event.stopPropagation(); event.preventDefault();
    const item = items.find((entry) => Number(entry.id) === Number(id)); if (!item) return;
    const layout = layoutFor(item, items.indexOf(item));
    gestureRef.current = { type: 'resize', id, startX: event.clientX, startY: event.clientY, w: layout.w, h: layout.h };
  }

  function boardPointerDown(event) {
    if (event.target !== event.currentTarget && !event.target.dataset?.canvasSurface) return;
    setSelectedId(null);
    setSelectedShapeId(null);
    setShapeMenuOpen(false);

    if (canEdit && !presentation && tool.startsWith('shape:') && event.button === 0) {
      const type = tool.split(':')[1];
      const point = worldPoint(event.clientX, event.clientY);
      const id = `shape_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const shape = {
        id, type, x: Math.round(point.x), y: Math.round(point.y), w: 24, h: 24,
        z: 999999,
        fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 3, opacity: 1,
        flipX: false, flipY: false, flatX: false, flatY: false,
      };
      setCanvas((current) => ({ ...current, shapes: [...(current.shapes || []), shape].slice(0, 500) }));
      setSelectedShapeId(id);
      gestureRef.current = { type: 'draw-shape', id, shapeType: type, startWorldX: point.x, startWorldY: point.y, startX: event.clientX, startY: event.clientY };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (tool === 'hand' || event.button === 1 || event.code === 'Space') gestureRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, x: viewport.x, y: viewport.y };
  }

  function boardPointerMove(event) {
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    const g = gestureRef.current; if (!g) return;
    if (g.type === 'pan') return setViewport((v) => ({ ...v, x: g.x + event.clientX - g.startX, y: g.y + event.clientY - g.startY }));
    const dx = (event.clientX - g.startX) / viewport.zoom; const dy = (event.clientY - g.startY) / viewport.zoom;
    if (g.type === 'move') updateCanvas((current) => ({ ...current, elements: { ...(current.elements || {}), [String(g.id)]: { ...(current.elements?.[String(g.id)] || {}), x: Math.round(g.x + dx), y: Math.round(g.y + dy) } } }), false);
    if (g.type === 'resize') updateCanvas((current) => ({ ...current, elements: { ...(current.elements || {}), [String(g.id)]: { ...(current.elements?.[String(g.id)] || {}), w: Math.max(120, Math.round(g.w + dx)), h: Math.max(80, Math.round(g.h + dy)) } } }), false);
    if (g.type === 'move-shape') updateShape(g.id, { x: Math.round(g.x + dx), y: Math.round(g.y + dy) }, false);
    if (g.type === 'resize-shape') updateShape(g.id, { w: Math.max(24, Math.round(g.w + dx)), h: Math.max(24, Math.round(g.h + dy)) }, false);
    if (g.type === 'draw-shape') {
      const point = worldPoint(event.clientX, event.clientY);
      const rawDx = point.x - g.startWorldX;
      const rawDy = point.y - g.startWorldY;
      updateShape(g.id, {
        x: Math.round(Math.min(g.startWorldX, point.x)),
        y: Math.round(Math.min(g.startWorldY, point.y)),
        w: Math.max(24, Math.round(Math.abs(rawDx))),
        h: Math.max(24, Math.round(Math.abs(rawDy))),
        flipX: rawDx < 0, flipY: rawDy < 0,
        flatY: Math.abs(rawDy) < 12, flatX: Math.abs(rawDx) < 12,
      }, false);
    }
  }

  function boardPointerUp() {
    const finished = gestureRef.current;
    if (!finished) return;
    gestureRef.current = null;
    if (finished.type === 'draw-shape') setTool('select');
    setCanvas((current) => {
      persistCanvas(current);
      return current;
    });
  }

  function handleWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const nextZoom = Math.min(2.2, Math.max(0.25, viewport.zoom * factor));
      const rect = viewportRef.current.getBoundingClientRect();
      const px = event.clientX - rect.left; const py = event.clientY - rect.top;
      const wx = (px - viewport.x) / viewport.zoom; const wy = (py - viewport.y) / viewport.zoom;
      setViewport({ x: px - wx * nextZoom, y: py - wy * nextZoom, zoom: nextZoom });
    } else setViewport((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
  }

  useEffect(() => {
    const node = viewportRef.current; if (!node) return;
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  });

  useEffect(() => {
    if (!canEdit || !clientId) return;
    async function onPaste(event) {
      const image = Array.from(event.clipboardData?.items || []).find((entry) => entry.type?.startsWith('image/'));
      const file = image?.getAsFile?.(); if (!file || !defaultCollectionId) return;
      event.preventDefault();
      const data = await fileToBase64(file);
      try {
        const response = await api.post('/moodboards/items', { client_id: clientId, collection_id: defaultCollectionId, item_type: 'image', category: 'Geral', media_data: data, media_mime: file.type || 'image/png', media_name: file.name || 'imagem-colada.png' });
        const saved = response.data.item; setItems((current) => [...current, saved]);
        const p = centerWorldPoint(); updateCanvas((current) => ({ ...current, elements: { ...(current.elements || {}), [String(saved.id)]: { x: p.x - 150, y: p.y - 100, w: 300, h: 220, z: Date.now() % 1000000, kind: 'image' } } })); setSelectedId(saved.id);
      } catch {}
    }
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }, [canEdit, clientId, defaultCollectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function zoom(delta) { setViewport((v) => ({ ...v, zoom: Math.min(2.2, Math.max(0.25, v.zoom + delta)) })); }
  function fitBoard() { setViewport({ x: -220, y: -120, zoom: 0.72 }); }

  const tools = [
    ['select','Selecionar',MousePointer2],['hand','Mover quadro',Hand],['image','Imagem',ImageIcon],['text','Texto',Type],['note','Post-it',StickyNote],['shapes','Formas',Shapes],['link','Link',Link2],['frame','Frame',Frame],
  ];
  const activeShapeType = tool.startsWith('shape:') ? tool.split(':')[1] : null;

  return (
    <div className="space-y-3">
      {!clientId ? <EmptyClientState /> : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-600">Direção criativa</p><h1 className="mt-0.5 text-xl font-black text-slate-950">Moodboard · {selectedClient?.name || 'Cliente'}</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDirectionOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Palette size={15} /> Direção criativa</button>
            <button type="button" onClick={() => setPresentation((v) => !v)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${presentation ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Presentation size={15} /> {presentation ? 'Sair da apresentação' : 'Apresentar'}</button>
          </div>
        </div>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div ref={viewportRef} onPointerDown={boardPointerDown} onPointerMove={boardPointerMove} onPointerUp={boardPointerUp} onPointerCancel={boardPointerUp} className={`relative h-[calc(100vh-205px)] min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f8fa] ${tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : ''} ${activeShapeType ? 'cursor-crosshair' : ''}`}>
          {!presentation && canEdit && <>
            <div className="absolute left-4 top-4 z-40 flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {tools.map(([key,label,Icon]) => <button key={key} type="button" title={label} onClick={() => {
                if (key === 'frame') { setShapeMenuOpen(false); addFrame(); }
                else if (key === 'shapes') setShapeMenuOpen((open) => !open);
                else if (['image','text','note','link'].includes(key)) { setShapeMenuOpen(false); setEditingItem(null); setModal(key); }
                else { setShapeMenuOpen(false); setTool(key); }
              }} className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${(tool === key || (key === 'shapes' && activeShapeType)) && ['select','hand','shapes'].includes(key) ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><Icon size={18} /></button>)}
            </div>
            {shapeMenuOpen && <div className="absolute left-[72px] top-4 z-50 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
              <div className="px-2 pb-2 pt-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Formas</p><p className="mt-0.5 text-xs text-slate-500">Escolha e arraste no quadro.</p></div>
              <div className="grid grid-cols-2 gap-1">
                {SHAPE_TYPES.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { setTool(`shape:${key}`); setShapeMenuOpen(false); setSelectedId(null); setSelectedShapeId(null); }} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Icon size={16} /><span>{label}</span></button>)}
              </div>
            </div>}
            {activeShapeType && <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-2 text-xs font-bold text-blue-700 shadow-lg">Clique e arraste para desenhar {shapeLabel(activeShapeType).toLowerCase()}</div>}
          </>}
          <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button type="button" onClick={() => zoom(-0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><ZoomOut size={16} /></button><span className="min-w-14 text-center text-xs font-bold text-slate-600">{Math.round(viewport.zoom * 100)}%</span><button type="button" onClick={() => zoom(0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><ZoomIn size={16} /></button><button type="button" onClick={fitBoard} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" title="Centralizar"><Maximize2 size={16} /></button></div>
          {loading && <div className="absolute inset-0 z-50 grid place-items-center bg-white/60 text-sm font-semibold text-slate-500">Carregando quadro...</div>}
          <div data-canvas-surface="true" className="absolute left-0 top-0" style={{ width: WORLD_W, height: WORLD_H, transformOrigin: '0 0', transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            {(canvas.frames || []).map((frame) => <div key={frame.id} className="absolute rounded-3xl border-2 border-dashed border-slate-300 bg-white/25" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, zIndex: frame.z || 0 }}><div className="flex items-center justify-between px-5 py-4"><span className="text-sm font-black uppercase tracking-[.12em] text-slate-400">{frame.title}</span>{canEdit && !presentation && <button type="button" onClick={(e) => { e.stopPropagation(); removeFrame(frame.id); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white hover:text-rose-500"><Trash2 size={14} /></button>}</div></div>)}
            {(canvas.shapes || []).map((shape) => <ShapeElement key={shape.id} shape={shape} selected={selectedShapeId === shape.id} presentation={presentation} onSelect={(id) => { setSelectedId(null); setSelectedShapeId(id); }} onPointerDown={pointerDownShape} onResizeStart={resizeStartShape} onChange={updateShape} onDelete={deleteShape} onDuplicate={duplicateShape} />)}
            {items.map((item, index) => <BoardItem key={item.id} item={item} layout={layoutFor(item,index)} selected={Number(selectedId) === Number(item.id)} presentation={presentation} onSelect={(id) => { setSelectedShapeId(null); setSelectedId(id); }} onPointerDown={pointerDownItem} onResizeStart={resizeStart} onEdit={(entry) => { setEditingItem(entry); setModal(canvas.elements?.[String(entry.id)]?.kind === 'note' ? 'note' : entry.item_type); }} onDelete={deleteItem} />)}
            {!items.length && !(canvas.frames || []).length && !(canvas.shapes || []).length && <div className="absolute left-[900px] top-[650px] w-[520px] rounded-3xl border border-dashed border-slate-300 bg-white/80 p-10 text-center"><Move className="mx-auto text-slate-300" size={30} /><h2 className="mt-4 text-lg font-bold text-slate-800">Seu quadro está vazio</h2><p className="mt-2 text-sm leading-6 text-slate-500">Adicione imagens, textos, post-its, formas, links ou frames. Você também pode colar uma imagem com ⌘V / Ctrl+V.</p></div>}
          </div>
        </div>
      </>}
      {directionOpen && <DirectionModal profile={profile} onClose={() => setDirectionOpen(false)} onSave={saveDirection} />}
      {modal && <ItemModal kind={modal} item={editingItem} onClose={() => { setModal(null); setEditingItem(null); }} onSave={saveItem} />}
    </div>
  );
}
