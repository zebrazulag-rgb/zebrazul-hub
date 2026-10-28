import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Gauge,
  Globe2,
  Instagram,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  Radar,
  Save,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const TABS = [
  ['inicio', 'Comece aqui', Sparkles],
  ['conteudo', 'Conteúdo', Lightbulb],
  ['plano', 'Plano de 30 dias', CalendarDays],
  ['espaco', 'Meu espaço', NotebookPen],
];

const CHECKLIST = [
  { key: 'servicos', label: 'Definir os serviços que você quer priorizar', week: 1 },
  { key: 'publico', label: 'Descrever o público que precisa prestar atenção em você', week: 1 },
  { key: 'objetivo', label: 'Escolher o principal objetivo destes 30 dias', week: 1 },
  { key: 'referencias', label: 'Registrar concorrentes e referências', week: 2 },
  { key: 'raiox', label: 'Revisar o seu Raio-X inicial', week: 2 },
  { key: 'ideias', label: 'Separar pelo menos 3 ideias de conteúdo para testar', week: 3 },
  { key: 'radar', label: 'Explorar o Radar de oportunidades', week: 3 },
  { key: 'foco', label: 'Definir o foco da próxima semana', week: 4 },
];

const EMPTY_ONBOARDING = {
  services: '',
  audience: '',
  competitors: '',
  instagram: '',
  site: '',
  objective: '',
  weekly_focus: '',
  notes: '',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function firstItem(value) {
  return String(value || '').split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)[0] || '';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function TrialExperience() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('inicio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [client, setClient] = useState(null);
  const [onboarding, setOnboarding] = useState(EMPTY_ONBOARDING);
  const [progress, setProgress] = useState([]);
  const [trial, setTrial] = useState(user?.trial || {});

  const primary = user?.agency?.primary_color || '#3A85FD';
  const expired = Boolean(trial?.expired);
  const daysRemaining = Number.isFinite(Number(trial?.days_remaining)) ? Number(trial.days_remaining) : 0;

  useEffect(() => {
    let alive = true;
    api.get('/auth/trial-experience')
      .then(({ data }) => {
        if (!alive) return;
        setClient(data.client || null);
        setOnboarding({ ...EMPTY_ONBOARDING, ...(data.onboarding || {}) });
        setProgress(Array.isArray(data.progress) ? data.progress : []);
        setTrial(data.trial || user?.trial || {});
        if (data.user) refreshUser(data.user);
      })
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar sua experiência.'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const autoProgress = useMemo(() => {
    const next = new Set(progress);
    if (onboarding.services.trim()) next.add('servicos');
    if (onboarding.audience.trim()) next.add('publico');
    if (onboarding.objective.trim()) next.add('objetivo');
    if (onboarding.competitors.trim()) next.add('referencias');
    if (onboarding.weekly_focus.trim()) next.add('foco');
    return [...next];
  }, [onboarding, progress]);

  const completion = Math.round((CHECKLIST.filter((item) => autoProgress.includes(item.key)).length / CHECKLIST.length) * 100);

  const snapshot = useMemo(() => {
    const checks = [
      { label: 'Oferta', ok: Boolean(onboarding.services.trim()), text: onboarding.services.trim() ? 'Você já definiu o que quer colocar na frente.' : 'Liste os serviços que devem ganhar prioridade.' },
      { label: 'Público', ok: Boolean(onboarding.audience.trim()), text: onboarding.audience.trim() ? 'Seu público principal já está descrito.' : 'Defina para quem sua comunicação precisa ser relevante.' },
      { label: 'Objetivo', ok: Boolean(onboarding.objective.trim()), text: onboarding.objective.trim() ? 'Existe um objetivo claro para os próximos 30 dias.' : 'Escolha uma meta de comunicação para orientar as decisões.' },
      { label: 'Presença', ok: Boolean(onboarding.instagram.trim() || onboarding.site.trim()), text: onboarding.instagram.trim() || onboarding.site.trim() ? 'Você já conectou uma referência da presença digital.' : 'Adicione seu Instagram ou site para completar o contexto.' },
    ];
    const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
    return { checks, score };
  }, [onboarding]);

  const ideas = useMemo(() => {
    const segment = client?.segment || 'seu segmento';
    const service = firstItem(onboarding.services) || 'seu principal serviço';
    const audience = firstItem(onboarding.audience) || 'seu cliente';
    return [
      `O que ${audience} precisa entender antes de contratar ${service}.`,
      `3 erros comuns em ${segment} que parecem pequenos, mas custam caro.`,
      `Bastidores: como uma boa entrega de ${service} acontece de verdade.`,
      `Pergunta que você mais escuta antes de fechar um serviço — respondida sem enrolação.`,
      `Uma opinião da sua marca sobre uma mudança recente em ${segment}.`,
      `Antes de escolher uma empresa de ${segment}, observe estes sinais.`,
    ];
  }, [client?.segment, onboarding.services, onboarding.audience]);

  function updateField(field, value) {
    setSaved(false);
    setOnboarding((current) => ({ ...current, [field]: value }));
  }

  function toggleProgress(key) {
    if (expired) return;
    setSaved(false);
    setProgress((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function persist(options = {}) {
    if (expired) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const mergedProgress = [...new Set(options.progress || autoProgress)];
      const { data } = await api.put('/auth/trial-experience', { onboarding, progress: mergedProgress });
      setOnboarding({ ...EMPTY_ONBOARDING, ...(data.onboarding || {}) });
      setProgress(Array.isArray(data.progress) ? data.progress : mergedProgress);
      setTrial(data.trial || trial);
      if (data.user) refreshUser(data.user);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }

  async function markAndPersist(key) {
    const next = [...new Set([...progress, key])];
    setProgress(next);
    await persist({ progress: next });
  }

  const contactHref = useMemo(() => {
    const whatsapp = String(user?.agency?.support_whatsapp || '').replace(/\D/g, '');
    if (whatsapp) {
      const message = encodeURIComponent(`Olá! Estou usando o ZebraHub Experience com a empresa ${client?.name || ''} e quero conversar sobre virar cliente.`);
      return `https://wa.me/${whatsapp}?text=${message}`;
    }
    if (user?.agency?.support_email) return `mailto:${user.agency.support_email}?subject=${encodeURIComponent('Quero virar cliente do ZebraHub')}`;
    return null;
  }, [user?.agency?.support_whatsapp, user?.agency?.support_email, client?.name]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center"><Sparkles className="mx-auto animate-pulse text-[#3A85FD]" size={34} /><p className="mt-3 text-sm text-slate-500">Preparando sua experiência...</p></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-[28px] bg-[#17181C] px-6 py-6 text-white shadow-[0_24px_70px_rgba(23,24,28,0.14)] sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#C9FF2F]"><Sparkles size={13} /> ZebraHub Experience</div>
            <h1 className="mt-4 text-3xl font-black uppercase tracking-[-0.045em] sm:text-4xl">{client?.name || user?.client_name || 'Sua empresa'}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Um espaço para transformar informação solta em direção: posicionamento, oportunidades, ideias e um plano simples para os próximos 30 dias.</p>
          </div>
          <div className="grid min-w-[300px] grid-cols-2 gap-3">
            <Metric icon={Clock3} label={expired ? 'Experiência encerrada' : 'Dias restantes'} value={expired ? '0' : String(daysRemaining)} />
            <Metric icon={Gauge} label="Progresso" value={`${completion}%`} />
          </div>
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#C9FF2F] transition-all" style={{ width: `${clamp(completion, 0, 100)}%` }} /></div>
      </section>

      {expired && (
        <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-amber-600" size={20} /><div><p className="font-bold text-amber-900">Seus 30 dias terminaram.</p><p className="mt-1 text-sm text-amber-700">Nada foi apagado. Seu espaço está preservado e pode ser liberado ao converter sua conta em cliente.</p></div></div>
          {contactHref && <a href={contactHref} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white">Quero continuar <ArrowUpRight size={15} /></a>}
        </section>
      )}

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === key ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'inicio' && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle eyebrow="01 · CONTEXTO" title="Conte o suficiente para o ZebraHub entender sua marca." text="Não é um briefing gigante. É só o contexto que muda a qualidade das decisões." />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TextArea icon={BriefcaseBusiness} label="Serviços prioritários" value={onboarding.services} onChange={(value) => updateField('services', value)} placeholder="Ex: consultoria tributária, BPO financeiro..." disabled={expired} />
              <TextArea icon={Users} label="Público principal" value={onboarding.audience} onChange={(value) => updateField('audience', value)} placeholder="Quem você quer atrair?" disabled={expired} />
              <TextArea icon={Target} label="Objetivo destes 30 dias" value={onboarding.objective} onChange={(value) => updateField('objective', value)} placeholder="Ex: aumentar autoridade e gerar conversas qualificadas." disabled={expired} />
              <TextArea icon={Trophy} label="Concorrentes / referências" value={onboarding.competitors} onChange={(value) => updateField('competitors', value)} placeholder="Perfis, empresas ou marcas que vale observar." disabled={expired} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SmallField icon={Instagram} label="Instagram" value={onboarding.instagram} onChange={(value) => updateField('instagram', value)} placeholder="@suaempresa" disabled={expired} />
              <SmallField icon={Globe2} label="Site" value={onboarding.site} onChange={(value) => updateField('site', value)} placeholder="https://..." disabled={expired} />
            </div>
            {!expired && <SaveBar saving={saving} saved={saved} onSave={() => persist()} />}
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <SectionTitle eyebrow="02 · RAIO-X" title="Seu ponto de partida" text="Um diagnóstico inicial de clareza, não uma nota de desempenho." />
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">{snapshot.score}</div>
            </div>
            <div className="mt-6 space-y-3">
              {snapshot.checks.map((item) => (
                <div key={item.label} className={`rounded-2xl border p-4 ${item.ok ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-slate-300'}`} /><p className="text-sm font-bold text-slate-900">{item.label}</p></div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>
            {!progress.includes('raiox') && !expired && <button onClick={() => markAndPersist('raiox')} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Marcar Raio-X como revisado</button>}
          </section>
        </div>
      )}

      {tab === 'conteudo' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle eyebrow="03 · IDEIAS" title="6 caminhos para começar a produzir" text="Use como ponto de partida. Adapte para a linguagem e para a realidade da sua marca." />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {ideas.map((idea, index) => <div key={idea} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: primary }}>IDEIA {String(index + 1).padStart(2, '0')}</span><p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{idea}</p></div>)}
            </div>
            {!progress.includes('ideias') && !expired && <button onClick={() => markAndPersist('ideias')} className="mt-5 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white">Já escolhi minhas ideias</button>}
          </section>

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#17181C] p-6 text-white">
              <Radar size={30} className="text-[#C9FF2F]" />
              <h2 className="mt-4 text-2xl font-black tracking-[-0.035em]">RADAR DE OPORTUNIDADES</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">Veja assuntos que podem virar conteúdo e use o timing como parte da estratégia.</p>
            </div>
            <div className="p-6">
              <p className="text-sm leading-6 text-slate-600">O Radar fica disponível durante a experiência. Quando houver fontes configuradas para o seu espaço, você poderá acompanhar novidades, gerar prompts e guardar referências.</p>
              <button
                onClick={async () => {
                  if (expired) return;
                  if (!progress.includes('radar')) await markAndPersist('radar');
                  navigate('/cliente/radar');
                }}
                disabled={expired}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                style={!expired ? { backgroundColor: primary } : undefined}
              >
                {expired ? 'Radar bloqueado após o teste' : 'Abrir meu Radar'} <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'plano' && (
        <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><SectionTitle eyebrow="04 · EXECUÇÃO" title="Seu plano de 30 dias" text="Poucas ações, em ordem. O objetivo é sair da sensação de que tudo precisa ser feito ao mesmo tempo." /><div className="rounded-2xl bg-slate-50 px-4 py-3 text-right"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">CONCLUÍDO</p><p className="text-2xl font-black text-slate-900">{completion}%</p></div></div>
          <div className="mt-7 grid gap-5 lg:grid-cols-4">
            {[1, 2, 3, 4].map((week) => (
              <div key={week} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: primary }}>SEMANA {week}</p>
                <div className="mt-4 space-y-2">
                  {CHECKLIST.filter((item) => item.week === week).map((item) => {
                    const checked = autoProgress.includes(item.key);
                    return (
                      <button key={item.key} disabled={expired || ['servicos', 'publico', 'objetivo', 'referencias', 'foco'].includes(item.key)} onClick={() => toggleProgress(item.key)} className="flex w-full items-start gap-2.5 rounded-xl p-2 text-left transition enabled:hover:bg-slate-50 disabled:cursor-default">
                        {checked ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />}
                        <span className={`text-sm leading-5 ${checked ? 'font-medium text-slate-500 line-through decoration-slate-300' : 'font-semibold text-slate-800'}`}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {!expired && <SaveBar saving={saving} saved={saved} onSave={() => persist()} />}
        </section>
      )}

      {tab === 'espaco' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle eyebrow="05 · MEU ESPAÇO" title="O que precisa ficar na sua frente agora?" text="Use este espaço como uma mesa de trabalho: foco da semana e notas rápidas." />
            <div className="mt-6">
              <label className="mb-2 block text-sm font-bold text-slate-800">Foco da próxima semana</label>
              <textarea value={onboarding.weekly_focus} onChange={(event) => updateField('weekly_focus', event.target.value)} disabled={expired} rows={3} placeholder="Ex: publicar 2 conteúdos de autoridade e revisar a bio do Instagram." className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800 outline-none focus:border-slate-300 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50" />
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-800">Notas</label>
              <textarea value={onboarding.notes} onChange={(event) => updateField('notes', event.target.value)} disabled={expired} rows={8} placeholder="Ideias, perguntas, decisões e coisas que você não quer esquecer..." className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800 outline-none focus:border-slate-300 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50" />
            </div>
            {!expired && <SaveBar saving={saving} saved={saved} onSave={() => persist()} />}
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-[#17181C] p-6 text-white shadow-sm">
            <MessageCircle size={30} className="text-[#C9FF2F]" />
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">PRÓXIMO PASSO</p>
            <h2 className="mt-2 text-3xl font-black uppercase leading-none tracking-[-0.045em]">Quer colocar isso para rodar com a Zebra Azul?</h2>
            <p className="mt-4 text-sm leading-6 text-white/55">Na conversão, seu usuário, sua empresa e tudo que você preencheu aqui continuam no mesmo ambiente. A conta deixa de ser experimental e os módulos contratados são liberados.</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-white/65">
              <p><strong className="text-white">Início:</strong> {formatDate(trial?.started_at)}</p>
              <p className="mt-1"><strong className="text-white">Fim do teste:</strong> {formatDate(trial?.expires_at)}</p>
            </div>
            {contactHref ? (
              <a href={contactHref} target="_blank" rel="noreferrer" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9FF2F] px-4 py-3.5 text-sm font-black text-[#17181C]">Quero conversar com a Zebra Azul <ArrowUpRight size={15} /></a>
            ) : (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-semibold text-white/50">Fale com a equipe responsável pelo seu ambiente para continuar.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><Icon size={16} className="text-[#C9FF2F]" /><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">{label}</p></div>;
}

function SectionTitle({ eyebrow, title, text }) {
  return <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3A85FD]">{eyebrow}</p><h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{text}</p></div>;
}

function TextArea({ icon: Icon, label, value, onChange, placeholder, disabled }) {
  return <div><label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><Icon size={16} className="text-slate-400" /> {label}</label><textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50" /></div>;
}

function SmallField({ icon: Icon, label, value, onChange, placeholder, disabled }) {
  return <div><label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><Icon size={16} className="text-slate-400" /> {label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50" /></div>;
}

function SaveBar({ saving, saved, onSave }) {
  return <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">{saved && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600"><CheckCircle2 size={14} /> Salvo</span>}<button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={15} /> {saving ? 'Salvando...' : 'Salvar progresso'}</button></div>;
}
