import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Images, MessageSquareWarning, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const CONTENT_TYPE_LABELS = {
  feed: 'Estático',
  carrossel: 'Carrossel',
  story: 'Stories',
  stories: 'Stories',
  presentation: 'Apresentação',
  print: 'Impresso',
};

const APPROVAL_STAGES = new Set(['approval', 'internal_approval', 'external_approval']);

function isDesignerItem(item) {
  if (!item) return false;
  if (String(item.task_type || '').toLowerCase() === 'video') return false;
  return String(item.front_name || '').trim().toLocaleLowerCase('pt-BR') !== 'site/lp';
}

function mediaToImages(media) {
  const gallery = Array.isArray(media?.media_gallery) ? media.media_gallery : [];
  const images = gallery
    .map((entry) => ({
      data: entry?.data || entry?.url || entry?.src || '',
      mime: entry?.mime || entry?.type || '',
      filename: entry?.filename || entry?.name || '',
    }))
    .filter((entry) => {
      const data = String(entry.data || '');
      const mime = String(entry.mime || '').toLowerCase();
      return Boolean(data) && (mime.startsWith('image/') || data.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data));
    });

  if (images.length) return images;

  const attachmentData = media?.attachment_data || '';
  const attachmentMime = String(media?.attachment_mime || '').toLowerCase();
  const attachmentIsImage = Boolean(attachmentData) && (
    attachmentMime.startsWith('image/') ||
    String(attachmentData).startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(String(attachmentData))
  );

  return attachmentIsImage
    ? [{ data: attachmentData, mime: media?.attachment_mime || 'image/jpeg', filename: media?.attachment_filename || '' }]
    : [];
}

