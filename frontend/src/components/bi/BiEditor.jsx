import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Paperclip, Plus, Save, Trash2, X } from 'lucide-react';
import api from '../../api';
import { STATE_CLS, STATE_LABEL, moduleTitle } from './biUtils.js';
import { Card } from './BiParts.jsx';

const inp = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3A85FD] disabled:bg-slate-50';
const UNIT_HINT = { brl: 'R$', pct: '%', sec: 'seg', hours: 'h', dec: '', int: '' };
const CONTENT_FORMATS = ['Reel', 'Carrossel', 'Post', 'Story', 'Vídeo', 'Live', 'Outro'];

const numStr = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

function initState(mod, def) {
  const values = {}; const dists = {}; const customs = []; const scopes = [];
  const stdKeys = new Map();
  (def.blocks || []).forEach((b) => b.metrics.forEach((x) => stdKeys.set(x.key, x)));
  const scopeMap = new Map();
  for (const x of mod.metrics || []) {
    const d = stdKeys.get(x.key);
    if (x.is_custom || !d) { customs.push({ label: x.label || '', value: numStr(x.value_num), unit: x.unit || '', category: x.category || '', note: x.note || '' }); continue; }
    if (def.scoped) {
      const id = `${x.scope_type || 'overall'}|${x.scope || ''}`;
      if (!scopeMap.has(id)) scopeMap.set(id, { type: x.scope_type || 'overall', scope: x.scope || '', values: {} });
      scopeMap.get(id).values[x.key] = numStr(x.value_num);
    } else if (d.dist) (dists[x.key] = dists[x.key] || []).push({ label: x.label || '', value: numStr(x.value_num) });
    else values[x.key] = numStr(x.value_num);
  }
  scopes.push(...scopeMap.values());
  if (def.scoped && !scopes.length) scopes.push({ type: 'overall', scope: '', values: {} });
  return {
    values, dists, customs, scopes,
    contents: (mod.contents || []).map((c) => ({ ...c, reach: numStr(c.reach), views: numStr(c.views), interactions: numStr(c.interactions), saves: numStr(c.saves), shares: numStr(c.shares), comments: numStr(c.comments), likes: numStr(c.likes) })),
    source: mod.source || '', notes: mod.notes || '', complete: !!mod.complete,
  };
}

function buildPayload(st, def) {
  const metrics = [];
  if (def.scoped) {
    for (const s of st.scopes) for (const [key, value] of Object.entries(s.values)) if (String(value).trim() !== '') metrics.push({ key, value, scope_type: s.type === 'overall' ? null : s.type, scope: s.type === 'overall' ? null : s.scope });
  } else {
    for (const [key, value] of Object.entries(st.values)) if (String(value).trim() !== '') metrics.push({ key, value });
    for (const [key, rows] of Object.entries(st.dists)) for (const r of rows) if (r.label.trim() && String(r.value).trim() !== '') metrics.push({ key, label: r.label, value: r.value });
  }
  for (const c of st.customs) if (c.label.trim() && String(c.value).trim() !== '') metrics.push({ is_custom: true, label: c.label, value: c.value, unit: c.unit, category: c.category, note: c.note });
  return { metrics, contents: st.contents, source: st.source, notes: st.notes, complete: st.complete };
}

function Field({ m, value, onChange, disabled }) {
  const hint = UNIT_HINT[m.unit] ?? m.unit;
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{m.label}</span>
      <div className="relative mt-1">
        <input disabled={disabled} inputMode="decimal" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="não informado" className={`${inp} ${hint ? 'pr-10' : ''}`} />
        {hint ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{hint}</span> : null}
      </div>
    </label>
  );
}

function Block({ block, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-100">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">{block.label}</span>
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 p-3">{children}</div>}
    </div>
  );
}

