import { useState } from 'react';
import { X, ImagePlus, FileText, Grid3x3, Video, Trash2 } from 'lucide-react';
import api from '../api';

const CONTENT_TYPES = ['feed', 'reels', 'story', 'carrossel', 'artigo'];

const TASK_TYPES = [
  { value: 'basic', label: 'Tarefa básica', icon: FileText },
  { value: 'post', label: 'Post', icon: Grid3x3 },
  { value: 'video', label: 'Gravação e Edição de Vídeo', icon: Video }
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function TaskFormModal({ teamUsers, clients, defaultClientId, parentTaskId, taskToEdit, userRole, onClose, onSaved }) {
  const isEditing = Boolean(taskToEdit?.id);
  const [form, setForm] = useState(() => ({
    task_type: taskToEdit?.task_type || 'basic',
    title: taskToEdit?.title || '',
    description: taskToEdit?.description || '',
    content_type: taskToEdit?.content_type || '',
    caption: taskToEdit?.caption || '',
    video_link: taskToEdit?.video_link || '',
    due_date: taskToEdit?.due_date ? taskToEdit.due_date.slice(0, 10) : todayISO(),
    assignee_ids: taskToEdit?.assignees?.map((a) => a.id) || [],
    client_id: taskToEdit?.client_id || defaultClientId || '',
    status: taskToEdit?.status || 'pending',
    attachment_data: taskToEdit?.attachment_data || '',
    attachment_mime: taskToEdit?.attachment_mime || '',
    attachment_filename: taskToEdit?.attachment_filename || '',
    media_gallery: taskToEdit?.media_gallery || []
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mediaDirty, setMediaDirty] = useState(!isEditing);

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const converted = await Promise.all(files.map(async (file) => ({
      data: await fileToBase64(file), mime: file.type, filename: file.name
    })));
    setMediaDirty(true);
    setForm((f) => {
      const gallery = [...f.media_gallery, ...converted];
      return {
        ...f,
        media_gallery: gallery,
        // mantém o primeiro item também como attachment_data (usado no envio pro Feed)
        attachment_data: f.attachment_data || converted[0].data,
        attachment_mime: f.attachment_mime || converted[0].mime,
        attachment_filename: f.attachment_filename || converted[0].filename
      };
    });
  }

  function removeMedia(idx) {
    setMediaDirty(true);
    setForm((f) => {
      const gallery = f.media_gallery.filter((_, i) => i !== idx);
      const first = gallery[0];
      return {
        ...f,
        media_gallery: gallery,
        attachment_data: first?.data || '',
        attachment_mime: first?.mime || '',
        attachment_filename: first?.filename || ''
      };
    });
  }

  function toggleAssignee(userId) {
    setForm((f) => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(userId)
        ? f.assignee_ids.filter((id) => id !== userId)
        : [...f.assignee_ids, userId]
    }));
  }

  function changeClient(clientId) {
    const normalizedClientId = Number(clientId) || null;
    setForm((current) => ({
      ...current,
      client_id: clientId,
      assignee_ids: current.assignee_ids.filter((userId) => {
        const member = teamUsers.find((item) => item.id === userId);
        if (!member || member.role === 'admin' || !normalizedClientId) return true;
        return (member.client_ids || []).includes(normalizedClientId);
      })
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title) { setError('Informe um título para a tarefa.'); return; }
    setSaving(true);
    try {
      const payload = {
        task_type: form.task_type,
        title: form.title,
        description: form.description,
        content_type: form.content_type,
        caption: form.caption,
        video_link: form.video_link,
        due_date: form.due_date || null,
        assignee_ids: form.assignee_ids,
        client_id: form.client_id || null,
        status: form.status
      };

      if (!isEditing || mediaDirty) {
        payload.media_gallery = form.media_gallery;
        payload.attachment_data = form.attachment_data || null;
        payload.attachment_mime = form.attachment_mime || null;
        payload.attachment_filename = form.attachment_filename || null;
      }

      const response = isEditing
        ? await api.put(`/tasks/${taskToEdit.id}`, payload)
        : await api.post('/tasks', { ...payload, parent_task_id: parentTaskId || null });
      onSaved(response.data.task || null);
    } catch (err) {
      setError(err.response?.data?.error || (isEditing ? 'Erro ao editar tarefa.' : 'Erro ao criar tarefa.'));
    } finally {
      setSaving(false);
    }
  }

  const isPost = form.task_type === 'post';
  const isVideo = form.task_type === 'video';
  const selectedClientId = Number(form.client_id) || null;
  const visibleTeamUsers = teamUsers.filter((member) => {
    if (member.role === 'admin' || !selectedClientId) return true;
    if ((member.client_ids || []).includes(selectedClientId)) return true;
    return form.assignee_ids.includes(member.id);
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-slate-800">{isEditing ? 'Editar tarefa' : parentTaskId ? 'Nova subtarefa' : 'Nova tarefa'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Tipo de tarefa</label>
            <div className="grid grid-cols-3 gap-2">
              {TASK_TYPES.map((tt) => (
                <button
                  type="button"
                  key={tt.value}
                  onClick={() => setForm({ ...form, task_type: tt.value })}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                    form.task_type === tt.value ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  <tt.icon size={16} />
                  {tt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Título</label>
            <input
              className="input-field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={isPost ? 'Ex: Post institucional - dia das mães' : isVideo ? 'Ex: Vídeo depoimento cliente' : 'Ex: Organizar planilha de métricas'}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              {isPost ? 'Ideia do conteúdo' : isVideo ? 'Roteiro / briefing' : 'Descrição'}
            </label>
            <textarea
              className="input-field min-h-[70px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhe o que precisa ser feito..."
            />
          </div>

          {isPost && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Tipo de conteúdo</label>
                  <select className="input-field" value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}>
                    <option value="">Não definido</option>
                    {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Data de postagem</label>
                  <input type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Legenda</label>
                <textarea className="input-field min-h-[70px]" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Legenda com CTA e hashtags..." />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Mídia (pode anexar mais de uma)</label>
                <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-3 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                  <ImagePlus size={16} />
                  Clique para anexar imagens
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                </label>
                {form.media_gallery.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.media_gallery.map((m, idx) => (
                      <div key={idx} className="relative">
                        <img src={m.data} alt="" className="w-14 h-14 rounded-lg object-cover" />
                        <button type="button" onClick={() => removeMedia(idx)} className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5 text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {isVideo && (
            <>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Prazo</label>
                <input type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Link do vídeo (Drive, YouTube não listado, etc.)</label>
                <input className="input-field" value={form.video_link} onChange={(e) => setForm({ ...form, video_link: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Thumbnail / referência (opcional)</label>
                <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-3 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                  <ImagePlus size={16} />
                  {form.attachment_filename || 'Clique para anexar uma imagem'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </>
          )}

          {!isPost && !isVideo && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Prazo</label>
              <input type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Responsáveis</label>
            <div className="flex flex-wrap gap-2">
              {visibleTeamUsers.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggleAssignee(u.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    form.assignee_ids.includes(u.id) ? 'bg-zebrazul-600 text-white border-zebrazul-600' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {u.name}
                </button>
              ))}
              {visibleTeamUsers.length === 0 && <p className="text-xs text-slate-400">Nenhum membro tem acesso a este cliente.</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Cliente relacionado</label>
              <select className="input-field" value={form.client_id} onChange={(e) => changeClient(e.target.value)} disabled={!!parentTaskId || userRole === 'client'}>
                <option value="">Nenhum — tarefa interna</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Status inicial</label>
              <select className="input-field" value={form.status} disabled={userRole === 'client'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluída</option>
              </select>
            </div>
          </div>

          {!isPost && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Anexo</label>
              <label className="flex items-center gap-2 justify-center border-2 border-dashed border-slate-300 rounded-lg py-3 cursor-pointer hover:border-zebrazul-400 transition-colors text-sm text-slate-500">
                <ImagePlus size={16} />
                {form.attachment_filename || 'Clique para anexar um arquivo'}
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : parentTaskId ? 'Criar subtarefa' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
