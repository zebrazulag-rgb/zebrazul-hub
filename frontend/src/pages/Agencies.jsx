import { useEffect, useState } from 'react';
import { Building2, Plus, Users, BriefcaseBusiness, Globe2, X, CheckCircle2, PauseCircle } from 'lucide-react';
import api from '../api';
import PageHero from '../components/PageHero.jsx';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { tenantBaseDomain, tenantHostForSlug } from '../tenant.js';

const EMPTY_FORM = {
  name: '', slug: '', product_name: '', owner_name: '', owner_email: '', owner_password: '',
  max_clients: 10, max_users: 5, primary_color: '#0969ff', sidebar_color: '#121620',
};

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export default function Agencies() {
  const [agencies, setAgencies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/agencies');
      setAgencies(data.agencies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar as agências.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function createAgency(event) {
    event.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/agencies', form);
      setAgencies((previous) => [data.agency, ...previous]);
      setSuccess(`Agência ${data.agency.name} criada. O acesso inicial já está pronto.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar a agência.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(agency) {
    const nextStatus = agency.status === 'active' ? 'paused' : 'active';
    try {
      const { data } = await api.put(`/agencies/${agency.id}`, { status: nextStatus });
      setAgencies((previous) => previous.map((item) => item.id === agency.id ? data.agency : item));
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível alterar o status.');
    }
  }

  const totals = agencies.reduce((acc, item) => {
    acc.clients += Number(item.clients_count || 0);
    acc.users += Number(item.users_count || 0);
    if (item.status === 'active') acc.active += 1;
    return acc;
  }, { clients: 0, users: 0, active: 0 });

  return (
    <div className="space-y-6">
      <PageHero
        icon={Building2}
        eyebrow="Administração da plataforma"
        title="Agências"
        description="Crie ambientes isolados com marca, acesso próprio, equipe e clientes separados."
        actions={<button onClick={() => { setShowForm(true); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900"><Plus size={17}/> Nova agência</button>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Agências', agencies.length, Building2], ['Ativas', totals.active, CheckCircle2],
            ['Clientes', totals.clients, BriefcaseBusiness], ['Usuários', totals.users, Users],
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/45"><Icon size={14}/>{label}</div>
              <p className="mt-1 text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      </PageHero>

      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      {error && !showForm && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="surface-card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4"><h2 className="font-semibold text-slate-900">Ambientes cadastrados</h2></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Carregando...</p> : agencies.length === 0 ? <p className="p-6 text-sm text-slate-500">Nenhuma agência cadastrada.</p> : (
          <div className="divide-y divide-slate-100">
            {agencies.map((agency) => (
              <div key={agency.id} className="flex flex-wrap items-center gap-4 px-6 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: agency.sidebar_color || '#121620' }}>
                  {agency.logo_data ? <img src={agency.logo_data} className="max-h-8 max-w-9 object-contain" alt="" /> : <Building2 size={21}/>} 
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{agency.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${agency.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{agency.status === 'active' ? 'Ativa' : 'Pausada'}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Globe2 size={13}/>{tenantHostForSlug(agency.slug)}</span>
                    <span>{agency.clients_count}/{agency.max_clients} clientes</span>
                    <span>{agency.users_count}/{agency.max_users} usuários</span>
                  </div>
                </div>
                <button onClick={() => toggleStatus(agency)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  {agency.status === 'active' ? <><PauseCircle size={16}/> Pausar</> : <><CheckCircle2 size={16}/> Ativar</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <ModalBackdrop onClose={() => !saving && setShowForm(false)} disabled={saving}>
          <form onSubmit={createAgency} className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-slate-900">Nova agência</h2><p className="mt-1 text-sm text-slate-500">Cria o ambiente e o primeiro administrador de uma vez.</p></div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20}/></button>
            </div>
            {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1 block text-sm font-medium text-slate-700">Nome da agência</span><input required className="input-field" value={form.name} onChange={(e) => { update('name', e.target.value); if (!form.slug) update('slug', slugify(e.target.value)); }} /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">Subdomínio</span><div className="flex items-center rounded-xl border border-slate-200 bg-white"><input required className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 outline-none" value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))}/><span className="pr-3 text-xs text-slate-400">.{tenantBaseDomain()}</span></div></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Nome exibido no sistema</span><input className="input-field" value={form.product_name} onChange={(e) => update('product_name', e.target.value)} placeholder="Pode ser o mesmo nome da agência" /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">Responsável</span><input required className="input-field" value={form.owner_name} onChange={(e) => update('owner_name', e.target.value)} /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">E-mail do responsável</span><input required type="email" className="input-field" value={form.owner_email} onChange={(e) => update('owner_email', e.target.value)} /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">Senha inicial</span><input required minLength={6} type="password" className="input-field" value={form.owner_password} onChange={(e) => update('owner_password', e.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="mb-1 block text-sm font-medium text-slate-700">Clientes</span><input type="number" min="1" className="input-field" value={form.max_clients} onChange={(e) => update('max_clients', e.target.value)} /></label>
                <label><span className="mb-1 block text-sm font-medium text-slate-700">Usuários</span><input type="number" min="1" className="input-field" value={form.max_users} onChange={(e) => update('max_users', e.target.value)} /></label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Cancelar</button><button disabled={saving} className="btn-primary">{saving ? 'Criando...' : 'Criar agência'}</button></div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
}
