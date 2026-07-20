const express = require('express');
const db = require('../db/database');
const { authRequired } = require('../middleware/auth');
const { resolveAgency, publicAgency } = require('../services/tenant');

const router = express.Router();

router.get('/', (req, res) => {
  const agency = resolveAgency(req);
  if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
  return res.json({ agency: publicAgency(agency) });
});

router.get('/me', authRequired, (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.user.agency_id);
  if (!agency) return res.status(404).json({ error: 'Agência não encontrada' });
  return res.json({ agency: publicAgency(agency) });
});

router.put('/me', authRequired, (req, res) => {
  if (req.user.role !== 'admin' && !req.user.is_platform_owner) {
    return res.status(403).json({ error: 'Apenas administradores podem editar a marca' });
  }

  const current = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.user.agency_id);
  if (!current) return res.status(404).json({ error: 'Agência não encontrada' });

  const allowed = [
    'name', 'product_name', 'logo_data', 'logo_mime', 'primary_color',
    'secondary_color', 'sidebar_color', 'login_background_color',
    'support_email', 'support_whatsapp'
  ];
  const updates = [];
  const values = [];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field] === null ? null : String(req.body[field]).trim());
    }
  }

  if (!updates.length) return res.json({ agency: publicAgency(current) });
  updates.push("updated_at = datetime('now')");
  values.push(req.user.agency_id);
  db.prepare(`UPDATE agencies SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.user.agency_id);
  return res.json({ agency: publicAgency(agency) });
});

module.exports = router;
