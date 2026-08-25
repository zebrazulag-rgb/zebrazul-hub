import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  HeartHandshake,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import api from '../api';

const SURVEY_URL = 'https://app.zebrazul.com.br/npsbee';

const RISK_META = {
  strong: { label: 'Vínculo forte', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500', ring: 'ring-emerald-100' },
  stable: { label: 'Estável', badge: 'bg-sky-50 text-sky-700 border-sky-100', dot: 'bg-sky-500', ring: 'ring-sky-100' },
  attention: { label: 'Atenção', badge: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500', ring: 'ring-amber-100' },
  high: { label: 'Risco alto', badge: 'bg-rose-50 text-rose-700 border-rose-100', dot: 'bg-rose-500', ring: 'ring-rose-100' },
};

const STATUS_META = {
  new: { label: 'Nova resposta', badge: 'bg-slate-100 text-slate-600' },
  in_follow_up: { label: 'Em acompanhamento', badge: 'bg-violet-50 text-violet-700' },
  resolved: { label: 'Acompanhamento concluído', badge: 'bg-emerald-50 text-emerald-700' },
};

const SIGNAL_LABELS = {
  wellbeing: 'Bem-estar',
  christian_alignment: 'Alinhamento cristão',
  value_perception: 'Valor percebido',
  future_fit: 'Adequação futura',
  detractor: 'NPS detrator',
  contact_requested: 'Solicitou contato',
};

const SCORE_FIELDS = [
  ['experience', 'Experiência geral'],
  ['wellbeing', 'Bem-estar do aluno'],
  ['development', 'Desenvolvimento'],
  ['christian_alignment', 'Proposta cristã'],
  ['communication', 'Comunicação'],
  ['support', 'Acolhimento'],
  ['value_perception', 'Valor percebido'],
  ['future_fit', 'Adequação da proposta'],
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600',
    yellow: 'bg-[#FFF6DD] text-[#9A6B00]',
    green: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{helper}</p></div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone] || tones.slate}`}><Icon size={17} /></span>
      </div>
    </article>
  );
}

function RiskBadge({ level }) {
  const meta = RISK_META[level] || RISK_META.stable;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black ${meta.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

function ScoreBar({ label, value }) {
  const score = Math.max(1, Math.min(5, Number(value || 1)));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-600">{label}</span><span className="text-[10px] font-black text-slate-900">{score}/5</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#EBAE20]" style={{ width: `${score * 20}%` }} /></div>
    </div>
  );
}

function ResponseDrawer({ response, clientId, onClose, onUpdated, notify }) {
  const [status, setStatus] = useState(response?.follow_up_status || 'new');
  const [notes, setNotes] = useState(response?.follow_up_notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(response?.follow_up_status || 'new');
    setNotes(response?.follow_up_notes || '');
  }, [response?.id]);

  if (!response) return null;
  const risk = RISK_META[response.risk_level] || RISK_META.stable;

  async function save(nextStatus = status) {
    setSaving(true);
    try {
      const { data } = await api.patch(`/bee-family-survey/${response.id}`, {
        client_id: clientId,
        follow_up_status: nextStatus,
        follow_up_notes: notes,
      });
      onUpdated(data.response);
      setStatus(data.response.follow_up_status);
      notify('Acompanhamento da família atualizado.', 'success');
    } catch (error) {
      notify(error.response?.data?.error || 'Não foi possível atualizar o acompanhamento.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/45 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="h-full w-full max-w-[620px] overflow-y-auto bg-[#F7F8FB] shadow-[-20px_0_60px_rgba(15,23,42,0.2)]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div><div className="flex flex-wrap items-center gap-2"><RiskBadge level={response.risk_level} /><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${STATUS_META[response.follow_up_status]?.badge || STATUS_META.new.badge}`}>{STATUS_META[response.follow_up_status]?.label || 'Nova resposta'}</span></div><h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">{response.responsible_name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Responsável por {response.student_name}</p></div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50"><X size={17} /></button>
          </div>
        </header>

        <div className="space-y-4 p-5 sm:p-7">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className={`rounded-2xl bg-white p-4 ring-4 ${risk.ring}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Índice de vínculo</p><p className="mt-2 text-3xl font-black text-slate-950">{response.health_score}<span className="text-sm text-slate-300">/100</span></p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">NPS individual</p><p className="mt-2 text-3xl font-black text-slate-950">{response.nps}<span className="text-sm text-slate-300">/10</span></p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Recebida em</p><p className="mt-2 text-xs font-black leading-5 text-slate-700">{formatDate(response.received_at)}</p></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[['Aluno', response.student_name], ['Responsável', response.responsible_name], ['WhatsApp', response.whatsapp], ['E-mail', response.email || '—'], ['Unidade', response.unit], ['Escola / turma', `${response.school} · ${response.class_group}`]].map(([label, value]) => <div key={label}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-[11px] font-bold leading-5 text-slate-700">{value}</p></div>)}
            </div>
            {response.family_name ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-[10px] font-bold text-emerald-700">Vinculada automaticamente à família “{response.family_name}” no CRM.</div> : <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] font-bold text-slate-500">Ainda não vinculada a uma família cadastrada no CRM.</div>}
          </section>

          {response.risk_signals?.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" /><div><h3 className="text-xs font-black text-amber-900">Sinais que pedem atenção</h3><div className="mt-2 flex flex-wrap gap-1.5">{response.risk_signals.map((signal) => <span key={signal} className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-amber-700 shadow-sm">{SIGNAL_LABELS[signal] || signal}</span>)}</div></div></div></section> : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-xs font-black text-slate-900">Leitura detalhada da experiência</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">{SCORE_FIELDS.map(([key, label]) => <ScoreBar key={key} label={label} value={response[key]} />)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Vínculo declarado</p><p className="mt-1 text-sm font-black text-slate-800">{response.relationship}/5</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Solicitou contato</p><p className={`mt-1 text-sm font-black ${response.contact_requested ? 'text-rose-600' : 'text-slate-800'}`}>{response.contact_requested ? 'Sim' : 'Não'}</p></div></div></section>

          <section className="grid gap-3 sm:grid-cols-2"><article className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">O que fortalece a confiança</p><p className="mt-3 whitespace-pre-wrap text-[11px] leading-6 text-slate-600">{response.trust_strength || 'Não informado.'}</p></article><article className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-wider text-amber-600">O que pode ser aprimorado</p><p className="mt-3 whitespace-pre-wrap text-[11px] leading-6 text-slate-600">{response.improvement || 'Não informado.'}</p></article></section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><MessageCircle size={16} className="text-[#A67506]" /><h3 className="text-xs font-black text-slate-900">Acompanhamento da equipe</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]"><label><span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-slate-400">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-[#EBAE20]"><option value="new">Nova resposta</option><option value="in_follow_up">Em acompanhamento</option><option value="resolved">Concluído</option></select></label><label><span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-slate-400">Registro interno</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-5 text-slate-700 outline-none focus:border-[#EBAE20]" placeholder="Registre a conversa, responsável e próxima ação..." /></label></div><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => save('in_follow_up')} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black text-slate-600 disabled:opacity-50">Iniciar acompanhamento</button><button type="button" onClick={() => save('resolved')} disabled={saving} className="rounded-xl bg-[#1C1C1C] px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Concluir acompanhamento'}</button></div></section>
        </div>
      </aside>
    </div>
  );
}

export default function BeeFamilySurveyDashboard({ clientId, notify, showIntro = true }) {
  const [data, setData] = useState({ summary: null, responses: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await api.get('/bee-family-survey', { params: { client_id: clientId } });
      setData(response.data);
      setSelected((current) => current
        ? (response.data.responses.find((item) => Number(item.id) === Number(current.id)) || current)
        : null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar as respostas da pesquisa.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (data.responses || []).filter((item) => {
      if (riskFilter !== 'all' && item.risk_level !== riskFilter) return false;
      if (!term) return true;
      return [item.responsible_name, item.student_name, item.unit, item.school, item.class_group, item.whatsapp]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [data.responses, search, riskFilter]);

  async function copySurveyLink() {
    try {
      await navigator.clipboard.writeText(SURVEY_URL);
      notify('Link da pesquisa copiado.', 'success');
    } catch {
      notify('Não foi possível copiar o link automaticamente.', 'error');
    }
  }

  function updateResponse(updated) {
    setData((current) => ({ ...current, responses: current.responses.map((item) => Number(item.id) === Number(updated.id) ? updated : item) }));
    setSelected(updated);
    load({ silent: true });
  }

  if (loading) return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white"><div className="flex items-center gap-3 text-xs font-bold text-slate-500"><RefreshCw size={16} className="animate-spin text-[#A67506]" />Carregando respostas...</div></div>;

  const summary = data.summary || {};

  return (
    <div className="space-y-4">
      {showIntro ? <section className="overflow-hidden rounded-[24px] border border-[#F0D990] bg-gradient-to-r from-[#FFF8E5] to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-xl"><div className="flex items-center gap-2 text-[#9A6B00]"><HeartHandshake size={18} /><span className="text-[10px] font-black uppercase tracking-[0.12em]">Pesquisa de experiência e vínculo</span></div><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Ouvir antes que um incômodo se transforme em afastamento.</h2><p className="mt-1.5 text-xs leading-5 text-slate-500">Cada resposta chega identificada, classificada e pronta para um acompanhamento cuidadoso.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={copySurveyLink} className="inline-flex items-center gap-2 rounded-xl border border-[#E7C65C] bg-white px-4 py-2.5 text-[10px] font-black text-[#7B5700]"><Copy size={14} />Copiar link</button><a href={SURVEY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#1C1C1C] px-4 py-2.5 text-[10px] font-black text-white"><ExternalLink size={14} />Abrir pesquisa</a></div></div>
      </section> : (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F0D990] bg-[#FFF9E9] px-4 py-3">
          <p className="text-xs font-semibold text-[#795500]">Cada resposta chega identificada e classificada somente para a equipe.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copySurveyLink} className="inline-flex items-center gap-2 rounded-xl border border-[#E7C65C] bg-white px-3.5 py-2 text-[10px] font-black text-[#7B5700]"><Copy size={14} />Copiar link</button>
            <a href={SURVEY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#1C1C1C] px-3.5 py-2 text-[10px] font-black text-white"><ExternalLink size={14} />Abrir pesquisa</a>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={UsersRound} label="Respostas" value={summary.total || 0} helper="famílias ouvidas" /><MetricCard icon={HeartHandshake} label="Vínculo médio" value={`${summary.average_health || 0}/100`} helper="índice interno" tone="yellow" /><MetricCard icon={Sparkles} label="NPS" value={summary.nps || 0} helper={`${summary.promoters || 0} promotoras`} tone="green" /><MetricCard icon={ShieldAlert} label="Pedem atenção" value={(summary.high || 0) + (summary.attention || 0)} helper={`${summary.pending_follow_up || 0} aguardando cuidado`} tone="rose" /></section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="text-sm font-black text-slate-950">Respostas das famílias</h3><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{filtered.length} de {data.responses?.length || 0} respostas visíveis</p></div><div className="flex flex-1 flex-wrap justify-end gap-2"><label className="relative min-w-[210px] flex-1 sm:max-w-[300px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-[10px] font-semibold outline-none focus:border-[#EBAE20]" placeholder="Buscar família ou aluno" /></label><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-600 outline-none focus:border-[#EBAE20]"><option value="all">Todos os vínculos</option><option value="high">Risco alto</option><option value="attention">Atenção</option><option value="stable">Estável</option><option value="strong">Vínculo forte</option></select><button type="button" onClick={() => load({ silent: true })} disabled={refreshing} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button></div></div>

        {error ? <div className="m-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] font-bold text-rose-700"><AlertTriangle size={15} />{error}</div> : null}

        {!filtered.length ? <div className="grid min-h-[280px] place-items-center px-5 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ClipboardList size={20} /></span><h4 className="mt-4 text-sm font-black text-slate-700">Nenhuma resposta encontrada</h4><p className="mt-1 text-[10px] leading-5 text-slate-400">Compartilhe o link da pesquisa com as famílias ou ajuste os filtros.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="bg-slate-50/80"><tr>{['Família', 'Unidade / turma', 'Índice', 'NPS', 'Classificação', 'Acompanhamento', ''].map((label) => <th key={label} className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</th>)}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-t border-slate-100 transition hover:bg-slate-50/60"><td className="px-4 py-3.5"><p className="text-[11px] font-black text-slate-800">{item.responsible_name}</p><p className="mt-0.5 text-[9px] font-semibold text-slate-400">Aluno: {item.student_name}</p></td><td className="px-4 py-3.5"><p className="text-[10px] font-bold text-slate-600">{item.unit} · {item.class_group}</p><p className="mt-0.5 max-w-[220px] truncate text-[9px] text-slate-400">{item.school}</p></td><td className="px-4 py-3.5"><p className="text-base font-black text-slate-900">{item.health_score}<span className="text-[9px] text-slate-300">/100</span></p></td><td className="px-4 py-3.5"><p className="text-sm font-black text-slate-700">{item.nps}<span className="text-[9px] text-slate-300">/10</span></p></td><td className="px-4 py-3.5"><div className="flex flex-wrap items-center gap-1.5"><RiskBadge level={item.risk_level} />{item.contact_requested ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[8px] font-black text-violet-700">Pediu contato</span> : null}</div></td><td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${STATUS_META[item.follow_up_status]?.badge || STATUS_META.new.badge}`}>{STATUS_META[item.follow_up_status]?.label || 'Nova resposta'}</span></td><td className="px-4 py-3.5 text-right"><button type="button" onClick={() => setSelected(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-black text-slate-600 hover:border-[#EBAE20] hover:text-[#7B5700]">Ver resposta</button></td></tr>)}</tbody></table></div>}
      </section>

      <ResponseDrawer response={selected} clientId={clientId} onClose={() => setSelected(null)} onUpdated={updateResponse} notify={notify} />
    </div>
  );
}
