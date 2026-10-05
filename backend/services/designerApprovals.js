const crypto = require('crypto');
const db = require('../db/database');

function ensureDesignerApprovalStorage() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS designer_approval_states (
      task_id INTEGER PRIMARY KEY,
      agency_id INTEGER NOT NULL,
      client_id INTEGER,
      direction_status TEXT NOT NULL DEFAULT 'pending',
      direction_feedback TEXT,
      direction_by INTEGER,
      direction_at TEXT,
      client_status TEXT NOT NULL DEFAULT 'waiting',
      client_feedback TEXT,
      client_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (direction_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_designer_approval_states_agency_client
      ON designer_approval_states(agency_id, client_id);

    CREATE TABLE IF NOT EXISTS designer_approval_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agency_id, client_id),
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Algumas instalações já possuíam uma versão antiga da tabela de links.
  // CREATE TABLE IF NOT EXISTS não acrescenta colunas em tabelas existentes,
  // então garantimos aqui a compatibilidade sem apagar nenhum link já criado.
  const linkColumns = new Set(
    db.prepare(`PRAGMA table_info(designer_approval_links)`).all().map((column) => String(column.name))
  );
  const ensureLinkColumn = (name, definition) => {
    if (linkColumns.has(name)) return;
    db.exec(`ALTER TABLE designer_approval_links ADD COLUMN ${name} ${definition}`);
    linkColumns.add(name);
  };

  ensureLinkColumn('agency_id', 'INTEGER');
  ensureLinkColumn('client_id', 'INTEGER');
  ensureLinkColumn('token', 'TEXT');
  ensureLinkColumn('active', 'INTEGER NOT NULL DEFAULT 1');
  ensureLinkColumn('created_by', 'INTEGER');
  ensureLinkColumn('created_at', 'TEXT');
  ensureLinkColumn('updated_at', 'TEXT');

  db.exec(`
    UPDATE designer_approval_links
    SET active = COALESCE(active, 1),
        created_at = COALESCE(created_at, datetime('now')),
        updated_at = COALESCE(updated_at, created_at, datetime('now'));

    CREATE INDEX IF NOT EXISTS idx_designer_approval_links_token
      ON designer_approval_links(token);

    CREATE INDEX IF NOT EXISTS idx_designer_approval_links_agency_client
      ON designer_approval_links(agency_id, client_id);
  `);
}

ensureDesignerApprovalStorage();

