import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Plus, RefreshCw, Search, Trash2, Wand2 } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import { hasPermission } from '../permissions.js';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};
const fmtDateTime = (value) => {
  if (!value) return 'nunca';
  const d = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
};
const errMsg = (e, fallback) => e?.response?.data?.error || fallback;
const KIND_LABEL = { carousel: 'Carrossel', video: 'Roteiro de vídeo' };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(area); return ok;
  }
}

export function CopyButton({ text, label = 'Copiar' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); } }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#17181C] px-3 py-1.5 text-xs font-bold text-white hover:bg-black">
      {done ? <Check size={13} className="text-[#C9FF2F]" /> : <Copy size={13} />} {done ? 'Copiado' : label}
    </button>
  );
}

export function PromptModal({ item, kind, onClose, onGenerated }) {
  const [angle, setAngle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true); setError('');
    try {
      const { data } = await api.post(`/radar/items/${item.id}/prompt`, { kind, angle });
      setPrompt(data.prompt); onGenerated?.();
    } catch (e) { setError(errMsg(e, 'Não foi possível gerar o prompt.')); } finally { setLoading(false); }
  }

  return (
    <ModalBackdrop onClose={onClose} className="z-[70]">
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3A85FD]">Prompt para {kind === 'carousel' ? 'carrossel' : 'roteiro de vídeo'}</p>
            <h3 className="mt-1 text-base font-bold text-slate-900">{item.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>
        {!prompt ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Ângulo ou foco (opcional)
              <input value={angle} maxLength={500} onChange={(e) => setAngle(e.target.value)} placeholder="Ex.: desmistificar, foco em prevenção, tom mais leve"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#3A85FD]" />
            </label>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">O ZebraHub só monta o texto do prompt. Nada é enviado a nenhuma IA: você copia e usa por conta própria.</p>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancelar</button>
              <button type="button" onClick={generate} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Gerar prompt
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <textarea readOnly value={prompt} rows={16} onFocus={(e) => e.target.select()} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700" />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Salvo no histórico do cliente.</span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Fechar</button>
                <CopyButton text={prompt} label="Copiar prompt" />
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}

function NewsPanel({ client, canRefresh, canPrompt, onPromptGenerated }) {
  const [filters, setFilters] = useState({ from: '', to: '', source_id: '', q: '', match: 'all' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState({ items: [], total: 0, sources: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(null);

  const params = useCallback((f, offset = 0) => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: 30, offset }), []);

  const load = useCallback(async (f) => {
    setLoading(true); setError('');
    try { const { data: res } = await api.get(`/radar/clients/${client.id}/items`, { params: params(f) }); setData(res); }
    catch (e) { setError(errMsg(e, 'Não foi possível carregar as notícias.')); } finally { setLoading(false); }
  }, [client.id, params]);

  useEffect(() => { load(applied); }, [applied, load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const { data: res } = await api.get(`/radar/clients/${client.id}/items`, { params: params(applied, data.items.length) });
      setData((cur) => ({ ...res, items: [...cur.items, ...res.items] }));
    } catch (e) { setError(errMsg(e, 'Não foi possível carregar mais.')); } finally { setLoadingMore(false); }
  }

  async function refresh() {
    setRefreshing(true); setNotice(''); setError('');
    try {
      const { data: res } = await api.post(`/radar/clients/${client.id}/refresh`);
      setNotice(res.sources === 0 && res.skipped ? 'As fontes foram atualizadas há instantes.' : res.sources === 0 ? 'Nenhuma fonte ativa para atualizar.' : `${res.added} notícia(s) nova(s)${res.failed ? ` · ${res.failed} fonte(s) com erro` : ''}.`);
      await load(applied);
    } catch (e) { setError(errMsg(e, 'Não foi possível atualizar.')); } finally { setRefreshing(false); }
  }

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#3A85FD]';
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setApplied(filters); }} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input type="date" aria-label="De" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={`${input} min-w-0`} />
          <input type="date" aria-label="Até" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={`${input} min-w-0`} />
          <select aria-label="Fonte" value={filters.source_id} onChange={(e) => setFilters({ ...filters, source_id: e.target.value })} className={`${input} min-w-0`}>
            <option value="">Todas as fontes</option>
            {data.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Palavras-chave (ex.: clareamento implante)" className={`${input} min-w-0 flex-1`} />
          <select aria-label="Combinação" value={filters.match} onChange={(e) => setFilters({ ...filters, match: e.target.value })} className={`${input} shrink-0`}>
            <option value="all">Todas as palavras</option><option value="any">Qualquer palavra</option>
          </select>
          <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#17181C] px-4 text-xs font-bold text-white"><Search size={14} /> Filtrar</button>
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{loading ? 'Carregando…' : `${data.total} notícia(s)`}</p>
        <div className="flex items-center gap-2">
          {(applied.from || applied.to || applied.source_id || applied.q) && (
            <button type="button" onClick={() => { const empty = { from: '', to: '', source_id: '', q: '', match: 'all' }; setFilters(empty); setApplied(empty); }} className="text-xs font-semibold text-slate-500 underline">Limpar filtros</button>
          )}
          {canRefresh && (
            <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Atualizar
            </button>
          )}
        </div>
      </div>
      {notice && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{notice}</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!loading && !data.items.length && !error && (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">Nenhuma notícia encontrada. {data.sources.length === 0 ? 'Cadastre fontes na aba Fontes para começar.' : 'Ajuste os filtros ou atualize as fontes.'}</p>
      )}
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold text-slate-400">{item.source_name} · {fmtDate(item.published_at)}</p>
            <h4 className="mt-1 text-sm font-bold leading-5 text-slate-900">
              {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:text-[#3A85FD]">{item.title} <ExternalLink size={11} className="inline" /></a> : item.title}
            </h4>
            {item.summary && <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.summary}</p>}
            {canPrompt && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPrompt({ item, kind: 'carousel' })} className="rounded-lg border border-[#3A85FD]/30 bg-[#3A85FD]/5 px-3 py-1.5 text-xs font-bold text-[#2563d6] hover:bg-[#3A85FD]/10">Gerar prompt para carrossel</button>
                <button type="button" onClick={() => setPrompt({ item, kind: 'video' })} className="rounded-lg border border-[#EC0567]/30 bg-[#EC0567]/5 px-3 py-1.5 text-xs font-bold text-[#c20456] hover:bg-[#EC0567]/10">Gerar prompt para roteiro de vídeo</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.items.length < data.total && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">
          {loadingMore && <Loader2 size={13} className="animate-spin" />} Carregar mais
        </button>
      )}
      {prompt && <PromptModal item={prompt.item} kind={prompt.kind} onClose={() => setPrompt(null)} onGenerated={onPromptGenerated} />}
    </div>
  );
}

