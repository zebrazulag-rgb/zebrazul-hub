import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, BellRing, CheckCheck, ChevronRight, Inbox, Megaphone, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { hasPermission } from '../permissions.js';

function localDay() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function relativeTime(value) {
  if (!value) return '';
  const normalized = String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function NotificationIcon({ type, unread }) {
  const Icon = type === 'task_request' ? Megaphone : type === 'automation' ? Zap : Bell;
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${unread ? (type === 'automation' ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-[#17181C] text-[#C9FF2F]') : 'bg-slate-100 text-slate-400'}`}><Icon size={16} /></span>;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [smart, setSmart] = useState({ summary: { total: 0, urgent: 0 }, alerts: [] });
  const [loading, setLoading] = useState(false);

  const enabled = Boolean(user && user.role !== 'client' && hasPermission(user, 'dashboard.view'));

  async function loadAll(silent = false) {
    if (!enabled) return;
    if (!silent) setLoading(true);
    try {
      const [notificationsResult, smartResult] = await Promise.allSettled([
        api.get('/notifications?limit=20'),
        api.get('/smart-alerts', { params: { today_date: localDay(), ...(selectedClient?.id ? { client_id: selectedClient.id } : {}) } }),
      ]);
      if (notificationsResult.status === 'fulfilled') {
        setItems(notificationsResult.value.data.notifications || []);
        setUnread(Number(notificationsResult.value.data.unread || 0));
      }
      if (smartResult.status === 'fulfilled') setSmart(smartResult.value.data || { summary: { total: 0, urgent: 0 }, alerts: [] });
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return undefined;
    loadAll(true);
    const interval = window.setInterval(() => loadAll(true), 30000);
    return () => window.clearInterval(interval);
  }, [enabled, user?.id, selectedClient?.id]);

  useEffect(() => {
    function handlePointer(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, []);

  if (!enabled) return null;

  async function openNotification(item) {
    if (!item.read_at) {
      setUnread((current) => Math.max(0, current - 1));
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      api.put(`/notifications/${item.id}/read`).catch(() => {});
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  function openSmart(item) {
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

  const active = Number(smart?.summary?.total || 0);
  const urgent = Number(smart?.summary?.urgent || 0);
  const attentionCount = active + unread;
  const smartPreview = (smart?.alerts || []).slice(0, 6);

  return (
    <div ref={panelRef} className="relative z-50 shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); if (!open) loadAll(); }}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition sm:h-11 sm:w-11 sm:rounded-2xl ${attentionCount > 0 ? 'border-[#EC0567]/25 bg-[#EC0567]/10 text-[#EC0567]' : 'border-slate-200/80 bg-white text-slate-600 hover:text-slate-900'}`}
        aria-label={attentionCount ? `${attentionCount} sinais pedindo atenção` : 'Notificações'}
      >
        <Bell size={18} />
        {attentionCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EC0567] px-1 text-[10px] font-black text-white ring-2 ring-[#F5F3EE]">{attentionCount > 99 ? '99+' : attentionCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[410px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(23,24,28,0.22)]">
          <div className="border-b border-slate-100 bg-[var(--zh-bg)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-[-0.02em] text-[#17181C]">O QUE TÁ PEDINDO ATENÇÃO.</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{active ? `${active} alerta${active === 1 ? '' : 's'} ativo${active === 1 ? '' : 's'}${urgent ? ` · ${urgent} urgente${urgent === 1 ? '' : 's'}` : ''}` : 'Radar sem gargalos ativos.'}</p>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && <button type="button" onClick={markAllRead} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700" title="Marcar novidades como lidas"><CheckCheck size={17} /></button>}
                <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label="Fechar notificações"><X size={17} /></button>
              </div>
            </div>
            {attentionCount > 0 && <div className="mt-3 h-1 w-16 rounded-full bg-[#EC0567]" />}
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {loading && smartPreview.length === 0 && items.length === 0 ? (
              <div className="px-5 py-10 text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" /><p className="mt-3 text-xs font-semibold text-slate-400">Lendo a operação...</p></div>
            ) : (
              <>
                {smartPreview.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Radar</span>
                      <button type="button" onClick={() => { setOpen(false); navigate('/alertas'); }} className="text-[10px] font-black uppercase tracking-[0.08em] text-[#3A85FD]">Ver tudo</button>
                    </div>
                    {smartPreview.map((item) => (
                      <button key={item.id} type="button" onClick={() => openSmart(item)} className="block w-full border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-50">
                        <div className="flex gap-3">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.group === 'urgent' ? 'bg-[#EC0567]/10 text-[#EC0567]' : 'bg-[#3A85FD]/10 text-[#3A85FD]'}`}>{item.group === 'urgent' ? <AlertTriangle size={16} /> : <BellRing size={16} />}</span>
                          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-black text-slate-900">{item.title}</p><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">{item.area}</span></div><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.client_name}</p>{item.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>}</div>
                          <ChevronRight size={15} className="mt-2 shrink-0 text-slate-300" />
                        </div>
                      </button>
                    ))}
                  </section>
                )}

                {items.length > 0 && (
                  <section>
                    <div className="border-b border-slate-100 px-4 py-2.5"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Novidades</span></div>
                    {items.map((item) => {
                      const isUnread = !item.read_at;
                      return (
                        <button key={item.id} type="button" onClick={() => openNotification(item)} className={`block w-full border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-slate-50 ${isUnread ? 'bg-[#3A85FD]/[0.045]' : 'bg-white'}`}>
                          <div className="flex gap-3"><NotificationIcon type={item.type} unread={isUnread} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className={`text-sm ${isUnread ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{item.title}</p><span className="shrink-0 text-[10px] font-semibold text-slate-400">{relativeTime(item.created_at)}</span></div>{item.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>}</div>{isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#EC0567]" />}</div>
                        </button>
                      );
                    })}
                  </section>
                )}

                {smartPreview.length === 0 && items.length === 0 && (
                  <div className="flex flex-col items-center px-5 py-11 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9FF2F] text-[#17181C]"><Inbox size={20} /></div><p className="text-sm font-black text-slate-800">NADA PEDINDO ATENÇÃO.</p><p className="mt-1 max-w-[270px] text-xs leading-5 text-slate-400">Sem gargalos no radar e sem novidades não lidas.</p></div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