function ContentRows({ st, setSt, disabled }) {
  const add = (rank_type) => setSt({ ...st, contents: [...st.contents, { rank_type, format: 'Reel', title: '', url: '', reach: '', views: '', interactions: '', saves: '', shares: '', comments: '', likes: '' }] });
  const upd = (i, patch) => setSt({ ...st, contents: st.contents.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const del = (i) => setSt({ ...st, contents: st.contents.filter((_, k) => k !== i) });
  return (
    <div className="space-y-3">
      {['best', 'worst'].map((type) => (
        <div key={type}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">{type === 'best' ? 'Melhores conteúdos' : 'Conteúdos abaixo da média'}</p>
            {!disabled && <button type="button" onClick={() => add(type)} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3A85FD]"><Plus size={12} /> Adicionar</button>}
          </div>
          {st.contents.map((c, i) => (c.rank_type !== type ? null : (
            <div key={i} className="mb-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
              <div className="grid gap-2 sm:grid-cols-[110px_1fr_1fr_auto]">
                <select disabled={disabled} value={c.format || ''} onChange={(e) => upd(i, { format: e.target.value })} className={inp}>{CONTENT_FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
                <input disabled={disabled} value={c.title || ''} onChange={(e) => upd(i, { title: e.target.value })} placeholder="Título / tema" className={inp} />
                <input disabled={disabled} value={c.url || ''} onChange={(e) => upd(i, { url: e.target.value })} placeholder="Link (opcional)" className={inp} />
                {!disabled && <button type="button" onClick={() => del(i)} className="rounded-lg p-2 text-slate-300 hover:text-[#EC0567]" aria-label="Remover"><Trash2 size={14} /></button>}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[['reach', 'Alcance'], ['views', 'Visualiz.'], ['interactions', 'Interações'], ['likes', 'Curtidas'], ['comments', 'Coment.'], ['saves', 'Salvos']].map(([k, l]) => (
                  <input key={k} disabled={disabled} inputMode="decimal" value={c[k] || ''} onChange={(e) => upd(i, { [k]: e.target.value })} placeholder={l} className={`${inp} !px-2 !py-1.5 text-xs`} />
                ))}
              </div>
            </div>
          )))}
          {!st.contents.some((c) => c.rank_type === type) && <p className="text-[11px] text-slate-400">Nenhum informado.</p>}
        </div>
      ))}
    </div>
  );
}

function TrafficScopes({ def, st, setSt, disabled }) {
  const metrics = def.blocks[0].metrics;
  const upd = (i, patch) => setSt({ ...st, scopes: st.scopes.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const updVal = (i, key, v) => setSt({ ...st, scopes: st.scopes.map((s, k) => (k === i ? { ...s, values: { ...s.values, [key]: v } } : s)) });
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-5 text-slate-500">Informe o total geral, por plataforma ou por campanha. Alcance e frequência não são somados entre plataformas. Se houver linhas por plataforma, os totais são calculados a partir delas.</p>
      {st.scopes.map((s, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select disabled={disabled} value={s.type} onChange={(e) => upd(i, { type: e.target.value, scope: e.target.value === 'platform' ? def.platforms[0] : '' })} className={`${inp} !w-auto`}>
              <option value="overall">Total geral</option><option value="platform">Plataforma</option><option value="campaign">Campanha</option>
            </select>
            {s.type === 'platform' && <select disabled={disabled} value={s.scope} onChange={(e) => upd(i, { scope: e.target.value })} className={`${inp} !w-auto`}>{def.platforms.map((p) => <option key={p}>{p}</option>)}</select>}
            {s.type === 'campaign' && <input disabled={disabled} value={s.scope} onChange={(e) => upd(i, { scope: e.target.value })} placeholder="Nome da campanha" className={`${inp} !w-56`} />}
            {!disabled && st.scopes.length > 1 && <button type="button" onClick={() => setSt({ ...st, scopes: st.scopes.filter((_, k) => k !== i) })} className="ml-auto rounded-lg p-2 text-slate-300 hover:text-[#EC0567]" aria-label="Remover linha"><Trash2 size={14} /></button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">{metrics.map((m) => <Field key={m.key} m={m} disabled={disabled} value={s.values[m.key]} onChange={(v) => updVal(i, m.key, v)} />)}</div>
        </div>
      ))}
      {!disabled && <button type="button" onClick={() => setSt({ ...st, scopes: [...st.scopes, { type: 'platform', scope: def.platforms[0], values: {} }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[#3A85FD]"><Plus size={13} /> Adicionar plataforma ou campanha</button>}
    </div>
  );
}

function ModuleCard({ report, mod, def, catalog, disabled, onSaved, onRemove }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(() => initState(mod, def));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const state = useMemo(() => {
    const filled = buildPayload(st, def).metrics.length + st.contents.filter((c) => c.title).length;
    return st.complete ? 'complete' : (filled ? 'partial' : 'empty');
  }, [st, def]);
  const hasContents = def.group === 'social';

  async function save() {
    setSaving(true); setMsg('');
    try { await api.put(`/bi-reports/${report.id}/modules/${mod.id}`, buildPayload(st, def)); setMsg('Salvo'); await onSaved(); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(e.response?.data?.error || 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  const setVal = (k, v) => setSt({ ...st, values: { ...st.values, [k]: v } });
  const customAdd = () => setSt({ ...st, customs: [...st.customs, { label: '', value: '', unit: '', category: '', note: '' }] });
  const customUpd = (i, patch) => setSt({ ...st, customs: st.customs.map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          <span className="brand-display truncate text-sm font-black uppercase tracking-[0.08em] text-slate-950">{moduleTitle(mod, catalog)}</span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${STATE_CLS[state]}`}>{STATE_LABEL[state]}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {def.scoped ? <TrafficScopes def={def} st={st} setSt={setSt} disabled={disabled} /> : (def.blocks || []).map((b, bi) => (b.metrics.length ? (
            <Block key={b.key} block={b} defaultOpen={bi === 0}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {b.metrics.filter((m) => !m.dist).map((m) => <Field key={m.key} m={m} disabled={disabled} value={st.values[m.key]} onChange={(v) => setVal(m.key, v)} />)}
              </div>
              {b.metrics.filter((m) => m.dist).map((m) => (
                <div key={m.key} className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-600">{m.label}</p>
                  {(st.dists[m.key] || []).map((r, i) => (
                    <div key={i} className="mt-1.5 flex gap-2">
                      <input disabled={disabled} value={r.label} onChange={(e) => setSt({ ...st, dists: { ...st.dists, [m.key]: st.dists[m.key].map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) } })} placeholder={m.hint || 'Nome'} className={inp} />
                      <input disabled={disabled} value={r.value} inputMode="decimal" onChange={(e) => setSt({ ...st, dists: { ...st.dists, [m.key]: st.dists[m.key].map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) } })} placeholder={UNIT_HINT[m.unit] || 'Valor'} className={`${inp} !w-28`} />
                      {!disabled && <button type="button" onClick={() => setSt({ ...st, dists: { ...st.dists, [m.key]: st.dists[m.key].filter((_, k) => k !== i) } })} className="p-2 text-slate-300 hover:text-[#EC0567]"><X size={14} /></button>}
                    </div>
                  ))}
                  {!disabled && <button type="button" onClick={() => setSt({ ...st, dists: { ...st.dists, [m.key]: [...(st.dists[m.key] || []), { label: '', value: '' }] } })} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#3A85FD]"><Plus size={12} /> Adicionar</button>}
                </div>
              ))}
            </Block>
          ) : null))}

          {hasContents && <Block block={{ label: 'Melhores e piores conteúdos' }}><ContentRows st={st} setSt={setSt} disabled={disabled} /></Block>}

          <Block block={{ label: mod.module_key === 'other' ? 'Métricas do módulo' : 'Outras métricas (personalizadas)' }} defaultOpen={mod.module_key === 'other' || st.customs.length > 0}>
            {st.customs.map((c, i) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1.4fr_0.8fr_0.7fr_1fr_auto]">
                <input disabled={disabled} value={c.label} onChange={(e) => customUpd(i, { label: e.target.value })} placeholder="Nome da métrica" className={inp} />
                <input disabled={disabled} value={c.value} inputMode="decimal" onChange={(e) => customUpd(i, { value: e.target.value })} placeholder="Valor" className={inp} />
                <input disabled={disabled} value={c.unit} onChange={(e) => customUpd(i, { unit: e.target.value })} placeholder="Unidade" className={inp} />
                <input disabled={disabled} value={c.category} onChange={(e) => customUpd(i, { category: e.target.value })} placeholder="Categoria" className={inp} />
                {!disabled && <button type="button" onClick={() => setSt({ ...st, customs: st.customs.filter((_, k) => k !== i) })} className="p-2 text-slate-300 hover:text-[#EC0567]"><Trash2 size={14} /></button>}
                <input disabled={disabled} value={c.note} onChange={(e) => customUpd(i, { note: e.target.value })} placeholder="Observação (opcional)" className={`${inp} sm:col-span-5`} />
              </div>
            ))}
            {!disabled && <button type="button" onClick={customAdd} className="inline-flex items-center gap-1 text-xs font-bold text-[#3A85FD]"><Plus size={13} /> Adicionar outra métrica</button>}
          </Block>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[11px] font-semibold text-slate-600">Origem dos dados</span>
              <select disabled={disabled} value={st.source} onChange={(e) => setSt({ ...st, source: e.target.value })} className={`${inp} mt-1`}><option value="">Não informada</option>{(catalog?.sources || []).map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            <label className="block"><span className="text-[11px] font-semibold text-slate-600">Observações do módulo</span>
              <input disabled={disabled} value={st.notes} onChange={(e) => setSt({ ...st, notes: e.target.value })} className={`${inp} mt-1`} />
            </label>
          </div>

          {!disabled && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#3A85FD] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#2f74e6] disabled:opacity-60">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar módulo</button>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={st.complete} onChange={(e) => setSt({ ...st, complete: e.target.checked })} /> Marcar módulo como completo</label>
              {msg && <span className={`text-xs font-bold ${msg === 'Salvo' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
              <button type="button" onClick={() => onRemove(mod)} className="ml-auto text-[11px] font-bold text-slate-400 hover:text-[#EC0567]">Remover módulo</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sources({ report, catalog, disabled, onChanged }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [moduleKey, setModuleKey] = useState('');
  async function pick(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const f = new FormData(); f.append('file', file); if (moduleKey) f.append('module_key', moduleKey); await api.post(`/bi-reports/${report.id}/sources`, f, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }); await onChanged(); }
    catch (err) { alert(err.response?.data?.error || 'Não foi possível anexar.'); }
    finally { setBusy(false); e.target.value = ''; }
  }
  return (
    <Card title="Fontes do relatório" subtitle="Prints, imagens, PDFs e exportações (mLabs, Meta, Google). Ficam salvos junto do relatório.">
      {!disabled && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className={`${inp} !w-auto`}><option value="">Geral</option>{report.modules.map((m) => <option key={m.id} value={m.module_key}>{moduleTitle(m, catalog)}</option>)}</select>
          <input ref={ref} type="file" accept="image/*,application/pdf,.csv,.xls,.xlsx" className="hidden" onChange={pick} />
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} Anexar arquivo</button>
        </div>
      )}
      {report.sources.length === 0 ? <p className="text-xs text-slate-400">Nenhuma fonte anexada.</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {report.sources.map((s) => (
            <div key={s.id} className="group relative rounded-xl border border-slate-200 p-2">
              <a href={s.media_url} target="_blank" rel="noreferrer">{/^image\//.test(s.mime || '') ? <img src={s.media_url} alt={s.filename} className="h-24 w-full rounded-lg object-cover" /> : <div className="flex h-24 items-center justify-center rounded-lg bg-slate-50 text-[11px] font-bold text-slate-400">{(s.filename || 'arquivo').split('.').pop().toUpperCase()}</div>}</a>
              <p className="mt-1.5 truncate text-[10px] font-semibold text-slate-600">{s.filename}</p>
              <p className="truncate text-[10px] text-slate-400">{s.module_key || 'Geral'} · {s.uploaded_by_name}</p>
              {!disabled && <button type="button" onClick={async () => { await api.delete(`/bi-reports/${report.id}/sources/${s.id}`); onChanged(); }} className="absolute right-1.5 top-1.5 hidden rounded-lg bg-white/90 p-1 text-slate-400 hover:text-[#EC0567] group-hover:block" aria-label="Remover"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Notes({ report, canNote, onChanged }) {
  const [text, setText] = useState(''); const [tag, setTag] = useState(''); const [marker, setMarker] = useState(true);
  async function add() { if (!text.trim()) return; await api.post(`/bi-reports/${report.id}/notes`, { text, tag, chart_marker: marker }); setText(''); setTag(''); onChanged(); }
  return (
    <Card title="Contexto do período" subtitle="Campanhas, promoções, eventos, mudanças de equipe ou estratégia. Entram como marcadores nos gráficos do histórico.">
      {canNote && (
        <div className="mb-3 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Ex.: Campanha Dia das Crianças, troca de agenda comercial..." className={inp} />
          <div className="flex flex-wrap items-center gap-2">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Etiqueta (campanha, evento...)" className={`${inp} !w-56`} />
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} /> Mostrar nos gráficos</label>
            <button type="button" onClick={add} className="ml-auto rounded-xl bg-[#17181C] px-3.5 py-2 text-xs font-bold text-white">Adicionar</button>
          </div>
        </div>
      )}
      {report.notes_list.length === 0 ? <p className="text-xs text-slate-400">Nenhum contexto registrado.</p> : report.notes_list.map((n) => (
        <div key={n.id} className="mb-2 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <div className="min-w-0 flex-1"><p className="text-xs leading-5 text-slate-700">{n.tag ? <b className="mr-1 text-[#3A85FD]">[{n.tag}]</b> : null}{n.text}</p><p className="text-[10px] text-slate-400">{n.created_by_name}{n.chart_marker ? ' · marcador no gráfico' : ''}</p></div>
          {canNote && <button type="button" onClick={async () => { await api.delete(`/bi-reports/${report.id}/notes/${n.id}`); onChanged(); }} className="p-1 text-slate-300 hover:text-[#EC0567]"><Trash2 size={13} /></button>}
        </div>
      ))}
    </Card>
  );
}

export default function BiEditor({ report, catalog, locked, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [otherName, setOtherName] = useState('');
  const available = Object.keys(catalog?.catalog || {}).filter((k) => k === 'other' || !report.modules.some((m) => m.module_key === k));

  async function addModule(key) {
    try { await api.post(`/bi-reports/${report.id}/modules`, { module_key: key, label: key === 'other' ? otherName : '' }); setAdding(false); setOtherName(''); await onChanged(); }
    catch (e) { alert(e.response?.data?.error || 'Não foi possível adicionar.'); }
  }
  async function removeModule(mod) {
    if (!window.confirm(`Remover o módulo "${moduleTitle(mod, catalog)}" e todos os dados dele neste relatório?`)) return;
    await api.delete(`/bi-reports/${report.id}/modules/${mod.id}`); onChanged();
  }

  return (
    <div className="space-y-4">
      {locked && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">Relatório finalizado: os dados estão travados. Use “Reabrir para editar” — a versão atual fica guardada no histórico de versões.</p>}
      <div className="space-y-3">
        {report.modules.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Nenhum módulo ainda. Adicione só o que fizer sentido para este cliente neste mês.</p>}
        {report.modules.map((m) => catalog?.catalog?.[m.module_key] && (
          <ModuleCard key={m.id} report={report} mod={m} def={catalog.catalog[m.module_key]} catalog={catalog} disabled={locked} onSaved={onChanged} onRemove={removeModule} />
        ))}
      </div>
      {!locked && (
        <div>
          {!adding ? <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#3A85FD] px-4 py-2.5 text-xs font-bold text-[#3A85FD] hover:bg-blue-50"><Plus size={14} /> Adicionar módulo</button> : (
            <Card title="Adicionar módulo">
              <div className="flex flex-wrap gap-2">
                {available.filter((k) => k !== 'other').map((k) => <button key={k} type="button" onClick={() => addModule(k)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#3A85FD] hover:text-[#3A85FD]">{catalog.catalog[k].label}</button>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2"><input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Outro módulo (nome livre)" className={`${inp} !w-60`} /><button type="button" disabled={!otherName.trim()} onClick={() => addModule('other')} className="rounded-xl bg-[#17181C] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">Criar</button><button type="button" onClick={() => setAdding(false)} className="px-2 text-xs font-bold text-slate-400">Cancelar</button></div>
            </Card>
          )}
        </div>
      )}
      <Sources report={report} catalog={catalog} disabled={locked} onChanged={onChanged} />
      <Notes report={report} canNote onChanged={onChanged} />
    </div>
  );
}
