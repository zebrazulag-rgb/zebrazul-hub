import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

function groupCatalog(catalog) {
  return catalog.reduce((groups, item) => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
    return groups;
  }, {});
}


function permissionParents(permissionKey) {
  const parents = [];
  if (permissionKey.startsWith('tasks.') && permissionKey !== 'tasks.view') parents.push('tasks.view');
  if (permissionKey.startsWith('commercial.') && permissionKey !== 'commercial.view') parents.push('commercial.view');
  if (permissionKey.startsWith('social.') && permissionKey !== 'social.view') {
    parents.push('social.view');
    if (['social.feed_create', 'social.feed_share', 'social.link_social_media', 'social.covers', 'social.published', 'social.compare', 'social.calendar'].includes(permissionKey)) {
      parents.push('social.feed');
    }
  }
  return [...new Set(parents)];
}

function effectiveDraftPermission(role, permissionKey, draft = {}) {
  if (!role) return false;
  if (role.key === 'admin') return true;
  if (!draft[permissionKey]) return false;
  return permissionParents(permissionKey).every((parent) => Boolean(draft[parent]));
}

function effectiveRolePermission(role, permissionKey, ownerOnly = {}) {
  if (!role) return false;
  const direct = role.key === 'admin' ? true : Boolean(role.permissions?.[permissionKey]);
  if (!direct) return false;
  if (ownerOnly[permissionKey]) return false;
  if (permissionKey.startsWith('social.') && permissionKey !== 'social.view') {
    const feedChildren = new Set([
      'social.feed_create', 'social.feed_share', 'social.link_social_media', 'social.covers',
      'social.published', 'social.compare', 'social.calendar'
    ]);
    const socialAllowed = role.key === 'admin' || role.permissions?.['social.view'];
    const feedAllowed = role.key === 'admin' || role.permissions?.['social.feed'];
    return Boolean(socialAllowed && (!feedChildren.has(permissionKey) || feedAllowed));
  }
  if (permissionKey.startsWith('tasks.') && permissionKey !== 'tasks.view') {
    return Boolean(role.key === 'admin' || role.permissions?.['tasks.view']);
  }
  if (permissionKey.startsWith('commercial.') && permissionKey !== 'commercial.view') {
    return Boolean(role.key === 'admin' || role.permissions?.['commercial.view']);
  }
  return true;
}

