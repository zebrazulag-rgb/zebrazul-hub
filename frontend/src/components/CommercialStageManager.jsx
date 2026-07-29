import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import {
  COMMERCIAL_STAGE_COLOR_OPTIONS,
  decorateCommercialStage,
} from '../utils/commercialStages.js';

function emptyStageForm() {
  return {
    name: '',
    subtitle: '',
    probability: 20,
    color_key: 'cyan',
  };
}

export default function CommercialStageManager({
  open,
  onClose,
  clientId,
  stages,
  leadCounts = {},
  onStagesChange,
}) {
  const [stageForm, setStageForm] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [stageToDelete, setStageToDelete] = useState(null);
  const [moveToStage, setMoveToStage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const decoratedStages = useMemo(
    () => (stages || []).map(decorateCommercialStage),
    [stages]
  );

  useEffect(() => {
    if (!open) {
      setStageForm(null);
      setEditingStage(null);
      setStageToDelete(null);
      setMoveToStage('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  function beginCreate() {
    setEditingStage(null);
    setStageForm(emptyStageForm());
    setError('');
  }

  function beginEdit(stage) {
    setEditingStage(stage);
    setStageForm({
      name: stage.name || '',
      subtitle: stage.subtitle || '',
      probability: Number(stage.probability || 0),
      color_key: stage.color_key || 'blue',
    });
    setError('');
  }

  async function saveStage(event) {
    event.preventDefault();
    if (!stageForm?.name?.trim()) {
      setError('Informe o nome do quadro.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        client_id: clientId,
        name: stageForm.name.trim(),
        subtitle: stageForm.subtitle.trim(),
        probability: Number(stageForm.probability || 0),
        color_key: stageForm.color_key,
      };
      const { data } = editingStage
        ? await api.put(`/commercial/stages/${editingStage.id}`, payload)
        : await api.post('/commercial/stages', payload);
      onStagesChange(data.stages || []);
      setStageForm(null);
      setEditingStage(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o quadro.');
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stages.length || reordering) return;
    const nextStages = [...stages];
    const [moved] = nextStages.splice(index, 1);
    nextStages.splice(targetIndex, 0, moved);
    onStagesChange(nextStages.map((stage, position) => ({ ...stage, position })));
    setReordering(true);
    try {
      const { data } = await api.put('/commercial/stages/reorder', {
        client_id: clientId,
        stage_keys: nextStages.map((stage) => stage.stage_key),
      });
      onStagesChange(data.stages || nextStages);
    } catch (err) {
      onStagesChange(stages);
      setError(err.response?.data?.error || 'Não foi possível alterar a ordem dos quadros.');
    } finally {
      setReordering(false);
    }
  }

  function beginDelete(stage) {
    setStageToDelete(stage);
    const firstDestination = stages.find((item) => item.stage_key !== stage.stage_key);
    setMoveToStage(firstDestination?.stage_key || '');
    setError('');
  }

  async function confirmDelete() {
    if (!stageToDelete) return;
    const count = Number(leadCounts[stageToDelete.stage_key] || 0);
    if (count > 0 && !moveToStage) {
      setError('Escolha para onde as oportunidades deste quadro devem ser movidas.');
      return;
    }
    setDeleting(true);
    setError('');
    try {
      const { data } = await api.delete(`/commercial/stages/${stageToDelete.id}`, {
        params: {
          client_id: clientId,
          move_to: count > 0 ? moveToStage : undefined,
        },
      });
      onStagesChange(data.stages || []);
      setStageToDelete(null);
      setMoveToStage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível apagar o quadro.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ModalBackdrop onClose={() => !saving && !deleting && onClose()} disabled={saving || deleting} className="z-[80]">
        <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
            <div>
              <p className="section-kicker">Estrutura do pipeline</p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900"><Columns3 size={21} className="text-[#0969ff]" /> Gerenciar quadros</h2>
              <p className="mt-1 text-sm text-slate-500">Crie etapas como “Follow-up”, altere nomes e reorganize o caminho comercial.</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"><X size={18} /></button>
          </header>

          <div className="space-y-5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Os quadros de resultado podem ser renomeados e reposicionados, mas não apagados.</p>
              <button type="button" onClick={beginCreate} className="btn-primary inline-flex items-center justify-center gap-2 text-sm"><Plus size={16} /> Novo quadro</button>
            </div>

            <div className="space-y-3">
              {decoratedStages.map((stage, index) => {
                const count = Number(leadCounts[stage.key] || 0);
                const protectedStage = stage.stage_type === 'won' || stage.stage_type === 'lost' || Number(stage.is_system) === 1;
                return (
                  <div key={stage.id || stage.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${stage.dot}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{stage.label}</h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{count} oportunidade{count === 1 ? '' : 's'}</span>
                            {protectedStage && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Quadro de resultado</span>}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{stage.short} · probabilidade padrão de {stage.probability}%</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => moveStage(index, -1)} disabled={index === 0 || reordering} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30" title="Mover para a esquerda"><ArrowLeft size={16} /></button>
                        <button type="button" onClick={() => moveStage(index, 1)} disabled={index === stages.length - 1 || reordering} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30" title="Mover para a direita"><ArrowRight size={16} /></button>
                        <button type="button" onClick={() => beginEdit(stage)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0969ff]"><Pencil size={14} /> Editar</button>
                        {!protectedStage && (
                          <button type="button" onClick={() => beginDelete(stage)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-100 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} /> Apagar</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {stageForm && (
              <form onSubmit={saveStage} className="rounded-3xl border border-blue-100 bg-blue-50/35 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="section-kicker">{editingStage ? 'Editar quadro' : 'Novo quadro'}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{editingStage ? editingStage.name : 'Adicionar etapa ao pipeline'}</h3>
                  </div>
                  <button type="button" onClick={() => { setStageForm(null); setEditingStage(null); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400"><X size={16} /></button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Nome do quadro</label>
                    <input className="input-field" value={stageForm.name} onChange={(event) => setStageForm({ ...stageForm, name: event.target.value })} placeholder="Ex: Follow-up" autoFocus />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Subtítulo curto</label>
                    <input className="input-field" value={stageForm.subtitle} onChange={(event) => setStageForm({ ...stageForm, subtitle: event.target.value })} placeholder="Ex: Retomada" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700"><span>Probabilidade padrão</span><strong>{stageForm.probability}%</strong></label>
                    <input type="range" min="0" max="100" step="5" className="w-full accent-[#0969ff]" value={stageForm.probability} onChange={(event) => setStageForm({ ...stageForm, probability: Number(event.target.value) })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Cor do quadro</label>
                    <div className="flex flex-wrap gap-2">
                      {COMMERCIAL_STAGE_COLOR_OPTIONS.map((color) => (
                        <button key={color.key} type="button" onClick={() => setStageForm({ ...stageForm, color_key: color.key })} className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition ${stageForm.color_key === color.key ? 'border-slate-900 bg-white' : 'border-transparent bg-white/70'}`} title={color.label}>
                          <span className={`h-4 w-4 rounded-full ${color.className}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={() => { setStageForm(null); setEditingStage(null); }} className="btn-secondary">Cancelar</button>
                  <button type="submit" disabled={saving} className="btn-primary inline-flex min-w-36 items-center justify-center gap-2"><Save size={15} /> {saving ? 'Salvando...' : 'Salvar quadro'}</button>
                </div>
              </form>
            )}

            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </div>
        </section>
      </ModalBackdrop>

      {stageToDelete && (
        <ModalBackdrop onClose={() => !deleting && setStageToDelete(null)} disabled={deleting} className="z-[95]">
          <section className="w-full max-w-lg rounded-[26px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker text-rose-500">Excluir quadro</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Apagar “{stageToDelete.name}”?</h3>
              </div>
              <button type="button" onClick={() => setStageToDelete(null)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><X size={17} /></button>
            </div>

            {Number(leadCounts[stageToDelete.stage_key] || 0) > 0 ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Este quadro possui {leadCounts[stageToDelete.stage_key]} oportunidade(s).</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">Escolha o quadro que receberá essas oportunidades antes da exclusão.</p>
                <select className="input-field mt-4 bg-white" value={moveToStage} onChange={(event) => setMoveToStage(event.target.value)}>
                  <option value="">Selecione o destino</option>
                  {stages.filter((stage) => stage.stage_key !== stageToDelete.stage_key).map((stage) => <option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="mt-5 text-sm leading-6 text-slate-500">O quadro está vazio e será removido permanentemente do pipeline.</p>
            )}

            {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setStageToDelete(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmDelete} disabled={deleting} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"><Trash2 size={15} /> {deleting ? 'Apagando...' : 'Apagar quadro'}</button>
            </div>
          </section>
        </ModalBackdrop>
      )}
    </>
  );
}
