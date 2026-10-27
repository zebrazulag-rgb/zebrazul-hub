// Radar de Conteúdo — leitura de feeds RSS/Atom reais. Sem scraping de páginas,
// sem IA e sem APIs de terceiros: apenas HTTP GET nos feeds que o usuário cadastra.
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const zlib = require('zlib');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 4;
const MAX_ITEMS_PER_FEED = 100;
const SUMMARY_LIMIT = 600;
const USER_AGENT = 'ZebraHub-Radar/1.0 (+leitor de RSS; contato: agencia)';

const COMMON_FEED_PATHS = ['/feed', '/feed/', '/rss', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml', '/feeds/posts/default', '/blog/feed', '/noticias/feed'];

// ---------- Segurança de rede (SSRF) ----------
let allowPrivateForTests = false; // só para testes locais
function setAllowPrivateForTests(v) { allowPrivateForTests = Boolean(v); }

function isPrivateAddress(address) {
  if (allowPrivateForTests) return false;
  if (!address) return true;
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reservado
    return false;
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

// O lookup roda no momento da conexão, então vale também para redirecionamentos e evita DNS rebinding.
function guardedLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : (options || {});
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, opts, (error, address, family) => {
    if (error) return cb(error);
    // Node 20+ pode pedir todos os endereços (all: true); nesse caso o retorno é uma lista.
    if (Array.isArray(address)) {
      const allowed = address.filter((entry) => !isPrivateAddress(entry.address));
      if (!allowed.length) return cb(new Error('Endereço não permitido (rede interna).'));
      return cb(null, allowed);
    }
    if (isPrivateAddress(address)) return cb(new Error('Endereço não permitido (rede interna).'));
    return cb(null, address, family);
  });
}

function normalizeUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Informe o endereço do site ou do feed.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) throw new Error('Use apenas endereços http ou https.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw new Error('Endereço inválido.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use apenas endereços http ou https.');
  if (url.username || url.password) throw new Error('Endereços com usuário e senha não são aceitos.');
  if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new Error('Endereço não permitido (rede interna).');
  if (!allowPrivateForTests && /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw new Error('Endereço não permitido (rede interna).');
  return url;
}

function requestOnce(url, headers) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5', 'Accept-Encoding': 'gzip, deflate', ...headers },
      lookup: guardedLookup,
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      let size = 0;
      let stream = res;
      const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(new Error('O feed é grande demais (limite 2 MB).')); return; }
        chunks.push(chunk);
      });
      stream.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('O site demorou demais para responder.')));
    req.on('error', reject);
    req.end();
  });
}

let fetcher = requestOnce; // trocável nos testes
function setFetcherForTests(fn) { fetcher = fn || requestOnce; }

async function fetchUrl(rawUrl, { headers = {} } = {}) {
  let url = normalizeUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetcher(url, headers);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      url = normalizeUrl(new URL(response.headers.location, url).toString());
      continue;
    }
    return { ...response, finalUrl: url.toString() };
  }
  throw new Error('Redirecionamentos demais.');
}

// ---------- Parser RSS / Atom ----------
function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function safeCodePoint(n) { try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; } catch { return ''; } }