export default function DesignerApproval() {
  const { selectedClient } = useClientFilter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [updatingId, setUpdatingId] = useState(null);

  const loadLegacyApprovalItems = useCallback(async () => {
    // Compatibilidade com o backend antigo que ainda não possui /tasks/approval-grid.
    // Com um cliente selecionado, reconstruímos a grade usando rotas que já existem
    // há várias versões: /tasks, /tasks/:id e /tasks/:id/media.
    if (!selectedClient?.id) {
      throw new Error('Selecione um cliente para carregar as aprovações enquanto o backend termina de atualizar.');
    }

    const { data: listData } = await api.get('/tasks', { params: { client_id: selectedClient.id } });
    const parents = Array.isArray(listData?.tasks) ? listData.tasks : [];
    const candidates = [];

    for (const parent of parents) {
      try {
        const { data: detailData } = await api.get(`/tasks/${parent.id}`);
        const parentTask = detailData?.task || parent;
        const clientName = parentTask?.client_name || parent?.client_name || selectedClient?.name || '';

        if (isDesignerItem(parentTask) && APPROVAL_STAGES.has(String(parentTask.workflow_stage || ''))) {
          candidates.push({ ...parentTask, client_name: clientName });
        }

        const subtasks = Array.isArray(detailData?.subtasks) ? detailData.subtasks : [];
        subtasks.forEach((subtask) => {
          if (!isDesignerItem(subtask)) return;
          if (!APPROVAL_STAGES.has(String(subtask.workflow_stage || ''))) return;
          candidates.push({ ...subtask, client_name: clientName });
        });
      } catch {
        // Uma tarefa inacessível não deve derrubar a grade inteira.
      }
    }

    const hydrated = await Promise.all(candidates.map(async (candidate) => {
      try {
        const { data: mediaData } = await api.get(`/tasks/${candidate.id}/media`);
        const images = mediaToImages(mediaData?.media);
        if (!images.length) return null;
        return {
          ...candidate,
          workflow_stage: 'approval',
          images,
          image_count: images.length,
        };
      } catch {
        return null;
      }
    }));

    return hydrated.filter(Boolean);
  }, [selectedClient?.id, selectedClient?.name]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/tasks/approval-grid', {
        params: selectedClient?.id ? { client_id: selectedClient.id } : {},
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (requestError) {
      const status = Number(requestError.response?.status || 0);
      const backendMessage = String(requestError.response?.data?.error || '');
      const missingApprovalRoute = status === 404 && /tarefa nao encontrada|tarefa não encontrada/i.test(backendMessage);

      if (missingApprovalRoute) {
        try {
          const fallbackItems = await loadLegacyApprovalItems();
          setItems(fallbackItems);
          return;
        } catch (fallbackError) {
          setError(fallbackError?.message || 'Não foi possível carregar a grade de aprovação.');
          return;
        }
      }

      setError(backendMessage || 'Não foi possível carregar a grade de aprovação.');
    } finally {
      setLoading(false);
    }
  }, [loadLegacyApprovalItems, selectedClient?.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const interval = window.setInterval(() => loadItems().catch(() => {}), 20000);
    return () => window.clearInterval(interval);
  }, [loadItems]);

  const clientLabel = selectedClient?.name || 'Todos os clientes';
  const visibleItems = useMemo(() => items, [items]);

  function openItem(item) {
    setSelectedItem(item);
    setImageIndex(0);
  }

  async function moveItem(item, workflowStage) {
    if (!item?.id || updatingId) return;
    setUpdatingId(item.id);
    setError('');
    try {
      await api.put(`/tasks/${item.id}`, { workflow_stage: workflowStage });
      setItems((current) => current.filter((entry) => Number(entry.id) !== Number(item.id)));
      setSelectedItem(null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar esta aprovação.');
    } finally {
      setUpdatingId(null);
    }
  }

  const currentImage = selectedItem?.images?.[imageIndex]?.data || null;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Designer</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Aprovação</h1>
          <p className="mt-1 text-sm text-slate-500">{clientLabel} · tudo que foi enviado para aprovação e possui imagem.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          <Images size={16} className="text-[#0969ff]" /> {visibleItems.length} {visibleItems.length === 1 ? 'peça' : 'peças'}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 sm:gap-2 sm:p-2 lg:max-w-5xl">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><Check size={24} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Nada aguardando aprovação</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">No Squad → Designer, envie uma tarefa ou subtarefa com imagem para “Em aprovação”. Ela aparece aqui automaticamente.</p>
          <Link to="/designer" className="mt-5 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Abrir Designer</Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 sm:gap-2 sm:p-2 lg:max-w-5xl">
          {visibleItems.map((item) => {
            const cover = item.images?.[0]?.data;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className="group relative aspect-square min-w-0 overflow-hidden rounded-lg bg-slate-100 text-left focus:outline-none focus:ring-2 focus:ring-[#0969ff] focus:ring-offset-2"
                title={`${item.client_name || ''} · ${item.title}`}
              >
                <img src={cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/0 opacity-0 transition group-hover:opacity-100" />
                {Number(item.image_count || 0) > 1 && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm"><Images size={11} /> {item.image_count}</span>
                )}
                <div className="absolute inset-x-0 bottom-0 translate-y-2 px-2.5 pb-2.5 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="truncate text-xs font-bold text-white">{item.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-white/80">{item.client_name || 'Sem cliente'}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <ModalBackdrop onClose={() => setSelectedItem(null)} panelClassName="w-full max-w-5xl overflow-hidden rounded-[24px] bg-white shadow-2xl">
          <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1.25fr)_380px]">
            <div className="relative flex min-h-[420px] items-center justify-center bg-[#0b0d12] p-4 lg:min-h-[620px]">
              {currentImage && <img src={currentImage} alt="" className="max-h-[76vh] max-w-full object-contain" />}
              {selectedItem.images?.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImageIndex((current) => (current - 1 + selectedItem.images.length) % selectedItem.images.length)}
                    className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                    aria-label="Imagem anterior"
                  ><ChevronLeft size={20} /></button>
                  <button
                    type="button"
                    onClick={() => setImageIndex((current) => (current + 1) % selectedItem.images.length)}
                    className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                    aria-label="Próxima imagem"
                  ><ChevronRight size={20} /></button>
                  <span className="absolute bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{imageIndex + 1}/{selectedItem.images.length}</span>
                </>
              )}
            </div>

            <aside className="flex min-w-0 flex-col border-l border-slate-100">
              <div className="flex items-start gap-3 border-b border-slate-100 p-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0969ff]">Em aprovação</p>
                  <h2 className="mt-1 text-lg font-bold leading-6 text-slate-950">{selectedItem.title}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">{selectedItem.client_name || 'Sem cliente'}</p>
                </div>
                <button type="button" onClick={() => setSelectedItem(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Fechar"><X size={18} /></button>
              </div>

              <div className="flex-1 space-y-4 p-5">
                <div className="flex flex-wrap gap-2">
                  {selectedItem.content_tag && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{selectedItem.content_tag}</span>}
                  {selectedItem.content_type && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{CONTENT_TYPE_LABELS[selectedItem.content_type] || selectedItem.content_type}</span>}
                  {selectedItem.parent_task_id && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Subtarefa</span>}
                </div>
                {selectedItem.caption && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Legenda</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedItem.caption}</p>
                  </div>
                )}
                <Link to={`/designer?task_id=${selectedItem.id}`} className="inline-flex text-sm font-semibold text-[#0969ff] hover:underline">Abrir tarefa no Designer</Link>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-5">
                <button
                  type="button"
                  disabled={updatingId === selectedItem.id}
                  onClick={() => moveItem(selectedItem, 'correction')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                ><MessageSquareWarning size={16} /> Correção</button>
                <button
                  type="button"
                  disabled={updatingId === selectedItem.id}
                  onClick={() => moveItem(selectedItem, 'approved')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                ><Check size={17} /> Aprovar</button>
              </div>
            </aside>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
