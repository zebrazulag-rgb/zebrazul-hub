const configuredApiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function backendOrigin() {
  if (/^https?:\/\//i.test(configuredApiBase)) {
    try {
      const url = new URL(configuredApiBase);
      return url.origin;
    } catch {
      return '';
    }
  }
  return '';
}

const apiOrigin = backendOrigin();

export function resolveMediaUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!apiOrigin || !value.includes('/api/media/')) return value;
  return value.replaceAll('/api/media/', `${apiOrigin}/api/media/`);
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
