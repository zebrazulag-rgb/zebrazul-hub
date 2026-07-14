import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck2, CalendarDays, BarChart3, Users, UserCog, ListChecks, LogOut, Grid3x3, WalletCards, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import AvatarUpload from './AvatarUpload.jsx';
import api from '../api';

export default function Layout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => setClients(res.data.clients));
    }
  }, [user]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleAvatarChange(dataUrl, mime) {
    const { data } = await api.put('/auth/me', { avatar_data: dataUrl, avatar_mime: mime });
    refreshUser(data.user);
  }

  async function saveProfileName() {
    setSavingProfile(true);
    try {
      const { data } = await api.put('/auth/me', { name: profileName });
      refreshUser(data.user);
      setShowProfile(false);
    } finally {
      setSavingProfile(false);
    }
  }

  const navItems = [
    { to: '/', label: 'Painel', icon: LayoutDashboard, roles: ['admin', 'team', 'client'] },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks, roles: ['admin', 'team'] },
    { to: '/aprovacao', label: 'Aprovação de conteúdo', icon: CalendarCheck2, roles: ['admin', 'team', 'client'] },
    { to: '/calendario', label: 'Calendário', icon: CalendarDays, roles: ['admin', 'team', 'client'] },
    { to: '/feed', label: 'Feed', icon: Grid3x3, roles: ['admin', 'team', 'client'] },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'team', 'client'] },
    { to: '/financeiro', label: 'Financeiro', icon: WalletCards, roles: ['admin', 'team'] },
    { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'team'] },
    { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] }
  ];

  const accentColor = selectedClient?.logo_color;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {accentColor && (
        <div className="fixed top-0 left-0 right-0 h-1 z-50" style={{ backgroundColor: accentColor }} />
      )}
      <aside className="w-64 bg-zebrazul-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">Zebrazul Hub</h1>
          <p className="text-xs text-zebrazul-100/70 mt-0.5">Gestão de conteúdo & tráfego</p>
        </div>

        {user?.role !== 'client' && (
          <div className="px-3 pt-4">
            <label className="text-[10px] uppercase font-semibold text-zebrazul-100/50 px-3 block mb-1.5">Visualizando</label>
            <select
              className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
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
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems
            .filter((item) => item.roles.includes(user?.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-zebrazul-100/80 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10">
          <button onClick={() => { setProfileName(user?.name || ''); setShowProfile(true); }} className="flex items-center gap-3 px-3 py-2 w-full hover:bg-white/5 rounded-lg transition-colors">
            {user?.avatar_data ? (
              <img src={user.avatar_data} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: user?.avatar_color || '#2563eb' }}
              >
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-zebrazul-100/60 capitalize">{roleLabel(user?.role)}</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 mt-1 text-sm text-zebrazul-100/80 hover:text-white hover:bg-white/5 rounded-lg w-full transition-colors"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>

      {showProfile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-slate-800">Meu perfil</h2>
              <button onClick={() => setShowProfile(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3 mb-5">
              <AvatarUpload
                imageSrc={user?.avatar_data}
                fallbackText={user?.name}
                fallbackColor={user?.avatar_color}
                size={80}
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-slate-400">Clique na foto para trocar</p>
            </div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Nome</label>
            <input className="input-field mb-4" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            <button onClick={saveProfileName} disabled={savingProfile} className="btn-primary w-full">
              {savingProfile ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'team') return 'Equipe Zebrazul';
  if (role === 'client') return 'Cliente';
  return '';
}
