import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { subscribeCommercialUpdates } from '../utils/commercialRealtime.js';

const STAGES = [
  { key: 'new_lead', label: 'Novo lead', short: 'Entrada', gradient: 'linear-gradient(135deg,#1686ff,#0969ff)', soft: 'bg-blue-50 text-blue-700', probability: 10 },
  { key: 'contacted', label: 'Contato feito', short: 'Conexão', gradient: 'linear-gradient(135deg,#5166f6,#4852d9)', soft: 'bg-indigo-50 text-indigo-700', probability: 20 },
  { key: 'meeting', label: 'Diagnóstico', short: 'Leitura', gradient: 'linear-gradient(135deg,#8b5cf6,#7048d7)', soft: 'bg-violet-50 text-violet-700', probability: 35 },
  { key: 'proposal', label: 'Proposta enviada', short: 'Proposta', gradient: 'linear-gradient(135deg,#f5a524,#e88b0a)', soft: 'bg-amber-50 text-amber-700', probability: 55 },
  { key: 'negotiation', label: 'Negociação', short: 'Decisão', gradient: 'linear-gradient(135deg,#f97316,#ea580c)', soft: 'bg-orange-50 text-orange-700', probability: 75 },
  { key: 'won', label: 'Negócio ganho', short: 'Resultado', gradient: 'linear-gradient(135deg,#20b981,#079669)', soft: 'bg-emerald-50 text-emerald-700', probability: 100 },
];

const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage.key, index]));

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

function MetricCard({ icon: Icon, label, value, helper, accent = 'text-[#0969ff] bg-blue-50' }) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-slate-100/80 blur-2xl" />
      <span className={`icon-tile relative ${accent}`}><Icon size={19} /></span>
      <p className="relative mt-5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="relative mt-1 text-sm font-semibold text-slate-700">{label}</p>
      <p className="relative mt-1 text-xs leading-5 text-slate-400">{helper}</p>
    </div>
  );
}

function OwnerAvatar({ lead }) {
  if (lead.owner_avatar) return <img src={lead.owner_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />;
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: lead.owner_color || '#0969ff' }}>
      {(lead.owner_name || '?')[0]?.toUpperCase()}
    </span>
  );
}

