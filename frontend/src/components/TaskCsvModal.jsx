import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeader(value) {
  return stripAccents(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const HEADER_MAP = {
  id_da_tarefa: 'csv_id',
  id_tarefa: 'csv_id',
  id: 'csv_id',
  id_da_tarefa_pai: 'parent_csv_id',
  id_tarefa_pai: 'parent_csv_id',
  tarefa_pai: 'parent_csv_id',
  tipo_de_tarefa: 'task_type',
  tipo_tarefa: 'task_type',
  cliente: 'client',
  projeto: 'project',
  frente: 'front',
  categoria: 'front',
  titulo: 'title',
  descricao: 'description',
  ideia_do_conteudo: 'content_idea',
  ideia_de_conteudo: 'content_idea',
  tipo_de_conteudo: 'content_type',
  data_de_postagem: 'post_date',
  legenda: 'caption',
  roteiro_briefing: 'script_briefing',
  roteiro: 'script_briefing',
  link_do_video: 'video_link',
  responsavel: 'responsible',
  prioridade: 'priority',
  status: 'status',
  prazo: 'due_date',
  meta: 'goal',
};

function parseCsvMatrix(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((item) => String(item).trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((item) => String(item).trim() !== '')) rows.push(row);
  return rows;
}

function parseCsv(text) {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) throw new Error('O CSV precisa ter cabeçalho e pelo menos uma tarefa.');
  const headers = matrix[0].map((header) => HEADER_MAP[normalizeHeader(header)] || normalizeHeader(header));
  if (!headers.includes('title')) throw new Error('A coluna “Título” não foi encontrada.');
  return matrix.slice(1).map((values) => {
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
    return row;
  });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export async function downloadTaskCsvModel() {
  const response = await api.get('/tasks/csv/model', { responseType: 'blob' });
  saveBlob(response.data, 'modelo_importacao_tarefas_zebrahub.csv');
}

export default function TaskCsvModal({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateStrategy, setDuplicateStrategy] = useState('ignore');
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const invalidRows = useMemo(() => preview?.rows?.filter((row) => row.errors?.length) || [], [preview]);
  const validRows = useMemo(() => preview?.rows?.filter((row) => !row.errors?.length) || [], [preview]);

  async function handleFile(file) {
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
      setError('Arraste ou selecione um arquivo CSV válido.');
      return;
    }
    setError('');
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      setRawRows(rows);
      setLoading(true);
      const { data } = await api.post('/tasks/csv/preview', { rows });
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Não foi possível ler o CSV.');
    } finally {
      setLoading(false);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!loading) setDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (loading) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  async function importRows() {
    if (!rawRows.length) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/tasks/csv/import', {
        rows: rawRows,
        duplicate_strategy: duplicateStrategy,
        import_valid_only: true,
      });
      setResult(data);
      if (onImported) await onImported(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível importar as tarefas.');
    } finally {
      setLoading(false);
    }
  }

  function downloadErrors() {
    const rows = result?.errors?.length ? result.errors : invalidRows.map((row) => ({
      line: row.line,
      title: row.title,
      errors: row.errors,
    }));
    if (!rows.length) return;
    const content = [
      ['Linha', 'Título', 'Erro'],
      ...rows.map((row) => [row.line, row.title || '', (row.errors || []).join(' | ')]),
    ].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    saveBlob(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }), 'erros_importacao_tarefas.csv');
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={loading} className="z-[80]">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5 rounded-t-3xl">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0969ff]"><FileSpreadsheet size={17} /> Importação em massa</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Importar tarefas e subtarefas por CSV</h2>
            <p className="mt-1 text-sm text-slate-500">O ZebraHub valida clientes, responsáveis, hierarquia e duplicidades antes de criar qualquer tarefa.</p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {!preview && !result && (
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={handleDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
                  dragActive
                    ? 'scale-[1.01] border-[#0969ff] bg-blue-50 ring-4 ring-blue-100'
                    : 'border-slate-300 bg-slate-50 hover:border-[#0969ff]/50 hover:bg-blue-50/40'
                }`}
              >
                <Upload size={26} className={dragActive ? 'text-[#0969ff]' : 'text-[#0969ff]'} />
                <span className="mt-3 font-semibold text-slate-800">{dragActive ? 'Solte o CSV aqui' : 'Arraste o CSV aqui'}</span>
                <span className="mt-1 text-xs text-slate-500">ou clique para selecionar · tarefas e subtarefas podem vir no mesmo arquivo.</span>
                {fileName && <span className="mt-2 rounded-full bg-white px-3 py-1 text-xs text-slate-600">{fileName}</span>}
              </button>
              <button
                type="button"
                onClick={() => downloadTaskCsvModel().catch(() => setError('Não foi possível baixar o modelo CSV.'))}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 hover:border-slate-300"
              >
                <Download size={18} className="mx-auto mb-2 text-[#0969ff]" />
                Baixar modelo CSV
              </button>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
            </div>
          )}

          {loading && <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-sm text-slate-500 animate-pulse">Processando arquivo...</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {preview && !result && !loading && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Linhas', preview.summary.total],
                  ['Tarefas', preview.summary.tasks],
                  ['Subtarefas', preview.summary.subtasks],
                  ['Válidas', preview.summary.valid],
                  ['Com erro', preview.summary.errors],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {preview.summary.duplicates > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={19} className="mt-0.5 text-amber-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-900">{preview.summary.duplicates} duplicidade(s) encontrada(s)</p>
                      <p className="mt-1 text-xs text-amber-700">Escolha o comportamento para tarefas com o mesmo Cliente + Projeto + Título.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {[
                          ['ignore', 'Ignorar duplicadas'],
                          ['duplicate', 'Criar mesmo assim'],
                          ['update', 'Atualizar existentes'],
                        ].map(([value, label]) => (
                          <button key={value} type="button" onClick={() => setDuplicateStrategy(value)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${duplicateStrategy === value ? 'border-amber-500 bg-white text-amber-900 ring-2 ring-amber-200' : 'border-amber-200 text-amber-800'}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[1120px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500">
                      <tr>{['Linha', 'Hierarquia', 'Tipo de tarefa', 'Conteúdo', 'Título', 'Cliente', 'Projeto', 'Tarefa pai', 'Status'].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((row) => (
                        <tr key={`${row.line}-${row.csv_id}`} className={row.errors?.length ? 'bg-red-50/60' : row.duplicate ? 'bg-amber-50/50' : ''}>
                          <td className="px-3 py-2.5 text-slate-400">{row.line}</td>
                          <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 font-semibold ${row.type === 'subtask' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>{row.type === 'subtask' ? 'Subtarefa' : 'Tarefa'}</span></td>
                          <td className="px-3 py-2.5 text-slate-600">{row.task_type_label || 'Tarefa básica'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{row.content_type_label || '—'}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{row.title || '—'}{row.duplicate && <span className="ml-2 text-[10px] font-semibold text-amber-700">DUPLICADA</span>}</td>
                          <td className="px-3 py-2.5 text-slate-600">{row.client_name || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{row.project_name || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{row.parent_csv_id || '—'}</td>
                          <td className="px-3 py-2.5">{row.errors?.length ? <span className="text-red-600">{row.errors.join(' ')}</span> : <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Válida</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setPreview(null); setRawRows([]); setFileName(''); }} className="btn-secondary">Escolher outro arquivo</button>
                  {invalidRows.length > 0 && <button type="button" onClick={downloadErrors} className="btn-secondary inline-flex items-center gap-2"><Download size={15} /> Baixar erros</button>}
                </div>
                <button type="button" disabled={!validRows.length} onClick={importRows} className="btn-primary disabled:opacity-50">
                  {invalidRows.length ? `Importar ${validRows.length} linha(s) válida(s)` : `Confirmar importação (${validRows.length})`}
                </button>
              </div>
            </>
          )}

          {result && !loading && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3"><CheckCircle2 size={22} className="text-emerald-600" /><div><h3 className="font-bold text-emerald-900">Importação concluída com sucesso.</h3><p className="mt-1 text-sm text-emerald-700">As tarefas válidas já foram adicionadas ao ZebraHub.</p></div></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Tarefas criadas', result.counts.created],
                  ['Subtarefas criadas', result.counts.subtasks_created],
                  ['Atualizadas', result.counts.updated],
                  ['Ignoradas', result.counts.ignored],
                ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value || 0}</p></div>)}
              </div>
              {result.errors?.length > 0 && (
                <button type="button" onClick={downloadErrors} className="btn-secondary inline-flex items-center gap-2"><Download size={15} /> Baixar linhas não importadas</button>
              )}
              <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-primary">Concluir</button></div>
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
