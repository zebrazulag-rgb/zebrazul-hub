import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Clock3, Copy, FilePlus2, History, Link2, Loader2, MessageCircle, RefreshCw, Send, Target, Trash2, X } from 'lucide-react';
import api from '../api.js';
import PageHero from '../components/PageHero.jsx';
import CompassSectionNav from '../components/CompassSectionNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import presenceMapHtml from '../content/presence-map.html?raw';

const FRAME_BRIDGE = String.raw`
<style>
  body.zh-embed .app{max-width:1180px;padding-top:0}
  body.zh-embed .hero{display:none}
  body.zh-embed .progress-wrap{top:0}
  body.zh-readonly .form-area{display:none!important}
  body.zh-readonly #editBtn{display:none!important}
  body.zh-readonly .cta-box{display:none!important}
  body.zh-embed .footer{display:none}
</style>
<script>
(function(){
  document.body.classList.add('zh-embed');
  var readOnly=false;
  var saveTimer=null;
  function post(type,payload){ try{ parent.postMessage({source:'zebrahub-presence-map',type:type,payload:payload||{}},'*'); }catch(e){} }
  function clientSnapshot(){ try{return readClient();}catch(e){return{}} }
  function answerSnapshot(){ try{return readAnswers();}catch(e){return{}} }
  function progress(){
    try{
      var a=answerSnapshot();
      var items=getItems();
      var done=items.filter(function(it){return it.type==='checkbox'?(a[it.id]||[]).length>0:a[it.id]!=null}).length;
      return items.length?Math.round(done/items.length*100):0;
    }catch(e){return 0}
  }
  function enrichedResult(){
    try{
      var d=calculate(answerSnapshot(),currentNiche);
      var top=d.ranked&&d.ranked[0];
      return Object.assign({},d,{
        archetype_name:top&&ARCHETYPES[top]?ARCHETYPES[top][0]:'',
        archetype_text:top&&ARCHETYPES[top]?ARCHETYPES[top][1]:'',
        top_need_key:top||'',
        top_need_name:top&&NEEDS[top]?NEEDS[top]:'',
        top_needs:(d.ranked||[]).slice(0,3).map(function(k){return{key:k,name:NEEDS[k],score:d.needs[k]}}),
        pressure_level:lvl(d.pressure),
        differentiation_level:lvl(d.diff),
        position_name:POSITION[d.position]?POSITION[d.position][0]:'',
        priority_environments:ENVS.map(function(name,i){return{name:name,priority:d.prio[i],viability:d.via[i],decision:d.quad[i]}}).sort(function(a,b){return b.priority-a.priority}).slice(0,5)
      });
    }catch(e){return null}
  }
  function emitSave(){
    if(readOnly)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(function(){post('save',{answers:answerSnapshot(),client:clientSnapshot(),niche_key:currentNiche,progress:progress()})},500);
  }
  function clearForm(){
    try{document.getElementById('diagnosticForm').reset()}catch(e){}
    try{document.querySelectorAll('[data-client]').forEach(function(i){i.value=''})}catch(e){}
  }
  function apply(payload){
    payload=payload||{};
    readOnly=!!payload.readOnly;
    document.body.classList.toggle('zh-readonly',readOnly);
    try{localStorage.removeItem(CONFIG.storageKey)}catch(e){}
    try{
      var nk=payload.niche_key&&NICHES[payload.niche_key]?payload.niche_key:'geral';
      currentNiche=nk;
      renderNiches();updateNicheNote();renderQuestions();clearForm();
      var c=payload.client||{};
      Object.keys(c).forEach(function(k){var el=document.querySelector('[data-client="'+k+'"]');if(el&&c[k]!=null)el.value=String(c[k])});
      if(!document.getElementById('c_data').value)document.getElementById('c_data').value=new Date().toISOString().slice(0,10);
      restore(payload.answers||{});updateProgress();
      document.getElementById('results').classList.remove('show');document.body.classList.remove('done');
      if(payload.status==='submitted'){
        render(calculate(payload.answers||{},currentNiche),clientSnapshot());
        document.getElementById('results').classList.add('show');
        document.body.classList.add('done');
      }
    }catch(e){post('error',{message:String(e&&e.message||e)})}
    setTimeout(reportHeight,60);
  }
  function reportHeight(){
    try{post('height',{height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,640)})}catch(e){}
  }
  window.addEventListener('message',function(event){
    if(!event.data||event.data.source!=='zebrahub-presence-host')return;
    if(event.data.type==='load')apply(event.data.payload);
  });
  document.addEventListener('change',emitSave,true);
  document.addEventListener('input',function(e){if(e.target&&e.target.dataset&&e.target.dataset.client)emitSave()},true);
  var form=document.getElementById('diagnosticForm');
  if(form)form.addEventListener('submit',function(){
    setTimeout(function(){
      var result=enrichedResult();
      if(result)post('submit',{answers:answerSnapshot(),client:clientSnapshot(),niche_key:currentNiche,progress:100,result:result});
      reportHeight();
    },80);
  });
  try{new ResizeObserver(reportHeight).observe(document.body)}catch(e){setInterval(reportHeight,1200)}
  post('ready',{});reportHeight();
})();
</script>`;

