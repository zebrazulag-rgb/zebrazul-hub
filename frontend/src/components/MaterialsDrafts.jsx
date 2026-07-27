import { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  FilePenLine,
  LayoutDashboard,
  MoreHorizontal,
  PencilRuler,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import DraftBoardModal from './DraftBoardModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function BoardClient({ board }) {
  if (!board.client_id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
        <Users size={12} /> Todos os clientes
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      {board.client_avatar ? (
        <img src={board.client_avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: board.client_color || '#0969ff' }}>
          {board.client_name?.[0]?.toUpperCase() || '?'}
        </span>
      )}
      <span className="truncate">{board.client_name || 'Cliente'}</span>
    </span>
  );
}

function NewBoardModal({ clients, selectedClient, user, onClose, onCreated }) {
  const forcedClientId = user?.role === 'client' ? String(user.client_id || '') : '';
  const [title, setTitle] = useState('Novo rascunho');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(forcedClientId || String(selectedClient?.id || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return setError('Informe o título do rascunho.');
    if (!clientId && user?.role !== 'admin' && !user?.is_operations_head) return setError('Escolha um cliente.');

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/material-boards', {
        title: title.trim(),
        description: description.trim(),
        client_id: clientId || null,
      });
      onCreated(data.id);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar o rascunho.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={saving}>
      <form onSubmit={submit} className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><PencilRuler size={21} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Área de rascunho</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Criar novo quadro</h2>
              <p className="mt-1 text-sm text-slate-500">Organize ideias, referências e planejamentos em um canvas visual.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Título do quadro</span>
            <input autoFocus className="input-field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Ideias para campanha de agosto" />
          </label>
          {user?.role !== 'client' && (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Cliente</span>
              <select className="input-field" value={clientId} onChange={(event) => setClientId(event.target.value)}>
                {(user?.role === 'admin' || user?.is_operations_head) && <option value="">Quadro geral da agência</option>}
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Descrição opcional</span>
            <textarea className="input-field min-h-24 resize-y" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Qual é o objetivo deste quadro?" />
          </label>
        </div>

        {error && <div className="mx-6 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-32">{saving ? 'Criando...' : 'Criar quadro'}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export default function MaterialsDrafts({ clients = [] }) {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [openBoardId, setOpenBoardId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);

  async function loadBoards({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const query = selectedClient?.id ? `?client_id=${selectedClient.id}` : '';
      const { data } = await api.get(`/material-boards${query}`);
      setBoards(data.boards || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar os rascunhos.');
      if (!silent) setBoards([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { loadBoards(); }, [selectedClient?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return boards;
    return boards.filter((board) => [board.title, board.description, board.client_name, board.created_by_name]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)));
  }, [boards, search]);

  async function deleteBoard(board) {
    setMenuOpen(null);
    if (!window.confirm(`Excluir o rascunho “${board.title}”?`)) return;
    try {
      await api.delete(`/material-boards/${board.id}`);
      await loadBoards({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível excluir o rascunho.');
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><PencilRuler size={23} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Canvas colaborativo</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Rascunhos visuais</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Crie quadros semelhantes ao Miro para organizar ideias, notas, textos, formas e checklists. Tudo fica salvo por cliente.</p>
            </div>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center justify-center gap-2"><Plus size={18} /> Novo rascunho</button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><LayoutDashboard size={15} /> Quadros disponíveis</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{boards.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><FilePenLine size={15} /> Elementos criados</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{boards.reduce((total, board) => total + Number(board.element_count || 0), 0)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Users size={15} /> Escopo atual</p>
            <p className="mt-2 truncate text-sm font-bold text-slate-900">{selectedClient?.name || (user?.role === 'client' ? 'Meu cliente' : 'Todos os clientes')}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.04)]">
        <div className="relative max-w-lg">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Buscar rascunho..." />
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">{error}</div>}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-[26px] bg-slate-200/70" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><PencilRuler size={25} /></span>
          <h3 className="mt-4 text-lg font-bold text-slate-800">Nenhum rascunho por aqui</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Crie o primeiro quadro para reunir ideias, referências e decisões deste cliente.</p>
          <button onClick={() => setCreating(true)} className="btn-primary mt-5 inline-flex items-center gap-2"><Plus size={17} /> Criar rascunho</button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((board, index) => (
            <article key={board.id} className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.11)]">
              <button onClick={() => setOpenBoardId(board.id)} className="block w-full text-left">
                <div className="relative h-36 overflow-hidden bg-slate-100">
                  <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle, rgba(100,116,139,.25) 1.2px, transparent 1.2px)', backgroundSize: '22px 22px' }} />
                  <div className={`absolute left-7 top-7 h-16 w-20 rotate-[-4deg] rounded-md shadow-md ${index % 3 === 0 ? 'bg-[#fff3a3]' : index % 3 === 1 ? 'bg-[#d9f7be]' : 'bg-[#cfe8ff]'}`} />
                  <div className="absolute left-24 top-16 h-14 w-24 rotate-3 rounded-md bg-white shadow-md" />
                  <div className="absolute bottom-5 right-7 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400"><PencilRuler size={20} /></div>
                </div>
                <div className="p-5">
                  <BoardClient board={board} />
                  <h3 className="mt-4 line-clamp-2 text-xl font-bold leading-7 text-slate-900">{board.title}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{board.description || 'Quadro visual para organizar ideias e planejamentos.'}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                    <span>{Number(board.element_count || 0)} elemento(s)</span>
                    <span className="flex items-center gap-1"><Clock3 size={13} /> {formatDate(board.updated_at)}</span>
                  </div>
                </div>
              </button>

              <div className="absolute right-4 top-4">
                <button onClick={(event) => { event.stopPropagation(); setMenuOpen((current) => current === board.id ? null : board.id); }} className="rounded-xl border border-white/70 bg-white/90 p-2 text-slate-500 shadow-sm backdrop-blur hover:text-slate-900"><MoreHorizontal size={18} /></button>
                {menuOpen === board.id && (
                  <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    <button onClick={() => { setMenuOpen(null); setOpenBoardId(board.id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"><PencilRuler size={15} /> Abrir e editar</button>
                    {(user?.role === 'admin' || user?.is_operations_head || Number(board.created_by) === Number(user?.id)) && (
                      <button onClick={() => deleteBoard(board)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <NewBoardModal
          clients={clients}
          selectedClient={selectedClient}
          user={user}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setOpenBoardId(id); loadBoards({ silent: true }); }}
        />
      )}

      {openBoardId && (
        <DraftBoardModal
          boardId={openBoardId}
          onClose={() => { setOpenBoardId(null); loadBoards({ silent: true }); }}
          onSaved={() => loadBoards({ silent: true })}
        />
      )}
    </div>
  );
}
