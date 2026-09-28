import { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, FileText, Grid3x3, Trash2, Star, Palette } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import { formChanged } from '../utils/formState.js';

const CONTENT_TYPES = [
  { value: 'feed', label: 'Estático' },
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'story', label: 'Stories' },
  { value: 'presentation', label: 'Apresentação' },
  { value: 'print', label: 'Impresso' },
];

const TASK_TYPES = [
  { value: 'basic', label: 'Tarefa básica', icon: FileText },
  { value: 'post', label: 'Post', icon: Grid3x3 },
];

const CONTENT_TAGS = ['Venda', 'Trend', 'Institucional', 'Feriado', 'Outro'];

const WORKFLOW_STAGES = [
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'correction', label: 'Em correção' },
  { value: 'internal_approval', label: 'Em aprovação interna' },
  { value: 'external_approval', label: 'Em aprovação externa' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'posted', label: 'Postado' },
];

function workflowStageFromTask(task) {
  if (task?.workflow_stage) return task.workflow_stage;
  if (task?.status === 'posted') return 'posted';
  if (task?.status === 'done') return 'approved';
  if (task?.status === 'in_progress') return 'in_progress';
  return 'todo';
}

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

function AutoGrowTextarea({ value, onChange, minHeight = 110, className = '', ...props }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);

  return (
    <textarea
      ref={textareaRef}
      className={`input-field resize-none overflow-hidden ${className}`.trim()}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
}

