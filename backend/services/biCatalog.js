// Catálogo de módulos e métricas do BI (Relatórios).
// Arquitetura híbrida: métricas PADRÃO (estruturadas, listadas aqui) + métricas LIVRES (nome/valor/unidade/observação).
// Para suportar uma métrica nova de uma rede basta acrescentá-la aqui OU cadastrá-la como métrica livre: o banco não muda.
//
// unit: int | dec | pct | brl | sec | hours | text   (qualquer outro texto vira sufixo livre, ex.: "pessoas")
// polarity: up (subir é bom) | down (cair é bom) | neutral (depende do contexto, nunca pintado de bom/ruim)

const m = (key, label, unit = 'int', polarity = 'up', extra = {}) => ({ key, label, unit, polarity, ...extra });
const dist = (key, label, unit = 'pct', hint = '') => ({ key, label, unit, polarity: 'neutral', dist: true, hint });

const AGE_GENDER = [
  m('gender_female_pct', 'Mulheres', 'pct', 'neutral'),
  m('gender_male_pct', 'Homens', 'pct', 'neutral'),
  m('age_13_17_pct', '13–17 anos', 'pct', 'neutral'),
  m('age_18_24_pct', '18–24 anos', 'pct', 'neutral'),
  m('age_25_34_pct', '25–34 anos', 'pct', 'neutral'),
  m('age_35_44_pct', '35–44 anos', 'pct', 'neutral'),
  m('age_45_54_pct', '45–54 anos', 'pct', 'neutral'),
  m('age_55_64_pct', '55–64 anos', 'pct', 'neutral'),
  m('age_65_plus_pct', '65+ anos', 'pct', 'neutral'),
];

const GEO = [
  dist('top_cities', 'Principais cidades', 'pct', 'Cidade e % do público'),
  dist('top_states', 'Principais estados', 'pct', 'Estado e % do público'),
  dist('top_countries', 'Principais países', 'pct', 'País e % do público'),
  dist('active_hours', 'Horários mais ativos', 'pct', 'Horário e % / intensidade'),
  dist('active_days', 'Dias mais ativos', 'pct', 'Dia da semana e % / intensidade'),
];

