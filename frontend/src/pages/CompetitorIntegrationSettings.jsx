import { useEffect, useState } from 'react';
import { CheckCircle2, Instagram, Loader2, PlugZap, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

function AccountAvatar({ item }) {
  if (item?.profile_picture_url) return <img src={item.profile_picture_url} alt="" className="h-11 w-11 rounded-xl object-cover" />;
  return <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400"><Instagram size={19} /></span>;
}

export default function CompetitorIntegrationSettings() {
  const navigate = useNavigate();
  const [data, setData] = useState({ configured: false, collector: null, candidates: [] });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await api.get('/competitors/collector', { params: { _ts: Date.now() } });
      setData(response.data || { configured: false, collector: null, candidates: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a integração.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(item) {
    setSavingId(item.oauth_connection_id); setError(''); setNotice('');
    try {
      const response = await api.put('/competitors/collector', { oauth_connection_id: item.oauth_connection_id });
      setData(response.data);
      setNotice('Conta coletora atualizada. A partir de agora, basta cadastrar os @ na área de Concorrentes.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível usar essa conta como coletora.');
    } finally { setSavingId(null); }
  }

  const currentId = Number(data.collector?.oauth_connection_id || 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">Concorrentes</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">Conta coletora do Instagram</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Essa conta é configurada uma única vez para a agência. Depois disso, qualquer cliente pode cadastrar concorrentes apenas pelo @, sem conectar o Instagram dele.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {loading ? <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando conexões...</div> : <>
        <section className={`rounded-2xl border p-5 ${data.configured ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${data.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{data.configured ? <CheckCircle2 size={20} /> : <PlugZap size={20} />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{data.configured ? 'Coleta automática pronta' : 'Falta escolher uma conta coletora'}</p>
              <p className="mt-0.5 text-xs text-slate-500">{data.configured ? (data.collector?.instagram_username ? `@${data.collector.instagram_username}` : data.collector?.client_name || 'Conta profissional conectada') : 'Faça isso uma vez e a área de Concorrentes fica automática.'}</p>
            </div>
            <button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={14} />Atualizar</button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-black text-slate-900">Contas disponíveis</h3>
            <p className="mt-1 text-xs text-slate-500">Escolha qual conexão profissional da agência será usada apenas para consultar os dados públicos dos concorrentes.</p>
          </div>
          {data.candidates?.length ? <div className="space-y-2">{data.candidates.map((item) => {
            const selected = currentId === Number(item.oauth_connection_id);
            const needsReconnect = !item.business_discovery_ready;
            return <button key={item.oauth_connection_id} type="button" disabled={savingId != null} onClick={() => needsReconnect ? navigate('/relatorios') : choose(item)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? 'border-blue-300 bg-blue-50/60' : needsReconnect ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50' : 'border-slate-200 hover:bg-slate-50'} disabled:opacity-50`}>
              <AccountAvatar item={item} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{item.instagram_username ? `@${item.instagram_username}` : item.instagram_name || item.provider_user_name || 'Instagram profissional'}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">Conexão vinculada a {item.client_name || 'um cliente da agência'}{item.expired ? ' · conexão expirada' : needsReconnect ? ' · precisa reconectar uma vez' : ''}</span>
              </span>
              {savingId === item.oauth_connection_id ? <Loader2 size={17} className="animate-spin text-blue-600" /> : needsReconnect ? <span className="text-xs font-bold text-amber-700">Reconectar</span> : selected ? <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Em uso</span> : <span className="text-xs font-bold text-blue-600">Usar</span>}
            </button>;
          })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Instagram size={24} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Nenhuma conta profissional disponível</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">Conecte uma conta Meta/Instagram em qualquer cliente da agência e selecione o perfil profissional. Depois volte aqui: ela aparecerá automaticamente nesta lista.</p>
            <button type="button" onClick={() => navigate('/relatorios')} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">Ir para Relatórios / Conexões</button>
          </div>}
        </section>
      </>}
    </div>
  );
}
