import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Grid3x3,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import api from '../api';
import PublicTaskRequest from './PublicTaskRequest.jsx';
import zebrazulMark from '../assets/zebrazul-mark-dark.png';

const TABS = [
  { id: 'inicio', label: 'Início', icon: Sparkles },
  { id: 'aprovar', label: 'Aprovar', icon: CheckCircle2 },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'relatorio', label: 'Relatório', icon: BarChart3 },
  { id: 'materiais', label: 'Materiais', icon: FolderOpen },
  { id: 'solicitar', label: 'Solicitar', icon: Send },
];

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatDate(value, withWeekday = false) {
  if (!value) return 'Sem data';
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return raw;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('pt-BR', withWeekday
    ? { weekday: 'short', day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function monthLabel(value) {
  const [year, month] = String(value || '').split('-');
  const index = Number(month) - 1;
  if (!year || index < 0 || index > 11) return value || '';
  return `${MONTHS[index]} de ${year}`;
}

function contentLabel(value) {
  const map = { feed: 'Feed', reels: 'Reels', story: 'Story', carrossel: 'Carrossel', artigo: 'Artigo' };
  return map[value] || String(value || 'Conteúdo');
}

function statusLabel(status) {
  const map = {
    draft: 'Em preparação',
    pending_approval: 'Esperando você',
    approved: 'Aprovado',
    scheduled: 'Agendado',
    published: 'No ar',
  };
  return map[status] || status || 'Em andamento';
}

function StatCard({ value, label, accent, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="relative min-w-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300">
      <span className="absolute right-0 top-0 h-1.5 w-16" style={{ backgroundColor: accent }} />
      <p className="brand-display text-3xl font-black leading-none text-[#17181C]">{value}</p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p>
    </Tag>
  );
}

function PostThumb({ post, className = '' }) {
  return post.image ? (
    <img src={post.image} alt="" className={`bg-slate-100 object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}><Grid3x3 size={22} /></div>
  );
}

function ApprovalCard({ post, busy, onDecision }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  function requestChanges() {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    if (!feedback.trim()) return;
    onDecision(post, 'rejected', feedback.trim());
  }

  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
      <div className="grid sm:grid-cols-[180px_1fr]">
        <PostThumb post={post} className="aspect-[4/3] h-full min-h-[180px] w-full sm:aspect-auto" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#EC0567]">A bola tá com você</p>
              <h3 className="mt-1 text-lg font-black leading-tight text-[#17181C]">{post.title}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-400">{contentLabel(post.content_type)}{post.scheduled_at ? ` · ${formatDate(post.scheduled_at)}` : ''}</p>
            </div>
          </div>
          {post.caption ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{post.caption}</p> : null}
          {showFeedback ? (
            <div className="mt-4 rounded-2xl border border-[#EC0567]/25 bg-[#EC0567]/[0.045] p-3">
              <label className="text-xs font-black uppercase tracking-[.1em] text-[#EC0567]">O que precisa mudar?</label>
              <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Escreva o ajuste de forma objetiva." className="mt-2 min-h-[92px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3A85FD]" />
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => onDecision(post, 'approved', '')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#C9FF2F] px-4 text-sm font-black text-[#17181C] transition hover:brightness-95 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />} Aprovar
            </button>
            <button type="button" disabled={busy} onClick={requestChanges} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#EC0567] px-4 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50">
              <MessageSquareText size={16} /> {showFeedback ? 'Enviar ajuste' : 'Pedir ajuste'}
            </button>
            {showFeedback ? <button type="button" onClick={() => { setShowFeedback(false); setFeedback(''); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-500"><X size={15} /> Cancelar</button> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center sm:p-10">
      <CheckCircle2 className="mx-auto text-[#3A85FD]" size={28} />
      <p className="brand-display mt-3 text-2xl font-black uppercase text-[#17181C]">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export default function ClientPortal({ tokenOverride = null, embedded = false }) {
  const params = useParams();
  const token = tokenOverride || params.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('inicio');
  const [busyPostId, setBusyPostId] = useState(null);
  const [notice, setNotice] = useState('');
  const [openingMaterial, setOpeningMaterial] = useState(null);

  async function loadPortal({ quiet = false } = {}) {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const { data: body } = await api.get(`/public/portal/${token}`);
      setData(body);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir este portal.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { loadPortal(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(post, status, feedback) {
    if (!data?.links?.feed_token) return;
    setBusyPostId(post.id);
    setNotice('');
    try {
      await api.put(`/public/feed/${data.links.feed_token}/posts/${post.id}`, { status, client_feedback: feedback || null });
      setNotice(status === 'approved' ? 'Aprovado. A equipe já recebeu o sinal.' : 'Ajuste enviado. A bola voltou para a equipe.');
      await loadPortal({ quiet: true });
    } catch (err) {
      setNotice(err.response?.data?.error || 'Não foi possível registrar sua decisão.');
    } finally {
      setBusyPostId(null);
    }
  }

  async function openMaterial(material) {
    setOpeningMaterial(material.id);
    setNotice('');
    try {
      const { data: access } = await api.get(`/public/portal/${token}/materials/${material.id}/access`);
      window.open(access.view_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setNotice(err.response?.data?.error || 'Não foi possível abrir este material.');
    } finally {
      setOpeningMaterial(null);
    }
  }

  const groupedUpcoming = useMemo(() => {
    const map = new Map();
    for (const item of data?.upcoming || []) {
      const key = String(item.scheduled_at || '').slice(0, 10) || 'sem-data';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [data?.upcoming]);

  const reportPlatforms = useMemo(() => Object.entries(data?.report?.by_platform || {}).sort((a, b) => b[1] - a[1]), [data?.report]);

  if (loading) {
    return <div className={`${embedded ? 'min-h-[55vh]' : 'min-h-screen'} flex items-center justify-center bg-[#F5F3EE]`}><div className="text-center"><img src={zebrazulMark} alt="Zebrazul" className="mx-auto mb-5 h-12 w-auto" /><p className="inline-flex items-center gap-2 text-sm font-black text-[#17181C]"><Loader2 size={17} className="animate-spin text-[#3A85FD]" /> ABRINDO SEU ESPAÇO.</p></div></div>;
  }

  if (error || !data) {
    return <div className={`${embedded ? 'min-h-[55vh]' : 'min-h-screen'} flex items-center justify-center bg-[#F5F3EE] p-5`}><div className="w-full max-w-md border-l-4 border-[#EC0567] bg-white p-8 text-center"><img src={zebrazulMark} alt="Zebrazul" className="mx-auto mb-5 h-11 w-auto" /><p className="brand-display text-2xl font-black uppercase text-[#17181C]">PORTAL FORA DO AR.</p><p className="mt-2 text-sm leading-6 text-slate-500">{error || 'Solicite um novo link à equipe.'}</p></div></div>;
  }

  const { client, summary, approvals = [], upcoming = [], report, materials = [] } = data;
  const outerClass = embedded ? 'bg-transparent' : 'min-h-screen bg-[#F5F3EE]';

  return (
    <div className={`${outerClass} text-[#17181C]`}>
      <div className={`mx-auto max-w-7xl ${embedded ? 'px-0 pb-8' : 'px-4 py-5 sm:px-6 sm:py-8'}`}>
        <header className="relative overflow-hidden rounded-[30px] bg-[#17181C] p-6 text-white sm:p-8">
          <span className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full border-[38px] border-[#3A85FD]/55" />
          <span className="pointer-events-none absolute -bottom-24 right-24 h-44 w-44 rounded-full border-[34px] border-[#EC0567]/55" />
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              {client.avatar_data ? <img src={client.avatar_data} alt="" className="h-16 w-16 shrink-0 rounded-[20px] bg-white object-cover ring-1 ring-white/20" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#3A85FD] text-2xl font-black">{client.name?.[0]?.toUpperCase()}</div>}
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#C9FF2F]">Seu espaço com a Zebrazul</p>
                <h1 className="brand-display mt-2 truncate text-3xl font-black uppercase leading-none tracking-tight sm:text-5xl">{client.name}</h1>
                <p className="mt-2 text-sm text-white/55">Aprovações, calendário, entregas e solicitações. Tudo no mesmo lugar.</p>
              </div>
            </div>
            <img src={zebrazulMark} alt="Zebrazul" className="hidden h-14 w-auto rounded-2xl bg-white p-1.5 sm:block" />
          </div>
        </header>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Navegação do portal">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const badge = tab.id === 'aprovar' && summary.approval_pending ? summary.approval_pending : null;
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-black transition ${active ? 'bg-[#17181C] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><Icon size={15} /> {tab.label}{badge ? <span className="ml-0.5 rounded-full bg-[#EC0567] px-1.5 py-0.5 text-[9px] text-white">{badge}</span> : null}</button>;
          })}
        </nav>

        {notice ? <div className="mt-4 rounded-2xl border border-[#3A85FD]/20 bg-[#3A85FD]/[0.06] px-4 py-3 text-sm font-semibold text-slate-700">{notice}</div> : null}

        {activeTab === 'inicio' ? (
          <div className="mt-5 space-y-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard value={summary.approval_pending} label="Pra aprovar" accent="#EC0567" onClick={() => setActiveTab('aprovar')} />
              <StatCard value={summary.corrections} label="Em ajuste" accent="#17181C" />
              <StatCard value={summary.upcoming} label="Próximos" accent="#3A85FD" onClick={() => setActiveTab('calendario')} />
              <StatCard value={summary.posted_month} label="No ar este mês" accent="#C9FF2F" onClick={() => setActiveTab('relatorio')} />
              <div className="col-span-2 lg:col-span-1"><StatCard value={summary.materials} label="Materiais" accent="#3A85FD" onClick={() => setActiveTab('materiais')} /></div>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#EC0567]">O que precisa de você</p><h2 className="mt-1 text-xl font-black">Aprovações</h2></div>{approvals.length ? <button type="button" onClick={() => setActiveTab('aprovar')} className="inline-flex items-center gap-1 text-xs font-black text-[#3A85FD]">Ver tudo <ArrowRight size={14} /></button> : null}</div>
              {approvals.length ? <div className="grid gap-3 md:grid-cols-2">{approvals.slice(0, 4).map((post) => <button key={post.id} type="button" onClick={() => setActiveTab('aprovar')} className="flex min-w-0 items-center gap-3 rounded-[20px] border border-slate-200 bg-white p-3 text-left hover:border-slate-300"><PostThumb post={post} className="h-20 w-20 shrink-0 rounded-2xl" /><div className="min-w-0"><p className="truncate text-sm font-black">{post.title}</p><p className="mt-1 text-xs text-slate-400">{contentLabel(post.content_type)}{post.scheduled_at ? ` · ${formatDate(post.scheduled_at)}` : ''}</p><span className="mt-2 inline-flex rounded-full bg-[#EC0567]/10 px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-[#EC0567]">Esperando você</span></div></button>)}</div> : <EmptyState title="Nada esperando você." description="Quando uma peça chegar para aprovação, ela aparece aqui." />}
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
              <div>
                <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#3A85FD]">O que vem pela frente</p><h2 className="mt-1 text-xl font-black">Próximos conteúdos</h2></div>
                {upcoming.length ? <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">{upcoming.slice(0, 6).map((post, index) => <div key={post.id} className={`flex items-center gap-3 p-3.5 ${index ? 'border-t border-slate-100' : ''}`}><div className="w-14 shrink-0 text-center"><p className="text-[10px] font-black uppercase text-slate-400">{formatDate(post.scheduled_at)}</p></div><PostThumb post={post} className="h-12 w-12 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{post.title}</p><p className="text-xs text-slate-400">{contentLabel(post.content_type)} · {statusLabel(post.status)}</p></div></div>)}</div> : <EmptyState title="Calendário respirando." description="Nenhum conteúdo futuro foi datado ainda." />}
              </div>
              <div>
                <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#C9FF2F]">O que já deixou rastro</p><h2 className="mt-1 text-xl font-black">{monthLabel(report.month)}</h2></div>
                <div className="rounded-[24px] bg-[#17181C] p-5 text-white"><p className="brand-display text-5xl font-black">{report.total}</p><p className="mt-1 text-xs font-black uppercase tracking-[.14em] text-white/45">conteúdos publicados</p><button type="button" onClick={() => setActiveTab('relatorio')} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C9FF2F] px-4 text-sm font-black text-[#17181C]">Ver relatório <ArrowRight size={16} /></button></div>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'aprovar' ? (
          <section className="mt-5 space-y-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#EC0567]">A bola tá com você</p><h2 className="brand-display mt-1 text-3xl font-black uppercase">Aprovações</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Aprove o que está pronto ou devolva com um ajuste objetivo. Quando você decide, a equipe recebe o sinal na hora.</p></div>
            {approvals.length ? approvals.map((post) => <ApprovalCard key={post.id} post={post} busy={busyPostId === post.id} onDecision={decide} />) : <EmptyState title="Tudo resolvido." description="Não existe nenhuma peça esperando sua decisão agora." />}
          </section>
        ) : null}

        {activeTab === 'calendario' ? (
          <section className="mt-5">
            <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#3A85FD]">O que vem pela frente</p><h2 className="brand-display mt-1 text-3xl font-black uppercase">Calendário</h2><p className="mt-2 text-sm text-slate-500">Conteúdos que já têm data dentro da operação.</p></div>
            {groupedUpcoming.length ? <div className="space-y-4">{groupedUpcoming.map(([date, items]) => <div key={date} className="grid gap-3 md:grid-cols-[150px_1fr]"><div className="pt-2"><p className="text-xs font-black uppercase tracking-[.1em] text-slate-400">{formatDate(date, true)}</p></div><div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">{items.map((post, index) => <div key={post.id} className={`flex items-center gap-3 p-3.5 ${index ? 'border-t border-slate-100' : ''}`}><PostThumb post={post} className="h-14 w-14 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{post.title}</p><p className="mt-1 text-xs text-slate-400">{contentLabel(post.content_type)}</p></div><span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-slate-500 sm:inline-flex">{statusLabel(post.status)}</span></div>)}</div></div>)}</div> : <EmptyState title="Sem datas por enquanto." description="Assim que a equipe datar os próximos conteúdos, o calendário aparece aqui." />}
          </section>
        ) : null}

        {activeTab === 'relatorio' ? (
          <section className="mt-5 space-y-5">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#C9FF2F]">O que foi pro mundo</p><h2 className="brand-display mt-1 text-3xl font-black uppercase">{monthLabel(report.month)}</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard value={report.total} label="Posts postados" accent="#C9FF2F" />{reportPlatforms.slice(0, 3).map(([platform, value], index) => <StatCard key={platform} value={value} label={platform.replaceAll('_', ' ')} accent={index % 2 ? '#EC0567' : '#3A85FD'} />)}</div>
            {report.items?.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{report.items.map((item) => <article key={item.id} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">{item.image ? <img src={item.image} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-slate-300"><FileText /></div>}<div className="p-3"><p className="line-clamp-2 text-sm font-black leading-snug">{item.title}</p><p className="mt-1 text-xs text-slate-400">{formatDate(item.date)} · {contentLabel(item.content_type)}</p></div></article>)}</div> : <EmptyState title="Nada foi ao ar neste mês." description="Quando as postagens forem registradas como publicadas, elas aparecem aqui." />}
          </section>
        ) : null}

        {activeTab === 'materiais' ? (
          <section className="mt-5">
            <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#3A85FD]">Tudo que vale guardar</p><h2 className="brand-display mt-1 text-3xl font-black uppercase">Materiais</h2><p className="mt-2 text-sm text-slate-500">Apresentações, guias e materiais compartilhados com sua conta.</p></div>
            {materials.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{materials.map((material) => <article key={material.id} className="rounded-[22px] border border-slate-200 bg-white p-5"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3A85FD]/10 text-[#3A85FD]"><FileText size={20} /></div><div className="min-w-0 flex-1"><p className="font-black leading-tight">{material.title}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{material.category || 'Material'}</p></div></div>{material.description ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-500">{material.description}</p> : null}<button type="button" disabled={openingMaterial === material.id} onClick={() => openMaterial(material)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17181C] px-4 text-sm font-black text-white disabled:opacity-50">{openingMaterial === material.id ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />} Abrir material</button></article>)}</div> : <EmptyState title="Nada guardado aqui ainda." description="Quando a equipe compartilhar um material com sua conta, ele aparece neste espaço." />}
          </section>
        ) : null}

        {activeTab === 'solicitar' ? (
          <section className="mt-5">
            <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#EC0567]">Precisa de alguma coisa?</p><h2 className="brand-display mt-1 text-3xl font-black uppercase">Nova solicitação</h2><p className="mt-2 text-sm text-slate-500">Manda por aqui. A demanda entra direto na operação da equipe.</p></div>
            {data.links.request_token ? <PublicTaskRequest token={data.links.request_token} embedded /> : <EmptyState title="Solicitações indisponíveis." description="Peça à equipe para habilitar o canal de solicitações deste portal." />}
          </section>
        ) : null}

        {!embedded ? <footer className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-6 text-center sm:flex-row sm:text-left"><div className="flex items-center gap-2"><img src={zebrazulMark} alt="" className="h-8 w-auto" /><span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Zebrazul · o que só você pode ser</span></div><p className="text-xs text-slate-400">Portal de acompanhamento · {client.name}</p></footer> : null}
      </div>
    </div>
  );
}
