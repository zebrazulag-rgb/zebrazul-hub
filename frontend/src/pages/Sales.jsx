import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import CommercialStageManager from '../components/CommercialStageManager.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { notifyCommercialUpdated } from '../utils/commercialRealtime.js';
import {
  commercialStageMap,
  decorateCommercialStage,
  firstOpenCommercialStage,
} from '../utils/commercialStages.js';

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

function isOverdue(value, stageType) {
  return Boolean(value && !['won', 'lost'].includes(stageType) && String(value).slice(0, 10) < todayISO());
}

function emptyForm(currentUserId, defaultStage) {
  return {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    source: '',
    stage: defaultStage?.stage_key || '',
    estimated_value: '',
    probability: Number(defaultStage?.probability || 0),
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

function LeadCard({ lead, stage, onOpen, onDragStart }) {
  const safeStage = stage || {
    soft: 'bg-slate-100 text-slate-700 border-slate-200',
    stage_type: 'open',
  };
  const overdue = isOverdue(lead.next_action_date, safeStage.stage_type);
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, lead.id)}
      onClick={() => onOpen(lead)}
      className="group w-full rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-[0_6px_18px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
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

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">{formatCurrency(lead.estimated_value)}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${safeStage.soft}`}>{lead.probability}%</span>
          </div>

          {(lead.next_action || lead.next_action_date) && (
            <div className={`mt-2.5 rounded-xl px-2.5 py-2 ${overdue ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [commercialClients, setCommercialClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
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
  const [stageManagerOpen, setStageManagerOpen] = useState(false);

  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id || 0);
  const currentClient = user?.role === 'client'
    ? commercialClients.find((client) => Number(client.id) === Number(user.client_id))
    : selectedClient;

  const decoratedStages = useMemo(() => stages.map(decorateCommercialStage), [stages]);
  const stageMap = useMemo(() => commercialStageMap(stages), [stages]);
  const defaultStage = useMemo(() => firstOpenCommercialStage(stages), [stages]);

  useEffect(() => {
    let active = true;
    api.get('/commercial/clients').then(({ data }) => {
      if (!active) return;
      const nextClients = data.clients || [];
      setCommercialClients(nextClients);
      if (user?.role !== 'client' && !selectedClient && nextClients.length === 1) setSelectedClient(nextClients[0]);
    }).catch(() => { if (active) setCommercialClients([]); });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.client_id, selectedClient?.id, setSelectedClient]);

  async function loadData() {
    if (!clientId) {
      setLeads([]);
      setStages([]);
      setTeamUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [leadResponse, usersResponse, stageResponse] = await Promise.all([
        api.get('/commercial/leads', { params: { client_id: clientId } }),
        api.get('/commercial/users', { params: { client_id: clientId } }),
        api.get('/commercial/stages', { params: { client_id: clientId } }),
      ]);
      setLeads(leadResponse.data.leads || []);
      setTeamUsers(usersResponse.data.users || []);
      setStages(stageResponse.data.stages || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm(null);
    setEditingLead(null);
    setOwnerFilter('all');
    loadData();
  }, [clientId]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (ownerFilter !== 'all' && String(lead.owner_user_id || '') !== ownerFilter) return false;
      if (!term) return true;
      return [lead.company_name, lead.contact_name, lead.email, lead.phone, lead.source]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [leads, ownerFilter, search]);

  const openLeads = leads.filter((lead) => stageMap[lead.stage]?.stage_type === 'open');
  const pipelineValue = openLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
  const finalizedLeads = leads.filter((lead) => ['won', 'lost'].includes(stageMap[lead.stage]?.stage_type));
  const wonLeads = finalizedLeads.filter((lead) => stageMap[lead.stage]?.stage_type === 'won');
  const closeRate = finalizedLeads.length ? (wonLeads.length / finalizedLeads.length) * 100 : 0;
  const wonThisMonth = leads.filter((lead) => stageMap[lead.stage]?.stage_type === 'won' && String(lead.closed_at || lead.updated_at || '').slice(0, 10) >= monthStartISO());
  const wonValue = wonThisMonth.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
  const followUps = leads
    .filter((lead) => lead.next_action_date && stageMap[lead.stage]?.stage_type === 'open')
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
    .slice(0, 8);

  function beginCreate() {
    if (!clientId) return;
    setEditingLead(null);
    const defaultOwnerId = teamUsers.some((member) => Number(member.id) === Number(user?.id))
      ? user.id
      : teamUsers[0]?.id;
    setForm(emptyForm(defaultOwnerId, defaultStage));
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
      stage: lead.stage || defaultStage?.stage_key || '',
      estimated_value: lead.estimated_value ?? '',
      probability: lead.probability ?? stageMap[lead.stage]?.probability ?? 0,
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
      probability: stageMap[stage]?.probability ?? current.probability,
      lost_reason: stageMap[stage]?.stage_type === 'lost' ? current.lost_reason : '',
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
        client_id: clientId,
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
      notifyCommercialUpdated(clientId);
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
      await api.delete(`/commercial/leads/${editingLead.id}`, { params: { client_id: clientId } });
      setLeads((current) => current.filter((item) => item.id !== editingLead.id));
      notifyCommercialUpdated(clientId);
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
    const optimistic = { ...currentLead, stage, probability: stageMap[stage]?.probability ?? currentLead.probability };
    setLeads((items) => items.map((item) => item.id === leadId ? optimistic : item));
    try {
      const { data } = await api.put(`/commercial/leads/${leadId}`, { stage, client_id: clientId });
      setLeads((items) => items.map((item) => item.id === leadId ? data.lead : item));
      notifyCommercialUpdated(clientId);
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
    { label: 'Taxa de fechamento', value: `${Math.round(closeRate)}%`, helper: finalizedLeads.length ? `${wonLeads.length} de ${finalizedLeads.length} oportunidades finalizadas` : 'nenhuma oportunidade finalizada', icon: Target, className: 'bg-amber-50 text-amber-600' },
    { label: 'Fechado no mês', value: formatCurrency(wonValue), helper: `${wonThisMonth.length} negócio${wonThisMonth.length === 1 ? '' : 's'} ganho${wonThisMonth.length === 1 ? '' : 's'}`, icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <PageHero
        compact
        icon={Handshake}
        eyebrow="Gestão comercial por cliente"
        title={currentClient?.name ? `Comercial · ${currentClient.name}` : 'Comercial'}
        description={currentClient?.name
          ? `Pipeline exclusivo de ${currentClient.name}, com oportunidades, responsáveis, propostas e próximos passos separados dos demais clientes.`
          : 'Selecione um cliente no filtro lateral para abrir o pipeline comercial correspondente.'}
        actions={clientId ? (
          <>
            <button type="button" onClick={() => setStageManagerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
              <Settings2 size={17} /> Gerenciar quadros
            </button>
            <button type="button" onClick={() => navigate('/comercial/funil')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
              <TrendingUp size={17} /> Ver funil
            </button>
            <button type="button" onClick={beginCreate} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5">
              <Plus size={17} /> Nova oportunidade
            </button>
          </>
        ) : null}
      />

      {!clientId ? (
        <section className="surface-card border-dashed p-10 text-center">
          <Handshake size={32} className="mx-auto text-[#0969ff]" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Escolha o cliente que deseja acompanhar</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Cada cliente possui seu próprio funil comercial. Use o seletor “Visualizando” na lateral para acessar os leads, propostas e negociações daquela empresa.</p>
        </section>
      ) : (<>

      <section className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${stat.className}`}><stat.icon size={15} /></div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tracking-tight text-slate-900">{stat.value}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-600">{stat.label}</p>
              </div>
            </div>
            <p className="mt-2 truncate text-[10px] text-slate-400">{stat.helper}</p>
          </div>
        ))}
      </section>

      <section className="toolbar-panel flex flex-col gap-2.5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field py-2 pl-10 text-sm" placeholder="Buscar empresa, contato, telefone..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="input-field min-w-[180px] py-2 text-sm">
            <option value="all">Todos os responsáveis</option>
            {teamUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <button type="button" onClick={beginCreate} className="btn-primary inline-flex items-center gap-2 py-2 text-xs"><Plus size={16} /> Adicionar lead</button>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />)}
        </div>
      ) : (
        <section className="commercial-board overflow-hidden rounded-[22px] border border-slate-200/70 bg-white/40">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pipeline visual</h2>
              <p className="mt-0.5 text-xs text-slate-500">Arraste as oportunidades entre os quadros. Use “Gerenciar quadros” para criar, renomear, reorganizar ou excluir etapas.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Atualização automática
            </span>
          </div>
          <div className="overflow-x-auto p-3">
          <div className="flex min-w-max gap-3">
            {decoratedStages.map((stage) => {
              const items = filteredLeads.filter((lead) => lead.stage === stage.key);
              const total = items.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
              return (
                <div
                  key={stage.key}
                  onDragOver={(event) => { event.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => setDragOverStage((current) => current === stage.key ? null : current)}
                  onDrop={(event) => onDrop(event, stage.key)}
                  className={`w-[292px] shrink-0 rounded-[20px] border p-2.5 transition ${dragOverStage === stage.key ? 'border-[#0969ff] bg-blue-50/60 shadow-[0_0_0_4px_rgba(9,105,255,0.08)]' : 'border-slate-200/80 bg-slate-50/70 shadow-[0_8px_24px_rgba(15,23,42,0.035)]'}`}
                >
                  <div className="sticky top-0 z-[1] flex items-start justify-between gap-2 rounded-2xl border border-slate-200/70 bg-white/90 px-2.5 py-2.5 shadow-sm backdrop-blur">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                        <h2 className="max-w-[160px] break-words text-xs font-semibold leading-4 text-slate-800">{stage.label}</h2>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{items.length}</span>
                      </div>
                      <p className="mt-1 pl-[18px] text-xs text-slate-400">{formatCurrency(total)}</p>
                    </div>
                    <button type="button" onClick={() => { beginCreate(); setForm((current) => ({ ...current, stage: stage.key, probability: stage.probability })); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm transition hover:text-[#0969ff]" title={`Adicionar em ${stage.label}`}>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="mt-2.5 space-y-2.5">
                    {items.map((lead) => <LeadCard key={lead.id} lead={lead} stage={stageMap[lead.stage]} onOpen={beginEdit} onDragStart={onDragStart} />)}
                    {items.length === 0 && (
                      <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-5 text-center text-xs leading-5 text-slate-400">
                        Arraste uma oportunidade para esta etapa.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Gestão comercial</p>
              <h2 className="section-title mt-1">Leitura rápida do funil</h2>
            </div>
            <Target size={22} className="text-[#0969ff]" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {decoratedStages.filter((stage) => stage.stage_type === 'open').map((stage) => {
              const count = leads.filter((lead) => lead.stage === stage.key).length;
              return (
                <div key={stage.key} className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
                  <span className={`block h-2 w-2 rounded-full ${stage.dot}`} />
                  <p className="mt-2.5 text-base font-bold text-slate-900">{count}</p>
                  <p className="mt-1 text-xs text-slate-500">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Agenda de vendas</p>
              <h2 className="section-title mt-1">Próximos passos</h2>
            </div>
            <CalendarClock size={21} className="text-amber-500" />
          </div>
          <div className="mt-3 space-y-2.5">
            {followUps.map((lead) => (
              <button key={lead.id} type="button" onClick={() => beginEdit(lead)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200/70 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isOverdue(lead.next_action_date, stageMap[lead.stage]?.stage_type) ? 'bg-rose-500' : 'bg-amber-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{lead.company_name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{lead.next_action || 'Próximo contato'}</span>
                </span>
                <span className={`shrink-0 text-[10px] font-semibold ${isOverdue(lead.next_action_date, stageMap[lead.stage]?.stage_type) ? 'text-rose-600' : 'text-slate-400'}`}>{formatDate(lead.next_action_date)}</span>
              </button>
            ))}
            {followUps.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">Nenhum próximo passo agendado.</p>}
          </div>
        </div>
      </section>

      <CommercialStageManager
        open={stageManagerOpen}
        onClose={() => setStageManagerOpen(false)}
        clientId={clientId}
        stages={stages}
        leadCounts={Object.fromEntries(stages.map((stage) => [stage.stage_key, leads.filter((lead) => lead.stage === stage.stage_key).length]))}
        onStagesChange={(nextStages) => {
          setStages(nextStages);
          notifyCommercialUpdated(clientId);
        }}
      />

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
                      {decoratedStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
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
                {stageMap[form.stage]?.stage_type === 'lost' && (
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
      </>)}
    </div>
  );
}
