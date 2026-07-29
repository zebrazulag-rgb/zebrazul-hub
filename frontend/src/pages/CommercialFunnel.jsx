import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Eye,
  HeartPulse,
  Plus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { subscribeCommercialUpdates } from '../utils/commercialRealtime.js';
import {
  commercialStageMap,
  decorateCommercialStage,
} from '../utils/commercialStages.js';


function formatCurrency(value, compact = false) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function daysBetween(start, end = new Date()) {
  if (!start) return 0;
  const startDate = new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function relativeTime(value) {
  if (!value) return 'agora';
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (seconds < 5) return 'agora';
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `há ${minutes} min`;
}

function MetricCard({ icon: Icon, label, value, helper, accent = 'text-[#0969ff] bg-blue-50', helperTone = 'text-slate-400' }) {
  return (
    <div className="surface-card group relative min-w-0 overflow-hidden p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(15,23,42,0.08)] sm:p-5">
      <div className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-full bg-slate-100/90 blur-2xl transition group-hover:scale-110" />
      <div className="relative flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${accent}`}><Icon size={19} /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-5 text-slate-500">{label}</p>
          <p className="mt-1 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{value}</p>
        </div>
      </div>
      <p className={`relative mt-3 min-h-8 text-[11px] font-medium leading-4 ${helperTone}`}>{helper}</p>
    </div>
  );
}

function OwnerAvatar({ lead }) {
  if (lead.owner_avatar) return <img src={lead.owner_avatar} alt="" className="h-8 w-8 rounded-xl object-cover" />;
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold text-white" style={{ backgroundColor: lead.owner_color || '#0969ff' }}>
      {(lead.owner_name || '?')[0]?.toUpperCase()}
    </span>
  );
}

function LeadStatus({ lead }) {
  const staleDays = daysBetween(lead.updated_at);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(lead.next_action_date && String(lead.next_action_date).slice(0, 10) < today);

  if (overdue || staleDays >= 7) {
    return <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-600">Atrasado</span>;
  }
  if (staleDays >= 4) {
    return <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Atenção</span>;
  }
  return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">No prazo</span>;
}

