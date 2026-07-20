import { useEffect, useState } from 'react';
import { ImageUp, Palette, Save, ExternalLink, Mail, Phone, CheckCircle2 } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext.jsx';
import PageHero from '../components/PageHero.jsx';

const DEFAULT_FORM = {
  name: '', product_name: '', logo_data: null, logo_mime: null,
  primary_color: '#0969ff', secondary_color: '#4f8cff',
  sidebar_color: '#121620', login_background_color: '#121620',
  support_email: '', support_whatsapp: '', footer_text: 'Tecnologia ZebraHub',
};

export default function BrandSettings() {
  const { agency, updateAgency } = useTenant();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ ...DEFAULT_FORM, ...agency });
  }, [agency]);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function handleLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Envie uma imagem PNG, JPG, WEBP ou SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A logo deve ter no máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update('logo_data', reader.result);
      update('logo_mime', file.type);
      setError('');
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data } = await api.put('/tenant/me', form);
      updateAgency(data.agency);
      setMessage('Identidade da agência salva e aplicada em todo o ambiente.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a identidade.');
    } finally {
      setSaving(false);
    }
  }

  const subdomain = `${agency?.slug || 'agencia'}.zebrahub.com.br`;

  return (
    <div className="space-y-6">
      <PageHero
        icon={Palette}
        eyebrow="Plano Essencial · Cobranding"
        title="Marca da agência"
        description="Personalize o ambiente uma vez. A identidade será aplicada ao login, menu lateral e experiência dos clientes."
        actions={
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-60">
            <Save size={17} /> {saving ? 'Salvando...' : 'Salvar identidade'}
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
            <p className="text-xs text-white/45">Plano</p><p className="mt-1 font-semibold text-white">Essencial</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 sm:col-span-2">
            <p className="text-xs text-white/45">Subdomínio reservado</p>
            <p className="mt-1 truncate font-semibold text-white">{subdomain}</p>
          </div>
        </div>
      </PageHero>

      {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={17} />{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="surface-card p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="sm:col-span-1">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Nome da agência</span>
              <input className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Nome exibido no sistema</span>
              <input className="input-field" value={form.product_name} onChange={(e) => update('product_name', e.target.value)} placeholder="Ex.: Central da Agência" />
            </label>

            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Logo da agência</span>
              <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-slate-400">
                <div className="flex h-14 w-24 items-center justify-center rounded-xl bg-slate-900 p-2">
                  {form.logo_data ? <img src={form.logo_data} alt="Logo" className="max-h-10 max-w-full object-contain" /> : <ImageUp className="text-white/60" />}
                </div>
                <div><p className="text-sm font-medium text-slate-800">Selecionar logo</p><p className="text-xs text-slate-500">PNG, JPG, WEBP ou SVG · até 2 MB</p></div>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
            </div>

            {[
              ['primary_color', 'Cor principal'],
              ['secondary_color', 'Cor secundária'],
              ['sidebar_color', 'Fundo do menu'],
              ['login_background_color', 'Fundo do login'],
            ].map(([field, label]) => (
              <label key={field}>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                  <input type="color" value={form[field]} onChange={(e) => update(field, e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent" />
                  <input value={form[field]} onChange={(e) => update(field, e.target.value)} className="min-w-0 flex-1 border-0 text-sm uppercase outline-none" />
                </div>
              </label>
            ))}

            <label>
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700"><Mail size={15} /> E-mail de suporte</span>
              <input type="email" className="input-field" value={form.support_email || ''} onChange={(e) => update('support_email', e.target.value)} />
            </label>
            <label>
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700"><Phone size={15} /> WhatsApp de suporte</span>
              <input className="input-field" value={form.support_whatsapp || ''} onChange={(e) => update('support_whatsapp', e.target.value)} />
            </label>
            <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Crédito do Plano Essencial</p>
              <p className="mt-1 text-sm text-slate-600">“Tecnologia ZebraHub” permanece discretamente visível no rodapé do ambiente.</p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="surface-card overflow-hidden">
            <div className="p-4 text-white" style={{ backgroundColor: form.sidebar_color }}>
              <div className="flex min-h-16 items-center">
                {form.logo_data ? <img src={form.logo_data} alt="Prévia" className="max-h-12 max-w-[190px] object-contain" /> : <p className="text-xl font-semibold">{form.product_name || form.name}</p>}
              </div>
              <div className="mt-5 space-y-2">
                {['Painel', 'Tarefas', 'Aprovação', 'Relatórios'].map((item, index) => (
                  <div key={item} className={`rounded-xl px-3 py-2 text-sm ${index === 0 ? 'bg-white text-slate-900' : 'bg-white/5 text-white/65'}`}>
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: index === 0 ? form.primary_color : 'rgba(255,255,255,.25)' }} />{item}
                  </div>
                ))}
              </div>
              <p className="mt-8 text-[10px] uppercase tracking-[0.14em] text-white/30">{form.footer_text || 'Tecnologia ZebraHub'}</p>
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ExternalLink size={16} /> Publicação do subdomínio</div>
            <p className="mt-2 text-sm text-slate-500">A aplicação já reconhece o slug <strong>{agency?.slug}</strong>. Para o endereço funcionar publicamente, configure um domínio curinga <code>*.zebrahub.com.br</code> na hospedagem e no DNS.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
