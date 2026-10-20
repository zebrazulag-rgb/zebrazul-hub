import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildLines, findRepeatedMargins, assemblePage, chunkPage, looksScanned, linesForRange } from '../src/utils/bookText.js';

const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function loadPages(file) {
  const data = new Uint8Array(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  const raw = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const height = page.getViewport({ scale: 1 }).height;
    raw.push(buildLines(content.items, height));
  }
  return raw;
}

test('extrai o texto em ordem, sem cabeçalho nem número de página', async () => {
  const raw = await loadPages('livro-texto.pdf');
  assert.equal(raw.length, 6);
  const repeated = findRepeatedMargins(raw);
  assert.ok([...repeated].some((k) => k.includes('livraria da chuva')), 'cabeçalho repetido detectado');
  const pages = raw.map((lines) => assemblePage(lines, repeated));
  for (const p of pages) {
    assert.ok(p.text.length > 200, 'página tem texto');
    assert.ok(!/A Livraria da Chuva — Romance/.test(p.text), 'cabeçalho removido');
    assert.ok(!/^\d+$/m.test(p.text), 'número de página removido');
  }
  const first = pages[0].text;
  assert.ok(first.startsWith('Capítulo Primeiro'), 'ordem: título primeiro');
  assert.ok(first.indexOf('Era uma vez') < first.indexOf('Você já leu este'), 'ordem dos parágrafos');
});

test('desfaz hifenização e une linhas do mesmo parágrafo', async () => {
  const raw = await loadPages('livro-texto.pdf');
  const repeated = findRepeatedMargins(raw);
  const all = raw.map((l) => assemblePage(l, repeated).text).join('\n');
  assert.ok(!/[a-zà-ÿ]- [a-zà-ÿ]/.test(all), 'sem "pala- vra"');
  const hadBreaks = raw.flat().filter((l) => /[a-zà-ÿ]-$/.test(l.text)).length;
  assert.ok(hadBreaks >= 3, `o PDF de teste tem quebras com hífen (${hadBreaks})`);
  const leftovers = (all.match(/[a-zà-ÿ]+-[a-zà-ÿ]+/g) || []).filter((w) => w !== 'ouvi-las');
  assert.deepEqual(leftovers, [], 'só sobram hífens legítimos (ouvi-las)');
  assert.ok(all.includes('literatura brasileira'), 'palavras íntegras');
  assert.ok(!all.includes('\n\n'), 'sem linhas em branco duplas');
});

test('trechos: tamanho adequado, abreviações preservadas, posições coerentes', async () => {
  const raw = await loadPages('livro-texto.pdf');
  const repeated = findRepeatedMargins(raw);
  const page = assemblePage(raw[0], repeated);
  const chunks = chunkPage(1, page.text);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) {
    assert.ok(c.text.length <= 240, `trecho curto o bastante (${c.text.length})`);
    assert.equal(page.text.slice(c.start, c.end), c.text, 'posição aponta para o próprio texto');
  }
  assert.ok(!chunks.some((c) => /\bDr\.$/.test(c.text)), '"Dr." não termina um trecho');
  assert.ok(chunks.some((c) => c.text.includes('Dr. Silva')), 'abreviação mantida junto do nome');
  // cobertura: nenhum trecho sobreposto e a ordem é crescente
  for (let i = 1; i < chunks.length; i += 1) assert.ok(chunks[i].start >= chunks[i - 1].end);
});

test('destaque: trecho mapeia para linhas da página', async () => {
  const raw = await loadPages('livro-texto.pdf');
  const page = assemblePage(raw[0], findRepeatedMargins(raw));
  const chunks = chunkPage(1, page.text);
  const rects = linesForRange(page.lines, chunks[1].start, chunks[1].end);
  assert.ok(rects.length >= 1);
  assert.ok(rects.every((r) => r.x1 > r.x && r.h > 0));
});

test('PDF só de imagens é identificado como sem texto (precisa de OCR)', async () => {
  const raw = await loadPages('livro-escaneado.pdf');
  const counts = raw.map((lines) => assemblePage(lines, new Set()).text.length);
  assert.equal(looksScanned(counts), true);
  const normal = (await loadPages('livro-texto.pdf')).map((l) => assemblePage(l, new Set()).text.length);
  assert.equal(looksScanned(normal), false);
});

test('continuidade: parágrafo que atravessa páginas segue a ordem entre trechos', async () => {
  const raw = await loadPages('livro-texto.pdf');
  const repeated = findRepeatedMargins(raw);
  const all = raw.map((l, i) => chunkPage(i + 1, assemblePage(l, repeated).text));
  assert.ok(all.every((c) => c.length > 0));
  const flat = all.flat();
  for (let i = 1; i < flat.length; i += 1) assert.ok(flat[i].page >= flat[i - 1].page);
});
