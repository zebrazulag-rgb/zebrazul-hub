import { useEffect, useState, useCallback } from 'react';
import { Plus, Calendar, ListPlus, Trash2, Copy, Grid3x3, LayoutGrid, ChevronLeft, ChevronRight, ExternalLink, Video, FileText, Pencil, ListTree, ListChecks, Clock3, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import PageHero from '../components/PageHero.jsx';

const STATUS_COLUMNS = [
  { key: 'pending', label: 'Pendente', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  { key: 'done', label: 'Concluída', badge: 'bg-emerald-100 text-emerald-700' }
];

const TYPE_ICON = { post: Grid3x3, video: Video, basic: FileText };

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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

function TaskCard({ task: t, onClick, onDragStart }) {
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
          <p className="font-medium text-slate-800 text-sm">{t.title}</p>
          {t.client_name && <p className="text-xs text-zebrazul-600 mt-0.5">{t.client_name}</p>}
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
      <div className="flex items-center justify-between mt-3">
        <AssigneeStack assignees={t.assignees} />
        {t.due_date && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Calendar size={11} /> {new Date(t.due_date).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Tasks() {
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const [view, setView] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [cursor, setCursor] = useState(new Date());
  const [dayTasks, setDayTasks] = useState(null);
  const [sendingToFeed, setSendingToFeed] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [parentOptions, setParentOptions] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [loadingParentOptions, setLoadingParentOptions] = useState(false);
  const [convertingTask, setConvertingTask] = useState(false);
  const [convertError, setConvertError] = useState('');

  useEffect(() => {
    setLocalClientId(user?.role === 'client' ? String(user.client_id || '') : (selectedClient?.id ? String(selectedClient.id) : 'all'));
  }, [selectedClient, user?.role, user?.client_id]);

  const effectiveClientId = localClientId !== 'all' ? localClientId : null;

  const loadTasks = useCallback(async () => {
    const params = effectiveClientId ? ('?client_id=' + effectiveClientId) : '';
    const { data } = await api.get('/tasks' + params);
    setTasks(data.tasks);
  }, [effectiveClientId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

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
      if (effectiveClientId && String(task.client_id || '') !== String(effectiveClientId)) {
        return previous.filter((item) => item.id !== task.id);
      }
      const exists = previous.some((item) => item.id === task.id);
      const next = exists
        ? previous.map((item) => item.id === task.id ? { ...item, ...task } : item)
        : [...previous, task];
      return next.sort((a, b) => String(a.due_date || a.created_at || '').localeCompare(String(b.due_date || b.created_at || '')));
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
    setTaskError('');

    try {
      const { data } = await api.get('/tasks/' + taskId);
      setSelectedTask((previous) => previous?.id === taskId
        ? { ...previous, ...data.task, details_loading: false }
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

  async function updateStatus(taskId, status) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await api.put('/tasks/' + taskId, { status });
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

  async function updateSubtaskStatus(subtaskId, status) {
    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, status } : s)));
    await api.put('/tasks/' + subtaskId, { status });
    loadTasks();
  }

  async function deleteSubtask(subtaskId) {
    await api.delete('/tasks/' + subtaskId);
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
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
    setSelectedTask(null);
  }

  async function duplicateTask(id) {
    const { data } = await api.post('/tasks/' + id + '/duplicate');
    upsertTaskSummary(data.task);
    setSelectedTask(null);
  }

  async function sendToFeed(id) {
    setSendingToFeed(true);
    setFeedError('');
    try {
      const { data } = await api.post('/tasks/' + id + '/add-to-feed');
      setSelectedTask((prev) => ({ ...prev, feed_post_id: data.post_id }));
    } catch (err) {
      setFeedError(err.response?.data?.error || 'Erro ao enviar para o feed.');
    } finally {
      setSendingToFeed(false);
    }
  }

  function handleDragStart(e, taskId) {
    e.dataTransfer.setData('text/task-id', String(taskId));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e, columnKey) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = Number(e.dataTransfer.getData('text/task-id'));
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== columnKey) updateStatus(taskId, columnKey);
  }

  function nextStatus(status) {
    if (status === 'pending') return 'in_progress';
    if (status === 'in_progress') return 'done';
    return 'pending';
  }

  const canModifySelectedTask = selectedTask && (
    ['admin', 'team'].includes(user?.role) ||
    (user?.role === 'client' && Number(selectedTask.created_by) === Number(user.id) && selectedTask.status === 'pending')
  );

  const taskOverview = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = buildMonthGrid(year, month);

  function tasksForDay(day) {
    if (!day) return [];
    return tasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={ListChecks}
        eyebrow={user?.role === 'client' ? 'Solicitações para a equipe' : 'Operação e entregas'}
        title="Tarefas"
        description={user?.role === 'client'
          ? 'Envie solicitações diretamente para a equipe da Zebrazul e acompanhe cada etapa.'
          : 'Organize prioridades, responsáveis e prazos em uma visão clara da operação.'}
        actions={
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] transition hover:-translate-y-0.5 hover:shadow-xl">
            <Plus size={17} /> Nova tarefa
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: taskOverview.total, icon: ListChecks, color: 'text-blue-300' },
            { label: 'Pendentes', value: taskOverview.pending, icon: Clock3, color: 'text-amber-300' },
            { label: 'Em andamento', value: taskOverview.inProgress, icon: Calendar, color: 'text-cyan-300' },
            { label: 'Concluídas', value: taskOverview.done, icon: CheckCircle2, color: 'text-emerald-300' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/45"><item.icon size={14} className={item.color} /> {item.label}</div>
              <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <div className="toolbar-panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {user?.role !== 'client' ? (
          <select className="input-field sm:max-w-[260px]" value={localClientId} onChange={(e) => setLocalClientId(e.target.value)}>
            <option value="all">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <span className="text-sm font-medium text-slate-500">Acompanhe suas solicitações</span>}
        <div className="segmented-control">
          <button onClick={() => setView('kanban')} className={'segmented-control-button flex items-center gap-1.5 ' + (view === 'kanban' ? 'segmented-control-button-active' : '')}>
            <LayoutGrid size={14} /> Kanban
          </button>
          <button onClick={() => setView('calendar')} className={'segmented-control-button flex items-center gap-1.5 ' + (view === 'calendar' ? 'segmented-control-button-active' : '')}>
            <Calendar size={14} /> Calendário
          </button>
        </div>
      </div>

      {taskError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{taskError}</p>}

      {view === 'kanban' && (
        <div className="grid gap-5 md:grid-cols-3">
          {STATUS_COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
              className={'min-h-[420px] rounded-[24px] border border-slate-200/70 bg-slate-50/55 p-3 transition ' + (dragOverCol === col.key ? 'border-[#0969ff]/30 bg-[#eef5ff] ring-4 ring-[#0969ff]/8' : '')}
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2"><span className={'badge ' + col.badge}>{col.label}</span></div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-white px-2 text-xs font-semibold text-slate-500 shadow-sm">{tasks.filter((t) => t.status === col.key).length}</span>
              </div>
              <div className="space-y-3 min-h-[60px]">
                {tasks.filter((t) => t.status === col.key).map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => openTask(t.id)} onDragStart={user?.role === 'client' ? null : handleDragStart} />
                ))}
                {tasks.filter((t) => t.status === col.key).length === 0 && (
                  <p className="text-xs text-slate-300 text-center py-6">Arraste um card aqui.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'calendar' && (
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-semibold text-slate-800">{MONTHS[month]} de {year}</h2>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400 mb-2">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, idx) => {
              const dayItems = tasksForDay(day);
              const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  key={idx}
                  disabled={!day}
                  onClick={() => day && dayItems.length > 0 && setDayTasks({ day: day, items: dayItems })}
                  className={'aspect-square rounded-lg border p-1.5 text-left flex flex-col ' + (!day ? 'border-transparent' : 'border-slate-100 hover:border-zebrazul-300') + ' ' + (isToday ? 'ring-2 ring-zebrazul-400' : '')}
                >
                  {day && (
                    <>
                      <span className="text-xs text-slate-500">{day}</span>
                      {dayItems.length > 0 && (
                        <span className="mt-auto text-[10px] text-zebrazul-600 font-medium">{dayItems.length} tarefa{dayItems.length > 1 ? 's' : ''}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {dayTasks && (
        <ModalBackdrop onClose={() => setDayTasks(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Tarefas — {dayTasks.day} de {MONTHS[month]}</h2>
              <button onClick={() => setDayTasks(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {dayTasks.items.map((t) => (
                <TaskCard key={t.id} task={t} onClick={() => { setDayTasks(null); openTask(t.id); }} />
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {showForm && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={effectiveClientId}
          userRole={user?.role}
          onClose={() => setShowForm(false)}
          onSaved={(task) => { setShowForm(false); upsertTaskSummary(task); }}
        />
      )}

      {showSubtaskForm && selectedTask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={selectedTask.client_id}
          parentTaskId={selectedTask.id}
          userRole={user?.role}
          onClose={() => setShowSubtaskForm(false)}
          onSaved={() => { setShowSubtaskForm(false); openTask(selectedTask.id); loadTasks(); }}
        />
      )}

      {editingTask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          taskToEdit={editingTask}
          userRole={user?.role}
          onClose={() => setEditingTask(null)}
          onSaved={(task) => {
            setEditingTask(null);
            setSelectedTask(null);
            upsertTaskSummary(task);
          }}
        />
      )}

      {editingSubtask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          taskToEdit={editingSubtask}
          userRole={user?.role}
          onClose={() => setEditingSubtask(null)}
          onSaved={() => {
            setEditingSubtask(null);
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
              {selectedTask.due_date && <p>Data: {new Date(selectedTask.due_date).toLocaleDateString('pt-BR')}</p>}
              {selectedTask.client_name && <p>Cliente: {selectedTask.client_name}</p>}
              {selectedTask.assignees && selectedTask.assignees.length > 0 && <p>Responsáveis: {selectedTask.assignees.map((a) => a.name).join(', ')}</p>}
            </div>

            {user?.role !== 'client' && <>
            <label className="text-sm font-medium text-slate-700 block mb-2">Mover para</label>
            <div className="flex gap-2 mb-4">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => { updateStatus(selectedTask.id, col.key); setSelectedTask({ ...selectedTask, status: col.key }); }}
                  className={'flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ' + (selectedTask.status === col.key ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300')}
                >
                  {col.label}
                </button>
              ))}
            </div></>}

            <div className="grid grid-cols-2 gap-2 mb-5">
              {canModifySelectedTask && (
                <button onClick={editSelectedTask} disabled={selectedTask.details_loading} className="btn-primary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Pencil size={14} /> {selectedTask.media_loading ? 'Preparando...' : 'Editar tarefa'}
                </button>
              )}
              {user?.role !== 'client' && (
                <button onClick={() => duplicateTask(selectedTask.id)} className="btn-secondary text-sm flex items-center justify-center gap-1.5">
                  <Copy size={14} /> Duplicar
                </button>
              )}
              {user?.role !== 'client' && !selectedTask.parent_task_id && (
                <button
                  onClick={openConvertToSubtask}
                  className="btn-secondary text-sm flex items-center justify-center gap-1.5"
                  title={subtasks.length > 0 ? 'Mova ou remova as subtarefas atuais antes da conversão' : 'Escolher uma tarefa principal'}
                >
                  <ListTree size={14} /> Tornar subtarefa
                </button>
              )}
              {user?.role !== 'client' && selectedTask.task_type === 'post' && selectedTask.client_id && (
                selectedTask.feed_post_id ? (
                  <Link to={`/feed?client_id=${selectedTask.client_id}`} className="flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors">
                    <ExternalLink size={14} /> Ver no Feed
                  </Link>
                ) : (
                  <button
                    onClick={() => sendToFeed(selectedTask.id)}
                    disabled={sendingToFeed}
                    className="flex-1 bg-zebrazul-50 text-zebrazul-700 hover:bg-zebrazul-100 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Grid3x3 size={14} /> {sendingToFeed ? 'Enviando...' : 'Adicionar à grade'}
                  </button>
                )
              )}
            </div>
            {feedError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{feedError}</p>}

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700">
                  Subtarefas {subtasks.length > 0 && <span className="text-slate-400 font-normal">({subtasks.filter((s) => s.status === 'done').length}/{subtasks.length})</span>}
                </p>
                {user?.role !== 'client' && (
                  <button onClick={() => setShowSubtaskForm(true)} className="text-xs text-zebrazul-600 hover:underline flex items-center gap-1">
                    <ListPlus size={14} /> Adicionar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {subtasks.length === 0 && <p className="text-xs text-slate-300 text-center py-4">Nenhuma subtarefa ainda.</p>}
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2.5">
                    <button
                      onClick={() => user?.role !== 'client' && updateSubtaskStatus(s.id, nextStatus(s.status))}
                      className={'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ' + (s.status === 'done' ? 'bg-emerald-500 border-emerald-500' : s.status === 'in_progress' ? 'border-amber-400' : 'border-slate-300')}
                      title="Clique para avançar o status"
                    >
                      {s.status === 'done' && <span className="text-white text-[10px]">✓</span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={'text-sm truncate ' + (s.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700')}>{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.assignees && s.assignees.length > 0 && <span className="text-[11px] text-slate-400">{s.assignees.map((a) => a.name).join(', ')}</span>}
                        {s.due_date && <span className="text-[11px] text-slate-400">· {new Date(s.due_date).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    </div>
                    {(['admin', 'team'].includes(user?.role) || (user?.role === 'client' && Number(s.created_by) === Number(user.id) && s.status === 'pending')) && (
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
