import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import { decorateCommercialStage, firstOpenCommercialStage } from '../utils/commercialStages.js';

const FIELD_DEFINITIONS = [
  { key: '', label: 'Ignorar coluna' },
  { key: 'company_name', label: 'Empresa / oportunidade', required: true },
  { key: 'contact_name', label: 'Nome do contato' },
  { key: 'phone', label: 'Telefone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'website', label: 'Site' },
  { key: 'segment', label: 'Nicho / segmento' },
  { key: 'position_title', label: 'Cargo' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado / UF' },
  { key: 'source', label: 'Origem' },
  { key: 'owner', label: 'Responsável' },
  { key: 'stage', label: 'Etapa do funil' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'estimated_value', label: 'Valor estimado' },
  { key: 'probability', label: 'Probabilidade (%)' },
  { key: 'next_action', label: 'Próxima ação' },
  { key: 'next_action_date', label: 'Data da próxima ação' },
  { key: 'notes', label: 'Observações' },
];

const HEADER_ALIASES = {
  company_name: ['empresa', 'nome da empresa', 'razao social', 'razão social', 'nome fantasia', 'oportunidade', 'empresa oportunidade', 'company', 'company name'],
  contact_name: ['nome', 'contato', 'nome do contato', 'pessoa de contato', 'responsavel contato', 'responsável contato', 'contact', 'contact name'],
  phone: ['telefone', 'telefones', 'fone', 'fones', 'celular', 'celulares', 'telefone comercial', 'phone'],
  whatsapp: ['whatsapp', 'whats', 'wpp', 'zap'],
  email: ['email', 'emails', 'e-mail', 'e-mails', 'e mail', 'email comercial', 'e-mail comercial'],
  cnpj: ['cnpj', 'documento', 'cpf cnpj', 'cpf/cnpj'],
  instagram: ['instagram', 'insta', '@instagram', 'perfil instagram'],
  website: ['site', 'website', 'url', 'pagina', 'página'],
  segment: ['segmento', 'ramo', 'setor', 'atividade', 'atividade principal', 'cnae', 'cnae principal', 'nicho'],
  position_title: ['cargo', 'funcao', 'função', 'position'],
  city: ['cidade', 'municipio', 'município', 'city'],
  state: ['estado', 'uf', 'state'],
  source: ['origem', 'fonte', 'source'],
  owner: ['responsavel', 'responsável', 'dono', 'owner', 'vendedor'],
  stage: ['etapa', 'fase', 'status', 'quadro', 'pipeline'],
  priority: ['prioridade', 'priority'],
  estimated_value: ['valor', 'valor estimado', 'valor oportunidade', 'ticket', 'estimated value'],
  probability: ['probabilidade', 'probability', 'chance'],
  next_action: ['proxima acao', 'próxima ação', 'proximo passo', 'próximo passo', 'next action'],
  next_action_date: ['data proxima acao', 'data próxima ação', 'data do proximo passo', 'data do próximo passo', 'next action date'],
  notes: ['observacoes', 'observações', 'obs', 'notas', 'notes', 'descricao', 'descrição'],
};

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const ALIAS_LOOKUP = Object.entries(HEADER_ALIASES).reduce((lookup, [key, aliases]) => {
  aliases.forEach((alias) => lookup.set(normalizeHeader(alias), key));
  return lookup;
}, new Map());

function detectDelimiter(text) {
  let line = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    if ((char === '\n' || char === '\r') && !quoted) break;
    line += char;
  }
  const count = (delimiter) => {
    let total = 0;
    let inside = false;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') inside = !inside;
      else if (!inside && line[index] === delimiter) total += 1;
    }
    return total;
  };
  return count(';') > count(',') ? ';' : ',';
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const matrix = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '"') {
      if (quoted && clean[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && clean[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => String(value).trim())) matrix.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => String(value).trim())) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [] };

  const headers = matrix[0].map((value, index) => String(value || '').trim() || `Coluna ${index + 1}`);
  const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return { headers, rows };
}

