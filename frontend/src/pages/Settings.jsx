import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Building2, Palette, Settings as SettingsIcon, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AppearanceSettings from './AppearanceSettings.jsx';
import Clients from './Clients.jsx';
import UserManagement from './UserManagement.jsx';
import BrandSettings from './BrandSettings.jsx';
import Agencies from './Agencies.jsx';
import PermissionsSettings from './PermissionsSettings.jsx';
import { hasPermission } from '../permissions.js';

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { section = 'aparencia' } = useParams();

  const items = useMemo(() => [
    { key: 'aparencia', label: 'Aparência', description: 'Modo claro ou noturno', icon: Palette, allowed: true },
    { key: 'clientes', label: 'Clientes', description: 'Contas e informações', icon: Users, allowed: hasPermission(user, 'settings.clients') },
    { key: 'usuarios', label: 'Usuários', description: 'Equipe e acessos', icon: UserCog, allowed: hasPermission(user, 'settings.users') },
    { key: 'permissoes', label: 'Permissões', description: 'Cargos e visibilidade', icon: ShieldCheck, allowed: hasPermission(user, 'settings.permissions') },
    { key: 'marca', label: 'Marca da agência', description: 'Logo, cores e domínio', icon: SettingsIcon, allowed: hasPermission(user, 'settings.brand') },
    { key: 'agencias', label: 'Agências', description: 'Ambientes da plataforma', icon: Building2, allowed: Boolean(user?.is_platform_owner) },
  ].filter((item) => item.allowed), [user]);

  const activeItem = items.find((item) => item.key === section);

  useEffect(() => {
    if (!activeItem && items.length) navigate(`/configuracoes/${items[0].key}`, { replace: true });
  }, [activeItem, items, navigate]);

  if (!items.length) return <Navigate to="/" replace />;
  if (!activeItem) return null;

  const content = {
    aparencia: <AppearanceSettings />,
    clientes: <Clients embedded />,
    usuarios: <UserManagement embedded />,
    permissoes: <PermissionsSettings />,
    marca: <BrandSettings embedded />,
    agencias: <Agencies embedded />,
  }[section];

  return (
    <div className="settings-shell space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Configurações</h1>
        <p className="mt-2 text-sm text-slate-500">Preferências, pessoas, clientes e identidade reunidos em um único lugar.</p>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="settings-nav-card h-fit rounded-2xl border p-2 lg:sticky lg:top-6">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === section;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(`/configuracoes/${item.key}`)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-blue-50 text-[#0969ff]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-[#0969ff] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-blue-500' : 'text-slate-400'}`}>{item.description}</span>
                </span>
              </button>
            );
          })}
        </aside>

        <main className="settings-content-card min-w-0">{content}</main>
      </div>
    </div>
  );
}
