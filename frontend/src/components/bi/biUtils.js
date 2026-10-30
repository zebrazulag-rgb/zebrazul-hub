import { useEffect, useState } from 'react';
import api from '../../api';

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const periodName = (r) => `${MONTHS[(r.month || 1) - 1]} de ${r.year}`;

export function fmt(value, unit = 'int') {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  const br = (min, max) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  switch (unit) {
    case 'brl': return `R$ ${br(2, 2)}`;
    case 'pct': return `${br(0, 1)}%`;
    case 'dec': return br(0, 2);
    case 'sec': return v >= 120 ? `${(v / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min` : `${br(0, 0)} s`;
    case 'hours': return `${br(0, 1)} h`;
    case 'int': return br(0, 0);
    default: return `${br(0, 2)} ${unit}`;
  }
}

export const TONE = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  stable: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function deltaText(c) {
  if (!c) return '';
  if (c.direction === 'stable') return 'Estável';
  const arrow = c.abs > 0 ? '▲' : '▼';
  if (c.pp !== null && c.pp !== undefined) return `${arrow} ${Math.abs(c.pp).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
  if (c.pct !== null && c.pct !== undefined) return `${arrow} ${Math.abs(c.pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return `${arrow} ${fmt(Math.abs(c.abs), c.unit)}`;
}

export const STATE_LABEL = { complete: 'Completo', partial: 'Parcial', not_informed: 'Não informado', empty: 'Vazio' };
export const STATE_CLS = { complete: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700', not_informed: 'bg-slate-100 text-slate-500', empty: 'bg-slate-100 text-slate-500' };

let catalogCache = null;
export function useBiCatalog() {
  const [cat, setCat] = useState(catalogCache);
  useEffect(() => {
    if (catalogCache) return;
    api.get('/bi-reports/catalog').then(({ data }) => { catalogCache = data; setCat(data); }).catch(() => {});
  }, []);
  return cat;
}

export const moduleTitle = (m, catalog) => (m.module_key === 'other' ? (m.label || 'Outro') : (catalog?.catalog?.[m.module_key]?.label || m.module_key));
