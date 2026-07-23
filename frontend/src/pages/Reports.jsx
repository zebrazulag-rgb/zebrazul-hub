import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Eye,
  Facebook,
  Instagram,
  LoaderCircle,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import OrganicReports from '../components/OrganicReports.jsx';
import ReportConnectionsModal from '../components/ReportConnectionsModal.jsx';

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

function formatDecimal(value, digits = 2) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value, currency = 'BRL') {
  try {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    });
  } catch {
    return `R$ ${formatDecimal(value)}`;
  }
}

function formatDateTime(value) {
  if (!value) return 'Ainda não sincronizado';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function parseDateLabel(value) {
  if (!value) return '';
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

function sumOrganic(report, field) {
  return Number(report?.facebook?.[field] || 0) + Number(report?.instagram?.[field] || 0);
}

export default function Reports() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (selectedClient?.id || ''));
  const [from, setFrom] = useState(firstDayOfMonthIso());
  const [to, setTo] = useState(todayIso());

  const [metrics, setMetrics] = useState([]);
  const [manualTotals, setManualTotals] = useState(null);
  const [form, setForm] = useState({
    platform: 'meta_ads',
    metric_date: '',
    reach: '',
    impressions: '',
    engagement: '',
    clicks: '',
    leads: '',
    spend: '',
    conversions: '',
  });

  const [metaStatus, setMetaStatus] = useState({ configured: false, api_version: null });
  const [metaReport, setMetaReport] = useState(null);
  const [organicReport, setOrganicReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsVersion, setConnectionsVersion] = useState(0);

  useEffect(() => {
    api.get('/meta/status')
      .then((res) => setMetaStatus(res.data))
      .catch(() => setMetaStatus({ configured: false, api_version: null }));
  }, []);

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
    if (clientId) loadPaidReports();
  }, [clientId, from, to, connectionsVersion]);

  useEffect(() => {
    setOrganicReport(null);
    setNotice('');
    setMetaError('');
  }, [clientId]);

  useEffect(() => {
    if (user?.role !== 'client' || !clientId) return undefined;

    const refreshVisibleReport = () => {
      if (document.visibilityState === 'visible') {
        loadPaidReports({ silent: true });
      }
    };

    const intervalId = window.setInterval(refreshVisibleReport, 5 * 60 * 1000);
    window.addEventListener('focus', refreshVisibleReport);
    document.addEventListener('visibilitychange', refreshVisibleReport);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleReport);
      document.removeEventListener('visibilitychange', refreshVisibleReport);
    };
  }, [user?.role, clientId, from, to, connectionsVersion]);

  async function loadPaidReports({ silent = false } = {}) {
    if (!silent) setLoadingReport(true);
    setMetaError('');
    try {
      const [manualResponse, metaResponse] = await Promise.all([
        api.get(`/reports/${clientId}`, { params: { from, to, _ts: Date.now() } }),
        api.get(`/meta/client/${clientId}/report`, {
          params: {
            from,
            to,
            auto_sync: user?.role === 'client' ? 1 : 0,
            _ts: Date.now(),
          },
        }),
      ]);
      setMetrics(manualResponse.data.metrics || []);
      setManualTotals(manualResponse.data.totals || null);
      setMetaReport(metaResponse.data);
    } catch (error) {
      setMetaError(error.response?.data?.error || 'Não foi possível carregar o relatório de tráfego pago.');
    } finally {
      if (!silent) setLoadingReport(false);
    }
  }

  function handleConnectionsChanged() {
    setConnectionsVersion((current) => current + 1);
    setNotice('Conexões atualizadas. Este cliente agora abrirá sempre com os perfis salvos.');
  }

  async function syncMeta() {
    if (!metaReport?.connection) return;
    setSyncing(true);
    setMetaError('');
    setNotice('');
    try {
      const { data } = await api.post(`/meta/client/${clientId}/sync`, { from, to });
      setMetaReport(data);
      setNotice('Dados do Meta Ads atualizados com sucesso.');
    } catch (error) {
      setMetaError(error.response?.data?.error || 'Não foi possível sincronizar os dados do Meta Ads.');
      await loadPaidReports();
    } finally {
      setSyncing(false);
    }
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
      spend: Number(form.spend) || 0,
      conversions: Number(form.conversions) || 0,
    });
    setForm({ ...form, metric_date: '', reach: '', impressions: '', engagement: '', clicks: '', leads: '', spend: '', conversions: '' });
    loadPaidReports();
  }

  const currentClient = useMemo(() => {
    if (user?.role === 'client') return { id: user.client_id, name: user.client_name || user.name };
    return clients.find((client) => Number(client.id) === Number(clientId)) || selectedClient || null;
  }, [clients, clientId, selectedClient, user]);

  const totals = metaReport?.totals || null;
  const currency = metaReport?.connection?.currency || 'BRL';
  const hasMetaData = Boolean(metaReport?.connection && (metaReport.daily?.length || metaReport.campaigns?.length || Number(totals?.spend) > 0));
  const organicFollowers = sumOrganic(organicReport, 'followers');
  const organicGrowth = sumOrganic(organicReport, 'followers_delta');
  const organicReach = sumOrganic(organicReport, 'reach');
  const organicInteractions = sumOrganic(organicReport, 'interactions');

  const trendData = useMemo(() => {
    if (metaReport?.daily?.length) {
      return metaReport.daily.map((row) => ({
        date: parseDateLabel(row.metric_date),
        Investimento: Number(row.spend || 0),
        Cliques: Number(row.clicks || 0),
        Conversas: Number(row.conversations || 0),
      }));
    }
    return metrics.map((metric) => ({
      date: parseDateLabel(metric.metric_date),
      Investimento: Number(metric.spend || 0),
      Cliques: Number(metric.clicks || 0),
      Conversas: Number(metric.leads || 0),
    }));
  }, [metaReport?.daily, metrics]);

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PageHero
          icon={BarChart3}
          eyebrow="Inteligência de performance"
          title="Relatórios"
          description="Selecione um cliente no filtro lateral para visualizar o relatório correspondente."
        />
        <EmptyState title="Nenhum cliente selecionado" description="Escolha um cliente no filtro superior da barra lateral." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={BarChart3}
        eyebrow={currentClient?.name || 'Cliente selecionado'}
        title="Relatórios"
        description="Desempenho orgânico em primeiro plano e mídia paga logo abaixo, com conexões permanentes para cada cliente."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <input className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none [color-scheme:dark]" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none [color-scheme:dark]" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setConnectionsOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.09] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
              >
                <Settings2 size={16} /> Conexões
              </button>
            )}
          </div>
        )}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroMetric label="Seguidores" value={formatInteger(organicFollowers)} icon={Users} tone="text-blue-300" />
          <HeroMetric label="Crescimento" value={`${organicGrowth >= 0 ? '+' : ''}${formatInteger(organicGrowth)}`} icon={TrendingUp} tone="text-emerald-300" />
          <HeroMetric label="Alcance orgânico" value={formatInteger(organicReach)} icon={Eye} tone="text-cyan-300" />
          <HeroMetric label="Interações" value={formatInteger(organicInteractions)} icon={Sparkles} tone="text-violet-300" />
        </div>
      </PageHero>

      {metaError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{metaError}</span>
        </div>
      )}
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
        onOpenConnections={() => setConnectionsOpen(true)}
      />

      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Tráfego pago
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="icon-tile bg-blue-50 text-[#0969ff]"><Megaphone size={19} /></div>
            <div>
              <p className="section-kicker">Integração opcional</p>
              <h2 className="section-title mt-1">Meta Ads</h2>
              <p className="mt-1 text-sm text-slate-500">
                {metaReport?.connection
                  ? `${metaReport.connection.account_name} • ${metaReport.connection.currency || 'Moeda não informada'}`
                  : 'Este cliente ainda não possui uma conta de anúncios conectada.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={metaReport?.connection?.last_sync_status} configured={metaStatus.configured} connected={Boolean(metaReport?.connection)} />
            {metaReport?.connection && user?.role !== 'client' && (
              <button className="btn-primary flex items-center gap-2" onClick={syncMeta} disabled={syncing || loadingReport}>
                {syncing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {syncing ? 'Sincronizando...' : 'Atualizar tráfego'}
              </button>
            )}
          </div>
        </div>

        {metaReport?.connection ? (
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            <InfoItem label="Conta de anúncios" value={metaReport.connection.account_name} />
            <InfoItem label="ID" value={metaReport.connection.account_id} />
            <InfoItem label="Última atualização" value={formatDateTime(metaReport.connection.last_synced_at)} />
            {metaReport.connection.last_sync_error && (
              <p className="sm:col-span-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{metaReport.connection.last_sync_error}</p>
            )}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center px-6 py-9 text-center">
            <div className="icon-tile bg-slate-100 text-slate-400"><Megaphone size={19} /></div>
            <p className="mt-3 font-semibold text-slate-700">Sem tráfego pago conectado</p>
            <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">O relatório orgânico continua funcionando normalmente. A conta de anúncios pode ser vinculada depois, apenas nos clientes que utilizam mídia paga.</p>
            {user?.role === 'admin' && (
              <button className="btn-secondary mt-4 flex items-center gap-2" type="button" onClick={() => setConnectionsOpen(true)}>
                <Settings2 size={16} /> Abrir conexões
              </button>
            )}
          </div>
        )}
      </section>

      {metaReport?.connection && (loadingReport ? (
        <div className="surface-card flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-slate-500">
          <LoaderCircle size={20} className="animate-spin" /> Carregando relatório de tráfego...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Investimento" value={formatCurrency(totals?.spend || manualTotals?.spend, currency)} helper="Total investido no período" icon={WalletCards} />
            <KpiCard label="Alcance" value={formatInteger(totals?.reach || manualTotals?.reach)} helper="Pessoas alcançadas" icon={Eye} />
            <KpiCard label="Impressões" value={formatInteger(totals?.impressions || manualTotals?.impressions)} helper={`${formatDecimal(totals?.frequency)} de frequência`} icon={Sparkles} />
            <KpiCard label="Conversas" value={formatInteger(totals?.conversations || manualTotals?.leads)} helper={formatCurrency(totals?.cost_per_conversation, currency) + ' por conversa'} icon={MessageCircle} />
            <KpiCard label="Cliques" value={formatInteger(totals?.clicks || manualTotals?.clicks)} helper={`${formatInteger(totals?.inline_link_clicks)} cliques no link`} icon={MousePointerClick} />
            <KpiCard label="CTR" value={`${formatDecimal(totals?.ctr)}%`} helper="Taxa de cliques" icon={Target} />
            <KpiCard label="CPC" value={formatCurrency(totals?.cpc, currency)} helper="Custo médio por clique" icon={WalletCards} />
            <KpiCard label="CPM" value={formatCurrency(totals?.cpm, currency)} helper="Custo por mil impressões" icon={BarChart3} />
            <KpiCard label="Leads" value={formatInteger(totals?.leads || manualTotals?.leads)} helper={formatCurrency(totals?.cost_per_lead, currency) + ' por lead'} icon={Target} />
            <KpiCard label="Resultados" value={formatInteger(totals?.results || manualTotals?.conversions)} helper={totals?.result_type || 'Resultado atribuído'} icon={CheckCircle2} />
          </div>

          <div className="surface-card p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="section-kicker">Tendência</p><h2 className="section-title mt-1">Evolução diária do tráfego</h2></div>
              {metaReport?.totals_is_estimated && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Alcance estimado para este filtro</span>}
            </div>
            {trendData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                  <YAxis yAxisId="left" fontSize={12} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} stroke="#94a3b8" />
                  <Tooltip formatter={(value, name) => name === 'Investimento' ? [formatCurrency(value, currency), name] : [formatInteger(value), name]} />
                  <Line yAxisId="right" type="monotone" dataKey="Investimento" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="Cliques" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="Conversas" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Nenhum dado neste período" description="Clique em “Atualizar tráfego” para sincronizar este intervalo." />
            )}
          </div>

          <div className="surface-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="section-kicker">Detalhamento</p>
              <h2 className="section-title mt-1">Campanhas</h2>
              <p className="mt-1 text-sm text-slate-500">Desempenho consolidado no período selecionado.</p>
            </div>
            {metaReport?.campaigns?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[1050px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Campanha</th>
                      <th className="px-4 py-3 font-semibold">Investimento</th>
                      <th className="px-4 py-3 font-semibold">Resultados</th>
                      <th className="px-4 py-3 font-semibold">Custo/resultado</th>
                      <th className="px-4 py-3 font-semibold">Alcance</th>
                      <th className="px-4 py-3 font-semibold">Impressões</th>
                      <th className="px-4 py-3 font-semibold">CTR</th>
                      <th className="px-4 py-3 font-semibold">CPC</th>
                      <th className="px-4 py-3 font-semibold">CPM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metaReport.campaigns.map((campaign) => (
                      <tr key={campaign.campaign_id} className="hover:bg-slate-50/70">
                        <td className="max-w-[320px] px-6 py-4">
                          <p className="truncate font-semibold text-slate-800" title={campaign.campaign_name}>{campaign.campaign_name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{campaign.result_type || 'Sem resultado principal identificado'}</p>
                        </td>
                        <td className="px-4 py-4 font-medium text-slate-700">{formatCurrency(campaign.spend, currency)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(campaign.results)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatCurrency(campaign.cost_per_result, currency)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(campaign.reach)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(campaign.impressions)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDecimal(campaign.ctr)}%</td>
                        <td className="px-4 py-4 text-slate-600">{formatCurrency(campaign.cpc, currency)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatCurrency(campaign.cpm, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Campanhas ainda não sincronizadas" description={hasMetaData ? 'A Meta não retornou campanhas com entrega neste período.' : 'Sincronize a conta para preencher esta tabela.'} />
            )}
          </div>
        </>
      ))}

      {user?.role !== 'client' && (
        <details className="surface-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5">
            <div><p className="section-kicker">Complemento</p><h2 className="section-title mt-1">Lançamento manual</h2></div>
            <span className="text-sm font-medium text-[#0969ff] group-open:hidden">Abrir</span>
            <span className="hidden text-sm font-medium text-slate-500 group-open:inline">Fechar</span>
          </summary>
          <div className="border-t border-slate-100 p-6">
            <p className="mb-4 text-xs text-slate-400">Use esta área para plataformas ainda não integradas ou ajustes complementares.</p>
            <form onSubmit={handleAddMetric} className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <select className="input-field" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>
                <option value="meta_ads">Meta Ads</option>
                <option value="google_ads">Google Ads</option>
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
              <input type="number" step="0.01" placeholder="Investimento" className="input-field" value={form.spend} onChange={(event) => setForm({ ...form, spend: event.target.value })} />
              <button type="submit" className="btn-primary col-span-2 md:col-span-1">Adicionar</button>
            </form>
          </div>
        </details>
      )}

      <ReportConnectionsModal
        open={connectionsOpen}
        onClose={() => setConnectionsOpen(false)}
        clientId={clientId}
        clientName={currentClient?.name}
        onChanged={handleConnectionsChanged}
      />
    </div>
  );
}

function HeroMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-white/45"><Icon size={14} className={tone} /> {label}</div>
      <p className="mt-1 truncate text-2xl font-bold text-white" title={String(value)}>{value}</p>
    </div>
  );
}

function KpiCard({ label, value, helper, icon: Icon }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900" title={String(value)}>{value}</p>
          <p className="mt-1 truncate text-xs text-slate-400" title={helper}>{helper}</p>
        </div>
        <span className="icon-tile bg-blue-50 text-[#0969ff]"><Icon size={18} /></span>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || '—'}</p>
    </div>
  );
}

function ConnectionBadge({ configured, connected, status }) {
  if (!configured) return <span className="badge bg-amber-100 text-amber-700">Token não configurado</span>;
  if (!connected) return <span className="badge bg-slate-100 text-slate-600">Opcional • não conectado</span>;
  if (status === 'error') return <span className="badge bg-red-100 text-red-700">Erro na sincronização</span>;
  if (status === 'syncing') return <span className="badge bg-blue-100 text-blue-700">Sincronizando</span>;
  if (status === 'success') return <span className="badge bg-emerald-100 text-emerald-700">Conectado</span>;
  return <span className="badge bg-blue-100 text-blue-700">Conectado • sem dados</span>;
}

function EmptyState({ title, description }) {
  return (
    <div className="surface-card flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="icon-tile bg-slate-100 text-slate-400"><BarChart3 size={19} /></div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
