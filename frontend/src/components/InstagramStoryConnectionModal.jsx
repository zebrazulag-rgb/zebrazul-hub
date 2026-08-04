import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Instagram,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Unlink,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

function formatDate(value) {
  if (!value) return 'Sem validade informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function InstagramStoryConnectionModal({ open, onClose, clientId, clientName, onChanged, user }) {
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oauthInfo, setOauthInfo] = useState(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (open && clientId) loadStatus();
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return undefined;
    const receiveOAuthResult = (event) => {
      const payload = event.data;
      if (!payload || payload.type !== 'zebrahub-instagram-oauth') return;
      if (Number(payload.clientId) !== Number(clientId)) return;
      if (popupRef.current && event.source !== popupRef.current) return;
      setConnecting(false);
      if (payload.ok) {
        setNotice(payload.message || 'Instagram conectado com sucesso.');
        setError('');
        loadStatus({ keepNotice: true });
        onChanged?.();
      } else {
        setError(payload.message || 'A autorização do Instagram não foi concluída.');
      }
    };
    window.addEventListener('message', receiveOAuthResult);
    return () => window.removeEventListener('message', receiveOAuthResult);
  }, [open, clientId, onChanged]);

  async function loadStatus({ keepNotice = false } = {}) {
    setLoading(true);
    setError('');
    if (!keepNotice) setNotice('');
    try {
      const { data } = await api.get(`/instagram-oauth/status/${clientId}`, { params: { _ts: Date.now() } });
      setOauthInfo(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar a conexão do Instagram.');
    } finally {
      setLoading(false);
    }
  }

  async function startOAuth() {
    setConnecting(true);
    setError('');
    setNotice('');
    const popup = window.open(
      'about:blank',
      'zebrahub-instagram-oauth',
      'popup=yes,width=620,height=760,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
    );
    popupRef.current = popup;
    if (!popup) {
      setConnecting(false);
      setError('O navegador bloqueou a janela. Libere pop-ups para o ZebraHub e tente novamente.');
      return;
    }
    try {
      popup.document.write('<p style="font-family:system-ui;padding:24px">Preparando conexão segura com o Instagram...</p>');
      const { data } = await api.post(`/instagram-oauth/start/${clientId}`, { origin: window.location.origin });
      popup.location.href = data.authorization_url;
      popup.focus();
    } catch (requestError) {
      popup.close();
      setConnecting(false);
      setError(requestError.response?.data?.error || 'Não foi possível iniciar a conexão com o Instagram.');
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o Instagram da Central de Stories? O histórico já salvo será preservado.')) return;
    setDisconnecting(true);
    setError('');
    try {
      await api.delete(`/instagram-oauth/client/${clientId}`);
      setOauthInfo((current) => ({ ...(current || {}), connection: null }));
      setNotice('Instagram desconectado. O histórico de Stories foi preservado.');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desconectar o Instagram.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connection = oauthInfo?.connection || null;
  const oauthConfigured = Boolean(oauthInfo?.oauth?.configured);

  if (!open) return null;

  return (
    <ModalBackdrop onClose={onClose} disabled={connecting || disconnecting}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="section-kicker">Login direto do Instagram</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Stories de {clientName || 'cliente'}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
              O cliente autoriza a conta profissional diretamente no Instagram. Não é necessário selecionar Página do Facebook.
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={18} />{error}</div>}
          {notice && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 shrink-0" size={18} />{notice}</div>}

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={21} /> Verificando conexão...</div>
          ) : !oauthConfigured ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-start gap-4">
                <span className="icon-tile bg-white text-amber-600"><KeyRound size={20} /></span>
                <div>
                  <h3 className="font-bold text-amber-950">Aplicativo do Instagram ainda não configurado</h3>
                  <p className="mt-1 text-sm leading-6 text-amber-800">
                    Adicione no Railway <strong>INSTAGRAM_APP_ID</strong> e <strong>INSTAGRAM_APP_SECRET</strong>. No painel da Meta, cadastre esta URL de redirecionamento:
                  </p>
                  <code className="mt-3 block break-all rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">{oauthInfo?.oauth?.redirect_uri || 'URL de callback indisponível'}</code>
                  {user?.role === 'admin' && <p className="mt-3 text-xs text-amber-700">Use o ID e a chave secreta exibidos dentro da configuração da API do Instagram, não o App ID principal do Facebook.</p>}
                </div>
              </div>
            </div>
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {connection?.profile_picture_url ? (
                    <img src={connection.profile_picture_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className={`icon-tile ${connection && connection.status !== 'expired' ? 'bg-fuchsia-50 text-fuchsia-600' : 'bg-blue-50 text-blue-600'}`}><Instagram size={21} /></span>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900">Conta profissional do Instagram</h3>
                    {connection ? (
                      <div className="mt-1 space-y-1 text-sm text-slate-500">
                        <p className="truncate"><strong className="text-slate-700">{connection.username ? `@${connection.username}` : connection.display_name || 'Conta conectada'}</strong></p>
                        <p>{connection.account_type || 'Conta profissional'} • {connection.expired ? 'autorização expirada' : `validade: ${formatDate(connection.token_expires_at)}`}</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm leading-6 text-slate-500">Entre na conta Business que receberá as marcações e autorize mensagens e publicação. Contas Creator podem receber mensagens, mas não publicam Stories pela API.</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={startOAuth} disabled={connecting} className="btn-primary flex shrink-0 items-center justify-center gap-2">
                  {connecting ? <LoaderCircle size={17} className="animate-spin" /> : <ExternalLink size={17} />}
                  {connecting ? 'Abrindo Instagram...' : connection ? 'Reconectar Instagram' : 'Conectar Instagram'}
                </button>
              </div>

              {connection && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                  A conta foi identificada automaticamente. Feche esta janela e clique em <strong>Ativar recebimento</strong>.
                </div>
              )}
            </section>
          )}

          {connection && (
            <div className="flex justify-start border-t border-slate-100 pt-5">
              <button type="button" onClick={disconnect} disabled={disconnecting} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                {disconnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Unlink size={16} />} Desconectar Instagram
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
