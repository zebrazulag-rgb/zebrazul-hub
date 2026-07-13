import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function CalendarView() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : 'all');
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(new Date());
  const [dayPosts, setDayPosts] = useState(null);

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => setClients(res.data.clients));
    }
  }, [user]);

  useEffect(() => {
    const params = clientId && clientId !== 'all' ? `?client_id=${clientId}` : '';
    api.get(`/posts${params}`).then((res) => setPosts(res.data.posts.filter((p) => p.scheduled_at)));
  }, [clientId]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = buildMonthGrid(year, month);

  function postsForDay(day) {
    if (!day) return [];
    return posts.filter((p) => {
      const d = new Date(p.scheduled_at);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function changeMonth(delta) {
    setCursor(new Date(year, month + delta, 1));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendário</h1>
          <p className="text-slate-500 mt-1">Datas de publicação agendadas por cliente.</p>
        </div>
        {user?.role !== 'client' && clients.length > 0 && (
          <select className="input-field w-56" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="all">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-semibold text-slate-800">{MONTHS[month]} de {year}</h2>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400 mb-2">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, idx) => {
            const dayItems = postsForDay(day);
            const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
            return (
              <button
                key={idx}
                disabled={!day}
                onClick={() => day && dayItems.length > 0 && setDayPosts({ day, items: dayItems })}
                className={`aspect-square rounded-lg border p-1.5 text-left flex flex-col ${
                  !day ? 'border-transparent' : 'border-slate-100 hover:border-zebrazul-300'
                } ${isToday ? 'ring-2 ring-zebrazul-400' : ''}`}
              >
                {day && (
                  <>
                    <span className="text-xs text-slate-500">{day}</span>
                    <div className="flex-1 flex flex-wrap gap-0.5 mt-1 overflow-hidden">
                      {dayItems.slice(0, 3).map((p) => (
                        <div key={p.id} className="w-full h-full min-h-[14px] rounded overflow-hidden bg-slate-100 flex items-center justify-center">
                          {p.media_data ? (
                            <img src={p.media_data} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={10} className="text-slate-300" />
                          )}
                        </div>
                      ))}
                    </div>
                    {dayItems.length > 0 && (
                      <span className="text-[9px] text-zebrazul-600 font-medium">{dayItems.length} post{dayItems.length > 1 ? 's' : ''}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {dayPosts && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">
                Publicações — {dayPosts.day} de {MONTHS[month]}
              </h2>
              <button onClick={() => setDayPosts(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {dayPosts.items.map((p) => (
                <div key={p.id} className="flex gap-3 border border-slate-100 rounded-lg p-3">
                  <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {p.media_data ? (
                      <img src={p.media_data} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm truncate">{p.title}</p>
                    <p className="text-xs text-slate-400">{new Date(p.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="mt-1"><StatusBadge status={p.status} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