export default function TaskFormModal({ teamUsers, clients, defaultClientId, defaultDueDate, defaultFrontName = '', allowedTaskTypes = ['basic', 'post'], parentTaskId, taskToEdit, userRole, onClose, onSaved }) {
  const isEditing = Boolean(taskToEdit?.id);
  const visibleTaskTypes = TASK_TYPES.filter((item) => allowedTaskTypes.includes(item.value));
  const initialForm = {
    task_type: taskToEdit?.task_type || visibleTaskTypes[0]?.value || 'basic',
    title: taskToEdit?.title || '',
    description: taskToEdit?.description || '',
    front_name: taskToEdit?.front_name || defaultFrontName || '',
    content_tag: taskToEdit?.content_tag || '',
    content_type: taskToEdit?.content_type || '',
    caption: taskToEdit?.caption || '',
    video_link: taskToEdit?.video_link || '',
    due_date: taskToEdit?.due_date ? taskToEdit.due_date.slice(0, 10) : (defaultDueDate || todayISO()),
    assignee_ids: taskToEdit?.assignees?.map((a) => a.id) || [],
    client_id: taskToEdit?.client_id || defaultClientId || '',
    workflow_stage: workflowStageFromTask(taskToEdit),
    is_featured: Number(taskToEdit?.is_featured) === 1,
    attachment_data: taskToEdit?.attachment_data || '',
    attachment_mime: taskToEdit?.attachment_mime || '',
    attachment_filename: taskToEdit?.attachment_filename || '',
    media_gallery: taskToEdit?.media_gallery || []
  };
  const initialFormRef = useRef(initialForm);
  const [form, setForm] = useState(initialForm);
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
        if (!member || member.role === 'admin' || member.is_operations_head || !normalizedClientId) return true;
        return (member.client_ids || []).includes(normalizedClientId);
      })
    }));
  }

  async function persistTask() {
    setError('');
    if (!form.title.trim()) {
      setError('Informe um título para a tarefa.');
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        task_type: form.task_type,
        title: form.title.trim(),
        description: form.description,
        front_name: form.front_name,
        content_tag: form.content_tag,
        content_type: form.content_type,
        caption: form.caption,
        video_link: form.video_link,
        due_date: form.due_date || null,
        assignee_ids: form.assignee_ids,
        client_id: form.client_id || null,
        workflow_stage: form.workflow_stage
      };

      if (canFeatureTask) payload.is_featured = form.is_featured ? 1 : 0;

      if (!isEditing || mediaDirty) {
        payload.media_gallery = form.media_gallery;
        payload.attachment_data = form.attachment_data || null;
        payload.attachment_mime = form.attachment_mime || null;
        payload.attachment_filename = form.attachment_filename || null;
      }

      const response = isEditing
        ? await api.put(`/tasks/${taskToEdit.id}`, payload)
        : await api.post('/tasks', { ...payload, parent_task_id: parentTaskId || null });
      return response.data.task || null;
    } catch (err) {
      setError(err.response?.data?.error || (isEditing ? 'Erro ao editar tarefa.' : 'Erro ao criar tarefa.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const savedTask = await persistTask();
    if (savedTask !== false) onSaved(savedTask);
  }

  async function handleRequestClose() {
    if (!isEditing || !formChanged(initialFormRef.current, form)) {
      onClose();
      return;
    }

    const savedTask = await persistTask();
    if (savedTask !== false) onSaved(savedTask);
  }


  const isPost = form.task_type === 'post';
  const canFeatureTask = userRole !== 'client' && !parentTaskId && !taskToEdit?.parent_task_id;
  const selectedClientId = Number(form.client_id) || null;
  const visibleTeamUsers = teamUsers.filter((member) => {
    if (member.role === 'admin' || member.is_operations_head || !selectedClientId) return true;
    if ((member.client_ids || []).includes(selectedClientId)) return true;
    return form.assignee_ids.includes(member.id);
  });

  return (
    <ModalBackdrop onClose={handleRequestClose} disabled={saving} className="z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-slate-800">{isEditing ? 'Editar tarefa' : parentTaskId ? 'Nova subtarefa' : 'Nova tarefa'}</h2>
          <div className="flex items-center gap-2">
            <a href="/designer/moodboard" target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="Abrir o Moodboard do cliente em outra aba">
              <Palette size={14} /> Ver Moodboard
            </a>
            <button type="button" onClick={handleRequestClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="max-h-[calc(94vh-65px)] overflow-y-auto p-6 md:p-7 space-y-5">
          {visibleTaskTypes.length > 1 && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Tipo de demanda</label>
              <div className="grid grid-cols-2 gap-2">
                {visibleTaskTypes.map((tt) => (
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
          )}

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Título</label>
            <input
              className="input-field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={isPost ? 'Ex: Post institucional - dia das mães' : 'Ex: Organizar referências para a peça'}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              {isPost ? 'Ideia do conteúdo' : 'Descrição'}
            </label>
            <AutoGrowTextarea
              minHeight={120}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhe o que precisa ser feito..."
            />
          </div>

          {isPost && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Tag</label>
                  <select className="input-field" value={form.content_tag} onChange={(e) => setForm({ ...form, content_tag: e.target.value })}>
                    <option value="">Sem tag</option>
                    {CONTENT_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Tipo de conteúdo</label>
                  <select className="input-field" value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}>
                    <option value="">Não definido</option>
                    {CONTENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Data de postagem</label>
                  <input type="date" className="input-field" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Legenda</label>
                <AutoGrowTextarea
                  minHeight={140}
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  placeholder="Legenda com CTA e hashtags..."
                />
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

          {!isPost && (
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Cliente relacionado</label>
              <select className="input-field" value={form.client_id} onChange={(e) => changeClient(e.target.value)} disabled={!!parentTaskId || userRole === 'client'}>
                <option value="">Nenhum — tarefa interna</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Etapa inicial</label>
              <select className="input-field" value={form.workflow_stage} disabled={userRole === 'client'} onChange={(e) => setForm({ ...form, workflow_stage: e.target.value })}>
                {WORKFLOW_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
              </select>
            </div>
          </div>

          {canFeatureTask && (
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, is_featured: !current.is_featured }))}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                form.is_featured
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${form.is_featured ? 'bg-amber-400 text-white' : 'bg-white text-slate-400 shadow-sm'}`}>
                <Star size={18} fill={form.is_featured ? 'currentColor' : 'none'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Destacar no painel principal</span>
                <span className={`mt-0.5 block text-xs ${form.is_featured ? 'text-amber-700' : 'text-slate-400'}`}>
                  Use para prioridades que precisam ficar visíveis logo na entrada.
                </span>
              </span>
              <span className={`h-6 w-11 rounded-full p-1 transition ${form.is_featured ? 'bg-amber-400' : 'bg-slate-200'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${form.is_featured ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          )}

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
    </ModalBackdrop>
  );
}
