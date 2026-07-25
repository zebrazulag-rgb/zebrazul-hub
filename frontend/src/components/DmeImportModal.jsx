import {
  AlertTriangle,
  BrainCircuit,
  Check,
  CheckCircle2,
  Database,
  FileInput,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import ModalBackdrop from './ModalBackdrop.jsx';
import { candidatePreview } from '../dmeStrategicImport.js';

function statusLabel(status) {
  if (status === 'submitted') return 'Concluído';
  if (status === 'in_progress') return 'Em preenchimento';
  if (status === 'shared') return 'Aguardando respostas';
  if (status === 'combined') return 'Consolidado';
  return 'Arquivado';
}

function kindLabel(kind) {
  if (kind === 'ai') return 'Consolidado por IA';
  return kind === 'direct' ? 'Dado do DME' : 'Sugestão a partir do DME';
}

function kindClasses(kind) {
  if (kind === 'ai') return 'bg-indigo-50 text-indigo-700';
  return kind === 'direct' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';
}

function stateLabel(state) {
  if (state === 'empty') return 'Campo vazio';
  if (state === 'imported') return 'Atualizar importado';
  return 'Já preenchido manualmente';
}

function stateClasses(state) {
  if (state === 'empty') return 'bg-emerald-50 text-emerald-700';
  if (state === 'imported') return 'bg-blue-50 text-blue-700';
  return 'bg-amber-50 text-amber-700';
}

function formatScore(value) {
  return Number(value || 0).toFixed(1).replace('.', ',');
}

export default function DmeImportModal({
  open,
  loading,
  error,
  assessments,
  selectedAssessmentIds,
  onAssessmentToggle,
  source,
  candidates,
  selectedIds,
  onToggle,
  onSelectEmpty,
  onSelectSafe,
  onSelectAll,
  onClear,
  onGenerateAi,
  aiLoading,
  aiResult,
  canUseAi = true,
  onApply,
  onClose,
  applying,
}) {
  if (!open) return null;

  const assessmentCount = selectedAssessmentIds.size;
  const selectedCount = selectedIds.size;
  const directCount = candidates.filter((candidate) => candidate.kind === 'direct').length;
  const aiCount = candidates.filter((candidate) => candidate.kind === 'ai').length;
  const suggestionCount = candidates.length - directCount - aiCount;
  const manualConflicts = candidates.filter((candidate) => candidate.state === 'manual').length;
  const busy = applying || aiLoading;

  return (
    <ModalBackdrop onClose={onClose} disabled={busy} className="z-[70]" role="dialog">
      <div
        className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#0969ff]"><Database size={18} /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Retroalimentação inteligente</p>
                <h2 className="text-xl font-bold text-slate-900">Preencher o Diagnóstico com os DMEs</h2>
              </div>
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              Selecione uma ou mais respostas. Com dois ou mais DMEs, a IA pode produzir uma síntese única, preservar consensos, apontar divergências e usar a média calculada das notas.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Fechar">
            <X size={19} />
          </button>
        </header>

        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-7">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600">DMEs de origem</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                  {assessmentCount} selecionado(s)
                </span>
              </div>
              <div className="grid max-h-36 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {!assessments.length && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Nenhum DME encontrado.</div>
                )}
                {assessments.map((assessment) => {
                  const selected = selectedAssessmentIds.has(Number(assessment.id));
                  return (
                    <button
                      key={assessment.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() => onAssessmentToggle(Number(assessment.id))}
                      className={`flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition disabled:opacity-60 ${selected ? 'border-[#0969ff]/35 bg-[#eef5ff] shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-[#0969ff] bg-[#0969ff] text-white' : 'border-slate-300 text-transparent'}`}>
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-slate-800">{assessment.title}</strong>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">
                          {statusLabel(assessment.status)} · {Number(assessment.progress || 0)}%
                          {Number(assessment.overall_score || 0) > 0 ? ` · Nota ${formatScore(assessment.overall_score)}/5` : ''}
                        </span>
                        {assessment.respondent_name && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{assessment.respondent_name}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:max-w-[470px] xl:justify-end">
              <button type="button" onClick={onSelectEmpty} disabled={loading || busy || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Somente vazios
              </button>
              <button type="button" onClick={onSelectSafe} disabled={loading || busy || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Vazios + importados
              </button>
              <button type="button" onClick={onSelectAll} disabled={loading || busy || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Selecionar tudo
              </button>
              <button type="button" onClick={onClear} disabled={loading || busy || !selectedCount} className="btn-secondary px-3 py-2 text-xs">
                Limpar
              </button>
              {canUseAi && (
                <button
                  type="button"
                  onClick={onGenerateAi}
                  disabled={loading || busy || assessmentCount < 2 || !selectedCount}
                  className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  title={assessmentCount < 2 ? 'Selecione pelo menos dois DMEs' : 'Criar uma síntese única com IA'}
                >
                  {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <BrainCircuit size={15} />}
                  {aiLoading ? 'Unificando...' : aiResult ? 'Regenerar com IA' : 'Unificar com IA'}
                </button>
              )}
            </div>
          </div>

          {source && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm"><FileInput size={13} /> {source.title}</span>
              <span>{source.count > 1 ? `${source.count} respostas` : statusLabel(source.status)}</span>
              <span>•</span>
              <span>{source.progress}% preenchido em média</span>
              {source.overallScore > 0 && <><span>•</span><span>Nota média {formatScore(source.overallScore)}/5</span></>}
              {source.respondent && <><span>•</span><span>Respondentes: {source.respondent}</span></>}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <Loader2 size={28} className="animate-spin text-[#0969ff]" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Lendo os DMEs e preparando a consolidação...</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <AlertTriangle size={28} className="text-red-500" />
              <p className="mt-3 max-w-xl text-sm font-semibold text-red-700">{error}</p>
            </div>
          ) : !candidates.length ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <Database size={28} className="text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Selecione ao menos um DME com dados preenchidos para alimentar o Diagnóstico Estratégico.</p>
            </div>
          ) : (
            <>
              {aiResult && <AiResultSummary result={aiResult} aiCount={aiCount} />}

              <div className="grid gap-3 sm:grid-cols-5">
                <SummaryMetric label="Possibilidades" value={candidates.length} icon={Database} />
                <SummaryMetric label="Dados diretos" value={directCount} icon={FileInput} />
                <SummaryMetric label="Sugestões" value={suggestionCount} icon={Sparkles} />
                <SummaryMetric label="Com IA" value={aiCount} icon={BrainCircuit} />
                <SummaryMetric label="Conflitos manuais" value={manualConflicts} icon={AlertTriangle} />
              </div>

              {manualConflicts > 0 && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <p>Os campos já preenchidos manualmente não foram selecionados. Marque um deles apenas quando quiser substituir o texto atual.</p>
                </div>
              )}

              <div className="mt-5 space-y-3">
                {candidates.map((candidate) => {
                  const selected = selectedIds.has(candidate.id);
                  const preview = candidatePreview(candidate);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggle(candidate.id);
                      }}
                      className={`block w-full cursor-pointer rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0969ff]/35 ${selected ? 'border-[#0969ff]/35 bg-[#eef5ff]/45 shadow-[0_8px_24px_rgba(9,105,255,0.08)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${selected ? 'border-[#0969ff] bg-[#0969ff] text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-800">{candidate.label}</p>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${kindClasses(candidate.kind)}`}>{kindLabel(candidate.kind)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${stateClasses(candidate.state)}`}>{stateLabel(candidate.state)}</span>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{candidate.section}</p>
                          <p className="mt-2 line-clamp-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{preview}</p>

                          {candidate.aiMeta && (
                            <div className="mt-3 grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900/80 sm:grid-cols-3">
                              <AiMetaList label="Consensos" values={candidate.aiMeta.consensusPoints} />
                              <AiMetaList label="Divergências" values={candidate.aiMeta.divergences} />
                              <AiMetaList label="O que falta" values={candidate.aiMeta.missingInformation} />
                            </div>
                          )}

                          {candidate.state === 'manual' && candidate.targetType === 'field' && candidate.currentValue && (
                            <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Texto atual protegido</p>
                              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-amber-900/75">{candidate.currentValue}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {selectedCount > 0 ? <CheckCircle2 size={17} className="text-emerald-500" /> : <AlertTriangle size={17} className="text-slate-300" />}
            <span><strong className="text-slate-800">{selectedCount}</strong> item(ns) selecionado(s)</span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={onApply} disabled={loading || busy || !selectedCount} className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              {applying ? <Loader2 size={16} className="animate-spin" /> : diagnosisActionIcon(source)}
              {applying ? 'Aplicando...' : 'Aplicar ao diagnóstico'}
            </button>
          </div>
        </footer>
      </div>
    </ModalBackdrop>
  );
}

function AiResultSummary({ result, aiCount }) {
  const consensus = (result.consensus || []).slice(0, 3);
  const divergences = (result.divergences || []).slice(0, 3);
  const missingInformation = (result.missing_information || []).slice(0, 3);
  const scoreSummary = result.score_summary || {};
  const pillarAverages = (scoreSummary.pillars || []).filter((pillar) => Number(pillar.average || 0) > 0).slice(0, 4);
  return (
    <div className="mb-5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><BrainCircuit size={18} /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Síntese por IA pronta</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{result.summary || `${aiCount} campos foram consolidados em uma leitura única.`}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
          <span className="rounded-full bg-white/80 px-2.5 py-1">{result.model || 'Modelo configurado'}</span>
          {result.cached && <span className="rounded-full bg-white/80 px-2.5 py-1">Resultado reutilizado</span>}
        </div>
      </div>

      {Number(scoreSummary.overall_average || 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-indigo-100 bg-white/85 px-3 py-1.5 text-xs font-bold text-indigo-800">
            Média geral: {formatScore(scoreSummary.overall_average)}/5
          </span>
          {pillarAverages.map((pillar) => (
            <span key={pillar.id} className="rounded-full border border-indigo-100 bg-white/70 px-3 py-1.5 text-xs text-slate-600">
              {pillar.title}: <strong>{formatScore(pillar.average)}/5</strong>
            </span>
          ))}
        </div>
      )}

      {(consensus.length > 0 || divergences.length > 0 || missingInformation.length > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AiMetaList label="Principais consensos" values={consensus} />
          <AiMetaList label="Divergências identificadas" values={divergences} />
          <AiMetaList label="Informações a completar" values={missingInformation} />
        </div>
      )}
    </div>
  );
}

function AiMetaList({ label, values = [] }) {
  if (!values.length) return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs text-slate-400">Nenhum ponto relevante.</p>
    </div>
  );
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-600">
        {values.slice(0, 4).map((value, index) => <li key={`${label}-${index}`}>• {value}</li>)}
      </ul>
    </div>
  );
}

function diagnosisActionIcon(source) {
  return source ? <RefreshCw size={16} /> : <CheckCircle2 size={16} />;
}

function SummaryMetric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <Icon size={14} className="text-[#0969ff]" />
      </div>
      <strong className="mt-2 block text-xl text-slate-900">{value}</strong>
    </div>
  );
}
