const crypto = require('crypto');
const express = require('express');
const { processWebhookPayload } = require('../services/instagramStories');

const router = express.Router();

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validSignature(req) {
  const secret = String(process.env.META_APP_SECRET || '').trim();
  if (!secret) {
    const allowUnsigned = String(process.env.META_WEBHOOK_ALLOW_UNSIGNED || 'false').toLowerCase() === 'true';
    const isProduction = String(process.env.NODE_ENV || 'production').toLowerCase() === 'production';
    return allowUnsigned && !isProduction;
  }
  const header = String(req.get('x-hub-signature-256') || '').trim();
  if (!header.startsWith('sha256=')) {
    return String(process.env.META_WEBHOOK_ALLOW_UNSIGNED || 'false').toLowerCase() === 'true';
  }
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return secureEqual(header, expected);
}

router.get('/', (req, res) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const configured = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (!configured) {
    return res.status(503).send('META_WEBHOOK_VERIFY_TOKEN não configurado');
  }
  if (mode === 'subscribe' && secureEqual(token, configured)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', (req, res) => {
  if (!validSignature(req)) return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
  if (!['instagram', 'page'].includes(String(req.body?.object || '').toLowerCase())) {
    return res.sendStatus(200);
  }

  const payload = req.body;
  res.sendStatus(200);
  setImmediate(() => {
    processWebhookPayload(payload).then((result) => {
      console.log('[INSTAGRAM STORIES] Webhook processado:', result);
    }).catch((error) => {
      console.error('[INSTAGRAM STORIES] Falha ao processar webhook:', error);
    });
  });
});

module.exports = router;
