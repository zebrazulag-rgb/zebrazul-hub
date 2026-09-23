import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileText,
  Lock,
  Mic2,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Send,
  Trash2,
  Users,
  Video,
  WalletCards,
  X,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import PersonalFinance from './PersonalFinance.jsx';

const EVENT_TYPES = {
  post: { label: 'Postagem', icon: Send, chip: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-500' },
  recording: { label: 'Gravação', icon: Video, chip: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-500' },
  meeting: { label: 'Reunião', icon: Users, chip: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500' },
  personal: { label: 'Pessoal', icon: Lock, chip: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500' },
  other: { label: 'Outro', icon: CalendarDays, chip: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
};

const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function isoDate(date) {
  return format(date, 'yyyy-MM-dd');
}

function safeParse(value) {
  try {
    return parseISO(String(value));
  } catch {
    return new Date();
  }
}

function timeLabel(event) {
  if (Number(event?.all_day) === 1) return 'Dia inteiro';
  const raw = String(event?.start_at || '');
  return raw.includes('T') ? raw.slice(11, 16) : '';
}

function eventDay(event) {
  return String(event?.start_at || '').slice(0, 10);
}

function todayDate() {
  return new Date();
}

function newEventForm(date = todayDate()) {
  return {
    id: null,
    title: '',
    event_type: 'post',
    client_id: '',
    event_date: isoDate(date),
    start_time: '09:00',
    end_time: '10:00',
    all_day: false,
    visibility: 'team',
    notes: '',
  };
}

export default function Organizer() {
  const { user } = useAuth();
  const [month, setMonth] = useState(startOfMonth(todayDate()));
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [scope, setScope] = useState('team');
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientFilter, setClientFilter] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState(() => newEventForm());
  const [eventError, setEventError] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [activeSection, setActiveSection] = useState('agenda');
  const [hoveredEvent, setHoveredEvent] = useState(null);

  const [notes, setNotes] = useState([]);
  const [noteForm, setNoteForm] = useState({ id: null, title: '', content: '', pinned: false });
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [checklist, setChecklist] = useState([]);
  const [checkInput, setCheckInput] = useState('');
  const [checkLoading, setCheckLoading] = useState(false);

  const calendarStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart.getTime(), calendarEnd.getTime()],
  );

  const from = isoDate(calendarStart);
  const to = isoDate(calendarEnd);
  const selectedDateIso = isoDate(selectedDate);

  useEffect(() => {
    let active = true;
    api.get('/clients?summary=1').then((res) => {
      if (!active) return;
      const list = Array.isArray(res.data?.clients) ? res.data.clients : [];
      setClients(list.filter((client) => client.status !== 'archived'));
    }).catch(() => {
      if (active) setClients([]);
    });
    return () => { active = false; };
  }, []);

  async function loadEvents() {
    setLoadingEvents(true);
    try {
      const params = { from, to, scope };
      if (clientFilter) params.client_id = clientFilter;
      const { data } = await api.get('/organizer/events', { params });
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (error) {
      console.error('[ORGANIZAÇÃO] Erro ao carregar agenda:', error);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function loadNotes() {
    try {
      const { data } = await api.get('/organizer/notes');
      setNotes(Array.isArray(data?.notes) ? data.notes : []);
    } catch (error) {
      console.error('[ORGANIZAÇÃO] Erro ao carregar notas:', error);
    }
  }

  async function loadChecklist() {
    setCheckLoading(true);
    try {
      const { data } = await api.get('/organizer/checklist', { params: { date: selectedDateIso } });
      setChecklist(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error('[ORGANIZAÇÃO] Erro ao carregar checklist:', error);
      setChecklist([]);
    } finally {
      setCheckLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, [from, to, scope, clientFilter]);
  useEffect(() => { loadNotes(); }, []);
  useEffect(() => { loadChecklist(); }, [selectedDateIso]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const key = eventDay(event);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDateIso) || [];
  const pendingChecklist = checklist.filter((item) => !Number(item.completed)).length;
  const completedChecklist = checklist.length - pendingChecklist;

  function openCreateEvent(type = 'post') {
    const base = newEventForm(selectedDate);
    base.event_type = type;
    base.visibility = type === 'personal' ? 'private' : 'team';
    setEventForm(base);
    setEventError('');
    setEventModalOpen(true);
  }

  function openEditEvent(event) {
    const start = String(event.start_at || '');
    const end = String(event.end_at || start);
    setEventForm({
      id: event.id,
      title: event.title || '',
      event_type: event.event_type || 'other',
      client_id: event.client_id || '',
      event_date: start.slice(0, 10),
      start_time: start.includes('T') ? start.slice(11, 16) : '09:00',
      end_time: end.includes('T') ? end.slice(11, 16) : '10:00',
      all_day: Number(event.all_day) === 1,
      visibility: event.visibility || 'team',
      notes: event.notes || '',
    });
    setEventError('');
    setEventModalOpen(true);
  }

  async function saveEvent(event) {
    event?.preventDefault?.();
    if (!eventForm.title.trim()) {
      setEventError('Informe o título do compromisso.');
      return;
    }
    setSavingEvent(true);
    setEventError('');
    const startAt = eventForm.all_day
      ? `${eventForm.event_date}T00:00`
      : `${eventForm.event_date}T${eventForm.start_time}`;
    const endAt = eventForm.all_day
      ? `${eventForm.event_date}T23:59`
      : `${eventForm.event_date}T${eventForm.end_time || eventForm.start_time}`;

    const payload = {
      title: eventForm.title.trim(),
      event_type: eventForm.event_type,
      client_id: eventForm.client_id || null,
      start_at: startAt,
      end_at: endAt,
      all_day: eventForm.all_day,
      visibility: eventForm.visibility,
      notes: eventForm.notes,
    };

    try {
      if (eventForm.id) await api.put(`/organizer/events/${eventForm.id}`, payload);
      else await api.post('/organizer/events', payload);
      setEventModalOpen(false);
      await loadEvents();
    } catch (error) {
      setEventError(error.response?.data?.error || 'Não foi possível salvar o compromisso.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function deleteEvent() {
    if (!eventForm.id) return;
    if (!window.confirm('Excluir este compromisso da agenda?')) return;
    try {
      await api.delete(`/organizer/events/${eventForm.id}`);
      setEventModalOpen(false);
      await loadEvents();
    } catch (error) {
      setEventError(error.response?.data?.error || 'Não foi possível excluir o compromisso.');
    }
  }

  function openNote(note = null) {
    setNoteForm(note ? {
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      pinned: Boolean(Number(note.pinned)),
    } : { id: null, title: '', content: '', pinned: false });
    setNoteEditorOpen(true);
  }

  async function saveNote(event) {
    event?.preventDefault?.();
    if (!noteForm.title.trim() && !noteForm.content.trim()) return;
    setSavingNote(true);
    try {
      const payload = {
        title: noteForm.title.trim() || 'Nota',
        content: noteForm.content,
        pinned: noteForm.pinned,
      };
      if (noteForm.id) await api.put(`/organizer/notes/${noteForm.id}`, payload);
      else await api.post('/organizer/notes', payload);
      setNoteEditorOpen(false);
      await loadNotes();
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(note) {
    if (!window.confirm('Excluir esta nota?')) return;
    await api.delete(`/organizer/notes/${note.id}`);
    await loadNotes();
  }

  async function addChecklist(event) {
    event?.preventDefault?.();
    const title = checkInput.trim();
    if (!title) return;
    setCheckInput('');
    try {
      const { data } = await api.post('/organizer/checklist', { item_date: selectedDateIso, title });
      setChecklist((current) => [...current, data.item]);
    } catch (error) {
      console.error('[ORGANIZAÇÃO] Erro ao adicionar checklist:', error);
      setCheckInput(title);
    }
  }

  async function toggleChecklist(item) {
    const completed = !Number(item.completed);
    setChecklist((current) => current.map((row) => row.id === item.id ? { ...row, completed: completed ? 1 : 0 } : row));
    try {
      const { data } = await api.put(`/organizer/checklist/${item.id}`, { completed });
      setChecklist((current) => current.map((row) => row.id === item.id ? data.item : row));
    } catch {
      await loadChecklist();
    }
  }

  async function deleteChecklist(item) {
    await api.delete(`/organizer/checklist/${item.id}`);
    setChecklist((current) => current.filter((row) => row.id !== item.id));
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 lg:text-[28px]">Meu Espaço</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setActiveSection('agenda')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${activeSection === 'agenda' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <CalendarDays size={15} /> Agenda
            </button>
            <button type="button" onClick={() => setActiveSection('finance')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${activeSection === 'finance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <WalletCards size={15} /> Financeiro
            </button>
          </div>
          {activeSection === 'agenda' && (
            <>
              <button onClick={() => openCreateEvent('post')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                <Plus size={17} /> Novo compromisso
              </button>
              <button onClick={() => openNote()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
                <FileText size={16} /> Nova nota
              </button>
            </>
          )}
        </div>
      </section>

      {activeSection === 'finance' ? (
        <PersonalFinance />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Compromissos no dia" value={selectedEvents.length} icon={CalendarDays} />
            <Metric label="Checklist pendente" value={pendingChecklist} icon={CheckSquare} />
            <Metric label="Concluídos no dia" value={completedChecklist} icon={CheckCircle2} />
            <Metric label="Notas pessoais" value={notes.length} icon={FileText} />
          </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setMonth((current) => subMonths(current, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={18} /></button>
                <button onClick={() => { setMonth(startOfMonth(todayDate())); setSelectedDate(todayDate()); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Hoje</button>
                <button onClick={() => setMonth((current) => addMonths(current, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight size={18} /></button>
                <h2 className="ml-1 capitalize text-lg font-black text-slate-900">{format(month, 'MMMM yyyy', { locale: ptBR })}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400">
                  <option value="">Todos os clientes</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button onClick={() => setScope('mine')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${scope === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Minha agenda</button>
                  <button onClick={() => setScope('team')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${scope === 'team' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Equipe</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
              {WEEK_LABELS.map((label) => <div key={label} className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>)}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const key = isoDate(day);
                const dayEvents = eventsByDay.get(key) || [];
                const selected = isSameDay(day, selectedDate);
                const today = isSameDay(day, todayDate());
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDate(day)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedDate(day); }}
                    className={`min-h-[112px] cursor-pointer border-b border-r border-slate-100 p-2 text-left align-top transition hover:bg-blue-50/30 ${!isSameMonth(day, month) ? 'bg-slate-50/70 text-slate-300' : 'bg-white'} ${selected ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${today ? 'bg-blue-600 text-white' : selected ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>{format(day, 'd')}</span>
                      {dayEvents.length > 3 && <span className="text-[10px] font-bold text-slate-400">+{dayEvents.length - 3}</span>}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const type = EVENT_TYPES[event.event_type] || EVENT_TYPES.other;
                        return (
                          <button
                            type="button"
                            key={event.id}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              setSelectedDate(day);
                              setHoveredEvent(null);
                              openEditEvent(event);
                            }}
                            onMouseEnter={() => setHoveredEvent(event)}
                            onMouseLeave={() => setHoveredEvent(null)}
                            className="flex w-full min-w-0 items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-1 text-left transition hover:bg-slate-100 hover:shadow-sm"
                            title={event.title}
                          >
                            <EventUserAvatar event={event} />
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${type.dot}`} />
                            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-700">{event.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {loadingEvents && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Atualizando agenda...</div>}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Agenda do dia</p>
                <h2 className="mt-1 text-lg font-black capitalize text-slate-900">{format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}</h2>
              </div>
              <button onClick={() => openCreateEvent('post')} className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"><Plus size={18} /></button>
            </div>

            {selectedEvents.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Dia livre" text="Nenhum compromisso marcado para esta data." />
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((event) => <EventRow key={event.id} event={event} currentUserId={user?.id} onOpen={() => openEditEvent(event)} onHover={setHoveredEvent} />)}
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-500">Bloco de notas</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Minhas notas</h2>
              </div>
              <button onClick={() => openNote()} className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100"><Plus size={17} /></button>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <EmptyState icon={FileText} title="Sem notas" text="Crie lembretes rápidos para o seu dia." compact />
              ) : notes.map((note) => (
                <div key={note.id} className="group rounded-2xl border border-amber-100 bg-amber-50/50 p-3">
                  <div className="flex items-start gap-2">
                    {Number(note.pinned) === 1 && <Pin size={13} className="mt-0.5 shrink-0 text-amber-500" />}
                    <button onClick={() => openNote(note)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-slate-800">{note.title}</p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">{note.content || 'Nota sem conteúdo.'}</p>
                    </button>
                    <button onClick={() => deleteNote(note)} className="opacity-0 transition group-hover:opacity-100 text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-500">Checklist do dia</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black capitalize text-slate-900">{isSameDay(selectedDate, todayDate()) ? 'Hoje' : format(selectedDate, "d 'de' MMMM", { locale: ptBR })}</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{completedChecklist}/{checklist.length}</span>
              </div>
            </div>

            <form onSubmit={addChecklist} className="mb-3 flex gap-2">
              <input value={checkInput} onChange={(e) => setCheckInput(e.target.value)} placeholder="Adicionar ao checklist..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
              <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"><Plus size={17} /></button>
            </form>

            <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {checkLoading ? <p className="py-5 text-center text-xs text-slate-400">Carregando checklist...</p> : checklist.length === 0 ? (
                <EmptyState icon={CheckSquare} title="Checklist vazio" text="Adicione as prioridades desse dia." compact />
              ) : checklist.map((item) => (
                <div key={item.id} className="group flex items-start gap-2 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                  <button onClick={() => toggleChecklist(item)} className={`mt-0.5 shrink-0 ${Number(item.completed) ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}>
                    {Number(item.completed) ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                  </button>
                  <button onClick={() => toggleChecklist(item)} className={`min-w-0 flex-1 text-left text-sm leading-5 ${Number(item.completed) ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.title}</button>
                  <button onClick={() => deleteChecklist(item)} className="mt-0.5 opacity-0 text-slate-300 transition hover:text-red-500 group-hover:opacity-100"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
        </>
      )}

      {hoveredEvent && activeSection === 'agenda' && (
        <EventHoverPanel event={hoveredEvent} />
      )}

      {activeSection === 'agenda' && eventModalOpen && (
        <ModalBackdrop onClose={() => !savingEvent && setEventModalOpen(false)} disabled={savingEvent}>
          <form onSubmit={saveEvent} className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">Agenda</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">{eventForm.id ? 'Editar compromisso' : 'Novo compromisso'}</h2>
              </div>
              <button type="button" onClick={() => setEventModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={17} /></button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Título</span>
                <input autoFocus value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Gravação Instituto Espinel" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Tipo</span>
                <select value={eventForm.event_type} onChange={(e) => setEventForm((f) => ({ ...f, event_type: e.target.value, visibility: e.target.value === 'personal' ? 'private' : f.visibility }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                  {Object.entries(EVENT_TYPES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Cliente</span>
                <select value={eventForm.client_id} onChange={(e) => setEventForm((f) => ({ ...f, client_id: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                  <option value="">Sem cliente</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Data</span>
                <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </label>

              <label className="flex items-end pb-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={eventForm.all_day} onChange={(e) => setEventForm((f) => ({ ...f, all_day: e.target.checked }))} /> Dia inteiro</span>
              </label>

              {!eventForm.all_day && <>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Início</span>
                  <input type="time" value={eventForm.start_time} onChange={(e) => setEventForm((f) => ({ ...f, start_time: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Fim</span>
                  <input type="time" value={eventForm.end_time} onChange={(e) => setEventForm((f) => ({ ...f, end_time: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </label>
              </>}

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Visibilidade</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEventForm((f) => ({ ...f, visibility: 'team' }))} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${eventForm.visibility === 'team' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}><Users size={15} className="mr-2 inline" />Equipe</button>
                  <button type="button" onClick={() => setEventForm((f) => ({ ...f, visibility: 'private' }))} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${eventForm.visibility === 'private' ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500'}`}><Lock size={15} className="mr-2 inline" />Somente eu</button>
                </div>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">Observações</span>
                <textarea rows={3} value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Informações importantes, endereço, pauta..." className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
              </label>
            </div>

            {eventError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{eventError}</p>}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>{eventForm.id && <button type="button" onClick={deleteEvent} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEventModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>
                <button disabled={savingEvent} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{savingEvent ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {activeSection === 'agenda' && noteEditorOpen && (
        <ModalBackdrop onClose={() => !savingNote && setNoteEditorOpen(false)} disabled={savingNote}>
          <form onSubmit={saveNote} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-[#fffdf4] p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-500">Bloco de notas</p><h2 className="mt-1 text-xl font-black text-slate-900">{noteForm.id ? 'Editar nota' : 'Nova nota'}</h2></div>
              <button type="button" onClick={() => setNoteEditorOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-sm"><X size={17} /></button>
            </div>
            <input value={noteForm.title} onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))} placeholder="Título" className="mb-3 w-full border-0 bg-transparent text-xl font-black text-slate-900 outline-none placeholder:text-slate-300" />
            <textarea autoFocus={!noteForm.id} rows={9} value={noteForm.content} onChange={(e) => setNoteForm((f) => ({ ...f, content: e.target.value }))} placeholder="Escreva aqui..." className="w-full resize-none rounded-2xl border border-amber-100 bg-white/70 p-4 text-sm leading-6 text-slate-700 outline-none focus:border-amber-300" />
            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={noteForm.pinned} onChange={(e) => setNoteForm((f) => ({ ...f, pinned: e.target.checked }))} /><Pin size={14} /> Fixar nota</label>
              <button disabled={savingNote} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{savingNote ? 'Salvando...' : 'Salvar nota'}</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400"><Icon size={14} className="text-blue-500" />{label}</div>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function EventUserAvatar({ event, sizeClass = 'h-4 w-4' }) {
  const initials = String(event?.user_name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || '?';

  if (event?.user_avatar) {
    return <img src={event.user_avatar} alt={event.user_name || ''} className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-white`} />;
  }

  return (
    <span
      className={`${sizeClass} grid shrink-0 place-items-center rounded-full text-[7px] font-black text-white ring-1 ring-white`}
      style={{ backgroundColor: event?.user_avatar_color || '#2563eb' }}
      aria-label={event?.user_name || 'Responsável'}
    >
      {initials}
    </span>
  );
}

function EventHoverPanel({ event }) {
  const type = EVENT_TYPES[event?.event_type] || EVENT_TYPES.other;
  const Icon = type.icon;
  const description = String(event?.notes || '').trim() || 'Sem descrição adicionada para este compromisso.';

  return (
    <aside className="pointer-events-none fixed right-5 top-[76px] z-[70] w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
      <div className="border-b border-slate-100 bg-slate-50/80 p-4">
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${type.chip}`}><Icon size={17} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Compromisso</p>
            <h3 className="mt-1 break-words text-base font-black leading-5 text-slate-900">{event?.title}</h3>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Descrição</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold text-slate-400">Horário</p>
            <p className="mt-1 font-semibold text-slate-700">{timeLabel(event)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold text-slate-400">Cliente</p>
            <p className="mt-1 truncate font-semibold text-slate-700">{event?.client_name || 'Sem cliente'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 p-3">
          <EventUserAvatar event={event} sizeClass="h-7 w-7" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Adicionado por</p>
            <p className="truncate text-xs font-bold text-slate-700">{event?.user_name || 'Equipe'}</p>
          </div>
        </div>
        <p className="text-[10px] font-medium text-slate-400">Clique no compromisso para abrir os detalhes.</p>
      </div>
    </aside>
  );
}

function EventRow({ event, currentUserId, onOpen, onHover }) {
  const type = EVENT_TYPES[event.event_type] || EVENT_TYPES.other;
  const Icon = type.icon;
  const editable = Number(event.user_id) === Number(currentUserId);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => onHover?.(event)}
      onMouseLeave={() => onHover?.(null)}
      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:border-slate-200 hover:bg-white hover:shadow-sm"
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${type.chip}`}><Icon size={17} /></div>
      <EventUserAvatar event={event} sizeClass="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-slate-800">{event.title}</p>{event.visibility === 'private' && <Lock size={11} className="shrink-0 text-slate-400" />}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Clock3 size={11} />{timeLabel(event)}</span>
          {event.client_name && <span className="font-semibold text-blue-500">{event.client_name}</span>}
          {event.user_name && <span>{event.user_name}</span>}
        </div>
      </div>
      {editable ? <Pencil size={14} className="shrink-0 text-slate-300 transition group-hover:text-blue-500" /> : <MoreHorizontal size={14} className="shrink-0 text-slate-300" />}
    </button>
  );
}

function EmptyState({ icon: Icon, title, text, compact = false }) {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-200 text-center ${compact ? 'px-3 py-6' : 'px-4 py-10'}`}>
      <Icon size={compact ? 22 : 28} className="mx-auto text-slate-300" />
      <p className="mt-2 text-sm font-bold text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{text}</p>
    </div>
  );
}
