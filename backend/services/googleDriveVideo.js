const fs = require('fs');
const crypto = require('crypto');

let tokenCache = { token: null, expiresAt: 0 };

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function driveConfig() {
  const email = String(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(process.env.GOOGLE_DRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const rootFolderId = String(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim();
  return {
    email,
    privateKey,
    rootFolderId,
    configured: Boolean(email && privateKey && rootFolderId),
  };
}

async function getAccessToken() {
  const config = driveConfig();
  if (!config.configured) {
    const error = new Error('Google Drive não configurado. Informe GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY e GOOGLE_DRIVE_ROOT_FOLDER_ID.');
    error.code = 'DRIVE_NOT_CONFIGURED';
    throw error;
  }

  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: config.email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(config.privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Não foi possível autenticar a conta de serviço do Google Drive.');
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || `Erro do Google Drive (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return { response, data };
}

async function findFolder(name, parentId) {
  const q = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    `'${escapeDriveQuery(parentId)}' in parents`,
  ].join(' and ');
  const { data } = await driveRequest(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return data.files?.[0] || null;
}

async function createFolder(name, parentId) {
  const { data } = await driveRequest('/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  return data;
}

async function ensureFolder(name, parentId) {
  return (await findFolder(name, parentId)) || createFolder(name, parentId);
}

function cleanFolderName(value, fallback = 'Sem nome') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|#%{}~]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || fallback;
}

function cleanFileName(value, fallback = 'video-aprovado.mp4') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|#%{}~]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || fallback;
}

async function ensureApprovedFolder(clientName, approvedAt = new Date()) {
  const config = driveConfig();
  let parentId = config.rootFolderId;
  const clientFolder = await ensureFolder(cleanFolderName(clientName, 'Cliente'), parentId);
  parentId = clientFolder.id;
  const videosFolder = await ensureFolder('Vídeos', parentId);
  parentId = videosFolder.id;
  const yearFolder = await ensureFolder(String(approvedAt.getFullYear()), parentId);
  parentId = yearFolder.id;
  const month = String(approvedAt.getMonth() + 1).padStart(2, '0');
  const monthFolder = await ensureFolder(month, parentId);
  parentId = monthFolder.id;
  const approvedFolder = await ensureFolder('Aprovados', parentId);
  return approvedFolder.id;
}

async function uploadApprovedVideo({ filePath, fileName, mimeType, fileSize, clientName, approvedAt }) {
  const folderId = await ensureApprovedFolder(clientName, approvedAt || new Date());
  const token = await getAccessToken();
  const metadata = {
    name: cleanFileName(fileName),
    parents: [folderId],
  };

  const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,size,mimeType', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(fileSize),
    },
    body: JSON.stringify(metadata),
  });
  const createText = await createResponse.text();
  if (!createResponse.ok) {
    let payload = {};
    try { payload = JSON.parse(createText); } catch { payload = { raw: createText }; }
    throw new Error(payload?.error?.message || `Não foi possível iniciar o envio ao Drive (${createResponse.status}).`);
  }

  const location = createResponse.headers.get('location');
  if (!location) throw new Error('O Google Drive não retornou a URL de envio resumível.');

  const uploadResponse = await fetch(location, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileSize),
    },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  });
  const uploadText = await uploadResponse.text();
  let data = {};
  try { data = uploadText ? JSON.parse(uploadText) : {}; } catch { data = { raw: uploadText }; }
  if (!uploadResponse.ok) {
    throw new Error(data?.error?.message || `Falha no envio do vídeo ao Drive (${uploadResponse.status}).`);
  }
  return data;
}

module.exports = {
  driveConfig,
  uploadApprovedVideo,
};
