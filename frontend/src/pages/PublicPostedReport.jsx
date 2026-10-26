import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';
import axios from 'axios';
import { attachMediaResolver } from '../utils/mediaUrl';
import { PLATFORMS, PlatformBadges } from '../components/PlatformBadges.jsx';
import zebrazulMark from '../assets/zebrazul-mark-dark.png';

const publicApi = attachMediaResolver(axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' }));
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
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

  if (error) return <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] p-6 text-center text-sm font-semibold text-slate-500">{error}</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] text-slate-400"><Loader2 className="animate-spin" /></div>;

  const monthName = `${MONTHS[Number(data.month.slice(5, 7)) - 1]} de ${data.month.slice(0, 4)}`;

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-[#17181C] print:bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="relative mb-6 overflow-hidden rounded-[30px] bg-[#17181C] p-6 text-white sm:p-8">
          <span className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border-[34px] border-[#3A85FD]/60" />
          <span className="pointer-events-none absolute -bottom-20 right-32 h-40 w-40 rounded-full border-[30px] border-[#EC0567]/65" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white sm:flex"><img src={zebrazulMark} alt="Zebrazul" className="h-11 w-11 object-contain" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9FF2F]">Relatório de postagens</p>
                <h1 className="brand-display mt-2 text-4xl font-black uppercase leading-none tracking-tight">{data.client.name}</h1>
                <p className="mt-2 text-sm text-white/55">{monthName}</p>
              </div>
            </div>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#C9FF2F] px-3.5 py-2.5 text-xs font-black text-[#17181C] hover:brightness-95 print:hidden"><Printer size={14} /> Salvar em PDF</button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white px-5 py-4"><span className="absolute right-0 top-0 h-1.5 w-16 bg-[#C9FF2F]" /><p className="brand-display text-4xl font-black">{data.total}</p><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Posts postados</p></div>
          {platforms.map(([key, n], index) => (
            <div key={key} className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white px-4 py-4"><span className={`absolute right-0 top-0 h-1.5 w-16 ${index % 2 === 0 ? 'bg-[#3A85FD]' : 'bg-[#EC0567]'}`} /><p className="brand-display text-3xl font-black">{n}</p><div className="mt-1"><PlatformBadges platforms={[key]} /></div></div>
          ))}
          {types.slice(0, Math.max(0, 3 - platforms.length)).map(([type, n]) => (
            <div key={type} className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white px-4 py-4"><span className="absolute right-0 top-0 h-1.5 w-16 bg-[#17181C]" /><p className="brand-display text-3xl font-black">{n}</p><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{cap(type)}</p></div>
          ))}
        </section>

        {data.total === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center">
            <CheckCircle2 className="mx-auto text-[#3A85FD]" size={26} />
            <p className="brand-display mt-3 text-2xl font-black uppercase text-slate-800">Nada foi ao ar neste mês.</p>
            <p className="mt-1 text-sm text-slate-400">Quando as postagens forem registradas, elas aparecem aqui.</p>
          </div>
        ) : (
          <section>
            <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#3A85FD]">O que foi pro mundo</p><h2 className="mt-1 text-lg font-black text-slate-900">Conteúdo publicado</h2></div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {data.items.map((item) => (
                <article key={item.id} className="break-inside-avoid overflow-hidden rounded-[20px] border border-slate-200 bg-white">
                  {item.image ? <img src={item.image} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-xs text-slate-400">Sem imagem</div>}
                  <div className="space-y-1.5 p-3">
                    <p className="text-sm font-black leading-snug">{item.title}</p>
                    <p className="text-xs text-slate-500">{fmtDay(item.date)} · {cap(item.content_type)}</p>
                    {item.platforms.length ? <PlatformBadges platforms={item.platforms} /> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <p className="mt-10 text-center text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Zebrazul · dado que deixa rastro</p>
      </div>
    </div>
  );
}
