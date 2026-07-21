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
const publicRoutes = require('./routes/public');
const financeRoutes = require('./routes/finance');
const systemRoutes = require('./routes/system');
const actionPlanRoutes = require('./routes/actionPlans');
const metaRoutes = require('./routes/meta');
const metaOrganicRoutes = require('./routes/metaOrganic');
const tenantRoutes = require('./routes/tenant');
const agencyRoutes = require('./routes/agencies');
const db = require('./db/database');
const { createBackup } = require('./db/backup');
const { getHealthStatus } = require('./db/health');
const { syncAllConnectedAccounts, currentMonthRange } = require('./services/metaSync');
const { syncAllOrganicAccounts, currentMonthRange: currentOrganicMonthRange } = require('./services/metaOrganicSync');

if (String(process.env.SEED_DEMO_DATA).toLowerCase() === 'true') {
  const allowDemoInProduction = String(process.env.ALLOW_DEMO_SEED_IN_PRODUCTION || 'false').toLowerCase() === 'true';
  if (String(process.env.NODE_ENV || 'production').toLowerCase() === 'production' && !allowDemoInProduction) {
    throw new Error('SEED_DEMO_DATA nao pode ser usado em producao. Mantenha SEED_DEMO_DATA=false.');
  }
  runSeedIfEmpty();
}

bootstrapAdminIfNeeded();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => {
  const health = getHealthStatus();
  res.status(health.ok ? 200 : 503).json(health);
});

app.use('/api/tenant', tenantRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/action-plans', actionPlanRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/meta-organic', metaOrganicRoutes);

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
  if (!String(process.env.META_ORGANIC_ACCESS_TOKEN || '').trim()) {
    console.log(`[META ORGANIC] Sincronizacao ${label} ignorada: token organico nao configurado.`);
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
  if (!String(process.env.META_ACCESS_TOKEN || '').trim()) {
    console.log(`[META] Sincronizacao ${label} ignorada: token nao configurado.`);
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
