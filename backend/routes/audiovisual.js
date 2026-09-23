const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const { syncRecordingEvent, deleteRecordingEvent } = require('../services/googleCalendar');

const router = express.Router();
router.use(authRequired);

const VIDEO_STATUSES = new Set(['recorded', 'editing', 'approved', 'dated', 'scheduled', 'posted']);
const RECORDING_STATUSES = new Set(['scheduled', 'recorded', 'cancelled']);

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeLinks(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n|,/g);
  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 30);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function hasAny(user, keys) {
  return keys.some((key) => hasPermission(user, key));
}

function requireAny(keys) {
  return (req, res, next) => {
    if (!hasAny(req.user, keys)) return res.status(403).json({ error: 'Você não possui permissão para esta ação do Audiovisual.' });
    next();
  };
}

function accessibleClientIds(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.is_operations_head) {
    return db.prepare("SELECT id FROM clients WHERE agency_id = ? AND status = 'active' ORDER BY name")
      .all(user.agency_id).map((row) => Number(row.id));
  }
  if (user.role === 'client') return user.client_id ? [Number(user.client_id)] : [];
  return (Array.isArray(user.client_ids) ? user.client_ids : []).map(Number).filter(Boolean);
}

function recordingClientIds(user) {
  const available = accessibleClientIds(user);
  if (!available.length) return [];
  const placeholders = available.map(() => '?').join(',');
  return db.prepare(`
    SELECT client_id
    FROM audiovisual_client_settings
    WHERE agency_id = ?
      AND is_recording_client = 1
      AND client_id IN (${placeholders})
  `).all(user.agency_id, ...available).map((row) => Number(row.client_id));
}

function isRecordingClient(agencyId, clientId) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM audiovisual_client_settings
    WHERE agency_id = ? AND client_id = ? AND is_recording_client = 1
  `).get(agencyId, Number(clientId)));
}

function selectedClientIds(req, res) {
  const available = accessibleClientIds(req.user);
  const enabled = recordingClientIds(req.user);
  const requested = Number(req.query.client_id || req.body?.client_id || 0);
  if (requested) {
    if (!available.includes(requested) || !canAccessClient(req.user, requested)) {
      res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
      return null;
    }
    return enabled.includes(requested) ? [requested] : [];
  }
  return enabled;
}

function monthKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function validDateTime(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text) ? text.slice(0, 19) : null;
}

function validDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDays(dateValue, amount) {
  if (!dateValue) return null;
  const source = String(dateValue).slice(0, 10);
  const [year, month, day] = source.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(dateValue, target = todayKey()) {
  if (!dateValue) return null;
  const a = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(target).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

function clientRecord(clientId, agencyId) {
  return db.prepare('SELECT id, name, logo_color, avatar_data, status FROM clients WHERE id = ? AND agency_id = ?').get(clientId, agencyId) || null;
}

function ensureClient(req, res, clientId) {
  const id = Number(clientId);
  if (!id || !canAccessClient(req.user, id)) {
    res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
    return null;
  }
  const client = clientRecord(id, req.user.agency_id);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return null;
  }
  return client;
}

function getClientSettings(agencyId, clientId) {
  const row = db.prepare('SELECT * FROM audiovisual_client_settings WHERE agency_id = ? AND client_id = ?').get(agencyId, clientId);
  return row || {
    agency_id: agencyId,
    client_id: clientId,
    videos_per_period: 2,
    cadence_period: 'week',
    recording_lead_days: 7,
    preferred_days_json: '[]',
    is_recording_client: 0,
  };
}

function formatSettings(row) {
  return {
    videos_per_period: Math.max(1, Number(row?.videos_per_period || 2)),
    cadence_period: row?.cadence_period === 'month' ? 'month' : 'week',
    recording_lead_days: Math.max(0, Number(row?.recording_lead_days ?? 7)),
    preferred_days: parseJsonArray(row?.preferred_days_json),
    is_recording_client: Boolean(Number(row?.is_recording_client || 0)),
  };
}

function clientSelectionRows(user) {
  const available = accessibleClientIds(user);
  if (!available.length) return [];
  const placeholders = available.map(() => '?').join(',');
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.logo_color,
      c.avatar_data,
      COALESCE(s.is_recording_client, 0) AS is_recording_client,
      COALESCE(s.videos_per_period, 2) AS videos_per_period,
      COALESCE(s.cadence_period, 'week') AS cadence_period,
      COALESCE(s.recording_lead_days, 7) AS recording_lead_days
    FROM clients c
    LEFT JOIN audiovisual_client_settings s
      ON s.agency_id = c.agency_id AND s.client_id = c.id
    WHERE c.agency_id = ?
      AND c.status = 'active'
      AND c.id IN (${placeholders})
    ORDER BY c.name COLLATE NOCASE
  `).all(user.agency_id, ...available).map((row) => ({
    ...row,
    is_recording_client: Boolean(Number(row.is_recording_client || 0)),
  }));
}

