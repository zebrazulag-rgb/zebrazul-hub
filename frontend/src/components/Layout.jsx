import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
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
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
  KeyRound,
  Instagram,
  RefreshCw,
  MoreHorizontal,
  Send,
  Clapperboard,
  Code2,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import AvatarUpload from './AvatarUpload.jsx';
import ModalBackdrop from './ModalBackdrop.jsx';
import api from '../api';
import { formChanged } from '../utils/formState.js';
import zebraHubLogo from '../assets/logo-hub-white.png';
import { isBeeClient } from '../utils/beeClientAccess.js';
import NotificationBell from './NotificationBell.jsx';
import { anyPermission, hasPermission } from '../permissions.js';
import { getTenantSlug } from '../tenant';

export default function Layout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { agency } = useTenant();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [roleClientRecord, setRoleClientRecord] = useState(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [instagramHeaderConnection, setInstagramHeaderConnection] = useState(null);
  const [instagramHeaderLoading, setInstagramHeaderLoading] = useState(false);
  const clientPickerRef = useRef(null);
  const mobileClientPickerRef = useRef(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const initialProfileNameRef = useRef(user?.name || '');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [squadMenuOpen, setSquadMenuOpen] = useState(false);
  const [squadMenuTop, setSquadMenuTop] = useState(0);
  const squadCloseTimerRef = useRef(null);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const presenceRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zebrahub.sidebar.collapsed') === '1';
  });

  const isNativeApp = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  const isClientPortal = user?.role === 'client';

  const settingsActive = location.pathname === '/configuracoes' || location.pathname.startsWith('/configuracoes/');

  const cancelSquadMenuClose = () => {
    if (squadCloseTimerRef.current) {
      window.clearTimeout(squadCloseTimerRef.current);
      squadCloseTimerRef.current = null;
    }
  };

  const scheduleSquadMenuClose = () => {
    cancelSquadMenuClose();
    squadCloseTimerRef.current = window.setTimeout(() => {
      setSquadMenuOpen(false);
      squadCloseTimerRef.current = null;
    }, 260);
  };

  useEffect(() => () => {
    if (squadCloseTimerRef.current) window.clearTimeout(squadCloseTimerRef.current);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('zebrahub.sidebar.collapsed', sidebarCollapsed ? '1' : '0');
    setClientPickerOpen(false);
    setSquadMenuOpen(false);
  }, [sidebarCollapsed]);

  useEffect(() => {
    setSquadMenuOpen(false);
  }, [location.pathname]);


  useEffect(() => {
    function handlePointerDown(event) {
      const outsideDesktop = !clientPickerRef.current || !clientPickerRef.current.contains(event.target);
      const outsideMobile = !mobileClientPickerRef.current || !mobileClientPickerRef.current.contains(event.target);
      if (outsideDesktop && outsideMobile) setClientPickerOpen(false);
      if (presenceRef.current && !presenceRef.current.contains(event.target)) setPresenceOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setClientPickerOpen(false);
        setPresenceOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);


  useEffect(() => {
    if (user?.role !== 'client') {
      setRoleClientRecord(null);
      return undefined;
    }

    let active = true;
    api.get('/clients?summary=1').then((res) => {
      if (!active) return;
      const nextClients = Array.isArray(res.data?.clients) ? res.data.clients : [];
      const ownClient = nextClients.find((client) => Number(client.id) === Number(user.client_id)) || nextClients[0] || null;
      setRoleClientRecord(ownClient);
    }).catch(() => {
      if (active) setRoleClientRecord(null);
    });

    return () => { active = false; };
  }, [user?.id, user?.role, user?.client_id]);

  useEffect(() => {
    if (user?.role === 'client') return;
    let active = true;
    const clientsEndpoint = user?.is_commercial_team ? '/commercial/clients' : '/clients';
    api.get(clientsEndpoint).then((res) => {
      if (!active) return;
      const nextClients = res.data.clients || [];
      // O seletor operacional global exibe somente clientes ativos.
      // Clientes inativos continuam preservados no banco e na área de gestão de clientes.
      const activeClients = nextClients.filter((client) => client.status === 'active');
      setClients(activeClients);
      if (selectedClient && !activeClients.some((client) => client.id === selectedClient.id)) {
        setSelectedClient(null);
      } else if (!selectedClient && user?.is_commercial_team && activeClients.length === 1) {
        setSelectedClient(activeClients[0]);
      }
    }).catch(() => {
      if (active) setClients([]);
    });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.is_commercial_team, user?.client_ids?.join(','), selectedClient?.id, setSelectedClient]);

  useEffect(() => {
    const clientId = user?.role === 'client' ? user?.client_id : selectedClient?.id;
    if (!clientId || !hasPermission(user, 'social.connections')) {
      setInstagramHeaderConnection(null);
      setInstagramHeaderLoading(false);
      return undefined;
    }

    let active = true;
    const loadConnection = async () => {
      setInstagramHeaderLoading(true);
      try {
        const [instagramResult, organicResult] = await Promise.allSettled([
          api.get(`/instagram-oauth/status/${clientId}`, { params: { _ts: Date.now() } }),
          api.get(`/meta-organic/client/${clientId}/connection`, { params: { _ts: Date.now() } }),
        ]);

        const directConnection = instagramResult.status === 'fulfilled'
          ? instagramResult.value.data?.connection || null
          : null;
        const organicConnection = organicResult.status === 'fulfilled'
          ? organicResult.value.data?.connection || null
          : null;

        let nextConnection = null;
        if (directConnection?.status === 'connected' && !directConnection?.expired) {
          nextConnection = { ...directConnection, source: 'instagram' };
        } else if (organicConnection?.instagram_account_id) {
          nextConnection = {
            status: 'connected',
            username: organicConnection.instagram_username || null,
            display_name: organicConnection.instagram_name || null,
            profile_picture_url: organicConnection.instagram_picture_url || null,
            account_id: organicConnection.instagram_account_id,
            source: 'meta',
          };
        }

        if (active) setInstagramHeaderConnection(nextConnection);
      } catch {
        if (active) setInstagramHeaderConnection(null);
      } finally {
        if (active) setInstagramHeaderLoading(false);
      }
    };

    const onInstagramMessage = (event) => {
      const payload = event.data;
      if (['zebrahub-instagram-oauth', 'zebrahub-meta-oauth'].includes(payload?.type)
        && Number(payload.clientId) === Number(clientId)
        && payload.ok) {
        loadConnection();
      }
    };
    const onInstagramChanged = (event) => {
      if (!event.detail?.clientId || Number(event.detail.clientId) === Number(clientId)) loadConnection();
    };

    loadConnection();
    window.addEventListener('message', onInstagramMessage);
    window.addEventListener('zebrahub-instagram-connection-changed', onInstagramChanged);
    return () => {
      active = false;
      window.removeEventListener('message', onInstagramMessage);
      window.removeEventListener('zebrahub-instagram-connection-changed', onInstagramChanged);
    };
  }, [user?.id, user?.role, user?.client_id, selectedClient?.id]);

  useEffect(() => {
    if (!user?.id || user?.role === 'client') {
      setPresenceUsers([]);
      setPresenceOpen(false);
      return undefined;
    }

    let active = true;
    const streamController = new AbortController();
    const loadPresence = () => {
      api.get('/activity/presence', { params: { _ts: Date.now() } })
        .then(({ data }) => {
          if (active) setPresenceUsers(Array.isArray(data?.users)
            ? data.users.map((member) => ({ ...member, is_current_user: Number(member.id) === Number(user.id) }))
            : []);
        })
        .catch(() => {
          if (active) setPresenceUsers([]);
        });
    };
    const sendPresence = () => {
      if (!active || document.visibilityState === 'hidden') return;
      api.post('/activity/presence', {
        path: `${location.pathname}${location.search || ''}`,
        client_id: selectedClient?.id || null,
      }).catch(() => {});
    };

    const connectPresenceStream = async () => {
      const token = window.localStorage.getItem('zebrazul_token');
      if (!token) return;
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const streamPath = `${String(apiBase).replace(/\/$/, '')}/activity/presence/stream`;
      const streamUrl = /^https?:\/\//i.test(streamPath)
        ? streamPath
        : new URL(streamPath, window.location.origin).toString();

      try {
        const response = await fetch(streamUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Slug': getTenantSlug(),
            Accept: 'text/event-stream',
          },
          cache: 'no-store',
          signal: streamController.signal,
        });
        if (!response.ok || !response.body) throw new Error('presence_stream_unavailable');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\n\n/);
          buffer = blocks.pop() || '';
          blocks.forEach((block) => {
            const dataLine = block.split(/\n/).find((line) => line.startsWith('data:'));
            if (!dataLine) return;
            try {
              const payload = JSON.parse(dataLine.slice(5).trim());
              if (active && Array.isArray(payload?.users)) {
                setPresenceUsers(payload.users.map((member) => ({ ...member, is_current_user: Number(member.id) === Number(user.id) })));
              }
            } catch {}
          });
        }
      } catch (error) {
        if (active && error?.name !== 'AbortError') loadPresence();
      }
    };

    sendPresence();
    loadPresence();
    connectPresenceStream();
    const heartbeatInterval = window.setInterval(sendPresence, 20000);
    const listInterval = window.setInterval(loadPresence, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendPresence();
        loadPresence();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      streamController.abort();
      window.clearInterval(heartbeatInterval);
      window.clearInterval(listInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, user?.role, location.pathname, location.search, selectedClient?.id]);

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

  const clientPortalItems = [
    { to: '/cliente/solicitar', label: 'Solicitar demanda', mobileLabel: 'Demanda', icon: Send },
    { to: '/cliente/grade', label: 'Ver grade', mobileLabel: 'Grade', icon: Grid3x3, permission: 'social.feed' },
    { to: '/comercial', label: 'Comercial', mobileLabel: 'Comercial', icon: Handshake, permission: 'commercial.view' },
    { to: '/cliente/relatorios', label: 'Relatórios', mobileLabel: 'Relatórios', icon: BarChart3, permission: 'social.reports' },
    { to: '/cliente/materiais', label: 'Materiais', mobileLabel: 'Materiais', icon: FolderOpen, permission: 'materials.view' },
  ];

  const workspaceItems = [
    { to: '/', label: 'Painel', icon: LayoutDashboard, permission: 'dashboard.view' },
    { to: '/organizacao', label: 'Meu Espaço', icon: CalendarDays, permission: 'organizer.view' },
    { to: '/audiovisual', label: 'Audiovisual', icon: Clapperboard, permission: 'audiovisual.view', group: 'squad' },
    { to: '/designer', label: 'Designer', icon: Palette, permission: 'tasks.view', group: 'squad' },
    { to: '/site-lp', label: 'Site/LP', icon: Code2, permission: 'tasks.view', group: 'squad' },
    { to: '/aprovacao', label: 'Aprovação', icon: CheckCircle2, permission: 'tasks.view' },
    { to: '/moodboard', label: 'Moodboard', icon: Grid3x3, permission: 'tasks.view' },
    { to: '/concorrentes', label: 'Concorrentes', icon: Search, permission: 'compass.view' },
    { to: '/bussola', label: 'Bússola', icon: Compass, permission: 'compass.view' },
    { to: '/social-media', label: 'Social Media', icon: Instagram, permission: 'social.view' },
    { to: '/ia', label: 'IA', icon: Sparkles, permission: 'social.view' },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, permission: 'social.reports' },
    { to: '/comercial', label: 'Comercial', icon: Handshake, permission: 'commercial.view' },
    { to: '/rematriculas', label: 'Rematrículas', icon: RefreshCw, permission: 'reenrollments.view', beeOnly: true },
  ];

  const workspaceClient = user?.role === 'client' ? roleClientRecord : selectedClient;
  const beeWorkspaceActive = isBeeClient(workspaceClient);

  const visibleWorkspaceItems = isClientPortal
    ? clientPortalItems.filter((item) => !item.permission || hasPermission(user, item.permission))
    : workspaceItems.filter((item) => {
        if (item.beeOnly && !beeWorkspaceActive) return false;
        if (item.to === '/bussola') {
          if (!anyPermission(user, ['compass.view', 'materials.view'])) return false;
        } else if (!hasPermission(user, item.permission)) return false;
        if (item.to === '/social-media') {
          return anyPermission(user, ['social.feed', 'social.messages']);
        }
        if (item.to === '/ia') {
          return anyPermission(user, ['social.covers', 'social.stories']);
        }
        return true;
      });

  const visibleSquadItems = isClientPortal ? [] : visibleWorkspaceItems.filter((item) => item.group === 'squad');
  const visibleMainWorkspaceItems = isClientPortal ? visibleWorkspaceItems : visibleWorkspaceItems.filter((item) => item.group !== 'squad');
  const squadActive = visibleSquadItems.some((item) => location.pathname.startsWith(item.to));

  const canSeeSettings = !isClientPortal && (!user?.is_commercial_team || anyPermission(user, ['settings.clients', 'settings.users', 'settings.brand', 'settings.permissions', 'vault.view', 'activity.view_own', 'activity.view_team']));

  const mobilePrimaryItems = isClientPortal
    ? visibleWorkspaceItems.slice(0, 4)
    : visibleWorkspaceItems.filter((item) => ['/','/audiovisual','/designer','/site-lp','/social-media'].includes(item.to));

  const mobileMoreItems = isClientPortal
    ? visibleWorkspaceItems.slice(4)
    : visibleWorkspaceItems.filter((item) => ['/organizacao','/aprovacao','/moodboard','/concorrentes','/bussola','/ia','/relatorios','/rematriculas'].includes(item.to));

  const accentColor = selectedClient?.logo_color || agency?.primary_color || '#0969ff';
  const agencyPrimary = agency?.primary_color || '#0969ff';
  const agencySidebar = agency?.sidebar_color || '#121620';
  const agencyLogo = agency?.logo_data || zebraHubLogo;
  const topbarLabel = (() => {
    const path = location.pathname;
    if (path.startsWith('/cliente/solicitar')) return 'Solicitar demanda';
    if (path.startsWith('/cliente/grade')) return 'Ver grade';
    if (path.startsWith('/cliente/relatorios')) return 'Relatórios';
    if (path.startsWith('/cliente/materiais')) return 'Materiais';
    if (path === '/') return 'Painel';
    if (path.startsWith('/audiovisual')) return 'Audiovisual';
    if (path.startsWith('/produto')) return 'Produto';
    if (path.startsWith('/designer') || path.startsWith('/tarefas')) return 'Designer';
    if (path.startsWith('/site-lp')) return 'Site/LP';
    if (path.startsWith('/aprovacao')) return 'Aprovação';
    if (path.startsWith('/moodboard')) return 'Moodboard';
    if (path.startsWith('/concorrentes')) return 'Concorrentes';
    if (path.startsWith('/conversas')) return 'Conversas';
    if (path.startsWith('/relatorios')) return 'Relatórios';
    if (path.startsWith('/organizacao')) return 'Meu Espaço';
    if (path.startsWith('/ia')) return 'IA';
    if (path.startsWith('/social-media') || path.startsWith('/feed') || path.startsWith('/stories')) return 'Social Media';
    if (path.startsWith('/comercial')) return 'Comercial';
    if (path.startsWith('/bussola')) return 'Bússola';
    if (path.startsWith('/rematriculas')) return 'Rematrículas';
    if (path.startsWith('/materiais')) return 'Bússola';
    if (path.startsWith('/financeiro')) return 'Financeiro';
    if (path.startsWith('/senhas')) return 'Senhas';
    if (path.startsWith('/configuracoes')) return 'Configurações';
    return 'ZebraHub';
  })();
  const topbarClient = workspaceClient?.name || (user?.role === 'client' ? 'Meu espaço' : 'Todos os clientes');
  const onlinePresenceUsers = presenceUsers.filter((member) => member.presence_status === 'online');
  const awayPresenceUsers = presenceUsers.filter((member) => member.presence_status === 'away');
  const topPresenceUsers = onlinePresenceUsers.slice(0, 3);

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
        className={`app-sidebar ${isNativeApp ? 'hidden' : 'hidden md:flex'} sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-white/5 text-white shadow-[16px_0_48px_rgba(15,23,42,0.08)] transition-[width] duration-300 ${sidebarCollapsed ? 'w-[68px]' : 'w-[218px]'}`}
        style={{ backgroundColor: agencySidebar }}
      >
        <div className={`relative flex min-h-[58px] items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5`}>
          <img
            src={agencyLogo}
            alt={agency?.name || 'Agência'}
            className={`w-auto object-contain transition-all duration-300 ${sidebarCollapsed ? 'max-h-8 max-w-[36px]' : 'max-h-11 max-w-[146px]'}`}
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

        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-2`} ref={clientPickerRef}>
          {user?.role === 'client' ? (
            <div
              className={`flex min-w-0 items-center rounded-xl border border-white/[0.07] bg-white/[0.045] ${sidebarCollapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-2'}`}
              title={sidebarCollapsed ? topbarClient : undefined}
            >
              <ClientAvatar client={workspaceClient} allClientsColor={agencyPrimary} sizeClass="h-8 w-8" />
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Cliente</p>
                  <p className="truncate text-[12px] font-semibold text-white/90">{topbarClient}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                aria-label="Selecionar cliente"
                aria-haspopup="listbox"
                aria-expanded={clientPickerOpen}
                onClick={() => setClientPickerOpen((open) => !open)}
                className={`flex w-full min-w-0 items-center rounded-xl border border-white/[0.07] bg-white/[0.045] text-left transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-white/10 ${sidebarCollapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-2'}`}
                title={sidebarCollapsed ? topbarClient : undefined}
              >
                <ClientAvatar client={selectedClient} allClientsColor={agencyPrimary} sizeClass="h-8 w-8" />
                {!sidebarCollapsed && (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Cliente</p>
                      <p className="truncate text-[12px] font-semibold text-white/90">{topbarClient}</p>
                    </div>
                    <ChevronDown size={13} className={`shrink-0 text-white/35 transition-transform ${clientPickerOpen ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {clientPickerOpen && (
                <div
                  className={`absolute z-[100] w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] ${sidebarCollapsed ? 'left-[58px] top-0' : 'left-[calc(100%+10px)] top-0'}`}
                >
                  <div className="border-b border-slate-100 p-3">
                    <div className="relative">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        value={clientSearch}
                        onChange={(event) => setClientSearch(event.target.value)}
                        placeholder="Buscar cliente..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto p-2" role="listbox">
                    {!normalizedClientSearch && (
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedClient}
                        onClick={() => chooseClient(null)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${!selectedClient ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <ClientAvatar allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">Todos os clientes</p>
                          <p className="truncate text-[11px] text-slate-400">Visão consolidada da operação</p>
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
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                          <ClientAvatar client={client} allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{client.name}</p>
                            {client.segment && <p className="truncate text-[11px] text-slate-400">{client.segment}</p>}
                          </div>
                          {isSelected && <Check size={16} className="shrink-0" style={{ color: agencyPrimary }} />}
                        </button>
                      );
                    })}

                    {filteredClients.length === 0 && (
                      <div className="px-3 py-8 text-center">
                        <p className="text-sm font-medium text-slate-600">Nenhum cliente encontrado</p>
                        <p className="mt-1 text-xs text-slate-400">Tente buscar por outro nome.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`${sidebarCollapsed ? 'mx-2.5' : 'mx-3'} mb-1.5 border-t border-white/[0.06]`} />

        <nav className={`flex-1 overflow-y-auto pb-4 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <div className="space-y-0.5">
            {visibleMainWorkspaceItems.map((item) => (
              <div key={item.to}>
                <SidebarLink item={item} agencyPrimary={agencyPrimary} collapsed={sidebarCollapsed} compact />
                {!isClientPortal && item.to === '/organizacao' && visibleSquadItems.length > 0 && (
                  <div
                    className="relative mt-1"
                    onMouseEnter={(event) => {
                      cancelSquadMenuClose();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setSquadMenuTop(Math.max(12, rect.top - 4));
                      setSquadMenuOpen(true);
                    }}
                    onMouseLeave={scheduleSquadMenuClose}
                  >
                    <button
                      type="button"
                      onClick={() => setSquadMenuOpen((open) => !open)}
                      aria-haspopup="menu"
                      aria-expanded={squadMenuOpen}
                      title={sidebarCollapsed ? 'Squad' : undefined}
                      className={`group flex w-full items-center rounded-lg py-1.5 text-[13px] font-medium transition-all duration-200 ${sidebarCollapsed ? 'justify-center px-1.5' : 'gap-2.5 px-2.5'} ${squadActive ? 'text-white' : 'text-white/62 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${squadActive ? 'text-white shadow-[0_8px_22px_rgba(0,0,0,0.22)]' : 'bg-white/[0.055] text-white/60 group-hover:bg-white/10 group-hover:text-white'}`}
                        style={squadActive ? { backgroundColor: agencyPrimary } : undefined}
                      >
                        <Grid3x3 size={15} strokeWidth={2} />
                      </span>
                      {!sidebarCollapsed && <><span className="flex-1 text-left">Squad</span><ChevronDown size={14} className={`transition-transform ${squadMenuOpen ? 'rotate-90' : '-rotate-90'} opacity-50`} /></>}
                    </button>

                    {squadMenuOpen && (
                      <div
                        className="fixed z-[90] w-[230px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
                        style={{ left: sidebarCollapsed ? 62 : 208, top: squadMenuTop }}
                        role="menu"
                        onMouseEnter={cancelSquadMenuClose}
                        onMouseLeave={scheduleSquadMenuClose}
                      >
                        <div className="px-3 pb-2 pt-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Squad</p>
                          <p className="mt-0.5 text-xs text-slate-400">Escolha a frente de operação</p>
                        </div>
                        <div className="space-y-1">
                          {visibleSquadItems.map((squadItem) => (
                            <NavLink
                              key={squadItem.to}
                              to={squadItem.to}
                              role="menuitem"
                              className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition ${isActive ? 'bg-blue-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                              {({ isActive }) => (
                                <>
                                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isActive ? 'text-white' : 'bg-slate-100 text-slate-500'}`} style={isActive ? { backgroundColor: agencyPrimary } : undefined}>
                                    <squadItem.icon size={15} />
                                  </span>
                                  <span>{squadItem.label}</span>
                                </>
                              )}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {canSeeSettings && (
            <div className="mt-3 border-t border-white/[0.07] pt-2.5">
              <SidebarLink
                item={{ to: '/configuracoes/aparencia', label: 'Configurações', icon: Settings }}
                agencyPrimary={agencyPrimary}
                collapsed={sidebarCollapsed}
                activeOverride={settingsActive}
                compact
              />
            </div>
          )}
        </nav>

        {agency?.show_powered_by !== false && !sidebarCollapsed && (
          <div className="px-5 pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-white/25">
            {agency?.footer_text || 'Tecnologia ZebraHub'}
          </div>
        )}

        <div className={`border-t border-white/[0.07] px-2.5 py-2`}>
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
                <img src={user.avatar_data} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ring-1 ring-white/10"
                  style={{ backgroundColor: user?.avatar_color || agencyPrimary }}
                >
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                  <p className="truncate text-[11px] text-white/40">{user?.permission_role_name || roleLabel(user?.role, agency?.name, user?.is_operations_head, user?.is_commercial_team, user?.is_platform_owner)}</p>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-white/45 transition hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="app-main relative h-screen min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="sticky top-0 z-20 flex min-h-[58px] items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 md:px-8 xl:px-10">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
            <p className="truncate text-sm font-bold text-slate-900">{topbarLabel}</p>
          </div>

          <div id="zebrahub-topbar-tools" className="ml-3 hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto lg:flex" />

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {(user?.role === 'client' ? user?.client_id : selectedClient?.id) && hasPermission(user, 'social.connections') && (
              <div
                className={`hidden min-w-0 items-center gap-2 rounded-xl border px-3 py-2 sm:flex ${instagramHeaderConnection?.status === 'connected' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}
                title={instagramHeaderConnection?.status === 'connected' ? `Instagram conectado: @${instagramHeaderConnection.username || 'conta conectada'}` : 'Instagram não conectado para este cliente'}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${instagramHeaderConnection?.status === 'connected' ? 'bg-emerald-500' : instagramHeaderLoading ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'}`} />
                <Instagram size={15} className={instagramHeaderConnection?.status === 'connected' ? 'text-emerald-600' : 'text-slate-400'} />
                <div className="min-w-0">
                  <p className={`text-[9px] font-bold uppercase tracking-[0.12em] ${instagramHeaderConnection?.status === 'connected' ? 'text-emerald-600' : 'text-slate-400'}`}>Instagram</p>
                  <p className={`max-w-[170px] truncate text-[11px] font-semibold ${instagramHeaderConnection?.status === 'connected' ? 'text-emerald-800' : 'text-slate-500'}`}>
                    {instagramHeaderLoading ? 'Verificando...' : instagramHeaderConnection?.status === 'connected' ? `@${instagramHeaderConnection.username || 'conectado'}` : 'Não conectado'}
                  </p>
                </div>
              </div>
            )}


            {user?.role !== 'client' && (
              <div className="relative md:hidden" ref={mobileClientPickerRef}>
                <button
                  type="button"
                  aria-label="Selecionar cliente"
                  aria-haspopup="listbox"
                  aria-expanded={clientPickerOpen}
                  onClick={() => setClientPickerOpen((open) => !open)}
                  className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 shadow-sm"
                >
                  <ClientAvatar client={selectedClient} allClientsColor={agencyPrimary} sizeClass="h-7 w-7" />
                  <span className="max-w-[105px] truncate text-[11px] font-semibold text-slate-700">{topbarClient}</span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>
                {clientPickerOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-100 p-3">
                      <div className="relative">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={clientSearch}
                          onChange={(event) => setClientSearch(event.target.value)}
                          placeholder="Buscar cliente..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none"
                        />
                      </div>
                    </div>
                    <div className="max-h-[55vh] overflow-y-auto p-2" role="listbox">
                      {!normalizedClientSearch && (
                        <button type="button" onClick={() => chooseClient(null)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${!selectedClient ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <ClientAvatar allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">Todos os clientes</p><p className="text-[11px] text-slate-400">Visão consolidada</p></div>
                          {!selectedClient && <Check size={16} style={{ color: agencyPrimary }} />}
                        </button>
                      )}
                      {filteredClients.map((client) => {
                        const isSelected = selectedClient?.id === client.id;
                        return (
                          <button key={client.id} type="button" onClick={() => chooseClient(client)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <ClientAvatar client={client} allClientsColor={agencyPrimary} sizeClass="h-9 w-9" />
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{client.name}</p>{client.segment && <p className="truncate text-[11px] text-slate-400">{client.segment}</p>}</div>
                            {isSelected && <Check size={16} style={{ color: agencyPrimary }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {user?.role !== 'client' && (
              <div className="relative" ref={presenceRef}>
                <button
                  type="button"
                  onClick={() => setPresenceOpen((open) => !open)}
                  aria-haspopup="dialog"
                  aria-expanded={presenceOpen}
                  title={`${onlinePresenceUsers.length} pessoa${onlinePresenceUsers.length === 1 ? '' : 's'} online`}
                  className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-2 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {topPresenceUsers.length > 0 ? (
                    <div className="flex -space-x-2">
                      {topPresenceUsers.map((member) => (
                        <PresenceAvatar key={member.id} member={member} size="sm" />
                      ))}
                    </div>
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Users size={15} />
                    </span>
                  )}
                  <span className="ml-1.5 hidden text-[11px] font-semibold text-slate-600 xl:inline">
                    {onlinePresenceUsers.length} online
                  </span>
                  {onlinePresenceUsers.length > 3 && (
                    <span className="ml-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                      +{onlinePresenceUsers.length - 3}
                    </span>
                  )}
                </button>

                {presenceOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-[120] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Equipe online</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Presença ao vivo no ZebraHub</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                        {onlinePresenceUsers.length} online
                      </span>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto p-2">
                      {onlinePresenceUsers.length === 0 && awayPresenceUsers.length === 0 ? (
                        <div className="px-3 py-8 text-center">
                          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Users size={18} /></div>
                          <p className="text-sm font-semibold text-slate-700">Ninguém online agora</p>
                          <p className="mt-1 text-xs text-slate-400">Assim que alguém abrir o ZebraHub, aparece aqui.</p>
                        </div>
                      ) : (
                        <>
                          {onlinePresenceUsers.map((member) => (
                            <PresenceRow key={member.id} member={member} agencyName={agency?.name} />
                          ))}
                          {awayPresenceUsers.length > 0 && (
                            <>
                              <div className="mx-2 my-2 border-t border-slate-100" />
                              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Ausentes recentemente</p>
                              {awayPresenceUsers.map((member) => (
                                <PresenceRow key={member.id} member={member} agencyName={agency?.name} />
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <NotificationBell />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-[58px] h-80 bg-[radial-gradient(circle_at_70%_-20%,rgba(9,105,255,0.12),transparent_48%)]" />
        <div className={`relative mx-auto w-full max-w-[1320px] min-w-0 px-4 pb-28 pt-5 sm:px-6 ${isNativeApp ? '' : 'md:px-8 md:py-8 xl:px-10'}`}>{children}</div>
      </main>

      <nav className={`mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl ${isNativeApp ? '' : 'md:hidden'}`}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobilePrimaryItems.map((item) => (
            <MobileNavLink key={item.to} item={item} agencyPrimary={agencyPrimary} />
          ))}
          {mobileMoreItems.length > 0 && <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${mobileMoreOpen || ['/organizacao','/bussola','/ia','/relatorios','/rematriculas','/configuracoes','/senhas'].some((path) => location.pathname.startsWith(path)) ? 'text-slate-900' : 'text-slate-400'}`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl"><MoreHorizontal size={20} /></span>
            <span>Mais</span>
          </button>}
        </div>
      </nav>

      {mobileMoreItems.length > 0 && mobileMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={() => setMobileMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_rgba(15,23,42,0.22)]">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between px-1">
              <div><p className="text-lg font-bold text-slate-900">Mais</p><p className="text-xs text-slate-400">Outras áreas do ZebraHub</p></div>
              <button type="button" onClick={() => setMobileMoreOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>
            <div className="space-y-1">
              {mobileMoreItems.map((item) => (
                <MobileMoreLink key={item.to} item={item} agencyPrimary={agencyPrimary} onClick={() => setMobileMoreOpen(false)} />
              ))}
              {canSeeSettings && (
                <MobileMoreLink item={{ to: '/configuracoes/aparencia', label: 'Configurações', icon: Settings }} agencyPrimary={agencyPrimary} onClick={() => setMobileMoreOpen(false)} activeOverride={settingsActive || location.pathname.startsWith('/senhas')} />
              )}
            </div>
          </div>
        </div>
      )}

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

function PresenceAvatar({ member, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  const dotClass = member?.presence_status === 'online' ? 'bg-emerald-500' : 'bg-amber-400';
  return (
    <span className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-visible rounded-full border-2 border-white bg-slate-200 font-bold text-white shadow-sm`}>
      {member?.avatar_data ? (
        <img src={member.avatar_data} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: member?.avatar_color || '#64748b' }}>
          {String(member?.name || '?').trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
      <span className={`absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border-2 border-white ${dotClass}`} />
    </span>
  );
}

function PresenceRow({ member, agencyName }) {
  const area = presenceAreaLabel(member?.last_path);
  const client = String(member?.last_client_name || '').trim();
  const statusLabel = member?.presence_status === 'online' ? 'Online agora' : 'Ausente';
  const statusClass = member?.presence_status === 'online' ? 'text-emerald-600' : 'text-amber-600';
  const context = [area, client].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
      <PresenceAvatar member={member} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-800">{member?.name || 'Usuário'}</p>
          {member?.is_current_user && <span className="shrink-0 text-[10px] font-semibold text-slate-400">você</span>}
        </div>
        <p className="truncate text-[11px] text-slate-400">{presenceRoleLabel(member, agencyName)}</p>
        {context && <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{context}</p>}
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
    </div>
  );
}

function presenceAreaLabel(rawPath) {
  const path = String(rawPath || '').split('?')[0];
  if (!path || path === '/') return 'Painel';
  if (path.startsWith('/audiovisual')) return 'Audiovisual';
  if (path.startsWith('/designer') || path.startsWith('/tarefas')) return 'Designer';
  if (path.startsWith('/site-lp')) return 'Site/LP';
  if (path.startsWith('/aprovacao')) return 'Aprovação';
  if (path.startsWith('/moodboard')) return 'Moodboard';
  if (path.startsWith('/concorrentes')) return 'Concorrentes';
  if (path.startsWith('/bussola')) return 'Bússola';
  if (path.startsWith('/social-media') || path.startsWith('/feed') || path.startsWith('/stories')) return 'Social Media';
  if (path.startsWith('/ia')) return 'IA';
  if (path.startsWith('/relatorios')) return 'Relatórios';
  if (path.startsWith('/comercial')) return 'Comercial';
  if (path.startsWith('/organizacao')) return 'Meu Espaço';
  if (path.startsWith('/configuracoes')) return 'Configurações';
  return 'ZebraHub';
}

function presenceRoleLabel(member, agencyName) {
  if (member?.is_platform_owner) return 'Super Administrador';
  if (member?.is_operations_head) return 'Head de Operação';
  if (member?.is_commercial_team) return 'Equipe Comercial';
  if (member?.role === 'admin') return 'Administrador';
  if (member?.role === 'team') return `Equipe ${agencyName || ''}`.trim();
  return 'Equipe';
}

function SidebarLink({ item, agencyPrimary, collapsed = false, activeOverride = null, compact = false }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => {
        const active = activeOverride == null ? isActive : activeOverride;
        return `group relative flex items-center rounded-xl ${compact ? 'py-1.5 text-[13px]' : 'py-2 text-sm'} font-medium transition-all duration-200 ${collapsed ? 'justify-center px-2' : compact ? 'gap-2.5 px-2.5' : 'gap-3 px-3'} ${
          active
            ? 'bg-white text-[#121620] shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
            : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
        }`;
      }}
    >
      {({ isActive }) => {
        const active = activeOverride == null ? isActive : activeOverride;
        return (
        <>
          <span
            className={`flex ${compact ? 'h-7 w-7' : 'h-8 w-8'} items-center justify-center rounded-lg transition-colors ${
              active ? 'text-white' : 'bg-white/[0.045] text-white/55 group-hover:bg-white/10 group-hover:text-white'
            }`}
            style={active ? { backgroundColor: agencyPrimary } : undefined}
          >
            <item.icon size={compact ? 15 : 17} strokeWidth={2} />
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
        );
      }}
    </NavLink>
  );
}

function MobileNavLink({ item, agencyPrimary }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${isActive ? 'text-slate-900' : 'text-slate-400'}`}
    >
      {({ isActive }) => (
        <>
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${isActive ? 'text-white shadow-sm' : ''}`} style={isActive ? { backgroundColor: agencyPrimary } : undefined}>
            <item.icon size={19} strokeWidth={2.1} />
          </span>
          <span className="max-w-full truncate">{item.mobileLabel || (item.label === 'Social Media' ? 'Social' : item.label)}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileMoreLink({ item, agencyPrimary, onClick, activeOverride = null }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) => {
        const active = activeOverride == null ? isActive : activeOverride;
        return `flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-blue-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`;
      }}
    >
      {({ isActive }) => {
        const active = activeOverride == null ? isActive : activeOverride;
        return <><span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: active ? agencyPrimary : '#94a3b8' }}><item.icon size={18} /></span><span className="text-sm font-semibold">{item.label}</span></>;
      }}
    </NavLink>
  );
}

function roleLabel(role, agencyName, isOperationsHead = false, isCommercialTeam = false, isPlatformOwner = false) {
  if (isPlatformOwner) return 'Super Administrador';
  if (isOperationsHead) return 'Head de Operação';
  if (isCommercialTeam) return 'Equipe Comercial';
  if (role === 'admin') return 'Administrador';
  if (role === 'team') return `Equipe ${agencyName || ''}`.trim();
  if (role === 'client') return 'Cliente';
  return '';
}
