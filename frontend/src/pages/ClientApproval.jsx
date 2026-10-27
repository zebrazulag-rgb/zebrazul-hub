import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PublicFeed from './PublicFeed.jsx';

// Aprovação do cliente logado: mesma grade de perfil do link público, dentro do portal.
export default function ClientApproval() {
  const { user } = useAuth();
  const clientId = user?.client_id;
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) return;
    api.get(`/clients/${clientId}/feed-token`)
      .then(({ data }) => setToken(data.token))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível abrir a aprovação.'));
  }, [clientId]);

  if (error) return <p className="m-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!token) return <p className="m-6 text-sm font-semibold text-slate-400">Carregando a grade...</p>;
  return <PublicFeed token={token} embedded />;
}