const CATALOG = {
  instagram: {
    label: 'Instagram', group: 'social', core: 'social', audienceKey: 'followers', audienceLabel: 'Seguidores',
    defaultSource: 'Instagram Insights',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('followers_start', 'Seguidores no início do período', 'int', 'up', { stock: true }),
        m('followers_end', 'Seguidores no final do período', 'int', 'up', { stock: true, headline: true }),
        m('new_followers', 'Novos seguidores'),
        m('lost_followers', 'Seguidores perdidos', 'int', 'down'),
        m('reach', 'Alcance', 'int', 'up', { headline: true }),
        m('impressions', 'Impressões'),
        m('views', 'Visualizações'),
        m('accounts_reached', 'Contas alcançadas'),
        m('accounts_engaged', 'Contas engajadas'),
        m('interactions', 'Interações'),
        m('profile_visits', 'Visitas ao perfil'),
        m('link_clicks', 'Cliques no link'),
        m('button_taps', 'Toques em botões'),
        m('messages', 'Mensagens'),
      ] },
      { key: 'content', label: 'Conteúdo publicado', metrics: [
        m('posts_count', 'Posts', 'int', 'neutral'),
        m('carousels_count', 'Carrosséis', 'int', 'neutral'),
        m('reels_count', 'Reels', 'int', 'neutral'),
        m('stories_count', 'Stories', 'int', 'neutral'),
        m('lives_count', 'Lives', 'int', 'neutral'),
      ] },
      { key: 'reels', label: 'Reels', metrics: [
        m('reels_views', 'Visualizações de Reels'), m('reels_reach', 'Alcance de Reels'), m('reels_likes', 'Curtidas (Reels)'),
        m('reels_comments', 'Comentários (Reels)'), m('reels_shares', 'Compartilhamentos (Reels)'), m('reels_saves', 'Salvamentos (Reels)'),
        m('reels_watch_time_min', 'Tempo assistido (min)', 'dec'), m('reels_retention', 'Retenção média', 'pct'),
        m('reels_followers_gained', 'Seguidores gerados (Reels)'),
      ] },
      { key: 'feed', label: 'Feed (posts e carrosséis)', metrics: [
        m('feed_reach', 'Alcance do feed'), m('feed_impressions', 'Impressões do feed'), m('feed_likes', 'Curtidas (Feed)'),
        m('feed_comments', 'Comentários (Feed)'), m('feed_shares', 'Compartilhamentos (Feed)'), m('feed_saves', 'Salvamentos (Feed)'),
        m('feed_profile_visits', 'Visitas ao perfil (feed)'), m('feed_followers_gained', 'Seguidores gerados (Feed)'),
      ] },
      { key: 'stories', label: 'Stories', metrics: [
        m('stories_reach', 'Alcance dos Stories'), m('stories_impressions', 'Impressões dos Stories'), m('stories_replies', 'Respostas'),
        m('stories_clicks', 'Cliques'), m('stories_forward_taps', 'Avanços', 'int', 'neutral'), m('stories_back_taps', 'Voltas', 'int', 'neutral'),
        m('stories_exits', 'Saídas', 'int', 'down'), m('stories_retention', 'Retenção', 'pct'),
      ] },
      { key: 'audience', label: 'Público', metrics: [...AGE_GENDER, ...GEO] },
    ],
  },
  facebook: {
    label: 'Facebook', group: 'social', core: 'social', audienceKey: 'followers', audienceLabel: 'Seguidores', defaultSource: 'mLabs',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('followers_start', 'Seguidores no início do período', 'int', 'up', { stock: true }),
        m('followers_end', 'Seguidores no final do período', 'int', 'up', { stock: true, headline: true }),
        m('new_followers', 'Novos seguidores'), m('lost_followers', 'Seguidores perdidos', 'int', 'down'),
        m('reach', 'Alcance', 'int', 'up', { headline: true }), m('impressions', 'Impressões'), m('views', 'Visualizações'),
        m('interactions', 'Interações'), m('clicks', 'Cliques'), m('engagement_rate', 'Taxa de engajamento (informada)', 'pct'),
      ] },
      { key: 'content', label: 'Conteúdo', metrics: [m('posts_count', 'Publicações', 'int', 'neutral'), m('videos_count', 'Vídeos', 'int', 'neutral')] },
      { key: 'audience', label: 'Público', metrics: [...AGE_GENDER, ...GEO] },
    ],
  },
  tiktok: {
    label: 'TikTok', group: 'social', core: 'social', audienceKey: 'followers', audienceLabel: 'Seguidores', defaultSource: 'mLabs',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('followers_start', 'Seguidores no início do período', 'int', 'up', { stock: true }),
        m('followers_end', 'Seguidores no final do período', 'int', 'up', { stock: true, headline: true }),
        m('new_followers', 'Novos seguidores'), m('lost_followers', 'Seguidores perdidos', 'int', 'down'),
        m('video_views', 'Visualizações de vídeo', 'int', 'up', { headline: true }), m('reach', 'Alcance'),
        m('profile_views', 'Visualizações de perfil'), m('likes', 'Curtidas'), m('comments', 'Comentários'), m('shares', 'Compartilhamentos'),
        m('videos_published', 'Vídeos publicados', 'int', 'neutral'),
        m('avg_watch_time_sec', 'Tempo médio assistido (s)', 'sec'), m('retention', 'Retenção', 'pct'),
        m('engagement_rate', 'Taxa de engajamento (informada)', 'pct'),
      ] },
      { key: 'audience', label: 'Público', metrics: [...AGE_GENDER, ...GEO] },
    ],
  },
  youtube: {
    label: 'YouTube', group: 'social', core: 'social', audienceKey: 'subscribers', audienceLabel: 'Inscritos', defaultSource: 'mLabs',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('subscribers_start', 'Inscritos no início do período', 'int', 'up', { stock: true }),
        m('subscribers_end', 'Inscritos no final do período', 'int', 'up', { stock: true, headline: true }),
        m('new_subscribers', 'Novos inscritos'), m('lost_subscribers', 'Inscritos perdidos', 'int', 'down'),
        m('views', 'Visualizações', 'int', 'up', { headline: true }), m('impressions', 'Impressões'), m('ctr', 'CTR de impressões', 'pct'),
        m('watch_hours', 'Horas assistidas', 'hours'), m('avg_view_duration_sec', 'Duração média da visualização (s)', 'sec'),
        m('videos_published', 'Vídeos publicados', 'int', 'neutral'), m('shorts_published', 'Shorts publicados', 'int', 'neutral'),
        m('long_videos_published', 'Vídeos longos publicados', 'int', 'neutral'),
        m('likes', 'Curtidas'), m('comments', 'Comentários'), m('shares', 'Compartilhamentos'),
      ] },
      { key: 'traffic_sources', label: 'Origem de tráfego', metrics: [dist('traffic_sources', 'Origens de tráfego', 'pct', 'Origem e % das visualizações')] },
      { key: 'audience', label: 'Público', metrics: [...AGE_GENDER, ...GEO] },
    ],
  },
  linkedin: {
    label: 'LinkedIn', group: 'social', core: 'social', audienceKey: 'followers', audienceLabel: 'Seguidores', defaultSource: 'mLabs',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('followers_start', 'Seguidores no início do período', 'int', 'up', { stock: true }),
        m('followers_end', 'Seguidores no final do período', 'int', 'up', { stock: true, headline: true }),
        m('new_followers', 'Novos seguidores'), m('lost_followers', 'Seguidores perdidos', 'int', 'down'),
        m('impressions', 'Impressões', 'int', 'up', { headline: true }), m('reach', 'Alcance'), m('visitors', 'Visitantes da página'),
        m('clicks', 'Cliques'), m('reactions', 'Reações'), m('comments', 'Comentários'), m('shares', 'Compartilhamentos'),
        m('posts_count', 'Posts', 'int', 'neutral'), m('engagement_rate', 'Taxa de engajamento (informada)', 'pct'),
      ] },
      { key: 'audience', label: 'Público', metrics: [
        dist('companies', 'Empresas', 'pct', 'Empresa e % / quantidade'), dist('job_titles', 'Cargos', 'pct', 'Cargo e % / quantidade'),
        dist('industries', 'Setores', 'pct', 'Setor e % / quantidade'), ...GEO,
      ] },
    ],
  },
  traffic: {
    label: 'Tráfego Pago', group: 'business', core: 'traffic', defaultSource: 'Meta Ads', scoped: true,
    platforms: ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Outro'],
    blocks: [
      { key: 'metrics', label: 'Métricas', metrics: [
        m('spend', 'Investimento', 'brl', 'neutral', { headline: true, additive: true }),
        m('reach', 'Alcance'), m('impressions', 'Impressões', 'int', 'up', { additive: true }), m('frequency', 'Frequência', 'dec', 'neutral'),
        m('clicks', 'Cliques', 'int', 'up', { additive: true }), m('messages', 'Mensagens', 'int', 'up', { additive: true }),
        m('leads', 'Leads', 'int', 'up', { headline: true, additive: true }), m('conversions', 'Conversões', 'int', 'up', { additive: true }),
        m('appointments', 'Agendamentos', 'int', 'up', { additive: true }), m('sales', 'Vendas', 'int', 'up', { additive: true }),
        m('conversion_value', 'Valor de conversão', 'brl', 'up', { additive: true }), m('video_views', 'Visualizações de vídeo', 'int', 'up', { additive: true }),
      ] },
    ],
  },
  commercial: {
    label: 'Comercial', group: 'business', core: 'commercial', defaultSource: 'Planilha comercial',
    blocks: [
      { key: 'funnel', label: 'Funil comercial', metrics: [
        m('leads_received', 'Leads recebidos', 'int', 'up', { headline: true }), m('contacts_made', 'Contatos realizados'),
        m('qualified_leads', 'Leads qualificados'), m('appointments', 'Agendamentos', 'int', 'up', { headline: true }),
        m('proposals', 'Propostas'), m('attendances', 'Comparecimentos', 'int', 'up', { headline: true }),
        m('no_shows', 'Faltas', 'int', 'down'), m('negotiations', 'Negociações'),
        m('sales', 'Vendas', 'int', 'up', { headline: true }), m('lost', 'Perdidos', 'int', 'down'), m('followups', 'Follow-ups', 'int', 'neutral'),
      ] },
    ],
  },
  sales: {
    label: 'Vendas / Faturamento', group: 'business', core: 'sales', defaultSource: 'Informado pelo cliente',
    blocks: [
      { key: 'results', label: 'Resultado', metrics: [
        m('sales_count', 'Número de vendas', 'int', 'up', { headline: true }), m('revenue', 'Faturamento', 'brl', 'up', { headline: true }),
        m('gross_revenue', 'Faturamento bruto', 'brl'), m('inflows', 'Entradas', 'brl'), m('customers_count', 'Quantidade de clientes'),
        m('new_customers', 'Novos clientes'), m('recurring_revenue', 'Receita recorrente', 'brl'),
        dist('products', 'Produtos', 'brl', 'Produto e valor / quantidade'), dist('services', 'Serviços', 'brl', 'Serviço e valor / quantidade'),
      ] },
    ],
  },
  site: {
    label: 'Site', group: 'business', core: null, defaultSource: 'Outro',
    blocks: [
      { key: 'overview', label: 'Visão geral', metrics: [
        m('users', 'Usuários', 'int', 'up', { headline: true }), m('new_users', 'Novos usuários'), m('sessions', 'Sessões'), m('pageviews', 'Visualizações de página'),
        m('conversion_rate', 'Taxa de conversão (informada)', 'pct'), m('forms', 'Formulários enviados'), m('leads', 'Leads'),
        m('avg_time_sec', 'Tempo médio na página (s)', 'sec'), m('bounce_rate', 'Taxa de rejeição', 'pct', 'down'),
        dist('top_pages', 'Páginas mais acessadas', 'int', 'Página e acessos'), dist('traffic_sources', 'Origem do tráfego', 'pct', 'Origem e % / sessões'),
      ] },
    ],
  },
  other: {
    label: 'Outro', group: 'other', core: null, defaultSource: 'Outro', customOnly: true,
    blocks: [{ key: 'custom', label: 'Métricas livres', metrics: [] }],
  },
};

const SOURCES = ['Instagram Insights', 'mLabs', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Planilha comercial', 'CRM', 'Informado pelo cliente', 'Outro'];
const CORE_AREAS = [
  { key: 'social', label: 'Redes sociais' },
  { key: 'traffic', label: 'Tráfego pago' },
  { key: 'commercial', label: 'Comercial' },
  { key: 'sales', label: 'Vendas / Faturamento' },
];

// índice rápido: módulo -> chave -> definição
const INDEX = {};
for (const [moduleKey, def] of Object.entries(CATALOG)) {
  INDEX[moduleKey] = {};
  for (const block of def.blocks) for (const metric of block.metrics) INDEX[moduleKey][metric.key] = { ...metric, block: block.key };
}

function slug(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'metrica';
}

module.exports = { CATALOG, INDEX, SOURCES, CORE_AREAS, slug };
