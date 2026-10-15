import { useState } from 'react';
import { CalendarClock, Check, Pencil, X, Loader2 } from 'lucide-react';

function formatDate(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return day.split('-').reverse().join('/');
}

// Data de postagem editável: mostra "Postar em dd/mm/aaaa" e, ao clicar, abre o calendário para corrigir.
export default function PieceDateEditor({ value, onSave, label = 'Postar em', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const day = String(value || '').slice(0, 10);

  function start(event) {
    event?.stopPropagation();
    setDraft(/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10));
    setError('');
    setEditing(true);
  }

  async function save(event) {
    event?.stopPropagation();
    if (!draft) return;
    if (draft === day) { setEditing(false); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível salvar a data.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} onClick={(event) => event.stopPropagation()}>
        <input
          type="date"
          value={draft}
          autoFocus
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(event); if (event.key === 'Escape') setEditing(false); }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
        />
        <button type="button" disabled={saving || !draft} onClick={save} title="Salvar data" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button type="button" disabled={saving} onClick={(event) => { event.stopPropagation(); setEditing(false); }} title="Cancelar" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
          <X size={14} />
        </button>
        {error && <span className="text-[11px] font-semibold text-rose-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Clique para corrigir a data"
      className={`inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0969ff] transition hover:bg-blue-100 ${className}`}
    >
      <CalendarClock size={12} /> {day ? `${label} ${formatDate(day)}` : 'Definir data'} <Pencil size={11} className="opacity-70" />
    </button>
  );
}
