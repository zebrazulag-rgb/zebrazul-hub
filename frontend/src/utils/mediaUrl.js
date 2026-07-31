const configuredApiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const configuredMediaOrigin = String(import.meta.env.VITE_MEDIA_ORIGIN || '').replace(/\/$/, '');
const LEGACY_BACKEND_ORIGIN = 'https://zebrazul-hub-production.up.railway.app';
const MEDIA_PATH_TOKEN = '/api/media/';

function originFrom(value) {
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function browserOrigin() {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
}

function getPrimaryMediaOrigin() {
  return (
    originFrom(configuredMediaOrigin) ||
    originFrom(configuredApiBase) ||
    browserOrigin() ||
    LEGACY_BACKEND_ORIGIN
  );
}

function mediaPathFrom(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /^(data:|blob:)/i.test(trimmed)) return '';

  const tokenIndex = trimmed.indexOf(MEDIA_PATH_TOKEN);
  if (tokenIndex >= 0) return trimmed.slice(tokenIndex);

  if (trimmed.startsWith('api/media/')) return `/${trimmed}`;
  if (trimmed.startsWith('media/')) return `/api/${trimmed}`;

  return '';
}

export function mediaUrlCandidates(value) {
  const mediaPath = mediaPathFrom(value);
  if (!mediaPath) return value ? [value] : [];

  const origins = [
    getPrimaryMediaOrigin(),
    browserOrigin(),
    originFrom(configuredApiBase),
    originFrom(configuredMediaOrigin),
    LEGACY_BACKEND_ORIGIN,
  ].filter(Boolean);

  return [...new Set(origins.map((origin) => `${origin}${mediaPath}`))];
}

export function resolveMediaUrl(value) {
  return mediaUrlCandidates(value)[0] || value;
}

function resolveSrcSet(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  return value
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (!parts[0]) return entry;
      parts[0] = resolveMediaUrl(parts[0]);
      return parts.join(' ');
    })
    .join(', ');
}

export function resolveMediaTree(value, seen = new WeakSet()) {
  if (typeof value === 'string') return resolveMediaUrl(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = resolveMediaTree(value[index], seen);
    }
    return value;
  }

  for (const key of Object.keys(value)) {
    value[key] = resolveMediaTree(value[key], seen);
  }
  return value;
}

export function attachMediaResolver(client) {
  client.interceptors.response.use((response) => {
    response.data = resolveMediaTree(response.data);
    return response;
  });
  return client;
}

function rewriteElementMedia(element) {
  if (!(element instanceof Element)) return;

  const attributes = ['src', 'poster'];
  for (const attribute of attributes) {
    // While an image/video is trying a fallback origin, do not force it back
    // to the primary URL through the MutationObserver.
    if (element.dataset?.mediaCandidateIndex && (attribute === 'src' || attribute === 'poster')) continue;

    const current = element.getAttribute(attribute);
    const resolved = resolveMediaUrl(current);
    if (current && resolved && resolved !== current) {
      element.setAttribute(attribute, resolved);
    }
  }

  const srcSet = element.getAttribute('srcset');
  const resolvedSrcSet = resolveSrcSet(srcSet);
  if (srcSet && resolvedSrcSet && resolvedSrcSet !== srcSet) {
    element.setAttribute('srcset', resolvedSrcSet);
  }

  for (const child of element.querySelectorAll?.('[src], [poster], [srcset]') || []) {
    rewriteElementMedia(child);
  }
}

function tryNextMediaCandidate(target) {
  const current = target.getAttribute('src') || target.currentSrc || target.src;
  const original = target.dataset.mediaOriginal || current;
  const candidates = mediaUrlCandidates(original);
  if (candidates.length <= 1) return false;

  target.dataset.mediaOriginal = original;
  const currentIndex = Math.max(0, candidates.indexOf(current));
  const nextIndex = Number(target.dataset.mediaCandidateIndex || currentIndex) + 1;
  if (nextIndex >= candidates.length) return false;

  target.dataset.mediaCandidateIndex = String(nextIndex);
  target.src = candidates[nextIndex];
  return true;
}

/**
 * Compatibility layer for old components and deployments. It rewrites managed
 * media URLs and, on network failure, tries the current API origin, the app
 * proxy and the legacy Railway origin before giving up.
 */
export function installMediaDomFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__zebrahubMediaFallbackInstalled) return;
  window.__zebrahubMediaFallbackInstalled = true;

  const rewriteDocument = () => rewriteElementMedia(document.documentElement);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewriteDocument, { once: true });
  } else {
    rewriteDocument();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        rewriteElementMedia(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) rewriteElementMedia(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'poster', 'srcset'],
  });

  document.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement) && !(target instanceof HTMLVideoElement)) return;
      tryNextMediaCandidate(target);
    },
    true
  );
}
