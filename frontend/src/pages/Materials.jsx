import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Download,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Globe2,
  Link2,
  MoreHorizontal,
  Pencil,
  PencilRuler,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import MaterialsDrafts from '../components/MaterialsDrafts.jsx';
import MaterialLinks from '../components/MaterialLinks.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'Guia interativo',
  client_id: '',
  file: null,
};

function formatFileSize(value) {
  const size = Number(value || 0);
  if (!size) return 'HTML';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function ClientBadge({ material }) {
  if (!material.client_id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
        <Globe2 size={12} /> Todos os clientes
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      {material.client_avatar ? (
        <img src={material.client_avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: material.client_color || '#0969ff' }}>
          {material.client_name?.[0]?.toUpperCase() || '?'}
        </span>
      )}
      <span className="truncate">{material.client_name || 'Cliente'}</span>
    </span>
  );
}

function MaterialFormModal({ clients, initialClientId, material, onClose, onSaved }) {
  const editing = Boolean(material);
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    title: material?.title || '',
    description: material?.description || '',
    category: material?.category || 'Guia interativo',
    client_id: material ? (material.client_id || '') : (initialClientId || ''),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return setError('Informe o título do material.');
    if (!editing && !form.file) return setError('Selecione um arquivo HTML.');

    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/materials/${material.id}`, {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          client_id: form.client_id || null,
        });
      } else {
        const payload = new FormData();
        payload.append('title', form.title.trim());
        payload.append('description', form.description.trim());
        payload.append('category', form.category.trim());
        payload.append('client_id', form.client_id || 'global');
        payload.append('file', form.file);
        await api.post('/materials', payload);
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar o material.');
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
              {editing ? <Pencil size={20} /> : <UploadCloud size={20} />}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Materiais</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{editing ? 'Editar material' : 'Adicionar material HTML'}</h2>
              <p className="mt-1 text-sm text-slate-500">O material ficará disponível somente para o cliente escolhido.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Título</span>
            <input className="input-field" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Guia das Influenciadoras — Agosto" />
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
            <input className="input-field" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Guia interativo" />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Descrição</span>
            <textarea className="input-field min-h-24 resize-y" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explique rapidamente para que este material serve." />
          </label>

          {!editing && (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Arquivo HTML</span>
              <div className={`rounded-2xl border-2 border-dashed p-5 transition ${form.file ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#121620] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                />
                <p className="mt-2 text-xs text-slate-400">Arquivo único, com até 12 MB. HTMLs com CSS, JavaScript e imagens incorporadas funcionam como um site.</p>
              </div>
            </label>
          )}
        </div>

        {error && <div className="mx-6 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-32">{saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Adicionar material')}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export default function Materials() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formState, setFormState] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [activeSection, setActiveSection] = useState('library');

  async function loadMaterials() {
    setLoading(true);
    setError('');
    try {
      const query = selectedClient?.id ? `?client_id=${selectedClient.id}` : '';
      const { data } = await api.get(`/materials${query}`);
      setMaterials(data.materials || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar os materiais.');
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMaterials(); }, [selectedClient?.id]);

  useEffect(() => {
    if (!user || user.role === 'client') return;
    api.get('/clients').then(({ data }) => setClients(data.clients || [])).catch(() => setClients([]));
  }, [user]);

  const categories = useMemo(() => Array.from(new Set(materials.map((item) => item.category).filter(Boolean))).sort(), [materials]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return materials.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!term) return true;
      return [item.title, item.description, item.category, item.client_name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [materials, search, category]);

  async function getAccess(material) {
    const { data } = await api.get(`/materials/${material.id}/access`);
    return data;
  }

  async function openStandalone(material) {
    try {
      const access = await getAccess(material);
      window.open(access.view_url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível abrir o material.');
    }
  }

  async function downloadMaterial(material) {
    try {
      const access = await getAccess(material);
      window.location.assign(access.download_url);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível baixar o material.');
    }
  }

  async function deleteMaterial(material) {
    setMenuOpen(null);
    if (!window.confirm(`Excluir “${material.title}”? O arquivo também será removido.`)) return;
    try {
      await api.delete(`/materials/${material.id}`);
      await loadMaterials();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível excluir o material.');
    }
  }

  return (
    <div className="space-y-7">
      <PageHero
        icon={FolderOpen}
        eyebrow="Biblioteca e criação"
        title="Materiais"
        description="Centralize arquivos, links e rascunhos do cliente em um único espaço de trabalho."
        actions={activeSection === 'library' && user?.role === 'admin' ? (
          <button onClick={() => setFormState({ mode: 'create' })} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#121620] shadow-lg transition hover:-translate-y-0.5">
            <Plus size={18} /> Novo material
          </button>
        ) : null}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
            <p className="text-xs text-white/45">Materiais disponíveis</p>
            <p className="mt-1 text-2xl font-bold">{materials.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
            <p className="text-xs text-white/45">Cliente visualizado</p>
            <p className="mt-1 truncate text-sm font-semibold">{selectedClient?.name || (user?.role === 'client' ? 'Meu acesso' : 'Todos os clientes')}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
            <p className="text-xs text-white/45">Formato</p>
            <p className="mt-1 text-sm font-semibold">{activeSection === 'drafts' ? 'Canvas visual' : activeSection === 'links' ? 'Links rápidos' : 'HTML interativo'}</p>
          </div>
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start rounded-[24px] border border-slate-200/80 bg-white p-3 shadow-[0_12px_35px_rgba(15,23,42,0.04)] lg:sticky lg:top-6">
          <div className="px-3 pb-2 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Materiais</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Biblioteca operacional do cliente.</p>
          </div>
          <div className="mt-2 space-y-1">
            {[
              { key: 'library', label: 'Biblioteca', icon: FolderOpen, hint: 'Arquivos HTML' },
              { key: 'links', label: 'Links', icon: Link2, hint: 'Atalhos e acessos' },
              { key: 'drafts', label: 'Rascunhos', icon: PencilRuler, hint: 'Canvas visual' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${activeSection === item.key ? 'bg-[#121620] text-white shadow' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activeSection === item.key ? 'bg-white/10 text-blue-300' : 'bg-slate-100 text-slate-500'}`}>
                  <item.icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className={`block truncate text-[11px] ${activeSection === item.key ? 'text-white/45' : 'text-slate-400'}`}>{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-blue-50 px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0969ff]">Acesso rápido</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Use Links para guardar Drive, plataformas, páginas e referências que você abre sempre.</p>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {activeSection === 'drafts' ? (
            <MaterialsDrafts clients={clients} />
          ) : activeSection === 'links' ? (
            <MaterialLinks clients={clients} selectedClient={selectedClient} user={user} />
          ) : (
            <>
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_45px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar material..." className="input-field pl-10" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="input-field md:w-56">
            <option value="all">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">{error}</div>}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-[26px] bg-slate-200/70" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Archive size={24} /></span>
          <h2 className="mt-4 text-lg font-bold text-slate-800">Nenhum material encontrado</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Quando um material for disponibilizado para este cliente, ele aparecerá aqui.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((material) => (
            <article key={material.id} className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.11)]">
              <div className="relative h-28 overflow-hidden bg-[#121620] px-5 py-5 text-white">
                <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-[#0969ff]/40 blur-2xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-blue-300"><FileCode2 size={21} /></span>
                  {user?.role === 'admin' && (
                    <div className="relative">
                      <button onClick={() => setMenuOpen((current) => current === material.id ? null : material.id)} className="rounded-xl p-2 text-white/60 transition hover:bg-white/10 hover:text-white"><MoreHorizontal size={20} /></button>
                      {menuOpen === material.id && (
                        <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
                          <button onClick={() => { setMenuOpen(null); setFormState({ mode: 'edit', material }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><Pencil size={15} /> Editar</button>
                          <button onClick={() => deleteMaterial(material)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="relative mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/70">{material.category || 'Material interativo'}</p>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <ClientBadge material={material} />
                <h2 className="mt-4 text-xl font-bold leading-7 text-slate-900">{material.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{material.description || 'Material disponível para consulta e download.'}</p>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                  <span>{formatFileSize(material.file_size)}</span>
                  <span>{formatDate(material.created_at)}</span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
                  <button onClick={() => navigate(`/materiais/${material.id}`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#121620] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"><FolderOpen size={16} /> Abrir</button>
                  <button onClick={() => openStandalone(material)} title="Abrir em nova aba" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0969ff]"><ExternalLink size={16} /></button>
                  <button onClick={() => downloadMaterial(material)} title="Baixar HTML" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0969ff]"><Download size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

            </>
          )}
        </div>
      </div>

      {formState && activeSection === 'library' && (
        <MaterialFormModal
          clients={clients}
          initialClientId={selectedClient?.id || ''}
          material={formState.mode === 'edit' ? formState.material : null}
          onClose={() => setFormState(null)}
          onSaved={loadMaterials}
        />
      )}
    </div>
  );
}
