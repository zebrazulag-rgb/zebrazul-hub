import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  Bug,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Code2,
  ExternalLink,
  GitBranch,
  GripVertical,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  TestTube2,
  UserRound,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const STATUS_COLUMNS = [
  { key: 'backlog', label: 'Backlog', short: 'Backlog', tone: 'slate' },
  { key: 'analysis', label: 'Em análise', short: 'Análise', tone: 'violet' },
  { key: 'ready', label: 'Pronto para desenvolver', short: 'Pronto', tone: 'blue' },
  { key: 'development', label: 'Em desenvolvimento', short: 'Desenvolvimento', tone: 'indigo' },
  { key: 'testing', label: 'Em teste', short: 'Teste', tone: 'amber' },
  { key: 'awaiting_owner', label: 'Aguardando Arthur', short: 'Arthur', tone: 'orange' },
  { key: 'ready_production', label: 'Pronto para produção', short: 'Produção', tone: 'emerald' },
  { key: 'done', label: 'Concluído', short: 'Concluído', tone: 'green' },
];

const TYPE_OPTIONS = [
  ['bug', 'Bug'],
  ['improvement', 'Melhoria'],
  ['feature', 'Nova função'],
  ['tech_debt', 'Débito técnico'],
];

const PRIORITY_OPTIONS = [
  ['critical', 'Crítica'],
  ['high', 'Alta'],
  ['medium', 'Média'],
  ['low', 'Baixa'],
];

const MODULE_OPTIONS = [
  'Painel',
  'Produto',
  'Audiovisual',
  'Tarefas',
  'Conversas',
  'Bússola',
  'Social Media',
  'Comercial',
  'Materiais',
  'Financeiro',
  'Configurações',
  'Backend / Infra',
  'Banco de dados',
  'Autenticação',
  'Integrações',
];

const EMPTY_ITEM = {
  title: '',
  type: 'improvement',
  priority: 'medium',
  module: '',
  problem: '',
  current_behavior: '',
  expected_behavior: '',
  proposed_solution: '',
  acceptance_criteria: '',
  assignee_id: '',
  due_date: '',
  origin_url: '',
  links_text: '',
  affected_files: '',
  environment: 'local',
  branch_name: '',
  commit_ref: '',
  pr_url: '',
  testing_notes: '',
  blocked_reason: '',
};

function statusInfo(key) {
  return STATUS_COLUMNS.find((item) => item.key === key) || STATUS_COLUMNS[0];
}

function priorityLabel(value) {
  return PRIORITY_OPTIONS.find(([key]) => key === value)?.[1] || value;
}

function typeLabel(value) {
  return TYPE_OPTIONS.find(([key]) => key === value)?.[1] || value;
}

