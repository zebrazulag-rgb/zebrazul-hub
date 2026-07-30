import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import PlanningDocumentEditor from '../components/PlanningDocumentEditor.jsx';
import api from '../api.js';
import { buildMonthlyFromCycle } from '../planningStageChain.js';
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
      previousStage={MONTHLY_PREVIOUS_STAGE}
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


const MONTHLY_PREVIOUS_STAGE = {
  sourceType: 'cycle_90',
  sourceLabel: 'Ciclo Estratégico de 90 Dias',
  async loadSource(context) {
    const [, monthPart] = String(context.periodKey).split('-');
    const month = Number(monthPart) || 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const cyclePeriodKey = `${context.year}-Q${quarter}`;
    const cyclePeriodLabel = `Ciclo ${quarter} · ${context.year}`;
    const { data } = await api.get('/planning-documents', {
      params: { client_id: context.clientId, type: 'cycle_90', period_key: cyclePeriodKey },
    });
    const record = data.document || null;
    if (!hasPlanningContent(record?.data)) return null;
    return {
      data: record.data,
      updatedAt: record.updated_at || null,
      periodKey: cyclePeriodKey,
      periodLabel: cyclePeriodLabel,
      context: {
        month,
        monthInQuarter: (month - 1) % 3,
        cyclePeriodKey,
        cyclePeriodLabel,
      },
    };
  },
  buildData(current, source, context, mode) {
    return buildMonthlyFromCycle(current, source, context, mode);
  },
};

function hasPlanningContent(data) {
  if (!data || typeof data !== 'object') return false;
  const fieldContent = Object.values(data.fields || {}).some((value) => String(value || '').trim());
  const tableContent = Object.values(data.tables || {}).some((rows) =>
    Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.some((value) => String(value || '').trim()))
  );
  return fieldContent || tableContent;
}
