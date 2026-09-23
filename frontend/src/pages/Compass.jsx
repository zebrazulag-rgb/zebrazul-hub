import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Check, ChevronDown, ChevronRight, Circle, Compass, Flag,
  FolderOpen, PackageCheck, RefreshCcw, Rocket, UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import CompassSectionNav from '../components/CompassSectionNav.jsx';

const JOURNEY = [
  {
    id: 'onboarding', number: '01', title: 'Onboarding', short: 'Começar juntos', icon: UsersRound,
    description: 'Alinhar o início da parceria e colocar cliente e equipe no mesmo ponto de partida.',
    items: ['Reunião de onboarding', 'Criar grupo e apresentar o time'],
  },
  {
    id: 'coleta', number: '02', title: 'Coleta de informações', short: 'Conhecer o negócio', icon: FolderOpen,
    description: 'Reunir a base necessária para compreender a empresa antes de definir qualquer direção.',
    items: ['Acessos', 'Logo', 'Fotos / banco de imagens', 'Serviços / produtos', 'História', 'Público-alvo', 'Propósito, missão, visão e valores', 'Análise dos concorrentes'],
  },
  {
    id: 'primeiras-entregas', number: '03', title: 'Primeiras entregas', short: 'Construir a direção', icon: PackageCheck,
    description: 'Transformar a coleta em entregas estratégicas com prazo e direção clara para a operação.',
    items: ['Manual de posicionamento', 'Branding, quando necessário', 'Plano de ação do ano'],
  },
  {
    id: 'execucao', number: '04', title: 'Execução', short: 'Colocar em movimento', icon: Rocket,
    description: 'Com a base pronta, o cliente entra na rotina de execução da agência.',
    items: ['Base estratégica concluída', 'Operação liberada para execução'],
  },
  {
    id: 'checkpoint-6m', number: '05', title: 'Checkpoint · 6 meses', short: 'Recalibrar', icon: RefreshCcw,
    description: 'Renovar informações, entender mudanças e registrar o que funcionou e o que precisa evoluir.',
    items: ['Atualizar informações do negócio', 'Revisar o que deu certo', 'Revisar o que não deu certo', 'Registrar novos desafios e oportunidades'],
  },
  {
    id: 'checkpoint-anual', number: '06', title: 'Virada do ano', short: 'Renovar a rota', icon: CalendarClock,
    description: 'Fechar o ciclo, atualizar o cenário e preparar a direção estratégica do próximo ano.',
    items: ['Atualizar informações estratégicas', 'Revisar aprendizados do ano', 'Atualizar prioridades', 'Preparar o próximo plano anual'],
  },
];

function emptyProgress() {
  return Object.fromEntries(JOURNEY.map((stage) => [stage.id, Object.fromEntries(stage.items.map((item) => [item, false]))]));
}

