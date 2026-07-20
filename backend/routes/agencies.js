const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authRequired, requirePlatformOwner } = require('../middleware/auth');
const { normalizeSlug, publicAgency } = require('../services/tenant');

const router = express.Router();
router.use(authRequired, requirePlatformOwner);

function agencyWithStats(row) {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE agency_id = ?) AS clients_count,
      (SELECT COUNT(*) FROM users WHERE agency_id = ?) AS users_count
  `).get(row.id, row.id);
  return { ...publicAgency(row), ...stats };
}

router.get('/', (req, res) => {
  const agencies = db.prepare('SELECT * FROM agencies ORDER BY created_at DESC, name').all().map(agencyWithStats);
  res.json({ agencies });
});

router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  const slug = normalizeSlug(req.body.slug || name);
  const ownerName = String(req.body.owner_name || '').trim();
  const ownerEmail = String(req.body.owner_email || '').trim().toLowerCase();
  const ownerPassword = String(req.body.owner_password || '');

  if (!name || !slug || !ownerName || !ownerEmail || ownerPassword.length < 6) {
    return res.status(400).json({ error: 'Informe agência, slug, responsável, e-mail e uma senha de pelo menos 6 caracteres' });
  }
  if (['app', 'api', 'www', 'admin'].includes(slug)) {
    return res.status(400).json({ error: 'Este subdomínio é reservado' });
  }

  const createAgency = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO agencies (
        name, slug, status, plan, product_name, primary_color, secondary_color,
        sidebar_color, login_background_color, footer_text, show_powered_by,
        max_clients, max_users
      ) VALUES (?, ?, 'active', 'essential', ?, ?, ?, ?, ?, 'Tecnologia ZebraHub', 1, ?, ?)
    `).run(
      name,
      slug,
      String(req.body.product_name || name).trim() || name,
      String(req.body.primary_color || '#0969ff'),
      String(req.body.secondary_color || '#4f8cff'),
      String(req.body.sidebar_color || '#121620'),
      String(req.body.login_background_color || '#121620'),
      Number(req.body.max_clients || 10),
      Number(req.body.max_users || 5)
    );
    const agencyId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO users (
        name, email, password_hash, role, client_id, agency_id,
        is_platform_owner, is_agency_owner
      ) VALUES (?, ?, ?, 'admin', NULL, ?, 0, 1)
    `).run(ownerName, ownerEmail, bcrypt.hashSync(ownerPassword, 10), agencyId);
    return agencyId;
  });

  try {
    const id = createAgency();
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id);
    res.status(201).json({ agency: agencyWithStats(agency) });
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('UNIQUE')) return res.status(400).json({ error: 'Subdomínio ou e-mail já cadastrado' });
    console.error('[AGENCIES] Erro ao criar agência:', error);
    return res.status(500).json({ error: 'Não foi possível criar a agência' });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Agência não encontrada' });

  const allowed = [
    'name', 'status', 'product_name', 'primary_color', 'secondary_color',
    'sidebar_color', 'login_background_color', 'support_email', 'support_whatsapp',
    'footer_text', 'logo_data', 'logo_mime', 'max_clients', 'max_users'
  ];
  const updates = [];
  const values = [];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(['max_clients', 'max_users'].includes(field) ? Number(req.body[field]) : req.body[field]);
    }
  }
  if (req.body.slug !== undefined) {
    const slug = normalizeSlug(req.body.slug);
    if (!slug || ['app', 'api', 'www', 'admin'].includes(slug)) return res.status(400).json({ error: 'Subdomínio inválido ou reservado' });
    updates.push('slug = ?');
    values.push(slug);
  }
  if (!updates.length) return res.json({ agency: agencyWithStats(current) });
  updates.push("updated_at = datetime('now')");
  values.push(id);

  try {
    db.prepare(`UPDATE agencies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id);
    res.json({ agency: agencyWithStats(agency) });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) return res.status(400).json({ error: 'Este subdomínio já está em uso' });
    throw error;
  }
});

module.exports = router;
