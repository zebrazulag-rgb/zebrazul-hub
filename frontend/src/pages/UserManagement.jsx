import { useEffect, useRef, useState } from 'react';
import { Plus, Shield, Users as UsersIcon, Building2, Pencil, Trash2, KeyRound, X, Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api';
import AvatarUpload from '../components/AvatarUpload.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { formChanged } from '../utils/formState.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHero from '../components/PageHero.jsx';

const ROLE_OPTIONS = [
  { value: 'team', label: 'Equipe Zebrazul', icon: UsersIcon },
  { value: 'client', label: 'Cliente', icon: Building2 },
  { value: 'admin', label: 'Administrador', icon: Shield }
];

const EMPTY_FORM = { name: '', email: '', password: '', role: 'team', client_id: '', client_ids: [] };

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
        client_id: form.role === 'client' ? form.client_id : null,
        client_ids: form.role === 'team' ? form.client_ids : []
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
      client_id: user.client_id || '',
      client_ids: user.client_ids || []
    });
  }

  async function saveEditedUser() {
    clearMessages();
    const validationError = validateUserForm(editForm, false);
    if (validationError) {
      setError(validationError);
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        client_id: editForm.role === 'client' ? editForm.client_id : null,
        client_ids: editForm.role === 'team' ? editForm.client_ids : []
      };
      if (editForm.password) payload.password = editForm.password;

      const { data } = await api.put(`/auth/users/${editUser.id}`, payload);
      if (editUser.id === currentUser?.id && data.user) refreshUser(data.user);
      setSuccess(`Usuário "${editForm.name}" atualizado com sucesso.`);
      setEditUser(null);
      await loadUsers();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(event) {
    event.preventDefault();
    await saveEditedUser();
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

  const userStats = {
    total: users.length,
    admins: users.filter((item) => item.role === 'admin').length,
    team: users.filter((item) => item.role === 'team').length,
    clients: users.filter((item) => item.role === 'client').length,
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={UsersIcon}
        eyebrow="Controle de acesso"
        title="Usuários"
        description="Gerencie equipe, clientes, senhas e permissões com clareza e segurança."
        actions={
          <button
            onClick={() => { setShowForm(true); setForm(EMPTY_FORM); clearMessages(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Plus size={17} /> Novo usuário
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: userStats.total, icon: UsersIcon, color: 'text-blue-300' },
            { label: 'Administradores', value: userStats.admins, icon: Shield, color: 'text-violet-300' },
            { label: 'Equipe', value: userStats.team, icon: UsersIcon, color: 'text-cyan-300' },
            { label: 'Clientes', value: userStats.clients, icon: Building2, color: 'text-emerald-300' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/45"><item.icon size={14} className={item.color} /> {item.label}</div>
              <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </PageHero>

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


      <div className={`surface-card overflow-hidden border ${loadingStorage ? 'border-slate-200' : storageStatus?.storage_safe ? 'border-emerald-200' : 'border-red-200'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
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

      <div className="surface-card p-6">
        <div className="mb-5"><p className="section-kicker">Níveis de permissão</p><h2 className="section-title mt-1">Papéis disponíveis</h2></div>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <RoleDescription icon={Shield} title="Administrador" description="Acesso total, incluindo criar, editar e apagar usuários." />
          <RoleDescription icon={UsersIcon} title="Equipe Zebrazul" description="Acessa somente os clientes definidos pelo administrador." />
          <RoleDescription icon={Building2} title="Cliente" description="Só vê e aprova o conteúdo do próprio cliente vinculado." />
        </div>
      </div>

      <div className="surface-card min-w-0 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5"><p className="section-kicker">Equipe e clientes</p><h2 className="section-title mt-1">Todos os usuários <span className="text-slate-400">({users.length})</span></h2></div>
        <div className="p-4">
        <div className="space-y-2">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUser?.id;
            return (
              <div key={user.id} className="data-row flex min-w-0 flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
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
                  {user.client_name && <p className="text-xs text-slate-400 mt-1 max-w-48 truncate">{user.client_name}</p>}
                  {user.role === 'team' && (
                    <p className="text-xs text-slate-400 mt-1 max-w-56 line-clamp-2">
                      {user.client_names?.length ? user.client_names.join(', ') : 'Sem clientes liberados'}
                    </p>
                  )}
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
          key={`edit-user-${editUser.id}`}
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
          autoSaveOnClose
          onAutoSave={saveEditedUser}
        />
      )}

      {deleteUser && (
        <ModalBackdrop onClose={() => !deleting && setDeleteUser(null)} disabled={deleting}>
          <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
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
        </ModalBackdrop>
      )}
    </div>
  );
}

function RoleDescription({ icon: Icon, title, description }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/65 p-4">
      <span className="icon-tile bg-white text-[#0969ff] shadow-sm"><Icon size={18} /></span>
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
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
  lockRole = false,
  autoSaveOnClose = false,
  onAutoSave
}) {
  const initialFormRef = useRef(form);

  async function handleRequestClose() {
    if (!autoSaveOnClose || !formChanged(initialFormRef.current, form)) {
      onClose();
      return;
    }

    await onAutoSave?.();
  }

  return (
    <ModalBackdrop onClose={handleRequestClose} disabled={saving}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-semibold text-slate-800 min-w-0 break-words">{title}</h2>
          <button onClick={handleRequestClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Fechar">
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
                  onClick={() => !lockRole && setForm({
                    ...form,
                    role: role.value,
                    client_id: role.value === 'client' ? form.client_id : '',
                    client_ids: role.value === 'team' ? (form.client_ids || []) : []
                  })}
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
          {form.role === 'team' && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-medium text-slate-700">Clientes com acesso</label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" className="text-zebrazul-600 hover:underline" onClick={() => setForm({ ...form, client_ids: clients.map((client) => client.id) })}>Todos</button>
                  <span className="text-slate-300">•</span>
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => setForm({ ...form, client_ids: [] })}>Limpar</button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto p-2 space-y-1">
                {clients.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Nenhum cliente cadastrado.</p>}
                {clients.map((client) => {
                  const selected = (form.client_ids || []).includes(client.id);
                  return (
                    <label key={client.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selected ? 'bg-zebrazul-50' : 'hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setForm({
                          ...form,
                          client_ids: selected
                            ? form.client_ids.filter((id) => id !== client.id)
                            : [...(form.client_ids || []), client.id]
                        })}
                        className="rounded border-slate-300 text-zebrazul-600 focus:ring-zebrazul-500"
                      />
                      <span className="text-sm text-slate-700">{client.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">A pessoa verá apenas tarefas, conteúdos, relatórios e cadastros destes clientes.</p>
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
    </ModalBackdrop>
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
