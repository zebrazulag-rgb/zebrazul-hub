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
const db = require('./db/database');
const { createBackup } = require('./db/backup');

// Dados demonstrativos nunca devem reaparecer silenciosamente em produção.
// O seed só roda quando for habilitado explicitamente no ambiente.
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

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'zebrazul-hub-backend',
  persistent_storage: db.persistenceConfigured,
  storage_safe: db.storageSafe,
}));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/system', systemRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, async () => {
  console.log(`Zebrazul Hub backend rodando na porta ${PORT}`);
  console.log(`Banco em uso: ${db.storagePath}`);

  console.log(`Armazenamento persistente protegido: ${db.storageSafe ? 'SIM' : 'NAO'}`);

  if (String(process.env.AUTO_BACKUP_ON_START || 'true').toLowerCase() === 'true') {
    try {
      const backup = await createBackup('startup');
      console.log(`Backup automatico criado: ${backup}`);
    } catch (error) {
      console.error('Nao foi possivel criar o backup automatico:', error.message);
    }
  }

  const intervalHours = Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24);
  if (Number.isFinite(intervalHours) && intervalHours > 0) {
    const interval = setInterval(async () => {
      try {
        const backup = await createBackup('scheduled');
        console.log(`Backup agendado criado: ${backup}`);
      } catch (error) {
        console.error('Nao foi possivel criar o backup agendado:', error.message);
      }
    }, intervalHours * 60 * 60 * 1000);
    interval.unref();
  }
});
