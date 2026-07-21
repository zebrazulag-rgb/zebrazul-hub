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
  BrainCircuit,
  ChevronDown,
  Sparkles,
  Palette,
  Building2,
  ClipboardCheck,
  Settings,
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
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const initialProfileNameRef = useRef(user?.name || '');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const settingsPaths = ['/clientes', '/usuarios', '/marca', '/agencias'];
  const settingsActive = settingsPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  useEffect(() => {
    if (user?.role === 'client') return;
    let active = true;
    api.get('/clients').then((res) => {
      if (!active) return;
      const nextClients = res.data.clients || [];
      setClients(nextClients);
      if (selectedClient && !nextClients.some((client) => client.id === selectedClient.id)) {
        setSelectedClient(null);
      }
    }).catch(() => {
      if (active) setClients([]);
    });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.client_ids?.join(','), selectedClient?.id, setSelectedClient]);

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
    { to: '/', label: 'Painel', icon: LayoutDashboard, roles: ['admin', 'team', 'client'] },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks, roles: ['admin', 'team', 'client'] },
    { to: '/plano-de-acao', label: 'Diagnóstico Estratégico', icon: BrainCircuit, roles: ['admin', 'team', 'client'] },
    { to: '/diagnosticos', label: 'DME', icon: ClipboardCheck, roles: ['admin', 'team'] },
    { to: '/aprovacao', label: 'Aprovação', icon: CalendarCheck2, roles: ['admin', 'team', 'client'] },
    { to: '/feed', label: 'Feed', icon: Grid3x3, roles: ['admin', 'team', 'client'] },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'team', 'client'] },
    { to: '/financeiro', label: 'Financeiro', icon: WalletCards, roles: ['admin'] },
  ];

  const settingsItems = [
    { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'team'] },
    { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] },
    { to: '/marca', label: 'Marca da agência', icon: Palette, roles: ['admin'] },
    ...(user?.is_platform_owner ? [{ to: '/agencias', label: 'Agências', icon: Building2, roles: ['admin'] }] : []),
  ].filter((item) => item.roles.includes(user?.role));

  const accentColor = selectedClient?.logo_color || agency?.primary_color || '#0969ff';
  const agencyPrimary = agency?.primary_color || '#0969ff';
  const agencySidebar = agency?.sidebar_color || '#121620';
  const agencyLogo = agency?.logo_data || zebraHubLogo;
  const selectedClientName = selectedClient?.name || 'Todos os clientes';

  return (
    <div className="min-h-screen flex bg-[#f5f7fb] text-slate-900">
      <aside className="sticky top-0 h-screen w-[276px] text-white flex flex-col shrink-0 border-r border-white/5 shadow-[16px_0_48px_rgba(15,23,42,0.08)]" style={{ backgroundColor: agencySidebar }}>
        <div className="px-5 pt-5 pb-4">
          <img
            src={agencyLogo}
            alt={agency?.name || 'Agência'}
            className="max-h-16 w-auto max-w-[190px] object-contain"
          />
        </div>

        {user?.role !== 'client' && (
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Visualizando</span>
                <Sparkles size={13} className="text-[#4f8cff]" />
              </div>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-4 ring-white/5"
                  style={{ backgroundColor: accentColor }}
                />
                <select
                  className="w-full appearance-none rounded-xl border border-white/10 bg-[#0d1119] py-2.5 pl-8 pr-9 text-sm font-medium text-white outline-none transition focus:border-[#3f7cff]/60"
                  value={selectedClient?.id || 'all'}
                  onChange={(e) => {
                    if (e.target.value === 'all') return setSelectedClient(null);
                    const c = clients.find((cl) => String(cl.id) === e.target.value);
                    setSelectedClient(c || null);
                  }}
                >
                  <option value="all" className="text-slate-800">Todos os clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id} className="text-slate-800">{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/45" />
              </div>
              <p className="mt-2 truncate text-xs text-white/40">{selectedClientName}</p>
            </div>
          </div>
        )}

        <div className="px-5 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Workspace</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-1">
            {workspaceItems
              .filter((item) => item.roles.includes(user?.role))
              .map((item) => (
                <SidebarLink key={item.to} item={item} agencyPrimary={agencyPrimary} />
              ))}
          </div>

          {settingsItems.length > 0 && (
            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  settingsActive
                    ? 'bg-white/[0.075] text-white'
                    : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
                }`}
                aria-expanded={settingsOpen}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${settingsActive ? 'text-white' : 'bg-white/[0.045] text-white/55 group-hover:bg-white/10 group-hover:text-white'}`} style={settingsActive ? { backgroundColor: agencyPrimary } : undefined}>
                  <Settings size={17} strokeWidth={2} />
                </span>
                <span className="flex-1 text-left">Configurações</span>
                <ChevronDown size={15} className={`text-white/40 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {settingsOpen && (
                <div className="ml-7 mt-1.5 space-y-1 border-l border-white/10 pl-3">
                  {settingsItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-white text-[#121620] shadow-[0_8px_22px_rgba(0,0,0,0.15)]'
                          : 'text-white/52 hover:bg-white/[0.055] hover:text-white'
                      }`}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={15} style={isActive ? { color: agencyPrimary } : undefined} />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {agency?.show_powered_by !== false && (
          <div className="px-5 pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-white/25">
            {agency?.footer_text || 'Tecnologia ZebraHub'}
          </div>
        )}

        <div className="border-t border-white/[0.07] px-3 py-3">
          <button
            onClick={() => {
              const currentName = user?.name || '';
              initialProfileNameRef.current = currentName;
              setProfileName(currentName);
              setProfileError('');
              setShowProfile(true);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.055]"
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
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
              <p className="truncate text-xs text-white/40">{roleLabel(user?.role, agency?.name)}</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/45 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.035]">
              <LogOut size={16} />
            </span>
            Sair
          </button>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
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

function SidebarLink({ item, agencyPrimary }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
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
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function roleLabel(role, agencyName) {
  if (role === 'admin') return 'Administrador';
  if (role === 'team') return `Equipe ${agencyName || ''}`.trim();
  if (role === 'client') return 'Cliente';
  return '';
}
