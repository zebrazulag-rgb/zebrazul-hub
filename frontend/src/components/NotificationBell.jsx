import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, X } from 'lucide-react';
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
    <div ref={panelRef} className="fixed right-6 top-5 z-50">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); if (!open) loadNotifications(); }}
        className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:text-slate-900"
        aria-label="Notificações"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#f5f7fb]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <p className="font-semibold text-slate-900">Notificações</p>
              <p className="text-xs text-slate-400">{unread ? `${unread} não lida${unread === 1 ? '' : 's'}` : 'Tudo em dia'}</p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Marcar todas como lidas">
                  <CheckCheck size={17} />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Carregando...</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Inbox size={19} /></div>
                <p className="text-sm font-medium text-slate-700">Nenhuma notificação</p>
                <p className="mt-1 text-xs text-slate-400">Novas solicitações de clientes aparecem aqui.</p>
              </div>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className={`block w-full border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-slate-50 ${item.read_at ? 'bg-white' : 'bg-blue-50/45'}`}
              >
                <div className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-slate-200' : 'bg-[#0969ff]'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item.created_at)}</span>
                    </div>
                    {item.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
