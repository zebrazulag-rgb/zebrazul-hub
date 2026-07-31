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
  const [postId, setPostId] = useState(review?.post_id || '');
  const [versionNotes, setVersionNotes] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [posts, setPosts] = useState([]);
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
    Promise.allSettled([
      api.get(`/tasks?client_id=${clientId}`),
      api.get(`/posts?client_id=${clientId}`),
    ]).then(([tasksResult, postsResult]) => {
      setTasks(tasksResult.status === 'fulfilled' ? (tasksResult.value.data.tasks || []) : []);
      setPosts(postsResult.status === 'fulfilled' ? (postsResult.value.data.posts || []) : []);
    });
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
        form.append('post_id', postId);
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
      <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/[0.10] bg-[#0b0f16] shadow-[0_34px_100px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">Aprovação de vídeos</p>
            <h2 className="mt-1 text-xl font-bold text-white">{isNewVersion ? `Enviar nova versão · ${review.title}` : 'Novo vídeo para aprovação'}</h2>
            <p className="mt-1 text-sm text-white/[0.45]">
              {isNewVersion ? 'A nova versão retorna automaticamente para aprovação.' : 'O cliente poderá assistir, comentar no tempo e tomar uma decisão.'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/[0.08] p-2 text-white/[0.45] transition hover:bg-white/[0.05] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[74vh] space-y-5 overflow-y-auto px-6 py-5">
          {!isNewVersion && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-white/[0.70]">
                  Cliente *
                  <select value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId(''); setPostId(''); }} className="input-field">
                    <option value="">Selecione</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm text-white/[0.70]">
                  Prazo de aprovação
                  <div className="relative">
                    <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/[0.30]" />
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field pl-9" />
                  </div>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm text-white/[0.70]">
                Título do vídeo *
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" placeholder="Ex.: Reels institucional — Versão final" />
              </label>

              <label className="block space-y-1.5 text-sm text-white/[0.70]">
                Descrição
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field min-h-24 resize-y" placeholder="Contexto, objetivo ou orientação para quem vai aprovar." />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-white/[0.70]">
                  Vincular a uma tarefa
                  <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="input-field" disabled={!clientId}>
                    <option value="">Sem vínculo</option>
                    {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm text-white/[0.70]">
                  Vincular a uma publicação
                  <select value={postId} onChange={(e) => setPostId(e.target.value)} className="input-field" disabled={!clientId}>
                    <option value="">Sem vínculo</option>
                    {posts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          <div
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border border-dashed px-5 py-8 text-center transition ${dragging ? 'border-blue-400 bg-blue-500/10' : 'border-white/[0.15] bg-white/[0.025] hover:border-blue-400/60 hover:bg-blue-500/[0.05]'}`}
          >
            <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><FileVideo2 size={22} /></div>
                <div className="min-w-0 text-left">
                  <p className="truncate font-semibold text-white">{file.name}</p>
                  <p className="text-xs text-white/[0.40]">{formatBytes(file.size)} · clique para trocar</p>
                </div>
              </div>
            ) : (
              <>
                <UploadCloud size={28} className="mx-auto text-blue-400" />
                <p className="mt-3 font-semibold text-white">Arraste o vídeo aqui</p>
                <p className="mt-1 text-sm text-white/[0.40]">ou clique para selecionar · {config.accepted_formats?.join(', ')} · até {config.max_upload_mb} MB</p>
                <p className="mt-2 text-xs text-amber-300/70">MP4 (H.264) é o formato mais compatível para assistir no navegador.</p>
              </>
            )}
          </div>

          <label className="block space-y-1.5 text-sm text-white/[0.70]">
            Observações da versão
            <textarea value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} className="input-field min-h-20 resize-y" placeholder={isNewVersion ? 'Ex.: ajustes de 00:18 e 00:42 aplicados.' : 'Ex.: primeira versão para validação de roteiro e cortes.'} />
          </label>

          {!isNewVersion && currentClient && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-400/15 bg-blue-400/[0.06] px-3 py-2 text-xs text-blue-200/70">
              <Link2 size={14} /> O vídeo ficará vinculado a {currentClient.name} e disponível no histórico de aprovação.
            </div>
          )}

          {saving && (
            <div className="space-y-2 rounded-xl border border-blue-400/20 bg-blue-400/[0.06] px-3 py-3">
              <div className="flex items-center justify-between text-xs text-blue-200/70"><span>Enviando vídeo...</span><strong>{uploadProgress}%</strong></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.10]"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div>
            </div>
          )}

          {error && <p className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-300">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/[0.08] px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary inline-flex min-w-40 items-center justify-center gap-2">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : isNewVersion ? 'Enviar nova versão' : 'Enviar para aprovação'}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
