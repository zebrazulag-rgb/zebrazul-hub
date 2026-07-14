import { useEffect, useState, useCallback } from 'react';
import { Plus, Calendar, ListPlus, Trash2, Copy, Grid3x3, LayoutGrid, ChevronLeft, ChevronRight, ExternalLink, Video, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';

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
      className={'card p-4 w-full text-left hover:border-zebrazul-300 transition-colors ' + (onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
    >
      <div className="flex items-start gap-2">
        {t.attachment_data ? (
          <img src={t.attachment_data} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <TypeIcon size={16} className="text-slate-400" />
          </div>
        )}
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
  const [view, setView] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [cursor, setCursor] = useState(new Date());
  const [dayTasks, setDayTasks] = useState(null);
  const [sendingToFeed, setSendingToFeed] = useState(false);
  const [feedError, setFeedError] = useState('');

  useEffect(() => {
    setLocalClientId(selectedClient?.id ? String(selectedClient.id) : 'all');
  }, [selectedClient]);

  const effectiveClientId = localClientId !== 'all' ? localClientId : null;

  const loadTasks = useCallback(async () => {
    const params = effectiveClientId ? ('?client_id=' + effectiveClientId) : '';
    const { data } = await api.get('/tasks' + params);
    setTasks(data.tasks);
  }, [effectiveClientId]);

  useEffect(() => {
    loadTasks();
    api.get('/auth/team-users').then((res) => setTeamUsers(res.data.users));
    api.get('/clients').then((res) => setClients(res.data.clients));
  }, [loadTasks]);

  async function openTask(taskId) {
    const { data } = await api.get('/tasks/' + taskId);
    setSelectedTask(data.task);
    setSubtasks(data.subtasks);
    setFeedError('');
  }

  async function updateStatus(taskId, status) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await api.put('/tasks/' + taskId, { status });
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

  async function deleteTask(id) {
    await api.delete('/tasks/' + id);
    setSelectedTask(null);
    loadTasks();
  }

  async function duplicateTask(id) {
    await api.post('/tasks/' + id + '/duplicate');
    setSelectedTask(null);
    loadTasks();
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarefas</h1>
          <p className="text-slate-500 mt-1">Organize o trabalho da equipe com prazos e responsáveis.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input-field w-48" value={localClientId} onChange={(e) => setLocalClientId(e.target.value)}>
            <option value="all">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button onClick={() => setView('kanban')} className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500')}>
              <LayoutGrid size={14} /> Kanban
            </button>
            <button onClick={() => setView('calendar')} className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'calendar' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500')}>
              <Calendar size={14} /> Calendário
            </button>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nova tarefa
          </button>
        </div>
      </div>

      {view === 'kanban' && (
        <div className="grid md:grid-cols-3 gap-5">
          {STATUS_COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
              className={'space-y-3 rounded-xl p-2 transition-colors ' + (dragOverCol === col.key ? 'bg-zebrazul-50 ring-2 ring-zebrazul-200' : '')}
            >
              <div className="flex items-center gap-2 px-1">
                <span className={'badge ' + col.badge}>{col.label}</span>
                <span className="text-xs text-slate-400">{tasks.filter((t) => t.status === col.key).length}</span>
              </div>
              <div className="space-y-3 min-h-[60px]">
                {tasks.filter((t) => t.status === col.key).map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => openTask(t.id)} onDragStart={handleDragStart} />
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
        <div className="card p-5">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
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
        </div>
      )}

      {showForm && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={effectiveClientId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadTasks(); }}
        />
      )}

      {showSubtaskForm && selectedTask && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={selectedTask.client_id}
          parentTaskId={selectedTask.id}
          onClose={() => setShowSubtaskForm(false)}
          onSaved={() => { setShowSubtaskForm(false); openTask(selectedTask.id); }}
        />
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{selectedTask.title}</h2>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            {selectedTask.description && <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap">{selectedTask.description}</p>}

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
            </div>

            <div className="flex gap-2 mb-5">
              <button onClick={() => duplicateTask(selectedTask.id)} className="btn-secondary text-sm flex-1 flex items-center justify-center gap-1.5">
                <Copy size={14} /> Duplicar
              </button>
              {selectedTask.task_type === 'post' && selectedTask.client_id && (
                selectedTask.feed_post_id ? (
                  <Link to="/feed" className="flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors">
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
                <button onClick={() => setShowSubtaskForm(true)} className="text-xs text-zebrazul-600 hover:underline flex items-center gap-1">
                  <ListPlus size={14} /> Adicionar
                </button>
              </div>
              <div className="space-y-2">
                {subtasks.length === 0 && <p className="text-xs text-slate-300 text-center py-4">Nenhuma subtarefa ainda.</p>}
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2.5">
                    <button
                      onClick={() => updateSubtaskStatus(s.id, nextStatus(s.status))}
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
                    <button onClick={() => deleteSubtask(s.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => deleteTask(selectedTask.id)} className="text-sm text-red-600 hover:underline mt-5">
              Excluir tarefa (e subtarefas)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
