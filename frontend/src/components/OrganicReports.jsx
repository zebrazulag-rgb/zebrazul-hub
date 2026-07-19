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
  MessageCircle,
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

function sumPlatforms(report, field) {
  return Number(report?.facebook?.[field] || 0) + Number(report?.instagram?.[field] || 0);
}

const weekDays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export default function OrganicReports({ clientId, from, to, user, refreshKey = 0, onReportLoaded, onOpenConnections }) {
  const [status, setStatus] = useState({ configured: false, api_version: null });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
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

  async function loadReport() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/meta-organic/client/${clientId}/report`, { params: { from, to } });
      setReport(data);
    } catch (requestError) {
      setReport(null);
      setError(requestError.response?.data?.error || 'Não foi possível carregar o relatório orgânico.');
    } finally {
      setLoading(false);
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
      setNotice('Dados orgânicos atualizados com sucesso.');
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
      if (!byDate.has(row.metric_date)) {
        byDate.set(row.metric_date, {
          date: shortDate(row.metric_date),
          facebookReach: 0,
          instagramReach: 0,
          facebookInteractions: 0,
          instagramInteractions: 0,
          facebookViews: 0,
          instagramViews: 0,
        });
      }
      const item = byDate.get(row.metric_date);
      const prefix = row.platform === 'instagram' ? 'instagram' : 'facebook';
      item[`${prefix}Reach`] += Number(row.reach || 0);
      item[`${prefix}Interactions`] += Number(row.interactions || 0);
      item[`${prefix}Views`] += Number(row.views || row.impressions || 0);
    }
    return [...byDate.values()];
  }, [report?.daily]);

  const rawContent = report?.content || [];
  const contentTypes = useMemo(() => [...new Set(rawContent.map((row) => normalizeContentType(row.content_type)))].sort(), [rawContent]);

  const content = useMemo(() => {
    let rows = [...rawContent];
    if (platformFilter !== 'all') rows = rows.filter((row) => row.platform === platformFilter);
    if (contentTypeFilter !== 'all') rows = rows.filter((row) => normalizeContentType(row.content_type) === contentTypeFilter);
    return rows.sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0));
  }, [rawContent, platformFilter, contentTypeFilter, sortBy]);

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
  const facebook = report?.facebook || {};
  const instagram = report?.instagram || {};
  const hasConnection = Boolean(report?.connection);
  const hasData = Boolean(rawContent.length || Number(facebook.reach) || Number(instagram.reach));
  const followers = sumPlatforms(report, 'followers');
  const followersDelta = sumPlatforms(report, 'followers_delta');
  const reach = sumPlatforms(report, 'reach');
  const views = sumPlatforms(report, 'views') || sumPlatforms(report, 'impressions');
  const interactions = sumPlatforms(report, 'interactions');
  const profileActions = sumPlatforms(report, 'profile_views') + sumPlatforms(report, 'website_clicks');
  const engagementRate = reach > 0 ? (interactions / reach) * 100 : 0;
  const averageInteractions = rawContent.length ? interactions / rawContent.length : 0;
  const bestFormat = contentBreakdown[0]?.formato || 'Sem dados';

  const trendConfig = {
    reach: { label: 'Alcance', facebookKey: 'facebookReach', instagramKey: 'instagramReach' },
    interactions: { label: 'Interações', facebookKey: 'facebookInteractions', instagramKey: 'instagramInteractions' },
    views: { label: 'Visualizações', facebookKey: 'facebookViews', instagramKey: 'instagramViews' },
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
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
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
            <div className="flex -space-x-2">
              <span className="icon-tile z-10 bg-pink-50 text-pink-600"><Instagram size={19} /></span>
              <span className="icon-tile bg-blue-50 text-blue-600"><Facebook size={19} /></span>
            </div>
            <div>
              <p className="section-kicker">Visão principal</p>
              <h2 className="section-title mt-1">Instagram e Facebook</h2>
              <p className="mt-1 text-sm text-slate-500">
                {hasConnection
                  ? [report.connection.instagram_username ? `@${report.connection.instagram_username}` : null, report.connection.page_name].filter(Boolean).join(' • ')
                  : 'Os perfis ainda não foram definidos para este cliente.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrganicConnectionBadge configured={status.configured} connected={hasConnection} status={report?.connection?.last_sync_status} />
            {hasConnection && user?.role !== 'client' && (
              <button className="btn-primary flex items-center gap-2" onClick={sync} disabled={syncing || loading}>
                {syncing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {syncing ? 'Sincronizando...' : 'Atualizar orgânico'}
              </button>
            )}
          </div>
        </div>

        {hasConnection ? (
          <div className="grid gap-4 p-6 lg:grid-cols-[1fr_1fr_auto]">
            <ProfileConnection
              icon={Instagram}
              label="Instagram profissional"
              name={report.connection.instagram_name}
              username={report.connection.instagram_username}
              image={report.connection.instagram_picture_url}
            />
            <ProfileConnection
              icon={Facebook}
              label="Página do Facebook"
              name={report.connection.page_name}
              username={report.connection.page_username}
              image={report.connection.page_picture_url}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:min-w-52">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Última atualização</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(report.connection.last_synced_at)}</p>
              <p className="mt-1 text-xs text-slate-400">Fonte: Meta Graph API</p>
            </div>
            {report.connection.last_sync_error && (
              <p className="lg:col-span-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{report.connection.last_sync_error}</p>
            )}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex gap-1">
              <span className="icon-tile bg-pink-50 text-pink-500"><Instagram size={18} /></span>
              <span className="icon-tile bg-blue-50 text-blue-500"><Facebook size={18} /></span>
            </div>
            <p className="mt-3 font-semibold text-slate-700">Conexão orgânica pendente</p>
            <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">Configure uma única vez. Depois, toda vez que este cliente for selecionado, o relatório abrirá automaticamente com os perfis corretos.</p>
            {user?.role === 'admin' && (
              <button className="btn-secondary mt-4 flex items-center gap-2" type="button" onClick={onOpenConnections}>
                <Settings2 size={16} /> Abrir conexões
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="surface-card flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-slate-500">
          <LoaderCircle size={20} className="animate-spin" /> Carregando dados orgânicos...
        </div>
      ) : hasConnection ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Users} label="Seguidores totais" value={formatInteger(followers)} helper={`${followersDelta >= 0 ? '+' : ''}${formatInteger(followersDelta)} no período`} />
            <SummaryCard icon={Eye} label="Alcance somado" value={formatInteger(reach)} helper="Instagram + Facebook" />
            <SummaryCard icon={BarChart3} label="Visualizações" value={formatInteger(views)} helper="Conteúdo e perfis" />
            <SummaryCard icon={Heart} label="Interações" value={formatInteger(interactions)} helper={`${formatDecimal(engagementRate)}% sobre o alcance`} />
            <SummaryCard icon={MousePointerClick} label="Ações de perfil" value={formatInteger(profileActions)} helper="Visitas e cliques no site" />
            <SummaryCard icon={Layers3} label="Publicações" value={formatInteger(rawContent.length)} helper={`${formatDecimal(averageInteractions, 0)} interações por conteúdo`} />
            <SummaryCard icon={CalendarDays} label="Melhor dia" value={bestDay} helper="Média de interações por publicação" />
            <SummaryCard icon={Trophy} label="Melhor formato" value={bestFormat} helper="Formato com mais interações" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <PlatformPanel platform="instagram" totals={instagram} connected={Boolean(report?.connection?.instagram_account_id)} />
            <PlatformPanel platform="facebook" totals={facebook} connected={Boolean(report?.connection?.page_id)} />
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
                  <Line type="monotone" dataKey={trendConfig.instagramKey} name={`Instagram • ${trendConfig.label}`} stroke="#db2777" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey={trendConfig.facebookKey} name={`Facebook • ${trendConfig.label}`} stroke="#2563eb" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <OrganicEmptyState
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
                    <Bar dataKey="interacoes" name="Interações" fill="#0969ff" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <OrganicEmptyState title="Sem formatos para comparar" description="Sincronize as publicações do período." />
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
                <OrganicEmptyState title="Sem conteúdos no período" description="Atualize os dados para visualizar os destaques." />
              )}
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">Conteúdo</p>
                <h3 className="section-title mt-1">Publicações com melhor desempenho</h3>
                <p className="mt-1 text-sm text-slate-500">Filtre por plataforma, formato e indicador principal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select className="input-field max-w-44" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                  <option value="all">Todas as redes</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
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
                <table className="min-w-[1180px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Publicação</th>
                      <th className="px-4 py-3 font-semibold">Rede</th>
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
                        <td className="px-4 py-4"><PlatformBadge platform={item.platform} /></td>
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

function PlatformPanel({ platform, totals, connected }) {
  const isInstagram = platform === 'instagram';
  const Icon = isInstagram ? Instagram : Facebook;
  const title = isInstagram ? 'Instagram' : 'Facebook';
  const accent = isInstagram ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600';
  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`icon-tile ${accent}`}><Icon size={19} /></span>
          <div>
            <p className="text-sm font-bold text-slate-800">{title}</p>
            <p className="text-xs text-slate-400">{connected ? 'Perfil conectado' : 'Perfil não vinculado'}</p>
          </div>
        </div>
        <span className={`badge ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{connected ? 'Ativo' : 'Indisponível'}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <OrganicMetric icon={Users} label="Seguidores" value={formatInteger(totals.followers)} helper={`${Number(totals.followers_delta || 0) >= 0 ? '+' : ''}${formatInteger(totals.followers_delta)} no período`} />
        <OrganicMetric icon={Eye} label="Alcance" value={formatInteger(totals.reach)} helper="Pessoas alcançadas" />
        <OrganicMetric icon={BarChart3} label="Visualizações" value={formatInteger(totals.views || totals.impressions)} helper={isInstagram ? 'Conteúdo visualizado' : 'Impressões e visitas'} />
        <OrganicMetric icon={Heart} label="Interações" value={formatInteger(totals.interactions)} helper={`${formatDecimal(totals.engagement_rate)}% de engajamento`} />
        <OrganicMetric icon={MousePointerClick} label="Visitas ao perfil" value={formatInteger(totals.profile_views)} helper={`${formatInteger(totals.website_clicks)} cliques no site`} />
        <OrganicMetric icon={MessageCircle} label="Publicações" value={formatInteger(totals.posts_count)} helper={`${formatInteger(totals.engaged_accounts)} contas engajadas`} />
      </div>
    </div>
  );
}

