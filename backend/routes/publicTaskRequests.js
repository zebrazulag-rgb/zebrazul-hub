const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { persistMedia } = require('../services/mediaStorage');

const router = express.Router();
const requestWindows = new Map();
const REQUEST_TYPES = ['Post estático', 'Carrossel', 'Reels', 'Stories', 'Campanha', 'Landing page', 'Branding', 'Material impresso', 'Evento', 'Audiovisual', 'Tráfego / mídia', 'Outro'];

const REQUEST_TYPE_META = {
  'Post estático': { demand_type: 'static_post', front_name: 'Social Media', task_type: 'post', content_type: 'feed' },
  'Carrossel': { demand_type: 'carousel', front_name: 'Social Media', task_type: 'post', content_type: 'carrossel' },
  'Reels': { demand_type: 'reels', front_name: 'Social Media', task_type: 'post', content_type: 'reels' },
  'Stories': { demand_type: 'stories', front_name: 'Social Media', task_type: 'post', content_type: 'story' },
  'Campanha': { demand_type: 'campaign', front_name: 'Social Media', task_type: 'basic', content_type: null },
  'Landing page': { demand_type: 'landing_page', front_name: 'Site/LP', task_type: 'basic', content_type: null },
  'Branding': { demand_type: 'branding', front_name: 'Branding', task_type: 'basic', content_type: null },
  'Material impresso': { demand_type: 'print', front_name: 'Design', task_type: 'basic', content_type: 'print' },
  'Evento': { demand_type: 'event', front_name: 'Design', task_type: 'basic', content_type: null },
  'Audiovisual': { demand_type: 'audiovisual', front_name: 'Audiovisual', task_type: 'basic', content_type: null },
  'Tráfego / mídia': { demand_type: 'traffic', front_name: 'Tráfego', task_type: 'basic', content_type: null },
  'Outro': { demand_type: 'other', front_name: 'Outros', task_type: 'basic', content_type: null },
};

