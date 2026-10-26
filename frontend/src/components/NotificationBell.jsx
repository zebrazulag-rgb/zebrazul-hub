import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, Megaphone, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

function relativeTime(value) {
  if (!value) return '';
  const normalized = String(value).includes('T') ? value : String(value).replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function NotificationIcon({ type, unread }) {
  const Icon = type === 'task_request' ? Megaphone : Bell;
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${unread ? 'bg-[#17181C] text-[#C9FF2F]' : 'bg-slate-100 text-slate-400'}`}>
      <Icon size={16} />
    </span>
  );
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const enabled = user?.role === 'admin' || user?.is_operations_head;

  async function loadNotifications(silent = false) {
    if (!enabled) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/notifications?limit=20');
      setItems(data.notifications || []);
      setUnread(Number(data.unread || 0));
    } catch {
      // Notificações não devem bloquear o restante do sistema.
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return undefined;
    loadNotifications(true);
    const interval = window.setInterval(() => loadNotifications(true), 30000);
    return () => window.clearInterval(interval);
  }, [enabled, user?.id]);

  useEffect(() => {
    function handlePointer(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, []);

  if (!enabled) return null;

  async function openItem(item) {
    if (!item.read_at) {
      setUnread((current) => Math.max(0, current - 1));
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      api.put(`/notifications/${item.id}/read`).catch(() => {});
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all');
      setUnread(0);
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch {}
  }

  return (
    <div ref={panelRef} className="relative z-50 shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); if (!open) loadNotifications(); }}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition sm:h-11 sm:w-11 sm:rounded-2xl ${unread > 0 ? 'border-[#EC0567]/25 bg-[#EC0567]/10 text-[#EC0567]' : 'border-slate-200/80 bg-white text-slate-600 hover:text-slate-900'}`}
        aria-label={unread ? `Notificações: ${unread} não lida${unread === 1 ? '' : 's'}` : 'Notificações'}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EC0567] px-1 text-[10px] font-black text-white ring-2 ring-[#F5F3EE]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[390px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(23,24,28,0.22)]">
          <div className="border-b border-slate-100 bg-[var(--zh-bg)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-[-0.02em] text-[#17181C]">O QUE TÁ PEDINDO ATENÇÃO.</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{unread ? `${unread} pendência${unread === 1 ? '' : 's'} nova${unread === 1 ? '' : 's'}` : 'Nada novo por enquanto.'}</p>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700" title="Marcar todas como lidas">
                    <CheckCheck size={17} />
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label="Fechar notificações">
                  <X size={17} />
                </button>
              </div>
            </div>
            {unread > 0 && <div className="mt-3 h-1 w-16 rounded-full bg-[#EC0567]" />}
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" />
                <p className="mt-3 text-xs font-semibold text-slate-400">Buscando o que mudou...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-11 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9FF2F] text-[#17181C]"><Inbox size={20} /></div>
                <p className="text-sm font-black text-slate-800">NADA PEDINDO ATENÇÃO.</p>
                <p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-400">Quando uma solicitação nova chegar, ela deixa rastro aqui.</p>
              </div>
            ) : items.map((item) => {
              const isUnread = !item.read_at;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`block w-full border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-slate-50 ${isUnread ? 'bg-[#3A85FD]/[0.045]' : 'bg-white'}`}
                >
                  <div className="flex gap-3">
                    <NotificationIcon type={item.type} unread={isUnread} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm ${isUnread ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{item.title}</p>
                        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{relativeTime(item.created_at)}</span>
                      </div>
                      {item.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>}
                    </div>
                    {isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#EC0567]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
