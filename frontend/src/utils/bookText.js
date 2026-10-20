// Zebra Leitor — extração e preparo do texto de PDFs para narração.
// Funções PURAS (sem DOM, sem PDF.js): recebem os "items" de getTextContent() e devolvem
// linhas, parágrafos e trechos com posições, para narrar em ordem e destacar o que está sendo lido.

const MARGIN_ZONE = 0.1; // topo/rodapé: 10% da altura da página
const SENTENCE_END = /[.!?…]["”»')\]]*$/;
const ABBREVIATIONS = /(?:^|\s)(?:sr|sra|srs|srta|dr|dra|drs|prof|profa|av|n|nº|no|p|pp|pág|cap|fig|etc|ex|obs|vol|ed|art|tel|ltda|cf|ibid|apud|min|máx|séc|rua|ap|sta|sto|exmo|exma|gen|cel|maj|cap|ten|sgt|jr|st|mr|mrs|ms|vs)\.$/i;

const norm = (s) => String(s || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();

// Chave de comparação de cabeçalhos/rodapés: ignora números (a página muda a cada folha).
export function marginKey(text) {
  return norm(text).toLowerCase().replace(/\d+/g, '#').replace(/\b[ivxlcdm]+\b/g, (m) => (m.length <= 6 ? '#' : m));
}

const PAGE_NUMBER_ONLY = /^(?:[-–—•·\s]*)(?:p[áa]g(?:ina)?\.?\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:de|\/)\s*\d{1,4})?(?:[-–—•·\s]*)$/i;

// 1) Items do PDF.js -> linhas na ordem do fluxo do documento, com posição na página.
export function buildLines(items, pageHeight) {
  const lines = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const text = norm(cur.text);
    if (text) lines.push({ text, x: cur.x0, x1: cur.x1, y: cur.y, h: cur.h, yRatio: pageHeight ? cur.y / pageHeight : 0.5 });
    cur = null;
  };
  for (const item of items || []) {
    if (!item || typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const h = Math.abs(item.height) || Math.abs(item.transform[3]) || 10;
    const w = Math.abs(item.width) || 0;
    if (!item.str.trim() && !cur) continue;
    const sameLine = cur && Math.abs(y - cur.y) <= Math.max(2, 0.45 * Math.max(h, cur.h));
    if (!sameLine) {
      flush();
      cur = { text: item.str, x0: x, x1: x + w, y, h };
    } else {
      const gap = x - cur.x1;
      const needSpace = gap > 0.15 * h && !/\s$/.test(cur.text) && !/^\s/.test(item.str);
      cur.text += (needSpace ? ' ' : '') + item.str;
      cur.x0 = Math.min(cur.x0, x);
      cur.x1 = Math.max(cur.x1, x + w);
      cur.h = Math.max(cur.h, h);
    }
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

// 2) Cabeçalhos/rodapés repetidos: olha linhas nas margens de várias páginas amostradas.
export function findRepeatedMargins(sampledPages) {
  const counts = new Map();
  const usable = (sampledPages || []).filter((lines) => lines && lines.length);
  usable.forEach((lines) => {
    const seen = new Set();
    lines.forEach((line) => {
      if (line.yRatio > 1 - MARGIN_ZONE || line.yRatio < MARGIN_ZONE) {
        const key = marginKey(line.text);
        if (key && key.length > 1 && !seen.has(key)) { seen.add(key); counts.set(key, (counts.get(key) || 0) + 1); }
      }
    });
  });
  const minHits = Math.max(2, Math.ceil(usable.length * 0.4));
  return new Set([...counts.entries()].filter(([, n]) => n >= minHits).map(([key]) => key));
}

function isMarginNoise(line, repeated) {
  const inMargin = line.yRatio > 1 - MARGIN_ZONE || line.yRatio < MARGIN_ZONE;
  if (!inMargin) return false;
  if (PAGE_NUMBER_ONLY.test(line.text)) return true;
  return repeated && repeated.has(marginKey(line.text));
}

// 3) Linhas -> parágrafos limpos (hifenização desfeita, quebras de linha unidas) com mapa de posições.
export function assemblePage(rawLines, repeatedMargins) {
  const lines = (rawLines || []).filter((line) => !isMarginNoise(line, repeatedMargins));
  if (!lines.length) return { text: '', lines: [], paragraphs: [] };

  const heights = lines.map((l) => l.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;
  const widths = lines.map((l) => l.x1 - l.x);
  const maxWidth = Math.max(...widths, 1);
  const minX = Math.min(...lines.map((l) => l.x));

  let text = '';
  const outLines = [];
  const paragraphs = [];
  let paraStart = 0;
  let prev = null;
  let prevOut = null;

  const closeParagraph = () => {
    const end = text.length;
    if (end > paraStart) paragraphs.push({ start: paraStart, end });
  };

  lines.forEach((line) => {
    let newParagraph = false;
    if (prev) {
      const gap = prev.y - line.y; // y cresce para cima no PDF
      const bigGap = gap > 1.7 * Math.max(medianH, line.h);
      const prevEndsSentence = SENTENCE_END.test(prev.text) && !ABBREVIATIONS.test(prev.text);
      const prevShort = (prev.x1 - prev.x) < 0.62 * maxWidth;
      const indented = line.x > minX + 1.1 * medianH;
      const headingJump = Math.abs(line.h - prev.h) > 0.25 * medianH;
      newParagraph = bigGap || (prevEndsSentence && (prevShort || indented)) || headingJump || (gap < -2 * medianH);
    }
    if (prev && newParagraph) {
      closeParagraph();
      text += '\n';
      paraStart = text.length;
    } else if (prev) {
      // continuação do mesmo parágrafo
      const hyphenated = /[A-Za-zÀ-ÿ]-$/.test(prevOut.text) && /^[a-zà-ÿ]/.test(line.text);
      if (hyphenated) {
        text = text.slice(0, -1); // remove o hífen de quebra
        prevOut.end = text.length;
        prevOut.text = prevOut.text.slice(0, -1);
      } else {
        text += ' ';
      }
    }
    const start = text.length;
    text += line.text;
    const out = { start, end: text.length, x: line.x, x1: line.x1, y: line.y, h: line.h, text: line.text };
    outLines.push(out);
    prev = line;
    prevOut = out;
  });
  closeParagraph();
  return { text, lines: outLines, paragraphs };
}

function splitLong(sentence, maxLen) {
  const parts = [];
  let rest = sentence;
  while (rest.length > maxLen) {
    let cut = -1;
    for (const sep of ['; ', ': ', ', ', ' – ', ' — ', ' ']) {
      const idx = rest.lastIndexOf(sep, maxLen);
      if (idx > maxLen * 0.4) { cut = idx + sep.length; break; }
    }
    if (cut === -1) cut = maxLen;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

function sentencesOf(text, offset) {
  // Divide em frases sem usar lookbehind (compatível com Safari/iOS antigos).
  const out = [];
  const re = /[.!?…]+["”»')\]]*\s+/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const candidate = text.slice(last, m.index + m[0].trimEnd().length);
    const next = text.slice(end, end + 1);
    const abbr = ABBREVIATIONS.test(candidate.trimEnd());
    const initial = /(?:^|\s)[A-ZÀ-Ý]\.$/.test(candidate.trimEnd());
    const decimal = false;
    const nextLower = /[a-zà-ÿ]/.test(next) && !/[!?…]$/.test(m[0].trim());
    if (abbr || initial || decimal || nextLower) continue;
    out.push({ start: offset + last, end: offset + end });
    last = end;
  }
  if (last < text.length) out.push({ start: offset + last, end: offset + text.length });
  return out;
}

// 4) Texto da página -> trechos de ~80–220 caracteres, com posição, prontos para a voz.
export function chunkPage(page, text, { target = 140, max = 220 } = {}) {
  const chunks = [];
  if (!text || !text.trim()) return chunks;
  let offset = 0;
  const paragraphs = text.split('\n');
  paragraphs.forEach((paragraph) => {
    const base = offset;
    offset += paragraph.length + 1;
    if (!paragraph.trim()) return;
    let buffer = null;
    const push = (start, end) => {
      const slice = text.slice(start, end);
      const trimmedStart = start + (slice.length - slice.trimStart().length);
      const trimmedEnd = end - (slice.length - slice.trimEnd().length);
      if (trimmedEnd > trimmedStart) chunks.push({ page, start: trimmedStart, end: trimmedEnd, text: text.slice(trimmedStart, trimmedEnd) });
    };
    sentencesOf(paragraph, base).forEach((sentence) => {
      const len = sentence.end - sentence.start;
      if (len > max) {
        if (buffer) { push(buffer.start, buffer.end); buffer = null; }
        let pos = sentence.start;
        splitLong(text.slice(sentence.start, sentence.end), max).forEach((part) => { push(pos, pos + part.length); pos += part.length; });
        return;
      }
      if (!buffer) { buffer = { start: sentence.start, end: sentence.end }; return; }
      if ((buffer.end - buffer.start) + len <= target) { buffer.end = sentence.end; return; }
      push(buffer.start, buffer.end);
      buffer = { start: sentence.start, end: sentence.end };
    });
    if (buffer) push(buffer.start, buffer.end);
  });
  return chunks;
}

// PDF "só de imagens": pouco ou nenhum texto nas páginas amostradas.
export function looksScanned(charCountsPerSample) {
  const total = (charCountsPerSample || []).reduce((sum, n) => sum + n, 0);
  return total < 80;
}

// Linhas da página que cobrem o trecho [start, end) — para destacar no PDF.
export function linesForRange(lines, start, end) {
  return (lines || [])
    .filter((line) => line.end > start && line.start < end)
    .map((line) => {
      const len = Math.max(1, line.end - line.start);
      const a = Math.max(0, (Math.max(start, line.start) - line.start) / len);
      const b = Math.min(1, (Math.min(end, line.end) - line.start) / len);
      return { x: line.x + (line.x1 - line.x) * a, x1: line.x + (line.x1 - line.x) * b, y: line.y, h: line.h };
    });
}