export default function PermissionsSettings() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [roles, setRoles] = useState([]);
  const [ownerOnly, setOwnerOnly] = useState({});
  const [selectedKey, setSelectedKey] = useState('team');
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);
  const [previewRoleKey, setPreviewRoleKey] = useState('team');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/permissions');
      setCatalog(data.catalog || []);
      setRoles(data.roles || []);
      setOwnerOnly(data.owner_only || {});
      const exists = (data.roles || []).some((role) => role.key === selectedKey);
      const nextKey = exists ? selectedKey : ((data.roles || []).find((role) => role.key === 'team')?.key || data.roles?.[0]?.key);
      setSelectedKey(nextKey);
      setPreviewRoleKey((current) => (data.roles || []).some((role) => role.key === current) ? current : nextKey);
      const selected = (data.roles || []).find((role) => role.key === nextKey);
      setDraft(selected?.permissions || {});
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar as permissões.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedRole = roles.find((role) => role.key === selectedKey);
  const previewRole = roles.find((role) => role.key === previewRoleKey);
  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);

  useEffect(() => {
    if (selectedRole) setDraft(selectedRole.permissions || {});
  }, [selectedKey]);

  async function savePermissions() {
    if (!selectedRole || selectedRole.key === 'admin') return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.put(`/permissions/roles/${encodeURIComponent(selectedRole.key)}/permissions`, { permissions: draft });
      setMessage(`Permissões de ${selectedRole.name} salvas.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar as permissões.');
    } finally { setSaving(false); }
  }

  async function toggleOwnerOnly(permissionKey) {
    const enabled = !ownerOnly[permissionKey];
    setOwnerOnly((current) => ({ ...current, [permissionKey]: enabled }));
    try {
      await api.put(`/permissions/owner-only/${encodeURIComponent(permissionKey)}`, { enabled });
      setMessage(enabled ? 'Recurso visível somente para o proprietário da agência.' : 'Restrição de proprietário removida.');
    } catch (err) {
      setOwnerOnly((current) => ({ ...current, [permissionKey]: !enabled }));
      setError(err.response?.data?.error || 'Não foi possível alterar a visibilidade.');
    }
  }

  async function createRole() {
    const name = newRoleName.trim();
    if (!name) return;
    setCreating(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/permissions/roles', { name, copy_from: selectedKey === 'admin' ? 'team' : selectedKey });
      setNewRoleName('');
      await load();
      setSelectedKey(data.key);
      setPreviewRoleKey(data.key);
      setMessage(`Cargo “${name}” criado. Agora ajuste o que ele poderá visualizar.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar o cargo.');
    } finally { setCreating(false); }
  }

  async function renameRole(role) {
    if (!role || role.type !== 'custom') return;
    const nextName = window.prompt('Novo nome do cargo:', role.name)?.trim();
    if (!nextName || nextName === role.name) return;
    setError(''); setMessage('');
    try {
      await api.put(`/permissions/roles/custom/${role.id}`, { name: nextName });
      await load();
      setMessage(`Cargo renomeado para “${nextName}”.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível renomear o cargo.');
    }
  }

  async function deleteRole(role) {
    if (!role || role.type !== 'custom') return;
    if (!window.confirm(`Excluir o cargo “${role.name}”?`)) return;
    setError(''); setMessage('');
    try {
      await api.delete(`/permissions/roles/custom/${role.id}`);
      setSelectedKey('team');
      setPreviewRoleKey('team');
      await load();
      setMessage('Cargo removido.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir o cargo.');
    }
  }

  if (user?.role !== 'admin') return null;
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Carregando permissões...</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Controle de acesso</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Cargos e permissões</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Escolha o que cada cargo enxerga. Recursos em teste podem ficar somente com você e ser liberados depois, sem novo deploy.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Ex: Social Media" className="input-field min-w-[220px]" />
            <button type="button" onClick={createRole} disabled={creating || !newRoleName.trim()} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"><Plus size={16} /> Novo cargo</button>
          </div>
        </div>
        {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-20">
          <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Cargos</p>
          <div className="space-y-1">
            {roles.map((role) => (
              <div key={role.key} className={`group flex items-center gap-2 rounded-2xl ${selectedKey === role.key ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <button type="button" onClick={() => setSelectedKey(role.key)} className="min-w-0 flex-1 px-3 py-3 text-left">
                  <p className={`truncate text-sm font-semibold ${selectedKey === role.key ? 'text-blue-700' : 'text-slate-700'}`}>{role.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{role.users_count || 0} usuário(s){role.type === 'custom' ? ' · personalizado' : ''}</p>
                </button>
                {role.type === 'custom' && <div className="mr-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button type="button" onClick={() => renameRole(role)} className="rounded-lg p-2 text-slate-300 transition hover:bg-blue-50 hover:text-blue-600" aria-label={`Renomear ${role.name}`}><Pencil size={14} /></button>
                  <button type="button" onClick={() => deleteRole(role)} className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500" aria-label={`Excluir ${role.name}`}><Trash2 size={15} /></button>
                </div>}
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Editando cargo</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">{selectedRole?.name}</h3>
                {selectedRole?.key === 'admin' && <p className="mt-1 text-sm text-slate-500">Administradores mantêm acesso total. Use “Somente proprietário” nos recursos que só você deve ver.</p>}
              </div>
              {selectedRole?.key !== 'admin' && <button type="button" onClick={savePermissions} disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save size={16} /> {saving ? 'Salvando...' : 'Salvar permissões'}</button>}
            </div>
          </section>

          {Object.entries(grouped).map(([group, items]) => (
            <section key={group} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h4 className="font-bold text-slate-900">{group}</h4></div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => {
                  const restricted = Boolean(item.admin_only && selectedRole?.key !== 'admin');
                  const owner = Boolean(ownerOnly[item.key]);
                  return (
                    <div key={item.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0 pr-3">
                        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}{item.admin_only ? ' · Recurso sensível, restrito a administradores.' : ''}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button type="button" onClick={() => toggleOwnerOnly(item.key)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${owner ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`} title="Quando ativo, somente o proprietário principal da agência vê este recurso.">
                          {owner ? <EyeOff size={14} /> : <Eye size={14} />} Somente proprietário
                        </button>
                        {(() => {
                          const configured = selectedRole?.key === 'admin' ? true : Boolean(draft[item.key]);
                          const effective = selectedRole?.key === 'admin' ? true : effectiveDraftPermission(selectedRole, item.key, draft);
                          const blockedByParent = configured && !effective && permissionParents(item.key).length > 0;
                          return (
                            <label className={`inline-flex min-w-[128px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${effective ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : blockedByParent ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'} ${selectedRole?.key === 'admin' || restricted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} title={blockedByParent ? 'Este recurso está marcado, mas a área principal está oculta.' : undefined}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={configured}
                                disabled={selectedRole?.key === 'admin' || restricted}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setDraft((current) => {
                                    const next = { ...current, [item.key]: checked };
                                    if (checked) permissionParents(item.key).forEach((parent) => { next[parent] = true; });
                                    return next;
                                  });
                                }}
                              />
                              {effective ? <Check size={14} /> : blockedByParent ? <EyeOff size={14} /> : <X size={14} />}
                              {effective ? 'Pode ver' : blockedByParent ? 'Área pai oculta' : 'Oculto'}
                            </label>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-300"><ShieldCheck size={17} /><p className="text-[11px] font-bold uppercase tracking-[0.16em]">Visualizar como</p></div>
                <h4 className="mt-2 text-lg font-bold">Prévia do acesso por cargo</h4>
                <p className="mt-1 text-sm text-white/55">Confira rapidamente quais áreas ficam visíveis sem entrar em outra conta.</p>
              </div>
              <select value={previewRoleKey} onChange={(e) => setPreviewRoleKey(e.target.value)} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white outline-none">
                {roles.map((role) => <option key={role.key} value={role.key} className="text-slate-900">{role.name}</option>)}
              </select>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.filter((item) => item.key.endsWith('.view') || ['social.feed','social.stories','social.reports','social.covers','social.published','social.compare','social.calendar'].includes(item.key)).map((item) => {
                const visible = effectiveRolePermission(previewRole, item.key, ownerOnly);
                return <div key={item.key} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${visible ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : ownerOnly[item.key] ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/[0.03] text-white/35'}`}>{visible ? <Check size={14} /> : ownerOnly[item.key] ? <EyeOff size={14} /> : <X size={14} />}<span className="truncate">{item.label}{ownerOnly[item.key] ? ' · só proprietário' : ''}</span></div>;
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
