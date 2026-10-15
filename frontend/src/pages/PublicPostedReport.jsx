import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Printer } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import { PLATFORMS, PlatformBadges } from '../components/PlatformBadges.jsx';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const cap = (v) => { const t = String(v || 'outro'); return t.charAt(0).toUpperCase() + t.slice(1); };

export default function PublicPostedReport() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.get(`/public/report/${token}`)
      .then(({ data: body }) => setData(body))
      .catch((e) => setError(e.response?.data?.error || 'Não foi possível abrir este relatório.'));
  }, [token]);

  const platforms = useMemo(() => Object.entries(data?.by_platform || {}).sort((a, b) => b[1] - a[1]), [data]);
  const types = useMemo(() => Object.entries(data?.by_type || {}).sort((a, b) => b[1] - a[1]), [data]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">{error}</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400"><Loader2 className="animate-spin" /></div>;

  const monthName = `${MONTHS[Number(data.month.slice(5, 7)) - 1]} de ${data.month.slice(0, 4)}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Relatório de postagens</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.client.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{monthName}</p>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 print:hidden"><Printer size={14} /> Salvar em PDF</button>
        </header>

        <section className="mb-6 flex flex-wrap gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3"><p className="text-3xl font-black">{data.total}</p><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Posts postados</p></div>
          {platforms.map(([key, n]) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-2xl font-black">{n}</p><PlatformBadges platforms={[key]} /></div>
          ))}
          {types.map(([type, n]) => (
            <div key={type} className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-2xl font-black">{n}</p><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{cap(type)}</p></div>
          ))}
        </section>

        {data.total === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Nenhum post registrado neste mês.</p>
        ) : (
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {data.items.map((item) => (
              <article key={item.id} className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {item.image ? <img src={item.image} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-xs text-slate-400">Sem imagem</div>}
                <div className="space-y-1.5 p-3">
                  <p className="text-sm font-bold leading-snug">{item.title}</p>
                  <p className="text-xs text-slate-500">{fmtDay(item.date)} · {cap(item.content_type)}</p>
                  {item.platforms.length ? <PlatformBadges platforms={item.platforms} /> : null}
                </div>
              </article>
            ))}
          </section>
        )}
        <p className="mt-8 text-center text-[11px] text-slate-400">Zebrazul · relatório gerado automaticamente</p>
      </div>
    </div>
  );
}
