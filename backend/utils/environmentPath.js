const path = require('path');

/**
 * Railway/Vercel dashboards store environment variable values literally.
 * It is common to paste values as "/data/media" including the quotes. In that
 * case path.resolve() would point to a non-existent directory containing quote
 * characters. Normalize those values before using them as filesystem paths.
 */
function normalizeEnvironmentPath(value) {
  let normalized = String(value || '').trim();

  // Remove repeated matching quote pairs, for example: '"/data/media"'.
  for (let attempt = 0; attempt < 3 && normalized.length >= 2; attempt += 1) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }

  return normalized;
}

function resolveEnvironmentPath(value) {
  const normalized = normalizeEnvironmentPath(value);
  return normalized ? path.resolve(normalized) : '';
}

module.exports = { normalizeEnvironmentPath, resolveEnvironmentPath };
