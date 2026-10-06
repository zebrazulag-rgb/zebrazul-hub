import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hourglass,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDay(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function pluralize(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

const TYPE_META = {
  correction: { label: 'Correção', icon: MessageSquareWarning, bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', ring: 'text-rose-600 bg-rose-50' },
  overdue: { label: 'Atrasada', icon: AlertCircle, bar: 'bg-red-500', chip: 'bg-red-50 text-red-700', ring: 'text-red-600 bg-red-50' },
  approval_direction: { label: 'Sua aprovação', icon: CheckCircle2, bar: 'bg-[#0969ff]', chip: 'bg-blue-50 text-[#0969ff]', ring: 'text-[#0969ff] bg-blue-50' },
  approval_client: { label: 'Cobrar cliente', icon: Clock, bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', ring: 'text-amber-600 bg-amber-50' },
  stalled: { label: 'Parada', icon: Hourglass, bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600', ring: 'text-slate-500 bg-slate-100' },
  abandoned: { label: 'Abandonada', icon: Archive, bar: 'bg-slate-200', chip: 'bg-slate-100 text-slate-500', ring: 'text-slate-400 bg-slate-100' },
};

const FILTERS = [
  { key: 'all', label: 'Tudo' },
  { key: 'correction', label: 'Correções' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'approval_direction', label: 'Sua aprovação' },
  { key: 'approval_client', label: 'Cobrar cliente' },
  { key: 'stalled', label: 'Paradas' },
];

const PHASE_LABEL = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  correction: 'Em correção',
  approval_direction: 'Sua aprovação',
  approval_client: 'Com o cliente',
  ready: 'Pronto',
};

const LEVEL_STYLE = {
  red: { dot: 'bg-red-500', text: 'text-red-600', label: 'Em risco' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Atenção' },
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Em dia' },
};

function Avatars({ people }) {
  if (!people?.length) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Sem responsável</span>;
  }
  return (
    <div className="flex -space-x-1.5">
      {people.slice(0, 3).map((person) => (
        <span
          key={person.id}
          title={person.name}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white"
          style={{ backgroundColor: person.avatar_color || '#64748b' }}
        >
          {initials(person.name)}
        </span>
      ))}
    </div>
  );
}

function KpiTile({ label, value, hint, tone, active, onClick, to }) {
  const content = (
    <>
      <p className={`text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </>
  );
  const className = `rounded-2xl border bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-slate-300 ${active ? 'border-[#0969ff] ring-2 ring-blue-100' : 'border-slate-200/70'}`;
  if (to) return <Link to={to} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} className={className}>{content}</button>;
}

export default function ManagerPanel() {
  const { setSelectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [showAllClients, setShowAllClients] = useState(false);
  const [showAbandoned, setShowAbandoned] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: payload } = await api.get('/manager-dashboard', { params: { today_date: isoToday() } });
      setData(payload);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o Painel do Gestor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load(true), 60000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const queue = useMemo(() => {
    const list = data?.queue || [];
    return filter === 'all' ? list : list.filter((item) => item.type === filter);
  }, [data, filter]);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-24 rounded-2xl bg-slate-200/70" />)}</div>
        <div className="h-64 rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="surface-card flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" onClick={() => load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw size={15} /> Tentar de novo</button>
      </div>
    );
  }
  if (!data) return null;

  const { summary, clients, team, funnel } = data;
  const visibleQueue = showAllQueue ? queue : queue.slice(0, 8);
  const riskClients = clients.filter((c) => c.level !== 'green');
  const visibleClients = showAllClients ? clients : riskClients.slice(0, 8);
  const maxOpen = Math.max(1, ...team.map((t) => t.open));
  const bottleneck = [...funnel].filter((f) => f.count > 0 && ['todo', 'in_progress', 'approval_direction', 'approval_client'].includes(f.phase))
    .sort((a, b) => b.avg_idle_days - a.avg_idle_days)[0];

  function openClient(client) {
    setSelectedClient({ id: client.client_id, name: client.name, logo_color: client.logo_color });
    navigate('/designer');
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Precisa de você" value={summary.decisions} hint="itens na fila agora" tone={summary.decisions ? 'text-slate-900' : 'text-emerald-600'} active={filter === 'all'} onClick={() => setFilter('all')} />
        <KpiTile label="Sua aprovação" value={summary.approval_direction} hint="aguardando a Direção" tone={summary.approval_direction ? 'text-[#0969ff]' : 'text-slate-900'} active={filter === 'approval_direction'} onClick={() => setFilter('approval_direction')} />
        <KpiTile label="Atrasadas" value={summary.overdue} hint={`${summary.correction} em correção`} tone={summary.overdue ? 'text-red-600' : 'text-slate-900'} active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        <KpiTile label="Clientes em risco" value={summary.clients_red} hint={`${summary.clients_yellow} em atenção · ${summary.clients_total} ativos`} tone={summary.clients_red ? 'text-red-600' : 'text-emerald-600'} onClick={() => setShowAllClients(false)} />
        <KpiTile label="Postados em 7 dias" value={summary.posted_last_7_days} hint="entregas publicadas" tone="text-slate-900" to="/aprovacao" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ---------- Fila de decisões ---------- */}
        <section className="surface-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Precisa de você agora</h2>
              <p className="text-xs text-slate-400">Ordenado por urgência. Cada linha abre a demanda.</p>
            </div>
            <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-600" title="Atualizar">
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = f.key === 'all' ? data.queue_total : (data.queue_counts[f.key] || 0);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setFilter(f.key); setShowAllQueue(false); }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f.key ? 'bg-[#0969ff] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {f.label} <span className={filter === f.key ? 'text-white/80' : 'text-slate-400'}>{count}</span>
                </button>
              );
            })}
          </div>

          {visibleQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-500/10 px-5 py-8 text-center">
              <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-700">{filter === 'all' ? 'Nada esperando por você.' : 'Nenhum item neste filtro.'}</p>
              <p className="mt-1 text-xs text-slate-400">Boa hora para olhar a saúde dos clientes ao lado.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleQueue.map((item) => {
                const meta = TYPE_META[item.type];
                const Icon = meta.icon;
                return (
                  <li key={`${item.type}-${item.id}`}>
                    <Link
                      to={`/designer?task_id=${item.parent_task_id || item.id}`}
                      className="group flex items-stretch gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white pr-3 transition hover:border-blue-300 hover:shadow-[0_10px_26px_rgba(9,105,255,0.08)]"
                    >
                      <span className={`w-1.5 shrink-0 ${meta.bar}`} />
                      <span className={`my-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.ring}`}><Icon size={17} /></span>
                      <div className="min-w-0 flex-1 py-3">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="truncate text-xs text-slate-400">
                          <span className="font-medium text-[#0969ff]">{item.client_name}</span>
                          {item.parent_title ? ` · ${item.parent_title}` : ''}
                          {item.due_date ? ` · prazo ${formatDay(item.due_date)}` : ''}
                        </p>
                        <p className={`mt-1 text-xs font-medium ${meta.chip.split(' ')[1]}`}>{item.detail}</p>
                        {item.feedback && <p className="mt-1 line-clamp-2 text-xs italic text-slate-500">“{item.feedback}”</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-center gap-2">
                        <Avatars people={item.assignees} />
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-slate-400 transition group-hover:text-[#0969ff]">Abrir <ChevronRight size={14} /></span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {queue.length > 8 && (
            <button type="button" onClick={() => setShowAllQueue((v) => !v)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              {showAllQueue ? 'Mostrar menos' : `Ver mais ${queue.length - 8}`}
              <ChevronDown size={15} className={showAllQueue ? 'rotate-180' : ''} />
            </button>
          )}
        </section>

        {/* ---------- Saúde dos clientes ---------- */}
        <section className="surface-card p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Saúde dos clientes</h2>
            <p className="text-xs text-slate-400">
              {summary.clients_red} em risco · {summary.clients_yellow} em atenção · {summary.clients_total - summary.clients_red - summary.clients_yellow} em dia
            </p>
          </div>

          {visibleClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-500/10 px-4 py-6 text-center text-sm font-medium text-slate-600">Todos os clientes em dia.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleClients.map((client) => {
                const level = LEVEL_STYLE[client.level];
                const reason = client.reasons[0]?.text || 'Tudo certo para a semana';
                return (
                  <li key={client.client_id}>
                    <button type="button" onClick={() => openClient(client)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-slate-50/70">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${level.dot}`} title={level.label} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{client.name}</p>
                        <p className={`truncate text-xs ${client.level === 'green' ? 'text-slate-400' : level.text}`}>{reason}</p>
                        {client.reasons.length > 1 && <p className="truncate text-[11px] text-slate-400">+ {client.reasons.slice(1).map((r) => r.text).join(' · ')}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-400">{client.ready_next_days}/{client.planned_next_days} prontas na semana</p>
                        <p className="text-[11px] text-slate-400">{client.days_since_last_post === null ? 'sem post registrado' : `último post há ${client.days_since_last_post}d`}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {clients.length > riskClients.length || riskClients.length > 8 ? (
            <button type="button" onClick={() => setShowAllClients((v) => !v)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              {showAllClients ? 'Mostrar só os que precisam de atenção' : `Ver todos os ${clients.length} clientes`}
              <ChevronDown size={15} className={showAllClients ? 'rotate-180' : ''} />
            </button>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ---------- Carga da equipe ---------- */}
        <section className="surface-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0969ff]"><Users size={19} /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Carga da equipe</h2>
              <p className="text-xs text-slate-400">Peças em aberto por pessoa. Subtarefas herdam o responsável da demanda.</p>
            </div>
          </div>
          {team.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nenhuma peça em aberto.</p>
          ) : (
            <ul className="space-y-3">
              {team.map((person) => (
                <li key={person.user_id ?? 'none'}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: person.avatar_color }}>{person.user_id === null ? '?' : initials(person.name)}</span>
                      <span className={`truncate text-sm font-semibold ${person.user_id === null ? 'text-amber-700' : 'text-slate-800'}`}>{person.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                      {person.overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">{pluralize(person.overdue, 'atrasada', 'atrasadas')}</span>}
                      {person.correction > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600">{person.correction} correção</span>}
                      {person.waiting_approval > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">{person.waiting_approval} em aprovação</span>}
                      <span className="font-bold text-slate-700">{person.open}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${person.user_id === null ? 'bg-amber-400' : person.overdue > 0 ? 'bg-red-400' : 'bg-[#0969ff]'}`} style={{ width: `${Math.max(6, (person.open / maxOpen) * 100)}%` }} />
                  </div>
                  {person.due_next_days > 0 && <p className="mt-0.5 text-[11px] text-slate-400">{pluralize(person.due_next_days, 'entrega', 'entregas')} nos próximos 7 dias</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Fluxo ---------- */}
        <section className="surface-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0969ff]"><Send size={19} /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Fluxo de produção</h2>
              <p className="text-xs text-slate-400">Quantas peças em cada etapa e há quanto tempo estão sem mexer.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {funnel.map((step) => {
              const isBottleneck = bottleneck?.phase === step.phase && step.avg_idle_days >= 2;
              return (
                <div key={step.phase} className={`rounded-2xl border p-3 ${isBottleneck ? 'border-amber-300 bg-amber-500/10' : 'border-slate-200/80 bg-white'}`}>
                  <p className="text-xs font-medium text-slate-500">{PHASE_LABEL[step.phase]}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{step.count}</p>
                  <p className="text-[11px] text-slate-400">{step.phase === 'ready' ? 'prontas para publicar' : step.count ? `média ${String(step.avg_idle_days).replace('.', ',')}d sem mexer` : 'vazio'}</p>
                  {isBottleneck && <p className="mt-1 text-[11px] font-semibold text-amber-700">Possível gargalo</p>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ---------- Limpeza ---------- */}
      {data.abandoned_total > 0 && (
        <section className="surface-card p-5">
          <button type="button" onClick={() => setShowAbandoned((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Archive size={18} /></span>
              <span>
                <span className="block font-semibold text-slate-900">Para limpar · {data.abandoned_total} {data.abandoned_total === 1 ? 'tarefa sem movimento' : 'tarefas sem movimento'} há 30+ dias</span>
                <span className="block text-xs text-slate-400">Ficam fora da fila e das contagens acima. Encerre ou retome cada uma.</span>
              </span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-slate-400 transition ${showAbandoned ? 'rotate-180' : ''}`} />
          </button>
          {showAbandoned && (
            <ul className="mt-4 divide-y divide-slate-100">
              {data.abandoned.map((item) => (
                <li key={item.id}>
                  <Link to={`/designer?task_id=${item.parent_task_id || item.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-slate-50/70">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700">{item.title}</span>
                      <span className="block truncate text-xs text-slate-400">{item.client_name}{item.parent_title ? ` · ${item.parent_title}` : ''} · {PHASE_LABEL[item.phase] || item.phase}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">{item.days}d <ArrowUpRight size={14} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {loading && <div className="flex justify-center"><Loader2 size={16} className="animate-spin text-slate-300" /></div>}
    </div>
  );
}
