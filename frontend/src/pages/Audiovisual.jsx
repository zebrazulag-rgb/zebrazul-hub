import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Unlink,
  Users,
  Video,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../api';
import ModalBackdrop from '../components/ModalBackdrop.jsx';
import TopbarPortal from '../components/TopbarPortal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const VIDEO_COLUMNS = [
  { key: 'recorded', label: 'Gravado', description: 'Saiu da captação' },
  { key: 'editing', label: 'Em edição', description: 'Na mão do editor' },
  { key: 'approved', label: 'Aprovado', description: 'Vídeo final aprovado' },
  { key: 'dated', label: 'Datado', description: 'Enviado para a grade' },
  { key: 'scheduled', label: 'Agendado', description: 'Programado para publicar' },
  { key: 'posted', label: 'Postado', description: 'Publicado' },
];

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  other: 'Outro',
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function localDateTimeInput(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  const text = String(value);
  const source = text.includes('T') ? text : `${text}T12:00:00`;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(options.year ? { year: 'numeric' } : {}),
    ...(options.time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function formatMonthLabel(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return 'Mês';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

function linksFromText(value) {
  return String(value || '').split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
}

function isManagedVideo(value) {
  return typeof value === 'string' && value.includes('/api/media/');
}

function monthProgress(recorded, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(recorded || 0) / Number(total)) * 100)));
}

function urgencyTone(client) {
  if (client.days_without_recording == null) return 'red';
  if (client.days_without_recording >= 21) return 'red';
  if (client.days_without_recording >= 14) return 'amber';
  return 'green';
}

function daysLabel(client) {
  if (client.days_without_recording == null) return 'Nunca gravado';
  if (client.days_without_recording === 0) return 'Gravou hoje';
  return `${client.days_without_recording} dias sem gravar`;
}

