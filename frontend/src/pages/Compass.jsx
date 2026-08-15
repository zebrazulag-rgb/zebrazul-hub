import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  Compass,
  FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import { isBeeClient } from '../utils/beeClientAccess.js';

const EMPTY_STATUS = {
  dme: null,
  diagnosis: 0,
  briefing: { count: 0, submitted: 0, progress: 0 },
};

export default function CompassPage() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);

  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';

  // A mesma identificação usada no menu de Rematrículas precisa valer aqui.
  // O fallback pelo nome evita perder a etapa quando o objeto do cliente vem
  // resumido do contexto/localStorage, mas o nome exibido continua disponível.
  const beeActive = isBeeClient(selectedClient) || isBeeClient({ name: clientName });

  useEffect(() => {
    let active = true;

    async function load() {
      if (!clientId) {
        setStatus(EMPTY_STATUS);
        return;
      }

      setLoading(true);
      try {
        const diagnosticRequest = user?.role !== 'client'
          ? api.get('/diagnostics', { params: { client_id: clientId } })
          : Promise.resolve({ data: { diagnostics: [] } });

        const briefingRequest = beeActive
          ? api.get('/bee-campaign-briefing', { params: { client_id: clientId, year: 2027 } })
          : Promise.resolve({ data: { responses: [] } });

        const [planResponse, diagnosticResponse, briefingResponse] = await Promise.all([
          api.get('/action-plans', { params: { client_id: clientId } }),
          diagnosticRequest,
          briefingRequest,
        ]);

        if (!active) return;
        const plan = planResponse.data.plan || {};
        const latestDme = diagnosticResponse?.data?.diagnostics?.[0] || null;
        const briefingResponses = Array.isArray(briefingResponse?.data?.responses) ? briefingResponse.data.responses : [];
        const briefingProgress = briefingResponses.length
          ? Math.round(briefingResponses.reduce((sum, item) => sum + Number(item.progress || 0), 0) / briefingResponses.length)
          : 0;

        setStatus({
          dme: latestDme,
          diagnosis: Number(plan.progress || 0),
          briefing: {
            count: briefingResponses.length,
            submitted: briefingResponses.filter((item) => item.status === 'submitted').length,
            progress: briefingProgress,
          },
        });
      } catch {
        if (active) setStatus(EMPTY_STATUS);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [clientId, user?.role, beeActive]);

  const steps = useMemo(() => [
    {
      number: '01',
      title: 'DME',
      subtitle: 'Entender o momento atual',
      description: 'O cliente responde o diagnóstico de maturidade por um link compartilhável. As respostas ficam salvas e geram a leitura inicial dos oito pilares.',
      icon: ClipboardCheck,
      available: user?.role !== 'client',
      path: '/bussola/dme',
      progress: status.dme?.progress || 0,
      statusLabel: dmeStatus(status.dme),
    },
    {
      number: '02',
      title: 'Diagnóstico Estratégico',
      subtitle: 'Interpretar, priorizar e decidir',
      description: 'A equipe transforma DME, imersão, dados e evidências em problema central, tese estratégica, prioridades, direção e plano de ação para os próximos movimentos.',
      icon: BrainCircuit,
      available: true,
      path: '/bussola/diagnostico',
      progress: status.diagnosis,
      statusLabel: progressStatus(status.diagnosis),
    },
    ...(beeActive ? [{
      number: '03',
      title: 'Briefing Campanha 2027',
      subtitle: 'Coletar a visão da direção',
      description: 'Crie links individuais para a direção da Bee, receba as respostas em um só lugar e compare as visões antes de consolidar o conceito da campanha de matrículas.',
      icon: FileText,
      available: true,
      path: '/bussola/briefing-bee-2027',
      progress: status.briefing?.progress || 0,
      statusLabel: briefingStatus(status.briefing),
    }] : []),
  ], [status, user?.role, beeActive]);

  return (
    <div className="space-y-6">
      <PageHero
        icon={Compass}
        eyebrow={clientName || 'Metodologia Zebrazul'}
        title="Bússola"
        description="Um fluxo enxuto para compreender o momento atual e transformar evidências em direção estratégica."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value={steps.length} label="etapas conectadas" />
          <HeroMetric value={clientName || '—'} label="cliente selecionado" small />
          <HeroMetric value={loading ? '...' : overallProgress(steps)} label="progresso da bússola" />
        </div>
      </PageHero>

      {!clientId ? (
        <section className="surface-card p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><Compass size={25} /></span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um cliente</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Use o filtro “Visualizando” no menu lateral. A Bússola reúne o DME e o Diagnóstico Estratégico de cada cliente.</p>
        </section>
      ) : (
        <>
          <section className="surface-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="section-kicker">Método estratégico</p>
              <h2 className="section-title mt-1">Da leitura à direção</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">O DME organiza a percepção inicial do negócio. O Diagnóstico Estratégico aprofunda essa leitura, define prioridades e concentra o direcionamento necessário para a execução.</p>
            </div>
            <div className={`grid gap-4 p-6 ${steps.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {steps.map((step) => (
                <CompassCard key={step.title} step={step} onOpen={() => step.available && navigate(step.path)} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Principle number="01" title="Compreender antes de decidir" text="O DME evita que a estratégia seja construída apenas por percepção, urgência ou hábito." />
            <Principle number="02" title="Concentrar a direção" text="O Diagnóstico Estratégico reúne prioridades, decisões e próximos movimentos em um único lugar." />
          </section>
        </>
      )}
    </div>
  );
}

function CompassCard({ step, onOpen }) {
  const Icon = step.icon;
  return (
    <div className="relative rounded-3xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><Icon size={22} /></span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">ETAPA {step.number}</span>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{step.subtitle}</p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{step.title}</h3>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-500">{step.description}</p>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium text-slate-500">{step.statusLabel}</span><span className="font-bold text-slate-700">{step.progress}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--agency-primary)] transition-all" style={{ width: `${Math.max(0, Math.min(100, step.progress))}%` }} /></div>
      </div>
      <button type="button" disabled={!step.available} onClick={onOpen} className={`mt-5 inline-flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${step.available ? 'bg-[#121620] text-white hover:bg-slate-800' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}>
        <span>{step.available ? 'Abrir etapa' : 'Gerenciado pela agência'}</span><ArrowRight size={16} />
      </button>
    </div>
  );
}

function Principle({ number, title, text }) {
  return <div className="surface-card p-5"><span className="text-xs font-bold tracking-[0.16em] text-blue-600">{number}</span><h3 className="mt-2 font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>;
}

function HeroMetric({ value, label, small = false }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.065] px-4 py-3"><p className={`${small ? 'truncate text-base' : 'text-xl'} font-bold text-white`}>{value}</p><p className="mt-0.5 text-xs text-white/50">{label}</p></div>;
}

function dmeStatus(item) {
  if (!item) return 'Aguardando criação';
  if (item.status === 'submitted') return 'Concluído';
  if (item.status === 'in_progress') return `${item.progress || 0}% preenchido`;
  if (item.status === 'shared') return 'Link enviado';
  return 'Arquivado';
}

function progressStatus(progress) {
  return progress > 0 ? `${progress}% preenchido` : 'Aguardando início';
}

function briefingStatus(item) {
  const count = Number(item?.count || 0);
  const submitted = Number(item?.submitted || 0);
  if (!count) return 'Aguardando primeira resposta';
  return `${submitted}/${count} resposta${count === 1 ? '' : 's'} enviada${submitted === 1 ? '' : 's'}`;
}

function overallProgress(steps) {
  const available = steps.filter((step) => step.available);
  if (!available.length) return '0%';
  return `${Math.round(available.reduce((sum, step) => sum + Number(step.progress || 0), 0) / available.length)}%`;
}
