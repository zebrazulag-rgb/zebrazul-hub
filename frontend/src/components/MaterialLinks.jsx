import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  Globe2,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

const EMPTY_FORM = {
  title: '',
  url: '',
  description: '',
  category: 'Acesso rápido',
  client_id: '',
};

function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value || '';
  }
}

function ClientPill({ link }) {
  if (!link.client_id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
        <Globe2 size={12} /> Todos os clientes
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      {link.client_avatar ? (
        <img src={link.client_avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: link.client_color || '#0969ff' }}
        >
          {link.client_name?.[0]?.toUpperCase() || '?'}
        </span>
      )}
      <span className="truncate">{link.client_name || 'Cliente'}</span>
    </span>
  );
}

function LinkFormModal({ clients, selectedClient, link, onClose, onSaved }) {
  const editing = Boolean(link);
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    title: link?.title || '',
    url: link?.url || '',
    description: link?.description || '',
    category: link?.category || 'Acesso rápido',
    client_id: link ? (link.client_id || '') : (selectedClient?.id || ''),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return setError('Informe o título do link.');
    if (!form.url.trim()) return setError('Informe o endereço do link.');
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        category: form.category.trim() || 'Acesso rápido',
        client_id: form.client_id || null,
      };
      if (editing) await api.put(`/materials/links/${link.id}`, payload);
      else await api.post('/materials/links', payload);
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar o link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={saving}>
      <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]">
              <Link2 size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Materiais • Links</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{editing ? 'Editar link' : 'Adicionar link'}</h2>
              <p className="mt-1 text-sm text-slate-500">Crie atalhos permanentes para pastas, plataformas e processos do cliente.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Título</span>
            <input className="input-field" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Pasta de criativos no Drive" />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Link</span>
            <input className="input-field" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Cliente</span>
            <select className="input-field" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}>
              <option value="">Todos os clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Categoria</span>
            <input className="input-field" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Ex.: Drive, Meta, Referência" />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Descrição</span>
            <textarea className="input-field min-h-24 resize-y" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Para que este link é usado?" />
          </label>
        </div>

        {error && <div className="mx-6 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-32">{saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Adicionar link')}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export default function MaterialLinks({ clients, selectedClient, user }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formState, setFormState] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  async function loadLinks() {
    setLoading(true);
    setError('');
    try {
      const query = selectedClient?.id ? `?client_id=${selectedClient.id}` : '';
      const { data } = await api.get(`/materials/links${query}`);
      setLinks(data.links || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar os links.');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLinks(); }, [selectedClient?.id]);

  const categories = useMemo(() => Array.from(new Set(links.map((item) => item.category).filter(Boolean))).sort(), [links]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return links.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!term) return true;
      return [item.title, item.description, item.category, item.url, item.client_name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [links, search, category]);

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError('Não foi possível copiar o link.');
    }
  }

  async function deleteLink(link) {
    setMenuOpen(null);
    if (!window.confirm(`Excluir “${link.title}”?`)) return;
    try {
      await api.delete(`/materials/links/${link.id}`);
      await loadLinks();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível excluir o link.');
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_45px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-md">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar link..." className="input-field pl-10" />
            </div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="input-field sm:w-52">
              <option value="all">Todas as categorias</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          {user?.role === 'admin' && (
            <button onClick={() => setFormState({ mode: 'create' })} className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap">
              <Plus size={17} /> Novo link
            </button>
          )}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">{error}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-[24px] bg-slate-200/70" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Link2 size={24} /></span>
          <h2 className="mt-4 text-lg font-bold text-slate-800">Nenhum link cadastrado</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Use esta área para reunir atalhos de Drive, plataformas, referências e páginas importantes do cliente.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((link) => (
            <article key={link.id} className="group relative flex min-h-[205px] flex-col rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.09)]">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><Link2 size={19} /></span>
                {user?.role === 'admin' && (
                  <div className="relative">
                    <button onClick={() => setMenuOpen((current) => current === link.id ? null : link.id)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={19} /></button>
                    {menuOpen === link.id && (
                      <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
                        <button onClick={() => { setMenuOpen(null); setFormState({ mode: 'edit', link }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><Pencil size={15} /> Editar</button>
                        <button onClick={() => deleteLink(link)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4"><ClientPill link={link} /></div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0969ff]">{link.category || 'Acesso rápido'}</p>
              <h3 className="mt-1 text-base font-bold leading-6 text-slate-900">{link.title}</h3>
              <p className="mt-1 truncate text-xs text-slate-400">{getHost(link.url)}</p>
              {link.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">{link.description}</p>}

              <div className="mt-auto flex gap-2 pt-4">
                <button onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121620] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                  <ExternalLink size={15} /> Abrir
                </button>
                <button onClick={() => copyLink(link)} title="Copiar link" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0969ff]">
                  {copiedId === link.id ? <span className="text-xs font-bold">OK</span> : <Copy size={15} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {formState && (
        <LinkFormModal
          clients={clients}
          selectedClient={selectedClient}
          link={formState.mode === 'edit' ? formState.link : null}
          onClose={() => setFormState(null)}
          onSaved={loadLinks}
        />
      )}
    </div>
  );
}
