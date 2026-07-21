import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, ClipboardCheck, Compass, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';

export default function CompassPage() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState({ dme: null, diagnosis: 0, annual: 0 });
  const [loading, setLoading] = useState(false);

  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';

  useEffect(() => {
    let active = true;
    async function load() {
      if (!clientId) {
        setStatus({ dme: null, diagnosis: 0, annual: 0 });
        return;
      }
      setLoading(true);
      try {
        const requests = [api.get('/action-plans', { params: { client_id: clientId, year } })];
        if (user?.role !== 'client') requests.push(api.get('/diagnostics', { params: { client_id: clientId } }));
        const [planResponse, diagnosticResponse] = await Promise.all(requests);
        if (!active) return;
        const plan = planResponse.data.plan || {};
        const latestDme = diagnosticResponse?.data?.diagnostics?.[0] || null;
        setStatus({
          dme: latestDme,
          diagnosis: Number(plan.progress || 0),
          annual: Number(plan.annual_progress || 0),
        });
      } catch {
        if (active) setStatus({ dme: null, diagnosis: 0, annual: 0 });
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [clientId, year, user?.role]);

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
      description: 'A equipe transforma DME, imersão, dados e evidências em problema central, tese estratégica, prioridades e direção para os próximos 90 dias.',
      icon: BrainCircuit,
      available: true,
      path: '/bussola/diagnostico',
      progress: status.diagnosis,
      statusLabel: status.diagnosis > 0 ? `${status.diagnosis}% preenchido` : 'Aguardando início',
    },
    {
      number: '03',
      title: 'Plano de Ação Anual',
      subtitle: 'Transformar direção em execução',
      description: 'Organize os 12 meses em objetivos, pilares, metas, trimestres, projetos, indicadores, responsáveis, orçamento e governança.',
      icon: Target,
      available: true,
      path: '/bussola/plano-anual',
      progress: status.annual,
      statusLabel: status.annual > 0 ? `${status.annual}% preenchido` : 'Aguardando início',
    },
  ], [status, user?.role]);

  return (
    <div className="space-y-6">
      <PageHero
        icon={Compass}
        eyebrow={clientName || 'Metodologia Zebrazul'}
        title="Bússola"
        description="Um fluxo único para compreender o negócio, construir a leitura estratégica e transformar a direção em um plano anual executável."
        actions={
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
            <span className="text-white/50">Ciclo</span>
            <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </label>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value="3" label="etapas conectadas" />
          <HeroMetric value={clientName || '—'} label="cliente selecionado" small />
          <HeroMetric value={loading ? '...' : overallProgress(steps)} label="progresso da bússola" />
        </div>
      </PageHero>

      {!clientId ? (
        <section className="surface-card p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><Compass size={25} /></span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um cliente</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Use o filtro “Visualizando” no menu lateral. A Bússola organiza DME, Diagnóstico Estratégico e Plano de Ação Anual por cliente e por ciclo.</p>
        </section>
      ) : (
        <>
          <section className="surface-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="section-kicker">Método integrado</p>
              <h2 className="section-title mt-1">Da compreensão à execução</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">As três etapas formam uma sequência. O DME revela o momento atual, o Diagnóstico Estratégico constrói a leitura e o Plano Anual organiza o caminho de execução.</p>
            </div>
            <div className="grid gap-4 p-6 xl:grid-cols-3">
              {steps.map((step, index) => (
                <CompassCard key={step.title} step={step} isLast={index === steps.length - 1} onOpen={() => step.available && navigate(step.path)} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Principle number="01" title="Escutar antes de produzir" text="O DME e a imersão evitam decisões baseadas apenas em percepção ou urgência." />
            <Principle number="02" title="Escolher antes de executar" text="O diagnóstico define o problema central, as prioridades e o que não será foco agora." />
            <Principle number="03" title="Executar com direção" text="O plano anual transforma a estratégia em ciclos, responsáveis, capacidade e indicadores." />
          </section>
        </>
      )}
    </div>
  );
}

function CompassCard({ step, isLast, onOpen }) {
  const Icon = step.icon;
  return (
    <div className="relative rounded-3xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
      {!isLast && <div className="pointer-events-none absolute -right-4 top-12 z-10 hidden h-px w-4 bg-slate-200 xl:block" />}
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><Icon size={22} /></span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">ETAPA {step.number}</span>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{step.subtitle}</p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{step.title}</h3>
      <p className="mt-3 min-h-[96px] text-sm leading-6 text-slate-500">{step.description}</p>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs"><span className="font-medium text-slate-500">{step.statusLabel}</span><span className="font-bold text-slate-700">{step.progress}%</span></div>
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

function overallProgress(steps) {
  const available = steps.filter((step) => step.available);
  if (!available.length) return '0%';
  return `${Math.round(available.reduce((sum, step) => sum + Number(step.progress || 0), 0) / available.length)}%`;
}
