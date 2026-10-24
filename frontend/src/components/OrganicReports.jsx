import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
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
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Eye,
  Facebook,
  Heart,
  Instagram,
  Layers3,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  Settings2,
  Sparkles,
  Trophy,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '../api';

function formatInteger(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatDecimal(value, digits = 2) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return 'Ainda não sincronizado';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).split('-').reverse().join('/');
  return date.toLocaleDateString('pt-BR');
}

function shortDate(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}` : value;
}

function normalizeContentType(value) {
  const type = String(value || 'POST').toUpperCase();
  if (type.includes('REEL')) return 'Reels';
  if (type.includes('CAROUSEL') || type.includes('ALBUM')) return 'Carrossel';
  if (type.includes('VIDEO')) return 'Vídeo';
  if (type.includes('STORY')) return 'Story';
  if (type.includes('IMAGE') || type.includes('PHOTO')) return 'Imagem';
  return 'Post';
}

function isMetaPermissionPendingError(value) {
  const message = String(value || '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('pages_read_engagement')
    || message.includes('page public content access')
    || message.includes('page public metadata access')
    || message.includes('permission')
    || message.includes('(#10)')
  );
}

function friendlySyncMessage(value) {
  if (isMetaPermissionPendingError(value)) {
    return 'A conexão com a Meta está salva. Os dados orgânicos do Facebook ainda não puderam ser sincronizados porque a permissão necessária está aguardando liberação da Meta. Você não precisa reconectar a conta.';
  }
  return 'A conexão está salva, mas os dados orgânicos não puderam ser atualizados agora. Tente novamente em alguns instantes.';
}

function TechnicalSyncDetails({ value, user }) {
  const isPlatformOwner = user?.is_platform_owner === true || Number(user?.is_platform_owner) === 1;
  if (!value || !isPlatformOwner) return null;
  return (
    <details className="mt-2 text-[11px] text-slate-500">
      <summary className="cursor-pointer select-none font-semibold text-slate-500 hover:text-slate-700">Ver detalhes técnicos</summary>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-2 font-mono text-[10px] leading-4 text-slate-500">{String(value)}</pre>
    </details>
  );
}

const weekDays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export default function OrganicReports({ clientId, from, to, user, refreshKey = 0, onReportLoaded, onOpenConnections, platform = 'instagram' }) {
  const [status, setStatus] = useState({ configured: false, api_version: null });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('interactions');
  const [trendMetric, setTrendMetric] = useState('reach');

  useEffect(() => {
    api.get('/meta-organic/status')
      .then((response) => setStatus(response.data))
      .catch(() => setStatus({ configured: false, api_version: null }));
  }, []);

  useEffect(() => {
    if (clientId) loadReport();
  }, [clientId, from, to, refreshKey]);

  useEffect(() => {
    onReportLoaded?.(report);
  }, [report, onReportLoaded]);

  useEffect(() => {
    setContentTypeFilter('all');
  }, [platform]);

  useEffect(() => {
    if (user?.role !== 'client' || !clientId) return undefined;

    const refreshVisibleReport = () => {
      if (document.visibilityState === 'visible') loadReport({ silent: true });
    };

    const intervalId = window.setInterval(refreshVisibleReport, 5 * 60 * 1000);
    window.addEventListener('focus', refreshVisibleReport);
    document.addEventListener('visibilitychange', refreshVisibleReport);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleReport);
      document.removeEventListener('visibilitychange', refreshVisibleReport);
    };
  }, [user?.role, clientId, from, to, refreshKey]);

  async function loadReport({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/meta-organic/client/${clientId}/report`, {
        params: {
          from,
          to,
          auto_sync: user?.role === 'client' ? 1 : 0,
          _ts: Date.now(),
        },
      });
      setReport(data);
    } catch (requestError) {
      setReport(null);
      setError(requestError.response?.data?.error || 'Não foi possível carregar o relatório orgânico.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function sync() {
    if (!report?.connection) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/meta-organic/client/${clientId}/sync`, { from, to });
      setReport(data);
      if (data?.connection?.last_sync_status === 'partial') {
        setNotice(`${platform === 'instagram' ? 'Instagram' : 'Facebook'} atualizado. A outra rede ainda possui dados pendentes.`);
      } else {
        setNotice(`Dados do ${platform === 'instagram' ? 'Instagram' : 'Facebook'} atualizados com sucesso.`);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível sincronizar os dados orgânicos.');
      await loadReport();
    } finally {
      setSyncing(false);
    }
  }

  const trendData = useMemo(() => {
    const byDate = new Map();
    for (const row of report?.daily || []) {
      if (row.platform !== platform) continue;
      if (!byDate.has(row.metric_date)) {
        byDate.set(row.metric_date, {
          date: shortDate(row.metric_date),
          reach: 0,
          interactions: 0,
          views: 0,
        });
      }
      const item = byDate.get(row.metric_date);
      item.reach += Number(row.reach || 0);
      item.interactions += Number(row.interactions || 0);
      item.views += Number(row.views || row.impressions || 0);
    }
    return [...byDate.values()];
  }, [report?.daily, platform]);

  const rawContent = useMemo(
    () => (report?.content || []).filter((row) => row.platform === platform),
    [report?.content, platform],
  );
  const contentTypes = useMemo(() => [...new Set(rawContent.map((row) => normalizeContentType(row.content_type)))].sort(), [rawContent]);

  const content = useMemo(() => {
    let rows = [...rawContent];
    if (contentTypeFilter !== 'all') rows = rows.filter((row) => normalizeContentType(row.content_type) === contentTypeFilter);
    return rows.sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0));
  }, [rawContent, contentTypeFilter, sortBy]);

  const contentBreakdown = useMemo(() => {
    const map = new Map();
    for (const item of rawContent) {
      const type = normalizeContentType(item.content_type);
      if (!map.has(type)) map.set(type, { formato: type, publicacoes: 0, interacoes: 0, alcance: 0 });
      const row = map.get(type);
      row.publicacoes += 1;
      row.interacoes += Number(item.interactions || 0);
      row.alcance += Number(item.reach || 0);
    }
    return [...map.values()].sort((a, b) => b.interacoes - a.interacoes);
  }, [rawContent]);

  const bestDay = useMemo(() => {
    const map = new Map();
    for (const item of rawContent) {
      const date = new Date(item.published_at || '');
      if (Number.isNaN(date.getTime())) continue;
      const day = date.getDay();
      const current = map.get(day) || { interactions: 0, count: 0 };
      current.interactions += Number(item.interactions || 0);
      current.count += 1;
      map.set(day, current);
    }
    const ranked = [...map.entries()].map(([day, data]) => ({ day, average: data.count ? data.interactions / data.count : 0 }));
    ranked.sort((a, b) => b.average - a.average);
    return ranked.length ? weekDays[ranked[0].day] : 'Sem dados';
  }, [rawContent]);

  const topContent = content.slice(0, 3);
  const activeTotals = report?.[platform] || {};
  const hasAnyConnection = Boolean(report?.connection);
  const platformConnected = platform === 'instagram'
    ? Boolean(report?.connection?.instagram_account_id || report?.connection?.instagram_oauth_connection_id)
    : Boolean(report?.connection?.page_id);
  const platformLabel = platform === 'instagram' ? 'Instagram' : 'Facebook';
  const PlatformIcon = platform === 'instagram' ? Instagram : Facebook;
  const platformAccent = platform === 'instagram' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600';
  const profileName = platform === 'instagram' ? report?.connection?.instagram_name : report?.connection?.page_name;
  const profileUsername = platform === 'instagram' ? report?.connection?.instagram_username : report?.connection?.page_username;
  const profileImage = platform === 'instagram' ? report?.connection?.instagram_picture_url : report?.connection?.page_picture_url;
  const organicSource = platform === 'instagram'
    ? (report?.connection?.instagram_oauth_connection_id ? 'Instagram API' : 'Meta Graph API')
    : 'Meta Graph API';
  const hasData = Boolean(rawContent.length || Number(activeTotals.reach) || Number(activeTotals.views) || Number(activeTotals.impressions));
  const followers = Number(activeTotals.followers || 0);
  const followersDelta = Number(activeTotals.followers_delta || 0);
  const reach = Number(activeTotals.reach || 0);
  const views = Number(activeTotals.views || activeTotals.impressions || 0);
  const interactions = Number(activeTotals.interactions || 0);
  const profileActions = Number(activeTotals.profile_views || 0) + Number(activeTotals.website_clicks || 0);
  const engagementRate = reach > 0 ? (interactions / reach) * 100 : Number(activeTotals.engagement_rate || 0);
  const averageInteractions = rawContent.length ? interactions / rawContent.length : 0;
  const bestFormat = contentBreakdown[0]?.formato || 'Sem dados';

  const trendConfig = {
    reach: { label: 'Alcance', key: 'reach' },
    interactions: { label: 'Interações', key: 'interactions' },
    views: { label: 'Visualizações', key: 'views' },
  }[trendMetric];

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Desempenho orgânico
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {error && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${isMetaPermissionPendingError(error) ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>{isMetaPermissionPendingError(error) ? friendlySyncMessage(error) : error}</p>
            <TechnicalSyncDetails value={error} user={user} />
          </div>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={`icon-tile ${platformAccent}`}><PlatformIcon size={19} /></span>
            <div>
              <p className="section-kicker">Visão principal</p>
              <h2 className="section-title mt-1">{platformLabel}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {platformConnected
                  ? [profileUsername ? `@${profileUsername}` : null, profileName].filter(Boolean).join(' • ')
                  : `${platformLabel} ainda não vinculado para este cliente.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PlatformConnectionBadge configured={status.configured} connected={platformConnected} status={report?.connection?.last_sync_status} />
            {hasAnyConnection && user?.role !== 'client' && (
              <button className="btn-primary flex items-center gap-2" onClick={sync} disabled={syncing || loading}>
                {syncing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {syncing ? 'Sincronizando...' : `Atualizar ${platformLabel}`}
              </button>
            )}
          </div>
        </div>

        {platformConnected ? (
          <div className="grid gap-4 p-6 lg:grid-cols-[1fr_auto]">
            <ProfileConnection
              icon={PlatformIcon}
              label={platform === 'instagram' ? 'Instagram profissional' : 'Página do Facebook'}
              name={profileName}
              username={profileUsername}
              image={profileImage}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:min-w-52">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Última atualização</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(report?.connection?.last_synced_at)}</p>
              <p className="mt-1 text-xs text-slate-400">Fonte: {organicSource}</p>
            </div>
            {platform === 'facebook' && report?.connection?.last_sync_error && (
              <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <strong className="block text-slate-800">Facebook conectado</strong>
                    <span>{friendlySyncMessage(report.connection.last_sync_error)}</span>
                    <TechnicalSyncDetails value={report.connection.last_sync_error} user={user} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
            <span className={`icon-tile ${platformAccent}`}><PlatformIcon size={18} /></span>
            <p className="mt-3 font-semibold text-slate-700">{platformLabel} não conectado</p>
            <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">Conecte esta rede para visualizar o relatório orgânico dela separadamente.</p>
            {onOpenConnections && <button className="btn-secondary mt-4 flex items-center gap-2" type="button" onClick={onOpenConnections}>
              <Settings2 size={16} /> Abrir conexões
            </button>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="surface-card flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-slate-500">
          <LoaderCircle size={20} className="animate-spin" /> Carregando dados orgânicos...
        </div>
      ) : platformConnected ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Users} label="Seguidores" value={formatInteger(followers)} helper={`${followersDelta >= 0 ? '+' : ''}${formatInteger(followersDelta)} no período`} />
            <SummaryCard icon={Eye} label="Alcance" value={formatInteger(reach)} helper={`Somente ${platformLabel}`} />
            <SummaryCard icon={BarChart3} label="Visualizações" value={formatInteger(views)} helper={`Somente ${platformLabel}`} />
            <SummaryCard icon={Heart} label="Interações" value={formatInteger(interactions)} helper={`${formatDecimal(engagementRate)}% sobre o alcance`} />
            <SummaryCard icon={MousePointerClick} label="Ações de perfil" value={formatInteger(profileActions)} helper="Visitas e cliques no site" />
            <SummaryCard icon={Layers3} label="Publicações" value={formatInteger(rawContent.length)} helper={`${formatDecimal(averageInteractions, 0)} interações por conteúdo`} />
            <SummaryCard icon={CalendarDays} label="Melhor dia" value={bestDay} helper="Média de interações por publicação" />
            <SummaryCard icon={Trophy} label="Melhor formato" value={bestFormat} helper="Formato com mais interações" />
          </div>

          <div className="surface-card p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="section-kicker">Tendência</p><h3 className="section-title mt-1">Evolução diária</h3></div>
              <select className="input-field max-w-48" value={trendMetric} onChange={(event) => setTrendMetric(event.target.value)}>
                <option value="reach">Alcance</option>
                <option value="interactions">Interações</option>
                <option value="views">Visualizações</option>
              </select>
            </div>
            {trendData.length ? (
              <ResponsiveContainer width="100%" height={310}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip formatter={(value, name) => [formatInteger(value), name]} />
                  <Line type="monotone" dataKey={trendConfig.key} name={`${platformLabel} • ${trendConfig.label}`} stroke={platform === 'instagram' ? '#db2777' : '#2563eb'} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <OrganicEmptyState
                platform={platform}
                title="Nenhuma evolução diária disponível"
                description="Clique em “Atualizar orgânico” para sincronizar este período."
              />
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            <div className="surface-card p-6">
              <div className="mb-5"><p className="section-kicker">Formatos</p><h3 className="section-title mt-1">Interações por tipo de conteúdo</h3></div>
              {contentBreakdown.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={contentBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="formato" fontSize={12} stroke="#94a3b8" />
                    <YAxis fontSize={12} stroke="#94a3b8" />
                    <Tooltip formatter={(value, name) => [formatInteger(value), name]} />
                    <Bar dataKey="interacoes" name="Interações" fill={platform === 'instagram' ? '#db2777' : '#2563eb'} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <OrganicEmptyState platform={platform} title="Sem formatos para comparar" description="Sincronize as publicações do período." />
              )}
            </div>

            <div className="surface-card overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-5"><p className="section-kicker">Destaques</p><h3 className="section-title mt-1">Top conteúdos</h3></div>
              {topContent.length ? (
                <div className="divide-y divide-slate-100">
                  {topContent.map((item, index) => (
                    <TopContentRow key={`${item.platform}-${item.content_id}`} item={item} position={index + 1} />
                  ))}
                </div>
              ) : (
                <OrganicEmptyState platform={platform} title="Sem conteúdos no período" description="Atualize os dados para visualizar os destaques." />
              )}
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">Conteúdo</p>
                <h3 className="section-title mt-1">Publicações com melhor desempenho</h3>
                <p className="mt-1 text-sm text-slate-500">Conteúdos do {platformLabel}, filtrados por formato e indicador principal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select className="input-field max-w-44" value={contentTypeFilter} onChange={(event) => setContentTypeFilter(event.target.value)}>
                  <option value="all">Todos os formatos</option>
                  {contentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select className="input-field max-w-44" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="interactions">Mais interações</option>
                  <option value="reach">Maior alcance</option>
                  <option value="views">Mais visualizações</option>
                  <option value="likes">Mais curtidas</option>
                  <option value="saves">Mais salvamentos</option>
                </select>
              </div>
            </div>
            {content.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[1080px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Publicação</th>
                      <th className="px-4 py-3 font-semibold">Formato</th>
                      <th className="px-4 py-3 font-semibold">Data</th>
                      <th className="px-4 py-3 font-semibold">Alcance</th>
                      <th className="px-4 py-3 font-semibold">Visualizações</th>
                      <th className="px-4 py-3 font-semibold">Interações</th>
                      <th className="px-4 py-3 font-semibold">Curtidas</th>
                      <th className="px-4 py-3 font-semibold">Comentários</th>
                      <th className="px-4 py-3 font-semibold">Compart.</th>
                      <th className="px-4 py-3 font-semibold">Salvos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {content.map((item) => (
                      <tr key={`${item.platform}-${item.content_id}`} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <div className="flex max-w-[360px] items-center gap-3">
                            {item.thumbnail_url ? (
                              <img src={item.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><BarChart3 size={18} /></span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800" title={item.caption || item.content_type}>{item.caption || item.content_type || 'Publicação sem legenda'}</p>
                              {item.permalink && (
                                <a href={item.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0969ff] hover:underline">
                                  Abrir publicação <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{normalizeContentType(item.content_type)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDate(item.published_at)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.reach)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.views)}</td>
                        <td className="px-4 py-4 font-semibold text-slate-700">{formatInteger(item.interactions)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.likes)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.comments)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.shares)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatInteger(item.saves)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <OrganicEmptyState
                platform={platform}
                title="Publicações ainda não sincronizadas"
                description={hasData ? 'Nenhuma publicação corresponde aos filtros escolhidos.' : 'Sincronize os perfis para preencher o ranking.'}
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ProfileConnection({ icon: Icon, label, name, username, image }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        {image ? <img src={image} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="icon-tile bg-slate-100 text-slate-500"><Icon size={18} /></span>}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="truncate font-semibold text-slate-800">{name || 'Não vinculado'}</p>
          {username && <p className="truncate text-xs text-slate-500">@{username}</p>}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
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

function TopContentRow({ item, position }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{position}</span>
      {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Sparkles size={17} /></span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800" title={item.caption}>{item.caption || normalizeContentType(item.content_type)}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400"><span>{formatInteger(item.interactions)} interações</span></div>
      </div>
      {item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0969ff]"><ExternalLink size={16} /></a>}
    </div>
  );
}

function PlatformConnectionBadge({ configured, connected, status }) {
  if (!configured) return <span className="badge bg-amber-100 text-amber-700">Integração não configurada</span>;
  if (!connected) return <span className="badge bg-slate-100 text-slate-600">Não conectado</span>;
  if (status === 'syncing') return <span className="badge bg-blue-100 text-blue-700">Sincronizando dados</span>;
  return <span className="badge bg-emerald-100 text-emerald-700">Conectado</span>;
}

function OrganicEmptyState({ title, description, platform = 'instagram' }) {
  const Icon = platform === 'instagram' ? Instagram : Facebook;
  const accent = platform === 'instagram' ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500';
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <span className={`icon-tile ${accent}`}><Icon size={18} /></span>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
