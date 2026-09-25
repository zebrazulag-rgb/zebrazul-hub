import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Check, ChevronDown, ChevronRight, Circle, Compass, ExternalLink, FileCode2, Flag,
  FolderOpen, Link2, Loader2, PackageCheck, RefreshCcw, Rocket, Save, Search, Trash2, UploadCloud, UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import CompassSectionNav from '../components/CompassSectionNav.jsx';
import api from '../api.js';

const COMPASS_CATEGORY_PREFIX = 'Bússola / ';

const JOURNEY = [
  {
    id: 'onboarding', number: '01', title: 'Onboarding', short: 'Começar juntos', icon: UsersRound,
    description: 'Alinhar o início da parceria e colocar cliente e equipe no mesmo ponto de partida.',
    items: [
      { id: 'reuniao-onboarding', title: 'Reunião de onboarding', type: 'check' },
      { id: 'criar-grupo', title: 'Criar grupo e apresentar o time', type: 'check' },
    ],
  },
  {
    id: 'coleta', number: '02', title: 'Coleta de informações', short: 'Conhecer o negócio', icon: FolderOpen,
    description: 'Reunir a base necessária para compreender a empresa antes de definir qualquer direção.',
    items: [
      { id: 'acessos', title: 'Acessos', type: 'check' },
      { id: 'logo', title: 'Logo', type: 'link' },
      { id: 'fotos-banco', title: 'Fotos / banco de imagens', type: 'link' },
      { id: 'servicos-produtos', title: 'Serviços / produtos', type: 'text' },
      { id: 'historia', title: 'História', type: 'text' },
      { id: 'publico-alvo', title: 'Público-alvo', type: 'text' },
      { id: 'proposito-missao-visao-valores', title: 'Propósito, missão, visão e valores', type: 'text' },
      { id: 'analise-concorrentes', title: 'Análise dos concorrentes', type: 'competition' },
    ],
  },
  {
    id: 'primeiras-entregas', number: '03', title: 'Primeiras entregas', short: 'Construir a direção', icon: PackageCheck,
    description: 'Transformar a coleta em entregas estratégicas com prazo e direção clara para a operação.',
    items: [
      { id: 'manual-posicionamento', title: 'Manual de posicionamento', type: 'html' },
      { id: 'branding', title: 'Branding, quando necessário', type: 'html' },
      { id: 'plano-acao-ano', title: 'Plano de ação do ano', type: 'html' },
    ],
  },
  {
    id: 'execucao', number: '04', title: 'Execução', short: 'Colocar em movimento', icon: Rocket,
    description: 'Com a base pronta, o cliente entra na rotina de execução da agência.',
    items: [
      { id: 'base-estrategica', title: 'Base estratégica concluída', type: 'html' },
      { id: 'operacao-liberada', title: 'Operação liberada para execução', type: 'html' },
    ],
  },
  {
    id: 'checkpoint-6m', number: '05', title: 'Checkpoint · 6 meses', short: 'Recalibrar', icon: RefreshCcw,
    description: 'Renovar informações, entender mudanças e registrar o que funcionou e o que precisa evoluir.',
    items: [
      { id: 'atualizar-negocio', title: 'Atualizar informações do negócio', type: 'html' },
      { id: 'revisar-certos', title: 'Revisar o que deu certo', type: 'html' },
      { id: 'revisar-erros', title: 'Revisar o que não deu certo', type: 'html' },
      { id: 'novos-desafios', title: 'Registrar novos desafios e oportunidades', type: 'html' },
    ],
  },
  {
    id: 'checkpoint-anual', number: '06', title: 'Virada do ano', short: 'Renovar a rota', icon: CalendarClock,
    description: 'Fechar o ciclo, atualizar o cenário e preparar a direção estratégica do próximo ano.',
    items: [
      { id: 'atualizar-estrategia', title: 'Atualizar informações estratégicas', type: 'html' },
      { id: 'aprendizados-ano', title: 'Revisar aprendizados do ano', type: 'html' },
      { id: 'atualizar-prioridades', title: 'Atualizar prioridades', type: 'html' },
      { id: 'proximo-plano-anual', title: 'Preparar o próximo plano anual', type: 'html' },
    ],
  },
];

