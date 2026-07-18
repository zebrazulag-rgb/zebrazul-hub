import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Facebook, Instagram, LoaderCircle, Megaphone, RefreshCw, Unlink, X } from 'lucide-react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';

function organicLabel(asset) {
  const page = asset.page_name ? `Facebook: ${asset.page_name}` : null;
  const instagram = asset.instagram?.username ? `Instagram: @${asset.instagram.username}` : null;
  return [page, instagram].filter(Boolean).join(' • ') || asset.asset_key;
}

export default function ReportConnectionsModal({ open, onClose, clientId, clientName, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [organicAssets, setOrganicAssets] = useState([]);
  const [adAccounts, setAdAccounts] = useState([]);
  const [organicConnection, setOrganicConnection] = useState(null);
  const [adConnection, setAdConnection] = useState(null);
  const [organicKey, setOrganicKey] = useState('');
  const [adAccountId, setAdAccountId] = useState('');

  useEffect(() => {
    if (open && clientId) loadEverything();
  }, [open, clientId]);

  async function loadEverything() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [organicAssetsRes, adAccountsRes, organicConnectionRes, adReportRes] = await Promise.all([
        api.get('/meta-organic/assets'),
        api.get('/meta/accounts'),
        api.get(`/meta-organic/client/${clientId}/connection`),
        api.get(`/meta/client/${clientId}/report`),
      ]);
      const nextOrganic = organicConnectionRes.data.connection || null;
      const nextAd = adReportRes.data.connection || null;
      setOrganicAssets(organicAssetsRes.data.assets || []);
      setAdAccounts(adAccountsRes.data.accounts || []);
      setOrganicConnection(nextOrganic);
      setAdConnection(nextAd);
      setOrganicKey(nextOrganic?.asset_key || '');
      setAdAccountId(nextAd?.account_id || '');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar as conexões deste cliente.');
    } finally {
      setLoading(false);
    }
  }

  const availableOrganic = useMemo(() => organicAssets.filter((asset) => (
    !asset.assignment || Number(asset.assignment.client_id) === Number(clientId)
  )), [organicAssets, clientId]);

  const availableAds = useMemo(() => adAccounts.filter((account) => (
    !account.assignment || Number(account.assignment.client_id) === Number(clientId)
  )), [adAccounts, clientId]);

  async function saveOrganic() {
    if (!organicKey) return;
    setSaving('organic');
    setError('');
    try {
      const { data } = await api.put(`/meta-organic/client/${clientId}/connection`, { asset_key: organicKey });
      setOrganicConnection(data.connection);
      setNotice('Facebook e Instagram salvos para este cliente.');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar Facebook e Instagram.');
    } finally {
      setSaving('');
    }
  }

  async function saveAds() {
    if (!adAccountId) return;
    setSaving('ads');
    setError('');
    try {
      await api.put(`/meta/client/${clientId}/connection`, { account_id: adAccountId });
      setNotice('Conta de anúncios salva para este cliente.');
      await loadEverything();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar a conta de anúncios.');
    } finally {
      setSaving('');
    }
  }

  async function disconnectOrganic() {
    if (!window.confirm('Desconectar Facebook e Instagram deste cliente?')) return;
    setSaving('organic');
    try {
      await api.delete(`/meta-organic/client/${clientId}/connection`);
      setOrganicConnection(null);
      setOrganicKey('');
      setNotice('Conexão orgânica removida.');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível remover a conexão orgânica.');
    } finally { setSaving(''); }
  }

  async function disconnectAds() {
    if (!window.confirm('Desconectar a conta de anúncios deste cliente?')) return;
    setSaving('ads');
    try {
      await api.delete(`/meta/client/${clientId}/connection`);
      setAdConnection(null);
      setAdAccountId('');
      setNotice('Conta de anúncios removida.');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível remover a conta de anúncios.');
    } finally { setSaving(''); }
  }

  if (!open) return null;

  return (
    <ModalBackdrop onClose={onClose} disabled={Boolean(saving)}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="section-kicker">Configurações do relatório</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Conexões de {clientName || 'cliente'}</h2>
            <p className="mt-1 text-sm text-slate-500">Faça a configuração uma vez. Depois, o relatório abre pronto sempre que esse cliente for selecionado.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={17} />{notice}</div>}

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={20} /> Carregando ativos da Meta...</div>
          ) : (
            <>
              <ConnectionBlock
                icon={<><Facebook size={18} /><Instagram size={18} /></>}
                title="Facebook e Instagram"
                description="Conexão principal do relatório. Vincula a Página e o Instagram profissional correspondente."
                connected={Boolean(organicConnection)}
              >
                <select className="input-field" value={organicKey} onChange={(event) => setOrganicKey(event.target.value)}>
                  <option value="">Selecione os perfis</option>
                  {availableOrganic.map((asset) => <option key={asset.asset_key} value={asset.asset_key}>{organicLabel(asset)}</option>)}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary flex items-center gap-2" onClick={saveOrganic} disabled={!organicKey || saving === 'organic'}>
                    {saving === 'organic' ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {organicConnection ? 'Salvar novos perfis' : 'Conectar perfis'}
                  </button>
                  {organicConnection && <button className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={disconnectOrganic}><Unlink size={16} /> Desconectar</button>}
                </div>
              </ConnectionBlock>

              <ConnectionBlock
                icon={<Megaphone size={19} />}
                title="Meta Ads"
                description="Opcional. Use somente nos clientes que possuem campanhas pagas."
                connected={Boolean(adConnection)}
                optional
              >
                <select className="input-field" value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)}>
                  <option value="">Sem conta de anúncios</option>
                  {availableAds.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} • {account.account_id}</option>)}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary flex items-center gap-2" onClick={saveAds} disabled={!adAccountId || saving === 'ads'}>
                    {saving === 'ads' ? <LoaderCircle size={16} className="animate-spin" /> : <Megaphone size={16} />}
                    {adConnection ? 'Salvar nova conta' : 'Conectar anúncios'}
                  </button>
                  {adConnection && <button className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={disconnectAds}><Unlink size={16} /> Desconectar</button>}
                </div>
              </ConnectionBlock>
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}

function ConnectionBlock({ icon, title, description, connected, optional, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile flex gap-1 bg-white text-[#0969ff] shadow-sm">{icon}</span>
          <div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>
        </div>
        <span className={`badge shrink-0 ${connected ? 'bg-emerald-100 text-emerald-700' : optional ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{connected ? 'Conectado' : optional ? 'Opcional' : 'Pendente'}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
