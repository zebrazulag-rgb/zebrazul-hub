import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [postsRes, clientsRes] = await Promise.all([
        api.get('/posts'),
        api.get('/clients')
      ]);
      setPosts(postsRes.data.posts);
      setClients(clientsRes.data.clients);
      setLoading(false);
    }
    load();
  }, []);

  const pendingApproval = posts.filter((p) => p.status === 'pending_approval');
  const upcoming = posts
    .filter((p) => p.scheduled_at && new Date(p.scheduled_at) >= new Date())
    .slice(0, 5);

  const stats = [
    { label: 'Clientes ativos', value: clients.filter((c) => c.status === 'active').length, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Aguardando aprovação', value: pendingApproval.length, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Aprovados no período', value: posts.filter((p) => p.status === 'approved').length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Reprovados', value: posts.filter((p) => p.status === 'rejected').length, icon: AlertCircle, color: 'bg-red-50 text-red-600' }
  ];

  if (loading) return <p className="text-slate-500">Carregando painel...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Olá, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-slate-500 mt-1">Visão geral da operação de conteúdo e aprovações.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-3">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Pendentes de aprovação</h2>
            <Link to="/aprovacao" className="text-sm text-zebrazul-600 hover:underline">Ver tudo</Link>
          </div>
          {pendingApproval.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum conteúdo aguardando aprovação. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {pendingApproval.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate mr-3">{p.title}</span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Próximas publicações agendadas</h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma publicação agendada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate mr-3">{p.title}</span>
                  <span className="text-slate-400 text-xs shrink-0">
                    {new Date(p.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
