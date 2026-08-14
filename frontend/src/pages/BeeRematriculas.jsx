import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { isBeeClient } from '../utils/beeClientAccess.js';
import rematriculasHtml from '../content/bee-rematriculas-2027.html?raw';

export default function BeeRematriculas() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clientRecord, setClientRecord] = useState(null);
  const [loadingClient, setLoadingClient] = useState(user?.role === 'client');

  useEffect(() => {
    if (user?.role !== 'client') {
      setClientRecord(null);
      setLoadingClient(false);
      return undefined;
    }

    let active = true;
    setLoadingClient(true);

    api.get('/clients?summary=1')
      .then(({ data }) => {
        if (!active) return;
        const clients = Array.isArray(data?.clients) ? data.clients : [];
        const ownClient = clients.find((client) => Number(client.id) === Number(user.client_id)) || clients[0] || null;
        setClientRecord(ownClient);
      })
      .catch(() => {
        if (active) setClientRecord(null);
      })
      .finally(() => {
        if (active) setLoadingClient(false);
      });

    return () => { active = false; };
  }, [user?.id, user?.role, user?.client_id]);

  const workspaceClient = user?.role === 'client' ? clientRecord : selectedClient;

  if (loadingClient) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-500 shadow-sm">
          Carregando Rematrículas Bee...
        </div>
      </div>
    );
  }

  if (!isBeeClient(workspaceClient)) {
    return <Navigate to="/feed" replace />;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.10)]">
      <iframe
        title="Mapa de Rematrículas Bee Christian School 2027"
        srcDoc={rematriculasHtml}
        className="block h-[calc(100vh-4rem)] min-h-[720px] w-full border-0 bg-[#F7F6F1]"
      />
    </div>
  );
}
