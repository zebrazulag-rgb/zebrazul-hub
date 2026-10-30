import { useMemo, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Card, Delta, Empty, Kpi } from './BiParts.jsx';
import { STATE_CLS, STATE_LABEL, fmt, moduleTitle } from './biUtils.js';

const BASELINES = [['prev', 'Mês anterior'], ['avg3', 'Média 3 meses'], ['avg6', 'Média 6 meses'], ['yoy', 'Mesmo mês do ano anterior']];
const GROUPS = ['Audiência', 'Tráfego', 'Comercial', 'Vendas', 'Site'];

function KpiGrid({ items, baseLabel }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => <Kpi key={k.key} label={k.label} value={k.value} unit={k.unit} cmp={k.cmp} derived={k.derived} formula={k.formula} inputs={k.inputs} baseLabel={baseLabel} />)}
    </div>
  );
}

function Bullets({ title, items, tone }) {
  if (!items?.length) return null;
  const cls = tone === 'good' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60';
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-700">{tone === 'good' ? <Sparkles size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}{title}</p>
      <ul className="space-y-1.5">{items.map((h) => <li key={h.id} className="text-xs leading-5 text-slate-700">• {h.text}</li>)}</ul>
    </div>
  );
}

function Bar({ value, max, color = '#3A85FD' }) {
  return <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, Math.min(100, (value / (max || 1)) * 100))}%`, background: color }} /></div>;
}

function Summary({ a, report, baseLabel }) {
  const groups = GROUPS.map((g) => [g, a.kpis.filter((k) => k.group === g)]).filter(([, l]) => l.length);
  return (
    <div className="space-y-4">
      {!a.baseline.available && <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">Primeiro período registrado ou sem dados na base escolhida. Os números ficam como ponto de partida; comparações aparecem a partir do próximo mês.</p>}
      {groups.length === 0 && <Empty>Preencha ao menos um módulo para ver o resumo.</Empty>}
      {groups.map(([g, list]) => <Card key={g} title={g}><KpiGrid items={list} baseLabel={baseLabel} /></Card>)}
      <div className="grid gap-4 lg:grid-cols-2"><Bullets title="Destaques do período" items={a.highlights} tone="good" /><Bullets title="Pontos de atenção" items={a.attention} tone="warn" /></div>
    </div>
  );
}

function Networks({ a, report, catalog }) {
  const [sel, setSel] = useState('all');
  const nets = a.networks;
  if (!nets.length) return <Empty>Nenhuma rede social neste relatório.</Empty>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['all', 'Visão consolidada'], ...nets.map((n) => [n.key, n.label])].map(([k, l]) => <button key={k} type="button" onClick={() => setSel(k)} className={`rounded-xl px-3 py-2 text-xs font-bold ${sel === k ? 'bg-[#17181C] text-white' : 'border border-slate-200 text-slate-600'}`}>{l}</button>)}
      </div>
      {sel === 'all' ? (
        <>
          <Card title="Consolidado das redes" subtitle="Cada rede mede alcance e engajamento de um jeito próprio: por isso não somamos esses números entre plataformas. Somamos apenas audiência (seguidores/inscritos).">
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs">
              <thead><tr className="text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="py-2">Rede</th><th>Audiência</th><th>Crescimento</th><th>Alcance</th><th>Engajamento</th></tr></thead>
              <tbody>{nets.map((n) => (
                <tr key={n.key} className="border-t border-slate-100"><td className="py-2.5 font-bold text-slate-800">{n.label}</td>
                  <td>{n.audience ? fmt(n.audience.value) : '—'}</td>
                  <td>{n.net ? <span className="inline-flex items-center gap-1.5">{fmt(n.net.value)} <Delta cmp={n.net.cmp} /></span> : '—'}</td>
                  <td>{n.reach ? <span className="inline-flex items-center gap-1.5">{fmt(n.reach.value)} <Delta cmp={n.reach.cmp} /></span> : '—'}</td>
                  <td>{n.engagement ? fmt(n.engagement.value, 'pct') : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
          {Object.keys(a.leaders).length > 0 && (
            <Card title="Quem lidera no período">
              <ul className="space-y-1.5 text-xs text-slate-700">
                {a.leaders.growth && <li>• Maior crescimento de audiência: <b>{a.leaders.growth.network}</b> ({fmt(a.leaders.growth.value, 'pct')})</li>}
                {a.leaders.reach && <li>• Maior alcance informado: <b>{a.leaders.reach.network}</b> — <span className="text-slate-400">{a.leaders.reach.note}</span></li>}
                {a.leaders.engagement && <li>• Maior taxa de engajamento: <b>{a.leaders.engagement.network}</b> — <span className="text-slate-400">{a.leaders.engagement.note}</span></li>}
              </ul>
            </Card>
          )}
        </>
      ) : <ModulePage a={a} report={report} catalog={catalog} moduleKey={sel} />}
    </div>
  );
}

function DistList({ mod, key2, label, unit }) {
  const rows = (mod.metrics || []).filter((x) => x.key === key2 && x.value_num !== null);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.value_num));
  return (
    <div><p className="mb-2 text-[11px] font-bold text-slate-600">{label}</p>
      <div className="space-y-2">{rows.sort((p, q) => q.value_num - p.value_num).map((r) => (<div key={r.id}><div className="flex justify-between text-[11px] text-slate-600"><span>{r.label}</span><b>{fmt(r.value_num, unit)}</b></div><Bar value={r.value_num} max={max} /></div>))}</div>
    </div>
  );
}

function Rankings({ mod }) {
  const best = (mod.contents || []).filter((c) => c.rank_type === 'best'); const worst = (mod.contents || []).filter((c) => c.rank_type === 'worst');
  if (!best.length && !worst.length) return null;
  const col = (list, title, color) => (
    <div className="rounded-2xl border border-slate-100 p-3"><p className="mb-2 text-xs font-black uppercase tracking-[0.08em]" style={{ color }}>{title}</p>
      {list.length === 0 ? <p className="text-[11px] text-slate-400">Não informado.</p> : list.map((c) => (
        <div key={c.id} className="mb-2 rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-800">{c.format ? <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{c.format}</span> : null}{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="text-[#3A85FD] underline">{c.title || 'Abrir'}</a> : c.title}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{[['reach', 'alcance'], ['views', 'visualizações'], ['interactions', 'interações'], ['likes', 'curtidas'], ['comments', 'comentários'], ['saves', 'salvos']].filter(([k]) => c[k] !== null && c[k] !== undefined).map(([k, l]) => `${fmt(c[k])} ${l}`).join(' · ')}</p></div>
      ))}</div>
  );
  return <Card title="Conteúdos em destaque"><div className="grid gap-3 lg:grid-cols-2">{col(best, 'Melhores conteúdos', '#059669')}{col(worst, 'Abaixo da média', '#E11D48')}</div></Card>;
}

function ModulePage({ a, report, catalog, moduleKey }) {
  const mod = report.modules.find((m) => (m.module_key === 'other' ? `other:${m.id}` : m.module_key) === moduleKey || m.module_key === moduleKey);
  const def = catalog?.catalog?.[mod?.module_key];
  if (!mod || !def) return <Empty>Módulo não encontrado.</Empty>;
  const prefix = mod.module_key;
  const entries = Object.entries(a.flat).filter(([k]) => (mod.module_key === 'other' ? k.startsWith('other:') : k.startsWith(`${prefix}.`)));
  const baseLabel = a.baseline.label;
  const toItem = ([k, e]) => ({ key: k, label: e.label, value: e.value, unit: e.unit, cmp: a.comparisons[k], derived: e.derived, formula: e.formula, inputs: e.inputs });
  const blockKeys = new Set();
  return (
    <div className="space-y-4">
      {(def.blocks || []).map((b) => {
        const keys = new Set(b.metrics.map((m) => m.key));
        const items = entries.filter(([k]) => keys.has(k.split('.')[1])).map(toItem);
        items.forEach((i) => blockKeys.add(i.key));
        const dists = b.metrics.filter((m) => m.dist);
        if (!items.length && !dists.some((d) => (mod.metrics || []).some((x) => x.key === d.key))) return null;
        return (<Card key={b.key} title={b.label}>{items.length > 0 && <KpiGrid items={items} baseLabel={baseLabel} />}
          {dists.length > 0 && <div className="mt-4 grid gap-4 lg:grid-cols-2">{dists.map((d) => <DistList key={d.key} mod={mod} key2={d.key} label={d.label} unit={d.unit} />)}</div>}</Card>);
      })}
      {(() => {
        const rest = entries.filter(([k]) => !blockKeys.has(k)).map(toItem);
        return rest.length ? <Card title={mod.module_key === 'other' ? 'Métricas' : 'Calculados e personalizados'}><KpiGrid items={rest} baseLabel={baseLabel} /></Card> : null;
      })()}
      <Rankings mod={mod} />
      {mod.source && <p className="text-[11px] text-slate-400">Origem dos dados: {mod.source}{mod.notes ? ` · ${mod.notes}` : ''}</p>}
    </div>
  );
}

function Traffic({ a, report }) {
  const mod = report.modules.find((m) => m.module_key === 'traffic');
  if (!mod) return <Empty>Módulo de tráfego não adicionado.</Empty>;
  const t = mod._rows || {};
  const groups = {};
  for (const x of mod.metrics) { if (x.value_num === null) continue; const id = `${x.scope_type || 'overall'}|${x.scope || ''}`; (groups[id] = groups[id] || { type: x.scope_type || 'overall', scope: x.scope || '', v: {} }).v[x.key] = x.value_num; }
  const list = Object.values(groups);
  const tot = Object.entries(a.flat).filter(([k]) => k.startsWith('traffic.')).map(([k, e]) => ({ key: k, label: e.label, value: e.value, unit: e.unit, cmp: a.comparisons[k], derived: e.derived, formula: e.formula, inputs: e.inputs }));
  const labels = { spend: ['Investimento', 'brl'], impressions: ['Impressões', 'int'], clicks: ['Cliques', 'int'], leads: ['Leads', 'int'], messages: ['Mensagens', 'int'], conversions: ['Conversões', 'int'], sales: ['Vendas', 'int'] };
  const cols = Object.keys(labels).filter((k) => list.some((g) => g.v[k] !== undefined));
  return (
    <div className="space-y-4">
      <Card title="Total do período" subtitle="Soma apenas das métricas aditivas. CPL, CPC, CPM, CTR e ROAS são calculados a partir dos totais."><KpiGrid items={tot} baseLabel={a.baseline.label} /></Card>
      {list.length > 1 || list.some((g) => g.type !== 'overall') ? (
        <Card title="Por plataforma e campanha"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs">
          <thead><tr className="text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="py-2">Origem</th>{cols.map((c) => <th key={c}>{labels[c][0]}</th>)}</tr></thead>
          <tbody>{list.map((g, i) => (<tr key={i} className="border-t border-slate-100"><td className="py-2.5 font-bold text-slate-800">{g.type === 'overall' ? 'Total geral' : `${g.type === 'platform' ? '' : 'Campanha: '}${g.scope}`}</td>{cols.map((c) => <td key={c}>{g.v[c] !== undefined ? fmt(g.v[c], labels[c][1]) : '—'}</td>)}</tr>))}</tbody>
        </table></div></Card>
      ) : null}
    </div>
  );
}

function Connections({ a }) {
  const steps = a.funnel;
  if (steps.length < 2) return <Empty>Para montar a visão do negócio, informe pelo menos dois estágios (por exemplo alcance e leads, ou leads e vendas).</Empty>;
  const max = Math.max(...steps.filter((s) => s.kind === 'count' || s.kind === 'exposure').map((s) => s.value));
  return (
    <div className="space-y-4">
      <Card title="Do alcance ao faturamento" subtitle="Uma leitura de jornada com os dados informados. Etapas não preenchidas ficam de fora (não são tratadas como zero).">
        <div className="space-y-3">{steps.map((s, i) => (
          <div key={s.key}>
            {s.rate_from_previous !== null && s.rate_from_previous !== undefined && <p className="mb-1 ml-1 text-[10px] font-bold text-slate-400">↳ {fmt(s.rate_from_previous, 'pct')} da etapa anterior</p>}
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-700">{s.label}</span><span className="flex items-center gap-2 text-sm font-black text-slate-950">{fmt(s.value, s.unit)} <Delta cmp={s.cmp} /></span></div>
            {s.kind !== 'money' && <Bar value={s.value} max={max} color={i % 2 ? '#EC0567' : '#3A85FD'} />}
          </div>
        ))}</div>
      </Card>
      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">Esta visão mostra a sequência observada entre as etapas, não prova que uma causou a outra. Fatores como sazonalidade, promoções, mudanças no atendimento e outros canais também influenciam o resultado.</p>
    </div>
  );
}

function Analyses({ a }) {
  return (
    <div className="space-y-4">
      {a.pairs.length === 0 ? <Empty>Sem pares comparáveis ainda. As análises cruzadas aparecem quando há dados no período e na base de comparação.</Empty> : a.pairs.map((p) => (
        <Card key={p.title} title={p.title}>
          <div className="grid gap-3 sm:grid-cols-2">{[p.a, p.b].map((x) => (<div key={x.key} className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{x.label}</p><p className="brand-display mt-1 text-xl font-black text-slate-950">{fmt(x.value, x.unit)}</p><p className="text-[11px] text-slate-500">antes: {fmt(x.base, x.unit)}{x.pct !== null && x.pct !== undefined ? ` · ${x.pct > 0 ? '+' : ''}${x.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : ''}</p></div>))}</div>
          <p className="mt-3 text-xs font-semibold text-slate-700">{p.reading}</p>
          <p className="mt-1 text-[10px] text-slate-400">{p.note}</p>
        </Card>
      ))}
    </div>
  );
}

