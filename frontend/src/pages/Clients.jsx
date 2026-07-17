import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Instagram,
  Facebook,
  Trash2,
  Pencil,
  Building2,
  MapPin,
  Phone,
  Mail,
  Linkedin,
  Youtube,
  Music2,
  AtSign,
} from 'lucide-react';
import api from '../api';
import AvatarUpload from '../components/AvatarUpload.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const SOCIAL_FIELDS = [
  { platform: 'instagram', label: 'Instagram', placeholder: '@usuario ou link' },
  { platform: 'facebook', label: 'Facebook', placeholder: 'Página ou link' },
  { platform: 'tiktok', label: 'TikTok', placeholder: '@usuario ou link' },
  { platform: 'linkedin', label: 'LinkedIn', placeholder: 'Página ou link' },
  { platform: 'youtube', label: 'YouTube', placeholder: 'Canal ou link' },
];

const EMPTY_FORM = {
  name: '',
  segment: '',
  cnpj: '',
  address: '',
  phone: '',
  email: '',
  status: 'active',
  socials: {
    instagram: '',
    facebook: '',
    tiktok: '',
    linkedin: '',
    youtube: '',
  },
};

const SOCIAL_ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  linkedin: Linkedin,
  youtube: Youtube,
};

function accountsToSocials(accounts = []) {
  const socials = { ...EMPTY_FORM.socials };
  for (const account of accounts) {
    if (Object.prototype.hasOwnProperty.call(socials, account.platform)) {
      socials[account.platform] = account.handle || '';
    }
  }
  return socials;
}

function buildClientForm(client, accounts) {
  if (!client) return { ...EMPTY_FORM, socials: { ...EMPTY_FORM.socials } };
  return {
    name: client.name || '',
    segment: client.segment || '',
    cnpj: client.cnpj || '',
    address: client.address || '',
    phone: client.phone || '',
    email: client.email || '',
    status: client.status || 'active',
    socials: accountsToSocials(accounts),
  };
}

