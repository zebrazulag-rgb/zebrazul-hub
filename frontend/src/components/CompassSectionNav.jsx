import { Compass, FolderOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

export default function CompassSectionNav() {
  const { user } = useAuth();
  const location = useLocation();
  const items = [
    { to: '/bussola', label: 'Visão geral', icon: Compass, exact: true, visible: hasPermission(user, 'compass.view') },
    { to: '/bussola/materiais', label: 'Materiais', icon: FolderOpen, visible: hasPermission(user, 'materials.view') },
  ].filter((item) => item.visible);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
              active
                ? 'bg-[#0969ff] text-white shadow-[0_8px_20px_rgba(9,105,255,0.18)]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon size={15} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
