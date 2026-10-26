import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, ChevronRight, CircleCheckBig, Clock3, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function localDay() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDay(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return day.split('-').reverse().join('/');
}

const GROUPS = [
  { key: 'urgent', label: 'Gritando agora', icon: AlertTriangle, accent: '#EC0567', soft: 'rgba(236,5,103,.08)' },
  { key: 'today', label: 'Hoje', icon: CalendarClock, accent: '#17181C', soft: 'rgba(23,24,28,.06)' },
  { key: 'attention', label: 'Pede atenção', icon: BellRing, accent: '#3A85FD', soft: 'rgba(58,133,253,.08)' },
  { key: 'waiting', label: 'No radar', icon: Clock3, accent: '#718096', soft: 'rgba(113,128,150,.08)' },
];

function AlertCard({ item, meta, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group flex w-full min-w-0 items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 hover:bg-slate-50/80 sm:px-5"
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: meta.soft, color: meta.accent }}>
        <meta.icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-black text-slate-900">{item.title}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{item.area}</span>
        </span>
        <span className="mt-1 block text-xs font-semibold text-slate-500">{item.client_name}</span>
        {item.message && <span className="mt-1.5 block text-xs leading-5 text-slate-600">{item.message}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {item.due_date && <span>Prazo {formatDay(item.due_date)}</span>}
          {item.schedule_date && <span>Publicação {formatDay(item.schedule_date)}</span>}
          {item.age_days > 0 && <span>{item.age_days}d no radar</span>}
        </span>
      </span>
      <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-black text-slate-500 transition group-hover:text-slate-900">
        <span className="hidden sm:inline">{item.action || 'Abrir'}</span><ChevronRight size={16} />
      </span>
    </button>
  );
}

export default function Alerts() {
  const navigate = useNavigate();
  const { selectedClient } = useClientFilter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await api.get('/smart-alerts', {
        params: {
          today_date: localDay(),
          ...(selectedClient?.id ? { client_id: selectedClient.id } : {}),
        },
      });
      setData(response.data || null);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar o radar agora.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClient?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => load(true), 60000);
    const focus = () => load(true);
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [load]);

  const summary = data?.summary || { total: 0, urgent: 0, today: 0, attention: 0, waiting: 0, headline: 'LENDO A OPERAÇÃO.', subline: 'Buscando sinais...' };
  const groups = data?.groups || {};
  const visibleGroups = useMemo(() => GROUPS.filter((group) => (groups[group.key] || []).length > 0), [groups]);

  function openAlert(item) {
    if (item?.link) navigate(item.link);
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#17181C] text-white">
        <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#C9FF2F]">
              <BellRing size={16} />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Radar da operação</p>
            </div>
            <h1 className="mt-3 max-w-3xl text-[28px] font-black uppercase leading-[0.96] tracking-[-0.045em] sm:text-[38px]">{summary.headline}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">{summary.subline} {selectedClient?.name ? `Olhando só para ${selectedClient.name}.` : 'Olhando a operação inteira.'}</p>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-[#17181C] transition hover:bg-[#C9FF2F] disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar radar
          </button>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
          {[
            ['Urgentes', summary.urgent, '#EC0567'], ['Hoje', summary.today, '#C9FF2F'], ['Atenção', summary.attention, '#3A85FD'], ['No radar', summary.waiting, '#FFFFFF'],
          ].map(([label, value, color]) => (
            <div key={label} className="border-r border-white/10 px-5 py-4 last:border-r-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black tracking-[-0.04em]" style={{ color }}>{Number(value || 0)}</p>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-[#EC0567]/20 bg-[#EC0567]/[0.06] px-4 py-3 text-sm font-bold text-[#B40049]">{error}</div>}

      {loading ? (
        <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-14 text-center">
          <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" />
          <p className="mt-3 text-sm font-black text-slate-700">LENDO A OPERAÇÃO.</p>
          <p className="mt-1 text-xs text-slate-400">Cruzando prazos, aprovações, produção e publicação.</p>
        </div>
      ) : summary.total === 0 ? (
        <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C9FF2F] text-[#17181C]"><CircleCheckBig size={24} /></div>
          <p className="mt-4 text-lg font-black uppercase tracking-[-0.03em] text-[#17181C]">Nada gritando. Bom sinal.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">Sem correções paradas, prazos estourados ou gargalos detectados para este recorte.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleGroups.map((group) => {
            const list = groups[group.key] || [];
            const Icon = group.icon;
            return (
              <section key={group.key} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: group.soft, color: group.accent }}><Icon size={18} /></span>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-[-0.01em] text-slate-900">{group.label}</h2>
                      <p className="text-[11px] text-slate-400">{list.length} sinal{list.length === 1 ? '' : 'is'} ativo{list.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                </div>
                <div>{list.map((item) => <AlertCard key={item.id} item={item} meta={group} onOpen={openAlert} />)}</div>
              </section>
            );
          })}
        </div>
      )}

      <p className="px-1 pb-2 text-[11px] leading-5 text-slate-400">O radar é calculado a partir do estado atual da operação. Resolver a pendência faz o alerta desaparecer automaticamente.</p>
    </div>
  );
}
