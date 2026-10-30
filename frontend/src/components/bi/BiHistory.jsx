import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../api';
import { Card, Empty } from './BiParts.jsx';
import { fmt } from './biUtils.js';

const RANGES = [['all', 'Tudo'], ['3', 'Últimos 3 meses'], ['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses']];

export default function BiHistory({ clientId, onOpen }) {
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const [metric, setMetric] = useState('');

  useEffect(() => {
    if (!clientId) { setData(null); return; }
    const params = { client_id: clientId };
    if (from) params.from = from; if (to) params.to = to;
    api.get('/bi-reports/history', { params }).then(({ data: d }) => { setData(d); setError(''); }).catch((e) => setError(e.response?.data?.error || 'Não foi possível carregar o histórico.'));
  }, [clientId, from, to]);

  const periods = useMemo(() => {
    if (!data) return [];
    return range === 'all' ? data.periods : data.periods.slice(-Number(range));
  }, [data, range]);
  const keys = useMemo(() => new Set(periods.map((p) => p.period)), [periods]);
  const seriesList = useMemo(() => (data ? Object.values(data.series).filter((s) => s.points.some((p) => keys.has(p.period))) : []), [data, keys]);
  const groups = useMemo(() => { const g = {}; seriesList.forEach((s) => { (g[s.moduleLabel] = g[s.moduleLabel] || []).push(s); }); return g; }, [seriesList]);
  useEffect(() => { if (seriesList.length && !seriesList.some((s) => s.key === metric)) setMetric((seriesList.find((s) => s.key.endsWith('.revenue')) || seriesList.find((s) => s.key.endsWith('.reach')) || seriesList[0]).key); }, [seriesList, metric]);

  if (!clientId) return <Empty>Selecione um cliente para ver o histórico.</Empty>;
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Carregando...</Empty>;
  if (!periods.length) return <Empty>Ainda não há relatórios neste período. Crie relatórios mensais para formar a série histórica.</Empty>;

  const s = data.series[metric];
  const chart = s ? periods.map((p) => ({ period: p.period, label: `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(p.period.slice(5)) - 1]}/${p.period.slice(2, 4)}`, full: p.label, value: s.points.find((x) => x.period === p.period)?.value ?? null })) : [];
  const ins = s ? data.insights[metric] : null;
  const markers = data.markers.filter((m) => keys.has(m.period));
  const unit = s?.unit || 'int';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(([k, l]) => <button key={k} type="button" onClick={() => setRange(k)} className={`rounded-xl px-3 py-2 text-xs font-bold ${range === k ? 'bg-[#17181C] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{l}</button>)}
        <span className="ml-1 text-[11px] text-slate-400">ou período:</span>
        <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" aria-label="De" />
        <input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" aria-label="Até" />
      </div>

      <Card title="Evolução" right={
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className="max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          {Object.entries(groups).map(([g, list]) => <optgroup key={g} label={g}>{list.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
        </select>}>
        {s && (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={56} tickFormatter={(v) => fmt(v, unit).replace('R$ ', '')} />
                  <Tooltip contentStyle={{ background: '#17181C', border: '1px solid #334', borderRadius: 12, color: '#fff', fontSize: 12 }} labelStyle={{ color: '#C9FF2F', fontWeight: 700 }} itemStyle={{ color: '#fff' }} labelFormatter={(_, pl) => pl?.[0]?.payload?.full || ''} formatter={(v) => [fmt(v, unit), s.label]} />
                  {markers.map((m, i) => { const c = chart.find((x) => x.period === m.period); return c ? <ReferenceLine key={i} x={c.label} stroke="#EC0567" strokeDasharray="4 3" label={{ value: m.tag || '●', fill: '#EC0567', fontSize: 10, position: 'top' }} /> : null; })}
                  <Line type="monotone" isAnimationActive={false} dataKey="value" stroke="#3A85FD" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {markers.length > 0 && <ul className="mt-2 space-y-1">{markers.map((m, i) => <li key={i} className="text-[11px] text-slate-500"><b className="text-[#EC0567]">{m.period}</b> · {m.tag ? `[${m.tag}] ` : ''}{m.text}</li>)}</ul>}
            {s.polarity === 'neutral' && <p className="mt-2 text-[10px] text-slate-400">Esta métrica é neutra: subir ou cair não é bom nem ruim por si só.</p>}
          </>
        )}
      </Card>

      {ins && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Melhor mês"><p className="brand-display text-lg font-black text-emerald-600">{ins.best.label}</p><p className="text-xs text-slate-500">{fmt(ins.best.value, unit)}</p></Card>
          <Card title="Pior mês"><p className="brand-display text-lg font-black text-rose-600">{ins.worst.label}</p><p className="text-xs text-slate-500">{fmt(ins.worst.value, unit)}</p></Card>
          <Card title="Maior / menor valor"><p className="text-xs text-slate-600">Pico: <b>{ins.peak.label}</b> ({fmt(ins.peak.value, unit)})</p><p className="text-xs text-slate-600">Vale: <b>{ins.trough.label}</b> ({fmt(ins.trough.value, unit)})</p></Card>
          <Card title="Tendência">{ins.trend ? (<><p className={`brand-display text-lg font-black ${ins.trend.good === null ? 'text-slate-700' : ins.trend.good ? 'text-emerald-600' : 'text-rose-600'}`}>{ins.trend.label}</p><p className="text-xs text-slate-500">{ins.trend.change_pct > 0 ? '+' : ''}{ins.trend.change_pct}% {ins.trend.short ? 'vs mês anterior' : 'últimos 3 meses vs 3 anteriores'}</p></>) : <p className="text-xs text-slate-400">Precisa de 2+ meses.</p>}</Card>
        </div>
      )}

      {(data.most_improved.length > 0 || data.most_worsened.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Mais evoluíram (último mês vs. média anterior)">{data.most_improved.length ? data.most_improved.map((m) => <p key={m.key} className="text-xs text-slate-700">▲ {m.moduleLabel} · {m.label}: <b className="text-emerald-600">{m.change_pct > 0 ? '+' : ''}{m.change_pct}%</b></p>) : <p className="text-xs text-slate-400">—</p>}</Card>
          <Card title="Mais pioraram">{data.most_worsened.length ? data.most_worsened.map((m) => <p key={m.key} className="text-xs text-slate-700">▼ {m.moduleLabel} · {m.label}: <b className="text-rose-600">{m.change_pct > 0 ? '+' : ''}{m.change_pct}%</b></p>) : <p className="text-xs text-slate-400">—</p>}</Card>
        </div>
      )}

      <Card title="Relatórios do período">
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead><tr className="text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="py-2">Período</th><th>Status</th><th>Completude</th><th /></tr></thead>
          <tbody>{data.reports.filter((r) => keys.has(r.period)).map((r) => (<tr key={r.id} className="border-t border-slate-100"><td className="py-2.5 font-bold text-slate-800">{r.label}</td><td>{r.status === 'final' ? 'Finalizado' : 'Rascunho'}</td><td>{r.completeness}%</td><td><button type="button" onClick={() => onOpen(r.id)} className="font-bold text-[#3A85FD]">Abrir</button></td></tr>))}</tbody></table></div>
      </Card>
    </div>
  );
}