function OrganicMetric({ icon: Icon, label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Icon size={13} /> {label}</div>
      <p className="mt-1 truncate text-xl font-bold text-slate-900" title={String(value)}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-400" title={helper}>{helper}</p>
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
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400"><PlatformBadge platform={item.platform} /><span>{formatInteger(item.interactions)} interações</span></div>
      </div>
      {item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0969ff]"><ExternalLink size={16} /></a>}
    </div>
  );
}

function PlatformBadge({ platform }) {
  return platform === 'instagram'
    ? <span className="badge inline-flex items-center gap-1.5 bg-pink-50 text-pink-700"><Instagram size={13} /> Instagram</span>
    : <span className="badge inline-flex items-center gap-1.5 bg-blue-50 text-blue-700"><Facebook size={13} /> Facebook</span>;
}

function OrganicConnectionBadge({ configured, connected, status }) {
  if (!configured) return <span className="badge bg-amber-100 text-amber-700">Token orgânico ausente</span>;
  if (!connected) return <span className="badge bg-slate-100 text-slate-600">Aguardando conexão</span>;
  if (status === 'error') return <span className="badge bg-red-100 text-red-700">Erro na sincronização</span>;
  if (status === 'syncing') return <span className="badge bg-blue-100 text-blue-700">Sincronizando</span>;
  if (status === 'success') return <span className="badge bg-emerald-100 text-emerald-700">Conectado</span>;
  return <span className="badge bg-blue-100 text-blue-700">Conectado • sem dados</span>;
}

function OrganicEmptyState({ title, description }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex gap-1">
        <span className="icon-tile bg-pink-50 text-pink-500"><Instagram size={18} /></span>
        <span className="icon-tile bg-blue-50 text-blue-500"><Facebook size={18} /></span>
      </div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
