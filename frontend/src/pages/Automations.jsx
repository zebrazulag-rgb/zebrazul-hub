import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import api from '../api';

const RULE_ACCENTS = {
  correction_open: { accent: '#EC0567', soft: 'rgba(236,5,103,.08)' },
  due_tomorrow: { accent: '#17181C', soft: 'rgba(23,24,28,.06)' },
  client_waiting: { accent: '#3A85FD', soft: 'rgba(58,133,253,.08)' },
  approved_undated: { accent: '#C9FF2F', soft: 'rgba(201,255,47,.24)' },
  video_stalled: { accent: '#7C3AED', soft: 'rgba(124,58,237,.08)' },
};

const COOLDOWN_OPTIONS = [8, 12, 20, 24, 48, 72];

function relativeTime(value) {
  if (!value) return 'ainda não rodou';
  const normalized = String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'agora';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function formatTimestamp(value) {
  if (!value) return '';
  const normalized = String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function Stat({ label, value, helper, accent = '#17181C' }) {
  return (
    <div className="min-w-0 border-r border-white/10 px-5 py-4 last:border-r-0">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-[-0.04em]" style={{ color: accent }}>{value}</p>
      {helper && <p className="mt-1 truncate text-[10px] font-semibold text-white/35">{helper}</p>}
    </div>
  );
}

function RuleCard({ rule, canManage, busy, onToggle, onCooldown }) {
  const meta = RULE_ACCENTS[rule.key] || RULE_ACCENTS.due_tomorrow;
  return (
    <article className={`overflow-hidden rounded-[26px] border bg-white transition ${rule.enabled ? 'border-slate-200' : 'border-slate-200/70 opacity-[0.78]'}`}>
      <div className="flex items-start gap-4 px-5 py-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: meta.soft, color: meta.accent }}>
          {rule.enabled ? <Zap size={19} /> : <PauseCircle size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: meta.accent }}>{rule.eyebrow}</p>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${rule.enabled ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-slate-100 text-slate-400'}`}>{rule.enabled ? 'Ligada' : 'Pausada'}</span>
          </div>
          <h2 className="mt-1 text-base font-black tracking-[-0.02em] text-[#17181C]">{rule.label}</h2>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">{rule.description}</p>
        </div>
        <button
          type="button"
          disabled={!canManage || busy}
          onClick={() => onToggle(rule)}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3A85FD]/40 disabled:cursor-not-allowed disabled:opacity-45 ${rule.enabled ? 'bg-[#17181C]' : 'bg-slate-200'}`}
          aria-label={`${rule.enabled ? 'Pausar' : 'Ativar'} ${rule.label}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full transition ${rule.enabled ? 'left-6 bg-[#C9FF2F]' : 'left-1 bg-white'}`} />
        </button>
      </div>
      <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Quando dispara</p>
          <p className="mt-1 text-xs font-bold text-slate-700">{rule.trigger}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Quem recebe</p>
          <p className="mt-1 text-xs font-bold text-slate-700">{rule.recipients}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-400"><Clock3 size={14} /><span>Se continuar, pode lembrar novamente após</span></div>
        <select
          value={rule.cooldown_hours}
          disabled={!canManage || busy}
          onChange={(event) => onCooldown(rule, Number(event.target.value))}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-[#3A85FD] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          aria-label={`Intervalo de repetição de ${rule.label}`}
        >
          {COOLDOWN_OPTIONS.map((hours) => <option key={hours} value={hours}>{hours}h</option>)}
        </select>
      </div>
    </article>
  );
}

export default function Automations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyRule, setBusyRule] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await api.get('/automations');
      setData(response.data || null);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar as automações agora.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => load(true), 60000);
    return () => window.clearInterval(interval);
  }, [load]);

  const rules = data?.rules || [];
  const summary = data?.summary || { active_rules: 0, total_rules: 5, sent_24h: 0, sent_7d: 0, last_run: null };
  const canManage = Boolean(data?.can_manage);
  const recentDeliveries = data?.recent_deliveries || [];
  const recentRuns = data?.recent_runs || [];
  const lastRun = summary.last_run;

  const healthLabel = useMemo(() => {
    if (!lastRun) return 'Aguardando primeira rodada';
    if (lastRun.status === 'failed') return 'Última rodada falhou';
    if (summary.active_rules === 0) return 'Piloto automático pausado';
    return 'Piloto automático rodando';
  }, [lastRun, summary.active_rules]);

  async function updateRule(rule, patch) {
    if (!canManage) return;
    setBusyRule(rule.key);
    setNotice('');
    try {
      await api.put(`/automations/${rule.key}`, patch);
      await load(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar essa automação.');
    } finally {
      setBusyRule('');
    }
  }

  async function runNow() {
    if (!canManage || running) return;
    setRunning(true);
    setNotice('');
    setError('');
    try {
      const response = await api.post('/automations/run');
      const created = Number(response.data?.result?.notifications_created || 0);
      setData(response.data?.overview || data);
      setNotice(created > 0 ? `${created} notificação${created === 1 ? '' : 'ões'} criada${created === 1 ? '' : 's'} nesta rodada.` : 'Rodada concluída. Nada novo para cobrar agora.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível rodar as automações agora.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#17181C] text-white">
        <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#C9FF2F]"><Bot size={16} /><p className="text-[10px] font-black uppercase tracking-[0.2em]">Piloto automático</p></div>
            <h1 className="mt-3 max-w-4xl text-[28px] font-black uppercase leading-[0.96] tracking-[-0.045em] sm:text-[38px]">SE DÁ PRA LEMBRAR SOZINHO, NÃO PRECISA SOBRAR PRA CABEÇA.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">Cinco rotinas observam a operação e transformam pendência repetitiva em cobrança automática dentro do ZebraHub.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 text-xs font-black text-white transition hover:bg-white/10 disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar</button>
            {canManage && <button type="button" onClick={runNow} disabled={running} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#C9FF2F] px-4 text-xs font-black text-[#17181C] transition hover:bg-white disabled:opacity-60">{running ? <RefreshCw size={15} className="animate-spin" /> : <PlayCircle size={16} />} Rodar agora</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
          <Stat label="Ligadas" value={`${summary.active_rules}/${summary.total_rules}`} accent="#C9FF2F" helper={healthLabel} />
          <Stat label="Últimas 24h" value={summary.sent_24h || 0} accent="#3A85FD" helper="notificações automáticas" />
          <Stat label="Últimos 7 dias" value={summary.sent_7d || 0} accent="#FFFFFF" helper="cobranças que o Hub fez" />
          <Stat label="Última rodada" value={lastRun ? relativeTime(lastRun.finished_at || lastRun.started_at) : '—'} accent={lastRun?.status === 'failed' ? '#EC0567' : '#FFFFFF'} helper={lastRun ? `${lastRun.notifications_created || 0} enviada${Number(lastRun.notifications_created || 0) === 1 ? '' : 's'}` : 'ainda não executada'} />
        </div>
      </section>

      {error && <div className="rounded-2xl border border-[#EC0567]/20 bg-[#EC0567]/[0.06] px-4 py-3 text-sm font-bold text-[#B40049]">{error}</div>}
      {notice && <div className="rounded-2xl border border-[#C9FF2F]/70 bg-[#C9FF2F]/20 px-4 py-3 text-sm font-bold text-[#17181C]">{notice}</div>}

      {loading ? (
        <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-14 text-center"><span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" /><p className="mt-3 text-sm font-black text-slate-700">LIGANDO OS FIOS.</p><p className="mt-1 text-xs text-slate-400">Carregando regras, rodadas e histórico.</p></div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
              <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3A85FD]">As 5 rotinas</p><h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[#17181C]">O HUB COBRA. A EQUIPE RESOLVE.</h2></div>
              {!canManage && <p className="text-[11px] font-semibold text-slate-400">Só administração e Head de Operação alteram estas regras.</p>}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {rules.map((rule) => <RuleCard key={rule.key} rule={rule} canManage={canManage} busy={busyRule === rule.key} onToggle={(item) => updateRule(item, { enabled: !item.enabled })} onCooldown={(item, cooldown) => updateRule(item, { cooldown_hours: cooldown })} />)}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#3A85FD]">O que o Hub já cobrou</p><h2 className="mt-1 text-sm font-black uppercase tracking-[-0.01em] text-slate-900">Entregas recentes</h2></div><BellRing size={18} className="text-slate-300" /></div>
              {recentDeliveries.length === 0 ? (
                <div className="px-5 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9FF2F] text-[#17181C]"><Sparkles size={19} /></div><p className="mt-3 text-sm font-black text-slate-800">AINDA NÃO TEVE NADA PRA COBRAR.</p><p className="mt-1 text-xs text-slate-400">Quando uma regra disparar, o histórico aparece aqui.</p></div>
              ) : (
                <div>
                  {recentDeliveries.slice(0, 16).map((item) => (
                    <div key={item.id} className="flex gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#17181C] text-[#C9FF2F]"><Zap size={15} /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{item.title}</p><p className="mt-0.5 text-[11px] font-semibold text-slate-400">Para {item.user_name}{item.client_name ? ` · ${item.client_name}` : ''}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p></div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">{relativeTime(item.sent_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#EC0567]">Motor</p><h2 className="mt-1 text-sm font-black uppercase tracking-[-0.01em] text-slate-900">Últimas rodadas</h2></div>
              {recentRuns.length === 0 ? <div className="px-5 py-10 text-center text-xs text-slate-400">Nenhuma rodada registrada ainda.</div> : (
                <div>
                  {recentRuns.slice(0, 10).map((run) => {
                    const failed = run.status === 'failed';
                    return (
                      <div key={run.id} className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5 last:border-b-0">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${failed ? 'bg-[#EC0567]/10 text-[#EC0567]' : 'bg-[#C9FF2F]/35 text-[#17181C]'}`}>{failed ? <PauseCircle size={14} /> : <CheckCircle2 size={14} />}</span>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black text-slate-800">{run.trigger_type === 'manual' ? 'Rodada manual' : run.trigger_type === 'startup' ? 'Inicialização' : 'Rodada automática'}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-400">{run.status}</span></div><p className="mt-1 text-[11px] text-slate-400">{run.candidates || 0} sinais · {run.notifications_created || 0} notificações · {formatTimestamp(run.finished_at || run.started_at)}</p>{run.error_message && <p className="mt-1 text-[11px] font-semibold text-[#B40049]">{run.error_message}</p>}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500"><span className="font-black text-[#17181C]">V16 começa dentro do Hub.</span> Estas automações criam notificações internas e respeitam um intervalo por peça para não virar spam. WhatsApp, e-mail e outros canais ficam para uma integração posterior — sem fingir que já estão conectados.</div>
        </>
      )}
    </div>
  );
}