function autoMapping(headers) {
  const used = new Set();
  return Object.fromEntries(headers.map((header) => {
    const key = ALIAS_LOOKUP.get(normalizeHeader(header)) || '';
    if (key && used.has(key)) return [header, ''];
    if (key) used.add(key);
    return [header, key];
  }));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename, text) {
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function mapRows(rawRows, mapping) {
  return rawRows.map((raw, index) => {
    const row = { __row_number: index + 2 };
    Object.entries(mapping).forEach(([header, key]) => {
      if (key) row[key] = raw[header] ?? '';
    });
    return row;
  });
}

function formatImportDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function CommercialLeadImportModal({
  open,
  onClose,
  clientId,
  clientName,
  stages = [],
  teamUsers = [],
  niches = [],
  currentUser,
  onImported,
}) {
  const inputRef = useRef(null);
  const decoratedStages = useMemo(() => stages.map(decorateCommercialStage), [stages]);
  const firstStage = useMemo(() => firstOpenCommercialStage(stages), [stages]);
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [defaults, setDefaults] = useState({ default_stage_key: '', default_owner_user_id: '', default_source: 'Prospecção ativa', default_priority: 'medium', default_segment: '' });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState('skip');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [recentImports, setRecentImports] = useState([]);

  useEffect(() => {
    if (!open) return;
    const ownerId = teamUsers.some((member) => Number(member.id) === Number(currentUser?.id))
      ? currentUser.id
      : teamUsers[0]?.id || '';
    setDefaults((current) => ({
      ...current,
      default_stage_key: firstStage?.stage_key || stages[0]?.stage_key || '',
      default_owner_user_id: ownerId,
      default_segment: '',
    }));
    api.get('/commercial/imports', { params: { client_id: clientId } })
      .then(({ data }) => setRecentImports(data.imports || []))
      .catch(() => setRecentImports([]));
  }, [open, clientId, firstStage?.stage_key, stages, teamUsers, currentUser?.id]);

  useEffect(() => {
    if (open) return;
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError('');
    setDragging(false);
  }, [open]);

  if (!open) return null;

  async function readFile(file) {
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
      setError('Selecione um arquivo .csv.');
      return;
    }
    setError('');
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.headers.length || !parsed.rows.length) throw new Error('CSV vazio ou sem linhas de dados.');
      if (parsed.rows.length > 3000) throw new Error('O limite por importação é de 3.000 leads.');
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(autoMapping(parsed.headers));
      setPreview(null);
      setStep('mapping');
    } catch (err) {
      setError(err.message || 'Não foi possível ler o CSV.');
    }
  }

  function downloadTemplate() {
    const columns = ['Empresa', 'Nome', 'Telefone', 'WhatsApp', 'Email', 'CNPJ', 'Instagram', 'Site', 'Nicho', 'Cargo', 'Cidade', 'Estado', 'Origem', 'Responsável', 'Etapa', 'Prioridade', 'Valor', 'Próxima ação', 'Data da próxima ação', 'Observações'];
    const example = ['Alfa Contabilidade', 'Marina Silva', '(84) 3333-0000', '(84) 99999-0000', 'marina@alfacontabilidade.com.br', '12.345.678/0001-90', '@alfacontabilidade', 'https://alfacontabilidade.com.br', 'Contabilidade', 'Sócia', 'Natal', 'RN', 'Prospecção ativa', currentUser?.name || '', firstStage?.name || 'Novo lead', 'Média', '1500', 'Fazer primeiro contato', '25/08/2026', 'Lead importado para prospecção'];
    downloadText('modelo_importacao_leads_zebrahub.csv', `${columns.map(csvEscape).join(',')}\n${example.map(csvEscape).join(',')}\n`);
  }

  function mappedRows() {
    return mapRows(rawRows, mapping);
  }

  async function validateImport() {
    if (!Object.values(mapping).includes('company_name')) {
      setError('Mapeie uma coluna para “Empresa / oportunidade” antes de continuar.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/commercial/leads/import/preview', {
        client_id: clientId,
        rows: mappedRows(),
        defaults,
      });
      setPreview(data);
      setStep('preview');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível validar a importação.');
    } finally {
      setLoading(false);
    }
  }

  async function importLeads() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/commercial/leads/import', {
        client_id: clientId,
        filename: fileName,
        rows: mappedRows(),
        defaults,
        duplicate_mode: duplicateMode,
        mapping,
      });
      setResult(data);
      setStep('done');
      if (onImported) await onImported(data);
      api.get('/commercial/imports', { params: { client_id: clientId } })
        .then(({ data: historyData }) => setRecentImports(historyData.imports || []))
        .catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível importar os leads.');
    } finally {
      setLoading(false);
    }
  }

  function downloadErrors() {
    if (!preview?.rows?.length) return;
    const invalid = preview.rows.filter((row) => !row.valid || row.warnings?.length);
    const columns = ['Linha', 'Empresa', 'Contato', 'Telefone', 'Email', 'Erros', 'Avisos'];
    const lines = invalid.map((row) => [
      row.row_number,
      row.payload?.company_name,
      row.payload?.contact_name,
      row.payload?.phone || row.payload?.whatsapp,
      row.payload?.email,
      (row.errors || []).join(' | '),
      (row.warnings || []).join(' | '),
    ]);
    downloadText('erros_importacao_leads.csv', [columns, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n'));
  }

  const steps = [
    ['upload', 'Arquivo'],
    ['mapping', 'Mapeamento'],
    ['preview', 'Revisão'],
    ['done', 'Concluído'],
  ];
  const currentStepIndex = Math.max(0, steps.findIndex(([key]) => key === step));

  return (
    <ModalBackdrop onClose={() => !loading && onClose()} disabled={loading} className="z-[80]">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur lg:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Importação em massa</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Importar leads para {clientName || 'o Comercial'}</h2>
              <p className="mt-1 text-xs text-slate-500">O cliente é definido pelo workspace atual. Revise tudo antes de criar oportunidades.</p>
            </div>
            <button type="button" onClick={onClose} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"><X size={18} /></button>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {steps.map(([key, label], index) => (
              <div key={key} className={`rounded-xl px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] ${index <= currentStepIndex ? 'bg-blue-50 text-[#0969ff]' : 'bg-slate-50 text-slate-400'}`}>
                {index + 1}. {label}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-6 lg:p-7">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

          {step === 'upload' && (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => { if (event.key === 'Enter') inputRef.current?.click(); }}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}
                className={`grid min-h-[250px] cursor-pointer place-items-center rounded-[26px] border-2 border-dashed p-8 text-center transition ${dragging ? 'border-[#0969ff] bg-blue-50' : 'border-slate-200 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/40'}`}
              >
                <div>
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0969ff] shadow-sm"><UploadCloud size={26} /></span>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{dragging ? 'Solte o CSV aqui' : 'Arraste sua base de leads aqui'}</h3>
                  <p className="mt-2 text-sm text-slate-500">ou clique para selecionar um arquivo CSV de até 3.000 linhas.</p>
                  <p className="mt-1 text-xs text-slate-400">Aceita vírgula ou ponto e vírgula e preserva acentos em UTF-8.</p>
                </div>
              </div>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FileSpreadsheet size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900">Modelo pronto do ZebraHub</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Use o modelo para CNPJ, telefone, WhatsApp, responsável, etapa, origem, próxima ação e demais campos.</p>
                      <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"><Download size={14} /> Baixar modelo CSV</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Importações recentes</p>
                  <div className="mt-3 space-y-2">
                    {recentImports.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="truncate text-xs font-semibold text-slate-700">{item.filename || 'Importação CSV'}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{item.created_count} criados · {item.updated_count} atualizados · {formatImportDate(item.created_at)}</p>
                      </div>
                    ))}
                    {!recentImports.length && <p className="py-3 text-xs text-slate-400">Nenhuma importação registrada ainda.</p>}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'mapping' && (
            <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-bold text-blue-700">{fileName}</p>
                <p className="mt-1 text-xs text-blue-600/80">{rawRows.length} leads encontrados · confira como cada coluna será lida.</p>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Mapeamento inteligente de colunas</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {headers.map((header) => (
                      <div key={header} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{header}</p>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">Ex.: {rawRows[0]?.[header] || '—'}</p>
                        </div>
                        <ArrowRight size={15} className="hidden text-slate-300 sm:block" />
                        <select className="input-field" value={mapping[header] || ''} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}>
                          {FIELD_DEFINITIONS.map((field) => <option key={field.key || 'ignore'} value={field.key}>{field.label}{field.required ? ' *' : ''}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Padrões da importação</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Etapa padrão</label>
                        <select className="input-field" value={defaults.default_stage_key} onChange={(event) => setDefaults({ ...defaults, default_stage_key: event.target.value })}>
                          {decoratedStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Responsável padrão</label>
                        <select className="input-field" value={defaults.default_owner_user_id} onChange={(event) => setDefaults({ ...defaults, default_owner_user_id: event.target.value })}>
                          <option value="">Sem responsável padrão</option>
                          {teamUsers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Origem padrão</label>
                        <input className="input-field" value={defaults.default_source} onChange={(event) => setDefaults({ ...defaults, default_source: event.target.value })} placeholder="Prospecção ativa" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Nicho padrão</label>
                        <input className="input-field" list="commercial-import-niches" value={defaults.default_segment} onChange={(event) => setDefaults({ ...defaults, default_segment: event.target.value })} placeholder="Ex: Contabilidade" />
                        <datalist id="commercial-import-niches">{niches.map((niche) => <option key={niche.id || niche.name} value={niche.name} />)}</datalist>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Prioridade padrão</label>
                        <select className="input-field" value={defaults.default_priority} onChange={(event) => setDefaults({ ...defaults, default_priority: event.target.value })}>
                          <option value="high">Alta</option>
                          <option value="medium">Média</option>
                          <option value="low">Baixa</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                    <strong>Cliente fixo:</strong> todos os leads desta importação cairão em <strong>{clientName}</strong>, mesmo que o CSV tenha uma coluna de cliente.
                  </div>
                </aside>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button type="button" onClick={() => setStep('upload')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={16} /> Trocar arquivo</button>
                <button type="button" onClick={validateImport} disabled={loading} className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-60">{loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />} Validar e revisar</button>
              </div>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Linhas encontradas', preview.stats.total, 'bg-slate-50 text-slate-700'],
                  ['Prontas para importar', preview.stats.valid, 'bg-emerald-50 text-emerald-700'],
                  ['Possíveis duplicadas', preview.stats.duplicates, 'bg-amber-50 text-amber-700'],
                  ['Linhas com erro', preview.stats.errors, 'bg-rose-50 text-rose-700'],
                ].map(([label, value, tone]) => (
                  <div key={label} className={`rounded-2xl border border-slate-200 p-4 ${tone}`}>
                    <p className="text-2xl font-black">{value}</p>
                    <p className="mt-1 text-xs font-semibold">{label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">O que fazer com leads que já existem?</p>
                    <p className="mt-1 text-xs text-slate-500">O ZebraHub procura por CNPJ, e-mail, telefone/WhatsApp e empresa + contato.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['skip', 'Ignorar duplicadas'],
                      ['create', 'Criar mesmo assim'],
                      ['update', 'Atualizar existentes'],
                    ].map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setDuplicateMode(value)} className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${duplicateMode === value ? 'border-[#0969ff] bg-blue-50 text-[#0969ff]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Pré-visualização</p>
                  {(preview.stats.errors > 0 || preview.rows.some((row) => row.warnings?.length)) && <button type="button" onClick={downloadErrors} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"><Download size={14} /> Baixar erros</button>}
                </div>
                <div className="max-h-[430px] overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-400">
                      <tr><th className="px-4 py-3">Linha</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Situação</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 250).map((row) => (
                        <tr key={row.row_number} className={!row.valid ? 'bg-rose-50/50' : row.duplicate_id || row.duplicate_in_file ? 'bg-amber-50/40' : ''}>
                          <td className="px-4 py-3 font-semibold text-slate-400">{row.row_number}</td>
                          <td className="max-w-[260px] px-4 py-3"><p className="truncate font-semibold text-slate-800">{row.payload?.company_name || '—'}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{row.payload?.email || row.payload?.phone || row.payload?.whatsapp || ''}</p></td>
                          <td className="max-w-[190px] truncate px-4 py-3 text-slate-600">{row.payload?.contact_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.payload?.stage_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.payload?.owner_name || '—'}</td>
                          <td className="px-4 py-3">
                            {!row.valid ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700"><AlertTriangle size={12} /> {row.errors?.[0] || 'Erro'}</span>
                              : row.duplicate_id || row.duplicate_in_file ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700"><AlertTriangle size={12} /> Duplicado · {row.duplicate_reason}</span>
                                : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700"><CheckCircle2 size={12} /> Válido</span>}
                            {row.warnings?.length > 0 && <p className="mt-1 max-w-[260px] text-[10px] leading-4 text-amber-600">{row.warnings.join(' · ')}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 250 && <p className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">Mostrando as primeiras 250 linhas de {preview.rows.length}.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button type="button" onClick={() => setStep('mapping')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={16} /> Ajustar mapeamento</button>
                <button type="button" onClick={importLeads} disabled={loading || preview.stats.valid === 0} className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50">{loading ? <RefreshCw size={16} className="animate-spin" /> : <UploadCloud size={16} />} Importar {preview.stats.valid} linhas válidas</button>
              </div>
            </>
          )}

          {step === 'done' && result && (
            <div className="py-5 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={30} /></span>
              <h3 className="mt-5 text-2xl font-black text-slate-950">Importação concluída</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Os leads já estão no pipeline de <strong>{clientName}</strong> e ficam disponíveis para toda a equipe comercial com acesso ao cliente.</p>
              <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-4">
                {[
                  ['Criados', result.stats.created, 'text-emerald-700 bg-emerald-50'],
                  ['Atualizados', result.stats.updated, 'text-blue-700 bg-blue-50'],
                  ['Ignorados', result.stats.skipped, 'text-amber-700 bg-amber-50'],
                  ['Erros', result.stats.errors, 'text-rose-700 bg-rose-50'],
                ].map(([label, value, tone]) => <div key={label} className={`rounded-2xl p-4 ${tone}`}><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs font-semibold">{label}</p></div>)}
              </div>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => { setStep('upload'); setFileName(''); setHeaders([]); setRawRows([]); setPreview(null); setResult(null); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Importar outra lista</button>
                <button type="button" onClick={onClose} className="btn-primary inline-flex items-center gap-2 text-sm"><CheckCircle2 size={16} /> Voltar ao Comercial</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
