import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Save, Target } from 'lucide-react';
import axios from 'axios';
import presenceMapHtml from '../content/presence-map.html?raw';

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const FRAME_BRIDGE = String.raw`
<style>
  body.zh-public .app{max-width:1180px;padding-top:18px}
  body.zh-public .hero{display:none}
  body.zh-public .progress-wrap{top:0}
  body.zh-readonly .form-area{display:none!important}
  body.zh-readonly #editBtn{display:none!important}
  body.zh-readonly .cta-box{display:none!important}
  body.zh-public .footer{display:none}
</style>
<script>
(function(){
  document.body.classList.add('zh-public');
  var readOnly=false;
  var saveTimer=null;
  function post(type,payload){ try{ parent.postMessage({source:'zebrahub-public-presence-map',type:type,payload:payload||{}},'*'); }catch(e){} }
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
    saveTimer=setTimeout(function(){post('save',{answers:answerSnapshot(),client:clientSnapshot(),niche_key:currentNiche,progress:progress()})},650);
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
    if(!event.data||event.data.source!=='zebrahub-public-presence-host')return;
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

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE]"><div className="text-center"><Loader2 className="mx-auto animate-spin text-[#3A85FD]" size={30} /><p className="mt-3 text-sm font-semibold text-slate-500">Abrindo seu Mapa da Marca...</p></div></div>;
}

function ErrorScreen({ message }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] px-6"><div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm"><Target className="mx-auto text-rose-400" size={34} /><h1 className="mt-4 text-xl font-black text-slate-900">Não foi possível abrir este link</h1><p className="mt-2 text-sm leading-6 text-slate-500">{message}</p></div></div>;
}

export default function PublicPresenceDiagnosis() {
  const token = window.location.pathname.split('/').filter(Boolean).pop();
  const [diagnostic, setDiagnostic] = useState(null);
  const [agency, setAgency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [frameHeight, setFrameHeight] = useState(900);
  const iframeRef = useRef(null);
  const frameReadyRef = useRef(false);
  const html = useMemo(() => buildFrameHtml(), []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await publicApi.get(`/public/presence-diagnostics/${token}`);
      setDiagnostic(data.diagnostic || null);
      setAgency(data.agency || null);
      document.title = `Mapa da Marca · ${data.diagnostic?.client_name || data.agency?.name || 'ZebraHub'}`;
    } catch (err) {
      setError(err.response?.data?.error || 'Este link não está disponível.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const framePayload = useMemo(() => {
    if (!diagnostic) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      status: diagnostic.status,
      readOnly: diagnostic.status === 'submitted',
      niche_key: diagnostic.niche_key || 'geral',
      answers: diagnostic.answers || {},
      client: {
        empresa: diagnostic.company_name || diagnostic.client_name || '',
        segmento: diagnostic.segment || '',
        responsavel: diagnostic.respondent || '',
        data: diagnostic.submitted_at ? String(diagnostic.submitted_at).slice(0, 10) : today,
      },
    };
  }, [diagnostic]);

  const sendFrame = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !framePayload || !frameReadyRef.current) return;
    iframeRef.current.contentWindow.postMessage({ source: 'zebrahub-public-presence-host', type: 'load', payload: framePayload }, '*');
  }, [framePayload]);

  useEffect(() => { sendFrame(); }, [sendFrame]);

  useEffect(() => {
    const handler = async (event) => {
      const packet = event.data;
      if (!packet || packet.source !== 'zebrahub-public-presence-map') return;
      if (packet.type === 'ready') { frameReadyRef.current = true; sendFrame(); return; }
      if (packet.type === 'height') { setFrameHeight(Math.max(640, Math.min(9000, Number(packet.payload?.height) || 900))); return; }
      if (packet.type === 'error') { setError(packet.payload?.message || 'O formulário encontrou um erro.'); return; }
      if (!diagnostic || diagnostic.status === 'submitted') return;
      const payload = packet.payload || {};
      if (packet.type !== 'save' && packet.type !== 'submit') return;
      setSaving(true); setError('');
      try {
        const body = {
          answers: payload.answers || {},
          result: packet.type === 'submit' ? payload.result : undefined,
          progress: packet.type === 'submit' ? 100 : (payload.progress || 0),
          niche_key: payload.niche_key || 'geral',
          company_name: payload.client?.empresa || diagnostic.client_name || '',
          segment: payload.client?.segmento || '',
          respondent: payload.client?.responsavel || '',
        };
        const { data } = packet.type === 'submit'
          ? await publicApi.post(`/public/presence-diagnostics/${token}/submit`, body)
          : await publicApi.put(`/public/presence-diagnostics/${token}`, body);
        setDiagnostic(data.diagnostic || diagnostic);
        if (packet.type === 'submit') setNotice('Mapa da Marca enviado. A equipe da Zebra Azul já recebeu suas respostas.');
      } catch (err) {
        setError(err.response?.data?.error || 'Não foi possível salvar suas respostas.');
      } finally { setSaving(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [diagnostic, token, sendFrame]);

  if (loading) return <LoadingScreen />;
  if (error && !diagnostic) return <ErrorScreen message={error} />;

  const primary = agency?.primary_color || '#3A85FD';
  const dark = agency?.sidebar_color || '#17181C';

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-[#17181C]" style={{ '--map-primary': primary, '--map-dark': dark }}>
      <header className="border-b border-white/10 bg-[var(--map-dark)] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {agency?.logo_data ? <img src={agency.logo_data} alt={agency.name} className="max-h-11 max-w-[180px] object-contain" /> : <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Building2 size={21} /></span>}
            <div className="min-w-0"><p className="truncate text-sm font-black">{agency?.name || 'Zebra Azul'}</p><p className="truncate text-xs text-white/50">Mapa de Presença e Conexão</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-white/60">{saving ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : diagnostic?.status === 'submitted' ? <><CheckCircle2 size={15} className="text-[#CBFF3B]" /> Concluído</> : <><Save size={15} /> Salvamento automático</>}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 lg:px-8">
        <section className="mb-5 rounded-[28px] bg-[var(--map-dark)] p-6 text-white sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[.14em] text-[#CBFF3B]">Diagnóstico estratégico</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-5xl">Mapa da Marca</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">Responda com sinceridade sobre o momento atual de <strong className="text-white">{diagnostic?.client_name}</strong>. Você pode fechar esta página e continuar depois pelo mesmo link.</p>
        </section>
        {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}
        {error && diagnostic ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-[#F5F3EE] shadow-sm">
          <iframe
            ref={iframeRef}
            title="Mapa da Marca"
            srcDoc={html}
            onLoad={() => { frameReadyRef.current = false; setTimeout(() => { frameReadyRef.current = true; sendFrame(); }, 80); }}
            style={{ width: '100%', height: frameHeight, border: 0, display: 'block', background: '#F5F3EE' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          />
        </section>
      </main>
      <footer className="border-t border-black/10 px-4 py-7 text-center text-xs text-slate-400">Mapa da Marca · {agency?.name || 'Zebra Azul'} · Tecnologia ZebraHub</footer>
    </div>
  );
}
