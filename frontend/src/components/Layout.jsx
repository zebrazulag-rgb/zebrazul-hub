import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck2, CalendarDays, BarChart3, Users, UserCog, ListChecks, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { to: '/', label: 'Painel', icon: LayoutDashboard, roles: ['admin', 'team', 'client'] },
    { to: '/aprovacao', label: 'Aprovação de conteúdo', icon: CalendarCheck2, roles: ['admin', 'team', 'client'] },
    { to: '/calendario', label: 'Calendário', icon: CalendarDays, roles: ['admin', 'team', 'client'] },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks, roles: ['admin', 'team'] },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'team', 'client'] },
    { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'team'] },
    { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] }
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-zebrazul-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">Zebrazul Hub</h1>
          <p className="text-xs text-zebrazul-100/70 mt-0.5">Gestão de conteúdo & tráfego</p>
        </div>
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
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: user?.avatar_color || '#2563eb' }}
            >
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-zebrazul-100/60 capitalize">{roleLabel(user?.role)}</p>
            </div>
          </div>
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
    </div>
  );
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'team') return 'Equipe Zebrazul';
  if (role === 'client') return 'Cliente';
  return '';
}
