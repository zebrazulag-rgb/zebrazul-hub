import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, HeartHandshake, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BeeFamilySurveyDashboard from '../components/BeeFamilySurveyDashboard.jsx';
import PageHero from '../components/PageHero.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { isBeeClient } from '../utils/beeClientAccess.js';

export default function BeeFamilySurvey() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(null);

  const clientId = user?.role === 'client'
    ? Number(user.client_id)
    : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client'
    ? user?.client_name || 'Bee'
    : selectedClient?.name || '';
  const beeActive = isBeeClient(selectedClient) || isBeeClient({ name: clientName });

  const notify = useCallback((message, type = 'success') => {
    setNotice({ message, type });
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!clientId) {
    return <EmptyState title="Selecione a Bee" text="Use o seletor de clientes no menu lateral para abrir a pesquisa das famílias." />;
  }

  if (!beeActive) {
    return <EmptyState title="Pesquisa exclusiva da Bee" text="Esta etapa aparece somente quando a Bee Christian School ou a Bee Light está selecionada." />;
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate('/bussola')}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Voltar para a Bússola
      </button>

      <PageHero
        icon={HeartHandshake}
        eyebrow={`${clientName} · Bússola`}
        title="Pesquisa de Famílias"
        description="Acompanhe a experiência, o vínculo e os sinais que merecem cuidado, sem expor a pontuação interna às famílias."
      />

      {notice ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
          notice.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {notice.message}
        </div>
      ) : null}

      <BeeFamilySurveyDashboard
        clientId={clientId}
        notify={notify}
        showIntro={false}
      />
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="surface-card p-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <RefreshCw size={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
