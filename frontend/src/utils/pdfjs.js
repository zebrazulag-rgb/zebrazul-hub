import { getTenantSlug } from '../tenant';
import { buildLines, looksScanned, findRepeatedMargins, assemblePage } from './bookText.js';

// PDF.js é carregado sob demanda (só quando o Zebra Leitor é aberto) para não pesar o app todo.
let pdfjsPromise = null;
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/build/pdf.js'),
      import('pdfjs-dist/build/pdf.worker.min.js?url'),
    ]).then(([lib, worker]) => {
      const pdfjs = lib.default?.getDocument ? lib.default : lib;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => { pdfjsPromise = null; throw error; });
  }
  return pdfjsPromise;
}

export function friendlyPdfError(error) {
  const name = error?.name || '';
  if (name === 'PasswordException') return 'Este PDF é protegido por senha e não pode ser lido.';
  if (name === 'InvalidPDFException' || name === 'FormatError') return 'O arquivo está corrompido ou não é um PDF válido.';
  if (name === 'MissingPDFException') return 'O arquivo deste livro não foi encontrado.';
  if (name === 'UnexpectedResponseException') return 'O servidor não entregou o arquivo do livro. Tente novamente.';
  return 'Não foi possível abrir este PDF.';
}

const apiBase = import.meta.env.VITE_API_URL || '/api';

// Abre o livro direto do servidor (rota privada, com login). Usa leitura por partes quando suportada.
export async function openBookDocument(bookId) {
  const pdfjs = await loadPdfjs();
  const token = localStorage.getItem('zebrazul_token') || '';
  const task = pdfjs.getDocument({
    url: `${apiBase}/books/${bookId}/file`,
    httpHeaders: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': getTenantSlug() },
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    isEvalSupported: false,
  });
  return task.promise;
}

// Metadados de PDF costumam vir com lixo ("untitled", "Microsoft Word - arquivo.docx", "anonymous"): ignora o que não ajuda.
const GENERIC_META = /^(untitled|unknown|anonymous|admin|administrator|user|usuario|usuário|owner|author|autor|sem t[ií]tulo|documento\d*|document\d*|\.|-)$/i;
export function cleanMeta(value, kind) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || GENERIC_META.test(text)) return '';
  if (kind === 'title' && (/^microsoft (word|powerpoint|excel)\b/i.test(text) || /\.(docx?|indd|pdf|pptx?|rtf|odt|tex)$/i.test(text))) return '';
  return text.slice(0, 200);
}

// Lê o PDF antes do envio: valida, conta páginas, gera a capa e detecta se existe texto (senão: precisa de OCR).
export async function inspectPdfFile(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    let title = '';
    let author = '';
    try {
      const meta = await doc.getMetadata();
      title = cleanMeta(meta?.info?.Title, 'title');
      author = cleanMeta(meta?.info?.Author, 'author');
    } catch { /* metadados são opcionais */ }

    let cover = null;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = 360 / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      cover = canvas.toDataURL('image/jpeg', 0.72);
      canvas.width = 0; canvas.height = 0;
    } catch { cover = null; }

    const samples = [];
    const total = doc.numPages;
    const picks = [...new Set([1, 2, 3, Math.ceil(total / 2), Math.ceil(total * 0.75)].filter((n) => n >= 1 && n <= total))];
    for (const n of picks) {
      try {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const height = page.getViewport({ scale: 1 }).height;
        samples.push(assemblePage(buildLines(content.items, height), new Set()).text.length);
      } catch { samples.push(0); }
    }
    return { pageCount: total, title, author, cover, textStatus: looksScanned(samples) ? 'no_text' : 'has_text' };
  } finally {
    doc.destroy();
  }
}

// Texto de uma página já limpo (sem cabeçalhos/rodapés repetidos), com linhas para o destaque.
export async function extractPageModel(doc, pageNumber, repeated) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const height = page.getViewport({ scale: 1 }).height;
  const raw = buildLines(content.items, height);
  return { raw, model: assemblePage(raw, repeated) };
}

// Amostra páginas espalhadas pelo livro para descobrir cabeçalhos/rodapés que se repetem.
export async function detectRepeatedMargins(doc) {
  const total = doc.numPages;
  if (total < 4) return new Set();
  const picks = new Set();
  const count = Math.min(12, total);
  for (let i = 0; i < count; i += 1) picks.add(Math.max(1, Math.min(total, Math.round(2 + (i * (total - 3)) / Math.max(1, count - 1)))));
  const sampled = [];
  for (const n of picks) {
    try {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      sampled.push(buildLines(content.items, page.getViewport({ scale: 1 }).height));
    } catch { /* página ilegível: ignora na amostra */ }
  }
  return findRepeatedMargins(sampled);
}