function parseGallery(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function imageGalleryForTask(task) {
  const gallery = parseGallery(task?.media_gallery).filter((item) => {
    const mime = String(item?.mime || item?.type || '').toLowerCase();
    const data = String(item?.data || item?.url || item?.src || '');
    return Boolean(data) && (
      mime.startsWith('image/') ||
      data.startsWith('data:image/') ||
      /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(data)
    );
  });

  if (gallery.length) {
    return gallery.map((item) => ({
      data: item.data || item.url || item.src || '',
      mime: item.mime || item.type || 'image/jpeg',
      filename: item.filename || item.name || '',
    }));
  }

  const attachmentData = String(task?.attachment_data || '');
  const attachmentMime = String(task?.attachment_mime || '').toLowerCase();
  const attachmentIsImage = Boolean(attachmentData) && (
    attachmentMime.startsWith('image/') ||
    attachmentData.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(attachmentData)
  );

  return attachmentIsImage
    ? [{ data: attachmentData, mime: task?.attachment_mime || 'image/jpeg', filename: task?.attachment_filename || '' }]
    : [];
}

function defaultApprovalState(task) {
  return {
    task_id: Number(task?.id || 0),
    agency_id: Number(task?.agency_id || 0),
    client_id: task?.client_id ? Number(task.client_id) : null,
    direction_status: 'pending',
    direction_feedback: null,
    direction_by: null,
    direction_at: null,
    client_status: 'waiting',
    client_feedback: null,
    client_at: null,
  };
}

function effectiveClientIdForTask(task) {
  const directClientId = Number(task?.client_id || 0) || null;
  if (directClientId) return directClientId;
  const parentTaskId = Number(task?.parent_task_id || 0) || null;
  if (!parentTaskId || !task?.agency_id) return null;
  const parent = db.prepare(`
    SELECT client_id
    FROM tasks
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(parentTaskId, Number(task.agency_id));
  return Number(parent?.client_id || 0) || null;
}

function persistInheritedClient(task) {
  const effectiveClientId = effectiveClientIdForTask(task);
  if (!effectiveClientId || Number(task?.client_id || 0) === effectiveClientId) return effectiveClientId;
  db.prepare(`
    UPDATE tasks
    SET client_id = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ? AND client_id IS NULL
  `).run(effectiveClientId, Number(task.id), Number(task.agency_id));
  task.client_id = effectiveClientId;
  return effectiveClientId;
}

function getApprovalState(taskId, agencyId) {
  ensureDesignerApprovalStorage();
  const row = db.prepare(`
    SELECT task_id, agency_id, client_id, direction_status, direction_feedback,
           direction_by, direction_at, client_status, client_feedback, client_at,
           created_at, updated_at
    FROM designer_approval_states
    WHERE task_id = ? AND agency_id = ?
  `).get(Number(taskId), Number(agencyId));

  const task = db.prepare(`
    SELECT id, agency_id, client_id, direction_status, direction_feedback,
           direction_by, direction_at, client_status, client_feedback, client_at,
           approval_status, workflow_stage, created_at, updated_at
    FROM tasks
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(taskId), Number(agencyId));

  if (!row && !task) return null;

  const legacyApprovalStatus = String(task?.approval_status || '').toLowerCase();
  const legacyWorkflow = String(task?.workflow_stage || '').toLowerCase();
  const inferredDirection = legacyApprovalStatus === 'approved' || legacyApprovalStatus === 'pending_approval'
    || legacyApprovalStatus === 'send' || legacyWorkflow === 'external_approval' || legacyWorkflow === 'approved'
      ? 'approved'
      : legacyApprovalStatus === 'changes_requested' || legacyWorkflow === 'correction'
        ? 'changes_requested'
        : 'pending';
  const inferredClient = legacyApprovalStatus === 'approved' || legacyWorkflow === 'approved'
    ? 'approved'
    : inferredDirection === 'approved' ? 'pending' : 'waiting';

  const state = {
    task_id: Number(task?.id || row?.task_id || taskId),
    agency_id: Number(task?.agency_id || row?.agency_id || agencyId),
    client_id: task?.client_id ?? row?.client_id ?? null,
    direction_status: (task?.direction_status && task.direction_status !== 'pending')
      ? task.direction_status
      : (row?.direction_status || task?.direction_status || inferredDirection),
    direction_feedback: task?.direction_feedback || row?.direction_feedback || null,
    direction_by: task?.direction_by || row?.direction_by || null,
    direction_at: task?.direction_at || row?.direction_at || null,
    client_status: (task?.client_status && task.client_status !== 'waiting')
      ? task.client_status
      : (row?.client_status || task?.client_status || inferredClient),
    client_feedback: task?.client_feedback || row?.client_feedback || null,
    client_at: task?.client_at || row?.client_at || null,
    created_at: row?.created_at || task?.created_at || null,
    updated_at: row?.updated_at || task?.updated_at || null,
  };
  const clientFeedback = String(state.client_feedback || '').trim();
  const directionFeedback = String(state.direction_feedback || '').trim();
  state.correction_feedback = state.client_status === 'changes_requested' && clientFeedback
    ? clientFeedback
    : state.direction_status === 'changes_requested' && directionFeedback
      ? directionFeedback
      : (clientFeedback || directionFeedback || null);
  return state;
}

function getApprovalStates(taskIds, agencyId) {
  ensureDesignerApprovalStorage();
  const ids = [...new Set((taskIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  ids.forEach((taskId) => {
    const state = getApprovalState(taskId, agencyId);
    if (state) map.set(Number(taskId), state);
  });
  return map;
}

function resetApprovalForTask(task) {
  if (!task?.id || !task?.agency_id) return;
  ensureDesignerApprovalStorage();
  persistInheritedClient(task);
  db.prepare(`
    INSERT INTO designer_approval_states (
      task_id, agency_id, client_id,
      direction_status, direction_feedback, direction_by, direction_at,
      client_status, client_feedback, client_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', NULL, NULL, NULL, 'waiting', NULL, NULL, datetime('now'), datetime('now'))
    ON CONFLICT(task_id) DO UPDATE SET
      agency_id = excluded.agency_id,
      client_id = excluded.client_id,
      direction_status = 'pending',
      direction_feedback = NULL,
      direction_by = NULL,
      direction_at = NULL,
      client_status = 'waiting',
      client_feedback = NULL,
      client_at = NULL,
      updated_at = datetime('now')
  `).run(Number(task.id), Number(task.agency_id), task.client_id ? Number(task.client_id) : null);

  db.prepare(`
    UPDATE tasks
    SET direction_status = 'pending', direction_feedback = NULL, direction_by = NULL, direction_at = NULL,
        client_status = 'waiting', client_feedback = NULL, client_at = NULL,
        updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(Number(task.id), Number(task.agency_id));
}

function ensureApprovalState(task) {
  persistInheritedClient(task);
  const current = getApprovalState(task.id, task.agency_id) || defaultApprovalState(task);
  const existingRow = db.prepare(`
    SELECT task_id
    FROM designer_approval_states
    WHERE task_id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(task.id), Number(task.agency_id));

  if (!existingRow) {
    db.prepare(`
      INSERT INTO designer_approval_states (
        task_id, agency_id, client_id,
        direction_status, direction_feedback, direction_by, direction_at,
        client_status, client_feedback, client_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      Number(task.id),
      Number(task.agency_id),
      current.client_id ? Number(current.client_id) : null,
      current.direction_status || 'pending',
      current.direction_feedback || null,
      current.direction_by ? Number(current.direction_by) : null,
      current.direction_at || null,
      current.client_status || 'waiting',
      current.client_feedback || null,
      current.client_at || null
    );
  }

  return getApprovalState(task.id, task.agency_id) || current;
}

function legacyStatusForWorkflow(stage) {
  if (stage === 'posted') return 'posted';
  if (stage === 'approved' || stage === 'scheduled') return 'done';
  if (['in_progress', 'correction', 'approval'].includes(stage)) return 'in_progress';
  return 'pending';
}

function updateTaskWorkflow(taskId, agencyId, stage) {
  const designerCompleted = stage === 'correction' ? 0 : (['approval', 'approved', 'scheduled', 'posted'].includes(stage) ? 1 : null);
  if (designerCompleted === null) {
    db.prepare(`
      UPDATE tasks
      SET workflow_stage = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(stage, legacyStatusForWorkflow(stage), Number(taskId), Number(agencyId));
    return;
  }
  db.prepare(`
    UPDATE tasks
    SET workflow_stage = ?, status = ?, designer_completed = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(stage, legacyStatusForWorkflow(stage), designerCompleted, Number(taskId), Number(agencyId));
}

function normalizeFeedContentType(contentType) {
  if (contentType === 'carrossel') return 'carrossel';
  if (contentType === 'story' || contentType === 'stories') return 'story';
  return 'feed';
}

function promoteTaskToFeed(task) {
  if (!task?.client_id) throw new Error('A tarefa precisa estar vinculada a um cliente');
  const images = imageGalleryForTask(task);
  if (!images.length) throw new Error('A tarefa precisa ter uma imagem para entrar na grade');

  const galleryJson = images.length ? JSON.stringify(images) : null;
  const mediaData = images[0]?.data || task.attachment_data || null;
  const mediaMime = images[0]?.mime || task.attachment_mime || 'image/jpeg';
  const contentType = normalizeFeedContentType(task.content_type);
  const creatorId = Number(task.created_by || 0) || null;
  const clientStatus = String(task.client_status || '').toLowerCase();
  const postStatus = clientStatus === 'approved' ? 'approved' : 'pending_approval';
  const postWorkflow = clientStatus === 'approved' ? 'approved' : 'approval';

  if (task.feed_post_id) {
    const existing = db.prepare('SELECT id FROM posts WHERE id = ? AND agency_id = ?').get(Number(task.feed_post_id), Number(task.agency_id));
    if (existing) {
      db.prepare(`
        UPDATE posts
        SET title = ?, caption = ?, content_type = ?, media_data = ?, media_mime = ?, media_gallery = ?,
            scheduled_at = COALESCE(?, scheduled_at), status = ?, workflow_stage = ?,
            feed_visible = 1, client_feedback = ?, updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(
        task.title,
        task.caption || '',
        contentType,
        mediaData,
        mediaMime,
        galleryJson,
        task.due_date || null,
        postStatus,
        postWorkflow,
        task.client_feedback || null,
        Number(existing.id),
        Number(task.agency_id)
      );
      return Number(existing.id);
    }
  }

  const info = db.prepare(`
    INSERT INTO posts (
      agency_id, client_id, created_by, title, caption, content_type, platforms,
      media_data, media_mime, media_gallery, scheduled_at, status, workflow_stage, feed_visible, client_feedback
    ) VALUES (?, ?, ?, ?, ?, ?, '["instagram"]', ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    Number(task.agency_id),
    Number(task.client_id),
    creatorId,
    task.title,
    task.caption || '',
    contentType,
    mediaData,
    mediaMime,
    galleryJson,
    task.due_date || null,
    postStatus,
    postWorkflow,
    task.client_feedback || null
  );

  db.prepare(`
    UPDATE tasks SET feed_post_id = ?, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(Number(info.lastInsertRowid), Number(task.id), Number(task.agency_id));

  return Number(info.lastInsertRowid);
}

function hideTaskFeed(task, stage = 'correction') {
  if (!task?.feed_post_id) return;
  db.prepare(`
    UPDATE posts
    SET workflow_stage = ?, feed_visible = 0, updated_at = datetime('now')
    WHERE id = ? AND agency_id = ?
  `).run(stage, Number(task.feed_post_id), Number(task.agency_id));
}

function setDirectionDecision({ task, userId, decision, feedback = null }) {
  ensureDesignerApprovalStorage();
  if (!task?.id || !task?.agency_id) throw new Error('Tarefa inválida');
  if (!['approved', 'changes_requested'].includes(decision)) throw new Error('Decisão inválida');

  persistInheritedClient(task);
  ensureApprovalState(task);
  const now = new Date().toISOString();
  const directionFeedback = String(feedback || '').trim() || null;
  if (decision === 'changes_requested' && !directionFeedback) {
    throw new Error('Informe o que precisa ser corrigido antes de enviar a correção.');
  }

  if (decision === 'approved') {
    db.prepare(`
      UPDATE designer_approval_states
      SET direction_status = 'approved', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'pending', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE task_id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    db.prepare(`
      UPDATE tasks
      SET direction_status = 'approved', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'pending', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    const currentState = getApprovalState(task.id, task.agency_id);
    if (currentState?.client_status !== 'approved') {
      updateTaskWorkflow(task.id, task.agency_id, 'approval');
      db.prepare(`UPDATE tasks SET approval_status = 'pending_approval', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));

      // A aprovação da direção já libera a peça para o cliente. Espelhamos a
      // tarefa na grade pública neste momento, em vez de esperar a decisão do
      // cliente. O link compartilhado passa a usar apenas o fluxo /public/feed.
      try {
        const refreshed = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?')
          .get(Number(task.id), Number(task.agency_id));
        promoteTaskToFeed(refreshed);
      } catch (feedError) {
        console.warn('[DESIGNER_APPROVAL] Não foi possível liberar a peça na grade do cliente:', feedError.message);
      }
    }
  } else {
    db.prepare(`
      UPDATE designer_approval_states
      SET direction_status = 'changes_requested', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'waiting', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE task_id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    db.prepare(`
      UPDATE tasks
      SET direction_status = 'changes_requested', direction_feedback = ?, direction_by = ?, direction_at = ?,
          client_status = 'waiting', client_feedback = NULL, client_at = NULL,
          updated_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(directionFeedback, Number(userId), now, Number(task.id), Number(task.agency_id));
    updateTaskWorkflow(task.id, task.agency_id, 'correction');
    db.prepare(`UPDATE tasks SET approval_status = 'changes_requested', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
      .run(Number(task.id), Number(task.agency_id));
    try {
      hideTaskFeed(task, 'correction');
    } catch (feedError) {
      console.warn('[DESIGNER_APPROVAL] Não foi possível ocultar o post durante a correção:', feedError.message);
    }
  }

  return getApprovalState(task.id, task.agency_id);
}

function approvalLinkSecret() {
  return String(
    process.env.CLIENT_APPROVAL_SECRET ||
    process.env.JWT_SECRET ||
    'zebrazul-hub-dev-secret-troque-em-producao'
  );
}

function buildStatelessApprovalToken(agencyId, clientId) {
  const normalizedAgencyId = Number(agencyId);
  const normalizedClientId = Number(clientId);
  if (!normalizedAgencyId || !normalizedClientId) return null;

  const payload = Buffer.from(JSON.stringify({
    v: 2,
    a: normalizedAgencyId,
    c: normalizedClientId,
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', approvalLinkSecret())
    .update(payload)
    .digest('base64url');

  return `zba2.${payload}.${signature}`;
}

function parseStatelessApprovalToken(token) {
  const value = String(token || '').trim();
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'zba2') return null;

  const [, payload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', approvalLinkSecret())
    .update(payload)
    .digest('base64url');

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const agencyId = Number(decoded?.a);
    const clientId = Number(decoded?.c);
    if (Number(decoded?.v) !== 2 || !agencyId || !clientId) return null;

    // O token assinado não basta sozinho: o cliente ainda precisa existir e
    // pertencer à agência informada. Isso impede tokens válidos apontando para
    // um tenant diferente.
    const client = db.prepare(`
      SELECT id, agency_id
      FROM clients
      WHERE id = ? AND agency_id = ?
      LIMIT 1
    `).get(clientId, agencyId);
    if (!client) return null;

    return {
      id: null,
      agency_id: agencyId,
      client_id: clientId,
      token: value,
      active: 1,
      created_by: null,
      created_at: null,
      updated_at: null,
      stateless: true,
    };
  } catch {
    return null;
  }
}

function getLegacyClientApprovalLink(agencyId, clientId) {
  try {
    ensureDesignerApprovalStorage();
    return db.prepare(`
      SELECT id, agency_id, client_id, token, active, created_by, created_at, updated_at
      FROM designer_approval_links
      WHERE agency_id = ? AND client_id = ? AND active = 1
        AND token IS NOT NULL AND TRIM(token) <> ''
      ORDER BY id DESC
      LIMIT 1
    `).get(Number(agencyId), Number(clientId)) || null;
  } catch (error) {
    // Bancos antigos podem ter uma versão incompatível da tabela. O link
    // assinado abaixo não depende dessa tabela, então uma migração legada não
    // pode mais impedir o compartilhamento com o cliente.
    console.warn('[DESIGNER_APPROVAL_LINK] Link legado indisponível:', error.message);
    return null;
  }
}

function syncClientApprovalTasksToFeed(agencyId, clientId) {
  const normalizedAgencyId = Number(agencyId);
  const normalizedClientId = Number(clientId);
  if (!normalizedAgencyId || !normalizedClientId) return;

  const rows = db.prepare(`
    SELECT t.*, COALESCE(t.client_id, parent.client_id) AS resolved_client_id
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND COALESCE(t.client_id, parent.client_id) = ?
    ORDER BY t.id ASC
  `).all(normalizedAgencyId, normalizedClientId);

  for (const task of rows) {
    const directionStatus = String(task.direction_status || '').toLowerCase();
    const clientStatus = String(task.client_status || '').toLowerCase();
    const approvalStatus = String(task.approval_status || '').toLowerCase();
    const workflowStage = String(task.workflow_stage || '').toLowerCase();
    const isDesignerTask = String(task.task_type || '').toLowerCase() !== 'video'
      && String(task.front_name || '').trim().toLowerCase() !== 'site/lp';
    const correction = clientStatus === 'changes_requested'
      || approvalStatus === 'changes_requested'
      || workflowStage === 'correction';
    const releasedByDirection = directionStatus === 'approved'
      || ['pending_approval', 'send', 'approved'].includes(approvalStatus)
      || ['approval', 'internal_approval', 'external_approval', 'approved'].includes(workflowStage);

    if (!isDesignerTask || correction || !releasedByDirection) continue;

    try {
      if (!task.client_id && task.resolved_client_id) {
        db.prepare(`
          UPDATE tasks SET client_id = ?, updated_at = datetime('now')
          WHERE id = ? AND agency_id = ? AND client_id IS NULL
        `).run(Number(task.resolved_client_id), Number(task.id), normalizedAgencyId);
        task.client_id = Number(task.resolved_client_id);
      }
      promoteTaskToFeed(task);
    } catch (error) {
      console.warn(`[DESIGNER_APPROVAL] Peça #${task.id} não pôde ser sincronizada para a grade:`, error.message);
    }
  }
}

function getClientApprovalLink(agencyId, clientId) {
  const normalizedAgencyId = Number(agencyId);
  const normalizedClientId = Number(clientId);
  if (!normalizedAgencyId || !normalizedClientId) return null;

  // Fonte canônica do link: clients.feed_share_token. Esta coluna já faz parte
  // do fluxo público de grade do ZebraHub e existe nos bancos antigos, evitando
  // qualquer dependência de migration nova ou da tabela designer_approval_links.
  const client = db.prepare(`
    SELECT id, agency_id, feed_share_token
    FROM clients
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(normalizedClientId, normalizedAgencyId);

  const token = String(client?.feed_share_token || '').trim();
  if (!client || !token) return null;

  return {
    id: null,
    agency_id: normalizedAgencyId,
    client_id: normalizedClientId,
    token,
    active: 1,
    created_by: null,
    created_at: null,
    updated_at: null,
    storage: 'feed_share',
  };
}

function getOrCreateClientApprovalLink({ agencyId, clientId, createdBy }) {
  const normalizedAgencyId = Number(agencyId);
  const normalizedClientId = Number(clientId);
  if (!normalizedAgencyId || !normalizedClientId) return null;

  // Antes de entregar o link, garante que todas as peças já liberadas pela
  // direção estejam espelhadas na grade pública, inclusive aprovações antigas.
  syncClientApprovalTasksToFeed(normalizedAgencyId, normalizedClientId);

  const existing = getClientApprovalLink(normalizedAgencyId, normalizedClientId);
  if (existing) return existing;

  const client = db.prepare(`
    SELECT id, feed_share_token
    FROM clients
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(normalizedClientId, normalizedAgencyId);
  if (!client) return null;

  const token = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    UPDATE clients
    SET feed_share_token = CASE
      WHEN feed_share_token IS NULL OR TRIM(feed_share_token) = '' THEN ?
      ELSE feed_share_token
    END
    WHERE id = ? AND agency_id = ?
  `).run(token, normalizedClientId, normalizedAgencyId);

  void createdBy;
  return getClientApprovalLink(normalizedAgencyId, normalizedClientId);
}

function getLinkByToken(token) {
  const value = String(token || '').trim();
  if (!value) return null;

  // O mesmo token usado pela grade pública também é aceito na aprovação do
  // Designer. Assim a geração do link não depende de uma tabela auxiliar.
  try {
    const client = db.prepare(`
      SELECT id, agency_id, feed_share_token
      FROM clients
      WHERE feed_share_token = ?
      LIMIT 1
    `).get(value);
    if (client) {
      return {
        id: null,
        agency_id: Number(client.agency_id),
        client_id: Number(client.id),
        token: value,
        active: 1,
        created_by: null,
        created_at: null,
        updated_at: null,
        storage: 'feed_share',
      };
    }
  } catch (error) {
    console.warn('[DESIGNER_APPROVAL_LINK] Não foi possível consultar feed_share_token:', error.message);
  }

  // Compatibilidade com a versão que usou approval_share_token. A consulta é
  // protegida porque bancos que não receberam essa coluna não podem derrubar o
  // fluxo atual.
  try {
    const client = db.prepare(`
      SELECT id, agency_id, approval_share_token
      FROM clients
      WHERE approval_share_token = ?
      LIMIT 1
    `).get(value);
    if (client) {
      return {
        id: null,
        agency_id: Number(client.agency_id),
        client_id: Number(client.id),
        token: value,
        active: 1,
        created_by: null,
        created_at: null,
        updated_at: null,
        storage: 'client',
      };
    }
  } catch (error) {
    // esperado em bancos anteriores à migration de approval_share_token
  }

  const stateless = parseStatelessApprovalToken(value);
  if (stateless) return stateless;

  // Compatibilidade final com links históricos da tabela auxiliar.
  try {
    ensureDesignerApprovalStorage();
    return db.prepare(`
      SELECT id, agency_id, client_id, token, active, created_by, created_at, updated_at
      FROM designer_approval_links
      WHERE token = ? AND active = 1
      LIMIT 1
    `).get(value) || null;
  } catch (error) {
    console.warn('[DESIGNER_APPROVAL_LINK] Não foi possível consultar link legado:', error.message);
    return null;
  }
}

function getPublicClientProfile(link) {
  if (!link) return null;
  return db.prepare(`
    SELECT id, agency_id, name, logo_color, avatar_data, bio,
           instagram_username, instagram_display_name,
           instagram_posts_count, instagram_followers_count, instagram_following_count,
           instagram_link, instagram_primary_action, instagram_secondary_action, instagram_tertiary_action
    FROM clients
    WHERE id = ? AND agency_id = ?
    LIMIT 1
  `).get(Number(link.client_id), Number(link.agency_id)) || null;
}

function getPublicApprovalItems(link) {
  if (!link) return [];
  ensureDesignerApprovalStorage();
  const rows = db.prepare(`
    SELECT
      t.id, t.agency_id, COALESCE(t.client_id, parent.client_id) AS client_id, t.parent_task_id, t.created_by, t.task_type,
      t.title, t.content_type, t.content_tag, t.front_name, t.caption,
      t.due_date, t.status, t.workflow_stage, t.approval_status,
      t.attachment_data, t.attachment_mime, t.attachment_filename, t.media_gallery,
      t.feed_post_id, t.created_at, t.updated_at,
      t.direction_status AS task_direction_status, t.direction_feedback AS task_direction_feedback, t.direction_at AS task_direction_at,
      t.client_status AS task_client_status, t.client_feedback AS task_client_feedback, t.client_at AS task_client_at,
      s.direction_status AS state_direction_status, s.direction_feedback AS state_direction_feedback, s.direction_at AS state_direction_at,
      s.client_status AS state_client_status, s.client_feedback AS state_client_feedback, s.client_at AS state_client_at
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    LEFT JOIN designer_approval_states s ON s.task_id = t.id AND s.agency_id = t.agency_id
    WHERE t.agency_id = ?
      AND COALESCE(t.client_id, parent.client_id) = ?
      AND t.task_type != 'video'
      AND LOWER(TRIM(COALESCE(t.front_name, ''))) != 'site/lp'
      AND t.workflow_stage IN ('approval', 'internal_approval', 'external_approval', 'approved')
      AND (
        t.direction_status = 'approved'
        OR s.direction_status = 'approved'
        OR t.approval_status IN ('pending_approval', 'send', 'approved')
        OR t.workflow_stage IN ('external_approval', 'approved')
      )
      AND COALESCE(NULLIF(NULLIF(t.client_status, ''), 'waiting'), s.client_status,
          CASE WHEN t.approval_status = 'approved' OR t.workflow_stage = 'approved' THEN 'approved' ELSE 'pending' END)
          IN ('pending', 'approved', 'changes_requested')
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC
  `).all(Number(link.agency_id), Number(link.client_id));

  return rows.map((task) => {
    const images = imageGalleryForTask(task);
    return {
      id: Number(task.id),
      parent_task_id: task.parent_task_id ? Number(task.parent_task_id) : null,
      title: task.title,
      content_type: task.content_type,
      content_tag: task.content_tag,
      caption: task.caption,
      due_date: task.due_date,
      workflow_stage: 'approval',
      direction_status: (task.task_direction_status && task.task_direction_status !== 'pending')
        ? task.task_direction_status
        : (task.state_direction_status || task.task_direction_status || 'approved'),
      direction_feedback: task.task_direction_feedback || task.state_direction_feedback || null,
      client_status: (task.task_client_status && task.task_client_status !== 'waiting')
        ? task.task_client_status
        : (task.state_client_status || task.task_client_status || ((task.approval_status === 'approved' || task.workflow_stage === 'approved') ? 'approved' : 'pending')),
      client_feedback: task.task_client_feedback || task.state_client_feedback || null,
      images,
      image_count: images.length,
      updated_at: task.updated_at,
    };
  }).filter((item) => item.image_count > 0);
}

function setClientDecision({ token, taskId, decision, feedback = null }) {
  ensureDesignerApprovalStorage();
  if (!['approved', 'changes_requested'].includes(decision)) throw new Error('Decisão inválida');

  const link = getLinkByToken(token);
  if (!link) return { error: 'LINK_NOT_FOUND' };

  const task = db.prepare(`
    SELECT t.*
    FROM tasks t
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.agency_id = t.agency_id
    WHERE t.id = ? AND t.agency_id = ? AND COALESCE(t.client_id, parent.client_id) = ?
    LIMIT 1
  `).get(Number(taskId), Number(link.agency_id), Number(link.client_id));
  if (!task) return { error: 'TASK_NOT_FOUND' };

  persistInheritedClient(task);
  let state = getApprovalState(task.id, task.agency_id);
  const legacyReady = ['pending_approval', 'send', 'approved'].includes(String(task.approval_status || '').toLowerCase())
    || ['external_approval', 'approved'].includes(String(task.workflow_stage || '').toLowerCase());
  if ((!state || state.direction_status !== 'approved') && legacyReady) {
    ensureApprovalState(task);
    db.prepare(`
      UPDATE designer_approval_states
      SET direction_status = 'approved', client_status = CASE WHEN client_status = 'waiting' THEN 'pending' ELSE client_status END,
          updated_at = datetime('now')
      WHERE task_id = ? AND agency_id = ?
    `).run(Number(task.id), Number(task.agency_id));
    state = getApprovalState(task.id, task.agency_id);
  }
  if (!state || state.direction_status !== 'approved') return { error: 'NOT_READY' };
  if (!['approval', 'internal_approval', 'external_approval', 'approved'].includes(String(task.workflow_stage || ''))) {
    return { error: 'NOT_READY' };
  }

  const clientFeedback = String(feedback || '').trim() || null;
  if (decision === 'changes_requested' && !clientFeedback) {
    throw new Error('Informe o que precisa ser corrigido antes de enviar a correção.');
  }
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    if (decision === 'approved') {
      db.prepare(`
        UPDATE designer_approval_states
        SET client_status = 'approved', client_feedback = ?, client_at = ?, updated_at = datetime('now')
        WHERE task_id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      db.prepare(`
        UPDATE tasks
        SET direction_status = 'approved', client_status = 'approved', client_feedback = ?, client_at = ?,
            updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      updateTaskWorkflow(task.id, task.agency_id, 'approved');
      db.prepare(`UPDATE tasks SET approval_status = 'approved', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));
      const refreshed = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(Number(task.id), Number(task.agency_id));
      promoteTaskToFeed(refreshed);
    } else {
      db.prepare(`
        UPDATE designer_approval_states
        SET client_status = 'changes_requested', client_feedback = ?, client_at = ?, updated_at = datetime('now')
        WHERE task_id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      db.prepare(`
        UPDATE tasks
        SET direction_status = 'approved', client_status = 'changes_requested', client_feedback = ?, client_at = ?,
            updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(clientFeedback, now, Number(task.id), Number(task.agency_id));
      updateTaskWorkflow(task.id, task.agency_id, 'correction');
      db.prepare(`UPDATE tasks SET approval_status = 'changes_requested', updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
        .run(Number(task.id), Number(task.agency_id));
      try {
        hideTaskFeed(task, 'correction');
      } catch (feedError) {
        console.warn('[DESIGNER_APPROVAL] Não foi possível ocultar o post durante a correção do cliente:', feedError.message);
      }
    }
  });

  transaction();
  return {
    ok: true,
    decision,
    task_id: Number(task.id),
    state: getApprovalState(task.id, task.agency_id),
  };
}

module.exports = {
  ensureDesignerApprovalStorage,
  getApprovalState,
  getApprovalStates,
  resetApprovalForTask,
  setDirectionDecision,
  getClientApprovalLink,
  getOrCreateClientApprovalLink,
  getLinkByToken,
  getPublicClientProfile,
  getPublicApprovalItems,
  setClientDecision,
  imageGalleryForTask,
};
