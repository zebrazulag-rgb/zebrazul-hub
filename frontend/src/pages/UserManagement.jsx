import { useEffect, useState } from 'react';
import { Plus, Shield, Users as UsersIcon, Building2, Pencil, Trash2, KeyRound, X, Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api';
import AvatarUpload from '../components/AvatarUpload.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_OPTIONS = [
  { value: 'team', label: 'Equipe Zebrazul', icon: UsersIcon },
  { value: 'client', label: 'Cliente', icon: Building2 },
  { value: 'admin', label: 'Administrador', icon: Shield }
];

const EMPTY_FORM = { name: '', email: '', password: '', role: 'team', client_id: '' };

export default function UserManagement() {
  const { user: currentUser, refreshUser } = useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deleteUser, setDeleteUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data.clients));
    loadUsers();
    loadStorageStatus();
  }, []);

  async function loadUsers() {
    const { data } = await api.get('/auth/users');
    setUsers(data.users);
  }

  async function loadStorageStatus() {
    setLoadingStorage(true);
    try {
      const { data } = await api.get('/system/status');
      setStorageStatus(data);
    } catch (err) {
      setStorageStatus({ storage_safe: false, error: err.response?.data?.error || 'Nao foi possivel verificar o armazenamento.' });
    } finally {
      setLoadingStorage(false);
    }
  }

  async function downloadBackup() {
    clearMessages();
    setDownloadingBackup(true);
    try {
      const response = await api.get('/system/backup/download', { responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `zebrazul-hub-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess('Backup baixado com sucesso. Guarde este arquivo antes de publicar uma nova versao.');
      await loadStorageStatus();
    } catch (err) {
      setError('Nao foi possivel baixar o backup do banco.');
    } finally {
      setDownloadingBackup(false);
    }
  }

  async function handleAvatarChange(userId, dataUrl, mime) {
    await api.put(`/auth/users/${userId}`, { avatar_data: dataUrl, avatar_mime: mime });
    loadUsers();
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function validateUserForm(values, requirePassword) {
    if (!values.name.trim() || !values.email.trim() || (requirePassword && !values.password)) {
      return requirePassword ? 'Preencha nome, e-mail e senha.' : 'Preencha nome e e-mail.';
    }
    if (values.password && values.password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (values.role === 'client' && !values.client_id) return 'Selecione a qual cliente este usuário pertence.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearMessages();
    const validationError = validateUserForm(form, true);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/users', {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        client_id: form.role === 'client' ? form.client_id : null
      });
      setSuccess(`Usuário "${form.name}" criado com sucesso.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user) {
    clearMessages();
    setEditUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'team',
      client_id: user.client_id || ''
    });
  }

  async function handleEdit(event) {
    event.preventDefault();
    clearMessages();
    const validationError = validateUserForm(editForm, false);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        client_id: editForm.role === 'client' ? editForm.client_id : null
      };
      if (editForm.password) payload.password = editForm.password;

      const { data } = await api.put(`/auth/users/${editUser.id}`, payload);
      if (editUser.id === currentUser?.id && data.user) refreshUser(data.user);
      setSuccess(`Usuário "${editForm.name}" atualizado com sucesso.`);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    clearMessages();
    setDeleting(true);
    try {
      await api.delete(`/auth/users/${deleteUser.id}`);
      setSuccess(`Usuário "${deleteUser.name}" apagado com sucesso.`);
      setDeleteUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao apagar usuário.');
    } finally {
      setDeleting(false);
    }
  }

  function generatePassword(target = 'create') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let index = 0; index < 10; index += 1) password += chars[Math.floor(Math.random() * chars.length)];
    if (target === 'edit') setEditForm((previous) => ({ ...previous, password }));
    else setForm((previous) => ({ ...previous, password }));
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
          <p className="text-slate-500 mt-1">Crie, edite senhas e gerencie os acessos da equipe e dos clientes.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM); clearMessages(); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Novo usuário
        </button>
      </div>

      {success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          {success}
        </div>
      )}
      {error && !showForm && !editUser && !deleteUser && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}


      <div className={`card p-5 border-2 ${loadingStorage ? 'border-slate-200' : storageStatus?.storage_safe ? 'border-emerald-200' : 'border-red-200'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${storageStatus?.storage_safe ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {loadingStorage ? <RefreshCw size={21} className="animate-spin" /> : storageStatus?.storage_safe ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-slate-800">Proteção dos dados</h2>
                {!loadingStorage && (
                  <span className={`badge ${storageStatus?.storage_safe ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {storageStatus?.storage_safe ? 'Armazenamento protegido' : 'Armazenamento não protegido'}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1 break-words">
                {loadingStorage
                  ? 'Verificando onde o banco de dados esta sendo salvo...'
                  : storageStatus?.storage_safe
                    ? 'O banco esta fora da pasta do codigo e pode continuar intacto nas proximas atualizacoes.'
                    : 'Nao publique uma nova versao enquanto o volume persistente nao estiver configurado.'}
              </p>
              {storageStatus?.storage_safe && (
                <div className="mt-3 text-xs text-slate-500 space-y-1 break-all">
                  <p><strong className="text-slate-600">Banco:</strong> {storageStatus.database_directory}/{storageStatus.database_file}</p>
                  <p><strong className="text-slate-600">Ultimo backup:</strong> {storageStatus.last_backup ? formatBackupDate(storageStatus.last_backup.created_at) : 'Nenhum backup localizado'}</p>
                  <p><strong className="text-slate-600">Identificador:</strong> {storageStatus.installation_id || 'Nao informado'}</p>
                </div>
              )}
              {storageStatus?.error && <p className="text-xs text-red-600 mt-2">{storageStatus.error}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <button onClick={loadStorageStatus} disabled={loadingStorage} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw size={16} className={loadingStorage ? 'animate-spin' : ''} /> Verificar
            </button>
            <button onClick={downloadBackup} disabled={downloadingBackup || !storageStatus?.storage_safe} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={16} /> {downloadingBackup ? 'Preparando...' : 'Baixar backup'}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Papéis disponíveis</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <RoleDescription icon={Shield} title="Administrador" description="Acesso total, incluindo criar, editar e apagar usuários." />
          <RoleDescription icon={UsersIcon} title="Equipe Zebrazul" description="Cria clientes, posts e métricas de todos os clientes." />
          <RoleDescription icon={Building2} title="Cliente" description="Só vê e aprova o conteúdo do próprio cliente vinculado." />
        </div>
      </div>

      <div className="card p-5 min-w-0">
        <h2 className="font-semibold text-slate-800 mb-4">Todos os usuários ({users.length})</h2>
        <div className="space-y-3">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUser?.id;
            return (
              <div key={user.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3 min-w-0 flex-wrap sm:flex-nowrap">
                <AvatarUpload
                  imageSrc={user.avatar_data}
                  fallbackText={user.name}
                  fallbackColor={user.avatar_color}
                  size={44}
                  onChange={(dataUrl, mime) => handleAvatarChange(user.id, dataUrl, mime)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{user.name}</p>
                    {isCurrentUser && <span className="text-[10px] text-zebrazul-600 bg-zebrazul-50 px-2 py-0.5 rounded-full shrink-0">Você</span>}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="badge bg-slate-100 text-slate-600 capitalize">{roleBadgeLabel(user.role)}</span>
                  {user.client_name && <p className="text-xs text-slate-400 mt-1 max-w-40 truncate">{user.client_name}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                  <button
                    onClick={() => openEdit(user)}
                    className="p-2 rounded-lg text-slate-500 hover:text-zebrazul-600 hover:bg-zebrazul-50 transition-colors"
                    title="Editar usuário ou senha"
                    aria-label={`Editar ${user.name}`}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    onClick={() => { clearMessages(); setDeleteUser(user); }}
                    disabled={isCurrentUser}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isCurrentUser ? 'Você não pode apagar o próprio usuário' : 'Apagar usuário'}
                    aria-label={`Apagar ${user.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <UserFormModal
          title="Novo usuário"
          form={form}
          setForm={setForm}
          clients={clients}
          error={error}
          saving={saving}
          submitLabel="Criar usuário"
          onSubmit={handleSubmit}
          onGeneratePassword={() => generatePassword('create')}
          onClose={() => { setShowForm(false); setError(''); }}
          passwordLabel="Senha provisória"
          passwordHint="Obrigatória"
        />
      )}

      {editUser && (
        <UserFormModal
          title={`Editar ${editUser.name}`}
          form={editForm}
          setForm={setEditForm}
          clients={clients}
          error={error}
          saving={saving}
          submitLabel="Salvar alterações"
          onSubmit={handleEdit}
          onGeneratePassword={() => generatePassword('edit')}
          onClose={() => { setEditUser(null); setError(''); }}
          passwordLabel="Nova senha"
          passwordHint="Deixe em branco para manter a senha atual"
          lockRole={editUser.id === currentUser?.id}
        />
      )}

      {deleteUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <Trash2 size={21} />
            </div>
            <h2 className="font-semibold text-slate-800 text-lg">Apagar usuário?</h2>
            <p className="text-sm text-slate-500 mt-2">
              O acesso de <strong className="text-slate-700">{deleteUser.name}</strong> será removido. Os conteúdos e lançamentos criados por esse usuário serão preservados.
            </p>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setDeleteUser(null); setError(''); }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50 flex-1">
                {deleting ? 'Apagando...' : 'Apagar usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleDescription({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={18} className="text-zebrazul-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-slate-700">{title}</p>
        <p className="text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function UserFormModal({
  title,
  form,
  setForm,
  clients,
  error,
  saving,
  submitLabel,
  onSubmit,
  onGeneratePassword,
  onClose,
  passwordLabel,
  passwordHint,
  lockRole = false
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-semibold text-slate-800 min-w-0 break-words">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Nome completo</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex: Maria Silva"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">E-mail</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="maria@zebrazul.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="text-sm font-medium text-slate-700">{passwordLabel}</label>
              <span className="text-[11px] text-slate-400">{passwordHint}</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input-field pl-9"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <button type="button" onClick={onGeneratePassword} className="btn-secondary text-sm shrink-0 whitespace-nowrap">
                Gerar
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Papel</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  type="button"
                  key={role.value}
                  onClick={() => !lockRole && setForm({ ...form, role: role.value, client_id: role.value === 'client' ? form.client_id : '' })}
                  disabled={lockRole}
                  className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
                    form.role === role.value
                      ? 'bg-zebrazul-600 text-white border-zebrazul-600'
                      : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  <role.icon size={16} />
                  <span className="text-center leading-tight">{role.label}</span>
                </button>
              ))}
            </div>
            {lockRole && <p className="text-[11px] text-slate-400 mt-2">Seu próprio papel de acesso não pode ser alterado aqui.</p>}
          </div>
          {form.role === 'client' && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Vincular ao cliente</label>
              <select
                className="input-field"
                value={form.client_id}
                onChange={(event) => setForm({ ...form, client_id: event.target.value })}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function formatBackupDate(value) {
  if (!value) return 'Nao informado';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function roleBadgeLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'team') return 'Equipe';
  if (role === 'client') return 'Cliente';
  return role;
}
