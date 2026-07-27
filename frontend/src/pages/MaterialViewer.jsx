import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, FileCode2, Loader2, RefreshCw } from 'lucide-react';
import api from '../api';

export default function MaterialViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/materials/${id}/access`);
      setAccess(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível abrir o material.');
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.12)]">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate('/materiais')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" title="Voltar para materiais"><ArrowLeft size={18} /></button>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><FileCode2 size={20} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0969ff]">Material interativo</p>
            <h1 className="truncate text-lg font-bold text-slate-900">{access?.material?.title || 'Carregando material...'}</h1>
            {access?.material?.client_name && <p className="truncate text-xs text-slate-400">{access.material.client_name}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-secondary inline-flex items-center gap-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Recarregar</button>
          {access && (
            <>
              <button onClick={() => window.open(access.view_url, '_blank', 'noopener,noreferrer')} className="btn-secondary inline-flex items-center gap-2"><ExternalLink size={16} /> Nova aba</button>
              <button onClick={() => window.location.assign(access.download_url)} className="btn-primary inline-flex items-center gap-2"><Download size={16} /> Baixar HTML</button>
            </>
          )}
        </div>
      </header>

      <div className="relative min-h-[680px] flex-1 bg-slate-100">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
            <div className="text-center text-slate-500"><Loader2 size={28} className="mx-auto animate-spin text-[#0969ff]" /><p className="mt-3 text-sm font-medium">Abrindo material...</p></div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-lg">
              <p className="font-semibold text-red-600">{error}</p>
              <button onClick={load} className="btn-primary mt-5">Tentar novamente</button>
            </div>
          </div>
        )}
        {access?.view_url && (
          <iframe
            key={access.view_url}
            src={access.view_url}
            title={access.material?.title || 'Material'}
            className="absolute inset-0 h-full min-h-[680px] w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
            referrerPolicy="no-referrer"
            allow="clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
