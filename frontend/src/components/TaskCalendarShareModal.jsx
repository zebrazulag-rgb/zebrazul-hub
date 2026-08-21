import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, ExternalLink, Link2, RefreshCw, ShieldOff, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function publicCalendarUrl(token) {
  if (!token) return '';
  return `${window.location.origin}/agenda/${token}`;
}

export default function TaskCalendarShareModal({ clientId, clientName, year, month, onClose, hidePosted }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    show_status: true,
    show_assignees: false,
    show_description: false,
    include_posted: !hidePosted,
  });

  const link = useMemo(() => publicCalendarUrl(share?.token), [share?.token]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/tasks/calendar-share', { params: { client_id: clientId, year, month: month + 1 } });
        if (!active) return;
        const current = response.data.share || null;
        setShare(current);
        if (current) {
          setOptions({
            show_status: current.show_status,
            show_assignees: current.show_assignees,
            show_description: current.show_description,
            include_posted: current.include_posted,
          });
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.error || 'Não foi possível carregar o compartilhamento deste mês.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [clientId, year, month]);

  async function save(regenerate = false) {
    setSaving(true);
    setError('');
    try {
      const response = await api.post('/tasks/calendar-share', {
        client_id: clientId,
        year,
        month: month + 1,
        ...options,
        regenerate,
      });
      setShare(response.data.share);
      return response.data.share;
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível gerar o link do calendário.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    const current = await save(false);
    if (!current?.token) return;
    const url = publicCalendarUrl(current.token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function deactivate() {
    if (!share) return;
    setSaving(true);
    setError('');
    try {
      await api.patch('/tasks/calendar-share', { client_id: clientId, year, month: month + 1, active: false });
      setShare((current) => current ? { ...current, active: false } : current);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desativar o link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zebrazul-500">Calendário compartilhável</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{MONTHS[month]} de {year}</h2>
            <p className="mt-1 text-sm text-slate-500">{clientName} · visualização pública e somente leitura</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Carregando compartilhamento...</div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays size={16} className="text-zebrazul-600" /> O que aparece para quem receber</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['show_status', 'Status das tarefas'],
                    ['show_assignees', 'Responsáveis'],
                    ['show_description', 'Descrição / ideia'],
                    ['include_posted', 'Tarefas postadas'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(options[key])}
                        onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-zebrazul-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {share?.active && link ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Check size={16} /> Link ativo</div>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white p-2">
                    <input readOnly value={link} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-600 outline-none" />
                    <button type="button" onClick={copyLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                  <Link2 size={24} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">Nenhum link ativo para este mês</p>
                  <p className="mt-1 text-xs text-slate-500">Gere um link e envie ao cliente. Alterações nas tarefas aparecem nele automaticamente.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap gap-2">
                  {share?.active && (
                    <button type="button" disabled={saving} onClick={deactivate} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <ShieldOff size={14} /> Desativar
                    </button>
                  )}
                  {share?.active && (
                    <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      <RefreshCw size={14} /> Gerar novo link
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {share?.active && link && (
                    <button type="button" onClick={() => window.open(link, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <ExternalLink size={15} /> Abrir
                    </button>
                  )}
                  <button type="button" disabled={saving} onClick={() => save(false)} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#075bd8] disabled:opacity-50">
                    <Link2 size={15} /> {share?.active ? 'Salvar visualização' : 'Gerar link'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
