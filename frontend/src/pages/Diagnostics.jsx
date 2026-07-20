import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  UserRound,
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
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import { DIAGNOSTIC_PILLARS, ATTENTION, RECOMMENDATIONS } from '../diagnosticConfig.js';

const STATUS_LABELS = {
  shared: 'Aguardando resposta',
  in_progress: 'Em preenchimento',
  submitted: 'Concluído',
  archived: 'Arquivado',
};

export default function Diagnostics() {
  const { selectedClient } = useClientFilter();
  const [diagnostics, setDiagnostics] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const clientId = Number(selectedClient?.id) || null;

  const loadDiagnostics = useCallback(async () => {
    if (!clientId) {
      setDiagnostics([]);
      setSelected(null);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/diagnostics', { params: { client_id: clientId } });
      const rows = data.diagnostics || [];
      setDiagnostics(rows);
      const nextId = rows.some((item) => item.id === selectedId) ? selectedId : rows[0]?.id || null;
      setSelectedId(nextId);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar os diagnósticos.');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedId]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    try {
      const { data } = await api.get(`/diagnostics/${selectedId}`);
      setSelected(data.diagnostic || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir o diagnóstico.');
    }
  }, [selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setSelected(null);
    setNewTitle(selectedClient?.name ? `DME — ${selectedClient.name}` : '');
  }, [clientId, selectedClient?.name]);

  useEffect(() => { loadDiagnostics(); }, [clientId]);
  useEffect(() => { loadSelected(); }, [selectedId]);

  async function createDiagnostic() {
    if (!clientId) return;
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/diagnostics', { client_id: clientId, title: newTitle });
      setShowCreate(false);
      setMessage('Diagnóstico criado. O link já pode ser enviado ao cliente.');
      await loadDiagnostics();
      setSelectedId(data.diagnostic.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar o diagnóstico.');
    } finally {
      setCreating(false);
    }
  }

  function shareUrl(item = selected) {
    return item?.share_token ? `${window.location.origin}/diagnostico/${item.share_token}` : '';
  }

  async function copyLink(item = selected) {
    const link = shareUrl(item);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Link copiado. Agora é só enviar ao cliente.');
    } catch {
      window.prompt('Copie o link do diagnóstico:', link);
    }
  }

  async function regenerateLink() {
    if (!selected?.id) return;
    if (!window.confirm('O link anterior deixará de funcionar. Deseja gerar um novo link?')) return;
    try {
      const { data } = await api.post(`/diagnostics/${selected.id}/regenerate-link`);
      setSelected(data.diagnostic);
      await loadDiagnostics();
      setMessage('Novo link criado com sucesso.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível gerar outro link.');
    }
  }

  async function archiveDiagnostic() {
    if (!selected?.id) return;
    if (!window.confirm('Arquivar este diagnóstico? O link público deixará de funcionar.')) return;
    try {
      await api.delete(`/diagnostics/${selected.id}`);
      setSelected(null);
      setSelectedId(null);
      await loadDiagnostics();
      setMessage('Diagnóstico arquivado.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível arquivar o diagnóstico.');
    }
  }

  const completedCount = diagnostics.filter((item) => item.status === 'submitted').length;
  const activeCount = diagnostics.filter((item) => ['shared', 'in_progress'].includes(item.status)).length;

  return (
    <div className="space-y-6">
      <PageHero
        icon={ClipboardCheck}
        eyebrow="Estratégia e imersão"
        title="Diagnóstico de Maturidade Empresarial"
        description="Compartilhe o questionário com o cliente, acompanhe o preenchimento e transforme as respostas em uma leitura estratégica salva no ZebraHub."
        actions={clientId ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] transition hover:-translate-y-0.5"
          >
            <Plus size={17} /> Novo diagnóstico
          </button>
        ) : null}
      >
        {clientId && (
          <div className="grid gap-3 sm:grid-cols-3">
            <HeroMetric label="Cliente selecionado" value={selectedClient?.name || '—'} />
            <HeroMetric label="Diagnósticos concluídos" value={completedCount} />
            <HeroMetric label="Em andamento" value={activeCount} />
          </div>
        )}
      </PageHero>

      {!clientId ? (
        <section className="surface-card p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agency-primary)]"><UserRound size={24} /></span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um cliente</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Use o filtro “Visualizando” no menu lateral. Cada diagnóstico fica vinculado e salvo no cliente escolhido.</p>
        </section>
      ) : (
        <>
          {(error || message) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {error || message}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
            <section className="surface-card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="section-kicker">Histórico</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <h2 className="section-title">Diagnósticos do cliente</h2>
                  <button type="button" onClick={loadDiagnostics} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RefreshCw size={16} /></button>
                </div>
              </div>
              <div className="p-3">
                {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" /> Carregando...</div>}
                {!loading && diagnostics.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <FileText className="mx-auto text-slate-300" size={28} />
                    <p className="mt-3 text-sm font-medium text-slate-700">Nenhum diagnóstico criado</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Crie o primeiro link para começar a imersão.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {diagnostics.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === item.id ? 'border-blue-200 bg-blue-50/70 shadow-sm' : 'border-slate-200/70 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title}</p>
                        <StatusPill status={item.status} />
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--agency-primary)]" style={{ width: `${item.progress || 0}%` }} /></div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{item.progress || 0}% preenchido</span>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="min-w-0">
              {!selected ? (
                <div className="surface-card flex min-h-[420px] items-center justify-center p-8 text-center">
                  <div><ClipboardCheck className="mx-auto text-slate-300" size={38} /><p className="mt-3 text-sm text-slate-500">Selecione ou crie um diagnóstico.</p></div>
                </div>
              ) : (
                <DiagnosticDetail
                  diagnostic={selected}
                  link={shareUrl()}
                  onCopy={copyLink}
                  onRegenerate={regenerateLink}
                  onArchive={archiveDiagnostic}
                />
              )}
            </section>
          </div>
        </>
      )}

      {showCreate && (
        <ModalBackdrop onClose={() => !creating && setShowCreate(false)} disabled={creating}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <p className="section-kicker">Novo ciclo</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Criar diagnóstico para {selectedClient?.name}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Um link exclusivo será criado. As respostas serão salvas automaticamente durante o preenchimento.</p>
            <label className="mt-5 block text-sm font-medium text-slate-700">Título</label>
            <input className="input-field mt-1.5" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</button>
              <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={createDiagnostic} disabled={creating || !newTitle.trim()}>
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Criar e gerar link
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

function DiagnosticDetail({ diagnostic, link, onCopy, onRegenerate, onArchive }) {
  const scores = diagnostic.scores;
  const radarData = scores?.pillars?.map((pillar) => ({ subject: pillar.short, score: pillar.score, fullMark: 5 })) || [];
  const sorted = [...(scores?.pillars || [])].sort((a, b) => a.score - b.score);
  const priorities = sorted.slice(0, 3);
  const strengths = [...(scores?.pillars || [])].sort((a, b) => b.score - a.score).slice(0, 2);
  const answers = diagnostic.answers || {};

  return (
    <div className="space-y-5">
      <section className="surface-card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><StatusPill status={diagnostic.status} /><span className="text-xs text-slate-400">Criado em {formatDate(diagnostic.created_at)}</span></div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{diagnostic.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{diagnostic.client_name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onCopy} className="btn-primary inline-flex items-center gap-2"><Copy size={16} /> Copiar link</button>
              <a href={link} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2"><ExternalLink size={16} /> Abrir</a>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-4">
          <MetricCard icon={BarChart3} label="Progresso" value={`${diagnostic.progress || 0}%`} />
          <MetricCard icon={UserRound} label="Responsável" value={diagnostic.respondent_name || 'Ainda não informado'} small />
          <MetricCard icon={Clock3} label="Último salvamento" value={formatDateTime(diagnostic.last_saved_at)} small />
          <MetricCard icon={CheckCircle2} label="Nota geral" value={diagnostic.status === 'submitted' ? Number(diagnostic.overall_score || 0).toFixed(1).replace('.', ',') : '—'} />
        </div>
        <div className="mx-6 mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Link compartilhável</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input className="input-field flex-1 bg-white" readOnly value={link} onFocus={(event) => event.target.select()} />
            <button type="button" onClick={onRegenerate} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw size={15} /> Gerar novo</button>
            <button type="button" onClick={onArchive} className="btn-secondary inline-flex items-center justify-center gap-2 text-red-600"><Archive size={15} /> Arquivar</button>
          </div>
        </div>
      </section>

      {diagnostic.status !== 'submitted' ? (
        <section className="surface-card p-7">
          <div className="flex items-start gap-4">
            <span className="icon-tile bg-blue-50 text-[var(--agency-primary)]"><Send size={18} /></span>
            <div>
              <h3 className="font-semibold text-slate-900">Aguardando o cliente concluir</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">As respostas ficam salvas automaticamente. Esta tela será atualizada quando você recarregar ou retornar ao diagnóstico.</p>
            </div>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--agency-primary)] transition-all" style={{ width: `${diagnostic.progress || 0}%` }} /></div>
        </section>
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="surface-card flex flex-col items-center justify-center p-7 text-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-[12px] border-blue-50 bg-white shadow-inner">
                <span className="text-4xl font-bold text-slate-900">{Number(scores?.overall || 0).toFixed(1).replace('.', ',')}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{scores?.maturity?.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{scores?.maturity?.description}</p>
            </div>
            <div className="surface-card min-h-[420px] p-5">
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={radarData} outerRadius="66%">
                  <PolarGrid stroke="#dbe4ef" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip formatter={(value) => Number(value).toFixed(1).replace('.', ',')} />
                  <Radar name="Maturidade" dataKey="score" stroke="var(--agency-primary)" fill="var(--agency-primary)" fillOpacity={0.24} strokeWidth={2.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="surface-card p-6">
            <p className="section-kicker">Resultado por pilar</p>
            <h3 className="section-title mt-1">Mapa de maturidade</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(scores?.pillars || []).map((pillar) => (
                <div key={pillar.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{pillar.title}</p><span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-bold text-[var(--agency-primary)]">{Number(pillar.score).toFixed(1).replace('.', ',')}</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full bg-[var(--agency-primary)]" style={{ width: `${(pillar.score / 5) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <InsightCard title="Forças identificadas" items={strengths.map((item) => `${item.short}: é um dos pilares mais maduros e pode apoiar os próximos avanços.`)} />
            <InsightCard title="Prioridades estratégicas" items={priorities.map((item) => `${item.short}: ${RECOMMENDATIONS[item.id]}.`)} />
            <InsightCard title="Pontos de atenção" items={priorities.map((item) => ATTENTION[item.id])} />
          </section>

          <section className="surface-card p-6">
            <p className="section-kicker">Respostas abertas</p>
            <h3 className="section-title mt-1">Leitura qualitativa</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Answer label="Descrição da empresa" value={answers.businessDescription} />
              <Answer label="Principal problema do ano" value={answers.oneProblem} />
              <Answer label="Barreira de crescimento" value={answers.growthBarrier} />
              <Answer label="Objetivo para 12 meses" value={answers.twelveMonths} />
              <Answer label="Expectativa da parceria" value={answers.expectation} />
              <Answer label="Critério de sucesso" value={answers.success} />
              {DIAGNOSTIC_PILLARS.map((pillar) => <Answer key={pillar.id} label={pillar.open} value={answers[`${pillar.id}_open`]} />)}
              <Answer label="Informações adicionais" value={answers.additional} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function HeroMetric({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3"><p className="text-xs text-white/45">{label}</p><p className="mt-1 truncate text-lg font-semibold text-white">{value}</p></div>; }
function MetricCard({ icon: Icon, label, value, small }) { return <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--agency-primary)] shadow-sm"><Icon size={17} /></span><p className="mt-3 text-xs text-slate-400">{label}</p><p className={`${small ? 'text-sm' : 'text-xl'} mt-1 break-words font-semibold text-slate-900`}>{value}</p></div>; }
function StatusPill({ status }) { const styles = status === 'submitted' ? 'bg-emerald-50 text-emerald-700' : status === 'in_progress' ? 'bg-amber-50 text-amber-700' : status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'; return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles}`}>{STATUS_LABELS[status] || status}</span>; }
function InsightCard({ title, items }) { return <article className="surface-card p-5"><h3 className="font-semibold text-slate-900">{title}</h3><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--agency-primary)]" />{item}</li>)}</ul></article>; }
function Answer({ label, value }) { return <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || 'Não informado.'}</p></div>; }
function formatDate(value) { if (!value) return '—'; return new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleDateString('pt-BR'); }
function formatDateTime(value) { if (!value) return 'Ainda não salvo'; return new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
