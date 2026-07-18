import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenText, BrainCircuit, CalendarDays, CheckCircle2, Circle, Clock3, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useClientFilter } from '../context/ClientFilterContext.jsx';
import PageHero from '../components/PageHero.jsx';

const EMPTY_TASK = { title: '', description: '', due_date: '', status: 'pending' };

export default function ActionPlan() {
  const { user } = useAuth();
  const { selectedClient } = useClientFilter();
  const [clients, setClients] = useState([]);
  const [localClientId, setLocalClientId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const dirtyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [editingTaskId, setEditingTaskId] = useState(null);

  const clientId = user?.role === 'client'
    ? Number(user.client_id)
    : Number(localClientId || selectedClient?.id) || null;

  useEffect(() => {
    api.get('/clients').then(({ data }) => {
      const next = data.clients || [];
      setClients(next);
      if (user?.role === 'client' && next[0]) setLocalClientId(String(next[0].id));
      else if (selectedClient?.id) setLocalClientId(String(selectedClient.id));
      else if (next.length === 1) setLocalClientId(String(next[0].id));
    }).catch(() => setClients([]));
  }, [user?.role, user?.client_id, selectedClient?.id]);

  const loadPlan = useCallback(async () => {
    if (!clientId) {
      setPlan(null);
      setTasks([]);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { data } = await api.get('/action-plans', { params: { client_id: clientId, year } });
      dirtyRef.current = false;
      setSaveState('idle');
      setPlan(data.plan);
      setTasks(data.tasks || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Não foi possível abrir o Plano de Ação.');
    } finally {
      setLoading(false);
    }
  }, [clientId, year]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  function updatePlan(field, value) {
    dirtyRef.current = true;
    setSaveState('pending');
    setPlan((current) => ({ ...(current || {}), [field]: value }));
  }

  const savePlan = useCallback(async (planToSave) => {
    if (!clientId || !planToSave) return;
    setSaving(true);
    setSaveState('saving');
    setMessage('');
    try {
      const { data } = await api.put('/action-plans', { ...planToSave, client_id: clientId, year });
      dirtyRef.current = false;
      setPlan(data.plan);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setMessage(error.response?.data?.error || 'Não foi possível salvar automaticamente.');
    } finally {
      setSaving(false);
    }
  }, [clientId, year]);

  useEffect(() => {
    if (!plan || !clientId || !dirtyRef.current) return undefined;
    const timer = window.setTimeout(() => savePlan(plan), 900);
    return () => window.clearTimeout(timer);
  }, [plan, clientId, savePlan]);

  async function saveTask(event) {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    try {
      const payload = { ...taskForm, client_id: clientId, year };
      const { data } = editingTaskId
        ? await api.put(`/action-plans/tasks/${editingTaskId}`, payload)
        : await api.post('/action-plans/tasks', payload);
      setTasks((current) => editingTaskId
        ? current.map((item) => item.id === editingTaskId ? data.task : item)
        : [...current, data.task]);
      setTaskForm(EMPTY_TASK);
      setEditingTaskId(null);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Não foi possível salvar a tarefa.');
    }
  }

  function editTask(task) {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title || '', description: task.description || '',
      due_date: task.due_date?.slice(0, 10) || '', status: task.status || 'pending'
    });
  }

  async function changeTaskStatus(task, status) {
    const { data } = await api.put(`/action-plans/tasks/${task.id}`, { status });
    setTasks((current) => current.map((item) => item.id === task.id ? data.task : item));
  }

  async function deleteTask(id) {
    await api.delete(`/action-plans/tasks/${id}`);
    setTasks((current) => current.filter((item) => item.id !== id));
    if (editingTaskId === id) { setEditingTaskId(null); setTaskForm(EMPTY_TASK); }
  }

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PageHero
          icon={Target}
          eyebrow="Estratégia anual"
          title="Plano de Ação"
          description="Transforme diagnóstico, propósito e prioridades em uma direção prática para o ano."
        />
        <div className="surface-card mx-auto max-w-xl p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="icon-tile bg-[#eef5ff] text-[#0969ff]"><Target size={19} /></span>
            <div>
              <h2 className="section-title">Escolha um cliente</h2>
              <p className="mt-0.5 text-sm text-slate-500">Cada conta possui um plano estratégico independente.</p>
            </div>
          </div>
          <select className="input-field" value={localClientId} onChange={(e) => setLocalClientId(e.target.value)}>
            <option value="">Selecione...</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={Target}
        eyebrow={clients.find((client) => client.id === clientId)?.name || 'Estratégia anual'}
        title="Plano de Ação"
        description="Conecte objetivo, manifesto, diagnóstico e execução em uma visão única para o ano."
        actions={
          <>
            {user?.role !== 'client' && clients.length > 1 && (
              <select className="min-w-[210px] rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-medium text-white outline-none" value={String(clientId)} onChange={(e) => setLocalClientId(e.target.value)}>
                {clients.map((client) => <option className="text-slate-800" key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm text-white/80">
              <CalendarDays size={16} />
              <input type="number" min="2020" max="2100" className="w-20 bg-transparent font-semibold text-white outline-none" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </label>
          </>
        }
      >
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${saveState === 'error' ? 'bg-red-400' : saving || saveState === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          <span className="text-white/55">
            {saving || saveState === 'saving' ? 'Salvando automaticamente...' : saveState === 'saved' ? 'Alterações salvas' : saveState === 'error' ? 'Erro ao salvar' : 'Salvamento automático ativo'}
          </span>
        </div>
      </PageHero>

      {message && <div className="rounded-lg bg-slate-100 text-slate-700 px-4 py-3 text-sm">{message}</div>}
      {loading || !plan ? <p className="text-slate-400">Carregando...</p> : (
        <>
          <section className="surface-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5"><span className="icon-tile bg-[#eef5ff] text-[#0969ff]"><Target size={19} /></span><div><p className="section-kicker">Direção central</p><h2 className="section-title">Objetivo do ano</h2></div></div>
            <div className="p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <TextBlock number="01" label="O que queremos?" value={plan.what_we_want} onChange={(v) => updatePlan('what_we_want', v)} placeholder="Descreva o resultado principal que a marca ou empresa quer alcançar neste ano." />
              <TextBlock number="02" label="Para que queremos?" value={plan.why_we_want} onChange={(v) => updatePlan('why_we_want', v)} placeholder="Explique o motivo, o impacto e a transformação esperada." />
              <TextBlock number="03" label="Como faremos?" value={plan.how_we_will_do} onChange={(v) => updatePlan('how_we_will_do', v)} placeholder="Registre as grandes frentes, métodos e caminhos para chegar ao objetivo." />
            </div>
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-6">
            <div className="surface-card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5"><span className="icon-tile bg-violet-50 text-violet-600"><BookOpenText size={18} /></span><div><p className="section-kicker">Identidade</p><h2 className="section-title">Manifesto</h2></div></div>
              <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">Espaço para registrar a visão, a crença central e o compromisso que orientam o plano.</p>
              <textarea className="input-field min-h-[250px] resize-y bg-slate-50/60" value={plan.manifesto || ''} onChange={(e) => updatePlan('manifesto', e.target.value)} placeholder="Escreva o manifesto aqui..." />
              </div>
            </div>
            <div className="surface-card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5"><span className="icon-tile bg-amber-50 text-amber-600"><BrainCircuit size={18} /></span><div><p className="section-kicker">Leitura estratégica</p><h2 className="section-title">Diagnóstico Personalizado</h2></div></div>
              <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">Área aberta para análises, oportunidades, desafios, forças, riscos e recomendações.</p>
              <textarea className="input-field min-h-[250px] resize-y bg-slate-50/60" value={plan.diagnosis || ''} onChange={(e) => updatePlan('diagnosis', e.target.value)} placeholder="Preencha o diagnóstico personalizado..." />
              </div>
            </div>
          </section>

          <section className="surface-card p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div><h2 className="font-semibold text-slate-800">Tarefas do Plano de Ação</h2><p className="text-sm text-slate-500">Lista independente das tarefas do cronograma.</p></div>
            </div>
            <form onSubmit={saveTask} className="grid items-end gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 mb-5 lg:grid-cols-[1.2fr_1.8fr_160px_150px_auto]">
              <Field label="Tarefa"><input className="input-field" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Ex: Revisar posicionamento" /></Field>
              <Field label="Descrição"><input className="input-field" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Detalhes da ação" /></Field>
              <Field label="Prazo"><input type="date" className="input-field" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} /></Field>
              <Field label="Status"><select className="input-field" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="done">Concluída</option></select></Field>
              <button className="btn-primary h-[42px] flex items-center gap-1.5 justify-center"><Plus size={16} /> {editingTaskId ? 'Salvar' : 'Adicionar'}</button>
            </form>
            <div className="space-y-2">
              {tasks.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Nenhuma tarefa adicionada ao plano.</p>}
              {tasks.map((task) => (
                <div key={task.id} className="data-row flex items-center gap-3 px-4 py-3">
                  <button onClick={() => changeTaskStatus(task, task.status === 'done' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'done')}>
                    {task.status === 'done' ? <CheckCircle2 className="text-emerald-500" size={20} /> : task.status === 'in_progress' ? <Clock3 className="text-amber-500" size={20} /> : <Circle className="text-slate-300" size={20} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={'font-medium text-sm ' + (task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800')}>{task.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{task.description || 'Sem descrição'}{task.due_date ? ` · ${new Date(task.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}</p>
                  </div>
                  <button onClick={() => editTask(task)} className="text-slate-400 hover:text-zebrazul-600"><Pencil size={16} /></button>
                  <button onClick={() => deleteTask(task.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TextBlock({ number, label, value, onChange, placeholder }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/65 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-[#0969ff] shadow-sm">{number}</span>
        <label className="text-sm font-semibold text-slate-800">{label}</label>
      </div>
      <textarea className="input-field min-h-[170px] resize-y border-0 bg-white shadow-sm" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Field({ label, children }) { return <div><label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>{children}</div>; }
