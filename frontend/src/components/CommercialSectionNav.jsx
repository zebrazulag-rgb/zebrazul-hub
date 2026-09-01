import { FileSignature, LayoutList, Network } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const items = [
  { to: '/comercial', label: 'Comercial', icon: LayoutList, exact: true },
  { to: '/comercial/funil', label: 'Funil', icon: Network },
  { to: '/comercial/contratos', label: 'Contratos', icon: FileSignature },
];

export default function CommercialSectionNav() {
  const location = useLocation();

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {items.map((item) => {
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        const Icon = item.icon;

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
