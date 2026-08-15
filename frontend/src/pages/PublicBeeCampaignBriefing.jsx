import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../api';
import BeeCampaignBriefingForm, { withBeeBriefingCalculations } from '../components/BeeCampaignBriefingForm.jsx';

export default function PublicBeeCampaignBriefing() {
  const { token } = useParams();
  const [record, setRecord] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const { data } = await api.get(`/public/bee-campaign-briefing/${token}`);
        if (!active) return;
        setRecord(data.response);
        setAnswers(withBeeBriefingCalculations(data.response?.answers || {}));
        setSubmitted(data.response?.status === 'submitted');
      } catch (err) {
        if (active) setError(err.response?.data?.error || 'Este link não está disponível.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [token]);

  async function save(next = answers) {
    if (submitted || saving) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/public/bee-campaign-briefing/${token}`, { answers: withBeeBriefingCalculations(next) });
      setRecord(data.response);
      setAnswers(withBeeBriefingCalculations(data.response?.answers || {}));
      setDirty(false);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || submitted) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(answers), 900);
    return () => clearTimeout(timer.current);
  }, [answers, dirty, submitted]);

  function changeAnswer(name, value) {
    setAnswers((current) => withBeeBriefingCalculations({ ...current, [name]: value }));
    setDirty(true);
  }

  async function submit() {
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/public/bee-campaign-briefing/${token}/submit`, { answers: withBeeBriefingCalculations(answers) });
      setRecord(data.response);
      setAnswers(withBeeBriefingCalculations(data.response?.answers || {}));
      setSubmitted(true);
      setDirty(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível enviar a resposta.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Centered><Loader2 className="animate-spin" size={26} /><p className="mt-3 text-sm text-slate-500">Carregando briefing...</p></Centered>;
  if (error && !record) return <Centered><h1 className="text-xl font-semibold text-slate-900">Link indisponível</h1><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{error}</p></Centered>;

  return (
    <div className="min-h-screen bg-[#F7F5EE]">
      <header className="bg-[#1C1C1C] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:px-8 lg:grid-cols-[1fr_320px] lg:py-14">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#EBAE20]">Matrículas de novos alunos · Natal e Parnamirim</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">Briefing da <span className="text-[#EBAE20]">Campanha 2027</span></h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/65">Um roteiro de decisão para transformar a visão da direção em uma campanha capaz de atrair novas famílias e levar a Bee à meta de 310 alunos.</p>
            <div className="mt-6 border-l-4 border-[#EBAE20] pl-4 text-sm font-semibold leading-6 text-white/85">A direção define o que a campanha precisa dizer. A criação transforma essa decisão em conceito, slogan, identidade, vídeos e conteúdos.</div>
          </div>
          <div className="flex items-center justify-center rounded-3xl bg-[#EBAE20] p-8 text-center text-[#1C1C1C]">
            <div><p className="text-sm font-bold uppercase tracking-[0.14em]">Bee Christian School</p><p className="mt-2 text-5xl font-black">2027</p><p className="mt-2 text-sm font-medium">Campanha de Matrículas</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 md:py-10">
        {submitted && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
            <div className="flex items-center gap-3"><CheckCircle2 size={24} /><div><h2 className="font-semibold">Resposta enviada com sucesso.</h2><p className="mt-1 text-sm text-emerald-800/75">A Zebrazul já consegue visualizar esta resposta na Bússola da Bee.</p></div></div>
          </div>
        )}

        {!submitted && (
          <div className="sticky top-3 z-20 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg shadow-slate-950/5 backdrop-blur">
            <div><p className="text-sm font-semibold text-slate-800">{answers.respondente || 'Resposta individual'}</p><p className="text-xs text-slate-500">{saving ? 'Salvando...' : dirty ? 'Alterações sendo salvas' : 'Salvamento automático ativo'}</p></div>
            <div className="text-sm font-black text-amber-700">{record?.progress || 0}%</div>
          </div>
        )}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <BeeCampaignBriefingForm answers={answers} onChange={changeAnswer} readOnly={submitted} showSummary={submitted} />

        {!submitted && (
          <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-950/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-5 text-slate-500">Ao enviar, a resposta fica bloqueada para preservar o registro individual da direção.</p>
            <button type="button" onClick={submit} disabled={saving} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1C1C1C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50">{saving && <Loader2 size={16} className="animate-spin" />} Enviar resposta final</button>
          </div>
        )}
      </main>
    </div>
  );
}

function Centered({ children }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F5EE] px-6 text-center">{children}</div>;
}
