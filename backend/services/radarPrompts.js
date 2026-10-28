// Radar de Conteúdo — monta o TEXTO do prompt. Não chama IA nem API externa:
// o usuário copia e usa por conta própria fora da plataforma.

function clean(value, fallback = 'não informado') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatDate(iso) {
  if (!iso) return 'não informada';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'não informada';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Fortaleza' }).format(date);
}

const KINDS = {
  carousel: 'carrossel',
  video: 'roteiro de vídeo',
};

function buildPrompt({ kind, client, item, source, angle = '', presenceDiagnostic = null }) {
  if (!KINDS[kind]) throw new Error('Tipo de prompt inválido.');
  const references = String(client.editorial_references || '').trim();
  const angleText = String(angle || '').trim();

  const context = [
    '## CONTEXTO DO CLIENTE',
    `Cliente: ${clean(client.name)}`,
    client.segment ? `Segmento: ${client.segment}` : null,
    '',
    '## REFERÊNCIAS DE ESTILO EDITORIAL',
    references || 'Nenhuma referência cadastrada. Use um tom profissional, claro e próximo, adequado ao segmento do cliente.',
    '',
    '## NOTÍCIA DE BASE',
    `Título: ${clean(item.title)}`,
    `Trecho: ${clean(item.summary, '(a fonte não forneceu trecho)')}`,
    `Fonte: ${clean(source?.name || item.source_name)}`,
    `Data: ${formatDate(item.published_at)}`,
    `Link: ${clean(item.link, '(sem link)')}`,
  ].filter((line) => line !== null);

  const angleBlock = angleText ? ['', '## ÂNGULO PEDIDO PELA AGÊNCIA', angleText] : [];
  const diagnosisBlock = presenceDiagnostic ? [
    '',
    '## DIREÇÃO ESTRATÉGICA DO MAPA DA MARCA',
    presenceDiagnostic.archetype_name ? `Leitura atual: ${presenceDiagnostic.archetype_name}` : null,
    presenceDiagnostic.top_need_name ? `Necessidade dominante: ${presenceDiagnostic.top_need_name}` : null,
    Array.isArray(presenceDiagnostic.top_needs) && presenceDiagnostic.top_needs.length
      ? `Prioridades: ${presenceDiagnostic.top_needs.map((item) => `${item.name} (${item.score}/100)`).join(', ')}`
      : null,
    Number.isFinite(Number(presenceDiagnostic.pressure)) ? `Pressão do mercado: ${Number(presenceDiagnostic.pressure)}%` : null,
    Number.isFinite(Number(presenceDiagnostic.diff)) ? `Força de diferenciação: ${Number(presenceDiagnostic.diff)}%` : null,
    Array.isArray(presenceDiagnostic.priority_environments) && presenceDiagnostic.priority_environments.length
      ? `Ambientes prioritários: ${presenceDiagnostic.priority_environments.slice(0, 3).map((item) => item.name).join(', ')}`
      : null,
    'Use esta direção para decidir o ângulo da notícia. Não force uma notícia irrelevante só porque combina com uma prioridade.',
  ].filter(Boolean) : [];

  const rules = [
    '',
    '## REGRAS GERAIS',
    '- Use apenas as informações da notícia acima. Não invente números, citações, nomes ou fatos.',
    '- Se algo importante depender de checagem, marque como [CONFIRMAR] em vez de afirmar.',
    '- Relacione a notícia ao dia a dia e ao público do cliente, sem forçar a conexão.',
    '- Cite a fonte de forma natural no conteúdo e indique o link para consulta.',
    '- Escreva em português do Brasil, seguindo as referências de estilo editorial.',
  ];

  const task = kind === 'carousel' ? [
    '',
    '## TAREFA: CARROSSEL PARA INSTAGRAM',
    `Crie um carrossel de 7 a 9 slides sobre essa notícia para o perfil de ${clean(client.name)}.`,
    'Entregue nesta ordem:',
    '1. Três opções de gancho para a capa (até 12 palavras cada), com a sugestão de qual usar.',
    '2. Slide a slide: título curto (até 8 palavras) + texto de apoio (até 30 palavras) + sugestão visual em uma linha.',
    '3. Slide final com chamada para ação coerente com o objetivo do cliente.',
    '4. Legenda completa: abertura forte, desenvolvimento, CTA e de 5 a 8 hashtags.',
    '5. Lista curta do que precisa ser conferido antes de publicar.',
  ] : [
    '',
    '## TAREFA: ROTEIRO DE VÍDEO CURTO (REELS)',
    `Crie um roteiro de 30 a 45 segundos sobre essa notícia para o perfil de ${clean(client.name)}.`,
    'Entregue nesta ordem:',
    '1. Três opções de gancho falado para os 3 primeiros segundos.',
    '2. Roteiro em tabela ou lista por cena: tempo, fala, texto na tela e sugestão de imagem ou B-roll.',
    '3. Fala natural e direta, em frases curtas, pronta para ser gravada.',
    '4. Encerramento com chamada para ação coerente com o objetivo do cliente.',
    '5. Legenda com CTA e de 5 a 8 hashtags.',
    '6. Lista curta do que precisa ser conferido antes de gravar.',
  ];

  return [...context, ...diagnosisBlock, ...angleBlock, ...rules, ...task].join('\n');
}

module.exports = { buildPrompt, KINDS, formatDate };
