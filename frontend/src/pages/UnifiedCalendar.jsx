import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clapperboard,
  Clock3,
  Filter,
  Flag,
  ListChecks,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { hasPermission } from '../permissions.js';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const TYPE_META = {
  recording: { label: 'Gravações', singular: 'Gravação', icon: Clapperboard, color: '#EC0567', soft: 'rgba(236,5,103,.09)' },
  delivery: { label: 'Entregas', singular: 'Entrega', icon: ListChecks, color: '#3A85FD', soft: 'rgba(58,133,253,.09)' },
  approval: { label: 'Aprovações', singular: 'Aprovação', icon: Flag, color: '#17181C', soft: 'rgba(23,24,28,.07)' },
  post: { label: 'Postagens', singular: 'Postagem', icon: Megaphone, color: '#5F7F00', soft: 'rgba(201,255,47,.24)' },
  meeting: { label: 'Reuniões', singular: 'Reunião', icon: Users, color: '#5B4AE8', soft: 'rgba(91,74,232,.09)' },
  event: { label: 'Eventos', singular: 'Evento', icon: Sparkles, color: '#718096', soft: 'rgba(113,128,150,.10)' },
};

function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = base.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(base, delta);
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function startOfMonthGrid(date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonthGrid(date) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const start = startOfWeek(last);
  return addDays(start, 6);
}

