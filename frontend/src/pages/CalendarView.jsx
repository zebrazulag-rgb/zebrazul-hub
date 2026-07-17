import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
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

export default function CalendarView({ embedded = false, clientId: controlledClientId }) {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState(
    user?.role === 'client' ? user.client_id : (selectedClient?.id || 'all')
  );
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(new Date());
  const [dayPosts, setDayPosts] = useState(null);

  const clientId = controlledClientId ?? localClientId;

  useEffect(() => {
    if (embedded || user?.role === 'client') return;
    setLocalClientId(selectedClient?.id || 'all');
  }, [embedded, selectedClient, user]);

  useEffect(() => {
    if (embedded || user?.role === 'client') return;
    api.get('/clients').then((res) => setClients(res.data.clients));
  }, [embedded, user]);

  useEffect(() => {
    if (!clientId) {
      setPosts([]);
      return;
    }

    const params = clientId !== 'all' ? `?client_id=${clientId}` : '';
    api.get(`/posts${params}`).then((res) => {
      setPosts(res.data.posts.filter((post) => post.scheduled_at));
    });
  }, [clientId]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = buildMonthGrid(year, month);

  function postsForDay(day) {
    if (!day) return [];
    return posts.filter((post) => {
      const date = new Date(post.scheduled_at);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });
  }

  function changeMonth(delta) {
    setCursor(new Date(year, month + delta, 1));
    setDayPosts(null);
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
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Mês anterior">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-semibold text-slate-800">{MONTHS[month]} de {year}</h2>
            <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Próximo mês">
              <ChevronRight size={20} />
            </button>
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
                  return (
                    <button
                      key={`${day || 'empty'}-${index}`}
                      disabled={!day}
                      onClick={() => day && dayItems.length > 0 && setDayPosts({ day, items: dayItems })}
                      className={`h-32 rounded-lg border p-1.5 text-left flex flex-col min-w-0 ${
                        !day ? 'border-transparent' : 'border-slate-100 hover:border-zebrazul-300'
                      } ${isToday ? 'ring-2 ring-zebrazul-400' : ''}`}
                    >
                      {day && (
                        <>
                          <span className="text-xs text-slate-500">{day}</span>
                          <div className="flex-1 min-h-0 mt-1 overflow-hidden">
                            {dayItems.slice(0, 1).map((post) => (
                              <div key={post.id} className="w-full h-full rounded overflow-hidden bg-slate-100 flex items-center justify-center">
                                {post.media_data ? (
                                  <img src={post.media_data} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon size={14} className="text-slate-300" />
                                )}
                              </div>
                            ))}
                          </div>
                          {dayItems.length > 0 && (
                            <span className="text-[9px] text-zebrazul-600 font-medium mt-1">
                              {dayItems.length} post{dayItems.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </>
                      )}
                    </button>
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
              <h2 className="font-semibold text-slate-800 min-w-0 break-words">
                Publicações — {dayPosts.day} de {MONTHS[month]}
              </h2>
              <button onClick={() => setDayPosts(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0" aria-label="Fechar">×</button>
            </div>
            <div className="space-y-3">
              {dayPosts.items.map((post) => (
                <div key={post.id} className="flex gap-3 border border-slate-100 rounded-lg p-3 min-w-0">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
