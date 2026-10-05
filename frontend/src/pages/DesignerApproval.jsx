import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, ExternalLink, Images, Link2, Loader2, MessageSquareWarning, Pencil, Save, UsersRound, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';

const CONTENT_TYPE_LABELS = {
  feed: 'Estático',
  carrossel: 'Carrossel',
  story: 'Stories',
  stories: 'Stories',
  presentation: 'Apresentação',
  print: 'Impresso',
};

const APPROVAL_STAGES = new Set(['approval', 'internal_approval', 'external_approval', 'approved']);

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

function directionIsApproved(item) {
  const approvalStatus = String(item?.approval_status || '').toLowerCase();
  const workflowStage = String(item?.workflow_stage || '').toLowerCase();
  return item?.direction_status === 'approved'
    || ['pending_approval', 'send', 'approved'].includes(approvalStatus)
    || workflowStage === 'external_approval'
    || workflowStage === 'approved';
}

function statusForDirection(item) {
  if (directionIsApproved(item)) return 'approved';
  if (item?.direction_status === 'changes_requested' || String(item?.approval_status || '').toLowerCase() === 'changes_requested') return 'rejected';
  return 'pending_approval';
}

function statusForClient(item) {
  if (item?.client_status === 'approved' || String(item?.approval_status || '').toLowerCase() === 'approved') return 'approved';
  if (item?.client_status === 'changes_requested') return 'rejected';
  return 'pending_approval';
}

function directionStatusLabel(item) {
  if (directionIsApproved(item)) return 'Direção aprovada';
  if (item?.direction_status === 'changes_requested' || String(item?.approval_status || '').toLowerCase() === 'changes_requested') return 'Correção solicitada';
  return 'Aguardando direção';
}

function clientStatusLabel(item) {
  if (!directionIsApproved(item)) return 'Aguardando direção';
  if (item?.client_status === 'approved' || String(item?.approval_status || '').toLowerCase() === 'approved') return 'Cliente aprovou';
  if (item?.client_status === 'changes_requested') return 'Cliente pediu correção';
  return 'Aguardando cliente';
}

function statusTone(status) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'changes_requested') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function legacyApprovalState(item) {
  const approvalStatus = String(item?.approval_status || '').toLowerCase();
  const workflowStage = String(item?.workflow_stage || '').toLowerCase();

  if (approvalStatus === 'approved') {
    return { direction_status: 'approved', client_status: 'approved' };
  }
  if (approvalStatus === 'pending_approval' || approvalStatus === 'send') {
    return { direction_status: 'approved', client_status: 'pending' };
  }
  if (approvalStatus === 'changes_requested' || workflowStage === 'correction') {
    return { direction_status: 'changes_requested', client_status: 'waiting' };
  }
  return { direction_status: 'pending', client_status: 'waiting' };
}

