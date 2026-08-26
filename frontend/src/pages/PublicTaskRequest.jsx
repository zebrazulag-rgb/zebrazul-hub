import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Send, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api from '../api';

const DEFAULT_TYPES = ['Design', 'Vídeo', 'Social Media', 'Tráfego', 'Site', 'Evento', 'Alteração', 'Outro'];

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

export default function PublicTaskRequest({ token: tokenProp = null, embedded = false }) {
  const params = useParams();
  const token = tokenProp || params.token;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({
    requester_name: '', requester_email: '', requester_phone: '',
    title: '', description: '', request_type: 'Design', requested_due_date: '',
    urgency: 'normal', references_text: '', notes: '',
  });

  useEffect(() => {
    let active = true;
    api.get(`/public/task-requests/${token}`)
      .then(({ data }) => {
        if (!active) return;
        setContext(data);
        const firstType = data.request_types?.[0] || 'Design';
        setForm((current) => ({ ...current, request_type: firstType }));
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error || 'Este link não está disponível.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  const accent = context?.client?.logo_color || '#0969ff';
  const types = context?.request_types?.length ? context.request_types : DEFAULT_TYPES;
  const totalFileBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.requester_name.trim()) return setError('Informe seu nome.');
    if (!form.title.trim()) return setError('Informe o que você precisa.');
    if (!form.description.trim()) return setError('Explique brevemente a demanda.');

    setSending(true);
    try {
      const encodedFiles = await Promise.all(files.map(readFile));
      const { data } = await api.post(`/public/task-requests/${token}`, { ...form, files: encodedFiles });
      setSuccess(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className={`${embedded ? 'min-h-[45vh]' : 'min-h-screen'} bg-[#f5f7fb] flex items-center justify-center text-slate-500`}><Loader2 className="mr-2 animate-spin" size={18} /> Carregando formulário...</div>;
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
        <div className="mx-auto max-w-xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <div className="h-2" style={{ backgroundColor: accent }} />
          <div className="p-8 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={31} /></div>
            <h1 className="mt-5 text-2xl font-semibold text-slate-900">Solicitação enviada!</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sua demanda já entrou nas tarefas da equipe e foi sinalizada para acompanhamento.</p>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{context.client.name}</p>
              <p className="mt-2 font-semibold text-slate-800">{success.title}</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="block text-xs text-slate-400">Protocolo</span><strong className="font-mono text-slate-700">{success.protocol}</strong></div>
                <div><span className="block text-xs text-slate-400">Enviado em</span><strong className="text-slate-700">{formatDateTime(success.submitted_at)}</strong></div>
              </div>
            </div>
            <button type="button" onClick={() => { setSuccess(null); setFiles([]); setForm((current) => ({ ...current, title: '', description: '', requested_due_date: '', references_text: '', notes: '', urgency: 'normal' })); }} className="mt-6 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Enviar outra solicitação
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? 'min-h-0 bg-transparent px-0 py-0' : 'min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 sm:py-10'}`}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="h-2" style={{ backgroundColor: accent }} />
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
          <div className="flex items-center gap-4">
            {context.client.avatar_data ? (
              <img src={context.client.avatar_data} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ backgroundColor: accent }}>{context.client.name?.[0]?.toUpperCase()}</div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Nova demanda</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Solicitar nova demanda</h1>
              <p className="mt-1 text-sm text-slate-500">{context.client.name}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-500">Preencha o essencial para a equipe entender sua necessidade. A data e a urgência informadas serão tratadas como referência; o prazo interno será confirmado pela equipe.</p>
        </div>

        <form onSubmit={submit} className="space-y-7 p-6 sm:p-8">
          <section>
            <h2 className="text-sm font-semibold text-slate-900">Seus dados</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Seu nome *</span><input className="input-field" value={form.requester_name} onChange={(e) => update('requester_name', e.target.value)} placeholder="Quem está fazendo o pedido?" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">E-mail</span><input type="email" className="input-field" value={form.requester_email} onChange={(e) => update('requester_email', e.target.value)} placeholder="seu@email.com" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">WhatsApp / telefone</span><input className="input-field" value={form.requester_phone} onChange={(e) => update('requester_phone', e.target.value)} placeholder="(84) 99999-9999" /></label>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="text-sm font-semibold text-slate-900">Sobre a demanda</h2>
            <div className="mt-3 space-y-4">
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">O que você precisa? *</span><input className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Ex.: Criar arte para o evento do Dia dos Pais" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Explique a demanda *</span><textarea className="input-field min-h-[130px] resize-y" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Conte o que precisa ser feito, objetivo, formato e informações importantes." /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo da solicitação</span><select className="input-field" value={form.request_type} onChange={(e) => update('request_type', e.target.value)}>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Quando você precisa?</span><input type="date" className="input-field" value={form.requested_due_date} onChange={(e) => update('requested_due_date', e.target.value)} /></label>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">Urgência percebida</span>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => update('urgency', 'normal')} className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${form.urgency === 'normal' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Normal</button>
                  <button type="button" onClick={() => update('urgency', 'urgent')} className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${form.urgency === 'urgent' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Urgente</button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">A urgência ajuda a equipe a entender sua necessidade, mas a prioridade operacional será definida internamente.</p>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="text-sm font-semibold text-slate-900">Referências e materiais</h2>
            <div className="mt-3 space-y-4">
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Links / referências</span><textarea className="input-field min-h-[90px] resize-y" value={form.references_text} onChange={(e) => update('references_text', e.target.value)} placeholder="Links do Drive, Instagram, site, referências visuais..." /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Observações adicionais</span><textarea className="input-field min-h-[90px] resize-y" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Algum detalhe que a equipe precisa saber?" /></label>
              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">Anexos</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100">
                  <FileUp size={18} /> Adicionar arquivos
                  <input type="file" multiple className="hidden" onChange={addFiles} />
                </label>
                <p className="mt-2 text-xs text-slate-400">Até 3 arquivos e 8 MB no total.</p>
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <div className="min-w-0"><p className="truncate font-medium text-slate-700">{file.name}</p><p className="text-[11px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
                        <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} /></button>
                      </div>
                    ))}
                    <p className="text-right text-[11px] text-slate-400">Total: {(totalFileBytes / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0" style={{ backgroundColor: accent }}>
            {sending ? <><Loader2 size={17} className="animate-spin" /> Enviando...</> : <><Send size={17} /> Enviar solicitação</>}
          </button>
        </form>
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center text-xs text-slate-400">Solicitações enviadas por este formulário entram diretamente no fluxo operacional da equipe.</p>
    </div>
  );
}