function clean(value, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function activeLink(token) {
  return db.prepare(`
    SELECT l.id, l.agency_id, l.client_id, l.active,
           c.name AS client_name, c.logo_color AS client_color, c.avatar_data AS client_avatar, c.status AS client_status,
           a.name AS agency_name
    FROM client_task_request_links l
    JOIN clients c ON c.id = l.client_id AND c.agency_id = l.agency_id
    JOIN agencies a ON a.id = l.agency_id
    WHERE l.token = ?
  `).get(String(token || ''));
}

function rateLimit(req, token) {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = `${token}:${ip}`;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const current = (requestWindows.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (current.length >= 5) return false;
  current.push(now);
  requestWindows.set(key, current);
  if (requestWindows.size > 5000) {
    for (const [entryKey, stamps] of requestWindows.entries()) {
      if (!stamps.some((stamp) => now - stamp < windowMs)) requestWindows.delete(entryKey);
    }
  }
  return true;
}

function adminCreator(agencyId) {
  return db.prepare(`
    SELECT id
    FROM users
    WHERE agency_id = ? AND role = 'admin'
    ORDER BY is_agency_owner DESC, is_platform_owner DESC, id ASC
    LIMIT 1
  `).get(Number(agencyId));
}

function defaultAssignee(clientId, agencyId) {
  const client = db.prepare('SELECT responsible_user_id FROM clients WHERE id = ? AND agency_id = ?').get(Number(clientId), Number(agencyId));
  if (Number(client?.responsible_user_id || 0)) {
    const responsible = db.prepare(`SELECT id FROM users WHERE id = ? AND agency_id = ? AND role IN ('admin','team')`).get(Number(client.responsible_user_id), Number(agencyId));
    if (responsible) return responsible;
  }
  const operations = db.prepare(`
    SELECT id FROM users
    WHERE agency_id = ? AND role IN ('admin','team') AND COALESCE(is_operations_head, 0) = 1
    ORDER BY id ASC LIMIT 1
  `).get(Number(agencyId));
  return operations || adminCreator(agencyId);
}

function uniqueProtocol() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const protocol = `DEM-${date}-${suffix}`;
    const exists = db.prepare('SELECT 1 FROM client_task_requests WHERE protocol = ?').get(protocol);
    if (!exists) return protocol;
  }
  return `DEM-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function notificationRecipients(agencyId) {
  return db.prepare(`
    SELECT id
    FROM users
    WHERE agency_id = ? AND (role = 'admin' OR is_operations_head = 1)
  `).all(Number(agencyId));
}

router.get('/:token', (req, res) => {
  const link = activeLink(req.params.token);
  if (!link || Number(link.active) !== 1 || link.client_status !== 'active') {
    return res.status(404).json({ error: 'Este link de solicitações está inválido ou desativado.' });
  }

  res.json({
    client: {
      id: Number(link.client_id),
      name: link.client_name,
      logo_color: link.client_color,
      avatar_data: link.client_avatar,
    },
    agency_name: link.agency_name,
    request_types: REQUEST_TYPES,
  });
});

router.post('/:token', (req, res) => {
  const link = activeLink(req.params.token);
  if (!link || Number(link.active) !== 1 || link.client_status !== 'active') {
    return res.status(404).json({ error: 'Este link de solicitações está inválido ou desativado.' });
  }
  if (!rateLimit(req, req.params.token)) {
    return res.status(429).json({ error: 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.' });
  }

  const requesterName = clean(req.body?.requester_name, 120);
  const requesterEmail = clean(req.body?.requester_email, 180);
  const requesterPhone = clean(req.body?.requester_phone, 80);
  const title = clean(req.body?.title, 220);
  const description = clean(req.body?.description, 8000);
  const requestType = clean(req.body?.request_type, 80) || 'Outro';
  const requestedDueDate = clean(req.body?.requested_due_date, 10);
  const urgency = req.body?.urgency === 'urgent' ? 'urgent' : 'normal';
  const referencesText = clean(req.body?.references_text, 4000);
  const notes = clean(req.body?.notes, 4000);
  const goal = clean(req.body?.goal, 3000);
  const briefing = req.body?.briefing && typeof req.body.briefing === 'object' && !Array.isArray(req.body.briefing) ? req.body.briefing : {};
  const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, 3) : [];

  if (!requesterName) return res.status(400).json({ error: 'Informe seu nome.' });
  if (!title) return res.status(400).json({ error: 'Informe o que você precisa.' });
  if (!description) return res.status(400).json({ error: 'Explique brevemente a demanda.' });
  if (!goal) return res.status(400).json({ error: 'Conte o que precisa acontecer por causa dessa entrega.' });
  if (!requestedDueDate) return res.status(400).json({ error: 'Informe quando você precisa dessa entrega.' });
  if (requestedDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDueDate)) {
    return res.status(400).json({ error: 'Data desejada inválida.' });
  }
  if (!REQUEST_TYPES.includes(requestType)) {
    return res.status(400).json({ error: 'Tipo de solicitação inválido.' });
  }

  const totalEncodedSize = files.reduce((sum, file) => sum + String(file?.data || '').length, 0);
  if (totalEncodedSize > 11_000_000) {
    return res.status(413).json({ error: 'Os anexos são muito grandes. Envie no máximo 8 MB no total.' });
  }

  const creator = adminCreator(link.agency_id);
  const assignee = defaultAssignee(link.client_id, link.agency_id);
  if (!creator || !assignee) return res.status(503).json({ error: 'Não foi possível encaminhar a solicitação para a equipe.' });
  const requestMeta = REQUEST_TYPE_META[requestType] || REQUEST_TYPE_META.Outro;
  const briefingJson = JSON.stringify({
    version: 1, demand_type: requestMeta.demand_type, demand_label: requestType, group: requestMeta.front_name,
    goal, details: briefing.details || {}, references: referencesText, notes, created_from: 'client_portal',
    requester: { name: requesterName, email: requesterEmail || '', phone: requesterPhone || '' },
  });

  const protocol = uniqueProtocol();
  const createRequest = db.transaction(() => {
    const taskInfo = db.prepare(`
      INSERT INTO tasks (
        agency_id, client_id, created_by, parent_task_id, task_type, title, description, content_type,
        project_name, front_name, priority, goal, briefing_json, due_date, status, workflow_stage, is_featured
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'todo', 1)
    `).run(
      link.agency_id,
      link.client_id,
      creator.id,
      requestMeta.task_type,
      title,
      description,
      requestMeta.content_type,
      `Solicitação cliente · ${requestType}`,
      requestMeta.front_name,
      urgency === 'urgent' ? 'urgent' : 'medium',
      goal,
      briefingJson,
      requestedDueDate
    );

    db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)').run(taskInfo.lastInsertRowid, assignee.id);
    db.prepare(`INSERT INTO task_briefing_events (agency_id, task_id, user_id, event_type, snapshot_json) VALUES (?, ?, NULL, 'created', ?)` )
      .run(link.agency_id, taskInfo.lastInsertRowid, briefingJson);

    const requestInfo = db.prepare(`
      INSERT INTO client_task_requests (
        agency_id, client_id, task_id, request_link_id, protocol,
        requester_name, requester_email, requester_phone, request_type,
        requested_due_date, urgency, references_text, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      link.agency_id,
      link.client_id,
      taskInfo.lastInsertRowid,
      link.id,
      protocol,
      requesterName,
      requesterEmail || null,
      requesterPhone || null,
      requestType,
      requestedDueDate || null,
      urgency,
      referencesText || null,
      notes || null
    );

    const insertFile = db.prepare(`
      INSERT INTO client_task_request_files (request_id, file_url, mime, filename)
      VALUES (?, ?, ?, ?)
    `);
    files.forEach((file) => {
      const data = String(file?.data || '');
      if (!data) return;
      const mime = clean(file?.mime, 120) || 'application/octet-stream';
      const filename = clean(file?.filename, 220) || 'anexo';
      const fileUrl = persistMedia(data, mime);
      if (fileUrl) insertFile.run(requestInfo.lastInsertRowid, fileUrl, mime, filename);
    });

    db.prepare(`
      INSERT INTO client_task_request_events (agency_id, request_id, user_id, event_type, message)
      VALUES (?, ?, NULL, 'submitted', ?)
    `).run(link.agency_id, requestInfo.lastInsertRowid, `Solicitação enviada por ${requesterName}.`);

    const recipients = notificationRecipients(link.agency_id);
    const insertNotification = db.prepare(`
      INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id, link)
      VALUES (?, ?, 'task_request', ?, ?, 'task', ?, ?)
    `);
    recipients.forEach((recipient) => {
      insertNotification.run(
        link.agency_id,
        recipient.id,
        `Nova solicitação — ${link.client_name}`,
        `${title} • ${requesterName}`,
        taskInfo.lastInsertRowid,
        `/tarefas?task_id=${taskInfo.lastInsertRowid}`
      );
    });

    return { taskId: Number(taskInfo.lastInsertRowid), requestId: Number(requestInfo.lastInsertRowid) };
  });

  const created = createRequest();
  res.status(201).json({
    ok: true,
    protocol,
    task_id: created.taskId,
    title,
    client_name: link.client_name,
    submitted_at: new Date().toISOString(),
  });
});

module.exports = router;
