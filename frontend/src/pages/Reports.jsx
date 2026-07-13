import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Reports() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(user?.role === 'client' ? user.client_id : '');
  const [metrics, setMetrics] = useState([]);
  const [totals, setTotals] = useState(null);
  const [form, setForm] = useState({ platform: 'meta_ads', metric_date: '', reach: '', impressions: '', engagement: '', clicks: '', leads: '', spend: '', conversions: '' });

  useEffect(() => {
    if (user?.role !== 'client') {
      api.get('/clients').then((res) => {
        setClients(res.data.clients);
        if (!clientId && res.data.clients.length) setClientId(res.data.clients[0].id);
      });
    }
  }, [user]);

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relatórios</h1>
          <p className="text-slate-500 mt-1">Acompanhamento de performance de redes sociais e tráfego pago.</p>
        </div>
        {user?.role !== 'client' && clients.length > 0 && (
          <select className="input-field w-56" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Alcance total" value={totals.reach.toLocaleString('pt-BR')} />
          <MetricCard label="Engajamento" value={totals.engagement.toLocaleString('pt-BR')} />
          <MetricCard label="Cliques" value={totals.clicks.toLocaleString('pt-BR')} />
          <MetricCard label="Leads/Conversões" value={(totals.leads + totals.conversions).toLocaleString('pt-BR')} />
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Evolução no período</h2>
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
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Lançar métricas manualmente</h2>
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

function MetricCard({ label, value }) {
  return (
    <div className="card p-5">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}
