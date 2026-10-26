const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const {
  RULE_MAP,
  normalizeCooldown,
  canManageAutomations,
  getAutomationOverview,
  runAutomationCycle,
} = require('../services/automationEngine');

const router = express.Router();
router.use(authRequired);

function internalOnly(req, res, next) {
  if (req.user?.role === 'client') return res.status(403).json({ error: 'Automações são exclusivas para a equipe interna.' });
  return next();
}

router.use(internalOnly);

router.get('/', (req, res) => {
  if (!canManageAutomations(req.user)) return res.status(403).json({ error: 'Automações ficam com administração e Head de Operação.' });
  try {
    const overview = getAutomationOverview(db, req.user.agency_id);
    return res.json({ ...overview, can_manage: canManageAutomations(req.user) });
  } catch (error) {
    console.error('[AUTOMATIONS] overview', error);
    return res.status(500).json({ error: 'Não foi possível carregar as automações agora.' });
  }
});

router.put('/:ruleKey', (req, res) => {
  if (!canManageAutomations(req.user)) return res.status(403).json({ error: 'Apenas administração ou Head de Operação pode alterar automações.' });
  const ruleKey = String(req.params.ruleKey || '').trim();
  const definition = RULE_MAP.get(ruleKey);
  if (!definition) return res.status(404).json({ error: 'Automação não encontrada.' });
  const enabled = req.body?.enabled;
  const cooldown = req.body?.cooldown_hours;
  if (enabled === undefined && cooldown === undefined) return res.status(400).json({ error: 'Informe o que deve ser alterado.' });

  try {
    const current = db.prepare(`
      SELECT enabled, cooldown_hours FROM automation_rules WHERE agency_id = ? AND rule_key = ?
    `).get(req.user.agency_id, ruleKey);
    const nextEnabled = enabled === undefined ? Number(current?.enabled ?? 1) : (enabled ? 1 : 0);
    const nextCooldown = cooldown === undefined
      ? normalizeCooldown(current?.cooldown_hours, definition.default_cooldown_hours)
      : normalizeCooldown(cooldown, definition.default_cooldown_hours);

    db.prepare(`
      INSERT INTO automation_rules (agency_id, rule_key, enabled, cooldown_hours, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(agency_id, rule_key) DO UPDATE SET
        enabled = excluded.enabled,
        cooldown_hours = excluded.cooldown_hours,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `).run(req.user.agency_id, ruleKey, nextEnabled, nextCooldown, req.user.id);

    return res.json({ ok: true, rule_key: ruleKey, enabled: Boolean(nextEnabled), cooldown_hours: nextCooldown });
  } catch (error) {
    console.error('[AUTOMATIONS] update', error);
    return res.status(500).json({ error: 'Não foi possível atualizar a automação.' });
  }
});

router.post('/run', async (req, res) => {
  if (!canManageAutomations(req.user)) return res.status(403).json({ error: 'Apenas administração ou Head de Operação pode rodar automações manualmente.' });
  try {
    const result = await runAutomationCycle(db, {
      agencyId: req.user.agency_id,
      triggerType: 'manual',
      actorUserId: req.user.id,
    });
    return res.json({ ok: true, result, overview: getAutomationOverview(db, req.user.agency_id) });
  } catch (error) {
    console.error('[AUTOMATIONS] manual run', error);
    return res.status(500).json({ error: 'Não foi possível rodar as automações agora.' });
  }
});

module.exports = router;