function getRecording(id, agencyId) {
  return db.prepare(`
    SELECT r.*, c.name AS client_name, c.logo_color AS client_color
    FROM audiovisual_recordings r
    JOIN clients c ON c.id = r.client_id
    WHERE r.id = ? AND r.agency_id = ?
  `).get(id, agencyId) || null;
}

async function syncRecordingQuietly(recording) {
  if (!recording) return null;
  try {
    const sync = await syncRecordingEvent({
      recording,
      clientName: recording.client_name,
      agencyId: recording.agency_id,
    });
    if (sync?.event_id || sync?.html_link) {
      db.prepare(`
        UPDATE audiovisual_recordings
        SET google_event_id = COALESCE(?, google_event_id),
            google_event_link = COALESCE(?, google_event_link),
            updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(sync.event_id || null, sync.html_link || null, recording.id, recording.agency_id);
    }
    return null;
  } catch (error) {
    console.warn('[AUDIOVISUAL] Google Agenda:', error.message);
    return error.message || 'Não foi possível sincronizar com o Google Agenda.';
  }
}


router.get('/client-selection', requireAny(['audiovisual.view']), (req, res) => {
  res.json({ clients: clientSelectionRows(req.user) });
});

router.put('/client-selection', requireAny(['audiovisual.manage']), (req, res) => {
  const available = accessibleClientIds(req.user);
  const requested = Array.isArray(req.body.client_ids)
    ? [...new Set(req.body.client_ids.map(Number).filter(Boolean))]
    : [];
  const selected = requested.filter((id) => available.includes(id) && canAccessClient(req.user, id));
  const invalid = requested.filter((id) => !available.includes(id) || !canAccessClient(req.user, id));

  if (invalid.length) {
    return res.status(403).json({ error: 'A seleção contém cliente(s) que você não possui permissão para gerenciar.' });
  }

  const selectedSet = new Set(selected);
  const upsert = db.prepare(`
    INSERT INTO audiovisual_client_settings (
      agency_id, client_id, is_recording_client, videos_per_period, cadence_period,
      recording_lead_days, preferred_days_json, updated_by, updated_at
    ) VALUES (?, ?, ?, 2, 'week', 7, '[]', ?, datetime('now'))
    ON CONFLICT(agency_id, client_id) DO UPDATE SET
      is_recording_client = excluded.is_recording_client,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `);

  const save = db.transaction(() => {
    available.forEach((clientId) => {
      upsert.run(req.user.agency_id, clientId, selectedSet.has(clientId) ? 1 : 0, req.user.id);
    });
  });
  save();

  res.json({
    ok: true,
    selected_count: selected.length,
    clients: clientSelectionRows(req.user),
  });
});

router.get('/dashboard', (req, res) => {
  const ids = selectedClientIds(req, res);
  if (!ids) return;
  const referenceMonth = monthKey(req.query.month);
  if (!ids.length) {
    return res.json({
      reference_month: referenceMonth,
      stats: { clients_scheduled_month: 0, clients_recorded_month: 0, clients_total: 0, recordings_scheduled_month: 0, recordings_completed_month: 0, recordings_total: 0, videos_recorded_month: 0, editing: 0, edited_waiting_schedule: 0, posted_month: 0, overdue_recordings: 0 },
      clients: [], upcoming_recordings: [], overdue_recordings: [],
    });
  }

  const placeholders = ids.map(() => '?').join(',');
  const baseParams = [req.user.agency_id, ...ids];
  const clients = db.prepare(`
    SELECT id, name, logo_color, avatar_data
    FROM clients
    WHERE agency_id = ? AND id IN (${placeholders}) AND status = 'active'
    ORDER BY name
  `).all(...baseParams);

  const health = clients.map((client) => {
    const lastRecording = db.prepare(`
      SELECT MAX(COALESCE(recorded_at, scheduled_start)) AS value
      FROM audiovisual_recordings
      WHERE agency_id = ? AND client_id = ? AND status = 'recorded'
    `).get(req.user.agency_id, client.id)?.value || null;
    const recordingsMonth = Number(db.prepare(`
      SELECT COUNT(*) AS total FROM audiovisual_recordings
      WHERE agency_id = ? AND client_id = ? AND status = 'recorded' AND substr(COALESCE(recorded_at, scheduled_start), 1, 7) = ?
    `).get(req.user.agency_id, client.id, referenceMonth)?.total || 0);
    const scheduledInMonth = Number(db.prepare(`
      SELECT COUNT(*) AS total FROM audiovisual_recordings
      WHERE agency_id = ? AND client_id = ? AND status <> 'cancelled' AND substr(scheduled_start, 1, 7) = ?
    `).get(req.user.agency_id, client.id, referenceMonth)?.total || 0);
    const lastPosted = db.prepare(`
      SELECT MAX(posted_at) AS value FROM audiovisual_videos
      WHERE agency_id = ? AND client_id = ? AND status = 'posted'
    `).get(req.user.agency_id, client.id)?.value || null;
    const stockBreakdown = db.prepare(`
      SELECT
        SUM(CASE WHEN status <> 'posted' THEN 1 ELSE 0 END) AS total,
        SUM(CASE WHEN status = 'recorded' THEN 1 ELSE 0 END) AS recorded,
        SUM(CASE WHEN status = 'editing' THEN 1 ELSE 0 END) AS editing,
        SUM(CASE WHEN status IN ('approved','edited') THEN 1 ELSE 0 END) AS edited,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled
      FROM audiovisual_videos
      WHERE agency_id = ? AND client_id = ?
    `).get(req.user.agency_id, client.id) || {};
    const stock = Number(stockBreakdown.total || 0);
    const editedReady = Number(stockBreakdown.edited || 0);
    const settings = formatSettings(getClientSettings(req.user.agency_id, client.id));
    const intervalDays = settings.cadence_period === 'month'
      ? Math.max(1, Math.round(30 / settings.videos_per_period))
      : Math.max(1, Math.round(7 / settings.videos_per_period));
    const nextPost = lastPosted ? addDays(lastPosted, intervalDays) : null;
    const nextRecording = nextPost ? addDays(nextPost, -settings.recording_lead_days) : null;
    const recordingDelay = nextRecording ? Math.max(0, daysBetween(nextRecording)) : null;
    const daysWithout = lastRecording ? daysBetween(lastRecording) : null;
    return {
      ...client,
      last_recorded_at: lastRecording,
      days_without_recording: daysWithout,
      scheduled_in_reference_month: scheduledInMonth > 0,
      scheduled_recordings_in_reference_month: scheduledInMonth,
      recorded_in_reference_month: recordingsMonth > 0,
      recordings_in_reference_month: recordingsMonth,
      last_posted_at: lastPosted,
      unposted_videos: stock,
      stock_breakdown: {
        raw: Number(stockBreakdown.recorded || 0),
        editing: Number(stockBreakdown.editing || 0),
        edited: Number(stockBreakdown.edited || 0),
        scheduled: Number(stockBreakdown.scheduled || 0),
      },
      edited_ready: editedReady,
      next_post_suggested: nextPost,
      next_recording_suggested: nextRecording,
      recording_delay_days: recordingDelay,
      settings,
    };
  }).sort((a, b) => {
    if (a.days_without_recording == null && b.days_without_recording != null) return -1;
    if (a.days_without_recording != null && b.days_without_recording == null) return 1;
    return Number(b.days_without_recording || 0) - Number(a.days_without_recording || 0);
  });

  const scalar = (sql, params = []) => Number(db.prepare(sql).get(...params)?.total || 0);
  const scope = `agency_id = ? AND client_id IN (${placeholders})`;
  const params = [req.user.agency_id, ...ids];
  const stats = {
    // Quantos CLIENTES únicos já têm ao menos uma gravação marcada no mês.
    // Uma mesma empresa com duas ou mais sessões continua contando apenas uma vez.
    clients_scheduled_month: health.filter((client) => client.scheduled_in_reference_month).length,
    clients_recorded_month: health.filter((client) => client.recorded_in_reference_month).length,
    clients_total: health.length,
    recordings_scheduled_month: scalar(`SELECT COUNT(*) AS total FROM audiovisual_recordings WHERE ${scope} AND status <> 'cancelled' AND substr(scheduled_start, 1, 7) = ?`, [...params, referenceMonth]),
    recordings_completed_month: scalar(`SELECT COUNT(*) AS total FROM audiovisual_recordings WHERE ${scope} AND status = 'recorded' AND substr(COALESCE(recorded_at, scheduled_start), 1, 7) = ?`, [...params, referenceMonth]),
    recordings_total: scalar(`SELECT COUNT(*) AS total FROM audiovisual_recordings WHERE ${scope} AND status <> 'cancelled'`, params),
    videos_recorded_month: scalar(`
      SELECT COUNT(v.id) AS total
      FROM audiovisual_videos v
      JOIN audiovisual_recordings r ON r.id = v.recording_id
      WHERE v.agency_id = ? AND v.client_id IN (${placeholders})
        AND substr(COALESCE(r.recorded_at, r.scheduled_start), 1, 7) = ?
    `, [req.user.agency_id, ...ids, referenceMonth]),
    editing: scalar(`SELECT COUNT(*) AS total FROM audiovisual_videos WHERE ${scope} AND status = 'editing'`, params),
    edited_waiting_schedule: scalar(`SELECT COUNT(*) AS total FROM audiovisual_videos WHERE ${scope} AND status IN ('approved','edited')`, params),
    posted_month: scalar(`SELECT COUNT(*) AS total FROM audiovisual_videos WHERE ${scope} AND status = 'posted' AND substr(posted_at, 1, 7) = ?`, [...params, referenceMonth]),
    overdue_recordings: scalar(`SELECT COUNT(*) AS total FROM audiovisual_recordings WHERE ${scope} AND status = 'scheduled' AND scheduled_start < ?`, [...params, `${todayKey()}T00:00:00`]),
  };

  const upcoming = db.prepare(`
    SELECT r.*, c.name AS client_name, c.logo_color AS client_color
    FROM audiovisual_recordings r
    JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ? AND r.client_id IN (${placeholders}) AND r.status = 'scheduled'
      AND r.scheduled_start >= ?
    ORDER BY r.scheduled_start ASC
    LIMIT 12
  `).all(req.user.agency_id, ...ids, `${todayKey()}T00:00`);

  const overdue = db.prepare(`
    SELECT r.*, c.name AS client_name, c.logo_color AS client_color
    FROM audiovisual_recordings r
    JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ? AND r.client_id IN (${placeholders}) AND r.status = 'scheduled'
      AND r.scheduled_start < ?
    ORDER BY r.scheduled_start ASC
    LIMIT 12
  `).all(req.user.agency_id, ...ids, `${todayKey()}T00:00:00`).map((row) => ({
    ...row,
    overdue_days: daysBetween(row.scheduled_start),
  }));

  res.json({ reference_month: referenceMonth, stats, clients: health, upcoming_recordings: upcoming, overdue_recordings: overdue });
});

router.get('/recordings', (req, res) => {
  const ids = selectedClientIds(req, res);
  if (!ids) return;
  if (!ids.length) return res.json({ recordings: [] });
  const referenceMonth = monthKey(req.query.month);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT r.*, c.name AS client_name, c.logo_color AS client_color,
           (SELECT COUNT(*) FROM audiovisual_videos v WHERE v.recording_id = r.id) AS videos_created
    FROM audiovisual_recordings r
    JOIN clients c ON c.id = r.client_id
    WHERE r.agency_id = ? AND r.client_id IN (${placeholders})
      AND substr(r.scheduled_start, 1, 7) = ?
    ORDER BY r.scheduled_start ASC
  `).all(req.user.agency_id, ...ids, referenceMonth).map((row) => ({
    ...row,
    raw_links: parseJsonArray(row.raw_links_json),
  }));
  res.json({ recordings: rows, reference_month: referenceMonth });
});

router.post('/recordings', requireAny(['audiovisual.manage']), async (req, res) => {
  const client = ensureClient(req, res, req.body.client_id);
  if (!client) return;
  if (!isRecordingClient(req.user.agency_id, client.id)) {
    return res.status(400).json({ error: 'Este cliente não está marcado como cliente de gravação. Inclua-o em “Clientes de gravação” antes de agendar.' });
  }
  const scheduledStart = validDateTime(req.body.scheduled_start);
  if (!scheduledStart) return res.status(400).json({ error: 'Informe a data e o horário da gravação.' });
  const scheduledEnd = req.body.scheduled_end ? validDateTime(req.body.scheduled_end) : null;
  if (req.body.scheduled_end && !scheduledEnd) return res.status(400).json({ error: 'O horário final da gravação é inválido.' });

  const info = db.prepare(`
    INSERT INTO audiovisual_recordings (
      agency_id, client_id, created_by, title, scheduled_start, scheduled_end,
      location, responsible_name, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `).run(
    req.user.agency_id,
    client.id,
    req.user.id,
    normalizeText(req.body.title) || `Gravação — ${client.name}`,
    scheduledStart,
    scheduledEnd,
    normalizeText(req.body.location),
    normalizeText(req.body.responsible_name),
    normalizeText(req.body.notes),
  );

  let recording = getRecording(info.lastInsertRowid, req.user.agency_id);
  const calendarWarning = await syncRecordingQuietly(recording);
  recording = getRecording(info.lastInsertRowid, req.user.agency_id);
  res.status(201).json({ recording, calendar_warning: calendarWarning });
});


router.post('/recordings/historical', requireAny(['audiovisual.manage']), (req, res) => {
  const client = ensureClient(req, res, req.body.client_id);
  if (!client) return;
  if (!isRecordingClient(req.user.agency_id, client.id)) {
    return res.status(400).json({ error: 'Este cliente não está marcado como cliente de gravação.' });
  }

  const recordedDate = validDate(req.body.recorded_date);
  if (!recordedDate) return res.status(400).json({ error: 'Informe a data em que a gravação aconteceu.' });

  const videoCount = Math.max(0, Math.min(100, Math.floor(Number(req.body.video_count || 0))));
  const postedCount = Math.max(0, Math.min(100, Math.floor(Number(req.body.posted_count || 0))));
  const editedCount = Math.max(0, Math.min(100, Math.floor(Number(req.body.edited_count || 0))));
  if (videoCount < 1) return res.status(400).json({ error: 'Informe quantos vídeos foram gravados.' });
  if (postedCount + editedCount > videoCount) {
    return res.status(400).json({ error: 'A soma de vídeos postados e editados não pode ultrapassar o total gravado.' });
  }

  const lastPostedDate = postedCount > 0 ? validDate(req.body.last_posted_date) : null;
  if (postedCount > 0 && !lastPostedDate) {
    return res.status(400).json({ error: 'Informe a data do último vídeo postado para manter as próximas sugestões corretas.' });
  }

  const rawLinks = normalizeLinks(req.body.raw_links);
  const editedLinks = normalizeLinks(req.body.edited_links);
  if (editedCount > 0 && editedLinks.length < editedCount) {
    return res.status(400).json({ error: `Para registrar ${editedCount} vídeo(s) como editado(s), adicione pelo menos ${editedCount} link(s) final(is), um por vídeo.` });
  }

  const recordedAt = `${recordedDate}T12:00:00`;
  const lastPostedAt = lastPostedDate ? `${lastPostedDate}T12:00:00` : null;

  const createHistorical = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO audiovisual_recordings (
        agency_id, client_id, created_by, title, scheduled_start, scheduled_end,
        location, responsible_name, status, recorded_at, video_count, raw_links_json, notes
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'recorded', ?, ?, ?, ?)
    `).run(
      req.user.agency_id,
      client.id,
      req.user.id,
      normalizeText(req.body.title) || `Gravação realizada — ${client.name}`,
      recordedAt,
      normalizeText(req.body.location),
      normalizeText(req.body.responsible_name),
      recordedAt,
      videoCount,
      JSON.stringify(rawLinks),
      normalizeText(req.body.notes),
    );

    const recordingId = Number(info.lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO audiovisual_videos (
        agency_id, client_id, recording_id, video_number, title, status, created_by,
        final_links_json, edited_at, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let number = 1; number <= videoCount; number += 1) {
      let status = 'recorded';
      let finalLinksJson = '[]';
      let editedAt = null;
      let postedAt = null;

      if (number <= postedCount) {
        status = 'posted';
        // Só precisamos de uma data confiável para representar o último post.
        // Os demais vídeos importados continuam como postados, sem inventar datas.
        postedAt = number === postedCount ? lastPostedAt : null;
      } else if (number <= postedCount + editedCount) {
        status = 'approved';
        const link = editedLinks[number - postedCount - 1];
        finalLinksJson = JSON.stringify(link ? [link] : []);
        editedAt = recordedAt;
      }

      insert.run(
        req.user.agency_id,
        client.id,
        recordingId,
        number,
        `${client.name} — Vídeo ${String(number).padStart(2, '0')}`,
        status,
        req.user.id,
        finalLinksJson,
        editedAt,
        postedAt,
      );
    }

    return recordingId;
  });

  const recordingId = createHistorical();
  const recording = getRecording(recordingId, req.user.agency_id);
  const videos = db.prepare('SELECT * FROM audiovisual_videos WHERE recording_id = ? ORDER BY video_number').all(recordingId);
  res.status(201).json({
    recording: { ...recording, raw_links: rawLinks },
    videos,
    stock_created: videoCount - postedCount,
    historical: true,
  });
});

router.put('/recordings/:id', requireAny(['audiovisual.manage']), async (req, res) => {
  const recording = getRecording(req.params.id, req.user.agency_id);
  if (!recording) return res.status(404).json({ error: 'Gravação não encontrada.' });
  if (!ensureClient(req, res, recording.client_id)) return;

  const updates = [];
  const values = [];
  const fields = ['title', 'location', 'responsible_name', 'notes'];
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field} = ?`);
      values.push(normalizeText(req.body[field]));
    }
  });
  if (Object.prototype.hasOwnProperty.call(req.body, 'scheduled_start')) {
    const value = validDateTime(req.body.scheduled_start);
    if (!value) return res.status(400).json({ error: 'Data da gravação inválida.' });
    updates.push('scheduled_start = ?'); values.push(value);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'scheduled_end')) {
    const value = req.body.scheduled_end ? validDateTime(req.body.scheduled_end) : null;
    if (req.body.scheduled_end && !value) return res.status(400).json({ error: 'Horário final inválido.' });
    updates.push('scheduled_end = ?'); values.push(value);
  }
  if (!updates.length) return res.json({ recording });
  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE audiovisual_recordings SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
    .run(...values, recording.id, req.user.agency_id);
  let updated = getRecording(recording.id, req.user.agency_id);
  const calendarWarning = await syncRecordingQuietly(updated);
  updated = getRecording(recording.id, req.user.agency_id);
  res.json({ recording: updated, calendar_warning: calendarWarning });
});

