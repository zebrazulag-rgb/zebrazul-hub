export const DEMAND_TYPES = [
  {
    id: 'static_post',
    label: 'Post estático',
    shortLabel: 'Estático',
    group: 'Social Media',
    frontName: 'Social Media',
    taskType: 'post',
    contentType: 'feed',
    accent: '#0969ff',
    fields: [
      { key: 'audience', label: 'Pra quem é essa peça?', placeholder: 'Ex.: gestores de pequenas empresas', required: true },
      { key: 'main_message', label: 'Qual mensagem não pode faltar?', placeholder: 'A ideia central em uma frase', required: true },
      { key: 'cta', label: 'Qual ação esperamos depois?', placeholder: 'Ex.: chamar no WhatsApp, salvar, comentar' },
    ],
  },
  {
    id: 'carousel',
    label: 'Carrossel',
    shortLabel: 'Carrossel',
    group: 'Social Media',
    frontName: 'Social Media',
    taskType: 'post',
    contentType: 'carrossel',
    accent: '#0969ff',
    fields: [
      { key: 'audience', label: 'Pra quem é esse conteúdo?', placeholder: 'Quem precisa parar para ler?', required: true },
      { key: 'main_message', label: 'Qual ideia conduz o carrossel?', placeholder: 'A tese central que deve ficar na cabeça', required: true },
      { key: 'structure', label: 'Tem alguma estrutura desejada?', placeholder: 'Ex.: problema → explicação → solução → CTA', multiline: true },
    ],
  },
  {
    id: 'reels',
    label: 'Reels',
    shortLabel: 'Reels',
    group: 'Social Media',
    frontName: 'Social Media',
    taskType: 'post',
    contentType: 'reels',
    accent: '#ec0567',
    fields: [
      { key: 'audience', label: 'Quem precisa assistir?', placeholder: 'Público principal', required: true },
      { key: 'main_message', label: 'O que o vídeo precisa provar ou comunicar?', placeholder: 'Uma ideia principal', required: true },
      { key: 'recording_status', label: 'A gravação já existe?', type: 'select', options: ['Ainda precisa gravar', 'Já foi gravado', 'Usar banco/arquivo existente'], required: true },
      { key: 'duration', label: 'Duração aproximada', placeholder: 'Ex.: 30s, 60s, até 90s' },
    ],
  },
  {
    id: 'stories',
    label: 'Stories',
    shortLabel: 'Stories',
    group: 'Social Media',
    frontName: 'Social Media',
    taskType: 'post',
    contentType: 'story',
    accent: '#0969ff',
    fields: [
      { key: 'audience', label: 'Pra quem estamos falando?', placeholder: 'Público principal', required: true },
      { key: 'main_message', label: 'O que precisa acontecer nos stories?', placeholder: 'Informar, vender, gerar resposta, cobrir evento...', required: true },
      { key: 'story_count', label: 'Quantidade estimada', placeholder: 'Ex.: 3 stories' },
    ],
  },
  {
    id: 'campaign',
    label: 'Campanha',
    shortLabel: 'Campanha',
    group: 'Campanha',
    frontName: 'Social Media',
    taskType: 'basic',
    contentType: null,
    accent: '#ec0567',
    fields: [
      { key: 'audience', label: 'Quem queremos mover?', placeholder: 'Público da campanha', required: true },
      { key: 'offer', label: 'Qual oferta, produto ou ideia está no centro?', placeholder: 'O que está sendo promovido?', required: true },
      { key: 'deliverables', label: 'Quais entregas você imagina?', placeholder: 'Ex.: 3 posts, 2 reels, anúncios, landing page', multiline: true, required: true },
      { key: 'campaign_window', label: 'Qual a janela da campanha?', placeholder: 'Ex.: 10 a 25 de novembro' },
    ],
  },
  {
    id: 'landing_page',
    label: 'Landing page',
    shortLabel: 'Landing page',
    group: 'Site/LP',
    frontName: 'Site/LP',
    taskType: 'basic',
    contentType: null,
    accent: '#17181c',
    fields: [
      { key: 'audience', label: 'Quem vai chegar nessa página?', placeholder: 'Público principal', required: true },
      { key: 'offer', label: 'Qual oferta ou serviço?', placeholder: 'O que a página vende/apresenta?', required: true },
      { key: 'conversion_action', label: 'Qual é a conversão principal?', placeholder: 'Ex.: WhatsApp, formulário, compra, agendamento', required: true },
      { key: 'source', label: 'De onde o tráfego virá?', placeholder: 'Ex.: Meta Ads, Google, Instagram, QR code' },
    ],
  },
  {
    id: 'branding',
    label: 'Branding',
    shortLabel: 'Branding',
    group: 'Branding',
    frontName: 'Branding',
    taskType: 'basic',
    contentType: null,
    accent: '#17181c',
    fields: [
      { key: 'context', label: 'O que está acontecendo com a marca?', placeholder: 'Contexto, mudança, problema ou oportunidade', multiline: true, required: true },
      { key: 'deliverables', label: 'O que precisa ser entregue?', placeholder: 'Ex.: identidade, campanha, naming, manual, aplicação', multiline: true, required: true },
      { key: 'perception', label: 'Como a marca precisa ser percebida?', placeholder: '3 a 5 palavras ou uma frase' },
    ],
  },
  {
    id: 'print',
    label: 'Material impresso',
    shortLabel: 'Impresso',
    group: 'Design',
    frontName: 'Design',
    taskType: 'basic',
    contentType: 'print',
    accent: '#72f14d',
    fields: [
      { key: 'piece', label: 'Qual peça será produzida?', placeholder: 'Ex.: folder, banner, cartão, adesivo', required: true },
      { key: 'dimensions', label: 'Tamanho / formato físico', placeholder: 'Ex.: A4, 2x2 m, 9x5 cm', required: true },
      { key: 'quantity', label: 'Quantidade, se souber', placeholder: 'Ex.: 500 unidades' },
      { key: 'printer_specs', label: 'Há especificação da gráfica?', placeholder: 'Sangria, acabamento, material...', multiline: true },
    ],
  },
  {
    id: 'event',
    label: 'Evento',
    shortLabel: 'Evento',
    group: 'Evento',
    frontName: 'Design',
    taskType: 'basic',
    contentType: null,
    accent: '#72f14d',
    fields: [
      { key: 'event_date', label: 'Quando é o evento?', type: 'date', required: true },
      { key: 'location', label: 'Onde acontece?', placeholder: 'Local ou cidade' },
      { key: 'deliverables', label: 'O que a Zebrazul precisa entregar?', placeholder: 'Cobertura, convite, painel, reels, materiais...', multiline: true, required: true },
    ],
  },
  {
    id: 'audiovisual',
    label: 'Audiovisual',
    shortLabel: 'Audiovisual',
    group: 'Audiovisual',
    frontName: 'Audiovisual',
    taskType: 'basic',
    contentType: null,
    accent: '#ec0567',
    fields: [
      { key: 'video_goal', label: 'O que o vídeo precisa provocar?', placeholder: 'Vender, explicar, registrar, gerar autoridade...', required: true },
      { key: 'recording_status', label: 'Situação da captação', type: 'select', options: ['Precisa agendar gravação', 'Já foi gravado', 'Editar material existente'], required: true },
      { key: 'orientation', label: 'Formato do vídeo', type: 'select', options: ['Vertical 9:16', 'Horizontal 16:9', 'Quadrado 1:1', 'Ainda não definido'], required: true },
      { key: 'duration', label: 'Duração aproximada', placeholder: 'Ex.: 45 segundos' },
    ],
  },
  {
    id: 'traffic',
    label: 'Tráfego / mídia',
    shortLabel: 'Tráfego',
    group: 'Tráfego',
    frontName: 'Tráfego',
    taskType: 'basic',
    contentType: null,
    accent: '#0969ff',
    fields: [
      { key: 'audience', label: 'Quem queremos alcançar?', placeholder: 'Público principal', required: true },
      { key: 'offer', label: 'O que estamos oferecendo?', placeholder: 'Produto, serviço ou campanha', required: true },
      { key: 'channel', label: 'Canal desejado', type: 'select', options: ['Meta Ads', 'Google Ads', 'Meta + Google', 'Ainda não definido'], required: true },
      { key: 'budget', label: 'Orçamento de mídia, se houver', placeholder: 'Ex.: R$ 1.500/mês' },
    ],
  },
  {
    id: 'other',
    label: 'Outro',
    shortLabel: 'Outro',
    group: 'Outros',
    frontName: 'Outros',
    taskType: 'basic',
    contentType: null,
    accent: '#17181c',
    fields: [
      { key: 'format', label: 'Que tipo de entrega é essa?', placeholder: 'Descreva o formato', required: true },
      { key: 'context', label: 'Contexto importante', placeholder: 'O que precisamos saber antes de começar?', multiline: true },
    ],
  },
];

