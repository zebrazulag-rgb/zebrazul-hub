import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Calendar, ListPlus, Trash2, Copy, Grid3x3, LayoutGrid, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, Video, FileText, Pencil, ListTree, ListChecks, Clock3, CheckCircle2, Star, Send, Download, Upload, FileSpreadsheet, RotateCcw, Link2, Paperclip, UserRound, MessageSquareText, AlertTriangle, Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import TaskCsvModal from '../components/TaskCsvModal.jsx';
import TaskRequestLinkModal from '../components/TaskRequestLinkModal.jsx';
import TaskCalendarShareModal from '../components/TaskCalendarShareModal.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { hasPermission } from '../permissions.js';

const STATUS_COLUMNS = [
  { key: 'todo', label: 'A fazer', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  { key: 'correction', label: 'Em correção', badge: 'bg-rose-100 text-rose-700' },
  { key: 'approval', label: 'Em aprovação', badge: 'bg-violet-100 text-violet-700' },
  { key: 'approved', label: 'Aprovado', badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'scheduled', label: 'Agendado', badge: 'bg-sky-100 text-sky-700' },
  { key: 'posted', label: 'Postado', badge: 'bg-indigo-100 text-indigo-700' },
];

const WORKFLOW_ORDER = STATUS_COLUMNS.map((item) => item.key);
const CONTENT_TYPE_LABELS = {
  feed: 'Estático',
  carrossel: 'Carrossel',
  story: 'Stories',
  stories: 'Stories',
  presentation: 'Apresentação',
  print: 'Impresso',
};
const CONTENT_TAG_CLASSES = {
  Venda: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Trend: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100',
  Institucional: 'bg-blue-50 text-blue-700 border-blue-100',
  Feriado: 'bg-amber-50 text-amber-700 border-amber-100',
  Outro: 'bg-slate-50 text-slate-600 border-slate-200',
};


function serverWorkflowStage(stage) {
  // Compatibilidade com o backend anterior, que ainda usa internal_approval/external_approval.
  // A interface continua exibindo apenas uma etapa: "Em aprovação".
  return stage === 'approval' ? 'internal_approval' : stage;
}

function workflowStage(task) {
  if (String(task?.approval_status || '').toLowerCase() === 'changes_requested') return 'correction';
  if (['internal_approval', 'external_approval'].includes(task?.workflow_stage)) return 'approval';
  if (task?.workflow_stage) return task.workflow_stage;
  if (task?.status === 'posted') return 'posted';
  if (task?.status === 'done') return 'in_progress';
  if (task?.status === 'in_progress') return 'in_progress';
  return 'todo';
}

function taskNeedsCorrection(task) {
  return workflowStage(task) === 'correction'
    || String(task?.approval_status || '').toLowerCase() === 'changes_requested'
    || Number(task?.subtask_correction || 0) > 0;
}

function taskCorrectionFeedback(task) {
  const clientStatus = String(task?.client_status || '').toLowerCase();
  const directionStatus = String(task?.direction_status || '').toLowerCase();
  if (clientStatus === 'changes_requested' && task?.client_feedback) return String(task.client_feedback).trim();
  if (directionStatus === 'changes_requested' && task?.direction_feedback) return String(task.direction_feedback).trim();
  return String(task?.client_feedback || task?.direction_feedback || '').trim();
}

const TYPE_ICON = { post: Grid3x3, video: Video, basic: FileText };

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function dateParts(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

function formatTaskDate(value) {
  const parts = dateParts(value);
  if (!parts.year || !parts.month || !parts.day) return '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function priorityLabel(value) {
  if (value === 'high') return 'Alta';
  if (value === 'low') return 'Baixa';
  return 'Média';
}

function localTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isTaskOverdue(task) {
  const due = String(task?.due_date || '').slice(0, 10);
  if (!due) return false;
  if (['approved', 'scheduled', 'posted'].includes(workflowStage(task))) return false;
  return due < localTodayIso();
}

function taskMatchesFilters(task, filters) {
  if (filters.status && workflowStage(task) !== filters.status) return false;
  if (filters.assignee_id && !(task.assignees || []).some((item) => String(item.id) === String(filters.assignee_id))) return false;
  const due = String(task.due_date || '').slice(0, 10);
  if (filters.due_from && (!due || due < filters.due_from)) return false;
  if (filters.due_to && (!due || due > filters.due_to)) return false;
  return true;
}

function sortTasks(items) {
  return [...items].sort((a, b) => {
    const featuredDifference = Number(b.is_featured || 0) - Number(a.is_featured || 0);
    if (featuredDifference) return featuredDifference;
    return String(a.due_date || a.created_at || '').localeCompare(String(b.due_date || b.created_at || ''));
  });
}

function broadcastTaskUpdate(taskId, parentTaskId = null) {
  const payload = { taskId: Number(taskId), parentTaskId: parentTaskId ? Number(parentTaskId) : null, at: Date.now() };
  try {
    const channel = new BroadcastChannel('zebrahub-task-sync');
    channel.postMessage(payload);
    channel.close();
  } catch {
    window.dispatchEvent(new CustomEvent('zebrahub:task-updated', { detail: payload }));
  }
}

function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function AssigneeStack({ assignees }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-xs text-slate-400">Sem responsável</span>;
  }
  return (
    <div className="flex items-center -space-x-1.5">
      {assignees.slice(0, 3).map((a) => (
        a.avatar_data ? (
          <img key={a.id} src={a.avatar_data} alt="" className="w-5 h-5 rounded-full object-cover ring-2 ring-white" />
        ) : (
          <span key={a.id} className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white" style={{ backgroundColor: a.avatar_color || '#2563eb' }}>
            {a.name[0]?.toUpperCase()}
          </span>
        )
      ))}
      {assignees.length > 3 && <span className="text-[10px] text-slate-400 ml-2">+{assignees.length - 3}</span>}
    </div>
  );
}

function TaskCard({ task: t, onClick, onDragStart, onToggleFeatured }) {
  const TypeIcon = TYPE_ICON[t.task_type] || FileText;
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? (e) => onDragStart(e, t.id) : undefined}
      onClick={onClick}
      className={'group relative w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.075)] ' + (onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0969ff]">
          <TypeIcon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 font-medium text-slate-800 text-sm">{t.title}</p>
            {onToggleFeatured ? (
              <button
                type="button"
                draggable={false}
                onClick={(event) => { event.stopPropagation(); onToggleFeatured(t); }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                  Number(t.is_featured) === 1
                    ? 'border-amber-200 bg-amber-50 text-amber-600'
                    : 'border-transparent bg-slate-50 text-slate-300 opacity-60 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-500 group-hover:opacity-100'
                }`}
                title={Number(t.is_featured) === 1 ? 'Remover do painel principal' : 'Destacar no painel principal'}
              >
                <Star size={14} fill={Number(t.is_featured) === 1 ? 'currentColor' : 'none'} />
              </button>
            ) : Number(t.is_featured) === 1 ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700" title="Tarefa em destaque no painel">
                <Star size={10} fill="currentColor" /> Destaque
              </span>
            ) : null}
          </div>
          {t.client_name && <p className="text-xs text-zebrazul-600 mt-0.5">{t.client_name}</p>}
          {t.client_request_id && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
                <MessageSquareText size={10} /> Solicitação do cliente
              </span>
              {t.request_urgency === 'urgent' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700"><AlertTriangle size={10} /> Cliente marcou urgente</span>
              )}
            </div>
          )}
          {(t.content_tag || t.content_type) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.content_tag && <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${CONTENT_TAG_CLASSES[t.content_tag] || CONTENT_TAG_CLASSES.Outro}`}>{t.content_tag}</span>}
              {t.content_type && <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-500">{CONTENT_TYPE_LABELS[t.content_type] || t.content_type}</span>}
            </div>
          )}
          {taskNeedsCorrection(t) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                <AlertTriangle size={10} /> {Number(t.subtask_correction || 0) > 0 ? `Correção pendente (${t.subtask_correction})` : 'Correção solicitada'}
              </span>
            </div>
          )}
          {t.parent_task_id && (
            <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600" title={t.parent_title ? `Subtarefa de ${t.parent_title}` : 'Subtarefa'}>
              <ListTree size={10} className="shrink-0" />
              <span className="truncate">{t.parent_title ? `Subtarefa de ${t.parent_title}` : 'Subtarefa'}</span>
            </p>
          )}
        </div>
      </div>
      {t.subtask_total > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-zebrazul-500 rounded-full" style={{ width: (t.subtask_done / t.subtask_total * 100) + '%' }} />
          </div>
          <span className="text-[10px] text-slate-400 shrink-0">{t.subtask_done}/{t.subtask_total}</span>
        </div>
      )}
      {t.client_request_id && t.requested_due_date && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-violet-600"><Calendar size={11} /> Desejado pelo cliente: {formatTaskDate(t.requested_due_date)}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        <AssigneeStack assignees={t.assignees} />
        {(t.due_date || t.deadline_label) && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Calendar size={11} /> {t.due_date ? formatTaskDate(t.due_date) : t.deadline_label}
          </span>
        )}
      </div>
    </div>
  );
}

