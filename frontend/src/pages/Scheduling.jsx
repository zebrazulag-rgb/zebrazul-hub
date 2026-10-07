import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, Check, CheckCheck, Copy, Download, Images, Loader2, RotateCcw } from 'lucide-react';
import api from '../api';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const TABS = [
  { key: 'approved', label: 'Para agendar' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'posted', label: 'Postadas' },
];

function formatDate(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return day.split('-').reverse().join('/');
}

function slug(text) {
  return String(text || 'peca').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'peca';
}

function extensionFor(mime, src) {
  const fromMime = String(mime || '').split('/')[1]?.split(';')[0];
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const match = String(src || '').match(/\.(png|jpe?g|webp|gif|avif)(\?|$)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(area);
    return ok;
  }
}

async function downloadImage(image, filename) {
  let href = image.data;
  let revoke = null;
  if (!String(href).startsWith('data:')) {
    // Arquivo do servidor (/api/media/...): baixa como blob para forçar o download em vez de abrir.
    const response = await fetch(href);
    const blob = await response.blob();
    href = URL.createObjectURL(blob);
    revoke = href;
  }
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(revoke), 4000);
}

function ScheduleCard({ item, busy, onStage }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const images = item.images || [];

  async function handleCopy() {
    const ok = await copyText(item.caption || '');
    if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); } else setError('Não foi possível copiar. Selecione o texto e copie manualmente.');
  }

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const suffix = images.length > 1 ? `-${index + 1}` : '';
        await downloadImage(image, `${slug(item.client_name)}-${slug(item.title)}${suffix}.${extensionFor(image.mime, image.data)}`);
        if (index < images.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    } catch {
      setError('Não foi possível baixar a imagem. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }

  const stage = item.stage;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:flex-row">
      {stage !== 'posted' && (
        <div className="relative aspect-[4/5] w-full shrink-0 bg-slate-100 sm:w-[220px]">
          {images[previewIndex] ? (
            <img src={images[previewIndex].data} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem imagem</div>
          )}
          {images.length > 1 && (
            <>
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"><Images size={12} /> {previewIndex + 1}/{images.length}</span>
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
                {images.map((_, index) => (
                  <button key={index} type="button" aria-label={`Imagem ${index + 1}`} onClick={() => setPreviewIndex(index)} className={`h-1.5 w-1.5 rounded-full ${index === previewIndex ? 'bg-white' : 'bg-white/50'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.client_name && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{item.client_name}</span>}
            {item.due_date && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0969ff]"><CalendarClock size={12} /> Postar em {formatDate(item.due_date)}</span>
            )}
            {stage === 'posted' && item.posted_at && <span className="text-[11px] font-semibold text-emerald-600">Postada em {formatDate(item.posted_at)}</span>}
          </div>
          <h3 className="mt-1.5 text-base font-bold text-slate-900">{item.title}</h3>
          {item.parent_title && <p className="text-[11px] text-slate-400">{item.parent_title}</p>}
        </div>

        {stage !== 'posted' && (
          <div className="min-h-0 flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Legenda</p>
            {item.caption ? (
              <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{item.caption}</p>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-400">Esta peça não tem legenda cadastrada.</p>
            )}
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {stage !== 'posted' && (
            <>
              <button type="button" disabled={!item.caption} onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? 'Copiado!' : 'Copiar legenda'}
              </button>
              <button type="button" disabled={!images.length || downloading} onClick={handleDownload} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {images.length > 1 ? `Baixar ${images.length} imagens` : 'Baixar imagem'}
              </button>
            </>
          )}
          <span className="flex-1" />
          {stage === 'approved' && (
            <button type="button" disabled={busy} onClick={() => onStage(item, 'scheduled')} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
              <CalendarCheck size={14} /> Marcar agendada
            </button>
          )}
          {stage !== 'posted' && (
            <button type="button" disabled={busy} onClick={() => onStage(item, 'posted')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />} Marcar como postada
            </button>
          )}
          {stage !== 'approved' && (
            <button type="button" disabled={busy} onClick={() => onStage(item, 'approved')} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">
              <RotateCcw size={13} /> Voltar para "Para agendar"
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Scheduling() {
  const { selectedClient } = useClientFilter();
  const [tab, setTab] = useState('approved');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ approved: 0, scheduled: 0, posted: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/tasks/schedule-queue', { params: selectedClient?.id ? { client_id: selectedClient.id } : {} });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setCounts(data?.counts || { approved: 0, scheduled: 0, posted: 0 });
      setError('');
    } catch (requestError) {
      if (!silent) setError(requestError.response?.data?.error || 'Não foi possível carregar a fila de agendamento.');
    } finally {
      setLoading(false);
    }
  }, [selectedClient?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => load(true), 60000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [load]);

  async function changeStage(item, stage) {
    setBusyId(item.id);
    setError('');
    try {
      await api.post(`/tasks/${item.id}/schedule-status`, { stage });
      try {
        const channel = new BroadcastChannel('zebrahub-task-sync');
        channel.postMessage({ taskId: item.id, parentTaskId: item.parent_task_id || null, at: Date.now(), source: 'scheduling' });
        channel.close();
      } catch { /* sincronização entre abas é opcional */ }
      await load(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar a peça.');
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    const list = items.filter((item) => item.stage === tab);
    // Postadas: as mais recentes primeiro. Demais: por data de postagem.
    return tab === 'posted' ? [...list].reverse() : list;
  }, [items, tab]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Social Media</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Agendamento</h1>
          <p className="mt-1 text-sm text-slate-500">{selectedClient?.name || 'Todos os clientes'} · peças aprovadas pelo cliente, prontas para agendar e postar.</p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === item.key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {item.label}
              <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{counts[item.key] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-slate-200 bg-white text-sm text-slate-400">Carregando…</div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><CalendarCheck size={24} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {tab === 'approved' ? 'Nada para agendar agora' : tab === 'scheduled' ? 'Nenhuma peça agendada' : 'Nenhuma peça postada nos últimos 45 dias'}
          </h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
            {tab === 'approved' ? 'Quando o cliente aprovar uma peça no link de aprovação, ela aparece aqui.' : 'As peças que você marcar aparecem nesta aba.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((item) => (
            <ScheduleCard key={item.id} item={item} busy={busyId === item.id} onStage={changeStage} />
          ))}
        </div>
      )}
    </div>
  );
}
