require('dotenv').config();
const express = require('express');
const cors = require('cors');

const runSeedIfEmpty = require('./db/seed');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const postRoutes = require('./routes/posts');
const reportRoutes = require('./routes/reports');
const taskRoutes = require('./routes/tasks');
const publicRoutes = require('./routes/public');
const financeRoutes = require('./routes/finance');
const db = require('./db/database');
const { createBackup } = require('./db/backup');

// Dados demonstrativos nunca devem reaparecer silenciosamente em produção.
// O seed só roda quando for habilitado explicitamente no ambiente.
if (String(process.env.SEED_DEMO_DATA).toLowerCase() === 'true') {
  runSeedIfEmpty();
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'zebrazul-hub-backend',
  persistent_storage: db.persistenceConfigured,
}));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/finance', financeRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, async () => {
  console.log(`Zebrazul Hub backend rodando na porta ${PORT}`);
  console.log(`Banco em uso: ${db.storagePath}`);

  if (!db.persistenceConfigured && process.env.NODE_ENV === 'production') {
    console.warn('ATENÇÃO: DATABASE_PATH/PERSISTENT_DATA_DIR não configurado. Uma nova publicação pode apagar os dados.');
  }

  if (String(process.env.AUTO_BACKUP_ON_START || 'true').toLowerCase() === 'true') {
    try {
      const backup = await createBackup('startup');
      console.log(`Backup automático criado: ${backup}`);
    } catch (error) {
      console.error('Não foi possível criar o backup automático:', error.message);
    }
  }
});