function emptyProgress() {
  return Object.fromEntries(JOURNEY.map((stage) => [
    stage.id,
    Object.fromEntries(stage.items.map((item) => [item.title, false])),
  ]));
}

function entryKey(stageId, itemId) {
  return `${stageId}::${itemId}`;
}

export default function CompassPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const clientId = user?.role === 'client' ? Number(user.client_id) : Number(selectedClient?.id) || null;
  const clientName = user?.role === 'client' ? user?.client_name || 'Seu negócio' : selectedClient?.name || '';
  const canEdit = user?.role !== 'client';
  const storageKey = `zebrahub:compass-journey:${clientId || 'none'}`;
  const [progress, setProgress] = useState(emptyProgress);
  const [openStage, setOpenStage] = useState('onboarding');
  const [materials, setMaterials] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileAction, setFileAction] = useState('');
  const [fileError, setFileError] = useState('');
  const [entries, setEntries] = useState([]);
  const [entryDrafts, setEntryDrafts] = useState({});
  const [entryAction, setEntryAction] = useState('');

  useEffect(() => {
    if (!clientId) return setProgress(emptyProgress());
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      setProgress(saved && typeof saved === 'object' ? { ...emptyProgress(), ...saved } : emptyProgress());
    } catch { setProgress(emptyProgress()); }
  }, [clientId, storageKey]);

  async function loadCompassFiles() {
    if (!clientId) {
      setMaterials([]);
      return;
    }
    setFilesLoading(true);
    setFileError('');
    try {
      const { data } = await api.get(`/materials?client_id=${clientId}`);
      setMaterials((data.materials || []).filter((material) =>
        Number(material.client_id) === Number(clientId) &&
        String(material.category || '').startsWith(COMPASS_CATEGORY_PREFIX)
      ));
    } catch (requestError) {
      setMaterials([]);
      setFileError(requestError.response?.data?.error || 'Não foi possível carregar os arquivos da Bússola.');
    } finally {
      setFilesLoading(false);
    }
  }

  async function loadCompassEntries() {
    if (!clientId) {
      setEntries([]);
      setEntryDrafts({});
      return;
    }
    try {
      const { data } = await api.get(`/materials/compass/entries?client_id=${clientId}`);
      const nextEntries = data.entries || [];
      setEntries(nextEntries);
      setEntryDrafts(Object.fromEntries(nextEntries.map((entry) => [entryKey(entry.stage_id, entry.item_id), entry.value || ''])));
    } catch (requestError) {
      setEntries([]);
      setEntryDrafts({});
      setFileError(requestError.response?.data?.error || 'Não foi possível carregar as informações da Bússola.');
    }
  }

  useEffect(() => {
    loadCompassFiles();
    loadCompassEntries();
  }, [clientId]);

  const materialMap = useMemo(() => {
    const map = new Map();
    materials.forEach((material) => {
      const stageId = String(material.category || '').slice(COMPASS_CATEGORY_PREFIX.length);
      map.set(`${stageId}::${material.title}`, material);
    });
    return map;
  }, [materials]);

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entryKey(entry.stage_id, entry.item_id), entry])), [entries]);

  function materialFor(stageId, itemTitle) {
    return materialMap.get(`${stageId}::${itemTitle}`) || null;
  }

  async function openMaterial(material) {
    if (!material) return;
    setFileError('');
    try {
      const { data } = await api.get(`/materials/${material.id}/access`);
      window.open(data.view_url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setFileError(requestError.response?.data?.error || 'Não foi possível abrir o arquivo HTML.');
    }
  }

  async function uploadMaterial(stage, item, file) {
    if (!file || !clientId || !canEdit) return;
    const extension = String(file.name || '').split('.').pop()?.toLowerCase();
    if (!['html', 'htm'].includes(extension)) {
      setFileError('Envie um arquivo .html ou .htm.');
      return;
    }

    const actionKey = `${stage.id}::${item.title}`;
    const previous = materialFor(stage.id, item.title);
    setFileAction(actionKey);
    setFileError('');
    try {
      const payload = new FormData();
      payload.append('client_id', String(clientId));
      payload.append('stage_id', stage.id);
      payload.append('stage_title', stage.title);
      payload.append('title', item.title);
      payload.append('file', file);
      await api.post('/materials/compass', payload);
      if (previous?.id) {
        try { await api.delete(`/materials/compass/${previous.id}`); } catch {}
      }
      await loadCompassFiles();
    } catch (requestError) {
      setFileError(requestError.response?.data?.error || 'Não foi possível salvar o arquivo HTML.');
    } finally {
      setFileAction('');
    }
  }

  async function removeMaterial(stage, item, material) {
    if (!material || !canEdit) return;
    if (!window.confirm(`Remover o HTML salvo em “${item.title}”?`)) return;
    const actionKey = `${stage.id}::${item.title}`;
    setFileAction(actionKey);
    setFileError('');
    try {
      await api.delete(`/materials/compass/${material.id}`);
      await loadCompassFiles();
    } catch (requestError) {
      setFileError(requestError.response?.data?.error || 'Não foi possível remover o arquivo HTML.');
    } finally {
      setFileAction('');
    }
  }

  async function saveEntry(stage, item) {
    if (!clientId || !canEdit || !['link', 'text'].includes(item.type)) return;
    const key = entryKey(stage.id, item.id);
    setEntryAction(key);
    setFileError('');
    try {
      const { data } = await api.put('/materials/compass/entry', {
        client_id: clientId,
        stage_id: stage.id,
        item_id: item.id,
        kind: item.type,
        value: entryDrafts[key] || '',
      });
      setEntries((current) => {
        const filtered = current.filter((entry) => entryKey(entry.stage_id, entry.item_id) !== key);
        return data.entry ? [...filtered, data.entry] : filtered;
      });
      if (data.entry) setEntryDrafts((current) => ({ ...current, [key]: data.entry.value || '' }));
    } catch (requestError) {
      setFileError(requestError.response?.data?.error || 'Não foi possível salvar essa informação.');
    } finally {
      setEntryAction('');
    }
  }

  const stageProgress = useMemo(() => Object.fromEntries(JOURNEY.map((stage) => {
    const done = stage.items.filter((item) => progress?.[stage.id]?.[item.title]).length;
    return [stage.id, { done, total: stage.items.length, percent: Math.round((done / stage.items.length) * 100) }];
  })), [progress]);

  const total = JOURNEY.reduce((sum, stage) => sum + stage.items.length, 0);
  const done = JOURNEY.reduce((sum, stage) => sum + (stageProgress[stage.id]?.done || 0), 0);
  const overall = total ? Math.round((done / total) * 100) : 0;
  const currentStage = JOURNEY.find((stage) => (stageProgress[stage.id]?.percent || 0) < 100) || JOURNEY[JOURNEY.length - 1];

  function toggle(stageId, itemTitle) {
    if (!canEdit || !clientId) return;
    setProgress((current) => {
      const next = { ...current, [stageId]: { ...(current[stageId] || {}), [itemTitle]: !current?.[stageId]?.[itemTitle] } };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function renderItemAction(stage, item) {
    const key = entryKey(stage.id, item.id);
    const material = materialFor(stage.id, item.title);
    const busyFile = fileAction === `${stage.id}::${item.title}`;
    const busyEntry = entryAction === key;
    const savedEntry = entryMap.get(key);
    const draftValue = entryDrafts[key] ?? savedEntry?.value ?? '';

    if (item.type === 'check') return null;

    if (item.type === 'competition') {
      return (
        <button
          type="button"
          onClick={() => navigate('/bussola/concorrencia')}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          <Search size={14} /> Abrir análise de concorrência <ChevronRight size={13} />
        </button>
      );
    }

    if (item.type === 'link') {
      return (
        <div className="mt-2 space-y-2">
          {savedEntry?.value && (
            <a href={savedEntry.value} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline">
              <Link2 size={13} className="shrink-0" /><span className="truncate">{savedEntry.value}</span><ExternalLink size={12} className="shrink-0" />
            </a>
          )}
          {canEdit ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={draftValue}
                onChange={(event) => setEntryDrafts((current) => ({ ...current, [key]: event.target.value }))}
                placeholder="Cole o link aqui"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button type="button" disabled={busyEntry} onClick={() => saveEntry(stage, item)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50" title="Salvar link">
                {busyEntry ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
            </div>
          ) : !savedEntry?.value ? <p className="text-xs text-slate-400">Nenhum link salvo.</p> : null}
        </div>
      );
    }

    if (item.type === 'text') {
      return canEdit ? (
        <div className="mt-2">
          <textarea
            rows={3}
            value={draftValue}
            onChange={(event) => setEntryDrafts((current) => ({ ...current, [key]: event.target.value }))}
            placeholder="Inserir texto"
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-1.5 flex justify-end">
            <button type="button" disabled={busyEntry} onClick={() => saveEntry(stage, item)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
              {busyEntry ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
            </button>
          </div>
        </div>
      ) : savedEntry?.value ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-600">{savedEntry.value}</p>
      ) : <p className="mt-1.5 text-xs text-slate-400">Nenhum texto salvo.</p>;
    }

    if (item.type === 'html') {
      if (material) {
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openMaterial(material)} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50" title="Abrir HTML">
              <FileCode2 size={15} className="shrink-0" />
              <span className="max-w-[190px] truncate">{material.original_name || 'Arquivo HTML'}</span>
              <ExternalLink size={13} className="shrink-0" />
            </button>
            {canEdit && (
              <>
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 ${busyFile ? 'pointer-events-none opacity-60' : ''}`}>
                  {busyFile ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} Trocar
                  <input type="file" accept=".html,.htm,text/html" className="hidden" disabled={busyFile} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadMaterial(stage, item, file); }} />
                </label>
                <button type="button" onClick={() => removeMaterial(stage, item, material)} disabled={busyFile} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title="Remover HTML">
                  {busyFile ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </>
            )}
          </div>
        );
      }
      return canEdit ? (
        <label className={`mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 ${busyFile ? 'pointer-events-none opacity-60' : ''}`}>
          {busyFile ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          {busyFile ? 'Salvando...' : 'Anexar HTML'}
          <input type="file" accept=".html,.htm,text/html" className="hidden" disabled={busyFile} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadMaterial(stage, item, file); }} />
        </label>
      ) : <p className="mt-1.5 text-xs text-slate-400">Nenhum HTML salvo.</p>;
    }

    return null;
  }

  return (
    <div className="space-y-4">
      <CompassSectionNav />

      {!clientId ? (
        <section className="rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <Compass className="mx-auto text-blue-600" size={28} />
          <h2 className="mt-3 font-bold text-slate-900">Selecione um cliente</h2>
          <p className="mt-1 text-sm text-slate-500">A jornada é individual e acompanha o progresso estratégico de cada cliente.</p>
        </section>
      ) : (
        <>
          <section className="relative overflow-visible rounded-[26px] border border-slate-200 bg-white px-4 py-6 shadow-sm sm:px-6 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Mapa da jornada</p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">Do onboarding à renovação da rota</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden min-w-[150px] sm:block">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400"><span>Progresso</span><strong className="text-slate-700">{overall}%</strong></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${overall}%` }} /></div>
                </div>
                <div className="hidden items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 md:flex"><Flag size={12} /> Agora: {currentStage.title}</div>
              </div>
            </div>

            <div className="relative w-full overflow-visible pb-3">
              <div className="relative min-h-[310px] w-full overflow-visible px-2 py-9 sm:px-4 lg:px-6">
                <svg className="pointer-events-none absolute left-5 right-5 top-[42px] h-[195px] w-[calc(100%-2.5rem)] overflow-visible" viewBox="0 0 1200 210" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M30 150 C115 28,190 28,265 125 S395 205,465 65 S610 10,675 120 S825 195,885 58 S1035 18,1170 102" fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" />
                  <path d="M30 150 C115 28,190 28,265 125 S395 205,465 65 S610 10,675 120 S825 195,885 58 S1035 18,1170 102" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" strokeDasharray="1200" strokeDashoffset={1200 - (overall * 12)} className="transition-all duration-700" />
                </svg>
                <div className="relative grid w-full grid-cols-6 gap-2 sm:gap-3 lg:gap-5">
                  {JOURNEY.map((stage, index) => {
                    const stat = stageProgress[stage.id];
                    const completed = stat.percent === 100;
                    const active = currentStage.id === stage.id;
                    const Icon = stage.icon;
                    const offsets = ['mt-20','mt-1','mt-24','mt-3','mt-20','mt-2'];
                    return <button key={stage.id} type="button" onClick={() => setOpenStage(stage.id)} className={`${offsets[index]} group min-w-0 text-left`}>
                      <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white shadow-md transition group-hover:scale-105 sm:h-12 sm:w-12 ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                        {completed ? <Check size={17} strokeWidth={3} /> : <Icon size={16} />}
                      </div>
                      <div className={`mx-auto mt-2 min-h-[100px] w-full max-w-[156px] rounded-xl border bg-white p-2.5 shadow-sm transition sm:p-3 ${openStage === stage.id ? 'border-blue-300 shadow-blue-950/10' : 'border-slate-200'}`}>
                        <span className="text-[8px] font-black tracking-[0.10em] text-blue-600 sm:text-[9px]">ETAPA {stage.number}</span>
                        <p className="mt-1 break-words text-[10px] font-bold leading-[1.18] text-slate-900 sm:text-[11px] lg:text-xs">{stage.title}</p>
                        <p className="mt-1 text-[9px] text-slate-400 sm:text-[10px]">{stat.done}/{stat.total} concluídos</p>
                      </div>
                    </button>;
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white shadow-sm">
              {JOURNEY.map((stage) => {
                const Icon = stage.icon;
                const opened = openStage === stage.id;
                const stat = stageProgress[stage.id];
                return <div key={stage.id} className="border-b border-slate-100 last:border-0">
                  <button type="button" onClick={() => setOpenStage(opened ? '' : stage.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.percent === 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{stat.percent === 100 ? <Check size={19} /> : <Icon size={19} />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Etapa {stage.number} · {stage.short}</span><span className="mt-0.5 block font-bold text-slate-900">{stage.title}</span></span>
                    <span className="text-xs font-bold text-slate-400">{stat.percent}%</span>
                    {opened ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  </button>
                  {opened && <div className="px-5 pb-5 pl-[76px]">
                    <p className="mb-4 max-w-2xl text-sm leading-6 text-slate-500">{stage.description}</p>
                    {fileError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{fileError}</div>}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {stage.items.map((item) => {
                        const checked = !!progress?.[stage.id]?.[item.title];
                        return <div key={item.id} className={`rounded-xl border p-3 transition ${checked ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
                          <div className="flex items-start gap-3">
                            <button type="button" disabled={!canEdit} onClick={() => toggle(stage.id, item.title)} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'} ${!canEdit ? 'cursor-default' : ''}`} title={checked ? 'Marcar como pendente' : 'Marcar como concluído'}>
                              {checked ? <Check size={13} strokeWidth={3} /> : <Circle size={8} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-semibold ${checked ? 'text-emerald-900' : 'text-slate-800'}`}>{item.title}</p>
                              {renderItemAction(stage, item)}
                            </div>
                          </div>
                        </div>;
                      })}
                    </div>
                    {filesLoading && <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-400"><Loader2 size={13} className="animate-spin" /> Carregando arquivos...</div>}
                  </div>}
                </div>;
              })}
            </div>

            <aside className="rounded-[26px] bg-[#111827] p-5 text-white shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Próximo movimento</p>
              <h3 className="mt-2 text-xl font-black">{currentStage.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{currentStage.description}</p>
              <div className="mt-5 rounded-2xl bg-white/5 p-4">
                <p className="text-xs font-semibold text-slate-400">Pendências desta etapa</p>
                <p className="mt-1 text-3xl font-black">{stageProgress[currentStage.id].total - stageProgress[currentStage.id].done}</p>
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-400">A Bússola não termina na execução: aos 6 meses e na virada do ano, a rota é revisada com novas informações e aprendizados.</p>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
