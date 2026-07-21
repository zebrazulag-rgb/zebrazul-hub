import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from './PageHero.jsx';

export default function PlanningDocumentEditor({
  documentType,
  title,
  description,
  Icon,
  coverTitle,
  coverDescription,
  coverFields,
  sections,
  createData,
  mergeData,
  getProgress,
  periodKey,
  periodLabel,
  year,
  periodControls,
  heroMetrics = [],
  defaultValues,
}) {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('');
  const [documentData, setDocumentData] = useState(() => createData());
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [navSearch, setNavSearch] = useState('');
  const [activeSection, setActiveSection] = useState('00');
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const documentRef = useRef(documentData);
  const saveTimerRef = useRef(null);

  const clientId = user?.role === 'client'
    ? Number(user.client_id)
    : Number(localClientId || selectedClient?.id) || null;
  const selectedClientRecord = clients.find((client) => Number(client.id) === Number(clientId));
  const progress = useMemo(() => getProgress(documentData), [documentData, getProgress]);
  const sectionPrefix = documentType.replace(/[^a-z0-9]+/gi, '-');

  useEffect(() => { documentRef.current = documentData; }, [documentData]);

  useEffect(() => {
    api.get('/clients').then(({ data }) => {
      const next = data.clients || [];
      setClients(next);
      if (user?.role === 'client' && next[0]) setLocalClientId(String(next[0].id));
      else if (selectedClient?.id) setLocalClientId(String(selectedClient.id));
      else if (next.length === 1) setLocalClientId(String(next[0].id));
    }).catch(() => setClients([]));
  }, [user?.role, user?.client_id, selectedClient?.id]);

  const loadDocument = useCallback(async () => {
    if (!clientId || !periodKey) {
      setDocumentData(createData());
      return;
    }

    setLoading(true);
    setSaveError('');
    try {
      const { data } = await api.get('/planning-documents', {
        params: { client_id: clientId, type: documentType, period_key: periodKey },
      });
      const record = data.document || null;
      const next = mergeData(record?.data || null);
      if (!record && typeof defaultValues === 'function') {
        defaultValues(next, {
          clientName: selectedClientRecord?.name || '',
          year,
          periodKey,
          periodLabel,
        });
      }
      dirtyRef.current = false;
      revisionRef.current = 0;
      setDocumentData(next);
    } catch (error) {
      setSaveError(error.response?.data?.error || `Não foi possível abrir ${title}.`);
    } finally {
      setLoading(false);
    }
  }, [clientId, periodKey, documentType, createData, mergeData, defaultValues, selectedClientRecord?.name, year, periodLabel, title]);

  useEffect(() => { loadDocument(); }, [loadDocument]);

  const persistDocument = useCallback(async (payload = documentRef.current) => {
    if (!clientId || !periodKey || !dirtyRef.current) return;
    const revisionAtStart = revisionRef.current;
    try {
      await api.put('/planning-documents', {
        client_id: clientId,
        type: documentType,
        period_key: periodKey,
        year,
        title: periodLabel,
        data: payload,
        progress: getProgress(payload).percent,
      });
      if (revisionRef.current === revisionAtStart) dirtyRef.current = false;
      setSaveError('');
    } catch (error) {
      setSaveError(error.response?.data?.error || 'O salvamento automático falhou. As alterações continuam nesta tela.');
    }
  }, [clientId, periodKey, documentType, year, periodLabel, getProgress]);

  useEffect(() => {
    if (!dirtyRef.current || !clientId || !periodKey) return undefined;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistDocument(), 850);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [documentData, clientId, periodKey, persistDocument]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) persistDocument();
    };
    const handlePageHide = () => persistDocument();
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [persistDocument]);

  useEffect(() => () => {
    if (dirtyRef.current) persistDocument();
  }, [clientId, periodKey, persistDocument]);

  useEffect(() => {
    const nodes = ['00', ...sections.map((section) => section.n)]
      .map((id) => document.getElementById(`${sectionPrefix}-section-${id}`))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.dataset.sectionNumber || '00');
    }, { rootMargin: '-20% 0px -68% 0px', threshold: [0.05, 0.25, 0.5] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loading, clientId, periodKey, sectionPrefix, sections]);

  function markDirty() {
    dirtyRef.current = true;
    revisionRef.current += 1;
  }

  function updateField(name, value) {
    markDirty();
    setDocumentData((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value },
    }));
  }

  function updateTableCell(tableId, rowIndex, columnIndex, value) {
    markDirty();
    setDocumentData((current) => {
      const rows = (current.tables[tableId] || []).map((row) => [...row]);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex][columnIndex] = value;
      return { ...current, tables: { ...current.tables, [tableId]: rows } };
    });
  }

  function addTableRow(block) {
    markDirty();
    setDocumentData((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [block.id]: [...(current.tables[block.id] || []), block.columns.map(() => '')],
      },
    }));
  }

  function removeTableRow(tableId, rowIndex) {
    markDirty();
    setDocumentData((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: (current.tables[tableId] || []).filter((_, index) => index !== rowIndex),
      },
    }));
  }

  const filteredSections = sections.filter((section) => (
    `${section.n} ${section.title}`.toLowerCase().includes(navSearch.trim().toLowerCase())
  ));
  const scrollToSection = (number) => document.getElementById(`${sectionPrefix}-section-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PageHero icon={Icon} eyebrow="Bússola estratégica" title={title} description={description} />
        <div className="surface-card mx-auto max-w-xl p-7">
          <h2 className="section-title">Escolha um cliente</h2>
          <p className="mt-1 text-sm text-slate-500">Cada cliente possui documentos independentes e salvos no próprio histórico.</p>
          <select className="input-field mt-5" value={localClientId} onChange={(event) => setLocalClientId(event.target.value)}>
            <option value="">Selecione...</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="planning-document-page space-y-6">
      <PageHero
        icon={Icon}
        eyebrow={selectedClientRecord?.name || 'Metodologia Zebrazul'}
        title={title}
        description={description}
        actions={
          <>
            {user?.role !== 'client' && clients.length > 1 && (
              <select
                className="min-w-[210px] rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-medium text-white outline-none"
                value={String(clientId)}
                onChange={(event) => setLocalClientId(event.target.value)}
              >
                {clients.map((client) => <option className="text-slate-800" key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            )}
            {periodControls}
          </>
        }
      >
        <div className={`grid gap-3 ${heroMetrics.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {heroMetrics.map((metric) => <HeroMetric key={metric.label} value={metric.value} label={metric.label} />)}
          <HeroMetric value={`${progress.percent}%`} label="preenchido" />
        </div>
      </PageHero>

      {saveError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {loading ? (
        <div className="surface-card p-8 text-sm text-slate-500">Carregando {title.toLowerCase()}...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="surface-card overflow-hidden">
              <div className="border-b border-slate-100 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="section-kicker">Progresso</p><h2 className="section-title">{periodLabel}</h2></div>
                  <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-sm font-bold text-[var(--agency-primary)]">{progress.percent}%</span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[var(--agency-primary)] transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-400">{progress.completed} de {progress.total} campos preenchidos · salvamento automático</p>
                <div className="relative mt-4">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input-field py-2 pl-9 text-sm" value={navSearch} onChange={(event) => setNavSearch(event.target.value)} placeholder="Buscar seção" />
                </div>
              </div>
              <div className="max-h-[calc(100vh-290px)] space-y-1 overflow-y-auto p-3">
                <SectionNavButton number="00" title={coverTitle} active={activeSection === '00'} onClick={() => scrollToSection('00')} />
                {filteredSections.map((section) => (
                  <SectionNavButton key={section.n} number={section.n} title={section.title} active={activeSection === section.n} onClick={() => scrollToSection(section.n)} />
                ))}
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            <section id={`${sectionPrefix}-section-00`} data-section-number="00" className="surface-card scroll-mt-6 overflow-hidden">
              <SectionHeader number="00" title={coverTitle} description={coverDescription} />
              <div className="grid gap-4 p-6 md:grid-cols-2">
                {coverFields.map((field) => (
                  <DocumentField key={field.name} field={field} value={documentData.fields[field.name] || ''} onChange={(value) => updateField(field.name, value)} />
                ))}
              </div>
            </section>

            {sections.map((section) => (
              <section id={`${sectionPrefix}-section-${section.n}`} data-section-number={section.n} key={section.n} className="surface-card scroll-mt-6 overflow-hidden">
                <SectionHeader number={section.n} title={section.title} description={section.desc} />
                <div className="space-y-5 p-6">
                  {section.blocks.map((block, index) => (
                    <DocumentBlock
                      key={`${section.n}-${block.type}-${index}`}
                      block={block}
                      data={documentData}
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
        </div>
      )}
    </div>
  );
}

function HeroMetric({ value, label }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.065] px-4 py-3"><p className="text-xl font-bold text-white">{value}</p><p className="mt-0.5 text-xs text-white/50">{label}</p></div>;
}

function SectionHeader({ number, title, description }) {
  return <div className="flex items-start gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--agency-primary)] text-sm font-bold text-white">{number}</span><div><h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></div>;
}

function SectionNavButton({ number, title, active, onClick }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-[#eef5ff] font-semibold text-[var(--agency-primary)]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${active ? 'bg-[var(--agency-primary)] text-white' : 'bg-slate-100 text-slate-500'}`}>{number}</span><span className="min-w-0 flex-1 truncate">{title}</span><ChevronRight size={14} className={active ? 'opacity-100' : 'opacity-0'} /></button>;
}

function DocumentField({ field, value, onChange }) {
  const spanClass = field.full ? 'md:col-span-2' : '';
  return (
    <label className={spanClass}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span>
      {field.type === 'textarea' ? (
        <textarea className="input-field min-h-28 resize-y" value={value} placeholder={field.placeholder || ''} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className="input-field" type={field.type === 'input' ? 'text' : field.type || 'text'} value={value} placeholder={field.placeholder || ''} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function DocumentBlock({ block, data, updateField, updateTableCell, addTableRow, removeTableRow }) {
  if (block.type === 'note') {
    return <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-800">{block.text}</div>;
  }

  if (block.type === 'grid') {
    return <div className={`grid gap-4 ${block.cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>{block.fields.map((field) => <DocumentField key={field.name} field={field} value={data.fields[field.name] || ''} onChange={(value) => updateField(field.name, value)} />)}</div>;
  }

  if (block.type === 'cards') {
    return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: block.count }).map((_, index) => <DocumentCard key={index} title={`${block.title} ${index + 1}`} fields={block.fields} prefix={`${block.prefix}_${index}`} data={data} updateField={updateField} />)}</div>;
  }

  if (block.type === 'collectionCards') {
    return <div className={collectionGridClass(block.cols)}>{block.names.map((name, index) => <DocumentCard key={name} title={name} fields={block.fields} prefix={`${block.prefix}_${index}`} data={data} updateField={updateField} />)}</div>;
  }

  if (block.type === 'capacityCards') {
    return <div className={collectionGridClass(block.cols)}>{block.names.map((name, index) => <CapacityCard key={name} title={name} fields={block.fields} prefix={`${block.prefix}_${index}`} data={data} updateField={updateField} />)}</div>;
  }

  if (block.type === 'table') {
    return <DocumentTable block={block} rows={data.tables[block.id] || []} updateCell={updateTableCell} addRow={addTableRow} removeRow={removeTableRow} />;
  }

  return null;
}

function collectionGridClass(cols) {
  if (cols === 4) return 'grid gap-4 md:grid-cols-2 2xl:grid-cols-4';
  if (cols === 3) return 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3';
  return 'grid gap-4 lg:grid-cols-2';
}

function DocumentCard({ title, fields, prefix, data, updateField }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
      <h3 className="mb-4 font-semibold text-slate-900">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const name = `${prefix}_${field.name}`;
          return <DocumentField key={name} field={field} value={data.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
        })}
      </div>
    </div>
  );
}

function CapacityCard({ title, fields, prefix, data, updateField }) {
  const available = Number(data.fields[`${prefix}_available`]) || 0;
  const planned = Number(data.fields[`${prefix}_planned`]) || 0;
  const percent = available > 0 ? Math.min(100, Math.round((planned / available) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="text-xs font-semibold text-slate-500">{percent}% utilizado</span>
      </div>
      <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
        <div className="h-full rounded-full bg-[var(--agency-primary)] transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const name = `${prefix}_${field.name}`;
          return <DocumentField key={name} field={field} value={data.fields[name] || ''} onChange={(value) => updateField(name, value)} />;
        })}
      </div>
    </div>
  );
}

function DocumentTable({ block, rows, updateCell, addRow, removeRow }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[900px] w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              {block.columns.map((column) => <th key={column} className="border-b border-slate-200 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column}</th>)}
              <th className="w-16 border-b border-slate-200 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="align-top">
                {block.columns.map((_, columnIndex) => (
                  <td key={columnIndex} className="border-b border-slate-100 p-2">
                    <textarea className="min-h-16 w-full resize-y rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100" value={row[columnIndex] || ''} onChange={(event) => updateCell(block.id, rowIndex, columnIndex, event.target.value)} />
                  </td>
                ))}
                <td className="border-b border-slate-100 p-2 text-center">
                  <button type="button" onClick={() => removeRow(block.id, rowIndex)} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => addRow(block)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-sm font-semibold text-[var(--agency-primary)] hover:bg-blue-50"><Plus size={15} /> Adicionar linha</button>
    </div>
  );
}
