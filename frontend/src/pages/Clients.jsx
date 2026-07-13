import { useEffect, useState } from 'react';
import { Plus, Instagram, Facebook, Trash2 } from 'lucide-react';
import api from '../api';
import AvatarUpload from '../components/AvatarUpload.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

export default function Clients() {
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [selected, setSelected] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [newAccount, setNewAccount] = useState({ platform: 'instagram', handle: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    const { data } = await api.get('/clients');
    setClients(data.clients);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('/clients', { name, segment });
    setName(''); setSegment(''); setShowForm(false);
    loadClients();
  }

  async function openClient(client) {
    const { data } = await api.get(`/clients/${client.id}`);
    setSelected(data.client);
    setAccounts(data.accounts);
    setConfirmDelete(false);
  }

  async function deleteClient() {
    setDeleting(true);
    try {
      await api.delete(`/clients/${selected.id}`);
      if (selectedClient?.id === selected.id) setSelectedClient(null);
      setSelected(null);
      setConfirmDelete(false);
      loadClients();
    } finally {
      setDeleting(false);
    }
  }

  async function addAccount(e) {
    e.preventDefault();
    if (!newAccount.handle.trim()) return;
    await api.post(`/clients/${selected.id}/accounts`, newAccount);
    setNewAccount({ platform: 'instagram', handle: '' });
    openClient(selected);
  }

  async function handleAvatarChange(dataUrl, mime) {
    await api.put(`/clients/${selected.id}`, { avatar_data: dataUrl, avatar_mime: mime });
    setSelected((prev) => ({ ...prev, avatar_data: dataUrl }));
    loadClients();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-slate-500 mt-1">Contas gerenciadas pela Zebrazul.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Novo cliente
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((c) => (
          <button key={c.id} onClick={() => openClient(c)} className="card p-5 text-left hover:border-zebrazul-300 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              {c.avatar_data ? (
                <img src={c.avatar_data} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: c.logo_color }}>
                  {c.name[0]}
                </div>
              )}
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-400">{c.segment || 'Sem segmento definido'}</p>
              </div>
            </div>
            <span className={`badge ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {c.status === 'active' ? 'Ativo' : c.status}
            </span>
          </button>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Novo cliente</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input className="input-field" placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input-field" placeholder="Segmento (ex: Odontologia)" value={segment} onChange={(e) => setSegment(e.target.value)} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <AvatarUpload
                imageSrc={selected.avatar_data}
                fallbackText={selected.name}
                fallbackColor={selected.logo_color}
                size={64}
                onChange={handleAvatarChange}
              />
              <div>
                <p className="text-sm text-slate-500">{selected.segment}</p>
                <p className="text-xs text-slate-400 mt-0.5">Clique na foto para trocar o logo</p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-700 mb-2">Contas conectadas</h3>
            <ul className="space-y-2 mb-4">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                  {a.platform === 'instagram' ? <Instagram size={16} /> : <Facebook size={16} />}
                  <span className="text-slate-700">{a.handle || a.platform}</span>
                  <span className="text-xs text-slate-400 ml-auto capitalize">{a.platform}</span>
                </li>
              ))}
              {accounts.length === 0 && <p className="text-sm text-slate-400">Nenhuma conta conectada ainda.</p>}
            </ul>

            <form onSubmit={addAccount} className="flex gap-2">
              <select className="input-field w-32" value={newAccount.platform} onChange={(e) => setNewAccount({ ...newAccount, platform: e.target.value })}>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
                <option value="youtube">YouTube</option>
              </select>
              <input className="input-field" placeholder="@handle" value={newAccount.handle} onChange={(e) => setNewAccount({ ...newAccount, handle: e.target.value })} />
              <button type="submit" className="btn-secondary shrink-0">Adicionar</button>
            </form>

            {user?.role === 'admin' && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-600 hover:underline flex items-center gap-1.5"
                  >
                    <Trash2 size={14} /> Excluir cliente
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700 mb-3">
                      Isso remove permanentemente <strong>{selected.name}</strong>, seus posts, contas conectadas e relatórios. Tarefas e usuários vinculados apenas ficam sem cliente associado. Não pode ser desfeito.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm flex-1">Cancelar</button>
                      <button onClick={deleteClient} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex-1 transition-colors disabled:opacity-50">
                        {deleting ? 'Excluindo...' : 'Sim, excluir'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