export function demandTypeById(id) {
  return DEMAND_TYPES.find((item) => item.id === id) || DEMAND_TYPES[0];
}

export function cleanBriefingData(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function missingDemandFields(form, type = demandTypeById(form?.demand_type)) {
  const missing = [];
  if (!Number(form?.client_id)) missing.push('cliente');
  if (!String(form?.title || '').trim()) missing.push('título');
  if (!String(form?.goal || '').trim()) missing.push('o que precisa acontecer');
  if (!String(form?.due_date || '').trim()) missing.push('prazo');
  if (!Array.isArray(form?.assignee_ids) || form.assignee_ids.length === 0) missing.push('responsável');
  for (const field of type.fields || []) {
    if (!field.required) continue;
    if (!String(form?.details?.[field.key] || '').trim()) missing.push(field.label.toLowerCase());
  }
  return missing;
}

function displayValue(value) {
  return String(value || '').trim();
}

export function buildBriefingDescription(form, type = demandTypeById(form?.demand_type)) {
  const lines = [];
  lines.push(`BRIEFING · ${type.label}`);
  lines.push('');
  lines.push(`OBJETIVO / O QUE PRECISA ACONTECER\n${displayValue(form.goal)}`);
  for (const field of type.fields || []) {
    const value = displayValue(form?.details?.[field.key]);
    if (!value) continue;
    lines.push('');
    lines.push(`${field.label.toUpperCase()}\n${value}`);
  }
  if (displayValue(form.references)) {
    lines.push('');
    lines.push(`REFERÊNCIAS / LINKS\n${displayValue(form.references)}`);
  }
  if (displayValue(form.notes)) {
    lines.push('');
    lines.push(`OBSERVAÇÕES\n${displayValue(form.notes)}`);
  }
  return lines.join('\n');
}

export function makeBriefingPayload(form) {
  const type = demandTypeById(form.demand_type);
  const briefing = {
    version: 1,
    demand_type: type.id,
    demand_label: type.label,
    group: type.group,
    goal: String(form.goal || '').trim(),
    details: form.details || {},
    references: String(form.references || '').trim(),
    notes: String(form.notes || '').trim(),
    created_from: form.created_from || 'internal',
  };
  return {
    task_type: type.taskType,
    title: String(form.title || '').trim(),
    description: buildBriefingDescription(form, type),
    content_type: type.contentType,
    content_tag: form.content_tag || null,
    front_name: type.frontName,
    project_name: type.label,
    goal: String(form.goal || '').trim(),
    priority: form.priority || 'medium',
    due_date: form.due_date || null,
    client_id: Number(form.client_id) || null,
    assignee_ids: form.assignee_ids || [],
    workflow_stage: 'todo',
    briefing_json: JSON.stringify(briefing),
  };
}
