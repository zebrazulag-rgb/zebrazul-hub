import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, ChevronRight, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useClientFilter } from '../../context/ClientFilterContext.jsx';

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

export default function AllSignals({ clientId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api.get('/smart-alerts', { params: { today_date: localDay(), ...(clientId ? { client_id: clientId } : {}) } })
      .then((r) => { if (alive) setData(r.data || null); })
      .catch((e) => { if (alive) setError(e.response?.data?.error || 'Não foi possível carregar os sinais.'); });
    return () => { alive = false; };
  }, [clientId]);
  const groups = data?.groups || {};
  const visible = GROUPS.filter((g) => (groups[g.key] || []).length > 0);
  if (error) return <p className="text-xs font-bold text-[#B40049]">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Carregando sinais...</p>;
  if (!visible.length) return <p className="text-sm text-slate-500">Nenhum sinal solto no momento.</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {visible.map((group) => {
        const list = groups[group.key] || [];
        const Icon = group.icon;
        return (
          <section key={group.key} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: group.soft, color: group.accent }}><Icon size={16} /></span>
              <div><h3 className="text-xs font-black uppercase text-slate-900">{group.label}</h3><p className="text-[11px] text-slate-400">{list.length} sinal{list.length === 1 ? '' : 'is'}</p></div>
            </div>
            {list.map((item) => <AlertCard key={item.id} item={item} meta={group} onOpen={(i) => i?.link && navigate(i.link)} />)}
          </section>
        );
      })}
    </div>
  );
}
