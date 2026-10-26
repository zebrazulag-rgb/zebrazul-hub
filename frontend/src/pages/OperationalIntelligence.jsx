import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Gauge,
  RefreshCw,
  Sparkles,
  TimerReset,
  UsersRound,
  Video,
  Workflow,
} from 'lucide-react';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const TONES = {
  pink: 'border-[#EC0567]/20 bg-[#EC0567]/8 text-[#EC0567]',
  blue: 'border-[#3A85FD]/20 bg-[#3A85FD]/8 text-[#3A85FD]',
  lime: 'border-[#C9FF2F]/50 bg-[#C9FF2F]/25 text-[#17181C]',
  ink: 'border-[#17181C]/15 bg-[#17181C] text-white',
};

function formatHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return days < 10 ? `${days.toFixed(1).replace('.0', '')}d` : `${Math.round(days)}d`;
}

function MetricCard({ label, value, note, icon: Icon, tone = 'blue' }) {
  const toneClass = tone === 'pink'
    ? 'bg-[#EC0567]/10 text-[#EC0567]'
    : tone === 'lime'
      ? 'bg-[#C9FF2F]/45 text-[#17181C]'
      : tone === 'ink'
        ? 'bg-[#17181C] text-white'
        : 'bg-[#3A85FD]/10 text-[#3A85FD]';
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}><Icon size={18} /></span>
        <span className="text-3xl font-black tracking-[-0.06em] text-[#17181C]">{value}</span>
      </div>
      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.11em] text-slate-700">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">{note}</p>
    </div>
  );
}

function SignalCard({ signal }) {
  return (
    <article className={`rounded-[24px] border p-5 ${TONES[signal.tone] || TONES.blue}`}>
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-[-0.02em]">{signal.title}</h3>
          <p className="mt-2 text-xs leading-5 opacity-80">{signal.body}</p>
          <p className="mt-3 text-[11px] font-bold leading-5 opacity-65">{signal.action}</p>
        </div>
      </div>
    </article>
  );
}

function HorizontalBar({ label, value, max, sublabel, tone = 'blue' }) {
  const numericValue = Number.parseFloat(value) || 0;
  const pct = max > 0 ? Math.max(4, Math.round((numericValue / max) * 100)) : 0;
  const fill = tone === 'pink' ? '#EC0567' : tone === 'lime' ? '#C9FF2F' : tone === 'ink' ? '#17181C' : '#3A85FD';
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-slate-800">{label}</p>
          {sublabel && <p className="mt-0.5 truncate text-[10px] text-slate-400">{sublabel}</p>}
        </div>
        <span className="shrink-0 text-sm font-black text-[#17181C]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: fill }} /></div>
    </div>
  );
}

function EmptyState({ children = 'Ainda não há dado suficiente para esse recorte.' }) {
  return <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 px-5 py-9 text-center text-xs font-semibold text-slate-400">{children}</div>;
}

function TableShell({ children }) {
  return <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">{children}</div>;
}