export default function DesignerApproval() {
  const { selectedClient } = useClientFilter();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [updatingId, setUpdatingId] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [mode, setMode] = useState('direction');
  const [approvalLink, setApprovalLink] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkNotice, setLinkNotice] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionEditing, setCaptionEditing] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const hasLoadedRef = useRef(false);
  const syncSourceRef = useRef(`approval-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const loadLegacyApprovalItems = useCallback(async () => {
    if (!selectedClient?.id) {
      throw new Error('Selecione um cliente para carregar as aprovações.');
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
        // Uma tarefa inacessível não derruba a grade inteira.
      }
    }

    const hydrated = await Promise.all(candidates.map(async (candidate) => {
      try {
        const { data: mediaData } = await api.get(`/tasks/${candidate.id}/media`);
        const images = mediaToImages(mediaData?.media);
        if (!images.length) return null;
        const inferred = legacyApprovalState(candidate);
        return {
          ...candidate,
          direction_status: candidate.direction_status || inferred.direction_status,
          client_status: candidate.client_status || inferred.client_status,
          images,
          image_count: images.length,
        };
      } catch {
        return null;
      }
    }));

    return hydrated.filter(Boolean);
  }, [selectedClient?.id, selectedClient?.name]);

  const loadItems = useCallback(async (silent = false) => {
    if (!silent && !hasLoadedRef.current) setLoading(true);
    if (!silent) setError('');
    try {
      const { data } = await api.get('/tasks/approval-grid', {
        params: selectedClient?.id ? { client_id: selectedClient.id } : {},
      });
      const nextItems = (Array.isArray(data?.items) ? data.items : []).map((item) => (
        directionIsApproved(item) && item?.direction_status !== 'changes_requested'
          ? { ...item, direction_status: 'approved', client_status: item?.client_status || 'pending' }
          : item
      ));
      setItems(nextItems);
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
      hasLoadedRef.current = true;
      if (!silent) setLoading(false);
    }
  }, [loadLegacyApprovalItems, selectedClient?.id]);

  const loadApprovalLink = useCallback(async () => {
    if (!selectedClient?.id) {
      setApprovalLink(null);
      return;
    }
    try {
      const { data } = await api.get(`/tasks/approval-link/client/${selectedClient.id}`);
      setApprovalLink(data?.link || null);
    } catch {
      setApprovalLink(null);
    }
  }, [selectedClient?.id]);

  useEffect(() => {
    hasLoadedRef.current = false;
    setItems([]);
    setSelectedItem(null);
    setActionError('');
    loadItems();
    loadApprovalLink();
  }, [loadItems, loadApprovalLink, selectedClient?.id]);

  useEffect(() => {
    if (!selectedClient?.id) {
      setClientProfile(null);
      setHighlights([]);
      return undefined;
    }

    let cancelled = false;
    const clientId = selectedClient.id;

    Promise.allSettled([
      api.get(`/clients/${clientId}`),
      api.get(`/clients/${clientId}/feed-highlights`),
    ]).then(([clientResult, highlightsResult]) => {
      if (cancelled) return;
      if (clientResult.status === 'fulfilled') {
        setClientProfile(clientResult.value?.data?.client || selectedClient);
      } else {
        setClientProfile(selectedClient);
      }
      if (highlightsResult.status === 'fulfilled') {
        setHighlights(highlightsResult.value?.data?.highlights || []);
      } else {
        setHighlights([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedClient?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => loadItems(true).catch(() => {}), 20000);
    return () => window.clearInterval(interval);
  }, [loadItems]);

  useEffect(() => {
    let channel = null;
    const refresh = (event) => {
      const source = event?.data?.source || event?.detail?.source;
      if (source && source === syncSourceRef.current) return;
      loadItems(true).catch(() => {});
    };
    try {
      channel = new BroadcastChannel('zebrahub-task-sync');
      channel.onmessage = refresh;
    } catch {
      window.addEventListener('zebrahub:task-updated', refresh);
    }
    return () => {
      if (channel) channel.close();
      window.removeEventListener('zebrahub:task-updated', refresh);
    };
  }, [loadItems]);

  const clientLabel = selectedClient?.name || 'Todos os clientes';
  const visibleItems = useMemo(() => {
    const filtered = mode === 'client'
      ? items.filter((item) => directionIsApproved(item))
      : items;

    // Feed em ordem de Instagram: conteúdos mais recentes primeiro (em cima)
    // e os mais antigos descendo a grade.
    return [...filtered].sort((a, b) => {
      const aDate = new Date(a?.due_date || a?.scheduled_at || a?.created_at || 0).getTime() || 0;
      const bDate = new Date(b?.due_date || b?.scheduled_at || b?.created_at || 0).getTime() || 0;
      if (aDate !== bDate) return bDate - aDate;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
  }, [items, mode]);
  const profileClient = clientProfile || selectedClient;
  const approvalPosts = useMemo(() => visibleItems.map((item) => ({
    ...item,
    content_id: item.id,
    media_data: item.images?.[0]?.data || '',
    media_mime: item.images?.[0]?.mime || 'image/jpeg',
    media_gallery: Array.isArray(item.images)
      ? item.images.map((image) => ({ data: image.data, mime: image.mime, filename: image.filename }))
      : [],
    content_type: Number(item.image_count || item.images?.length || 0) > 1 ? 'carrossel' : (item.content_type || 'feed'),
    status: mode === 'direction' ? statusForDirection(item) : statusForClient(item),
    workflow_stage: null,
    scheduled_at: item.due_date || item.scheduled_at || item.created_at || null,
  })), [visibleItems, mode]);

  const clientApprovalUrl = approvalLink?.token
    ? `${window.location.origin}/aprovacao-cliente/${approvalLink.token}`
    : '';

  function openItem(item) {
    setSelectedItem(item);
    setImageIndex(0);
    setCorrectionOpen(false);
    setCorrectionFeedback('');
    setCaptionDraft(item?.caption || '');
    setCaptionEditing(false);
    setActionError('');
  }

  function replaceItemState(taskId, state) {
    setItems((current) => current.map((entry) => Number(entry.id) === Number(taskId)
      ? { ...entry, ...state }
      : entry));
    setSelectedItem((current) => current && Number(current.id) === Number(taskId)
      ? { ...current, ...state }
      : current);
  }

  function broadcastTaskUpdate(taskId, parentTaskId = null) {
    const payload = { taskId: Number(taskId), parentTaskId: parentTaskId ? Number(parentTaskId) : null, at: Date.now(), source: syncSourceRef.current };
    try {
      const channel = new BroadcastChannel('zebrahub-task-sync');
      channel.postMessage(payload);
      channel.close();
    } catch {
      window.dispatchEvent(new CustomEvent('zebrahub:task-updated', { detail: payload }));
    }
  }

  async function directionDecision(item, decision, feedback = '') {
    if (!item?.id || updatingId) return;
    const normalizedFeedback = String(feedback || '').trim();
    if (decision === 'changes_requested' && !normalizedFeedback) {
      setActionError('Escreva o que precisa ser corrigido antes de enviar.');
      return;
    }

    const previousState = {
      direction_status: item.direction_status || 'pending',
      direction_feedback: item.direction_feedback || null,
      client_status: item.client_status || 'waiting',
      client_feedback: item.client_feedback || null,
      workflow_stage: item.workflow_stage || 'approval',
      designer_completed: item.designer_completed,
      approval_status: item.approval_status,
    };
    const optimisticState = decision === 'approved'
      ? {
          direction_status: 'approved',
          direction_feedback: normalizedFeedback || null,
          client_status: 'pending',
          client_feedback: null,
          workflow_stage: 'approval',
          designer_completed: 1,
          approval_status: 'pending_approval',
        }
      : {
          direction_status: 'changes_requested',
          direction_feedback: normalizedFeedback || null,
          client_status: 'waiting',
          client_feedback: null,
          workflow_stage: 'correction',
          designer_completed: 0,
          approval_status: 'changes_requested',
        };

    setUpdatingId(item.id);
    setError('');
    setActionError('');
    replaceItemState(item.id, optimisticState);

    try {
      let state = null;
      try {
        const { data } = await api.post(`/tasks/${item.id}/direction-approval`, { decision, feedback: normalizedFeedback });
        state = data?.state || null;
        if (data?.link?.token) setApprovalLink(data.link);
      } catch (primaryError) {
        const status = Number(primaryError.response?.status || 0);
        const message = String(primaryError.response?.data?.error || '');
        const routeUnavailable = status === 404 || status === 405
          || (status === 400 && /não está disponível para revisão|nao esta disponivel para revisao|etapa de fluxo inválida|etapa de fluxo invalida/i.test(message))
          || /cannot (post|find)|tarefa nao encontrada|tarefa não encontrada/i.test(message);
        if (!routeUnavailable) throw primaryError;

        // Compatibilidade com backends anteriores: a rota histórica de edição
        // de tarefas é PUT /tasks/:id (não PATCH). Primeiro tenta persistir todos
        // os campos disponíveis; se um backend ainda mais antigo não conhecer os
        // campos auxiliares de aprovação, reduz a atualização ao workflow_stage.
        // Backends antigos usam internal_approval no lugar de approval.
        // Para correção, tentamos correction e, se o servidor for ainda mais antigo,
        // usamos in_progress + approval_status=changes_requested. A interface continua
        // exibindo "Em correção" pelo approval_status.
        const legacyPayload = {
          workflow_stage: decision === 'approved' ? 'external_approval' : 'correction',
          approval_status: decision === 'approved' ? 'pending_approval' : 'changes_requested',
          designer_completed: decision === 'approved' ? 1 : 0,
          direction_status: decision === 'approved' ? 'approved' : 'changes_requested',
          direction_feedback: normalizedFeedback || null,
          direction_by: user?.id || null,
          direction_at: new Date().toISOString(),
          client_status: decision === 'approved' ? 'pending' : 'waiting',
          client_feedback: null,
          client_at: null,
        };
        try {
          await api.put(`/tasks/${item.id}`, legacyPayload);
        } catch (legacyError) {
          const legacyMessage = String(legacyError.response?.data?.error || '');
          const legacyStatus = Number(legacyError.response?.status || 0);
          const canRetryMinimal = legacyStatus === 400 && /aprova|designer|campo|etapa|inválid|invalid|column|coluna/i.test(legacyMessage);
          if (!canRetryMinimal) throw legacyError;

          if (decision === 'approved') {
            await api.put(`/tasks/${item.id}`, { workflow_stage: 'external_approval', approval_status: 'pending_approval', direction_status: 'approved', direction_feedback: normalizedFeedback || null, client_status: 'pending' });
          } else {
            try {
              await api.put(`/tasks/${item.id}`, { workflow_stage: 'correction', approval_status: 'changes_requested', direction_status: 'changes_requested', direction_feedback: normalizedFeedback || null, client_status: 'waiting' });
            } catch (correctionError) {
              const correctionMessage = String(correctionError.response?.data?.error || '');
              const correctionStatus = Number(correctionError.response?.status || 0);
              if (!(correctionStatus === 400 && /etapa|inválid|invalid/i.test(correctionMessage))) throw correctionError;
              await api.put(`/tasks/${item.id}`, {
                workflow_stage: 'in_progress',
                approval_status: 'changes_requested',
                direction_status: 'changes_requested',
                direction_feedback: normalizedFeedback || null,
                client_status: 'waiting',
              });
            }
          }
        }
        state = optimisticState;
      }

      if (decision === 'changes_requested' && normalizedFeedback) {
        const responseFeedback = String(state?.direction_feedback || '').trim();
        if (!responseFeedback) {
          try {
            await api.put(`/tasks/${item.id}`, {
              approval_status: 'changes_requested',
              direction_status: 'changes_requested',
              direction_feedback: normalizedFeedback,
              client_status: 'waiting',
            });
          } catch (feedbackPersistError) {
            throw feedbackPersistError;
          }
        }
        state = { ...(state || {}), direction_feedback: normalizedFeedback, direction_status: 'changes_requested' };
      }

      replaceItemState(item.id, { ...optimisticState, ...(state || {}) });
      broadcastTaskUpdate(item.id, item.parent_task_id);
      if (decision === 'approved') {
        // Depois que a direção aprova, seguimos automaticamente para a etapa
        // do cliente sem fechar a peça. Assim Arthur já enxerga o mesmo conteúdo
        // no modo Cliente e pode compartilhar o link imediatamente.
        setMode('client');
        setCorrectionOpen(false);
        setCorrectionFeedback('');
        if (!approvalLink?.token && selectedClient?.id) {
          void createApprovalLink();
        }
      } else if (decision === 'changes_requested') {
        setCorrectionOpen(false);
        setCorrectionFeedback('');
        // A correção volta para o Designer e abre a tarefa mãe quando houver.
        const designerTaskId = item.parent_task_id || item.id;
        setSelectedItem(null);
        setItems((current) => current.filter((entry) => Number(entry.id) !== Number(item.id)));
        navigate(`/designer?task_id=${designerTaskId}`);
      }
      // Não recarrega a grade imediatamente: isso evitava que um backend antigo
      // sobrescrevesse o estado recém-aprovado com dados ainda defasados.
    } catch (requestError) {
      replaceItemState(item.id, previousState);
      const backendError = requestError.response?.data?.error || requestError.response?.data?.message;
      const message = backendError
        || (requestError.response?.status
          ? `${decision === 'changes_requested' ? 'Não foi possível registrar a correção' : 'Não foi possível registrar a aprovação da direção'} (erro ${requestError.response.status}).`
          : (decision === 'changes_requested'
            ? 'Não foi possível registrar a correção. Verifique a conexão com o servidor.'
            : 'Não foi possível registrar a aprovação da direção. Verifique a conexão com o servidor.'));
      setActionError(message);
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveCaption(item) {
    if (!item?.id || contentSaving) return;
    setContentSaving(true);
    setActionError('');
    const previousCaption = item.caption || '';
    const nextCaption = captionDraft;
    replaceItemState(item.id, { caption: nextCaption });
    try {
      await api.put(`/tasks/${item.id}`, { caption: nextCaption });
      broadcastTaskUpdate(item.id, item.parent_task_id);
      setCaptionEditing(false);
    } catch (requestError) {
      replaceItemState(item.id, { caption: previousCaption });
      setCaptionDraft(previousCaption);
      setActionError(requestError.response?.data?.error || 'Não foi possível salvar a legenda.');
    } finally {
      setContentSaving(false);
    }
  }

  async function moveCarouselImage(item, fromIndex, toIndex) {
    if (!item?.id || contentSaving || fromIndex === toIndex) return;
    const currentImages = Array.isArray(item.images) ? item.images : [];
    if (toIndex < 0 || toIndex >= currentImages.length) return;
    const reordered = [...currentImages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setContentSaving(true);
    setActionError('');
    replaceItemState(item.id, { images: reordered, image_count: reordered.length });
    setImageIndex(toIndex);
    try {
      await api.put(`/tasks/${item.id}`, {
        media_gallery: reordered.map((image) => ({
          data: image.data,
          mime: image.mime || 'image/jpeg',
          filename: image.filename || '',
        })),
      });
      broadcastTaskUpdate(item.id, item.parent_task_id);
    } catch (requestError) {
      replaceItemState(item.id, { images: currentImages, image_count: currentImages.length });
      setImageIndex(fromIndex);
      setActionError(requestError.response?.data?.error || 'Não foi possível alterar a ordem do carrossel.');
    } finally {
      setContentSaving(false);
    }
  }

  async function createApprovalLink() {
    if (!selectedClient?.id || linkLoading) return;
    setLinkLoading(true);
    setLinkNotice('');
    try {
      const { data } = await api.post(`/tasks/approval-link/client/${selectedClient.id}`);
      setApprovalLink(data?.link || null);
      setLinkNotice('Link do cliente pronto.');
    } catch (requestError) {
      setLinkNotice(requestError.response?.data?.error || 'Não foi possível gerar o link.');
    } finally {
      setLinkLoading(false);
    }
  }

  async function copyApprovalLink() {
    if (!clientApprovalUrl) return;
    try {
      await navigator.clipboard.writeText(clientApprovalUrl);
      setLinkNotice('Link copiado.');
    } catch {
      setLinkNotice(clientApprovalUrl);
    }
  }

  const currentImage = selectedItem?.images?.[imageIndex]?.data || null;
  const selectedDirectionStatus = directionIsApproved(selectedItem) ? 'approved' : (selectedItem?.direction_status || 'pending');
  const selectedClientStatus = selectedItem?.client_status || 'waiting';
  const canDirectionApprove = mode === 'direction' && selectedDirectionStatus === 'pending';

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Designer</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Aprovação</h1>
          <p className="mt-1 text-sm text-slate-500">{clientLabel} · direção aprova no app; cliente aprova por link.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('direction')}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${mode === 'direction' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Direção
            </button>
            <button
              type="button"
              onClick={() => setMode('client')}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${mode === 'client' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Cliente
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <Images size={16} className="text-[#0969ff]" /> {visibleItems.length} {visibleItems.length === 1 ? 'peça' : 'peças'}
          </div>
        </div>
      </section>

      {mode === 'direction' ? (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <CheckCircle2 size={18} className="shrink-0 text-blue-600" />
          <div><strong>Aprovação da direção</strong> · {user?.name || 'Arthur'} revisa e aprova aqui dentro do ZebraHub. A peça aprovada continua visível com selo e é liberada para o cliente.</div>
        </div>
      ) : (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <UsersRound size={19} className="mt-0.5 shrink-0 text-violet-600" />
              <div>
                <p className="text-sm font-bold text-violet-950">Aprovação do cliente</p>
                <p className="mt-0.5 text-sm text-violet-700">Somente peças já aprovadas pela direção aparecem no link externo.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {clientApprovalUrl ? (
                <>
                  <button type="button" onClick={copyApprovalLink} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"><Copy size={15} /> Copiar link</button>
                  <a href={clientApprovalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50"><ExternalLink size={15} /> Abrir</a>
                </>
              ) : (
                <button type="button" disabled={linkLoading || !selectedClient?.id} onClick={createApprovalLink} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                  {linkLoading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Gerar link do cliente
                </button>
              )}
            </div>
          </div>
          {linkNotice && <p className="mt-3 text-xs font-semibold text-violet-700">{linkNotice}</p>}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      )}

      {!selectedClient?.id ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><Images size={24} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Selecione um cliente</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">A aprovação reproduz a grade do Instagram do cliente selecionado.</p>
        </div>
      ) : loading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-slate-200 bg-white text-sm text-slate-400">Carregando aprovação...</div>
      ) : visibleItems.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><Check size={24} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Nada aguardando aprovação</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">No Squad → Designer, envie uma tarefa ou subtarefa com imagem para “Em aprovação”.</p>
          <Link to="/designer" className="mt-5 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Abrir Designer</Link>
        </div>
      ) : (
        <div className="flex justify-center py-1">
          <InstagramProfileMockup
            client={profileClient || { name: clientLabel }}
            highlights={highlights}
            posts={approvalPosts}
            onPostClick={openItem}
            sourceType="planned"
            showCoverBadges={false}
          />
        </div>
      )}

      {selectedItem && (
        <ModalBackdrop onClose={() => setSelectedItem(null)}>
          <div className="w-full max-w-[1040px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_390px]">
              <div className="relative flex min-h-[420px] items-center justify-center bg-[#0b0d12] p-4 lg:min-h-[650px]">
                {currentImage && <img src={currentImage} alt="" className="max-h-[80vh] max-w-full object-contain" />}
                {selectedItem.images?.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setImageIndex((current) => (current - 1 + selectedItem.images.length) % selectedItem.images.length)}
                      className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75"
                      aria-label="Imagem anterior"
                    ><ChevronLeft size={21} /></button>
                    <button
                      type="button"
                      onClick={() => setImageIndex((current) => (current + 1) % selectedItem.images.length)}
                      className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75"
                      aria-label="Próxima imagem"
                    ><ChevronRight size={21} /></button>
                    <span className="absolute bottom-4 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">{imageIndex + 1}/{selectedItem.images.length}</span>
                  </>
                )}
              </div>

              <aside className="flex min-w-0 flex-col bg-white">
                <div className="flex items-start gap-3 border-b border-slate-100 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0969ff]">Aprovação do Designer</p>
                    <h2 className="mt-1 text-lg font-bold leading-6 text-slate-950">{selectedItem.title}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-500">{selectedItem.client_name || clientLabel}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedItem(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Fechar"><X size={18} /></button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  <div className="grid gap-2">
                    <div className={`rounded-xl border px-3 py-3 ${statusTone(selectedDirectionStatus)}`}>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">Direção</p>
                      <p className="mt-1 text-sm font-bold">{directionStatusLabel(selectedItem)}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-3 ${statusTone(selectedClientStatus)}`}>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">Cliente</p>
                      <p className="mt-1 text-sm font-bold">{clientStatusLabel(selectedItem)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedItem.content_tag && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{selectedItem.content_tag}</span>}
                    {selectedItem.content_type && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{CONTENT_TYPE_LABELS[selectedItem.content_type] || selectedItem.content_type}</span>}
                    {selectedItem.parent_task_id && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Subtarefa</span>}
                  </div>
                  {selectedItem.images?.length > 1 && (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Ordem do carrossel</p>
                        {contentSaving && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Loader2 size={12} className="animate-spin" /> Salvando</span>}
                      </div>
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                        {selectedItem.images.map((image, index) => (
                          <div key={`${image.data}-${index}`} className={`relative w-20 shrink-0 overflow-hidden rounded-xl border ${imageIndex === index ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                            <button type="button" onClick={() => setImageIndex(index)} className="block aspect-square w-full bg-slate-100">
                              <img src={image.data} alt={`Slide ${index + 1}`} className="h-full w-full object-cover" />
                            </button>
                            <div className="grid grid-cols-2 border-t border-slate-100 bg-white">
                              <button type="button" disabled={contentSaving || index === 0} onClick={() => moveCarouselImage(selectedItem, index, index - 1)} className="flex h-7 items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-25" aria-label={`Mover slide ${index + 1} para a esquerda`}><ChevronLeft size={13} /></button>
                              <button type="button" disabled={contentSaving || index === selectedItem.images.length - 1} onClick={() => moveCarouselImage(selectedItem, index, index + 1)} className="flex h-7 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-slate-50 disabled:opacity-25" aria-label={`Mover slide ${index + 1} para a direita`}><ChevronRight size={13} /></button>
                            </div>
                            <span className="absolute left-1 top-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white">{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Legenda</p>
                      {!captionEditing && (
                        <button type="button" onClick={() => { setCaptionDraft(selectedItem.caption || ''); setCaptionEditing(true); }} className="inline-flex items-center gap-1 text-xs font-bold text-[#0969ff] hover:underline"><Pencil size={12} /> Editar</button>
                      )}
                    </div>
                    {captionEditing ? (
                      <div className="mt-2">
                        <textarea value={captionDraft} onChange={(event) => setCaptionDraft(event.target.value)} rows={5} placeholder="Escreva a legenda desta publicação..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" disabled={contentSaving} onClick={() => { setCaptionDraft(selectedItem.caption || ''); setCaptionEditing(false); }} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                          <button type="button" disabled={contentSaving} onClick={() => saveCaption(selectedItem)} className="inline-flex items-center gap-1 rounded-lg bg-[#0969ff] px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">{contentSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar legenda</button>
                        </div>
                      </div>
                    ) : (
                      <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${selectedItem.caption ? 'text-slate-600' : 'italic text-slate-400'}`}>{selectedItem.caption || 'Sem legenda definida.'}</p>
                    )}
                  </div>
                  {selectedItem.direction_feedback && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><strong>Direção:</strong> {selectedItem.direction_feedback}</div>
                  )}
                  {selectedItem.client_feedback && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><strong>Cliente:</strong> {selectedItem.client_feedback}</div>
                  )}
                  {actionError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{actionError}</div>
                  )}
                  <Link to={`/designer?task_id=${selectedItem.parent_task_id || selectedItem.id}`} className="inline-flex text-sm font-semibold text-[#0969ff] hover:underline">Abrir tarefa no Designer</Link>
                </div>

                <div className="border-t border-slate-100 p-5">
                  {mode === 'direction' ? (
                    canDirectionApprove ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={updatingId === selectedItem.id}
                          onClick={() => setCorrectionOpen(true)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        ><MessageSquareWarning size={16} /> Correção</button>
                        <button
                          type="button"
                          disabled={updatingId === selectedItem.id}
                          onClick={() => directionDecision(selectedItem, 'approved')}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >{updatingId === selectedItem.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />} Aprovar</button>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${selectedDirectionStatus === 'changes_requested' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}><CheckCircle2 size={17} /> {directionStatusLabel(selectedItem)}</div>
                    )
                  ) : (
                    <div className="rounded-xl bg-violet-50 px-4 py-3 text-center text-sm font-semibold text-violet-700">A decisão do cliente acontece pelo link externo.</div>
                  )}
                  {mode === 'direction' && correctionOpen && canDirectionApprove && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <label className="text-xs font-bold text-rose-800">O que precisa ser corrigido?</label>
                      <textarea
                        value={correctionFeedback}
                        onChange={(event) => setCorrectionFeedback(event.target.value)}
                        rows={3}
                        placeholder="Ex.: ajustar o título, trocar a foto, aumentar o respiro..."
                        className="mt-2 w-full resize-none rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-400"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => { setCorrectionOpen(false); setCorrectionFeedback(''); }} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-white">Cancelar</button>
                        <button type="button" disabled={updatingId === selectedItem.id || !correctionFeedback.trim()} onClick={() => directionDecision(selectedItem, 'changes_requested', correctionFeedback)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">Enviar correção</button>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
