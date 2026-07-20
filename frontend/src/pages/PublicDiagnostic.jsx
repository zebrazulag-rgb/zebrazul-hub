import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowUp,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ATTENTION,
  calculateDiagnosticProgress,
  DIAGNOSTIC_PILLARS,
  FINAL_FIELDS,
  IDENTIFICATION_FIELDS,
  RECOMMENDATIONS,
} from '../diagnosticConfig.js';

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

export default function PublicDiagnostic() {
  const { token } = useParams();
  const [diagnostic, setDiagnostic] = useState(null);
  const [agency, setAgency] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadedRef = useRef(false);
  const saveTimerRef = useRef(null);

  const progress = calculateDiagnosticProgress(answers);
  const submitted = diagnostic?.status === 'submitted';
  const primary = agency?.primary_color || '#0969ff';
  const secondary = agency?.secondary_color || '#4f8cff';
  const dark = agency?.sidebar_color || '#121620';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await publicApi.get(`/public/diagnostics/${token}`);
      setDiagnostic(data.diagnostic);
      setAgency(data.agency);
      setAnswers(data.diagnostic.answers || {});
      loadedRef.current = true;
      document.title = `${data.diagnostic.title} | ${data.agency?.name || 'ZebraHub'}`;
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir este diagnóstico.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  function updateAnswer(key, value) {
    if (submitted) return;
    setAnswers((previous) => {
      const next = { ...previous, [key]: value };
      scheduleSave(next);
      return next;
    });
  }

  function scheduleSave(nextAnswers) {
    if (!loadedRef.current || submitted) return;
    clearTimeout(saveTimerRef.current);
    setSaveState('pending');
    saveTimerRef.current = setTimeout(() => saveDraft(nextAnswers, false), 1400);
  }

  async function saveDraft(nextAnswers = answers, showNotice = true) {
    if (submitted) return;
    clearTimeout(saveTimerRef.current);
    setSaving(true);
    setSaveState('saving');
    try {
      const { data } = await publicApi.put(`/public/diagnostics/${token}`, { answers: nextAnswers });
      setDiagnostic((previous) => ({ ...previous, status: data.status, progress: data.progress, last_saved_at: data.last_saved_at }));
      setSaveState('saved');
      if (showNotice) setNotice('Progresso salvo. Você pode fechar e continuar depois pelo mesmo link.');
      setTimeout(() => setNotice(''), 3200);
    } catch (err) {
      setSaveState('error');
      setError(err.response?.data?.error || 'Não foi possível salvar o progresso.');
    } finally {
      setSaving(false);
    }
  }

  async function submitDiagnostic() {
    clearTimeout(saveTimerRef.current);
    setSubmitting(true);
    setError('');
    try {
      const { data } = await publicApi.post(`/public/diagnostics/${token}/submit`, { answers });
      setDiagnostic(data.diagnostic);
      setAgency(data.agency);
      setAnswers(data.diagnostic.answers || answers);
      setNotice('Diagnóstico enviado com sucesso. A equipe já pode acessar as respostas.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || 'Revise as respostas antes de enviar.');
      setTimeout(() => document.getElementById('diagnostic-alert')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (error && !diagnostic) return <ErrorScreen message={error} />;

  const shellStyle = {
    '--dme-primary': primary,
    '--dme-secondary': secondary,
    '--dme-dark': dark,
  };

  return (
    <div style={shellStyle} className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--dme-dark)]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {agency?.logo_data ? (
              <img src={agency.logo_data} alt={agency.name} className="max-h-11 max-w-[180px] object-contain" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--dme-primary)] text-white"><Building2 size={21} /></div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{agency?.name || 'Agência'}</p>
              <p className="truncate text-xs text-white/45">Diagnóstico de Maturidade Empresarial</p>
            </div>
          </div>
          {!submitted && (
            <button type="button" onClick={() => saveDraft(answers, true)} disabled={saving} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} <span className="hidden sm:inline">Salvar progresso</span>
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[var(--dme-dark)] pb-24 pt-14 text-white sm:pb-28 sm:pt-20">
          <div className="pointer-events-none absolute -right-32 -top-32 h-[440px] w-[440px] rounded-full bg-[var(--dme-primary)]/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/4 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:px-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/65"><Sparkles size={13} /> Metodologia {agency?.name || 'estratégica'}</span>
              <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-[-0.055em] sm:text-6xl lg:text-7xl">DME <span className="block text-[var(--dme-secondary)]">Diagnóstico de Maturidade Empresarial</span></h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/58 sm:text-lg">Uma leitura estratégica da empresa para identificar forças, gargalos e prioridades. O resultado orientará a reunião de imersão e a construção do Plano de Ação.</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.065] p-5 backdrop-blur-sm sm:p-6">
              <h2 className="font-semibold text-white">Como o diagnóstico será utilizado</h2>
              <div className="mt-4 space-y-2.5">
                <MethodStep number="01" title="Compreender" text="Leitura honesta do momento atual." />
                <MethodStep number="02" title="Priorizar" text="Identificação dos pilares mais críticos." />
                <MethodStep number="03" title="Planejar" text="Transformação dos achados em ações." />
                <MethodStep number="04" title="Evoluir" text="Acompanhamento da maturidade ao longo do tempo." />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto -mt-10 max-w-7xl space-y-5 px-4 pb-16 sm:px-6 lg:px-8">
          {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>}
          {error && diagnostic && <div id="diagnostic-alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">{error}</div>}

          {submitted ? (
            <SubmittedResult diagnostic={diagnostic} answers={answers} agency={agency} />
          ) : (
            <>
              <section className="grid gap-5 rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_22px_70px_rgba(15,23,42,0.09)] md:grid-cols-[1.25fr_.75fr] sm:p-8">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Antes de começar</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-500">Não existem respostas certas ou erradas. O objetivo não é avaliar pessoas, mas compreender a estrutura atual da empresa. Quanto mais sinceras forem as respostas, mais preciso será o diagnóstico.</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 text-sm leading-6 text-slate-600"><strong className="text-slate-900">Escala de avaliação</strong><br />1 representa uma realidade inexistente ou muito frágil. 5 representa uma prática consolidada, consistente e acompanhada.</div>
              </section>

              <section className="sticky top-[82px] z-30 rounded-2xl border border-slate-200/70 bg-white/95 px-5 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-slate-700">Progresso do diagnóstico</span><span className="font-bold text-[var(--dme-primary)]">{progress}%</span></div>
                <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--dme-primary)] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400"><span>{saveStateLabel(saveState)}</span><span>Suas respostas ficam salvas neste link</span></div>
              </section>

              <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_38px_rgba(15,23,42,0.045)] sm:p-8">
                <SectionHeading number="01" title="Identificação da empresa" description="Informações essenciais para contextualizar a leitura." />
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {IDENTIFICATION_FIELDS.map(([key, label, required]) => (
                    <Field key={key} label={label} required={required}>
                      <input
                        className="input-field"
                        type={['foundation', 'employees'].includes(key) ? 'number' : 'text'}
                        value={answers[key] || ''}
                        onChange={(event) => updateAnswer(key, event.target.value)}
                        placeholder={fieldPlaceholder(key, diagnostic?.client?.name)}
                      />
                    </Field>
                  ))}
                  <Field label="Como você explicaria a empresa para alguém que ainda não a conhece?" className="md:col-span-2 lg:col-span-3">
                    <textarea className="input-field min-h-[130px] resize-y" value={answers.businessDescription || ''} onChange={(event) => updateAnswer('businessDescription', event.target.value)} placeholder="Descreva o que a empresa faz, para quem e de que maneira entrega valor." />
                  </Field>
                </div>
              </section>

              {DIAGNOSTIC_PILLARS.map((pillar) => (
                <PillarSection key={pillar.id} pillar={pillar} answers={answers} onChange={updateAnswer} />
              ))}

              <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_38px_rgba(15,23,42,0.045)] sm:p-8">
                <SectionHeading number="10" title="Questões estratégicas finais" description="Conectam o diagnóstico aos objetivos reais da empresa." />
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {FINAL_FIELDS.map(([key, originalLabel], index) => {
                    const label = key === 'expectation' ? `O que espera da atuação da ${agency?.name || 'agência'}?` : originalLabel;
                    return (
                      <Field key={key} label={label} className={index === 0 || index === FINAL_FIELDS.length - 1 ? 'md:col-span-2' : ''}>
                        <textarea className="input-field min-h-[120px] resize-y" value={answers[key] || ''} onChange={(event) => updateAnswer(key, event.target.value)} />
                      </Field>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[28px] bg-[var(--dme-dark)] p-6 text-white shadow-[0_20px_60px_rgba(18,22,32,0.18)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                  <p className="text-lg font-semibold">Pronto para concluir?</p>
                  <p className="mt-1 text-sm leading-6 text-white/50">Revise as respostas. Depois do envio, o diagnóstico ficará disponível para a equipe responsável.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => saveDraft(answers, true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"><Save size={16} /> Salvar</button>
                  <button type="button" onClick={submitDiagnostic} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-[var(--dme-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50">
                    {submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Enviar diagnóstico
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-400">
        <p>DME — Diagnóstico de Maturidade Empresarial · {agency?.name || 'Agência'}</p>
        {agency?.show_powered_by !== false && <p className="mt-1">{agency?.footer_text || 'Tecnologia ZebraHub'}</p>}
      </footer>
    </div>
  );
}

function PillarSection({ pillar, answers, onChange }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_10px_38px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4 bg-[var(--dme-dark)] px-6 py-6 text-white sm:px-8">
        <div><h2 className="text-xl font-semibold">{pillar.title}</h2><p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/48">{pillar.description}</p></div>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--dme-primary)] text-lg font-bold">{pillar.number}</span>
      </div>
      <div className="p-6 sm:p-8">
        <div className="hidden grid-cols-5 gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-center text-[10px] font-medium leading-4 text-slate-400 md:grid">
          <span>1<br />Inexistente</span><span>2<br />Frágil</span><span>3<br />Em desenvolvimento</span><span>4<br />Consistente</span><span>5<br />Consolidado</span>
        </div>
        <div className="divide-y divide-slate-100">
          {pillar.questions.map((question, index) => (
            <div key={question} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
              <p className="text-sm font-medium leading-6 text-slate-700">{index + 1}. {question}</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const key = `${pillar.id}_${index}`;
                  const active = Number(answers[key]) === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => onChange(key, value)}
                      className={`h-12 rounded-xl border text-sm font-bold transition ${active ? 'border-[var(--dme-primary)] bg-[var(--dme-primary)] text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-white hover:text-[var(--dme-primary)]'}`}
                      aria-label={`${value} de 5 para: ${question}`}
                    >{value}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <Field label={pillar.open}>
            <textarea className="input-field mt-1 min-h-[110px] resize-y bg-white" value={answers[`${pillar.id}_open`] || ''} onChange={(event) => onChange(`${pillar.id}_open`, event.target.value)} placeholder="Registre sua percepção com exemplos, quando possível." />
          </Field>
        </div>
      </div>
    </section>
  );
}

function SubmittedResult({ diagnostic, answers, agency }) {
  const scores = diagnostic.scores || { overall: 0, pillars: [], maturity: {} };
  const radarData = scores.pillars.map((pillar) => ({ subject: pillar.short, score: pillar.score, fullMark: 5 }));
  const sorted = [...scores.pillars].sort((a, b) => a.score - b.score);
  const priorities = sorted.slice(0, 3);
  const strengths = [...scores.pillars].sort((a, b) => b.score - a.score).slice(0, 2);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.1)]">
        <div className="bg-[var(--dme-dark)] px-6 py-8 text-white sm:px-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/60"><CheckCircle2 size={14} /> Resultado do DME</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">Diagnóstico de {answers.companyName || diagnostic.client?.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">As respostas foram enviadas e já estão salvas no ZebraHub. Esta leitura deve ser aprofundada na reunião de imersão e convertida em prioridades, projetos e indicadores.</p>
        </div>
        <div className="grid gap-5 p-6 sm:p-8 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center rounded-3xl border border-blue-100 bg-blue-50/60 p-7 text-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-full border-[14px] border-white bg-white shadow-inner"><span className="text-4xl font-bold text-slate-900">{Number(scores.overall || 0).toFixed(1).replace('.', ',')}</span></div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">{scores.maturity?.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{scores.maturity?.description}</p>
          </div>
          <div className="min-h-[420px] rounded-3xl border border-slate-200/70 bg-slate-50/40 p-4">
            <ResponsiveContainer width="100%" height={390}>
              <RadarChart data={radarData} outerRadius="67%">
                <PolarGrid stroke="#dbe4ef" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip formatter={(value) => Number(value).toFixed(1).replace('.', ',')} />
                <Radar dataKey="score" name="Maturidade" stroke="var(--dme-primary)" fill="var(--dme-primary)" fillOpacity={0.25} strokeWidth={2.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_38px_rgba(15,23,42,0.045)] sm:p-8">
        <h3 className="text-lg font-semibold text-slate-900">Resultado por pilar</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {scores.pillars.map((pillar) => (
            <div key={pillar.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{pillar.title}</p><span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-[var(--dme-primary)] shadow-sm">{Number(pillar.score).toFixed(1).replace('.', ',')}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full bg-[var(--dme-primary)]" style={{ width: `${(pillar.score / 5) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <ResultList title="Forças identificadas" items={strengths.map((item) => `${item.short}: é um dos pilares mais maduros e pode apoiar os próximos avanços.`)} />
        <ResultList title="Prioridades estratégicas" items={priorities.map((item) => `${item.short}: ${RECOMMENDATIONS[item.id]}.`)} />
        <ResultList title="Pontos de atenção" items={priorities.map((item) => ATTENTION[item.id])} />
      </section>

      <section className="rounded-[28px] bg-[var(--dme-primary)] p-6 text-white shadow-[0_18px_50px_rgba(9,105,255,0.2)] sm:p-8">
        <h3 className="text-lg font-semibold">Direção recomendada para os próximos 90 dias</h3>
        <p className="mt-2 max-w-5xl text-sm leading-7 text-white/80">A recomendação inicial é concentrar o próximo ciclo em {priorities.map((item) => item.short.toLowerCase()).join(', ')}. O plano deve começar pelas causas estruturais, definir responsáveis e indicadores e, depois, ampliar o volume de ações. A {agency?.name || 'agência'} deverá validar essa leitura na imersão e convertê-la em projetos, tarefas e metas acompanháveis.</p>
      </section>

      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/70 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 print:hidden">
        <div><p className="font-semibold text-slate-900">Diagnóstico concluído</p><p className="mt-1 text-sm text-slate-500">Você pode imprimir ou salvar uma cópia em PDF pelo navegador.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><ArrowUp size={16} /> Voltar ao início</button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--dme-primary)] px-4 py-2.5 text-sm font-semibold text-white"><Download size={16} /> Imprimir / salvar PDF</button>
        </div>
      </section>
    </div>
  );
}

function LoadingScreen() { return <div className="flex min-h-screen items-center justify-center bg-[#121620] text-white"><div className="text-center"><Loader2 className="mx-auto animate-spin text-blue-400" size={30} /><p className="mt-3 text-sm text-white/50">Carregando diagnóstico...</p></div></div>; }
function ErrorScreen({ message }) { return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl"><ShieldCheck className="mx-auto text-red-400" size={34} /><h1 className="mt-4 text-lg font-semibold text-slate-900">Link indisponível</h1><p className="mt-2 text-sm leading-6 text-slate-500">{message}</p></div></div>; }
function MethodStep({ number, title, text }) { return <div className="grid grid-cols-[42px_1fr] items-center gap-3 rounded-2xl bg-white/[0.055] p-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[var(--dme-dark)]">{number}</span><div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-0.5 text-xs text-white/42">{text}</p></div></div>; }
function SectionHeading({ number, title, description }) { return <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--dme-primary)] font-bold text-white">{number}</span><div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></div>; }
function Field({ label, required, className = '', children }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>{children}</label>; }
function ResultList({ title, items }) { return <article className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><h3 className="font-semibold text-slate-900">{title}</h3><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={index} className="flex gap-2"><Check className="mt-1 shrink-0 text-[var(--dme-primary)]" size={15} />{item}</li>)}</ul></article>; }
function saveStateLabel(state) { if (state === 'pending') return 'Alterações aguardando salvamento'; if (state === 'saving') return 'Salvando respostas...'; if (state === 'saved') return 'Progresso salvo'; if (state === 'error') return 'Falha ao salvar'; return 'Salvamento automático ativo'; }
function fieldPlaceholder(key, clientName) { const values = { companyName: clientName || 'Nome da empresa', respondent: 'Nome e função', segment: 'Ex.: Saúde, varejo, educação', foundation: 'Ex.: 2019', employees: 'Ex.: 18', city: 'Ex.: Natal/RN' }; return values[key] || ''; }
