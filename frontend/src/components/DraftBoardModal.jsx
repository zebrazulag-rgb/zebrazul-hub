import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  BringToFront,
  Check,
  Circle,
  Copy,
  Hand,
  ListChecks,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import api from '../api';

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2200;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;
const GRID_SIZE = 24;

const COLORS = ['#fff3a3', '#ffd6e7', '#d9f7be', '#cfe8ff', '#e9dcff', '#ffffff', '#121620'];

const TOOLS = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2, shortcut: 'V' },
  { id: 'hand', label: 'Mover tela', icon: Hand, shortcut: 'H' },
  { id: 'sticky', label: 'Nota adesiva', icon: StickyNote, shortcut: 'N' },
  { id: 'text', label: 'Texto', icon: Type, shortcut: 'T' },
  { id: 'rectangle', label: 'Retângulo', icon: Square, shortcut: 'R' },
  { id: 'circle', label: 'Círculo', icon: Circle, shortcut: 'O' },
  { id: 'checklist', label: 'Checklist', icon: ListChecks, shortcut: 'C' },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultElement(type, x, y, z) {
  const base = { id: uid(), type, x, y, z, color: '#ffffff', stroke: '#334155' };
  if (type === 'sticky') return { ...base, w: 220, h: 180, color: '#fff3a3', text: 'Nova ideia' };
  if (type === 'text') return { ...base, w: 280, h: 90, color: 'transparent', text: 'Digite seu texto' };
  if (type === 'rectangle') return { ...base, w: 240, h: 150, color: '#ffffff', text: '' };
  if (type === 'circle') return { ...base, w: 180, h: 180, color: '#ffffff', text: '' };
  if (type === 'checklist') return { ...base, w: 260, h: 190, color: '#ffffff', text: 'Primeiro item\nSegundo item' };
  return { ...base, w: 200, h: 120, text: '' };
}

