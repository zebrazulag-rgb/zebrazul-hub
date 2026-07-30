import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Target,
  Trash2,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import PreviousStageImportBanner from '../components/PreviousStageImportBanner.jsx';
import {
  applyPlanningAiResult,
  buildPlanningAiSchema,
  planningAiTargetCount,
  planningAiTargets,
} from '../planningAi.js';
import {
  buildAnnualPlanFromDiagnosis,
  detachImportedField,
  detachImportedTable,
  stageSourceSignature,
} from '../planningStageChain.js';
import {
  MONTHS,
  annualPlanCoverFields,
  annualPlanProgress,
  annualPlanSections,
  createAnnualPlanData,
  mergeAnnualPlanData,
} from '../annualPlanConfig.js';

export default function AnnualActionPlan() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [plan, setPlan] = useState(() => createAnnualPlanData());
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [navSearch, setNavSearch] = useState('');
  const [activeSection, setActiveSection] = useState('00');
  const [sourceDiagnosis, setSourceDiagnosis] = useState(null);
  const [importingStage, setImportingStage] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const planRef = useRef(plan);
  const saveTimerRef = useRef(null);

  const clientId = user?.role === 'client'
    ? Number(user.client_id)
    : Number(localClientId || selectedClient?.id) || null;
  const selectedClientRecord = clients.find((client) => Number(client.id) === Number(clientId));
  const progress = useMemo(() => annualPlanProgress(plan), [plan]);
  const aiSchema = useMemo(() => buildPlanningAiSchema(annualPlanCoverFields, annualPlanSections, 'Identificação do plano'), []);
  const aiPreviewPlan = useMemo(() => {
    if (!sourceDiagnosis?.data) return plan;
    return buildAnnualPlanFromDiagnosis(plan, sourceDiagnosis.data, {
      clientName: selectedClientRecord?.name || '',
      year,
      sourceUpdatedAt: sourceDiagnosis.updatedAt,
    }, 'empty');
  }, [plan, sourceDiagnosis, selectedClientRecord?.name, year]);
  const aiTargetCount = useMemo(() => planningAiTargetCount(aiSchema, aiPreviewPlan), [aiSchema, aiPreviewPlan]);

  useEffect(() => { planRef.current = plan; }, [plan]);

  useEffect(() => {
    api.get('/clients').then(({ data }) => {
      const next = data.clients || [];
      setClients(next);
      if (user?.role === 'client' && next[0]) setLocalClientId(String(next[0].id));
      else if (selectedClient?.id) setLocalClientId(String(selectedClient.id));
      else if (next.length === 1) setLocalClientId(String(next[0].id));
    }).catch(() => setClients([]));
  }, [user?.role, user?.client_id, selectedClient?.id]);

  const loadPlan = useCallback(async () => {
    if (!clientId) {
      setPlan(createAnnualPlanData());
      return;
    }
    setLoading(true);
    setSaveError('');
    setAiSummary('');
    try {
      const { data } = await api.get('/action-plans', { params: { client_id: clientId, year } });
      const record = data.plan || {};
      const rawAnnual = record.annual_plan_data || record.annual_plan || null;
      const strategic = record.diagnosis_data || record.strategic_diagnosis || null;
      const normalizedSource = hasPlanningContent(strategic)
        ? {
          data: strategic,
          updatedAt: record.updated_at || null,
          periodLabel: `Diagnóstico · ${year}`,
          signature: stageSourceSignature(strategic),
        }
        : null;
      setSourceDiagnosis(normalizedSource);

      let next = mergeAnnualPlanData(rawAnnual);
      let autoImported = false;
      const annualHasContent = hasPlanningContent(rawAnnual);
      if (!annualHasContent) {
        next.fields.company = selectedClientRecord?.name || '';
        next.fields.year_label = String(year);
        if (normalizedSource) {
          next = buildAnnualPlanFromDiagnosis(next, normalizedSource.data, {
            clientName: selectedClientRecord?.name || '',
            year,
            sourceUpdatedAt: normalizedSource.updatedAt,
          }, 'empty');
          autoImported = Boolean(next.stageImport);
        }
      }
      dirtyRef.current = autoImported;
      revisionRef.current = autoImported ? 1 : 0;
      setPlan(next);
    } catch (error) {
      setSaveError(error.response?.data?.error || 'Não foi possível abrir o Plano de Ação Anual.');
    } finally {
      setLoading(false);
    }
  }, [clientId, year, selectedClientRecord?.name]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const persistPlan = useCallback(async (payload = planRef.current) => {
    if (!clientId || !dirtyRef.current) return;
    const revisionAtStart = revisionRef.current;
    try {
      await api.put('/action-plans', {
        client_id: clientId,
        year,
        annual_plan_data: payload,
        annual_progress: annualPlanProgress(payload).percent,
      });
      if (revisionRef.current === revisionAtStart) dirtyRef.current = false;
      setSaveError('');
    } catch (error) {
      setSaveError(error.response?.data?.error || 'O salvamento automático falhou. As alterações continuam nesta tela.');
    }
  }, [clientId, year]);

  useEffect(() => {
    if (!dirtyRef.current || !clientId) return undefined;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistPlan(), 850);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [plan, clientId, persistPlan]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) persistPlan();
    };
    const handlePageHide = () => persistPlan();
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [persistPlan]);

  useEffect(() => () => { if (dirtyRef.current) persistPlan(); }, [clientId, year, persistPlan]);

  useEffect(() => {
    const nodes = ['00', ...annualPlanSections.map((section) => section.n)]
      .map((id) => document.getElementById(`annual-section-${id}`))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.dataset.sectionNumber || '00');
    }, { rootMargin: '-20% 0px -68% 0px', threshold: [0.05, 0.25, 0.5] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loading, clientId]);

  function markDirty() {
    dirtyRef.current = true;
    revisionRef.current += 1;
  }

  function updateField(name, value) {
    markDirty();
    setPlan((current) => {
      const detached = detachImportedField(current, name);
      return { ...detached, fields: { ...detached.fields, [name]: value } };
    });
  }

  function updateTableCell(tableId, rowIndex, columnIndex, value) {
    markDirty();
    setPlan((current) => {
      const detached = detachImportedTable(current, tableId);
      const rows = (detached.tables[tableId] || []).map((row) => [...row]);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex][columnIndex] = value;
      return { ...detached, tables: { ...detached.tables, [tableId]: rows } };
    });
  }

  function addTableRow(block) {
    markDirty();
    setPlan((current) => {
      const detached = detachImportedTable(current, block.id);
      return {
        ...detached,
        tables: { ...detached.tables, [block.id]: [...(detached.tables[block.id] || []), block.columns.map(() => '')] },
      };
    });
  }

  function removeTableRow(tableId, rowIndex) {
    markDirty();
    setPlan((current) => {
      const detached = detachImportedTable(current, tableId);
      return {
        ...detached,
        tables: { ...detached.tables, [tableId]: (detached.tables[tableId] || []).filter((_, index) => index !== rowIndex) },
      };
    });
  }

  function applyPreviousStage(mode) {
    if (!sourceDiagnosis?.data) return;
    setImportingStage(true);
    markDirty();
    setPlan((current) => buildAnnualPlanFromDiagnosis(current, sourceDiagnosis.data, {
      clientName: selectedClientRecord?.name || '',
      year,
      sourceUpdatedAt: sourceDiagnosis.updatedAt,
    }, mode));
    window.setTimeout(() => setImportingStage(false), 220);
  }

  async function fillWithAi() {
    if (!sourceDiagnosis?.data || aiFilling) return;
    setAiFilling(true);
    setAiSummary('');
    setSaveError('');
    try {
      const seed = buildAnnualPlanFromDiagnosis(planRef.current, sourceDiagnosis.data, {
        clientName: selectedClientRecord?.name || '',
        year,
        sourceUpdatedAt: sourceDiagnosis.updatedAt,
      }, 'empty');
      const targetSchema = planningAiTargets(aiSchema, seed);
      if (!targetSchema.fields.length && !targetSchema.tables.length) {
        setAiSummary('Todos os campos possíveis já estão preenchidos.');
        return;
      }
      const { data } = await api.post('/ai/planning/fill', {
        client_id: clientId,
        source_label: 'Diagnóstico Estratégico',
        source_period_label: sourceDiagnosis.periodLabel || `Diagnóstico · ${year}`,
        target_label: 'Plano de Ação Anual',
        target_period_label: String(year),
        source_data: sourceDiagnosis.data,
        target_data: seed,
        target_schema: targetSchema,
      });
      const next = applyPlanningAiResult(seed, data, {
        sourceType: 'strategic_diagnosis',
        sourceLabel: 'Diagnóstico Estratégico',
        sourcePeriodLabel: sourceDiagnosis.periodLabel || `Diagnóstico · ${year}`,
      });
      markDirty();
      setPlan(next);
      setAiSummary(data.summary || 'A IA preencheu os campos possíveis. Revise o conteúdo antes de finalizar.');
    } catch (error) {
      setSaveError(error.response?.data?.error || 'A IA não conseguiu preencher o Plano de Ação Anual agora.');
    } finally {
      setAiFilling(false);
    }
  }

  const filteredSections = annualPlanSections.filter((section) => `${section.n} ${section.title}`.toLowerCase().includes(navSearch.trim().toLowerCase()));
  const scrollToSection = (number) => document.getElementById(`annual-section-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PageHero icon={Target} eyebrow="Bússola estratégica" title="Plano de Ação Anual" description="Transforme o diagnóstico em direção, projetos, responsáveis, indicadores e ciclos de execução." />
        <div className="surface-card mx-auto max-w-xl p-7">
          <h2 className="section-title">Escolha um cliente</h2>
          <p className="mt-1 text-sm text-slate-500">Cada cliente possui um plano anual independente.</p>
          <select className="input-field mt-5" value={localClientId} onChange={(event) => setLocalClientId(event.target.value)}>
            <option value="">Selecione...</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="annual-plan-page space-y-6">
      <PageHero
        icon={Target}
        eyebrow={selectedClientRecord?.name || 'Metodologia Zebrazul'}
        title="Plano de Ação Anual"
        description="Direção estratégica, projetos, responsáveis, indicadores e capacidade de execução organizados para os 12 meses do negócio."
        actions={
          <>
            {user?.role !== 'client' && clients.length > 1 && (
              <select className="min-w-[210px] rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-medium text-white outline-none" value={String(clientId)} onChange={(event) => setLocalClientId(event.target.value)}>
                {clients.map((client) => <option className="text-slate-800" key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
              <CalendarDays size={16} />
              <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))} />
            </label>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value="12" label="meses de direção" />
          <HeroMetric value="4" label="ciclos trimestrais" />
          <HeroMetric value={`${progress.percent}%`} label="plano preenchido" />
        </div>
      </PageHero>

      {saveError && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{saveError}</span></div>}

      {!loading && (
        <PreviousStageImportBanner
          sourceLabel="Diagnóstico Estratégico"
          targetLabel="Plano de Ação Anual"
          sourceAvailable={Boolean(sourceDiagnosis?.data)}
          sourcePeriodLabel={sourceDiagnosis?.periodLabel || ''}
          imported={plan.stageImport?.sourceType === 'strategic_diagnosis'}
          updateAvailable={Boolean(
            plan.stageImport?.sourceType === 'strategic_diagnosis'
            && sourceDiagnosis?.signature
            && plan.stageImport?.sourceSignature !== sourceDiagnosis.signature
          )}
          importing={importingStage}
          aiFilling={aiFilling}
          aiTargetCount={aiTargetCount}
          aiSummary={aiSummary}
          onFillWithAi={fillWithAi}
          onFillEmpty={() => applyPreviousStage('empty')}
          onRefresh={() => applyPreviousStage('refresh')}
        />
      )}

      {loading ? (
        <div className="surface-card p-8 text-sm text-slate-500">Carregando plano anual...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="surface-card overflow-hidden">
              <div className="border-b border-slate-100 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="section-kicker">Progresso</p><h2 className="section-title">Plano anual</h2></div>
                  <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[#0969ff]">{progress.percent}%</span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0969ff] transition-all" style={{ width: `${progress.percent}%` }} /></div>
                <p className="mt-2 text-xs text-slate-400">{progress.completed} de {progress.total} campos preenchidos · salvamento automático</p>
                <div className="relative mt-4"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input-field py-2 pl-9 text-sm" value={navSearch} onChange={(event) => setNavSearch(event.target.value)} placeholder="Buscar seção" /></div>
              </div>
              <div className="max-h-[calc(100vh-290px)] space-y-1 overflow-y-auto p-3">
                <SectionNavButton number="00" title="Identificação do plano" active={activeSection === '00'} onClick={() => scrollToSection('00')} />
                {filteredSections.map((section) => <SectionNavButton key={section.n} number={section.n} title={section.title} active={activeSection === section.n} onClick={() => scrollToSection(section.n)} />)}
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            <section id="annual-section-00" data-section-number="00" className="surface-card scroll-mt-6 overflow-hidden">
              <SectionHeader number="00" title="Identificação do plano" description="Dados gerais do ciclo anual e responsáveis pela execução." />
              <div className="grid gap-4 p-6 md:grid-cols-2">
                {annualPlanCoverFields.map((field) => <PlanField key={field.name} field={field} value={plan.fields[field.name] || ''} onChange={(value) => updateField(field.name, value)} />)}
              </div>
            </section>

            {annualPlanSections.map((section) => (
              <section id={`annual-section-${section.n}`} data-section-number={section.n} key={section.n} className="surface-card scroll-mt-6 overflow-hidden">
                <SectionHeader number={section.n} title={section.title} description={section.desc} />
                <div className="space-y-5 p-6">
                  {section.blocks.map((block, index) => (
                    <PlanBlock key={`${section.n}-${block.type}-${index}`} block={block} plan={plan} updateField={updateField} updateTableCell={updateTableCell} addTableRow={addTableRow} removeTableRow={removeTableRow} />
                  ))}
                </div>
              </section>
            ))}
          </main>
        </div>
      )}
    </div>
  );
}

function HeroMetric({ value, label }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.065] px-4 py-3"><p className="text-xl font-bold text-white">{value}</p><p className="mt-0.5 text-xs text-white/50">{label}</p></div>;
}

function SectionHeader({ number, title, description }) {
  return <div className="flex items-start gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0969ff] text-sm font-bold text-white">{number}</span><div><h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></div>;
}

function SectionNavButton({ number, title, active, onClick }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-[#eef5ff] font-semibold text-[#0969ff]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${active ? 'bg-[#0969ff] text-white' : 'bg-slate-100 text-slate-500'}`}>{number}</span><span className="min-w-0 flex-1 truncate">{title}</span><ChevronRight size={14} className={active ? 'opacity-100' : 'opacity-0'} /></button>;
}

