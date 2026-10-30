import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { Modal, inputCls } from '../components/ReadyVideoParts.jsx';
import AllSignals from '../components/ayrton/AllSignals.jsx';

const LEVELS = {
  critical: { label: 'Crítico', color: '#EC0567', soft: 'rgba(236,5,103,.08)' },
  attention: { label: 'Atenção', color: '#E8890C', soft: 'rgba(232,137,12,.10)' },
  opportunity: { label: 'Oportunidade', color: '#3A85FD', soft: 'rgba(58,133,253,.08)' },
  normal: { label: 'Normal', color: '#16A34A', soft: 'rgba(22,163,74,.08)' },
};
const STATUS_COLOR = { MONITORANDO: '#3A85FD', ANALISANDO: '#C9FF2F', 'AGUARDANDO AÇÃO': '#E8890C', 'TUDO CERTO': '#16A34A', PAUSADO: '#94A3B8' };
const SIGNATURE = 'Se der para evitar o incêndio, prefiro não esperar a fumaça.';
const EVENT_LABEL = { detected: 'Detectado', updated: 'Atualizado', escalated: 'Prioridade subiu', resolved: 'Resolvido', ignored: 'Ignorado', reopened: 'Reaberto', task_created: 'Tarefa criada' };

const fmtDate = (v) => { const d = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : ''; };
const fmtTs = (v) => { if (!v) return ''; const d = new Date(String(v).replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? fmtDate(v) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' }); };
const localDay = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function Dot({ level, size = 10 }) { return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: LEVELS[level]?.color }} />; }
function Chip({ level }) { const l = LEVELS[level]; return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em]" style={{ backgroundColor: l.soft, color: l.color }}><Dot level={level} size={7} />{l.label}</span>; }
const btn = 'inline-flex h-9 items-center justify-center rounded-xl px-3 text-[11px] font-black uppercase tracking-[0.06em] transition disabled:opacity-50';

function IgnoreMenu({ onPick, onClose }) {
  const opts = [['tomorrow', 'Até amanhã'], ['3d', 'Por 3 dias'], ['7d', 'Por 7 dias'], ['forever', 'Definitivamente']];
  return (
    <Modal title="Ignorar por enquanto" subtitle="O histórico é mantido. Se o caso ficar crítico, o Ayrton traz de volta." onClose={onClose}>
      <div className="grid gap-2">{opts.map(([k, l]) => <button key={k} type="button" onClick={() => onPick(k)} className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-bold text-slate-700 hover:border-[#3A85FD]">{l}</button>)}</div>
    </Modal>
  );
}

function TaskModal({ alertId, onClose, onDone }) {
  const [draft, setDraft] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/ayrton/alerts/${alertId}/task-draft`).then((r) => { setDraft(r.data.draft); setF({ title: r.data.draft.title, description: r.data.draft.description, due_date: r.data.draft.due_date, priority: r.data.draft.priority, assignees: [] }); })
      .catch((e) => setErr(e.response?.data?.error || 'Não consegui preparar a tarefa.'));
  }, [alertId]);
  async function create() {
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/tasks', { client_id: draft.client_id, title: f.title, description: f.description, due_date: f.due_date || null, priority: f.priority, assignee_ids: f.assignees, status: 'pending', project_name: 'Sugestão do Ayrton' });
      await api.post(`/ayrton/alerts/${alertId}/link-task`, { task_id: data.id || data.task?.id });
      onDone();
    } catch (e) { setErr(e.response?.data?.error || 'Não foi possível criar a tarefa.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Criar tarefa sugerida" subtitle="Origem: Sugestão do Ayrton. Nada é criado até você confirmar." onClose={onClose} busy={busy}>
      {!f ? <p className="py-6 text-center text-sm text-slate-400">{err || 'Preparando rascunho...'}</p> : (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-500">Título<input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block text-xs font-bold text-slate-500">Descrição<textarea rows={6} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-500">Prazo<input type="date" className={inputCls} value={f.due_date || ''} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
            <label className="block text-xs font-bold text-slate-500">Prioridade<select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">Responsável (sugestões do Ayrton)</p>
            {draft.suggested_assignees.length ? <div className="mt-1 flex flex-wrap gap-2">{draft.suggested_assignees.map((u) => { const on = f.assignees.includes(u.id); return <button key={u.id} type="button" onClick={() => setF({ ...f, assignees: on ? f.assignees.filter((x) => x !== u.id) : [...f.assignees, u.id] })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? 'border-[#3A85FD] bg-[#3A85FD]/10 text-[#2563c9]' : 'border-slate-200 text-slate-600'}`}>{u.name}</button>; })}</div> : <p className="mt-1 text-xs text-slate-400">Sem sugestão — a tarefa será criada sem responsável.</p>}
          </div>
          {err && <p className="text-xs font-bold text-[#B40049]">{err}</p>}
          <button type="button" disabled={busy || !f.title.trim()} onClick={create} className={`${btn} w-full bg-[#17181C] text-white hover:bg-[#3A85FD]`}>{busy ? 'Criando...' : 'Confirmar e criar tarefa'}</button>
        </div>
      )}
    </Modal>
  );
}