function SourcesPanel({ client }) {
  const [sources, setSources] = useState([]);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [site, setSite] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [form, setForm] = useState({ name: '', feed_url: '', site_url: '', force: false });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [topic, setTopic] = useState({ query: '', days: 0 });
  const [addingTopic, setAddingTopic] = useState(false);

  async function addTopic(e) {
    e.preventDefault(); setAddingTopic(true); setError(''); setNotice('');
    try {
      const { data } = await api.post(`/radar/clients/${client.id}/topic-source`, topic);
      setNotice(`Assunto adicionado${data.warning ? ` (aviso: ${data.warning})` : ` · ${data.collected} notícia(s) coletada(s)`}.`);
      setTopic({ query: '', days: 0 }); await load();
    } catch (err) { setError(errMsg(err, 'Não foi possível adicionar o assunto.')); } finally { setAddingTopic(false); }
  }

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/radar/clients/${client.id}/sources`); setSources(data.sources); setLimit(data.limit); }
    catch (e) { setError(errMsg(e, 'Não foi possível carregar as fontes.')); } finally { setLoading(false); }
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  async function detect(e) {
    e.preventDefault(); setDetecting(true); setError(''); setNotice(''); setCandidates(null);
    try {
      const { data } = await api.post(`/radar/clients/${client.id}/discover`, { url: site });
      setCandidates(data.candidates);
      if (data.candidates[0]) setForm({ name: data.candidates[0].title || '', feed_url: data.candidates[0].feed_url, site_url: data.candidates[0].site_url || site, force: false });
      else { setForm({ name: '', feed_url: '', site_url: site, force: false }); setNotice('Essa página não publica um feed que eu consiga achar. Você pode colar abaixo o endereço do RSS/Atom (se souber) ou acompanhar o assunto por palavra-chave, no bloco “Acompanhar um assunto”.'); }
    } catch (err) { setError(errMsg(err, 'Não foi possível analisar o endereço.')); } finally { setDetecting(false); }
  }

  async function add(e) {
    e.preventDefault(); setAdding(true); setError(''); setNotice('');
    try {
      const { data } = await api.post(`/radar/clients/${client.id}/sources`, form);
      setNotice(`Fonte adicionada${data.warning ? ` (aviso: ${data.warning})` : ` · ${data.collected} notícia(s) coletada(s)`}.`);
      setSite(''); setCandidates(null); setForm({ name: '', feed_url: '', site_url: '', force: false });
      await load();
    } catch (err) {
      setError(errMsg(err, 'Não foi possível adicionar a fonte.'));
      if (err.response?.data?.can_force) setForm((f) => ({ ...f, force: true }));
    } finally { setAdding(false); }
  }

  async function patch(source, body) {
    setError('');
    try { await api.put(`/radar/sources/${source.id}`, body); await load(); } catch (err) { setError(errMsg(err, 'Não foi possível salvar.')); }
  }
  async function saveEdit() {
    await patch(editing, { name: editing.name, feed_url: editing.feed_url, site_url: editing.site_url || '' }); setEditing(null);
  }
  async function remove(source) {
    try { await api.delete(`/radar/sources/${source.id}`); setConfirmRemove(null); await load(); } catch (err) { setError(errMsg(err, 'Não foi possível remover.')); }
  }

  const input = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-[#3A85FD]';
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <h4 className="text-sm font-bold text-slate-800">Adicionar fonte</h4>
        <p className="mt-0.5 text-xs text-slate-500">Cole o endereço do site (ou do feed). Só aceitamos RSS/Atom reais, sem varrer páginas.</p>
        <form onSubmit={detect} className="mt-3 flex gap-2">
          <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://site.com.br" className={input} required />
          <button type="submit" disabled={detecting || sources.length >= limit} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#17181C] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {detecting ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Detectar feed
          </button>
        </form>
        {candidates && (
          <form onSubmit={add} className="mt-3 space-y-2">
            {candidates.length > 0 && (
              <div className="space-y-1.5">
                {candidates.map((c) => (
                  <label key={c.feed_url} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-xs ${form.feed_url === c.feed_url ? 'border-[#3A85FD] bg-white' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" name="cand" checked={form.feed_url === c.feed_url} onChange={() => setForm({ ...form, feed_url: c.feed_url, name: c.title || form.name, force: false })} className="mt-0.5" />
                    <span className="min-w-0"><strong className="block truncate text-slate-800">{c.title || c.feed_url}</strong><span className="block truncate text-slate-400">{c.feed_url} · {c.type?.toUpperCase()} · {c.sample_count} item(ns)</span>{c.method && c.method !== 'direto' && <span className="block text-[10px] text-slate-400">Encontrado por: {c.method}</span>}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-slate-500">Nome da fonte<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} placeholder="Ex.: Blog do setor" /></label>
              <label className="text-[11px] font-semibold text-slate-500">Endereço do feed (ajuste se precisar)<input value={form.feed_url} onChange={(e) => setForm({ ...form, feed_url: e.target.value, force: false })} className={`${input} mt-1`} required placeholder="https://site.com/feed" /></label>
            </div>
            {form.force && <p className="text-[11px] text-amber-700">Não consegui validar este feed agora. Você pode salvar mesmo assim; a fonte ficará marcada com erro até funcionar.</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={adding} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A85FD] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {form.force ? 'Salvar mesmo assim' : 'Adicionar fonte'}
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="rounded-2xl border border-[#C9FF2F]/60 bg-[#C9FF2F]/10 p-4">
        <h4 className="text-sm font-bold text-slate-800">Acompanhar um assunto</h4>
        <p className="mt-0.5 text-xs text-slate-500">Não precisa de site: digite o tema e o Radar traz as notícias de vários veículos sobre ele (via busca do Google Notícias).</p>
        <form onSubmit={addTopic} className="mt-3 flex flex-wrap gap-2">
          <input value={topic.query} onChange={(e) => setTopic({ ...topic, query: e.target.value })} placeholder='Ex.: saúde mental, "reforma tributária" advocacia' className={`${input} min-w-[220px] flex-1`} required minLength={2} maxLength={200} />
          <select value={topic.days} onChange={(e) => setTopic({ ...topic, days: Number(e.target.value) })} className={`${input} !w-auto`} aria-label="Período">
            <option value={0}>Qualquer data</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option>
          </select>
          <button type="submit" disabled={addingTopic || sources.length >= limit} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#17181C] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {addingTopic ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Acompanhar
          </button>
        </form>
      </section>
      {notice && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{notice}</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <section>
        <h4 className="text-sm font-bold text-slate-800">Fontes do cliente ({sources.length}/{limit})</h4>
        {loading && <p className="mt-3 text-xs text-slate-400">Carregando…</p>}
        {!loading && !sources.length && <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">Nenhuma fonte cadastrada.</p>}
        <ul className="mt-3 space-y-2">
          {sources.map((s) => (
            <li key={s.id} className={`rounded-2xl border p-3 ${s.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
              {editing?.id === s.id ? (
                <div className="space-y-2">
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} aria-label="Nome" />
                  <input value={editing.feed_url} onChange={(e) => setEditing({ ...editing, feed_url: e.target.value })} className={input} aria-label="Feed" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Cancelar</button>
                    <button type="button" onClick={saveEdit} className="rounded-lg bg-[#3A85FD] px-3 py-1.5 text-xs font-bold text-white">Salvar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{s.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{s.feed_url}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.last_status === 'error' ? 'bg-red-50 text-red-700' : s.last_status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.last_status === 'error' ? 'Com erro' : s.last_status === 'ok' ? 'Funcionando' : 'Aguardando'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{s.item_count} notícia(s) · última leitura {fmtDateTime(s.last_fetched_at)}{s.feed_type ? ` · ${s.feed_type.toUpperCase()}` : ''}</p>
                  {s.last_status === 'error' && s.last_error && <p className="mt-1 text-[11px] text-red-600">{s.last_error}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700"><input type="checkbox" checked={s.is_active} onChange={(e) => patch(s, { is_active: e.target.checked })} className="h-3.5 w-3.5 accent-[#3A85FD]" /> Ativa</label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700"><input type="checkbox" checked={s.client_visible} onChange={(e) => patch(s, { client_visible: e.target.checked })} className="h-3.5 w-3.5 accent-[#3A85FD]" /> Visível ao cliente</label>
                    <button type="button" onClick={() => setEditing({ id: s.id, name: s.name, feed_url: s.feed_url, site_url: s.site_url })} className="font-semibold text-[#2563d6] hover:underline">Editar</button>
                    {confirmRemove === s.id ? (
                      <span className="inline-flex items-center gap-2 text-red-700">Remover e apagar as notícias dela?
                        <button type="button" onClick={() => remove(s)} className="font-bold underline">Sim</button>
                        <button type="button" onClick={() => setConfirmRemove(null)} className="font-semibold">Não</button></span>
                    ) : (
                      <button type="button" onClick={() => setConfirmRemove(s.id)} className="inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"><Trash2 size={12} /> Remover</button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-5 text-slate-400">Desativar para a coleta e esconde as notícias da fonte; ao reativar, elas voltam. Remover apaga a fonte e as notícias coletadas, mas o histórico de prompts já gerados é mantido.</p>
      </section>
    </div>
  );
}

function ReferencesPanel({ client, canEdit }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get(`/radar/clients/${client.id}/editorial`).then(({ data }) => { setText(data.editorial_references || ''); setSaved(data.editorial_references || ''); })
      .catch((e) => setMsg(errMsg(e, 'Não foi possível carregar.'))).finally(() => setLoading(false));
  }, [client.id]);
  async function save() {
    setSaving(true); setMsg('');
    try { const { data } = await api.put(`/radar/clients/${client.id}/editorial`, { editorial_references: text }); setSaved(data.editorial_references); setText(data.editorial_references); setMsg('Referências salvas.'); }
    catch (e) { setMsg(errMsg(e, 'Não foi possível salvar.')); } finally { setSaving(false); }
  }
  if (loading) return <p className="text-xs text-slate-400">Carregando…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-slate-500">Estas referências entram automaticamente em todos os prompts deste cliente: perfis admirados, tom de voz, palavras a usar ou evitar, formatos que funcionam.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} rows={12}
        placeholder={'Ex.:\n- Tom: acolhedor, direto, sem jargão técnico\n- Referências: @perfil1 (didático), @perfil2 (bastidores)\n- Evitar: promessas de resultado, termos alarmistas'}
        className="w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-[#3A85FD]" />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{text.length.toLocaleString('pt-BR')} caracteres</span>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs font-semibold text-slate-500">{msg}</span>}
          {canEdit && <button type="button" onClick={save} disabled={saving || text === saved} className="rounded-xl bg-[#3A85FD] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Salvando…' : 'Salvar referências'}</button>}
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ client, refreshKey }) {
  const [kind, setKind] = useState('');
  const [data, setData] = useState({ history: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(async (offset = 0) => {
    setLoading(true); setError('');
    try {
      const { data: res } = await api.get(`/radar/clients/${client.id}/history`, { params: { kind: kind || undefined, limit: 30, offset } });
      setData((cur) => (offset ? { ...res, history: [...cur.history, ...res.history] } : res));
    } catch (e) { setError(errMsg(e, 'Não foi possível carregar o histórico.')); } finally { setLoading(false); }
  }, [client.id, kind]);
  useEffect(() => { load(0); }, [load, refreshKey]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{data.total} prompt(s) gerado(s) para este cliente.</p>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs">
          <option value="">Todos os tipos</option><option value="carousel">Carrossel</option><option value="video">Roteiro de vídeo</option>
        </select>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!loading && !data.history.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">Nenhum prompt gerado ainda.</p>}
      <ul className="space-y-2">
        {data.history.map((h) => (
          <li key={h.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${h.kind === 'carousel' ? 'bg-[#3A85FD]/10 text-[#2563d6]' : 'bg-[#EC0567]/10 text-[#c20456]'}`}>{KIND_LABEL[h.kind]}</span>
                <p className="mt-1 text-sm font-semibold text-slate-900">{h.item_title}</p>
                <p className="text-[11px] text-slate-400">{h.source_name} · {fmtDateTime(h.created_at)} · {h.created_by_name || 'usuário removido'}{h.angle ? ` · ângulo: ${h.angle}` : ''}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setOpen(open === h.id ? null : h.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">{open === h.id ? 'Ocultar' : 'Ver prompt'}</button>
                <CopyButton text={h.prompt_text} />
              </div>
            </div>
            {open === h.id && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700">{h.prompt_text}</pre>}
          </li>
        ))}
      </ul>
      {data.history.length < data.total && <button type="button" onClick={() => load(data.history.length)} className="mx-auto block rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Carregar mais</button>}
    </div>
  );
}

export default function ClientRadarTab({ client, user, hideNews = false }) {
  const can = useMemo(() => ({
    refresh: hasPermission(user, 'radar.refresh'),
    sources: hasPermission(user, 'radar.sources'),
    prompts: hasPermission(user, 'radar.prompts'),
    history: hasPermission(user, 'radar.history'),
  }), [user]);
  const tabs = [
    !hideNews && { key: 'news', label: 'Notícias' },
    can.sources && { key: 'sources', label: 'Fontes' },
    (can.sources || can.prompts) && { key: 'refs', label: 'Referências editoriais' },
    can.history && { key: 'history', label: 'Histórico de prompts' },
  ].filter(Boolean);
  const [tab, setTab] = useState(hideNews ? (can.sources ? 'sources' : can.prompts ? 'refs' : 'history') : 'news');
  const [historyKey, setHistoryKey] = useState(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'news' && !hideNews && <NewsPanel client={client} canRefresh={can.refresh} canPrompt={can.prompts} onPromptGenerated={() => setHistoryKey((k) => k + 1)} />}
      {tab === 'sources' && can.sources && <SourcesPanel client={client} />}
      {tab === 'refs' && <ReferencesPanel client={client} canEdit={can.sources} />}
      {tab === 'history' && can.history && <HistoryPanel client={client} refreshKey={historyKey} />}
    </div>
  );
}
