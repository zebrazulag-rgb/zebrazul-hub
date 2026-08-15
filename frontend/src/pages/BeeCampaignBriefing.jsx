import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FileText, Link2, Plus, RefreshCw, Save, Trash2, UsersRound } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';
import BeeCampaignBriefingForm, {
  BEE_BRIEFING_DEFAULTS,
  beeBriefingProgress,
  withBeeBriefingCalculations,
} from '../components/BeeCampaignBriefingForm.jsx';
import { isBeeClient } from '../utils/beeClientAccess.js';

const YEAR = 2027;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blankAnswers() {
  return { ...BEE_BRIEFING_DEFAULTS, dataResposta: today() };
}

export default function BeeCampaignBriefing() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const client = user?.role === 'client' ? null : selectedClient;
  const clientId = Number(client?.id) || null;
  const [responses, setResponses] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [answers, setAnswers] = useState(blankAnswers());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const autosaveTimer = useRef(null);

  const beeActive = isBeeClient(client);
  const activeResponse = useMemo(() => responses.find((item) => Number(item.id) === Number(activeId)) || null, [responses, activeId]);

  const loadResponses = useCallback(async () => {
    if (!clientId || !beeActive) {
      setResponses([]);
      setActiveId(null);
      setAnswers(blankAnswers());
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/bee-campaign-briefing', { params: { client_id: clientId, year: YEAR } });
      const list = Array.isArray(data.responses) ? data.responses : [];
      setResponses(list);
      const first = list[0] || null;
      setActiveId(first?.id || null);
      setAnswers(first ? withBeeBriefingCalculations(first.answers || {}) : blankAnswers());
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o briefing da Bee.');
    } finally {
      setLoading(false);
    }
  }, [clientId, beeActive]);

  useEffect(() => { loadResponses(); }, [loadResponses]);
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const saveCurrent = useCallback(async (nextAnswers = answers, silent = false) => {
    if (!activeId || !clientId || saving) return null;
    setSaving(true);
    setError('');
    try {
      const payloadAnswers = withBeeBriefingCalculations(nextAnswers);
      const { data } = await api.put(`/bee-campaign-briefing/${activeId}`, { answers: payloadAnswers });
      const updated = data.response;
      setResponses((current) => current.map((item) => Number(item.id) === Number(updated.id) ? updated : item));
      setAnswers(withBeeBriefingCalculations(updated.answers || {}));
      setDirty(false);
      if (!silent) {
        setNotice('Resposta salva.');
        setTimeout(() => setNotice(''), 1800);
      }
      return updated;
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a resposta.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [activeId, answers, clientId, saving]);

  useEffect(() => {
    if (!dirty || !activeId) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => saveCurrent(answers, true), 900);
    return () => clearTimeout(autosaveTimer.current);
  }, [answers, activeId, dirty, saveCurrent]);

  async function createResponse() {
    if (!clientId || !beeActive) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/bee-campaign-briefing', { client_id: clientId, year: YEAR, answers: blankAnswers() });
      const created = data.response;
      setResponses((current) => [created, ...current]);
      setActiveId(created.id);
      setAnswers(withBeeBriefingCalculations(created.answers || {}));
      setDirty(false);
      setCompareOpen(false);
      setNotice('Novo link de resposta criado.');
      setTimeout(() => setNotice(''), 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar a resposta.');
    } finally {
      setSaving(false);
    }
  }

  async function removeResponse() {
    if (!activeResponse || !confirm('Arquivar esta resposta do briefing?')) return;
    try {
      await api.delete(`/bee-campaign-briefing/${activeResponse.id}`);
      const remaining = responses.filter((item) => item.id !== activeResponse.id);
      setResponses(remaining);
      const next = remaining[0] || null;
      setActiveId(next?.id || null);
      setAnswers(next ? withBeeBriefingCalculations(next.answers || {}) : blankAnswers());
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível arquivar a resposta.');
    }
  }

  function selectResponse(item) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (dirty && activeId) saveCurrent(answers, true);
    setActiveId(item.id);
    setAnswers(withBeeBriefingCalculations(item.answers || {}));
    setDirty(false);
    setCompareOpen(false);
  }

  function changeAnswer(name, value) {
    setAnswers((current) => withBeeBriefingCalculations({ ...current, [name]: value }));
    setDirty(true);
  }

  function responseUrl(item = activeResponse) {
    if (!item?.share_token) return '';
    return `${window.location.origin}/briefing-bee-2027/${item.share_token}`;
  }

  async function copyLink(item = activeResponse) {
    const url = responseUrl(item);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copiado.');
      setTimeout(() => setNotice(''), 1800);
    } catch {
      setNotice('Copie o link exibido no navegador.');
    }
  }

  if (!clientId) {
    return <EmptyState title="Selecione a Bee Christian School" text="Use o seletor de clientes no menu lateral para abrir o briefing da Campanha 2027." />;
  }

  if (!beeActive) {
    return <EmptyState title="Briefing exclusivo da Bee" text="Esta etapa só aparece e salva respostas quando a Bee Christian School ou Bee Light está selecionada." />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={FileText}
        eyebrow="Bee Christian School · Campanha 2027"
        title="Briefing Conceitual"
        description="Colete respostas individuais da direção, acompanhe o preenchimento e compare as visões antes de consolidar o norte criativo."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroMetric value={responses.length} label="respostas criadas" />
          <HeroMetric value={responses.filter((r) => r.status === 'submitted').length} label="respostas enviadas" />
          <HeroMetric value={responses.length ? `${Math.round(responses.reduce((sum, r) => sum + Number(r.progress || 0), 0) / responses.length)}%` : '0%'} label="preenchimento médio" />
        </div>
      </PageHero>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-kicker">Coleta da direção</p>
            <h2 className="section-title mt-1">Respostas individuais</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Crie um link para cada diretor. As respostas ficam centralizadas aqui na Bússola e podem ser comparadas antes da consolidação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCompareOpen((v) => !v)} disabled={!responses.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><UsersRound size={16} /> Comparar respostas</button>
            <button type="button" onClick={createResponse} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#121620] px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"><Plus size={16} /> Nova resposta</button>
          </div>
        </div>

        {error && <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="mx-5 mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>}

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Carregando respostas...</div>
        ) : responses.length ? (
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {responses.map((item) => <ResponseCard key={item.id} item={item} active={item.id === activeId} onSelect={() => selectResponse(item)} onCopy={() => copyLink(item)} />)}
          </div>
        ) : (
          <div className="p-9 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Link2 size={21} /></span>
            <h3 className="mt-3 font-semibold text-slate-900">Nenhuma resposta criada ainda</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Crie a primeira resposta para gerar um link individual e começar a coleta da direção.</p>
            <button type="button" onClick={createResponse} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#121620] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Criar primeira resposta</button>
          </div>
        )}
      </section>

      {compareOpen && responses.length > 0 && <Comparison responses={responses} />}

      {activeResponse && !compareOpen && (
        <>
          <section className="surface-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Resposta #{activeResponse.id}</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-slate-900">{answers.respondente || 'Aguardando nome do respondente'}</h2>
                <p className="mt-1 text-sm text-slate-500">{activeResponse.status === 'submitted' ? 'Enviada pela direção' : dirty ? 'Alterações pendentes de salvamento' : saving ? 'Salvando...' : 'Salvamento automático ativo'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copyLink()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700"><Copy size={15} /> Copiar link</button>
                <button type="button" onClick={() => saveCurrent(answers, false)} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-[#121620] px-3.5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Save size={15} /> Salvar agora</button>
                <button type="button" onClick={removeResponse} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700"><Trash2 size={15} /> Arquivar</button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Link2 size={16} className="shrink-0 text-slate-400" />
              <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{responseUrl()}</code>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{beeBriefingProgress(answers)}%</span>
            </div>
          </section>

          <BeeCampaignBriefingForm answers={answers} onChange={changeAnswer} readOnly={activeResponse.status === 'submitted'} />
        </>
      )}
    </div>
  );
}