export default function OperationalIntelligence() {
  const { selectedClient } = useClientFilter();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState('operation');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError('');
    try {
      const response = await api.get('/operational-intelligence', {
        params: {
          days,
          ...(selectedClient?.id ? { client_id: selectedClient.id } : {}),
        },
      });
      setData(response.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível ler a operação agora.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, selectedClient?.id]);

  useEffect(() => {
    setLoading(true);
    load(true);
  }, [load]);

  const summary = data?.summary || {};
  const signals = data?.signals || [];
  const stages = data?.stages || [];
  const clients = data?.clients || [];
  const team = data?.team || [];
  const demandTypes = data?.demand_types || [];
  const audiovisual = data?.audiovisual || {};

  const maxStage = Math.max(0, ...stages.map((item) => Number(item.count || 0)));
  const maxClient = Math.max(0, ...clients.map((item) => Number(item.created || 0)));
  const maxTeam = Math.max(0, ...team.map((item) => Number(item.open || 0)));
  const maxType = Math.max(0, ...demandTypes.map((item) => Number(item.count || 0)));

  const headline = useMemo(() => {
    if (loading && !data) return 'LENDO ONDE A OPERAÇÃO TÁ PESANDO.';
    if (Number(summary.overdue_open || 0) >= 3) return 'TEM TEMPO ESCAPANDO POR AQUI.';
    if (Number(summary.correction_rate || 0) >= 30) return 'TEM RETRABALHO COBRANDO A CONTA.';
    if (Number(summary.open || 0) === 0) return 'OPERAÇÃO LIMPA. AGORA OLHE A TENDÊNCIA.';
    return 'NÚMERO BOM É O QUE MUDA DECISÃO.';
  }, [data, loading, summary.correction_rate, summary.open, summary.overdue_open]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[#17181C]/10 bg-[#17181C] px-5 py-6 text-white sm:px-7 sm:py-7 lg:px-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[#C9FF2F]"><Gauge size={16} /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Inteligência operacional</span></div>
            <h1 className="max-w-3xl text-[28px] font-black leading-[0.98] tracking-[-0.055em] sm:text-[38px] lg:text-[46px]">{headline}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">Não é placar de gente. É leitura de fluxo: onde o trabalho anda, onde envelhece e onde uma decisão pode destravar o resto. O que está no backlog fica fora dessa conta até entrar na operação.</p>
            {selectedClient?.name && <p className="mt-3 text-xs font-black uppercase tracking-[0.1em] text-[#3A85FD]">FILTRANDO: {selectedClient.name}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[30, 60, 90, 180].map((item) => (
              <button key={item} type="button" onClick={() => setDays(item)} className={`h-10 rounded-xl px-3 text-xs font-black transition ${days === item ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-white/8 text-white/65 hover:bg-white/14 hover:text-white'}`}>{item}d</button>
            ))}
            <button type="button" onClick={() => load(false)} disabled={refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-[#17181C] transition hover:bg-[#3A85FD] hover:text-white disabled:opacity-60">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      {loading && !data ? (
        <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-16 text-center">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-slate-100 border-t-[#3A85FD]" />
          <p className="mt-4 text-xs font-bold text-slate-400">Cruzando fluxo, prazo, aprovação e carga...</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Demandas no período" value={summary.created ?? 0} note={`últimos ${days} dias`} icon={Activity} />
            <MetricCard label="Em aberto agora" value={summary.open ?? 0} note={`${summary.overdue_open ?? 0} já passaram do prazo`} icon={Workflow} tone={Number(summary.overdue_open || 0) ? 'pink' : 'blue'} />
            <MetricCard label="Com sinal de correção" value={`${summary.correction_rate ?? 0}%`} note={`${summary.correction_touched ?? 0} demandas com correção registrada`} icon={TimerReset} tone={Number(summary.correction_rate || 0) >= 30 ? 'pink' : 'blue'} />
            <MetricCard label="Concluídas no prazo" value={`${summary.on_time_rate ?? 0}%`} note={summary.on_time_sample ? `amostra de ${summary.on_time_sample} concluídas com prazo` : 'ainda sem amostra suficiente'} icon={CheckCircle2} tone="lime" />
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">LEITURA DO HUB</p><h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[#17181C]">O que merece decisão.</h2></div>
              <span className="hidden text-[11px] font-semibold text-slate-400 sm:block">Sinais, não sentenças.</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {signals.map((signal, index) => <SignalCard key={`${signal.title}-${index}`} signal={signal} />)}
            </div>
          </section>

          <nav className="flex gap-1 overflow-x-auto rounded-[20px] border border-slate-200 bg-white p-1.5">
            {[
              ['operation', 'Operação'],
              ['bottlenecks', 'Gargalos'],
              ['clients', 'Clientes'],
              ['team', 'Equipe'],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`min-w-max rounded-2xl px-4 py-2.5 text-xs font-black transition ${tab === key ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{label}</button>
            ))}
          </nav>

          {tab === 'operation' && (
            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">FLUXO AGORA</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">Onde o trabalho está.</h2></div><Workflow size={19} className="text-[#3A85FD]" /></div>
                <div className="mt-6 space-y-5">
                  {stages.length ? stages.map((item) => <HorizontalBar key={item.stage} label={item.label} value={item.count} max={maxStage} sublabel={`${item.avg_idle_days || 0}d sem movimento, em média`} tone={item.stage === 'correction' ? 'pink' : item.stage === 'approved' ? 'lime' : item.stage === 'approval' ? 'ink' : 'blue'} />) : <EmptyState />}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">APROVAÇÃO</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">Quanto tempo a bola leva.</h2></div><Clock3 size={19} className="text-[#EC0567]" /></div>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Até direção</p><p className="mt-2 text-xl font-black text-[#17181C]">{formatHours(summary.avg_direction_hours)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Direção → cliente</p><p className="mt-2 text-xl font-black text-[#17181C]">{formatHours(summary.avg_client_hours)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Total</p><p className="mt-2 text-xl font-black text-[#17181C]">{formatHours(summary.avg_total_approval_hours)}</p></div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
                    <div className="rounded-2xl border border-slate-100 px-3 py-3 text-slate-500"><span className="block text-lg font-black text-[#17181C]">{summary.waiting_direction ?? 0}</span>aguardando direção</div>
                    <div className="rounded-2xl border border-slate-100 px-3 py-3 text-slate-500"><span className="block text-lg font-black text-[#3A85FD]">{summary.waiting_client ?? 0}</span>aguardando cliente</div>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">AUDIOVISUAL</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">Da gravação ao ar.</h2></div><Video size={19} className="text-[#3A85FD]" /></div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Em edição</p><p className="mt-2 text-xl font-black text-[#17181C]">{audiovisual.editing_now ?? 0}</p></div>
                    <div className="rounded-2xl bg-[#C9FF2F]/25 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Prontos sem publicar</p><p className="mt-2 text-xl font-black text-[#17181C]">{audiovisual.ready_unpublished ?? 0}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Gravação → edição</p><p className="mt-2 text-xl font-black text-[#17181C]">{formatHours(audiovisual.avg_recording_to_edit_hours)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Edição → post</p><p className="mt-2 text-xl font-black text-[#17181C]">{formatHours(audiovisual.avg_edit_to_post_hours)}</p></div>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6 xl:col-span-2">
                <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">MIX DE DEMANDA</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">O que mais entrou no período.</h2></div><BarChart3 size={19} className="text-[#3A85FD]" /></div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {demandTypes.length ? demandTypes.map((item) => <HorizontalBar key={item.label} label={item.label} value={item.count} max={maxType} />) : <EmptyState />}
                </div>
              </div>
            </section>
          )}

          {tab === 'bottlenecks' && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">ONDE ENVELHECE</p>
                <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">Tempo sem movimento por etapa.</h2>
                <p className="mt-2 text-xs leading-5 text-slate-400">Usa a última atualização da demanda como sinal. Não é cronômetro histórico de etapa.</p>
                <div className="mt-6 space-y-5">{stages.length ? [...stages].sort((a, b) => Number(b.avg_idle_days || 0) - Number(a.avg_idle_days || 0)).map((item) => <HorizontalBar key={item.stage} label={item.label} value={`${item.avg_idle_days || 0}d`} max={Math.max(1, ...stages.map((row) => Number(row.avg_idle_days || 0)))} sublabel={`${item.count} itens nessa etapa`} tone={Number(item.avg_idle_days || 0) >= 4 ? 'pink' : 'blue'} />) : <EmptyState />}</div>
              </div>
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">CORREÇÃO</p>
                <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-[#17181C]">De onde vieram as voltas.</h2>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-[22px] bg-[#17181C] p-5 text-white"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Direção</p><p className="mt-2 text-4xl font-black tracking-[-0.06em]">{summary.direction_corrections ?? 0}</p><p className="mt-2 text-[11px] text-white/50">demandas com feedback interno registrado</p></div>
                  <div className="rounded-[22px] bg-[#3A85FD] p-5 text-white"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/60">Cliente</p><p className="mt-2 text-4xl font-black tracking-[-0.06em]">{summary.client_corrections ?? 0}</p><p className="mt-2 text-[11px] text-white/65">demandas com feedback do cliente registrado</p></div>
                </div>
                <div className="mt-4 rounded-[22px] border border-[#EC0567]/20 bg-[#EC0567]/6 p-4"><div className="flex items-start gap-3"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#EC0567]" /><p className="text-xs leading-5 text-slate-600">Correção aqui significa que existe estado ou feedback registrado. O Hub ainda não conta quantas rodadas uma mesma peça teve.</p></div></div>
              </div>
            </section>
          )}

          {tab === 'clients' && (
            <section>
              <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">CLIENTES</p><h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[#17181C]">Volume, correção e espera sem achismo.</h2></div>
              {clients.length ? (
                <TableShell>
                  <table className="min-w-[760px] w-full text-left">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400"><th className="px-5 py-3">Cliente</th><th className="px-4 py-3">Entraram</th><th className="px-4 py-3">Em aberto</th><th className="px-4 py-3">Atrasadas</th><th className="px-4 py-3">Correção</th><th className="px-4 py-3">Aprovação média</th></tr></thead>
                    <tbody>{clients.map((client) => <tr key={client.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-black text-slate-800">{client.name}</p><div className="mt-2 max-w-[220px]"><HorizontalBar label="volume" value={client.created} max={maxClient} /></div></td><td className="px-4 py-4 text-sm font-black text-[#17181C]">{client.created}</td><td className="px-4 py-4 text-sm font-black text-[#17181C]">{client.open}</td><td className={`px-4 py-4 text-sm font-black ${client.overdue ? 'text-[#EC0567]' : 'text-slate-400'}`}>{client.overdue}</td><td className={`px-4 py-4 text-sm font-black ${Number(client.correction_rate || 0) >= 30 ? 'text-[#EC0567]' : 'text-slate-700'}`}>{client.correction_rate}%</td><td className="px-4 py-4 text-sm font-black text-slate-700">{formatHours(client.avg_approval_hours)}</td></tr>)}</tbody>
                  </table>
                </TableShell>
              ) : <EmptyState>Selecione um período com demandas para comparar clientes.</EmptyState>}
            </section>
          )}

          {tab === 'team' && (
            <section>
              <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">EQUIPE</p><h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[#17181C]">Carga para redistribuir. Não ranking.</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">A leitura mostra quantos itens abertos estão atribuídos a cada pessoa neste momento. Mais itens não significa mais produtividade — significa mais carga visível.</p></div>
              {team.length ? <div className="grid gap-3 lg:grid-cols-2">{team.map((member) => <article key={member.id} className="rounded-[24px] border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17181C] text-[#C9FF2F]"><UsersRound size={16} /></span><p className="truncate text-sm font-black text-[#17181C]">{member.name}</p></div><p className="mt-3 text-[11px] leading-5 text-slate-400">{member.corrections} em correção · {member.overdue} atrasadas · {member.due_soon} vencem em até 2 dias</p></div><span className="text-3xl font-black tracking-[-0.06em] text-[#17181C]">{member.open}</span></div><div className="mt-4"><HorizontalBar label="carga aberta" value={member.open} max={maxTeam} tone={member.overdue ? 'pink' : 'blue'} /></div></article>)}</div> : <EmptyState>Nenhuma carga atribuída apareceu neste recorte.</EmptyState>}
            </section>
          )}

          <section className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3"><ArrowRight size={16} className="mt-0.5 shrink-0 text-[#3A85FD]" /><div><p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Como ler</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{data?.meta?.methodology_note || 'Os indicadores usam somente os dados registrados no ZebraHub.'} Use a leitura para investigar processo — não para concluir desempenho individual.</p></div></div>
          </section>
        </>
      )}
    </div>
  );
}