export default function CompassPage() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';
  const canEdit = user?.role !== 'client';
  const storageKey = `zebrahub:compass-journey:${clientId || 'none'}`;
  const [progress, setProgress] = useState(emptyProgress);
  const [openStage, setOpenStage] = useState('onboarding');

  useEffect(() => {
    if (!clientId) return setProgress(emptyProgress());
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      setProgress(saved && typeof saved === 'object' ? { ...emptyProgress(), ...saved } : emptyProgress());
    } catch { setProgress(emptyProgress()); }
  }, [clientId, storageKey]);

  const stageProgress = useMemo(() => Object.fromEntries(JOURNEY.map((stage) => {
    const done = stage.items.filter((item) => progress?.[stage.id]?.[item]).length;
    return [stage.id, { done, total: stage.items.length, percent: Math.round((done / stage.items.length) * 100) }];
  })), [progress]);

  const total = JOURNEY.reduce((sum, stage) => sum + stage.items.length, 0);
  const done = JOURNEY.reduce((sum, stage) => sum + (stageProgress[stage.id]?.done || 0), 0);
  const overall = total ? Math.round((done / total) * 100) : 0;
  const currentStage = JOURNEY.find((stage) => (stageProgress[stage.id]?.percent || 0) < 100) || JOURNEY[JOURNEY.length - 1];

  function toggle(stageId, item) {
    if (!canEdit || !clientId) return;
    setProgress((current) => {
      const next = { ...current, [stageId]: { ...(current[stageId] || {}), [item]: !current?.[stageId]?.[item] } };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <CompassSectionNav />

      <section className="rounded-[26px] border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-600"><Compass size={14} /> Bússola</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Jornada estratégica</h1>
            <p className="mt-1 text-sm text-slate-500">{clientName || 'Selecione um cliente para acompanhar a jornada.'}</p>
          </div>
          {clientId && <div className="min-w-[190px] rounded-2xl bg-slate-50 px-4 py-3">
            <div className="flex items-end justify-between gap-3"><span className="text-xs font-semibold text-slate-500">Progresso geral</span><strong className="text-xl text-slate-950">{overall}%</strong></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${overall}%` }} /></div>
          </div>}
        </div>
      </section>

      {!clientId ? (
        <section className="rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <Compass className="mx-auto text-blue-600" size={28} />
          <h2 className="mt-3 font-bold text-slate-900">Selecione um cliente</h2>
          <p className="mt-1 text-sm text-slate-500">A jornada é individual e acompanha o progresso estratégico de cada cliente.</p>
        </section>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white px-4 py-7 shadow-sm sm:px-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Mapa da jornada</p><h2 className="mt-1 text-lg font-bold text-slate-900">Do onboarding à renovação da rota</h2></div>
              <div className="hidden items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 sm:flex"><Flag size={14} /> Agora: {currentStage.title}</div>
            </div>

            <div className="relative overflow-x-auto pb-2">
              <div className="relative min-w-[980px] px-6 py-8">
                <svg className="pointer-events-none absolute inset-x-0 top-[42px] h-[160px] w-full" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M25 118 C90 18,145 18,205 98 S315 170,375 54 S490 0,545 95 S665 165,720 48 S835 4,975 68" fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" />
                  <path d="M25 118 C90 18,145 18,205 98 S315 170,375 54 S490 0,545 95 S665 165,720 48 S835 4,975 68" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" strokeDasharray="1000" strokeDashoffset={1000 - (overall * 10)} className="transition-all duration-700" />
                </svg>
                <div className="relative grid grid-cols-6 gap-5">
                  {JOURNEY.map((stage, index) => {
                    const stat = stageProgress[stage.id];
                    const completed = stat.percent === 100;
                    const active = currentStage.id === stage.id;
                    const Icon = stage.icon;
                    const offsets = ['mt-16','mt-0','mt-20','mt-3','mt-16','mt-0'];
                    return <button key={stage.id} type="button" onClick={() => setOpenStage(stage.id)} className={`${offsets[index]} group text-left`}>
                      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-white shadow-lg transition group-hover:scale-105 ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                        {completed ? <Check size={22} strokeWidth={3} /> : <Icon size={21} />}
                      </div>
                      <div className={`mx-auto mt-3 max-w-[150px] rounded-2xl border bg-white p-3 shadow-sm transition ${openStage === stage.id ? 'border-blue-300 shadow-blue-950/10' : 'border-slate-200'}`}>
                        <span className="text-[10px] font-black tracking-[0.14em] text-blue-600">ETAPA {stage.number}</span>
                        <p className="mt-1 text-sm font-bold leading-tight text-slate-900">{stage.title}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{stat.done}/{stat.total} concluídos</p>
                      </div>
                    </button>;
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white shadow-sm">
              {JOURNEY.map((stage) => {
                const Icon = stage.icon;
                const opened = openStage === stage.id;
                const stat = stageProgress[stage.id];
                return <div key={stage.id} className="border-b border-slate-100 last:border-0">
                  <button type="button" onClick={() => setOpenStage(opened ? '' : stage.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.percent === 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{stat.percent === 100 ? <Check size={19} /> : <Icon size={19} />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Etapa {stage.number} · {stage.short}</span><span className="mt-0.5 block font-bold text-slate-900">{stage.title}</span></span>
                    <span className="text-xs font-bold text-slate-400">{stat.percent}%</span>
                    {opened ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  </button>
                  {opened && <div className="px-5 pb-5 pl-[76px]">
                    <p className="mb-4 max-w-2xl text-sm leading-6 text-slate-500">{stage.description}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {stage.items.map((item) => {
                        const checked = !!progress?.[stage.id]?.[item];
                        return <button key={item} type="button" disabled={!canEdit} onClick={() => toggle(stage.id, item)} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${checked ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900' : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:border-blue-200'} ${!canEdit ? 'cursor-default' : ''}`}>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>{checked ? <Check size={13} strokeWidth={3} /> : <Circle size={8} />}</span>
                          <span className="font-medium">{item}</span>
                        </button>;
                      })}
                    </div>
                  </div>}
                </div>;
              })}
            </div>

            <aside className="rounded-[26px] bg-[#111827] p-5 text-white shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Próximo movimento</p>
              <h3 className="mt-2 text-xl font-black">{currentStage.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{currentStage.description}</p>
              <div className="mt-5 rounded-2xl bg-white/5 p-4">
                <p className="text-xs font-semibold text-slate-400">Pendências desta etapa</p>
                <p className="mt-1 text-3xl font-black">{stageProgress[currentStage.id].total - stageProgress[currentStage.id].done}</p>
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-400">A Bússola não termina na execução: aos 6 meses e na virada do ano, a rota é revisada com novas informações e aprendizados.</p>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
