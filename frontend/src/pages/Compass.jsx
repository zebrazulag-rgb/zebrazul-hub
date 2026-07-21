import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CalendarRange,
  ClipboardCheck,
  Compass,
  Target,
  TimerReset,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';

const EMPTY_STATUS = {
  dme: null,
  diagnosis: 0,
  annual: 0,
  cycle90: { count: 0, progress: 0 },
  monthly: { count: 0, progress: 0 },
};

export default function CompassPage() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);

  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';

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

        const [planResponse, diagnosticResponse, planningResponse] = await Promise.all([
          api.get('/action-plans', { params: { client_id: clientId, year } }),
          diagnosticRequest,
          api.get('/planning-documents/summary', { params: { client_id: clientId, year } }),
        ]);

        if (!active) return;
        const plan = planResponse.data.plan || {};
        const latestDme = diagnosticResponse?.data?.diagnostics?.[0] || null;
        setStatus({
          dme: latestDme,
          diagnosis: Number(plan.progress || 0),
          annual: Number(plan.annual_progress || 0),
          cycle90: planningResponse.data.cycle_90 || { count: 0, progress: 0 },
          monthly: planningResponse.data.monthly || { count: 0, progress: 0 },
        });
      } catch {
        if (active) setStatus(EMPTY_STATUS);
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
      description: 'A equipe transforma DME, imersão, dados e evidências em problema central, tese estratégica, prioridades e direção para os próximos movimentos.',
      icon: BrainCircuit,
      available: true,
      path: '/bussola/diagnostico',
      progress: status.diagnosis,
      statusLabel: progressStatus(status.diagnosis),
    },
    {
      number: '03',
      title: 'Plano de Ação Anual',
      subtitle: 'Definir a direção do ano',
      description: 'Organize os 12 meses em objetivos, pilares, metas, trimestres, projetos, indicadores, responsáveis, orçamento e governança.',
      icon: Target,
      available: true,
      path: '/bussola/plano-anual',
      progress: status.annual,
      statusLabel: progressStatus(status.annual),
    },
    {
      number: '04',
      title: 'Ciclo de 90 Dias',
      subtitle: 'Desdobrar a estratégia em foco',
      description: 'Converta o plano anual em ciclos de 13 semanas, com três prioridades centrais, projetos, capacidade, indicadores e ritmo de acompanhamento.',
      icon: TimerReset,
      available: true,
      path: '/bussola/ciclo-90-dias',
      progress: Number(status.cycle90.progress || 0),
      statusLabel: collectionStatus(status.cycle90, 'ciclo', 'ciclos'),
    },
    {
      number: '05',
      title: 'Planejamento Mensal',
      subtitle: 'Transformar o ciclo em rotina',
      description: 'Organize prioridades, campanhas, conteúdo, tarefas, aprovações, capacidade e indicadores para cada mês de execução.',
      icon: CalendarRange,
      available: true,
      path: '/bussola/planejamento-mensal',
      progress: Number(status.monthly.progress || 0),
      statusLabel: collectionStatus(status.monthly, 'mês iniciado', 'meses iniciados'),
    },
  ], [status, user?.role]);

  return (
    <div className="space-y-6">
      <PageHero
        icon={Compass}
        eyebrow={clientName || 'Metodologia Zebrazul'}
        title="Bússola"
        description="Um fluxo único para compreender o negócio, definir a direção e acompanhar a execução do ano até a rotina mensal."
        actions={
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
            <span className="text-white/50">Ano</span>
            <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </label>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value="5" label="etapas conectadas" />
          <HeroMetric value={clientName || '—'} label="cliente selecionado" small />
          <HeroMetric value={loading ? '...' : overallProgress(steps)} label="progresso da bússola" />
        </div>
      </PageHero>

      {!clientId ? (
        <section className="surface-card p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><Compass size={25} /></span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um cliente</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Use o filtro “Visualizando” no menu lateral. A Bússola organiza DME, Diagnóstico Estratégico, Plano Anual, Ciclos de 90 Dias e Planejamentos Mensais por cliente.</p>
        </section>
      ) : (
        <>
          <section className="surface-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="section-kicker">Método integrado</p>
              <h2 className="section-title mt-1">Da compreensão à execução contínua</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">As cinco etapas formam uma sequência: compreender o cenário, construir a leitura, definir a direção anual, organizar ciclos de 90 dias e transformar cada ciclo em uma rotina mensal acompanhável.</p>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              {steps.map((step) => (
                <CompassCard key={step.title} step={step} onOpen={() => step.available && navigate(step.path)} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Principle number="01" title="Compreender antes de decidir" text="DME e diagnóstico evitam que a estratégia seja construída apenas por percepção, urgência ou hábito." />
            <Principle number="02" title="Desdobrar sem perder direção" text="O plano anual orienta os ciclos de 90 dias, e cada ciclo orienta as prioridades mensais." />
            <Principle number="03" title="Aprender enquanto executa" text="O fechamento de cada mês e ciclo registra resultados, decisões e aprendizados para recalibrar a rota." />
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
      <p className="mt-3 min-h-[96px] text-sm leading-6 text-slate-500">{step.description}</p>
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

function collectionStatus(summary, singular, plural) {
  const count = Number(summary?.count || 0);
  if (!count) return 'Aguardando início';
  return `${count} ${count === 1 ? singular : plural} · ${Number(summary.progress || 0)}% médio`;
}

function overallProgress(steps) {
  const available = steps.filter((step) => step.available);
  if (!available.length) return '0%';
  return `${Math.round(available.reduce((sum, step) => sum + Number(step.progress || 0), 0) / available.length)}%`;
}