function ClientFormModal({ mode, initialData, onClose, onSubmit }) {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        social_accounts: SOCIAL_FIELDS.map(({ platform }) => ({
          platform,
          handle: form.socials[platform]?.trim() || '',
        })),
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={saving} className="z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-800">
              {mode === 'edit' ? 'Editar cliente' : 'Novo cliente'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastre os dados de contato e os canais digitais da conta.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Fechar">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações principais</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Nome do cliente *</label>
                <input
                  className="input-field"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex: Óticas D'Mais"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Segmento</label>
                <input
                  className="input-field"
                  value={form.segment}
                  onChange={(event) => setForm({ ...form, segment: event.target.value })}
                  placeholder="Ex: Ótica, odontologia, construção"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">CNPJ</label>
                <input
                  className="input-field"
                  value={form.cnpj}
                  onChange={(event) => setForm({ ...form, cnpj: event.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              {mode === 'edit' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Status</label>
                  <select
                    className="input-field"
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                  >
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contato</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Telefone</label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="(84) 99999-9999"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">E-mail</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="contato@cliente.com.br"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-700 block mb-1">Endereço</label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                  placeholder="Rua, número, bairro, cidade e estado"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Redes sociais</h3>
            <p className="text-xs text-slate-400 mb-3">Você pode informar o @ do perfil ou colar o link completo.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {SOCIAL_FIELDS.map((field) => (
                <div key={field.platform}>
                  <label className="text-sm font-medium text-slate-700 block mb-1">{field.label}</label>
                  <input
                    className="input-field"
                    value={form.socials[field.platform]}
                    onChange={(event) => setForm({
                      ...form,
                      socials: { ...form.socials, [field.platform]: event.target.value },
                    })}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          </section>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : mode === 'edit' ? 'Salvar alterações' : 'Criar cliente'}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

function DetailRow({ icon: Icon, label, value, href }) {
  if (!value) return null;
  const content = href ? (
    <a href={href} className="text-zebrazul-600 hover:underline break-words [overflow-wrap:anywhere]">{value}</a>
  ) : (
    <span className="text-slate-700 break-words [overflow-wrap:anywhere] whitespace-pre-line">{value}</span>
  );

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0 min-w-0">
      <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <div className="text-sm mt-0.5 min-w-0">{content}</div>
      </div>
    </div>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const { selectedClient, setSelectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [formMode, setFormMode] = useState(null);
  const [selected, setSelected] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const formInitialData = useMemo(
    () => buildClientForm(formMode === 'edit' ? selected : null, formMode === 'edit' ? accounts : []),
    [formMode, selected, accounts]
  );

  async function loadClients() {
    const { data } = await api.get('/clients');
    setClients(data.clients);
  }

  async function openClient(client) {
    const { data } = await api.get(`/clients/${client.id}`);
    setSelected(data.client);
    setAccounts(data.accounts);
    setConfirmDelete(false);
  }

  async function saveClient(payload) {
    if (formMode === 'edit') {
      await api.put(`/clients/${selected.id}`, payload);
      await loadClients();
      await openClient({ id: selected.id });
    } else {
      await api.post('/clients', payload);
      await loadClients();
    }
    setFormMode(null);
  }

  async function deleteClient() {
    setDeleting(true);
    try {
      await api.delete(`/clients/${selected.id}`);
      if (selectedClient?.id === selected.id) setSelectedClient(null);
      setSelected(null);
      setConfirmDelete(false);
      await loadClients();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAvatarChange(dataUrl, mime) {
    await api.put(`/clients/${selected.id}`, { avatar_data: dataUrl, avatar_mime: mime });
    setSelected((current) => ({ ...current, avatar_data: dataUrl }));
    loadClients();
  }

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-slate-500 mt-1">Dados comerciais, contatos e redes sociais das contas gerenciadas.</p>
        </div>
        {user?.role !== 'client' && (
          <button onClick={() => setFormMode('create')} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo cliente
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <button
            key={client.id}
            onClick={() => openClient(client)}
            className="card p-5 text-left hover:border-zebrazul-300 transition-colors min-w-0"
          >
            <div className="flex items-center gap-3 mb-3 min-w-0">
              {client.avatar_data ? (
                <img src={client.avatar_data} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: client.logo_color }}
                >
                  {client.name[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{client.name}</p>
                <p className="text-xs text-slate-400 truncate">{client.segment || 'Sem segmento definido'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`badge ${
                client.status === 'active'
                  ? 'bg-emerald-100 text-emerald-700'
                  : client.status === 'paused'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-500'
              }`}>
                {client.status === 'active' ? 'Ativo' : client.status === 'paused' ? 'Pausado' : 'Arquivado'}
              </span>
              {client.phone && <span className="text-xs text-slate-400 truncate">{client.phone}</span>}
            </div>
          </button>
        ))}
      </div>

      {formMode && (
        <ClientFormModal
          key={`${formMode}-${selected?.id || 'new'}`}
          mode={formMode}
          initialData={formInitialData}
          onClose={() => setFormMode(null)}
          onSubmit={saveClient}
        />
      )}

      {selected && (
        <ModalBackdrop onClose={() => !deleting && setSelected(null)} disabled={deleting}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 truncate">{selected.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Cadastro completo do cliente</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <AvatarUpload
                  imageSrc={selected.avatar_data}
                  fallbackText={selected.name}
                  fallbackColor={selected.logo_color}
                  size={72}
                  onChange={handleAvatarChange}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-slate-800 break-words">{selected.name}</p>
                  <p className="text-sm text-slate-500">{selected.segment || 'Segmento não informado'}</p>
                  <p className="text-xs text-slate-400 mt-1">Clique na imagem para trocar o logo.</p>
                </div>
                {user?.role !== 'client' && (
                  <button
                    onClick={() => setFormMode('edit')}
                    className="btn-primary flex items-center justify-center gap-2 shrink-0"
                  >
                    <Pencil size={16} /> Editar informações
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-x-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Dados do cliente</h3>
                  <DetailRow icon={Building2} label="CNPJ" value={selected.cnpj} />
                  <DetailRow icon={Phone} label="Telefone" value={selected.phone} href={selected.phone ? `tel:${selected.phone}` : null} />
                  <DetailRow icon={Mail} label="E-mail" value={selected.email} href={selected.email ? `mailto:${selected.email}` : null} />
                  <DetailRow icon={MapPin} label="Endereço" value={selected.address} />
                  {!selected.cnpj && !selected.phone && !selected.email && !selected.address && (
                    <p className="text-sm text-slate-400 py-4">Os dados de contato ainda não foram preenchidos.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Redes sociais</h3>
                  {accounts.map((account) => {
                    const Icon = SOCIAL_ICONS[account.platform] || AtSign;
                    const label = SOCIAL_FIELDS.find((item) => item.platform === account.platform)?.label || account.platform;
                    return <DetailRow key={account.id} icon={Icon} label={label} value={account.handle} />;
                  })}
                  {accounts.length === 0 && (
                    <p className="text-sm text-slate-400 py-4">Nenhuma rede social informada.</p>
                  )}
                </div>
              </div>

              {user?.role === 'admin' && (
                <div className="pt-4 border-t border-slate-100">
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
                        Isso remove permanentemente <strong>{selected.name}</strong>, seus posts, contas conectadas e relatórios. Não pode ser desfeito.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm flex-1">Cancelar</button>
                        <button
                          onClick={deleteClient}
                          disabled={deleting}
                          className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex-1 transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Excluindo...' : 'Sim, excluir'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
