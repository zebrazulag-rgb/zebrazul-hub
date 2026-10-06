// [FASE 1] Limitador de tentativas de login, em memória, sem dependências novas.
//
// Decisão de projeto: o limite principal é por E-MAIL (+ IP), e o limite por IP é folgado.
// Motivo: o front passa pelo rewrite da Vercel, então o IP que o Railway enxerga pode ser
// o da Vercel (compartilhado por todos os usuários). Um limite apertado por IP bloquearia
// todo mundo junto.
//
// Trade-off conhecido: um atacante pode travar o login de um e-mail específico por alguns
// minutos. É o preço de impedir tentativa de senha em massa; o travamento expira sozinho.

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000);
const MAX_FAILS_PER_ACCOUNT = Number(process.env.LOGIN_MAX_FAILS_PER_ACCOUNT || 8);
const MAX_FAILS_PER_IP = Number(process.env.LOGIN_MAX_FAILS_PER_IP || 100);

const accountFails = new Map(); // chave: ip|email -> { count, resetAt }
const ipFails = new Map();      // chave: ip -> { count, resetAt }

function now() { return Date.now(); }

function readBucket(map, key) {
  const bucket = map.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= now()) { map.delete(key); return null; }
  return bucket;
}

function bump(map, key) {
  const bucket = readBucket(map, key);
  if (bucket) { bucket.count += 1; return bucket; }
  const fresh = { count: 1, resetAt: now() + WINDOW_MS };
  map.set(key, fresh);
  return fresh;
}

function keysFor(req, email) {
  const ip = String(req.ip || 'unknown');
  return { ip, account: `${ip}|${String(email || '').toLowerCase()}` };
}

// Retorna { blocked: boolean, retryAfterSeconds }
function checkLoginAllowed(req, email) {
  const { ip, account } = keysFor(req, email);
  const a = readBucket(accountFails, account);
  const i = readBucket(ipFails, ip);
  const accountBlocked = a && a.count >= MAX_FAILS_PER_ACCOUNT;
  const ipBlocked = i && i.count >= MAX_FAILS_PER_IP;
  if (!accountBlocked && !ipBlocked) return { blocked: false, retryAfterSeconds: 0 };
  const resetAt = Math.max(accountBlocked ? a.resetAt : 0, ipBlocked ? i.resetAt : 0);
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now()) / 1000)) };
}

function recordLoginFailure(req, email) {
  const { ip, account } = keysFor(req, email);
  bump(accountFails, account);
  bump(ipFails, ip);
}

function recordLoginSuccess(req, email) {
  const { account } = keysFor(req, email);
  accountFails.delete(account);
}

// Limpeza periódica para não crescer sem limite.
const sweeper = setInterval(() => {
  const t = now();
  for (const map of [accountFails, ipFails]) {
    for (const [key, bucket] of map) if (bucket.resetAt <= t) map.delete(key);
  }
}, 5 * 60 * 1000);
sweeper.unref();

module.exports = { checkLoginAllowed, recordLoginFailure, recordLoginSuccess };
