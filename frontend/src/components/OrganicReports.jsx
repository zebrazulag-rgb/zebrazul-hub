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
  ExternalLink,
  Eye,
  Facebook,
  Heart,
  Instagram,
  Link2,
  LoaderCircle,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Unlink,
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

function assetLabel(asset) {
  const page = asset.page_name ? `Facebook: ${asset.page_name}` : null;
  const instagram = asset.instagram?.username ? `Instagram: @${asset.instagram.username}` : null;
  return [page, instagram].filter(Boolean).join(' • ') || asset.asset_key;
}

export default function OrganicReports({ clientId, from, to, user }) {
  const [status, setStatus] = useState({ configured: false, api_version: null });
  const [report, setReport] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');

  useEffect(() => {
    api.get('/meta-organic/status')
      .then((response) => setStatus(response.data))
      .catch(() => setStatus({ configured: false, api_version: null }));
  }, []);

  useEffect(() => {
    if (clientId) loadReport();
  }, [clientId, from, to]);

  async function loadReport() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/meta-organic/client/${clientId}/report`, { params: { from, to } });
      setReport(data);
      setSelectedAsset(data.connection?.asset_key || '');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar o relatório orgânico.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableAssets() {
    if (user?.role !== 'admin') return;
    setLoadingAssets(true);
    setError('');
    try {
      const { data } = await api.get('/meta-organic/assets');
      setAssets(data.assets || []);
      if (!selectedAsset && data.assets?.length) {
        const freeAsset = data.assets.find((asset) => !asset.assignment || Number(asset.assignment.client_id) === Number(clientId));
        setSelectedAsset(freeAsset?.asset_key || data.assets[0].asset_key);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível listar as Páginas e contas do Instagram.');
    } finally {
      setLoadingAssets(false);
    }
  }

  async function saveConnection() {
    if (!selectedAsset) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.put(`/meta-organic/client/${clientId}/connection`, { asset_key: selectedAsset });
      setNotice('Facebook e Instagram vinculados ao cliente.');
      await loadReport();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível vincular os ativos orgânicos.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar os ativos orgânicos deste cliente? Os dados sincronizados também serão removidos.')) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/meta-organic/client/${clientId}/connection`);
      setAssets([]);
      setSelectedAsset('');
      setNotice('Integração orgânica desconectada.');
      await loadReport();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desconectar a integração orgânica.');
    } finally {
      setSaving(false);
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

  const assetsForClient = useMemo(() => assets.filter((asset) => (
    !asset.assignment || Number(asset.assignment.client_id) === Number(clientId)
  )), [assets, clientId]);

  const trendData = useMemo(() => {
    const byDate = new Map();
    for (const row of report?.daily || []) {
      if (!byDate.has(row.metric_date)) {
        byDate.set(row.metric_date, {
          date: shortDate(row.metric_date),
          facebookReach: 0,
          instagramReach: 0,
          interactions: 0,
        });
      }
      const item = byDate.get(row.metric_date);
      if (row.platform === 'facebook') item.facebookReach += Number(row.reach || 0);
      if (row.platform === 'instagram') item.instagramReach += Number(row.reach || 0);
      item.interactions += Number(row.interactions || 0);
    }
    return [...byDate.values()];
  }, [report?.daily]);

  const content = useMemo(() => {
    const rows = report?.content || [];
    return platformFilter === 'all' ? rows : rows.filter((row) => row.platform === platformFilter);
  }, [report?.content, platformFilter]);

  const facebook = report?.facebook || {};
  const instagram = report?.instagram || {};
  const hasConnection = Boolean(report?.connection);
  const hasData = Boolean((report?.content || []).length || Number(facebook.reach) || Number(instagram.reach));

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
              <span className="icon-tile z-10 bg-blue-50 text-blue-600"><Facebook size={19} /></span>
              <span className="icon-tile bg-pink-50 text-pink-600"><Instagram size={19} /></span>
            </div>
            <div>
              <p className="section-kicker">Integração oficial</p>
              <h2 className="section-title mt-1">Facebook e Instagram</h2>
              <p className="mt-1 text-sm text-slate-500">
                {hasConnection
                  ? [report.connection.page_name, report.connection.instagram_username ? `@${report.connection.instagram_username}` : null].filter(Boolean).join(' • ')
                  : 'Conecte os perfis profissionais para acompanhar o crescimento orgânico.'}
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

        <div className="grid gap-5 p-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="soft-panel p-5">
            {hasConnection ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProfileConnection
                    icon={Facebook}
                    label="Página do Facebook"
                    name={report.connection.page_name}
                    username={report.connection.page_username}
                    image={report.connection.page_picture_url}
                  />
                  <ProfileConnection
                    icon={Instagram}
                    label="Instagram profissional"
                    name={report.connection.instagram_name}
                    username={report.connection.instagram_username}
                    image={report.connection.instagram_picture_url}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                  Última atualização: <strong className="text-slate-700">{formatDateTime(report.connection.last_synced_at)}</strong>
                </div>
                {report.connection.last_sync_error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{report.connection.last_sync_error}</p>
                )}
                {user?.role === 'admin' && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary flex items-center gap-2" type="button" onClick={loadAvailableAssets} disabled={loadingAssets}>
                      {loadingAssets ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}
                      Trocar perfis
                    </button>
                    <button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50" type="button" onClick={disconnect} disabled={saving}>
                      <span className="flex items-center gap-2"><Unlink size={16} /> Desconectar</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="font-semibold text-slate-800">Nenhum perfil vinculado</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  O token orgânico está protegido no backend. Associe uma Página e seu Instagram profissional ao cliente.
                </p>
                {user?.role === 'admin' && (
                  <button className="btn-secondary mt-4 flex items-center gap-2" type="button" onClick={loadAvailableAssets} disabled={loadingAssets || !status.configured}>
                    {loadingAssets ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}
                    Listar perfis disponíveis
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="soft-panel p-5">
            <p className="text-sm font-semibold text-slate-800">Configuração</p>
            {!status.configured ? (
              <p className="mt-2 text-sm text-amber-700">META_ORGANIC_ACCESS_TOKEN ainda não foi detectado no backend.</p>
            ) : user?.role === 'admin' && assets.length > 0 ? (
              <div className="mt-3 space-y-3">
                <select className="input-field" value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)}>
                  <option value="">Selecione os perfis</option>
                  {assetsForClient.map((asset) => (
                    <option key={asset.asset_key} value={asset.asset_key}>{assetLabel(asset)}</option>
                  ))}
                </select>
                <button className="btn-primary w-full" type="button" onClick={saveConnection} disabled={!selectedAsset || saving}>
                  {saving ? 'Salvando...' : hasConnection ? 'Salvar novos perfis' : 'Conectar ao cliente'}
                </button>
                {assetsForClient.length === 0 && <p className="text-xs text-slate-500">Todos os ativos retornados já estão vinculados a outros clientes.</p>}
              </div>
            ) : (
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                <p>API: {status.api_version || 'automática'}</p>
                <p>Período: {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}</p>
                <p>Fonte: Meta Graph API • dados orgânicos</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="surface-card flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-slate-500">
          <LoaderCircle size={20} className="animate-spin" /> Carregando dados orgânicos...
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <PlatformPanel platform="facebook" totals={facebook} connected={Boolean(report?.connection?.page_id)} />
            <PlatformPanel platform="instagram" totals={instagram} connected={Boolean(report?.connection?.instagram_account_id)} />
          </div>

          <div className="surface-card p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="section-kicker">Tendência</p><h3 className="section-title mt-1">Alcance diário</h3></div>
              <span className="text-xs text-slate-400">Facebook x Instagram</span>
            </div>
            {trendData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip formatter={(value) => formatInteger(value)} />
                  <Line type="monotone" dataKey="facebookReach" name="Facebook" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="instagramReach" name="Instagram" stroke="#db2777" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <OrganicEmptyState
                title="Nenhuma evolução diária disponível"
                description={hasConnection ? 'Clique em “Atualizar orgânico” para sincronizar este período.' : 'Conecte os perfis do cliente para iniciar.'}
              />
            )}
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-kicker">Conteúdo</p>
                <h3 className="section-title mt-1">Publicações com melhor desempenho</h3>
                <p className="mt-1 text-sm text-slate-500">Ranking por interações no período selecionado.</p>
              </div>
              <select className="input-field max-w-52" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                <option value="all">Todas as plataformas</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            {content.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Publicação</th>
                      <th className="px-4 py-3 font-semibold">Plataforma</th>
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
                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                <span>{item.content_type || 'POST'}</span>
                                {item.permalink && (
                                  <a href={item.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[#0969ff] hover:underline">
                                    Abrir <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><PlatformBadge platform={item.platform} /></td>
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
                description={hasData ? 'A Meta não retornou publicações para este filtro.' : 'Sincronize os perfis para preencher o ranking.'}
              />
            )}
          </div>
        </>
      )}
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
        <span className="icon-tile bg-blue-50 text-blue-500"><Facebook size={18} /></span>
        <span className="icon-tile bg-pink-50 text-pink-500"><Instagram size={18} /></span>
      </div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
