import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  KeyRound,
  LoaderCircle,
  Megaphone,
  Save,
  ShieldCheck,
  Unlink,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_insights',
  'ads_read',
];

function formatDate(value) {
  if (!value) return 'Sem data informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function pageLabel(page) {
  const instagram = page.instagram?.username ? ` • Instagram @${page.instagram.username}` : ' • sem Instagram profissional vinculado';
  return `${page.name}${instagram}`;
}

export default function ReportConnectionsModal({ open, onClose, clientId, clientName, onChanged, user }) {
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oauthInfo, setOauthInfo] = useState(null);
  const [assets, setAssets] = useState({ pages: [], ad_accounts: [] });
  const [pageId, setPageId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const popupRef = useRef(null);

  useEffect(() => {
    if (open && clientId) loadEverything();
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return undefined;
    const receiveOAuthResult = (event) => {
      const payload = event.data;
      if (!payload || payload.type !== 'zebrahub-meta-oauth') return;
      if (Number(payload.clientId) !== Number(clientId)) return;
      if (popupRef.current && event.source !== popupRef.current) return;
      setConnecting(false);
      if (payload.ok) {
        setNotice(payload.message || 'Meta autorizada. Agora escolha os ativos deste cliente.');
        setError('');
        loadEverything({ keepNotice: true });
      } else {
        setError(payload.message || 'A autorização da Meta não foi concluída.');
      }
    };
    window.addEventListener('message', receiveOAuthResult);
    return () => window.removeEventListener('message', receiveOAuthResult);
  }, [open, clientId]);

  async function loadEverything({ keepNotice = false } = {}) {
    setLoading(true);
    setError('');
    if (!keepNotice) setNotice('');
    try {
      const { data } = await api.get(`/meta-oauth/status/${clientId}`, { params: { _ts: Date.now() } });
      setOauthInfo(data);
      const connection = data.connection;
      setPageId(connection?.selected_page_id || '');
      setAdAccountId(connection?.selected_ad_account_id || '');

      if (connection && connection.status !== 'expired') {
        const assetsResponse = await api.get(`/meta-oauth/assets/${clientId}`, { params: { _ts: Date.now() } });
        setAssets({
          pages: assetsResponse.data.pages || [],
          ad_accounts: assetsResponse.data.ad_accounts || [],
        });
      } else {
        setAssets({ pages: [], ad_accounts: [] });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar as conexões deste cliente.');
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
      'zebrahub-meta-oauth',
      'popup=yes,width=620,height=760,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
    );
    popupRef.current = popup;
    if (!popup) {
      setConnecting(false);
      setError('O navegador bloqueou a janela de conexão. Libere pop-ups para o ZebraHub e tente novamente.');
      return;
    }
    try {
      popup.document.write('<p style="font-family:system-ui;padding:24px">Preparando conexão segura com a Meta...</p>');
      const { data } = await api.post(`/meta-oauth/start/${clientId}`, { origin: window.location.origin });
      popup.location.href = data.authorization_url;
      popup.focus();
    } catch (requestError) {
      popup.close();
      setConnecting(false);
      setError(requestError.response?.data?.error || 'Não foi possível iniciar a conexão com a Meta.');
    }
  }

  async function saveSelections() {
    if (!pageId && !adAccountId) {
      setError('Selecione uma Página/Instagram ou uma conta de anúncios.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.put(`/meta-oauth/client/${clientId}/selections`, {
        page_id: pageId || null,
        ad_account_id: adAccountId || null,
      });
      setNotice('Ativos salvos! O relatório deste cliente passará a usar esta autorização.');
      await loadEverything({ keepNotice: true });
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar os ativos selecionados.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar a autorização da Meta? Os dados já sincronizados serão preservados, mas novas atualizações ficarão pausadas.')) return;
    setDisconnecting(true);
    setError('');
    try {
      await api.delete(`/meta-oauth/client/${clientId}`);
      setOauthInfo((current) => ({ ...(current || {}), connection: null }));
      setAssets({ pages: [], ad_accounts: [] });
      setPageId('');
      setAdAccountId('');
      setNotice('Meta desconectada. O histórico já salvo foi preservado.');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desconectar a Meta.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connection = oauthInfo?.connection || null;
  const oauthConfigured = Boolean(oauthInfo?.oauth?.configured);
  const missingScopes = useMemo(() => {
    const granted = new Set(connection?.scopes || []);
    return REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
  }, [connection?.scopes]);

  if (!open) return null;

  return (
    <ModalBackdrop onClose={onClose} disabled={connecting || saving || disconnecting}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="section-kicker">Conexão direta por cliente</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Meta de {clientName || 'cliente'}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              O responsável autoriza as próprias contas. Não é necessário adicionar os ativos ao portfólio empresarial da agência.
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={18} />{error}</div>}
          {notice && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 shrink-0" size={18} />{notice}</div>}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={21} /> Carregando conexão e ativos...</div>
          ) : !oauthConfigured ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-start gap-4">
                <span className="icon-tile bg-white text-amber-600"><KeyRound size={20} /></span>
                <div>
                  <h3 className="font-bold text-amber-950">Aplicativo Meta ainda não configurado</h3>
                  <p className="mt-1 text-sm leading-6 text-amber-800">Adicione no Railway as variáveis <strong>META_APP_ID</strong> e <strong>META_APP_SECRET</strong>. Depois, cadastre esta URL em <strong>Valid OAuth Redirect URIs</strong> no painel da Meta:</p>
                  <code className="mt-3 block break-all rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">{oauthInfo?.oauth?.redirect_uri || 'URL de callback indisponível'}</code>
                  {user?.role === 'admin' && <p className="mt-3 text-xs text-amber-700">A configuração é feita uma única vez para o ZebraHub. Depois, cada cliente conecta as próprias contas.</p>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className={`icon-tile ${connection && connection.status !== 'expired' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#0969ff]'}`}>
                      <ShieldCheck size={20} />
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900">Autorização oficial da Meta</h3>
                      {connection ? (
                        <div className="mt-1 space-y-1 text-sm text-slate-500">
                          <p>Autorizado por <strong className="text-slate-700">{connection.provider_user_name || 'usuário da Meta'}</strong>.</p>
                          <p>{connection.expired ? 'A autorização expirou e precisa ser renovada.' : `Validade informada: ${formatDate(connection.token_expires_at)}`}</p>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm leading-6 text-slate-500">A pessoa que administra a Página, o Instagram ou a conta de anúncios faz login e escolhe o que deseja liberar.</p>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={startOAuth} disabled={connecting} className="btn-primary flex shrink-0 items-center justify-center gap-2">
                    {connecting ? <LoaderCircle size={17} className="animate-spin" /> : <ExternalLink size={17} />}
                    {connecting ? 'Abrindo Meta...' : connection ? 'Reconectar Meta' : 'Conectar com a Meta'}
                  </button>
                </div>

                {connection && missingScopes.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    Algumas permissões não foram concedidas: <strong>{missingScopes.join(', ')}</strong>. Use “Reconectar Meta” para revisar os acessos.
                  </div>
                )}
              </section>

              {connection && connection.status !== 'expired' && (
                <div className="grid gap-5 lg:grid-cols-2">
                  <ConnectionBlock
                    icon={<><Facebook size={18} /><Instagram size={18} /></>}
                    title="Facebook e Instagram"
                    description="Selecione a Página. O Instagram profissional vinculado será identificado automaticamente."
                    connected={Boolean(connection.selected_page_id)}
                  >
                    <select className="input-field" value={pageId} onChange={(event) => setPageId(event.target.value)}>
                      <option value="">Não conectar orgânico agora</option>
                      {assets.pages.map((page) => <option key={page.id} value={page.id}>{pageLabel(page)}</option>)}
                    </select>
                    {!assets.pages.length && <p className="text-xs leading-5 text-slate-500">Nenhuma Página foi retornada. Confirme se o usuário possui acesso à Página e se concedeu as permissões solicitadas.</p>}
                    {pageId && (() => {
                      const selected = assets.pages.find((page) => String(page.id) === String(pageId));
                      return selected ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                          {selected.picture_url ? <img src={selected.picture_url} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="icon-tile bg-blue-50 text-blue-600"><Facebook size={18} /></span>}
                          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{selected.name}</p><p className="truncate text-xs text-slate-500">{selected.instagram?.username ? `Instagram @${selected.instagram.username}` : 'Sem Instagram profissional vinculado'}</p></div>
                        </div>
                      ) : null;
                    })()}
                  </ConnectionBlock>

                  <ConnectionBlock
                    icon={<Megaphone size={19} />}
                    title="Meta Ads"
                    description="Opcional. Selecione a conta de anúncios usada nas campanhas deste cliente."
                    connected={Boolean(connection.selected_ad_account_id)}
                    optional
                  >
                    <select className="input-field" value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)}>
                      <option value="">Não conectar anúncios agora</option>
                      {assets.ad_accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} • {account.account_id}{account.currency ? ` • ${account.currency}` : ''}</option>)}
                    </select>
                    {!assets.ad_accounts.length && <p className="text-xs leading-5 text-slate-500">Nenhuma conta de anúncios foi retornada. O usuário precisa ter acesso à conta e autorizar a permissão de leitura de anúncios.</p>}
                  </ConnectionBlock>
                </div>
              )}

              {connection && connection.status !== 'expired' && (
                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={disconnect} disabled={disconnecting} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                    {disconnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Unlink size={16} />} Desconectar autorização
                  </button>
                  <button type="button" onClick={saveSelections} disabled={saving || (!pageId && !adAccountId)} className="btn-primary flex items-center justify-center gap-2">
                    {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
                    {saving ? 'Salvando...' : 'Salvar ativos do cliente'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}

function ConnectionBlock({ icon, title, description, connected, optional, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile flex gap-1 bg-white text-[#0969ff] shadow-sm">{icon}</span>
          <div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>
        </div>
        <span className={`badge shrink-0 ${connected ? 'bg-emerald-100 text-emerald-700' : optional ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{connected ? 'Selecionado' : optional ? 'Opcional' : 'Pendente'}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
