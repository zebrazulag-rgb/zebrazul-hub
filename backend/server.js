require('dotenv').config();
const express = require('express');
const cors = require('cors');

const runSeedIfEmpty = require('./db/seed');
const bootstrapAdminIfNeeded = require('./db/bootstrapAdmin');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const postRoutes = require('./routes/posts');
const reportRoutes = require('./routes/reports');
const taskRoutes = require('./routes/tasks');
const taskRequestLinkRoutes = require('./routes/taskRequestLinks');
const publicTaskRequestRoutes = require('./routes/publicTaskRequests');
const notificationRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');
const publicRoutes = require('./routes/public');
const financeRoutes = require('./routes/finance');
const credentialRoutes = require('./routes/credentials');
const systemRoutes = require('./routes/system');
const actionPlanRoutes = require('./routes/actionPlans');
const planningDocumentRoutes = require('./routes/planningDocuments');
const metaRoutes = require('./routes/meta');
const metaOrganicRoutes = require('./routes/metaOrganic');
const metaOAuthRoutes = require('./routes/metaOAuth');
const instagramOAuthRoutes = require('./routes/instagramOAuth');
const tenantRoutes = require('./routes/tenant');
const agencyRoutes = require('./routes/agencies');
const diagnosticRoutes = require('./routes/diagnostics');
const publicDiagnosticRoutes = require('./routes/publicDiagnostics');
const commercialRoutes = require('./routes/commercial');
const reenrollmentRoutes = require('./routes/reenrollments');
const beeCampaignBriefingRoutes = require('./routes/beeCampaignBriefing');
const publicBeeCampaignBriefingRoutes = require('./routes/publicBeeCampaignBriefing');
const publicBeeFamilySurveyRoutes = require('./routes/publicBeeFamilySurvey');
const beeFamilySurveyRoutes = require('./routes/beeFamilySurvey');
const apogeuDiagnosticIntegrationRoutes = require('./routes/apogeuDiagnosticIntegration');
const aiRoutes = require('./routes/ai');
const feedIntelligenceRoutes = require('./routes/feedIntelligence');
const materialRoutes = require('./routes/materials');
const materialBoardRoutes = require('./routes/materialBoards');
const publicMaterialRoutes = require('./routes/publicMaterials');
const videoReviewRoutes = require('./routes/videoReviews');
const publicVideoReviewRoutes = require('./routes/publicVideoReviews');
const mediaRoutes = require('./routes/media');
const instagramStoriesWebhookRoutes = require('./routes/instagramStoriesWebhook');
const instagramStoriesRoutes = require('./routes/instagramStories');
const permissionsRoutes = require('./routes/permissions');
const activityRoutes = require('./routes/activity');
const { runMediaMigration } = require('./services/mediaMigration');
const db = require('./db/database');
const { createBackup } = require('./db/backup');
const { getHealthStatus } = require('./db/health');
const { syncAllConnectedAccounts, currentMonthRange } = require('./services/metaSync');
const { syncAllOrganicAccounts, currentMonthRange: currentOrganicMonthRange } = require('./services/metaOrganicSync');
const { authRequired } = require('./middleware/auth');
const { apiPermissionForRequest, hasPermission } = require('./services/permissions');
const { seedBuiltInMaterials } = require('./services/materials');
const { activityMutationMiddleware } = require('./services/activity');

if (String(process.env.SEED_DEMO_DATA).toLowerCase() === 'true') {
  const allowDemoInProduction = String(process.env.ALLOW_DEMO_SEED_IN_PRODUCTION || 'false').toLowerCase() === 'true';
  if (String(process.env.NODE_ENV || 'production').toLowerCase() === 'production' && !allowDemoInProduction) {
    throw new Error('SEED_DEMO_DATA nao pode ser usado em producao. Mantenha SEED_DEMO_DATA=false.');
  }
  runSeedIfEmpty();
}

bootstrapAdminIfNeeded();
seedBuiltInMaterials();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));

// O webhook precisa ser público para a validação e as notificações da Meta.
// A assinatura X-Hub-Signature-256 é validada dentro da própria rota.
app.use('/api/instagram-stories/webhook', instagramStoriesWebhookRoutes);
app.use('/api/media', mediaRoutes);
// Integração servidor-a-servidor do Diagnóstico APOGEU. Protegida por chave própria.
app.use('/api/integrations/apogeu-diagnostico', apogeuDiagnosticIntegrationRoutes);

app.get('/api/health', (req, res) => {
  const health = getHealthStatus();
  res.status(health.ok ? 200 : 503).json(health);
});