function InlineAssigneePicker({ task, teamUsers, updating, onChange }) {
  const currentAssignees = task.assignees || [];
  const selectedValue = currentAssignees.length === 1
    ? String(currentAssignees[0].id)
    : currentAssignees.length > 1
      ? '__multiple'
      : '';
  const clientId = Number(task.client_id) || null;
  const selectedIds = new Set(currentAssignees.map((item) => Number(item.id)));
  const availableUsers = teamUsers.filter((member) => {
    if (member.role === 'admin' || member.is_operations_head || !clientId) return true;
    if ((member.client_ids || []).map(Number).includes(clientId)) return true;
    return selectedIds.has(Number(member.id));
  });

  return (
    <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
      <select
        value={selectedValue}
        disabled={updating}
        onChange={(event) => onChange(task, event.target.value)}
        className="max-w-[190px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 outline-none transition focus:border-[#0969ff] focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
        title={currentAssignees.length ? currentAssignees.map((item) => item.name).join(', ') : 'Selecionar responsável'}
      >
        {currentAssignees.length > 1 && <option value="__multiple" disabled>{currentAssignees.length} responsáveis atuais</option>}
        <option value="">Sem responsável</option>
        {availableUsers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </div>
  );
}

export default function Tasks({ workspace = 'designer' }) {
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const isSiteLP = workspace === 'site-lp';
  const defaultFrontName = isSiteLP ? 'Site/LP' : '';
  const belongsToWorkspace = useCallback((task) => {
    if (String(task?.task_type || '') === 'video') return false;
    const front = String(task?.front_name || '').trim().toLocaleLowerCase('pt-BR');
    return isSiteLP ? front === 'site/lp' : front !== 'site/lp';
  }, [isSiteLP]);
  const canCreateTasks = hasPermission(user, 'tasks.create');
  const isAdminUser = user?.role === 'admin' || Number(user?.is_platform_owner) === 1 || user?.is_platform_owner === true;
  const canImportTasks = isAdminUser || hasPermission(user, 'tasks.import');
  const canExportTasks = isAdminUser || hasPermission(user, 'tasks.export');
  const canShareTaskCalendar = hasPermission(user, 'tasks.share_calendar');
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [defaultTaskDate, setDefaultTaskDate] = useState('');
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [openCorrectionFeedbackId, setOpenCorrectionFeedbackId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [calendarDrag, setCalendarDrag] = useState(null);
  const [calendarDropDay, setCalendarDropDay] = useState(null);
  const [calendarFeedback, setCalendarFeedback] = useState('');
  const [cursor, setCursor] = useState(new Date());
  const [dayTasks, setDayTasks] = useState(null);
  const [sendingApprovalId, setSendingApprovalId] = useState(null);
  const [feedError, setFeedError] = useState('');
  const [feedNotice, setFeedNotice] = useState('');
  const [taskError, setTaskError] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [parentOptions, setParentOptions] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [loadingParentOptions, setLoadingParentOptions] = useState(false);
  const [convertingTask, setConvertingTask] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showRequestLink, setShowRequestLink] = useState(false);
  const [showCalendarShare, setShowCalendarShare] = useState(false);
  const [showTaskActions, setShowTaskActions] = useState(false);
  const taskActionsRef = useRef(null);
  const [hidePosted, setHidePosted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zebrahub.tasks.hidePosted') === '1';
  });
  const [subtaskAssigneeUpdatingId, setSubtaskAssigneeUpdatingId] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvNotice, setCsvNotice] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    assignee_id: '',
    due_from: '',
    due_to: '',
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(() => searchParams.get('atrasadas') === '1');

  useEffect(() => {
    setOpenCorrectionFeedbackId(null);
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!showTaskActions) return undefined;

    function closeActions(event) {
      if (taskActionsRef.current && !taskActionsRef.current.contains(event.target)) {
        setShowTaskActions(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setShowTaskActions(false);
    }

    document.addEventListener('mousedown', closeActions);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeActions);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showTaskActions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('zebrahub.tasks.hidePosted', hidePosted ? '1' : '0');
    }
  }, [hidePosted]);

  useEffect(() => {
    const shouldShow = searchParams.get('atrasadas') === '1';
    setShowOverdueOnly(shouldShow);
  }, [searchParams]);

  const effectiveClientId = user?.role === 'client'
    ? (user.client_id ? String(user.client_id) : null)
    : (selectedClient?.id ? String(selectedClient.id) : null);

  const loadTasks = useCallback(async () => {
    const params = effectiveClientId ? ('?client_id=' + effectiveClientId) : '';
    const [taskResponse, calendarResponse] = await Promise.all([
      api.get('/tasks' + params),
      api.get('/tasks/calendar' + params),
    ]);
    setTasks(sortTasks((taskResponse.data.tasks || []).filter(belongsToWorkspace)));
    setCalendarTasks((calendarResponse.data.tasks || []).filter(belongsToWorkspace));
  }, [effectiveClientId, belongsToWorkspace]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const interval = window.setInterval(() => loadTasks().catch(() => {}), 30000);
    return () => window.clearInterval(interval);
  }, [loadTasks]);

  useEffect(() => {
    let channel = null;
    const sync = (event) => {
      const detail = event?.data || event?.detail || {};
      loadTasks().catch(() => {});
      if (selectedTask?.id) {
        const affectsSelected = Number(detail.taskId) === Number(selectedTask.id)
          || Number(detail.parentTaskId) === Number(selectedTask.id);
        if (affectsSelected) openTask(selectedTask.id);
      }
    };
    try {
      channel = new BroadcastChannel('zebrahub-task-sync');
      channel.onmessage = sync;
    } catch {
      window.addEventListener('zebrahub:task-updated', sync);
    }
    return () => {
      if (channel) channel.close();
      window.removeEventListener('zebrahub:task-updated', sync);
    };
  }, [loadTasks, selectedTask?.id]);

  async function exportCsv() {
    setCsvBusy(true);
    setCsvNotice('');
    setTaskError('');
    try {
      const params = {
        ...(effectiveClientId ? { client_id: effectiveClientId } : {}),
        ...(selectedClient?.name ? { client_name: selectedClient.name } : {}),
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
      };
      const response = await api.get('/tasks/csv/export', { params, responseType: 'blob' });
      const clientPart = String(selectedClient?.name || 'todos').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'todos';
      const projectPart = String(filters.project || (isSiteLP ? 'site_lp' : 'designer')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tarefas';
      const filename = `tarefas_${clientPart}_${projectPart}_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      setCsvNotice('Arquivo CSV gerado com sucesso.');
    } catch (error) {
      setTaskError(error.response?.data?.error || 'Não foi possível exportar as tarefas.');
    } finally {
      setCsvBusy(false);
    }
  }

  function downloadCsvModel() {
    setCsvBusy(true);
    setCsvNotice('');
    setTaskError('');

    try {
      const headers = [
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

      const escapeCsvCell = (value) => {
        const normalized = String(value ?? '').replace(/"/g, '""');
        return `"${normalized}"`;
      };

      const csv = '\uFEFF' + headers.map(escapeCsvCell).join(',') + '\r\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = 'modelo_importacao_tarefas_zebrahub.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      setCsvNotice('Modelo CSV baixado com sucesso.');
    } catch (error) {
      console.error('[TAREFAS] Erro ao gerar modelo CSV:', error);
      setTaskError('Não foi possível gerar o modelo CSV.');
    } finally {
      setCsvBusy(false);
    }
  }

  useEffect(() => {
    const requestedTaskId = Number(searchParams.get('task_id'));
    if (!requestedTaskId) return;

    openTask(requestedTaskId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('task_id');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    Promise.all([api.get('/auth/team-users'), api.get('/clients')])
      .then(([teamResponse, clientResponse]) => {
        setTeamUsers(teamResponse.data.users || []);
        setClients(clientResponse.data.clients || []);
      })
      .catch(() => {});
  }, []);

  function upsertTaskSummary(task) {
    if (!task) return;
    setTasks((previous) => {
      if (!belongsToWorkspace(task) || (effectiveClientId && String(task.client_id || '') !== String(effectiveClientId))) {
        return previous.filter((item) => item.id !== task.id);
      }
      const exists = previous.some((item) => item.id === task.id);
      const next = exists
        ? previous.map((item) => item.id === task.id ? { ...item, ...task } : item)
        : [...previous, task];
      return sortTasks(next);
    });
  }

  async function loadTaskMedia(taskId) {
    try {
      const { data } = await api.get('/tasks/' + taskId + '/media');
      setSelectedTask((previous) => previous?.id === taskId
        ? { ...previous, ...data.media, media_loaded: true, media_loading: false }
        : previous);
      return data.media;
    } catch {
      setSelectedTask((previous) => previous?.id === taskId
        ? { ...previous, media_loaded: true, media_loading: false }
        : previous);
      return null;
    }
  }

  async function openTask(taskId) {
    const summary = tasks.find((task) => task.id === taskId);
    setSelectedTask({
      ...(summary || { id: taskId, title: 'Carregando tarefa...' }),
      details_loading: true,
      media_loading: true,
      media_loaded: false
    });
    setSubtasks([]);
    setFeedError('');
    setFeedNotice('');
    setTaskError('');

    try {
      const { data } = await api.get('/tasks/' + taskId);
      setSelectedTask((previous) => previous?.id === taskId
        ? { ...previous, ...data.task, request_files: data.request_files || [], request_events: data.request_events || [], details_loading: false }
        : previous);
      setSubtasks(data.subtasks || []);
      loadTaskMedia(taskId);
    } catch (error) {
      setTaskError(error.response?.data?.error || 'Não foi possível abrir esta tarefa.');
      setSelectedTask((previous) => previous?.id === taskId ? null : previous);
    }
  }

  async function editSelectedTask() {
    if (!selectedTask) return;
    let completeTask = selectedTask;
    if (!selectedTask.media_loaded) {
      const media = await loadTaskMedia(selectedTask.id);
      if (media) completeTask = { ...selectedTask, ...media, media_loaded: true, media_loading: false };
    }
    setEditingTask(completeTask);
  }

  async function updateStatus(taskId, workflow_stage) {
    const previousTasks = tasks;
    const previousCalendarTasks = calendarTasks;
    const previousSelectedTask = selectedTask;
    const visibleStage = workflow_stage;
    const backendStage = serverWorkflowStage(workflow_stage);

    setTaskError('');
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, workflow_stage: visibleStage } : t)));
    setCalendarTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, workflow_stage: visibleStage } : t)));
    setSelectedTask((prev) => prev?.id === taskId ? { ...prev, workflow_stage: visibleStage } : prev);

    try {
      const { data } = await api.put('/tasks/' + taskId, { workflow_stage: backendStage });
      if (data?.task) {
        const normalized = { ...data.task, workflow_stage: workflowStage(data.task) };
        upsertTaskSummary(normalized);
        setSelectedTask((prev) => prev?.id === taskId ? { ...prev, ...normalized } : prev);
      }
      broadcastTaskUpdate(taskId);
    } catch (error) {
      setTasks(previousTasks);
      setCalendarTasks(previousCalendarTasks);
      setSelectedTask(previousSelectedTask);
      setTaskError(error.response?.data?.error || 'Não foi possível atualizar a etapa da tarefa.');
    }
  }

  async function toggleFeatured(taskId, nextValue) {
    const isFeatured = nextValue ? 1 : 0;
    setTasks((previous) => sortTasks(previous.map((task) => task.id === taskId ? { ...task, is_featured: isFeatured } : task)));
    setSelectedTask((previous) => previous?.id === taskId ? { ...previous, is_featured: isFeatured } : previous);
    setCalendarTasks((previous) => previous.map((task) => task.id === taskId ? { ...task, is_featured: isFeatured } : task));
    setDayTasks((previous) => previous ? { ...previous, items: previous.items.map((task) => task.id === taskId ? { ...task, is_featured: isFeatured } : task) } : previous);

    try {
      const { data } = await api.put('/tasks/' + taskId, { is_featured: isFeatured });
      if (data.task) upsertTaskSummary(data.task);
    } catch (error) {
      const revertedValue = nextValue ? 0 : 1;
      setTasks((previous) => sortTasks(previous.map((task) => task.id === taskId ? { ...task, is_featured: revertedValue } : task)));
      setSelectedTask((previous) => previous?.id === taskId ? { ...previous, is_featured: revertedValue } : previous);
      setCalendarTasks((previous) => previous.map((task) => task.id === taskId ? { ...task, is_featured: revertedValue } : task));
      setDayTasks((previous) => previous ? { ...previous, items: previous.items.map((task) => task.id === taskId ? { ...task, is_featured: revertedValue } : task) } : previous);
      setTaskError(error.response?.data?.error || 'Não foi possível atualizar o destaque da tarefa.');
    }
  }

  async function editSubtask(subtaskId) {
    try {
      const [{ data: detail }, { data: media }] = await Promise.all([
        api.get('/tasks/' + subtaskId),
        api.get('/tasks/' + subtaskId + '/media')
      ]);
      setEditingSubtask({ ...detail.task, ...media.media, media_loaded: true });
    } catch (error) {
      setTaskError(error.response?.data?.error || 'Não foi possível abrir a subtarefa para edição.');
    }
  }

  async function updateSubtaskStatus(subtaskId, workflow_stage) {
    const previousSubtasks = subtasks;
    const previousCalendarTasks = calendarTasks;
    const visibleStage = workflow_stage;
    const backendStage = serverWorkflowStage(workflow_stage);

    setTaskError('');
    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, workflow_stage: visibleStage } : s)));
    setCalendarTasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, workflow_stage: visibleStage } : s)));

    try {
      await api.put('/tasks/' + subtaskId, { workflow_stage: backendStage });
      broadcastTaskUpdate(subtaskId, selectedTask?.id);
      loadTasks();
    } catch (error) {
      setSubtasks(previousSubtasks);
      setCalendarTasks(previousCalendarTasks);
      setTaskError(error.response?.data?.error || 'Não foi possível atualizar a etapa da subtarefa.');
    }
  }

  async function toggleSubtaskCompleted(subtask) {
    if (!subtask?.id) return;
    const nextValue = Number(subtask.designer_completed || 0) === 1 ? 0 : 1;
    const previousSubtasks = subtasks;
    setTaskError('');
    setSubtasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, designer_completed: nextValue } : item));
    setCalendarTasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, designer_completed: nextValue } : item));
    try {
      await api.put('/tasks/' + subtask.id, { designer_completed: nextValue });
      broadcastTaskUpdate(subtask.id, selectedTask?.id);
      loadTasks();
    } catch (error) {
      setSubtasks(previousSubtasks);
      setTaskError(error.response?.data?.error || 'Não foi possível atualizar a conclusão do designer.');
    }
  }

  async function setSubtaskAssignee(subtask, userId) {
    if (!subtask || subtaskAssigneeUpdatingId || userId === '__multiple') return;
    const previousAssignees = subtask.assignees || [];
    const nextIds = userId ? [Number(userId)] : [];
    const nextAssignees = teamUsers.filter((member) => nextIds.includes(Number(member.id)));

    setSubtaskAssigneeUpdatingId(subtask.id);
    setTaskError('');
    setSubtasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, assignees: nextAssignees } : item));
    setCalendarTasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, assignees: nextAssignees } : item));

    try {
      await api.put('/tasks/' + subtask.id, { assignee_ids: nextIds });
      broadcastTaskUpdate(subtask.id, selectedTask?.id);
    } catch (error) {
      setSubtasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, assignees: previousAssignees } : item));
      setCalendarTasks((prev) => prev.map((item) => item.id === subtask.id ? { ...item, assignees: previousAssignees } : item));
      setTaskError(error.response?.data?.error || 'Não foi possível atualizar o responsável da subtarefa.');
    } finally {
      setSubtaskAssigneeUpdatingId(null);
    }
  }

  async function deleteSubtask(subtaskId) {
    await api.delete('/tasks/' + subtaskId);
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    setCalendarTasks((prev) => prev.filter((s) => s.id !== subtaskId));
    loadTasks();
  }

  async function openConvertToSubtask() {
    if (!selectedTask) return;
    setShowConvertModal(true);
    setParentOptions([]);
    setSelectedParentId('');
    setConvertError('');
    setLoadingParentOptions(true);
    try {
      const { data } = await api.get('/tasks/' + selectedTask.id + '/parent-options');
      setParentOptions(data.options || []);
      if (data.options?.length === 1) setSelectedParentId(String(data.options[0].id));
      if (Number(data.child_count || 0) > 0) {
        setConvertError('Esta tarefa possui subtarefas. Mova ou remova essas subtarefas antes da conversão.');
      }
    } catch (error) {
      setConvertError(error.response?.data?.error || 'Não foi possível carregar as tarefas disponíveis.');
    } finally {
      setLoadingParentOptions(false);
    }
  }

  async function convertToSubtask() {
    if (!selectedTask || !selectedParentId) {
      setConvertError('Selecione a tarefa principal.');
      return;
    }
    setConvertingTask(true);
    setConvertError('');
    try {
      const parentId = Number(selectedParentId);
      await api.put('/tasks/' + selectedTask.id + '/convert-to-subtask', { parent_task_id: parentId });
      setShowConvertModal(false);
      setSelectedParentId('');
      setTasks((previous) => previous.filter((task) => task.id !== selectedTask.id));
      setSelectedTask(null);
      await loadTasks();
      await openTask(parentId);
    } catch (error) {
      setConvertError(error.response?.data?.error || 'Não foi possível transformar a tarefa em subtarefa.');
    } finally {
      setConvertingTask(false);
    }
  }

  async function deleteTask(id) {
    await api.delete('/tasks/' + id);
    setTasks((previous) => previous.filter((task) => task.id !== id));
    setCalendarTasks((previous) => previous.filter((task) => task.id !== id && Number(task.parent_task_id) !== Number(id)));
    setSelectedTask(null);
  }

  async function duplicateTask(id) {
    const { data } = await api.post('/tasks/' + id + '/duplicate');
    upsertTaskSummary(data.task);
    setSelectedTask(null);
    loadTasks();
  }

  async function sendForApproval(id, source = 'task') {
    setSendingApprovalId(id);
    setFeedError('');
    setFeedNotice('');
    try {
      const { data } = await api.put('/tasks/' + id, { workflow_stage: serverWorkflowStage('approval') });
      const patch = { ...(data.task || {}), workflow_stage: 'approval', designer_completed: 1 };
      if (source === 'subtask') {
        setSubtasks((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
      } else {
        setSelectedTask((previous) => previous ? { ...previous, ...patch } : previous);
        upsertTaskSummary(data.task || { id, workflow_stage: 'approval' });
      }
      broadcastTaskUpdate(id, source === 'subtask' ? selectedTask?.id : null);
      setFeedNotice('Enviado para aprovação. Se houver imagem, a peça já está na grade de Aprovação.');
    } catch (err) {
      setFeedError(err.response?.data?.error || 'Não foi possível enviar para aprovação.');
    } finally {
      setSendingApprovalId(null);
    }
  }

  function handleDragStart(e, taskId) {
    e.dataTransfer.setData('text/task-id', String(taskId));
    e.dataTransfer.effectAllowed = 'move';
  }

  function canDragCalendarItem(item) {
    return Boolean(item && canCreateTasks);
  }

  function isoDateForCalendarDay(day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function handleCalendarDragStart(event, item) {
    if (!canDragCalendarItem(item)) {
      event.preventDefault();
      return;
    }

    const copyRequested = Boolean(event.altKey);
    event.dataTransfer.setData('text/task-id', String(item.id));
    event.dataTransfer.setData('text/plain', String(item.id));
    event.dataTransfer.effectAllowed = 'copyMove';
    setCalendarDrag({ id: item.id, copyRequested });
    setCalendarFeedback('');
  }

  function handleCalendarDragOver(event, day) {
    if (!day || !calendarDrag) return;
    event.preventDefault();
    const copyRequested = Boolean(event.altKey);
    event.dataTransfer.dropEffect = copyRequested ? 'copy' : 'move';
    setCalendarDrag((current) => current && current.copyRequested !== copyRequested
      ? { ...current, copyRequested }
      : current);
    setCalendarDropDay(day);
  }

  function handleCalendarDragEnd() {
    setCalendarDrag(null);
    setCalendarDropDay(null);
  }

  async function handleCalendarDrop(event, day) {
    event.preventDefault();
    event.stopPropagation();
    if (!day) return;

    const taskId = Number(event.dataTransfer.getData('text/task-id') || event.dataTransfer.getData('text/plain') || calendarDrag?.id);
    if (!taskId) {
      handleCalendarDragEnd();
      return;
    }

    const item = calendarTasks.find((task) => Number(task.id) === taskId);
    if (!canDragCalendarItem(item)) {
      setTaskError('Você não tem permissão para alterar este item.');
      handleCalendarDragEnd();
      return;
    }

    const targetDate = isoDateForCalendarDay(day);
    const shouldCopy = Boolean(event.altKey || calendarDrag?.copyRequested);

    if (!shouldCopy && String(item?.due_date || '').slice(0, 10) === targetDate) {
      handleCalendarDragEnd();
      return;
    }

    setTaskError('');
    try {
      if (shouldCopy) {
        await api.post('/tasks/' + taskId + '/duplicate', { due_date: targetDate });
        setCalendarFeedback('Item duplicado para ' + formatTaskDate(targetDate) + '.');
      } else {
        await api.put('/tasks/' + taskId, { due_date: targetDate });
        setCalendarFeedback('Item movido para ' + formatTaskDate(targetDate) + '.');
      }
      await loadTasks();
      window.setTimeout(() => setCalendarFeedback(''), 2600);
    } catch (error) {
      setTaskError(error.response?.data?.error || (shouldCopy
        ? 'Não foi possível duplicar o item.'
        : 'Não foi possível mover o item.'));
    } finally {
      handleCalendarDragEnd();
    }
  }

  function handleDrop(e, columnKey) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = Number(e.dataTransfer.getData('text/task-id'));
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && workflowStage(task) !== columnKey) updateStatus(taskId, columnKey);
  }

  function nextStatus(taskOrStage) {
    const current = typeof taskOrStage === 'string' ? taskOrStage : workflowStage(taskOrStage);
    const index = WORKFLOW_ORDER.indexOf(current);
    return WORKFLOW_ORDER[index >= 0 && index < WORKFLOW_ORDER.length - 1 ? index + 1 : 0];
  }

  const filteredTasks = tasks.filter((task) => taskMatchesFilters(task, filters));
  const postedFilteredTasks = hidePosted ? filteredTasks.filter((task) => workflowStage(task) !== 'posted') : filteredTasks;
  const visibleFilteredTasks = showOverdueOnly ? postedFilteredTasks.filter(isTaskOverdue) : postedFilteredTasks;
  const visibleStatusColumns = showOverdueOnly
    ? STATUS_COLUMNS.filter((column) => !['approved', 'scheduled', 'posted'].includes(column.key))
    : (hidePosted ? STATUS_COLUMNS.filter((column) => column.key !== 'posted') : STATUS_COLUMNS);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const canModifySelectedTask = Boolean(selectedTask && canCreateTasks);

  const subtaskOverview = tasks.reduce((summary, task) => ({
    total: summary.total + Number(task.subtask_total || 0),
    pending: summary.pending + Number(task.subtask_pending || 0),
    inProgress: summary.inProgress + Number(task.subtask_in_progress || 0),
    done: summary.done + Number(task.subtask_done || 0),
    posted: summary.posted + Number(task.subtask_posted || 0),
  }), { total: 0, pending: 0, inProgress: 0, done: 0, posted: 0 });

  const taskOverview = {
    total: tasks.length + subtaskOverview.total,
    pending: tasks.filter((task) => workflowStage(task) === 'todo').length + subtaskOverview.pending,
    inProgress: tasks.filter((task) => ['in_progress', 'correction', 'approval'].includes(workflowStage(task))).length + subtaskOverview.inProgress,
    overdue: tasks.filter(isTaskOverdue).length,
    done: tasks.filter((task) => ['approved', 'scheduled'].includes(workflowStage(task))).length + (subtaskOverview.done - subtaskOverview.posted),
    posted: tasks.filter((task) => workflowStage(task) === 'posted').length + subtaskOverview.posted,
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = buildMonthGrid(year, month);

  function tasksForDay(day) {
    if (!day) return [];
    return calendarTasks.filter((t) => {
      if (!t.due_date || !taskMatchesFilters(t, filters)) return false;
      if (hidePosted && workflowStage(t) === 'posted') return false;
      if (showOverdueOnly && !isTaskOverdue(t)) return false;
      const parts = dateParts(t.due_date);
      return parts.year === year && parts.month === month + 1 && parts.day === day;
    });
  }

  function openNewTaskForDate(day) {
    if (!day) return;
    const iso = isoDateForCalendarDay(day);
    setDefaultTaskDate(iso);
    setDayTasks(null);
    setShowForm(true);
  }

  function togglePostedVisibility() {
    setHidePosted((current) => {
      const next = !current;
      if (next && filters.status === 'posted') {
        setFilters((currentFilters) => ({ ...currentFilters, status: '' }));
      }
      return next;
    });
  }

  function quickPeriodRange(key) {
    const now = new Date();
    const toIso = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (key === '7d') {
      const end = new Date(now);
      end.setDate(end.getDate() + 6);
      return { due_from: toIso(now), due_to: toIso(end) };
    }

    if (key === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { due_from: toIso(start), due_to: toIso(end) };
    }

    if (key === '30d') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { due_from: toIso(start), due_to: toIso(now) };
    }

    return { due_from: '', due_to: '' };
  }

  function applyQuickPeriod(key) {
    const range = quickPeriodRange(key);
    setFilters((current) => ({ ...current, ...range }));
  }

  function quickPeriodIsActive(key) {
    const range = quickPeriodRange(key);
    return filters.due_from === range.due_from && filters.due_to === range.due_to;
  }

  function toggleOverdueVisibility() {
    const nextParams = new URLSearchParams(searchParams);
    if (showOverdueOnly) nextParams.delete('atrasadas');
    else {
      nextParams.set('atrasadas', '1');
      nextParams.delete('task_id');
      if (['approved', 'scheduled', 'posted'].includes(filters.status)) {
        setFilters((current) => ({ ...current, status: '' }));
      }
    }
    setSearchParams(nextParams);
  }

  const taskActionControls = (
    <div className="flex shrink-0 items-center gap-2">
      {canCreateTasks && <button
        onClick={() => { setDefaultTaskDate(''); setShowForm(true); }}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(9,105,255,0.16)] transition hover:-translate-y-0.5"
        style={{ backgroundColor: 'var(--agency-primary, #0969ff)' }}
      >
        <Plus size={15} /> <span className="hidden sm:inline">Nova demanda</span><span className="sm:hidden">Nova</span>
      </button>}

      {canImportTasks && <button
        type="button"
        onClick={() => setShowCsvImport(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        title="Importar tarefas por arquivo CSV"
      >
        <Upload size={15} /> <span className="hidden sm:inline">Importar CSV</span><span className="sm:hidden">Importar</span>
      </button>}

      {canExportTasks && <button
        type="button"
        disabled={csvBusy}
        onClick={exportCsv}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
        title="Exportar as tarefas atuais em CSV"
      >
        <Download size={15} /> <span className="hidden sm:inline">Exportar CSV</span><span className="sm:hidden">Exportar</span>
      </button>}

      {(canImportTasks || canCreateTasks) && <div ref={taskActionsRef} className="relative">
        <button
          type="button"
          onClick={() => setShowTaskActions((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={showTaskActions}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
        >
          <MoreHorizontal size={15} /> <span className="hidden sm:inline">Mais ações</span>
          <ChevronDown size={13} className={`transition-transform ${showTaskActions ? 'rotate-180' : ''}`} />
        </button>

        {showTaskActions && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[245px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_22px_55px_rgba(15,23,42,0.16)]"
          >
            {canImportTasks && <button
              type="button"
              role="menuitem"
              disabled={csvBusy}
              onClick={() => { setShowTaskActions(false); downloadCsvModel(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <FileSpreadsheet size={16} className="text-slate-400" /> Baixar modelo CSV
            </button>}
            {canCreateTasks && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={!selectedClient}
                  onClick={() => {
                    if (!selectedClient) return;
                    setShowTaskActions(false);
                    setShowRequestLink(true);
                  }}
                  title={selectedClient ? `Gerenciar link de solicitações de ${selectedClient.name}` : 'Selecione um cliente para gerar o link'}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Link2 size={16} className="text-slate-400" /> Link de solicitações
                </button>
              </>
            )}
          </div>
        )}
      </div>}
    </div>
  );

  const taskCommandBar = (
    <div className="toolbar-panel flex flex-wrap items-center gap-2.5 py-3">
      <button
        type="button"
        onClick={() => setMobileFiltersOpen((open) => !open)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
          mobileFiltersOpen || hasActiveFilters
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal size={14} />
        Filtros{hasActiveFilters ? ' ativos' : ''}
        <ChevronDown size={13} className={`transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {[
          { key: '7d', label: '7 dias' },
          { key: 'month', label: 'Esse mês' },
          { key: '30d', label: 'Últimos 30 dias' },
          { key: 'total', label: 'Total' },
        ].map((period) => {
          const active = quickPeriodIsActive(period.key);
          return (
            <button
              key={period.key}
              type="button"
              onClick={() => applyQuickPeriod(period.key)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {period.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto">{taskActionControls}</div>
    </div>
  );


  return (
    <div className="space-y-4">
      {taskCommandBar}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { label: 'Total geral', shortLabel: 'Total', value: taskOverview.total, icon: ListChecks, iconClass: 'text-blue-500' },
          { label: 'Pendentes', shortLabel: 'Pend.', value: taskOverview.pending, icon: Clock3, iconClass: 'text-amber-500' },
          { label: 'Em andamento', shortLabel: 'Andam.', value: taskOverview.inProgress, icon: Calendar, iconClass: 'text-cyan-500' },
          { label: 'Atrasadas', shortLabel: 'Atras.', value: taskOverview.overdue, icon: AlertTriangle, iconClass: 'text-rose-500' },
          { label: 'Concluídas', shortLabel: 'Concl.', value: taskOverview.done, icon: CheckCircle2, iconClass: 'text-emerald-500' },
          { label: 'Postadas', shortLabel: 'Post.', value: taskOverview.posted, icon: Send, iconClass: 'text-indigo-500' },
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 sm:text-[11px]">
              <item.icon size={12} className={`${item.iconClass} shrink-0`} />
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden truncate sm:inline">{item.label}</span>
            </div>
            <p className="mt-0.5 text-lg font-bold leading-none text-slate-900 sm:text-xl">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="toolbar-panel space-y-3 py-3">
        <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} flex-wrap items-end gap-2`}>
          <div className="min-w-[145px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select className="input-field py-2 text-xs" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
              <option value="">Todos</option>{visibleStatusColumns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Responsável</label>
            <select className="input-field py-2 text-xs" value={filters.assignee_id} onChange={(e) => setFilters((current) => ({ ...current, assignee_id: e.target.value }))}>
              <option value="">Todos</option>{teamUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Prazo de</label>
            <input type="date" className="input-field py-2 text-xs" value={filters.due_from} onChange={(e) => setFilters((current) => ({ ...current, due_from: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Até</label>
            <input type="date" className="input-field py-2 text-xs" value={filters.due_to} onChange={(e) => setFilters((current) => ({ ...current, due_to: e.target.value }))} />
          </div>
          {hasActiveFilters && <button type="button" onClick={() => setFilters({ status: '', assignee_id: '', due_from: '', due_to: '' })} className="mb-0.5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Limpar</button>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">{visibleFilteredTasks.length} demanda(s) exibida(s){showOverdueOnly ? ' · somente atrasadas' : ''}{hasActiveFilters ? ' · filtros ativos' : ''}{hidePosted && !showOverdueOnly ? ' · postadas ocultas' : ''}.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={toggleOverdueVisibility}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                showOverdueOnly
                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title={showOverdueOnly ? 'Voltar a visualizar todas as tarefas' : 'Mostrar somente tarefas com prazo vencido'}
            >
              <AlertTriangle size={14} />
              {showOverdueOnly ? 'Ver todas' : `Ver atrasadas (${taskOverview.overdue})`}
            </button>
            <button
              type="button"
              onClick={togglePostedVisibility}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                hidePosted
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title={hidePosted ? 'Exibir novamente as tarefas postadas' : 'Ocultar tarefas postadas para reduzir a poluição visual'}
            >
              {hidePosted ? <Eye size={14} /> : <EyeOff size={14} />}
              {hidePosted ? `Mostrar postados (${taskOverview.posted})` : `Ocultar postados (${taskOverview.posted})`}
            </button>
            <div className="segmented-control">
              <button onClick={() => setView('kanban')} className={'segmented-control-button flex items-center gap-1.5 ' + (view === 'kanban' ? 'segmented-control-button-active' : '')}>
                <LayoutGrid size={14} /> Kanban
              </button>
              <button onClick={() => setView('calendar')} className={'segmented-control-button flex items-center gap-1.5 ' + (view === 'calendar' ? 'segmented-control-button-active' : '')}>
                <Calendar size={14} /> Calendário
              </button>
            </div>
            {view === 'calendar' && canShareTaskCalendar && effectiveClientId && (
              <button
                type="button"
                onClick={() => setShowCalendarShare(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-zebrazul-200 hover:bg-zebrazul-50 hover:text-zebrazul-700"
                title={`Compartilhar ${MONTHS[month]} de ${year}`}
              >
                <Link2 size={14} /> Compartilhar mês
              </button>
            )}
          </div>
        </div>
      </div>

      {taskError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{taskError}</p>}
      {csvNotice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">{csvNotice}</p>}

      {view === 'kanban' && (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
          {visibleStatusColumns.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
              className={'w-[min(86vw,310px)] shrink-0 snap-start min-h-[420px] rounded-[24px] border border-slate-200/70 bg-slate-50/55 p-3 transition ' + (dragOverCol === col.key ? 'border-[#0969ff]/30 bg-[#eef5ff] ring-4 ring-[#0969ff]/8' : '')}
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2"><span className={'badge ' + col.badge}>{col.label}</span></div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-white px-2 text-xs font-semibold text-slate-500 shadow-sm">{visibleFilteredTasks.filter((t) => workflowStage(t) === col.key).length}</span>
              </div>
              <div className="space-y-3 min-h-[60px]">
                {visibleFilteredTasks.filter((t) => workflowStage(t) === col.key).map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => openTask(t.id)} onDragStart={canCreateTasks ? handleDragStart : null} onToggleFeatured={canCreateTasks ? (task) => toggleFeatured(task.id, Number(task.is_featured) !== 1) : null} />
                ))}
                {visibleFilteredTasks.filter((t) => workflowStage(t) === col.key).length === 0 && (
                  <p className="text-xs text-slate-300 text-center py-6">Arraste um card aqui.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'calendar' && (
        <div className="surface-card p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-slate-800">{MONTHS[month]} de {year}</h2>
                <p className="mt-1 text-[11px] text-slate-400">Arraste para mudar a data · segure Alt/Option para duplicar</p>
              </div>
              <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronRight size={20} />
              </button>
            </div>
            {calendarFeedback && (
              <div className="mx-auto mt-3 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                {calendarFeedback}
              </div>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400 mb-2">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, idx) => {
              const dayItems = tasksForDay(day);
              const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <div
                  key={idx}
                  onClick={() => day && !calendarDrag && openNewTaskForDate(day)}
                  onDragOver={(event) => handleCalendarDragOver(event, day)}
                  onDragEnter={(event) => { if (day && calendarDrag) { event.preventDefault(); setCalendarDropDay(day); } }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget)) return;
                    setCalendarDropDay((current) => current === day ? null : current);
                  }}
                  onDrop={(event) => handleCalendarDrop(event, day)}
                  className={'group min-h-[112px] rounded-xl border p-2 text-left flex flex-col transition ' + (!day ? 'border-transparent' : 'cursor-pointer border-slate-100 hover:border-zebrazul-300 hover:bg-zebrazul-50/30') + ' ' + (isToday ? 'ring-2 ring-zebrazul-400' : '') + ' ' + (calendarDropDay === day && calendarDrag ? (calendarDrag.copyRequested ? 'border-violet-400 bg-violet-50 ring-4 ring-violet-100' : 'border-zebrazul-400 bg-zebrazul-50 ring-4 ring-zebrazul-100') : '')}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">{day}</span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-md text-slate-300 opacity-0 transition group-hover:bg-zebrazul-100 group-hover:text-zebrazul-600 group-hover:opacity-100" title="Adicionar tarefa neste dia">
                          <Plus size={12} />
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {dayItems.slice(0, 2).map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            draggable={canDragCalendarItem(item)}
                            onDragStart={(event) => handleCalendarDragStart(event, item)}
                            onDragEnd={handleCalendarDragEnd}
                            onClick={(event) => { event.stopPropagation(); openTask(item.id); }}
                            className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium shadow-sm ${canDragCalendarItem(item) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${item.parent_task_id ? 'border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-white text-slate-600 hover:text-zebrazul-700'}`}
                            title={(item.parent_task_id && item.parent_title ? `${item.title} — subtarefa de ${item.parent_title}` : item.title) + (canDragCalendarItem(item) ? ' · arraste para mover; Alt/Option para duplicar' : '')}
                          >
                            {item.parent_task_id ? '↳ ' : ''}{item.title}
                          </button>
                        ))}
                      </div>
                      {dayItems.length > 0 && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setDayTasks({ day, items: dayItems }); }}
                          className="mt-auto pt-1 text-left text-[10px] font-semibold text-zebrazul-600 hover:underline"
                        >
                          {dayItems.length} item{dayItems.length > 1 ? 's' : ''}{dayItems.length > 2 ? ' · ver todos' : ''}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dayTasks && (
        <ModalBackdrop onClose={() => setDayTasks(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-semibold text-slate-800">Demandas e subtarefas — {dayTasks.day} de {MONTHS[month]}</h2>
                {canCreateTasks && <button onClick={() => openNewTaskForDate(dayTasks.day)} className="mt-1 text-xs font-medium text-zebrazul-600 hover:underline inline-flex items-center gap-1">
                  <Plus size={13} /> Adicionar tarefa neste dia
                </button>}
              </div>
              <button onClick={() => setDayTasks(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {dayTasks.items.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onClick={() => { setDayTasks(null); openTask(t.id); }}
                  onToggleFeatured={!canCreateTasks || t.parent_task_id ? null : (task) => toggleFeatured(task.id, Number(task.is_featured) !== 1)}
                />
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {showRequestLink && selectedClient && (
        <TaskRequestLinkModal client={selectedClient} onClose={() => setShowRequestLink(false)} />
      )}


      {canShareTaskCalendar && showCalendarShare && effectiveClientId && (
        <TaskCalendarShareModal
          clientId={effectiveClientId}
          clientName={selectedClient?.name || user?.client_name || 'Cliente'}
          year={year}
          month={month}
          hidePosted={hidePosted}
          onClose={() => setShowCalendarShare(false)}
        />
      )}

      {canImportTasks && showCsvImport && (
        <TaskCsvModal
          onClose={() => setShowCsvImport(false)}
          onImported={async (data) => {
            await loadTasks();
            const created = Number(data?.counts?.created || 0) + Number(data?.counts?.subtasks_created || 0);
            setCsvNotice(`Importação concluída com sucesso. ${created} tarefa(s) foram criadas.`);
          }}
        />
      )}

      {canCreateTasks && showForm && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={effectiveClientId}
          defaultDueDate={defaultTaskDate}
          userRole={user?.role}
          defaultFrontName={defaultFrontName}
          allowedTaskTypes={isSiteLP ? ['basic'] : ['basic', 'post']}
          onClose={() => { setShowForm(false); setDefaultTaskDate(''); }}
          onSaved={(task) => { setShowForm(false); setDefaultTaskDate(''); upsertTaskSummary(task); broadcastTaskUpdate(task?.id); loadTasks(); }}
        />
      )}

      {canCreateTasks && showSubtaskForm && selectedTask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={selectedTask.client_id}
          parentTaskId={selectedTask.id}
          userRole={user?.role}
          defaultFrontName={defaultFrontName}
          allowedTaskTypes={isSiteLP ? ['basic'] : ['basic', 'post']}
          onClose={() => setShowSubtaskForm(false)}
          onSaved={(task) => { setShowSubtaskForm(false); broadcastTaskUpdate(task?.id, selectedTask.id); openTask(selectedTask.id); loadTasks(); }}
        />
      )}

      {canCreateTasks && editingTask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          taskToEdit={editingTask}
          userRole={user?.role}
          defaultFrontName={defaultFrontName}
          allowedTaskTypes={isSiteLP ? ['basic'] : ['basic', 'post']}
          onClose={() => setEditingTask(null)}
          onSaved={(task) => {
            setEditingTask(null);
            setSelectedTask(null);
            upsertTaskSummary(task);
            broadcastTaskUpdate(task?.id);
            loadTasks();
          }}
        />
      )}

      {canCreateTasks && editingSubtask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          taskToEdit={editingSubtask}
          userRole={user?.role}
          defaultFrontName={defaultFrontName}
          allowedTaskTypes={isSiteLP ? ['basic'] : ['basic', 'post']}
          onClose={() => setEditingSubtask(null)}
          onSaved={(task) => {
            setEditingSubtask(null);
            broadcastTaskUpdate(task?.id, selectedTask?.id);
            if (selectedTask) openTask(selectedTask.id);
            loadTasks();
          }}
        />
      )}

      {showConvertModal && selectedTask && (
        <ModalBackdrop onClose={() => !convertingTask && setShowConvertModal(false)} disabled={convertingTask} className="z-[70]">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="font-semibold text-slate-800">Transformar em subtarefa</h2>
                <p className="text-sm text-slate-500 mt-1">Escolha a tarefa principal onde “{selectedTask.title}” será colocada.</p>
              </div>
              <button onClick={() => setShowConvertModal(false)} disabled={convertingTask} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {loadingParentOptions ? (
              <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Tarefa principal</label>
                <select
                  className="input-field"
                  value={selectedParentId}
                  onChange={(event) => setSelectedParentId(event.target.value)}
                  disabled={convertingTask || subtasks.length > 0}
                >
                  <option value="">Selecione uma tarefa</option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}{option.client_name ? ` — ${option.client_name}` : ''}
                    </option>
                  ))}
                </select>
                {parentOptions.length === 0 && !convertError && (
                  <p className="text-xs text-slate-400 mt-2">Nenhuma tarefa principal elegível foi encontrada para este cliente.</p>
                )}
              </div>
            )}

            {convertError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{convertError}</p>}

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowConvertModal(false)} disabled={convertingTask} className="btn-secondary flex-1">Cancelar</button>
              <button
                type="button"
                onClick={convertToSubtask}
                disabled={convertingTask || loadingParentOptions || !selectedParentId || subtasks.length > 0}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {convertingTask ? 'Movendo...' : 'Transformar'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {selectedTask && (
        <ModalBackdrop onClose={() => setSelectedTask(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{selectedTask.title}</h2>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            {selectedTask.details_loading ? (
              <div className="space-y-3 mb-4">
                <div className="h-3 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
              </div>
            ) : selectedTask.description && <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap">{selectedTask.description}</p>}
            {!selectedTask.details_loading && selectedTask.client_request_id && (
              <div className="mb-4 overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/55">
                <div className="flex items-center justify-between gap-3 border-b border-violet-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-violet-800"><MessageSquareText size={15} /> Solicitação do cliente</div>
                  {selectedTask.request_protocol && <span className="font-mono text-[10px] text-violet-500">{selectedTask.request_protocol}</span>}
                </div>
                <div className="grid gap-3 p-4 text-xs text-slate-600 sm:grid-cols-2">
                  <p className="flex items-start gap-2"><UserRound size={13} className="mt-0.5 shrink-0 text-violet-500" /><span><strong className="block text-slate-700">Solicitado por</strong>{selectedTask.requester_name}{selectedTask.requester_email ? ` · ${selectedTask.requester_email}` : ''}{selectedTask.requester_phone ? ` · ${selectedTask.requester_phone}` : ''}</span></p>
                  <p><strong className="block text-slate-700">Tipo</strong>{selectedTask.request_type || 'Outro'}</p>
                  <p><strong className="block text-slate-700">Data desejada pelo cliente</strong>{selectedTask.requested_due_date ? formatTaskDate(selectedTask.requested_due_date) : 'Não informada'}</p>
                  <p><strong className="block text-slate-700">Urgência percebida</strong><span className={selectedTask.request_urgency === 'urgent' ? 'font-semibold text-rose-600' : ''}>{selectedTask.request_urgency === 'urgent' ? 'Urgente' : 'Normal'}</span></p>
                  {selectedTask.request_references && <p className="sm:col-span-2"><strong className="block text-slate-700">Links / referências</strong><span className="whitespace-pre-wrap break-words">{selectedTask.request_references}</span></p>}
                  {selectedTask.request_notes && <p className="sm:col-span-2"><strong className="block text-slate-700">Observações</strong><span className="whitespace-pre-wrap">{selectedTask.request_notes}</span></p>}
                </div>
                {selectedTask.request_files?.length > 0 && (
                  <div className="border-t border-violet-100 px-4 py-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600">Anexos</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.request_files.map((file) => (
                        <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50"><Paperclip size={12} /><span className="truncate">{file.filename || 'Anexo'}</span></a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTask.request_events?.length > 0 && (
                  <div className="border-t border-violet-100 px-4 py-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600">Histórico da solicitação</p>
                    <div className="space-y-2">
                      {selectedTask.request_events.map((event) => (
                        <div key={event.id} className="flex gap-2 text-[11px] text-slate-500"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /><span><strong className="font-medium text-slate-700">{event.user_name || 'Cliente'}</strong> · {event.message}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!selectedTask.details_loading && (selectedTask.content_tag || selectedTask.content_type) && (
              <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {selectedTask.content_tag && <span className={`rounded-full border px-2.5 py-1 font-bold ${CONTENT_TAG_CLASSES[selectedTask.content_tag] || CONTENT_TAG_CLASSES.Outro}`}>{selectedTask.content_tag}</span>}
                {selectedTask.content_type && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">{CONTENT_TYPE_LABELS[selectedTask.content_type] || selectedTask.content_type}</span>}
              </div>
            )}

            {taskNeedsCorrection(selectedTask) && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <p className="flex items-center gap-2 font-bold"><AlertTriangle size={15} /> Correção pendente</p>
                {taskCorrectionFeedback(selectedTask) && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-rose-700">{taskCorrectionFeedback(selectedTask)}</p>}
                {Number(selectedTask.subtask_correction || 0) > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-semibold text-rose-700">{selectedTask.subtask_correction} subtarefa(s) precisam de ajuste:</p>
                    {subtasks.filter(taskNeedsCorrection).map((subtask) => (
                      <div key={`correction-${subtask.id}`} className="rounded-lg border border-rose-200 bg-white/80 px-2.5 py-2">
                        <p className="text-xs font-bold text-rose-800">{subtask.title}</p>
                        <p className={`mt-0.5 whitespace-pre-wrap text-[11px] leading-4 ${taskCorrectionFeedback(subtask) ? 'text-rose-700' : 'italic text-rose-400'}`}>
                          {taskCorrectionFeedback(subtask) || 'Correção solicitada sem observação.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedTask.media_loading && selectedTask.has_attachment && (
              <div className="h-24 rounded-lg bg-slate-100 animate-pulse mb-3 flex items-center justify-center text-xs text-slate-400">Carregando mídia...</div>
            )}
            {selectedTask.media_gallery && selectedTask.media_gallery.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-3">
                {selectedTask.media_gallery.map((m, idx) => (
                  <img key={idx} src={m.data} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                ))}
              </div>
            )}
            {(!selectedTask.media_gallery || selectedTask.media_gallery.length === 0) && selectedTask.attachment_data && (
              <img src={selectedTask.attachment_data} alt="" className="w-full rounded-lg mb-3 max-h-48 object-cover" />
            )}
            {selectedTask.video_link && (
              <a href={selectedTask.video_link} target="_blank" rel="noreferrer" className="text-sm text-zebrazul-600 hover:underline block mb-3">
                🎬 Abrir vídeo
              </a>
            )}
            {selectedTask.caption && (
              <div className="bg-slate-50 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Legenda</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTask.caption}</p>
              </div>
            )}
            <div className="text-xs text-slate-500 space-y-1 mb-4">
              {selectedTask.content_type && <p>Tipo de conteúdo: {selectedTask.content_type}</p>}
              {(selectedTask.due_date || selectedTask.deadline_label) && <p>Prazo: {selectedTask.due_date ? formatTaskDate(selectedTask.due_date) : selectedTask.deadline_label}</p>}
              {selectedTask.client_name && <p>Cliente: {selectedTask.client_name}</p>}
              {selectedTask.assignees && selectedTask.assignees.length > 0 && <p>Responsáveis: {selectedTask.assignees.map((a) => a.name).join(', ')}</p>}
            </div>

            {canCreateTasks && <>
            <label className="text-sm font-medium text-slate-700 block mb-2">Mover para</label>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => { updateStatus(selectedTask.id, col.key); setSelectedTask({ ...selectedTask, workflow_stage: col.key }); }}
                  className={'rounded-lg border py-2 text-xs font-medium transition-colors ' + (workflowStage(selectedTask) === col.key ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300')}
                >
                  {col.label}
                </button>
              ))}
            </div></>}

            <div className="grid grid-cols-2 gap-2 mb-5">
              {canCreateTasks && !selectedTask.parent_task_id && (
                <button
                  onClick={() => toggleFeatured(selectedTask.id, Number(selectedTask.is_featured) !== 1)}
                  className={`col-span-2 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    Number(selectedTask.is_featured) === 1
                      ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  <Star size={15} fill={Number(selectedTask.is_featured) === 1 ? 'currentColor' : 'none'} />
                  {Number(selectedTask.is_featured) === 1 ? 'Remover do destaque do painel' : 'Destacar no painel principal'}
                </button>
              )}
              {canModifySelectedTask && (
                <button onClick={editSelectedTask} disabled={selectedTask.details_loading} className="btn-primary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Pencil size={14} /> {selectedTask.media_loading ? 'Preparando...' : 'Editar tarefa'}
                </button>
              )}
              {canCreateTasks && (
                <button onClick={() => duplicateTask(selectedTask.id)} className="btn-secondary text-sm flex items-center justify-center gap-1.5">
                  <Copy size={14} /> Duplicar
                </button>
              )}
              {canCreateTasks && !selectedTask.parent_task_id && (
                <button
                  onClick={openConvertToSubtask}
                  className="btn-secondary text-sm flex items-center justify-center gap-1.5"
                  title={subtasks.length > 0 ? 'Mova ou remova as subtarefas atuais antes da conversão' : 'Escolher uma tarefa principal'}
                >
                  <ListTree size={14} /> Tornar subtarefa
                </button>
              )}
              {!isSiteLP && canCreateTasks && selectedTask.task_type === 'post' && selectedTask.client_id && (
                (selectedTask.has_attachment || selectedTask.has_gallery) ? (
                  workflowStage(selectedTask) === 'approval' ? (
                    <Link to="/aprovacao" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100">
                      <Eye size={14} /> Ver na aprovação
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendForApproval(selectedTask.id)}
                      disabled={sendingApprovalId === selectedTask.id}
                      className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      <Send size={14} /> {sendingApprovalId === selectedTask.id ? 'Enviando...' : 'Enviar para aprovação'}
                    </button>
                  )
                ) : (
                  <div className="col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-medium text-slate-500">
                    Anexe uma imagem para disponibilizar esta peça na grade de aprovação.
                  </div>
                )
              )}
            </div>
            {feedNotice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">{feedNotice}</p>}
            {feedError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{feedError}</p>}

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700">
                  Subtarefas {subtasks.length > 0 && <span className="text-slate-400 font-normal">({subtasks.filter((s) => Number(s.designer_completed || 0) === 1).length}/{subtasks.length})</span>}
                </p>
                {canCreateTasks && (
                  <button onClick={() => setShowSubtaskForm(true)} className="text-xs text-zebrazul-600 hover:underline flex items-center gap-1">
                    <ListPlus size={14} /> Adicionar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {subtasks.length === 0 && <p className="text-xs text-slate-300 text-center py-4">Nenhuma subtarefa ainda.</p>}
                {subtasks.map((s) => (
                  <div key={s.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${taskNeedsCorrection(s) ? 'border-rose-200 bg-rose-50/70' : 'border-transparent bg-slate-50'}`}>
                    <button
                      onClick={() => canCreateTasks && toggleSubtaskCompleted(s)}
                      className={'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ' + (Number(s.designer_completed || 0) === 1 ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400')}
                      title={Number(s.designer_completed || 0) === 1 ? 'Marcar como pendente de produção' : 'Marcar produção como concluída'}
                    >
                      {Number(s.designer_completed || 0) === 1 && <span className="text-white text-[10px]">✓</span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={'text-sm truncate ' + (Number(s.designer_completed || 0) === 1 ? 'text-slate-400 line-through' : 'text-slate-700')}>{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.assignees && s.assignees.length > 0 && <span className="text-[11px] text-slate-400">{s.assignees.map((a) => a.name).join(', ')}</span>}
                        {(s.due_date || s.deadline_label) && <span className="text-[11px] text-slate-400">· {s.due_date ? formatTaskDate(s.due_date) : s.deadline_label}</span>}
                      </div>
                      {taskNeedsCorrection(s) && (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenCorrectionFeedbackId((current) => current === s.id ? null : s.id)}
                            aria-expanded={openCorrectionFeedbackId === s.id}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-100"
                            title="Clique para ver o feedback da correção"
                          >
                            <AlertTriangle size={10} /> Correção solicitada
                            <ChevronDown size={11} className={`transition-transform ${openCorrectionFeedbackId === s.id ? 'rotate-180' : ''}`} />
                          </button>
                          {openCorrectionFeedbackId === s.id && (
                            <div className="mt-2 rounded-lg border border-rose-200 bg-white px-2.5 py-2 shadow-sm">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-rose-500">Feedback da correção</p>
                              <p className={`whitespace-pre-wrap text-[11px] leading-4 ${taskCorrectionFeedback(s) ? 'text-rose-700' : 'italic text-rose-400'}`}>
                                {taskCorrectionFeedback(s) || 'Correção solicitada sem observação.'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {!isSiteLP && canCreateTasks && s.task_type === 'post' && s.client_id && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {(s.has_attachment || s.has_gallery) ? (
                            workflowStage(s) === 'approval' ? (
                              <Link to="/aprovacao" className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:underline">
                                <Eye size={11} /> Na aprovação
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => sendForApproval(s.id, 'subtask')}
                                disabled={sendingApprovalId === s.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                              >
                                <Send size={11} /> {sendingApprovalId === s.id ? 'Enviando...' : 'Enviar para aprovação'}
                              </button>
                            )
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400">Anexe uma imagem para enviar para aprovação.</span>
                          )}
                        </div>
                      )}
                    </div>
                    {canCreateTasks && (
                      <InlineAssigneePicker
                        task={s}
                        teamUsers={teamUsers}
                        updating={subtaskAssigneeUpdatingId === s.id}
                        onChange={setSubtaskAssignee}
                      />
                    )}
                    {canCreateTasks && (
                      <>
                        <button
                          onClick={() => editSubtask(s.id)}
                          className="text-xs text-zebrazul-600 hover:bg-zebrazul-50 rounded-md px-2 py-1 flex items-center gap-1 shrink-0"
                          title="Editar subtarefa"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                        <button onClick={() => deleteSubtask(s.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {canModifySelectedTask && (
              <button onClick={() => deleteTask(selectedTask.id)} className="text-sm text-red-600 hover:underline mt-5">
                Excluir tarefa (e subtarefas)
              </button>
            )}
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
