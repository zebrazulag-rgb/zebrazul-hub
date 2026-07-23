import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck2,
  BarChart3,
  Users,
  UserCog,
  ListChecks,
  LogOut,
  Grid3x3,
  WalletCards,
  X,
  Compass,
  ChevronDown,
  Palette,
  Building2,
  Settings,
  Handshake,
  Search,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import AvatarUpload from './AvatarUpload.jsx';
import ModalBackdrop from './ModalBackdrop.jsx';
import api from '../api';
import { formChanged } from '../utils/formState.js';
import zebraHubLogo from '../assets/logo-hub-white.png';

export default function Layout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { agency } = useTenant();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientPickerRef = useRef(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const initialProfileNameRef = useRef(user?.name || '');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zebrahub.sidebar.collapsed') === '1';
  });

  const settingsPaths = ['/clientes', '/usuarios', '/marca', '/agencias'];
  const settingsActive = settingsPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  useEffect(() => {
    window.localStorage.setItem('zebrahub.sidebar.collapsed', sidebarCollapsed ? '1' : '0');
    setClientPickerOpen(false);
  }, [sidebarCollapsed]);


  useEffect(() => {
    function handlePointerDown(event) {
      if (clientPickerRef.current && !clientPickerRef.current.contains(event.target)) {
        setClientPickerOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setClientPickerOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'client') return;
    let active = true;
    const clientsEndpoint = user?.is_commercial_team ? '/commercial/clients' : '/clients';
    api.get(clientsEndpoint).then((res) => {
      if (!active) return;
      const nextClients = res.data.clients || [];
      setClients(nextClients);
      if (selectedClient && !nextClients.some((client) => client.id === selectedClient.id)) {
        setSelectedClient(null);
      } else if (!selectedClient && user?.is_commercial_team && nextClients.length === 1) {
        setSelectedClient(nextClients[0]);
      }
    }).catch(() => {
      if (active) setClients([]);
    });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.is_commercial_team, user?.client_ids?.join(','), selectedClient?.id, setSelectedClient]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleAvatarChange(dataUrl, mime) {
    const { data } = await api.put('/auth/me', { avatar_data: dataUrl, avatar_mime: mime });
    refreshUser(data.user);
  }

  async function saveProfileName() {
    const normalizedName = profileName.trim();
    if (!normalizedName) {
      setProfileError('Informe seu nome.');
      return false;
    }

    setSavingProfile(true);
    setProfileError('');
    try {
      const { data } = await api.put('/auth/me', { name: normalizedName });
      refreshUser(data.user);
      setShowProfile(false);
      return true;
    } catch (err) {
      setProfileError(err.response?.data?.error || 'Não foi possível salvar o perfil.');
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleProfileRequestClose() {
    if (!formChanged(initialProfileNameRef.current, profileName)) {
      setShowProfile(false);
      return;
    }

    await saveProfileName();
  }

  const workspaceItems = [
    { to: '/', label: 'Painel', icon: LayoutDashboard, roles: ['admin', 'team', 'client'], commercialTeam: true },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks, roles: ['admin', 'team', 'client'], commercialTeam: true },
    { to: '/bussola', label: 'Bússola', icon: Compass, roles: ['admin', 'team', 'client'] },
    { to: '/aprovacao', label: 'Aprovação', icon: CalendarCheck2, roles: ['admin', 'team', 'client'] },
    { to: '/feed', label: 'Feed', icon: Grid3x3, roles: ['admin', 'team', 'client'] },
    { to: '/comercial', label: 'Comercial', icon: Handshake, roles: ['admin', 'client'], commercialTeam: true },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'team', 'client'] },
    { to: '/financeiro', label: 'Financeiro', icon: WalletCards, roles: ['admin'] },
  ];

  const visibleWorkspaceItems = workspaceItems.filter((item) => {
    if (user?.is_commercial_team) return item.commercialTeam === true;
    return item.roles.includes(user?.role);
  });

  const settingsItems = [
    { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'team'] },
    { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] },
    { to: '/marca', label: 'Marca da agência', icon: Palette, roles: ['admin'] },
    ...(user?.is_platform_owner ? [{ to: '/agencias', label: 'Agências', icon: Building2, roles: ['admin'] }] : []),
  ].filter((item) => !user?.is_commercial_team && item.roles.includes(user?.role));

  const accentColor = selectedClient?.logo_color || agency?.primary_color || '#0969ff';
  const agencyPrimary = agency?.primary_color || '#0969ff';
  const agencySidebar = agency?.sidebar_color || '#121620';
  const agencyLogo = agency?.logo_data || zebraHubLogo;
  const normalizedClientSearch = clientSearch.trim().toLocaleLowerCase('pt-BR');
  const filteredClients = normalizedClientSearch
    ? clients.filter((client) => [client.name, client.segment]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalizedClientSearch)))
    : clients;

  function chooseClient(client) {
    setSelectedClient(client);
    setClientPickerOpen(false);
    setClientSearch('');
  }

  return (
    <div className="app-shell flex h-screen min-h-0 overflow-hidden bg-[#f5f7fb] text-slate-900">
      <aside
        className={`app-sidebar sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-white/5 text-white shadow-[16px_0_48px_rgba(15,23,42,0.08)] transition-[width] duration-300 ${sidebarCollapsed ? 'w-[88px]' : 'w-[276px]'}`}
        style={{ backgroundColor: agencySidebar }}
      >
        <div className={`relative flex min-h-[84px] items-center ${sidebarCollapsed ? 'justify-center px-3' : 'px-5'} py-4`}>
          <img
            src={agencyLogo}
            alt={agency?.name || 'Agência'}
            className={`w-auto object-contain transition-all duration-300 ${sidebarCollapsed ? 'max-h-11 max-w-[48px]' : 'max-h-16 max-w-[190px]'}`}
          />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Encolher barra lateral'}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Encolher barra lateral'}
            className="absolute -right-3 top-1/2 z-40 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_6px_18px_rgba(15,23,42,0.16)] transition hover:text-slate-900"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        {user?.role !== 'client' && (
          <div className={`${sidebarCollapsed ? 'px-2' : 'px-4'} pb-4`} ref={clientPickerRef}>
            <div className={`relative rounded-2xl border border-white/10 bg-white/[0.055] ${sidebarCollapsed ? 'p-1.5' : 'p-2'}`}>
              <button
                type="button"
                aria-label="Selecionar cliente"
                aria-haspopup="listbox"
                aria-expanded={clientPickerOpen}
                onClick={() => setClientPickerOpen((open) => !open)}
                className={`flex w-full items-center rounded-xl border border-white/10 bg-[#0d1119] py-2 text-left text-sm font-medium text-white outline-none transition hover:border-white/20 focus:border-[#3f7cff]/60 ${sidebarCollapsed ? 'justify-center px-1.5' : 'gap-2.5 px-2.5'}`}
                title={sidebarCollapsed ? (selectedClient?.name || 'Todos os clientes') : undefined}
              >
                <ClientAvatar client={selectedClient} allClientsColor={agencyPrimary} sizeClass="h-8 w-8" />
                {!sidebarCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{selectedClient?.name || 'Todos os clientes'}</span>
                    <ChevronDown size={16} className={`shrink-0 text-white/45 transition-transform ${clientPickerOpen ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {clientPickerOpen && (
                <div className={`absolute z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#111722] shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${sidebarCollapsed ? 'left-[calc(100%+10px)] top-0 w-[320px]' : 'left-0 right-0 top-[calc(100%+8px)]'}`}>
                  <div className="border-b border-white/[0.08] p-2.5">
                    <div className="relative">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                      <input
                        autoFocus
                        value={clientSearch}
                        onChange={(event) => setClientSearch(event.target.value)}
                        placeholder="Buscar cliente..."
                        className="w-full rounded-xl border border-white/10 bg-white/[0.055] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#3f7cff]/60"
                      />
                    </div>
                  </div>

                  <div className="max-h-[min(420px,55vh)] overflow-y-auto p-1.5" role="listbox">
                    {!normalizedClientSearch && (
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedClient}
                        onClick={() => chooseClient(null)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${!selectedClient ? 'bg-white/[0.10]' : 'hover:bg-white/[0.06]'}`}
                      >
                        <ClientAvatar allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">Todos os clientes</p>
                          <p className="truncate text-[11px] text-white/35">Visão consolidada da operação</p>
                        </div>
                        {!selectedClient && <Check size={16} className="shrink-0" style={{ color: agencyPrimary }} />}
                      </button>
                    )}

                    {filteredClients.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      return (
                        <button
                          key={client.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => chooseClient(client)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${isSelected ? 'bg-white/[0.10]' : 'hover:bg-white/[0.06]'}`}
                        >
                          <ClientAvatar client={client} allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{client.name}</p>
                            {client.segment && <p className="truncate text-[11px] text-white/35">{client.segment}</p>}
                          </div>
                          {isSelected && <Check size={16} className="shrink-0" style={{ color: agencyPrimary }} />}
                        </button>
                      );
                    })}

                    {filteredClients.length === 0 && (
                      <div className="px-3 py-8 text-center">
                        <p className="text-sm font-medium text-white/60">Nenhum cliente encontrado</p>
                        <p className="mt-1 text-xs text-white/30">Tente buscar por outro nome.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!sidebarCollapsed ? (
          <div className="px-5 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Workspace</span>
          </div>
        ) : (
          <div className="mx-4 mb-2 border-t border-white/[0.07]" />
        )}

        <nav className={`flex-1 overflow-y-auto pb-4 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <div className="space-y-1">
            {visibleWorkspaceItems.map((item) => (
                <SidebarLink key={item.to} item={item} agencyPrimary={agencyPrimary} collapsed={sidebarCollapsed} />
              ))}
          </div>

          {settingsItems.length > 0 && (
            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className={`group flex w-full items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${
                  settingsActive
                    ? 'bg-white/[0.075] text-white'
                    : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
                }`}
                aria-expanded={settingsOpen}
                title={sidebarCollapsed ? 'Configurações' : undefined}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${settingsActive ? 'text-white' : 'bg-white/[0.045] text-white/55 group-hover:bg-white/10 group-hover:text-white'}`} style={settingsActive ? { backgroundColor: agencyPrimary } : undefined}>
                  <Settings size={17} strokeWidth={2} />
                </span>
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Configurações</span>
                    <ChevronDown size={15} className={`text-white/40 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {settingsOpen && (
                <div className={`${sidebarCollapsed ? 'mt-1.5 space-y-1' : 'ml-7 mt-1.5 space-y-1 border-l border-white/10 pl-3'}`}>
                  {settingsItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) => `group flex items-center rounded-xl py-2 text-sm transition ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} ${
                        isActive
                          ? 'bg-white text-[#121620] shadow-[0_8px_22px_rgba(0,0,0,0.15)]'
                          : 'text-white/52 hover:bg-white/[0.055] hover:text-white'
                      }`}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={15} style={isActive ? { color: agencyPrimary } : undefined} />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {agency?.show_powered_by !== false && !sidebarCollapsed && (
          <div className="px-5 pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-white/25">
            {agency?.footer_text || 'Tecnologia ZebraHub'}
          </div>
        )}

        <div className={`border-t border-white/[0.07] px-3 py-3`}>
          <div className={`flex gap-2 ${sidebarCollapsed ? 'flex-col items-center' : 'items-center'}`}>
            <button
              onClick={() => {
                const currentName = user?.name || '';
                initialProfileNameRef.current = currentName;
                setProfileName(currentName);
                setProfileError('');
                setShowProfile(true);
              }}
              className={`flex min-w-0 items-center rounded-xl py-2 transition hover:bg-white/[0.055] ${sidebarCollapsed ? 'justify-center px-2' : 'flex-1 gap-2.5 px-2.5'}`}
              title={sidebarCollapsed ? user?.name : undefined}
            >
              {user?.avatar_data ? (
                <img src={user.avatar_data} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ring-1 ring-white/10"
                  style={{ backgroundColor: user?.avatar_color || agencyPrimary }}
                >
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                  <p className="truncate text-[11px] text-white/40">{roleLabel(user?.role, agency?.name, user?.is_operations_head, user?.is_commercial_team)}</p>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-white/45 transition hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="app-main relative h-screen min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_70%_-20%,rgba(9,105,255,0.12),transparent_48%)]" />
        <div className="relative mx-auto w-full max-w-[1320px] min-w-0 px-8 py-8 xl:px-10">{children}</div>
      </main>

      {showProfile && (
        <ModalBackdrop onClose={handleProfileRequestClose} disabled={savingProfile}>
          <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Meu perfil</h2>
                <p className="mt-0.5 text-xs text-slate-400">Atualize suas informações pessoais.</p>
              </div>
              <button onClick={handleProfileRequestClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="mb-5 flex flex-col items-center gap-3">
              <AvatarUpload
                imageSrc={user?.avatar_data}
                fallbackText={user?.name}
                fallbackColor={user?.avatar_color}
                size={80}
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-slate-400">Clique na foto para trocar</p>
            </div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
            <input className="input-field mb-4" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            {profileError && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{profileError}</p>}
            <button onClick={saveProfileName} disabled={savingProfile} className="btn-primary w-full">
              {savingProfile ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}


function ClientAvatar({ client = null, allClientsColor = '#0969ff', sizeClass = 'h-9 w-9' }) {
  if (client?.avatar_data) {
    return (
      <img
        src={client.avatar_data}
        alt=""
        loading="lazy"
        className={`${sizeClass} shrink-0 rounded-xl object-cover ring-1 ring-white/10`}
      />
    );
  }

  if (!client) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl text-white ring-1 ring-white/10`}
        style={{ backgroundColor: allClientsColor }}
      >
        <Users size={16} strokeWidth={2.2} />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ring-1 ring-white/10`}
      style={{ backgroundColor: client.logo_color || allClientsColor }}
    >
      {client.name?.trim()?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function SidebarLink({ item, agencyPrimary, collapsed = false }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${
          isActive
            ? 'bg-white text-[#121620] shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
            : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              isActive ? 'text-white' : 'bg-white/[0.045] text-white/55 group-hover:bg-white/10 group-hover:text-white'
            }`}
            style={isActive ? { backgroundColor: agencyPrimary } : undefined}
          >
            <item.icon size={17} strokeWidth={2} />
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function roleLabel(role, agencyName, isOperationsHead = false, isCommercialTeam = false) {
  if (isOperationsHead) return 'Head de Operação';
  if (isCommercialTeam) return 'Equipe Comercial';
  if (role === 'admin') return 'Administrador';
  if (role === 'team') return `Equipe ${agencyName || ''}`.trim();
  if (role === 'client') return 'Cliente';
  return '';
}
