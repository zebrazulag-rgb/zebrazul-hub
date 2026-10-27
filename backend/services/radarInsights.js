// Radar de Conteúdo — "em alta": termos que mais aparecem nos títulos recentes.
// Contagem simples de palavras (sem IA): ignora palavras comuns e conta em quantas notícias o termo aparece.
const STOP = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre entre ate ao aos à às e ou mas que se como mais menos muito muita muitos muitas ja nao sim '
  + 'seu sua seus suas este esta estes estas esse essa esses essas isso isto aquele aquela ele ela eles elas voce voces nos nosso nossa foi sao ser sera tem ter tambem quando onde qual quais quem porque '
  + 'sobre apos antes ainda so apenas cada todo toda todos todas outro outra outros outras novo nova novos novas ano anos dia dias mes meses veja saiba confira entenda guia dicas dica passo '
  + 'the and for you your with from that this are how what').split(/\s+/).filter(Boolean));

function fold(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function trendingTerms(titles, { limit = 10, minCount = 2 } = {}) {
  const counts = new Map();
  for (const title of titles) {
    const seen = new Set();
    const words = String(title || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const word of words) {
      const key = fold(word);
      if (key.length < 4 || STOP.has(key) || /^\d+$/.test(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) || { term: word.toLowerCase(), count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].filter((e) => e.count >= minCount).sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, limit);
}

module.exports = { trendingTerms, fold };
