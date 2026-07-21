import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ListChecks,
  CircleDot,
  CalendarDays,
  ArrowUpRight,
  Sparkles,
  FileCheck2,
  CalendarClock,
  ChevronRight,
  Plus,
  Target,
  Star,
} from 'lucide-react';
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

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
}

function formatTaskDate(value) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const TASK_STATUS = {
  pending: { label: 'Pendente', className: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'Em andamento', className: 'bg-amber-100 text-amber-700' },
  done: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700' },
};

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
      try {
        const suffix = selectedClient?.id ? `?client_id=${selectedClient.id}` : '';
        const requests = [api.get('/posts'), api.get('/clients'), api.get(`/tasks${suffix}`)];
        const results = await Promise.all(requests);
        setPosts(results[0].data.posts || []);
        setClients(results[1].data.clients || []);
        setTasks(results[2].data.tasks || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.role, selectedClient?.id]);

  const pendingApproval = posts.filter((p) => p.status === 'pending_approval');
  const upcoming = posts
    .filter((p) => p.scheduled_at && new Date(p.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 5);

  const taskStats = useMemo(() => {
    const { start, end } = getPeriod(referenceDate, period);
    const today = isoDate(new Date());
    const filtered = tasks.filter((task) => task.due_date && task.due_date.slice(0, 10) >= start && task.due_date.slice(0, 10) <= end);
    const overdue = filtered.filter((task) => task.status !== 'done' && task.due_date.slice(0, 10) < today);
    const pending = filtered.filter((task) => task.status !== 'done' && task.due_date.slice(0, 10) >= today);
    const done = filtered.filter((task) => task.status === 'done');
    return { total: filtered.length, pending: pending.length, overdue: overdue.length, done: done.length, start, end };
  }, [tasks, period, referenceDate]);

  const completionRate = taskStats.total ? Math.round((taskStats.done / taskStats.total) * 100) : 0;
  const activeClients = clients.filter((c) => c.status === 'active').length;
  const featuredTasks = useMemo(() => tasks
    .filter((task) => Number(task.is_featured) === 1)
    .sort((a, b) => {
      const doneDifference = Number(a.status === 'done') - Number(b.status === 'done');
      if (doneDifference) return doneDifference;
      return String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'));
    }), [tasks]);

  const contentStats = [
    {
      label: 'Clientes ativos',
      value: activeClients,
      icon: Users,
      iconClass: 'bg-blue-50 text-[#0969ff]',
      accent: 'from-[#0969ff] to-[#4f8cff]',
      href: '/clientes',
    },
    {
      label: 'Aguardando aprovação',
      value: pendingApproval.length,
      icon: Clock,
      iconClass: 'bg-amber-50 text-amber-600',
      accent: 'from-amber-400 to-orange-400',
      href: '/aprovacao',
    },
    {
      label: 'Conteúdos aprovados',
      value: posts.filter((p) => p.status === 'approved').length,
      icon: CheckCircle2,
      iconClass: 'bg-emerald-50 text-emerald-600',
      accent: 'from-emerald-400 to-teal-400',
      href: '/aprovacao',
    },
    {
      label: 'Conteúdos reprovados',
      value: posts.filter((p) => p.status === 'rejected').length,
      icon: AlertCircle,
      iconClass: 'bg-rose-50 text-rose-600',
      accent: 'from-rose-400 to-red-500',
      href: '/aprovacao',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-52 rounded-[28px] bg-slate-200/70" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-36 rounded-2xl bg-slate-200/70" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[30px] bg-[#121620] px-7 py-7 text-white shadow-[0_20px_65px_rgba(18,22,32,0.18)] lg:px-9 lg:py-8">
        <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#0969ff]/35 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-medium text-white/65">
              <Sparkles size={14} className="text-[#63a0ff]" />
              {selectedClient?.name || 'Visão geral da operação'}
            </div>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Olá, {user?.name?.split(' ')[0]}.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/55 lg:text-base">
              Tudo que precisa da sua atenção está organizado aqui. Acompanhe tarefas, aprovações e publicações em um único lugar.
            </p>
            <p className="mt-5 text-xs font-medium capitalize tracking-wide text-white/35">{formatDate(new Date())}</p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link to="/tarefas" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] transition hover:-translate-y-0.5 hover:shadow-xl">
              <Plus size={17} /> Nova tarefa
            </Link>
            <Link to="/aprovacao" className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.055] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              Ver aprovações <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {contentStats.map((stat) => (
          <Link key={stat.label} to={stat.href} className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.045)] transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.accent}`} />
            <div className="flex items-start justify-between gap-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.iconClass}`}>
                <stat.icon size={20} strokeWidth={2.2} />
              </div>
              <ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-slate-500" />
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
          </Link>
        ))}
      </section>

      {(featuredTasks.length > 0 || user?.role === 'admin' || user?.role === 'team') && (
        <section className="rounded-[26px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white p-6 shadow-[0_12px_38px_rgba(146,64,14,0.06)]">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-[0_8px_22px_rgba(245,158,11,0.28)]">
                <Star size={20} fill="currentColor" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Tarefas em destaque</h2>
                <p className="text-xs text-slate-500">Prioridades escolhidas para permanecer visíveis no painel principal.</p>
              </div>
            </div>
            <Link to="/tarefas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 transition hover:text-amber-900">
              Gerenciar tarefas <ChevronRight size={15} />
            </Link>
          </div>

          {featuredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 px-5 py-7 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhuma prioridade destacada ainda.</p>
              <p className="mt-1 text-xs text-slate-400">Abra uma tarefa ou edite o cadastro e ative “Destacar no painel principal”.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featuredTasks.slice(0, 6).map((task) => {
                const status = TASK_STATUS[task.status] || TASK_STATUS.pending;
                return (
                  <Link
                    key={task.id}
                    to={`/tarefas?task_id=${task.id}`}
                    className="group rounded-2xl border border-amber-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_14px_30px_rgba(146,64,14,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{task.title}</p>
                        <p className="mt-1 truncate text-xs font-medium text-amber-700">{task.client_name || 'Tarefa interna'}</p>
                      </div>
                      <Star size={15} className="shrink-0 text-amber-500" fill="currentColor" />
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <CalendarDays size={12} /> {formatTaskDate(task.due_date)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {featuredTasks.length > 6 && (
            <p className="mt-4 text-center text-xs text-slate-400">Mais {featuredTasks.length - 6} tarefa{featuredTasks.length - 6 > 1 ? 's' : ''} em destaque na área de tarefas.</p>
          )}
        </section>
      )}

      {(user?.role === 'admin' || user?.role === 'team') && (
        <section className="overflow-hidden rounded-[26px] border border-slate-200/70 bg-white shadow-[0_10px_38px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0969ff]">
                  <ListChecks size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Desempenho das tarefas</h2>
                  <p className="text-xs text-slate-400">
                    {taskStats.start.split('-').reverse().join('/')} até {taskStats.end.split('-').reverse().join('/')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button onClick={() => setPeriod('week')} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === 'week' ? 'bg-white text-[#0969ff] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Semana</button>
                <button onClick={() => setPeriod('month')} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === 'month' ? 'bg-white text-[#0969ff] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Mês</button>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                <CalendarDays size={16} className="text-slate-400" />
                <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="py-2 text-sm text-slate-700 outline-none" />
              </label>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_280px]">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                { label: 'Existentes', value: taskStats.total, icon: ListChecks, color: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
                { label: 'Pendentes', value: taskStats.pending, icon: CircleDot, color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
                { label: 'Atrasadas', value: taskStats.overdue, icon: AlertCircle, color: 'bg-rose-50 text-rose-600', border: 'border-rose-100' },
                { label: 'Concluídas', value: taskStats.done, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-2xl border ${stat.border} bg-white p-4`}>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.color}`}>
                    <stat.icon size={17} />
                  </div>
                  <p className="mt-4 text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#121620] p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/35">Conclusão</span>
                <Target size={17} className="text-[#63a0ff]" />
              </div>
              <p className="mt-5 text-4xl font-bold">{completionRate}%</p>
              <p className="mt-1 text-sm text-white/45">das tarefas do período foram concluídas.</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#0969ff] to-[#63a0ff] transition-all" style={{ width: `${completionRate}%` }} />
              </div>
              <Link to="/tarefas" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 transition hover:text-white">
                Abrir tarefas <ChevronRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_34px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <FileCheck2 size={19} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Pendentes de aprovação</h2>
                <p className="text-xs text-slate-400">Conteúdos que precisam de uma decisão.</p>
              </div>
            </div>
            <Link to="/aprovacao" className="text-sm font-semibold text-[#0969ff] hover:underline">Ver tudo</Link>
          </div>

          {pendingApproval.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={24} />
              <p className="mt-2 text-sm font-medium text-slate-700">Tudo aprovado por aqui</p>
              <p className="mt-1 text-xs text-slate-400">Nenhum conteúdo aguardando aprovação.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingApproval.slice(0, 5).map((post) => (
                <Link key={post.id} to="/aprovacao" className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-slate-200 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{post.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Aguardando revisão</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={post.status} />
                    <ChevronRight size={16} className="text-slate-300 transition group-hover:text-slate-500" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_34px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0969ff]">
              <CalendarClock size={19} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Próximas publicações</h2>
              <p className="text-xs text-slate-400">Conteúdos que já estão programados.</p>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
              <CalendarDays className="mx-auto text-slate-400" size={24} />
              <p className="mt-2 text-sm font-medium text-slate-700">Agenda livre</p>
              <p className="mt-1 text-xs text-slate-400">Nenhuma publicação agendada ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((post) => (
                <div key={post.id} className="flex items-center justify-between gap-4 rounded-xl border border-transparent px-3 py-3 transition hover:border-slate-200 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{post.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Publicação agendada</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-500">
                    {new Date(post.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
