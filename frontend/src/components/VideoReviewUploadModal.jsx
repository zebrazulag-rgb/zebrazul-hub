import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, FileVideo2, Link2, Loader2, UploadCloud, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import { formatBytes } from '../utils/videoReviews.js';

export default function VideoReviewUploadModal({ clients, defaultClientId, review = null, onClose, onSaved }) {
  const inputRef = useRef(null);
  const [clientId, setClientId] = useState(review?.client_id || defaultClientId || '');
  const [title, setTitle] = useState(review?.title || '');
  const [description, setDescription] = useState(review?.description || '');
  const [dueDate, setDueDate] = useState(review?.due_date?.slice?.(0, 10) || '');
  const [taskId, setTaskId] = useState(review?.task_id || '');
  const [versionNotes, setVersionNotes] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [config, setConfig] = useState({ max_upload_mb: 750, accepted_formats: ['MP4', 'WebM', 'MOV', 'M4V'] });
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const isNewVersion = Boolean(review);
  const currentClient = useMemo(() => clients.find((client) => String(client.id) === String(clientId)), [clients, clientId]);

  useEffect(() => {
    api.get('/video-reviews/config').then(({ data }) => setConfig(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId || isNewVersion) return;
    api.get(`/tasks?client_id=${clientId}`)
      .then(({ data }) => setTasks(data.tasks || []))
      .catch(() => setTasks([]));
  }, [clientId, isNewVersion]);

  function chooseFile(nextFile) {
    if (!nextFile) return;
    if (!String(nextFile.type || '').startsWith('video/')) {
      setError('Selecione um arquivo de vídeo.');
      return;
    }
    if (nextFile.size > Number(config.max_upload_mb || 750) * 1024 * 1024) {
      setError(`O arquivo excede o limite de ${config.max_upload_mb} MB.`);
      return;
    }
    setFile(nextFile);
    setError('');
    if (!title && !isNewVersion) {
      setTitle(nextFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) {
      setError('Adicione o arquivo do vídeo.');
      return;
    }
    if (!isNewVersion && (!clientId || !title.trim())) {
      setError('Selecione o cliente e informe o título.');
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    setError('');
    try {
      const form = new FormData();
      form.append('video', file);
      if (isNewVersion) {
        form.append('notes', versionNotes.trim());
        await api.post(`/video-reviews/${review.id}/versions`, form, {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          },
        });
      } else {
        form.append('client_id', clientId);
        form.append('title', title.trim());
        form.append('description', description.trim());
        form.append('due_date', dueDate);
        form.append('task_id', taskId);
        form.append('version_notes', versionNotes.trim());
        await api.post('/video-reviews', form, {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          },
        });
      }
      await onSaved?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível enviar o vídeo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={saving ? undefined : onClose} disabled={saving}>
      <form onSubmit={submit} className="surface-card w-full max-w-4xl overflow-hidden" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Aprovação de vídeos</p>
            <h2 className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">{isNewVersion ? `Nova versão · ${review.title}` : 'Novo vídeo para aprovação'}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {isNewVersion ? 'Envie o arquivo corrigido. A versão anterior continua preservada no histórico.' : 'Organize as informações e envie o vídeo diretamente para a área de aprovação.'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className={`max-h-[76vh] overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 ${isNewVersion ? 'space-y-5' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]'}`}>
          {!isNewVersion && (
            <section className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Informações da aprovação</p>
                <p className="mt-1 text-xs text-slate-500">O cliente verá estes dados antes de assistir.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  Cliente *
                  <select value={clientId} onChange={(event) => { setClientId(event.target.value); setTaskId(''); }} className="input-field">
                    <option value="">Selecione</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  Prazo de aprovação
                  <div className="relative">
                    <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="input-field pl-9" />
                  </div>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Título do vídeo *
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="input-field" placeholder="Ex.: Reels institucional — Versão 1" />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Orientação para aprovação
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input-field min-h-28 resize-y" placeholder="Contexto, objetivo e pontos que o cliente precisa observar." />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Vincular a uma tarefa <span className="font-normal text-slate-400">(opcional)</span>
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="input-field" disabled={!clientId}>
                  <option value="">Sem vínculo</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>

              {currentClient && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                  <Link2 size={14} /> O vídeo ficará no histórico de aprovação de {currentClient.name}.
                </div>
              )}
            </section>
          )}

          <section className="space-y-4">
            {!isNewVersion && (
              <div>
                <p className="text-sm font-semibold text-slate-900">Arquivo e versão</p>
                <p className="mt-1 text-xs text-slate-500">MP4 em H.264 oferece a melhor reprodução no navegador.</p>
              </div>
            )}

            <div
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`flex min-h-56 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/60'}`}
            >
              <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])} />
              {file ? (
                <div className="max-w-full">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><FileVideo2 size={26} /></div>
                  <p className="mt-4 break-all font-semibold text-slate-900">{file.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatBytes(file.size)} · clique para trocar</p>
                </div>
              ) : (
                <div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><UploadCloud size={27} /></div>
                  <p className="mt-4 font-semibold text-slate-900">Arraste o vídeo aqui</p>
                  <p className="mt-1 text-sm text-slate-500">ou clique para selecionar</p>
                  <p className="mt-3 text-xs text-slate-400">{config.accepted_formats?.join(', ')} · até {config.max_upload_mb} MB</p>
                </div>
              )}
            </div>

            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Observações da versão
              <textarea value={versionNotes} onChange={(event) => setVersionNotes(event.target.value)} className="input-field min-h-24 resize-y" placeholder={isNewVersion ? 'Ex.: ajustes de 00:18 e 00:42 aplicados.' : 'Ex.: primeira versão para validação dos cortes e legendas.'} />
            </label>

            {saving && (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
                <div className="flex items-center justify-between text-xs text-blue-700"><span>Enviando vídeo...</span><strong>{uploadProgress}%</strong></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div>
              </div>
            )}

            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          </section>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary inline-flex min-w-44 items-center justify-center gap-2">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : isNewVersion ? 'Enviar nova versão' : 'Enviar para aprovação'}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
