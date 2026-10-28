import {
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Fingerprint,
  Handshake,
  Layers3,
  MessageCircle,
  Palette,
  Rocket,
  Target,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import zebraMark from '../assets/zebrazul-mark-dark.png';

const pillars = [
  {
    icon: Fingerprint,
    title: 'Expressão',
    text: 'A marca precisa parecer com ela mesma. Encontramos o que é próprio, verdadeiro e reconhecível — e transformamos isso em linguagem, identidade e presença.',
  },
  {
    icon: Compass,
    title: 'Estratégia',
    text: 'Antes de produzir, decidimos direção. Posicionamento, prioridades, público, oferta e objetivos precisam conversar entre si.',
  },
  {
    icon: Rocket,
    title: 'Execução',
    text: 'Estratégia só vira resultado quando sai do papel. Organizamos rotina, produção, mídia, campanhas, acompanhamento e melhoria contínua.',
  },
];

const method = [
  {
    number: '01',
    title: 'Diagnóstico',
    text: 'Entendemos negócio, momento, marca, público, canais, gargalos e oportunidades antes de propor qualquer calendário.',
  },
  {
    number: '02',
    title: 'Plano',
    text: 'Transformamos o diagnóstico em escolhas: posicionamento, metas, prioridades, campanhas e indicadores que fazem sentido para a empresa.',
  },
  {
    number: '03',
    title: 'Ciclos de 90 dias',
    text: 'Trabalhamos em ciclos para manter foco. Cada ciclo tem objetivos claros, hipóteses, ações e pontos de revisão.',
  },
  {
    number: '04',
    title: 'Calendário mensal',
    text: 'O mês vira operação: conteúdo, mídia, campanhas, gravações, páginas, comercial e entregas organizadas dentro do ZebraHub.',
  },
  {
    number: '05',
    title: 'Leitura e ajuste',
    text: 'Acompanhamos o que aconteceu, o que mudou e onde vale insistir, cortar ou acelerar. Direção também é saber mudar de direção.',
  },
];

const deliveries = [
  ['Posicionamento e estratégia', 'Clareza de marca, público, oferta, narrativa e prioridades.'],
  ['Conteúdo e social media', 'Planejamento, criação, produção e organização editorial.'],
  ['Tráfego pago', 'Campanhas com acompanhamento de CPC, CPM, CTR, frequência, leads e conversões.'],
  ['Sites e landing pages', 'Páginas pensadas para comunicar, capturar demanda e apoiar campanhas.'],
  ['Comercial e conversão', 'Pipeline, acompanhamento de leads, follow-up e leitura de gargalos entre marketing e venda.'],
  ['Marca e identidade', 'Direção visual e verbal para construir reconhecimento sem cair na padronização.'],
];

export default function ZebrazulAgency() {
  const { user } = useAuth();

  const contactHref = useMemo(() => {
    const whatsapp = String(user?.agency?.support_whatsapp || '').replace(/\D/g, '');
    if (whatsapp) {
      const message = encodeURIComponent('Olá! Estou conhecendo a Zebrazul pelo ZebraHub Experience e quero conversar sobre a agência.');
      return `https://wa.me/${whatsapp}?text=${message}`;
    }
    const email = String(user?.agency?.support_email || '').trim();
    if (email) return `mailto:${email}?subject=${encodeURIComponent('Quero conhecer a Zebrazul')}`;
    return null;
  }, [user?.agency?.support_email, user?.agency?.support_whatsapp]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <section className="relative overflow-hidden rounded-[32px] bg-[#17181C] px-6 py-9 text-white shadow-[0_28px_80px_rgba(23,24,28,0.16)] sm:px-9 lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#3A85FD]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-[#C9FF2F]/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#C9FF2F]">
              <img src={zebraMark} alt="" className="h-5 w-5 rounded-md bg-white p-0.5" /> Zebrazul
            </div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.24em] text-[#3A85FD]">Revelar o único, torná-lo marcante.</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black uppercase leading-[0.94] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Marketing é direção,<br />não demanda.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/60">
              A Zebrazul é uma agência de estratégia, marca e execução. Entramos para organizar o que a empresa quer dizer, para quem precisa dizer e como transformar isso em movimento real de negócio.
            </p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">No que acreditamos</p>
            <p className="mt-3 text-xl font-black leading-7 tracking-[-0.025em]">Contra a padronização.<br /><span className="text-[#C9FF2F]">A favor do que só você pode ser.</span></p>
            <p className="mt-4 text-sm leading-6 text-white/55">Não queremos transformar empresas diferentes no mesmo feed, no mesmo discurso ou na mesma fórmula. O trabalho começa quando a gente encontra o que não deveria ser copiável.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {pillars.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#17181C] text-[#C9FF2F]"><Icon size={21} /></div>
            <h2 className="mt-5 text-xl font-black tracking-[-0.03em] text-[#17181C]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF4FF] text-[#2563EB]"><Workflow size={23} /></div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#2563EB]">Como trabalhamos</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-[#17181C]">Do diagnóstico à rotina.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">A gente não começa pelo post. Começa pelo problema, define o caminho e só depois transforma a estratégia em calendário e execução.</p>
          </div>

          <div className="space-y-3">
            {method.map((item) => (
              <div key={item.number} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-[54px_170px_1fr] sm:items-start">
                <span className="text-xs font-black text-[#2563EB]">{item.number}</span>
                <h3 className="font-black tracking-[-0.02em] text-[#17181C]">{item.title}</h3>
                <p className="text-sm leading-6 text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF3F8] text-[#EC0567]"><Layers3 size={21} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC0567]">O que fazemos</p>
              <h2 className="text-2xl font-black tracking-[-0.04em] text-[#17181C]">Uma agência que conecta as partes.</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {deliveries.map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" /><h3 className="text-sm font-black text-[#17181C]">{title}</h3></div>
                <p className="mt-2 pl-6 text-xs leading-5 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] bg-[#EEF4FF] p-6 sm:p-8">
            <Target className="text-[#2563EB]" size={26} />
            <h2 className="mt-5 text-2xl font-black tracking-[-0.04em] text-[#17181C]">O ZebraHub faz parte do método.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Ele existe para dar visibilidade à operação: tarefas, aprovações, conteúdo, Radar, Comercial, relatórios e planejamento no mesmo lugar. Menos informação perdida. Mais decisão com contexto.</p>
          </div>

          <div className="rounded-[28px] bg-[#C9FF2F] p-6 text-[#17181C] sm:p-8">
            <Handshake size={27} />
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em]">Se fizer sentido</p>
            <h2 className="mt-2 text-3xl font-black leading-8 tracking-[-0.045em]">A gente entra para construir junto.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#17181C]/65">Não vendemos uma sequência infinita de peças. Entramos para dar direção, organizar prioridades e executar o que precisa ganhar forma.</p>
            {contactHref ? (
              <a href={contactHref} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5">
                <MessageCircle size={17} /> Conversar com a Zebrazul <ArrowUpRight size={16} />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/60 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm"><UsersRound size={22} className="text-[#17181C]" /></div>
        <h2 className="mt-4 text-xl font-black tracking-[-0.03em] text-[#17181C]">Estratégia não acontece no isolamento.</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">O melhor trabalho aparece quando agência e cliente compartilham contexto, responsabilidade e clareza sobre o que estão tentando construir.</p>
      </section>
    </div>
  );
}
