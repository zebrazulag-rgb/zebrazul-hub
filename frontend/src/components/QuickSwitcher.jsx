import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Settings, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModalBackdrop from './ModalBackdrop.jsx';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export default function QuickSwitcher({
  open,
  onClose,
  items = [],
  clients = [],
  selectedClient = null,
  onChooseClient,
  canSeeSettings = false,
  agencyPrimary = '#3A85FD',
}) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  const areaItems = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item?.to || !item?.label) return;
      if (!map.has(item.to)) map.set(item.to, item);
    });
    if (canSeeSettings && !map.has('/configuracoes/aparencia')) {
      map.set('/configuracoes/aparencia', { to: '/configuracoes/aparencia', label: 'Configurações', icon: Settings });
    }
    return Array.from(map.values());
  }, [items, canSeeSettings]);

  const normalizedQuery = normalize(query);
  const filteredAreas = useMemo(() => {
    if (!normalizedQuery) return areaItems.slice(0, 14);
    return areaItems.filter((item) => normalize(item.label).includes(normalizedQuery)).slice(0, 14);
  }, [areaItems, normalizedQuery]);

  const filteredClients = useMemo(() => {
    if (!clients.length) return [];
    if (!normalizedQuery) return clients.slice(0, 8);
    return clients.filter((client) => normalize(`${client.name || ''} ${client.segment || ''}`).includes(normalizedQuery)).slice(0, 10);
  }, [clients, normalizedQuery]);

  if (!open) return null;

  function goTo(item) {
    onClose?.();
    navigate(item.to);
  }

  function chooseClient(client) {
    onChooseClient?.(client);
    onClose?.();
  }

  const noResults = filteredAreas.length === 0 && filteredClients.length === 0;

  return (
    <ModalBackdrop onClose={onClose} className="items-start pt-[10vh] sm:pt-[14vh]" role="dialog">
      <div className="w-full max-w-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)]" aria-label="Busca rápida do ZebraHub">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#17181C] text-white">
            <Search size={18} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ir para uma área ou encontrar um cliente..."
            className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Buscar área ou cliente"
          />
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar busca">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-2 sm:p-3">
          {filteredAreas.length > 0 && (
            <section className="mb-2">
              <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Ir para</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {filteredAreas.map((item) => {
                  const Icon = item.icon || Search;
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => goTo(item)}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:text-white" style={{ '--quick-accent': agencyPrimary }}>
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {filteredClients.length > 0 && (
            <section className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Clientes</p>
                {selectedClient && <p className="max-w-[210px] truncate text-[10px] font-bold text-slate-400">Atual: {selectedClient.name}</p>}
              </div>
              <div className="space-y-1">
                {!normalizedQuery && (
                  <button type="button" onClick={() => chooseClient(null)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Users size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">Todos os clientes</span><span className="block text-[11px] text-slate-400">Visão consolidada da operação</span></span>
                  </button>
                )}
                {filteredClients.map((client) => (
                  <button key={client.id} type="button" onClick={() => chooseClient(client)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: client.logo_color || agencyPrimary }}>
                      {String(client.name || '?').trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{client.name}</span><span className="block truncate text-[11px] text-slate-400">{client.segment || 'Cliente Zebrazul'}</span></span>
                    {Number(selectedClient?.id) === Number(client.id) && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: agencyPrimary }} />}
                  </button>
                ))}
              </div>
            </section>
          )}

          {noResults && (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17181C] text-[#C9FF2F]"><Search size={20} /></div>
              <p className="text-sm font-black text-slate-800">NÃO ACHEI POR AQUI.</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Tente o nome de uma área ou de um cliente.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[10px] font-semibold text-slate-400 sm:px-5">
          <span>Busca rápida do ZebraHub</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-black text-slate-500">⌘ / Ctrl + K</span>
        </div>
      </div>
    </ModalBackdrop>
  );
}
