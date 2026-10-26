import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, FileUp, Lightbulb, Loader2, Send, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { DEMAND_TYPES, buildBriefingDescription, demandTypeById } from '../utils/demandBriefing.js';

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result, mime: file.type || 'application/octet-stream', filename: file.name });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function blankForm() {
  return {
    requester_name: '', requester_email: '', requester_phone: '',
    demand_type: 'static_post', title: '', goal: '', requested_due_date: '',
    urgency: 'normal', references_text: '', notes: '', details: {},
  };
}

export default function PublicTaskRequest({ token: tokenProp = null, embedded = false }) {
  const params = useParams();
  const token = tokenProp || params.token;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [files, setFiles] = useState([]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    let active = true;
    api.get(`/public/task-requests/${token}`)
      .then(({ data }) => { if (active) setContext(data); })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'Este link não está disponível.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const accent = '#0969ff';
  const type = useMemo(() => demandTypeById(form.demand_type), [form.demand_type]);
  const totalFileBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDetail(field, value) {
    setForm((current) => ({ ...current, details: { ...current.details, [field]: value } }));
  }

  function changeType(typeId) {
    setForm((current) => ({ ...current, demand_type: typeId, details: {} }));
  }

  function addFiles(event) {
    const selected = Array.from(event.target.files || []);
    const next = [...files, ...selected].slice(0, 3);
    const bytes = next.reduce((sum, file) => sum + file.size, 0);
    if (bytes > 8 * 1024 * 1024) {
      setError('Os anexos podem ter até 8 MB no total.');
      event.target.value = '';
      return;
    }
    setError('');
    setFiles(next);
    event.target.value = '';
  }

  function validateCurrentStep(nextStep) {
    setError('');
    if (nextStep === 2 && !form.requester_name.trim()) {
      setError('Informe seu nome antes de continuar.');
      return false;
    }
    if (nextStep === 3) {
      if (!form.title.trim()) { setError('Dê um nome para a solicitação.'); return false; }
      if (!form.goal.trim()) { setError('Conte o que precisa acontecer por causa dessa entrega.'); return false; }
      const required = (type.fields || []).find((field) => field.required && !String(form.details?.[field.key] || '').trim());
      if (required) { setError(`Falta responder: ${required.label}.`); return false; }
    }
    return true;
  }

  function go(nextStep) {
    if (nextStep > step && !validateCurrentStep(nextStep)) return;
    setStep(nextStep);
  }

  async function submit(event) {
    event?.preventDefault?.();
    setError('');
    if (!form.requester_name.trim()) return setError('Informe seu nome.');
    if (!form.title.trim()) return setError('Informe o que você precisa.');
    if (!form.goal.trim()) return setError('Conte o que precisa acontecer por causa dessa entrega.');
    if (!form.requested_due_date) return setError('Informe quando você precisa dessa entrega.');
    const required = (type.fields || []).find((field) => field.required && !String(form.details?.[field.key] || '').trim());
    if (required) return setError(`Falta responder: ${required.label}.`);

    setSending(true);
    try {
      const encodedFiles = await Promise.all(files.map(readFile));
      const description = buildBriefingDescription({
        demand_type: type.id,
        goal: form.goal,
        details: form.details,
        references: form.references_text,
        notes: form.notes,
      }, type);
      const payload = {
        requester_name: form.requester_name,
        requester_email: form.requester_email,
        requester_phone: form.requester_phone,
        title: form.title,
        description,
        request_type: type.label,
        requested_due_date: form.requested_due_date,
        urgency: form.urgency,
        references_text: form.references_text,
        notes: form.notes,
        goal: form.goal,
        briefing: { demand_type: type.id, details: form.details },
        files: encodedFiles,
      };
      const { data } = await api.post(`/public/task-requests/${token}`, payload);
      setSuccess(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className={`${embedded ? 'min-h-[45vh]' : 'min-h-screen'} flex items-center justify-center bg-[#f5f7fb] text-slate-500`}><Loader2 className="mr-2 animate-spin" size={18} /> Carregando formulário...</div>;
  }

  if (!context) {
    return (
      <div className={`${embedded ? 'min-h-[45vh]' : 'min-h-screen'} bg-[#f5f7fb] px-5 py-10`}>
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Link indisponível</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error || 'Solicite à equipe um novo link para enviar sua demanda.'}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={`${embedded ? 'min-h-0' : 'min-h-screen'} bg-[#f5f7fb] px-0 py-4 sm:py-8`}>
        <div className="mx-auto max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <div className="h-2 bg-[#72f14d]" />
          <div className="p-8 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#72f14d]/20 text-[#267b2e]"><CheckCircle2 size={31} /></div>
            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-[#0969ff]">Entrou na operação</p>
            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#17181c]">A BOLA AGORA TÁ COM A GENTE.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sua solicitação já virou uma demanda estruturada, com prazo e responsável dentro do ZebraHub.</p>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{context.client.name}</p>
              <p className="mt-2 font-semibold text-slate-800">{success.title}</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="block text-xs text-slate-400">Protocolo</span><strong className="font-mono text-slate-700">{success.protocol}</strong></div>
                <div><span className="block text-xs text-slate-400">Enviado em</span><strong className="text-slate-700">{formatDateTime(success.submitted_at)}</strong></div>
              </div>
            </div>
            <button type="button" onClick={() => { setSuccess(null); setFiles([]); setForm(blankForm()); setStep(1); }} className="mt-6 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Enviar outra solicitação</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? 'min-h-0 bg-transparent px-0 py-0' : 'min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 sm:py-10'}`}>
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[30px] border border-slate-200 bg-[#fbfaf7] shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <header className="bg-[#17181c] px-6 py-7 text-white sm:px-8">
          <div className="flex items-center gap-4">
            {context.client.avatar_data ? <img src={context.client.avatar_data} alt="" className="h-12 w-12 rounded-2xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0969ff] text-xl font-black">{context.client.name?.[0]?.toUpperCase()}</div>}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#72f14d]">Nova demanda</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em]">CONTA PRA GENTE O QUE PRECISA ACONTECER.</h1>
              <p className="mt-1 text-sm text-white/55">{context.client.name}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60">Não precisa escrever um briefing perfeito. O formulário muda de acordo com o tipo de entrega e puxa só o contexto que a equipe realmente precisa.</p>
        </header>

        <div className="border-b border-slate-200 bg-white px-6 py-3 sm:px-8">
          <div className="flex gap-2 overflow-x-auto">
            {[[1, 'Você'], [2, 'A demanda'], [3, 'Prazo + materiais']].map(([number, label]) => <button key={number} type="button" onClick={() => number < step && setStep(number)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${step === number ? 'bg-[#0969ff] text-white' : number < step ? 'bg-blue-50 text-[#0969ff]' : 'bg-slate-100 text-slate-400'}`}>{number}. {label}</button>)}
          </div>
        </div>

        <form onSubmit={submit} className="p-6 sm:p-8">
          {step === 1 && (
            <section className="space-y-4">
              <div><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Primeiro, quem tá falando?</p><h2 className="mt-1 text-xl font-black text-[#17181c]">Seus dados</h2></div>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Seu nome *</span><input className="input-field" value={form.requester_name} onChange={(e) => update('requester_name', e.target.value)} placeholder="Quem está fazendo o pedido?" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">E-mail</span><input type="email" className="input-field" value={form.requester_email} onChange={(e) => update('requester_email', e.target.value)} placeholder="seu@email.com" /></label>
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">WhatsApp / telefone</span><input className="input-field" value={form.requester_phone} onChange={(e) => update('requester_phone', e.target.value)} placeholder="(84) 99999-9999" /></label>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <div><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Formato</p><h2 className="mt-1 text-xl font-black text-[#17181c]">O que vamos colocar no mundo?</h2></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {DEMAND_TYPES.map((item) => <button key={item.id} type="button" onClick={() => changeType(item.id)} className={`rounded-2xl border p-3 text-left transition ${form.demand_type === item.id ? 'border-[#17181c] bg-[#17181c] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}><span className="mb-3 block h-2 w-7 rounded-full" style={{ backgroundColor: item.accent }} /><span className="text-sm font-black">{item.label}</span></button>)}
              </div>

              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Nome da demanda *</span><input className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Ex.: Campanha de matrícula de novembro" /></label>
              <label className="block rounded-2xl border-2 border-[#0969ff]/20 bg-blue-50/50 p-4">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#0969ff]"><Lightbulb size={15} /> Mais importante que o formato</span>
                <span className="mt-2 block text-base font-black text-[#17181c]">O que precisa acontecer por causa dessa entrega? *</span>
                <textarea className="input-field mt-3 min-h-[105px] resize-y bg-white" value={form.goal} onChange={(e) => update('goal', e.target.value)} placeholder="Ex.: gerar inscrições, avisar uma mudança, vender um serviço, aumentar presença no evento..." />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                {(type.fields || []).map((field) => {
                  const value = form.details?.[field.key] || '';
                  return <label key={field.key} className={field.multiline ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-bold text-slate-600">{field.label}{field.required ? ' *' : ''}</span>{field.type === 'select' ? <select className="input-field" value={value} onChange={(e) => updateDetail(field.key, e.target.value)}><option value="">Escolha</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.multiline ? <textarea className="input-field min-h-[90px] resize-y" value={value} onChange={(e) => updateDetail(field.key, e.target.value)} placeholder={field.placeholder || ''} /> : <input type={field.type === 'date' ? 'date' : 'text'} className="input-field" value={value} onChange={(e) => updateDetail(field.key, e.target.value)} placeholder={field.placeholder || ''} />}</label>;
                })}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <div><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Agora dá pra organizar o jogo</p><h2 className="mt-1 text-xl font-black text-[#17181c]">Prazo e materiais</h2></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">Quando você precisa? *</span><input type="date" className="input-field" value={form.requested_due_date} onChange={(e) => update('requested_due_date', e.target.value)} /></label>
                <div><span className="mb-1.5 block text-xs font-bold text-slate-600">Urgência percebida</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => update('urgency', 'normal')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${form.urgency === 'normal' ? 'border-[#0969ff] bg-blue-50 text-[#0969ff]' : 'border-slate-200 bg-white text-slate-600'}`}>Normal</button><button type="button" onClick={() => update('urgency', 'urgent')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${form.urgency === 'urgent' ? 'border-[#ec0567] bg-pink-50 text-[#b40049]' : 'border-slate-200 bg-white text-slate-600'}`}>Urgente</button></div></div>
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Links / referências</span><textarea className="input-field min-h-[90px] resize-y" value={form.references_text} onChange={(e) => update('references_text', e.target.value)} placeholder="Drive, Instagram, site, referências visuais..." /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Observações adicionais</span><textarea className="input-field min-h-[82px] resize-y" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Algum detalhe que a equipe precisa saber?" /></label>
              <div><span className="mb-2 block text-xs font-bold text-slate-600">Anexos</span><label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm font-semibold text-slate-600 transition hover:border-slate-400"><FileUp size={18} /> Adicionar arquivos<input type="file" multiple className="hidden" onChange={addFiles} /></label><p className="mt-2 text-xs text-slate-400">Até 3 arquivos e 8 MB no total.</p>{files.length > 0 && <div className="mt-3 space-y-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-700">{file.name}</p><p className="text-[11px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={15} /></button></div>)}<p className="text-right text-[11px] text-slate-400">Total: {(totalFileBytes / 1024 / 1024).toFixed(2)} MB</p></div>}</div>
            </section>
          )}

          {error && <div className="mt-5 rounded-xl border border-[#ec0567]/25 bg-[#ec0567]/5 px-4 py-3 text-sm font-semibold text-[#ad0649]">{error}</div>}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={() => step > 1 && setStep((current) => current - 1)} disabled={step === 1 || sending} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-30">Voltar</button>
            {step < 3 ? <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-5 py-2.5 text-xs font-black text-white">Continuar <ArrowRight size={15} /></button> : <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-[#17181c] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar demanda</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