export default function CommercialFunnel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [commercialClients, setCommercialClients] = useState([]);
  const [leads, setLeads] = useState([]);
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
        setLoading(false);
      }
      return;
    }

    requestInFlight.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await api.get('/commercial/leads', { params: { client_id: clientId } });
      setLeads(data.leads || []);
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
    const open = leads.filter((lead) => !['won', 'lost'].includes(lead.stage));
    const won = leads.filter((lead) => lead.stage === 'won');
    const lost = leads.filter((lead) => lead.stage === 'lost');
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

    const stageRows = STAGES.map((stage, index) => {
      const exact = leads.filter((lead) => lead.stage === stage.key);
      const reached = leads.filter((lead) => {
        if (lead.stage === 'lost') return false;
        const leadIndex = STAGE_INDEX[lead.stage];
        return Number.isInteger(leadIndex) && leadIndex >= index;
      });
      const nextReached = index < STAGES.length - 1
        ? leads.filter((lead) => {
          if (lead.stage === 'lost') return false;
          const leadIndex = STAGE_INDEX[lead.stage];
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
    };
  }, [leads, mode]);

  const maxMetric = Math.max(0, ...analytics.stageRows.map((row) => row.currentMetric));
  const selectedStageData = selectedStage ? analytics.stageRows.find((row) => row.stage.key === selectedStage) : null;

  return (
    <div className="space-y-6">
      <PageHero
        icon={Target}
        eyebrow="Inteligência comercial ao vivo"
        title={currentClient?.name ? `Funil comercial · ${currentClient.name}` : 'Funil comercial'}
        description={currentClient?.name
          ? `Acompanhe o avanço das oportunidades de ${currentClient.name}, valores, conversão e riscos em uma leitura executiva que se atualiza automaticamente.`
          : 'Selecione um cliente no filtro lateral para abrir a leitura completa do funil.'}
        actions={(
          <>
            <button type="button" onClick={() => navigate('/comercial')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              <ArrowLeft size={17} /> Voltar ao pipeline
            </button>
            {clientId && (
              <button type="button" onClick={() => loadData({ silent: true })} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">
                <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /> Atualizar agora
              </button>
            )}
          </>
        )}
      >
        {clientId && (
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5 text-xs text-white/55">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Atualização automática ativa
            </span>
            <span>{lastUpdated ? `Sincronizado ${relativeTime(lastUpdated)}` : 'Sincronizando dados...'}</span>
            <span className="hidden">{clock}</span>
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-40 animate-pulse rounded-3xl bg-slate-200/70" />)}
          </div>
          <div className="h-[620px] animate-pulse rounded-[30px] bg-slate-200/70" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard icon={BriefcaseBusiness} label="Oportunidades ativas" value={analytics.open.length} helper={`${analytics.atRisk.length} precisam de atenção`} />
            <MetricCard icon={CircleDollarSign} label="Pipeline aberto" value={formatCurrency(analytics.pipelineValue, true)} helper="valor bruto em negociação" accent="bg-violet-50 text-violet-600" />
            <MetricCard icon={Zap} label="Previsão ponderada" value={formatCurrency(analytics.weightedValue, true)} helper="valor ajustado pela probabilidade" accent="bg-amber-50 text-amber-600" />
            <MetricCard icon={Target} label="Conversão geral" value={`${Math.round(analytics.conversion)}%`} helper={`${analytics.won.length} ganhos de ${analytics.won.length + analytics.lost.length} finalizados`} accent="bg-orange-50 text-orange-600" />
            <MetricCard icon={TrendingUp} label="Ticket médio ganho" value={formatCurrency(analytics.averageTicket, true)} helper="média dos negócios fechados" accent="bg-emerald-50 text-emerald-600" />
            <MetricCard icon={Clock3} label="Ciclo médio" value={`${Math.round(analytics.averageCycle)} dias`} helper="da entrada ao encerramento" accent="bg-slate-100 text-slate-600" />
          </section>

          <section className="surface-card overflow-hidden p-0">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="section-kicker">Visão do funil</p>
                <h2 className="section-title mt-1">Da entrada ao fechamento</h2>
                <p className="mt-1 text-sm text-slate-500">A largura mostra o volume acumulado que chegou a cada etapa.</p>
              </div>
              <div className="inline-flex w-fit rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setMode('quantity')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'quantity' ? 'bg-white text-[#0969ff] shadow-sm' : 'text-slate-500'}`}>
                  Quantidade
                </button>
                <button type="button" onClick={() => setMode('value')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'value' ? 'bg-white text-[#0969ff] shadow-sm' : 'text-slate-500'}`}>
                  Valor
                </button>
              </div>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7">
              <div className="relative overflow-hidden rounded-[26px] border border-slate-200/75 bg-[radial-gradient(circle_at_top,#f5f9ff_0%,#ffffff_58%)] px-4 py-7 sm:px-8">
                <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                <div className="relative mx-auto max-w-4xl space-y-2.5">
                  {analytics.stageRows.map((row, index) => {
                    const ratio = maxMetric ? row.currentMetric / maxMetric : 0;
                    const fallbackWidth = 100 - (index * 8.5);
                    const width = maxMetric ? Math.max(43, 42 + (ratio * 58)) : fallbackWidth;
                    const isSelected = selectedStage === row.stage.key;
                    return (
                      <div key={row.stage.key} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedStage(row.stage.key)}
                          className={`group relative mx-auto block min-h-[84px] overflow-hidden px-5 py-4 text-left text-white shadow-[0_14px_35px_rgba(15,23,42,0.12)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.18)] ${isSelected ? 'ring-4 ring-[#0969ff]/20' : ''}`}
                          style={{
                            width: `${width}%`,
                            background: row.stage.gradient,
                            clipPath: 'polygon(3% 0,97% 0,92% 100%,8% 100%)',
                          }}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/10" />
                          <div className="relative flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/16 text-[11px] font-bold">{String(index + 1).padStart(2, '0')}</span>
                                <div>
                                  <p className="truncate text-sm font-bold sm:text-base">{row.stage.label}</p>
                                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/60">{row.stage.short}</p>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xl font-bold sm:text-2xl">{mode === 'quantity' ? row.reached.length : formatCurrency(row.reachedValue, true)}</p>
                              <p className="text-[10px] text-white/65">{row.exact.length} nesta etapa</p>
                            </div>
                          </div>
                        </button>
                        {index < analytics.stageRows.length - 1 && (
                          <div className="relative z-10 mx-auto -my-1 flex h-5 items-center justify-center">
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
                              {Math.round(row.advance)}% avançam
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[24px] bg-[#121620] p-5 text-white shadow-[0_18px_45px_rgba(18,22,32,0.18)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Saúde do pipeline</p>
                      <p className="mt-2 text-3xl font-bold">{analytics.atRisk.length ? `${analytics.atRisk.length} alertas` : 'Saudável'}</p>
                    </div>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${analytics.atRisk.length ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>
                      {analytics.atRisk.length ? <CalendarClock size={21} /> : <CheckCircle2 size={21} />}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/55">{analytics.atRisk.length ? 'Oportunidades com ação atrasada ou sem movimentação há 7 dias.' : 'Nenhuma oportunidade exige atenção imediata.'}</p>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#0969ff] to-cyan-400 transition-all" style={{ width: `${analytics.open.length ? Math.max(8, 100 - (analytics.atRisk.length / analytics.open.length * 100)) : 100}%` }} />
                  </div>
                </div>

                <button type="button" onClick={() => setSelectedStage('lost')} className="w-full rounded-[24px] border border-rose-100 bg-rose-50/70 p-5 text-left transition hover:border-rose-200 hover:bg-rose-50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-500">Perdas registradas</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.lost.length}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCurrency(analytics.lost.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0))} fora do pipeline</p>
                    </div>
                    <TrendingDown size={22} className="text-rose-500" />
                  </div>
                </button>

                <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Leitura rápida</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">Clique em uma etapa</p>
                    </div>
                    <Users size={20} className="text-[#0969ff]" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Veja empresas, valores, responsáveis, próximos passos e tempo sem movimentação.</p>
                </div>
              </aside>
            </div>
          </section>
        </>
      )}

      {selectedStage && (
        <ModalBackdrop onClose={() => setSelectedStage(null)} className="items-stretch justify-end p-0" role="dialog">
          <aside className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-kicker">Detalhes da etapa</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedStage === 'lost' ? 'Oportunidades perdidas' : selectedStageData?.stage.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedStage === 'lost' ? analytics.lost.length : selectedStageData?.exact.length || 0} oportunidade(s) atualmente.</p>
                </div>
                <button type="button" onClick={() => setSelectedStage(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
              </div>
            </div>

            <div className="space-y-3 p-5">
              {(selectedStage === 'lost' ? analytics.lost : selectedStageData?.exact || []).map((lead) => {
                const staleDays = daysBetween(lead.updated_at);
                const overdue = lead.next_action_date && String(lead.next_action_date).slice(0, 10) < new Date().toISOString().slice(0, 10);
                return (
                  <button key={lead.id} type="button" onClick={() => navigate('/comercial')} className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <OwnerAvatar lead={lead} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{lead.company_name}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{lead.contact_name || lead.owner_name || 'Contato não informado'}</p>
                          </div>
                          <ChevronRight size={17} className="mt-0.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0969ff]" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{formatCurrency(lead.estimated_value)}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${overdue || staleDays >= 7 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {overdue ? 'Ação atrasada' : `${staleDays} dia(s) sem mover`}
                          </span>
                        </div>
                        {(lead.next_action || lead.next_action_date) && (
                          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-xs font-medium text-slate-700">{lead.next_action || 'Próxima ação'}</p>
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><CalendarClock size={11} /> {formatDate(lead.next_action_date)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {(selectedStage === 'lost' ? analytics.lost : selectedStageData?.exact || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma oportunidade nesta etapa</p>
                  <p className="mt-1 text-xs text-slate-400">O funil será atualizado assim que um negócio chegar aqui.</p>
                </div>
              )}
            </div>
          </aside>
        </ModalBackdrop>
      )}
    </div>
  );
}
