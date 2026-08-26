import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Plus, Search, Send, Users, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const arr = (v) => Array.isArray(v) ? v : [];
const str = (v) => v == null ? '' : String(v);

function initials(value) {
  const name = str(value).trim();
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
}

function timeLabel(value) {
  if (!value) return '';
  const raw = str(value);
  const normalized = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function Avatar({ user }) {
  const u = user || {};
  if (u.avatar_data) {
    return <img src={u.avatar_data} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: u.avatar_color || '#2563eb' }}
    >
      {initials(u.name || u.user_name)}
    </div>
  );
}

export default function TeamChat() {
  const { user } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [roomData, setRoomData] = useState({ room: null, members: [], messages: [] });
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  async function fetchRooms({ selectFirst = false } = {}) {
    try {
      const response = await api.get('/chat/rooms');
      const list = arr(response?.data?.rooms).filter(Boolean);
      setRooms(list);

      if (selectFirst && !activeRef.current && list.length) {
        const firstId = Number(list[0]?.id);
        if (Number.isFinite(firstId) && firstId > 0) setActiveId(firstId);
      }
      return list;
    } catch (err) {
      console.error('Erro ao carregar conversas', err);
      setError('Não foi possível atualizar as conversas.');
      return [];
    }
  }

  async function fetchUsers() {
    try {
      const response = await api.get('/chat/users');
      setUsers(arr(response?.data?.users).filter(Boolean));
    } catch (err) {
      console.error('Erro ao carregar usuários do chat', err);
    }
  }

  async function fetchRoom(id) {
    const roomId = Number(id);
    if (!Number.isFinite(roomId) || roomId <= 0) return;

    try {
      const response = await api.get(`/chat/rooms/${roomId}`);
      const data = response?.data || {};

      // Só aplica a resposta se ainda estivermos na mesma conversa.
      if (Number(activeRef.current) !== roomId) return;

      setRoomData({
        room: data.room || null,
        members: arr(data.members).filter(Boolean),
        messages: arr(data.messages).filter(Boolean),
      });
      setError('');
    } catch (err) {
      console.error('Erro ao carregar conversa', err);
      setError('Não foi possível carregar esta conversa.');
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await Promise.all([fetchRooms({ selectFirst: true }), fetchUsers()]);
    })();

    const timer = window.setInterval(() => {
      if (alive) fetchRooms();
    }, 7000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeId) {
      setRoomData({ room: null, members: [], messages: [] });
      return;
    }

    activeRef.current = activeId;
    fetchRoom(activeId);

    const timer = window.setInterval(() => {
      if (activeRef.current) fetchRoom(activeRef.current);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    try {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    } catch {}
  }, [roomData.messages.length]);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(r => str(r?.name).toLowerCase().includes(q));
  }, [rooms, search]);

  async function sendMessage(e) {
    e?.preventDefault?.();
    const message = text.trim();
    const roomId = Number(activeId);

    if (!message || !Number.isFinite(roomId) || roomId <= 0 || busy) return;

    setBusy(true);
    setError('');
    setText('');

    try {
      await api.post(`/chat/rooms/${roomId}/messages`, { message });

      // Atualiza de modo sequencial, evitando duas respostas concorrentes
      // alterando o estado no mesmo instante.
      await fetchRoom(roomId);
      await fetchRooms();
    } catch (err) {
      console.error('Erro ao enviar mensagem', err);
      setText(message);
      setError('Não foi possível enviar a mensagem.');
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(e) {
    e?.preventDefault?.();
    const name = groupName.trim();
    if (!name || busy) return;

    setBusy(true);
    setError('');

    try {
      const response = await api.post('/chat/rooms', {
        name,
        member_ids: memberIds.map(Number).filter(Number.isFinite),
      });

      const id = Number(response?.data?.id);

      setModal(false);
      setGroupName('');
      setMemberIds([]);

      await fetchRooms();

      if (Number.isFinite(id) && id > 0) {
        setRoomData({ room: null, members: [], messages: [] });
        setActiveId(id);
      }
    } catch (err) {
      console.error('Erro ao criar grupo', err);
      setError('Não foi possível criar o grupo.');
    } finally {
      setBusy(false);
    }
  }

  async function openDirect(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0 || busy) return;

    setBusy(true);
    setError('');

    try {
      const response = await api.post(`/chat/direct/${id}`);
      const roomId = Number(response?.data?.id);

      await fetchRooms();

      if (Number.isFinite(roomId) && roomId > 0) {
        setRoomData({ room: null, members: [], messages: [] });
        setActiveId(roomId);
      }
    } catch (err) {
      console.error('Erro ao abrir conversa direta', err);
      setError('Não foi possível abrir a conversa.');
    } finally {
      setBusy(false);
    }
  }

  function toggleMember(id) {
    const value = Number(id);
    if (!Number.isFinite(value)) return;
    setMemberIds(current =>
      current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value]
    );
  }

  return (
    <div className="h-[calc(100dvh-76px)] p-3 md:p-6">
      <div className="mx-auto flex h-full max-w-[1500px] overflow-hidden rounded-2xl border bg-white shadow-sm">
        <aside className={`${activeId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r md:w-[330px]`}>
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Conversas</h1>
                <p className="text-xs text-slate-500">Comunicação interna da equipe</p>
              </div>
              <button
                type="button"
                onClick={() => setModal(true)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"
              >
                <Plus size={19} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversa"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
              />
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <p className="px-2 py-2 text-[11px] font-bold uppercase text-slate-400">Grupos e conversas</p>

            {filteredRooms.map(room => {
              const id = Number(room?.id);
              if (!Number.isFinite(id)) return null;

              const unread = Number(room?.unread) || 0;
              const memberCount = Number(room?.member_count) || 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveId(id)}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    {room?.room_type === 'group' ? <Users size={18} /> : <MessageCircle size={18} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <b className="truncate text-sm">{str(room?.name) || 'Conversa'}</b>
                      {unread > 0 && (
                        <span className="rounded-full bg-blue-600 px-2 text-[10px] text-white">{unread}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {str(room?.last_message) || `${memberCount} membro${memberCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t p-3">
            <p className="mb-2 text-[11px] font-bold uppercase text-slate-400">Conversa direta</p>
            <div className="flex gap-2 overflow-x-auto">
              {users.map(person => {
                const id = Number(person?.id);
                if (!Number.isFinite(id)) return null;
                return (
                  <button type="button" title={str(person?.name)} key={id} onClick={() => openDirect(id)}>
                    <Avatar user={person} />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className={`${!activeId ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
          {!activeId ? (
            <div className="m-auto text-slate-400">Escolha uma conversa.</div>
          ) : (
            <>
              <header className="flex h-[68px] items-center gap-3 border-b px-4">
                <button type="button" className="text-2xl md:hidden" onClick={() => setActiveId(null)}>‹</button>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <b className="block truncate">{str(roomData.room?.name) || 'Conversa'}</b>
                  <p className="text-xs text-slate-500">{roomData.members.length} membros</p>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 md:p-6">
                {roomData.messages.map(message => {
                  const id = Number(message?.id);
                  if (!Number.isFinite(id)) return null;

                  const mine = Number(message?.user_id) === Number(user?.id);

                  return (
                    <div key={id} className={`mb-4 flex gap-2 ${mine ? 'justify-end' : ''}`}>
                      {!mine && <Avatar user={{ ...message, name: message?.user_name }} />}

                      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm ${mine ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                        {!mine && (
                          <p className="mb-1 text-[11px] font-bold text-blue-600">
                            {str(message?.user_name) || 'Usuário'}
                          </p>
                        )}

                        <p className="whitespace-pre-wrap break-words text-sm">{str(message?.message)}</p>

                        <p className={`mt-1 text-right text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                          {timeLabel(message?.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={sendMessage} className="flex gap-2 border-t p-3">
                <textarea
                  rows={1}
                  value={text}
                  disabled={busy}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(e);
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  className="min-h-11 flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={createGroup} className="w-full max-w-md rounded-2xl bg-white p-5">
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Criar grupo</h2>
                <p className="text-sm text-slate-500">Escolha os participantes.</p>
              </div>
              <button type="button" onClick={() => setModal(false)}><X /></button>
            </div>

            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome do grupo"
              className="mt-5 w-full rounded-xl border p-3"
            />

            <div className="mt-4 max-h-60 overflow-y-auto">
              {users.map(person => {
                const id = Number(person?.id);
                if (!Number.isFinite(id)) return null;

                return (
                  <label key={id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(id)}
                      onChange={() => toggleMember(id)}
                    />
                    <Avatar user={person} />
                    <span>{str(person?.name) || str(person?.email)}</span>
                  </label>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={busy || !groupName.trim()}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Criando...' : 'Criar grupo'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
