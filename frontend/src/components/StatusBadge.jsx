const STATUS_MAP = {
  draft: { label: 'Rascunho', tone: 'draft' },
  pending_approval: { label: 'Aguardando aprovação', tone: 'waiting' },
  approved: { label: 'Aprovado', tone: 'approved' },
  rejected: { label: 'Ajustes solicitados', tone: 'correction' },
  scheduled: { label: 'Agendado', tone: 'progress' },
  published: { label: 'Publicado', tone: 'published' }
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || STATUS_MAP.draft;
  return <span className={`badge brand-status-badge brand-status-${config.tone}`}>{config.label}</span>;
}