function formatTime(value) {
  const match = String(value || '').match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : dateFromKey(String(value).slice(0, 10));
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function rangeLabel(view, cursor) {
  if (view === 'month') return `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;
  const start = startOfWeek(cursor);
  const end = endOfWeek(cursor);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} de ${MONTHS[start.getMonth()]} de ${end.getFullYear()}`;
  return `${formatShortDate(start)} – ${formatShortDate(end)} de ${end.getFullYear()}`;
}

function statusLabel(value) {
  const labels = {
    todo: 'A fazer', in_progress: 'Produção', correction: 'Correção', approval: 'Aprovação', approved: 'Aprovado',
    dated: 'Datado', scheduled: 'Agendado', posted: 'Postado', published: 'Publicado', recorded: 'Gravado', pending_approval: 'Em aprovação', draft: 'Rascunho',
  };
  return labels[String(value || '').toLowerCase()] || String(value || 'Sem status').replaceAll('_', ' ');
}

function EventCard({ event, compact = false, onOpen }) {
  const meta = TYPE_META[event.type] || TYPE_META.event;
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`group w-full min-w-0 text-left transition ${compact ? 'rounded-xl px-2 py-1.5' : 'rounded-2xl border border-slate-100 bg-white px-3 py-3 hover:border-slate-200 hover:shadow-sm'}`}
      style={compact ? { backgroundColor: meta.soft } : undefined}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {!compact && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: meta.soft, color: meta.color }}>
            <Icon size={15} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {compact && <Circle size={7} fill={meta.color} strokeWidth={0} style={{ color: meta.color }} className="shrink-0" />}
            <span className={`${compact ? 'text-[10px]' : 'text-[10px]'} shrink-0 font-black uppercase tracking-[0.08em]`} style={{ color: meta.color }}>
              {event.all_day ? 'Dia todo' : formatTime(event.start_at)}
            </span>
            <span className="truncate text-[10px] font-bold text-slate-400">{event.client_name}</span>
          </div>
          <p className={`mt-0.5 truncate font-black text-slate-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>{event.title}</p>
          {!compact && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-400">
              <span>{event.type_label || meta.singular}</span>
              {event.responsible_names?.[0] && <span>· {event.responsible_names[0]}</span>}
              {event.status && <span>· {statusLabel(event.status)}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function NewEventModal({ clients, initialDay, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    event_type: 'meeting',
    day: initialDay || dayKey(new Date()),
    time: '09:00',
    end_time: '10:00',
    all_day: false,
    client_id: '',
    notes: '',
    visibility: 'team',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Dê um nome ao compromisso.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const start = form.all_day ? form.day : `${form.day}T${form.time}:00`;
      const end = form.all_day ? form.day : `${form.day}T${form.end_time || form.time}:00`;
      await api.post('/organizer/events', {
        title: form.title.trim(),
        event_type: form.event_type,
        start_at: start,
        end_at: end,
        all_day: form.all_day,
        client_id: form.client_id || null,
        notes: form.notes || null,
        visibility: form.event_type === 'personal' ? 'private' : form.visibility,
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar o compromisso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={submit} className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#3A85FD]">Calendário operacional</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#17181C]">NOVO COMPROMISSO.</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error && <div className="rounded-xl bg-[#EC0567]/[0.07] px-3 py-2 text-xs font-bold text-[#B40049]">{error}</div>}
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">O que vai acontecer?</span>
            <input autoFocus className="input-field mt-1.5 w-full" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="Ex.: Reunião de alinhamento" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Tipo</span>
              <select className="input-field mt-1.5 w-full" value={form.event_type} onChange={(e) => setForm((current) => ({ ...current, event_type: e.target.value }))}>
                <option value="meeting">Reunião</option>
                <option value="other">Evento / compromisso</option>
                <option value="personal">Pessoal</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Cliente</span>
              <select className="input-field mt-1.5 w-full" value={form.client_id} onChange={(e) => setForm((current) => ({ ...current, client_id: e.target.value }))}>
                <option value="">Zebrazul / sem cliente</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1.3fr_.8fr_.8fr]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Data</span>
              <input type="date" className="input-field mt-1.5 w-full" value={form.day} onChange={(e) => setForm((current) => ({ ...current, day: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Começa</span>
              <input type="time" disabled={form.all_day} className="input-field mt-1.5 w-full disabled:opacity-40" value={form.time} onChange={(e) => setForm((current) => ({ ...current, time: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Termina</span>
              <input type="time" disabled={form.all_day} className="input-field mt-1.5 w-full disabled:opacity-40" value={form.end_time} onChange={(e) => setForm((current) => ({ ...current, end_time: e.target.value }))} />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <input type="checkbox" checked={form.all_day} onChange={(e) => setForm((current) => ({ ...current, all_day: e.target.checked }))} className="h-4 w-4 accent-[#3A85FD]" />
            <span>
              <span className="block text-sm font-black text-slate-800">Dia inteiro</span>
              <span className="block text-xs text-slate-400">Sem horário específico.</span>
            </span>
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Observação</span>
            <textarea rows={3} className="input-field mt-1.5 w-full resize-none" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Contexto, pauta, endereço ou lembrete..." />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-2.5 text-sm font-black text-white hover:bg-[#3A85FD] disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Criar compromisso
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export default function UnifiedCalendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [view, setView] = useState('week');
  const [scope, setScope] = useState('team');
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [responsibles, setResponsibles] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(selectedClient?.id ? String(selectedClient.id) : 'all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [responsibleFilter, setResponsibleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [newEventOpen, setNewEventOpen] = useState(false);

  useEffect(() => {
    setClientId(selectedClient?.id ? String(selectedClient.id) : 'all');
  }, [selectedClient?.id]);

  useEffect(() => {
    api.get('/clients').then((response) => setClients(response.data.clients || [])).catch(() => setClients([]));
  }, []);

  const range = useMemo(() => {
    const start = view === 'month' ? startOfMonthGrid(cursor) : startOfWeek(cursor);
    const end = view === 'month' ? endOfMonthGrid(cursor) : endOfWeek(cursor);
    return { from: dayKey(start), to: dayKey(end), start, end };
  }, [cursor, view]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await api.get('/operational-calendar', {
        params: {
          from: range.from,
          to: range.to,
          scope,
          ...(clientId !== 'all' ? { client_id: clientId } : {}),
        },
      });
      setEvents(Array.isArray(response.data?.events) ? response.data.events : []);
      setSummary(response.data?.summary || null);
      setResponsibles(Array.isArray(response.data?.responsibles) ? response.data.responsibles : []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível montar o calendário agora.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.from, range.to, scope, clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => load(true), 60000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const statuses = useMemo(() => [...new Set(events.map((event) => String(event.status || '')).filter(Boolean))].sort(), [events]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    if (statusFilter !== 'all' && String(event.status || '') !== statusFilter) return false;
    if (responsibleFilter !== 'all') {
      const matchById = (event.responsible_ids || []).some((id) => String(id) === responsibleFilter);
      const matchByName = (event.responsible_names || []).some((name) => `name:${name}` === responsibleFilter);
      if (!matchById && !matchByName) return false;
    }
    return true;
  }), [events, typeFilter, statusFilter, responsibleFilter]);

  const byDay = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((event) => {
      const key = String(event.start_at || '').slice(0, 10);
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [filteredEvents]);

  const summaryFiltered = useMemo(() => filteredEvents.reduce((acc, event) => {
    acc.total += 1;
    acc[event.type] = Number(acc[event.type] || 0) + 1;
    return acc;
  }, { total: 0, recording: 0, delivery: 0, approval: 0, post: 0, meeting: 0, event: 0 }), [filteredEvents]);

  function move(delta) {
    setCursor((current) => {
      const next = view === 'month'
        ? new Date(current.getFullYear(), current.getMonth() + delta, 1)
        : addDays(current, delta * 7);
      setSelectedDay(dayKey(next));
      return next;
    });
  }

  function goToday() {
    const now = new Date();
    setCursor(now);
    setSelectedDay(dayKey(now));
  }

  function openEvent(event) {
    if (event.link) navigate(event.link);
  }

  const canCreateEvent = hasPermission(user, 'organizer.view');
  const today = dayKey(new Date());
  const selectedItems = byDay.get(selectedDay) || [];

  const visibleDays = useMemo(() => {
    const days = [];
    for (let current = new Date(range.start); current <= range.end; current = addDays(current, 1)) days.push(new Date(current));
    return days;
  }, [range.start, range.end]);

  const heroHeadline = (() => {
    if (summaryFiltered.total === 0) return 'TEM ESPAÇO AQUI. MILAGRE.';
    if (view === 'month') return 'O MÊS TÁ NO MAPA.';
    return summary?.headline || 'A SEMANA TÁ NO MAPA.';
  })();

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#17181C] text-white">
        <div className="grid gap-5 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#C9FF2F]"><CalendarDays size={16} /><p className="text-[10px] font-black uppercase tracking-[0.2em]">Calendário operacional</p></div>
            <h1 className="mt-3 max-w-3xl text-[28px] font-black uppercase leading-[0.96] tracking-[-0.045em] sm:text-[38px]">{heroHeadline}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
              Gravação, entrega, aprovação, postagem e reunião no mesmo tempo. {clientId === 'all' ? 'Operação inteira.' : `Recorte: ${clients.find((client) => String(client.id) === clientId)?.name || 'cliente selecionado'}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateEvent && <button type="button" onClick={() => setNewEventOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#C9FF2F] px-4 text-xs font-black text-[#17181C] hover:bg-white"><CalendarPlus size={15} /> Novo compromisso</button>}
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/10 px-4 text-xs font-black text-white hover:bg-white/15 disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar</button>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
          {[
            ['Gravações', summaryFiltered.recording, '#EC0567'],
            ['Entregas', summaryFiltered.delivery, '#3A85FD'],
            ['Aprovações', summaryFiltered.approval, '#FFFFFF'],
            ['Postagens', summaryFiltered.post, '#C9FF2F'],
          ].map(([label, value, color]) => (
            <div key={label} className="border-r border-white/10 px-5 py-4 last:border-r-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black tracking-[-0.04em]" style={{ color }}>{Number(value || 0)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {[['week', 'Semana'], ['month', 'Mês']].map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`rounded-lg px-3 py-2 text-xs font-black transition ${view === key ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:bg-white'}`}>{label}</button>)}
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 p-1">
              {[['team', 'Operação'], ['mine', 'Minha agenda']].map(([key, label]) => <button key={key} type="button" onClick={() => setScope(key)} className={`rounded-lg px-3 py-2 text-xs font-black transition ${scope === key ? 'bg-[#3A85FD] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input-field h-10 min-w-[170px] py-0 text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="all">Todos os clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <button type="button" onClick={goToday} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50">Hoje</button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400"><Filter size={12} /> Ver</span>
            <button type="button" onClick={() => setTypeFilter('all')} className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${typeFilter === 'all' ? 'bg-[#17181C] text-white' : 'bg-slate-100 text-slate-500'}`}>Tudo</button>
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <button key={key} type="button" onClick={() => setTypeFilter(key)} className={`rounded-full px-2.5 py-1.5 text-[10px] font-black transition ${typeFilter === key ? 'text-white' : 'text-slate-600'}`} style={{ backgroundColor: typeFilter === key ? meta.color : meta.soft }}>{meta.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input-field h-9 min-w-[155px] py-0 text-xs" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
              <option value="all">Todo responsável</option>
              {responsibles.map((person) => <option key={person.id ? `id:${person.id}` : `name:${person.name}`} value={person.id ? String(person.id) : `name:${person.name}`}>{person.name}</option>)}
            </select>
            <select className="input-field h-9 min-w-[140px] py-0 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todo status</option>
              {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-[#EC0567]/20 bg-[#EC0567]/[0.06] px-4 py-3 text-sm font-bold text-[#B40049]">{error}</div>}

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-3 py-3 sm:px-5">
          <button type="button" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Período anterior"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <p className="text-sm font-black text-slate-900">{rangeLabel(view, cursor)}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{summaryFiltered.total} compromisso{summaryFiltered.total === 1 ? '' : 's'} no recorte</p>
          </div>
          <button type="button" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Próximo período"><ChevronRight size={20} /></button>
        </header>

        {loading ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" />
            <p className="mt-3 text-sm font-black text-slate-700">JUNTANDO AS PONTAS.</p>
            <p className="mt-1 text-xs text-slate-400">Produção, gravação, publicação e agenda no mesmo mapa.</p>
          </div>
        ) : view === 'week' ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-7 divide-x divide-slate-100">
              {visibleDays.map((date, index) => {
                const key = dayKey(date);
                const dayEvents = byDay.get(key) || [];
                const isToday = key === today;
                return (
                  <div key={key} className={`min-h-[480px] p-2.5 ${isToday ? 'bg-[#C9FF2F]/[0.07]' : ''}`}>
                    <button type="button" onClick={() => setSelectedDay(key)} className="mb-3 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{WEEKDAYS[index]}</span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${isToday ? 'bg-[#17181C] text-[#C9FF2F]' : 'text-slate-800'}`}>{date.getDate()}</span>
                    </button>
                    <div className="space-y-2">
                      {dayEvents.length ? dayEvents.map((event) => <EventCard key={event.id} event={event} onOpen={openEvent} />) : <div className="rounded-xl border border-dashed border-slate-100 px-2 py-6 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-slate-300">livre</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
                {WEEKDAYS.map((day) => <div key={day} className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{day}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {visibleDays.map((date) => {
                  const key = dayKey(date);
                  const dayEvents = byDay.get(key) || [];
                  const isToday = key === today;
                  const outside = date.getMonth() !== cursor.getMonth();
                  return (
                    <div key={key} className={`min-h-[138px] border-b border-r border-slate-100 p-2 align-top transition ${outside ? 'bg-slate-50/40' : ''} ${selectedDay === key ? 'ring-2 ring-inset ring-[#3A85FD]/30' : ''}`}>
                      <button type="button" onClick={() => setSelectedDay(key)} className="mb-2 flex w-full items-center justify-between rounded-lg text-left hover:bg-slate-50">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${isToday ? 'bg-[#17181C] text-[#C9FF2F]' : outside ? 'text-slate-300' : 'text-slate-700'}`}>{date.getDate()}</span>
                        {dayEvents.length > 0 && <span className="pr-1 text-[9px] font-black uppercase tracking-[0.06em] text-slate-300">{dayEvents.length}</span>}
                      </button>
                      <div className="space-y-1.5">
                        {dayEvents.slice(0, 4).map((event) => <EventCard key={event.id} event={event} compact onOpen={openEvent} />)}
                        {dayEvents.length > 4 && <button type="button" onClick={() => setSelectedDay(key)} className="block px-2 text-[10px] font-black text-[#3A85FD]">+ {dayEvents.length - 4} no dia</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3A85FD]">Agenda do dia</p>
            <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(dateFromKey(selectedDay))}</h2>
          </div>
          {canCreateEvent && <button type="button" onClick={() => setNewEventOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50"><CalendarPlus size={14} /> Adicionar</button>}
        </div>
        {selectedItems.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{selectedItems.map((event) => <EventCard key={event.id} event={event} onOpen={openEvent} />)}</div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
            <Clock3 size={20} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-black text-slate-700">Nada marcado aqui.</p>
            <p className="mt-1 text-xs text-slate-400">Um raro espaço em branco na operação.</p>
          </div>
        )}
      </section>

      <p className="px-1 pb-2 text-[11px] leading-5 text-slate-400">O calendário reúne fontes que já existem no ZebraHub. Alterar uma tarefa, gravação ou publicação continua acontecendo na área de origem — o calendário é o mapa da operação.</p>

      {newEventOpen && <NewEventModal clients={clients} initialDay={selectedDay} onClose={() => setNewEventOpen(false)} onCreated={() => load(true)} />}
    </div>
  );
}
