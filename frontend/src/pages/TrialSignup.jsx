import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useTenant } from '../context/TenantContext.jsx';
import { persistTenantSlug } from '../tenant';
import zebraMark from '../assets/zebrazul-mark-light.png';

const INITIAL_FORM = {
  name: '',
  company_name: '',
  segment: '',
  phone: '',
  email: '',
  password: '',
  accepted_terms: false,
};

export default function TrialSignup() {
  const { agency } = useTenant();
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const primary = agency?.primary_color || '#3A85FD';
  const background = agency?.login_background_color || '#17181C';
  const logo = agency?.logo_data || zebraMark;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (String(form.password).length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/trial-signup', form);
      localStorage.setItem('zebrazul_token', data.token);
      localStorage.setItem('zebrazul_user', JSON.stringify(data.user));
      if (data.user?.agency?.slug) persistTenantSlug(data.user.agency.slug);
      window.location.assign('/cliente/experiencia');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível iniciar sua experiência agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-8" style={{ backgroundColor: background }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{ background: `radial-gradient(circle at 50% -15%, ${primary}72 0%, ${primary}24 38%, transparent 73%)` }}
      />
      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden lg:block">
          <img src={logo} alt={agency?.name || 'ZebraHub'} className="h-20 w-20 object-contain" />
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-[#C9FF2F]">
            <Sparkles size={14} /> ZEBRAHUB EXPERIENCE
          </div>
          <h1 className="mt-5 max-w-xl text-5xl font-black uppercase leading-[0.94] tracking-[-0.055em] text-white">
            30 dias para enxergar seu marketing com mais direção.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/55">
            Crie seu espaço, organize o que sua marca precisa comunicar e experimente o Radar de Conteúdo antes de virar cliente.
          </p>
          <div className="mt-8 space-y-3 text-sm text-white/70">
            {['Raio-X inicial da marca', 'Plano de 30 dias com checklist', 'Radar de oportunidades e ideias de conteúdo'].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-[#C9FF2F]" /> {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: primary }}>ZebraHub Experience</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#17181C]">COMECE SEU TESTE.</h2>
              <p className="mt-2 text-sm text-slate-500">30 dias. Seu próprio ambiente. Seus dados ficam salvos.</p>
            </div>
            <img src={logo} alt="" className="h-12 w-12 rounded-2xl object-contain lg:hidden" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Seu nome" value={form.name} onChange={(value) => update('name', value)} placeholder="Como podemos te chamar?" autoComplete="name" />
              <Field label="Empresa" value={form.company_name} onChange={(value) => update('company_name', value)} placeholder="Nome da empresa" />
              <Field label="Segmento" value={form.segment} onChange={(value) => update('segment', value)} placeholder="Ex: odontologia, contabilidade" />
              <Field label="WhatsApp" value={form.phone} onChange={(value) => update('phone', value)} placeholder="(84) 99999-9999" autoComplete="tel" />
            </div>
            <Field label="E-mail" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="seuemail@empresa.com" autoComplete="email" />

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Crie uma senha</label>
              <div className="relative">
                <input
                  required
                  minLength={6}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4"
                  style={{ '--tw-ring-color': `${primary}18` }}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
              <input
                required
                type="checkbox"
                checked={form.accepted_terms}
                onChange={(event) => update('accepted_terms', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                Concordo com os <Link to="/termos-de-uso" target="_blank" className="font-semibold text-slate-800 underline">Termos de Uso</Link> e a <Link to="/politica-de-privacidade" target="_blank" className="font-semibold text-slate-800 underline">Política de Privacidade</Link>.
              </span>
            </label>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60" style={{ backgroundColor: primary, boxShadow: `0 14px 30px ${primary}30` }}>
              {loading ? 'Criando seu espaço...' : 'Começar meus 30 dias'} {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Já tem acesso? <Link to="/login" className="font-bold" style={{ color: primary }}>Entrar no ZebraHub</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', autoComplete }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        required
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-blue-500/10"
      />
    </div>
  );
}
