import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, RefreshCw, Sparkles } from 'lucide-react';

export function isVideoContent(value) {
  const type = String(value || '').toLowerCase();
  return type.includes('reel') || type.includes('video');
}

export function coverAnalysisKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

export function coverStatusMeta(status) {
  const map = {
    cover_likely: { label: 'Capa detectada', short: 'CAPA', tone: 'emerald' },
    frame_likely: { label: 'Provável frame', short: 'SEM CAPA?', tone: 'rose' },
    missing_cover: { label: 'Sem capa', short: 'SEM CAPA', tone: 'rose' },
    review: { label: 'Revisar', short: 'REVISAR', tone: 'amber' },
    error: { label: 'Falha na análise', short: 'ERRO', tone: 'slate' },
    not_applicable: { label: 'Não se aplica', short: '', tone: 'slate' },
  };
  return map[status] || { label: 'Não analisado', short: 'ANALISAR', tone: 'slate' };
}

function Stat({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] opacity-75"><Icon size={14} /> {label}</div>
      <div className="mt-1 text-2xl font-black tracking-tight">{value}</div>
    </div>
  );
}

export default function FeedCoverDashboard({
  plannedPosts = [],
  publishedPosts = [],
  analyses = {},
  analyzing = false,
  onAnalyze,
  error = '',
}) {
  const sources = [
    ...plannedPosts.filter((item) => isVideoContent(item.content_type)).map((item) => ({ key: coverAnalysisKey('planned', item.id) })),
    ...publishedPosts.filter((item) => isVideoContent(item.content_type)).map((item) => ({ key: coverAnalysisKey('instagram', item.content_id) })),
  ];
  const unique = [...new Map(sources.map((item) => [item.key, item])).values()];
  const values = unique.map((item) => analyses[item.key]).filter(Boolean);
  const covered = values.filter((item) => item.status === 'cover_likely').length;
  const missing = values.filter((item) => ['frame_likely', 'missing_cover'].includes(item.status)).length;
  const review = unique.length - covered - missing;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.035)] sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-600"><Sparkles size={15} /> Inteligência de capas</div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Radar visual de Reels e vídeos</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">O ZebraHub cruza a existência da mídia com análise visual para sinalizar capa planejada, frame provável ou conteúdo que precisa de revisão.</p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || unique.length === 0}
          className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {analyzing ? 'Analisando...' : 'Analisar capas'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Sparkles} label="Vídeos monitorados" value={unique.length} />
        <Stat icon={CheckCircle2} label="Capa detectada" value={covered} tone="emerald" />
        <Stat icon={AlertTriangle} label="Sem capa / frame" value={missing} tone="rose" />
        <Stat icon={CircleHelp} label="A revisar" value={Math.max(0, review)} tone="amber" />
      </div>

      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}
    </section>
  );
}
