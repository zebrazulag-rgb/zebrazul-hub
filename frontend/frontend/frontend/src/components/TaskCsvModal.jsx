import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import api from '../api';

const MODEL_HEADERS = [
  'index',
  'ID da tarefa',
  'ID da tarefa pai',
  'Tipo de tarefa',
  'Cliente',
  'Projeto',
  'Frente',
  'Título',
  'Descrição',
  'Ideia do conteúdo',
  'Tipo de conteúdo',
  'Data de postagem',
  'Legenda',
  'Roteiro / briefing',
  'Link do vídeo',
  'Responsável',
  'Prioridade',
  'Status',
  'Prazo',
  'Meta',
];

function clean(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}

function normalized(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceId(value) {
  const text = clean(value);
  return /^-?\d+\.0+$/.test(text) ? text.replace(/\.0+$/, '') : text;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildModelCsv() {
  const example = [
    [0, 'EXEMPLO-MES', '', 'Tarefa básica', 'Nome do cliente', 'Cronograma de Conteúdo', 'Marketing', 'CRONOGRAMA DO MÊS', 'Planejamento principal do mês.', '', '', '', '', '', '', '', 'Média', 'A fazer', '2026-09-30', ''],
    [1, 'EXEMPLO-POST-01', 'EXEMPLO-MES', 'Post', 'Nome do cliente', 'Cronograma de Conteúdo', 'Conteúdo', 'Título do conteúdo', '', 'Objetivo/ideia principal do conteúdo.', 'Carrossel', '2026-09-10', 'Legenda do post.', 'Briefing completo da arte ou roteiro.', '', '', 'Média', 'A fazer', '', ''],
  ];
  return [MODEL_HEADERS, ...example].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export async function downloadTaskCsvModel() {
  const csv = '\uFEFF' + buildModelCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo_importacao_tarefas_zebrahub.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Parser CSV de verdade: respeita aspas, vírgulas e quebras de linha dentro dos campos.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
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
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (row.some((item) => clean(item))) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field.replace(/\r$/, ''));
  if (row.some((item) => clean(item))) rows.push(row);

  if (quoted) throw new Error('O CSV terminou com um campo entre aspas não fechado.');
  if (!rows.length) throw new Error('O arquivo CSV está vazio.');
  return rows;
}

function rowsToObjects(rows) {
  const headers = rows[0].map((item) => clean(item));
  const headerKeys = headers.map(normalized);
  const required = ['id da tarefa', 'tipo de tarefa', 'cliente', 'titulo'];
  const missing = required.filter((key) => !headerKeys.includes(key));
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
  }

  return rows.slice(1).map((values, index) => {
    const item = { __line: index + 2 };
    headers.forEach((header, columnIndex) => {
      const key = normalized(header);
      // Ignora a coluna visual "index" e mantém o primeiro valor das demais chaves.
      if (!key || key === 'index') return;
      if (item[key] === undefined) item[key] = values[columnIndex] ?? '';
    });
    return item;
  }).filter((item) => Object.entries(item).some(([key, value]) => key !== '__line' && clean(value)));
}

function cell(row, ...aliases) {
  for (const alias of aliases) {
    const value = row[normalized(alias)];
    if (value !== undefined && clean(value) !== '') return clean(value);
  }
  return '';
}

function taskType(value) {
  const key = normalized(value);
  if (!key || key === 'tarefa basica' || key === 'basic') return 'basic';
  if (key === 'post' || key === 'publicacao') return 'post';
  if (key === 'video' || key.includes('gravacao') || key.includes('edicao de video')) return 'video';
  throw new Error(`Tipo de tarefa não reconhecido: “${value}”.`);
}

function contentType(value) {
  const key = normalized(value);
  if (!key) return '';
  if (key === 'reel' || key === 'reels') return 'reels';
  if (key === 'story' || key === 'stories') return 'story';
  if (key === 'carrossel' || key === 'carousel') return 'carrossel';
  if (key === 'artigo' || key === 'article') return 'artigo';
  if (key.includes('estatico') || key === 'imagem' || key === 'feed' || key === 'post') return 'feed';
  return key;
}

function priority(value) {
  const key = normalized(value);
  if (!key || key === 'media' || key === 'medium') return 'medium';
  if (key === 'alta' || key === 'high') return 'high';
  if (key === 'baixa' || key === 'low') return 'low';
  return 'medium';
}

function status(value) {
  const key = normalized(value);
  if (!key || key === 'a fazer' || key === 'pendente' || key === 'pending') return 'pending';
  if (key === 'em andamento' || key === 'andamento' || key === 'in progress' || key === 'in_progress') return 'in_progress';
  if (key === 'concluida' || key === 'concluido' || key === 'done') return 'done';
  if (key === 'postado' || key === 'postada' || key === 'posted') return 'posted';
  return 'pending';
}

function isoDate(value) {
  const text = clean(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  throw new Error(`Data inválida: “${text}”. Use AAAA-MM-DD ou DD/MM/AAAA.`);
}

function findClient(clients, value) {
  const key = normalized(value);
  const matches = clients.filter((client) => normalized(client.name) === key);
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`Cliente “${value}” não foi encontrado no ZebraHub.`);
  throw new Error(`Cliente “${value}” está duplicado/ambíguo no ZebraHub.`);
}

function resolveAssignees(teamUsers, value) {
  if (!clean(value)) return [];
  const parts = String(value).split(/[;|]/).map(clean).filter(Boolean);
  const ids = [];

  for (const part of parts) {
    const key = normalized(part);
    const matches = teamUsers.filter((user) =>
      normalized(user.name) === key || normalized(user.email) === key
    );
    if (!matches.length) throw new Error(`Responsável “${part}” não foi encontrado no ZebraHub.`);
    ids.push(Number(matches[0].id));
  }
  return [...new Set(ids)].filter(Boolean);
}

function combinedDescription(row, type) {
  const description = cell(row, 'Descrição');
  const idea = cell(row, 'Ideia do conteúdo');
  const briefing = cell(row, 'Roteiro / briefing');

  if (type === 'basic') return description || idea || briefing;

  const chunks = [];
  if (description) chunks.push(description);
  if (idea && idea !== description) chunks.push(`IDEIA DO CONTEÚDO\n${idea}`);
  if (briefing) chunks.push(`ROTEIRO / BRIEFING\n${briefing}`);
  return chunks.join('\n\n');
}

function taskSignature(task) {
  return [normalized(task.title), String(task.due_date || '').slice(0, 10), task.task_type || ''].join('|');
}

function responseTaskId(response) {
  return Number(
    response?.data?.task?.id ??
    response?.data?.id ??
    response?.data?.task_id ??
    0
  ) || 0;
}

async function findCreatedTaskId(clientId, payload) {
  const { data } = await api.get('/tasks', { params: { client_id: clientId } });
  const items = data.tasks || [];
  const signature = taskSignature(payload);
  const matches = items.filter((task) => taskSignature(task) === signature);
  return Number(matches.sort((a, b) => Number(b.id) - Number(a.id))[0]?.id || 0);
}

// CSV v2: importação usa somente as rotas essenciais /clients e POST /tasks.
// Isso evita depender da rota antiga exclusiva de importação e de endpoints auxiliares.

function buildPayload(row, clients, teamUsers, parentTaskId) {
  const type = taskType(cell(row, 'Tipo de tarefa'));
  const clientName = cell(row, 'Cliente');
  if (!clientName) throw new Error('Cliente não informado.');
  const client = findClient(clients, clientName);
  const title = cell(row, 'Título');
  if (!title) throw new Error('Título não informado.');

  const postingDate = cell(row, 'Data de postagem');
  const deadline = cell(row, 'Prazo');
  const dueDate = isoDate(postingDate || deadline);

  return {
    client,
    payload: {
      task_type: type,
      client_id: Number(client.id),
      parent_task_id: parentTaskId || null,
      title,
      description: combinedDescription(row, type),
      content_type: contentType(cell(row, 'Tipo de conteúdo')),
      caption: cell(row, 'Legenda'),
      video_link: cell(row, 'Link do vídeo'),
      due_date: dueDate,
      assignee_ids: resolveAssignees(teamUsers, cell(row, 'Responsável')),
      priority: priority(cell(row, 'Prioridade')),
      status: status(cell(row, 'Status')),
      // Projeto, frente, meta, ideia e briefing permanecem preservados na descrição/CSV.
      // Não enviamos campos extras para manter compatibilidade com backends que validam o payload estritamente.
    },
  };
}

function validateHierarchy(rows) {
  const ids = new Map();
  rows.forEach((row) => {
    const id = sourceId(cell(row, 'ID da tarefa'));
    if (!id) throw new Error(`Linha ${row.__line}: ID da tarefa não informado.`);
    if (ids.has(id)) throw new Error(`Linha ${row.__line}: ID da tarefa “${id}” está duplicado no CSV.`);
    ids.set(id, row);
  });

  rows.forEach((row) => {
    const id = sourceId(cell(row, 'ID da tarefa'));
    const parent = sourceId(cell(row, 'ID da tarefa pai'));
    if (!parent) return;
    if (parent === id) throw new Error(`Linha ${row.__line}: uma tarefa não pode ser pai dela mesma.`);
    if (!ids.has(parent)) throw new Error(`Linha ${row.__line}: tarefa pai “${parent}” não existe no mesmo CSV.`);
  });
}

async function parseFile(file) {
  const text = await file.text();
  const rows = rowsToObjects(parseCsv(text));
  if (!rows.length) throw new Error('Nenhuma tarefa foi encontrada no CSV.');
  validateHierarchy(rows);
  return rows;
}

export default function TaskCsvModal({ onClose, onImported }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);

  const parentCount = useMemo(() => rows.filter((row) => !sourceId(cell(row, 'ID da tarefa pai'))).length, [rows]);
  const subtaskCount = Math.max(0, rows.length - parentCount);

  async function selectFile(nextFile) {
    if (!nextFile) return;
    setError('');
    setResult(null);
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setRows([]);
      setError('Selecione um arquivo com extensão .csv.');
      return;
    }

    try {
      const parsed = await parseFile(nextFile);
      setFile(nextFile);
      setRows(parsed);
    } catch (err) {
      setFile(nextFile);
      setRows([]);
      setError(err.message || 'Não foi possível ler o CSV.');
    }
  }

  async function importRows() {
    if (!rows.length || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    setProgress({ current: 0, total: rows.length });

    let created = 0;
    let subtasksCreated = 0;
    let skipped = 0;

    try {
      const { data: clientsData } = await api.get('/clients');
      const clients = clientsData.clients || [];
      const hasAssignees = rows.some((row) => clean(cell(row, 'Responsável')));
      let teamUsers = [];
      if (hasAssignees) {
        try {
          const { data: teamData } = await api.get('/auth/team-users');
          teamUsers = teamData.users || [];
        } catch (teamError) {
          throw new Error('O CSV possui responsáveis, mas a lista de usuários não pôde ser carregada. Deixe a coluna Responsável vazia ou revise a rota de usuários.');
        }
      }
      const createdIds = new Map();
      const pending = [...rows];
      let completed = 0;

      while (pending.length) {
        let advanced = false;

        for (let i = 0; i < pending.length; i += 1) {
          const row = pending[i];
          const id = sourceId(cell(row, 'ID da tarefa'));
          const parentSourceId = sourceId(cell(row, 'ID da tarefa pai'));
          if (parentSourceId && !createdIds.has(parentSourceId)) continue;

          const parentTaskId = parentSourceId ? createdIds.get(parentSourceId) : null;
          let built;
          try {
            built = buildPayload(row, clients, teamUsers, parentTaskId);
          } catch (rowError) {
            throw new Error(`Linha ${row.__line}: ${rowError.message}`);
          }

          const { client, payload } = built;
          let response;
          try {
            response = await api.post('/tasks', payload);
          } catch (requestError) {
            const statusCode = requestError.response?.status;
            const backendMessage = requestError.response?.data?.error || requestError.response?.data?.message || requestError.message;
            throw new Error(`Linha ${row.__line} (“${payload.title}”): ${statusCode ? `HTTP ${statusCode} · ` : ''}${backendMessage || 'erro ao criar tarefa'}`);
          }

          let dbId = responseTaskId(response);
          if (!dbId) dbId = await findCreatedTaskId(Number(client.id), payload);
          if (!dbId) {
            throw new Error(`Linha ${row.__line}: a tarefa foi criada, mas o ZebraHub não retornou o ID necessário para relacionar as subtarefas.`);
          }

          if (parentTaskId) subtasksCreated += 1;
          else created += 1;

          createdIds.set(id, dbId);
          pending.splice(i, 1);
          i -= 1;
          completed += 1;
          setProgress({ current: completed, total: rows.length });
          advanced = true;
        }

        if (!advanced) {
          const unresolved = pending.map((row) => sourceId(cell(row, 'ID da tarefa pai'))).filter(Boolean);
          throw new Error(`Não foi possível resolver a hierarquia das subtarefas. Pais pendentes: ${[...new Set(unresolved)].join(', ')}.`);
        }
      }

      const data = {
        counts: { created, subtasks_created: subtasksCreated, skipped },
      };
      setResult(data.counts);
      await onImported?.(data);
    } catch (err) {
      setError(err.message || 'Não foi possível importar as tarefas.');
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    selectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[1095px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-6 border-b border-slate-100 px-7 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600">
              <FileSpreadsheet size={17} /> Importação em massa
            </div>
            <h2 className="text-xl font-bold text-slate-900">Importar tarefas e subtarefas por CSV</h2>
            <p className="mt-1 text-sm text-slate-500">CSV v2 ativo: o arquivo é validado no navegador e cada item usa a rota normal de criação de tarefas do ZebraHub.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-4 p-7 md:grid-cols-[1fr_185px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`min-h-[188px] rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40'} disabled:cursor-wait disabled:opacity-60`}
          >
            <Upload size={28} className="mx-auto mb-4 text-blue-600" />
            <p className="font-semibold text-slate-800">Arraste o CSV aqui</p>
            <p className="mt-1 text-sm text-slate-500">ou clique para selecionar · tarefas e subtarefas podem vir no mesmo arquivo.</p>
            {file && <span className="mt-4 inline-flex max-w-full rounded-full bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">{file.name}</span>}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => downloadTaskCsvModel().catch(() => setError('Não foi possível gerar o modelo CSV.'))}
            className="flex min-h-[188px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-center font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 disabled:opacity-50"
          >
            <Download size={22} className="mb-3 text-blue-600" />
            Baixar modelo CSV
          </button>
        </div>

        <div className="px-7 pb-7">
          {rows.length > 0 && !result && (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-emerald-800">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span><strong>CSV validado.</strong> {rows.length} item(ns): {parentCount} tarefa(s) principal(is) e {subtaskCount} subtarefa(s).</span>
              </div>
              <button type="button" onClick={importRows} disabled={busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                {busy ? <><Loader2 size={16} className="animate-spin" /> Importando {progress.current}/{progress.total}</> : <><Upload size={16} /> Importar agora</>}
              </button>
            </div>
          )}

          {busy && progress.total > 0 && (
            <div className="mb-4 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
            </div>
          )}

          {result && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <span><strong>Importação concluída.</strong> {result.created} tarefa(s) principal(is) e {result.subtasks_created} subtarefa(s) criadas. {result.skipped ? `${result.skipped} item(ns) já existentes foram ignorados.` : ''}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">CSV v2 · Correção anti-404: esta versão não depende de uma rota exclusiva de importação CSV. Ela usa <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-500">POST /tasks</code>, a mesma rota já utilizada pela criação manual, e resolve a hierarquia pai/subtarefa durante a importação.</p>
        </div>
      </div>
    </div>
  );
}
