import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleDot,
  FileText,
  Plus,
  Printer,
  Search,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import {
  createStrategicDiagnosisData,
  mergeStrategicDiagnosisData,
  strategicDiagnosisCoverFields,
  strategicDiagnosisProgress,
  strategicDiagnosisSections,
} from '../strategicDiagnosisConfig.js';

const JOURNEY_STAGES = ['Descoberta', 'Consideração', 'Contato', 'Decisão', 'Experiência', 'Relacionamento'];
const CYCLE_FRONTS = ['Fundamento', 'Ativação', 'Conversão ou Relacionamento'];

export default function StrategicDiagnosis() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [diagnosis, setDiagnosis] = useState(() => createStrategicDiagnosisData());
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [navSearch, setNavSearch] = useState('');
  const [activeSection, setActiveSection] = useState('00');
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const diagnosisRef = useRef(diagnosis);
  const saveTimerRef = useRef(null);
  const navigationRef = useRef(null);
  const [navigationHeight, setNavigationHeight] = useState(240);

  const clientId = user?.role === 'client'
    ? Number(user.client_id)
    : Number(localClientId || selectedClient?.id) || null;

  const selectedClientRecord = clients.find((client) => Number(client.id) === Number(clientId));
  const progress = useMemo(() => strategicDiagnosisProgress(diagnosis), [diagnosis]);

  useEffect(() => {
    diagnosisRef.current = diagnosis;
  }, [diagnosis]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return undefined;

    const updateNavigationHeight = () => {
      setNavigationHeight(Math.ceil(navigation.getBoundingClientRect().height));
    };

    updateNavigationHeight();
    const observer = new ResizeObserver(updateNavigationHeight);
    observer.observe(navigation);
    window.addEventListener('resize', updateNavigationHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateNavigationHeight);
    };
  }, [loading, clientId]);

  useEffect(() => {
    api.get('/clients').then(({ data }) => {
      const next = data.clients || [];
      setClients(next);
      if (user?.role === 'client' && next[0]) setLocalClientId(String(next[0].id));
      else if (selectedClient?.id) setLocalClientId(String(selectedClient.id));
      else if (next.length === 1) setLocalClientId(String(next[0].id));
    }).catch(() => setClients([]));
  }, [user?.role, user?.client_id, selectedClient?.id]);

  const loadDiagnosis = useCallback(async () => {
    if (!clientId) {
      setDiagnosis(createStrategicDiagnosisData());
      return;
    }

    setLoading(true);
    setSaveError('');
    try {
      const { data } = await api.get('/action-plans', { params: { client_id: clientId, year } });
      const plan = data.plan || {};
      const rawDiagnosis = plan.diagnosis_data || plan.strategic_diagnosis || null;
      const next = mergeStrategicDiagnosisData(rawDiagnosis);

      if (!rawDiagnosis) {
        next.fields.company_name = selectedClientRecord?.name || '';
        next.fields.goal_what = plan.what_we_want || '';
        next.fields.goal_why = plan.why_we_want || '';
        next.fields.goal_how = plan.how_we_will_do || '';
        next.fields.strategic_conclusion = plan.diagnosis || '';
        next.fields.closing_message = plan.manifesto || '';
      }

      dirtyRef.current = false;
      revisionRef.current = 0;
      setDiagnosis(next);
    } catch (error) {
      setSaveError(error.response?.data?.error || 'Não foi possível abrir o Diagnóstico Estratégico.');
    } finally {
      setLoading(false);
    }
  }, [clientId, year, selectedClientRecord?.name]);

  useEffect(() => {
    loadDiagnosis();
  }, [loadDiagnosis]);

  const persistDiagnosis = useCallback(async (payload = diagnosisRef.current) => {
    if (!clientId || !dirtyRef.current) return;
    const revisionAtStart = revisionRef.current;
    const payloadProgress = strategicDiagnosisProgress(payload).percent;
    try {
      await api.put('/action-plans', {
        client_id: clientId,
        year,
        diagnosis_data: payload,
        progress: payloadProgress,
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
    saveTimerRef.current = window.setTimeout(() => persistDiagnosis(), 850);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [diagnosis, clientId, persistDiagnosis]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) persistDiagnosis();
    };
    const handlePageHide = () => persistDiagnosis();
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [persistDiagnosis]);

  useEffect(() => () => {
    if (dirtyRef.current) persistDiagnosis();
  }, [clientId, year, persistDiagnosis]);

  useEffect(() => {
    const nodes = ['00', ...strategicDiagnosisSections.map((section) => section.n)]
      .map((id) => document.getElementById(`strategic-section-${id}`))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.dataset.sectionNumber || '00');
    }, { rootMargin: '-20% 0px -68% 0px', threshold: [0.05, 0.25, 0.5] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loading, clientId]);

  function updateField(name, value) {
    dirtyRef.current = true;
    revisionRef.current += 1;
    setDiagnosis((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value },
    }));
  }

  function updateTableCell(tableId, rowIndex, columnIndex, value) {
    dirtyRef.current = true;
    revisionRef.current += 1;
    setDiagnosis((current) => {
      const rows = (current.tables[tableId] || []).map((row) => [...row]);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex][columnIndex] = value;
      return { ...current, tables: { ...current.tables, [tableId]: rows } };
    });
  }

  function addTableRow(block) {
    dirtyRef.current = true;
    revisionRef.current += 1;
    setDiagnosis((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [block.id]: [
          ...(current.tables[block.id] || []),
          block.columns.map(() => ''),
        ],
      },
    }));
  }

  function removeTableRow(tableId, rowIndex) {
    dirtyRef.current = true;
    revisionRef.current += 1;
    setDiagnosis((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: (current.tables[tableId] || []).filter((_, index) => index !== rowIndex),
      },
    }));
  }

  function scrollToSection(sectionNumber) {
    document.getElementById(`strategic-section-${sectionNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handlePrint() {
    if (dirtyRef.current) await persistDiagnosis();

    const previousTitle = document.title;
    const companyName = diagnosisRef.current.fields.company_name || selectedClientRecord?.name || 'Cliente';
    document.title = `Diagnóstico Estratégico - ${companyName} - ${year}`;

    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);
    window.setTimeout(() => window.print(), 80);
    window.setTimeout(restoreTitle, 5000);
  }

  const filteredSections = strategicDiagnosisSections.filter((section) => (
    `${section.n} ${section.title}`.toLowerCase().includes(navSearch.trim().toLowerCase())
  ));

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PageHero
          icon={BrainCircuit}
          eyebrow="Leitura estratégica"
          title="Diagnóstico Estratégico"
          description="Transforme DME, imersão, dados e evidências em uma leitura priorizada e orientada à ação."
        />
        <div className="surface-card mx-auto max-w-xl p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="icon-tile bg-[#eef5ff] text-[#0969ff]"><BrainCircuit size={19} /></span>
            <div>
              <h2 className="section-title">Escolha um cliente</h2>
              <p className="mt-0.5 text-sm text-slate-500">Cada cliente possui um diagnóstico independente por ano.</p>
            </div>
          </div>
          <select className="input-field" value={localClientId} onChange={(event) => setLocalClientId(event.target.value)}>
            <option value="">Selecione...</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div
      className="strategic-diagnosis-page space-y-6"
      style={{ '--strategic-navigation-offset': `${navigationHeight + 28}px` }}
    >
      <PageHero
        icon={BrainCircuit}
        eyebrow={selectedClientRecord?.name || 'Metodologia Zebrazul'}
        title="Diagnóstico Estratégico"
        description="Uma leitura completa do negócio para conectar evidências, problema central, prioridades e direção para os próximos 90 dias."
        actions={
          <>
            {user?.role !== 'client' && clients.length > 1 && (
              <select
                className="no-print min-w-[210px] rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-medium text-white outline-none"
                value={String(clientId)}
                onChange={(event) => setLocalClientId(event.target.value)}
              >
                {clients.map((client) => <option className="text-slate-800" key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            )}
            <label className="no-print flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
              <CalendarDays size={16} />
              <input
                type="number"
                min="2020"
                max="2100"
                className="w-20 bg-transparent font-semibold text-white outline-none"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value="36" label="seções estratégicas" icon={FileText} />
          <HeroMetric value="8" label="pilares do DME" icon={BarChart3} />
          <HeroMetric value="90" label="dias de direção inicial" icon={Target} />
        </div>
      </PageHero>

      {saveError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {loading ? (
        <div className="surface-card p-8 text-sm text-slate-500">Carregando diagnóstico...</div>
      ) : (
        <>
          <div
            ref={navigationRef}
            className="strategic-navigation no-print sticky top-4 z-40 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_16px_46px_rgba(15,23,42,0.10)] backdrop-blur-xl"
          >
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="section-kicker">Progresso do diagnóstico</p>
                    <h2 className="section-title">{progress.completed} de {progress.total} campos preenchidos</h2>
                  </div>
                  <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[#0969ff]">{progress.percent}%</span>
                </div>
                <div className="mt-3 h-2.5 max-w-xl overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#0969ff] transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-400">Salvamento automático ativo</p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input-field py-2.5 pl-9 text-sm"
                    value={navSearch}
                    onChange={(event) => setNavSearch(event.target.value)}
                    placeholder="Buscar seção"
                  />
                </div>
                <button type="button" onClick={handlePrint} className="btn-secondary inline-flex items-center justify-center gap-2 whitespace-nowrap">
                  <Printer size={16} /> Imprimir relatório completo
                </button>
              </div>
            </div>

            <div className="overflow-x-auto p-3">
              <div className="grid auto-cols-[minmax(190px,240px)] grid-flow-col gap-2">
                <SectionNavButton
                  number="00"
                  title="Identificação do projeto"
                  active={activeSection === '00'}
                  onClick={() => scrollToSection('00')}
                />
                {filteredSections.map((section) => (
                  <SectionNavButton
                    key={section.n}
                    number={section.n}
                    title={section.title}
                    active={activeSection === section.n}
                    onClick={() => scrollToSection(section.n)}
                  />
                ))}
              </div>
            </div>
          </div>

          <main className="min-w-0 space-y-6">
            <section id="strategic-section-00" data-section-number="00" className="surface-card strategic-report-section overflow-hidden">
              <SectionHeader number="00" title="Identificação do projeto" description="Dados que contextualizam o documento e identificam a análise." />
              <div className="grid gap-4 p-6 md:grid-cols-2">
                {strategicDiagnosisCoverFields.map((field) => (
                  <DiagnosisField
                    key={field.name}
                    {...field}
                    value={diagnosis.fields[field.name] || ''}
                    onChange={(value) => updateField(field.name, value)}
                  />
                ))}
              </div>
            </section>

            {strategicDiagnosisSections.map((section) => (
              <section
                id={`strategic-section-${section.n}`}
                data-section-number={section.n}
                key={section.n}
                className="surface-card strategic-report-section overflow-hidden"
              >
                <SectionHeader number={section.n} title={section.title} description={section.desc} />
                <div className="space-y-5 p-6">
                  {section.blocks.map((block, index) => (
                    <DiagnosisBlock
                      key={`${section.n}-${block.type}-${index}`}
                      block={block}
                      diagnosis={diagnosis}
                      updateField={updateField}
                      updateTableCell={updateTableCell}
                      addTableRow={addTableRow}
                      removeTableRow={removeTableRow}
                    />
                  ))}
                </div>
              </section>
            ))}
          </main>
        </>
      )}

    </div>
  );
}

function HeroMetric({ value, label, icon: Icon }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.08] text-[#78adff]"><Icon size={17} /></span>
      <div><strong className="block text-lg leading-none text-white">{value}</strong><span className="text-xs text-white/45">{label}</span></div>
    </div>
  );
}

function SectionNavButton({ number, title, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[58px] w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${active ? 'border-[#0969ff]/20 bg-[#eef5ff] text-[#0969ff]' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800'}`}
    >
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${active ? 'bg-[#0969ff] text-white' : 'bg-slate-100 text-slate-500'}`}>{number}</span>
      <span className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-5">{title}</span>
      {active && <ChevronRight size={14} className="mt-1 shrink-0" />}
    </button>
  );
}

function SectionHeader({ number, title, description }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef5ff] text-sm font-bold text-[#0969ff]">{number}</span>
      <div className="min-w-0">
        <h2 className="section-title break-words">{title}</h2>
        <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function DiagnosisBlock(props) {
  const { block, diagnosis, updateField, updateTableCell, addTableRow, removeTableRow } = props;

  if (block.type === 'textarea') {
    return (
      <DiagnosisField
        label={block.label}
        name={block.name}
        type="textarea"
        placeholder={block.placeholder}
        help={block.help}
        value={diagnosis.fields[block.name] || ''}
        onChange={(value) => updateField(block.name, value)}
      />
    );
  }

  if (block.type === 'grid') {
    return (
      <div className={`grid gap-4 ${block.cols === 3 ? 'lg:grid-cols-3' : block.cols === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'}`}>
        {block.fields.map((field) => (
          <DiagnosisField
            key={field[1]}
            label={field[0]}
            name={field[1]}
            placeholder={field[2] || ''}
            value={diagnosis.fields[field[1]] || ''}
            onChange={(value) => updateField(field[1], value)}
          />
        ))}
      </div>
    );
  }

  if (block.type === 'gridTextareas') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {block.items.map((item) => (
          <DiagnosisField
            key={item[1]}
            label={item[0]}
            name={item[1]}
            type="textarea"
            value={diagnosis.fields[item[1]] || ''}
            onChange={(value) => updateField(item[1], value)}
          />
        ))}
      </div>
    );
  }

  if (block.type === 'table') {
    return (
      <DiagnosisTable
        block={block}
        rows={diagnosis.tables[block.id] || []}
        onChange={updateTableCell}
        onAdd={() => addTableRow(block)}
        onRemove={(rowIndex) => removeTableRow(block.id, rowIndex)}
      />
    );
  }

  if (block.type === 'pillarGroup') {
    return (
      <div className="space-y-4">
        {block.pillars.map((pillar, index) => (
          <SubCard key={pillar} title={`${index + 1}. ${pillar}`} icon={CircleDot}>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ['Situação atual', 'situation'], ['Evidências', 'evidence'], ['Forças', 'strengths'],
                ['Fragilidades', 'weaknesses'], ['Consequências', 'consequences'], ['Recomendação', 'recommendation'],
              ].map(([label, suffix]) => {
                const name = `pillar_${index}_${suffix}`;
                return <DiagnosisField key={name} label={label} name={name} type="textarea" value={diagnosis.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
              })}
            </div>
            <div className="mt-4 max-w-sm">
              <DiagnosisSelect
                label="Nível de prioridade"
                value={diagnosis.fields[`pillar_${index}_priority`] || ''}
                onChange={(value) => updateField(`pillar_${index}_priority`, value)}
                options={['Baixa', 'Média', 'Alta', 'Crítica']}
              />
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'causeCards') {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: block.count }).map((_, index) => (
          <SubCard key={index} title={`Causa ${index + 1}`} icon={Sparkles}>
            <div className="space-y-4">
              {[
                ['Título', 'title', 'input'], ['Descrição', 'description', 'textarea'],
                ['Evidência', 'evidence', 'textarea'], ['Impacto', 'impact', 'textarea'],
              ].map(([label, suffix, type]) => {
                const name = `cause_${index}_${suffix}`;
                return <DiagnosisField key={name} label={label} name={name} type={type} value={diagnosis.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
              })}
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'tripleCards') {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {block.items.map((item) => (
          <SubCard key={item[1]} title={item[0]} icon={Sparkles}>
            <div className="space-y-4">
              <DiagnosisField label={item[2]} name={`${item[1]}_description`} type="textarea" value={diagnosis.fields[`${item[1]}_description`] || ''} onChange={(value) => updateField(`${item[1]}_description`, value)} />
              <DiagnosisField label={item[3]} name={`${item[1]}_action`} type="textarea" value={diagnosis.fields[`${item[1]}_action`] || ''} onChange={(value) => updateField(`${item[1]}_action`, value)} />
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'journey') {
    return (
      <div className="space-y-4">
        {JOURNEY_STAGES.map((stage, index) => (
          <SubCard key={stage} title={`${index + 1}. ${stage}`} icon={ChevronRight}>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                ['Situação atual', 'current'], ['Gargalos', 'gaps'], ['Oportunidades', 'opportunities'],
              ].map(([label, suffix]) => {
                const name = `journey_${index}_${suffix}`;
                return <DiagnosisField key={name} label={label} name={name} type="textarea" value={diagnosis.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
              })}
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'strategicPillars') {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: block.count }).map((_, index) => (
          <SubCard key={index} title={`Pilar estratégico ${index + 1}`} icon={Target}>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ['Nome', 'name', 'input'], ['Objetivo', 'goal', 'textarea'],
                ['Problema que resolve', 'problem', 'textarea'], ['Movimentos principais', 'moves', 'textarea'],
              ].map(([label, suffix, type]) => {
                const name = `strategy_pillar_${index}_${suffix}`;
                return <DiagnosisField key={name} label={label} name={name} type={type} value={diagnosis.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
              })}
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'priorityCards') {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: block.count }).map((_, index) => (
          <SubCard key={index} title={`Prioridade ${index + 1}`} icon={Target}>
            <div className="space-y-4">
              {[
                ['Nome', 'name', 'input'], ['Por que é prioritária', 'reason', 'textarea'],
                ['Resultado esperado', 'result', 'textarea'], ['Responsáveis e dependências', 'owners', 'textarea'],
              ].map(([label, suffix, type]) => {
                const name = `priority_${index}_${suffix}`;
                return <DiagnosisField key={name} label={label} name={name} type={type} value={diagnosis.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
              })}
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  if (block.type === 'cycleFronts') {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {CYCLE_FRONTS.map((front, index) => (
          <SubCard key={front} title={`Frente ${index + 1} — ${front}`} icon={Target}>
            <div className="space-y-4">
              <DiagnosisField label="Objetivo" name={`cycle_front_${index}_goal`} type="textarea" value={diagnosis.fields[`cycle_front_${index}_goal`] || ''} onChange={(value) => updateField(`cycle_front_${index}_goal`, value)} />
              <DiagnosisField label="Projetos possíveis" name={`cycle_front_${index}_projects`} type="textarea" value={diagnosis.fields[`cycle_front_${index}_projects`] || ''} onChange={(value) => updateField(`cycle_front_${index}_projects`, value)} />
            </div>
          </SubCard>
        ))}
      </div>
    );
  }

  return null;
}

function DiagnosisField({ label, name, value, onChange, type = 'input', placeholder = '', help, full = false }) {
  const printableValue = type === 'date' && value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : value;

  return (
    <label className={`block min-w-0 ${full ? 'md:col-span-2' : ''}`}>
      <span className="mb-1.5 block whitespace-normal break-words text-xs font-semibold text-slate-700">{label}</span>
      {type === 'textarea' ? (
        <AutoGrowTextarea
          name={name}
          className="diagnosis-screen-control input-field min-h-[120px] resize-none overflow-hidden bg-slate-50/55 leading-6"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          minHeight={120}
        />
      ) : type === 'date' ? (
        <span className="diagnosis-screen-control flex w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#0969ff] focus-within:ring-4 focus-within:ring-[#0969ff]/10">
          <input
            name={name}
            type="date"
            className="block w-full min-w-0 border-0 bg-transparent p-0 text-sm outline-none"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      ) : (
        <AutoGrowTextarea
          name={name}
          rows={1}
          className="diagnosis-screen-control input-field min-h-[44px] resize-none overflow-hidden bg-slate-50/55 leading-5"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          minHeight={44}
        />
      )}
      <span className="print-field-value hidden min-h-[34px] whitespace-pre-wrap break-words rounded-lg border border-slate-200 px-3 py-2 text-sm leading-5 text-slate-800">
        {printableValue || '—'}
      </span>
      {help && <span className="mt-1.5 block whitespace-normal break-words text-xs leading-5 text-slate-400">{help}</span>}
    </label>
  );
}

function AutoGrowTextarea({ value, minHeight = 44, className = '', ...props }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.max(minHeight, element.scrollHeight)}px`;
  }, [value, minHeight]);

  return <textarea ref={textareaRef} value={value} className={className} {...props} />;
}

function DiagnosisSelect({ label, value, onChange, options }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block whitespace-normal break-words text-xs font-semibold text-slate-700">{label}</span>
      <select className="diagnosis-screen-control input-field bg-slate-50/55" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span className="print-field-value hidden min-h-[34px] whitespace-pre-wrap break-words rounded-lg border border-slate-200 px-3 py-2 text-sm leading-5 text-slate-800">
        {value || '—'}
      </span>
    </label>
  );
}

function SubCard({ title, icon: Icon, children }) {
  return (
    <div className="diagnosis-subcard rounded-2xl border border-slate-200/75 bg-slate-50/55 p-4 lg:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#0969ff] shadow-sm"><Icon size={15} /></span>
        <h3 className="min-w-0 whitespace-normal break-words text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DiagnosisTable({ block, rows, onChange, onAdd, onRemove }) {
  return (
    <div>
      <div className="diagnosis-table-wrapper overflow-x-auto rounded-2xl border border-slate-200/80">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              {block.columns.map((column) => <th key={column} className="border-b border-slate-200 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{column}</th>)}
              {!block.fixedRows && <th className="no-print w-14 border-b border-slate-200 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${block.id}-${rowIndex}`} className="border-b border-slate-100 last:border-b-0">
                {block.columns.map((_, columnIndex) => {
                  const isFixedLabel = Boolean(block.fixedRows && columnIndex === 0 && block.fixedRows[rowIndex]?.[0]);
                  return (
                    <td key={columnIndex} className="px-3 py-2 align-top">
                      {isFixedLabel ? (
                        <span className="block min-w-[180px] py-2 font-medium text-slate-700">{row[columnIndex]}</span>
                      ) : (
                        <>
                          <AutoGrowTextarea
                            className="diagnosis-screen-control min-h-[54px] w-full min-w-[120px] resize-none overflow-hidden rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm leading-5 text-slate-700 outline-none transition hover:bg-slate-50 focus:border-[#0969ff]/30 focus:bg-white focus:ring-4 focus:ring-[#0969ff]/10"
                            value={row[columnIndex] || ''}
                            minHeight={54}
                            onChange={(event) => onChange(block.id, rowIndex, columnIndex, event.target.value)}
                          />
                          <span className="print-field-value hidden whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{row[columnIndex] || '—'}</span>
                        </>
                      )}
                    </td>
                  );
                })}
                {!block.fixedRows && (
                  <td className="no-print px-3 py-2 align-middle">
                    <button type="button" onClick={() => onRemove(rowIndex)} className="no-print flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label="Excluir linha">
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!block.fixedRows && (
        <button type="button" onClick={onAdd} className="no-print mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-[#0969ff]/30 bg-[#eef5ff]/60 px-3 py-2 text-sm font-semibold text-[#0969ff] transition hover:bg-[#eef5ff]">
          <Plus size={15} /> Adicionar linha
        </button>
      )}
    </div>
  );
}
