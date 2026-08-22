import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sameCalendarDate(value, year, month, day) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month
    && date.getDate() === day;
}

export default function CalendarView({ embedded = false, clientId: controlledClientId, onOpenPost }) {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState(
    user?.role === 'client' ? user.client_id : (selectedClient?.id || 'all')
  );
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(new Date());
  const [dayPosts, setDayPosts] = useState(null);
  const [calendarDrag, setCalendarDrag] = useState(null);
  const [calendarDropDay, setCalendarDropDay] = useState(null);
  const [calendarFeedback, setCalendarFeedback] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [savingPostId, setSavingPostId] = useState(null);

  const clientId = controlledClientId ?? localClientId;
  const canManageCalendar = ['admin', 'team'].includes(user?.role);

  useEffect(() => {
    if (embedded || user?.role === 'client') return;
    setLocalClientId(selectedClient?.id || 'all');
  }, [embedded, selectedClient, user]);

  useEffect(() => {
    if (embedded || user?.role === 'client') return;
    api.get('/clients').then((res) => setClients(res.data.clients));
  }, [embedded, user]);

  async function loadPosts(targetClientId = clientId) {
    if (!targetClientId) {
      setPosts([]);
      return;
    }

    const params = targetClientId !== 'all' ? `?client_id=${targetClientId}` : '';
    const res = await api.get(`/posts${params}`);
    setPosts(res.data.posts.filter((post) => post.scheduled_at && Number(post.feed_visible ?? 1) !== 0));
  }

  useEffect(() => {
    loadPosts(clientId).catch(() => setPosts([]));
  }, [clientId]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = buildMonthGrid(year, month);

  function postsForDay(day) {
    if (!day) return [];
    return posts.filter((post) => sameCalendarDate(post.scheduled_at, year, month, day));
  }

  function openCalendarDay(day, dayItems) {
    if (!day || calendarDrag || !dayItems.length) return;

    // Dentro do Feed, um dia com apenas uma publicação abre exatamente
    // a mesma prévia detalhada usada ao clicar na grade do Instagram.
    if (dayItems.length === 1 && onOpenPost) {
      onOpenPost(dayItems[0]);
      return;
    }

    setDayPosts({ day, items: dayItems });
  }

  function openCalendarPost(post) {
    if (!post || calendarDrag) return;

    if (onOpenPost) {
      setDayPosts(null);
      onOpenPost(post);
      return;
    }
  }

  function changeMonth(delta) {
    setCursor(new Date(year, month + delta, 1));
    setDayPosts(null);
    setCalendarDrag(null);
    setCalendarDropDay(null);
  }

  function scheduledAtForDay(post, day) {
    const original = new Date(post.scheduled_at);
    const target = new Date(
      year,
      month,
      day,
      Number.isNaN(original.getTime()) ? 12 : original.getHours(),
      Number.isNaN(original.getTime()) ? 0 : original.getMinutes(),
      Number.isNaN(original.getTime()) ? 0 : original.getSeconds(),
      0
    );
    return target.toISOString();
  }

  function handleCalendarDragStart(event, post) {
    if (!canManageCalendar || savingPostId) {
      event.preventDefault();
      return;
    }

    const copyRequested = Boolean(event.altKey);
    event.stopPropagation();
    event.dataTransfer.setData('text/post-id', String(post.id));
    event.dataTransfer.setData('text/plain', String(post.id));
    event.dataTransfer.effectAllowed = 'copyMove';
    setCalendarDrag({ id: Number(post.id), copyRequested });
    setCalendarFeedback('');
    setCalendarError('');
  }

  function handleCalendarDragOver(event, day) {
    if (!day || !calendarDrag || !canManageCalendar) return;
    event.preventDefault();
    event.stopPropagation();
    const copyRequested = Boolean(event.altKey || calendarDrag.copyRequested);
    event.dataTransfer.dropEffect = copyRequested ? 'copy' : 'move';
    setCalendarDrag((current) => current && current.copyRequested !== copyRequested
      ? { ...current, copyRequested }
      : current);
    setCalendarDropDay(day);
  }

  function handleCalendarDragEnd() {
    setCalendarDrag(null);
    setCalendarDropDay(null);
  }

  async function handleCalendarDrop(event, day) {
    event.preventDefault();
    event.stopPropagation();
    if (!day || !canManageCalendar) {
      handleCalendarDragEnd();
      return;
    }

    const postId = Number(
      event.dataTransfer.getData('text/post-id')
      || event.dataTransfer.getData('text/plain')
      || calendarDrag?.id
    );
    const post = posts.find((item) => Number(item.id) === postId);
    if (!post) {
      setCalendarError('Não foi possível identificar a publicação arrastada.');
      handleCalendarDragEnd();
      return;
    }

    const shouldCopy = Boolean(event.altKey || calendarDrag?.copyRequested);
    if (!shouldCopy && sameCalendarDate(post.scheduled_at, year, month, day)) {
      handleCalendarDragEnd();
      return;
    }

    const scheduledAt = scheduledAtForDay(post, day);
    setSavingPostId(postId);
    setCalendarError('');

    try {
      if (shouldCopy) {
        const { data } = await api.post(`/posts/${postId}/duplicate`, { scheduled_at: scheduledAt });
        if (data.post) {
          setPosts((current) => [...current, data.post]);
        } else {
          await loadPosts();
        }
        setCalendarFeedback(`Publicação duplicada para ${day} de ${MONTHS[month]}.`);
      } else {
        await api.put(`/posts/${postId}`, { scheduled_at: scheduledAt });
        setPosts((current) => current.map((item) => (
          Number(item.id) === postId ? { ...item, scheduled_at: scheduledAt } : item
        )));
        setCalendarFeedback(`Publicação movida para ${day} de ${MONTHS[month]}.`);
      }

      window.setTimeout(() => setCalendarFeedback(''), 2800);
    } catch (error) {
      setCalendarError(error.response?.data?.error || (shouldCopy
        ? 'Não foi possível duplicar a publicação.'
        : 'Não foi possível alterar a data da publicação.'));
    } finally {
      setSavingPostId(null);
      handleCalendarDragEnd();
    }
  }

  return (
    <div className={`min-w-0 ${embedded ? '' : 'space-y-6'}`}>
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Calendário</h1>
            <p className="text-slate-500 mt-1">Datas de publicação agendadas por cliente.</p>
          </div>
          {user?.role !== 'client' && clients.length > 0 && (
            <select className="input-field w-56" value={localClientId} onChange={(event) => setLocalClientId(event.target.value)}>
              <option value="all">Todos os clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          )}
        </div>
      )}

      {!clientId ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          Selecione um cliente para visualizar o calendário.
        </div>
      ) : (
        <div className="card p-5 min-w-0 overflow-hidden">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Mês anterior">
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-slate-800">{MONTHS[month]} de {year}</h2>
                {canManageCalendar && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Arraste para alterar a data · segure Alt/Option para duplicar
                  </p>
                )}
              </div>
              <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Próximo mês">
                <ChevronRight size={20} />
              </button>
            </div>

            {calendarFeedback && (
              <div className="mx-auto mt-3 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                {calendarFeedback}
              </div>
            )}
            {calendarError && (
              <div className="mx-auto mt-3 w-fit max-w-full rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                {calendarError}
              </div>
            )}
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400 mb-2">
                {WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((day, index) => {
                  const dayItems = postsForDay(day);
                  const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
                  const isDropTarget = Boolean(day && calendarDrag && calendarDropDay === day);
                  return (
                    <div
                      key={`${day || 'empty'}-${index}`}
                      onClick={() => openCalendarDay(day, dayItems)}
                      onDragOver={(event) => handleCalendarDragOver(event, day)}
                      onDragEnter={(event) => {
                        if (day && calendarDrag && canManageCalendar) {
                          event.preventDefault();
                          setCalendarDropDay(day);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget)) return;
                        setCalendarDropDay((current) => current === day ? null : current);
                      }}
                      onDrop={(event) => handleCalendarDrop(event, day)}
                      className={`h-32 rounded-lg border p-1.5 text-left flex flex-col min-w-0 transition ${
                        !day ? 'border-transparent' : 'border-slate-100 hover:border-zebrazul-300'
                      } ${day && dayItems.length > 0 && !calendarDrag ? 'cursor-pointer' : ''} ${
                        isToday ? 'ring-2 ring-zebrazul-400' : ''
                      } ${isDropTarget ? (
                        calendarDrag.copyRequested
                          ? 'border-violet-400 bg-violet-50 ring-4 ring-violet-100'
                          : 'border-zebrazul-400 bg-zebrazul-50 ring-4 ring-zebrazul-100'
                      ) : ''}`}
                    >
                      {day && (
                        <>
                          <span className="text-xs text-slate-500">{day}</span>
                          <div className="flex-1 min-h-0 mt-1 space-y-1 overflow-hidden">
                            {dayItems.slice(0, 2).map((post) => (
                              <div
                                key={post.id}
                                className={`group/post relative w-full rounded overflow-hidden bg-slate-100 ${
                                  dayItems.length === 1 ? 'h-full' : 'h-[calc(50%_-_2px)]'
                                } ${Number(savingPostId) === Number(post.id) ? 'opacity-60' : ''}`}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (calendarDrag || savingPostId) return;
                                    if (onOpenPost) {
                                      openCalendarPost(post);
                                    } else {
                                      setDayPosts({ day, items: dayItems });
                                    }
                                  }}
                                  title={`${post.title || 'Publicação'} · abrir prévia completa do Feed`}
                                  className="absolute inset-0 z-[1] flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zebrazul-500 focus-visible:ring-inset"
                                  aria-label={`Abrir ${post.title || 'publicação'} na prévia do Feed`}
                                >
                                  {post.media_data ? (
                                    <img src={post.media_data} alt="" draggable={false} className="h-full w-full object-cover pointer-events-none" />
                                  ) : (
                                    <ImageIcon size={14} className="text-slate-300" />
                                  )}
                                </button>

                                {canManageCalendar && !savingPostId && (
                                  <div
                                    draggable
                                    onDragStart={(event) => handleCalendarDragStart(event, post)}
                                    onDragEnd={handleCalendarDragEnd}
                                    onClick={(event) => event.stopPropagation()}
                                    title="Arraste para alterar a data · Alt/Option para duplicar"
                                    className="absolute left-1.5 top-1.5 z-[3] flex h-7 w-7 cursor-grab items-center justify-center rounded-lg bg-slate-950/70 text-white opacity-0 shadow-sm backdrop-blur-sm transition group-hover/post:opacity-100 active:cursor-grabbing"
                                    aria-label="Arrastar publicação"
                                  >
                                    <GripVertical size={14} />
                                  </div>
                                )}

                                {Number(savingPostId) === Number(post.id) && (
                                  <div className="absolute inset-0 z-[4] flex items-center justify-center bg-white/55">
                                    <Loader2 size={16} className="animate-spin text-zebrazul-600" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {dayItems.length > 0 && (
                            <span className="text-[9px] text-zebrazul-600 font-medium mt-1">
                              {dayItems.length} post{dayItems.length > 1 ? 's' : ''}{dayItems.length > 2 ? ' · ver todos' : ''}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {dayPosts && (
        <ModalBackdrop onClose={() => setDayPosts(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 min-w-0 break-words">
                  Publicações — {dayPosts.day} de {MONTHS[month]}
                </h2>
                {canManageCalendar && (
                  <p className="mt-1 text-[11px] text-slate-400">Feche esta janela para arrastar as publicações no calendário.</p>
                )}
              </div>
              <button onClick={() => setDayPosts(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" aria-label="Fechar">×</button>
            </div>
            <div className="space-y-3">
              {dayPosts.items.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => openCalendarPost(post)}
                  disabled={!onOpenPost}
                  className={`flex w-full gap-3 rounded-lg border border-slate-100 p-3 text-left min-w-0 transition ${
                    onOpenPost ? 'hover:border-zebrazul-200 hover:bg-zebrazul-50/40 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {post.media_data ? (
                      <img src={post.media_data} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm truncate">{post.title}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(post.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="mt-1"><StatusBadge status={post.status} /></div>
                    {onOpenPost && (
                      <p className="mt-2 text-[11px] font-medium text-zebrazul-600">Abrir prévia completa do Feed</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
