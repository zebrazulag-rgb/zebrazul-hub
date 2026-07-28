const STORAGE_KEY = 'zebrahub_commercial_updated_at';
const CHANNEL_NAME = 'zebrahub-commercial-live';

export function notifyCommercialUpdated(clientId) {
  const payload = {
    clientId: Number(clientId || 0) || null,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // O evento em memória continua funcionando mesmo sem localStorage.
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }
}

export function subscribeCommercialUpdates(callback) {
  let channel = null;

  function handleStorage(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      callback(JSON.parse(event.newValue));
    } catch {
      callback({ clientId: null, timestamp: Date.now() });
    }
  }

  window.addEventListener('storage', handleStorage);

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event) => callback(event.data || {}));
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    channel?.close();
  };
}
