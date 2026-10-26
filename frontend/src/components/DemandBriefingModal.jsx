import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import {
  DEMAND_TYPES,
  buildBriefingDescription,
  cleanBriefingData,
  demandTypeById,
  makeBriefingPayload,
  missingDemandFields,
} from '../utils/demandBriefing.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function blankForm(defaultClientId = '', defaultDueDate = '') {
  return {
    demand_type: 'static_post',
    client_id: defaultClientId || '',
    title: '',
    goal: '',
    due_date: defaultDueDate || plusDaysISO(7),
    priority: 'medium',
    assignee_ids: [],
    content_tag: '',
    references: '',
    notes: '',
    details: {},
    created_from: 'internal',
  };
}

function parsedSuggestion(item) {
  const briefing = cleanBriefingData(item?.briefing_json);
  return {
    demand_type: briefing.demand_type || item?.demand_type || 'other',
    title: item?.title || '',
    goal: item?.goal || briefing.goal || '',
    references: briefing.references || '',
    notes: briefing.notes || '',
    details: briefing.details || {},
    priority: item?.priority || 'medium',
  };
}

export default function DemandBriefingModal({
  teamUsers = [],
  clients = [],
  defaultClientId = '',
  defaultDueDate = '',
  defaultFrontName = '',
  defaultBacklog = false,
  allowedTypeIds = null,
  taskToEdit = null,
  onClose,
  onSaved,
  onOpenSimpleTask,
}) {
  const isEditing = Boolean(taskToEdit?.id);
  const visibleTypes = useMemo(() => {
    const ids = Array.isArray(allowedTypeIds) && allowedTypeIds.length ? new Set(allowedTypeIds) : null;
    return ids ? DEMAND_TYPES.filter((item) => ids.has(item.id)) : DEMAND_TYPES;
  }, [allowedTypeIds]);
  const existingBriefing = cleanBriefingData(taskToEdit?.briefing_json);
  const initialTypeId = existingBriefing.demand_type || visibleTypes.find((item) => defaultFrontName === 'Site/LP' ? item.id === 'landing_page' : true)?.id || 'static_post';
  const [form, setForm] = useState(() => isEditing ? {
    ...blankForm(taskToEdit?.client_id || defaultClientId, taskToEdit?.due_date?.slice?.(0, 10) || defaultDueDate),
    demand_type: initialTypeId,
    title: taskToEdit?.title || '',
    goal: taskToEdit?.goal || existingBriefing.goal || '',
    due_date: taskToEdit?.due_date?.slice?.(0, 10) || defaultDueDate || plusDaysISO(7),
    priority: taskToEdit?.priority || 'medium',
    assignee_ids: taskToEdit?.assignees?.map((item) => Number(item.id)) || [],
    references: existingBriefing.references || '',
    notes: existingBriefing.notes || '',
    details: existingBriefing.details || {},
    created_from: existingBriefing.created_from || 'internal',
  } : ({ ...blankForm(defaultClientId, defaultDueDate), demand_type: initialTypeId }));
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const type = useMemo(() => demandTypeById(form.demand_type), [form.demand_type]);
  const selectedClientId = Number(form.client_id) || null;
  const selectedClient = clients.find((client) => Number(client.id) === selectedClientId) || null;
  const missing = useMemo(() => missingDemandFields(form, type), [form, type]);

  const availableUsers = useMemo(() => teamUsers.filter((member) => {
    if (member.role === 'admin' || member.is_operations_head || !selectedClientId) return true;
    if ((member.client_ids || []).map(Number).includes(selectedClientId)) return true;
    return form.assignee_ids.includes(member.id);
  }), [teamUsers, selectedClientId, form.assignee_ids]);

  useEffect(() => {
    if (isEditing || !selectedClientId) {
      setSuggestions([]);
      return;
    }
    let active = true;
    setSuggestionsLoading(true);
    api.get('/tasks/briefing-suggestions', { params: { client_id: selectedClientId, limit: 8 } })
      .then(({ data }) => { if (active) setSuggestions(data?.items || []); })
      .catch(() => { if (active) setSuggestions([]); })
      .finally(() => { if (active) setSuggestionsLoading(false); });
    return () => { active = false; };
  }, [selectedClientId, isEditing]);

  useEffect(() => {
    if (!selectedClient) return;
    const currentIds = new Set(form.assignee_ids.map(Number));
    const validIds = form.assignee_ids.filter((userId) => {
      const member = teamUsers.find((item) => Number(item.id) === Number(userId));
      if (!member) return false;
      if (member.role === 'admin' || member.is_operations_head) return true;
      return (member.client_ids || []).map(Number).includes(Number(selectedClient.id));
    });
    const responsibleId = Number(selectedClient.responsible_user_id || 0);
    if (!validIds.length && responsibleId && !currentIds.has(responsibleId)) {
      const responsible = teamUsers.find((member) => Number(member.id) === responsibleId);
      if (responsible) validIds.push(responsibleId);
    }
    if (validIds.join(',') !== form.assignee_ids.join(',')) {
      setForm((current) => ({ ...current, assignee_ids: validIds }));
    }
  }, [selectedClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDetail(key, value) {
    setForm((current) => ({ ...current, details: { ...current.details, [key]: value } }));
  }

  function changeType(typeId) {
    const nextType = demandTypeById(typeId);
    setForm((current) => ({
      ...current,
      demand_type: nextType.id,
      details: {},
      title: current.title,
      goal: current.goal,
    }));
    setError('');
  }

  function changeClient(clientId) {
    setForm((current) => ({ ...current, client_id: clientId, assignee_ids: [] }));
  }

  function toggleAssignee(userId) {
    setForm((current) => ({
      ...current,
      assignee_ids: current.assignee_ids.includes(userId)
        ? current.assignee_ids.filter((id) => id !== userId)
        : [...current.assignee_ids, userId],
    }));
  }

  function applySuggestion(item) {
    const copied = parsedSuggestion(item);
    const copiedType = demandTypeById(copied.demand_type);
    setForm((current) => ({
      ...current,
      demand_type: copiedType.id,
      title: copied.title,
      goal: copied.goal,
      priority: copied.priority,
      details: copied.details,
      references: copied.references,
      notes: copied.notes,
    }));
    setStep(2);
  }

  function validateStep(targetStep) {
    setError('');
    if (targetStep === 2) {
      if (!selectedClientId) { setError('Escolha o cliente antes de continuar.'); return false; }
      if (!form.demand_type) { setError('Escolha o tipo da demanda.'); return false; }
      return true;
    }
    if (targetStep === 3) {
      if (!form.title.trim()) { setError('Dê um nome claro para a demanda.'); return false; }
      if (!form.goal.trim()) { setError('Responda o que precisa acontecer com essa peça.'); return false; }
      const dynamicMissing = (type.fields || []).filter((field) => field.required && !String(form.details?.[field.key] || '').trim());
      if (dynamicMissing.length) {
        setError(`Falta responder: ${dynamicMissing[0].label}.`);
        return false;
      }
      return true;
    }
    return true;
  }

  function goTo(nextStep) {
    if (nextStep > step && !validateStep(nextStep)) return;
    setStep(nextStep);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const missingNow = missingDemandFields(form, type);
    if (missingNow.length) {
      setError(`FALTA COISA AQUI ANTES DE PRODUZIR. Complete: ${missingNow.slice(0, 4).join(', ')}${missingNow.length > 4 ? '…' : ''}.`);
      setStep(missingNow.some((item) => item === 'cliente') ? 1 : missingNow.some((item) => ['título', 'o que precisa acontecer'].includes(item)) ? 2 : 3);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...makeBriefingPayload(form), ...(isEditing ? {} : { is_backlog: defaultBacklog ? 1 : 0 }) };
      const response = isEditing ? await api.put(`/tasks/${taskToEdit.id}`, payload) : await api.post('/tasks', payload);
      onSaved?.(response.data?.task || response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar a demanda.');
    } finally {
      setSaving(false);
    }
  }

  const sameTypeSuggestions = suggestions.filter((item) => {
    const briefing = cleanBriefingData(item.briefing_json);
    return briefing.demand_type === form.demand_type;
  });

  return (
    <ModalBackdrop onClose={() => !saving && onClose?.()} disabled={saving} className="z-[70]">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[#fbfaf7] shadow-2xl">
        <header className="flex items-start justify-between gap-5 border-b border-slate-200 bg-[#17181c] px-5 py-5 text-white sm:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#72f14d]">
              <Sparkles size={14} /> {isEditing ? 'Editar briefing' : 'Briefing inteligente'}
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl">{isEditing ? 'AJUSTE O BRIEFING. SEM PERDER O RASTRO.' : 'NOVA DEMANDA. COM DIREÇÃO.'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Formato é só o começo. Antes de produzir, o Hub precisa saber o que essa entrega tem que fazer acontecer.</p>
          </div>
          <button type="button" onClick={() => !saving && onClose?.()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X size={19} />
          </button>
        </header>

        <div className="border-b border-slate-200 bg-white px-5 py-3 sm:px-7">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              [1, 'O que é'],
              [2, 'O que precisa acontecer'],
              [3, 'Quem pega a bola'],
            ].map(([number, label]) => (
              <button key={number} type="button" onClick={() => number < step && setStep(number)} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${step === number ? 'bg-[#0969ff] text-white' : number < step ? 'bg-blue-50 text-[#0969ff]' : 'bg-slate-100 text-slate-400'}`}>
                <span>{number}</span><span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full lg:grid-cols-[1fr_320px]">
            <main className="p-5 sm:p-7">
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">Cliente</label>
                    <select className="input-field" value={form.client_id} onChange={(event) => changeClient(event.target.value)}>
                      <option value="">Escolha o cliente</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Formato da demanda</p>
                        <h3 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#17181c]">O que vamos colocar no mundo?</h3>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {visibleTypes.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => changeType(item.id)}
                          className={`min-h-[92px] rounded-2xl border p-3 text-left transition ${form.demand_type === item.id ? 'border-[#17181c] bg-[#17181c] text-white shadow-[0_12px_32px_rgba(23,24,28,0.16)]' : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300'}`}
                        >
                          <span className="mb-4 block h-2 w-8 rounded-full" style={{ backgroundColor: item.accent }} />
                          <span className="block text-sm font-black">{item.label}</span>
                          <span className={`mt-1 block text-[11px] ${form.demand_type === item.id ? 'text-white/50' : 'text-slate-400'}`}>{item.group}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isEditing && selectedClientId && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Já fizemos algo parecido?</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">Reaproveite contexto. Não recomece briefing do zero.</p>
                        </div>
                        {suggestionsLoading && <Loader2 size={17} className="animate-spin text-slate-400" />}
                      </div>
                      {!suggestionsLoading && sameTypeSuggestions.length > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {sameTypeSuggestions.slice(0, 4).map((item) => (
                            <button key={item.id} type="button" onClick={() => applySuggestion(item)} className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50">
                              <Copy size={15} className="mt-0.5 shrink-0 text-[#0969ff]" />
                              <span className="min-w-0"><strong className="block truncate text-xs text-slate-700">{item.title}</strong><span className="mt-1 block text-[11px] text-slate-400">Usar como ponto de partida</span></span>
                            </button>
                          ))}
                        </div>
                      ) : !suggestionsLoading ? <p className="mt-3 text-xs text-slate-400">Ainda não há briefing estruturado desse tipo para este cliente.</p> : null}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-2 rounded-full" style={{ backgroundColor: type.accent }} />
                      <div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{selectedClient?.name || 'Cliente'}</p><h3 className="text-lg font-black text-[#17181c]">{type.label}</h3></div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Nome da demanda *</span>
                    <input className="input-field" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Dê um nome que alguém entenda sem abrir a tarefa" />
                  </label>

                  <label className="block rounded-2xl border-2 border-[#0969ff]/20 bg-blue-50/50 p-4">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#0969ff]"><Lightbulb size={15} /> A pergunta que vem antes da peça</span>
                    <span className="mt-2 block text-base font-black text-[#17181c]">O que precisa acontecer por causa dessa entrega? *</span>
                    <textarea className="input-field mt-3 min-h-[110px] resize-y bg-white" value={form.goal} onChange={(event) => update('goal', event.target.value)} placeholder="Ex.: fazer o empresário perceber que o problema não é falta de post, mas falta de direção — e abrir conversa comercial." />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {(type.fields || []).map((field) => {
                      const common = {
                        className: 'input-field',
                        value: form.details?.[field.key] || '',
                        onChange: (event) => updateDetail(field.key, event.target.value),
                      };
                      return (
                        <label key={field.key} className={field.multiline ? 'block sm:col-span-2' : 'block'}>
                          <span className="mb-1.5 block text-xs font-bold text-slate-600">{field.label}{field.required ? ' *' : ''}</span>
                          {field.type === 'select' ? (
                            <select {...common}><option value="">Escolha</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                          ) : field.multiline ? (
                            <textarea {...common} className="input-field min-h-[96px] resize-y" placeholder={field.placeholder || ''} />
                          ) : (
                            <input {...common} type={field.type === 'date' ? 'date' : 'text'} placeholder={field.placeholder || ''} />
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Referências / links</span>
                    <textarea className="input-field min-h-[88px] resize-y" value={form.references} onChange={(event) => update('references', event.target.value)} placeholder="Drive, Instagram, site, material anterior. Referência amplia repertório; não substitui direção." />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Observações</span>
                    <textarea className="input-field min-h-[76px] resize-y" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Contexto que não cabe nos campos acima" />
                  </label>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-600"><Clock3 size={14} /> Prazo *</span>
                      <input type="date" min={todayISO()} className="input-field" value={form.due_date} onChange={(event) => update('due_date', event.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-600">Prioridade</span>
                      <select className="input-field" value={form.priority} onChange={(event) => update('priority', event.target.value)}>
                        <option value="low">Baixa</option>
                        <option value="medium">Normal</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600"><UserRound size={14} /> Quem pega a bola? *</span>
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                      {availableUsers.map((member) => (
                        <button key={member.id} type="button" onClick={() => toggleAssignee(member.id)} className={`rounded-full border px-3 py-2 text-xs font-bold transition ${form.assignee_ids.includes(member.id) ? 'border-[#0969ff] bg-[#0969ff] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {member.name}
                        </button>
                      ))}
                      {!availableUsers.length && <p className="text-xs text-slate-400">Nenhum membro disponível para este cliente.</p>}
                    </div>
                  </div>

                  <div className={`rounded-2xl border p-4 ${missing.length ? 'border-[#ec0567]/30 bg-[#ec0567]/5' : 'border-[#72f14d]/50 bg-[#72f14d]/10'}`}>
                    <div className="flex items-start gap-3">
                      {missing.length ? <FileText size={18} className="mt-0.5 text-[#ec0567]" /> : <CheckCircle2 size={18} className="mt-0.5 text-[#2c9b35]" />}
                      <div>
                        <p className={`text-sm font-black ${missing.length ? 'text-[#b40049]' : 'text-[#1f6f27]'}`}>{missing.length ? 'FALTA COISA AQUI ANTES DE PRODUZIR.' : 'BRIEFING PRONTO PRA ENTRAR NA FILA.'}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{missing.length ? `Complete: ${missing.join(', ')}.` : `${type.label} · ${selectedClient?.name || ''} · ${form.assignee_ids.length} responsável(is).`}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="mt-5 rounded-2xl border border-[#ec0567]/25 bg-[#ec0567]/5 px-4 py-3 text-sm font-semibold text-[#ad0649]">{error}</div>}
            </main>

            <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0 sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Rota automática</p>
              <h4 className="mt-2 text-lg font-black tracking-[-0.03em] text-[#17181c]">{type.frontName}</h4>
              <p className="mt-2 text-xs leading-5 text-slate-500">O formato escolhido já define a frente operacional. Você não precisa decidir onde essa demanda deve morar.</p>

              <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
                <div><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Cliente</span><p className="mt-1 text-sm font-bold text-slate-700">{selectedClient?.name || 'Ainda não escolhido'}</p></div>
                <div><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Entrega</span><p className="mt-1 text-sm font-bold text-slate-700">{type.label}</p></div>
                <div><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Prazo</span><p className="mt-1 text-sm font-bold text-slate-700">{form.due_date ? new Date(`${form.due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Não definido'}</p></div>
              </div>

              {step >= 2 && form.goal.trim() && (
                <div className="mt-6 rounded-2xl bg-[#17181c] p-4 text-white">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#72f14d]">Direção</span>
                  <p className="mt-2 text-sm font-semibold leading-6">{form.goal}</p>
                </div>
              )}

              {!isEditing && onOpenSimpleTask && (
                <button type="button" onClick={onOpenSimpleTask} className="mt-6 text-left text-xs font-semibold text-slate-400 underline decoration-slate-300 underline-offset-4 hover:text-slate-600">Isso é só uma tarefa interna simples</button>
              )}
            </aside>
          </div>
        </form>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
          <button type="button" onClick={() => step === 1 ? onClose?.() : setStep((current) => Math.max(1, current - 1))} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{step === 1 ? 'Cancelar' : 'Voltar'}</button>
          {step < 3 ? (
            <button type="button" onClick={() => goTo(step + 1)} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-5 py-2.5 text-xs font-black text-white transition hover:-translate-y-0.5">Continuar <ArrowRight size={15} /></button>
          ) : (
            <button type="button" onClick={submit} disabled={saving || missing.length > 0} className="inline-flex items-center gap-2 rounded-xl bg-[#17181c] px-5 py-2.5 text-xs font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {isEditing ? 'Salvar briefing' : 'Criar demanda'}
            </button>
          )}
        </footer>
      </div>
    </ModalBackdrop>
  );
}