function dateLabel(value) {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  const [year, month, day] = text.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function dateTimeLabel(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function priorityClass(priority) {
  const map = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return map[priority] || map.medium;
}

function typeIcon(type, size = 14) {
  if (type === 'bug') return <Bug size={size} />;
  if (type === 'feature') return <Sparkles size={size} />;
  if (type === 'tech_debt') return <Wrench size={size} />;
  return <CircleDot size={size} />;
}

function qaPercent(item) {
  const total = Number(item?.qa_total || item?.qa?.length || 0);
  const checked = Number(item?.qa_checked ?? item?.qa?.filter((row) => row.checked).length ?? 0);
  return total ? Math.round((checked / total) * 100) : 0;
}

export default function ProductDevelopment() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [newItem, setNewItem] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [releaseModal, setReleaseModal] = useState(null);

  const canCreate = hasPermission(user, 'product.create');
  const canManage = hasPermission(user, 'product.manage');
  const canQa = hasPermission(user, 'product.qa');
  const canRelease = hasPermission(user, 'product.release');
  const isOwner = Boolean(user?.is_platform_owner);
  const canApprove = canRelease && isOwner;

  const users = dashboard?.users || [];

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [dashboardRes, itemsRes, releasesRes] = await Promise.all([
        api.get('/product/dashboard'),
        api.get('/product/items'),
        api.get('/product/releases'),
      ]);
      setDashboard(dashboardRes.data || {});
      setItems(itemsRes.data?.items || []);
      setReleases(releasesRes.data?.releases || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar Produto / Desenvolvimento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('novo') !== '1' || !canCreate) return;
    setTab('backlog');
    setNewItem({
      ...EMPTY_ITEM,
      type: 'bug',
      origin_url: params.get('origem') || '',
    });
    navigate('/produto', { replace: true });
  }, [location.search, canCreate, navigate]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      if (assigneeFilter && Number(item.assignee_id || 0) !== Number(assigneeFilter)) return false;
      if (!query) return true;
      return [item.title, item.module, item.problem, item.expected_behavior, item.assignee_name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query));
    });
  }, [items, search, typeFilter, priorityFilter, assigneeFilter]);

  const backlogItems = filteredItems.filter((item) => ['backlog', 'analysis', 'ready'].includes(item.status));
  const readyProductionItems = items.filter((item) => item.status === 'ready_production');

  async function openItem(id) {
    setBusy(`open-${id}`);
    setError('');
    try {
      const { data } = await api.get(`/product/items/${id}`);
      setActiveItem(data.item);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível abrir a demanda.');
    } finally {
      setBusy('');
    }
  }

  async function createItem(form) {
    setBusy('create');
    setError('');
    try {
      const { data } = await api.post('/product/items', form);
      setNewItem(null);
      setNotice('Demanda criada no Produto.');
      await loadAll({ quiet: true });
      if (data?.id) await openItem(data.id);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar a demanda.');
    } finally {
      setBusy('');
    }
  }

  async function saveItem(form) {
    if (!form?.id) return;
    setBusy(`save-${form.id}`);
    setError('');
    try {
      const { data } = await api.put(`/product/items/${form.id}`, form);
      setActiveItem(data.item);
      setNotice('Demanda atualizada.');
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar a demanda.');
    } finally {
      setBusy('');
    }
  }

  async function moveStatus(item, status) {
    if (!item?.id || item.status === status || !canManage) return;
    setBusy(`status-${item.id}`);
    setError('');
    try {
      const { data } = await api.post(`/product/items/${item.id}/status`, { status });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...data.item } : row));
      if (activeItem?.id === item.id) setActiveItem(data.item);
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível alterar o status.');
    } finally {
      setBusy('');
      setDraggedId(null);
    }
  }

  async function toggleQa(item, check) {
    if (!canQa) return;
    setBusy(`qa-${check.check_key}`);
    setError('');
    try {
      const { data } = await api.put(`/product/items/${item.id}/qa/${check.check_key}`, {
        checked: !Boolean(check.checked),
      });
      setActiveItem(data.item);
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o QA.');
    } finally {
      setBusy('');
    }
  }

  async function approveItem(item) {
    if (!canApprove) return;
    setBusy(`approve-${item.id}`);
    setError('');
    try {
      const { data } = await api.post(`/product/items/${item.id}/approve`);
      setActiveItem(data.item);
      setNotice('Aprovado para produção.');
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível aprovar.');
    } finally {
      setBusy('');
    }
  }

  async function requestChanges(item) {
    if (!canApprove) return;
    const notes = window.prompt('Qual ajuste precisa ser feito?') ?? '';
    if (!notes.trim()) return;
    setBusy(`changes-${item.id}`);
    setError('');
    try {
      const { data } = await api.post(`/product/items/${item.id}/request-changes`, { notes });
      setActiveItem(data.item);
      setNotice('Ajustes solicitados.');
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível solicitar ajustes.');
    } finally {
      setBusy('');
    }
  }

  async function archiveItem(item) {
    if (!canManage || !window.confirm(`Arquivar “${item.title}”?`)) return;
    setBusy(`archive-${item.id}`);
    try {
      await api.delete(`/product/items/${item.id}`);
      setActiveItem(null);
      setNotice('Demanda arquivada.');
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível arquivar.');
    } finally {
      setBusy('');
    }
  }

  async function createRelease(form) {
    setBusy('release-create');
    setError('');
    try {
      await api.post('/product/releases', form);
      setReleaseModal(null);
      setNotice('Release criada.');
      await loadAll({ quiet: true });
      setTab('releases');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível criar a release.');
    } finally {
      setBusy('');
    }
  }

  async function deployRelease(release) {
    if (!canApprove || !window.confirm(`Confirmar que a release ${release.version} foi publicada em produção?`)) return;
    setBusy(`deploy-${release.id}`);
    setError('');
    try {
      await api.post(`/product/releases/${release.id}/deploy`);
      setNotice(`Release ${release.version} publicada.`);
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível confirmar o deploy.');
    } finally {
      setBusy('');
    }
  }

  async function rollbackRelease(release) {
    if (!canApprove) return;
    const notes = window.prompt('Registre o motivo/resultado do rollback:') ?? '';
    if (!notes.trim()) return;
    setBusy(`rollback-${release.id}`);
    try {
      await api.post(`/product/releases/${release.id}/rollback`, { notes });
      setNotice(`Rollback da release ${release.version} registrado.`);
      await loadAll({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível registrar rollback.');
    } finally {
      setBusy('');
    }
  }

  const stats = dashboard?.stats || {};

  if (loading && !dashboard) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-slate-400">
        <Loader2 size={20} className="mr-2 animate-spin" /> Carregando Produto...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 lg:text-[28px]">Produto</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => setNewItem({ ...EMPTY_ITEM })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                <Plus size={15} /> Nova demanda
              </button>
            )}
            <button
              type="button"
              onClick={() => loadAll()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {[
            ['overview', 'Painel'],
            ['backlog', 'Backlog'],
            ['development', 'Desenvolvimento'],
            ['releases', 'Releases'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === key ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="ml-auto"><X size={15} /></button>
        </div>
      )}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      {tab === 'overview' && (
        <Overview
          stats={stats}
          priority={dashboard?.priority || []}
          releases={dashboard?.recent_releases || []}
          openItem={openItem}
          setTab={setTab}
        />
      )}

      {tab === 'backlog' && (
        <Backlog
          items={backlogItems}
          users={users}
          search={search}
          setSearch={setSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          openItem={openItem}
          canCreate={canCreate}
          onCreate={() => setNewItem({ ...EMPTY_ITEM })}
          busy={busy}
        />
      )}

      {tab === 'development' && (
        <>
          <Filters
            users={users}
            search={search}
            setSearch={setSearch}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            assigneeFilter={assigneeFilter}
            setAssigneeFilter={setAssigneeFilter}
          />
          <Kanban
            items={filteredItems}
            openItem={openItem}
            canManage={canManage}
            draggedId={draggedId}
            setDraggedId={setDraggedId}
            moveStatus={moveStatus}
            busy={busy}
          />
        </>
      )}

      {tab === 'releases' && (
        <Releases
          releases={releases}
          readyItems={readyProductionItems}
          canManage={canManage}
          canApprove={canApprove}
          openItem={openItem}
          onCreate={() => setReleaseModal({
            version: `2026.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')}.01`,
            title: '',
            notes: '',
            files_changed: '',
            migration_required: false,
            env_vars: '',
            rollback_plan: '',
            item_ids: readyProductionItems.map((item) => item.id),
          })}
          deployRelease={deployRelease}
          rollbackRelease={rollbackRelease}
          busy={busy}
        />
      )}

      {newItem && (
        <CreateItemModal
          form={newItem}
          setForm={setNewItem}
          users={users}
          busy={busy === 'create'}
          onClose={() => setNewItem(null)}
          onSave={createItem}
        />
      )}

      {activeItem && (
        <ItemDetailModal
          item={activeItem}
          setItem={setActiveItem}
          users={users}
          canManage={canManage}
          canQa={canQa}
          canApprove={canApprove}
          busy={busy}
          onClose={() => setActiveItem(null)}
          onSave={saveItem}
          onMove={moveStatus}
          onToggleQa={toggleQa}
          onApprove={approveItem}
          onRequestChanges={requestChanges}
          onArchive={archiveItem}
        />
      )}

      {releaseModal && (
        <ReleaseModal
          form={releaseModal}
          setForm={setReleaseModal}
          items={readyProductionItems}
          busy={busy === 'release-create'}
          onClose={() => setReleaseModal(null)}
          onSave={createRelease}
        />
      )}
    </div>
  );
}

function Overview({ stats, priority, releases, openItem, setTab }) {
  const metrics = [
    ['Abertas', stats.total_open || 0, Code2],
    ['Críticas', stats.critical || 0, ShieldAlert],
    ['Desenvolvimento', stats.development || 0, GitBranch],
    ['Em teste', stats.testing || 0, TestTube2],
    ['Aguardando Arthur', stats.awaiting_owner || 0, UserRound],
    ['Prontas p/ produção', stats.ready_production || 0, Rocket],
    ['Bloqueadas', stats.blocked || 0, AlertTriangle],
    ['Entregues no mês', stats.delivered_month || 0, BadgeCheck],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {metrics.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><Icon size={15} /></span>
            <strong className="mt-3 block text-2xl font-black text-slate-950">{value}</strong>
            <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-[26px] border border-red-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50/70 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Resolver primeiro</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Risco, bloqueios e bugs críticos</h2>
            </div>
            <button type="button" onClick={() => setTab('development')} className="text-xs font-bold text-red-700">Abrir Kanban <ChevronRight size={14} className="inline" /></button>
          </div>
          <div className="divide-y divide-slate-100">
            {!priority.length && <p className="px-5 py-12 text-center text-sm text-slate-400">Nenhum item crítico ou bloqueado agora.</p>}
            {priority.map((item) => (
              <button key={item.id} type="button" onClick={() => openItem(item.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${priorityClass(item.priority)}`}>{typeIcon(item.type, 15)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                    {item.high_risk ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700">Alto risco</span> : null}
                    {item.blocked_reason ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">Bloqueada</span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{item.module || 'Sem módulo'} · {statusInfo(item.status).label}</p>
                </div>
                <ArrowRight size={15} className="text-slate-300" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Últimas releases</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Produção</h2>
            </div>
            <button type="button" onClick={() => setTab('releases')} className="text-xs font-bold text-blue-600">Ver releases</button>
          </div>
          <div className="mt-4 space-y-2">
            {!releases.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">Nenhuma release registrada.</p>}
            {releases.map((release) => (
              <div key={release.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-slate-900">{release.version}</strong>
                  <ReleaseStatus status={release.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{release.title}</p>
                <p className="mt-2 text-[10px] font-semibold text-slate-400">{release.items_count} demanda(s)</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Filters({ users, search, setSearch, typeFilter, setTypeFilter, priorityFilter, setPriorityFilter, assigneeFilter, setAssigneeFilter }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_160px_150px_190px]">
      <label className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar demanda..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
      </label>
      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none">
        <option value="">Todos os tipos</option>
        {TYPE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none">
        <option value="">Prioridade</option>
        {PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none">
        <option value="">Todos os responsáveis</option>
        {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </div>
  );
}

function Backlog(props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Ideias, bugs e melhorias antes de entrarem em desenvolvimento.</p>
        {props.canCreate && <button type="button" onClick={props.onCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white"><Plus size={14} /> Nova demanda</button>}
      </div>
      <Filters {...props} />
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        {!props.items.length && <p className="px-5 py-14 text-center text-sm text-slate-400">Nenhuma demanda encontrada no backlog.</p>}
        <div className="divide-y divide-slate-100">
          {props.items.map((item) => (
            <button key={item.id} type="button" onClick={() => props.openItem(item.id)} className="grid w-full gap-3 px-5 py-4 text-left hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_140px_130px_170px_100px] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${priorityClass(item.priority)}`}>{typeIcon(item.type, 11)} {typeLabel(item.type)}</span>
                  {item.high_risk ? <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black uppercase text-red-700">Alto risco</span> : null}
                </div>
                <p className="mt-2 truncate text-sm font-bold text-slate-900">{item.title}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{item.problem || item.expected_behavior || 'Sem descrição'}</p>
              </div>
              <Cell label="Módulo" value={item.module || '—'} />
              <Cell label="Prioridade" value={priorityLabel(item.priority)} />
              <Cell label="Responsável" value={item.assignee_name || 'Não atribuído'} />
              <div><StatusPill status={item.status} /></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kanban({ items, openItem, canManage, draggedId, setDraggedId, moveStatus, busy }) {
  const dragged = items.find((item) => Number(item.id) === Number(draggedId));
  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[2200px] grid-cols-8 gap-3">
        {STATUS_COLUMNS.map((column) => {
          const columnItems = items.filter((item) => item.status === column.key);
          return (
            <section
              key={column.key}
              onDragOver={(event) => canManage && event.preventDefault()}
              onDrop={() => dragged && moveStatus(dragged, column.key)}
              className="min-h-[610px] rounded-[22px] border border-slate-200 bg-slate-50/70 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">{column.label}</h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">{columnItems.length} demanda(s)</p>
                </div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-[10px] font-black text-slate-500 shadow-sm">{columnItems.length}</span>
              </div>
              <div className="space-y-2">
                {columnItems.map((item) => (
                  <article
                    key={item.id}
                    draggable={canManage && !String(busy).startsWith('status-')}
                    onDragStart={() => setDraggedId(item.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onClick={() => openItem(item.id)}
                    className={`cursor-pointer rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.blocked_reason ? 'border-amber-300' : item.high_risk ? 'border-red-200' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start gap-2">
                      {canManage && <GripVertical size={14} className="mt-1 shrink-0 text-slate-300" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
                          {item.high_risk ? <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black text-red-700">RISCO</span> : null}
                          {item.blocked_reason ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-700">BLOQUEADA</span> : null}
                        </div>
                        <h4 className="mt-2 text-sm font-bold leading-5 text-slate-900">{item.title}</h4>
                        <p className="mt-1 text-[11px] text-slate-400">{item.module || 'Sem módulo'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <span className="truncate text-[10px] font-semibold text-slate-400">{item.assignee_name || 'Sem responsável'}</span>
                      <span className="text-[10px] font-black text-slate-400">QA {qaPercent(item)}%</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Releases({ releases, readyItems, canManage, canApprove, openItem, onCreate, deployRelease, rollbackRelease, busy }) {
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Entrega</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Releases do ZebraHub</h2>
          <p className="mt-1 text-xs text-slate-500">{readyItems.length} demanda(s) aprovadas aguardando produção.</p>
        </div>
        {canManage && <button type="button" onClick={onCreate} disabled={!readyItems.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><PackageCheck size={15} /> Montar release</button>}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {!releases.length && <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-16 text-center text-sm text-slate-400 lg:col-span-2">Nenhuma release registrada ainda.</div>}
        {releases.map((release) => (
          <article key={release.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-slate-950">{release.version}</h3>
                  <ReleaseStatus status={release.status} />
                  {release.migration_required ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase text-amber-700">Migration</span> : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-600">{release.title}</p>
              </div>
              <Rocket size={19} className="text-slate-300" />
            </div>

            <div className="mt-4 space-y-2">
              {(release.items || []).map((item) => (
                <button key={item.id} type="button" onClick={() => openItem(item.id)} className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-100">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{item.title}</span>
                  <ChevronRight size={13} className="text-slate-300" />
                </button>
              ))}
            </div>

            {release.notes && <p className="mt-4 text-xs leading-5 text-slate-500">{release.notes}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="text-[10px] font-semibold text-slate-400">{release.items_count || release.items?.length || 0} demanda(s)</span>
              {release.deployed_at && <span className="text-[10px] font-semibold text-slate-400">· {dateTimeLabel(release.deployed_at)}</span>}
              <div className="ml-auto flex gap-2">
                {canApprove && release.status !== 'production' && release.status !== 'rolled_back' && (
                  <button type="button" onClick={() => deployRelease(release)} disabled={busy === `deploy-${release.id}`} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy === `deploy-${release.id}` ? 'Publicando...' : 'Confirmar deploy'}
                  </button>
                )}
                {canApprove && release.status === 'production' && (
                  <button type="button" onClick={() => rollbackRelease(release)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Registrar rollback</button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ItemDetailModal({ item, setItem, users, canManage, canQa, canApprove, busy, onClose, onSave, onMove, onToggleQa, onApprove, onRequestChanges, onArchive }) {
  const qaComplete = item.qa?.length > 0 && item.qa.every((check) => Boolean(check.checked));
  return (
    <ModalBackdrop onClose={onClose} disabled={Boolean(busy)}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${priorityClass(item.priority)}`}>{typeIcon(item.type, 19)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={item.status} />
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
              {item.high_risk ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[9px] font-black uppercase text-red-700"><ShieldAlert size={11} /> Alto risco</span> : null}
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">{item.title}</h2>
            <p className="mt-1 text-xs text-slate-400">#{item.id} · criado por {item.requester_name || '—'} · {dateTimeLabel(item.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><X size={17} /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5 p-5 sm:p-6">
            {item.high_risk ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-700"><ShieldAlert size={14} /> Mudança de alto risco</p>
                <p className="mt-1 text-xs leading-5 text-red-600">Arquivos ou áreas críticas foram identificados. Revise dependências, banco e rollback antes do deploy.</p>
              </div>
            ) : null}

            {item.rejection_notes ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-700">Ajustes solicitados por Arthur</p>
                <p className="mt-1 text-sm leading-5 text-amber-900">{item.rejection_notes}</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Título" value={item.title} disabled={!canManage} onChange={(value) => setItem({ ...item, title: value })} className="sm:col-span-2" />
              <SelectField label="Tipo" value={item.type} disabled={!canManage} onChange={(value) => setItem({ ...item, type: value })} options={TYPE_OPTIONS} />
              <SelectField label="Prioridade" value={item.priority} disabled={!canManage} onChange={(value) => setItem({ ...item, priority: value })} options={PRIORITY_OPTIONS} />
              <DatalistField label="Módulo" value={item.module || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, module: value })} />
              <SelectField label="Responsável" value={item.assignee_id || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, assignee_id: value })} options={[['', 'Não atribuído'], ...users.map((person) => [String(person.id), person.name])]} />
              <FormField label="Prazo" type="date" value={item.due_date || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, due_date: value })} />
              <SelectField label="Ambiente" value={item.environment || 'local'} disabled={!canManage} onChange={(value) => setItem({ ...item, environment: value })} options={[['local','Local'],['staging','Staging'],['production','Produção']]} />
            </div>

            <TextArea label="Problema" value={item.problem || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, problem: value })} placeholder="Qual dor estamos resolvendo?" />
            <div className="grid gap-3 lg:grid-cols-2">
              <TextArea label="Comportamento atual" value={item.current_behavior || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, current_behavior: value })} />
              <TextArea label="Comportamento esperado" value={item.expected_behavior || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, expected_behavior: value })} />
            </div>
            <TextArea label="Solução proposta" value={item.proposed_solution || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, proposed_solution: value })} />
            <TextArea label="Critérios de aceite" value={item.acceptance_criteria || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, acceptance_criteria: value })} placeholder="Como sabemos que está realmente pronto?" />

            <div className="grid gap-3 lg:grid-cols-2">
              <TextArea label="Arquivos / áreas afetados" value={item.affected_files || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, affected_files: value })} placeholder="Ex.: backend/server.js&#10;frontend/src/pages/..." />
              <TextArea label="Links / prints / referências" value={item.links_text || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, links_text: value })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Branch" value={item.branch_name || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, branch_name: value })} />
              <FormField label="Commit" value={item.commit_ref || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, commit_ref: value })} />
              <FormField label="PR / revisão" value={item.pr_url || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, pr_url: value })} />
            </div>
            <TextArea label="Resultado dos testes" value={item.testing_notes || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, testing_notes: value })} />
            <TextArea label="Bloqueio" value={item.blocked_reason || ''} disabled={!canManage} onChange={(value) => setItem({ ...item, blocked_reason: value })} placeholder="Deixe vazio quando não houver bloqueio." />

            {item.origin_url ? (
              <a href={item.origin_url} className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                <ExternalLink size={13} /> Abrir tela onde o problema foi reportado
              </a>
            ) : null}

            {canManage && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => onSave(item)} disabled={String(busy).startsWith('save-')} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save size={14} /> Salvar alterações</button>
                <button type="button" onClick={() => onArchive(item)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500"><Archive size={14} /> Arquivar</button>
              </div>
            )}
          </div>

          <aside className="space-y-5 border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Fluxo</p>
              <select value={item.status} disabled={!canManage || item.status === 'ready_production'} onChange={(event) => onMove(item, event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none disabled:opacity-60">
                {STATUS_COLUMNS.map((status) => <option key={status.key} value={status.key} disabled={status.key === 'ready_production'}>{status.label}</option>)}
              </select>
              {item.status === 'testing' && canManage && (
                <button type="button" onClick={() => onMove(item, 'awaiting_owner')} className="mt-2 w-full rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-bold text-white">Enviar para Aguardando Arthur</button>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Checklist de QA</p>
                  <p className="mt-1 text-xs font-bold text-slate-700">{item.qa_checked || item.qa?.filter((row) => row.checked).length || 0} / {item.qa_total || item.qa?.length || 0}</p>
                </div>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${qaComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><ClipboardCheck size={17} /></span>
              </div>
              <div className="mt-3 space-y-2">
                {(item.qa || []).map((check) => (
                  <label key={check.check_key} className={`flex items-start gap-2 rounded-xl px-2 py-2 ${check.checked ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <input type="checkbox" checked={Boolean(check.checked)} disabled={!canQa || String(busy).startsWith('qa-')} onChange={() => onToggleQa(item, check)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                    <span className="min-w-0">
                      <strong className={`block text-xs ${check.checked ? 'text-emerald-800' : 'text-slate-600'}`}>{check.label}</strong>
                      {check.checked_by_name ? <small className="mt-0.5 block text-[10px] text-slate-400">{check.checked_by_name}</small> : null}
                    </span>
                  </label>
                ))}
              </div>
              {!qaComplete && <p className="mt-3 text-[10px] leading-4 text-amber-700">O QA precisa estar 100% concluído para enviar à validação.</p>}
            </section>

            {item.status === 'awaiting_owner' && (
              <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">Aguardando Arthur</p>
                <p className="mt-1 text-xs leading-5 text-orange-800">Valide o que mudou e os critérios de aceite antes de liberar para produção.</p>
                {canApprove ? (
                  <div className="mt-3 grid gap-2">
                    <button type="button" onClick={() => onApprove(item)} disabled={String(busy).startsWith('approve-')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white"><Check size={14} /> Aprovar para produção</button>
                    <button type="button" onClick={() => onRequestChanges(item)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-xs font-bold text-orange-700"><XCircle size={14} /> Solicitar ajuste</button>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-orange-700">Somente o Super Administrador faz a aprovação final.</p>
                )}
              </section>
            )}

            {item.status === 'ready_production' && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-xs font-black text-emerald-700"><Rocket size={14} /> Pronto para produção</p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-700">Inclua esta demanda em uma release para registrar o deploy.</p>
              </section>
            )}

            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Histórico</p>
              <div className="mt-3 space-y-3">
                {(item.events || []).slice(0, 12).map((event) => (
                  <div key={event.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-[11px] font-semibold leading-4 text-slate-600">{event.message || event.event_type}</p>
                    <p className="mt-0.5 text-[9px] text-slate-400">{event.user_name || 'Sistema'} · {dateTimeLabel(event.created_at)}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function CreateItemModal({ form, setForm, users, busy, onClose, onSave }) {
  return (
    <ModalBackdrop onClose={onClose} disabled={busy}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Plus size={18} /></span>
          <div className="flex-1"><h2 className="font-black text-slate-950">Nova demanda de Produto</h2><p className="mt-0.5 text-xs text-slate-400">Registre primeiro o problema. A solução pode evoluir durante a análise.</p></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><X size={16} /></button>
        </div>
        <div className="max-h-[76vh] space-y-4 overflow-y-auto p-5">
          <FormField label="Título *" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Tipo" value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={TYPE_OPTIONS} />
            <SelectField label="Prioridade" value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} options={PRIORITY_OPTIONS} />
            <DatalistField label="Módulo" value={form.module} onChange={(value) => setForm({ ...form, module: value })} />
            <SelectField label="Responsável" value={form.assignee_id} onChange={(value) => setForm({ ...form, assignee_id: value })} options={[['','Não atribuído'], ...users.map((person) => [String(person.id), person.name])]} />
          </div>
          <TextArea label="Problema" value={form.problem} onChange={(value) => setForm({ ...form, problem: value })} placeholder="O que está impedindo, atrasando ou gerando retrabalho?" />
          <div className="grid gap-3 lg:grid-cols-2">
            <TextArea label="Comportamento atual" value={form.current_behavior} onChange={(value) => setForm({ ...form, current_behavior: value })} />
            <TextArea label="Comportamento esperado" value={form.expected_behavior} onChange={(value) => setForm({ ...form, expected_behavior: value })} />
          </div>
          <TextArea label="Critérios de aceite" value={form.acceptance_criteria} onChange={(value) => setForm({ ...form, acceptance_criteria: value })} />
          {form.origin_url ? <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">Origem: {form.origin_url}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
          <button type="button" onClick={() => onSave(form)} disabled={busy || !form.title.trim()} className="flex-1 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Criando...' : 'Criar demanda'}</button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function ReleaseModal({ form, setForm, items, busy, onClose, onSave }) {
  function toggleItem(id) {
    const current = form.item_ids || [];
    setForm({ ...form, item_ids: current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id] });
  }

  return (
    <ModalBackdrop onClose={onClose} disabled={busy}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><PackageCheck size={18} /></span>
          <div className="flex-1"><h2 className="font-black text-slate-950">Montar release</h2><p className="mt-0.5 text-xs text-slate-400">Agrupe apenas demandas já aprovadas para produção.</p></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><X size={16} /></button>
        </div>
        <div className="max-h-[76vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Versão *" value={form.version} onChange={(value) => setForm({ ...form, version: value })} />
            <FormField label="Título" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="Ex.: Audiovisual + correções Social Media" />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">Demandas incluídas</p>
            <div className="space-y-2 rounded-2xl border border-slate-200 p-3">
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <input type="checkbox" checked={(form.item_ids || []).includes(item.id)} onChange={() => toggleItem(item.id)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">{item.title}</strong><small className="text-[10px] text-slate-400">{item.module || 'Sem módulo'}</small></span>
                </label>
              ))}
            </div>
          </div>
          <TextArea label="Notas da release" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <TextArea label="Arquivos alterados" value={form.files_changed} onChange={(value) => setForm({ ...form, files_changed: value })} />
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
            <span><strong className="block text-xs text-slate-700">Tem migration de banco?</strong><small className="text-[10px] text-slate-400">Marque se a versão altera schema ou dados.</small></span>
            <input type="checkbox" checked={Boolean(form.migration_required)} onChange={(event) => setForm({ ...form, migration_required: event.target.checked })} className="h-4 w-4 accent-amber-600" />
          </label>
          <TextArea label="Variáveis novas / alteradas" value={form.env_vars} onChange={(value) => setForm({ ...form, env_vars: value })} placeholder="Ex.: NOVA_VARIAVEL=..." />
          <TextArea label="Plano de rollback" value={form.rollback_plan} onChange={(value) => setForm({ ...form, rollback_plan: value })} placeholder="Como voltar com segurança se algo falhar?" />
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
          <button type="button" onClick={() => onSave(form)} disabled={busy || !form.version.trim() || !(form.item_ids || []).length} className="flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Criando...' : 'Criar release'}</button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function StatusPill({ status }) {
  const info = statusInfo(status);
  const classes = {
    backlog: 'bg-slate-100 text-slate-600',
    analysis: 'bg-violet-100 text-violet-700',
    ready: 'bg-blue-100 text-blue-700',
    development: 'bg-indigo-100 text-indigo-700',
    testing: 'bg-amber-100 text-amber-700',
    awaiting_owner: 'bg-orange-100 text-orange-700',
    ready_production: 'bg-emerald-100 text-emerald-700',
    done: 'bg-green-100 text-green-700',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${classes[status] || classes.backlog}`}>{info.label}</span>;
}

function ReleaseStatus({ status }) {
  const map = {
    draft: ['Rascunho', 'bg-slate-100 text-slate-600'],
    ready: ['Pronta', 'bg-blue-100 text-blue-700'],
    production: ['Produção', 'bg-emerald-100 text-emerald-700'],
    rolled_back: ['Rollback', 'bg-red-100 text-red-700'],
  };
  const [label, classes] = map[status] || map.draft;
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${classes}`}>{label}</span>;
}

function Cell({ label, value }) {
  return <div><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-300 md:hidden">{label}</span><span className="block truncate text-xs font-semibold text-slate-500">{value}</span></div>;
}

function FormField({ label, value, onChange, disabled = false, type = 'text', placeholder = '', className = '' }) {
  return (
    <label className={`block text-xs font-bold text-slate-600 ${className}`}>
      {label}
      <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500" />
    </label>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50">
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function DatalistField({ label, value, onChange, disabled = false }) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}
      <input list="product-modules" value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50" />
      <datalist id="product-modules">{MODULE_OPTIONS.map((module) => <option key={module} value={module} />)}</datalist>
    </label>
  );
}

function TextArea({ label, value, onChange, disabled = false, placeholder = '' }) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}
      <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={4} placeholder={placeholder} className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500" />
    </label>
  );
}
