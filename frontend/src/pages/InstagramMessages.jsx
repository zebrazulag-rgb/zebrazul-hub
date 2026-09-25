import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Grid3x3,
  Inbox,
  Instagram,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fullDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function displayName(peer) {
  return peer?.name || (peer?.username ? `@${peer.username}` : null) || 'Usuário do Instagram';
}

function initials(peer) {
  const label = peer?.name || peer?.username || 'IG';
  return String(label).trim().slice(0, 2).toUpperCase();
}

function Avatar({ peer, size = 'md' }) {
  const classes = size === 'lg' ? 'h-11 w-11 text-sm' : 'h-10 w-10 text-xs';
  if (peer?.profile_picture_url) {
    return <img src={peer.profile_picture_url} alt="" className={`${classes} shrink-0 rounded-full border border-slate-200 object-cover`} />;
  }
  return (
    <div className={`${classes} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-100 to-blue-100 font-bold text-slate-700`}>
      {initials(peer)}
    </div>
  );
}

function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={25} />
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <div className="mt-2 max-w-md text-sm leading-6 text-slate-500">{children}</div>
    </div>
  );
}

function Attachment({ attachment }) {
  if (!attachment?.url) return null;
  if (attachment.type === 'video') {
    return (
      <video controls preload="metadata" className="mt-2 max-h-72 w-full max-w-sm rounded-2xl bg-black object-contain">
        <source src={attachment.url} />
      </video>
    );
  }
  if (attachment.type === 'image') {
    return <img src={attachment.url} alt="Mídia recebida" className="mt-2 max-h-72 w-full max-w-sm rounded-2xl object-cover" />;
  }
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700">
      <ImageIcon size={14} /> Abrir anexo
    </a>
  );
}

