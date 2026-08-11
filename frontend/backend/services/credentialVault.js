const crypto = require('crypto');

const ENVELOPE_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function normalizedSecret(value) {
  return String(value || '').trim();
}

function secretCandidates() {
  const dedicated = normalizedSecret(process.env.PASSWORD_VAULT_KEY);
  const jwtSecret = normalizedSecret(process.env.JWT_SECRET || 'zebrazul-hub-dev-secret-troque-em-producao');
  return [...new Set([dedicated, jwtSecret].filter(Boolean))];
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(`zebrahub-password-vault:${secret}`, 'utf8').digest();
}

function aadForAgency(agencyId) {
  return Buffer.from(`zebrahub-vault:agency:${Number(agencyId) || 0}`, 'utf8');
}

function encryptSecret(value, agencyId) {
  if (value === null || value === undefined || value === '') return null;
  const [secret] = secretCandidates();
  if (!secret) throw new Error('Nenhuma chave de criptografia configurada para o cofre de senhas');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(secret), iv);
  cipher.setAAD(aadForAgency(agencyId));
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function tryDecryptWithSecret(envelope, agencyId, secret) {
  const [version, ivPart, tagPart, cipherPart] = String(envelope).split('.');
  if (version !== ENVELOPE_VERSION || !ivPart || !tagPart || !cipherPart) {
    throw new Error('Formato de segredo criptografado invalido');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(ivPart, 'base64url'));
  decipher.setAAD(aadForAgency(agencyId));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function decryptSecret(envelope, agencyId) {
  if (!envelope) return '';
  let lastError = null;
  for (const secret of secretCandidates()) {
    try {
      return tryDecryptWithSecret(envelope, agencyId, secret);
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error('Nao foi possivel descriptografar este segredo. Verifique PASSWORD_VAULT_KEY.');
  error.cause = lastError;
  throw error;
}

function vaultUsesDedicatedKey() {
  return Boolean(normalizedSecret(process.env.PASSWORD_VAULT_KEY));
}

module.exports = {
  encryptSecret,
  decryptSecret,
  vaultUsesDedicatedKey,
};
