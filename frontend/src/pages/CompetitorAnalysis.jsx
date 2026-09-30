import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, ExternalLink, ImagePlus, Instagram, Loader2, RefreshCw, Search, Settings2, Sparkles,
  Trash2, TrendingUp, UsersRound, X,
} from 'lucide-react';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';

function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { notation: Number(value || 0) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value || 0));
}
function date(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch { return value; } }
function Stat({ label, value, hint }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>; }
function Pills({ items = [], tone = 'slate' }) { const cls = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'; return <div className="flex flex-wrap gap-2">{items.length ? items.map((item, i) => <span key={`${item}-${i}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{item}</span>) : <span className="text-xs text-slate-400">Sem sinais suficientes na amostra.</span>}</div>; }

function ProfileCard({ competitor, active, onClick }) {
  const working = ['pending', 'analyzing'].includes(competitor.status);
  const statusLabel = competitor.status === 'ready' ? 'Pronto' : competitor.status === 'error' ? 'Falhou' : 'Coletando';
  return <button type="button" onClick={onClick} className={`w-full rounded-2xl border p-3 text-left transition ${active ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
    <div className="flex items-center gap-3">{competitor.profile_picture_url ? <img src={competitor.profile_picture_url} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400"><Instagram size={18} /></div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{competitor.display_name || `@${competitor.instagram_username}`}</p><p className="truncate text-xs text-slate-500">@{competitor.instagram_username}</p></div>{working ? <Loader2 size={14} className="animate-spin text-amber-500" /> : <span className={`h-2 w-2 rounded-full ${competitor.status === 'ready' ? 'bg-emerald-500' : 'bg-rose-500'}`} />}</div>
    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
      {competitor.status === 'ready' ? <><span><b className="text-slate-700">{fmt(competitor.followers_count)}</b> seguidores</span><span><b className="text-slate-700">{fmt(competitor.media_count)}</b> posts</span></> : <span className={competitor.status === 'error' ? 'font-semibold text-rose-600' : 'font-semibold text-amber-600'}>{statusLabel}</span>}
    </div>
  </button>;
}

export default function CompetitorAnalysis() {
  const navigate = useNavigate();
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';
  const canEdit = user?.role !== 'client';
  const [input, setInput] = useState('');
  const [competitors, setCompetitors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('analysis');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [collector, setCollector] = useState({ configured: false, collector: null, candidates: [] });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [moodMsg, setMoodMsg] = useState('');

  async function load() {
    if (!clientId) { setCompetitors([]); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/competitors', { params: { client_id: clientId, _ts: Date.now() } });
      setCompetitors(data.competitors || []);
      setCollector(data.collector || { configured: false, collector: null, candidates: [] });
      setSelectedId((current) => current && (data.competitors || []).some((c) => Number(c.id) === Number(current)) ? current : data.competitors?.[0]?.id || null);
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível carregar os concorrentes.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasWorkingCompetitors = competitors.some((item) => ['pending', 'analyzing'].includes(item.status));
  useEffect(() => {
    if (!clientId || !hasWorkingCompetitors) return undefined;
    const timer = window.setInterval(() => { load(); }, 3500);
    return () => window.clearInterval(timer);
  }, [clientId, hasWorkingCompetitors]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = competitors.find((c) => Number(c.id) === Number(selectedId)) || null;
  const snapshot = selected?.latest || null;
  const analysis = snapshot?.analysis || {};
  const metrics = snapshot?.metrics || {};
  const media = snapshot?.media || [];

  function markCompassComplete() {
    if (!clientId) return;
    const key = `zebrahub:compass-journey:${clientId}`;
    try {
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      const next = {
        ...current,
        coleta: {
          ...(current?.coleta || {}),
          'Análise dos concorrentes': true,
        },
      };
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  async function analyzeNew(event) {
    event?.preventDefault(); if (!input.trim() || !clientId) return;
    setAnalyzing(true); setError(''); setNotice('');
    try {
      const { data } = await api.post('/competitors', { client_id: clientId, input: input.trim() });
      const totalAdded = Number(data.added?.length || 0);
      const totalExisting = Number(data.existing?.length || 0);
      const totalSkipped = Number(data.skipped?.length || 0);
      setInput(''); markCompassComplete();
      setNotice(totalAdded ? `${totalAdded} concorrente${totalAdded === 1 ? '' : 's'} adicionado${totalAdded === 1 ? '' : 's'}. A coleta está acontecendo em segundo plano.` : totalExisting ? 'Esse concorrente já estava monitorado. Atualizei a fila quando necessário.' : 'Nenhum novo concorrente foi adicionado.');
      if (totalSkipped) setNotice((current) => `${current} Limite de ${data.limit || 10} concorrentes por cliente atingido.`);
      await load();
      const firstId = data.added?.[0]?.id || data.existing?.[0]?.id;
      if (firstId) setSelectedId(firstId);
      setTab('analysis');
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível adicionar esse perfil.'); } finally { setAnalyzing(false); }
  }

  async function refreshSelected() {
    if (!selected) return; setAnalyzing(true); setError('');
    try { await api.post(`/competitors/${selected.id}/analyze`); markCompassComplete(); await load(); } catch (err) { setError(err.response?.data?.error || 'Não foi possível atualizar a análise.'); } finally { setAnalyzing(false); }
  }

  async function removeSelected() {
    if (!selected || !window.confirm(`Remover @${selected.instagram_username} desta análise?`)) return;
    await api.delete(`/competitors/${selected.id}`); setSelectedId(null); await load();
  }

  async function addPostToMoodboard(post) {
    setMoodMsg('');
    try {
      const board = await api.get('/moodboards', { params: { client_id: clientId } });
      const collectionId = board.data.collections?.[0]?.id;
      if (!collectionId) throw new Error('Coleção do Moodboard indisponível');
      const image = post.thumbnail_url || post.media_url;
      await api.post('/moodboards/items', {
        client_id: clientId, collection_id: collectionId, item_type: image ? 'image' : 'link', category: 'Geral',
        title: `Referência · @${selected.instagram_username}`,
        note: 'Referência adicionada a partir da análise de concorrentes.',
        source_url: image || post.permalink,
      });
      setMoodMsg('Referência enviada para o Moodboard.');
    } catch (err) { setMoodMsg(err.response?.data?.error || 'Não foi possível enviar ao Moodboard.'); }
  }

  const compareRows = useMemo(() => competitors.filter((c) => c.latest).map((c) => ({
    id: c.id, name: `@${c.instagram_username}`, followers: c.followers_count, posts30: c.latest?.metrics?.posts_last_30_days || 0,
    avgLikes: c.latest?.metrics?.average_likes || 0, avgComments: c.latest?.metrics?.average_comments || 0,
    positioning: c.latest?.analysis?.positioning || '—', tone: (c.latest?.analysis?.tone || []).slice(0, 3).join(', ') || '—',
  })), [competitors]);

  return (
    <div className="space-y-4">
      {!clientId ? <section className="rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center"><Search className="mx-auto text-blue-600" size={28} /><h2 className="mt-3 font-bold text-slate-900">Selecione um cliente</h2><p className="mt-1 text-sm text-slate-500">A análise é salva separadamente por cliente.</p></section> : <>
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-blue-600">Inteligência competitiva</p>
              <h1 className="mt-0.5 text-xl font-black text-slate-950">Concorrentes · {clientName}</h1>
              <p className="mt-1 text-xs text-slate-500">Cadastre os @. O ZebraHub coleta, salva e analisa em segundo plano.</p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${collector.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {collector.configured ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {collector.configured ? `Coleta pronta${collector.collector?.instagram_username ? ` · @${collector.collector.instagram_username}` : ''}` : 'Coleta precisa ser configurada uma vez'}
            </div>
          </div>
          {canEdit && <form onSubmit={analyzeNew} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Instagram className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="@concorrente1, @concorrente2..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
            <button disabled={analyzing || !input.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{analyzing ? <Loader2 className="animate-spin" size={16} /> : <Instagram size={16} />}{analyzing ? 'Adicionando...' : 'Adicionar'}</button>
          </form>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>Você pode colar vários @ separados por espaço ou vírgula.</span>
            {!collector.configured && canEdit && <button type="button" onClick={() => navigate('/configuracoes/integracoes')} className="inline-flex items-center gap-1 font-bold text-blue-600"><Settings2 size={12} /> Configurar coleta</button>}
          </div>
        </section>
        {notice && <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"><Clock3 size={16} className="mt-0.5 shrink-0" />{notice}</div>}
        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><X size={16} className="mt-0.5 shrink-0" />{error}</div>}
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2 rounded-[24px] border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-center justify-between px-1 pb-1"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Monitorados</p><span className="text-xs font-bold text-slate-400">{competitors.length}</span></div>{loading ? <div className="py-10 text-center text-xs text-slate-400">Carregando...</div> : competitors.length ? competitors.map((c) => <ProfileCard key={c.id} competitor={c} active={Number(c.id) === Number(selectedId)} onClick={() => { setSelectedId(c.id); setTab('analysis'); }} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><Search className="mx-auto text-slate-300" size={22} /><p className="mt-2 text-sm font-semibold text-slate-600">Nenhum concorrente ainda</p></div>}</aside>
          <main className="min-w-0">
            {!selected ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-12 text-center"><BarChart3 className="mx-auto text-slate-300" size={30} /><h2 className="mt-3 font-bold text-slate-800">Adicione o primeiro concorrente</h2></div> : <div className="space-y-4">
              <section className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start gap-4">{selected.profile_picture_url ? <img src={selected.profile_picture_url} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Instagram size={24} /></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-950">{selected.display_name || `@${selected.instagram_username}`}</h2><a href={selected.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">@{selected.instagram_username}<ExternalLink size={12} /></a></div>{['pending','analyzing'].includes(selected.status) ? <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-600"><Loader2 size={15} className="animate-spin" />Coletando informações e preparando a análise...</p> : selected.status === 'error' ? <p className="mt-2 max-w-3xl text-sm leading-6 text-rose-600">{selected.last_error || 'Não foi possível concluir a leitura.'}</p> : <><p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-500">{selected.biography || 'Sem bio disponível na leitura atual.'}</p><p className="mt-2 text-[11px] text-slate-400">Última leitura: {date(snapshot?.captured_at)}</p></>}</div>{canEdit && <div className="flex gap-2"><button type="button" onClick={refreshSelected} disabled={analyzing || ['pending','analyzing'].includes(selected.status)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={analyzing ? 'animate-spin' : ''} />{selected.status === 'error' ? 'Tentar de novo' : 'Atualizar'}</button><button type="button" onClick={removeSelected} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></div>}</div>
              </section>
              {selected.status === 'error' && !collector.configured && <button type="button" onClick={() => navigate('/configuracoes/integracoes')} className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800"><span>Configure uma conta coletora uma única vez para liberar todas as análises.</span><Settings2 size={16} /></button>}
              {selected.status === 'ready' && <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setTab('analysis')} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === 'analysis' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>Análise</button><button onClick={() => setTab('posts')} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === 'posts' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>Posts ({media.length})</button><button onClick={() => setTab('compare')} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === 'compare' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>Comparar</button></div>}
              {selected.status === 'ready' && <>              {tab === 'analysis' && <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Seguidores" value={fmt(selected.followers_count)} /><Stat label="Posts na amostra / 30d" value={metrics.posts_last_30_days ?? '—'} hint={`${metrics.sample_size || 0} posts coletados`} /><Stat label="Média de curtidas" value={fmt(metrics.average_likes)} /><Stat label="Média de comentários" value={fmt(metrics.average_comments)} /></div>
                <section className="rounded-[24px] border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Sparkles size={16} className="text-blue-600" /><p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">Leitura estratégica</p></div><p className="mt-3 text-base font-semibold leading-7 text-slate-800">{analysis.summary || 'A leitura estratégica ainda não foi gerada.'}</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Posicionamento percebido</p><p className="mt-2 text-sm leading-6 text-slate-700">{analysis.positioning || '—'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Público aparente</p><p className="mt-2 text-sm leading-6 text-slate-700">{analysis.likely_audience || '—'}</p></div></div></section>
                <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-[24px] border border-slate-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Pilares na amostra</p><div className="mt-4 space-y-3">{(analysis.pillars || []).length ? analysis.pillars.map((p, i) => <div key={i}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-800">{p.name}</span><span className="font-black text-blue-600">{p.share}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0,Math.min(100,p.share || 0))}%` }} /></div><p className="mt-1 text-xs leading-5 text-slate-500">{p.evidence}</p></div>) : <p className="text-sm text-slate-400">Sem classificação de pilares.</p>}</div></section><section className="rounded-[24px] border border-slate-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Tom e direção visual</p><div className="mt-3"><Pills items={analysis.tone || []} tone="blue" /></div><div className="mt-4 space-y-2">{(analysis.visual_direction || []).map((v,i) => <p key={i} className="text-sm leading-6 text-slate-600">• {v}</p>)}</div></section></div>
                <div className="grid gap-4 lg:grid-cols-3"><section className="rounded-[24px] border border-slate-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Sinais comerciais</p><div className="mt-3 space-y-2">{(analysis.commercial_signals || []).map((v,i)=><p key={i} className="text-sm leading-6 text-slate-600">• {v}</p>)}</div></section><section className="rounded-[24px] border border-slate-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Lacunas observadas</p><div className="mt-3 space-y-2">{(analysis.gaps_observed || []).map((v,i)=><p key={i} className="text-sm leading-6 text-slate-600">• {v}</p>)}</div></section><section className="rounded-[24px] border border-blue-200 bg-blue-50/40 p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">Oportunidades para testar</p><div className="mt-3 space-y-2">{(analysis.opportunities || []).map((v,i)=><p key={i} className="text-sm leading-6 text-slate-700">• {v}</p>)}</div></section></div>
              </>}
              {tab === 'posts' && <section className="rounded-[24px] border border-slate-200 bg-white p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black text-slate-900">Amostra de conteúdo</h3><p className="text-xs text-slate-400">Posts retornados pela API na última leitura.</p></div>{moodMsg && <span className="text-xs font-semibold text-blue-600">{moodMsg}</span>}</div><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{media.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{post.thumbnail_url || post.media_url ? <img src={post.thumbnail_url || post.media_url} alt="" className="aspect-square w-full bg-slate-100 object-cover" /> : <div className="grid aspect-square place-items-center bg-slate-100 text-slate-300"><Instagram size={28} /></div>}<div className="p-3"><div className="flex items-center justify-between text-[11px] text-slate-400"><span>{post.media_type}</span><span>{fmt(post.like_count)} curtidas · {fmt(post.comments_count)} comentários</span></div><p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">{post.caption || 'Sem legenda.'}</p><div className="mt-3 flex gap-2"><a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Abrir <ExternalLink size={12} /></a>{canEdit && <button type="button" onClick={() => addPostToMoodboard(post)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white"><ImagePlus size={13} /> Moodboard</button>}</div></div></article>)}</div></section>}
              {tab === 'compare' && <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h3 className="font-black text-slate-900">Comparativo dos concorrentes monitorados</h3><p className="mt-1 text-xs text-slate-400">Amostras coletadas em momentos diferentes podem ter tamanhos diferentes.</p></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Seguidores</th><th className="px-4 py-3">Posts 30d</th><th className="px-4 py-3">Média curtidas</th><th className="px-4 py-3">Comentários</th><th className="px-4 py-3">Tom</th><th className="px-4 py-3">Posicionamento percebido</th></tr></thead><tbody className="divide-y divide-slate-100">{compareRows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-bold text-slate-900">{row.name}</td><td className="px-4 py-3">{fmt(row.followers)}</td><td className="px-4 py-3">{row.posts30}</td><td className="px-4 py-3">{fmt(row.avgLikes)}</td><td className="px-4 py-3">{fmt(row.avgComments)}</td><td className="px-4 py-3 text-slate-500">{row.tone}</td><td className="max-w-sm px-4 py-3 text-xs leading-5 text-slate-500">{row.positioning}</td></tr>)}</tbody></table></div></section>}
              </>}
            </div>}
          </main>
        </div>
      </>}
    </div>
  );
}
