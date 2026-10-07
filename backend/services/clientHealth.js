// Pontuação de saúde do cliente: o gestor dá nota de 0 a 10 em cada critério (ou "não se aplica").
// Total = média dos critérios avaliados, em escala 0–100. Funções puras, sem acesso a banco.

const CRITERIA = [
  { key: 'bio', label: 'Bio', group: 'Perfil' },
  { key: 'link', label: 'Link', group: 'Perfil' },
  { key: 'foto_perfil', label: 'Foto de perfil', group: 'Perfil' },
  { key: 'destaques', label: 'Destaques', group: 'Feed' },
  { key: 'posts_fixados', label: 'Posts fixados', group: 'Feed' },
  { key: 'grade_feed', label: 'Grade do feed', group: 'Feed' },
  { key: 'capas_videos', label: 'Capas dos vídeos', group: 'Feed' },
  { key: 'harmonia', label: 'Harmonia', group: 'Qualidade' },
  { key: 'conteudo', label: 'Conteúdo', group: 'Qualidade' },
  { key: 'trends', label: 'Trends', group: 'Qualidade' },
];
const KEYS = new Set(CRITERIA.map((c) => c.key));

// Aceita só chaves conhecidas; valor inteiro 0–10 ou null (não se aplica / sem nota).
function normalizeScores(input) {
  const out = {};
  for (const c of CRITERIA) {
    const raw = input?.[c.key];
    if (raw === undefined || raw === null || raw === '') { out[c.key] = null; continue; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error(`Nota inválida em "${c.label}": use um número inteiro de 0 a 10.`);
    out[c.key] = n;
  }
  return out;
}

function computeTotal(scores) {
  const values = CRITERIA.map((c) => scores?.[c.key]).filter((v) => Number.isInteger(v));
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10);
}

function levelOf(total) {
  if (total === null || total === undefined) return 'none';
  if (total >= 80) return 'green';
  if (total >= 60) return 'yellow';
  return 'red';
}

module.exports = { CRITERIA, KEYS, normalizeScores, computeTotal, levelOf };
