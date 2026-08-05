import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import logoHub from '../assets/logo-hub.png';

export default function LegalLayout({ eyebrow, title, description, updatedAt, children }) {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/login" className="flex items-center gap-3" aria-label="Ir para o ZebraHub">
            <img src={logoHub} alt="ZebraHub" className="h-9 w-auto" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft size={16} /> Entrar no ZebraHub
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#101521] py-16 text-white sm:py-20">
          <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/65">
              <ShieldCheck size={14} /> {eyebrow}
            </span>
            <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-white/62 sm:text-lg">{description}</p>
            <p className="mt-5 text-sm text-white/45">Última atualização: {updatedAt}</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <article className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-10">
            <div className="legal-content space-y-8 text-[15px] leading-7 text-slate-600 sm:text-base">{children}</div>
          </article>

          <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/80 p-5 text-sm leading-6 text-slate-700">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Mail size={17} /></div>
              <div>
                <p className="font-semibold text-slate-900">Contato sobre privacidade e dados</p>
                <p className="mt-1">Envie uma solicitação para <a className="font-semibold text-blue-700 underline underline-offset-2" href="mailto:arthurzebrazul@gmail.com">arthurzebrazul@gmail.com</a>.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 Zebrazul. Todos os direitos reservados.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="hover:text-slate-900" to="/politica-de-privacidade">Privacidade</Link>
            <Link className="hover:text-slate-900" to="/termos-de-uso">Termos</Link>
            <Link className="hover:text-slate-900" to="/exclusao-de-dados">Exclusão de dados</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