function Reading({ a }) {
  const col = (t, items, c) => (<Card title={t} className={c}>{items.length === 0 ? <p className="text-xs text-slate-400">—</p> : <ul className="space-y-2">{items.map((x, i) => <li key={i} className="text-xs leading-5 text-slate-700">• {x}</li>)}</ul>}</Card>);
  return (
    <div className="space-y-4">
      {col('O que aconteceu', a.reading.happened)}
      {col('O que isso significa', a.reading.meaning)}
      {col('Próximos passos sugeridos', a.reading.next)}
      <p className="text-[10px] text-slate-400">Leitura gerada por regras sobre os números informados, sem inteligência artificial e sem inventar dados. Revise antes de apresentar ao cliente.</p>
    </div>
  );
}

function AllData({ a, report, catalog }) {
  const rows = Object.entries(a.flat).map(([k, e]) => ({ k, ...e }));
  const mods = [...new Set(rows.map((r) => r.moduleLabel))];
  return (
    <div className="space-y-4">
      <Card title="Completude do relatório">
        <div className="mb-3 flex items-center gap-3"><div className="h-2.5 flex-1 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-[#3A85FD]" style={{ width: `${a.completeness.percent}%` }} /></div><b className="text-sm">{a.completeness.percent}%</b></div>
        <div className="flex flex-wrap gap-2">{a.completeness.areas.map((x) => <span key={x.key} className={`rounded-full px-3 py-1 text-[11px] font-bold ${STATE_CLS[x.state]}`}>{x.label}: {STATE_LABEL[x.state]}</span>)}</div>
        <ul className="mt-3 space-y-1">{a.completeness.unlocks.map((u) => <li key={u.label} className={`text-[11px] ${u.ok ? 'text-emerald-700' : 'text-slate-400'}`}>{u.ok ? '✓' : '○'} {u.label}</li>)}</ul>
      </Card>
      {mods.map((m) => (
        <Card key={m} title={m}><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
          <thead><tr className="text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="py-1.5">Métrica</th><th>Valor</th><th>Base</th><th>Variação</th><th>Tipo</th></tr></thead>
          <tbody>{rows.filter((r) => r.moduleLabel === m).map((r) => { const c = a.comparisons[r.k]; return (<tr key={r.k} className="border-t border-slate-100"><td className="py-2 font-semibold text-slate-700">{r.label}</td><td>{fmt(r.value, r.unit)}</td><td>{c ? fmt(c.base, r.unit) : '—'}</td><td><Delta cmp={c} /></td><td className="text-[10px] text-slate-400">{r.derived ? `calculado: ${r.formula}` : (r.custom ? 'personalizada' : 'informado')}</td></tr>); })}</tbody>
        </table></div></Card>
      ))}
      <Card title="Origem dos dados"><ul className="space-y-1 text-xs text-slate-600">{report.modules.map((m) => <li key={m.id}><b>{moduleTitle(m, catalog)}</b>: {m.source || 'origem não informada'}{m.updated_by_name ? ` · atualizado por ${m.updated_by_name}` : ''}</li>)}</ul></Card>
    </div>
  );
}

