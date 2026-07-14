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

// Cria os dados iniciais (admin, equipe, cliente de exemplo) automaticamente
// na primeira vez que o servidor liga, caso o banco ainda esteja vazio.
runSeedIfEmpty();

// Backup automático do banco a cada início do servidor (não derruba o boot se falhar)
try {
  const runBackup = require('./db/backup');
  const backupPath = runBackup();
  console.log('Backup automático criado em:', backupPath);
} catch (err) {
  console.warn('Não foi possível criar o backup automático na inicialização:', err.message);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'zebrazul-hub-backend' }));

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

app.listen(PORT, () => {
  console.log(`Zebrazul Hub backend rodando na porta ${PORT}`);
});