function buildFrameHtml() {
  const index = presenceMapHtml.lastIndexOf('</body>');
  if (index < 0) return `${presenceMapHtml}${FRAME_BRIDGE}`;
  return `${presenceMapHtml.slice(0, index)}${FRAME_BRIDGE}${presenceMapHtml.slice(index)}`;
}

function dateLabel(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  } catch { return String(value); }
}

function sourceLabel(value) {
  if (value === 'trial') return 'Experience';
  if (value === 'team') return 'Equipe Zebra Azul';
  return 'Cliente';
}

function Delta({ label, value, suffix = '' }) {
  const number = Number(value || 0);
  const positive = number > 0;
  const neutral = number === 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black ${neutral ? 'text-slate-500' : positive ? 'text-emerald-600' : 'text-rose-600'}`}>
        {positive ? '+' : ''}{number}{suffix}
      </p>
    </div>
  );
}

export default function PresenceDiagnosis() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const isClient = user?.role === 'client';
  const clientId = isClient ? Number(user?.client_id) : Number(selectedClient?.id) || null;
  const clientName = isClient ? (user?.client_name || 'Seu negócio') : (selectedClient?.name || '');
  const clientSegment = isClient ? '' : (selectedClient?.segment || '');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareDiagnostic, setShareDiagnostic] = useState(null);
  const [frameHeight, setFrameHeight] = useState(900);
  const iframeRef = useRef(null);
  const frameReadyRef = useRef(false);
  const html = useMemo(() => buildFrameHtml(), []);

  const loadList = useCallback(async (preferId = null) => {
    if (!clientId) { setItems([]); setSelected(null); setSelectedId(null); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/presence-diagnostics', { params: { client_id: clientId } });
      const rows = data.diagnostics || [];
      setItems(rows);
      const next = preferId || (rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id || null);
      setSelectedId(next);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o Mapa da Marca.');
    } finally { setLoading(false); }
  }, [clientId, selectedId]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) { setSelected(null); return; }
    try {
      const { data } = await api.get(`/presence-diagnostics/${selectedId}`);
      setSelected(data.diagnostic || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir este diagnóstico.');
    }
  }, [selectedId]);

  useEffect(() => {
    setSelectedId(null); setSelected(null); setItems([]);
    if (clientId) loadList();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSelected(); }, [selectedId, loadSelected]);

  const framePayload = useMemo(() => {
    if (!selected) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      status: selected.status,
      readOnly: selected.status === 'submitted',
      niche_key: selected.niche_key || 'geral',
      answers: selected.answers || {},
      client: {
        empresa: selected.company_name || clientName,
        segmento: selected.segment || clientSegment || '',
        responsavel: selected.respondent || user?.name || '',
        data: selected.submitted_at ? String(selected.submitted_at).slice(0, 10) : today,
      },
    };
  }, [selected, clientName, clientSegment, user?.name]);

  const sendFrame = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !framePayload || !frameReadyRef.current) return;
    iframeRef.current.contentWindow.postMessage({ source: 'zebrahub-presence-host', type: 'load', payload: framePayload }, '*');
  }, [framePayload]);

  useEffect(() => { sendFrame(); }, [sendFrame]);

  useEffect(() => {
    const handler = async (event) => {
      const packet = event.data;
      if (!packet || packet.source !== 'zebrahub-presence-map') return;
      if (packet.type === 'ready') {
        frameReadyRef.current = true;
        sendFrame();
        return;
      }
      if (packet.type === 'height') {
        const next = Math.max(640, Math.min(9000, Number(packet.payload?.height) || 900));
        setFrameHeight(next);
        return;
      }
      if (packet.type === 'error') {
        setError(packet.payload?.message || 'O formulário encontrou um erro.');
        return;
      }
      if (!selected?.id || selected.status === 'submitted') return;
      const payload = packet.payload || {};
      if (packet.type === 'save' || packet.type === 'submit') {
        setSaving(true); setError('');
        try {
          const { data } = await api.put(`/presence-diagnostics/${selected.id}`, {
            status: packet.type === 'submit' ? 'submitted' : 'in_progress',
            answers: payload.answers || {},
            result: packet.type === 'submit' ? payload.result : undefined,
            progress: payload.progress || 0,
            niche_key: payload.niche_key || 'geral',
            company_name: payload.client?.empresa || clientName,
            segment: payload.client?.segmento || '',
            respondent: payload.client?.responsavel || user?.name || '',
          });
          setSelected(data.diagnostic);
          if (packet.type === 'submit') {
            setMessage('Mapa da Marca salvo no histórico do cliente.');
            await loadList(data.diagnostic.id);
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Não foi possível salvar o diagnóstico.');
        } finally { setSaving(false); }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [selected, clientName, user?.name, loadList, sendFrame]);

  async function createNew() {
    if (!clientId || creating) return;
    setCreating(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/presence-diagnostics', { client_id: clientId, force_new: true });
      await loadList(data.diagnostic.id);
      setSelectedId(data.diagnostic.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível iniciar um novo diagnóstico.');
    } finally { setCreating(false); }
  }

  async function continueOrCreate() {
    if (!clientId || creating) return;
    setCreating(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/presence-diagnostics', { client_id: clientId });
      await loadList(data.diagnostic.id);
      setSelectedId(data.diagnostic.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível iniciar o diagnóstico.');
    } finally { setCreating(false); }
  }

  async function archiveSelected() {
    if (!selected?.id || isClient) return;
    if (!window.confirm('Arquivar este diagnóstico? O histórico anterior continuará preservado.')) return;
    try {
      await api.delete(`/presence-diagnostics/${selected.id}`);
      setSelected(null); setSelectedId(null);
      await loadList();
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível arquivar.'); }
  }

  async function deleteSelectedPermanently() {
    if (!selected?.id || isClient) return;
    const concluded = selected.status === 'submitted' ? ' (diagnóstico concluído)' : '';
    if (!window.confirm(`Apagar definitivamente as respostas e o resultado deste diagnóstico${concluded}? Esta ação não pode ser desfeita. Será criado um backup de segurança antes.`)) return;
    try {
      await api.delete(`/presence-diagnostics/${selected.id}/permanent`, { data: { confirm: true } });
      setSelected(null); setSelectedId(null);
      setMessage('Diagnóstico apagado.');
      await loadList();
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível apagar o diagnóstico.'); }
  }

  function publicShareUrl(item = shareDiagnostic) {
    return item?.share_token ? `${window.location.origin}/mapa-da-marca/${item.share_token}` : '';
  }

  async function prepareShareLink() {
    if (!clientId || isClient || shareBusy) return;
    setShareBusy(true); setError(''); setMessage('');
    try {
      let target = selected && selected.status !== 'submitted'
        ? selected
        : items.find((item) => ['draft', 'in_progress'].includes(item.status));
      if (!target) {
        const { data } = await api.post('/presence-diagnostics', { client_id: clientId });
        target = data.diagnostic;
      }
      const { data } = await api.post(`/presence-diagnostics/${target.id}/share-link`);
      setShareDiagnostic(data.diagnostic);
      setSelectedId(data.diagnostic.id);
      await loadList(data.diagnostic.id);
      setShareOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível gerar o link para o cliente.');
    } finally { setShareBusy(false); }
  }

  async function copyShareLink() {
    const link = publicShareUrl();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Link do Mapa da Marca copiado.');
    } catch {
      window.prompt('Copie o link do Mapa da Marca:', link);
    }
  }

  async function nativeShareLink() {
    const link = publicShareUrl();
    if (!link) return;
    const text = `Olá! A Zebra Azul preparou o Mapa da Marca da ${clientName}. Responda pelo link abaixo:`;
    if (navigator.share) {
      try { await navigator.share({ title: `Mapa da Marca · ${clientName}`, text, url: link }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}
${link}`)}`, '_blank', 'noopener,noreferrer');
  }

  function sendWhatsApp() {
    const link = publicShareUrl();
    if (!link) return;
    const text = `Olá! A Zebra Azul preparou o Mapa da Marca da ${clientName}. Responda com calma pelo link abaixo. O progresso fica salvo automaticamente.

