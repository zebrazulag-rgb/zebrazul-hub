import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
  WandSparkles,
  X,
} from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const EMPTY_FORM = {
  client_id: '',
  service: '',
  login: '',
  password: '',
  url: '',
  notes: '',
};

export default function PasswordVault() {
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(selectedClient?.id ? String(selectedClient.id) : 'all');
  const [showForm, setShowForm] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [revealingId, setRevealingId] = useState(null);
  const [dedicatedKeyConfigured, setDedicatedKeyConfigured] = useState(true);
  const hideTimers = useRef(new Map());

  useEffect(() => {
    Promise.all([
      api.get('/clients'),
      api.get('/credentials/security'),
    ]).then(([clientsResponse, securityResponse]) => {
      setClients(clientsResponse.data.clients || []);
      setDedicatedKeyConfigured(Boolean(securityResponse.data.dedicated_key_configured));
    }).catch(() => {});

    return () => {
      hideTimers.current.forEach((timer) => window.clearTimeout(timer));
      hideTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    setClientId(selectedClient?.id ? String(selectedClient.id) : 'all');
  }, [selectedClient?.id]);

  useEffect(() => {
    loadCredentials();
  }, [clientId]);

  async function loadCredentials() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (clientId !== 'all') params.client_id = clientId;
      const { data } = await api.get('/credentials', { params });
      setCredentials(data.credentials || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o cofre de senhas.');
    } finally {
      setLoading(false);
    }
  }

  function openNewCredential() {
    setEditingCredential(null);
    setForm({
      ...EMPTY_FORM,
      client_id: selectedClient?.id ? String(selectedClient.id) : (clientId !== 'all' ? String(clientId) : ''),
    });
    setShowFormPassword(false);
    setShowForm(true);
    setError('');
  }

  async function openEditCredential(credential) {
    setError('');
    try {
      const { data } = await api.get(`/credentials/${credential.id}`);
      const item = data.credential;
      setEditingCredential(item);
      setForm({
        client_id: item.client_id ? String(item.client_id) : '',
        service: item.service || '',
        login: item.login || '',
        password: '',
        url: item.url || '',
        notes: item.notes || '',
      });
      setShowFormPassword(false);
      setShowForm(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível abrir esta credencial.');
    }
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingCredential(null);
    setForm(EMPTY_FORM);
    setShowFormPassword(false);
  }

  async function saveCredential(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!form.service.trim()) {
      setError('Informe o serviço ou plataforma.');
      return;
    }
    if (!editingCredential && !form.password) {
      setError('Informe a senha.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id || null,
        service: form.service.trim(),
        login: form.login.trim(),
        url: form.url.trim(),
        notes: form.notes.trim(),
      };
      if (form.password) payload.password = form.password;

      if (editingCredential) await api.put(`/credentials/${editingCredential.id}`, payload);
      else await api.post('/credentials', payload);

      closeForm();
      setNotice(editingCredential ? 'Credencial atualizada.' : 'Credencial adicionada ao cofre.');
      await loadCredentials();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a credencial.');
    } finally {
      setSaving(false);
    }
  }

  function scheduleHide(id) {
    const previous = hideTimers.current.get(id);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      hideTimers.current.delete(id);
    }, 30000);
    hideTimers.current.set(id, timer);
  }

  async function revealPassword(credential, { copy = false } = {}) {
    if (revealed[credential.id] && !copy) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      const timer = hideTimers.current.get(credential.id);
      if (timer) window.clearTimeout(timer);
      hideTimers.current.delete(credential.id);
      return;
    }

    setRevealingId(credential.id);
    setError('');
    try {
      const { data } = await api.post(`/credentials/${credential.id}/reveal`);
      const password = data.password || '';
      if (copy) {
        await copyText(password);
        setNotice(`Senha de “${credential.service}” copiada.`);
      } else {
        setRevealed((current) => ({ ...current, [credential.id]: password }));
        scheduleHide(credential.id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível revelar esta senha.');
    } finally {
      setRevealingId(null);
    }
  }

  async function copyLogin(credential) {
    if (!credential.login) return;
    try {
      await copyText(credential.login);
      setNotice(`Login de “${credential.service}” copiado.`);
    } catch {
      setError('O navegador não permitiu copiar o login.');
    }
  }

  async function deleteCredential(credential) {
    const confirmed = window.confirm(`Excluir definitivamente a credencial “${credential.service}”?`);
    if (!confirmed) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/credentials/${credential.id}`);
      setNotice('Credencial excluída.');
      await loadCredentials();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir a credencial.');
    }
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-+=?';
    const values = new Uint32Array(20);
    window.crypto.getRandomValues(values);
    const password = Array.from(values, (value) => chars[value % chars.length]).join('');
    setForm((current) => ({ ...current, password }));
    setShowFormPassword(true);
  }

  const visibleCredentials = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return credentials;
    return credentials.filter((item) => [item.service, item.login, item.client_name, item.url]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)));
  }, [credentials, search]);

  return (
    <div className="space-y-6">
      <PageHero
        title="Senhas"
        description="Cofre administrativo para centralizar acessos dos clientes. As senhas ficam criptografadas no banco e só administradores podem abrir esta área."
        actions={
          <button
            type="button"
            onClick={openNewCredential}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#121620] transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Plus size={17} /> Nova credencial
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <VaultMetric label="Credenciais" value={credentials.length} icon={KeyRound} />
          <VaultMetric label="Clientes no cofre" value={new Set(credentials.filter((item) => item.client_id).map((item) => item.client_id)).size} icon={Building2} />
          <VaultMetric label="Acesso" value="Somente ADM" icon={ShieldCheck} />
          <VaultMetric label="Proteção" value="Criptografado" icon={LockKeyhole} />
        </div>
      </PageHero>

      {!dedicatedKeyConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Cofre protegido, mas usando a chave geral do sistema.</p>
            <p className="mt-0.5 text-amber-800">Antes de cadastrar senhas reais, configure <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">PASSWORD_VAULT_KEY</code> no Railway para separar a criptografia do cofre.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={17} /> {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar serviço, login ou cliente..."
              className="input-field pl-10"
            />
          </div>
          <select className="input-field md:max-w-[280px]" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="all">Todos os clientes</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Carregando cofre...</div>
        ) : visibleCredentials.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><KeyRound size={24} /></div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Nenhuma credencial encontrada</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">Cadastre os acessos de Instagram, Meta, Google, hospedagem e outras plataformas dos clientes.</p>
            <button type="button" onClick={openNewCredential} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#121620] px-4 py-2.5 text-sm font-semibold text-white">
              <Plus size={16} /> Adicionar credencial
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleCredentials.map((credential) => {
              const passwordVisible = Object.prototype.hasOwnProperty.call(revealed, credential.id);
              return (
                <div key={credential.id} className="grid gap-4 px-4 py-4 transition hover:bg-slate-50/70 lg:grid-cols-[1.2fr_1fr_1.2fr_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                      <KeyRound size={19} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{credential.service}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <Building2 size={12} /> {credential.client_name || 'Acesso geral da agência'}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Login</p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm text-slate-700">{credential.login || '—'}</span>
                      {credential.login && <IconButton title="Copiar login" onClick={() => copyLogin(credential)}><Copy size={14} /></IconButton>}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Senha</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="min-w-0 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                        {passwordVisible ? revealed[credential.id] : '••••••••••••'}
                      </code>
                      <IconButton title={passwordVisible ? 'Ocultar senha' : 'Revelar senha'} onClick={() => revealPassword(credential)} disabled={revealingId === credential.id}>
                        {passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      </IconButton>
                      <IconButton title="Copiar senha" onClick={() => revealPassword(credential, { copy: true })} disabled={revealingId === credential.id}>
                        <Copy size={15} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    {credential.url && (
                      <IconButton title="Abrir site" onClick={() => window.open(normalizeUrl(credential.url), '_blank', 'noopener,noreferrer')}>
                        <ExternalLink size={16} />
                      </IconButton>
                    )}
                    <IconButton title="Editar" onClick={() => openEditCredential(credential)}><Pencil size={16} /></IconButton>
                    <IconButton title="Excluir" danger onClick={() => deleteCredential(credential)}><Trash2 size={16} /></IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showForm && (
        <ModalBackdrop onClose={closeForm} disabled={saving}>
          <form onSubmit={saveCredential} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600"><ShieldCheck size={15} /> Cofre administrativo</div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{editingCredential ? 'Editar credencial' : 'Nova credencial'}</h2>
                <p className="mt-1 text-sm text-slate-500">A senha e as observações sensíveis são criptografadas antes de serem salvas.</p>
              </div>
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Cliente">
                  <select className="input-field" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}>
                    <option value="">Acesso geral da agência</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </Field>
                <Field label="Serviço / plataforma *">
                  <input className="input-field" value={form.service} onChange={(event) => setForm((current) => ({ ...current, service: event.target.value }))} placeholder="Ex.: Instagram, Meta Business, Hostinger" autoFocus />
                </Field>
              </div>

              <Field label="Login / e-mail / usuário">
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input-field pl-10" value={form.login} onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))} placeholder="contato@cliente.com.br" autoComplete="off" />
                </div>
              </Field>

              <Field label={editingCredential ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha *'}>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      className="input-field pl-10 pr-11 font-mono"
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingCredential ? '••••••••••••' : 'Digite uma senha segura'}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowFormPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button type="button" onClick={generatePassword} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" title="Gerar senha forte">
                    <WandSparkles size={16} /> <span className="hidden sm:inline">Gerar</span>
                  </button>
                </div>
              </Field>

              <Field label="Endereço da plataforma">
                <input className="input-field" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." inputMode="url" />
              </Field>

              <Field label="Observações / recuperação">
                <textarea className="input-field min-h-[110px] resize-y" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: e-mail de recuperação, instruções, códigos de backup..." />
              </Field>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#121620] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60">
                <ShieldCheck size={16} /> {saving ? 'Salvando...' : (editingCredential ? 'Salvar alterações' : 'Salvar no cofre')}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}

function VaultMetric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
      <div className="flex items-center gap-2 text-white/55"><Icon size={15} /><span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="mt-2 truncate text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function IconButton({ title, children, onClick, danger = false, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-wait disabled:opacity-50 ${danger ? 'border-red-100 text-red-500 hover:bg-red-50' : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
    >
      {children}
    </button>
  );
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(String(value || ''));
  const textarea = document.createElement('textarea');
  textarea.value = String(value || '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function normalizeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
