import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, Link2, Loader2, X } from 'lucide-react';
import api from '../api';
import { PLATFORMS, PlatformBadges } from './PlatformBadges.jsx';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const cap = (v) => { const t = String(v || 'outro'); return t.charAt(0).toUpperCase() + t.slice(1); };
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

function sortedEntries(obj) { return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); }

function buildPrintHtml(data, clientName, autoPrint = true) {
  const platformRows = sortedEntries(data.by_platform).map(([k, n]) => `<tr><td>${esc(PLATFORM_LABEL[k] || k)}</td><td>${n}</td></tr>`).join('');
  const typeRows = sortedEntries(data.by_type).map(([k, n]) => `<tr><td>${esc(cap(k))}</td><td>${n}</td></tr>`).join('');
  const cards = data.items.map((i) => `
    <div class="card">
      ${i.image ? `<img src="${esc(i.image)}" />` : '<div class="noimg">Sem imagem</div>'}
      <div class="meta"><b>${esc(i.title)}</b><br/>${esc(fmtDay(i.date))} · ${esc(cap(i.content_type))}<br/>
      <span class="pl">${i.platforms.length ? i.platforms.map((k) => esc(PLATFORM_LABEL[k] || k)).join(' · ') : 'Lugar não informado'}</span></div>
    </div>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de postagens - ${esc(monthLabel(data.month))}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:32px}
    .brand{color:#0969ff;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    h1{margin:4px 0 2px;font-size:26px} .sub{color:#64748b;font-size:13px;margin-bottom:20px}
    .kpis{display:flex;gap:12px;margin-bottom:20px} .kpi{border:1px solid #e2e8f0;border-radius:12px;padding:12px 18px}
    .kpi b{display:block;font-size:28px} .kpi span{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
    .tables{display:flex;gap:24px;margin-bottom:22px} table{border-collapse:collapse;min-width:220px;font-size:13px}
    td,th{border-bottom:1px solid #e2e8f0;padding:6px 10px;text-align:left} th{font-size:11px;text-transform:uppercase;color:#64748b}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .card{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;break-inside:avoid}
    .card img,.noimg{width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#f1f5f9}
    .noimg{display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px}
    .meta{padding:8px 10px;font-size:11px;line-height:1.45} .pl{color:#0969ff;font-weight:600}
    @media print{body{margin:14mm}}
  </style></head><body>
  <div class="brand">Zebrazul · Relatório de postagens</div>
  <h1>${esc(clientName || 'Todos os clientes')}</h1>
  <div class="sub">${esc(monthLabel(data.month))}</div>
  <div class="kpis"><div class="kpi"><b>${data.total}</b><span>Posts postados</span></div></div>
  <div class="tables">
    <table><tr><th>Onde foi postado</th><th>Posts</th></tr>${platformRows || '<tr><td colspan="2">Sem lugar informado</td></tr>'}</table>
    <table><tr><th>Formato</th><th>Posts</th></tr>${typeRows}</table>
  </div>
  <div class="grid">${cards}</div>
  ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>' : ''}
  </body></html>`;
}

function buildCsv(data) {
  const rows = [['Data', 'Cliente', 'Título', 'Formato', 'Postado em']];
  data.items.forEach((i) => rows.push([fmtDay(i.date), i.client_name, i.title, cap(i.content_type), i.platforms.map((k) => PLATFORM_LABEL[k] || k).join(' + ')]));
  return `﻿${rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
}

export default function PostedReportModal({ client, onClose }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.get('/tasks/posted-report', { params: { month, ...(client?.id ? { client_id: client.id } : {}) } })
      .then(({ data: body }) => { if (alive) setData(body); })
      .catch((e) => { if (alive) setError(e.response?.data?.error || 'Não foi possível gerar o relatório.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, client?.id]);

  const platformEntries = useMemo(() => sortedEntries(data?.by_platform), [data]);

  useEffect(() => { setLinkUrl(''); setCopied(false); }, [month, client?.id]);

  async function createLink() {
    if (!client?.id) return;
    setLinkBusy(true);
    setError('');
    try {
      const { data: body } = await api.post('/tasks/posted-report/link', { client_id: client.id, month });
      const url = `${window.location.origin}${body.path}`;
      setLinkUrl(url);
      try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* o link fica visível para copiar manualmente */ }
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível gerar o link.');
    } finally {
      setLinkBusy(false);
    }
  }

  function printPdf() {
    const win = window.open('', '_blank');
    if (!win) { setError('O navegador bloqueou a janela. Libere pop-ups para este site e tente de novo.'); return; }
    win.document.write(buildPrintHtml(data, client?.name));
    win.document.close();
  }

  function downloadHtml() {
    const blob = new Blob([buildPrintHtml(data, client?.name, false)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${(client?.name || 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postagens-${(client?.name || 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Relatório</p>
            <h2 className="text-lg font-bold text-slate-900">Posts postados · {client?.name || 'Todos os clientes'}</h2>
          </div>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" />
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          {loading ? (
            <div className="flex h-48 items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : data && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <div className="rounded-xl border border-slate-200 px-5 py-3"><p className="text-3xl font-black text-slate-900">{data.total}</p><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Posts em {monthLabel(data.month)}</p></div>
                {platformEntries.map(([key, n]) => (
                  <div key={key} className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-2xl font-black text-slate-900">{n}</p>
                    <PlatformBadges platforms={[key]} />
                  </div>
                ))}
                {sortedEntries(data.by_type).map(([type, n]) => (
                  <div key={type} className="rounded-xl border border-slate-200 px-4 py-3"><p className="text-2xl font-black text-slate-900">{n}</p><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{cap(type)}</p></div>
                ))}
              </div>

              {data.total === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Nenhum post marcado como postado neste mês.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {data.items.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200">
                      {item.image ? <img src={item.image} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-xs text-slate-400">Sem imagem</div>}
                      <div className="space-y-1 p-2.5">
                        <p className="text-xs font-bold leading-snug text-slate-900">{item.title}</p>
                        <p className="text-[11px] text-slate-500">{fmtDay(item.date)} · {cap(item.content_type)}</p>
                        {item.platforms.length ? <PlatformBadges platforms={item.platforms} compact /> : <p className="text-[11px] text-slate-400">Lugar não informado</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {linkUrl && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-emerald-50/60 px-5 py-3">
            <Link2 size={14} className="text-emerald-600" />
            <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-slate-700" />
            <button type="button" onClick={() => { navigator.clipboard?.writeText(linkUrl).then(() => setCopied(true)).catch(() => {}); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white">{copied ? <Check size={13} /> : null} {copied ? 'Link copiado!' : 'Copiar'}</button>
            <a href={linkUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-700 underline">Abrir</a>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {!client?.id && <span className="mr-auto self-center text-[11px] text-slate-400">Selecione um cliente no topo para gerar o link.</span>}
          <button type="button" disabled={!client?.id || linkBusy} onClick={createLink} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0969ff] px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">{linkBusy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Gerar link para o cliente</button>
          <button type="button" disabled={!data || !data.total} onClick={downloadHtml} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Download size={14} /> Baixar HTML</button>
          <button type="button" disabled={!data || !data.total} onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Download size={14} /> Baixar planilha (CSV)</button>
          <button type="button" disabled={!data || !data.total} onClick={printPdf} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"><FileText size={14} /> Gerar PDF / Imprimir</button>
        </div>
      </div>
    </div>
  );
}
