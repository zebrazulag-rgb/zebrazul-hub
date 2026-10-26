import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ClientPortal from './ClientPortal.jsx';

export default function ClientPortalHome() {
  const { user } = useAuth();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.client_id) {
      setError('Seu usuário ainda não está vinculado a um cliente.');
      return;
    }
    let active = true;
    api.post(`/clients/${user.client_id}/portal-share`)
      .then(({ data }) => { if (active) setToken(data.token || ''); })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'Não foi possível abrir seu portal.'); });
    return () => { active = false; };
  }, [user?.client_id]);

  if (error) return <div className="rounded-3xl border border-rose-200 bg-white p-7 text-center text-sm font-semibold text-rose-700">{error}</div>;
  if (!token) return <div className="flex min-h-[50vh] items-center justify-center text-sm font-bold text-slate-500"><Loader2 size={18} className="mr-2 animate-spin text-[#3A85FD]" /> Abrindo seu espaço...</div>;
  return <ClientPortal tokenOverride={token} embedded />;
}
