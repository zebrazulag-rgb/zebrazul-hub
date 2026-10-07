import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

export const HEALTH_LEVELS = {
  green: { label: 'Saudável', badge: 'bg-emerald-500 text-white', text: 'text-emerald-600', bar: 'bg-emerald-500' },
  yellow: { label: 'Atenção', badge: 'bg-amber-400 text-slate-950', text: 'text-amber-600', bar: 'bg-amber-400' },
  red: { label: 'Crítico', badge: 'bg-rose-500 text-white', text: 'text-rose-600', bar: 'bg-rose-500' },
  none: { label: 'Sem nota', badge: 'bg-slate-200 text-slate-500', text: 'text-slate-400', bar: 'bg-slate-300' },
};

export function healthLevel(total) {
  if (total === null || total === undefined) return 'none';
  return total >= 80 ? 'green' : total >= 60 ? 'yellow' : 'red';
}

function computeTotal(criteria, scores) {
  const values = criteria.map((c) => scores[c.key]).filter((v) => Number.isInteger(v));
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10);
}

export default function ClientHealthModal({ client, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [criteria, setCriteria] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let active = true;
    api.get(`/client-health/${client.id}`).then(({ data }) => {
      if (!active) return;
      setCriteria(data.criteria || []);
      setCanEdit(Boolean(data.can_edit));
      setScores(data.health?.scores || {});
      setNotes(data.health?.notes || '');
      setHistory(data.history || []);
      setUpdatedAt(data.health?.updated_at || null);
    }).catch((e) => active && setError(e.response?.data?.error || 'Não foi possível carregar a pontuação.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client.id]);

  const total = useMemo(() => computeTotal(criteria, scores), [criteria, scores]);
  const level = HEALTH_LEVELS[healthLevel(total)];
  const groups = useMemo(() => {
    const map = new Map();
    criteria.forEach((c) => { if (!map.has(c.group)) map.set(c.group, []); map.get(c.group).push(c); });
    return [...map.entries()];
  }, [criteria]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/client-health/${client.id}`, { scores, notes });
      onSaved?.(data.health);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={saving}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0969ff]">Saúde do cliente</p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{client.name}</h2>
            {updatedAt && <p className="mt-0.5 text-[11px] text-slate-400">Última avaliação: {String(updatedAt).slice(0, 10).split('-').reverse().join('/')}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className={`text-3xl font-black leading-none ${level.text}`}>{total ?? '—'}</p>
              <p className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${level.text}`}>{level.label}</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">Carregando…</p>
          ) : (
            <>
              {!canEdit && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Somente o gestor pode alterar a pontuação.</p>}
              {groups.map(([group, items]) => (
                <section key={group}>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group}</h3>
                  <div className="space-y-3">
                    {items.map((c) => {
                      const value = scores[c.key];
                      const scored = Number.isInteger(value);
                      return (
                        <div key={c.key}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-800">{c.label}</span>
                            <span className="text-xs font-semibold text-slate-400">{scored ? `${value}/10` : 'não avaliado'}</span>
                          </div>
                          <div className="flex gap-1">
                            {Array.from({ length: 11 }, (_, n) => {
                              const color = n >= 8 ? 'bg-emerald-500' : n >= 6 ? 'bg-amber-400' : 'bg-rose-500';
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => setScores((cur) => ({ ...cur, [c.key]: value === n ? null : n }))}
                                  className={`h-7 flex-1 rounded-md text-[11px] font-bold transition ${scored && value === n ? `${color} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} disabled:cursor-default`}
                                  title={value === n ? 'Clique para limpar (não se aplica)' : `Nota ${n}`}
                                >{n}</button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
              <p className="text-[11px] leading-5 text-slate-400">Nota de 0 a 10 por critério. Clique de novo na nota para limpar (não se aplica, ex.: cliente sem vídeos). O total é a média dos critérios avaliados, de 0 a 100: 80+ saudável · 60–79 atenção · abaixo de 60 crítico.</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
                <textarea className="input-field" rows={3} disabled={!canEdit} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que precisa melhorar neste perfil?" />
              </div>
              {history.length > 1 && (
                <div>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Evolução</h3>
                  <div className="flex h-14 items-end gap-1">
                    {history.map((h, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${h.total ?? '—'} · ${String(h.created_at).slice(0, 10)}`}>
                        <div className={`w-full rounded-t ${HEALTH_LEVELS[healthLevel(h.total)].bar}`} style={{ height: `${Math.max(4, (h.total || 0) * 0.5)}px` }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        {canEdit && (
          <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
            <button type="button" disabled={saving || loading} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar pontuação
            </button>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