function formatSavedAt(value) {
  if (!value) return '';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ElementContent({ element, editing, onTextChange, onFinishEditing }) {
  const dark = element.color === '#121620';
  const textColor = dark ? '#ffffff' : '#172033';

  if (editing && ['sticky', 'text', 'rectangle', 'circle', 'checklist'].includes(element.type)) {
    return (
      <textarea
        autoFocus
        value={element.text || ''}
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={onFinishEditing}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="h-full w-full resize-none border-0 bg-transparent p-3 text-sm leading-6 outline-none"
        style={{ color: textColor }}
      />
    );
  }

  if (element.type === 'checklist') {
    const rawItems = String(element.text || '').split('\n');
    const items = rawItems.some((item) => item.trim()) ? rawItems : ['Item'];
    return (
      <div className="space-y-2 p-4 text-sm leading-5" style={{ color: textColor }}>
        {items.map((item, index) => (
          <div key={`${element.id}-${index}`} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border" style={{ borderColor: dark ? '#94a3b8' : '#cbd5e1' }} />
            <span className="whitespace-pre-wrap break-words">{item || 'Item'}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`h-full w-full whitespace-pre-wrap break-words ${element.type === 'text' ? 'p-2 text-lg font-semibold leading-7' : 'p-4 text-sm leading-6'}`}
      style={{ color: textColor }}
    >
      {element.text || (element.type === 'rectangle' || element.type === 'circle' ? '' : 'Duplo clique para editar')}
    </div>
  );
}

function BoardElement({ element, selected, editing, tool, zoom, onSelect, onMoveStart, onResizeStart, onEditStart, onTextChange, onFinishEditing }) {
  const shapeClass = element.type === 'circle' ? 'rounded-full' : element.type === 'sticky' ? 'rounded-md shadow-lg' : 'rounded-xl';
  const isText = element.type === 'text';

  return (
    <div
      data-board-element="true"
      className={`absolute select-none ${shapeClass} ${selected ? 'ring-2 ring-[#0969ff] ring-offset-2' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
        zIndex: element.z || 1,
        background: isText ? 'transparent' : (element.color || '#ffffff'),
        border: isText ? '1px solid transparent' : `1.5px solid ${element.stroke || '#cbd5e1'}`,
        cursor: tool === 'select' ? (editing ? 'text' : 'move') : 'default',
      }}
      onPointerDown={(event) => {
        if (editing || tool !== 'select') return;
        event.stopPropagation();
        onSelect(element.id);
        onMoveStart(event, element);
      }}
      onDoubleClick={(event) => {
        if (tool !== 'select') return;
        event.stopPropagation();
        onSelect(element.id);
        onEditStart(element.id);
      }}
    >
      <ElementContent
        element={element}
        editing={editing}
        onTextChange={onTextChange}
        onFinishEditing={onFinishEditing}
      />

      {selected && !editing && tool === 'select' && (
        <button
          type="button"
          aria-label="Redimensionar"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResizeStart(event, element);
          }}
          className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-[#0969ff] shadow"
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'center' }}
        />
      )}
    </div>
  );
}

export default function DraftBoardModal({ boardId, onClose, onSaved }) {
  const viewportRef = useRef(null);
  const boardRef = useRef({ version: 1, background: '#f8fafc', elements: [] });
  const revisionRef = useRef(1);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const interactionRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const spacePressedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [boardMeta, setBoardMeta] = useState(null);
  const [title, setTitle] = useState('Rascunho');
  const [data, setData] = useState(boardRef.current);
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 160, y: 100 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, []);

  const selectedElement = useMemo(
    () => data.elements.find((element) => element.id === selectedId) || null,
    [data.elements, selectedId]
  );

  function setBoardData(next, markDirty = true) {
    boardRef.current = next;
    setData(next);
    if (markDirty) dirtyRef.current = true;
  }

  function recordSnapshot(next = boardRef.current) {
    const snapshot = clone(next);
    const serialized = JSON.stringify(snapshot);
    const current = historyRef.current[historyIndexRef.current];
    if (current && JSON.stringify(current) === serialized) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 60) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryTick((value) => value + 1);
  }

  function updateElement(elementId, patch, record = false) {
    const next = {
      ...boardRef.current,
      elements: boardRef.current.elements.map((element) => element.id === elementId ? { ...element, ...patch } : element),
    };
    setBoardData(next);
    if (record) recordSnapshot(next);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const next = clone(historyRef.current[historyIndexRef.current]);
    setBoardData(next);
    setSelectedId(null);
    setEditingId(null);
    setHistoryTick((value) => value + 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = clone(historyRef.current[historyIndexRef.current]);
    setBoardData(next);
    setSelectedId(null);
    setEditingId(null);
    setHistoryTick((value) => value + 1);
  }

  async function loadBoard() {
    setLoading(true);
    setLoadError('');
    try {
      const { data: response } = await api.get(`/material-boards/${boardId}`);
      const board = response.board;
      const initialData = board.data && Array.isArray(board.data.elements)
        ? board.data
        : { version: 1, background: '#f8fafc', elements: [] };
      setBoardMeta(board);
      setTitle(board.title || 'Rascunho');
      revisionRef.current = Number(board.revision || 1);
      dirtyRef.current = false;
      setBoardData(initialData, false);
      historyRef.current = [clone(initialData)];
      historyIndexRef.current = 0;
      setSavedAt(board.updated_at || '');
      setHistoryTick((value) => value + 1);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Não foi possível abrir o rascunho.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBoard(); }, [boardId]);

  async function saveBoard(force = false) {
    if ((!dirtyRef.current && !force) || loading) return true;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return false;
    }

    const payloadData = clone(boardRef.current);
    const payloadTitle = title.trim() || 'Rascunho sem título';
    const serializedAtStart = JSON.stringify(payloadData);
    savingRef.current = true;
    setSaving(true);
    setSaveError('');

    try {
      const { data: response } = await api.put(`/material-boards/${boardId}`, {
        title: payloadTitle,
        data: payloadData,
        expected_revision: revisionRef.current,
      });
      revisionRef.current = Number(response.revision || revisionRef.current + 1);
      setSavedAt(response.updated_at || new Date().toISOString());
      if (JSON.stringify(boardRef.current) === serializedAtStart && title.trim() === payloadTitle) {
        dirtyRef.current = false;
      }
      onSaved?.();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || 'Não foi possível salvar o rascunho.';
      setSaveError(message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => saveBoard(), 60);
      }
    }
  }

  useEffect(() => {
    if (!dirtyRef.current || loading) return undefined;
    const timer = window.setTimeout(() => saveBoard(), 900);
    return () => window.clearTimeout(timer);
  }, [data, title, loading]);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (event.code === 'Space' && !typing) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (typing) return;

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === 'd' && selectedId) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId) {
          event.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (event.key === 'Escape') {
        setEditingId(null);
        setSelectedId(null);
        setTool('select');
        return;
      }
      const shortcut = TOOLS.find((item) => item.shortcut.toLowerCase() === key);
      if (shortcut) setTool(shortcut.id);
    }

    function handleKeyUp(event) {
      if (event.code === 'Space') spacePressedRef.current = false;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedId, historyTick]);

  function screenToWorld(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function createElement(type, point) {
    const maxZ = boardRef.current.elements.reduce((highest, element) => Math.max(highest, Number(element.z || 0)), 0);
    const element = defaultElement(type, Math.round(point.x / 8) * 8, Math.round(point.y / 8) * 8, maxZ + 1);
    element.x = clamp(element.x, 0, WORLD_WIDTH - element.w);
    element.y = clamp(element.y, 0, WORLD_HEIGHT - element.h);
    const next = { ...boardRef.current, elements: [...boardRef.current.elements, element] };
    setBoardData(next);
    recordSnapshot(next);
    setSelectedId(element.id);
    setEditingId(['sticky', 'text', 'checklist'].includes(type) ? element.id : null);
    setTool('select');
  }

  function handleViewportPointerDown(event) {
    if (event.button === 1 || tool === 'hand' || spacePressedRef.current) {
      event.preventDefault();
      viewportRef.current?.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originPan: { ...pan },
      };
      return;
    }

    if (event.button !== 0) return;
    if (['sticky', 'text', 'rectangle', 'circle', 'checklist'].includes(tool)) {
      createElement(tool, screenToWorld(event.clientX, event.clientY));
      return;
    }

    if (!event.target.closest?.('[data-board-element="true"]')) {
      setSelectedId(null);
      setEditingId(null);
    }
  }

  function startMove(event, element) {
    viewportRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: 'move',
      pointerId: event.pointerId,
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: element.x, y: element.y },
    };
  }

  function startResize(event, element) {
    viewportRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: 'resize',
      pointerId: event.pointerId,
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { w: element.w, h: element.h },
    };
  }

  function handleViewportPointerMove(event) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.type === 'pan') {
      setPan({
        x: interaction.originPan.x + event.clientX - interaction.startX,
        y: interaction.originPan.y + event.clientY - interaction.startY,
      });
      return;
    }

    const dx = (event.clientX - interaction.startX) / zoom;
    const dy = (event.clientY - interaction.startY) / zoom;
    if (interaction.type === 'move') {
      const element = boardRef.current.elements.find((item) => item.id === interaction.elementId);
      if (!element) return;
      updateElement(interaction.elementId, {
        x: clamp(Math.round((interaction.origin.x + dx) / 8) * 8, 0, WORLD_WIDTH - element.w),
        y: clamp(Math.round((interaction.origin.y + dy) / 8) * 8, 0, WORLD_HEIGHT - element.h),
      });
    }
    if (interaction.type === 'resize') {
      const minimum = 56;
      updateElement(interaction.elementId, {
        w: clamp(Math.round((interaction.origin.w + dx) / 8) * 8, minimum, 1400),
        h: clamp(Math.round((interaction.origin.h + dy) / 8) * 8, minimum, 1000),
      });
    }
  }

  function handleViewportPointerUp(event) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.type === 'move' || interaction.type === 'resize') recordSnapshot();
    interactionRef.current = null;
    try { viewportRef.current?.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  }

  function handleWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const worldX = (cursorX - pan.x) / zoom;
      const worldY = (cursorY - pan.y) / zoom;
      const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
      setPan({ x: cursorX - worldX * nextZoom, y: cursorY - worldY * nextZoom });
      return;
    }
    setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }

  function changeZoom(nextZoom) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - pan.x) / zoom;
    const worldY = (centerY - pan.y) / zoom;
    const normalized = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(normalized);
    setPan({ x: centerX - worldX * normalized, y: centerY - worldY * normalized });
  }

  function fitBoard() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const elements = boardRef.current.elements;
    if (!elements.length) {
      setZoom(0.75);
      setPan({ x: 160, y: 100 });
      return;
    }
    const left = Math.min(...elements.map((element) => element.x));
    const top = Math.min(...elements.map((element) => element.y));
    const right = Math.max(...elements.map((element) => element.x + element.w));
    const bottom = Math.max(...elements.map((element) => element.y + element.h));
    const rect = viewport.getBoundingClientRect();
    const nextZoom = clamp(Math.min((rect.width - 160) / Math.max(300, right - left), (rect.height - 160) / Math.max(220, bottom - top)), MIN_ZOOM, 1.2);
    setZoom(nextZoom);
    setPan({
      x: (rect.width - (right - left) * nextZoom) / 2 - left * nextZoom,
      y: (rect.height - (bottom - top) * nextZoom) / 2 - top * nextZoom,
    });
  }

  function deleteSelected() {
    if (!selectedId) return;
    const next = { ...boardRef.current, elements: boardRef.current.elements.filter((element) => element.id !== selectedId) };
    setBoardData(next);
    recordSnapshot(next);
    setSelectedId(null);
    setEditingId(null);
  }

  function duplicateSelected() {
    const source = boardRef.current.elements.find((element) => element.id === selectedId);
    if (!source) return;
    const maxZ = boardRef.current.elements.reduce((highest, element) => Math.max(highest, Number(element.z || 0)), 0);
    const duplicate = { ...clone(source), id: uid(), x: source.x + 32, y: source.y + 32, z: maxZ + 1 };
    const next = { ...boardRef.current, elements: [...boardRef.current.elements, duplicate] };
    setBoardData(next);
    recordSnapshot(next);
    setSelectedId(duplicate.id);
  }

  function changeLayer(direction) {
    const selected = boardRef.current.elements.find((element) => element.id === selectedId);
    if (!selected) return;
    const levels = boardRef.current.elements.map((element) => Number(element.z || 0));
    const z = direction === 'front' ? Math.max(...levels, 0) + 1 : Math.min(...levels, 1) - 1;
    updateElement(selected.id, { z }, true);
  }

  async function closeBoard() {
    if (dirtyRef.current) {
      const saved = await saveBoard(true);
      if (!saved) return;
    }
    onClose();
  }

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 font-semibold text-slate-600 shadow-xl">
          <Loader2 size={20} className="animate-spin text-[#0969ff]" /> Abrindo rascunho...
        </div>
      </div>,
      document.body
    );
  }

  if (loadError) {
    return createPortal(
      <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h2 className="text-xl font-bold text-slate-900">Não foi possível abrir</h2>
          <p className="mt-3 text-sm leading-6 text-red-600">{loadError}</p>
          <button onClick={onClose} className="btn-primary mt-6">Voltar para Materiais</button>
        </div>
      </div>,
      document.body
    );
  }

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 shadow-sm md:px-5">
        <button onClick={closeBoard} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" title="Fechar">
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(event) => { setTitle(event.target.value); dirtyRef.current = true; }}
            onBlur={() => { if (!title.trim()) setTitle('Rascunho sem título'); }}
            className="w-full max-w-xl truncate border-0 bg-transparent text-base font-bold outline-none md:text-lg"
          />
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>{boardMeta?.client_name || 'Quadro geral'}</span>
            <span>•</span>
            {saving ? <span className="flex items-center gap-1 text-blue-600"><Loader2 size={11} className="animate-spin" /> Salvando</span> : dirtyRef.current ? <span>Alterações pendentes</span> : <span className="flex items-center gap-1 text-emerald-600"><Check size={11} /> Salvo {formatSavedAt(savedAt)}</span>}
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex">
          <button onClick={undo} disabled={!canUndo} className="rounded-lg p-2 text-slate-500 enabled:hover:bg-white enabled:hover:text-slate-900 disabled:opacity-30" title="Desfazer"><Undo2 size={17} /></button>
          <button onClick={redo} disabled={!canRedo} className="rounded-lg p-2 text-slate-500 enabled:hover:bg-white enabled:hover:text-slate-900 disabled:opacity-30" title="Refazer"><Redo2 size={17} /></button>
        </div>
        <button onClick={() => saveBoard(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#121620] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} <span className="hidden sm:inline">Salvar</span>
        </button>
      </header>

      {saveError && (
        <div className="absolute left-1/2 top-20 z-50 max-w-xl -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 shadow-lg">
          {saveError}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setTool(item.id); setEditingId(null); }}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${tool === item.id ? 'bg-[#0969ff] text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                title={`${item.label} (${item.shortcut})`}
              >
                <Icon size={19} />
              </button>
            );
          })}
          <div className="my-1 h-px bg-slate-200" />
          <button onClick={undo} disabled={!canUndo} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 sm:hidden"><Undo2 size={18} /></button>
          <button onClick={redo} disabled={!canRedo} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 sm:hidden"><Redo2 size={18} /></button>
        </aside>

        <div
          ref={viewportRef}
          className="relative h-full min-w-0 flex-1 touch-none overflow-hidden bg-slate-200/70"
          style={{ cursor: tool === 'hand' || spacePressedRef.current ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
          onWheel={handleWheel}
        >
          <div
            className="absolute origin-top-left shadow-[0_16px_50px_rgba(15,23,42,0.12)]"
            style={{
              width: WORLD_WIDTH,
              height: WORLD_HEIGHT,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundColor: data.background || '#f8fafc',
              backgroundImage: 'radial-gradient(circle, rgba(100,116,139,.28) 1.2px, transparent 1.2px)',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            }}
          >
            {data.elements.map((element) => (
              <BoardElement
                key={element.id}
                element={element}
                selected={selectedId === element.id}
                editing={editingId === element.id}
                tool={tool}
                zoom={zoom}
                onSelect={setSelectedId}
                onMoveStart={startMove}
                onResizeStart={startResize}
                onEditStart={setEditingId}
                onTextChange={(text) => updateElement(element.id, { text })}
                onFinishEditing={() => { setEditingId(null); recordSnapshot(); }}
              />
            ))}
          </div>

          <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            <button onClick={() => changeZoom(zoom - 0.1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ZoomOut size={17} /></button>
            <button onClick={() => changeZoom(1)} className="min-w-16 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">{Math.round(zoom * 100)}%</button>
            <button onClick={() => changeZoom(zoom + 0.1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ZoomIn size={17} /></button>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <button onClick={fitBoard} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Enquadrar conteúdo"><Maximize2 size={17} /></button>
          </div>
        </div>

        {selectedElement && (
          <aside className="absolute bottom-4 right-4 top-4 z-30 w-[290px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0969ff]">Propriedades</p>
                <h3 className="mt-1 font-bold text-slate-900">Editar elemento</h3>
              </div>
              <button onClick={() => { setSelectedId(null); setEditingId(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={17} /></button>
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-600"><AlignLeft size={14} /> Conteúdo</span>
              <textarea
                value={selectedElement.text || ''}
                onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })}
                onBlur={() => recordSnapshot()}
                className="input-field min-h-28 resize-y text-sm"
                placeholder="Escreva aqui..."
              />
            </label>

            {selectedElement.type !== 'text' && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-600">Cor</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateElement(selectedElement.id, { color }, true)}
                      className={`h-8 w-8 rounded-full border-2 shadow-sm ${selectedElement.color === color ? 'border-[#0969ff]' : 'border-white ring-1 ring-slate-200'}`}
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={duplicateSelected} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Copy size={15} /> Duplicar</button>
              <button onClick={deleteSelected} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
              <button onClick={() => changeLayer('front')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><BringToFront size={15} /> À frente</button>
              <button onClick={() => changeLayer('back')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><SendToBack size={15} /> Ao fundo</button>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
              <p><strong>Duplo clique</strong> edita o texto.</p>
              <p><strong>⌘/Ctrl + D</strong> duplica.</p>
              <p><strong>Delete</strong> remove.</p>
              <p><strong>Espaço + arrastar</strong> move a tela.</p>
            </div>
          </aside>
        )}
      </div>
    </div>,
    document.body
  );
}
