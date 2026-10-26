import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Eye,
  Facebook,
  Instagram,
  Lightbulb,
  Radar,
  Settings2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import TopbarPortal from '../components/TopbarPortal.jsx';
import OrganicReports from '../components/OrganicReports.jsx';
import ReportConnectionsModal from '../components/ReportConnectionsModal.jsx';
import CompetitorAnalysis from './CompetitorAnalysis.jsx';
import { hasPermission } from '../permissions.js';

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return localIsoDate();
}

function firstDayOfMonthIso() {
  const date = new Date();
  return localIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatDecimal(value, digits = 1) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function Reports() {
  const { user } = useAuth();
  const canConnections = hasPermission(user, 'social.connections');
  const canCompetitors = hasPermission(user, 'compass.view');
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (selectedClient?.id || ''));
  const [from, setFrom] = useState(firstDayOfMonthIso());
  const [to, setTo] = useState(todayIso());

  const [form, setForm] = useState({
    platform: 'instagram',
    metric_date: '',
    reach: '',
    impressions: '',
    engagement: '',
    clicks: '',
    leads: '',
    conversions: '',
  });

  const [organicReport, setOrganicReport] = useState(null);
  const [organicPlatform, setOrganicPlatform] = useState('instagram');
  const [notice, setNotice] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsVersion, setConnectionsVersion] = useState(0);
  const reportView = searchParams.get('view') === 'concorrentes' && canCompetitors ? 'competitors' : 'performance';

  function changeReportView(nextView) {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'competitors') next.set('view', 'concorrentes');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (user?.role === 'client') return;
    let active = true;
    api.get('/clients').then((res) => {
      if (!active) return;
      const nextClients = res.data.clients || [];
      setClients(nextClients);
      if (!clientId && nextClients.length) {
        setClientId(selectedClient?.id || nextClients[0].id);
      }
    }).catch(() => {
      if (active) setClients([]);
    });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'client' && selectedClient?.id) {
      setClientId(selectedClient.id);
    }
  }, [selectedClient?.id, user?.role]);

  useEffect(() => {
    setOrganicReport(null);
    setNotice('');
  }, [clientId]);

  function handleConnectionsChanged() {
    setConnectionsVersion((current) => current + 1);
    setNotice('Conexões atualizadas. Este cliente agora abrirá sempre com os perfis salvos.');
  }

  async function handleAddMetric(event) {
    event.preventDefault();
    if (!form.metric_date || !clientId) return;
    await api.post(`/reports/${clientId}`, {
      ...form,
      reach: Number(form.reach) || 0,
      impressions: Number(form.impressions) || 0,
      engagement: Number(form.engagement) || 0,
      clicks: Number(form.clicks) || 0,
      leads: Number(form.leads) || 0,
      spend: 0,
      conversions: Number(form.conversions) || 0,
    });
    setForm({
      ...form,
      metric_date: '',
      reach: '',
      impressions: '',
      engagement: '',
      clicks: '',
      leads: '',
      conversions: '',
    });
  }

  const currentClient = useMemo(() => {
    if (user?.role === 'client') return { id: user.client_id, name: user.client_name || user.name };
    return clients.find((client) => Number(client.id) === Number(clientId)) || selectedClient || null;
  }, [clients, clientId, selectedClient, user]);

  const activeOrganicTotals = organicReport?.[organicPlatform] || {};
  const organicFollowers = Number(activeOrganicTotals.followers || 0);
  const organicGrowth = Number(activeOrganicTotals.followers_delta || 0);
  const organicReach = Number(activeOrganicTotals.reach || 0);
  const organicInteractions = Number(activeOrganicTotals.interactions || 0);
  const organicPlatformLabel = organicPlatform === 'instagram' ? 'Instagram' : 'Facebook';
  const engagementRate = organicReach > 0 ? (organicInteractions / organicReach) * 100 : 0;
  const hasPerformance = Boolean(organicFollowers || organicGrowth || organicReach || organicInteractions);

  const performanceSignal = useMemo(() => {
    if (!hasPerformance) {
      return {
        title: 'SEM DADO, SEM ACHISMO.',
        description: `Conecte ou atualize o ${organicPlatformLabel} para transformar número em direção.`,
      };
    }
    if (organicGrowth < 0) {
      return {
        title: 'TEM SINAL PEDINDO LEITURA.',
        description: `A base do ${organicPlatformLabel} recuou ${formatInteger(Math.abs(organicGrowth))} no período. O número mostra o movimento; o conteúdo ajuda a explicar o porquê.`,
      };
    }
    if (organicReach > 0 && organicInteractions > 0) {
      return {
        title: 'DADO BOM É DADO QUE MUDA DECISÃO.',
        description: `${formatInteger(organicReach)} pessoas alcançadas e ${formatInteger(organicInteractions)} interações no ${organicPlatformLabel}. Agora a pergunta é: o que merece ser repetido, ajustado ou abandonado?`,
      };
    }
    return {
      title: 'O NÚMERO NÃO É O FIM DA CONVERSA.',
      description: `O ${organicPlatformLabel} já tem leitura disponível. Use o período para encontrar movimento, não só preencher relatório.`,
    };
  }, [hasPerformance, organicGrowth, organicInteractions, organicPlatformLabel, organicReach]);

  if (!clientId) {
    return (
      <div className="space-y-4">
        <EmptyState title="Nenhum cliente selecionado" description="Escolha um cliente no seletor superior para visualizar os relatórios." />
      </div>
    );
  }

  return (
    <div className="reports-v6 space-y-5">
      {reportView === 'performance' && <TopbarPortal>
        <div className="flex min-w-0 items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">De</span>
            <input
              className="w-[118px] border-0 bg-transparent p-0 text-[11px] font-semibold text-slate-700 outline-none [color-scheme:light]"
              type="date"
              value={from}
              aria-label="Data inicial do relatório"
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Até</span>
            <input
              className="w-[118px] border-0 bg-transparent p-0 text-[11px] font-semibold text-slate-700 outline-none [color-scheme:light]"
              type="date"
              value={to}
              aria-label="Data final do relatório"
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          {canConnections && <button
            type="button"
            onClick={() => setConnectionsOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <Settings2 size={14} /> Conexões
          </button>}
        </div>
      </TopbarPortal>}

      {reportView === 'performance' && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-2 py-2">
          <span className="text-[9px] font-bold uppercase text-slate-400">De</span>
          <input className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none [color-scheme:light]" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-2 py-2">
          <span className="text-[9px] font-bold uppercase text-slate-400">Até</span>
          <input className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none [color-scheme:light]" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        {canConnections && <button type="button" onClick={() => setConnectionsOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><Settings2 size={14} /></button>}
      </div>}

      <section className="relative overflow-hidden rounded-[30px] bg-[#17181C] px-5 py-6 text-white sm:px-7 sm:py-7">
        <span className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[34px] border-[#3A85FD]/60" />
        <span className="pointer-events-none absolute -bottom-16 right-28 h-36 w-36 rounded-full border-[28px] border-[#EC0567]/70" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9FF2F]">Relatórios · {currentClient?.name || 'cliente'}</p>
            <h1 className="brand-display mt-2 max-w-3xl text-4xl font-black uppercase leading-[0.93] tracking-[-0.025em] sm:text-5xl">
              {reportView === 'competitors' ? 'OLHE O MERCADO. VOLTE PRA SI.' : performanceSignal.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              {reportView === 'competitors'
                ? 'Concorrente não é molde. É contexto. Compare para enxergar espaço, não para virar cópia.'
                : performanceSignal.description}
            </p>
          </div>
          <div className="inline-flex self-start rounded-2xl border border-white/10 bg-white/5 p-1 lg:self-auto">
            <button
              type="button"
              onClick={() => changeReportView('performance')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${reportView === 'performance' ? 'bg-[#3A85FD] text-white' : 'text-white/55 hover:text-white'}`}
            >
              <BarChart3 size={16} /> Desempenho
            </button>
            {canCompetitors && <button
              type="button"
              onClick={() => changeReportView('competitors')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${reportView === 'competitors' ? 'bg-[#C9FF2F] text-[#17181C]' : 'text-white/55 hover:text-white'}`}
            >
              <Radar size={16} /> Concorrentes
            </button>}
          </div>
        </div>
      </section>

      {reportView === 'competitors' ? (
        <CompetitorAnalysis embedded />
      ) : (<>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="section-kicker">Cada rede no seu quadrado</p>
              <h2 className="section-title mt-1">Leitura orgânica sem misturar plataformas</h2>
              <p className="mt-1 text-sm text-slate-500">Instagram e Facebook continuam separados. Comparar é diferente de somar.</p>
            </div>
            <div className="inline-flex self-start rounded-xl border border-slate-200 bg-slate-50 p-1 sm:self-auto">
              <button
                type="button"
                onClick={() => setOrganicPlatform('instagram')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition ${organicPlatform === 'instagram' ? 'bg-[#EC0567] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Instagram size={16} /> Instagram
              </button>
              <button
                type="button"
                onClick={() => setOrganicPlatform('facebook')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition ${organicPlatform === 'facebook' ? 'bg-[#3A85FD] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Facebook size={16} /> Facebook
              </button>
            </div>
          </div>

          <aside className="rounded-[24px] border border-[#17181C] bg-[#17181C] p-5 text-white">
            <div className="flex items-center gap-2 text-[#C9FF2F]"><Lightbulb size={16} /><span className="text-[10px] font-black uppercase tracking-[.18em]">Leitura rápida</span></div>
            <div className="mt-4 space-y-4">
              <SignalLine label="Base" value={`${organicGrowth >= 0 ? '+' : ''}${formatInteger(organicGrowth)}`} helper="seguidores no período" tone={organicGrowth < 0 ? 'pink' : 'lime'} />
              <SignalLine label="Resposta" value={`${formatDecimal(engagementRate)}%`} helper="interações / alcance" tone="blue" />
              <SignalLine label="Escala" value={formatInteger(organicReach)} helper="pessoas alcançadas" tone="white" />
            </div>
          </aside>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroMetric label={`Seguidores • ${organicPlatformLabel}`} value={formatInteger(organicFollowers)} icon={Users} tone="blue" />
          <HeroMetric label={`Crescimento • ${organicPlatformLabel}`} value={`${organicGrowth >= 0 ? '+' : ''}${formatInteger(organicGrowth)}`} icon={TrendingUp} tone={organicGrowth < 0 ? 'pink' : 'lime'} />
          <HeroMetric label={`Alcance • ${organicPlatformLabel}`} value={formatInteger(organicReach)} icon={Eye} tone="blue" />
          <HeroMetric label={`Interações • ${organicPlatformLabel}`} value={formatInteger(organicInteractions)} icon={Sparkles} tone="pink" />
        </div>

        {notice && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#C9FF2F]/60 bg-[#C9FF2F]/15 px-4 py-3 text-sm font-semibold text-slate-800">
            <CheckCircle2 size={18} className="text-lime-700" />
            <span>{notice}</span>
          </div>
        )}

        <OrganicReports
          clientId={clientId}
          from={from}
          to={to}
          user={user}
          refreshKey={connectionsVersion}
          onReportLoaded={setOrganicReport}
          platform={organicPlatform}
          onOpenConnections={canConnections ? () => setConnectionsOpen(true) : null}
        />

        {user?.role !== 'client' && (
          <details className="surface-card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5">
              <div><p className="section-kicker">Complemento</p><h2 className="section-title mt-1">Lançamento manual</h2><p className="mt-1 text-xs text-slate-400">Só quando a integração não trouxer o que você precisa.</p></div>
              <span className="text-sm font-black text-[#3A85FD] group-open:hidden">Abrir</span>
              <span className="hidden text-sm font-black text-slate-500 group-open:inline">Fechar</span>
            </summary>
            <div className="border-t border-slate-100 p-6">
              <p className="mb-4 text-xs text-slate-400">Use esta área apenas para métricas orgânicas de plataformas ainda não integradas ou ajustes complementares.</p>
              <form onSubmit={handleAddMetric} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <select className="input-field" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>
                  <option value="instagram">Instagram Orgânico</option>
                  <option value="facebook">Facebook Orgânico</option>
                  <option value="tiktok">TikTok</option>
                </select>
                <input type="date" required className="input-field" value={form.metric_date} onChange={(event) => setForm({ ...form, metric_date: event.target.value })} />
                <input type="number" placeholder="Alcance" className="input-field" value={form.reach} onChange={(event) => setForm({ ...form, reach: event.target.value })} />
                <input type="number" placeholder="Impressões" className="input-field" value={form.impressions} onChange={(event) => setForm({ ...form, impressions: event.target.value })} />
                <input type="number" placeholder="Engajamento" className="input-field" value={form.engagement} onChange={(event) => setForm({ ...form, engagement: event.target.value })} />
                <input type="number" placeholder="Cliques" className="input-field" value={form.clicks} onChange={(event) => setForm({ ...form, clicks: event.target.value })} />
                <input type="number" placeholder="Leads" className="input-field" value={form.leads} onChange={(event) => setForm({ ...form, leads: event.target.value })} />
                <button type="submit" className="btn-primary col-span-2 md:col-span-1">Adicionar</button>
              </form>
            </div>
          </details>
        )}

        {canConnections && <ReportConnectionsModal
          open={connectionsOpen}
          onClose={() => setConnectionsOpen(false)}
          clientId={clientId}
          clientName={currentClient?.name}
          onChanged={handleConnectionsChanged}
          user={user}
        />}
      </>)}
    </div>
  );
}

function HeroMetric({ label, value, icon: Icon, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-[#3A85FD] text-white',
    pink: 'bg-[#EC0567] text-white',
    lime: 'bg-[#C9FF2F] text-[#17181C]',
    ink: 'bg-[#17181C] text-white',
  };
  return (
    <div className="surface-card relative overflow-hidden px-4 py-4 sm:px-5">
      <span className={`absolute right-0 top-0 h-1.5 w-16 ${toneMap[tone].split(' ')[0]}`} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneMap[tone]}`}><Icon size={15} /></span>
      </div>
      <p className="brand-display mt-3 truncate text-3xl font-black tracking-tight text-slate-950" title={String(value)}>{value}</p>
    </div>
  );
}

function SignalLine({ label, value, helper, tone }) {
  const toneMap = {
    lime: 'text-[#C9FF2F]',
    pink: 'text-[#ff4d91]',
    blue: 'text-[#69a8ff]',
    white: 'text-white',
  };
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-white/35">{label}</p><p className="mt-1 text-xs text-white/50">{helper}</p></div>
      <p className={`brand-display text-2xl font-black ${toneMap[tone] || toneMap.white}`}>{value}</p>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="surface-card flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="icon-tile bg-[#17181C] text-[#C9FF2F]"><Activity size={19} /></div>
      <p className="mt-3 font-black text-slate-800">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}
