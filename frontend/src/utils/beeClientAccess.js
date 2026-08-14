function normalizeClientName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isBeeClient(client) {
  const name = normalizeClientName(client?.name);
  if (!name) return false;

  return (
    name === 'bee' ||
    name.startsWith('bee ') ||
    name.includes('bee christian') ||
    name.includes('bee light')
  );
}
