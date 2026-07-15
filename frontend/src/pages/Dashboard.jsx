import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, AlertCircle, Users, ListChecks, CircleDot, CalendarDays } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPeriod(referenceDate, period) {
  const reference = new Date(`${referenceDate}T12:00:00`);
  if (period === 'week') {
    const day = reference.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(reference);
    start.setDate(reference.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

export default function Dashboard() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [referenceDate, setReferenceDate] = useState(isoDate(new Date()));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const requests = [api.get('/posts'), api.get('/clients')];
      if (user?.role === 'admin' || user?.role === 'team') {
        const suffix = selectedClient?.id ? `?client_id=${selectedClient.id}` : '';
        requests.push(api.get(`/tasks${suffix}`));
      }
      const results = await Promise.all(requests);
      setPosts(results[0].data.posts);
      setClients(results[1].data.clients);
      setTasks(results[2]?.data?.tasks || []);
      setLoading(false);
    }
    load();
  }, [user?.role, selectedClient?.id]);

  const pendingApproval = posts.filter((p) => p.status === 'pending_approval');
  const upcoming = posts
    .filter((p) => p.scheduled_at && new Date(p.scheduled_at) >= new Date())
    .slice(0, 5);

  const contentStats = [
    { label: 'Clientes ativos', value: clients.filter((c) => c.status === 'active').length, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Aguardando aprovação', value: pendingApproval.length, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Aprovados no período', value: posts.filter((p) => p.status === 'approved').length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Reprovados', value: posts.filter((p) => p.status === 'rejected').length, icon: AlertCircle, color: 'bg-red-50 text-red-600' }
  ];

  const taskStats = useMemo(() => {
    const { start, end } = getPeriod(referenceDate, period);
    const today = isoDate(new Date());
    const filtered = tasks.filter((task) => task.due_date && task.due_date.slice(0, 10) >= start && task.due_date.slice(0, 10) <= end);
    const overdue = filtered.filter((task) => task.status !== 'done' && task.due_date.slice(0, 10) < today);
    const pending = filtered.filter((task) => task.status !== 'done' && task.due_date.slice(0, 10) >= today);
    const done = filtered.filter((task) => task.status === 'done');
    return { total: filtered.length, pending: pending.length, overdue: overdue.length, done: done.length, start, end };
  }, [tasks, period, referenceDate]);

  if (loading) return <p className="text-slate-500">Carregando painel...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Olá, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-slate-500 mt-1">Visão geral da operação de conteúdo, aprovações e tarefas.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {contentStats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon size={20} /></div>
            <p className="text-2xl font-bold text-slate-800 mt-3">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {(user?.role === 'admin' || user?.role === 'team') && (
        <section className="card p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-slate-800">Indicadores de tarefas</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {taskStats.start.split('-').reverse().join('/')} até {taskStats.end.split('-').reverse().join('/')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
                <button onClick={() => setPeriod('week')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === 'week' ? 'bg-white shadow text-zebrazul-700' : 'text-slate-500'}`}>Semana</button>
                <button onClick={() => setPeriod('month')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === 'month' ? 'bg-white shadow text-zebrazul-700' : 'text-slate-500'}`}>Mês</button>
              </div>
              <label className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 bg-white">
                <CalendarDays size={16} className="text-slate-400" />
                <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="py-2 text-sm outline-none text-slate-700" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Tarefas existentes', value: taskStats.total, icon: ListChecks, color: 'bg-blue-50 text-blue-600' },
              { label: 'Tarefas pendentes', value: taskStats.pending, icon: CircleDot, color: 'bg-amber-50 text-amber-600' },
              { label: 'Tarefas atrasadas', value: taskStats.overdue, icon: AlertCircle, color: 'bg-red-50 text-red-600' },
              { label: 'Tarefas concluídas', value: taskStats.done, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' }
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}><s.icon size={18} /></div>
                <p className="text-2xl font-bold text-slate-800 mt-3">{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Pendentes de aprovação</h2>
            <Link to="/aprovacao" className="text-sm text-zebrazul-600 hover:underline">Ver tudo</Link>
          </div>
          {pendingApproval.length === 0 ? <p className="text-sm text-slate-400">Nenhum conteúdo aguardando aprovação. 🎉</p> : (
            <ul className="space-y-3">{pendingApproval.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm"><span className="text-slate-700 truncate mr-3">{p.title}</span><StatusBadge status={p.status} /></li>
            ))}</ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Próximas publicações agendadas</h2>
          {upcoming.length === 0 ? <p className="text-sm text-slate-400">Nenhuma publicação agendada ainda.</p> : (
            <ul className="space-y-3">{upcoming.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 truncate mr-3">{p.title}</span>
                <span className="text-slate-400 text-xs shrink-0">{new Date(p.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
