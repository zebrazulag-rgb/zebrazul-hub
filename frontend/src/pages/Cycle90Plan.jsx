import { useMemo, useState } from 'react';
import { CalendarRange, TimerReset } from 'lucide-react';
import PlanningDocumentEditor from '../components/PlanningDocumentEditor.jsx';
import {
  createCycle90Data,
  cycle90CoverFields,
  cycle90Progress,
  cycle90Sections,
  mergeCycle90Data,
} from '../cycle90Config.js';

const QUARTERS = [
  { value: 1, label: 'Ciclo 1 · Jan–Mar' },
  { value: 2, label: 'Ciclo 2 · Abr–Jun' },
  { value: 3, label: 'Ciclo 3 · Jul–Set' },
  { value: 4, label: 'Ciclo 4 · Out–Dez' },
];

export default function Cycle90Plan() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const periodKey = `${year}-Q${quarter}`;
  const quarterInfo = QUARTERS.find((item) => item.value === quarter) || QUARTERS[0];
  const periodLabel = `${quarterInfo.label} · ${year}`;

  const controls = useMemo(() => (
    <>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
        <CalendarRange size={16} />
        <select className="bg-transparent font-semibold text-white outline-none" value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>
          {QUARTERS.map((item) => <option className="text-slate-800" key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
        <span className="text-white/50">Ano</span>
        <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))} />
      </label>
    </>
  ), [quarter, year]);

  return (
    <PlanningDocumentEditor
      documentType="cycle_90"
      title="Ciclo Estratégico de 90 Dias"
      description="Converta a direção anual em um ciclo executável, com foco, prioridades, projetos, responsáveis, capacidade e indicadores organizados ao longo de 13 semanas."
      Icon={TimerReset}
      coverTitle="Identificação do ciclo"
      coverDescription="Dados gerais para conectar o ciclo ao Plano de Ação Anual."
      coverFields={cycle90CoverFields}
      sections={cycle90Sections}
      createData={createCycle90Data}
      mergeData={mergeCycle90Data}
      getProgress={cycle90Progress}
      periodKey={periodKey}
      periodLabel={periodLabel}
      year={year}
      periodControls={controls}
      heroMetrics={[
        { value: '90', label: 'dias de execução' },
        { value: '13', label: 'semanas organizadas' },
        { value: '3', label: 'prioridades centrais' },
      ]}
      defaultValues={applyCycleDefaults}
    />
  );
}

function applyCycleDefaults(data, context) {
  const quarter = Number(String(context.periodKey).split('Q')[1]) || 1;
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(context.year, startMonth, 1);
  const endDate = new Date(context.year, startMonth + 3, 0);
  data.fields.company_name = context.clientName;
  data.fields.cycle_name = `Ciclo ${quarter} — ${quarterTheme(quarter)}`;
  data.fields.cycle_start = toDateInput(startDate);
  data.fields.cycle_end = toDateInput(endDate);
  data.fields.cover_note = 'Foco, execução e aprendizado conectados ao objetivo anual.';
}

function quarterTheme(quarter) {
  if (quarter === 1) return 'Fundamento e Organização';
  if (quarter === 2) return 'Ativação e Crescimento';
  if (quarter === 3) return 'Conversão e Consolidação';
  return 'Fechamento e Preparação';
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
