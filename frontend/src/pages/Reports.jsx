import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  Eye,
  Facebook,
  Instagram,
  Search,
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

  if (!clientId) {
    return (
      <div className="space-y-4">
        <EmptyState title="Nenhum cliente selecionado" description="Escolha um cliente no seletor superior para visualizar os relatórios." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      <div className="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">Relatórios</p>
          <p className="mt-1 text-sm text-slate-500">Desempenho das redes e inteligência competitiva do cliente no mesmo espaço.</p>
        </div>
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => changeReportView('performance')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${reportView === 'performance' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <BarChart3 size={16} /> Desempenho
          </button>
          {canCompetitors && <button
            type="button"
            onClick={() => changeReportView('competitors')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${reportView === 'competitors' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Search size={16} /> Concorrentes
          </button>}
        </div>
      </div>

      {reportView === 'competitors' ? (
        <CompetitorAnalysis />
      ) : (<>
      <div className="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">Relatório orgânico</p>
          <p className="mt-1 text-sm text-slate-500">Visualize cada rede separadamente, sem somar métricas entre plataformas.</p>
        </div>
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setOrganicPlatform('instagram')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${organicPlatform === 'instagram' ? 'bg-white text-pink-700 shadow-sm ring-1 ring-pink-100' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Instagram size={16} /> Instagram
          </button>
          <button
            type="button"
            onClick={() => setOrganicPlatform('facebook')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${organicPlatform === 'facebook' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Facebook size={16} /> Facebook
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroMetric label={`Seguidores • ${organicPlatformLabel}`} value={formatInteger(organicFollowers)} icon={Users} tone="text-blue-600" />
        <HeroMetric label={`Crescimento • ${organicPlatformLabel}`} value={`${organicGrowth >= 0 ? '+' : ''}${formatInteger(organicGrowth)}`} icon={TrendingUp} tone="text-emerald-600" />
        <HeroMetric label={`Alcance • ${organicPlatformLabel}`} value={formatInteger(organicReach)} icon={Eye} tone="text-cyan-600" />
        <HeroMetric label={`Interações • ${organicPlatformLabel}`} value={formatInteger(organicInteractions)} icon={Sparkles} tone="text-violet-600" />
      </div>

      {notice && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
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
        <details className="surface-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5">
            <div><p className="section-kicker">Complemento</p><h2 className="section-title mt-1">Lançamento manual</h2></div>
            <span className="text-sm font-medium text-[#0969ff] group-open:hidden">Abrir</span>
            <span className="hidden text-sm font-medium text-slate-500 group-open:inline">Fechar</span>
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

function HeroMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon size={14} className={tone} /> {label}</div>
      <p className="mt-1 truncate text-2xl font-bold text-slate-900" title={String(value)}>{value}</p>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="surface-card flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="icon-tile bg-slate-100 text-slate-400"><BarChart3 size={19} /></div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}
