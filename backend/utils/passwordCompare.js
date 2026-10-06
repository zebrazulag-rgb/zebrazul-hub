// [FASE 1] Comparação de senha sem travar o servidor.
//
// Medição (12 comparações simultâneas, custo 10):
//   bcryptjs síncrono ........ event loop 100% bloqueado
//   bcryptjs "assíncrono" .... ~955 ms de travamento (é JS puro, roda na thread principal)
//   bcrypt nativo ............ ~4 ms de travamento (usa o threadpool do libuv)
//
// O `bcrypt` nativo entra como dependência OPCIONAL. Se o binário não estiver disponível
// no ambiente de build, cai automaticamente para o bcryptjs (funciona igual, só trava mais).
// Os hashes ($2a$/$2b$) são compatíveis entre as duas bibliotecas: nenhuma senha precisa ser refeita.
const bcryptjs = require('bcryptjs');

let native = null;
try {
  native = require('bcrypt');
} catch (error) {
  console.warn('[AUTH] bcrypt nativo indisponivel, usando bcryptjs (mais lento sob carga):', String(error.message).split('\n')[0]);
}

function comparePassword(plain, hash) {
  const p = String(plain);
  const h = String(hash || '');
  return native ? native.compare(p, h) : bcryptjs.compare(p, h);
}

module.exports = { comparePassword, usingNativeBcrypt: Boolean(native) };