// O callback OAuth precisa aceitar o retorno da Meta sem o JWT do navegador.
// As demais rotas deste modulo aplicam authRequired internamente.
app.use('/api/meta-oauth', metaOAuthRoutes);
app.use('/api/instagram-oauth', instagramOAuthRoutes);

// Camada central de permissões. Os links públicos e autenticação continuam
// validados pelas próprias rotas; os demais recursos respeitam o cargo configurado
// em Configurações > Permissões, inclusive quando a URL é digitada manualmente.
app.use('/api', (req, res, next) => {
  const publicPrefixes = ['/auth', '/tenant', '/public'];
  if (publicPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();

  return authRequired(req, res, () => {
    const permissionKey = apiPermissionForRequest(req);
    const activityPresenceAccess = req.path === '/activity/presence' && req.method === 'POST';
    const permissionAllowed = activityPresenceAccess || (Array.isArray(permissionKey)
      ? permissionKey.some((key) => hasPermission(req.user, key))
      : (!permissionKey || hasPermission(req.user, permissionKey)));
    if (!permissionAllowed) {
      return res.status(403).json({ error: 'Seu cargo não possui permissão para este recurso.' });
    }

    // Preserva o isolamento histórico da Equipe Comercial para rotas antigas que
    // ainda não possuem uma chave de permissão própria.
    if (req.user?.is_commercial_team && !permissionKey) {
      const clientsReadAccess = req.path === '/clients' && req.method === 'GET';
      const notificationAccess = req.path === '/notifications' || req.path.startsWith('/notifications/');
      const taskRequestAccess = req.path === '/task-request-links' || req.path.startsWith('/task-request-links/');
      if (!clientsReadAccess && !notificationAccess && !taskRequestAccess) {
        return res.status(403).json({ error: 'Este recurso não está liberado para o seu cargo.' });
      }
    }
    activityMutationMiddleware(req, res, next);
  });
});

app.use('/api/tenant', tenantRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/diagnostics', diagnosticRoutes);
app.use('/api/public/diagnostics', publicDiagnosticRoutes);
app.use('/api/public/bee-campaign-briefing', publicBeeCampaignBriefingRoutes);
app.use('/api/public/bee-family-survey', publicBeeFamilySurveyRoutes);
app.use('/api/public/task-requests', publicTaskRequestRoutes);
app.use('/api/public/materials', publicMaterialRoutes);
app.use('/api/public/video-reviews', publicVideoReviewRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/task-request-links', taskRequestLinkRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/action-plans', actionPlanRoutes);
app.use('/api/planning-documents', planningDocumentRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/meta-organic', metaOrganicRoutes);
app.use('/api/commercial', commercialRoutes);
app.use('/api/reenrollments', reenrollmentRoutes);
app.use('/api/bee-campaign-briefing', beeCampaignBriefingRoutes);
app.use('/api/bee-family-survey', beeFamilySurveyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/feed-intelligence', feedIntelligenceRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/material-boards', materialBoardRoutes);
app.use('/api/video-reviews', videoReviewRoutes);
app.use('/api/instagram-stories', instagramStoriesRoutes);

app.use((err, req, res, next) => {
  console.error('[HTTP] Erro nao tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

async function runAutomaticBackup(label) {
  try {
    const backup = await createBackup(label);
    console.log(`[BACKUP] Criado e verificado: ${backup}`);
  } catch (error) {
    console.error(`[BACKUP] Falha no backup ${label}:`, error.message);
  }
}


async function runAutomaticOrganicSync(label) {
  const oauthConnections = Number(db.prepare('SELECT COUNT(*) AS total FROM meta_oauth_connections').get()?.total || 0);
  const instagramOauthConnections = Number(db.prepare(`
    SELECT COUNT(*) AS total FROM instagram_oauth_connections
    WHERE status IN ('connected','error')
  `).get()?.total || 0);
  if (!String(process.env.META_ORGANIC_ACCESS_TOKEN || '').trim() && oauthConnections === 0 && instagramOauthConnections === 0) {
    console.log(`[META ORGANIC] Sincronizacao ${label} ignorada: nenhuma autorizacao Meta ou Instagram configurada.`);
    return;
  }

  try {
    const range = currentOrganicMonthRange();
    const result = await syncAllOrganicAccounts(range);
    console.log(`[META ORGANIC] Sincronizacao ${label}: ${result.success}/${result.total} conta(s) atualizada(s), ${result.failed} falha(s), periodo ${range.from} a ${range.to}.`);
  } catch (error) {
    console.error(`[META ORGANIC] Falha na sincronizacao ${label}:`, error.message);
  }
}

async function runAutomaticMetaSync(label) {
  const oauthConnections = Number(db.prepare('SELECT COUNT(*) AS total FROM meta_oauth_connections').get()?.total || 0);
  if (!String(process.env.META_ACCESS_TOKEN || '').trim() && oauthConnections === 0) {
    console.log(`[META] Sincronizacao ${label} ignorada: nenhuma autorizacao Meta configurada.`);
    return;
  }

  try {
    const range = currentMonthRange();
    const result = await syncAllConnectedAccounts(range);
    console.log(`[META] Sincronizacao ${label}: ${result.success}/${result.total} conta(s) atualizada(s), ${result.failed} falha(s), periodo ${range.from} a ${range.to}.`);
  } catch (error) {
    console.error(`[META] Falha na sincronizacao ${label}:`, error.message);
  }
}

app.listen(PORT, async () => {
  const health = getHealthStatus();
  console.log('==============================================');
  console.log(`Zebrahub backend v${health.version}`);
  console.log(`Porta: ${PORT}`);
  console.log(`Banco: ${db.storagePath}`);
  console.log(`Banco conectado: ${health.database.ok ? 'SIM' : 'NAO'}`);
  console.log(`Integridade: ${health.database.integrity || 'indisponivel'}`);
  console.log(`Volume persistente: ${health.storage.persistence_configured ? 'CONFIGURADO' : 'NAO CONFIGURADO'}`);
  console.log(`Armazenamento seguro: ${health.storage.safe ? 'SIM' : 'NAO'}`);
  console.log(`Diretorio de backups: ${health.backup.directory}`);
  console.log('==============================================');

  if (String(process.env.MEDIA_AUTO_MIGRATE || 'true').toLowerCase() === 'true') {
    try {
      const result = runMediaMigration({ vacuum: String(process.env.MEDIA_MIGRATION_VACUUM || 'true').toLowerCase() === 'true' });
      console.log('[MEDIA] Migracao de midias:', result);
    } catch (error) {
      console.error('[MEDIA] Falha na migracao de midias:', error);
    }
  }

  if (String(process.env.AUTO_BACKUP_ON_START || 'true').toLowerCase() === 'true') {
    await runAutomaticBackup('startup');
  }

  const intervalHours = Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24);
  if (Number.isFinite(intervalHours) && intervalHours > 0) {
    console.log(`[BACKUP] Agendamento ativo: a cada ${intervalHours} hora(s).`);
    const interval = setInterval(
      () => runAutomaticBackup('scheduled'),
      intervalHours * 60 * 60 * 1000
    );
    interval.unref();
  } else {
    console.warn('[BACKUP] Backup agendado desativado por configuracao.');
  }

  if (String(process.env.META_AUTO_SYNC_ON_START || 'false').toLowerCase() === 'true') {
    await runAutomaticMetaSync('startup');
  }

  const metaIntervalHours = Number(process.env.META_AUTO_SYNC_INTERVAL_HOURS || 24);
  if (Number.isFinite(metaIntervalHours) && metaIntervalHours > 0) {
    console.log(`[META] Sincronizacao automatica ativa: a cada ${metaIntervalHours} hora(s).`);
    const metaInterval = setInterval(
      () => runAutomaticMetaSync('scheduled'),
      metaIntervalHours * 60 * 60 * 1000
    );
    metaInterval.unref();
  } else {
    console.warn('[META] Sincronizacao automatica desativada por configuracao.');
  }


  if (String(process.env.META_ORGANIC_AUTO_SYNC_ON_START || process.env.META_AUTO_SYNC_ON_START || 'false').toLowerCase() === 'true') {
    await runAutomaticOrganicSync('startup');
  }

  const organicIntervalHours = Number(process.env.META_ORGANIC_AUTO_SYNC_INTERVAL_HOURS || process.env.META_AUTO_SYNC_INTERVAL_HOURS || 24);
  if (Number.isFinite(organicIntervalHours) && organicIntervalHours > 0) {
    console.log(`[META ORGANIC] Sincronizacao automatica ativa: a cada ${organicIntervalHours} hora(s).`);
    const organicInterval = setInterval(
      () => runAutomaticOrganicSync('scheduled'),
      organicIntervalHours * 60 * 60 * 1000
    );
    organicInterval.unref();
  } else {
    console.warn('[META ORGANIC] Sincronizacao automatica desativada por configuracao.');
  }
});