router.post('/recordings/:id/complete', requireAny(['audiovisual.manage']), async (req, res) => {
  const recording = getRecording(req.params.id, req.user.agency_id);
  if (!recording) return res.status(404).json({ error: 'Gravação não encontrada.' });
  if (!ensureClient(req, res, recording.client_id)) return;
  const videoCount = Math.max(0, Math.min(100, Math.floor(Number(req.body.video_count || 0))));
  if (videoCount < 1) return res.status(400).json({ error: 'Informe quantos vídeos foram gravados.' });
  const rawLinks = normalizeLinks(req.body.raw_links);
  const recordedDate = validDate(req.body.recorded_date) || String(recording.scheduled_start).slice(0, 10);
  const recordedAt = `${recordedDate}T${String(recording.scheduled_start).slice(11, 19) || '12:00:00'}`;

  const existingVideos = db.prepare('SELECT * FROM audiovisual_videos WHERE recording_id = ? ORDER BY video_number').all(recording.id);
  if (videoCount < existingVideos.length) {
    return res.status(400).json({ error: `Esta gravação já possui ${existingVideos.length} vídeos cadastrados. Informe no mínimo esse total.` });
  }

  const createVideos = db.transaction(() => {
    db.prepare(`
      UPDATE audiovisual_recordings
      SET status = 'recorded', recorded_at = ?, video_count = ?, raw_links_json = ?, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(recordedAt, videoCount, JSON.stringify(rawLinks), recording.id, req.user.agency_id);

    const insert = db.prepare(`
      INSERT INTO audiovisual_videos (
        agency_id, client_id, recording_id, video_number, title, status, created_by
      ) VALUES (?, ?, ?, ?, ?, 'recorded', ?)
    `);
    for (let number = existingVideos.length + 1; number <= videoCount; number += 1) {
      insert.run(
        req.user.agency_id,
        recording.client_id,
        recording.id,
        number,
        `${recording.client_name} — Vídeo ${String(number).padStart(2, '0')}`,
        req.user.id,
      );
    }
  });
  createVideos();

  let updated = getRecording(recording.id, req.user.agency_id);
  const calendarWarning = await syncRecordingQuietly(updated);
  updated = getRecording(recording.id, req.user.agency_id);
  const videos = db.prepare('SELECT * FROM audiovisual_videos WHERE recording_id = ? ORDER BY video_number').all(recording.id);
  res.json({ recording: { ...updated, raw_links: rawLinks }, videos, calendar_warning: calendarWarning });
});

router.post('/recordings/:id/cancel', requireAny(['audiovisual.manage']), async (req, res) => {
  const recording = getRecording(req.params.id, req.user.agency_id);
  if (!recording) return res.status(404).json({ error: 'Gravação não encontrada.' });
  if (!ensureClient(req, res, recording.client_id)) return;
  db.prepare("UPDATE audiovisual_recordings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(recording.id, req.user.agency_id);
  const updated = getRecording(recording.id, req.user.agency_id);
  const calendarWarning = await syncRecordingQuietly(updated);
  res.json({ recording: updated, calendar_warning: calendarWarning });
});

router.delete('/recordings/:id', requireAny(['audiovisual.manage']), async (req, res) => {
  const recording = getRecording(req.params.id, req.user.agency_id);
  if (!recording) return res.status(404).json({ error: 'Gravação não encontrada.' });
  if (!ensureClient(req, res, recording.client_id)) return;
  const posted = Number(db.prepare("SELECT COUNT(*) AS total FROM audiovisual_videos WHERE recording_id = ? AND status = 'posted'").get(recording.id)?.total || 0);
  if (posted > 0) return res.status(400).json({ error: 'Não é possível excluir uma gravação que já possui vídeos postados.' });
  try { await deleteRecordingEvent({ recording, agencyId: req.user.agency_id }); } catch (error) { console.warn('[AUDIOVISUAL] Falha ao remover evento:', error.message); }
  db.prepare('DELETE FROM audiovisual_recordings WHERE id = ? AND agency_id = ?').run(recording.id, req.user.agency_id);
  res.json({ ok: true });
});

router.get('/videos', (req, res) => {
  const ids = selectedClientIds(req, res);
  if (!ids) return;
  if (!ids.length) return res.json({ videos: [] });
  const placeholders = ids.map(() => '?').join(',');
  const requestedStatus = String(req.query.status || '').trim();
  const statusSql = VIDEO_STATUSES.has(requestedStatus) ? ' AND v.status = ?' : '';
  const params = [req.user.agency_id, ...ids, ...(statusSql ? [requestedStatus] : [])];
  const videos = db.prepare(`
    SELECT v.*, c.name AS client_name, c.logo_color AS client_color,
           r.scheduled_start AS recording_date, r.raw_links_json,
           u.name AS editor_name
    FROM audiovisual_videos v
    JOIN clients c ON c.id = v.client_id
    JOIN audiovisual_recordings r ON r.id = v.recording_id
    LEFT JOIN users u ON u.id = v.editor_user_id
    WHERE v.agency_id = ? AND v.client_id IN (${placeholders})${statusSql}
    ORDER BY CASE v.status WHEN 'recorded' THEN 1 WHEN 'editing' THEN 2 WHEN 'edited' THEN 3 WHEN 'approved' THEN 3 WHEN 'dated' THEN 4 WHEN 'scheduled' THEN 5 ELSE 6 END,
             r.scheduled_start DESC, v.video_number ASC
  `).all(...params);

  const videoIds = videos.map((video) => Number(video.id));
  let schedules = [];
  if (videoIds.length) {
    const schedulePlaceholders = videoIds.map(() => '?').join(',');
    schedules = db.prepare(`
      SELECT * FROM audiovisual_video_schedules
      WHERE agency_id = ? AND video_id IN (${schedulePlaceholders}) AND status <> 'cancelled'
      ORDER BY scheduled_at ASC
    `).all(req.user.agency_id, ...videoIds);
  }
  const scheduleMap = new Map();
  schedules.forEach((schedule) => {
    const list = scheduleMap.get(Number(schedule.video_id)) || [];
    list.push(schedule);
    scheduleMap.set(Number(schedule.video_id), list);
  });

  res.json({
    videos: videos.map((video) => ({
      ...video,
      status: video.status === 'edited' ? 'approved' : video.status,
      final_links: parseJsonArray(video.final_links_json),
      raw_links: parseJsonArray(video.raw_links_json),
      schedules: scheduleMap.get(Number(video.id)) || [],
    })),
  });
});

router.put('/videos/:id/status', (req, res) => {
  const video = db.prepare(`
    SELECT v.*, c.name AS client_name FROM audiovisual_videos v
    JOIN clients c ON c.id = v.client_id
    WHERE v.id = ? AND v.agency_id = ?
  `).get(req.params.id, req.user.agency_id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  if (!ensureClient(req, res, video.client_id)) return;
  const status = String(req.body.status || '').trim();
  if (!VIDEO_STATUSES.has(status)) return res.status(400).json({ error: 'Status de vídeo inválido.' });

  const editingAction = ['recorded', 'editing', 'approved'].includes(status);
  const publishingAction = ['dated', 'scheduled', 'posted'].includes(status);
  if (editingAction && !hasAny(req.user, ['audiovisual.manage', 'audiovisual.edit'])) {
    return res.status(403).json({ error: 'Você não possui permissão para gerenciar a edição.' });
  }
  if (publishingAction && !hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) {
    return res.status(403).json({ error: 'Você não possui permissão para agendar ou postar vídeos.' });
  }

  const updates = ['status = ?', "updated_at = datetime('now')"];
  const values = [status];
  if (status === 'editing') {
    updates.push('editor_user_id = ?'); values.push(req.user.id);
  }
  if (status === 'approved') {
    const finalLinks = normalizeLinks(req.body.final_links?.length ? req.body.final_links : parseJsonArray(video.final_links_json));
    if (!finalLinks.length) return res.status(400).json({ error: 'Adicione pelo menos um link do vídeo final para concluir a edição.' });
    updates.push('final_links_json = ?'); values.push(JSON.stringify(finalLinks));
    updates.push('edit_notes = ?'); values.push(normalizeText(req.body.edit_notes));
    updates.push('editor_user_id = ?'); values.push(req.user.id);
    updates.push("edited_at = datetime('now')");
  }
  if (status === 'dated') {
    if (!['approved', 'edited'].includes(video.status) || !parseJsonArray(video.final_links_json).length) {
      return res.status(400).json({ error: 'O vídeo precisa estar aprovado antes de receber uma data.' });
    }
  }
  if (status === 'scheduled') {
    if (video.status !== 'dated') {
      return res.status(400).json({ error: 'O vídeo precisa estar Datado antes de ser marcado como Agendado.' });
    }
    const totalSchedules = Number(db.prepare("SELECT COUNT(*) AS total FROM audiovisual_video_schedules WHERE video_id = ? AND status IN ('dated','scheduled')").get(video.id)?.total || 0);
    if (!totalSchedules) return res.status(400).json({ error: 'Envie o vídeo para a grade e defina a data antes de marcar como Agendado.' });
    db.prepare("UPDATE audiovisual_video_schedules SET status = 'scheduled', updated_at = datetime('now') WHERE video_id = ? AND status = 'dated'").run(video.id);
  }
  if (status === 'posted') {
    if (video.status !== 'scheduled') return res.status(400).json({ error: 'O vídeo precisa estar agendado antes de ser marcado como postado.' });
    const postedAt = validDateTime(req.body.posted_at) || new Date().toISOString();
    updates.push('posted_at = ?'); values.push(postedAt);
    db.prepare(`UPDATE audiovisual_video_schedules SET status = 'posted', posted_at = COALESCE(posted_at, ?), updated_at = datetime('now') WHERE video_id = ? AND status = 'scheduled'`)
      .run(postedAt, video.id);
  } else if (video.status === 'posted' && status !== 'posted') {
    updates.push('posted_at = NULL');
  }

  db.prepare(`UPDATE audiovisual_videos SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`)
    .run(...values, video.id, req.user.agency_id);
  const updated = db.prepare('SELECT * FROM audiovisual_videos WHERE id = ? AND agency_id = ?').get(video.id, req.user.agency_id);
  res.json({ video: { ...updated, final_links: parseJsonArray(updated.final_links_json) } });
});

router.post('/videos/:id/schedules', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) {
    return res.status(403).json({ error: 'Você não possui permissão para agendar publicações.' });
  }
  const video = db.prepare('SELECT * FROM audiovisual_videos WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  if (!ensureClient(req, res, video.client_id)) return;
  if (!['approved', 'edited'].includes(video.status) || !parseJsonArray(video.final_links_json).length) {
    return res.status(400).json({ error: 'O vídeo precisa estar aprovado antes de ser enviado para a grade.' });
  }
  const scheduledAt = validDateTime(req.body.scheduled_at);
  if (!scheduledAt) return res.status(400).json({ error: 'Informe a data e o horário do agendamento.' });
  const platform = normalizeText(req.body.platform) || 'instagram';
  const info = db.prepare(`
    INSERT INTO audiovisual_video_schedules (agency_id, video_id, platform, scheduled_at, status, created_by)
    VALUES (?, ?, ?, ?, 'dated', ?)
  `).run(req.user.agency_id, video.id, platform.slice(0, 40), scheduledAt, req.user.id);
  db.prepare("UPDATE audiovisual_videos SET status = 'dated', updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
    .run(video.id, req.user.agency_id);
  const schedule = db.prepare('SELECT * FROM audiovisual_video_schedules WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ schedule });
});

router.delete('/videos/:videoId/schedules/:scheduleId', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) {
    return res.status(403).json({ error: 'Você não possui permissão para alterar agendamentos.' });
  }
  const video = db.prepare('SELECT * FROM audiovisual_videos WHERE id = ? AND agency_id = ?').get(req.params.videoId, req.user.agency_id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  if (!ensureClient(req, res, video.client_id)) return;
  db.prepare("UPDATE audiovisual_video_schedules SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND video_id = ? AND agency_id = ?")
    .run(req.params.scheduleId, video.id, req.user.agency_id);
  const remaining = Number(db.prepare("SELECT COUNT(*) AS total FROM audiovisual_video_schedules WHERE video_id = ? AND status IN ('dated','scheduled')").get(video.id)?.total || 0);
  if (!remaining && ['dated', 'scheduled'].includes(video.status)) {
    db.prepare("UPDATE audiovisual_videos SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND agency_id = ?").run(video.id, req.user.agency_id);
  }
  res.json({ ok: true });
});

router.post('/videos/:id/post', (req, res) => {
  if (!hasAny(req.user, ['audiovisual.manage', 'audiovisual.publish'])) {
    return res.status(403).json({ error: 'Você não possui permissão para marcar publicações.' });
  }
  const video = db.prepare('SELECT * FROM audiovisual_videos WHERE id = ? AND agency_id = ?').get(req.params.id, req.user.agency_id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  if (!ensureClient(req, res, video.client_id)) return;
  const postedAt = validDateTime(req.body.posted_at) || new Date().toISOString();
  const postUrl = normalizeText(req.body.post_url);
  const scheduleId = Number(req.body.schedule_id || 0);
  if (scheduleId) {
    db.prepare(`
      UPDATE audiovisual_video_schedules
      SET status = 'posted', posted_at = ?, post_url = ?, updated_at = datetime('now')
      WHERE id = ? AND video_id = ? AND agency_id = ?
    `).run(postedAt, postUrl, scheduleId, video.id, req.user.agency_id);
    const remaining = Number(db.prepare("SELECT COUNT(*) AS total FROM audiovisual_video_schedules WHERE video_id = ? AND status IN ('dated','scheduled')").get(video.id)?.total || 0);
    if (!remaining) {
      db.prepare("UPDATE audiovisual_videos SET status = 'posted', posted_at = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
        .run(postedAt, video.id, req.user.agency_id);
    }
  } else {
    db.prepare(`UPDATE audiovisual_video_schedules SET status = 'posted', posted_at = COALESCE(posted_at, ?), post_url = COALESCE(?, post_url), updated_at = datetime('now') WHERE video_id = ? AND status = 'scheduled'`)
      .run(postedAt, postUrl, video.id);
    db.prepare("UPDATE audiovisual_videos SET status = 'posted', posted_at = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?")
      .run(postedAt, video.id, req.user.agency_id);
  }
  res.json({ ok: true });
});

router.put('/clients/:clientId/settings', requireAny(['audiovisual.manage']), (req, res) => {
  const client = ensureClient(req, res, req.params.clientId);
  if (!client) return;
  const videosPerPeriod = Math.max(1, Math.min(100, Math.floor(Number(req.body.videos_per_period || 2))));
  const cadencePeriod = req.body.cadence_period === 'month' ? 'month' : 'week';
  const leadDays = Math.max(0, Math.min(90, Math.floor(Number(req.body.recording_lead_days ?? 7))));
  const preferredDays = Array.isArray(req.body.preferred_days)
    ? req.body.preferred_days.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    : [];
  db.prepare(`
    INSERT INTO audiovisual_client_settings (
      agency_id, client_id, is_recording_client, videos_per_period, cadence_period, recording_lead_days, preferred_days_json, updated_by, updated_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(agency_id, client_id) DO UPDATE SET
      videos_per_period = excluded.videos_per_period,
      cadence_period = excluded.cadence_period,
      recording_lead_days = excluded.recording_lead_days,
      preferred_days_json = excluded.preferred_days_json,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(req.user.agency_id, client.id, videosPerPeriod, cadencePeriod, leadDays, JSON.stringify(preferredDays), req.user.id);
  res.json({ settings: formatSettings(getClientSettings(req.user.agency_id, client.id)) });
});

module.exports = router;
