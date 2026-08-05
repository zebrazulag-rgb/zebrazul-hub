const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  mediaFileFromName,
  persistMediaBuffer,
} = require('./mediaStorage');

const FFMPEG_TIMEOUT_MS = Number(process.env.INSTAGRAM_STORY_FFMPEG_TIMEOUT_MS || 180000);

function enabled() {
  return String(process.env.INSTAGRAM_STORY_VISUAL_CREDIT || 'true').toLowerCase() !== 'false';
}

function managedFilename(mediaUrl) {
  try {
    const parsed = new URL(String(mediaUrl || ''), 'https://zebrahub.local');
    return decodeURIComponent(path.basename(parsed.pathname));
  } catch {
    return path.basename(String(mediaUrl || ''));
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('A preparação do crédito visual demorou demais.'));
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(new Error('O FFmpeg não está instalado no backend. Faça o deploy com o arquivo railpack.json desta versão.'));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Não foi possível inserir o crédito visual no Story. ${stderr.split('\n').slice(-4).join(' ')}`.trim()));
    });
  });
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function videoFilter(username) {
  // Padroniza em 9:16 e grava o crédito em uma faixa discreta próxima ao rodapé.
  const safe = normalizeUsername(username).replace(/[^a-z0-9._]/g, '');
  return [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
    'drawbox=x=150:y=1685:w=780:h=115:color=black@0.58:t=fill',
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='@${safe}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1718`,
  ].join(',');
}

async function createVisualCredit({ mediaUrl, mediaType, mediaMime, username }) {
  const normalized = normalizeUsername(username);
  if (!enabled() || !normalized) {
    return { mediaUrl, applied: false, username: normalized || null };
  }

  const filename = managedFilename(mediaUrl);
  const inputPath = mediaFileFromName(filename);
  if (!inputPath) {
    throw new Error('A mídia original não foi encontrada no volume para inserir o crédito visual.');
  }

  const isVideo = mediaType === 'video' || String(mediaMime || '').startsWith('video/');
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zebrahub-story-credit-'));
  const outputPath = path.join(tempDirectory, isVideo ? 'credited.mp4' : 'credited.jpg');
  const filter = videoFilter(normalized);

  try {
    const args = isVideo
      ? [
          '-y', '-i', inputPath,
          '-vf', filter,
          '-map', '0:v:0', '-map', '0:a?',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          outputPath,
        ]
      : [
          '-y', '-i', inputPath,
          '-vf', filter,
          '-frames:v', '1', '-q:v', '2',
          outputPath,
        ];

    await runFfmpeg(args);
    const buffer = fs.readFileSync(outputPath);
    const creditedUrl = persistMediaBuffer(buffer, isVideo ? 'video/mp4' : 'image/jpeg');
    if (!creditedUrl) throw new Error('Não foi possível salvar a mídia com crédito visual.');
    return {
      mediaUrl: creditedUrl,
      applied: true,
      username: normalized,
      mediaType: isVideo ? 'video' : 'image',
      mediaMime: isVideo ? 'video/mp4' : 'image/jpeg',
    };
  } finally {
    try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  createVisualCredit,
};