function unwrap(raw) {
  const text = String(raw || '').trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : decodeEntities(text);
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function truncate(text, limit) {
  const value = String(text || '');
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trim()}…`;
}

function tagBlock(xml, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
    const m = xml.match(re);
    if (m) return m[1];
  }
  return null;
}

function attr(tag, name) {
  const m = String(tag || '').match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3]) : null;
}

function atomLink(entry) {
  const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /rel\s*=\s*["']alternate["']/i.test(l)) || links.find((l) => !/rel\s*=/i.test(l)) || links[0];
  return alt ? attr(alt, 'href') : null;
}

function toIso(value) {
  if (!value) return null;
  const time = Date.parse(String(value).trim());
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function resolveLink(link, base) {
  if (!link) return null;
  try {
    const url = new URL(String(link).trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function parseFeed(xmlInput, baseUrl = 'https://example.com/') {
  const xml = String(xmlInput || '').replace(/^﻿/, '');
  const head = xml.slice(0, 2000).toLowerCase();
  const isAtom = /<feed[\s>]/.test(head) || (/<feed[\s>]/.test(xml.slice(0, 5000).toLowerCase()) && !/<rss[\s>]/.test(head));
  const isRss = /<rss[\s>]|<rdf:rdf[\s>]|<channel[\s>]/.test(xml.slice(0, 5000).toLowerCase());
  if (!isAtom && !isRss) throw new Error('O endereço não devolveu um feed RSS ou Atom válido.');

  const type = isAtom ? 'atom' : 'rss';
  const blocks = [...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const feedHeadXml = isAtom ? xml.split(/<entry[\s>]/i)[0] : xml.split(/<item[\s>]/i)[0];
  const feedTitle = stripHtml(unwrap(tagBlock(feedHeadXml, ['title']) || ''));
  const feedSiteLink = isAtom ? resolveLink(atomLink(feedHeadXml), baseUrl) : resolveLink(stripHtml(unwrap(tagBlock(feedHeadXml, ['link']) || '')), baseUrl);

  const items = [];
  for (const block of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    const title = stripHtml(unwrap(tagBlock(block, ['title']) || ''));
    const link = resolveLink(isAtom ? atomLink(block) : (stripHtml(unwrap(tagBlock(block, ['link']) || '')) || attr((block.match(/<link\b[^>]*>/i) || [''])[0], 'href')), baseUrl);
    const rawSummary = tagBlock(block, isAtom ? ['summary', 'content'] : ['description', 'content:encoded', 'summary']);
    const summary = truncate(stripHtml(unwrap(rawSummary || '')), SUMMARY_LIMIT);
    const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
    const nt = norm(title); const ns = norm(summary);
    const sameAsTitle = Boolean(ns) && (ns === nt || nt.startsWith(ns) || (ns.startsWith(nt) && ns.length - nt.length < 40));
    const published = toIso(unwrap(tagBlock(block, isAtom ? ['published', 'updated'] : ['pubDate', 'dc:date', 'published', 'updated']) || ''));
    const guid = stripHtml(unwrap(tagBlock(block, isAtom ? ['id'] : ['guid']) || '')) || link || title;
    if (!title && !summary) continue;
    items.push({ guid: String(guid).slice(0, 500), title: truncate(title || summary, 300), summary: sameAsTitle ? '' : summary, link, published_at: published });
  }
  return { type, title: feedTitle, site_url: feedSiteLink, items };
}

// ---------- Descoberta de feed ----------
function findFeedLinksInHtml(html, baseUrl) {
  const found = [];
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const type = (attr(tag, 'type') || '').toLowerCase();
    if (rel.includes('alternate') && /(rss|atom)\+xml|application\/xml|text\/xml/.test(type)) {
      const href = resolveLink(attr(tag, 'href'), baseUrl);
      if (href) found.push({ feed_url: href, title: attr(tag, 'title') || null });
    }
  }
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const href = decodeEntities(m[2] ?? m[3]);
    if (/(^|[\/._-])(rss|atom|feed|feeds)([\/._?-]|$)|\.xml($|\?)/i.test(href)) {
      const abs = resolveLink(href, baseUrl);
      if (abs && !found.some((f) => f.feed_url === abs)) found.push({ feed_url: abs, title: null });
    }
  }
  return found;
}

// Padrões conhecidos de feed a partir do endereço colado (seção/tópico) e de sites que os publicam em outro domínio.
function guessFeedUrls(pageUrl) {
  const url = new URL(pageUrl);
  const out = [];
  const path = url.pathname.replace(/\/+$/, '');
  if (path) {
    const base = `${url.origin}${path}`;
    out.push({ feed_url: `${base}/rss.xml`, method: 'padrão da seção' }, { feed_url: `${base}.rss`, method: 'padrão da seção' },
      { feed_url: `${base}/feed`, method: 'padrão da seção' }, { feed_url: `${base}/rss`, method: 'padrão da seção' }, { feed_url: `${base}?format=rss`, method: 'padrão da seção' });
  }
  const bbc = /(^|\.)bbc\.(com|co\.uk)$/i.test(url.hostname) ? path.match(/^\/([a-z-]+)\/topics\/([a-z0-9]+)/i) : null;
  if (bbc) {
    out.push({ feed_url: `https://feeds.bbci.co.uk/${bbc[1]}/topics/${bbc[2]}/rss.xml`, method: 'feed do tópico (BBC)' },
      { feed_url: `https://feeds.bbci.co.uk/${bbc[1]}/rss.xml`, method: 'feed geral do site (BBC), não só deste tópico' });
  }
  return out;
}

async function tryParseFeed(url) {
  const response = await fetchUrl(url);
  if (response.status < 200 || response.status >= 300) throw new Error(`O site respondeu ${response.status}.`);
  const text = response.body.toString('utf8');
  const feed = parseFeed(text, response.finalUrl);
  return { feed, finalUrl: response.finalUrl };
}

async function discoverFeeds(rawUrl) {
  const start = normalizeUrl(rawUrl).toString();
  const candidates = [];
  const seen = new Set();
  const add = (candidate) => { if (!seen.has(candidate.feed_url)) { seen.add(candidate.feed_url); candidates.push(candidate); } };

  const first = await fetchUrl(start);
  if (first.status < 200 || first.status >= 300) throw new Error(`O site respondeu ${first.status}. Confira o endereço.`);
  const text = first.body.toString('utf8');

  try {
    const feed = parseFeed(text, first.finalUrl);
    add({ feed_url: first.finalUrl, title: feed.title, type: feed.type, site_url: feed.site_url, sample_count: feed.items.length, method: 'direto' });
    return candidates;
  } catch { /* não é feed: segue para descoberta pelo HTML */ }

  const origin = new URL(first.finalUrl).origin;
  const declared = findFeedLinksInHtml(text, first.finalUrl);
  const queue = [
    ...declared.map((d) => ({ ...d, method: 'declarado na página' })),
    ...guessFeedUrls(first.finalUrl),
    ...COMMON_FEED_PATHS.map((p) => ({ feed_url: `${origin}${p}`, title: null, method: 'endereço comum' })),
  ];
  const deadline = Date.now() + 25000;
  for (const entry of queue) {
    if (candidates.length >= 5 || Date.now() > deadline) break;
    if (seen.has(entry.feed_url)) continue;
    try {
      const { feed, finalUrl } = await tryParseFeed(entry.feed_url);
      add({ feed_url: finalUrl, title: feed.title || entry.title, type: feed.type, site_url: feed.site_url || origin, sample_count: feed.items.length, method: entry.method });
    } catch { /* tenta o próximo */ }
  }
  return candidates;
}

// Feed de busca do Google Notícias (RSS real) para acompanhar um assunto, mesmo sem site com feed.
function googleNewsFeedUrl(query, { days = 0 } = {}) {
  const q = String(query || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (q.length < 2) throw new Error('Digite o assunto (ex.: saúde mental).');
  const full = days > 0 ? `${q} when:${Math.min(30, days)}d` : q;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(full)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

module.exports = {
  googleNewsFeedUrl, guessFeedUrls,
  isPrivateAddress, guardedLookup, normalizeUrl, fetchUrl, parseFeed, discoverFeeds, tryParseFeed, findFeedLinksInHtml,
  setFetcherForTests, setAllowPrivateForTests, stripHtml, truncate,
};