function SourcesView({ report }) {
  if (!report.sources.length && !report.notes_list.length) return <Empty>Nenhuma fonte ou contexto registrado.</Empty>;
  return (
    <div className="space-y-4">
      {report.notes_list.length > 0 && <Card title="Contexto do período"><ul className="space-y-1.5">{report.notes_list.map((n) => <li key={n.id} className="text-xs leading-5 text-slate-700">• {n.tag ? <b className="text-[#3A85FD]">[{n.tag}] </b> : null}{n.text}</li>)}</ul></Card>}
      {report.sources.length > 0 && <Card title="Fontes anexadas"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{report.sources.map((s) => (<a key={s.id} href={s.media_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 p-2">{/^image\//.test(s.mime || '') ? <img src={s.media_url} alt={s.filename} className="h-24 w-full rounded-lg object-cover" /> : <div className="flex h-24 items-center justify-center rounded-lg bg-slate-50 text-[11px] font-bold text-slate-400">ARQUIVO</div>}<p className="mt-1.5 truncate text-[10px] font-semibold text-slate-600">{s.filename}</p></a>))}</div></Card>}
    </div>
  );
}

export default function BiPresentation({ data, report, catalog, baseline, onBaseline }) {
  const a = data;
  const [tab, setTab] = useState('summary');
  const tabs = useMemo(() => {
    const t = [['summary', 'Resumo']];
    if (a.networks.length) t.push(['networks', 'Redes sociais']);
    if (report.modules.some((m) => m.module_key === 'traffic')) t.push(['traffic', 'Tráfego pago']);
    for (const [k, l] of [['commercial', 'Comercial'], ['sales', 'Vendas'], ['site', 'Site']]) if (report.modules.some((m) => m.module_key === k)) t.push([k, l]);
    report.modules.filter((m) => m.module_key === 'other').forEach((m) => t.push([`other:${m.id}`, m.label || 'Outro']));
    t.push(['connections', 'Visão do negócio'], ['analyses', 'Análises cruzadas'], ['reading', 'Leitura do período'], ['data', 'Todos os dados'], ['sources', 'Fontes e contexto']);
    return t;
  }, [a, report]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Comparar com</label>
        <select value={baseline} onChange={(e) => onBaseline(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{BASELINES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <span className="text-[11px] text-slate-400">{a.baseline.available ? a.baseline.label : 'Sem dados na base escolhida'}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 print:hidden">{tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold ${tab === k ? 'bg-[#17181C] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}</div>
      {tab === 'summary' && <Summary a={a} report={report} baseLabel={a.baseline.label} />}
      {tab === 'networks' && <Networks a={a} report={report} catalog={catalog} />}
      {tab === 'traffic' && <Traffic a={a} report={report} />}
      {['commercial', 'sales', 'site'].includes(tab) && <ModulePage a={a} report={report} catalog={catalog} moduleKey={tab} />}
      {tab.startsWith('other:') && <ModulePage a={a} report={report} catalog={catalog} moduleKey={tab} />}
      {tab === 'connections' && <Connections a={a} />}
      {tab === 'analyses' && <Analyses a={a} />}
      {tab === 'reading' && <Reading a={a} />}
      {tab === 'data' && <AllData a={a} report={report} catalog={catalog} />}
      {tab === 'sources' && <SourcesView report={report} />}
    </div>
  );
}
