import { useEffect, useState } from 'react';
import { CheckCircle2, Database, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import api from '../api';

const DEFAULT_PROFILE_DATASET = 'gd_l1vikfch901nx3by4';
const DEFAULT_POSTS_DATASET = 'gd_lk5ns7kz21pck8jpis';

export default function CompetitorIntegrationSettings() {
  const [data, setData] = useState({ configured: false, provider: 'brightdata', source: null });
  const [apiKey, setApiKey] = useState('');
  const [profileDatasetId, setProfileDatasetId] = useState(DEFAULT_PROFILE_DATASET);
  const [postsDatasetId, setPostsDatasetId] = useState(DEFAULT_POSTS_DATASET);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await api.get('/competitors/collector', { params: { _ts: Date.now() } });
      const next = response.data || { configured: false, provider: 'brightdata', source: null };
      setData(next);
      setProfileDatasetId(next.profile_dataset_id || DEFAULT_PROFILE_DATASET);
      setPostsDatasetId(next.posts_dataset_id || DEFAULT_POSTS_DATASET);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a integração.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(event) {
    event?.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await api.put('/competitors/collector', {
        api_key: apiKey.trim() || undefined,
        profile_dataset_id: profileDatasetId.trim() || DEFAULT_PROFILE_DATASET,
        posts_dataset_id: postsDatasetId.trim() || DEFAULT_POSTS_DATASET,
      });
      setData(response.data);
      setApiKey('');
      setNotice('Integração salva. Agora, em Concorrentes, é só cadastrar os @.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a integração com a Bright Data.');
    } finally { setSaving(false); }
  }

  async function removeSavedKey() {
    if (!window.confirm('Remover a configuração salva da Bright Data desta agência?')) return;
    setRemoving(true); setError(''); setNotice('');
    try {
      const response = await api.delete('/competitors/collector');
      setData(response.data);
      setApiKey('');
      setProfileDatasetId(response.data?.profile_dataset_id || DEFAULT_PROFILE_DATASET);
      setPostsDatasetId(response.data?.posts_dataset_id || DEFAULT_POSTS_DATASET);
      setNotice(response.data?.configured
        ? 'A chave salva foi removida. O servidor continua com uma chave configurada por variável de ambiente.'
        : 'Configuração removida.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível remover a configuração.');
    } finally { setRemoving(false); }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando integração...</div>;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">Concorrentes</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">Coleta automática com Bright Data</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Configure uma vez para a agência. Depois disso, ninguém precisa conectar o Instagram do cliente: basta digitar o @ do concorrente.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <section className={`rounded-2xl border p-5 ${data.configured ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${data.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{data.configured ? <CheckCircle2 size={20} /> : <KeyRound size={20} />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">{data.configured ? 'Coleta automática pronta' : 'Ative a coleta uma vez'}</p>
            <p className="mt-0.5 text-xs text-slate-500">{data.configured ? (data.source === 'environment' ? 'Chave configurada no servidor.' : 'Chave salva com segurança para esta agência.') : 'Cole sua API Key da Bright Data abaixo.'}</p>
          </div>
          <button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={14} />Atualizar</button>
        </div>
      </section>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-900">Acesso à Bright Data</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">A chave fica no backend e não é devolvida ao navegador depois de salva.</p>
          </div>
          <a href="https://brightdata.com/cp/setting/users" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Abrir Bright Data <ExternalLink size={12} /></a>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-bold text-slate-700">API Key</span>
          <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <KeyRound size={16} className="shrink-0 text-slate-400" />
            <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data.configured ? 'Chave já configurada — deixe em branco para manter' : 'Cole a API Key da Bright Data'} className="h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none" />
          </div>
        </label>

        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <summary className="cursor-pointer text-xs font-black text-slate-700">Configuração avançada</summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">Deixe os IDs padrão, a menos que você crie/clone datasets próprios na Bright Data.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label><span className="text-[11px] font-bold text-slate-600">Dataset de perfis</span><div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white px-3"><Database size={14} className="text-slate-400" /><input value={profileDatasetId} onChange={(e) => setProfileDatasetId(e.target.value)} className="h-10 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs outline-none" /></div></label>
            <label><span className="text-[11px] font-bold text-slate-600">Dataset de posts</span><div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white px-3"><Database size={14} className="text-slate-400" /><input value={postsDatasetId} onChange={(e) => setPostsDatasetId(e.target.value)} className="h-10 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs outline-none" /></div></label>
          </div>
        </details>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Salvar integração</button>
          {data.source === 'database' && <button type="button" onClick={removeSavedKey} disabled={removing} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{removing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Remover chave salva</button>}
        </div>
      </form>
    </div>
  );
}
