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
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import CommercialStageManager from '../components/CommercialStageManager.jsx';
import CommercialLeadImportModal from '../components/CommercialLeadImportModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { notifyCommercialUpdated } from '../utils/commercialRealtime.js';
import {
  commercialStageMap,
  decorateCommercialStage,
  firstOpenCommercialStage,
} from '../utils/commercialStages.js';

const ORIGINS = ['Diagnóstico APOGEU', 'Indicação', 'Instagram', 'Site', 'Evento', 'Prospecção ativa', 'Parceria', 'Outro'];

function diagnosticPriorityClass(priority) {
  const value = String(priority || '').toUpperCase();
  if (value.includes('ALTA')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value.includes('MÉDIA') || value.includes('MEDIA')) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function DiagnosticLeadSummary({ lead, compact = false }) {
  if (lead?.diagnostic_score == null && lead?.diagnostic_fit_score == null) return null;
  return (
    <div className={compact ? 'mt-3 flex flex-wrap gap-1.5' : 'grid gap-3 sm:grid-cols-3'}>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${diagnosticPriorityClass(lead.diagnostic_priority)}`}>
        {lead.diagnostic_priority || 'Diagnóstico APOGEU'}
      </span>
      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
        Fit {lead.diagnostic_fit_score ?? '—'}/100
      </span>
      <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
        Diagnóstico {lead.diagnostic_score ?? '—'}/40
      </span>
    </div>
  );
}


const DIAGNOSTIC_QUESTIONS = [
  { key: 'q1', label: 'Prospecção', question: 'A prospecção acontece com uma rotina definida?' },
  { key: 'q2', label: 'Processo comercial', question: 'O processo comercial é claro?' },
  { key: 'q3', label: 'Diagnóstico', question: 'Como acontece o diagnóstico do cliente antes da solução?' },
  { key: 'q4', label: 'Objeções', question: 'Como a equipe lida com objeções?' },
  { key: 'q5', label: 'Follow-up', question: 'Como acontece o follow-up?' },
  { key: 'q6', label: 'Indicadores', question: 'Os números do comercial orientam decisões?' },
  { key: 'q7', label: 'Construção de valor', question: 'O cliente entende claramente o valor daquilo que é vendido?' },
  { key: 'q8', label: 'Performance', question: 'A performance se mantém quando a pressão aumenta?' },
];

function parseDiagnosticAnswers(lead) {
  if (!lead?.diagnostic_answers_json) return {};
  try {
    const parsed = JSON.parse(lead.diagnostic_answers_json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function scoreTone(value) {
  const score = Number(value || 0);
  if (score >= 4) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (score === 3) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function DiagnosticMuscleGrid({ lead }) {
  const answers = parseDiagnosticAnswers(lead);
  const hasAnswers = DIAGNOSTIC_QUESTIONS.some(({ key }) => answers[key] != null && answers[key] !== '');
  if (!hasAnswers) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Musculatura comercial</p>
          <p className="mt-1 text-xs text-slate-500">Notas respondidas pelo lead no diagnóstico.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-500">1 a 5</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {DIAGNOSTIC_QUESTIONS.map(({ key, label, question }, index) => {
          const value = answers[key];
          return (
            <div key={key} className="rounded-xl border border-slate-200/80 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{String(index + 1).padStart(2, '0')} · {label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{question}</p>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${scoreTone(value)}`}>{value ?? '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    whatsapp: '',
    cnpj: '',
    instagram: '',
    website: '',
    segment: '',
    position_title: '',
    city: '',
    state: '',
    priority: 'medium',
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
      className="group w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start gap-3">
        <GripVertical size={15} className="mt-0.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{lead.company_name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{lead.contact_name || 'Contato não informado'}</p>
              {(lead.whatsapp || lead.phone) && <p className="mt-1 truncate text-[10px] font-medium text-slate-400">{lead.whatsapp || lead.phone}{lead.city ? ` · ${lead.city}${lead.state ? `/${lead.state}` : ''}` : ''}</p>}
              {lead.source === 'Diagnóstico APOGEU' && (
                <span className="mt-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-700">APOGEU · Diagnóstico</span>
              )}
            </div>
            <OwnerAvatar lead={lead} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            {lead.source === 'Diagnóstico APOGEU' ? (
              <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{lead.diagnostic_primary_gap || lead.diagnostic_classification || 'Diagnóstico recebido'}</span>
            ) : (
              <span className="text-sm font-bold text-slate-800">{formatCurrency(lead.estimated_value)}</span>
            )}
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${safeStage.soft}`}>{lead.probability}%</span>
          </div>
          <DiagnosticLeadSummary lead={lead} compact />
          {lead.segment && (
            <span className="mt-2 mr-1 inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-blue-700">
              <Tag size={10} className="shrink-0" /> <span className="truncate">{lead.segment}</span>
            </span>
          )}
          {lead.priority && lead.source !== 'Diagnóstico APOGEU' && (
            <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${lead.priority === 'high' ? 'bg-rose-50 text-rose-600' : lead.priority === 'low' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
              Prioridade {lead.priority === 'high' ? 'alta' : lead.priority === 'low' ? 'baixa' : 'média'}
            </span>
          )}

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
  const [originFilter, setOriginFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [fitFilter, setFitFilter] = useState('all');
  const [nicheFilter, setNicheFilter] = useState('all');
  const [niches, setNiches] = useState([]);
  const [unclassifiedNicheCount, setUnclassifiedNicheCount] = useState(0);
  const [nicheModalOpen, setNicheModalOpen] = useState(false);
  const [newNicheName, setNewNicheName] = useState('');
  const [applyNicheToUnclassified, setApplyNicheToUnclassified] = useState(false);
  const [savingNiche, setSavingNiche] = useState(false);
  const [nicheNotice, setNicheNotice] = useState('');
  const [dragOverStage, setDragOverStage] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [leadImportOpen, setLeadImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState('');

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
      setNiches([]);
      setUnclassifiedNicheCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [leadResponse, usersResponse, stageResponse, nicheResponse] = await Promise.all([
        api.get('/commercial/leads', { params: { client_id: clientId } }),
        api.get('/commercial/users', { params: { client_id: clientId } }),
        api.get('/commercial/stages', { params: { client_id: clientId } }),
        api.get('/commercial/niches', { params: { client_id: clientId } }),
      ]);
      setLeads(leadResponse.data.leads || []);
      setTeamUsers(usersResponse.data.users || []);
      setStages(stageResponse.data.stages || []);
      setNiches(nicheResponse.data.niches || []);
      setUnclassifiedNicheCount(Number(nicheResponse.data.unclassified_count || 0));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm(null);
    setEditingLead(null);
    setOwnerFilter('all');
    setOriginFilter('all');
    setPriorityFilter('all');
    setFitFilter('all');
    setNicheFilter('all');
    setNicheModalOpen(false);
    setNewNicheName('');
    setNicheNotice('');
    loadData();
  }, [clientId]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (ownerFilter !== 'all' && String(lead.owner_user_id || '') !== ownerFilter) return false;
      if (originFilter === 'apogeu' && lead.source !== 'Diagnóstico APOGEU') return false;
      if (originFilter === 'other' && lead.source === 'Diagnóstico APOGEU') return false;
      if (nicheFilter === '__unclassified__' && String(lead.segment || '').trim()) return false;
      if (nicheFilter !== 'all' && nicheFilter !== '__unclassified__' && String(lead.segment || '').trim().toLowerCase() !== nicheFilter.toLowerCase()) return false;

      const priority = String(lead.priority || lead.diagnostic_priority || '').toUpperCase();
      if (priorityFilter === 'high' && !(priority === 'HIGH' || priority.includes('ALTA'))) return false;
      if (priorityFilter === 'medium' && !(priority === 'MEDIUM' || priority.includes('MÉDIA') || priority.includes('MEDIA'))) return false;
      if (priorityFilter === 'low' && !(priority === 'LOW' || priority.includes('BAIXA'))) return false;

      const fit = Number(lead.diagnostic_fit_score);
      if (fitFilter === '80' && !(Number.isFinite(fit) && fit >= 80)) return false;
      if (fitFilter === '60' && !(Number.isFinite(fit) && fit >= 60 && fit < 80)) return false;
      if (fitFilter === 'below60' && !(Number.isFinite(fit) && fit < 60)) return false;

      if (!term) return true;
      return [
        lead.company_name, lead.contact_name, lead.email, lead.phone, lead.whatsapp, lead.cnpj, lead.instagram,
        lead.website, lead.segment, lead.position_title, lead.city, lead.state, lead.source,
        lead.diagnostic_primary_gap, lead.diagnostic_classification, lead.diagnostic_segment,
        lead.diagnostic_role, lead.diagnostic_priority,
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [leads, ownerFilter, originFilter, priorityFilter, fitFilter, nicheFilter, search]);

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

  function openNicheModal() {
    setNewNicheName('');
    setApplyNicheToUnclassified(niches.length === 0 && unclassifiedNicheCount > 0 && unclassifiedNicheCount === leads.length);
    setNicheNotice('');
    setNicheModalOpen(true);
  }

  async function createNiche(event) {
    event.preventDefault();
    const name = newNicheName.trim();
    if (!name) return;
    setSavingNiche(true);
    try {
      const { data } = await api.post('/commercial/niches', {
        client_id: clientId,
        name,
        apply_to_unclassified: applyNicheToUnclassified,
      });
      setNiches(data.niches || []);
      if (Number(data.updated_count || 0) > 0) {
        setNicheNotice(`${data.updated_count} lead(s) classificados como ${name}.`);
        setNicheFilter(name);
        await loadData();
      } else {
        setNicheNotice(`Nicho “${name}” criado.`);
        setNicheFilter(name);
      }
      setNicheModalOpen(false);
      setNewNicheName('');
    } catch (err) {
      setNicheNotice(err.response?.data?.error || 'Não foi possível criar o nicho.');
    } finally {
      setSavingNiche(false);
    }
  }

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
      whatsapp: lead.whatsapp || '',
      cnpj: lead.cnpj || '',
      instagram: lead.instagram || '',
      website: lead.website || '',
      segment: lead.segment || '',
      position_title: lead.position_title || '',
      city: lead.city || '',
      state: lead.state || '',
      priority: lead.priority || 'medium',
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
      api.get('/commercial/niches', { params: { client_id: clientId } })
        .then(({ data: nicheData }) => {
          setNiches(nicheData.niches || []);
          setUnclassifiedNicheCount(Number(nicheData.unclassified_count || 0));
        })
        .catch(() => {});
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
    <div className="space-y-6">
      <PageHero
        icon={Handshake}
        eyebrow="Gestão comercial por cliente"
        title={currentClient?.name ? `Comercial · ${currentClient.name}` : 'Comercial'}
        description={currentClient?.name
          ? `Pipeline exclusivo de ${currentClient.name}, com oportunidades, responsáveis, propostas e próximos passos separados dos demais clientes.`
          : 'Selecione um cliente no filtro lateral para abrir o pipeline comercial correspondente.'}
        actions={clientId ? (
          <>
            <button type="button" onClick={() => setStageManagerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              <Settings2 size={17} /> Gerenciar quadros
            </button>
            <button type="button" onClick={() => navigate('/comercial/funil')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              <TrendingUp size={17} /> Ver funil
            </button>
            {user?.role !== 'client' && (
              <button type="button" onClick={() => setLeadImportOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
                <Upload size={17} /> Importar leads
              </button>
            )}
            <button type="button" onClick={beginCreate} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5">
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
          <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} className="input-field min-w-[170px]">
            <option value="all">Todas as origens</option>
            <option value="apogeu">Diagnóstico APOGEU</option>
            <option value="other">Outras origens</option>
          </select>
          <select value={nicheFilter} onChange={(event) => setNicheFilter(event.target.value)} className="input-field min-w-[170px]">
            <option value="all">Todos os nichos</option>
            {niches.map((niche) => <option key={niche.id || niche.name} value={niche.name}>{niche.name} ({niche.lead_count || 0})</option>)}
            {unclassifiedNicheCount > 0 && <option value="__unclassified__">Sem nicho ({unclassifiedNicheCount})</option>}
          </select>
          {user?.role !== 'client' && (
            <button type="button" onClick={openNicheModal} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
              <Tag size={15} /> Novo nicho
            </button>
          )}
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="input-field min-w-[160px]">
            <option value="all">Toda prioridade</option>
            <option value="high">Prioridade alta</option>
            <option value="medium">Prioridade média</option>
            <option value="low">Prioridade baixa</option>
          </select>
          <select value={fitFilter} onChange={(event) => setFitFilter(event.target.value)} className="input-field min-w-[135px]">
            <option value="all">Todo Fit</option>
            <option value="80">Fit 80+</option>
            <option value="60">Fit 60–79</option>
            <option value="below60">Fit &lt; 60</option>
          </select>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="input-field min-w-[190px]">
            <option value="all">Todos os responsáveis</option>
            {teamUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          {user?.role !== 'client' && <button type="button" onClick={() => setLeadImportOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"><Upload size={16} /> Importar</button>}
          <button type="button" onClick={beginCreate} className="btn-primary inline-flex items-center gap-2 text-sm"><Plus size={16} /> Adicionar lead</button>
        </div>
      </section>

      {importNotice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <span>{importNotice}</span>
          <button type="button" onClick={() => setImportNotice('')} className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100"><X size={15} /></button>
        </div>
      )}

      {nicheNotice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          <span>{nicheNotice}</span>
          <button type="button" onClick={() => setNicheNotice('')} className="rounded-lg p-1 text-blue-600 hover:bg-blue-100"><X size={15} /></button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />)}
        </div>
      ) : (
        <section className="commercial-board overflow-hidden rounded-[26px] border border-slate-200/70 bg-white/40">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pipeline visual</h2>
              <p className="mt-0.5 text-xs text-slate-500">Arraste as oportunidades entre os quadros. Use “Gerenciar quadros” para criar, renomear, reorganizar ou excluir etapas.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Atualização automática
            </span>
          </div>
          <div className="overflow-x-auto p-4">
          <div className="flex min-w-max gap-4">
            {decoratedStages.map((stage) => {
              const items = filteredLeads.filter((lead) => lead.stage === stage.key);
              const total = items.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
              return (
                <div
                  key={stage.key}
                  onDragOver={(event) => { event.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => setDragOverStage((current) => current === stage.key ? null : current)}
                  onDrop={(event) => onDrop(event, stage.key)}
                  className={`w-[350px] shrink-0 rounded-[22px] border p-3.5 transition ${dragOverStage === stage.key ? 'border-[#0969ff] bg-blue-50/60 shadow-[0_0_0_4px_rgba(9,105,255,0.08)]' : 'border-slate-200/80 bg-slate-50/70 shadow-[0_8px_24px_rgba(15,23,42,0.035)]'}`}
                >
                  <div className="sticky top-0 z-[1] flex items-start justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-3 pb-3 pt-3 shadow-sm backdrop-blur">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                        <h2 className="max-w-[190px] break-words text-sm font-semibold leading-5 text-slate-800">{stage.label}</h2>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{items.length}</span>
                      </div>
                      <p className="mt-1 pl-[18px] text-xs text-slate-400">{formatCurrency(total)}</p>
                    </div>
                    <button type="button" onClick={() => { beginCreate(); setForm((current) => ({ ...current, stage: stage.key, probability: stage.probability })); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm transition hover:text-[#0969ff]" title={`Adicionar em ${stage.label}`}>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {items.map((lead) => <LeadCard key={lead.id} lead={lead} stage={stageMap[lead.stage]} onOpen={beginEdit} onDragStart={onDragStart} />)}
                    {items.length === 0 && (
                      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-5 text-center text-xs leading-5 text-slate-400">
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
            {decoratedStages.filter((stage) => stage.stage_type === 'open').map((stage) => {
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

      {nicheModalOpen && (
        <ModalBackdrop onClose={() => !savingNiche && setNicheModalOpen(false)}>
          <form onSubmit={createNiche} className="w-[min(520px,calc(100vw-32px))] rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Organização comercial</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Criar novo nicho</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Use nichos como Contabilidade, Saúde, Educação, Construção, Imobiliário ou qualquer outro grupo de prospecção.</p>
              </div>
              <button type="button" onClick={() => setNicheModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700">Nome do nicho</label>
            <input autoFocus className="input-field mt-2" value={newNicheName} onChange={(event) => setNewNicheName(event.target.value)} placeholder="Ex: Contabilidade" />
            {unclassifiedNicheCount > 0 && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <input type="checkbox" checked={applyNicheToUnclassified} onChange={(event) => setApplyNicheToUnclassified(event.target.checked)} className="mt-1 h-4 w-4 accent-[#0969ff]" />
                <span>
                  <strong className="block text-sm text-slate-800">Aplicar aos {unclassifiedNicheCount} leads sem nicho</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Ideal para a sua lista atual: crie “Contabilidade” e classifique todos os leads ainda sem nicho de uma vez.</span>
                </span>
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setNicheModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={savingNiche || !newNicheName.trim()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                <Tag size={15} /> {savingNiche ? 'Salvando...' : 'Criar nicho'}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      <CommercialLeadImportModal
        open={leadImportOpen}
        onClose={() => setLeadImportOpen(false)}
        clientId={clientId}
        clientName={currentClient?.name || ''}
        stages={stages}
        teamUsers={teamUsers}
        niches={niches}
        currentUser={user}
        onImported={async (data) => {
          await loadData();
          notifyCommercialUpdated(clientId);
          const stats = data?.stats || {};
          setImportNotice(`Importação concluída: ${stats.created || 0} criados, ${stats.updated || 0} atualizados e ${stats.skipped || 0} ignorados.`);
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
              {editingLead?.diagnostic_score != null && (
                <section className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 to-white p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600">Diagnóstico APOGEU</p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">{editingLead.diagnostic_classification || 'Leitura comercial'}</h3>
                      <p className="mt-1 text-xs text-slate-500">Lead recebido automaticamente pelo diagnóstico online.</p>
                    </div>
                    <DiagnosticLeadSummary lead={editingLead} />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ['Principal área de treino', editingLead.diagnostic_primary_gap],
                      ['Posição', editingLead.diagnostic_role],
                      ['Segmento', editingLead.diagnostic_segment],
                      ['Experiência', editingLead.diagnostic_experience],
                      ['Equipe', editingLead.diagnostic_team_size],
                      ['Prazo', editingLead.diagnostic_timeframe],
                      ['Intenção', editingLead.diagnostic_investment_intent],
                      ['Objetivo', editingLead.diagnostic_objective],
                      ['Cidade', editingLead.diagnostic_city],
                    ].filter(([, value]) => value).map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-orange-100 bg-white/80 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-semibold leading-5 text-slate-800">{value}</p>
                      </div>
                    ))}
                  </div>

                  {editingLead.diagnostic_pain_statement && (
                    <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Dor declarada</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{editingLead.diagnostic_pain_statement}</p>
                    </div>
                  )}
                  {editingLead.diagnostic_reason_now && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Por que agora?</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{editingLead.diagnostic_reason_now}</p>
                    </div>
                  )}

                  <DiagnosticMuscleGrid lead={editingLead} />
                </section>
              )}

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
                    {form.source && !ORIGINS.includes(form.source) && <option value={form.source}>{form.source}</option>}
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
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Dados de prospecção</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">WhatsApp</label><input className="input-field" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="(00) 00000-0000" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">CNPJ</label><input className="input-field" value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: event.target.value })} placeholder="00.000.000/0000-00" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Instagram</label><input className="input-field" value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value })} placeholder="@empresa" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Site</label><input className="input-field" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://..." /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Nicho</label><input className="input-field" list="commercial-niches-list" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} placeholder="Ex: Contabilidade" /><datalist id="commercial-niches-list">{niches.map((niche) => <option key={niche.id || niche.name} value={niche.name} />)}</datalist></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Cargo</label><input className="input-field" value={form.position_title} onChange={(event) => setForm({ ...form, position_title: event.target.value })} placeholder="Ex: Sócio / Diretor" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Cidade</label><input className="input-field" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Natal" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Estado</label><input className="input-field" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="RN" /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Prioridade</label><select className="input-field" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></div>
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
