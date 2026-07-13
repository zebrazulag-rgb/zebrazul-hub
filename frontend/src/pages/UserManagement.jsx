import { useEffect, useState } from 'react';
import { Plus, Shield, Users as UsersIcon, Building2 } from 'lucide-react';
import api from '../api';
import AvatarUpload from '../components/AvatarUpload.jsx';

const ROLE_OPTIONS = [
  { value: 'team', label: 'Equipe Zebrazul', icon: UsersIcon },
  { value: 'client', label: 'Cliente', icon: Building2 },
  { value: 'admin', label: 'Administrador', icon: Shield }
];

export default function UserManagement() {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'team', client_id: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data.clients));
    loadUsers();
  }, []);

  async function loadUsers() {
    const { data } = await api.get('/auth/users');
    setUsers(data.users);
  }

  async function handleAvatarChange(userId, dataUrl, mime) {
    await api.put(`/auth/users/${userId}`, { avatar_data: dataUrl, avatar_mime: mime });
    loadUsers();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.name || !form.email || !form.password) {
      setError('Preencha nome, e-mail e senha.');
      return;
    }
    if (form.role === 'client' && !form.client_id) {
      setError('Selecione a qual cliente este usuário pertence.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/users', {
        ...form,
        client_id: form.role === 'client' ? form.client_id : null
      });
      setSuccess(`Usuário "${form.name}" criado com sucesso.`);
      setForm({ name: '', email: '', password: '', role: 'team', client_id: '' });
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    setForm({ ...form, password: pass });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
          <p className="text-slate-500 mt-1">Crie acessos para a equipe Zebrazul e para os clientes.</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(''); setSuccess(''); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Novo usuário
        </button>
      </div>

      {success && !showForm && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Papéis disponíveis</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-zebrazul-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-700">Administrador</p>
              <p className="text-slate-500">Acesso total, incluindo criar novos usuários.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UsersIcon size={18} className="text-zebrazul-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-700">Equipe Zebrazul</p>
              <p className="text-slate-500">Cria clientes, posts e métricas de todos os clientes.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building2 size={18} className="text-zebrazul-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-700">Cliente</p>
              <p className="text-slate-500">Só vê e aprova o conteúdo do próprio cliente vinculado.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Todos os usuários ({users.length})</h2>
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3">
              <AvatarUpload
                imageSrc={u.avatar_data}
                fallbackText={u.name}
                fallbackColor={u.avatar_color}
                size={44}
                onChange={(dataUrl, mime) => handleAvatarChange(u.id, dataUrl, mime)}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 text-sm truncate">{u.name}</p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="badge bg-slate-100 text-slate-600 capitalize">{roleBadgeLabel(u.role)}</span>
                {u.client_name && <p className="text-xs text-slate-400 mt-1">{u.client_name}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Novo usuário</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Nome completo</label>
                <input
                  className="input-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Maria Silva"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">E-mail</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="maria@zebrazul.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Senha provisória</label>
                <div className="flex gap-2">
                  <input
                    className="input-field"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button type="button" onClick={generatePassword} className="btn-secondary text-sm shrink-0 whitespace-nowrap">
                    Gerar
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Papel</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => setForm({ ...form, role: r.value })}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                        form.role === r.value
                          ? 'bg-zebrazul-600 text-white border-zebrazul-600'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      <r.icon size={16} />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.role === 'client' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Vincular ao cliente</label>
                  <select
                    className="input-field"
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function roleBadgeLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'team') return 'Equipe';
  if (role === 'client') return 'Cliente';
  return role;
}