${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  const submitted = items.filter((item) => item.status === 'submitted');
  const selectedIndex = submitted.findIndex((item) => item.id === selectedId);
  const previous = selectedIndex >= 0 ? submitted[selectedIndex + 1] : null;
  const comparison = selected?.status === 'submitted' && previous?.result ? {
    pressure: Number(selected.result?.pressure || 0) - Number(previous.result?.pressure || 0),
    diff: Number(selected.result?.diff || 0) - Number(previous.result?.diff || 0),
    oldNeed: previous.result?.top_need_name || '—',
    newNeed: selected.result?.top_need_name || '—',
  } : null;

  if (!clientId) {
    return (
      <div className="space-y-6">
        {!isClient ? <CompassSectionNav /> : null}
        <PageHero icon={Target} eyebrow="Diagnóstico estratégico" title="Mapa da Marca" description="Selecione um cliente no menu lateral para abrir, aplicar e comparar diagnósticos." />
        <section className="surface-card p-10 text-center"><Target className="mx-auto text-slate-300" size={34} /><p className="mt-4 text-sm font-semibold text-slate-600">Selecione um cliente para começar.</p></section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {!isClient ? <CompassSectionNav /> : null}
      <PageHero
        icon={Target}
        eyebrow="Mapa de presença e conexão"
        title="Mapa da Marca"
        description="Diagnóstico estratégico salvo no ZebraHub para orientar comunicação, concorrência, ambientes prioritários e evolução da marca ao longo do tempo."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {!isClient ? (
              <button type="button" onClick={prepareShareLink} disabled={shareBusy} className="inline-flex items-center gap-2 rounded-xl bg-[#CBFF3B] px-4 py-2.5 text-sm font-black text-[#17181C] transition hover:-translate-y-0.5 disabled:opacity-50">
                {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar link ao cliente
              </button>
            ) : null}
            {selected?.status === 'submitted' ? (
              <button type="button" onClick={createNew} disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] disabled:opacity-50">
                {creating ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />} Novo diagnóstico
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-white/45">Empresa</p><p className="mt-1 font-black text-white">{clientName}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-white/45">Histórico concluído</p><p className="mt-1 text-2xl font-black text-white">{submitted.length}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-white/45">Última leitura</p><p className="mt-1 font-black text-white">{submitted[0]?.result?.archetype_name || 'Ainda não concluída'}</p></div>
        </div>
      </PageHero>

      {(error || message) ? <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="surface-card h-fit overflow-hidden xl:sticky xl:top-24">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3"><div><p className="section-kicker">Histórico</p><h2 className="section-title mt-1">Diagnósticos</h2></div><button type="button" onClick={() => loadList()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><RefreshCw size={16} /></button></div>
          </div>
          <div className="p-3">
            {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" /> Carregando...</div> : null}
            {!loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center"><History className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-semibold text-slate-700">Seu primeiro mapa começa aqui.</p><button type="button" onClick={continueOrCreate} disabled={creating} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#17181C] px-4 py-2.5 text-xs font-black text-white">{creating ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />} Iniciar diagnóstico</button></div>
            ) : null}
            <div className="space-y-2">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === item.id ? 'border-[#3A85FD]/35 bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-black text-slate-800">{item.status === 'submitted' ? (item.result?.archetype_name || 'Mapa concluído') : 'Diagnóstico em andamento'}</p><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] ${item.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.status === 'submitted' ? 'Concluído' : `${item.progress || 0}%`}</span></div>
                  <p className="mt-2 text-xs text-slate-500">{sourceLabel(item.source)} · {dateLabel(item.submitted_at || item.updated_at)}</p>
                  {item.result?.top_need_name ? <p className="mt-2 text-xs font-semibold text-slate-600">Prioridade: {item.result.top_need_name}</p> : null}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {comparison ? (
            <section className="rounded-[24px] border border-slate-200 bg-[#F8F8F5] p-5">
              <div className="flex items-center gap-2"><BarChart3 size={17} className="text-[#3A85FD]" /><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Evolução desde o diagnóstico anterior</p></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><Delta label="Pressão do mercado" value={comparison.pressure} suffix=" p.p." /><Delta label="Diferenciação" value={comparison.diff} suffix=" p.p." /><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Necessidade dominante</p><p className="mt-1 text-sm font-black text-slate-800">{comparison.oldNeed} → {comparison.newNeed}</p></div></div>
            </section>
          ) : null}

          {!selected ? (
            <section className="surface-card flex min-h-[420px] items-center justify-center p-8 text-center"><div><Target className="mx-auto text-slate-300" size={38} /><p className="mt-3 text-sm text-slate-500">Inicie ou selecione um diagnóstico no histórico.</p>{items.length > 0 ? <button type="button" onClick={continueOrCreate} className="mt-4 rounded-xl bg-[#17181C] px-4 py-2.5 text-xs font-black text-white">Continuar diagnóstico</button> : null}</div></section>
          ) : (
            <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-[#F5F3EE] shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
                <div className="flex items-center gap-3"><Clock3 size={16} className="text-slate-400" /><div><p className="text-xs font-black text-slate-800">{selected.status === 'submitted' ? 'Versão concluída' : 'Respostas salvas automaticamente'}</p><p className="text-[11px] text-slate-400">{saving ? 'Salvando...' : `Atualizado em ${dateLabel(selected.updated_at)}`}</p></div></div>
                {!isClient && selected.status !== 'submitted' ? <button type="button" onClick={archiveSelected} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50"><Trash2 size={14} /> Arquivar</button> : null}
                {!isClient ? <button type="button" onClick={deleteSelectedPermanently} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-700"><Trash2 size={14} /> Apagar respostas</button> : null}
              </div>
              <iframe
                ref={iframeRef}
                title="Mapa de Presença e Conexão"
                srcDoc={html}
                onLoad={() => { frameReadyRef.current = false; setTimeout(() => { frameReadyRef.current = true; sendFrame(); }, 80); }}
                style={{ width: '100%', height: frameHeight, border: 0, display: 'block', background: '#F5F3EE' }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              />
            </section>
          )}
        </main>
      </div>

      {shareOpen && shareDiagnostic ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false); }}>
          <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#17181C] text-[#CBFF3B]"><Link2 size={20} /></div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Mapa da Marca · link do cliente</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-900">Enviar para {clientName}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">O cliente não precisa entrar no ZebraHub. Ele abre o link, responde no próprio celular ou computador e o progresso fica salvo automaticamente no cadastro dele.</p>
              </div>
              <button type="button" onClick={() => setShareOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Link exclusivo</p>
              <div className="flex items-center gap-2">
                <input readOnly value={publicShareUrl()} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600 outline-none" />
                <button type="button" onClick={copyShareLink} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100" title="Copiar link"><Copy size={17} /></button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={sendWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-black text-white"><MessageCircle size={17} /> Enviar no WhatsApp</button>
              <button type="button" onClick={nativeShareLink} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17181C] px-4 py-3 text-sm font-black text-white"><Send size={17} /> Compartilhar link</button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">Quando ele concluir, o resultado entra automaticamente no histórico do cliente e passa a alimentar o direcionamento estratégico do ZebraHub.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