function ResponseCard({ item, active, onSelect, onCopy }) {
  const statusLabel = item.status === 'submitted' ? 'Enviada' : item.status === 'in_progress' ? 'Em preenchimento' : 'Link criado';
  return (
    <div className={`rounded-2xl border p-4 transition ${active ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-400' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{statusLabel}</span><span className="text-sm font-black text-slate-800">{item.progress || 0}%</span></div>
        <h3 className="mt-3 truncate font-semibold text-slate-900">{item.respondent_name || 'Aguardando respondente'}</h3>
        <p className="mt-1 text-xs text-slate-500">Atualizado {formatDateTime(item.updated_at)}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#EBAE20]" style={{ width: `${item.progress || 0}%` }} /></div>
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onCopy(); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"><Copy size={13} /> Copiar link individual</button>
    </div>
  );
}

function Comparison({ responses }) {
  const rows = [
    ['Público prioritário','publicoPrioritario'],
    ['Maior desejo','maiorDesejo'],
    ['Principal objeção','objecao'],
    ['Percepção desejada','percepcaoDesejada'],
    ['Verdade central','verdadeUnica'],
    ['Promessa','promessaCentral'],
    ['Território','territorio'],
    ['Emoção dominante','emocaoPrincipal'],
    ['Identidade cristã','identidadeCrista'],
    ['Frase-norte','fraseNorte'],
  ];
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5"><p className="section-kicker">Consolidação</p><h2 className="section-title mt-1">Comparativo das respostas</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use este quadro para localizar convergências e divergências antes de aprovar a resposta institucional.</p></div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-sm">
          <thead><tr className="bg-slate-50"><th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Decisão</th>{responses.map((r) => <th key={r.id} className="min-w-[260px] px-4 py-3 text-left font-semibold text-slate-800">{r.respondent_name || `Resposta #${r.id}`}<span className="ml-2 text-xs font-normal text-slate-400">{r.progress}%</span></th>)}</tr></thead>
          <tbody>{rows.map(([label,key]) => <tr key={key} className="border-t border-slate-100 align-top"><td className="sticky left-0 bg-white px-4 py-4 font-semibold text-slate-700">{label}</td>{responses.map((r) => <td key={r.id} className="px-4 py-4 leading-6 text-slate-600">{r.answers?.[key] || <span className="text-slate-300">—</span>}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyState({ title, text }) {
  return <div className="surface-card p-10 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><RefreshCw size={24} /></span><h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p></div>;
}

function HeroMetric({ value, label }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.065] px-4 py-3"><p className="text-xl font-bold text-white">{value}</p><p className="mt-0.5 text-xs text-white/50">{label}</p></div>;
}

function formatDateTime(value) {
  if (!value) return 'agora';
  const parsed = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
