import { ArrowDownToLine, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';

export default function PreviousStageImportBanner({
  sourceLabel,
  targetLabel,
  sourceAvailable,
  imported,
  updateAvailable,
  importing,
  onFillEmpty,
  onRefresh,
  sourcePeriodLabel,
}) {
  if (!sourceAvailable) {
    return (
      <div data-stage-chain-panel="unavailable" className="surface-card flex items-start gap-3 border border-amber-400/20 bg-amber-400/[0.06] px-5 py-4">
        <Sparkles size={19} className="mt-0.5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-[var(--zh-text)]">Preenchimento automático indisponível</p>
          <p className="mt-1 text-sm text-[var(--zh-muted)]">O {targetLabel} poderá aproveitar automaticamente as informações do {sourceLabel} quando houver conteúdo salvo.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-stage-chain-panel="available" className="surface-card overflow-hidden border border-blue-400/20 bg-blue-500/[0.055]">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
            {imported && !updateAvailable ? <CheckCircle2 size={19} /> : <Sparkles size={19} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--zh-text)]">{updateAvailable ? 'Há novas informações na etapa anterior' : imported ? 'Preenchimento automático aplicado' : 'Preenchimento automático disponível'}</p>
              {sourcePeriodLabel && <span className="rounded-full border border-[var(--zh-border)] bg-[var(--zh-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--zh-muted)]">{sourcePeriodLabel}</span>}
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--zh-muted)]">
              O ZebraHub transforma o conteúdo do <strong className="font-semibold text-[var(--zh-text-soft)]">{sourceLabel}</strong> na estrutura do <strong className="font-semibold text-[var(--zh-text-soft)]">{targetLabel}</strong>, preservando o que foi preenchido manualmente.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={onFillEmpty}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--zh-border)] bg-[var(--zh-surface-2)] px-3.5 py-2.5 text-sm font-semibold text-[var(--zh-text-soft)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            <ArrowDownToLine size={16} />
            Preencher automaticamente
          </button>
          {imported && (
            <button
              type="button"
              disabled={importing}
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--agency-primary)] px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={16} className={importing ? 'animate-spin' : ''} />
              Atualizar dados importados
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
