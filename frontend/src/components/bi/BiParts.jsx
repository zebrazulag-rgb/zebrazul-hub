import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TONE, deltaText, fmt } from './biUtils.js';

export function Delta({ cmp }) {
  if (!cmp) return null;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[cmp.tone] || TONE.neutral}`}>{deltaText(cmp)}</span>;
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>{title && <h3 className="brand-display text-sm font-black uppercase tracking-[0.1em] text-slate-950">{title}</h3>}{subtitle && <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{subtitle}</p>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// Indicador. Para calculados mostra fórmula e insumos ("como foi calculado").
export function Kpi({ label, value, unit, cmp, derived, formula, inputs, baseLabel, big = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className={`brand-display mt-1 font-black text-slate-950 ${big ? 'text-2xl' : 'text-xl'}`}>{fmt(value, unit)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Delta cmp={cmp} />
        {cmp && <span className="text-[10px] text-slate-400">vs {fmt(cmp.base, unit)}{baseLabel ? ` (${baseLabel})` : ''}</span>}
      </div>
      {derived && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#3A85FD]">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Calculado automaticamente
        </button>
      )}
      {derived && open && (
        <div className="mt-1 rounded-lg bg-white p-2 text-[10px] leading-4 text-slate-500">
          <p className="font-bold text-slate-600">{formula}</p>
          {(inputs || []).map(([l, v, u]) => <p key={l}>{l}: <b>{fmt(v, u)}</b></p>)}
        </div>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">{children}</p>;
}
