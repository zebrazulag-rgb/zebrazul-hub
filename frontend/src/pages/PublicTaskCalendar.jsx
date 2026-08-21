import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function buildMonthGrid(year, monthIndex) {
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
}

function dayFromIso(value) {
  return Number(String(value || '').slice(8, 10));
}

function statusClass(status) {
  if (status === 'in_progress') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'posted') return 'border-indigo-200 bg-indigo-50 text-indigo-800';
  return 'border-slate-200 bg-white text-slate-700';
}

function statusDot(status) {
  if (status === 'in_progress') return 'bg-amber-400';
  if (status === 'done') return 'bg-emerald-500';
  if (status === 'posted') return 'bg-indigo-500';
  return 'bg-slate-400';
}

export default function PublicTaskCalendar() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openTask, setOpenTask] = useState(null);

  useEffect(() => {
    let active = true;
    publicApi.get(`/public/task-calendar/${token}`)
      .then((response) => { if (active) setData(response.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.error || 'Este calendário não está mais disponível.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const year = data?.period?.year;
  const monthIndex = data ? Number(data.period.month) - 1 : 0;
  const cells = useMemo(() => data ? buildMonthGrid(year, monthIndex) : [], [data, year, monthIndex]);
  const tasksByDay = useMemo(() => {
    const map = new Map();
    (data?.tasks || []).forEach((task) => {
      const day = dayFromIso(task.due_date);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(task);
    });
    return map;
  }, [data]);

  if (loading) return <div className="min-h-screen bg-[#f4f7fb] flex items-center justify-center text-slate-500"><LoaderCircle className="mr-2 animate-spin" size={18} /> Carregando calendário...</div>;
  if (error || !data) return <div className="min-h-screen bg-[#f4f7fb] p-6 flex items-center justify-center"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><CalendarDays className="mx-auto text-slate-300" size={34} /><h1 className="mt-4 text-lg font-semibold text-slate-900">Calendário indisponível</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></div>;

  const summary = data.summary || {};

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {data.client.avatar_data ? <img src={data.client.avatar_data} alt="" className="h-11 w-11 rounded-2xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">{data.client.name?.slice(0, 2).toUpperCase()}</div>}
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Planejamento mensal</p><h1 className="truncate text-lg font-semibold text-slate-900">{data.client.name}</h1></div>
          </div>
          <div className="shrink-0 rounded-2xl bg-slate-50 px-4 py-2 text-right"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Período</p><p className="text-sm font-semibold text-slate-800">{MONTHS[monthIndex]} de {year}</p></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Total no mês</p><p className="mt-1 text-2xl font-semibold">{summary.total || 0}</p></div>
          {data.options.show_status && <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Pendentes</p><p className="mt-1 text-2xl font-semibold">{summary.pending || 0}</p></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-700">Em andamento</p><p className="mt-1 text-2xl font-semibold text-amber-900">{summary.in_progress || 0}</p></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Concluídas</p><p className="mt-1 text-2xl font-semibold text-emerald-900">{summary.done || 0}</p></div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Postadas</p><p className="mt-1 text-2xl font-semibold text-indigo-900">{summary.posted || 0}</p></div>
          </>}
        </div>

        <div className="hidden overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm md:block">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{WEEKDAYS.map((weekday) => <div key={weekday} className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{weekday}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              const items = day ? (tasksByDay.get(day) || []) : [];
              return <div key={index} className={`min-h-[150px] border-b border-r border-slate-100 p-2 ${day ? 'bg-white' : 'bg-slate-50/70'}`}>
                {day && <><div className="mb-2 text-xs font-semibold text-slate-400">{day}</div><div className="space-y-1.5">{items.map((task) => <button key={task.id} type="button" onClick={() => setOpenTask(task)} className={`w-full rounded-lg border px-2 py-2 text-left text-[11px] leading-snug transition hover:-translate-y-px hover:shadow-sm ${statusClass(task.status)}`} title={task.title}><div className="flex items-start gap-1.5">{data.options.show_status && <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(task.status)}`} />}<span className="line-clamp-2">{task.parent_task_id ? '↳ ' : ''}{task.title}</span></div></button>)}</div></>}
              </div>;
            })}
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {Array.from(tasksByDay.entries()).sort((a, b) => a[0] - b[0]).map(([day, items]) => <section key={day} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">{day}</div><div><p className="text-sm font-semibold">{day} de {MONTHS[monthIndex]}</p><p className="text-xs text-slate-400">{items.length} item{items.length === 1 ? '' : 's'}</p></div></div><div className="space-y-2">{items.map((task) => <button key={task.id} type="button" onClick={() => setOpenTask(task)} className={`w-full rounded-xl border p-3 text-left text-sm ${statusClass(task.status)}`}><div className="flex items-start gap-2">{data.options.show_status && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot(task.status)}`} />}<span>{task.parent_task_id ? '↳ ' : ''}{task.title}</span></div></button>)}</div></section>)}
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-400">Visualização compartilhada pelo ZebraHub · atualiza automaticamente quando o planejamento é alterado.</p>
      </main>

      {openTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onClick={() => setOpenTask(null)}>
          <div className="w-full max-w-lg rounded-[26px] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{openTask.due_date?.slice(8, 10)} de {MONTHS[monthIndex]}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{openTask.title}</h2>{openTask.parent_title && <p className="mt-1 text-xs text-indigo-600">Subtarefa de {openTask.parent_title}</p>}</div><button type="button" onClick={() => setOpenTask(null)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm text-slate-500">Fechar</button></div>
            <div className="mt-5 space-y-3 text-sm">
              {data.options.show_status && openTask.status_label && <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-slate-400" /><span className="text-slate-500">Status</span><span className="ml-auto font-medium text-slate-800">{openTask.status_label}</span></div>}
              {data.options.show_assignees && <div className="flex items-center gap-2"><Clock3 size={15} className="text-slate-400" /><span className="text-slate-500">Responsáveis</span><span className="ml-auto text-right font-medium text-slate-800">{openTask.assignees?.length ? openTask.assignees.join(', ') : 'Não informado'}</span></div>}
              {(openTask.project_name || openTask.front_name) && <div className="flex flex-wrap gap-2">{openTask.project_name && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{openTask.project_name}</span>}{openTask.front_name && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{openTask.front_name}</span>}</div>}
              {data.options.show_description && openTask.description && <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{openTask.description}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
