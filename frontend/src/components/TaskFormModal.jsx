import { useState } from 'react';
import { X, Paperclip } from 'lucide-react';
import api from '../api';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TaskFormModal({ teamUsers, clients, defaultClientId, parentTaskId, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', assignee_id: '',
    client_id: defaultClientId || '', status: 'pending',
    attachment_data: '', attachment_mime: '', attachment_filename: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      await api.post('/tasks', { ...form, parent_task_id: parentTaskId || null });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar tarefa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-slate-800">{parentTaskId ? 'Nova subtarefa' : 'Nova tarefa'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Cliente relacionado</label>
              <select
                className="input-field"
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                disabled={!!parentTaskId}
              >
                <option value="">Nenhum — tarefa interna</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {parentTaskId && <p className="text-xs text-slate-400 mt-1">Herda o cliente da tarefa principal.</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Status inicial</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluída</option>
              </select>
            </div>
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
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Criando...' : parentTaskId ? 'Criar subtarefa' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
