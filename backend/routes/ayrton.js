const express = require('express');
const db = require('../db/database');
const { authRequired, canAccessClient } = require('../middleware/auth');
const { hasPermission } = require('../services/permissions');
const ayrton = require('../services/ayrton');
const ayrtonAI = require('../services/ayrtonAI');
const ayrtonAsk = require('../services/ayrtonAsk');
const { todayInFortaleza } = require('../services/myWork');
const { AGENTS } = require('../services/agents');

const router = express.Router();
router.use(authRequired);
router.use((req, res, next) => (req.user?.role === 'client' ? res.status(403).json({ error: 'O Ayrton é exclusivo para a equipe interna.' }) : next()));

const opts = (clientId = null) => ({ can: hasPermission, canAccess: canAccessClient, clientId });
const send = (res, r) => (r.code ? res.status(r.code).json({ error: r.error }) : res.json(r));
const wrap = (fn) => (req, res) => { try { return fn(req, res); } catch (e) { console.error('[AYRTON]', e); return res.status(500).json({ error: 'O Ayrton não conseguiu concluir agora.' }); } };
const isManager = (u) => ['admin', 'manager', 'owner', 'direction'].includes(u.role) || hasPermission(u, 'alerts.manage');
const today = () => todayInFortaleza();

router.get('/', wrap((req, res) => {
  const cid = Number(req.query.client_id || 0) || null;
  if (cid && !canAccessClient(req.user, cid)) return res.status(403).json({ error: 'Você não possui acesso a este cliente.' });
  ayrton.ensureFresh(db, req.user.agency_id, today());
  return res.json({ ...ayrton.buildView(db, req.user, today(), opts(cid)), team: Object.values(AGENTS).map(({ key, name, role, active }) => ({ key, name, role, active })), ai: { available: ayrtonAI.available() } });
}));
router.get('/status', wrap((req, res) => {
  ayrton.ensureFresh(db, req.user.agency_id, today());
  const v = ayrton.buildView(db, req.user, today(), opts());
  return res.json({ agent: v.agent, summary: { headline: v.summary.headline, counts: v.summary.counts, priority: v.summary.priority } });
}));
router.post('/scan', wrap((req, res) => res.json({ stats: ayrton.ensureFresh(db, req.user.agency_id, today(), { force: true }) })));
router.post('/pause', wrap((req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Apenas gestores podem pausar o Ayrton.' });
  ayrton.setPaused(db, req.user.agency_id, Boolean(req.body?.paused));
  return res.json({ ok: true, paused: Boolean(req.body?.paused) });
}));
router.get('/history', wrap((req, res) => send(res, ayrton.history(db, req.user, { clientId: Number(req.query.client_id || 0) || null }, opts()))));
router.get('/clients/:clientId/health', wrap((req, res) => send(res, ayrton.clientHealth(db, req.user, Number(req.params.clientId), today(), opts()))));
router.post('/ask', wrap((req, res) => {
  const q = String(req.body?.question || '').trim().slice(0, 300);
  if (!q) return res.status(400).json({ error: 'Escreva uma pergunta.' });
  ayrton.ensureFresh(db, req.user.agency_id, today());
  return res.json(ayrtonAsk.ask(db, req.user, q, today(), opts()));
}));
router.get('/ai-log', wrap((req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Apenas gestores veem o custo de IA.' });
  const rows = db.prepare("SELECT l.*, c.name AS client_name FROM agent_ai_log l LEFT JOIN clients c ON c.id = l.client_id WHERE l.agency_id = ? AND l.agent = 'ayrton' ORDER BY l.id DESC LIMIT 100").all(req.user.agency_id);
  return res.json({ available: ayrtonAI.available(), total_cost: rows.reduce((s, r) => s + (r.estimated_cost || 0), 0), rows });
}));
router.get('/alerts/:id', wrap((req, res) => send(res, ayrton.alertDetail(db, req.user, Number(req.params.id), today(), opts()))));
router.post('/alerts/:id/interpret', wrap(async (req, res) => {
  const d = ayrton.alertDetail(db, req.user, Number(req.params.id), today(), opts());
  if (d.error) return send(res, d);
  return res.json(await ayrtonAI.interpretAccount(db, req.user.agency_id, d.alert.client_id));
}));
router.get('/alerts/:id/task-draft', wrap((req, res) => send(res, ayrton.taskDraft(db, req.user, Number(req.params.id), today(), opts()))));
router.post('/alerts/:id/link-task', wrap((req, res) => send(res, ayrton.linkTask(db, req.user, Number(req.params.id), req.body?.task_id, opts()))));
router.post('/alerts/:id/ignore', wrap((req, res) => send(res, ayrton.ignoreAlert(db, req.user, Number(req.params.id), req.body?.mode, opts(), today()))));
router.post('/alerts/:id/unignore', wrap((req, res) => send(res, ayrton.unignoreAlert(db, req.user, Number(req.params.id), opts()))));
router.post('/alerts/:id/resolve', wrap((req, res) => send(res, ayrton.resolveManually(db, req.user, Number(req.params.id), req.body?.note, opts()))));

module.exports = router;
