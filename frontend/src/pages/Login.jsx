import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import zebraHubLogo from '../assets/logo-hub-white.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { agency } = useTenant();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível entrar. Confira seu e-mail e sua senha.');
    } finally {
      setLoading(false);
    }
  }

  const logo = agency?.logo_data || zebraHubLogo;
  const primary = agency?.primary_color || '#0266FE';
  const background = agency?.login_background_color || '#121620';

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-10" style={{ backgroundColor: background }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: `radial-gradient(circle at 50% -20%, ${primary}70 0%, ${primary}20 38%, transparent 72%)` }}
      />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[390px] flex-col justify-center">
        <header className="mb-10 text-center">
          <img src={logo} alt={agency?.name || 'Agência'} className="mx-auto max-h-24 w-auto max-w-[260px] object-contain" />
          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-white">Bem-vindo de volta</h1>
          <p className="mt-2 text-sm text-slate-400">Entre para acessar {agency?.product_name || 'sua plataforma'}.</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">E-mail</label>
            <input
              id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@empresa.com"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 text-[15px] text-white outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:ring-4"
              style={{ '--tw-ring-color': `${primary}26` }}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">Senha</label>
            <div className="relative">
              <input
                id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Digite sua senha"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 pr-12 text-[15px] text-white outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:ring-4"
                style={{ '--tw-ring-color': `${primary}26` }}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition hover:text-slate-200"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

          <button type="submit" disabled={loading}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-white shadow-lg transition hover:brightness-95 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: primary, boxShadow: `0 12px 28px ${primary}30`, '--tw-ring-color': `${primary}35` }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {agency?.show_powered_by !== false && (
          <p className="mt-10 text-center text-xs text-white/35">{agency?.footer_text || 'Tecnologia ZebraHub'}</p>
        )}
      </main>
    </div>
  );
}
