import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Link2, Power, RefreshCw, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

function buildPublicUrl(token) {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/solicitar/${token}`;
}

export default function TaskRequestLinkModal({ client, onClose }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const publicUrl = useMemo(() => buildPublicUrl(link?.token), [link?.token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/task-request-links/${client.id}`)
      .then(({ data }) => {
        if (!active) return;
        setLink(data.link || null);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error || 'Não foi possível carregar o link de solicitações.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [client.id]);

  async function generate() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/task-request-links/${client.id}`);
      setLink(data.link);
      setNotice('Link fixo criado com sucesso.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!window.confirm('Gerar um novo link? O link anterior deixará de funcionar imediatamente.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/task-request-links/${client.id}/regenerate`);
      setLink(data.link);
      setNotice('Novo link gerado. O anterior foi invalidado.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível gerar um novo link.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.put(`/task-request-links/${client.id}/status`, { active: Number(link?.active) !== 1 });
      setLink(data.link);
      setNotice(Number(data.link?.active) === 1 ? 'Link reativado.' : 'Link desativado.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível alterar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setNotice('Link copiado para a área de transferência.');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.');
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={busy}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]">
              <Link2 size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900">Link de solicitações</h2>
              <p className="mt-0.5 truncate text-sm text-slate-500">{client.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={19} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-600">
            Este é o endereço fixo para o cliente pedir novas demandas sem entrar no ZebraHub. Cada envio cria uma tarefa automaticamente em <strong className="text-slate-800">A fazer</strong>, identificada como <strong className="text-slate-800">Solicitação do cliente</strong>.
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Carregando...</div>
          ) : !link ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
              <p className="font-medium text-slate-800">Este cliente ainda não possui um link.</p>
              <p className="mt-1 text-sm text-slate-500">Gere uma vez e envie ao cliente. O endereço continuará o mesmo até você regenerá-lo.</p>
              <button type="button" onClick={generate} disabled={busy} className="btn-primary mt-5 inline-flex items-center gap-2">
                <Link2 size={16} /> {busy ? 'Gerando...' : 'Gerar link fixo'}
              </button>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-700">Link público</label>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${Number(link.active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {Number(link.active) === 1 ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input readOnly value={publicUrl} onFocus={(e) => e.target.select()} className="input-field min-w-0 flex-1 font-mono text-xs" />
                  <button type="button" onClick={copyLink} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50" title="Copiar link">
                    <Copy size={17} />
                  </button>
                  <button type="button" onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50" title="Abrir formulário">
                    <ExternalLink size={17} />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={toggleActive} disabled={busy} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${Number(link.active) === 1 ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                  <Power size={16} /> {Number(link.active) === 1 ? 'Desativar link' : 'Reativar link'}
                </button>
                <button type="button" onClick={regenerate} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <RefreshCw size={16} /> Gerar novo link
                </button>
              </div>
              <p className="text-xs leading-5 text-slate-400">Ao gerar um novo link, o endereço atual é invalidado. Use isso apenas se o link tiver sido compartilhado com alguém indevido.</p>
            </>
          )}

          {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        </div>
      </div>
    </ModalBackdrop>
  );
}
