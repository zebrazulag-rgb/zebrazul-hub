import {
  AlertTriangle,
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
  return 'Arquivado';
}

function kindLabel(kind) {
  return kind === 'direct' ? 'Dado do DME' : 'Sugestão a partir do DME';
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

export default function DmeImportModal({
  open,
  loading,
  error,
  assessments,
  selectedAssessmentId,
  onAssessmentChange,
  source,
  candidates,
  selectedIds,
  onToggle,
  onSelectEmpty,
  onSelectSafe,
  onSelectAll,
  onClear,
  onApply,
  onClose,
  applying,
}) {
  if (!open) return null;

  const selectedCount = selectedIds.size;
  const directCount = candidates.filter((candidate) => candidate.kind === 'direct').length;
  const suggestionCount = candidates.length - directCount;
  const manualConflicts = candidates.filter((candidate) => candidate.state === 'manual').length;

  return (
    <ModalBackdrop onClose={onClose} disabled={applying} className="z-[70]" role="dialog">
      <div
        className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#0969ff]"><Database size={18} /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Retroalimentação</p>
                <h2 className="text-xl font-bold text-slate-900">Preencher o Diagnóstico com o DME</h2>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Revise o que será reaproveitado. Campos vazios e informações já importadas são selecionados automaticamente; textos manuais ficam protegidos.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Fechar">
            <X size={19} />
          </button>
        </header>

        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-7">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">DME de origem</span>
              <select
                className="input-field bg-white"
                value={selectedAssessmentId || ''}
                onChange={(event) => onAssessmentChange(Number(event.target.value))}
                disabled={loading || applying || !assessments.length}
              >
                {!assessments.length && <option value="">Nenhum DME encontrado</option>}
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {assessment.title} · {statusLabel(assessment.status)} · {Number(assessment.progress || 0)}%
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onSelectEmpty} disabled={loading || applying || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Somente vazios
              </button>
              <button type="button" onClick={onSelectSafe} disabled={loading || applying || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Vazios + importados
              </button>
              <button type="button" onClick={onSelectAll} disabled={loading || applying || !candidates.length} className="btn-secondary px-3 py-2 text-xs">
                Selecionar tudo
              </button>
              <button type="button" onClick={onClear} disabled={loading || applying || !selectedCount} className="btn-secondary px-3 py-2 text-xs">
                Limpar
              </button>
            </div>
          </div>

          {source && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm"><FileInput size={13} /> {source.title}</span>
              <span>{statusLabel(source.status)}</span>
              <span>•</span>
              <span>{source.progress}% preenchido</span>
              {source.overallScore > 0 && <><span>•</span><span>Nota {Number(source.overallScore).toFixed(1).replace('.', ',')}/5</span></>}
              {source.respondent && <><span>•</span><span>Respondido por {source.respondent}</span></>}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <Loader2 size={28} className="animate-spin text-[#0969ff]" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Lendo o DME e preparando sugestões...</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <AlertTriangle size={28} className="text-red-500" />
              <p className="mt-3 max-w-xl text-sm font-semibold text-red-700">{error}</p>
            </div>
          ) : !candidates.length ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <Database size={28} className="text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Este DME ainda não possui dados suficientes para alimentar o Diagnóstico Estratégico.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <SummaryMetric label="Possibilidades" value={candidates.length} icon={Database} />
                <SummaryMetric label="Dados diretos" value={directCount} icon={FileInput} />
                <SummaryMetric label="Sugestões" value={suggestionCount} icon={Sparkles} />
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
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${candidate.kind === 'direct' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{kindLabel(candidate.kind)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${stateClasses(candidate.state)}`}>{stateLabel(candidate.state)}</span>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{candidate.section}</p>
                          <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{preview}</p>
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
            <button type="button" onClick={onClose} disabled={applying} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={onApply} disabled={loading || applying || !selectedCount} className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              {applying ? <Loader2 size={16} className="animate-spin" /> : diagnosisActionIcon(source)}
              {applying ? 'Aplicando...' : 'Aplicar ao diagnóstico'}
            </button>
          </div>
        </footer>
      </div>
    </ModalBackdrop>
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
