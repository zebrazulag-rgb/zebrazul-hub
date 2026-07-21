import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  GripVertical,
  Handshake,
  Mail,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';

const STAGES = [
  { key: 'new_lead', label: 'Novo lead', dot: 'bg-sky-500', soft: 'bg-sky-50 text-sky-700 border-sky-100', probability: 10 },
  { key: 'contacted', label: 'Contato feito', dot: 'bg-indigo-500', soft: 'bg-indigo-50 text-indigo-700 border-indigo-100', probability: 20 },
  { key: 'meeting', label: 'Diagnóstico', dot: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700 border-violet-100', probability: 35 },
  { key: 'proposal', label: 'Proposta enviada', dot: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 border-amber-100', probability: 55 },
  { key: 'negotiation', label: 'Negociação', dot: 'bg-orange-500', soft: 'bg-orange-50 text-orange-700 border-orange-100', probability: 75 },
  { key: 'won', label: 'Fechado', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700 border-emerald-100', probability: 100 },
  { key: 'lost', label: 'Perdido', dot: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700 border-rose-100', probability: 0 },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((stage) => [stage.key, stage]));
const ORIGINS = ['Indicação', 'Instagram', 'Site', 'Evento', 'Prospecção ativa', 'Parceria', 'Outro'];

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStartISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function isOverdue(value, stage) {
  return Boolean(value && !['won', 'lost'].includes(stage) && String(value).slice(0, 10) < todayISO());
}

function emptyForm(currentUserId) {
  return {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    source: '',
    stage: 'new_lead',
    estimated_value: '',
    probability: 10,
    owner_user_id: currentUserId || '',
    next_action: '',
    next_action_date: '',
    notes: '',
    lost_reason: '',
  };
}

function OwnerAvatar({ lead }) {
  if (lead.owner_avatar) return <img src={lead.owner_avatar} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-white" />;
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ backgroundColor: lead.owner_color || '#2563eb' }}>
      {(lead.owner_name || '?')[0]?.toUpperCase()}
    </span>
  );
}

function LeadCard({ lead, onOpen, onDragStart }) {
  const stage = STAGE_MAP[lead.stage] || STAGE_MAP.new_lead;
  const overdue = isOverdue(lead.next_action_date, lead.stage);
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, lead.id)}
      onClick={() => onOpen(lead)}
      className="group w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start gap-3">
        <GripVertical size={15} className="mt-0.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{lead.company_name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{lead.contact_name || 'Contato não informado'}</p>
            </div>
            <OwnerAvatar lead={lead} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">{formatCurrency(lead.estimated_value)}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${stage.soft}`}>{lead.probability}%</span>
          </div>

          {(lead.next_action || lead.next_action_date) && (
            <div className={`mt-3 rounded-xl px-3 py-2 ${overdue ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
              <p className="line-clamp-2 text-[11px] font-medium">{lead.next_action || 'Próximo contato'}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] opacity-75"><CalendarClock size={11} /> {formatDate(lead.next_action_date)}</p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Sales() {
  const [leads, setLeads] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [dragOverStage, setDragOverStage] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [leadResponse, usersResponse] = await Promise.all([
        api.get('/commercial/leads'),
        api.get('/auth/team-users'),
      ]);
      setLeads(leadResponse.data.leads || []);
      setTeamUsers(usersResponse.data.users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (ownerFilter !== 'all' && String(lead.owner_user_id || '') !== ownerFilter) return false;
      if (!term) return true;
      return [lead.company_name, lead.contact_name, lead.email, lead.phone, lead.source]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [leads, ownerFilter, search]);

  const openLeads = leads.filter((lead) => !['won', 'lost'].includes(lead.stage));
  const pipelineValue = openLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
  const weightedForecast = openLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0) * Number(lead.probability || 0) / 100, 0);
  const wonThisMonth = leads.filter((lead) => lead.stage === 'won' && String(lead.closed_at || lead.updated_at || '').slice(0, 10) >= monthStartISO());
  const wonValue = wonThisMonth.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
  const followUps = leads
    .filter((lead) => lead.next_action_date && !['won', 'lost'].includes(lead.stage))
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
    .slice(0, 8);

  function beginCreate() {
    setEditingLead(null);
    setForm(emptyForm(teamUsers[0]?.id));
    setError('');
  }

  function beginEdit(lead) {
    setEditingLead(lead);
    setForm({
      company_name: lead.company_name || '',
      contact_name: lead.contact_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || '',
      stage: lead.stage || 'new_lead',
      estimated_value: lead.estimated_value ?? '',
      probability: lead.probability ?? STAGE_MAP[lead.stage]?.probability ?? 10,
      owner_user_id: lead.owner_user_id || '',
      next_action: lead.next_action || '',
      next_action_date: lead.next_action_date ? String(lead.next_action_date).slice(0, 10) : '',
      notes: lead.notes || '',
      lost_reason: lead.lost_reason || '',
    });
    setError('');
  }

  function changeStage(stage) {
    setForm((current) => ({
      ...current,
      stage,
      probability: STAGE_MAP[stage]?.probability ?? current.probability,
      lost_reason: stage === 'lost' ? current.lost_reason : '',
    }));
  }

  async function saveLead(event) {
    event.preventDefault();
    if (!form.company_name.trim()) {
      setError('Informe o nome da empresa ou oportunidade.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        estimated_value: Number(form.estimated_value || 0),
        probability: Number(form.probability || 0),
        owner_user_id: form.owner_user_id || null,
        next_action_date: form.next_action_date || null,
      };
      const { data } = editingLead
        ? await api.put(`/commercial/leads/${editingLead.id}`, payload)
        : await api.post('/commercial/leads', payload);
      setLeads((current) => {
        const exists = current.some((item) => item.id === data.lead.id);
        return exists ? current.map((item) => item.id === data.lead.id ? data.lead : item) : [data.lead, ...current];
      });
      setForm(null);
      setEditingLead(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a oportunidade.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead() {
    if (!editingLead) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/commercial/leads/${editingLead.id}`);
      setLeads((current) => current.filter((item) => item.id !== editingLead.id));
      setForm(null);
      setEditingLead(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível apagar a oportunidade.');
    } finally {
      setDeleting(false);
    }
  }

  async function moveLead(leadId, stage) {
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.stage === stage) return;
    const previous = leads;
    const optimistic = { ...currentLead, stage, probability: STAGE_MAP[stage]?.probability ?? currentLead.probability };
    setLeads((items) => items.map((item) => item.id === leadId ? optimistic : item));
    try {
      const { data } = await api.put(`/commercial/leads/${leadId}`, { stage });
      setLeads((items) => items.map((item) => item.id === leadId ? data.lead : item));
    } catch {
      setLeads(previous);
    }
  }

  function onDragStart(event, leadId) {
    event.dataTransfer.setData('text/plain', String(leadId));
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(event, stage) {
    event.preventDefault();
    setDragOverStage(null);
    const leadId = Number(event.dataTransfer.getData('text/plain'));
    if (leadId) moveLead(leadId, stage);
  }

  const stats = [
    { label: 'Oportunidades abertas', value: openLeads.length, helper: 'em movimento no pipeline', icon: BriefcaseBusiness, className: 'bg-blue-50 text-blue-600' },
    { label: 'Valor em negociação', value: formatCurrency(pipelineValue), helper: 'soma das oportunidades abertas', icon: CircleDollarSign, className: 'bg-violet-50 text-violet-600' },
    { label: 'Previsão ponderada', value: formatCurrency(weightedForecast), helper: 'valor ajustado pela probabilidade', icon: TrendingUp, className: 'bg-amber-50 text-amber-600' },
    { label: 'Fechado no mês', value: formatCurrency(wonValue), helper: `${wonThisMonth.length} negócio${wonThisMonth.length === 1 ? '' : 's'} ganho${wonThisMonth.length === 1 ? '' : 's'}`, icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <PageHero
        icon={Handshake}
        eyebrow="Núcleo independente"
        title="Comercial"
        description="Pipeline de prospecção, propostas e negociações sem depender do cadastro de clientes da operação. O filtro lateral de clientes não altera esta área."
        actions={(
          <button type="button" onClick={beginCreate} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5">
            <Plus size={17} /> Nova oportunidade
          </button>
        )}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card p-5">
            <div className={`icon-tile ${stat.className}`}><stat.icon size={19} /></div>
            <p className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{stat.label}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.helper}</p>
          </div>
        ))}
      </section>

      <section className="toolbar-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Buscar empresa, contato, telefone..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="input-field min-w-[190px]">
            <option value="all">Todos os responsáveis</option>
            {teamUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <button type="button" onClick={beginCreate} className="btn-primary inline-flex items-center gap-2 text-sm"><Plus size={16} /> Adicionar lead</button>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />)}
        </div>
      ) : (
        <section className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-4">
            {STAGES.map((stage) => {
              const items = filteredLeads.filter((lead) => lead.stage === stage.key);
              const total = items.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
              return (
                <div
                  key={stage.key}
                  onDragOver={(event) => { event.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => setDragOverStage((current) => current === stage.key ? null : current)}
                  onDrop={(event) => onDrop(event, stage.key)}
                  className={`w-[300px] shrink-0 rounded-[24px] border p-3 transition ${dragOverStage === stage.key ? 'border-[#0969ff] bg-blue-50/60 shadow-[0_0_0_4px_rgba(9,105,255,0.08)]' : 'border-slate-200/80 bg-slate-100/65'}`}
                >
                  <div className="flex items-start justify-between gap-3 px-1 pb-3 pt-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                        <h2 className="text-sm font-semibold text-slate-800">{stage.label}</h2>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{items.length}</span>
                      </div>
                      <p className="mt-1 pl-[18px] text-xs text-slate-400">{formatCurrency(total)}</p>
                    </div>
                    <button type="button" onClick={() => { beginCreate(); setForm((current) => ({ ...current, stage: stage.key, probability: stage.probability })); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm transition hover:text-[#0969ff]" title={`Adicionar em ${stage.label}`}>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {items.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={beginEdit} onDragStart={onDragStart} />)}
                    {items.length === 0 && (
                      <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/55 px-5 text-center text-xs text-slate-400">
                        Arraste uma oportunidade para esta etapa.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Gestão comercial</p>
              <h2 className="section-title mt-1">Leitura rápida do funil</h2>
            </div>
            <Target size={22} className="text-[#0969ff]" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {STAGES.filter((stage) => !['won', 'lost'].includes(stage.key)).map((stage) => {
              const count = leads.filter((lead) => lead.stage === stage.key).length;
              return (
                <div key={stage.key} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                  <span className={`block h-2 w-2 rounded-full ${stage.dot}`} />
                  <p className="mt-4 text-xl font-bold text-slate-900">{count}</p>
                  <p className="mt-1 text-xs text-slate-500">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Agenda de vendas</p>
              <h2 className="section-title mt-1">Próximos passos</h2>
            </div>
            <CalendarClock size={21} className="text-amber-500" />
          </div>
          <div className="mt-5 space-y-3">
            {followUps.map((lead) => (
              <button key={lead.id} type="button" onClick={() => beginEdit(lead)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200/70 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isOverdue(lead.next_action_date, lead.stage) ? 'bg-rose-500' : 'bg-amber-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{lead.company_name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{lead.next_action || 'Próximo contato'}</span>
                </span>
                <span className={`shrink-0 text-[10px] font-semibold ${isOverdue(lead.next_action_date, lead.stage) ? 'text-rose-600' : 'text-slate-400'}`}>{formatDate(lead.next_action_date)}</span>
              </button>
            ))}
            {followUps.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">Nenhum próximo passo agendado.</p>}
          </div>
        </div>
      </section>

      {form && (
        <ModalBackdrop onClose={() => !saving && setForm(null)} disabled={saving} className="z-[70]">
          <form onSubmit={saveLead} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <p className="section-kicker">Núcleo comercial</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{editingLead ? 'Editar oportunidade' : 'Nova oportunidade'}</h2>
              </div>
              <button type="button" onClick={() => setForm(null)} disabled={saving} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Empresa ou oportunidade</label>
                  <input className="input-field" value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} placeholder="Ex: Clínica Horizonte" autoFocus />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Pessoa de contato</label>
                  <input className="input-field" value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} placeholder="Nome do decisor" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Origem</label>
                  <select className="input-field" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
                    <option value="">Não informada</option>
                    {ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
                  <div className="relative"><Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="email" className="input-field pl-10" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="contato@empresa.com" /></div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
                  <div className="relative"><Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(00) 00000-0000" /></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/65 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Etapa do funil</label>
                    <select className="input-field" value={form.stage} onChange={(event) => changeStage(event.target.value)}>
                      {STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Responsável</label>
                    <select className="input-field" value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}>
                      <option value="">Sem responsável</option>
                      {teamUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Valor estimado</label>
                    <input type="number" min="0" step="0.01" className="input-field" value={form.estimated_value} onChange={(event) => setForm({ ...form, estimated_value: event.target.value })} placeholder="0,00" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700"><span>Probabilidade</span><strong>{form.probability}%</strong></label>
                    <input type="range" min="0" max="100" step="5" className="w-full accent-[#0969ff]" value={form.probability} onChange={(event) => setForm({ ...form, probability: Number(event.target.value) })} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Próxima ação</label>
                  <input className="input-field" value={form.next_action} onChange={(event) => setForm({ ...form, next_action: event.target.value })} placeholder="Ex: Enviar proposta revisada" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Data da próxima ação</label>
                  <input type="date" className="input-field" value={form.next_action_date} onChange={(event) => setForm({ ...form, next_action_date: event.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Anotações comerciais</label>
                  <textarea className="input-field min-h-28" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Contexto, dores percebidas, objeções, próximos passos..." />
                </div>
                {form.stage === 'lost' && (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-rose-700">Motivo da perda</label>
                    <textarea className="input-field min-h-20 border-rose-200 bg-rose-50/50" value={form.lost_reason} onChange={(event) => setForm({ ...form, lost_reason: event.target.value })} placeholder="Registre por que a oportunidade não avançou." />
                  </div>
                )}
              </div>

              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {editingLead && <button type="button" onClick={deleteLead} disabled={saving || deleting} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /> {deleting ? 'Apagando...' : 'Apagar oportunidade'}</button>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setForm(null)} disabled={saving} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary min-w-36">{saving ? 'Salvando...' : editingLead ? 'Salvar alterações' : 'Criar oportunidade'}</button>
              </div>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}
