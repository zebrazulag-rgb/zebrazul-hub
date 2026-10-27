import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Clock3, ExternalLink, Flame, Layers, Loader2, Radar as RadarIcon, RefreshCw, Rss, Search, Settings2, Sparkles, Video, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import ClientRadarTab, { PromptModal } from '../components/ClientRadarTab.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { hasPermission } from '../permissions.js';

const PALETTE = ['#3A85FD', '#EC0567', '#8B5CF6', '#F59E0B', '#10B981', '#06B6D4', '#F97316'];
const colorFor = (key) => PALETTE[Math.abs([...String(key)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % PALETTE.length];
const errMsg = (e, fallback) => e?.response?.data?.error || fallback;

function timeAgo(iso) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return min < 2 ? 'agora' : `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24); if (d === 1) return 'ontem'; if (d < 7) return `há ${d} dias`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(t));
}
function updatedLabel(value) {
  if (!value) return 'ainda sem leitura';
  return timeAgo(`${String(value).replace(' ', 'T')}${String(value).includes('T') ? '' : 'Z'}`);
}
const PERIODS = [['all', 'Últimos 30 dias'], ['today', 'Hoje'], ['7', '7 dias']];
function periodRange(period) {
  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  if (period === 'today') return { from: iso(Date.now() - 3 * 3600 * 1000) };
  if (period === '7') return { from: iso(Date.now() - 7 * 86400000) };
  if (period === '30') return { from: iso(Date.now() - 30 * 86400000) };
  return {};
}

function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-52 animate-pulse rounded-3xl border border-slate-200 bg-white/70" />)}
    </div>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="brand-display mt-1 text-3xl leading-none" style={{ color: accent || '#fff' }}>{value ?? '—'}</p>
    </div>
  );
}

function ClientPicker({ clients, onPick, loading }) {
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-[#17181C] px-6 py-8 text-white sm:px-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[26px] border-[#EC0567]/60" />
        <div className="pointer-events-none absolute -right-2 top-10 h-56 w-56 rounded-full border-[22px] border-[#C9FF2F]/70" />
        <span className="inline-flex items-center gap-2 rounded-full bg-[#C9FF2F] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#17181C]"><RadarIcon size={12} /> Radar de Conteúdo</span>
        <h1 className="brand-display mt-4 max-w-2xl text-4xl uppercase leading-[0.95] sm:text-6xl">Qual mercado você quer escutar hoje?</h1>
        <p className="mt-3 max-w-xl text-sm text-white/65">Notícias do setor de cada cliente, prontas para virar carrossel e roteiro.</p>
      </section>
      {loading ? <Skeleton /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-xl">
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: c.logo_color || colorFor(c.name) }} />
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-black text-white" style={{ backgroundColor: c.logo_color || colorFor(c.name) }}>{c.name?.[0]?.toUpperCase()}</span>
                {c.new_since_visit > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#C9FF2F] px-2.5 py-1 text-[11px] font-black text-[#17181C]"><Sparkles size={11} /> {c.new_since_visit} nova{c.new_since_visit > 1 ? 's' : ''}</span>}
              </div>
              <h3 className="mt-3 truncate text-base font-bold text-slate-900">{c.name}</h3>
              <p className="truncate text-xs text-slate-400">{c.segment || 'Segmento não informado'}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">{c.sources ? `${c.sources} fonte(s) · ${c.week} notícia(s) na semana` : 'Sem fontes ainda'}</p>
            </button>
          ))}
          {!clients.length && <p className="col-span-full rounded-3xl border border-dashed border-slate-200 px-6 py-14 text-center text-sm text-slate-400">Nenhum cliente disponível para você.</p>}
        </div>
      )}
    </div>
  );
}

function NewsCard({ item, featured, canPrompt, onPrompt, onSave }) {
  const color = colorFor(item.source_name);
  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white transition hover:-translate-y-0.5 hover:shadow-xl ${item.is_new ? 'border-[#C9FF2F] shadow-[0_0_0_2px_rgba(201,255,47,.55)]' : 'border-slate-200'} ${featured ? 'md:col-span-2 xl:col-span-3 md:flex-row' : ''}`}>
      <div className={featured ? 'flex w-full shrink-0 flex-col justify-between p-6 text-white md:w-[38%]' : 'h-1.5 w-full shrink-0'} style={{ backgroundColor: color }}>
        {featured && (
          <>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"><Flame size={12} /> Destaque</span>
            <div className="mt-8"><p className="text-xs font-bold uppercase tracking-wider text-white/75">{item.source_name}</p><p className="brand-display mt-1 text-5xl leading-none">{timeAgo(item.published_at)}</p></div>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold">
            {!featured && <span className="max-w-[55%] truncate rounded-full px-2.5 py-1 text-white" style={{ backgroundColor: color }}>{item.source_name}</span>}
            {!featured && <span className="inline-flex items-center gap-1 text-slate-400"><Clock3 size={11} /> {timeAgo(item.published_at)}</span>}
            {item.is_new && <span className="rounded-full bg-[#C9FF2F] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#17181C]">Nova</span>}
          </div>
          <button type="button" onClick={() => onSave(item)} aria-label={item.saved ? 'Remover dos salvos' : 'Salvar notícia'} title={item.saved ? 'Remover dos salvos' : 'Salvar'}
            className={`rounded-full p-1.5 transition ${item.saved ? 'bg-[#EC0567]/10 text-[#EC0567]' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'}`}>
            {item.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
        <h3 className={`mt-3 font-extrabold leading-snug text-slate-900 ${featured ? 'text-xl sm:text-2xl' : 'text-[15px]'}`}>
          {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:text-[#3A85FD]">{item.title}</a> : item.title}
        </h3>
        {item.summary && <p className={`mt-2 text-slate-500 ${featured ? 'text-sm leading-6 line-clamp-4' : 'text-xs leading-5 line-clamp-3'}`}>{item.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {canPrompt && (
            <>
              <button type="button" onClick={() => onPrompt(item, 'carousel')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#17181C] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#3A85FD]"><Layers size={13} /> Carrossel</button>
              <button type="button" onClick={() => onPrompt(item, 'video')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#EC0567] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#c20456]"><Video size={13} /> Roteiro de vídeo</button>
            </>
          )}
          {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700">Ler matéria <ExternalLink size={11} /></a>}
        </div>
      </div>
    </article>
  );
}

function RadarFeed({ client, user }) {
  const canRefresh = hasPermission(user, 'radar.refresh');
  const canPrompt = hasPermission(user, 'radar.prompts');
  const canManage = hasPermission(user, 'radar.sources') || hasPermission(user, 'radar.history');
  const [overview, setOverview] = useState(null);
  const [data, setData] = useState({ items: [], total: 0, sources: [] });
  const [filters, setFilters] = useState({ period: 'all', source_id: '', q: '', saved: false, only_new: false });
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(null);
  const [manage, setManage] = useState(false);
  const seenTimer = useRef(null);

  const query = useCallback((offset = 0) => ({
    ...periodRange(filters.period), source_id: filters.source_id || undefined, q: filters.q || undefined,
    saved: filters.saved ? 1 : undefined, only_new: filters.only_new ? 1 : undefined, limit: 24, offset,
  }), [filters]);

  const loadOverview = useCallback(() => api.get(`/radar/clients/${client.id}/overview`).then(({ data: o }) => setOverview(o)).catch(() => {}), [client.id]);
  const loadItems = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data: res } = await api.get(`/radar/clients/${client.id}/items`, { params: query(0) }); setData(res); }
    catch (e) { setError(errMsg(e, 'Não foi possível carregar o Radar.')); } finally { setLoading(false); }
  }, [client.id, query]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadItems(); }, [loadItems]);
  // Marca como visto depois de alguns segundos, para dar tempo de ver o selo "Nova".
  useEffect(() => {
    seenTimer.current = setTimeout(() => { api.post(`/radar/clients/${client.id}/seen`).then(() => window.dispatchEvent(new Event('radar:seen'))).catch(() => {}); }, 6000);
    return () => clearTimeout(seenTimer.current);
  }, [client.id]);
  useEffect(() => { const t = setTimeout(() => setFilters((f) => (f.q === typed.trim() ? f : { ...f, q: typed.trim() })), 350); return () => clearTimeout(t); }, [typed]);

  async function loadMore() {
    setLoadingMore(true);
    try { const { data: res } = await api.get(`/radar/clients/${client.id}/items`, { params: query(data.items.length) }); setData((cur) => ({ ...res, items: [...cur.items, ...res.items] })); }
    catch (e) { setError(errMsg(e, 'Não foi possível carregar mais.')); } finally { setLoadingMore(false); }
  }
  async function refresh() {
    setRefreshing(true); setNotice(''); setError('');
    try {
      const { data: res } = await api.post(`/radar/clients/${client.id}/refresh`);
      setNotice(res.sources === 0 ? (res.skipped ? 'Tudo atualizado há instantes.' : 'Nenhuma fonte ativa para atualizar.') : `${res.added} notícia(s) nova(s)${res.failed ? ` · ${res.failed} fonte(s) com problema` : ''}.`);
      await Promise.all([loadItems(), loadOverview()]);
    } catch (e) { setError(errMsg(e, 'Não foi possível atualizar.')); } finally { setRefreshing(false); }
  }
  async function toggleSave(item) {
    setData((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === item.id ? { ...i, saved: !i.saved } : i)) }));
    try { if (item.saved) await api.delete(`/radar/items/${item.id}/save`); else await api.post(`/radar/items/${item.id}/save`); }
    catch { setData((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === item.id ? { ...i, saved: item.saved } : i)) })); }
  }

  const stats = overview?.stats;
  const headline = !stats ? 'CARREGANDO O MERCADO…'
    : stats.new_since_visit > 0 ? `${stats.new_since_visit} ${stats.new_since_visit === 1 ? 'NOVIDADE' : 'NOVIDADES'} PARA VOCÊ.`
    : stats.total === 0 ? 'O RADAR AINDA ESTÁ VAZIO.' : 'TUDO EM DIA POR AQUI.';
  const trending = overview?.trending || [];
  const featured = !filters.saved && !filters.q && !filters.source_id && data.items.length > 3 ? data.items[0] : null;
  const rest = featured ? data.items.slice(1) : data.items;
  const chip = (active) => `rounded-full px-3.5 py-1.5 text-xs font-bold transition ${active ? 'bg-[#17181C] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-[#17181C] px-6 py-7 text-white sm:px-9 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[28px] border-[#EC0567]/55" />
        <div className="pointer-events-none absolute right-6 top-16 h-60 w-60 rounded-full border-[24px] border-[#C9FF2F]/65" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#C9FF2F] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#17181C]"><RadarIcon size={12} /> Radar · {client.name}</span>
            <span className="text-xs font-semibold text-white/55">Atualizado {updatedLabel(stats?.last_updated_at)}</span>
          </div>
          <h1 className="brand-display mt-4 max-w-3xl text-4xl uppercase leading-[0.95] sm:text-6xl">{headline}</h1>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4">
            <StatTile label="Novas p/ você" value={stats?.new_since_visit} accent="#C9FF2F" />
            <StatTile label="Hoje" value={stats?.today} />
            <StatTile label="Na semana" value={stats?.week} />
            <StatTile label="Fontes ativas" value={stats?.sources_active} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {canRefresh && <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-4 py-2.5 text-sm font-black text-white hover:bg-[#2f73e0] disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar agora</button>}
            {canManage && <button type="button" onClick={() => setManage(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"><Settings2 size={15} /> Fontes e referências</button>}
          </div>
        </div>
      </section>

      {trending.length > 0 && (
        <section aria-label="Em alta" className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#EC0567]"><Flame size={14} /> Em alta</span>
          {trending.map((t) => (
            <button key={t.term} type="button" onClick={() => { setTyped(t.term); setFilters((f) => ({ ...f, q: t.term })); }} className="rounded-full border border-[#EC0567]/25 bg-[#EC0567]/[0.06] px-3 py-1 text-xs font-bold text-[#c20456] transition hover:bg-[#EC0567] hover:text-white">
              #{t.term} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </section>
      )}

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Buscar por palavra-chave…" className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-[#3A85FD]" />
            {typed && <button type="button" onClick={() => { setTyped(''); setFilters((f) => ({ ...f, q: '' })); }} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={14} /></button>}
          </div>
          {PERIODS.map(([key, label]) => <button key={key} type="button" onClick={() => setFilters((f) => ({ ...f, period: key }))} className={chip(filters.period === key)}>{label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFilters((f) => ({ ...f, only_new: !f.only_new }))} className={chip(filters.only_new)}><Sparkles size={11} className="mr-1 inline" />Só novas</button>
          <button type="button" onClick={() => setFilters((f) => ({ ...f, saved: !f.saved }))} className={chip(filters.saved)}><Bookmark size={11} className="mr-1 inline" />Salvas</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={() => setFilters((f) => ({ ...f, source_id: '' }))} className={chip(!filters.source_id)}>Todas as fontes</button>
          {data.sources.map((s) => (
            <button key={s.id} type="button" onClick={() => setFilters((f) => ({ ...f, source_id: String(s.id) }))} className={chip(String(filters.source_id) === String(s.id))}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(s.name) }} />{s.name}
            </button>
          ))}
        </div>
      </section>

      {notice && <p className="rounded-2xl bg-[#3A85FD]/10 px-4 py-2.5 text-sm font-semibold text-[#2563d6]">{notice}</p>}
      {error && <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {loading ? <Skeleton /> : (
        <>
          <p className="text-xs font-semibold text-slate-400">{data.total} notícia(s)</p>
          {!data.items.length && !error && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#17181C] text-[#C9FF2F]"><Rss size={24} /></span>
              <h3 className="brand-display mt-4 text-3xl uppercase text-slate-900">{stats?.sources_active ? 'Nada por aqui com esses filtros' : 'Vamos ligar o radar?'}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{stats?.sources_active ? 'Tente outro período, tire a busca ou atualize as fontes.' : 'Cadastre os sites e blogs que esse cliente precisa acompanhar. O Radar traz as notícias e já monta os prompts.'}</p>
              {!stats?.sources_active && hasPermission(user, 'radar.sources') && <button type="button" onClick={() => setManage(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-5 py-2.5 text-sm font-black text-white"><Settings2 size={15} /> Adicionar fontes</button>}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured && <NewsCard item={featured} featured canPrompt={canPrompt} onPrompt={(item, kind) => setPrompt({ item, kind })} onSave={toggleSave} />}
            {rest.map((item) => <NewsCard key={item.id} item={item} canPrompt={canPrompt} onPrompt={(i, kind) => setPrompt({ item: i, kind })} onSave={toggleSave} />)}
          </div>
          {data.items.length < data.total && (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50">{loadingMore && <Loader2 size={14} className="animate-spin" />} Carregar mais notícias</button>
          )}
        </>
      )}

      {prompt && <PromptModal item={prompt.item} kind={prompt.kind} onClose={() => setPrompt(null)} onGenerated={() => {}} />}
      {manage && (
        <ModalBackdrop onClose={() => { setManage(false); loadItems(); loadOverview(); }} className="z-[60]">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-900">Fontes e referências</h2><p className="text-xs text-slate-400">{client.name}</p></div>
              <button type="button" onClick={() => { setManage(false); loadItems(); loadOverview(); }} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="Fechar">×</button>
            </div>
            <ClientRadarTab client={client} user={user} hideNews />
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

export default function Radar() {
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const isClient = user?.role === 'client';
  const [client, setClient] = useState(null);
  const [summary, setSummary] = useState({ clients: [], loading: true });

  useEffect(() => {
    if (isClient && user?.client_id) { setClient({ id: Number(user.client_id), name: user.client_name || user.name }); return; }
    if (selectedClient?.id) setClient(selectedClient); else setClient(null);
  }, [isClient, user, selectedClient]);

  useEffect(() => {
    if (client || isClient) return;
    api.get('/radar/summary').then(({ data }) => setSummary({ clients: data.clients, loading: false })).catch(() => setSummary({ clients: [], loading: false }));
  }, [client, isClient]);

  // Para o cliente, busca o nome real (o objeto de usuário pode não trazer).
  useEffect(() => {
    if (!isClient || !user?.client_id) return;
    api.get(`/radar/clients/${user.client_id}/overview`).then(({ data }) => setClient({ id: data.client.id, name: data.client.name })).catch(() => {});
  }, [isClient, user?.client_id]);

  return (
    <div className="mx-auto w-full max-w-6xl px-1 pb-10">
      {client ? <RadarFeed key={client.id} client={client} user={user} /> : (
        <ClientPicker clients={summary.clients} loading={summary.loading} onPick={(c) => setSelectedClient({ id: c.id, name: c.name, status: 'active', logo_color: c.logo_color })} />
      )}
    </div>
  );
}
