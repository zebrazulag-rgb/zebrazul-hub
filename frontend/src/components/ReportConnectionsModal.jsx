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

const META_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_insights',
  'ads_read',
];

const INSTAGRAM_REPORT_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
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
  const [instagramConnecting, setInstagramConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [instagramDisconnecting, setInstagramDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oauthInfo, setOauthInfo] = useState(null);
  const [instagramInfo, setInstagramInfo] = useState(null);
  const [assets, setAssets] = useState({ pages: [], ad_accounts: [] });
  const [pageId, setPageId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const metaPopupRef = useRef(null);
  const instagramPopupRef = useRef(null);

  useEffect(() => {
    if (open && clientId) loadEverything();
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return undefined;

    const receiveOAuthResult = (event) => {
      const payload = event.data;
      if (!payload || Number(payload.clientId) !== Number(clientId)) return;

      if (payload.type === 'zebrahub-meta-oauth') {
        if (metaPopupRef.current && event.source !== metaPopupRef.current) return;
        setConnecting(false);
        if (payload.ok) {
          setNotice(payload.message || 'Meta autorizada. Agora escolha os ativos deste cliente.');
          setError('');
          loadEverything({ keepNotice: true });
          onChanged?.();
        } else {
          setError(payload.message || 'A autorização da Meta não foi concluída.');
        }
      }

      if (payload.type === 'zebrahub-instagram-oauth') {
        if (instagramPopupRef.current && event.source !== instagramPopupRef.current) return;
        setInstagramConnecting(false);
        if (payload.ok) {
          setNotice('Instagram conectado diretamente. O relatório orgânico já pode usar esta conta.');
          setError('');
          loadEverything({ keepNotice: true });
          onChanged?.();
        } else {
          setError(payload.message || 'A conexão direta com o Instagram não foi concluída.');
        }
      }
    };

    window.addEventListener('message', receiveOAuthResult);
    return () => window.removeEventListener('message', receiveOAuthResult);
  }, [open, clientId, onChanged]);

  async function loadEverything({ keepNotice = false } = {}) {
    setLoading(true);
    setError('');
    if (!keepNotice) setNotice('');

    try {
      const [metaResult, instagramResult] = await Promise.allSettled([
        api.get(`/meta-oauth/status/${clientId}`, { params: { _ts: Date.now() } }),
        api.get(`/instagram-oauth/status/${clientId}`, { params: { _ts: Date.now() } }),
      ]);

      if (metaResult.status === 'fulfilled') {
        const data = metaResult.value.data;
        setOauthInfo(data);
        const connection = data.connection;
        setPageId(connection?.selected_page_id || '');
        setAdAccountId(connection?.selected_ad_account_id || '');

        if (connection && connection.status !== 'expired') {
          try {
            const assetsResponse = await api.get(`/meta-oauth/assets/${clientId}`, { params: { _ts: Date.now() } });
            setAssets({
              pages: assetsResponse.data.pages || [],
              ad_accounts: assetsResponse.data.ad_accounts || [],
            });
          } catch (assetsError) {
            setAssets({ pages: [], ad_accounts: [] });
            setError(assetsError.response?.data?.error || 'A Meta foi conectada, mas não foi possível listar os ativos.');
          }
        } else {
          setAssets({ pages: [], ad_accounts: [] });
        }
      } else {
        setOauthInfo(null);
        setAssets({ pages: [], ad_accounts: [] });
      }

      if (instagramResult.status === 'fulfilled') {
        setInstagramInfo(instagramResult.value.data);
      } else {
        setInstagramInfo(null);
      }

      if (metaResult.status === 'rejected' && instagramResult.status === 'rejected') {
        const requestError = metaResult.reason || instagramResult.reason;
        setError(requestError?.response?.data?.error || 'Não foi possível carregar as conexões deste cliente.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function startMetaOAuth() {
    setConnecting(true);
    setError('');
    setNotice('');
    const popup = window.open(
      'about:blank',
      'zebrahub-meta-oauth',
      'popup=yes,width=620,height=760,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
    );
    metaPopupRef.current = popup;
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

  async function startInstagramOAuth() {
    setInstagramConnecting(true);
    setError('');
    setNotice('');
    const popup = window.open(
      'about:blank',
      'zebrahub-instagram-oauth',
      'popup=yes,width=620,height=760,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
    );
    instagramPopupRef.current = popup;
    if (!popup) {
      setInstagramConnecting(false);
      setError('O navegador bloqueou a janela de conexão. Libere pop-ups para o ZebraHub e tente novamente.');
      return;
    }
    try {
      popup.document.write('<p style="font-family:system-ui;padding:24px">Preparando conexão direta com o Instagram...</p>');
      const { data } = await api.post(`/instagram-oauth/start/${clientId}`, { origin: window.location.origin });
      popup.location.href = data.authorization_url;
      popup.focus();
    } catch (requestError) {
      popup.close();
      setInstagramConnecting(false);
      setError(requestError.response?.data?.error || 'Não foi possível iniciar a conexão com o Instagram.');
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
      setNotice('Ativos da Meta salvos. O relatório deste cliente passará a usar esta autorização.');
      await loadEverything({ keepNotice: true });
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar os ativos selecionados.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnectMeta() {
    if (!window.confirm('Desconectar a autorização da Meta? Os dados já sincronizados serão preservados, mas novas atualizações por essa conexão ficarão pausadas.')) return;
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

  async function disconnectInstagram() {
    if (!window.confirm('Desconectar o Instagram direto deste cliente? Os dados já sincronizados serão preservados.')) return;
    setInstagramDisconnecting(true);
    setError('');
    try {
      await api.delete(`/instagram-oauth/client/${clientId}`);
      setInstagramInfo((current) => ({ ...(current || {}), connection: null }));
      setNotice('Instagram direto desconectado. O histórico já salvo foi preservado.');
      onChanged?.();
      await loadEverything({ keepNotice: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desconectar o Instagram.');
    } finally {
      setInstagramDisconnecting(false);
    }
  }

  const metaConnection = oauthInfo?.connection || null;
  const instagramConnection = instagramInfo?.connection || null;
  const metaConfigured = Boolean(oauthInfo?.oauth?.configured);
  const instagramConfigured = Boolean(instagramInfo?.oauth?.configured);

  const missingMetaScopes = useMemo(() => {
    const granted = new Set(metaConnection?.scopes || []);
    return META_REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
  }, [metaConnection?.scopes]);

  const missingInstagramScopes = useMemo(() => {
    const granted = new Set(instagramConnection?.scopes || []);
    return INSTAGRAM_REPORT_SCOPES.filter((scope) => !granted.has(scope));
  }, [instagramConnection?.scopes]);

  if (!open) return null;

  return (
    <ModalBackdrop onClose={onClose} disabled={connecting || instagramConnecting || saving || disconnecting || instagramDisconnecting}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="section-kicker">Conexões por cliente</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Relatórios de {clientName || 'cliente'}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Mantenha a conexão pela Meta quando ela funcionar. Se o Instagram do cliente não aparecer pela Página, conecte a conta profissional diretamente.
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={18} />{error}</div>}
          {notice && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 shrink-0" size={18} />{notice}</div>}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={21} /> Carregando conexões...</div>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className={`icon-tile ${metaConnection && metaConnection.status !== 'expired' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#0969ff]'}`}>
                        <ShieldCheck size={20} />
                      </span>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Opção principal</p>
                        <h3 className="mt-1 font-bold text-slate-900">Conectar com a Meta</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500">Mantém Facebook, Instagram vinculado à Página e Meta Ads no mesmo fluxo.</p>
                      </div>
                    </div>
                  </div>

                  {!metaConfigured ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex gap-3">
                        <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-600" />
                        <div className="min-w-0 text-xs leading-5 text-amber-800">
                          <p className="font-bold text-amber-950">Aplicativo Meta não configurado</p>
                          <p>Configure <strong>META_APP_ID</strong> e <strong>META_APP_SECRET</strong> no Railway.</p>
                          {oauthInfo?.oauth?.redirect_uri && <code className="mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-[11px]">{oauthInfo.oauth.redirect_uri}</code>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {metaConnection && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-500">
                          <p>Autorizado por <strong className="text-slate-700">{metaConnection.provider_user_name || 'usuário da Meta'}</strong>.</p>
                          <p className="mt-1">{metaConnection.expired ? 'A autorização expirou.' : `Validade informada: ${formatDate(metaConnection.token_expires_at)}`}</p>
                        </div>
                      )}
                      <button type="button" onClick={startMetaOAuth} disabled={connecting} className="btn-primary mt-4 flex w-full items-center justify-center gap-2">
                        {connecting ? <LoaderCircle size={17} className="animate-spin" /> : <ExternalLink size={17} />}
                        {connecting ? 'Abrindo Meta...' : metaConnection ? 'Reconectar Meta' : 'Conectar com a Meta'}
                      </button>
                      {metaConnection && missingMetaScopes.length > 0 && (
                        <p className="mt-3 text-xs leading-5 text-amber-700">Permissões ausentes: <strong>{missingMetaScopes.join(', ')}</strong>.</p>
                      )}
                    </>
                  )}
                </section>

                <section className="rounded-3xl border border-pink-200 bg-pink-50/40 p-5">
                  <div className="flex items-start gap-3">
                    <span className={`icon-tile ${instagramConnection && instagramConnection.status !== 'expired' ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-pink-600'}`}>
                      <Instagram size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-500">Alternativa para o orgânico</p>
                      <h3 className="mt-1 font-bold text-slate-900">Conectar somente o Instagram</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Use quando o Instagram não aparece na conexão pela Página. Não exige vincular uma Página do Facebook.</p>
                    </div>
                  </div>

                  {!instagramConfigured ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex gap-3">
                        <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-600" />
                        <div className="min-w-0 text-xs leading-5 text-amber-800">
                          <p className="font-bold text-amber-950">Login do Instagram não configurado</p>
                          <p>Configure <strong>INSTAGRAM_APP_ID</strong> e <strong>INSTAGRAM_APP_SECRET</strong> no Railway.</p>
                          {instagramInfo?.oauth?.redirect_uri && <code className="mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-[11px]">{instagramInfo.oauth.redirect_uri}</code>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {instagramConnection && (
                        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-pink-100 bg-white p-3">
                          {instagramConnection.profile_picture_url ? (
                            <img src={instagramConnection.profile_picture_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                          ) : (
                            <span className="icon-tile bg-pink-50 text-pink-600"><Instagram size={18} /></span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">{instagramConnection.display_name || instagramConnection.username || 'Instagram profissional'}</p>
                            <p className="truncate text-xs text-slate-500">{instagramConnection.username ? `@${instagramConnection.username}` : 'Conta profissional conectada'}{instagramConnection.account_type ? ` • ${instagramConnection.account_type}` : ''}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{instagramConnection.expired ? 'Autorização expirada' : `Validade: ${formatDate(instagramConnection.token_expires_at)}`}</p>
                          </div>
                        </div>
                      )}

                      <button type="button" onClick={startInstagramOAuth} disabled={instagramConnecting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
                        {instagramConnecting ? <LoaderCircle size={17} className="animate-spin" /> : <Instagram size={17} />}
                        {instagramConnecting ? 'Abrindo Instagram...' : instagramConnection ? 'Reconectar Instagram' : 'Conectar Instagram'}
                      </button>

                      {instagramConnection && missingInstagramScopes.length > 0 && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          Para gerar relatórios, reconecte concedendo: <strong>{missingInstagramScopes.join(', ')}</strong>.
                        </div>
                      )}

                      {instagramConnection && (
                        <button type="button" onClick={disconnectInstagram} disabled={instagramDisconnecting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                          {instagramDisconnecting ? <LoaderCircle size={15} className="animate-spin" /> : <Unlink size={15} />}
                          Desconectar Instagram direto
                        </button>
                      )}
                    </>
                  )}
                </section>
              </div>

              {instagramConnection && metaConnection && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
                  <strong>Modo híbrido ativo:</strong> o ZebraHub pode manter Facebook/Ads pela Meta e usar a conexão direta do Instagram para os dados orgânicos do Instagram.
                </div>
              )}

              {metaConnection && metaConnection.status !== 'expired' && (
                <>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <ConnectionBlock
                      icon={<><Facebook size={18} /><Instagram size={18} /></>}
                      title="Facebook e Instagram pela Meta"
                      description="Selecione a Página. Se houver um Instagram profissional vinculado, ele será identificado automaticamente."
                      connected={Boolean(metaConnection.selected_page_id)}
                    >
                      <select className="input-field" value={pageId} onChange={(event) => setPageId(event.target.value)}>
                        <option value="">Não conectar orgânico por esta rota</option>
                        {assets.pages.map((page) => <option key={page.id} value={page.id}>{pageLabel(page)}</option>)}
                      </select>
                      {!assets.pages.length && <p className="text-xs leading-5 text-slate-500">Nenhuma Página foi retornada. Nesse caso, você pode usar a opção “Conectar somente o Instagram” acima.</p>}
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
                      connected={Boolean(metaConnection.selected_ad_account_id)}
                      optional
                    >
                      <select className="input-field" value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)}>
                        <option value="">Não conectar anúncios agora</option>
                        {assets.ad_accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} • {account.account_id}{account.currency ? ` • ${account.currency}` : ''}</option>)}
                      </select>
                      {!assets.ad_accounts.length && <p className="text-xs leading-5 text-slate-500">Nenhuma conta de anúncios foi retornada. O usuário precisa ter acesso à conta e autorizar a permissão de leitura de anúncios.</p>}
                    </ConnectionBlock>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={disconnectMeta} disabled={disconnecting} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                      {disconnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Unlink size={16} />} Desconectar Meta
                    </button>
                    <button type="button" onClick={saveSelections} disabled={saving || (!pageId && !adAccountId)} className="btn-primary flex items-center justify-center gap-2">
                      {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
                      {saving ? 'Salvando...' : 'Salvar ativos da Meta'}
                    </button>
                  </div>
                </>
              )}

              {user?.role === 'admin' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                  O Instagram direto precisa ser uma conta profissional (Business ou Creator). Para contas de clientes em produção, o aplicativo da Meta precisa ter acesso aprovado às permissões de Insights.
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