function StatusPill({ status }) {
  const map = {
    scheduled: ['Agendada', 'bg-blue-50 text-blue-700'],
    recorded: ['Concluída', 'bg-emerald-50 text-emerald-700'],
    cancelled: ['Cancelada', 'bg-slate-100 text-slate-500'],
  };
  const [label, className] = map[status] || [status, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>{label}</span>;
}

export default function Audiovisual() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  // Filtro próprio do Audiovisual. Ele começa em "todos" e não herda
  // o cliente global selecionado no topo do ZebraHub.
  const [operationalClientId, setOperationalClientId] = useState('');
  const [referenceMonth, setReferenceMonth] = useState(currentMonth());
  const [dashboard, setDashboard] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [videos, setVideos] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draggedVideoId, setDraggedVideoId] = useState(null);
  const [recordingModal, setRecordingModal] = useState(null);
  const [historicalModal, setHistoricalModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [settingsModal, setSettingsModal] = useState(null);
  const [clientSelectionModal, setClientSelectionModal] = useState(null);
  const [clientCatalog, setClientCatalog] = useState([]);
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission(user, 'audiovisual.manage');
  const canEdit = canManage || hasPermission(user, 'audiovisual.edit');
  const canPublish = canManage || hasPermission(user, 'audiovisual.publish');
  const canCalendar = hasPermission(user, 'audiovisual.calendar');

  // O painel executivo é SEMPRE geral para todos os clientes marcados como
  // "clientes de gravação". O seletor global de cliente serve apenas para
  // detalhar a operação (Agenda e Produção), sem distorcer os KPIs principais.
  const dashboardParams = useMemo(() => ({
    month: referenceMonth,
  }), [referenceMonth]);

  const operationalParams = useMemo(() => ({
    month: referenceMonth,
    ...(operationalClientId ? { client_id: operationalClientId } : {}),
  }), [referenceMonth, operationalClientId]);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [dashboardRes, recordingsRes, videosRes, calendarRes, clientSelectionRes] = await Promise.all([
        api.get('/audiovisual/dashboard', { params: dashboardParams }),
        api.get('/audiovisual/recordings', { params: operationalParams }),
        api.get('/audiovisual/videos', { params: operationalClientId ? { client_id: operationalClientId } : {} }),
        // O Google Agenda é opcional. Uma falha nessa integração não pode
        // derrubar toda a tela de Produção/Audiovisual.
        api.get('/google-calendar-oauth/status').catch(() => ({ data: null })),
        api.get('/audiovisual/client-selection'),
      ]);
      setDashboard(dashboardRes.data);
      setRecordings(recordingsRes.data?.recordings || []);
      setVideos(videosRes.data?.videos || []);
      setCalendarStatus(calendarRes.data || null);
      setClientCatalog(clientSelectionRes.data?.clients || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar a operação audiovisual.');
    } finally {
      setLoading(false);
    }
  }, [dashboardParams, operationalParams, operationalClientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function handleMessage(event) {
      if (event.data?.type !== 'zebrahub-google-calendar-oauth') return;
      if (event.data.ok) setNotice('Google Agenda conectado. As próximas gravações serão sincronizadas.');
      else setError(event.data.message || 'Não foi possível conectar o Google Agenda.');
      loadData({ quiet: true });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function connectCalendar() {
    setError('');
    try {
      const { data } = await api.post('/google-calendar-oauth/start', { origin: window.location.origin });
      const popup = window.open(data.authorization_url, 'zebrahub-google-calendar', 'width=620,height=760,resizable=yes,scrollbars=yes');
      if (!popup) setError('O navegador bloqueou a janela de conexão. Libere pop-ups para o ZebraHub e tente novamente.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível iniciar a conexão com o Google Agenda.');
    }
  }

  async function disconnectCalendar() {
    if (!window.confirm('Desconectar o Google Agenda desta operação audiovisual?')) return;
    try {
      await api.delete('/google-calendar-oauth/connection');
      setNotice('Google Agenda desconectado.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível desconectar.');
    }
  }

  async function saveRecording(form) {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      const { data } = form.id
        ? await api.put(`/audiovisual/recordings/${form.id}`, payload)
        : await api.post('/audiovisual/recordings', payload);
      setRecordingModal(null);
      setNotice(data.calendar_warning ? `Gravação salva. Google Agenda: ${data.calendar_warning}` : 'Gravação salva e operação atualizada.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar a gravação.');
    } finally {
      setSaving(false);
    }
  }


  async function saveHistoricalRecording(form) {
    const videoCount = Number(form.video_count || 0);
    const postedCount = Number(form.posted_count || 0);
    const editedCount = Number(form.edited_count || 0);
    const editedLinks = linksFromText(form.edited_links_text);

    if (videoCount < 1) {
      setError('Informe quantos vídeos foram gravados.');
      return;
    }
    if (postedCount + editedCount > videoCount) {
      setError('Postados + editados não pode ser maior que o total de vídeos gravados.');
      return;
    }
    if (postedCount > 0 && !form.last_posted_date) {
      setError('Informe a data do último vídeo postado para o cálculo das próximas datas.');
      return;
    }
    if (editedCount > 0 && editedLinks.length < editedCount) {
      setError(`Adicione ${editedCount} link(s) final(is), um para cada vídeo informado como editado.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/audiovisual/recordings/historical', {
        client_id: form.client_id,
        recorded_date: form.recorded_date,
        video_count: videoCount,
        posted_count: postedCount,
        edited_count: editedCount,
        last_posted_date: form.last_posted_date || null,
        raw_links: linksFromText(form.raw_links_text),
        edited_links: editedLinks,
        responsible_name: form.responsible_name,
        location: form.location,
        notes: form.notes,
      });
      setHistoricalModal(null);
      setNotice(`Gravação histórica registrada. ${data.stock_created || 0} vídeo(s) entraram na gaveta.`);
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível registrar a gravação realizada.');
    } finally {
      setSaving(false);
    }
  }

  async function completeRecording(form) {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/audiovisual/recordings/${form.id}/complete`, {
        video_count: form.video_count,
        raw_links: linksFromText(form.raw_links_text),
        recorded_date: form.recorded_date,
      });
      setCompleteModal(null);
      setNotice(data.calendar_warning ? `Gravação concluída. Google Agenda: ${data.calendar_warning}` : `${form.video_count} vídeo(s) criados na produção.`);
      await loadData({ quiet: true });
      setTab('production');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível concluir a gravação.');
    } finally {
      setSaving(false);
    }
  }

  async function setVideoStatus(video, status) {
    if (!video || video.status === status) return;
    if (status === 'approved') {
      setEditModal({
        id: video.id,
        title: video.title,
        final_links_text: (video.final_links || []).filter((link) => !isManagedVideo(link)).join('\n'),
        final_file: null,
        edit_notes: video.edit_notes || '',
      });
      return;
    }
    if (status === 'dated') {
      const tomorrow = new Date(Date.now() + 86400000);
      const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduleModal({ id: video.id, title: video.title, scheduled_at: local, platform: 'instagram' });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/audiovisual/videos/${video.id}/status`, { status });
      setNotice(status === 'posted' ? 'Vídeo marcado como postado.' : 'Etapa atualizada.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível alterar a etapa.');
    } finally {
      setSaving(false);
      setDraggedVideoId(null);
    }
  }

  async function finishEditing(form) {
    const finalLinks = linksFromText(form.final_links_text);
    if (!form.final_file && !finalLinks.length) {
      setError('Envie o vídeo final diretamente ou informe pelo menos um link do Drive.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (form.final_file) {
        const payload = new FormData();
        payload.append('file', form.final_file);
        payload.append('edit_notes', form.edit_notes || '');
        payload.append('final_links_text', form.final_links_text || '');
        await api.post(`/audiovisual/videos/${form.id}/final-upload`, payload);
      } else {
        await api.put(`/audiovisual/videos/${form.id}/status`, {
          status: 'approved',
          final_links: finalLinks,
          edit_notes: form.edit_notes,
        });
      }
      setEditModal(null);
      setNotice(form.final_file ? 'Vídeo enviado, salvo e aprovado.' : 'Link do vídeo final registrado e aprovado.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível concluir a edição.');
    } finally {
      setSaving(false);
    }
  }

  async function scheduleVideo(form) {
    setSaving(true);
    try {
      await api.post(`/audiovisual/videos/${form.id}/schedules`, {
        scheduled_at: form.scheduled_at,
        platform: form.platform,
      });
      setScheduleModal(null);
      setNotice('Vídeo datado e enviado para a grade.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível agendar o vídeo.');
    } finally {
      setSaving(false);
      setDraggedVideoId(null);
    }
  }

  async function deleteSchedule(videoId, scheduleId) {
    try {
      await api.delete(`/audiovisual/videos/${videoId}/schedules/${scheduleId}`);
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível remover o agendamento.');
    }
  }

  async function saveClientSettings(form) {
    setSaving(true);
    try {
      await api.put(`/audiovisual/clients/${form.client_id}/settings`, {
        videos_per_period: form.videos_per_period,
        cadence_period: form.cadence_period,
        recording_lead_days: form.recording_lead_days,
      });
      setSettingsModal(null);
      setNotice('Cadência audiovisual atualizada.');
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível salvar a cadência.');
    } finally {
      setSaving(false);
    }
  }

  function openClientSelection() {
    setClientSelectionModal({
      selected_ids: clientCatalog
        .filter((client) => client.is_recording_client)
        .map((client) => Number(client.id)),
    });
  }

  async function saveClientSelection(form) {
    setSaving(true);
    setError('');
    try {
      const selectedIds = (form.selected_ids || []).map(Number).filter(Boolean);
      await api.put('/audiovisual/client-selection', { client_ids: selectedIds });
      setClientSelectionModal(null);

      if (operationalClientId && !selectedIds.includes(Number(operationalClientId))) {
        setOperationalClientId('');
      }

      setNotice(`${selectedIds.length} cliente(s) definido(s) como clientes de gravação.`);
      await loadData({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar os clientes de gravação.');
    } finally {
      setSaving(false);
    }
  }

  function openNewRecording(clientId = null) {
    if (!clientId && !(dashboard?.clients || []).length) {
      setError('Selecione pelo menos um cliente de gravação antes de marcar uma nova gravação.');
      openClientSelection();
      return;
    }

    const now = new Date(Date.now() + 86400000);
    now.setHours(9, 0, 0, 0);
    const start = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const endDate = new Date(now.getTime() + 60 * 60000);
    const end = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setRecordingModal({
      id: null,
      client_id: clientId || operationalClientId || dashboard?.clients?.[0]?.id || '',
      title: '',
      scheduled_start: start,
      scheduled_end: end,
      location: '',
      responsible_name: '',
      notes: '',
    });
  }


  function openHistoricalRecording(clientId = null) {
    if (!clientId && !(dashboard?.clients || []).length) {
      setError('Selecione pelo menos um cliente de gravação antes de registrar o histórico.');
      openClientSelection();
      return;
    }
    const today = localDateTimeInput(new Date()).slice(0, 10);
    setHistoricalModal({
      client_id: clientId || operationalClientId || dashboard?.clients?.[0]?.id || '',
      recorded_date: today,
      video_count: '',
      posted_count: '0',
      edited_count: '0',
      last_posted_date: '',
      raw_links_text: '',
      edited_links_text: '',
      responsible_name: '',
      location: '',
      notes: '',
    });
  }

  function openComplete(recording) {
    setCompleteModal({
      id: recording.id,
      client_name: recording.client_name,
      video_count: recording.video_count || '',
      raw_links_text: (recording.raw_links || []).join('\n'),
      recorded_date: String(recording.scheduled_start || '').slice(0, 10),
    });
  }

  function openSettings(client) {
    setSettingsModal({
      client_id: client.id,
      client_name: client.name,
      videos_per_period: client.settings?.videos_per_period || 2,
      cadence_period: client.settings?.cadence_period || 'week',
      recording_lead_days: client.settings?.recording_lead_days ?? 7,
    });
  }

  const stats = dashboard?.stats || {};
  const scheduledProgress = monthProgress(stats.clients_scheduled_month, stats.clients_total);
  const recordedProgress = monthProgress(stats.clients_recorded_month, stats.clients_total);
  const clientsNotScheduledThisMonth = Math.max(0, Number(stats.clients_total || 0) - Number(stats.clients_scheduled_month || 0));
  const clientsMissingThisMonth = Math.max(0, Number(stats.clients_total || 0) - Number(stats.clients_recorded_month || 0));
  const currentDraggedVideo = videos.find((video) => Number(video.id) === Number(draggedVideoId));
  const recordingClientCount = clientCatalog.filter((client) => client.is_recording_client).length;
  const operationalClient = operationalClientId
    ? clientCatalog.find((client) => Number(client.id) === Number(operationalClientId))
    : null;

  const tabs = [
    ['overview', 'Painel'],
    ['agenda', 'Agenda'],
    ['production', 'Produção'],
    ['clients', 'Clientes'],
  ];

  if (loading && !dashboard) {
    return <div className="flex min-h-[55vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando Audiovisual...</div>;
  }

  return (
    <div className="space-y-4 pb-10">
      <TopbarPortal>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${tab === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => loadData({ quiet: true })} title="Atualizar" aria-label="Atualizar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50">
            <RefreshCw size={14} />
          </button>
          {canManage && (
            <button type="button" onClick={() => openHistoricalRecording()} title="Registrar gravação realizada" aria-label="Registrar gravação realizada" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0969ff] text-white shadow-sm transition hover:bg-blue-700">
              <Clock3 size={15} />
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => openNewRecording()} title="Nova gravação" aria-label="Nova gravação" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0969ff] text-white shadow-sm transition hover:bg-blue-700">
              <Plus size={16} />
            </button>
          )}
        </div>
      </TopbarPortal>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`min-w-max rounded-lg px-3 py-2 text-[11px] font-semibold transition ${tab === key ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-500'}`}>{label}</button>
        ))}
        <button type="button" onClick={() => loadData({ quiet: true })} className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500"><RefreshCw size={14} /></button>
        {canManage && <button type="button" onClick={() => openNewRecording()} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0969ff] text-white"><Plus size={15} /></button>}
      </div>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 shrink-0" size={16} /> <span>{error}</span><button onClick={() => setError('')} className="ml-auto"><X size={15} /></button></div>}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>}

      {operationalClient && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <strong>Filtro da operação:</strong>
          <span>{operationalClient.name}</span>
          <button type="button" onClick={() => setOperationalClientId('')} className="ml-auto rounded-lg bg-white px-2.5 py-1.5 font-bold text-blue-700 shadow-sm">Mostrar todos</button>
        </div>
      )}

      {clientCatalog.length > 0 && recordingClientCount === 0 && (
        <section className="rounded-[26px] border border-dashed border-blue-300 bg-blue-50/60 px-6 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm"><Users size={22} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">Escolha os clientes que realmente têm gravação</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Somente os clientes selecionados entrarão no KPI “clientes gravados no mês”, no ranking de dias sem gravar e nas sugestões de próxima gravação.</p>
          {canManage && <button type="button" onClick={openClientSelection} className="mt-4 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white">Selecionar clientes de gravação</button>}
        </section>
      )}

      {tab === 'overview' && (
        <OverviewTab
          dashboard={dashboard}
          stats={stats}
          scheduledProgress={scheduledProgress}
          recordedProgress={recordedProgress}
          clientsNotScheduled={clientsNotScheduledThisMonth}
          clientsMissing={clientsMissingThisMonth}
          referenceMonth={referenceMonth}
          canManage={canManage}
          openNewRecording={openNewRecording}
          openComplete={openComplete}
          openHistoricalRecording={openHistoricalRecording}
          setTab={setTab}
        />
      )}

      {tab === 'agenda' && (
        <AgendaTab
          recordings={recordings}
          calendarStatus={calendarStatus}
          canManage={canManage}
          canCalendar={canCalendar}
          connectCalendar={connectCalendar}
          disconnectCalendar={disconnectCalendar}
          openNewRecording={openNewRecording}
          openHistoricalRecording={openHistoricalRecording}
          openComplete={openComplete}
          onDelete={async (recording) => {
            if (!window.confirm(`Excluir a gravação de ${recording.client_name}?`)) return;
            try {
              await api.delete(`/audiovisual/recordings/${recording.id}`);
              setNotice('Gravação excluída.');
              await loadData({ quiet: true });
            } catch (requestError) {
              setError(requestError.response?.data?.error || 'Não foi possível excluir a gravação.');
            }
          }}
        />
      )}

      {tab === 'production' && (
        <ProductionTab
          videos={videos}
          canEdit={canEdit}
          canPublish={canPublish}
          draggedVideoId={draggedVideoId}
          setDraggedVideoId={setDraggedVideoId}
          currentDraggedVideo={currentDraggedVideo}
          setVideoStatus={setVideoStatus}
          setScheduleModal={setScheduleModal}
          deleteSchedule={deleteSchedule}
        />
      )}

      {tab === 'clients' && (
        <ClientsTab
          clients={dashboard?.clients || []}
          referenceMonth={referenceMonth}
          canManage={canManage}
          openSettings={openSettings}
          openNewRecording={openNewRecording}
          openHistoricalRecording={openHistoricalRecording}
          openClientSelection={openClientSelection}
        />
      )}

      {recordingModal && (
        <RecordingModal
          form={recordingModal}
          setForm={setRecordingModal}
          clients={dashboard?.clients || []}
          saving={saving}
          onClose={() => setRecordingModal(null)}
          onSave={saveRecording}
        />
      )}

      {historicalModal && (
        <HistoricalRecordingModal
          form={historicalModal}
          setForm={setHistoricalModal}
          clients={dashboard?.clients || []}
          saving={saving}
          onClose={() => setHistoricalModal(null)}
          onSave={saveHistoricalRecording}
        />
      )}

      {completeModal && (
        <CompleteRecordingModal form={completeModal} setForm={setCompleteModal} saving={saving} onClose={() => setCompleteModal(null)} onSave={completeRecording} />
      )}

      {editModal && (
        <EditCompleteModal form={editModal} setForm={setEditModal} saving={saving} onClose={() => setEditModal(null)} onSave={finishEditing} />
      )}

      {scheduleModal && (
        <ScheduleModal form={scheduleModal} setForm={setScheduleModal} saving={saving} onClose={() => setScheduleModal(null)} onSave={scheduleVideo} />
      )}

      {settingsModal && (
        <SettingsModal form={settingsModal} setForm={setSettingsModal} saving={saving} onClose={() => setSettingsModal(null)} onSave={saveClientSettings} />
      )}

      {clientSelectionModal && (
        <ClientSelectionModal
          form={clientSelectionModal}
          setForm={setClientSelectionModal}
          clients={clientCatalog}
          saving={saving}
          onClose={() => setClientSelectionModal(null)}
          onSave={saveClientSelection}
        />
      )}
    </div>
  );
}

