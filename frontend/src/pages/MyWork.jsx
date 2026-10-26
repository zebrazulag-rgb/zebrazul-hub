import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Palette,
  RefreshCw,
  Sparkles,
  UserRoundCheck,
  Video,
} from 'lucide-react';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function localDay() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}`;
}

const SEVERITY = {
  3: { label: 'Agora', cls: 'bg-[#EC0567]/10 text-[#B40049]', dot: 'bg-[#EC0567]' },
  2: { label: 'Atenção', cls: 'bg-[#C9FF2F]/45 text-[#17181C]', dot: 'bg-[#17181C]' },
  1: { label: 'Na mira', cls: 'bg-[#3A85FD]/10 text-[#1D5FB8]', dot: 'bg-[#3A85FD]' },
  0: { label: 'Fila', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

function AreaIcon({ item }) {
  const Icon = item.kind === 'video' ? Video : Palette;
  const cls = item.area === 'Aprovação'
    ? 'bg-[#C9FF2F] text-[#17181C]'
    : item.kind === 'video'
      ? 'bg-[#3A85FD] text-white'
      : 'bg-[#17181C] text-[#C9FF2F]';
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${cls}`}><Icon size={19} /></span>;
}

function WorkCard({ item, waiting = false }) {
  const severity = SEVERITY[Number(item.severity || 0)] || SEVERITY[0];
  return (
    <Link
      to={item.link || '/'}
      className="group block rounded-[24px] border border-slate-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_44px_rgba(23,24,28,0.08)] sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <AreaIcon item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{item.area || (item.kind === 'video' ? 'Audiovisual' : 'Designer')}</span>
            {!waiting && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${severity.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />{severity.label}</span>}
            {waiting && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">FORA DA SUA MÃO</span>}
          </div>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-black leading-5 text-[#17181C]">{item.title}</h3>
          <p className="mt-1 truncate text-xs font-bold text-[#3A85FD]">{item.client_name || 'Interno'}</p>
          <p className={`mt-3 text-xs leading-5 ${waiting ? 'text-slate-500' : 'font-semibold text-slate-600'}`}>{item.reason}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-400">
            {item.due_date && <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} />{item.due_date === localDay() ? 'vence hoje' : `prazo ${formatDate(item.due_date)}`}</span>}
            {Number(item.idle_days || 0) > 0 && <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{item.idle_days}d sem movimento</span>}
            {item.recording_title && <span className="truncate">{item.recording_title}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          {!waiting && <span className="hidden rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 sm:block">{item.action}</span>}
          <ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#3A85FD]" />
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value, note, accent, icon: Icon, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-[22px] border p-4 text-left transition ${active ? 'border-[#17181C] bg-[#17181C] text-white' : 'border-slate-200/80 bg-white text-[#17181C] hover:border-slate-300'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-white/10' : accent}`}><Icon size={17} /></span>
        <span className={`text-3xl font-black tracking-[-0.06em] ${active ? 'text-white' : 'text-[#17181C]'}`}>{value}</span>
      </div>
      <p className={`mt-3 text-xs font-black uppercase tracking-[0.08em] ${active ? 'text-white' : 'text-slate-700'}`}>{label}</p>
      <p className={`mt-1 text-[11px] leading-4 ${active ? 'text-white/55' : 'text-slate-400'}`}>{note}</p>
    </button>
  );
}

export default function MyWork() {
  const { selectedClient } = useClientFilter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('action');

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError('');
    try {
      const response = await api.get('/my-work', {
        params: {
          today_date: localDay(),
          ...(selectedClient?.id ? { client_id: selectedClient.id } : {}),
        },
      });
      setData(response.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível carregar sua fila.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClient?.id]);

  useEffect(() => {
    setLoading(true);
    load(true);
    const interval = window.setInterval(() => load(true), 60000);
    return () => window.clearInterval(interval);
  }, [load]);

  const summary = data?.summary || { total: 0, urgent: 0, overdue: 0, due_today: 0, waiting: 0 };
  const actionItems = data?.actions || [];
  const waitingItems = data?.waiting || [];
  const visibleItems = tab === 'waiting' ? waitingItems : actionItems;

  const headline = useMemo(() => {
    if (loading && !data) return 'VENDO O QUE TÁ COM VOCÊ.';
    if (summary.urgent > 0) return 'TEM COISA QUE NÃO PODE ESPERAR.';
    if (summary.total > 0) return 'TÁ COM VOCÊ.';
    if (summary.waiting > 0) return 'SUA PARTE TÁ FEITA.';
    return 'FILA LIMPA. BONITO DE VER.';
  }, [data, loading, summary.total, summary.urgent, summary.waiting]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[#17181C]/10 bg-[#17181C] px-5 py-6 text-white sm:px-7 sm:py-7 lg:px-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[#C9FF2F]"><Sparkles size={16} /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Minha fila</span></div>
            <h1 className="max-w-2xl text-[28px] font-black leading-[0.98] tracking-[-0.055em] sm:text-[38px] lg:text-[46px]">{headline}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">O que depende de você agora — e o que você pode parar de carregar porque já está na mão de outra pessoa.</p>
            {selectedClient?.name && <p className="mt-3 text-xs font-black uppercase tracking-[0.1em] text-[#3A85FD]">FILTRANDO: {selectedClient.name}</p>}
          </div>
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-2xl bg-white px-4 text-xs font-black text-[#17181C] transition hover:bg-[#C9FF2F] disabled:opacity-60 lg:self-auto"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Atualizando...' : 'Atualizar fila'}
          </button>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Com você" value={summary.total} note="ações que dependem de você" accent="bg-[#3A85FD]/10 text-[#3A85FD]" icon={UserRoundCheck} active={tab === 'action'} onClick={() => setTab('action')} />
        <Metric label="Urgentes" value={summary.urgent} note="correção, atraso ou decisão" accent="bg-[#EC0567]/10 text-[#EC0567]" icon={AlertTriangle} onClick={() => setTab('action')} />
        <Metric label="Vencem hoje" value={summary.due_today} note="prazo batendo na porta" accent="bg-[#C9FF2F]/50 text-[#17181C]" icon={CalendarClock} onClick={() => setTab('action')} />
        <Metric label="Aguardando" value={summary.waiting} note="já saiu da sua mão" accent="bg-slate-100 text-slate-600" icon={Clock3} active={tab === 'waiting'} onClick={() => setTab('waiting')} />
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{tab === 'waiting' ? 'FORA DA SUA MÃO' : 'PRÓXIMOS MOVIMENTOS'}</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[#17181C]">{tab === 'waiting' ? 'Você está esperando isso aqui.' : 'Comece pelo que dói mais.'}</h2>
          </div>
          <div className="flex rounded-2xl border border-slate-200 bg-white p-1">
            <button type="button" onClick={() => setTab('action')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${tab === 'action' ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:text-slate-900'}`}>Minha vez · {summary.total}</button>
            <button type="button" onClick={() => setTab('waiting')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${tab === 'waiting' ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:text-slate-900'}`}>Aguardando · {summary.waiting}</button>
          </div>
        </div>

        {loading && !data ? (
          <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-14 text-center">
            <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" />
            <p className="mt-3 text-xs font-bold text-slate-400">Juntando as pontas da sua operação...</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C9FF2F] text-[#17181C]"><CheckCircle2 size={23} /></div>
            <p className="mt-4 text-sm font-black text-[#17181C]">{tab === 'waiting' ? 'NINGUÉM TE SEGURANDO AGORA.' : 'NADA COM VOCÊ AGORA.'}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-400">{tab === 'waiting' ? 'Quando uma peça sair da sua mão e ficar esperando direção, cliente ou outra etapa, ela aparece aqui.' : 'Se isso estiver estranho demais, atualize a fila. Se continuar vazio, aproveite.'}</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleItems.map((item) => <WorkCard key={`${item.kind}-${item.id}-${item.phase}`} item={item} waiting={tab === 'waiting'} />)}
          </div>
        )}
      </section>
    </div>
  );
}