function DetailModal({ alertId, onClose, onAction, aiAvailable }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [ai, setAi] = useState('');
  const load = useCallback(() => api.get(`/ayrton/alerts/${alertId}`).then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Não foi possível abrir.')), [alertId]);
  useEffect(() => { load(); }, [load]);
  async function interpret() {
    setAi('Analisando...');
    try { const { data } = await api.post(`/ayrton/alerts/${alertId}/interpret`); if (data.skipped || data.error) setAi(data.skipped ? `Não usei IA: ${data.skipped}.` : data.error); else { setAi(''); load(); } } catch { setAi('Não foi possível interpretar agora.'); }
  }
  const a = d?.alert;
  return (
    <Modal title={a ? a.title : 'Detalhes'} subtitle={a ? `${a.client_name} · ${a.type_label}` : ''} onClose={onClose}>
      {!a ? <p className="py-6 text-center text-sm text-slate-400">{err || 'Carregando...'}</p> : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Chip level={a.level} /><span className="text-[11px] text-slate-400">Prioridade {a.priority_score} · detectado {fmtTs(a.detected_at)} · atualizado {fmtTs(a.last_seen_at)}</span></div>
          <section>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Por que o Ayrton chamou sua atenção?</p>
            <p className="mt-1 leading-6 text-slate-700">{a.message}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">{a.why.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
          {a.ai_insight && <section className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400"><Sparkles size={12} />Interpretação (IA)</p><p className="mt-1 text-xs leading-5 text-slate-600">{a.ai_insight}</p></section>}
          <section>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Ação sugerida</p>
            <p className="mt-1 text-slate-700">{a.action}</p>
          </section>
          <section>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Dados utilizados ({a.total})</p>
            <div className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {a.data_used.map((i, k) => (
                <button key={`${i.kind}-${i.id}-${k}`} type="button" onClick={() => i.link && navigate(i.link)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{i.title}</span><span className="block text-[11px] text-slate-500">{i.detail}{i.assignees?.length ? ` · ${i.assignees.join(', ')}` : ''}</span></span>
                  <ChevronRight size={14} className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
            {a.total > a.data_used.length && <p className="mt-1 text-[11px] text-slate-400">Mostrando {a.data_used.length} de {a.total}.</p>}
          </section>
          {a.related_users.length > 0 && <p className="text-xs text-slate-500"><b>Responsáveis relacionados:</b> {a.related_users.map((u) => u.name).join(', ')}</p>}
          <section>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Histórico deste alerta</p>
            <ul className="mt-1 space-y-1.5">{d.events.map((e, k) => <li key={k} className="text-xs text-slate-600"><b>{EVENT_LABEL[e.type] || e.type}</b> · {fmtTs(e.created_at)}{e.user_name ? ` · ${e.user_name}` : ''}<br /><span className="text-slate-500">{e.note}</span></li>)}</ul>
          </section>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {a.status === 'open' && <>
              <button type="button" className={`${btn} bg-[#17181C] text-white hover:bg-[#3A85FD]`} onClick={() => onAction('task', a.id)}>Criar tarefa</button>
              <button type="button" className={`${btn} border border-slate-200 text-slate-700`} onClick={() => onAction('resolve', a.id)}>Resolver</button>
              <button type="button" className={`${btn} border border-slate-200 text-slate-700`} onClick={() => onAction('ignore', a.id)}>Ignorar por enquanto</button>
              {aiAvailable && <button type="button" className={`${btn} border border-slate-200 text-slate-500`} onClick={interpret}>Interpretar com IA</button>}
            </>}
          </div>
          {ai && <p className="text-xs text-slate-500">{ai}</p>}
        </div>
      )}
    </Modal>
  );
}

function AccountCard({ card, onOpen, onAction }) {
  const l = LEVELS[card.level]; const m = card.main;
  return (
    <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white" style={{ borderLeft: `4px solid ${l.color}` }}>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-950">{card.client_name}</h3><Chip level={card.level} /></div>
        <p className="mt-2 text-sm font-black text-slate-900">{m.title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{m.message}</p>
        <p className="mt-2 text-xs font-bold text-slate-500">Próximo passo: <span className="font-semibold">{m.action}</span></p>
        {card.others.length > 0 && <p className="mt-2 text-[11px] text-slate-400">+ {card.others.map((o) => o.title).join(' · ')}</p>}
        {m.task_id && <p className="mt-2 text-[11px] font-bold text-[#3A85FD]">Tarefa já criada a partir desta sugestão.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-[#17181C] text-white hover:bg-[#3A85FD]`} onClick={() => onOpen(m.id)}>Ver detalhes</button>
          <button type="button" className={`${btn} border border-slate-200 text-slate-700 hover:border-[#3A85FD]`} onClick={() => onAction('task', m.id)}>Criar tarefa</button>
          <button type="button" className={`${btn} border border-slate-200 text-slate-700 hover:border-[#3A85FD]`} onClick={() => onAction('resolve', m.id)}>Resolver</button>
          <button type="button" className={`${btn} text-slate-400 hover:text-slate-700`} onClick={() => onAction('ignore', m.id)}>Ignorar por enquanto</button>
        </div>
      </div>
    </article>
  );
}

export default function Alerts() {
  const { selectedClient } = useClientFilter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null); // {kind:'detail'|'task'|'ignore'|'resolve', id}
  const [showNormal, setShowNormal] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const clientId = selectedClient?.id || null;

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try { const r = await api.get('/ayrton', { params: clientId ? { client_id: clientId } : {} }); setData(r.data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Não consegui fazer a ronda agora.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [clientId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => load(true), 120000);
    const f = () => load(true); window.addEventListener('focus', f);
    return () => { window.clearInterval(t); window.removeEventListener('focus', f); };
  }, [load]);
  useEffect(() => { if (showHistory) api.get('/ayrton/history', { params: clientId ? { client_id: clientId } : {} }).then((r) => setHistory(r.data.events)).catch(() => setHistory([])); }, [showHistory, clientId, data]);

  const flash = (m) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };
  const act = (kind, id) => { setNote(''); setModal({ kind, id }); };
  async function rescan() { setRefreshing(true); try { await api.post('/ayrton/scan'); } catch { /* ignore */ } await load(true); }
  async function ignore(mode) { try { await api.post(`/ayrton/alerts/${modal.id}/ignore`, { mode }); setModal(null); flash('Combinado. Fica no histórico e eu reavalio se piorar.'); load(true); } catch (e) { flash(e.response?.data?.error || 'Não consegui ignorar.'); } }
  async function resolve() { try { await api.post(`/ayrton/alerts/${modal.id}/resolve`, { note }); setModal(null); flash('Marcado como resolvido.'); load(true); } catch (e) { flash(e.response?.data?.error || 'Não consegui resolver.'); } }
  async function unignore(id) { try { await api.post(`/ayrton/alerts/${id}/unignore`); load(true); } catch { flash('Não consegui reabrir.'); } }
  async function ask(text) {
    const question = (text ?? q).trim(); if (!question) return;
    setQ(question); setAsking(true);
    try { const r = await api.post('/ayrton/ask', { question }); setAnswer(r.data); } catch (e) { setAnswer({ answer: e.response?.data?.error || 'Não consegui responder agora.', items: [] }); } finally { setAsking(false); }
  }

  const s = data?.summary; const c = s?.counts;
  const status = data?.agent?.status || 'ANALISANDO';
  const SUGG = ['Qual cliente mais precisa de atenção hoje?', 'Quais clientes estão com calendário atrasado?', 'Existe gravação próxima sem roteiro?', 'Quem tem mais tarefas atrasadas?', 'Quais contas estão esperando aprovação do cliente?', 'Quais publicações aprovadas estão sem data?', 'Quais contas estão tranquilas?'];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#17181C] text-white">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-6 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[#C9FF2F]"><ShieldCheck size={16} /><p className="text-[10px] font-black uppercase tracking-[0.2em]">Guardião da Conta</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-white"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] || '#fff' }} />{status}</span></div>
            <h1 className="mt-3 text-[32px] font-black uppercase leading-[0.95] tracking-[-0.045em] sm:text-[42px]">AYRTON</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">Acompanha a operação dos clientes e identifica o que precisa de atenção antes de virar problema.</p>
            <p className="mt-3 text-[11px] italic text-white/35">“{SIGNATURE}”</p>
          </div>
          <button type="button" onClick={rescan} disabled={refreshing || data?.agent?.paused} style={{ backgroundColor: '#C9FF2F', color: '#17181C' }} className="inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-xs font-black disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refazer ronda</button>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-[#EC0567]/20 bg-[#EC0567]/[0.06] px-4 py-3 text-sm font-bold text-[#B40049]">{error}</div>}
      {loading && <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-12 text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" /><p className="mt-3 text-sm font-black text-slate-700">Fazendo a ronda...</p></div>}

      {data && !loading && (<>
        <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Resumo do Ayrton</p>
          <p className="mt-2 text-lg font-black text-slate-950">{s.greeting} <span className="font-semibold text-slate-600">{s.headline}</span></p>
          <p className="mt-2 text-sm text-slate-600">{c.verified} {c.verified === 1 ? 'conta verificada' : 'contas verificadas'}
            {[['critical', 'crítica', 'críticas'], ['attention', 'precisa de atenção', 'precisam de atenção'], ['opportunity', 'oportunidade', 'oportunidades'], ['normal', 'normal', 'normais']].map(([k, one, many]) => <span key={k}> · <Dot level={k} size={8} /> <b>{c[k]}</b> {c[k] === 1 ? one : many}</span>)}</p>
          {s.priority && <button type="button" onClick={() => act('detail', s.priority.alert_id)} className="mt-3 block w-full rounded-xl px-3 py-2.5 text-left text-sm hover:opacity-90" style={{ backgroundColor: LEVELS[s.priority.level].soft }}><b>Principal prioridade:</b> {s.priority.text}</button>}
          {data.agent.paused && <p className="mt-3 text-xs font-bold text-slate-500">O Ayrton está pausado: a ronda automática não está rodando.</p>}
        </section>

        {data.accounts.length > 0 && <div className="space-y-3">{data.accounts.map((card) => <AccountCard key={card.client_id} card={card} onOpen={(id) => act('detail', id)} onAction={act} />)}</div>}

        {data.normal_accounts.length > 0 && (
          <section className="rounded-[22px] border border-slate-200 bg-white">
            <button type="button" onClick={() => setShowNormal(!showNormal)} className="flex w-full items-center justify-between px-5 py-4 text-left"><span className="flex items-center gap-2 text-sm font-black text-slate-800"><Dot level="normal" />Ver contas sem pendências ({data.normal_accounts.length})</span><ChevronDown size={16} className={`text-slate-400 transition ${showNormal ? 'rotate-180' : ''}`} /></button>
            {showNormal && <ul className="divide-y divide-slate-100 border-t border-slate-100">{data.normal_accounts.map((n) => <li key={n.client_id} className="px-5 py-3 text-sm"><b className="text-slate-800">{n.client_name}</b><span className="block text-xs text-slate-500">{n.notes.length ? `Detalhe menor: ${n.notes.map((x) => x.title).join(', ')}.` : n.quip}</span></li>)}</ul>}
          </section>
        )}

        {data.ignored.length > 0 && (
          <section className="rounded-[22px] border border-slate-200 bg-white">
            <button type="button" onClick={() => setShowIgnored(!showIgnored)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-black text-slate-700">Ignorados por enquanto ({data.ignored.length})<ChevronDown size={16} className={`text-slate-400 transition ${showIgnored ? 'rotate-180' : ''}`} /></button>
            {showIgnored && <ul className="divide-y divide-slate-100 border-t border-slate-100">{data.ignored.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs"><span className="min-w-0"><b className="text-slate-800">{i.client_name}</b> · {i.title}<span className="block text-slate-400">{i.ignored_forever ? 'Definitivamente' : `Até ${fmtDate(i.ignored_until)}`}</span></span><button type="button" onClick={() => unignore(i.id)} className="shrink-0 font-black text-[#3A85FD]">Voltar a acompanhar</button></li>)}</ul>}
          </section>
        )}

        <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Pergunte ao Ayrton sobre a operação</p>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Ex.: qual cliente mais precisa de atenção hoje?" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A85FD]" />
            <button type="submit" disabled={asking || !q.trim()} className={`${btn} h-auto gap-1.5 bg-[#17181C] text-white hover:bg-[#3A85FD]`}><Send size={13} />Perguntar</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">{SUGG.map((t) => <button key={t} type="button" onClick={() => ask(t)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:border-[#3A85FD] hover:text-[#3A85FD]">{t}</button>)}</div>
          {answer && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-bold text-slate-800">{answer.answer}</p>
              {answer.items?.length > 0 && <ul className="mt-2 space-y-1.5">{answer.items.map((it, k) => <li key={k} className="text-xs text-slate-600">{it.client_name && <b>{it.client_name}: </b>}{it.text}{it.alert_id && <button type="button" onClick={() => act('detail', it.alert_id)} className="ml-2 font-black text-[#3A85FD]">ver</button>}</li>)}</ul>}
              <p className="mt-2 text-[10px] text-slate-400">Resposta calculada só com os dados que você tem acesso.</p>
            </div>
          )}
        </section>

        <section className="rounded-[22px] border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowHistory(!showHistory)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-black text-slate-700"><span className="flex items-center gap-2"><History size={15} />Histórico do Ayrton</span><ChevronDown size={16} className={`text-slate-400 transition ${showHistory ? 'rotate-180' : ''}`} /></button>
          {showHistory && <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">{!history ? <li className="px-5 py-4 text-xs text-slate-400">Carregando...</li> : history.length === 0 ? <li className="px-5 py-4 text-xs text-slate-400">Ainda sem registros.</li> : history.map((e) => <li key={e.id} className="px-5 py-3 text-xs"><b className="text-slate-800">{e.client_name}</b> · {EVENT_LABEL[e.type] || e.type} · {e.type_label}<span className="block text-slate-500">{e.note}</span><span className="text-[10px] text-slate-400">{fmtTs(e.created_at)}{e.user_name ? ` · ${e.user_name}` : ''}</span></li>)}</ul>}
        </section>

        <section className="rounded-[22px] border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowSignals(!showSignals)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-black text-slate-700">Todos os sinais da operação (radar completo)<ChevronDown size={16} className={`text-slate-400 transition ${showSignals ? 'rotate-180' : ''}`} /></button>
          {showSignals && <div className="border-t border-slate-100 p-4"><AllSignals clientId={clientId} /></div>}
        </section>
        <p className="px-1 pb-2 text-[11px] leading-5 text-slate-400">O Ayrton só observa, sugere e registra. Ele não publica, não aprova, não fala com clientes e não altera datas ou responsáveis. Quando o problema some do sistema, o alerta se encerra sozinho.</p>
      </>)}

      {modal?.kind === 'detail' && <DetailModal alertId={modal.id} aiAvailable={data?.ai?.available} onClose={() => setModal(null)} onAction={(k, id) => act(k, id)} />}
      {modal?.kind === 'task' && <TaskModal alertId={modal.id} onClose={() => setModal(null)} onDone={() => { setModal(null); flash('Tarefa criada no ZebraHub.'); load(true); }} />}
      {modal?.kind === 'ignore' && <IgnoreMenu onPick={ignore} onClose={() => setModal(null)} />}
      {modal?.kind === 'resolve' && (
        <Modal title="Marcar como resolvido" subtitle="Registra no histórico. Se o problema continuar nos dados, o Ayrton abre de novo na próxima ronda." onClose={() => setModal(null)}>
          <textarea rows={3} className={inputCls} placeholder="O que foi feito? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" onClick={resolve} className={`${btn} mt-3 w-full bg-[#17181C] text-white hover:bg-[#3A85FD]`}>Confirmar</button>
        </Modal>
      )}
      {toast && <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-2xl bg-[#17181C] px-4 py-3 text-xs font-bold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
