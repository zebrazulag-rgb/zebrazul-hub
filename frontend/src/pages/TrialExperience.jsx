import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  LockKeyhole,
  Radar,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_ONBOARDING = {
  segment: '', city: '', objective: '', challenge: '', target_audience: '', differential: '', instagram: '',
};

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function LockedFeature({ title, description }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><LockKeyhole size={18} /></div>
      <p className="mt-4 font-black text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-4 inline-flex rounded-full bg-[#17181C] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] text-white">Disponível para clientes Zebra Azul</span>
    </div>
  );
}

function Onboarding({ initial, onSaved, expired }) {
  const [form, setForm] = useState({ ...EMPTY_ONBOARDING, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.put('/trial/onboarding', form);
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar seu diagnóstico agora.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,.05)] sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#EC0567]">PASSO 1 · RAIO-X INICIAL</p>
          <h2 className="brand-display mt-2 text-3xl font-black uppercase tracking-[-.04em] text-[#17181C]">Conte um pouco do negócio.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Isso não é briefing de agência. É só o contexto necessário para o ZebraHub deixar sua experiência mais útil.</p>
        </div>
        <div className="rounded-2xl bg-[#F5F3EE] px-4 py-3 text-xs font-bold text-slate-600">Leva ~3 minutos</div>
      </div>

      <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Segmento *</span>
          <input className="input-field" disabled={expired} required value={form.segment} onChange={(e) => update('segment', e.target.value)} placeholder="Ex.: odontologia, moda, contabilidade" />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Cidade / região</span>
          <input className="input-field" disabled={expired} value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Ex.: Natal/RN" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Qual resultado você mais quer nos próximos 30 dias? *</span>
          <input className="input-field" disabled={expired} required value={form.objective} onChange={(e) => update('objective', e.target.value)} placeholder="Ex.: gerar mais conversas comerciais qualificadas" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Hoje, o que mais trava sua comunicação ou crescimento? *</span>
          <textarea className="input-field min-h-[92px]" disabled={expired} required value={form.challenge} onChange={(e) => update('challenge', e.target.value)} placeholder="Ex.: publicamos sem constância e não sabemos quais assuntos realmente atraem o cliente certo" />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Quem é o cliente que você mais quer atrair? *</span>
          <textarea className="input-field min-h-[88px]" disabled={expired} required value={form.target_audience} onChange={(e) => update('target_audience', e.target.value)} placeholder="Descreva de forma simples." />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">O que diferencia sua empresa?</span>
          <textarea className="input-field min-h-[88px]" disabled={expired} value={form.differential} onChange={(e) => update('differential', e.target.value)} placeholder="O que você faz de um jeito que vale ser lembrado?" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Instagram principal</span>
          <input className="input-field" disabled={expired} value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@suaempresa" />
        </label>
        {error ? <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        {!expired ? (
          <button disabled={saving} className="sm:col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#17181C] px-5 text-sm font-black text-white hover:bg-black disabled:opacity-50">
            {saving ? <><RefreshCw size={16} className="animate-spin" /> Preparando sua experiência...</> : <><Sparkles size={17} /> Gerar meu plano de 30 dias</>}
          </button>
        ) : null}
      </form>
    </section>
  );
}

