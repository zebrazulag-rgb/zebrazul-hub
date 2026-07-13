import { useEffect, useState, useCallback } from 'react';
import { Plus, Calendar, ListPlus, Trash2 } from 'lucide-react';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';

const STATUS_COLUMNS = [
  { key: 'pending', label: 'Pendente', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  { key: 'done', label: 'Concluída', badge: 'bg-emerald-100 text-emerald-700' }
];

export default function Tasks() {
  const { selectedClient } = useClientFilter();
  const [tasks, setTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [dragOverCol, setDragOverCol] = useState(null);

  const loadTasks = useCallback(async () => {
    const params = selectedClient ? `?client_id=${selectedClient.id}` : '';
    const { data } = await api.get(`/tasks${params}`);
    setTasks(data.tasks);
  }, [selectedClient]);

  useEffect(() => {
    loadTasks();
    api.get('/auth/team-users').then((res) => setTeamUsers(res.data.users));
    api.get('/clients').then((res) => setClients(res.data.clients));
  }, [loadTasks]);

  async function openTask(taskId) {
    const { data } = await api.get(`/tasks/${taskId}`);
    setSelectedTask(data.task);
    setSubtasks(data.subtasks);
  }

  async function updateStatus(taskId, status) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await api.put(`/tasks/${taskId}`, { status });
  }

  async function updateSubtaskStatus(subtaskId, status) {
    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, status } : s)));
    await api.put(`/tasks/${subtaskId}`, { status });
    loadTasks(); // atualiza o contador de progresso no card
  }

  async function deleteSubtask(subtaskId) {
    await api.delete(`/tasks/${subtaskId}`);
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    loadTasks();
  }

  async function deleteTask(id) {
    await api.delete(`/tasks/${id}`);
    setSelectedTask(null);
    loadTasks();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarefas</h1>
          <p className="text-slate-500 mt-1">
            {selectedClient ? `Tarefas relacionadas a ${selectedClient.name}. Arraste os cards entre as colunas.` : 'Organize o trabalho da equipe com prazos e responsáveis.'}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nova tarefa
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {STATUS_COLUMNS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`space-y-3 rounded-xl p-2 transition-colors ${dragOverCol === col.key ? 'bg-zebrazul-50 ring-2 ring-zebrazul-200' : ''}`}
          >
            <div className="flex items-center gap-2 px-1">
              <span className={`badge ${col.badge}`}>{col.label}</span>
              <span className="text-xs text-slate-400">
                {tasks.filter((t) => t.status === col.key).length}
              </span>
            </div>
            <div className="space-y-3 min-h-[60px]">
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.id)}
                  onClick={() => openTask(t.id)}
                  className="card p-4 w-full text-left hover:border-zebrazul-300 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <p className="font-medium text-slate-800 text-sm">{t.title}</p>
                  {t.client_name && <p className="text-xs text-zebrazul-600 mt-1">{t.client_name}</p>}
                  {t.subtask_total > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zebrazul-500 rounded-full"
                          style={{ width: `${(t.subtask_done / t.subtask_total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{t.subtask_done}/{t.subtask_total}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5">
                      {t.assignee_name && (
                        t.assignee_avatar ? (
                          <img src={t.assignee_avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: t.assignee_color || '#2563eb' }}
                          >
                            {t.assignee_name[0]?.toUpperCase()}
                          </span>
                        )
                      )}
                      <span className="text-xs text-slate-400">{t.assignee_name || 'Sem responsável'}</span>
                    </div>
                    {t.due_date && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar size={11} /> {new Date(t.due_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {tasks.filter((t) => t.status === col.key).length === 0 && (
                <p className="text-xs text-slate-300 text-center py-6">Arraste um card aqui.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <TaskFormModal
          teamUsers={teamUsers}
          clients={clients}
          defaultClientId={selectedClient?.id}
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
            {selectedTask.description && <p className="text-sm text-slate-600 mb-4 whitespace-pre-wrap">{selectedTask.description}</p>}
            <div className="text-xs text-slate-500 space-y-1 mb-4">
              {selectedTask.due_date && <p>Prazo: {new Date(selectedTask.due_date).toLocaleDateString('pt-BR')}</p>}
              {selectedTask.assignee_name && <p>Responsável: {selectedTask.assignee_name}</p>}
              {selectedTask.client_name && <p>Cliente: {selectedTask.client_name}</p>}
              {selectedTask.attachment_filename && <p>Anexo: {selectedTask.attachment_filename}</p>}
            </div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Mover para</label>
            <div className="flex gap-2 mb-5">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => { updateStatus(selectedTask.id, col.key); setSelectedTask({ ...selectedTask, status: col.key }); }}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                    selectedTask.status === col.key ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>

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
                {subtasks.length === 0 && (
                  <p className="text-xs text-slate-300 text-center py-4">Nenhuma subtarefa ainda.</p>
                )}
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2.5">
                    <button
                      onClick={() => updateSubtaskStatus(s.id, nextStatus(s.status))}
                      className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        s.status === 'done' ? 'bg-emerald-500 border-emerald-500' : s.status === 'in_progress' ? 'border-amber-400' : 'border-slate-300'
                      }`}
                      title="Clique para avançar o status"
                    >
                      {s.status === 'done' && <span className="text-white text-[10px]">✓</span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${s.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.assignee_name && <span className="text-[11px] text-slate-400">{s.assignee_name}</span>}
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
