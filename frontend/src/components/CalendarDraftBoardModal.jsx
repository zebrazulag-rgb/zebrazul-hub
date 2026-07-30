import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import api from '../api';

const COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#0891b2'];
const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(year, month - 1, 1);
}

function formatMonth(value) {
  return parseMonth(value).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatSavedAt(value) {
  if (!value) return '';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function buildCalendarDays(value) {
  const first = parseMonth(value);
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      key: dateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
      isToday: dateKey(date) === dateKey(new Date()),
    };
  });
}

function normalizeCalendarData(input) {
  const current = monthKey(new Date());
  if (input?.boardType === 'calendar' && input.calendar) {
    return {
      version: 2,
      boardType: 'calendar',
      calendar: {
        month: /^\d{4}-\d{2}$/.test(input.calendar.month || '') ? input.calendar.month : current,
        entries: Array.isArray(input.calendar.entries) ? input.calendar.entries : [],
      },
    };
  }
  return { version: 2, boardType: 'calendar', calendar: { month: current, entries: [] } };
}

function statusLabel(status) {
  if (status === 'planned') return 'Planejado';
  if (status === 'done') return 'Concluído';
  return 'Rascunho';
}

export default function CalendarDraftBoardModal({ boardId, onClose, onSaved }) {
  const dataRef = useRef(normalizeCalendarData());
  const titleRef = useRef('Calendário');
  const revisionRef = useRef(1);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [boardMeta, setBoardMeta] = useState(null);
  const [title, setTitle] = useState('Calendário');
  const [data, setData] = useState(dataRef.current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);

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

  function setBoardData(nextOrUpdater, markDirty = true) {
    setData((current) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : nextOrUpdater;
      dataRef.current = next;
      if (markDirty) dirtyRef.current = true;
      return next;
    });
  }

  async function loadBoard() {
    setLoading(true);
    setLoadError('');
    try {
      const { data: response } = await api.get(`/material-boards/${boardId}`);
      const board = response.board;
      const initialData = normalizeCalendarData(board.data);
      setBoardMeta(board);
      setTitle(board.title || 'Calendário');
      titleRef.current = board.title || 'Calendário';
      revisionRef.current = Number(board.revision || 1);
      dirtyRef.current = false;
      dataRef.current = initialData;
      setData(initialData);
      setSavedAt(board.updated_at || '');
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Não foi possível abrir o calendário.');
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

    const payloadData = JSON.parse(JSON.stringify(dataRef.current));
    const payloadTitle = titleRef.current.trim() || 'Calendário sem título';
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
      if (JSON.stringify(dataRef.current) === serializedAtStart && titleRef.current.trim() === payloadTitle) {
        dirtyRef.current = false;
      }
      onSaved?.();
      return true;
    } catch (error) {
      setSaveError(error.response?.data?.error || 'Não foi possível salvar o calendário.');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => saveBoard(), 80);
      }
    }
  }

  useEffect(() => {
    if (!dirtyRef.current || loading) return undefined;
    const timer = window.setTimeout(() => saveBoard(), 900);
    return () => window.clearTimeout(timer);
  }, [data, title, loading]);

  async function closeBoard() {
    if (dirtyRef.current) {
      const saved = await saveBoard(true);
      if (!saved) return;
    }
    onClose();
  }

  const calendarDays = useMemo(() => buildCalendarDays(data.calendar.month), [data.calendar.month]);
  const entriesByDate = useMemo(() => {
    const grouped = new Map();
    data.calendar.entries.forEach((entry) => {
      if (!grouped.has(entry.date)) grouped.set(entry.date, []);
      grouped.get(entry.date).push(entry);
    });
    return grouped;
  }, [data.calendar.entries]);

  const selectedEntry = data.calendar.entries.find((entry) => entry.id === selectedId) || null;
  const monthEntries = data.calendar.entries.filter((entry) => entry.date?.startsWith(data.calendar.month));
  const plannedCount = monthEntries.filter((entry) => entry.status === 'planned').length;
  const doneCount = monthEntries.filter((entry) => entry.status === 'done').length;

  function setMonth(nextDate) {
    setBoardData((current) => ({
      ...current,
      calendar: { ...current.calendar, month: monthKey(nextDate) },
    }));
    setSelectedId(null);
  }

  function changeMonth(offset) {
    const current = parseMonth(data.calendar.month);
    setMonth(new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function addEntry(date = `${data.calendar.month}-01`) {
    const entry = {
      id: uid(),
      title: 'Novo item',
      description: '',
      date,
      color: COLORS[0],
      status: 'draft',
      category: '',
      createdAt: new Date().toISOString(),
    };
    setBoardData((current) => ({
      ...current,
      calendar: { ...current.calendar, entries: [...current.calendar.entries, entry] },
    }));
    setSelectedId(entry.id);
  }

  function updateEntry(entryId, patch) {
    setBoardData((current) => ({
      ...current,
      calendar: {
        ...current.calendar,
        entries: current.calendar.entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
      },
    }));
  }

  function deleteEntry(entryId) {
    setBoardData((current) => ({
      ...current,
      calendar: { ...current.calendar, entries: current.calendar.entries.filter((entry) => entry.id !== entryId) },
    }));
    setSelectedId(null);
  }

  function duplicateEntry(entry) {
    const duplicate = { ...entry, id: uid(), title: `${entry.title} (cópia)`, createdAt: new Date().toISOString() };
    setBoardData((current) => ({
      ...current,
      calendar: { ...current.calendar, entries: [...current.calendar.entries, duplicate] },
    }));
    setSelectedId(duplicate.id);
  }

  function handleDrop(date) {
    if (!draggedId) return;
    updateEntry(draggedId, { date });
    setDraggedId(null);
  }

  const modalContent = loading ? (
    <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen items-center justify-center bg-slate-100">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 font-semibold text-slate-600 shadow-xl">
        <Loader2 size={20} className="animate-spin text-[#0969ff]" /> Abrindo calendário...
      </div>
    </div>
  ) : loadError ? (
    <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">Não foi possível abrir</h2>
        <p className="mt-3 text-sm leading-6 text-red-600">{loadError}</p>
        <button onClick={onClose} className="btn-primary mt-6">Voltar para Materiais</button>
      </div>
    </div>
  ) : (
    <div className="calendar-draft-board fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="z-30 flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 shadow-sm md:px-5">
        <button onClick={closeBoard} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" title="Fechar">
          <X size={20} />
        </button>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0969ff] sm:flex"><CalendarDays size={20} /></span>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              titleRef.current = event.target.value;
              dirtyRef.current = true;
            }}
            onBlur={() => {
              if (!title.trim()) {
                setTitle('Calendário sem título');
                titleRef.current = 'Calendário sem título';
              }
            }}
            className="w-full max-w-xl truncate border-0 bg-transparent text-base font-bold outline-none md:text-lg"
          />
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
            <span className="truncate">{boardMeta?.client_name || 'Calendário geral'}</span>
            <span>•</span>
            {saving ? <span className="flex items-center gap-1 text-blue-600"><Loader2 size={11} className="animate-spin" /> Salvando</span> : dirtyRef.current ? <span>Alterações pendentes</span> : <span className="flex items-center gap-1 text-emerald-600"><Check size={11} /> Salvo {formatSavedAt(savedAt)}</span>}
          </div>
        </div>
        <button onClick={() => addEntry(`${data.calendar.month}-01`)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Plus size={17} /> <span className="hidden sm:inline">Novo item</span></button>
        <button onClick={() => saveBoard(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#121620] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} <span className="hidden sm:inline">Salvar</span>
        </button>
      </header>

      {saveError && (
        <div className="absolute left-1/2 top-20 z-50 max-w-xl -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 shadow-lg">
          {saveError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-auto p-3 md:p-5">
          <section className="calendar-surface mx-auto min-w-[920px] max-w-[1500px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-6">
              <div className="flex items-center gap-2">
                <button onClick={() => changeMonth(-1)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronLeft size={19} /></button>
                <button onClick={() => setMonth(new Date())} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Hoje</button>
                <button onClick={() => changeMonth(1)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronRight size={19} /></button>
                <h2 className="ml-2 capitalize text-xl font-bold text-slate-900 md:text-2xl">{formatMonth(data.calendar.month)}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{monthEntries.length} itens</span>
                <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">{plannedCount} planejados</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">{doneCount} concluídos</span>
              </div>
            </div>

            <div className="calendar-weekdays grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEK_DAYS.map((day) => <div key={day} className="border-r border-slate-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-500 last:border-r-0">{day}</div>)}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const dayEntries = entriesByDate.get(day.key) || [];
                return (
                  <div
                    key={day.key}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(day.key)}
                    className={`calendar-day-cell group min-h-[145px] border-b border-r border-slate-200 p-2 transition last:border-r-0 ${!day.inMonth ? 'calendar-day-outside bg-slate-50/70' : 'calendar-day-current bg-white'} ${index % 7 === 6 ? 'border-r-0' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${day.isToday ? 'bg-[#0969ff] text-white' : day.inMonth ? 'text-slate-700' : 'text-slate-300'}`}>{day.day}</span>
                      <button onClick={() => addEntry(day.key)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 opacity-0 transition hover:bg-blue-50 hover:text-[#0969ff] group-hover:opacity-100" title="Adicionar item"><Plus size={15} /></button>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {dayEntries.slice(0, 5).map((entry) => (
                        <button
                          key={entry.id}
                          draggable
                          onDragStart={(event) => {
                            setDraggedId(entry.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', entry.id);
                          }}
                          onDragEnd={() => setDraggedId(null)}
                          onClick={() => setSelectedId(entry.id)}
                          className={`calendar-entry-card block w-full rounded-lg border px-2.5 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${selectedId === entry.id ? 'border-white ring-2 ring-blue-300' : 'border-white/15'}`}
                          style={{ background: entry.color || COLORS[0], opacity: draggedId === entry.id ? 0.45 : 1 }}
                        >
                          <span className={`calendar-entry-title block truncate text-xs font-bold text-white ${entry.status === 'done' ? 'line-through opacity-70' : ''}`}>{entry.title}</span>
                          {(entry.category || entry.status !== 'draft') && <span className="calendar-entry-meta mt-1 block truncate text-[10px] font-semibold text-white/80">{entry.category || statusLabel(entry.status)}</span>}
                        </button>
                      ))}
                      {dayEntries.length > 5 && <button onClick={() => setSelectedId(dayEntries[5].id)} className="w-full rounded-lg bg-slate-100 px-2 py-1.5 text-left text-[10px] font-bold text-slate-500">+ {dayEntries.length - 5} itens</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {selectedEntry && (
          <aside className="calendar-entry-editor z-20 w-[340px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-[-12px_0_35px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0969ff]">Item do calendário</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Editar planejamento</h3>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Título</span>
              <input autoFocus value={selectedEntry.title} onChange={(event) => updateEntry(selectedEntry.id, { title: event.target.value })} className="input-field" />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Data</span>
              <input type="date" value={selectedEntry.date} onChange={(event) => { if (event.target.value) updateEntry(selectedEntry.id, { date: event.target.value }); }} className="input-field" />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Categoria</span>
              <input value={selectedEntry.category || ''} onChange={(event) => updateEntry(selectedEntry.id, { category: event.target.value })} className="input-field" placeholder="Ex.: Carrossel, campanha, reunião" />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Status</span>
              <select value={selectedEntry.status || 'draft'} onChange={(event) => updateEntry(selectedEntry.id, { status: event.target.value })} className="input-field">
                <option value="draft">Rascunho</option>
                <option value="planned">Planejado</option>
                <option value="done">Concluído</option>
              </select>
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Anotações</span>
              <textarea value={selectedEntry.description || ''} onChange={(event) => updateEntry(selectedEntry.id, { description: event.target.value })} className="input-field min-h-36 resize-y" placeholder="Ideias, referências, direcionamentos..." />
            </label>

            <div className="mt-5">
              <p className="text-xs font-semibold text-slate-600">Cor</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button key={color} onClick={() => updateEntry(selectedEntry.id, { color })} className={`h-8 w-8 rounded-full border-2 shadow-sm ${selectedEntry.color === color ? 'border-[#0969ff]' : 'border-white ring-1 ring-slate-200'}`} style={{ background: color }} />
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-100 pt-5">
              <button onClick={() => duplicateEntry(selectedEntry)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Copy size={15} /> Duplicar</button>
              <button onClick={() => deleteEntry(selectedEntry.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
              <p className="flex items-center gap-1.5"><Clock3 size={13} /> Arraste os cartões entre os dias para mudar a data.</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
