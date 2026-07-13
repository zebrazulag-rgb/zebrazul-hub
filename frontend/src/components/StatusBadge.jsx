const STATUS_MAP = {
  draft: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600' },
  pending_approval: { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Reprovado', className: 'bg-red-100 text-red-700' },
  scheduled: { label: 'Agendado', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicado', className: 'bg-violet-100 text-violet-700' }
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || STATUS_MAP.draft;
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