export default function CommercialFunnel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [commercialClients, setCommercialClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState('quantity');
  const [selectedStage, setSelectedStage] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const requestInFlight = useRef(false);

  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id || 0);
  const currentClient = user?.role === 'client'
    ? commercialClients.find((client) => Number(client.id) === Number(user.client_id))
    : selectedClient;

  const decoratedStages = useMemo(() => stages.map(decorateCommercialStage), [stages]);
  const stageMap = useMemo(() => commercialStageMap(stages), [stages]);
  const funnelStages = useMemo(() => decoratedStages.filter((stage) => stage.stage_type !== 'lost'), [decoratedStages]);
  const funnelStageIndex = useMemo(() => Object.fromEntries(funnelStages.map((stage, index) => [stage.key, index])), [funnelStages]);

  useEffect(() => {
    let active = true;
    api.get('/commercial/clients').then(({ data }) => {
      if (!active) return;
      const nextClients = data.clients || [];
      setCommercialClients(nextClients);
      if (user?.role !== 'client' && !selectedClient && nextClients.length === 1) setSelectedClient(nextClients[0]);
    }).catch(() => { if (active) setCommercialClients([]); });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.client_id, selectedClient?.id, setSelectedClient]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!clientId || requestInFlight.current) {
      if (!clientId) {
        setLeads([]);
        setStages([]);
        setLoading(false);
      }
      return;
    }

    requestInFlight.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [leadResponse, stageResponse] = await Promise.all([
        api.get('/commercial/leads', { params: { client_id: clientId } }),
        api.get('/commercial/stages', { params: { client_id: clientId } }),
      ]);
      setLeads(leadResponse.data.leads || []);
      setStages(stageResponse.data.stages || []);
      setLastUpdated(new Date());
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  useEffect(() => {
    setSelectedStage(null);
    loadData();
  }, [clientId, loadData]);

  useEffect(() => {
    if (!clientId) return undefined;

    const unsubscribe = subscribeCommercialUpdates((payload) => {
      if (!payload?.clientId || Number(payload.clientId) === clientId) loadData({ silent: true });
    });

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadData({ silent: true });
    }, 5000);

    function refreshOnFocus() {
      loadData({ silent: true });
    }

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [clientId, loadData]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const analytics = useMemo(() => {
    const open = leads.filter((lead) => stageMap[lead.stage]?.stage_type === 'open');
    const won = leads.filter((lead) => stageMap[lead.stage]?.stage_type === 'won');
    const lost = leads.filter((lead) => stageMap[lead.stage]?.stage_type === 'lost');
    const finalized = [...won, ...lost];
    const pipelineValue = open.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const weightedValue = open.reduce((sum, lead) => sum + (Number(lead.estimated_value || 0) * Number(lead.probability || 0) / 100), 0);
    const conversion = finalized.length ? (won.length / finalized.length) * 100 : 0;
    const averageTicket = won.length ? won.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0) / won.length : 0;
    const cycles = finalized
      .map((lead) => daysBetween(lead.created_at, lead.closed_at || lead.updated_at))
      .filter((value) => Number.isFinite(value));
    const averageCycle = cycles.length ? cycles.reduce((sum, value) => sum + value, 0) / cycles.length : 0;
    const atRisk = open.filter((lead) => {
      const overdue = lead.next_action_date && String(lead.next_action_date).slice(0, 10) < new Date().toISOString().slice(0, 10);
      return overdue || daysBetween(lead.updated_at) >= 7;
    });

    const stageRows = funnelStages.map((stage, index) => {
      const exact = leads.filter((lead) => lead.stage === stage.key);
      const reached = leads.filter((lead) => {
        if (stageMap[lead.stage]?.stage_type === 'lost') return false;
        const leadIndex = funnelStageIndex[lead.stage];
        return Number.isInteger(leadIndex) && leadIndex >= index;
      });
      const nextReached = index < funnelStages.length - 1
        ? leads.filter((lead) => {
          if (stageMap[lead.stage]?.stage_type === 'lost') return false;
          const leadIndex = funnelStageIndex[lead.stage];
          return Number.isInteger(leadIndex) && leadIndex >= index + 1;
        })
        : reached;
      const exactValue = exact.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
      const reachedValue = reached.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
      const currentMetric = mode === 'value' ? reachedValue : reached.length;
      const nextMetric = mode === 'value'
        ? nextReached.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0)
        : nextReached.length;
      const advance = currentMetric ? (nextMetric / currentMetric) * 100 : 0;
      const idleDays = exact.length
        ? exact.reduce((sum, lead) => sum + daysBetween(lead.updated_at), 0) / exact.length
        : 0;
      return { stage, exact, reached, exactValue, reachedValue, currentMetric, advance, idleDays };
    });

    const lostValue = lost.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const healthScore = open.length ? Math.max(0, Math.round(100 - ((atRisk.length / open.length) * 100))) : 100;
    const highValueNegotiations = open.filter((lead) => Number(lead.estimated_value || 0) >= 5000).length;
    const busiestStage = [...stageRows].sort((a, b) => b.exact.length - a.exact.length)[0];

    return {
      open,
      won,
      lost,
      pipelineValue,
      weightedValue,
      conversion,
      averageTicket,
      averageCycle,
      atRisk,
      stageRows,
      lostValue,
      healthScore,
      highValueNegotiations,
      busiestStage,
    };
  }, [leads, mode, funnelStages, funnelStageIndex, stageMap]);

  const fallbackStage = analytics.stageRows.find((row) => row.exact.length > 0) || analytics.stageRows[0];
  const activeStageKey = selectedStage || fallbackStage?.stage.key;
  const activeStageData = analytics.stageRows.find((row) => row.stage.key === activeStageKey) || fallbackStage;
  const activeStageLeads = activeStageData?.exact || [];

  return (
    <div className="space-y-5">
      <PageHero
        icon={Target}
        eyebrow="Inteligência comercial ao vivo"
        title={currentClient?.name ? `Funil comercial · ${currentClient.name}` : 'Funil comercial'}
        description={currentClient?.name
          ? `Acompanhe o avanço das oportunidades de ${currentClient.name}, conversão, valores e riscos em uma leitura executiva atualizada automaticamente.`
          : 'Selecione um cliente no filtro lateral para abrir a leitura completa do funil.'}
        actions={(
          <>
            {clientId && (
              <button type="button" onClick={() => navigate('/comercial')} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(9,105,255,0.32)] transition hover:-translate-y-0.5 hover:bg-[#075de2]">
                <Plus size={17} /> Nova oportunidade
              </button>
            )}
            <button type="button" onClick={() => navigate('/comercial')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5">
              <ArrowLeft size={17} /> Voltar ao pipeline
            </button>
          </>
        )}
      >
        {clientId && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-white/55">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Atualização automática ativa
              </span>
              <span>{lastUpdated ? `Sincronizado ${relativeTime(lastUpdated)}` : 'Sincronizando dados...'}</span>
              <span className="hidden">{clock}</span>
            </div>
            <button type="button" onClick={() => loadData({ silent: true })} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar agora
            </button>
          </div>
        )}
      </PageHero>

      {!clientId ? (
        <section className="surface-card border-dashed p-12 text-center">
          <Target size={36} className="mx-auto text-[#0969ff]" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Escolha um cliente para visualizar o funil</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">O funil usa o mesmo cliente selecionado na barra lateral e mantém todos os dados separados por empresa.</p>
        </section>
      ) : loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-200/70" />)}
          </div>
          <div className="h-[560px] animate-pulse rounded-[30px] bg-slate-200/70" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={BriefcaseBusiness} label="Leads no pipeline" value={analytics.open.length} helper={`${analytics.atRisk.length} exigem atenção`} helperTone={analytics.atRisk.length ? 'text-amber-600' : 'text-emerald-600'} />
            <MetricCard icon={CircleDollarSign} label="Valor em aberto" value={formatCurrency(analytics.pipelineValue, true)} helper={`${formatCurrency(analytics.weightedValue, true)} de previsão`} accent="bg-emerald-50 text-emerald-600" helperTone="text-emerald-600" />
            <MetricCard icon={TrendingUp} label="Taxa de conversão" value={`${Math.round(analytics.conversion)}%`} helper={`${analytics.won.length} ganhos de ${analytics.won.length + analytics.lost.length} finalizados`} accent="bg-violet-50 text-violet-600" helperTone="text-violet-600" />
            <MetricCard icon={Zap} label="Ticket médio" value={formatCurrency(analytics.averageTicket, true)} helper="média dos negócios ganhos" accent="bg-orange-50 text-orange-600" helperTone="text-orange-600" />
            <MetricCard icon={Clock3} label="Ciclo médio" value={`${Math.round(analytics.averageCycle)} dias`} helper="da entrada ao encerramento" accent="bg-blue-50 text-blue-600" helperTone="text-blue-600" />
            <MetricCard icon={TrendingDown} label="Perdas" value={analytics.lost.length} helper={formatCurrency(analytics.lostValue, true)} accent="bg-rose-50 text-rose-600" helperTone="text-rose-600" />
          </section>

          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="surface-card overflow-hidden p-0">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
                <div>
                  <p className="section-kicker">Funil de oportunidades</p>
                  <h2 className="section-title mt-1">Da entrada ao fechamento</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button type="button" onClick={() => setMode('quantity')} className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${mode === 'quantity' ? 'bg-[#0969ff] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      Ver por quantidade
                    </button>
                    <button type="button" onClick={() => setMode('value')} className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${mode === 'value' ? 'bg-[#0969ff] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      Ver por valor
                    </button>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Tempo real
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden px-3 py-5 sm:px-5 lg:px-6">
                <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                <div className="relative overflow-x-auto pb-1">
                  <div className="mx-auto min-w-[760px] max-w-5xl space-y-2 px-1">
                    {analytics.stageRows.map((row, index) => {
                      const isSelected = activeStageKey === row.stage.key;
                      const conversionLabel = index === analytics.stageRows.length - 1
                        ? '100% concluídas'
                        : `${Math.round(row.advance)}% avançam`;
                      const width = Math.max(74, 100 - (index * 5));

                      return (
                        <button
                          key={row.stage.key}
                          type="button"
                          onClick={() => setSelectedStage(row.stage.key)}
                          className={`group relative mx-auto block min-h-[76px] rounded-[20px] px-6 py-4 text-left text-white shadow-[0_8px_22px_rgba(15,23,42,0.11)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_13px_30px_rgba(15,23,42,0.16)] ${isSelected ? 'z-10 ring-4 ring-[#0969ff]/16' : ''}`}
                          style={{ width: `${width}%`, background: row.stage.gradient }}
                        >
                          <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-r from-white/10 via-transparent to-black/10" />
                          <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/16 text-xs font-bold">{String(index + 1).padStart(2, '0')}</span>
                              <div className="min-w-0">
                                <p className="text-base font-bold leading-5">{row.stage.label}</p>
                                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70">{row.stage.short}</p>
                              </div>
                            </div>

                            <span className="inline-flex justify-center rounded-full border border-white/20 bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-sm">{conversionLabel}</span>

                            <div className="min-w-0 text-right">
                              <p className="text-base font-bold leading-5">{row.reached.length} oportunidade{row.reached.length === 1 ? '' : 's'}</p>
                              <p className="mt-1 text-xs font-semibold text-white/80">{formatCurrency(row.reachedValue)}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="surface-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Saúde do pipeline</p>
                      <CircleAlert size={14} className="text-slate-300" />
                    </div>
                    <p className={`mt-3 text-3xl font-bold ${analytics.healthScore >= 75 ? 'text-emerald-600' : analytics.healthScore >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {analytics.healthScore >= 75 ? 'Saudável' : analytics.healthScore >= 50 ? 'Atenção' : 'Crítico'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{analytics.atRisk.length ? `${analytics.atRisk.length} oportunidade(s) precisam de acompanhamento.` : 'Seu pipeline está em ótima forma.'}</p>
                  </div>
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${analytics.healthScore >= 75 ? 'bg-emerald-50 text-emerald-600' : analytics.healthScore >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                    <HeartPulse size={25} />
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all ${analytics.healthScore >= 75 ? 'bg-emerald-500' : analytics.healthScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${analytics.healthScore}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{analytics.healthScore}%</span>
                </div>
              </div>

              <button type="button" onClick={() => navigate('/comercial')} className="surface-card group w-full p-5 text-left transition hover:-translate-y-0.5 hover:border-rose-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Perdas registradas</p>
                    <p className="mt-3 text-3xl font-bold text-rose-600">{analytics.lost.length}</p>
                    <p className="mt-2 text-sm font-semibold text-rose-600">{formatCurrency(analytics.lostValue)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">valor perdido</p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 transition group-hover:scale-105">
                    <TrendingDown size={22} />
                  </span>
                </div>
              </button>

              <div className="surface-card p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Leitura rápida</p>
                  <Zap size={20} className="text-[#0969ff]" />
                </div>
                <ul className="mt-4 space-y-3 text-xs leading-5 text-slate-600">
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0969ff]" /> {analytics.highValueNegotiations} negociação(ões) acima de R$ 5 mil</li>
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0969ff]" /> {analytics.atRisk.length} oportunidade(s) sem avanço ou atrasada(s)</li>
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0969ff]" /> Maior volume: {analytics.busiestStage?.stage.label || 'Sem dados'}</li>
                </ul>
              </div>
            </aside>
          </section>

          <section className="surface-card overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
              <div>
                <p className="text-sm font-semibold text-slate-600">Etapa selecionada: <span className="text-[#0969ff]">{activeStageData?.stage.label || 'Sem etapa'}</span></p>
                <p className="mt-1 text-xs text-slate-400">{activeStageLeads.length} oportunidade(s) atualmente nesta etapa.</p>
              </div>
              <button type="button" onClick={() => navigate('/comercial')} className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                <Eye size={15} /> Ver todas as oportunidades
              </button>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    <th className="px-6 py-3">Empresa</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Próximo passo</th>
                    <th className="px-4 py-3">Tempo parado</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStageLeads.slice(0, 5).map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100/80 text-xs text-slate-600 transition hover:bg-slate-50/70 last:border-b-0">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold text-slate-600">{String(lead.company_name || '?').slice(0, 2).toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className="max-w-[190px] truncate font-semibold text-slate-900">{lead.company_name}</p>
                            <p className="mt-0.5 max-w-[190px] truncate text-[10px] text-slate-400">{lead.contact_name || 'Contato não informado'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <OwnerAvatar lead={lead} />
                          <span className="max-w-[145px] truncate">{lead.owner_name || 'Sem responsável'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800">{formatCurrency(lead.estimated_value)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <CalendarClock size={14} className="shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="max-w-[185px] truncate">{lead.next_action || 'Sem próximo passo'}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(lead.next_action_date)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">{daysBetween(lead.updated_at)} dia(s)</td>
                      <td className="px-6 py-3.5"><LeadStatus lead={lead} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {activeStageLeads.slice(0, 5).map((lead) => (
                <button key={lead.id} type="button" onClick={() => navigate('/comercial')} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300">
                  <div className="flex items-start gap-3">
                    <OwnerAvatar lead={lead} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{lead.company_name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{lead.owner_name || 'Sem responsável'}</p>
                        </div>
                        <LeadStatus lead={lead} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span className="font-bold text-slate-800">{formatCurrency(lead.estimated_value)}</span>
                        <span className="text-slate-400">{daysBetween(lead.updated_at)} dia(s) parado</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {activeStageLeads.length === 0 && (
              <div className="px-5 py-12 text-center">
                <CheckCircle2 size={30} className="mx-auto text-emerald-500" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma oportunidade nesta etapa</p>
                <p className="mt-1 text-xs text-slate-400">O painel será atualizado assim que um negócio chegar aqui.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
