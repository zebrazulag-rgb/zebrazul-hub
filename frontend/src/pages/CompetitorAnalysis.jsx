import { ArrowLeft, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import CompassSectionNav from '../components/CompassSectionNav.jsx';

export default function CompetitorAnalysis() {
  const navigate = useNavigate();
  const { selectedClient } = useClientFilter();

  return (
    <div className="space-y-4">
      <CompassSectionNav />
      <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => navigate('/bussola')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" title="Voltar para a Bússola">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-blue-600"><Search size={14} /> Bússola</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Análise de concorrência</h1>
            <p className="mt-1 text-sm text-slate-500">{selectedClient?.name || 'Cliente selecionado'}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-5 py-8 text-center">
          <Search className="mx-auto text-blue-600" size={26} />
          <h2 className="mt-3 font-bold text-slate-900">Área reservada para a análise de concorrência</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-500">O acesso já está conectado à etapa de Coleta de informações. A estrutura completa desta análise será construída aqui na próxima etapa.</p>
        </div>
      </section>
    </div>
  );
}