function OverviewTab({ dashboard, stats, scheduledProgress, recordedProgress, clientsNotScheduled, clientsMissing, referenceMonth, canManage, openNewRecording, openComplete, openHistoricalRecording, setTab }) {
  const clients = dashboard?.clients || [];
  const priorityClients = [...clients].sort((a, b) => {
    const stage = (client) => {
      if (client.recorded_in_reference_month) return 2;
      if (client.scheduled_in_reference_month) return 1;
      return 0;
    };

    const stageDifference = stage(a) - stage(b);
    if (stageDifference !== 0) return stageDifference;

    const aDays = a.days_without_recording == null ? Number.MAX_SAFE_INTEGER : Number(a.days_without_recording || 0);
    const bDays = b.days_without_recording == null ? Number.MAX_SAFE_INTEGER : Number(b.days_without_recording || 0);
    if (aDays !== bDays) return bDays - aDays;

    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
  const overdue = dashboard?.overdue_recordings || [];
  const monthLabel = formatMonthLabel(referenceMonth);
  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <section className="overflow-hidden rounded-[24px] border border-amber-300 bg-amber-50 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-amber-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700"><Clock3 size={14} /> Gravação passada ainda aberta</div>
              <h2 className="mt-1 text-base font-bold text-slate-950">{overdue.length} gravação(ões) precisam ser encerradas</h2>

            </div>
            <button type="button" onClick={() => setTab('agenda')} title="Abrir agenda" aria-label="Abrir agenda" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-800 hover:bg-amber-100"><ChevronRight size={16} /></button>
          </div>
          <div className="grid gap-2 p-3 lg:grid-cols-2">
            {overdue.slice(0, 6).map((recording) => (
              <div key={recording.id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{recording.client_name}</p>
                  <p className="mt-1 text-xs text-slate-500">Marcada para {formatDate(recording.scheduled_start, { year: true })} · <strong className="text-amber-700">{recording.overdue_days || 1}d pendente</strong></p>
                </div>
                {canManage && <button type="button" onClick={() => openComplete(recording)} title="Concluir gravação" aria-label="Concluir gravação" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white hover:bg-amber-700"><Check size={17} strokeWidth={2.5} /></button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="overflow-hidden rounded-[26px] border border-red-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-red-100 bg-red-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-red-600"><AlertTriangle size={14} /> Resolver primeiro</div>
              <h2 className="mt-1 text-lg font-bold text-slate-950">Fila de gravações por prioridade</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Sem gravação marcada</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Gravação marcada</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Gravado no mês</span>
              </div>
            </div>
            <button type="button" onClick={() => setTab('clients')} className="text-xs font-bold text-red-700 hover:text-red-900">Ver todos <ChevronRight className="inline" size={14} /></button>
          </div>
          <div className="max-h-[650px] divide-y divide-slate-100 overflow-y-auto">
            {priorityClients.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Nenhum cliente disponível nesta visão.</p>}
            {priorityClients.map((client, index) => {
              const tone = urgencyTone(client);
              const scheduled = Boolean(client.scheduled_in_reference_month);
              const recorded = Boolean(client.recorded_in_reference_month);
              const rowClass = recorded
                ? 'bg-emerald-50/55'
                : scheduled
                  ? 'bg-amber-50/75'
                  : 'bg-white';

              return (
                <div key={client.id} className={`flex flex-col gap-3 px-5 py-3.5 transition sm:flex-row sm:items-center ${rowClass}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                      recorded
                        ? 'bg-emerald-500 text-white'
                        : scheduled
                          ? 'bg-amber-400 text-amber-950'
                          : index === 0
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                    }`}>{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{client.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">Última: {client.last_recorded_at ? formatDate(client.last_recorded_at, { year: true }) : 'sem histórico'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:w-[360px] sm:justify-end">
                    {!scheduled && !recorded && (
                      <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{daysLabel(client)}</span>
                    )}
                    {canManage && client.days_without_recording == null && !scheduled && !recorded && (
                      <button type="button" onClick={() => openHistoricalRecording(client.id)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50">Registrar antiga</button>
                    )}

                    {canManage && !scheduled && !recorded && (
                      <button type="button" onClick={() => openNewRecording(client.id)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Marcar</button>
                    )}

                    {canManage && scheduled && !recorded && (
                      <button type="button" onClick={() => setTab('agenda')} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-50">Ver agenda</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-3">
          <section className="relative overflow-hidden rounded-[26px] bg-blue-600 p-5 text-white shadow-sm">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-100">Etapa 1 · Planejamento · {monthLabel}</p>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white/80">Primeiro passo</span>
              </div>
              <h2 className="mt-2 text-sm font-semibold text-white/75">Clientes com gravação agendada</h2>
              <div className="mt-2 flex items-end gap-2">
                <strong className="text-5xl font-black tracking-tight sm:text-6xl">{stats.clients_scheduled_month || 0}</strong>
                <span className="pb-1.5 text-lg font-bold text-white/45">/ {stats.clients_total || 0}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${scheduledProgress}%` }} />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-black text-white">{scheduledProgress}% agendados</span>
                <span className={clientsNotScheduled ? 'font-bold text-blue-100' : 'font-bold text-emerald-100'}>
                  {clientsNotScheduled ? `${clientsNotScheduled} ainda precisam ser marcados` : 'Toda a carteira já está marcada ✓'}
                </span>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[26px] bg-slate-950 p-5 text-white shadow-sm">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Etapa 2 · Execução · {monthLabel}</p>
              <h2 className="mt-2 text-sm font-semibold text-white/65">Clientes gravados no mês</h2>
              <div className="mt-2 flex items-end gap-2">
                <strong className="text-5xl font-black tracking-tight sm:text-6xl">{stats.clients_recorded_month || 0}</strong>
                <span className="pb-1.5 text-lg font-bold text-white/35">/ {stats.clients_total || 0}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${recordedProgress}%` }} />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-black text-blue-300">{recordedProgress}% gravados</span>
                <span className={clientsMissing ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>
                  {clientsMissing ? `${clientsMissing} ainda não gravado(s)` : 'Todos gravados ✓'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric icon={Clapperboard} label="Vídeos na gaveta" value={clients.reduce((sum, client) => sum + Number(client.unposted_videos || 0), 0)} />
        <Metric icon={CalendarDays} label="Marcadas no mês" value={stats.recordings_scheduled_month || 0} />
        <Metric icon={CheckCircle2} label="Concluídas" value={stats.recordings_completed_month || 0} />
        <Metric icon={Video} label="Vídeos gravados" value={stats.videos_recorded_month || 0} />
        <Metric icon={Film} label="Em edição" value={stats.editing || 0} />
        <Metric icon={Check} label="Aprovados" value={stats.edited_waiting_schedule || 0} />
        <Metric icon={Sparkles} label="Postados no mês" value={stats.posted_month || 0} />
        <Metric icon={Clapperboard} label="Gravações totais" value={stats.recordings_total || 0} />
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Próximos compromissos</p><h2 className="mt-1 font-bold text-slate-900">Gravações já marcadas</h2></div>
          <button type="button" onClick={() => setTab('agenda')} className="text-xs font-bold text-blue-600">Abrir agenda</button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {(dashboard?.upcoming_recordings || []).slice(0, 6).map((recording) => (
            <div key={recording.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-bold text-blue-600">{formatDate(recording.scheduled_start, { time: true })}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{recording.client_name}</p>
              <p className="mt-1 text-xs text-slate-400">{recording.responsible_name || 'Responsável não definido'}</p>
            </div>
          ))}
          {!(dashboard?.upcoming_recordings || []).length && <p className="col-span-full rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">Nenhuma gravação futura marcada.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><Icon size={15} /></div>
      <strong className="mt-3 block text-2xl font-black tracking-tight text-slate-950">{value}</strong>
      <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-400">{label}</span>
    </div>
  );
}

function AgendaTab({ recordings, calendarStatus, canManage, canCalendar, connectCalendar, disconnectCalendar, openNewRecording, openHistoricalRecording, openComplete, onDelete }) {
  const connected = Boolean(calendarStatus?.connection?.connected);
  const configured = Boolean(calendarStatus?.oauth?.configured);
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}><CalendarDays size={20} /></span>
            <div>
              <h2 className="font-bold text-slate-900">Google Agenda</h2>
              <p className="mt-1 text-sm text-slate-500">{connected ? `Conectado em ${calendarStatus.connection.google_email || 'sua conta Google'}. Novas gravações são sincronizadas.` : configured ? 'Conecte a agenda para criar e atualizar os eventos das gravações automaticamente.' : 'A integração está pronta no ZebraHub, mas faltam as credenciais do Google no Railway.'}</p>
              {!configured && calendarStatus?.oauth?.redirect_uri && <p className="mt-2 break-all text-[11px] text-slate-400">Callback: {calendarStatus.oauth.redirect_uri}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCalendar && !connected && <button type="button" disabled={!configured} onClick={connectCalendar} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Conectar Google Agenda</button>}
            {canCalendar && connected && <button type="button" onClick={disconnectCalendar} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"><Unlink size={14} /> Desconectar</button>}
            {canManage && <button type="button" onClick={() => openHistoricalRecording()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"><Clock3 size={14} /> Registrar realizada</button>}
            {canManage && <button type="button" onClick={() => openNewRecording()} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white"><Plus size={14} /> Nova gravação</button>}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Agenda do mês</h2><p className="mt-1 text-xs text-slate-400">A data da gravação fica registrada aqui e, quando conectado, também no Google Agenda.</p></div>
        <div className="divide-y divide-slate-100">
          {recordings.map((recording) => {
            const isOverdue = recording.status === 'scheduled' && String(recording.scheduled_start || '').slice(0, 10) < localDateTimeInput(new Date()).slice(0, 10);
            return (
            <div key={recording.id} className={`flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center ${isOverdue ? 'bg-amber-50/50' : ''}`}>
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-950 text-white">
                <strong className="text-lg leading-none">{String(recording.scheduled_start || '').slice(8, 10)}</strong>
                <span className="mt-1 text-[9px] font-bold uppercase text-white/50">{formatDate(recording.scheduled_start).slice(3, 5)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold text-slate-900">{recording.client_name}</h3><StatusPill status={recording.status} /></div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(recording.scheduled_start, { time: true })}{recording.location ? ` · ${recording.location}` : ''}{recording.responsible_name ? ` · ${recording.responsible_name}` : ''}</p>
                {recording.status === 'recorded' && <p className="mt-1 text-xs font-semibold text-emerald-600">{recording.video_count || recording.videos_created || 0} vídeo(s) gravado(s)</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {recording.google_event_link && <a href={recording.google_event_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><ExternalLink size={13} /> Google</a>}
                {canManage && recording.status === 'scheduled' && <button type="button" onClick={() => openComplete(recording)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Concluir gravação</button>}
                {canManage && recording.status !== 'recorded' && <button type="button" onClick={() => onDelete(recording)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
              </div>
              {isOverdue && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">Pendente</span>}
            </div>
            );
          })}
          {!recordings.length && <p className="px-5 py-14 text-center text-sm text-slate-400">Nenhuma gravação neste mês.</p>}
        </div>
      </section>
    </div>
  );
}

function FinalVideoAsset({ links = [] }) {
  const direct = links.find((link) => isManagedVideo(link));
  const external = links.find((link) => !isManagedVideo(link));

  if (!direct && !external) return null;

  return (
    <div className="mt-3 space-y-2">
      {direct ? (
        <video
          src={direct}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full rounded-xl bg-black object-contain"
        >
          Seu navegador não suporta vídeo HTML5.
        </video>
      ) : (
        <a
          href={external}
          target="_blank"
          rel="noreferrer"
          className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black text-white transition hover:opacity-90"
          title="Abrir vídeo no Drive"
        >
          <span className="text-sm font-black tracking-[0.28em]">VÍDEO</span>
          <ExternalLink size={14} className="absolute right-3 top-3 text-white/65" />
        </a>
      )}
      {direct && external && (
        <a href={external} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-600">
          <Link2 size={12} /> Abrir link externo
        </a>
      )}
    </div>
  );
}

function ProductionTab({ videos, canEdit, canPublish, draggedVideoId, setDraggedVideoId, currentDraggedVideo, setVideoStatus, setScheduleModal, deleteSchedule }) {
  function canDrag(video) {
    if (['recorded', 'editing', 'approved'].includes(video.status)) return canEdit;
    if (['dated', 'scheduled', 'posted'].includes(video.status)) return canPublish;
    return canPublish || canEdit;
  }
  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1580px] grid-cols-6 gap-3">
        {VIDEO_COLUMNS.map((column) => {
          const items = videos.filter((video) => video.status === column.key);
          return (
            <section
              key={column.key}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (currentDraggedVideo) setVideoStatus(currentDraggedVideo, column.key);
              }}
              className={`min-h-[520px] rounded-[22px] border bg-slate-50/70 p-3 transition ${draggedVideoId ? 'border-blue-200' : 'border-slate-200'}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div><h2 className="text-sm font-bold text-slate-900">{column.label}</h2><p className="mt-0.5 text-[10px] text-slate-400">{column.description}</p></div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 shadow-sm">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((video) => (
                  <article
                    key={video.id}
                    draggable={canDrag(video)}
                    onDragStart={() => setDraggedVideoId(video.id)}
                    onDragEnd={() => setDraggedVideoId(null)}
                    className={`rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm ${canDrag(video) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide" style={{ color: video.client_color || '#0969ff' }}>{video.client_name}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">{video.title}</h3></div>
                      <span className="shrink-0 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">#{String(video.video_number).padStart(2, '0')}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">Gravado em {formatDate(video.recording_date)}</p>

                    {(video.raw_links || []).length > 0 && <a href={video.raw_links[0]} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600"><Link2 size={12} /> Arquivos brutos</a>}
                    <FinalVideoAsset links={video.final_links || []} />

                    {(video.schedules || []).length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
                        {video.schedules.map((schedule) => (
                          <div key={schedule.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px]">
                            <span className="font-bold text-slate-600">{PLATFORM_LABELS[schedule.platform] || schedule.platform}</span>
                            <span className="ml-auto text-slate-400">{formatDate(schedule.scheduled_at, { time: true })}</span>
                            {canPublish && schedule.status === 'scheduled' && <button type="button" onClick={() => deleteSchedule(video.id, schedule.id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                      {canEdit && video.status === 'recorded' && <button type="button" onClick={() => setVideoStatus(video, 'editing')} className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] font-bold text-white">Iniciar edição</button>}
                      {canEdit && video.status === 'editing' && <button type="button" onClick={() => setVideoStatus(video, 'approved')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white">Concluir e aprovar</button>}
                      {canPublish && video.status === 'approved' && <button type="button" onClick={() => setScheduleModal({ id: video.id, title: video.title, scheduled_at: localDateTimeInput(new Date(Date.now() + 86400000)), platform: 'instagram' })} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">Enviar pra grade</button>}
                      {canPublish && video.status === 'dated' && <button type="button" onClick={() => setVideoStatus(video, 'scheduled')} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700">Marcar agendado</button>}
                      {canPublish && video.status === 'scheduled' && <button type="button" onClick={() => setVideoStatus(video, 'posted')} className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold text-white">Marcar postado</button>}
                    </div>
                  </article>
                ))}
                {!items.length && <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-10 text-center text-[11px] text-slate-400">Nenhum vídeo nesta etapa.</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ClientsTab({ clients, referenceMonth, canManage, openSettings, openNewRecording, openHistoricalRecording, openClientSelection }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Saúde audiovisual por cliente</h2><p className="mt-1 text-xs text-slate-400">Ordenado automaticamente por quem está há mais tempo sem gravar.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <tr><th className="px-5 py-3">Cliente</th><th className="px-3 py-3">Sem gravar</th><th className="px-3 py-3">Gravou no mês</th><th className="px-3 py-3">Estoque</th><th className="px-3 py-3">Último post</th><th className="px-3 py-3">Próximo post</th><th className="px-3 py-3">Gravar até</th><th className="px-3 py-3">Cadência</th><th className="px-5 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {clients.map((client) => {
              const tone = urgencyTone(client);
              return (
                <tr key={client.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5"><div className="font-bold text-slate-900">{client.name}</div><div className="mt-0.5 text-[10px] text-slate-400">Última gravação: {client.last_recorded_at ? formatDate(client.last_recorded_at, { year: true }) : '—'}</div></td>
                  <td className="px-3 py-3.5"><span className={`rounded-full px-2.5 py-1 font-bold ${tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{client.days_without_recording == null ? 'Nunca' : `${client.days_without_recording}d`}</span></td>
                  <td className="px-3 py-3.5">{client.recorded_in_reference_month ? <span className="font-bold text-emerald-600">Sim ✓</span> : <span className="font-bold text-red-600">Não</span>}</td>
                  <td className="px-3 py-3.5">
                    <strong className="text-slate-900">{client.unposted_videos || 0}</strong> <span className="text-slate-400">vídeos</span>
                    <div className="mt-1 whitespace-nowrap text-[9px] text-slate-400">{client.stock_breakdown?.raw || 0} brutos · {client.stock_breakdown?.editing || 0} edição · {client.stock_breakdown?.edited || 0} prontos · {client.stock_breakdown?.scheduled || 0} agend.</div>
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">{formatDate(client.last_posted_at)}</td>
                  <td className="px-3 py-3.5 font-semibold text-slate-700">{formatDate(client.next_post_suggested)}</td>
                  <td className="px-3 py-3.5">{client.next_recording_suggested ? <span className={client.recording_delay_days > 0 ? 'font-bold text-red-600' : 'font-semibold text-blue-600'}>{formatDate(client.next_recording_suggested)}{client.recording_delay_days > 0 ? ` · ${client.recording_delay_days}d atrasado` : ''}</span> : <span className="text-slate-400">Sem histórico</span>}</td>
                  <td className="px-3 py-3.5 text-slate-500">{client.settings?.videos_per_period || 2} vídeo(s) / {client.settings?.cadence_period === 'month' ? 'mês' : 'semana'}</td>
                  <td className="px-5 py-3.5"><div className="flex justify-end gap-1.5">{canManage && <button onClick={() => openHistoricalRecording(client.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 font-bold text-slate-500">Histórico</button>}{canManage && <button onClick={() => openNewRecording(client.id)} className="rounded-lg border border-slate-200 px-2 py-1.5 font-bold text-blue-600">Gravar</button>}{canManage && <button onClick={() => openSettings(client)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Settings2 size={14} /></button>}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!clients.length && <p className="px-5 py-12 text-center text-sm text-slate-400">Nenhum cliente disponível.</p>}
    </section>
  );
}


function ClientSelectionModal({ form, setForm, clients, saving, onClose, onSave }) {
  const selectedIds = (form.selected_ids || []).map(Number);

  function toggleClient(clientId) {
    const id = Number(clientId);
    const next = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    setForm({ ...form, selected_ids: next });
  }

  return (
    <ModalShell
      title="Clientes de gravação"
      subtitle="Escolha quem realmente faz parte da operação audiovisual. Essa seleção define os indicadores e o ranking de atraso."
      onClose={onClose}
      saving={saving}
    >
      <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        <strong>{selectedIds.length} cliente(s) selecionado(s).</strong> Clientes desmarcados deixam de entrar no KPI “clientes gravados no mês”, nos dias sem gravar e nas sugestões. O histórico existente não é apagado.
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setForm({ ...form, selected_ids: clients.map((client) => Number(client.id)) })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Selecionar todos</button>
        <button type="button" onClick={() => setForm({ ...form, selected_ids: [] })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Limpar seleção</button>
      </div>

      <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
        {clients.map((client) => {
          const active = selectedIds.includes(Number(client.id));
          return (
            <label key={client.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${active ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <input type="checkbox" checked={active} onChange={() => toggleClient(client.id)} className="h-4 w-4 accent-blue-600" />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: client.logo_color || '#0969ff' }}>
                {client.name?.trim()?.[0]?.toUpperCase() || '?'}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-slate-900">{client.name}</strong>
                <small className="mt-0.5 block text-[11px] text-slate-400">{active ? 'Incluído na gestão de gravações' : 'Fora da gestão de gravações'}</small>
              </span>
              {active && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white"><Check size={14} /></span>}
            </label>
          );
        })}
        {!clients.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">Nenhum cliente ativo disponível para sua conta.</p>}
      </div>

      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Salvar clientes" />
    </ModalShell>
  );
}


function HistoricalRecordingModal({ form, setForm, clients, saving, onClose, onSave }) {
  const postedCount = Math.max(0, Number(form.posted_count || 0));
  const editedCount = Math.max(0, Number(form.edited_count || 0));
  const total = Math.max(0, Number(form.video_count || 0));
  const stock = Math.max(0, total - postedCount);
  const rawCount = Math.max(0, total - postedCount - editedCount);

  return (
    <ModalShell title="Registrar gravação já realizada" subtitle="Use para lançar gravações anteriores e trazer a gaveta real do cliente para o ZebraHub. Não cria evento retroativo no Google Agenda." onClose={onClose} saving={saving}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-950 px-3 py-3 text-white"><span className="block text-[9px] font-bold uppercase tracking-wide text-white/45">Total gravado</span><strong className="mt-1 block text-xl">{total}</strong></div>
        <div className="rounded-2xl bg-blue-50 px-3 py-3 text-blue-900"><span className="block text-[9px] font-bold uppercase tracking-wide text-blue-500">Na gaveta</span><strong className="mt-1 block text-xl">{stock}</strong></div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-slate-900"><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Ainda brutos</span><strong className="mt-1 block text-xl">{rawCount}</strong></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Cliente" value={form.client_id} onChange={(value) => setForm({ ...form, client_id: value })} options={clients.map((client) => [client.id, client.name])} />
        <Input label="Data da gravação *" type="date" value={form.recorded_date} onChange={(value) => setForm({ ...form, recorded_date: value })} />
        <Input label="Quantos vídeos foram gravados? *" type="number" min="1" value={form.video_count} onChange={(value) => setForm({ ...form, video_count: value })} />
        <Input label="Quantos já foram postados?" type="number" min="0" value={form.posted_count} onChange={(value) => setForm({ ...form, posted_count: value })} />
        <Input label="Quantos estão editados?" type="number" min="0" value={form.edited_count} onChange={(value) => setForm({ ...form, edited_count: value })} />
        {postedCount > 0 && <Input label="Data do último post *" type="date" value={form.last_posted_date} onChange={(value) => setForm({ ...form, last_posted_date: value })} />}
        <Input label="Responsável pela gravação" value={form.responsible_name} onChange={(value) => setForm({ ...form, responsible_name: value })} placeholder="Ex.: Kennedy" />
        <Input label="Local" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Clínica, escritório, externa..." />
        <div className="sm:col-span-2"><TextArea label="Links dos arquivos brutos" value={form.raw_links_text} onChange={(value) => setForm({ ...form, raw_links_text: value })} placeholder="Um link por linha — Drive, Frame.io, Dropbox..." rows={3} /></div>
        {editedCount > 0 && <div className="sm:col-span-2"><TextArea label={`Links finais dos ${editedCount} vídeo(s) editado(s) *`} value={form.edited_links_text} onChange={(value) => setForm({ ...form, edited_links_text: value })} placeholder="Um link por linha, na mesma quantidade de vídeos editados" rows={Math.min(6, Math.max(3, editedCount))} /></div>}
        <div className="sm:col-span-2"><TextArea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} placeholder="Contexto da gravação histórica..." rows={3} /></div>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        <strong>Gaveta = tudo que ainda não foi postado.</strong> Vídeos brutos, em edição, editados ou agendados continuam contando no estoque até a publicação.
      </div>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Registrar gravação realizada" />
    </ModalShell>
  );
}

function RecordingModal({ form, setForm, clients, saving, onClose, onSave }) {
  return (
    <ModalShell title="Nova gravação" subtitle="Registre a captação e sincronize com o Google Agenda quando a conexão estiver ativa." onClose={onClose} saving={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Cliente" value={form.client_id} onChange={(value) => setForm({ ...form, client_id: value })} options={clients.map((client) => [client.id, client.name])} />
        <Input label="Responsável" value={form.responsible_name} onChange={(value) => setForm({ ...form, responsible_name: value })} placeholder="Ex.: Kennedy" />
        <Input label="Início" type="datetime-local" value={form.scheduled_start} onChange={(value) => setForm({ ...form, scheduled_start: value })} />
        <Input label="Fim" type="datetime-local" value={form.scheduled_end} onChange={(value) => setForm({ ...form, scheduled_end: value })} />
        <div className="sm:col-span-2"><Input label="Local" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Instituto, escritório, externa..." /></div>
        <div className="sm:col-span-2"><TextArea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} placeholder="Objetivo da gravação, orientação, pessoas envolvidas..." /></div>
      </div>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Marcar gravação" />
    </ModalShell>
  );
}

function CompleteRecordingModal({ form, setForm, saving, onClose, onSave }) {
  return (
    <ModalShell title={`Concluir gravação · ${form.client_name}`} subtitle="Ao concluir, o ZebraHub cria automaticamente as demandas individuais dos vídeos." onClose={onClose} saving={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Data real da gravação" type="date" value={form.recorded_date} onChange={(value) => setForm({ ...form, recorded_date: value })} />
        <Input label="Quantos vídeos foram gravados? *" type="number" min="1" value={form.video_count} onChange={(value) => setForm({ ...form, video_count: value })} />
        <div className="sm:col-span-2"><TextArea label="Links dos vídeos brutos" value={form.raw_links_text} onChange={(value) => setForm({ ...form, raw_links_text: value })} placeholder="Um link por linha — Google Drive, Frame.io, Dropbox..." rows={4} /></div>
      </div>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Concluir e criar vídeos" />
    </ModalShell>
  );
}

function EditCompleteModal({ form, setForm, saving, onClose, onSave }) {
  return (
    <ModalShell title="Concluir edição" subtitle={form.title} onClose={onClose} saving={saving}>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        Envie o vídeo diretamente para ele ficar disponível no card. Se o arquivo for maior ou estiver no Drive, mantenha a opção de link.
      </div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Vídeo final direto</span>
          <span className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-4 transition ${form.final_file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${form.final_file ? 'bg-emerald-600 text-white' : 'bg-white text-blue-600 shadow-sm'}`}><UploadCloud size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-800">{form.final_file?.name || 'Selecionar vídeo'}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">MP4, MOV, WebM etc. · até 120 MB</span>
            </span>
            <input type="file" accept="video/*" className="hidden" disabled={saving} onChange={(event) => { const file = event.target.files?.[0] || null; setForm({ ...form, final_file: file }); }} />
          </span>
        </label>
        <div className="flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">ou use link</span><div className="h-px flex-1 bg-slate-200" /></div>
        <TextArea label="Link do vídeo (Drive, Frame.io, Dropbox...)" value={form.final_links_text} onChange={(value) => setForm({ ...form, final_links_text: value })} placeholder="Cole um link por linha" rows={3} />
        <TextArea label="Observação da edição" value={form.edit_notes} onChange={(value) => setForm({ ...form, edit_notes: value })} placeholder="Versão final, observações, ajustes feitos..." rows={3} />
      </div>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel={saving ? 'Enviando...' : 'Concluir e aprovar'} />
    </ModalShell>
  );
}

function ScheduleModal({ form, setForm, saving, onClose, onSave }) {
  return (
    <ModalShell title="Enviar para a grade" subtitle={form.title} onClose={onClose} saving={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Data e horário *" type="datetime-local" value={form.scheduled_at} onChange={(value) => setForm({ ...form, scheduled_at: value })} />
        <Select label="Canal" value={form.platform} onChange={(value) => setForm({ ...form, platform: value })} options={Object.entries(PLATFORM_LABELS)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">Ao salvar, o vídeo entra em Datado e fica pronto para a grade de conteúdo. Depois do agendamento na plataforma, marque-o como Agendado.</p>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Enviar pra grade" />
    </ModalShell>
  );
}

function SettingsModal({ form, setForm, saving, onClose, onSave }) {
  return (
    <ModalShell title={`Cadência · ${form.client_name}`} subtitle="Esses dados alimentam a sugestão automática da próxima publicação e da próxima gravação." onClose={onClose} saving={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Quantidade de vídeos" type="number" min="1" value={form.videos_per_period} onChange={(value) => setForm({ ...form, videos_per_period: value })} />
        <Select label="Frequência" value={form.cadence_period} onChange={(value) => setForm({ ...form, cadence_period: value })} options={[["week", "por semana"], ["month", "por mês"]]} />
        <div className="sm:col-span-2"><Input label="Gravar quantos dias antes do post?" type="number" min="0" value={form.recording_lead_days} onChange={(value) => setForm({ ...form, recording_lead_days: value })} /></div>
      </div>
      <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Padrão recomendado: <strong>7 dias de antecedência</strong>. Assim o ZebraHub considera que o vídeo precisa ser gravado na semana anterior à publicação.</div>
      <ModalActions saving={saving} onClose={onClose} onSave={() => onSave(form)} saveLabel="Salvar cadência" />
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose, saving }) {
  return (
    <ModalBackdrop onClose={onClose} disabled={saving}>
      <div className="w-full max-w-2xl rounded-[26px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700"><X size={17} /></button>
        </div>
        {children}
      </div>
    </ModalBackdrop>
  );
}

function ModalActions({ saving, onClose, onSave, saveLabel }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
      <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 className="animate-spin" size={13} />}{saveLabel}</button>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '', min }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">{label}
      <input type={type} min={min} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">{label}
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400">
        {options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder = '', rows = 3 }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">{label}
      <textarea rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal leading-5 text-slate-800 outline-none focus:border-blue-400" />
    </label>
  );
}
