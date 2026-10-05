import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, MessageSquareWarning, X } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import InstagramProfileMockup from '../components/InstagramProfileMockup.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const configuredApiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const productionApiBase = 'https://zebrazul-hub-production.up.railway.app/api';

function publicApiCandidates(preferredBase = null) {
  const bases = [preferredBase, configuredApiBase, productionApiBase]
    .map((value) => String(value || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(bases)].map((baseURL) => ({
    baseURL,
    api: attachMediaResolver(axios.create({ baseURL })),
  }));
}

function clientStatus(item) {
  if (item?.client_status === 'approved') return 'approved';
  if (item?.client_status === 'changes_requested') return 'rejected';
  return 'pending_approval';
}

export default function PublicDesignerApproval() {
  const { token } = useParams();
  const [client, setClient] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [items, setItems] = useState([]);
  const [openItem, setOpenItem] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeApiBaseRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadApproval() {
      setLoading(true);
      setError('');
      let lastError = null;

      for (const candidate of publicApiCandidates(activeApiBaseRef.current)) {
        try {
          const { data } = await candidate.api.get(`/public/designer-approval/${token}`);
          // Quando /api cai por engano no SPA da Vercel, a resposta pode ser
          // HTML com HTTP 200. Só aceitamos o payload real da API.
          if (!data || typeof data !== 'object' || !data.client) {
            throw new Error('Resposta inválida da API de aprovação.');
          }
          if (cancelled) return;
          activeApiBaseRef.current = candidate.baseURL;
          setClient(data.client || null);
          setHighlights(data.highlights || []);
          setItems(data.items || []);
          return;
        } catch (requestError) {
          lastError = requestError;
        }
      }

      if (cancelled) return;
      const serverMessage = lastError?.response?.data?.error;
      const status = lastError?.response?.status;
      setError(serverMessage || (status
        ? `Não foi possível abrir este link de aprovação (HTTP ${status}).`
        : 'Não foi possível conectar ao servidor de aprovação.'));
    }

    loadApproval().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token]);

  const posts = useMemo(() => items.map((item) => ({
    ...item,
    content_id: item.id,
    media_data: item.images?.[0]?.data || '',
    media_mime: item.images?.[0]?.mime || 'image/jpeg',
    media_gallery: Array.isArray(item.images) ? item.images : [],
    content_type: Number(item.image_count || item.images?.length || 0) > 1 ? 'carrossel' : (item.content_type || 'feed'),
    status: clientStatus(item),
    workflow_stage: null,
  })), [items]);

  function selectItem(item) {
    setOpenItem(item);
    setImageIndex(0);
    setFeedback(item?.client_feedback || '');
    setNotice('');
  }

  async function decide(decision) {
    if (!openItem?.id || decisionLoading || openItem.client_status === 'approved') return;
    setDecisionLoading(true);
    setNotice('');
    try {
      let response = null;
      let lastError = null;
      for (const candidate of publicApiCandidates(activeApiBaseRef.current)) {
        try {
          response = await candidate.api.put(`/public/designer-approval/${token}/items/${openItem.id}`, {
            decision,
            feedback: feedback.trim() || null,
          });
          activeApiBaseRef.current = candidate.baseURL;
          break;
        } catch (requestError) {
          lastError = requestError;
        }
      }
      if (!response) throw lastError || new Error('Servidor de aprovação indisponível.');

      const state = response.data?.state || {};
      const updated = { ...openItem, ...state };
      setOpenItem(updated);
      setItems((current) => current.map((entry) => Number(entry.id) === Number(updated.id) ? { ...entry, ...state } : entry));
      setNotice(decision === 'approved' ? 'Peça aprovada. Ela continuará visível com o selo de aprovado.' : 'Correção solicitada.');
    } catch (requestError) {
      setNotice(requestError?.response?.data?.error || requestError?.message || 'Não foi possível registrar sua decisão.');
    } finally {
      setDecisionLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">Carregando aprovação...</div>;
  if (error) return <div className="min-h-screen bg-slate-100 p-5 flex items-center justify-center"><div className="max-w-md rounded-2xl bg-white p-7 text-center text-slate-600 shadow-sm">{error}</div></div>;

  const currentImage = openItem?.images?.[imageIndex]?.data || null;
  const decisionClosed = openItem?.client_status === 'approved' || openItem?.client_status === 'changes_requested';

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-7 sm:px-5">
      <div className="mx-auto mb-5 max-w-[620px]">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Aprovação de conteúdo</p>
        <h1 className="mt-1 text-xl font-bold text-slate-950">{client?.name || 'Cliente'}</h1>
        <p className="mt-1 text-sm text-slate-500">Toque em uma peça para revisar, aprovar ou solicitar correção.</p>
      </div>
      <div className="flex justify-center">
        <InstagramProfileMockup client={client} highlights={highlights} posts={posts} onPostClick={selectItem} sourceType="planned" showCoverBadges={false} />
      </div>

      {openItem && (
        <ModalBackdrop onClose={() => setOpenItem(null)}>
          <div className="w-full max-w-[980px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_370px]">
              <div className="relative flex min-h-[420px] items-center justify-center bg-[#0b0d12] p-4 lg:min-h-[620px]">
                {currentImage && <img src={currentImage} alt="" className="max-h-[80vh] max-w-full object-contain" />}
                {openItem.images?.length > 1 && (
                  <>
                    <button type="button" onClick={() => setImageIndex((current) => (current - 1 + openItem.images.length) % openItem.images.length)} className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"><ChevronLeft size={21} /></button>
                    <button type="button" onClick={() => setImageIndex((current) => (current + 1) % openItem.images.length)} className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"><ChevronRight size={21} /></button>
                    <span className="absolute bottom-4 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white">{imageIndex + 1}/{openItem.images.length}</span>
                  </>
                )}
              </div>
              <aside className="flex min-w-0 flex-col bg-white">
                <div className="flex items-start gap-3 border-b border-slate-100 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0969ff]">Sua aprovação</p>
                    <h2 className="mt-1 text-lg font-bold leading-6 text-slate-950">{openItem.title}</h2>
                  </div>
                  <button type="button" onClick={() => setOpenItem(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400" aria-label="Fechar"><X size={18} /></button>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  {openItem.client_status === 'approved' && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 size={17} /> Aprovado</div>}
                  {openItem.client_status === 'changes_requested' && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700"><MessageSquareWarning size={17} /> Correção solicitada</div>}
                  {openItem.caption && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{openItem.caption}</p>}
                  <textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    rows={4}
                    disabled={decisionClosed}
                    placeholder="Comentário ou ajuste (opcional)"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                  {notice && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">{notice}</p>}
                </div>
                <div className="border-t border-slate-100 p-5">
                  {decisionClosed ? (
                    <div className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-600">Decisão registrada</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={decisionLoading} onClick={() => decide('changes_requested')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700 disabled:opacity-50">{decisionLoading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquareWarning size={16} />} Correção</button>
                      <button type="button" disabled={decisionLoading} onClick={() => decide('approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">{decisionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar</button>
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
