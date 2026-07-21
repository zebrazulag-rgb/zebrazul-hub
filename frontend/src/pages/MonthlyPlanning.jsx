import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import PlanningDocumentEditor from '../components/PlanningDocumentEditor.jsx';
import {
  createMonthlyPlanningData,
  mergeMonthlyPlanningData,
  MONTH_NAMES,
  monthlyPlanningCoverFields,
  monthlyPlanningProgress,
  monthlyPlanningSections,
} from '../monthlyPlanningConfig.js';

export default function MonthlyPlanning() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const periodLabel = `${MONTH_NAMES[month - 1]} de ${year}`;

  const controls = useMemo(() => (
    <>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
        <CalendarDays size={16} />
        <select className="bg-transparent font-semibold text-white outline-none" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {MONTH_NAMES.map((name, index) => <option className="text-slate-800" key={name} value={index + 1}>{name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
        <span className="text-white/50">Ano</span>
        <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))} />
      </label>
    </>
  ), [month, year]);

  return (
    <PlanningDocumentEditor
      documentType="monthly"
      title="Planejamento Mensal"
      description="Organize o mês com foco, capacidade e clareza: prioridades, projetos, campanhas, conteúdo, tarefas, responsáveis, indicadores, decisões e aprendizados."
      Icon={CalendarRange}
      coverTitle="Identificação do mês"
      coverDescription="Dados gerais que conectam o planejamento ao Ciclo Estratégico de 90 Dias."
      coverFields={monthlyPlanningCoverFields}
      sections={monthlyPlanningSections}
      createData={createMonthlyPlanningData}
      mergeData={mergeMonthlyPlanningData}
      getProgress={monthlyPlanningProgress}
      periodKey={periodKey}
      periodLabel={periodLabel}
      year={year}
      periodControls={controls}
      heroMetrics={[
        { value: '1', label: 'prioridade central' },
        { value: '4–5', label: 'semanas organizadas' },
        { value: '100%', label: 'capacidade visível' },
      ]}
      defaultValues={applyMonthlyDefaults}
    />
  );
}

function applyMonthlyDefaults(data, context) {
  const [, monthPart] = String(context.periodKey).split('-');
  const month = Number(monthPart) || 1;
  const quarter = Math.floor((month - 1) / 3) + 1;
  data.fields.company_name = context.clientName;
  data.fields.month_reference = context.periodLabel;
  data.fields.cycle_reference = `Ciclo ${quarter} · ${context.year}`;
  data.fields.cover_note = 'Prioridades claras, capacidade protegida e execução acompanhada.';
}
