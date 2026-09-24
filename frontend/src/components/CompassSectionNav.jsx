import { Compass, FolderOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';
import TopbarPortal from './TopbarPortal.jsx';

function NavItems({ compact = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const items = [
    { to: '/bussola', label: 'Visão geral', icon: Compass, exact: true, visible: hasPermission(user, 'compass.view') },
    { to: '/bussola/materiais', label: 'Materiais', icon: FolderOpen, visible: hasPermission(user, 'materials.view') },
  ].filter((item) => item.visible);

  return (
    <nav className={compact ? 'flex items-center gap-1 rounded-xl bg-slate-100 p-1' : 'flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm'} aria-label="Áreas da Bússola">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`inline-flex items-center gap-2 font-semibold transition ${compact ? 'rounded-lg px-3 py-2 text-[11px]' : 'rounded-xl px-3.5 py-2.5 text-xs'} ${
              active
                ? 'bg-[#0969ff] text-white shadow-sm'
                : compact
                  ? 'text-slate-500 hover:bg-white hover:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon size={compact ? 14 : 15} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function CompassSectionNav() {
  return (
    <>
      <TopbarPortal><NavItems compact /></TopbarPortal>
      <div className="lg:hidden"><NavItems /></div>
    </>
  );
}
