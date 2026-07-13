import { useEffect, useState, useCallback } from 'react';
import { Plus, Paperclip, Calendar, X } from 'lucide-react';
import api from '../api';

const STATUS_COLUMNS = [
  { key: 'pending', label: 'Pendente', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  { key: 'done', label: 'Concluída', badge: 'bg-emerald-100 text-emerald-700' }
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', assignee_id: '', client_id: '',
    status: 'pending', attachment_data: '', attachment_mime: '', attachment_filename: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    const { data } = await api.get('/tasks');
    setTasks(data.tasks);
  }, []);

  useEffect(() => {
    loadTasks();
    api.get('/auth/team-users').then((res) => setTeamUsers(res.data.users));
    api.get('/clients').then((res) => setClients(res.data.clients));
  }, [loadTasks]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    setForm((f) => ({ ...f, attachment_data: dataUrl, attachment_mime: file.type, attachment_filename: file.name }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title) { setError('Informe um título para a tarefa.'); return; }
    setSaving(true);
    try {
      await api.post('/tasks', form);
      setShowForm(false);
      setForm({ title: '', description: '', due_date: '', assignee_id: '', client_id: '', status: 'pending', attachment_data: '', attachment_mime: '', attachment_filename: '' });
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(task, status) {
    await api.put(`/tasks/${task.id}`, { status });
    loadTasks();
  }

  async function deleteTask(id) {
    await api.delete(`/tasks/${id}`);
    setSelectedTask(null);
    loadTasks();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarefas</h1>
          <p className="text-slate-500 mt-1">Organize o trabalho da equipe com prazos e responsáveis.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nova tarefa
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {STATUS_COLUMNS.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`badge ${col.badge}`}>{col.label}</span>
              <span className="text-xs text-slate-400">
                {tasks.filter((t) => t.status === col.key).length}
              </span>
            </div>
            <div className="space-y-3">
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <button key={t.id} onClick={() => setSelectedTask(t)} className="card p-4 w-full text-left hover:border-zebrazul-300 transition-colors">
                  <p className="font-medium text-slate-800 text-sm">{t.title}</p>
                  {t.client_name && <p className="text-xs text-zebrazul-600 mt-1">{t.client_name}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5">
                      {t.assignee_name && (
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: t.assignee_color || '#2563eb' }}
                        >
                          {t.assignee_name[0]?.toUpperCase()}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{t.assignee_name || 'Sem responsável'}</span>
                    </div>
                    {t.due_date && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar size={11} /> {new Date(t.due_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {tasks.filter((t) => t.status === col.key).length === 0 && (
                <p className="text-xs text-slate-300 text-center py-6">Nenhuma tarefa aqui.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-slate-800">Nova tarefa</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Título</label>
                <input
                  className="input-field"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Preparar briefing de campanha"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Descrição</label>
                <textarea
                  className="input-field min-h-[90px]"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalhe o que precisa ser feito..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Prazo</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Responsável</label>
                  <select
                    className="input-field"
                    value={form.assignee_id}
                    onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                  >
                    <option value="">Sem responsável</option>
                    {teamUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Cliente relacionado (opcional)</label>
                <select
                  className="input-field"
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                >
                  <option value="">Nenhum — tarefa interna</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Anexo</label>
                <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-3 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                  <Paperclip size={16} />
                  {form.attachment_filename || 'Clique para anexar um arquivo'}
                  <input type="file" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Criando...' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{selectedTask.title}</h2>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            {selectedTask.description && <p className="text-sm text-slate-600 mb-4 whitespace-pre-wrap">{selectedTask.description}</p>}
            <div className="text-xs text-slate-500 space-y-1 mb-4">
              {selectedTask.due_date && <p>Prazo: {new Date(selectedTask.due_date).toLocaleDateString('pt-BR')}</p>}
              {selectedTask.assignee_name && <p>Responsável: {selectedTask.assignee_name}</p>}
              {selectedTask.client_name && <p>Cliente: {selectedTask.client_name}</p>}
            </div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Mover para</label>
            <div className="flex gap-2 mb-4">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => { updateStatus(selectedTask, col.key); setSelectedTask({ ...selectedTask, status: col.key }); }}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                    selectedTask.status === col.key ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
            <button onClick={() => deleteTask(selectedTask.id)} className="text-sm text-red-600 hover:underline">
              Excluir tarefa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
