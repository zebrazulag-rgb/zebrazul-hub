import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  Clock3,
  Copy,
  EyeOff,
  Image as ImageIcon,
  Instagram,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
  Wifi,
  Zap,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import InstagramStoryConnectionModal from '../components/InstagramStoryConnectionModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Aguardando' },
  { key: 'published', label: 'Publicados' },
  { key: 'failed', label: 'Falhas' },
  { key: 'ignored', label: 'Ignorados' },
];

const STATUS_META = {
  pending: { label: 'Aguardando', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  publishing: { label: 'Publicando', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  published: { label: 'Publicado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  ignored: { label: 'Ignorado', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  failed: { label: 'Falha', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  expired: { label: 'Expirado', className: 'border-slate-200 bg-slate-100 text-slate-500' },
};

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function sourceLabel(story) {
  return story.source_kind === 'story_mention' ? 'Menção em Story' : 'Mídia recebida por mensagem';
}

function connectionLabel(setup) {
  if (!setup?.connection) return 'Instagram não conectado';
  if (setup.connection.status === 'expired') return 'Conexão expirada';
  return setup.connection.username
    ? `@${setup.connection.username}`
    : setup.connection.display_name || 'Instagram conectado';
}

function ChecklistItem({ ok, children }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {ok
        ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" />
        : <AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-500" />}
      <span className={ok ? 'text-slate-600' : 'text-slate-700'}>{children}</span>
    </div>
  );
}

export default function StoryHub() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const effectiveClientId = selectedClient?.id || (user?.role === 'client' ? user.client_id : null);
  const [stories, setStories] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, publishing: 0, published: 0, failed: 0, ignored: 0 });
  const [setup, setSetup] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [workingKind, setWorkingKind] = useState({});
  const [cardErrors, setCardErrors] = useState({});
  const workingRef = useRef(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('manual');
  const [enabled, setEnabled] = useState(false);
  const [allowedUsernames, setAllowedUsernames] = useState('');
  const [showConnections, setShowConnections] = useState(false);

  const loadStories = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const params = new URLSearchParams();
      if (effectiveClientId) params.set('client_id', effectiveClientId);
      if (filter !== 'all') params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());
      params.set('_ts', Date.now());
      const { data } = await api.get(`/instagram-stories?${params.toString()}`);
      setStories(data.stories || []);
      setStats(data.stats || {});
    } catch (requestError) {
      if (!silent) {
        setStories([]);
        setError(requestError.response?.data?.error || 'Não foi possível carregar os Stories.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [effectiveClientId, filter, search]);

  const loadSetup = useCallback(async () => {
    if (!effectiveClientId) {
      setSetup(null);
      return;
    }
    setSetupLoading(true);
    try {
      const { data } = await api.get(`/instagram-stories/setup/${effectiveClientId}`, { params: { _ts: Date.now() } });
      setSetup(data);
      setEnabled(Boolean(data.settings?.enabled));
      setMode(data.settings?.mode || 'manual');
      setAllowedUsernames((data.settings?.allowed_usernames || []).map((item) => `@${item}`).join(', '));
    } catch (requestError) {
      setSetup(null);
      setError(requestError.response?.data?.error || 'Não foi possível verificar a configuração dos Stories.');
    } finally {
      setSetupLoading(false);
    }
  }, [effectiveClientId]);

  useEffect(() => {
    const timer = setTimeout(() => loadStories(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadStories, search]);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (!stories.some((story) => story.status === 'publishing')) return undefined;
    const timer = setInterval(() => loadStories({ silent: true }), 3000);
    return () => clearInterval(timer);
  }, [stories, loadStories]);

  async function saveSettings() {
    if (!effectiveClientId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const usernames = allowedUsernames
        .split(/[\s,;]+/)
        .map((item) => item.trim().replace(/^@+/, ''))
        .filter(Boolean);
      const { data } = await api.put(`/instagram-stories/settings/${effectiveClientId}`, {
        enabled,
        mode,
        allowed_usernames: usernames,
      });
      setSetup((current) => ({ ...current, settings: data.settings }));
      setNotice(mode === 'automatic' && enabled
        ? 'Repost automático ativado para menções reconhecidas.'
        : 'Configuração de Stories salva.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar a automação.');
    } finally {
      setSaving(false);
    }
  }

  async function subscribeWebhook() {
    if (!effectiveClientId) return;
    setSubscribing(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/instagram-stories/subscribe/${effectiveClientId}`);
      setSetup(data.setup || setup);
      setNotice('Conta inscrita nos webhooks de mensagens do Instagram.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível ativar o recebimento de Stories.');
    } finally {
      setSubscribing(false);
    }
  }

  async function publishStory(story) {
    if (workingRef.current.has(story.id) || story.status === 'publishing') return;
    workingRef.current.add(story.id);
    setWorkingId(story.id);
    setError('');
    setNotice('');
    setCardErrors((current) => ({ ...current, [story.id]: '' }));
    setStories((current) => current.map((item) => (
      item.id === story.id
        ? { ...item, status: 'publishing', error_message: null }
        : item
    )));

    try {
      const { data } = await api.post(`/instagram-stories/${story.id}/publish`);
      if (data?.story) {
        setStories((current) => current.map((item) => item.id === story.id ? data.story : item));
      }
      setNotice(`Story de ${data?.story?.sender_username ? `@${data.story.sender_username}` : story.sender_username ? `@${story.sender_username}` : 'perfil recebido'} publicado.`);
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Não foi possível publicar este Story.';
      setCardErrors((current) => ({ ...current, [story.id]: message }));
      setStories((current) => current.map((item) => (
        item.id === story.id
          ? { ...item, status: 'failed', error_message: message }
          : item
      )));
    } finally {
      workingRef.current.delete(story.id);
      setWorkingId((current) => current === story.id ? null : current);
      await loadStories({ silent: true });
    }
  }

  async function testFacebookMention(story) {
    if (workingRef.current.has(story.id) || story.status === 'publishing') return;
    workingRef.current.add(story.id);
    setWorkingId(story.id);
    setWorkingKind((current) => ({ ...current, [story.id]: 'facebook_tag_test' }));
    setError('');
    setNotice('');
    setCardErrors((current) => ({ ...current, [story.id]: '' }));
    setStories((current) => current.map((item) => (
      item.id === story.id
        ? { ...item, status: 'publishing', error_message: null, publish_channel: 'facebook_tag_test' }
        : item
    )));

    try {
      const { data } = await api.post(`/instagram-stories/${story.id}/publish-facebook-tag-test`);
      if (data?.story) {
        setStories((current) => current.map((item) => item.id === story.id ? data.story : item));
      }
      setNotice(data?.test?.message || `Teste publicado com marcação para @${story.sender_username}. Confira a notificação no perfil marcado.`);
    } catch (requestError) {
      const response = requestError.response?.data || {};
      const trace = response.trace_id ? ` · Trace: ${response.trace_id}` : '';
      const message = `${response.error || 'A Meta recusou o teste de marcação.'}${trace}`;
      setCardErrors((current) => ({ ...current, [story.id]: message }));
      setStories((current) => current.map((item) => (
        item.id === story.id
          ? { ...item, status: 'failed', error_message: message, publish_channel: 'facebook_tag_test' }
          : item
      )));
    } finally {
      workingRef.current.delete(story.id);
      setWorkingId((current) => current === story.id ? null : current);
      setWorkingKind((current) => {
        const next = { ...current };
        delete next[story.id];
        return next;
      });
      await loadStories({ silent: true });
    }
  }

  async function ignoreStory(story) {
    setWorkingId(story.id);
    setError('');
    try {
      await api.post(`/instagram-stories/${story.id}/ignore`);
      await loadStories();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível ignorar este Story.');
    } finally {
      setWorkingId(null);
    }
  }

  async function restoreStory(story) {
    setWorkingId(story.id);
    setError('');
    try {
      await api.post(`/instagram-stories/${story.id}/restore`);
      await loadStories();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível restaurar este Story.');
    } finally {
      setWorkingId(null);
    }
  }

  async function copyWebhookUrl() {
    if (!setup?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(setup.webhook_url);
      setNotice('URL do webhook copiada.');
    } catch {
      setError('Não foi possível copiar a URL automaticamente.');
    }
  }

  const facebookTagTest = setup?.facebook_tagging_test || null;
  const canRunFacebookTagTest = ['admin', 'team'].includes(user?.role) && Boolean(facebookTagTest?.ready);

  const metrics = useMemo(() => [
    { label: 'Recebidos', value: stats.total || 0, icon: Instagram, color: 'text-fuchsia-500' },
    { label: 'Aguardando', value: (stats.pending || 0) + (stats.publishing || 0), icon: Clock3, color: 'text-amber-500' },
    { label: 'Publicados', value: stats.published || 0, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Falhas', value: stats.failed || 0, icon: AlertCircle, color: 'text-rose-500' },
  ], [stats]);

  const canConfigure = user?.role === 'admin' || user?.role === 'team';
  const readiness = setup?.readiness || {};
  const currentClientName = setup?.client?.name || selectedClient?.name || 'cliente';

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <PageHero
        title="Central de Stories"
        description="Receba marcações do Instagram, aprove o conteúdo e republique pelo ZebraHub sem baixar a mídia no celular."
        actions={(
          <button onClick={() => { loadStories(); loadSetup(); }} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw size={16} /> Atualizar
          </button>
        )}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-slate-500"><item.icon size={14} className={item.color} /> {item.label}</div>
              <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 shrink-0" size={18} />{error}</div>}
      {notice && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 shrink-0" size={18} />{notice}</div>}

      {!effectiveClientId && user?.role !== 'client' ? (
        <div className="surface-card flex min-h-48 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-600"><Instagram size={27} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Selecione um cliente</h2>
          <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">A lista abaixo mostra a operação consolidada. Para conectar o Instagram e configurar o repost automático, escolha um cliente na barra lateral.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <section className="surface-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div>
                <p className="section-kicker">Automação por cliente</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">Repost de {currentClientName}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Primeiro valide manualmente. Quando estiver seguro, altere para automático.</p>
              </div>
              <span className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {readiness.ready ? 'Pronto' : 'Configuração pendente'}
              </span>
            </div>

            {setupLoading ? (
              <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={20} className="animate-spin" /> Verificando integração...</div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Instagram size={14} /> Conta</div>
                    <p className="mt-2 font-semibold text-slate-900">{connectionLabel(setup)}</p>
                    <p className="mt-1 text-xs text-slate-500">{setup?.account?.instagram_name || setup?.account?.account_type || 'Conta profissional'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Wifi size={14} /> Webhook</div>
                    <p className="mt-2 font-semibold text-slate-900">{setup?.settings?.subscribed_at ? 'Inscrição realizada' : 'Ainda não inscrito'}</p>
                    <p className="mt-1 text-xs text-slate-500">{setup?.settings?.subscribed_at ? formatDate(setup.settings.subscribed_at) : 'Ative depois de conectar o Instagram'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Settings2 size={17} /> Modo da automação</h3>
                      <p className="mt-1 text-sm text-slate-500">O automático só age em eventos reconhecidos como menção em Story.</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-blue-600" />
                      <span className="text-sm font-medium text-slate-700">Automação ativa</span>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">Publicação</span>
                      <select value={mode} onChange={(event) => setMode(event.target.value)} className="input-field">
                        <option value="manual">Aprovar antes de repostar</option>
                        <option value="automatic">Repostar automaticamente</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">Perfis autorizados</span>
                      <input value={allowedUsernames} onChange={(event) => setAllowedUsernames(event.target.value)} className="input-field" placeholder="@parceiro1, @parceiro2" />
                      <span className="mt-1 block text-[11px] text-slate-400">Vazio permite qualquer perfil em menções reconhecidas.</span>
                    </label>
                  </div>

                  {canConfigure && (
                    <button onClick={saveSettings} disabled={saving} className="btn-primary mt-4 inline-flex items-center gap-2">
                      {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      Salvar automação
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {canConfigure && (
                    <button onClick={() => setShowConnections(true)} className="btn-secondary inline-flex items-center gap-2">
                      <PlugZap size={16} /> {setup?.connection ? 'Reconectar Instagram' : 'Conectar Instagram'}
                    </button>
                  )}
                  {canConfigure && (
                    <button onClick={subscribeWebhook} disabled={subscribing || !setup?.connection} className="btn-secondary inline-flex items-center gap-2">
                      {subscribing ? <LoaderCircle size={16} className="animate-spin" /> : <Wifi size={16} />}
                      Ativar recebimento
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <aside className="surface-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ShieldCheck size={20} /></span>
              <div>
                <h2 className="font-bold text-slate-900">Checklist da integração</h2>
                <p className="text-xs text-slate-500">Itens necessários para funcionar ao vivo.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <ChecklistItem ok={readiness.connected}>Instagram conectado ao cliente</ChecklistItem>
              <ChecklistItem ok={readiness.instagram_selected}>Conta profissional identificada</ChecklistItem>
              <ChecklistItem ok={readiness.story_publish_supported !== false}>Conta Business para publicar Stories</ChecklistItem>
              <ChecklistItem ok={(readiness.missing_scopes || []).length === 0}>Permissões de mensagens e publicação</ChecklistItem>
              <ChecklistItem ok={readiness.webhook_verify_token_configured}>Token de verificação no Railway</ChecklistItem>
              <ChecklistItem ok={readiness.public_backend_url_configured}>URL pública do backend configurada</ChecklistItem>
              <ChecklistItem ok={Boolean(setup?.settings?.subscribed_at)}>Conta inscrita nos webhooks</ChecklistItem>
            </div>

            {readiness.story_publish_supported === false && setup?.connection && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                Esta conta pode receber marcações, mas a publicação de Stories pela API exige uma conta <strong>Instagram Business</strong>. Altere para Empresa e reconecte.
              </div>
            )}

            {(readiness.missing_scopes || []).length > 0 && setup?.connection && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                Reconecte o Instagram para liberar: <strong>{readiness.missing_scopes.join(', ')}</strong>.
              </div>
            )}

            <div className={`mt-5 rounded-2xl border p-4 ${facebookTagTest?.ready ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'}`}>
              <div className="flex items-start gap-3">
                <AtSign size={18} className={facebookTagTest?.ready ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-amber-600'} />
                <div>
                  <p className={`text-sm font-bold ${facebookTagTest?.ready ? 'text-emerald-800' : 'text-amber-800'}`}>Teste de marcação real via Facebook</p>
                  <p className={`mt-1 text-xs leading-5 ${facebookTagTest?.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {facebookTagTest?.ready
                      ? 'Página, Instagram e token da Meta prontos para o teste com user_tags.'
                      : 'Conecte a Meta pelo Facebook, selecione a Página vinculada ao Instagram e autorize instagram_content_publish.'}
                  </p>
                  {!facebookTagTest?.ready && facebookTagTest?.missing_scopes?.length > 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-800">Faltando: {facebookTagTest.missing_scopes.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>

            {setup?.webhook_url && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Callback URL</p>
                <code className="mt-2 block break-all text-xs leading-5 text-slate-700">{setup.webhook_url}</code>
                <button onClick={copyWebhookUrl} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"><Copy size={14} /> Copiar URL</button>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-800">
              No Instagram do cliente, ative: <strong>Configurações → Mensagens e respostas ao story → Controles de mensagens → Ferramentas conectadas</strong>.
            </div>
          </aside>
        </div>
      )}

      <div className="toolbar-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="segmented-control overflow-x-auto">
          {FILTERS.map((item) => (
            <button key={item.key} onClick={() => setFilter(item.key)} className={`segmented-control-button whitespace-nowrap ${filter === item.key ? 'segmented-control-button-active' : ''}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-9" placeholder="Buscar perfil ou cliente..." />
        </div>
      </div>

      <section className="surface-card p-4 sm:p-5">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={20} className="animate-spin" /> Carregando Stories...</div>
        ) : stories.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-600"><Instagram size={27} /></div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Nenhum Story recebido</h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">Depois que o webhook estiver ativo, marcações e mídias recebidas aparecerão aqui para aprovação.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stories.map((story) => {
              const status = STATUS_META[story.status] || STATUS_META.pending;
              const isWorking = workingId === story.id || story.status === 'publishing';
              const cardError = cardErrors[story.id] || story.error_message;
              return (
                <article key={story.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="relative aspect-[9/16] overflow-hidden bg-slate-950">
                    {story.media_url ? (
                      story.media_type === 'video' ? (
                        <video src={story.media_url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
                      ) : (
                        <img src={story.media_url} alt="Story recebido" loading="lazy" className="h-full w-full object-contain" />
                      )
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-white/60">
                        {story.media_type === 'video' ? <Video size={30} /> : <ImageIcon size={30} />}
                        <span className="mt-2 text-xs">Mídia indisponível</span>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
                    <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
                      <span className="rounded-lg border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">{sourceLabel(story)}</span>
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${status.className}`}>{isWorking ? 'Publicando...' : status.label}</span>
                    </div>
                    {isWorking && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 px-6 text-center text-white backdrop-blur-[2px]">
                        <LoaderCircle size={34} className="animate-spin" />
                        <p className="mt-4 text-sm font-bold">{workingKind[story.id] === 'facebook_tag_test' ? 'Testando marcação real...' : 'Publicando Story...'}</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">{workingKind[story.id] === 'facebook_tag_test' ? 'Enviando user_tags pela integração com Facebook e aguardando a resposta oficial da Meta.' : 'Identificando o autor, preparando o crédito e enviando para o Instagram. Não clique novamente.'}</p>
                        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-400" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {story.sender_profile_picture_url ? (
                        <img src={story.sender_profile_picture_url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-sm font-bold text-fuchsia-700">{story.sender_username?.[0]?.toUpperCase() || '?'}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{story.sender_username ? `@${story.sender_username}` : story.sender_name || 'Perfil não identificado'}</p>
                        <p className="truncate text-xs text-slate-400">{story.client_name} · {formatDate(story.received_at)}</p>
                      </div>
                    </div>

                    {cardError && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700">{cardError}</p>}
                    {story.publish_channel === 'facebook_tag_test' && story.status === 'published' ? (
                      <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">A Meta publicou o teste com <strong>user_tags para @{story.tagging_username || story.sender_username}</strong>. Confirme se o perfil recebeu a marcação.</p>
                    ) : story.sender_username ? (
                      <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">Perfil identificado: <strong>@{story.sender_username}</strong>.</p>
                    ) : story.status !== 'published' && (
                      <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">O ZebraHub tentará identificar o perfil novamente antes de publicar.</p>
                    )}
                    {story.source_kind !== 'story_mention' && story.status === 'pending' && (
                      <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">O webhook não confirmou que esta mídia é uma menção. Revise antes de publicar.</p>
                    )}

                    <div className="mt-4 flex gap-2">
                      {['pending', 'failed'].includes(story.status) && story.sender_username && (
                        <button
                          onClick={() => testFacebookMention(story)}
                          disabled={isWorking || !story.media_url || !canRunFacebookTagTest}
                          title={canRunFacebookTagTest ? 'Publica um teste limpo enviando user_tags pela API com Facebook Login.' : 'Conecte a Meta pelo Facebook e selecione a Página vinculada ao Instagram.'}
                          className="btn-primary flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isWorking && workingKind[story.id] === 'facebook_tag_test' ? <LoaderCircle size={14} className="animate-spin" /> : <AtSign size={14} />}
                          {isWorking && workingKind[story.id] === 'facebook_tag_test' ? 'Testando...' : 'Testar marcação Meta'}
                        </button>
                      )}
                      {['pending', 'failed'].includes(story.status) && (
                        <button onClick={() => publishStory(story)} disabled={isWorking || !story.media_url} className="btn-secondary flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                          {isWorking ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
                          {isWorking && workingKind[story.id] !== 'facebook_tag_test' ? 'Publicando...' : 'Publicar visual'}
                        </button>
                      )}
                      {story.status === 'pending' && (
                        <button onClick={() => ignoreStory(story)} disabled={isWorking} className="btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs"><EyeOff size={14} /> Ignorar</button>
                      )}
                      {['ignored', 'failed'].includes(story.status) && (
                        <button onClick={() => restoreStory(story)} disabled={isWorking} className="btn-secondary flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs"><RotateCcw size={14} /> Restaurar</button>
                      )}
                      {story.status === 'published' && (
                        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Zap size={14} /> {story.publish_channel === 'facebook_tag_test' ? 'Teste Meta publicado' : 'Publicado no Instagram'}</div>
                      )}
                      {story.status === 'publishing' && (
                        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"><LoaderCircle size={14} className="animate-spin" /> Enviando para o Instagram</div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showConnections && effectiveClientId && (
        <InstagramStoryConnectionModal
          open
          clientId={effectiveClientId}
          clientName={currentClientName}
          user={user}
          onClose={() => setShowConnections(false)}
          onChanged={async () => {
            await loadSetup();
            await loadStories();
          }}
        />
      )}
    </div>
  );
}
