export const COMMERCIAL_STAGE_PALETTES = {
  blue: {
    dot: 'bg-sky-500',
    soft: 'bg-sky-50 text-sky-700 border-sky-100',
    gradient: 'linear-gradient(100deg,#2d8cff 0%,#0969ff 100%)',
  },
  indigo: {
    dot: 'bg-indigo-500',
    soft: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    gradient: 'linear-gradient(100deg,#5b68f6 0%,#4552d9 100%)',
  },
  violet: {
    dot: 'bg-violet-500',
    soft: 'bg-violet-50 text-violet-700 border-violet-100',
    gradient: 'linear-gradient(100deg,#9668f7 0%,#7048d7 100%)',
  },
  amber: {
    dot: 'bg-amber-500',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
    gradient: 'linear-gradient(100deg,#ffad24 0%,#ed8d0b 100%)',
  },
  orange: {
    dot: 'bg-orange-500',
    soft: 'bg-orange-50 text-orange-700 border-orange-100',
    gradient: 'linear-gradient(100deg,#ff7a19 0%,#e9520d 100%)',
  },
  emerald: {
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    gradient: 'linear-gradient(100deg,#34be88 0%,#079669 100%)',
  },
  rose: {
    dot: 'bg-rose-500',
    soft: 'bg-rose-50 text-rose-700 border-rose-100',
    gradient: 'linear-gradient(100deg,#fb7185 0%,#e11d48 100%)',
  },
  cyan: {
    dot: 'bg-cyan-500',
    soft: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    gradient: 'linear-gradient(100deg,#22d3ee 0%,#0891b2 100%)',
  },
  teal: {
    dot: 'bg-teal-500',
    soft: 'bg-teal-50 text-teal-700 border-teal-100',
    gradient: 'linear-gradient(100deg,#2dd4bf 0%,#0f766e 100%)',
  },
  pink: {
    dot: 'bg-pink-500',
    soft: 'bg-pink-50 text-pink-700 border-pink-100',
    gradient: 'linear-gradient(100deg,#f472b6 0%,#db2777 100%)',
  },
  slate: {
    dot: 'bg-slate-500',
    soft: 'bg-slate-100 text-slate-700 border-slate-200',
    gradient: 'linear-gradient(100deg,#64748b 0%,#334155 100%)',
  },
};

export const COMMERCIAL_STAGE_COLOR_OPTIONS = [
  { key: 'blue', label: 'Azul', className: 'bg-sky-500' },
  { key: 'indigo', label: 'Índigo', className: 'bg-indigo-500' },
  { key: 'violet', label: 'Violeta', className: 'bg-violet-500' },
  { key: 'amber', label: 'Amarelo', className: 'bg-amber-500' },
  { key: 'orange', label: 'Laranja', className: 'bg-orange-500' },
  { key: 'emerald', label: 'Verde', className: 'bg-emerald-500' },
  { key: 'rose', label: 'Vermelho', className: 'bg-rose-500' },
  { key: 'cyan', label: 'Ciano', className: 'bg-cyan-500' },
  { key: 'teal', label: 'Verde-azulado', className: 'bg-teal-500' },
  { key: 'pink', label: 'Rosa', className: 'bg-pink-500' },
  { key: 'slate', label: 'Cinza', className: 'bg-slate-500' },
];

export function decorateCommercialStage(stage) {
  const palette = COMMERCIAL_STAGE_PALETTES[stage?.color_key] || COMMERCIAL_STAGE_PALETTES.blue;
  return {
    ...stage,
    key: stage?.stage_key,
    label: stage?.name,
    short: stage?.subtitle || 'Etapa comercial',
    probability: Number(stage?.probability || 0),
    ...palette,
  };
}

export function commercialStageMap(stages) {
  return Object.fromEntries((stages || []).map((stage) => [stage.stage_key, decorateCommercialStage(stage)]));
}

export function firstOpenCommercialStage(stages) {
  return (stages || []).find((stage) => stage.stage_type === 'open') || (stages || [])[0] || null;
}

export function isCommercialStageType(stage, type) {
  return stage?.stage_type === type;
}