export default function TrialExperience() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await api.get('/trial/me');
      setData(body);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir seu espaço experimental.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const completed = useMemo(() => new Set(data?.progress || []), [data?.progress]);
  const allActions = useMemo(() => (data?.plan || []).flatMap((week) => week.actions || []), [data?.plan]);
  const progressPercent = allActions.length ? Math.round((allActions.filter((action) => completed.has(action.id)).length / allActions.length) * 100) : 0;

  async function toggleAction(id) {
    if (data?.trial?.expired || savingProgress) return;
    const next = new Set(completed);
    if (next.has(id)) next.delete(id); else next.add(id);
    const values = [...next];
    setData((current) => ({ ...current, progress: values }));
    setSavingProgress(true);
    try {
      await api.patch('/trial/progress', { completed: values });
    } catch {
      await load();
    } finally {
      setSavingProgress(false);
    }
  }

  function applyOnboarding(payload) {
    setData((current) => ({
      ...current,
      onboarding: payload.onboarding,
      onboarding_complete: true,
      plan: payload.plan,
      content_ideas: payload.content_ideas,
      diagnostic: payload.diagnostic,
    }));
    window.dispatchEvent(new CustomEvent('radar:seen'));
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm font-bold text-slate-500"><RefreshCw size={17} className="mr-2 animate-spin text-[#3A85FD]" /> Preparando sua experiência...</div>;
  if (error) return <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-700">{error}</div>;
  if (!data) return null;

  const expired = Boolean(data.trial?.expired);
  const support = user?.agency?.support_whatsapp || null;
  const supportHref = support ? `https://wa.me/${String(support).replace(/\D/g, '')}` : null;

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[30px] bg-[#17181C] p-6 text-white sm:p-8">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#3A85FD]/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#C9FF2F]/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#C9FF2F] px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-[#17181C]">ZebraHub Experience</span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[.12em] text-white/60">30 dias</span>
            </div>
            <h1 className="brand-display mt-5 text-4xl font-black uppercase tracking-[-.045em] sm:text-5xl">{data.client.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Um espaço para ganhar clareza antes de decidir se faz sentido ter a Zebra Azul ao lado do seu negócio.</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <Clock3 size={17} className="text-[#C9FF2F]" />
              <p className="brand-display mt-3 text-3xl font-black">{data.trial.days_left}</p>
              <p className="text-[10px] font-black uppercase tracking-[.12em] text-white/40">dias restantes</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <Target size={17} className="text-[#EC0567]" />
              <p className="brand-display mt-3 text-3xl font-black">{progressPercent}%</p>
              <p className="text-[10px] font-black uppercase tracking-[.12em] text-white/40">plano concluído</p>
            </div>
          </div>
        </div>
      </section>

      {expired ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-700">Seu período experimental terminou</p>
          <h2 className="brand-display mt-2 text-3xl font-black uppercase tracking-[-.04em] text-[#17181C]">Seu trabalho continua salvo.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-900/70">O acesso experimental terminou em {formatDate(data.trial.expires_at)}. Se decidir seguir com a Zebra Azul, seu cadastro, plano e aprendizados continuam aqui — sem começar do zero.</p>
          {supportHref ? <a href={supportHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white">Falar com a Zebra Azul <ArrowRight size={16} /></a> : null}
        </section>
      ) : null}

      {!data.onboarding_complete ? (
        <Onboarding initial={{ ...EMPTY_ONBOARDING, segment: data.client.segment || '' }} onSaved={applyOnboarding} expired={expired} />
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white p-6">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#3A85FD]">MAPA DA MARCA</p>
              {data.presence_diagnostic?.status === 'submitted' ? (
                <>
                  <p className="brand-display mt-4 text-4xl font-black uppercase leading-none tracking-[-.035em] text-[#17181C]">{data.presence_diagnostic?.result?.archetype_name || 'Diagnóstico concluído'}</p>
                  <p className="mt-3 text-sm font-black text-slate-800">Prioridade: {data.presence_diagnostic?.result?.top_need_name || '—'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#F5F3EE] p-3"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Pressão</span><strong className="mt-1 block text-xl text-slate-900">{data.presence_diagnostic?.result?.pressure ?? 0}%</strong></div>
                    <div className="rounded-xl bg-[#F5F3EE] p-3"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Diferenciação</span><strong className="mt-1 block text-xl text-slate-900">{data.presence_diagnostic?.result?.diff ?? 0}%</strong></div>
                  </div>
                  <Link to="/cliente/diagnostico" className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[#3A85FD] hover:underline">Abrir diagnóstico completo <ArrowRight size={14} /></Link>
                </>
              ) : (
                <>
                  <div className="mt-4 flex items-end gap-3"><span className="brand-display text-6xl font-black leading-none text-[#17181C]">{data.diagnostic?.score || 0}</span><span className="pb-1 text-sm font-black text-slate-400">/100</span></div>
                  <p className="mt-3 text-lg font-black text-slate-900">{data.presence_diagnostic ? `Diagnóstico ${data.presence_diagnostic.progress || 0}% preenchido` : 'Seu mapa ainda não foi gerado'}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">O Raio-X inicial organiza o contexto. O Mapa de Presença e Conexão aprofunda marca, mercado, concorrência e capacidade de execução.</p>
                  {!expired ? <Link to="/cliente/diagnostico" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-xs font-black text-white"><Target size={15} /> {data.presence_diagnostic ? 'Continuar diagnóstico' : 'Gerar meu Mapa da Marca'}</Link> : null}
                </>
              )}
              {!expired ? <button type="button" onClick={() => setData((current) => ({ ...current, onboarding_complete: false }))} className="mt-5 block text-xs font-black text-slate-400 hover:text-[#3A85FD]">Revisar contexto inicial</button> : null}
            </div>

            <div className="rounded-[26px] border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#EC0567]">RADAR DE OPORTUNIDADES</p>
                  <h2 className="brand-display mt-1 text-3xl font-black uppercase tracking-[-.035em]">Assuntos para não criar no escuro.</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">O Radar acompanha notícias e temas ligados ao seu mercado. Use para perceber movimentos, não para copiar pauta.</p>
                </div>
                <Link to="/cliente/radar" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white"><Radar size={17} /> Abrir Radar</Link>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#3A85FD]">PLANO DE 30 DIAS</p>
                <h2 className="brand-display mt-2 text-3xl font-black uppercase tracking-[-.04em]">Direção antes de volume.</h2>
              </div>
              <div className="min-w-[210px]">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>Progresso</span><span>{progressPercent}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#C9FF2F] transition-all" style={{ width: `${progressPercent}%` }} /></div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {(data.plan || []).map((week) => (
                <article key={week.week} className="rounded-[22px] border border-slate-200 bg-[#FAFAF8] p-5">
                  <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">SEMANA {String(week.week).padStart(2, '0')}</span>
                  <h3 className="mt-2 text-lg font-black text-slate-900">{week.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{week.description}</p>
                  <div className="mt-4 space-y-2">
                    {(week.actions || []).map((action) => {
                      const done = completed.has(action.id);
                      return (
                        <button key={action.id} type="button" disabled={expired || savingProgress} onClick={() => toggleAction(action.id)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${done ? 'border-[#C9FF2F]/50 bg-[#C9FF2F]/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          {done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />}
                          <span className={`text-sm leading-5 ${done ? 'font-semibold text-slate-600 line-through' : 'text-slate-700'}`}>{action.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] bg-[#3A85FD] p-6 text-white sm:p-7">
            <div className="flex items-start gap-3"><Compass size={22} className="mt-1 text-[#C9FF2F]" /><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/60">6 IDEIAS PARA COMEÇAR</p><h2 className="brand-display mt-1 text-3xl font-black uppercase tracking-[-.035em]">Conteúdo com um motivo para existir.</h2></div></div>
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(data.content_ideas || []).map((idea, index) => (
                <div key={`${idea.title}-${index}`} className="rounded-2xl border border-white/15 bg-white/[0.08] p-4">
                  <span className="text-[9px] font-black uppercase tracking-[.14em] text-[#C9FF2F]">{idea.format}</span>
                  <p className="mt-2 text-sm font-bold leading-5 text-white">{idea.title}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">SE VOCÊ VIRAR CLIENTE</p>
          <h2 className="brand-display mt-1 text-3xl font-black uppercase tracking-[-.035em] text-[#17181C]">O ZebraHub deixa de ser só diagnóstico e vira operação.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LockedFeature title="Aprovação de conteúdo" description="Acompanhe peças, legendas, correções e aprovações com a equipe no mesmo fluxo." />
          <LockedFeature title="Produção e calendário" description="Veja o que está sendo produzido, datado, agendado e publicado pela agência." />
          <LockedFeature title="Relatórios completos" description="Acompanhe Instagram e Facebook separadamente, com leitura de desempenho e evolução." />
          <LockedFeature title="Social Media conectado" description="Mensagens, publicações e integrações ficam disponíveis conforme os canais autorizados." />
        </div>
      </section>

      <section className="rounded-[28px] border border-[#17181C] bg-[#17181C] p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#C9FF2F]">SEM PRESSA. COM CLAREZA.</p>
          <h2 className="brand-display mt-2 text-3xl font-black uppercase tracking-[-.04em]">Se fizer sentido, a conversa começa daqui.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Você não perde o que construiu no período experimental. Ao converter sua conta, esse mesmo ambiente passa a receber a operação completa da Zebra Azul.</p>
        </div>
        {supportHref ? <a href={supportHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#C9FF2F] px-5 py-3 text-sm font-black text-[#17181C] sm:mt-0">Quero conversar <ArrowRight size={17} /></a> : null}
      </section>
    </div>
  );
}
