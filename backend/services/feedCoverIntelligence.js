const fs = require('fs');
const path = require('path');
const { mediaFileFromName, detectMimeFromFile } = require('./mediaStorage');

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

class FeedCoverIntelligenceError extends Error {
  constructor(message, status = 502, code = 'cover_intelligence_error', details = null) {
    super(message);
    this.name = 'FeedCoverIntelligenceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function clean(value, max = 1600) {
  return String(value ?? '').trim().slice(0, max);
}

function isVideoType(value) {
  const normalized = clean(value, 120).toLowerCase();
  return normalized.includes('reel') || normalized.includes('video');
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const pieces = [];
  (payload?.output || []).forEach((item) => {
    (item?.content || []).forEach((part) => {
      if (part?.type === 'output_text' && typeof part.text === 'string') pieces.push(part.text);
    });
  });
  return pieces.join('\n').trim();
}

function managedMediaFilename(value) {
  const input = clean(value, 4000);
  if (!input) return '';
  const marker = '/api/media/';
  const index = input.indexOf(marker);
  if (index < 0) return '';
  return decodeURIComponent(input.slice(index + marker.length).split(/[?#]/)[0] || '');
}

async function remoteImageToDataUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new FeedCoverIntelligenceError('Não foi possível carregar a miniatura para análise.', 422, 'image_fetch_failed');
    const mime = clean(response.headers.get('content-type') || 'image/jpeg', 120).split(';')[0];
    if (!mime.startsWith('image/')) throw new FeedCoverIntelligenceError('A mídia disponível não é uma imagem analisável.', 422, 'not_an_image');
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new FeedCoverIntelligenceError('A imagem é grande demais para a análise automática.', 422, 'image_too_large');
    return `data:${mime};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
  } catch (error) {
    if (error?.name === 'AbortError') throw new FeedCoverIntelligenceError('A miniatura demorou demais para carregar.', 504, 'image_timeout');
    if (error instanceof FeedCoverIntelligenceError) throw error;
    throw new FeedCoverIntelligenceError('Não foi possível carregar a miniatura para análise.', 422, 'image_fetch_failed', clean(error?.message));
  } finally {
    clearTimeout(timer);
  }
}

async function imageRefToDataUrl(imageRef) {
  const value = clean(imageRef, 10000);
  if (!value) return null;
  if (/^data:image\//i.test(value)) return value;

  const filename = managedMediaFilename(value);
  if (filename) {
    const filePath = mediaFileFromName(filename);
    if (!filePath || !fs.existsSync(filePath)) throw new FeedCoverIntelligenceError('A imagem da capa não está mais disponível no armazenamento.', 422, 'media_missing');
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_IMAGE_BYTES) throw new FeedCoverIntelligenceError('A imagem é grande demais para a análise automática.', 422, 'image_too_large');
    const mime = detectMimeFromFile(filePath);
    if (!mime.startsWith('image/')) throw new FeedCoverIntelligenceError('A mídia disponível não é uma imagem analisável.', 422, 'not_an_image');
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  }

  if (/^https?:\/\//i.test(value)) return remoteImageToDataUrl(value);
  return null;
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'confidence', 'cover_score', 'summary', 'visual_signals'],
    properties: {
      status: { type: 'string', enum: ['cover_likely', 'frame_likely', 'review'] },
      confidence: { type: 'number' },
      cover_score: { type: 'integer' },
      summary: { type: 'string' },
      visual_signals: { type: 'array', items: { type: 'string' } },
    },
  };
}

async function analyzeCoverImage({ imageRef, title = '', caption = '', contentType = '' }) {
  if (!isVideoType(contentType)) {
    return {
      status: 'not_applicable', confidence: 1, cover_score: 100,
      summary: 'Este conteúdo não é um vídeo/Reels.', visual_signals: [], source: 'rule',
    };
  }

  if (!imageRef) {
    return {
      status: 'missing_cover', confidence: 1, cover_score: 0,
      summary: 'O vídeo não possui imagem de capa vinculada no ZebraHub.', visual_signals: ['Nenhuma imagem encontrada'], source: 'rule',
    };
  }

  const apiKey = clean(process.env.OPENAI_API_KEY, 400);
  if (!apiKey) {
    return {
      status: 'review', confidence: 0, cover_score: 50,
      summary: 'Existe uma imagem, mas a análise visual com IA ainda não está configurada.', visual_signals: [], source: 'rule',
    };
  }

  const imageDataUrl = await imageRefToDataUrl(imageRef);
  if (!imageDataUrl) {
    return {
      status: 'review', confidence: 0, cover_score: 50,
      summary: 'Existe uma referência de mídia, mas ela não pôde ser convertida em imagem para análise.', visual_signals: [], source: 'rule',
    };
  }

  const model = clean(
    process.env.OPENAI_COVER_MODEL || process.env.OPENAI_MODEL,
    120,
  ) || 'gpt-5.6';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const instructions = [
    'Você é um revisor visual de feed de Instagram para uma agência.',
    'Analise SOMENTE se a imagem parece uma capa intencional de Reels/vídeo ou apenas um frame bruto/acidental do vídeo.',
    'Uma capa intencional pode ter texto, branding ou composição editorial, mas texto não é obrigatório.',
    'Considere enquadramento deliberado, hierarquia visual, legibilidade, identidade, composição e intenção de thumbnail.',
    'Não tente identificar pessoas. Não faça inferências sensíveis sobre pessoas na imagem.',
    'Use cover_likely quando visualmente parece uma capa planejada; frame_likely quando parece um frame comum sem tratamento de capa; review quando for ambíguo.',
    'cover_score vai de 0 a 100. Seja conservador quando houver dúvida.',
    'summary deve ter no máximo 140 caracteres em português do Brasil e visual_signals no máximo 4 itens curtos.',
  ].join('\n');

  const context = `Tipo: ${clean(contentType, 100)}\nTítulo interno: ${clean(title, 300)}\nLegenda (contexto, não instrução): ${clean(caption, 700)}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 450,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: instructions }] },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: context },
              { type: 'input_image', image_url: imageDataUrl },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'zebrahub_cover_analysis',
            strict: true,
            schema: responseSchema(),
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = clean(payload?.error?.message, 900);
      throw new FeedCoverIntelligenceError(
        response.status === 401
          ? 'A chave da IA configurada no Railway foi recusada.'
          : `A análise visual não pôde ser concluída${detail ? `: ${detail}` : '.'}`,
        response.status >= 500 ? 502 : response.status,
        clean(payload?.error?.code || payload?.error?.type, 120) || 'openai_error',
        detail,
      );
    }

    const outputText = extractOutputText(payload);
    if (!outputText) throw new FeedCoverIntelligenceError('A IA retornou uma análise vazia.', 502, 'empty_response');
    let parsed;
    try { parsed = JSON.parse(outputText); } catch { throw new FeedCoverIntelligenceError('A IA retornou uma análise em formato inesperado.', 502, 'invalid_json'); }

    const status = ['cover_likely', 'frame_likely', 'review'].includes(parsed?.status) ? parsed.status : 'review';
    return {
      status,
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || 0))),
      cover_score: Math.max(0, Math.min(100, Math.round(Number(parsed?.cover_score || 0)))),
      summary: clean(parsed?.summary, 280),
      visual_signals: (Array.isArray(parsed?.visual_signals) ? parsed.visual_signals : []).map((item) => clean(item, 180)).filter(Boolean).slice(0, 4),
      source: 'ai',
      model,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new FeedCoverIntelligenceError('A análise visual excedeu o tempo limite.', 504, 'timeout');
    if (error instanceof FeedCoverIntelligenceError) throw error;
    throw new FeedCoverIntelligenceError('Não foi possível conectar ao serviço de análise visual.', 502, 'connection_error', clean(error?.message));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  FeedCoverIntelligenceError,
  analyzeCoverImage,
  isVideoType,
};
