import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  HeartPulse,
  History,
  Import,
  ListFilter,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { isBeeClient } from '../utils/beeClientAccess.js';

const CAMPAIGN_YEAR = 2027;
const FINAL_STAGES = new Set(['concluded', 'not_renewed']);

const RISK_META = {
  unclassified: { label: 'A classificar', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  promoter: { label: 'Promotora', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  neutral: { label: 'Neutra', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  undecided: { label: 'Indecisa', badge: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  high_risk: { label: 'Alto risco', badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

const INTENTION_OPTIONS = [
  ['', 'Não definida'],
  ['positive', 'Positiva'],
  ['undecided', 'Indecisa'],
  ['researching', 'Pesquisando alternativas'],
  ['negative', 'Tendência de saída'],
  ['leaving', 'Saída declarada'],
];

const OBJECTION_MATRIX = [
  { key: 'monthly_fee', label: 'Mensalidade / reajuste', diagnosis: 'Dificuldade real ou valor pouco percebido?', owner: 'Financeiro / comercial', response: 'Explicar proposta, reajuste e opções oficiais; nunca oferecer desconto automático.', next: 'Simulação ou decisão' },
  { key: 'pedagogical', label: 'Questão pedagógica', diagnosis: 'Qual fato, expectativa e impacto?', owner: 'Coordenação', response: 'Apresentar evidências, plano e acompanhamento com prazo.', next: 'Reunião pedagógica' },
  { key: 'adaptation', label: 'Adaptação / comportamento', diagnosis: 'Quando ocorre e o que já foi tentado?', owner: 'Pedagógico', response: 'Plano individual de acolhimento e acompanhamento.', next: 'Plano documentado' },
  { key: 'communication', label: 'Comunicação / atendimento', diagnosis: 'Onde houve ruptura de confiança?', owner: 'Direção da unidade', response: 'Reconhecer, corrigir e estabelecer novo acordo de comunicação.', next: 'Retorno com prazo' },
  { key: 'logistics', label: 'Logística / turno', diagnosis: 'Endereço, rota ou horário?', owner: 'Secretaria / unidade', response: 'Verificar unidade, turno e alternativas existentes.', next: 'Proposta viável' },
  { key: 'competitor', label: 'Concorrente', diagnosis: 'Qual escola e qual critério?', owner: 'Comercial / direção', response: 'Retomar critérios e diferenciais, sem atacar concorrentes.', next: 'Data da decisão' },
  { key: 'city_change', label: 'Mudança de cidade', diagnosis: 'Decisão definitiva e prazo?', owner: 'Secretaria', response: 'Apoiar transição e preservar vínculo.', next: 'Documentação' },
  { key: 'scholarship', label: 'Bolsa / desconto', diagnosis: 'Elegibilidade e capacidade financeira?', owner: 'Comitê autorizado', response: 'Aplicar critérios objetivos e registrar decisão.', next: 'Aprovar ou negar' },
];

const EROSION_SIGNALS = [
  ['pedagogical', 'Pedagógico', 'Aprendizagem, adaptação ou expectativa desalinhada'],
  ['relationship', 'Relacionamento', 'Reclamação, demora de resposta ou confiança fragilizada'],
  ['financial', 'Financeiro', 'Inadimplência, pedido de condição ou pressão de orçamento'],
  ['logistics', 'Logística', 'Mudança de endereço, transporte, turno ou horário'],
  ['competition', 'Concorrência', 'Pesquisa ativa, visita a outra escola ou pedido de documentos'],
  ['capacity', 'Estrutural', 'Vaga, turma, turno ou unidade sem capacidade adequada'],
];

const SCRIPTS = [
  {
    title: 'Pesquisa de intenção',
    text: 'Olá, [nome]! Estamos preparando o próximo ciclo da Bee e queremos ouvir sua família. Como vocês avaliam a experiência de [aluno] neste ano? Há algum ponto que desejam conversar conosco antes da rematrícula?',
    objective: 'Ouvir antes de vender e revelar riscos antecipadamente.',
  },
  {
    title: 'Abertura da rematrícula',
    text: 'Olá, [nome]! É uma alegria acompanhar o crescimento de [aluno]. A rematrícula para [ano/turma] está aberta, e preparamos as orientações da continuidade para 2027. Posso enviar as informações e acompanhar você em cada etapa?',
    objective: 'Personalizar e pedir permissão para avançar.',
  },
  {
    title: 'Confirmação de recebimento',
    text: 'Conseguiu receber e visualizar as informações da rematrícula de [aluno]? Quero garantir que tudo esteja claro. Existe alguma dúvida ou ponto que sua família precisa avaliar antes de confirmar?',
    objective: 'Trazer a objeção real para a conversa.',
  },
  {
    title: 'Família indecisa',
    text: 'Obrigado por compartilhar esse ponto, [nome]. Para cuidarmos disso de forma responsável, gostaria de organizar uma conversa com [responsável adequado]. Tenho [opção 1] e [opção 2]. Qual horário funciona melhor?',
    objective: 'Não discutir por mensagem um tema que exige profundidade.',
  },
  {
    title: 'Prazo próximo',
    text: 'Olá, [nome]. Passando para lembrar que o prazo de prioridade da vaga de [aluno] termina em [data]. Antes disso, quero confirmar se ficou alguma dúvida ou pendência em que possamos ajudar.',
    objective: 'Usar prazo real sem criar pressão artificial.',
  },
  {
    title: 'Rematrícula confirmada',
    text: 'Rematrícula de [aluno] confirmada! Ficamos felizes em continuar essa jornada com sua família. Em breve, enviaremos o checklist e as orientações para o próximo ciclo. Conte conosco.',
    objective: 'Reforçar segurança e preparar a continuidade.',
  },
  {
    title: 'Saída confirmada',
    text: 'Agradecemos pela confiança durante o período em que [aluno] esteve conosco. Para aprendermos e encerrarmos esse ciclo com cuidado, podemos registrar o principal motivo da decisão e apoiar vocês nos próximos passos?',
    objective: 'Preservar relação, aprender e organizar documentação.',
  },
  {
    title: 'Indicação',
    text: 'Sua confiança na Bee é muito importante. Se conhecer uma família que também busca uma educação cristã, clássica e bilíngue, ficaremos felizes em recebê-la. Posso enviar uma apresentação curta para você compartilhar?',
    objective: 'Ativar indicação apenas após confirmação e satisfação.',
  },
];

const EMPTY_FAMILY = {
  family_name: '',
  responsible_name: '',
  phone: '',
  email: '',
  unit: '',
  current_class: '',
  future_class: '',
  student_names: [],
  students_count: 1,
  financial_profile: 'paying',
  scholarship_percent: 0,
  monthly_value: 0,
  financial_notes: '',
  pendencies: '',
  stage_key: 'base_validated',
  intention: '',
  objection_type: '',
  objection_notes: '',
  signals: [],
  score_experience: null,
  score_intention: null,
  score_financial: null,
  score_behavior: null,
  risk_score: null,
  risk_band: 'unclassified',
  owner_user_id: '',
  next_action: '',
  next_action_date: '',
  decision_deadline: '',
  proposal_amount: 0,
  proposal_sent_at: '',
  last_contact_at: '',
  exit_reason: '',
  exit_destination: '',
  vacancy_confirmed: false,
  financial_clearance: false,
  policy_clearance: false,
  contract_confirmed: false,
  documents_confirmed: false,
  finance_confirmed: false,
  notes: '',
};

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatPercent(value, digits = 1) {
  return `${cleanNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(cleanNumber(value));
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function riskFromForm(form) {
  const values = [form.score_experience, form.score_intention, form.score_financial, form.score_behavior];
  if (values.some((value) => value === '' || value == null || !Number.isFinite(Number(value)))) {
    return { score: null, band: 'unclassified' };
  }
  const score = values.reduce((sum, value) => sum + Number(value), 0);
  if (score <= 2) return { score, band: 'promoter' };
  if (score <= 4) return { score, band: 'neutral' };
  if (score <= 6) return { score, band: 'undecided' };
  return { score, band: 'high_risk' };
}

function normalizeFamilyForForm(family) {
  if (!family) return { ...EMPTY_FAMILY, student_names: [], signals: [] };
  return {
    ...EMPTY_FAMILY,
    ...family,
    student_names: Array.isArray(family.student_names) ? family.student_names : [],
    signals: Array.isArray(family.signals) ? family.signals : [],
    owner_user_id: family.owner_user_id || '',
    next_action_date: family.next_action_date ? String(family.next_action_date).slice(0, 10) : '',
    decision_deadline: family.decision_deadline ? String(family.decision_deadline).slice(0, 10) : '',
    proposal_sent_at: family.proposal_sent_at ? String(family.proposal_sent_at).slice(0, 16) : '',
    last_contact_at: family.last_contact_at ? String(family.last_contact_at).slice(0, 16) : '',
  };
}

function stageIndex(stages, key) {
  return Math.max(0, stages.findIndex((stage) => stage.key === key));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(family) {
  return !FINAL_STAGES.has(family.stage_key) && family.next_action_date && String(family.next_action_date).slice(0, 10) < todayIso();
}

function safeText(value) {
  return String(value ?? '').trim();
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_ALIASES = {
  familia: 'family_name', family: 'family_name', family_name: 'family_name', nome_da_familia: 'family_name',
  responsavel: 'responsible_name', responsible_name: 'responsible_name', nome_do_responsavel: 'responsible_name',
  telefone: 'phone', celular: 'phone', whatsapp: 'phone', phone: 'phone',
  email: 'email', e_mail: 'email',
  unidade: 'unit', unit: 'unit',
  turma_atual: 'current_class', current_class: 'current_class',
  turma_futura: 'future_class', turma_2027: 'future_class', future_class: 'future_class',
  aluno: 'student_names', alunos: 'student_names', student: 'student_names', student_names: 'student_names', nome_do_aluno: 'student_names',
  qtd_alunos: 'students_count', quantidade_alunos: 'students_count', students_count: 'students_count',
  perfil_financeiro: 'financial_profile', financial_profile: 'financial_profile',
  bolsa: 'scholarship_percent', percentual_bolsa: 'scholarship_percent', scholarship_percent: 'scholarship_percent',
  mensalidade: 'monthly_value', valor_mensal: 'monthly_value', monthly_value: 'monthly_value',
  pendencias: 'pendencies', pendencia: 'pendencies',
  observacoes: 'notes', observacao: 'notes', notes: 'notes',
};

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const first = lines[0];
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rawHeaders = parseCsvLine(first, delimiter);
  const headers = rawHeaders.map((header) => HEADER_ALIASES[normalizeHeader(header)] || normalizeHeader(header));
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = values[index] ?? '';
    });
    if (row.student_names) row.student_names = String(row.student_names).split(/[|;]+/).map((name) => name.trim()).filter(Boolean);
    if (row.students_count) row.students_count = cleanNumber(String(row.students_count).replace(',', '.'), 1);
    if (row.scholarship_percent) row.scholarship_percent = cleanNumber(String(row.scholarship_percent).replace('%', '').replace(',', '.'), 0);
    if (row.monthly_value) row.monthly_value = cleanNumber(String(row.monthly_value).replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'), 0);
    return row;
  }).filter((row) => safeText(row.family_name));
}

function downloadCsvTemplate() {
  const content = [
    'familia;responsavel;telefone;email;unidade;turma_atual;turma_futura;alunos;qtd_alunos;perfil_financeiro;percentual_bolsa;mensalidade;pendencias;observacoes',
    'Família Exemplo;Maria Silva;(84) 99999-9999;maria@email.com;Natal;4º Ano;5º Ano;Ana Silva;1;paying;0;1400;;',
  ].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-rematriculas-bee-2027.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'yellow' }) {
  const toneClass = {
    yellow: 'bg-[#FFF7DD] text-[#9B6D00]',
    green: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone] || 'bg-[#FFF7DD] text-[#9B6D00]';

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}><Icon size={19} /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-3 min-h-8 text-[11px] font-medium leading-4 text-slate-400">{helper}</p>
    </div>
  );
}

function RiskBadge({ band, score }) {
  const meta = RISK_META[band] || RISK_META.unclassified;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}{score != null ? ` · ${score}` : ''}
    </span>
  );
}

function StagePill({ stage }) {
  return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-600">{stage?.name || 'Etapa'}</span>;
}

function EmptyState({ icon: Icon = Users, title, description, action }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF7DD] text-[#A67506]"><Icon size={21} /></span>
      <h3 className="mt-4 text-base font-extrabold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function FamilyCard({ family, stage, onOpen, onDragStart }) {
  const studentLabel = family.student_names?.length
    ? family.student_names.join(', ')
    : `${family.students_count || 1} aluno${Number(family.students_count || 1) > 1 ? 's' : ''}`;
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, family)}
      onClick={() => onOpen(family)}
      className="group w-full cursor-grab rounded-2xl border border-white bg-white p-3.5 text-left shadow-[0_5px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_10px_26px_rgba(15,23,42,0.09)] active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-900">{family.family_name}</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{studentLabel}</p>
        </div>
        <MoreHorizontal size={16} className="shrink-0 text-slate-300 transition group-hover:text-slate-500" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <RiskBadge band={family.risk_band} score={family.risk_score} />
        {family.unit ? <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">{family.unit}</span> : null}
      </div>
      {family.next_action ? (
        <div className={`mt-3 rounded-xl px-3 py-2 ${isOverdue(family) ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-1.5">
            <CalendarClock size={12} className={isOverdue(family) ? 'text-rose-500' : 'text-slate-400'} />
            <p className={`truncate text-[10px] font-extrabold ${isOverdue(family) ? 'text-rose-600' : 'text-slate-500'}`}>{family.next_action}</p>
          </div>
          <p className={`mt-1 text-[10px] font-medium ${isOverdue(family) ? 'text-rose-400' : 'text-slate-400'}`}>{formatDate(family.next_action_date)}</p>
        </div>
      ) : (
        !FINAL_STAGES.has(family.stage_key) ? <p className="mt-3 text-[10px] font-bold text-amber-600">Sem próxima ação</p> : null
      )}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 min-w-0">
          {family.owner_avatar ? (
            <img src={family.owner_avatar} alt="" className="h-6 w-6 rounded-lg object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-black text-white" style={{ backgroundColor: family.owner_color || '#1C1C1C' }}>
              {(family.owner_name || '?')[0]?.toUpperCase()}
            </span>
          )}
          <span className="truncate text-[10px] font-semibold text-slate-400">{family.owner_name || 'Sem responsável'}</span>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-slate-300">{family.activity_count || 0} reg.</span>
      </div>
    </button>
  );
}

function DashboardView({ context, onOpenFamily, onOpenCrm }) {
  const { dashboard, stages, families } = context;
  const stageMap = Object.fromEntries(stages.map((stage) => [stage.key, stage]));
  const alerts = useMemo(() => {
    const next = [];
    families.filter((family) => family.risk_band === 'high_risk' && !FINAL_STAGES.has(family.stage_key)).slice(0, 4).forEach((family) => next.push({ tone: 'rose', family, text: 'Família em alto risco exige intervenção.' }));
    families.filter(isOverdue).slice(0, Math.max(0, 6 - next.length)).forEach((family) => next.push({ tone: 'amber', family, text: `Próxima ação vencida em ${formatDate(family.next_action_date)}.` }));
    families.filter((family) => family.risk_band === 'unclassified').slice(0, Math.max(0, 6 - next.length)).forEach((family) => next.push({ tone: 'slate', family, text: 'Score de saúde ainda não classificado.' }));
    return next;
  }, [families]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label="Base atual" value={dashboard.base_students} helper={`${dashboard.families} famílias no CRM`} />
        <MetricCard icon={BadgeCheck} label="Concluídas" value={dashboard.concluded_students} helper={`${dashboard.concluded_families} famílias formalizadas`} tone="green" />
        <MetricCard icon={Target} label="Progresso da meta" value={formatPercent(dashboard.target_progress)} helper={`${dashboard.concluded_students} de ${dashboard.target_students} alunos necessários para ${formatPercent(dashboard.target_rate, 0)}`} tone="blue" />
        <MetricCard icon={ShieldAlert} label="Alto risco" value={dashboard.high_risk_families} helper="Famílias abertas com score entre 7 e 10" tone="rose" />
        <MetricCard icon={WalletCards} label="Receita protegida" value={formatCurrency(dashboard.protected_revenue)} helper="Valor mensal das rematrículas concluídas" tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Funil de rematrícula</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Do dado validado à formalização</h3>
            </div>
            <button type="button" onClick={onOpenCrm} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
              Abrir CRM <ArrowRight size={14} />
            </button>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-3">
            {stages.map((stage, index) => {
              const stat = dashboard.stage_counts?.[stage.key] || { families: 0, students: 0 };
              return (
                <div key={stage.key} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-black text-[#A67506]">{String(index + 1).padStart(2, '0')}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">{stat.families}</span>
                  </div>
                  <p className="mt-2 text-xs font-extrabold text-slate-800">{stage.name}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{stage.description}</p>
                  <p className="mt-3 text-[10px] font-bold text-slate-500">{stat.students} aluno{stat.students === 1 ? '' : 's'}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Saúde da base</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Risco e intenção</h3>
            </div>
            <HeartPulse size={20} className="text-[#EBAE20]" />
          </div>
          <div className="mt-5 space-y-3">
            {Object.entries(RISK_META).map(([key, meta]) => {
              const count = Number(dashboard.risk_counts?.[key] || 0);
              const pct = dashboard.families ? (count / dashboard.families) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 font-bold text-slate-600"><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span>
                    <span className="font-black text-slate-800">{count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#EBAE20]" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 rounded-2xl bg-[#FFF7DD] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#765406]">Famílias classificadas</span>
              <strong className="text-sm text-[#765406]">{formatPercent(dashboard.classified_rate)}</strong>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-[#9B7420]">Meta operacional: 100% com status, risco, responsável e próxima ação.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Sala de rematrícula</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">O que exige atenção agora</h3>
            </div>
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <div className="mt-4 space-y-2.5">
            {alerts.length ? alerts.map(({ family, text, tone }, index) => (
              <button key={`${family.id}-${index}`} type="button" onClick={() => onOpenFamily(family)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 px-3.5 py-3 text-left transition hover:bg-slate-50">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === 'rose' ? 'bg-rose-50 text-rose-500' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}><AlertTriangle size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold text-slate-800">{family.family_name}</p>
                  <p className="mt-1 truncate text-[10px] font-medium text-slate-400">{text}</p>
                </div>
                <StagePill stage={stageMap[family.stage_key]} />
              </button>
            )) : (
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">Nenhum alerta crítico na base agora.</div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Unidades</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Retenção por unidade</h3>
            </div>
            <Building2 size={20} className="text-[#EBAE20]" />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
            {dashboard.units?.length ? dashboard.units.map((unit, index) => (
              <div key={unit.unit} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 ${index ? 'border-t border-slate-100' : ''}`}>
                <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-800">{unit.unit}</p><p className="mt-0.5 text-[10px] text-slate-400">{unit.students} alunos</p></div>
                <div className="text-right"><p className="text-xs font-black text-slate-800">{unit.concluded_students}</p><p className="text-[9px] uppercase text-slate-400">confirmados</p></div>
                <div className="min-w-[58px] text-right"><p className="text-xs font-black text-[#A67506]">{formatPercent(unit.retention_rate)}</p><p className="text-[9px] uppercase text-slate-400">retidos</p></div>
              </div>
            )) : <p className="px-4 py-8 text-center text-xs font-medium text-slate-400">Cadastre a unidade das famílias para acompanhar Natal e Parnamirim.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CrmView({ context, onOpenFamily, onNewFamily, onImport, onStageChange, movingFamilyId, notify }) {
  const { stages, families } = context;
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [tableView, setTableView] = useState(false);
  const units = useMemo(() => [...new Set(families.map((family) => family.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [families]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return families.filter((family) => {
      if (riskFilter !== 'all' && family.risk_band !== riskFilter) return false;
      if (unitFilter !== 'all' && family.unit !== unitFilter) return false;
      if (stageFilter !== 'all' && family.stage_key !== stageFilter) return false;
      if (!query) return true;
      return [family.family_name, family.responsible_name, family.phone, family.email, family.unit, family.current_class, family.future_class, ...(family.student_names || [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query));
    });
  }, [families, search, riskFilter, unitFilter, stageFilter]);

  function dragStart(event, family) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(family.id));
  }

  async function dropOnStage(event, stageKey) {
    event.preventDefault();
    const familyId = Number(event.dataTransfer.getData('text/plain'));
    if (!familyId) return;
    const family = families.find((item) => Number(item.id) === familyId);
    if (!family || family.stage_key === stageKey) return;
    const result = await onStageChange(family, stageKey);
    if (result?.error) notify(result.error, 'error');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar família, aluno, responsável..." className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#EBAE20] focus:bg-white" />
          </div>
          <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 outline-none">
            <option value="all">Todas as unidades</option>
            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 outline-none">
            <option value="all">Todos os riscos</option>
            {Object.entries(RISK_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 outline-none">
            <option value="all">Todas as etapas</option>
            {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.name}</option>)}
          </select>
          <button type="button" onClick={() => setTableView((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><ListFilter size={15} />{tableView ? 'Kanban' : 'Tabela'}</button>
          <button type="button" onClick={onImport} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><Import size={15} />Importar</button>
          <button type="button" onClick={onNewFamily} className="inline-flex items-center gap-2 rounded-xl bg-[#1C1C1C] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-black"><Plus size={16} />Nova rematrícula</button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-semibold text-slate-400">
          <span>{filtered.length} de {families.length} famílias visíveis</span>
          <span>Arraste os cards entre etapas. Regras de formalização são validadas pelo sistema.</span>
        </div>
      </div>

      {tableView ? (
        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-[#1C1C1C] text-white"><tr>
                {['Família / aluno', 'Unidade', 'Etapa', 'Risco', 'Responsável', 'Próxima ação', 'Prazo'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em]">{label}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((family) => {
                  const stage = stages.find((item) => item.key === family.stage_key);
                  return (
                    <tr key={family.id} onClick={() => onOpenFamily(family)} className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-3"><p className="text-xs font-extrabold text-slate-800">{family.family_name}</p><p className="mt-1 text-[10px] text-slate-400">{family.student_names?.join(', ') || `${family.students_count} aluno(s)`}</p></td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">{family.unit || '—'}</td>
                      <td className="px-4 py-3"><StagePill stage={stage} /></td>
                      <td className="px-4 py-3"><RiskBadge band={family.risk_band} score={family.risk_score} /></td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">{family.owner_name || '—'}</td>
                      <td className="max-w-[220px] px-4 py-3"><p className={`truncate text-xs font-semibold ${isOverdue(family) ? 'text-rose-600' : 'text-slate-500'}`}>{family.next_action || 'Sem próxima ação'}</p></td>
                      <td className={`px-4 py-3 text-xs font-bold ${isOverdue(family) ? 'text-rose-600' : 'text-slate-400'}`}>{family.next_action_date ? formatDate(family.next_action_date) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length ? <div className="p-6"><EmptyState icon={Filter} title="Nenhuma família encontrada" description="Ajuste os filtros ou cadastre uma nova rematrícula." /></div> : null}
        </div>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3">
            {stages.map((stage, index) => {
              const stageFamilies = filtered.filter((family) => family.stage_key === stage.key);
              return (
                <div
                  key={stage.key}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(event) => dropOnStage(event, stage.key)}
                  className="w-[288px] shrink-0 rounded-[22px] bg-[#ECEFF3] p-3"
                >
                  <div className="mb-3 flex items-start justify-between gap-2 px-1">
                    <div><p className="text-[10px] font-black text-[#A67506]">{String(index + 1).padStart(2, '0')}</p><p className="mt-0.5 text-xs font-black text-slate-800">{stage.name}</p><p className="mt-1 max-w-[220px] text-[9px] leading-3.5 text-slate-400">{stage.description}</p></div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow-sm">{stageFamilies.length}</span>
                  </div>
                  <div className="space-y-2.5 min-h-[160px]">
                    {stageFamilies.map((family) => (
                      <div key={family.id} className={movingFamilyId === family.id ? 'opacity-50' : ''}>
                        <FamilyCard family={family} stage={stage} onOpen={onOpenFamily} onDragStart={dragStart} />
                      </div>
                    ))}
                    {!stageFamilies.length ? <div className="flex min-h-[110px] items-center justify-center rounded-2xl border border-dashed border-slate-300/80 px-4 text-center text-[10px] font-semibold leading-4 text-slate-400">Arraste uma família para esta etapa</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaybookView({ notify }) {
  const [search, setSearch] = useState('');
  const objectionRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return OBJECTION_MATRIX;
    return OBJECTION_MATRIX.filter((item) => Object.values(item).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query)));
  }, [search]);

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copiado.`, 'success');
    } catch {
      notify('Não foi possível copiar automaticamente.', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Comunicação</p><h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Scripts operacionais da campanha</h3><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Use como ponto de partida e personalize com o contexto real de cada família.</p></div>
          <MessageCircle size={22} className="text-[#EBAE20]" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {SCRIPTS.map((script) => (
            <div key={script.title} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-extrabold text-slate-800">{script.title}</h4><button type="button" onClick={() => copyText(script.text, script.title)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm transition hover:text-[#A67506]" title="Copiar"><Copy size={14} /></button></div>
              <p className="mt-3 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">{script.text}</p>
              <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-400"><strong className="text-slate-500">Objetivo:</strong> {script.objective}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#A67506]">Matriz de objeções</p><h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Resolver a causa, não apenas responder a frase</h3></div>
          <div className="relative w-full max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar objeção..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#EBAE20]" /></div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-[#1C1C1C] text-white"><tr>{['Objeção', 'Diagnóstico', 'Responsável', 'Resposta estratégica', 'Próximo passo'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em]">{label}</th>)}</tr></thead>
            <tbody>{objectionRows.map((row) => <tr key={row.key} className="border-t border-slate-100"><td className="px-4 py-3 text-xs font-extrabold text-slate-800">{row.label}</td><td className="px-4 py-3 text-xs text-slate-500">{row.diagnosis}</td><td className="px-4 py-3 text-xs font-semibold text-slate-600">{row.owner}</td><td className="px-4 py-3 text-xs leading-5 text-slate-500">{row.response}</td><td className="px-4 py-3 text-xs font-bold text-[#A67506]">{row.next}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[24px] bg-[#1C1C1C] p-5 text-white shadow-[0_12px_35px_rgba(15,23,42,0.12)]">
        <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EBAE20] text-[#1C1C1C]"><ShieldAlert size={20} /></span><div><h3 className="text-sm font-black">Cuidado com o score e os registros</h3><p className="mt-2 max-w-4xl text-xs leading-5 text-white/60">O score é ferramenta interna de priorização, não um rótulo sobre a família. Registre somente informações necessárias, objetivas e relacionadas à relação escolar.</p></div></div>
      </div>
    </div>
  );
}

function ScoreSelect({ label, value, max, onChange, helper }) {
  return (
    <div>
      <label className="text-[11px] font-extrabold text-slate-600">{label}</label>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={() => onChange(null)} className={`flex h-8 min-w-8 items-center justify-center rounded-lg border text-[10px] font-black transition ${value == null || value === '' ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-slate-200 bg-white text-slate-400'}`}>—</button>
        {Array.from({ length: max + 1 }, (_, index) => (
          <button key={index} type="button" onClick={() => onChange(index)} className={`flex h-8 min-w-8 items-center justify-center rounded-lg border text-[10px] font-black transition ${Number(value) === index ? 'border-[#EBAE20] bg-[#FFF7DD] text-[#8A6100]' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{index}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-3.5 text-slate-400">{helper}</p>
    </div>
  );
}

function Field({ label, children, helper, required = false }) {
  return <div><label className="mb-1.5 block text-[11px] font-extrabold text-slate-600">{label}{required ? ' *' : ''}</label>{children}{helper ? <p className="mt-1.5 text-[9px] leading-3.5 text-slate-400">{helper}</p> : null}</div>;
}

function Toggle({ checked, onChange, label, helper }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent'}`}><Check size={13} /></span>
      <span><span className={`block text-[11px] font-extrabold ${checked ? 'text-emerald-700' : 'text-slate-600'}`}>{label}</span>{helper ? <span className="mt-1 block text-[9px] leading-3.5 text-slate-400">{helper}</span> : null}</span>
    </button>
  );
}

function FamilyDrawer({ open, family, context, onClose, onSaved, notify }) {
  const isNew = !family?.id;
  const [form, setForm] = useState(() => normalizeFamilyForForm(family));
  const [section, setSection] = useState('data');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityType, setActivityType] = useState('whatsapp');
  const [activityText, setActivityText] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(normalizeFamilyForForm(family));
    setSection('data');
    setActivities([]);
    setActivityText('');
  }, [open, family?.id]);

  const risk = useMemo(() => riskFromForm(form), [form.score_experience, form.score_intention, form.score_financial, form.score_behavior]);
  const selectedObjection = OBJECTION_MATRIX.find((item) => item.key === form.objection_type);

  const loadActivities = useCallback(async () => {
    if (!family?.id) return;
    setLoadingActivities(true);
    try {
      const { data } = await api.get(`/reenrollments/families/${family.id}/activities`, { params: { client_id: context.client.id, year: CAMPAIGN_YEAR } });
      setActivities(data.activities || []);
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível carregar o histórico.', 'error');
    } finally {
      setLoadingActivities(false);
    }
  }, [family?.id, context?.client?.id, notify]);

  useEffect(() => {
    if (open && section === 'history' && family?.id) loadActivities();
  }, [open, section, family?.id, loadActivities]);

  if (!open) return null;

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleSignal(key) {
    setForm((current) => ({
      ...current,
      signals: current.signals.includes(key) ? current.signals.filter((item) => item !== key) : [...current.signals, key],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: context.client.id,
        year: CAMPAIGN_YEAR,
        risk_score: risk.score,
        risk_band: risk.band,
      };
      if (isNew) await api.post('/reenrollments/families', payload);
      else await api.put(`/reenrollments/families/${family.id}`, payload);
      notify(isNew ? 'Rematrícula criada no CRM.' : 'Dados da rematrícula atualizados.', 'success');
      await onSaved();
      onClose();
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível salvar a rematrícula.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!family?.id || !window.confirm(`Excluir definitivamente “${family.family_name}”?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/reenrollments/families/${family.id}`, { params: { client_id: context.client.id, year: CAMPAIGN_YEAR } });
      notify('Registro removido.', 'success');
      await onSaved();
      onClose();
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível excluir.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function addActivity() {
    if (!activityText.trim() || !family?.id) return;
    setSavingActivity(true);
    try {
      await api.post(`/reenrollments/families/${family.id}/activities`, {
        client_id: context.client.id,
        year: CAMPAIGN_YEAR,
        activity_type: activityType,
        description: activityText,
      });
      setActivityText('');
      await loadActivities();
      await onSaved({ silent: true });
      notify('Contato registrado.', 'success');
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível registrar o contato.', 'error');
    } finally {
      setSavingActivity(false);
    }
  }

  const tabs = [
    ['data', 'Família'],
    ['health', 'Saúde & risco'],
    ['decision', 'Decisão'],
    ['formalization', 'Formalização'],
    ['history', 'Histórico'],
  ];

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-[760px] flex-col bg-[#F7F8FA] shadow-[-24px_0_80px_rgba(15,23,42,0.2)]">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#FFF4CE] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#8A6100]">Bee · {CAMPAIGN_YEAR}</span>{!isNew ? <RiskBadge band={risk.band} score={risk.score} /> : null}</div>
              <h2 className="mt-2 truncate text-xl font-black tracking-tight text-slate-950">{isNew ? 'Nova rematrícula' : form.family_name || 'Rematrícula'}</h2>
              <p className="mt-1 text-xs text-slate-400">{isNew ? 'Crie o registro da família e inicie o acompanhamento.' : `${form.student_names?.length || form.students_count || 1} aluno(s) · ${form.unit || 'unidade não informada'}`}</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50"><X size={17} /></button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setSection(key)} disabled={isNew && key === 'history'} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-extrabold transition ${section === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'} disabled:cursor-not-allowed disabled:opacity-35`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {section === 'data' ? (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Identificação</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Família" required><input value={form.family_name} onChange={(event) => setField('family_name', event.target.value)} className="input-field" placeholder="Ex.: Família Silva" /></Field>
                  <Field label="Responsável principal"><input value={form.responsible_name || ''} onChange={(event) => setField('responsible_name', event.target.value)} className="input-field" placeholder="Nome do responsável" /></Field>
                  <Field label="WhatsApp"><input value={form.phone || ''} onChange={(event) => setField('phone', event.target.value)} className="input-field" placeholder="(84) 99999-9999" /></Field>
                  <Field label="E-mail"><input value={form.email || ''} onChange={(event) => setField('email', event.target.value)} className="input-field" placeholder="familia@email.com" /></Field>
                  <Field label="Unidade"><select value={form.unit || ''} onChange={(event) => setField('unit', event.target.value)} className="input-field"><option value="">Selecione</option><option>Natal</option><option>Parnamirim</option><option>Bee Light</option><option>Bee Christian School</option></select></Field>
                  <Field label="Responsável pelo caso"><select value={form.owner_user_id || ''} onChange={(event) => setField('owner_user_id', event.target.value)} className="input-field"><option value="">Sem responsável</option>{context.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Alunos e continuidade</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome(s) do(s) aluno(s)" helper="Separe irmãos com ponto e vírgula."><input value={(form.student_names || []).join('; ')} onChange={(event) => setField('student_names', event.target.value.split(';').map((item) => item.trim()).filter(Boolean))} className="input-field" placeholder="Ana Silva; João Silva" /></Field>
                  <Field label="Quantidade de alunos"><input type="number" min="1" max="20" value={form.students_count || 1} onChange={(event) => setField('students_count', event.target.value)} className="input-field" /></Field>
                  <Field label="Turma atual"><input value={form.current_class || ''} onChange={(event) => setField('current_class', event.target.value)} className="input-field" placeholder="Ex.: 4º Ano" /></Field>
                  <Field label="Turma futura"><input value={form.future_class || ''} onChange={(event) => setField('future_class', event.target.value)} className="input-field" placeholder="Ex.: 5º Ano" /></Field>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Financeiro</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Perfil"><select value={form.financial_profile || 'paying'} onChange={(event) => setField('financial_profile', event.target.value)} className="input-field"><option value="paying">Pagante</option><option value="partial_scholarship">Bolsa parcial</option><option value="full_scholarship">Bolsa integral</option></select></Field>
                  <Field label="Bolsa (%)"><input type="number" min="0" max="100" step="1" value={form.scholarship_percent ?? 0} onChange={(event) => setField('scholarship_percent', event.target.value)} className="input-field" /></Field>
                  <Field label="Valor mensal protegido"><input type="number" min="0" step="0.01" value={form.monthly_value ?? 0} onChange={(event) => setField('monthly_value', event.target.value)} className="input-field" /></Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Pendências"><textarea value={form.pendencies || ''} onChange={(event) => setField('pendencies', event.target.value)} rows="3" className="input-field resize-none" placeholder="Documentos, financeiro, retorno..." /></Field><Field label="Observações financeiras"><textarea value={form.financial_notes || ''} onChange={(event) => setField('financial_notes', event.target.value)} rows="3" className="input-field resize-none" placeholder="Condição, bolsa, negociação autorizada..." /></Field></div>
              </div>
            </div>
          ) : null}

          {section === 'health' ? (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Score de risco</p><p className="mt-1 text-xs text-slate-500">0 a 10 pontos · ferramenta interna de priorização</p></div><RiskBadge band={risk.band} score={risk.score} /></div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <ScoreSelect label="Experiência · 0–3" max={3} value={form.score_experience} onChange={(value) => setField('score_experience', value)} helper="Reclamação, satisfação, conflito ou promessa não resolvida." />
                  <ScoreSelect label="Intenção · 0–3" max={3} value={form.score_intention} onChange={(value) => setField('score_intention', value)} helper="Continuidade, pesquisa ativa, indecisão ou saída declarada." />
                  <ScoreSelect label="Financeiro · 0–2" max={2} value={form.score_financial} onChange={(value) => setField('score_financial', value)} helper="Inadimplência, condição, bolsa ou dificuldade declarada." />
                  <ScoreSelect label="Comportamento · 0–2" max={2} value={form.score_behavior} onChange={(value) => setField('score_behavior', value)} helper="Participação, ausência, pedido de documento ou contato reduzido." />
                </div>
                <div className="mt-5 rounded-2xl bg-[#FFF7DD] p-4"><p className="text-[10px] font-bold leading-4 text-[#8A6100]">0–2 Promotora · 3–4 Neutra · 5–6 Indecisa · 7–10 Alto risco. Registre apenas fatos objetivos e necessários à relação escolar.</p></div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Intenção e radar de evasão</p>
                <Field label="Intenção atual"><select value={form.intention || ''} onChange={(event) => setField('intention', event.target.value)} className="input-field">{INTENTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {EROSION_SIGNALS.map(([key, label, helper]) => (
                    <Toggle key={key} checked={form.signals.includes(key)} onChange={() => toggleSignal(key)} label={label} helper={helper} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {section === 'decision' ? (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Etapa e próxima ação</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Etapa do funil"><select value={form.stage_key} onChange={(event) => setField('stage_key', event.target.value)} className="input-field">{context.stages.map((stage, index) => <option key={stage.key} value={stage.key}>{index + 1}. {stage.name}</option>)}</select></Field>
                  <Field label="Prazo de decisão"><input type="date" value={form.decision_deadline || ''} onChange={(event) => setField('decision_deadline', event.target.value)} className="input-field" /></Field>
                  <Field label="Próxima ação"><input value={form.next_action || ''} onChange={(event) => setField('next_action', event.target.value)} className="input-field" placeholder="Ex.: reunião com coordenação" /></Field>
                  <Field label="Data da próxima ação"><input type="date" value={form.next_action_date || ''} onChange={(event) => setField('next_action_date', event.target.value)} className="input-field" /></Field>
                  <Field label="Valor da proposta"><input type="number" min="0" step="0.01" value={form.proposal_amount ?? 0} onChange={(event) => setField('proposal_amount', event.target.value)} className="input-field" /></Field>
                  <Field label="Proposta enviada em"><input type="datetime-local" value={form.proposal_sent_at || ''} onChange={(event) => setField('proposal_sent_at', event.target.value)} className="input-field" /></Field>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Objeção</p>
                <Field label="Objeção principal"><select value={form.objection_type || ''} onChange={(event) => setField('objection_type', event.target.value)} className="input-field"><option value="">Nenhuma / não definida</option>{OBJECTION_MATRIX.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field>
                <div className="mt-4"><Field label="Contexto da objeção"><textarea rows="4" value={form.objection_notes || ''} onChange={(event) => setField('objection_notes', event.target.value)} className="input-field resize-none" placeholder="Registre o fato, o impacto e o que já foi conversado." /></Field></div>
                {selectedObjection ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Diagnóstico</p><p className="mt-1 text-xs font-semibold text-slate-600">{selectedObjection.diagnosis}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Responsável sugerido</p><p className="mt-1 text-xs font-semibold text-slate-600">{selectedObjection.owner}</p></div><div className="sm:col-span-2"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Resposta estratégica</p><p className="mt-1 text-xs leading-5 text-slate-600">{selectedObjection.response}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo passo</p><p className="mt-1 text-xs font-extrabold text-[#A67506]">{selectedObjection.next}</p></div></div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4"><Field label="Notas do caso"><textarea rows="5" value={form.notes || ''} onChange={(event) => setField('notes', event.target.value)} className="input-field resize-none" placeholder="Contexto objetivo, acordos e próximos passos." /></Field></div>
            </div>
          ) : null}

          {section === 'formalization' ? (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Elegibilidade</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">A etapa “Elegível” só é liberada quando os três critérios abaixo estiverem conferidos.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Toggle checked={form.vacancy_confirmed} onChange={(value) => setField('vacancy_confirmed', value)} label="Vaga confirmada" helper="Turma, segmento, turno e unidade." />
                  <Toggle checked={form.financial_clearance} onChange={(value) => setField('financial_clearance', value)} label="Pendências verificadas" helper="Situação financeira e administrativa." />
                  <Toggle checked={form.policy_clearance} onChange={(value) => setField('policy_clearance', value)} label="Política validada" helper="Condição, bolsa e regras aplicáveis." />
                </div>
              </div>

              <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Conclusão real</p>
                <p className="mt-1 text-xs leading-5 text-emerald-700/70">“A família disse que vai ficar” não encerra o processo. A etapa concluída exige formalização completa.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Toggle checked={form.contract_confirmed} onChange={(value) => setField('contract_confirmed', value)} label="Contrato confirmado" />
                  <Toggle checked={form.documents_confirmed} onChange={(value) => setField('documents_confirmed', value)} label="Documentos confirmados" />
                  <Toggle checked={form.finance_confirmed} onChange={(value) => setField('finance_confirmed', value)} label="Financeiro confirmado" />
                </div>
              </div>

              <div className="rounded-[20px] border border-rose-100 bg-rose-50/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-rose-700">Não renovada / transferência</p>
                <p className="mt-1 text-xs leading-5 text-rose-700/70">Toda saída precisa ter causa registrável. A meta do sistema é zero saída sem motivo.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Motivo da saída"><input value={form.exit_reason || ''} onChange={(event) => setField('exit_reason', event.target.value)} className="input-field" placeholder="Ex.: mudança de cidade" /></Field><Field label="Destino / observação"><input value={form.exit_destination || ''} onChange={(event) => setField('exit_destination', event.target.value)} className="input-field" placeholder="Escola / cidade / situação" /></Field></div>
              </div>
            </div>
          ) : null}

          {section === 'history' ? (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Registrar contato</p>
                <div className="grid gap-3 sm:grid-cols-[160px_1fr]"><select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="input-field"><option value="whatsapp">WhatsApp</option><option value="call">Ligação</option><option value="meeting">Reunião</option><option value="email">E-mail</option><option value="note">Nota interna</option></select><textarea value={activityText} onChange={(event) => setActivityText(event.target.value)} rows="3" className="input-field resize-none" placeholder="O que foi conversado, decisão, pendência e próximo passo..." /></div>
                <div className="mt-3 flex justify-end"><button type="button" onClick={addActivity} disabled={savingActivity || !activityText.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#1C1C1C] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><Plus size={15} />{savingActivity ? 'Registrando...' : 'Registrar contato'}</button></div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Histórico</p><History size={16} className="text-slate-300" /></div>
                {loadingActivities ? <p className="mt-5 text-xs font-semibold text-slate-400">Carregando histórico...</p> : activities.length ? (
                  <div className="mt-4 space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex gap-3">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#EBAE20] ring-4 ring-[#FFF7DD]" />
                        <div className="min-w-0 flex-1 border-b border-slate-100 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{activity.activity_type.replace('_', ' ')}</p><p className="text-[9px] font-semibold text-slate-300">{formatDate(activity.created_at)}</p></div><p className="mt-1 text-xs leading-5 text-slate-600">{activity.description}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">por {activity.created_by_name || 'Usuário'}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-5 text-xs font-semibold text-slate-400">Nenhum contato registrado ainda.</p>}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>{!isNew && (context.currentUserRole === 'admin' || context.currentUserRole === 'client') ? <button type="button" onClick={remove} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} />{deleting ? 'Excluindo...' : 'Excluir'}</button> : null}</div>
            <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#EBAE20] px-5 py-2.5 text-xs font-black text-[#1C1C1C] shadow-sm transition hover:bg-[#DFA414] disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar rematrícula'}</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ open, context, onClose, onImported, notify }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (!open) { setRows([]); setFileName(''); } }, [open]);
  if (!open) return null;

  async function readFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      setFileName(file.name);
      if (!parsed.length) notify('Não encontrei linhas válidas. Use o modelo CSV do sistema.', 'error');
    } catch {
      notify('Não foi possível ler o arquivo CSV.', 'error');
    }
  }

  async function runImport() {
    if (!rows.length) return;
    setImporting(true);
    try {
      const { data } = await api.post('/reenrollments/families/import', { client_id: context.client.id, year: CAMPAIGN_YEAR, rows });
      notify(`${data.imported || 0} família(s) importada(s)${data.skipped ? ` · ${data.skipped} ignorada(s)` : ''}.`, data.imported ? 'success' : 'error');
      if (data.errors?.length) console.warn('[Rematrículas] Importação:', data.errors);
      await onImported();
      onClose();
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível importar a base.', 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[26px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><span className="rounded-full bg-[#FFF4CE] px-2.5 py-1 text-[10px] font-black uppercase text-[#8A6100]">Base Bee</span><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Importar famílias por CSV</h2><p className="mt-1 text-xs text-slate-400">Ideal para subir a base de rematrículas de uma vez e começar o CRM.</p></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400"><X size={17} /></button></div>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 text-center transition hover:border-[#EBAE20] hover:bg-[#FFFDF7]">
              <Upload size={24} className="text-[#A67506]" /><p className="mt-3 text-sm font-extrabold text-slate-700">Selecione o CSV</p><p className="mt-1 text-xs text-slate-400">{fileName || 'Aceita vírgula ou ponto e vírgula como separador.'}</p><input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />
            </label>
            <button type="button" onClick={downloadCsvTemplate} className="flex min-h-[150px] min-w-[190px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-center hover:bg-slate-50"><Download size={22} className="text-slate-500" /><p className="mt-3 text-xs font-extrabold text-slate-700">Baixar modelo</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Com os nomes de colunas reconhecidos pelo sistema.</p></button>
          </div>
          {rows.length ? (
            <div className="mt-5"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-extrabold text-slate-700">Prévia · {rows.length} famílias</p><span className="text-[10px] font-bold text-emerald-600">Arquivo pronto</span></div><div className="overflow-x-auto rounded-2xl border border-slate-100"><table className="w-full min-w-[700px] text-left"><thead className="bg-slate-50"><tr>{['Família', 'Responsável', 'Unidade', 'Turma futura', 'Alunos', 'Perfil'].map((label) => <th key={label} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index} className="border-t border-slate-100"><td className="px-3 py-2.5 text-[11px] font-extrabold text-slate-700">{row.family_name}</td><td className="px-3 py-2.5 text-[11px] text-slate-500">{row.responsible_name || '—'}</td><td className="px-3 py-2.5 text-[11px] text-slate-500">{row.unit || '—'}</td><td className="px-3 py-2.5 text-[11px] text-slate-500">{row.future_class || '—'}</td><td className="px-3 py-2.5 text-[11px] text-slate-500">{row.students_count || row.student_names?.length || 1}</td><td className="px-3 py-2.5 text-[11px] text-slate-500">{row.financial_profile || 'paying'}</td></tr>)}</tbody></table></div>{rows.length > 5 ? <p className="mt-2 text-[10px] text-slate-400">+ {rows.length - 5} linhas não exibidas na prévia.</p> : null}</div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button><button type="button" onClick={runImport} disabled={!rows.length || importing} className="inline-flex items-center gap-2 rounded-xl bg-[#1C1C1C] px-5 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"><FileSpreadsheet size={15} />{importing ? 'Importando...' : `Importar ${rows.length || ''} famílias`}</button></div>
      </div>
    </div>
  );
}

function CampaignSettingsModal({ open, context, onClose, onSaved, notify }) {
  const [target, setTarget] = useState(context?.campaign?.target_rate || 92);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setTarget(context?.campaign?.target_rate || 92); }, [open, context?.campaign?.target_rate]);
  if (!open) return null;
  async function save() {
    setSaving(true);
    try {
      await api.patch('/reenrollments/campaign', { client_id: context.client.id, year: CAMPAIGN_YEAR, target_rate: Number(target) });
      notify('Meta da campanha atualizada.', 'success');
      await onSaved();
      onClose();
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível atualizar a meta.', 'error');
    } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.25)]"><div className="flex items-start justify-between"><div><h3 className="text-lg font-black tracking-tight text-slate-950">Meta da campanha</h3><p className="mt-1 text-xs leading-5 text-slate-400">A referência do mapa é ≥ 92%, mas a direção pode ajustar quando validar a linha de base.</p></div><button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400"><X size={15} /></button></div><div className="mt-5"><Field label="Meta de rematrícula (%)"><input type="number" min="0" max="100" step="0.1" value={target} onChange={(event) => setTarget(event.target.value)} className="input-field" /></Field></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-[#EBAE20] px-5 py-2.5 text-xs font-black text-[#1C1C1C] disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar meta'}</button></div></div></div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`fixed right-5 top-5 z-[200] flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ${toast.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{toast.type === 'error' ? <AlertTriangle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}<p className="text-xs font-bold leading-5">{toast.message}</p></div>;
}

export default function BeeRematriculas() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [movingFamilyId, setMovingFamilyId] = useState(null);
  const [toast, setToast] = useState(null);

  const clientId = user?.role === 'client' ? Number(user.client_id || 0) : Number(selectedClient?.id || 0);
  const frontendAllowed = user?.role === 'client' || isBeeClient(selectedClient);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadContext = useCallback(async ({ silent = false } = {}) => {
    if (!clientId && user?.role !== 'client') {
      setContext(null);
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/reenrollments/context', { params: { client_id: clientId || undefined, year: CAMPAIGN_YEAR } });
      setContext({ ...data, currentUserRole: user?.role });
    } catch (requestError) {
      setContext(null);
      setError(requestError.response?.data?.error || 'Não foi possível abrir o sistema de Rematrículas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId, user?.role]);

  useEffect(() => { loadContext(); }, [loadContext]);

  if (user?.role !== 'client' && !frontendAllowed) return <Navigate to="/feed" replace />;

  function openNewFamily() {
    setSelectedFamily(null);
    setDrawerOpen(true);
  }

  function openFamily(family) {
    setSelectedFamily(family);
    setDrawerOpen(true);
  }

  async function changeStage(family, stageKey) {
    setMovingFamilyId(family.id);
    try {
      await api.patch(`/reenrollments/families/${family.id}/stage`, { client_id: context.client.id, year: CAMPAIGN_YEAR, stage_key: stageKey });
      await loadContext({ silent: true });
      notify(`“${family.family_name}” movida para ${context.stages.find((stage) => stage.key === stageKey)?.name || 'nova etapa'}.`, 'success');
      return { ok: true };
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Não foi possível alterar a etapa.';
      if (requestError.response?.status === 400) openFamily(family);
      return { error: message };
    } finally {
      setMovingFamilyId(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[65vh] items-center justify-center"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-500 shadow-sm"><RefreshCw size={16} className="animate-spin text-[#A67506]" />Carregando sistema de Rematrículas...</div></div>;
  }

  if (error && !context) {
    if (error.toLowerCase().includes('somente para a bee')) return <Navigate to="/feed" replace />;
    return <EmptyState icon={AlertTriangle} title="Não foi possível abrir Rematrículas" description={error} action={<button type="button" onClick={() => loadContext()} className="rounded-xl bg-[#1C1C1C] px-4 py-2.5 text-xs font-extrabold text-white">Tentar novamente</button>} />;
  }

  if (!context) return null;

  const targetGap = Math.max(0, Number(context.dashboard.target_students || 0) - Number(context.dashboard.concluded_students || 0));

  return (
    <div className="space-y-5 pb-12">
      <style>{`.input-field{width:100%;border:1px solid rgb(226 232 240);border-radius:.75rem;background:#fff;padding:.625rem .75rem;font-size:.75rem;line-height:1.25rem;color:rgb(51 65 85);outline:none;transition:.15s}.input-field:focus{border-color:#EBAE20;box-shadow:0 0 0 3px rgba(235,174,32,.12)}.input-field::placeholder{color:rgb(148 163 184)}`}</style>
      <Toast toast={toast} />

      <section className="relative overflow-hidden rounded-[28px] bg-[#1C1C1C] px-5 py-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.16)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border-[46px] border-[#EBAE20]/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#EBAE20] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#1C1C1C]">Bee · Rematrículas {CAMPAIGN_YEAR}</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/70">CRM operacional</span></div>
            <h1 className="mt-4 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Proteger a base, antecipar riscos e conduzir cada família até uma decisão real.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">Toda família com status, risco, responsável e próxima ação. A rematrícula só é concluída quando contrato, documentos e financeiro estiverem confirmados.</p>
          </div>
          <div className="min-w-[250px] rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
            <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#EBAE20]">Meta {formatPercent(context.dashboard.target_rate, 0)}</p><button type="button" onClick={() => setSettingsOpen(true)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/60 hover:text-white"><Settings2 size={13} /></button></div>
            <div className="mt-3 flex items-end justify-between gap-4"><div><p className="text-3xl font-black tracking-tight">{context.dashboard.concluded_students}</p><p className="text-[10px] font-semibold text-white/45">alunos confirmados</p></div><div className="text-right"><p className="text-lg font-black text-[#EBAE20]">{targetGap}</p><p className="text-[10px] font-semibold text-white/45">faltam para a meta</p></div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#EBAE20] transition-all" style={{ width: `${Math.min(100, context.dashboard.target_progress)}%` }} /></div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {[['dashboard', BarChart3, 'Visão geral'], ['crm', Users, 'CRM'], ['playbook', ClipboardCheck, 'Scripts & objeções']].map(([key, Icon, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${activeTab === key ? 'bg-[#1C1C1C] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={15} />{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => loadContext({ silent: true })} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Atualizar</button><button type="button" onClick={openNewFamily} className="inline-flex items-center gap-2 rounded-xl bg-[#EBAE20] px-4 py-2.5 text-xs font-black text-[#1C1C1C] shadow-sm hover:bg-[#DFA414]"><Plus size={16} />Nova rematrícula</button></div>
      </div>

      {activeTab === 'dashboard' ? <DashboardView context={context} onOpenFamily={openFamily} onOpenCrm={() => setActiveTab('crm')} /> : null}
      {activeTab === 'crm' ? <CrmView context={context} onOpenFamily={openFamily} onNewFamily={openNewFamily} onImport={() => setImportOpen(true)} onStageChange={changeStage} movingFamilyId={movingFamilyId} notify={notify} /> : null}
      {activeTab === 'playbook' ? <PlaybookView notify={notify} /> : null}

      <FamilyDrawer open={drawerOpen} family={selectedFamily} context={context} onClose={() => setDrawerOpen(false)} onSaved={loadContext} notify={notify} />
      <ImportModal open={importOpen} context={context} onClose={() => setImportOpen(false)} onImported={loadContext} notify={notify} />
      <CampaignSettingsModal open={settingsOpen} context={context} onClose={() => setSettingsOpen(false)} onSaved={loadContext} notify={notify} />
    </div>
  );
}