function PlanField({ field, value, onChange }) {
  return <label className={field.full ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span>{field.type === 'textarea' ? <textarea className="input-field min-h-28 resize-y" value={value} placeholder={field.placeholder || ''} onChange={(event) => onChange(event.target.value)} /> : <input className="input-field" type={field.type || 'text'} value={value} placeholder={field.placeholder || ''} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function PlanBlock({ block, plan, updateField, updateTableCell, addTableRow, removeTableRow }) {
  if (block.type === 'note') return <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">{block.text}</div>;
  if (block.type === 'grid') return <div className={`grid gap-4 ${block.cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>{block.fields.map((field) => <PlanField key={field.name} field={field} value={plan.fields[field.name] || ''} onChange={(value) => updateField(field.name, value)} />)}</div>;
  if (block.type === 'cards') return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: block.count }).map((_, index) => <FixedCard key={index} title={`${block.title} ${index + 1}`} fields={block.fields} prefix={`${block.prefix}_${index}`} plan={plan} updateField={updateField} />)}</div>;
  if (block.type === 'namedCards') return <div className="grid gap-4 lg:grid-cols-2">{block.names.map((name, index) => <FixedCard key={name} title={name} fields={block.fields} prefix={`${block.prefix}_${index}`} plan={plan} updateField={updateField} />)}</div>;
  if (block.type === 'months') return <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{MONTHS.map((month, index) => <div key={month} className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4"><div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0969ff] text-xs font-bold text-white">{String(index + 1).padStart(2, '0')}</span><h3 className="font-semibold text-slate-900">{month}</h3></div><div className="space-y-3"><PlanField field={{ label: 'Prioridade central', name: 'priority' }} value={plan.fields[`m_${index}_priority`] || ''} onChange={(value) => updateField(`m_${index}_priority`, value)} /><PlanField field={{ label: 'Ações principais', name: 'actions', type: 'textarea' }} value={plan.fields[`m_${index}_actions`] || ''} onChange={(value) => updateField(`m_${index}_actions`, value)} /><PlanField field={{ label: 'Marcos e datas', name: 'dates', type: 'textarea' }} value={plan.fields[`m_${index}_dates`] || ''} onChange={(value) => updateField(`m_${index}_dates`, value)} /><div className="grid gap-3 sm:grid-cols-2"><PlanField field={{ label: 'Responsável', name: 'owner' }} value={plan.fields[`m_${index}_owner`] || ''} onChange={(value) => updateField(`m_${index}_owner`, value)} /><PlanField field={{ label: 'Indicador', name: 'kpi' }} value={plan.fields[`m_${index}_kpi`] || ''} onChange={(value) => updateField(`m_${index}_kpi`, value)} /></div></div></div>)}</div>;
  if (block.type === 'table') return <PlanTable block={block} rows={plan.tables[block.id] || []} updateCell={updateTableCell} addRow={addTableRow} removeRow={removeTableRow} />;
  return null;
}

function FixedCard({ title, fields, prefix, plan, updateField }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4"><h3 className="mb-4 font-semibold text-slate-900">{title}</h3><div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => { const name = `${prefix}_${field.name}`; return <PlanField key={name} field={field} value={plan.fields[name] || ''} onChange={(value) => updateField(name, value)} />; })}</div></div>;
}

function PlanTable({ block, rows, updateCell, addRow, removeRow }) {
  return <div><div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-[900px] w-full border-collapse"><thead><tr className="bg-slate-50">{block.columns.map((column) => <th key={column} className="border-b border-slate-200 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column}</th>)}<th className="w-16 border-b border-slate-200 px-3 py-3" /></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="align-top">{block.columns.map((_, columnIndex) => <td key={columnIndex} className="border-b border-slate-100 p-2"><textarea className="min-h-16 w-full resize-y rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100" value={row[columnIndex] || ''} onChange={(event) => updateCell(block.id, rowIndex, columnIndex, event.target.value)} /></td>)}<td className="border-b border-slate-100 p-2 text-center"><button type="button" onClick={() => removeRow(block.id, rowIndex)} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div><button type="button" onClick={() => addRow(block)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-sm font-semibold text-[#0969ff] hover:bg-blue-50"><Plus size={15} /> Adicionar linha</button></div>;
}


function hasPlanningContent(data) {
  if (!data || typeof data !== 'object') return false;
  const fieldContent = Object.values(data.fields || {}).some((value) => String(value || '').trim());
  const tableContent = Object.values(data.tables || {}).some((rows) =>
    Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.some((value) => String(value || '').trim()))
  );
  return fieldContent || tableContent;
}
