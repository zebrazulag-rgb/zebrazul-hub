import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  FilePenLine,
  LayoutDashboard,
  LayoutTemplate,
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
import CalendarDraftBoardModal from './CalendarDraftBoardModal.jsx';
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

function BoardTypeOption({ active, icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-28 items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-[#0969ff] bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-[#0969ff] text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={20} /></span>
      <span>
        <strong className="block text-sm text-slate-900">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function NewBoardModal({ clients, selectedClient, user, onClose, onCreated }) {
  const forcedClientId = user?.role === 'client' ? String(user.client_id || '') : '';
  const [boardType, setBoardType] = useState('canvas');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [title, setTitle] = useState('Novo rascunho');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(forcedClientId || String(selectedClient?.id || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function chooseType(nextType) {
    setBoardType(nextType);
    setTitle((current) => {
      if (current === 'Novo rascunho' || current === 'Calendário editorial') {
        return nextType === 'calendar' ? 'Calendário editorial' : 'Novo rascunho';
      }
      return current;
    });
  }

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
        board_type: boardType,
        calendar_month: boardType === 'calendar' ? calendarMonth : undefined,
      });
      onCreated({ id: data.id, board_type: data.board_type || boardType });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar o rascunho.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={saving}>
      <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><PencilRuler size={21} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0969ff]">Área de rascunho</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Criar novo rascunho</h2>
              <p className="mt-1 text-sm text-slate-500">Escolha entre um canvas livre ou um calendário visual.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Tipo de rascunho</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <BoardTypeOption active={boardType === 'canvas'} icon={LayoutTemplate} title="Quadro livre" description="Canvas semelhante ao Miro com notas, textos, formas e checklists." onClick={() => chooseType('canvas')} />
              <BoardTypeOption active={boardType === 'calendar'} icon={CalendarDays} title="Calendário" description="Planejamento mensal com cartões que podem ser arrastados entre os dias." onClick={() => chooseType('calendar')} />
            </div>
          </div>

          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Título</span>
            <input autoFocus className="input-field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Ideias para campanha de agosto" />
          </label>
          {boardType === 'calendar' && (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Mês inicial</span>
              <input type="month" className="input-field" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} />
            </label>
          )}

          {user?.role !== 'client' && (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Cliente</span>
              <select className="input-field" value={clientId} onChange={(event) => setClientId(event.target.value)}>
                {(user?.role === 'admin' || user?.is_operations_head) && <option value="">Rascunho geral da agência</option>}
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Descrição opcional</span>
            <textarea className="input-field min-h-24 resize-y" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={boardType === 'calendar' ? 'Qual período, campanha ou planejamento este calendário organiza?' : 'Qual é o objetivo deste quadro?'} />
          </label>
        </div>

        {error && <div className="mx-6 mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-32">{saving ? 'Criando...' : (boardType === 'calendar' ? 'Criar calendário' : 'Criar quadro')}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

function CalendarPreview() {
  return (
    <div className="absolute inset-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-8 items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2">
        <span className="h-2 w-2 rounded-full bg-blue-400" /><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="h-2 w-2 rounded-full bg-amber-400" />
      </div>
      <div className="grid h-[calc(100%-2rem)] grid-cols-7">
        {Array.from({ length: 28 }, (_, index) => (
          <div key={index} className="relative border-b border-r border-slate-100 p-1">
            <span className="text-[7px] font-semibold text-slate-300">{index + 1}</span>
            {[3, 9, 12, 18, 23].includes(index) && <span className="absolute bottom-1 left-1 right-1 h-2 rounded-sm bg-blue-200" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function CanvasPreview({ index }) {
  return (
    <>
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle, rgba(100,116,139,.25) 1.2px, transparent 1.2px)', backgroundSize: '22px 22px' }} />
      <div className={`absolute left-7 top-7 h-16 w-20 rotate-[-4deg] rounded-md shadow-md ${index % 3 === 0 ? 'bg-[#fff3a3]' : index % 3 === 1 ? 'bg-[#d9f7be]' : 'bg-[#cfe8ff]'}`} />
      <div className="absolute left-24 top-16 h-14 w-24 rotate-3 rounded-md bg-white shadow-md" />
      <div className="absolute bottom-5 right-7 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400"><PencilRuler size={20} /></div>
    </>
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
  const [openBoard, setOpenBoard] = useState(null);
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
    return boards.filter((board) => [board.title, board.description, board.client_name, board.created_by_name, board.board_type === 'calendar' ? 'calendário' : 'quadro']
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
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Organize ideias em quadros livres ou monte calendários visuais. Tudo fica salvo e separado por cliente.</p>
            </div>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center justify-center gap-2"><Plus size={18} /> Novo rascunho</button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><LayoutDashboard size={15} /> Rascunhos disponíveis</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{boards.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><FilePenLine size={15} /> Itens organizados</p>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10" placeholder="Buscar quadro ou calendário..." />
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">{error}</div>}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-[26px] bg-slate-200/70" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><PencilRuler size={25} /></span>
          <h3 className="mt-4 text-lg font-bold text-slate-800">Nenhum rascunho por aqui</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Crie um quadro livre ou calendário para reunir ideias, referências e decisões deste cliente.</p>
          <button onClick={() => setCreating(true)} className="btn-primary mt-5 inline-flex items-center gap-2"><Plus size={17} /> Criar rascunho</button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((board, index) => {
            const isCalendar = board.board_type === 'calendar';
            return (
              <article key={board.id} className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.11)]">
                <button onClick={() => setOpenBoard(board)} className="block w-full text-left">
                  <div className="relative h-36 overflow-hidden bg-slate-100">
                    {isCalendar ? <CalendarPreview /> : <CanvasPreview index={index} />}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <BoardClient board={board} />
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${isCalendar ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{isCalendar ? <CalendarDays size={11} /> : <LayoutTemplate size={11} />}{isCalendar ? 'Calendário' : 'Quadro livre'}</span>
                    </div>
                    <h3 className="mt-4 line-clamp-2 text-xl font-bold leading-7 text-slate-900">{board.title}</h3>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{board.description || (isCalendar ? 'Calendário visual para organizar ideias e planejamentos.' : 'Quadro visual para organizar ideias e planejamentos.')}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                      <span>{Number(board.element_count || 0)} {isCalendar ? 'item(ns)' : 'elemento(s)'}</span>
                      <span className="flex items-center gap-1"><Clock3 size={13} /> {formatDate(board.updated_at)}</span>
                    </div>
                  </div>
                </button>

                <div className="absolute right-4 top-4">
                  <button onClick={(event) => { event.stopPropagation(); setMenuOpen((current) => current === board.id ? null : board.id); }} className="rounded-xl border border-white/70 bg-white/90 p-2 text-slate-500 shadow-sm backdrop-blur hover:text-slate-900"><MoreHorizontal size={18} /></button>
                  {menuOpen === board.id && (
                    <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      <button onClick={() => { setMenuOpen(null); setOpenBoard(board); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">{isCalendar ? <CalendarDays size={15} /> : <PencilRuler size={15} />} Abrir e editar</button>
                      {(user?.role === 'admin' || user?.is_operations_head || Number(board.created_by) === Number(user?.id)) && (
                        <button onClick={() => deleteBoard(board)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating && (
        <NewBoardModal
          clients={clients}
          selectedClient={selectedClient}
          user={user}
          onClose={() => setCreating(false)}
          onCreated={(board) => { setCreating(false); setOpenBoard(board); loadBoards({ silent: true }); }}
        />
      )}

      {openBoard && openBoard.board_type === 'calendar' && (
        <CalendarDraftBoardModal
          boardId={openBoard.id}
          onClose={() => { setOpenBoard(null); loadBoards({ silent: true }); }}
          onSaved={() => loadBoards({ silent: true })}
        />
      )}

      {openBoard && openBoard.board_type !== 'calendar' && (
        <DraftBoardModal
          boardId={openBoard.id}
          onClose={() => { setOpenBoard(null); loadBoards({ silent: true }); }}
          onSaved={() => loadBoards({ silent: true })}
        />
      )}
    </div>
  );
}
