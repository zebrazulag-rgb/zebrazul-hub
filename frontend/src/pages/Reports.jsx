import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, Eye, MousePointerClick, Sparkles, Target } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';

export default function Reports() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : (selectedClient?.id || ''));
  const [metrics, setMetrics] = useState([]);
  const [totals, setTotals] = useState(null);
  const [form, setForm] = useState({ platform: 'meta_ads', metric_date: '', reach: '', impressions: '', engagement: '', clicks: '', leads: '', spend: '', conversions: '' });

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => {
        setClients(res.data.clients);
        if (!clientId && res.data.clients.length) setClientId(selectedClient?.id || res.data.clients[0].id);
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'client' && selectedClient) setClientId(selectedClient.id);
  }, [selectedClient, user]);

  useEffect(() => {
    if (clientId) loadReport();
  }, [clientId]);

  async function loadReport() {
    const { data } = await api.get(`/reports/${clientId}`);
    setMetrics(data.metrics);
    setTotals(data.totals);
  }

  async function handleAddMetric(e) {
    e.preventDefault();
    if (!form.metric_date) return;
    await api.post(`/reports/${clientId}`, {
      ...form,
      reach: Number(form.reach) || 0,
      impressions: Number(form.impressions) || 0,
      engagement: Number(form.engagement) || 0,
      clicks: Number(form.clicks) || 0,
      leads: Number(form.leads) || 0,
      spend: Number(form.spend) || 0,
      conversions: Number(form.conversions) || 0
    });
    setForm({ ...form, metric_date: '', reach: '', impressions: '', engagement: '', clicks: '', leads: '', spend: '', conversions: '' });
    loadReport();
  }

  const chartData = metrics.map((m) => ({
    date: new Date(m.metric_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Alcance: m.reach,
    Engajamento: m.engagement,
    Cliques: m.clicks
  }));

  return (
    <div className="space-y-6">
      <PageHero
        icon={BarChart3}
        eyebrow="Inteligência de performance"
        title="Relatórios"
        description="Transforme métricas de conteúdo e mídia em uma leitura clara do que está funcionando."
        actions={user?.role !== 'client' && clients.length > 0 && (
          <select className="min-w-[220px] rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-medium text-white outline-none" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => <option className="text-slate-800" key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      >
        {totals && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroMetric label="Alcance" value={totals.reach} icon={Eye} tone="text-blue-300" />
            <HeroMetric label="Engajamento" value={totals.engagement} icon={Sparkles} tone="text-violet-300" />
            <HeroMetric label="Cliques" value={totals.clicks} icon={MousePointerClick} tone="text-amber-300" />
            <HeroMetric label="Leads/Conversões" value={totals.leads + totals.conversions} icon={Target} tone="text-emerald-300" />
          </div>
        )}
      </PageHero>

      <div className="surface-card p-6">
        <div className="mb-5"><p className="section-kicker">Tendência</p><h2 className="section-title mt-1">Evolução no período</h2></div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
            <YAxis fontSize={12} stroke="#94a3b8" />
            <Tooltip />
            <Line type="monotone" dataKey="Alcance" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Engajamento" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Cliques" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {user?.role !== 'client' && (
        <div className="surface-card p-6">
          <div className="mb-4"><p className="section-kicker">Entrada manual</p><h2 className="section-title mt-1">Lançar métricas</h2></div>
          <p className="text-xs text-slate-400 mb-4">
            Espaço reservado para quando as integrações com Meta Ads / Google Ads forem conectadas via API — por ora, lançamento manual.
          </p>
          <form onSubmit={handleAddMetric} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select className="input-field" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="meta_ads">Meta Ads</option>
              <option value="google_ads">Google Ads</option>
              <option value="instagram">Instagram Orgânico</option>
              <option value="facebook">Facebook Orgânico</option>
              <option value="tiktok">TikTok</option>
            </select>
            <input type="date" required className="input-field" value={form.metric_date} onChange={(e) => setForm({ ...form, metric_date: e.target.value })} />
            <input type="number" placeholder="Alcance" className="input-field" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} />
            <input type="number" placeholder="Impressões" className="input-field" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} />
            <input type="number" placeholder="Engajamento" className="input-field" value={form.engagement} onChange={(e) => setForm({ ...form, engagement: e.target.value })} />
            <input type="number" placeholder="Cliques" className="input-field" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} />
            <input type="number" placeholder="Leads" className="input-field" value={form.leads} onChange={(e) => setForm({ ...form, leads: e.target.value })} />
            <input type="number" step="0.01" placeholder="Investimento (R$)" className="input-field" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} />
            <button type="submit" className="btn-primary col-span-2 md:col-span-1">Adicionar</button>
          </form>
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-white/45"><Icon size={14} className={tone} /> {label}</div>
      <p className="mt-1 text-2xl font-bold text-white">{Number(value || 0).toLocaleString('pt-BR')}</p>
    </div>
  );
}