export default function InstagramMessages() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const clientId = selectedClient?.id || (user?.role === 'client' ? user.client_id : null);

  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [notice, setNotice] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef(null);

  const loadStatus = useCallback(async () => {
    if (!clientId) {
      setStatus(null);
      return null;
    }
    const { data } = await api.get(`/instagram-messages/${clientId}/status`, { params: { _ts: Date.now() } });
    setStatus(data);
    return data;
  }, [clientId]);

  const loadConversations = useCallback(async ({ silent = false, append = false, after = null } = {}) => {
    if (!clientId) return;
    if (append) setLoadingMore(true);
    else if (silent) setRefreshing(true);
    else setLoading(true);
    if (!silent && !append) setError('');
    try {
      const { data } = await api.get(`/instagram-messages/${clientId}/conversations`, {
        params: { limit: 25, after: after || undefined, _ts: Date.now() },
      });
      const incoming = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations((current) => {
        if (!append) return incoming;
        const map = new Map(current.map((item) => [String(item.id), item]));
        incoming.forEach((item) => map.set(String(item.id), item));
        return [...map.values()].sort((a, b) => (Date.parse(b.updated_time || '') || 0) - (Date.parse(a.updated_time || '') || 0));
      });
      setNextCursor(data.has_next ? data.next_cursor : null);
      if (!append && !selectedId && incoming[0]?.id) setSelectedId(String(incoming[0].id));
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Não foi possível carregar as conversas do Instagram.';
      if (!silent) setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [clientId, selectedId]);

  const loadThread = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!clientId || !conversationId) return;
    if (!silent) setThreadLoading(true);
    if (!silent) setThreadError('');
    try {
      const { data } = await api.get(`/instagram-messages/${clientId}/conversations/${conversationId}`, {
        params: { limit: 20, _ts: Date.now() },
      });
      setConversation(data.conversation || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (requestError) {
      if (!silent) setThreadError(requestError.response?.data?.error || 'Não foi possível abrir esta conversa.');
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setStatus(null);
    setConversations([]);
    setSelectedId(null);
    setConversation(null);
    setMessages([]);
    setError('');
    setThreadError('');
    setNotice('');
    if (!clientId) return;

    let active = true;
    (async () => {
      try {
        const nextStatus = await loadStatus();
        if (!active) return;
        if (nextStatus?.connected && nextStatus?.permission_granted) await loadConversations();
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.error || 'Não foi possível verificar a conexão do Instagram.');
      }
    })();
    return () => { active = false; };
  }, [clientId, loadStatus]);

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
    else {
      setConversation(null);
      setMessages([]);
    }
  }, [selectedId, loadThread]);

  useEffect(() => {
    if (!clientId || !status?.connected || !status?.permission_granted) return undefined;
    const interval = window.setInterval(() => {
      loadConversations({ silent: true });
      if (selectedId) loadThread(selectedId, { silent: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [clientId, status?.connected, status?.permission_granted, selectedId, loadConversations, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedId]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((item) => {
      const peer = item.peer || {};
      return [peer.name, peer.username, item.latest_message?.text]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [conversations, search]);

  const selectedSummary = conversations.find((item) => String(item.id) === String(selectedId));
  const peer = conversation?.peer || selectedSummary?.peer || null;

  async function refreshAll() {
    setNotice('');
    await loadConversations({ silent: true });
    if (selectedId) await loadThread(selectedId, { silent: true });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !clientId || !selectedId || sending) return;
    setSending(true);
    setThreadError('');
    setNotice('');
    try {
      await api.post(`/instagram-messages/${clientId}/conversations/${selectedId}/messages`, { message: text });
      setDraft('');
      setNotice('Mensagem enviada pelo Instagram.');
      await loadThread(selectedId, { silent: true });
      await loadConversations({ silent: true });
    } catch (requestError) {
      setThreadError(requestError.response?.data?.error || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  const sectionNav = (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => navigate('/social-media/feed')}
        className="flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Grid3x3 size={17} /> Planejado
      </button>
      <button
        type="button"
        className="flex min-w-max items-center gap-2 rounded-lg bg-zebrazul-600 px-4 py-2 text-sm font-medium text-white"
      >
        <MessageCircle size={17} /> Mensagens
      </button>
    </div>
  );

  if (!clientId) {
    return (
      <div className="space-y-6">
        {sectionNav}
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <EmptyState icon={Instagram} title="Selecione um cliente">
            Escolha um cliente no seletor do topo para abrir a caixa de entrada do Instagram.
          </EmptyState>
        </section>
      </div>
    );
  }

  if (status && (!status.connected || !status.permission_granted)) {
    return (
      <div className="space-y-6">
        {sectionNav}
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <EmptyState icon={Instagram} title={status.connected ? 'Permissão de mensagens não autorizada' : 'Instagram não conectado'}>
            {status.connected
              ? <>Reconecte <strong>@{status.username || 'a conta'}</strong> pelo fluxo oficial do Instagram e autorize a permissão <code>instagram_business_manage_messages</code>.</>
              : <>Conecte a conta profissional deste cliente ao ZebraHub para visualizar e responder mensagens.</>}
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sectionNav}
      <section className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-50 to-blue-50 text-fuchsia-600 ring-1 ring-fuchsia-100">
            <MessageCircle size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-900">Mensagens do Instagram</h2>
              {status?.connected && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <CheckCircle2 size={12} /> @{status.username || 'conectado'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Inbox real da conta profissional conectada ao cliente.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar
        </button>
      </header>

      {error ? (
        <div className="m-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div><strong>Não foi possível abrir a caixa de entrada.</strong><div className="mt-1">{error}</div></div>
        </div>
      ) : (
        <div className="grid min-h-[620px] lg:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/45 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 p-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar conversa"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </div>

            <div className="max-h-[680px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Carregando conversas...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <Inbox size={28} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">Nenhuma conversa encontrada</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">As conversas aparecem depois que uma pessoa inicia contato com esta conta no Instagram. Envie uma DM de outra conta e clique em Atualizar.</p>
                </div>
              ) : (
                <>
                  {filteredConversations.map((item) => {
                    const active = String(item.id) === String(selectedId);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedId(String(item.id))}
                        className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition ${active ? 'bg-white shadow-[inset_3px_0_0_#2563eb]' : 'hover:bg-white/80'}`}
                      >
                        <Avatar peer={item.peer} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`truncate text-sm ${active ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{displayName(item.peer)}</p>
                            <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(item.updated_time)}</span>
                          </div>
                          {item.peer?.username && item.peer?.name && <p className="mt-0.5 truncate text-xs text-slate-400">@{item.peer.username}</p>}
                          <p className="mt-1 truncate text-xs text-slate-500">{item.latest_message?.text || (item.latest_message?.attachments?.length ? 'Mídia recebida' : 'Conversa do Instagram')}</p>
                        </div>
                      </button>
                    );
                  })}
                  {nextCursor && !search.trim() && (
                    <div className="p-3">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => loadConversations({ append: true, after: nextCursor })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {loadingMore ? 'Carregando...' : 'Carregar mais conversas'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col bg-white">
            {!selectedId ? (
              <EmptyState icon={MessageCircle} title="Selecione uma conversa">
                Escolha uma conversa na lateral para visualizar o histórico e responder pelo ZebraHub.
              </EmptyState>
            ) : threadLoading ? (
              <div className="flex min-h-[500px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={19} className="animate-spin" /> Carregando mensagens...</div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5">
                  <Avatar peer={peer} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{displayName(peer)}</p>
                    {peer?.username && <p className="truncate text-xs text-slate-500">@{peer.username}</p>}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/45 px-4 py-5 sm:px-6">
                  {threadError && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {threadError}
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <div className="py-16 text-center text-sm text-slate-400">Nenhuma mensagem disponível nesta conversa.</div>
                  ) : messages.map((message) => (
                    <div key={message.id || `${message.created_time}-${message.text}`} className={`mb-3 flex ${message.is_from_business ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.is_from_business ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                        {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.text}</p>}
                        {message.attachments?.map((attachment, index) => <Attachment key={`${message.id}-att-${index}`} attachment={attachment} />)}
                        <p className={`mt-1 text-[10px] ${message.is_from_business ? 'text-blue-100' : 'text-slate-400'}`}>{fullDate(message.created_time)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4">
                  {notice && <p className="mb-2 text-xs font-semibold text-emerald-600">{notice}</p>}
                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          if (draft.trim() && !sending) sendMessage(event);
                        }
                      }}
                      rows={1}
                      placeholder="Responder no Instagram..."
                      className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      title="Enviar mensagem"
                    >
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>Enter envia · Shift + Enter quebra linha</span>
                    <span>{draft.length}/1000</span>
                  </div>
                </form>
              </>
            )}
          </main>
        </div>
      )}

      <footer className="flex items-start gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
        <Instagram size={14} className="mt-0.5 shrink-0" />
        <span>O ZebraHub só consegue responder conversas iniciadas por usuários no Instagram. O envio e a leitura usam a API oficial da Meta e a autorização da conta profissional conectada.</span>
      </footer>
      </section>
    </div>
  );
}
