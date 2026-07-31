import api from '../api';

export const VIDEO_STATUS = {
  draft: { label: 'Rascunho', className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  pending_approval: { label: 'Aguardando aprovação', className: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  changes_requested: { label: 'Ajustes solicitados', className: 'border-orange-400/30 bg-orange-400/10 text-orange-300' },
  approved: { label: 'Aprovado', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  rejected: { label: 'Reprovado', className: 'border-rose-400/30 bg-rose-400/10 text-rose-300' },
  archived: { label: 'Arquivado', className: 'border-slate-500/30 bg-slate-500/10 text-slate-400' },
};

export function videoStatus(status) {
  return VIDEO_STATUS[status] || VIDEO_STATUS.draft;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let result = value;
  while (result >= 1024 && index < units.length - 1) {
    result /= 1024;
    index += 1;
  }
  return `${result >= 10 || index === 0 ? result.toFixed(0) : result.toFixed(1)} ${units[index]}`;
}

export function formatTimestamp(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return 'Geral';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function videoAssetUrl(relativeUrl) {
  if (!relativeUrl) return '';
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  const base = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
  const normalized = String(relativeUrl).startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  return `${base}${normalized}`;
}
