import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PublicTaskRequest from './PublicTaskRequest.jsx';

export default function ClientDemand() {
  const { user } = useAuth();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.client_id) {
      setError('Seu usuário ainda não está vinculado a um cliente.');
      setLoading(false);
      return;
    }
    let active = true;
    api.get(`/task-request-links/${user.client_id}`)
      .then(({ data }) => {
        if (!active) return;
        if (!data?.link?.token) throw new Error('Link de solicitação indisponível.');
        setToken(data.link.token);
      })
      .catch((err) => { if (active) setError(err.response?.data?.error || err.message || 'Não foi possível abrir a solicitação.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.client_id]);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 size={18} className="mr-2 animate-spin" /> Carregando...</div>;
  if (error) return <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-7 text-center text-sm text-rose-700 shadow-sm">{error}</div>;
  return <PublicTaskRequest token={token} embedded />;
}
