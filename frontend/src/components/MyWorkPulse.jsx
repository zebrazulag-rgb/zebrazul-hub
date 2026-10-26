import { useEffect, useState } from 'react';
import { UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function localDay() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MyWorkPulse() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!user || user.role === 'client') return undefined;
    let active = true;
    const load = () => api.get('/my-work', {
      params: {
        today_date: localDay(),
        ...(selectedClient?.id ? { client_id: selectedClient.id } : {}),
      },
    }).then((response) => {
      if (active) setSummary(response.data?.summary || null);
    }).catch(() => {});
    load();
    const interval = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user?.id, user?.role, selectedClient?.id]);

  if (!user || user.role === 'client' || !summary) return null;
  const total = Number(summary.total || 0);
  const urgent = Number(summary.urgent || 0);

  return (
    <button
      type="button"
      onClick={() => navigate('/minha-fila')}
      className={`relative flex h-10 items-center justify-center gap-2 rounded-xl border px-2.5 transition sm:px-3 ${urgent > 0 ? 'border-[#EC0567]/25 bg-[#EC0567]/10 text-[#B40049]' : total > 0 ? 'border-[#3A85FD]/20 bg-[#3A85FD]/[0.07] text-[#1D5FB8]' : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900'}`}
      title={urgent > 0 ? `${urgent} item(ns) urgente(s) na sua fila` : total > 0 ? `${total} item(ns) com você` : 'Sua fila está limpa'}
      aria-label="Abrir minha fila"
    >
      <UserRoundCheck size={17} />
      <span className="hidden text-xs font-black xl:inline">{total > 0 ? `${total} com você` : 'Fila limpa'}</span>
      {urgent > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EC0567] px-1 text-[10px] font-black text-white ring-2 ring-[#F5F3EE]">{urgent > 9 ? '9+' : urgent}</span>}
    </button>
  );
}
