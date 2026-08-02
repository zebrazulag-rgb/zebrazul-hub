import api from '../api';

export const VIDEO_STATUS = {
  draft: { label: 'Rascunho', className: 'video-status-draft' },
  pending_approval: { label: 'Aguardando aprovação', className: 'video-status-pending' },
  changes_requested: { label: 'Ajustes solicitados', className: 'video-status-changes' },
  approved: { label: 'Aprovado', className: 'video-status-approved' },
  rejected: { label: 'Reprovado', className: 'video-status-rejected' },
  archived: { label: 'Arquivado', className: 'video-status-archived' },
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
