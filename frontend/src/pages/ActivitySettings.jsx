import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, RefreshCw, Download, Users, Building2, MousePointer2, Clock3,
  Search, Filter, CircleDot, FileText, Copy, Check, ListChecks, BadgeCheck,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const PERIODS = [
  { value: 1, label: 'Hoje' },
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatDateTime(value) {
  if (!value) return '—';
  const iso = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function relativeTime(value) {
  if (!value) return 'sem atividade recente';
  const iso = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? '' : 's'}`;
}

function Avatar({ name, src, color = '#0969ff', size = 'h-10 w-10' }) {
  if (src) return <img src={src} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />;
  return <div className={`${size} flex shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white`} style={{ backgroundColor: color }}>{initials(name)}</div>;
}

function changeText(change) {
  if (!change) return '';
  return `${change.label}: ${change.from} → ${change.to}`;
}

export default function ActivitySettings() {
  const { user } = useAuth();
  const canViewTeam = hasPermission(user, 'activity.view_team');
  const canExport = hasPermission(user, 'activity.export');
  const [filtersData, setFiltersData] = useState({ users: [], clients: [], modules: [], can_view_team: canViewTeam, can_export: canExport });
  const [filters, setFilters] = useState({ days: 1, user_id: '', client_id: '', module: '', search: '' });
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ actions: 0, users: 0, clients: 0, by_module: [], by_user: [] });
  const [report, setReport] = useState({ metrics: {}, top_users: [], top_clients: [], top_modules: [], paragraphs: [], text: '' });
  const [copied, setCopied] = useState(false);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 80;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('days', String(filters.days));
    if (filters.user_id) params.set('user_id', String(filters.user_id));
    if (filters.client_id) params.set('client_id', String(filters.client_id));
    if (filters.module) params.set('module', filters.module);
    if (filters.search.trim()) params.set('search', filters.search.trim());
    return params.toString();
  }, [filters]);

  const loadFilters = useCallback(async () => {
    const { data } = await api.get('/activity/filters');
    setFiltersData(data);
  }, []);

  const loadData = useCallback(async ({ silent = false, nextOffset = 0 } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const suffix = query ? `${query}&` : '';
      const [logsRes, summaryRes, usersRes, reportRes] = await Promise.all([
        api.get(`/activity/logs?${suffix}limit=${limit}&offset=${nextOffset}`),
        api.get(`/activity/summary?${query}`),
        api.get(`/activity/users?days=${filters.days}`),
        api.get(`/activity/report?${query}`),
      ]);
      setLogs(logsRes.data.logs || []);
      setTotal(Number(logsRes.data.total || 0));
      setOffset(nextOffset);
      setSummary(summaryRes.data || {});
      setTeamUsers(usersRes.data.users || []);
      setReport(reportRes.data || { metrics: {}, top_users: [], top_clients: [], top_modules: [], paragraphs: [], text: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o histórico da equipe.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, filters.days]);

  useEffect(() => {
    loadFilters().catch(() => {});
  }, [loadFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData({ nextOffset: 0 }), filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadData, filters.search]);

  useEffect(() => {
    const interval = window.setInterval(() => loadData({ silent: true, nextOffset: offset }), 45000);
    return () => window.clearInterval(interval);
  }, [loadData, offset]);

  async function exportCsv() {
    try {
      const { data } = await api.get(`/activity/export?${query}`, { responseType: 'blob' });
      const href = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = href;
      link.download = `atividade-zebrahub-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível exportar o histórico.');
    }
  }

  async function copyReport() {
    const text = String(report.text || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Não foi possível copiar o resumo automaticamente.');
    }
  }

  const activeNow = teamUsers.filter((item) => item.active_now).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Operação</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Atividade da equipe</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Veja quem fez o quê, em qual cliente e quando. O rastreamento registra ações relevantes do ZebraHub e presença recente — não captura teclado, mouse ou tela.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <Download size={16} /> Exportar CSV
            </button>
          )}
          <button type="button" onClick={() => loadData({ silent: true, nextOffset: offset })} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Ações', value: report.metrics?.actions ?? summary.actions ?? 0, icon: MousePointer2, tone: 'text-blue-500 bg-blue-50' },
          { label: 'Pessoas', value: report.metrics?.users ?? summary.users ?? 0, icon: Users, tone: 'text-violet-500 bg-violet-50' },
          { label: 'Clientes', value: report.metrics?.clients ?? summary.clients ?? 0, icon: Building2, tone: 'text-amber-500 bg-amber-50' },
          { label: 'Tarefas criadas', value: report.metrics?.tasks_created ?? 0, icon: ListChecks, tone: 'text-cyan-600 bg-cyan-50' },
          { label: 'Concluídas', value: report.metrics?.tasks_completed ?? 0, icon: Check, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Aprovações', value: report.metrics?.approvals ?? 0, icon: BadgeCheck, tone: 'text-indigo-600 bg-indigo-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-slate-500">{label}</span><span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}><Icon size={14} /></span></div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText size={17} /></span>
            <div><h3 className="text-sm font-bold text-slate-900">Resumo executivo</h3><p className="mt-0.5 text-xs text-slate-400">Relatório automático do período selecionado</p></div>
          </div>
          <button type="button" onClick={copyReport} disabled={!report.text} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar resumo'}
          </button>
        </div>
        <div className="grid gap-0 xl:grid-cols-[1.55fr_1fr]">
          <div className="p-4 md:p-5">
            {report.paragraphs?.length ? (
              <div className="space-y-3 text-sm leading-6 text-slate-700">{report.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            ) : (
              <p className="text-sm text-slate-400">O resumo aparecerá assim que houver atividades no período.</p>
            )}
          </div>
          <div className="grid gap-0 border-t border-slate-100 sm:grid-cols-2 xl:grid-cols-1 xl:border-l xl:border-t-0">
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Mais ativos</p>
              <div className="mt-2 space-y-2">
                {(report.top_users || []).slice(0, 4).map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{item.name}</span><span className="shrink-0 font-bold text-slate-400">{item.total}</span></div>
                ))}
                {!report.top_users?.length && <p className="text-xs text-slate-400">Sem movimentação.</p>}
              </div>
            </div>
            <div className="border-t border-slate-100 p-4 sm:border-l sm:border-t-0 xl:border-l-0 xl:border-t">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Clientes movimentados</p>
              <div className="mt-2 space-y-2">
                {(report.top_clients || []).slice(0, 4).map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{item.name}</span><span className="shrink-0 font-bold text-slate-400">{item.total}</span></div>
                ))}
                {!report.top_clients?.length && <p className="text-xs text-slate-400">Sem movimentação.</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Filter size={16} /> Filtros</div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <select value={filters.days} onChange={(e) => setFilters((prev) => ({ ...prev, days: Number(e.target.value) }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400">
            {PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
          </select>
          {filtersData.can_view_team && (
            <select value={filters.user_id} onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400">
              <option value="">Todos os usuários</option>{filtersData.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          <select value={filters.client_id} onChange={(e) => setFilters((prev) => ({ ...prev, client_id: e.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400">
            <option value="">Todos os clientes</option>{filtersData.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={filters.module} onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400">
            <option value="">Todas as áreas</option>{filtersData.modules.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 md:col-span-2 xl:col-span-1">
            <Search size={15} className="text-slate-400" /><input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Buscar atividade..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </label>
        </div>
      </div>

      {canViewTeam && teamUsers.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5"><div><h3 className="text-sm font-bold text-slate-900">Movimento por usuário</h3><p className="mt-0.5 text-xs text-slate-400">Atividade individual e presença recente</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{activeNow} ativo{activeNow === 1 ? '' : 's'}</span></div>
          <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3">
            {teamUsers.map((member) => (
              <button key={member.id} type="button" onClick={() => setFilters((prev) => ({ ...prev, user_id: String(member.id) }))} className="flex min-w-0 items-center gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 sm:border-r">
                <div className="relative"><Avatar name={member.name} src={member.avatar_data} color={member.avatar_color} /><span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${member.active_now ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{member.name}</p><p className="mt-0.5 truncate text-xs text-slate-400">{member.active_now ? `${member.last_client_name || 'ZebraHub'} · ${relativeTime(member.last_seen)}` : relativeTime(member.last_seen)}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{member.actions_today} hoje · {member.actions_period} no período</p></div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5"><div><h3 className="text-sm font-bold text-slate-900">Log detalhado</h3><p className="mt-0.5 text-xs text-slate-400">{total} registro{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}</p></div><div className="flex items-center gap-1.5 text-xs text-slate-400"><Clock3 size={14} /> atualiza automaticamente</div></div>
        {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><RefreshCw size={17} className="mr-2 animate-spin" /> Carregando atividades...</div>
        ) : logs.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center"><Activity size={30} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">Nenhuma atividade encontrada</p><p className="mt-1 text-xs text-slate-400">As próximas ações realizadas no ZebraHub aparecerão aqui.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const changes = Array.isArray(log.details?.changes) ? log.details.changes : [];
              return (
                <article key={log.id} className="flex gap-3 px-4 py-4 transition hover:bg-slate-50/70">
                  <Avatar name={log.user_name || 'Sistema'} src={log.user_avatar_data} color={log.user_avatar_color || '#64748b'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-bold text-slate-800">{log.user_name || 'Sistema'}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{log.module_label}</span>{log.client_name && <span className="text-xs font-medium text-blue-600">{log.client_name}</span>}</div>
                    <p className="mt-1 text-sm text-slate-700">{log.summary}{log.entity_label ? <><span className="text-slate-400"> · </span><span className="font-semibold">{log.entity_label}</span></> : null}</p>
                    {changes.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{changes.slice(0, 4).map((change, index) => <span key={`${change.field}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{changeText(change)}</span>)}</div>}
                    <p className="mt-2 text-[11px] text-slate-400">{formatDateTime(log.created_at)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {total > limit && !loading && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button type="button" disabled={offset === 0} onClick={() => loadData({ nextOffset: Math.max(0, offset - limit) })} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-30">Anterior</button>
            <span className="text-xs text-slate-400">{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
            <button type="button" disabled={offset + limit >= total} onClick={() => loadData({ nextOffset: offset + limit })} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-30">Próxima</button>
          </div>
        )}
      </section>
    </div>
  );
}
