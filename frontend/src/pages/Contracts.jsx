import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  Copy,
  FileSignature,
  FileText,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useClientFilter } from '../context/ClientFilterContext.jsx';

const STORAGE_KEY = 'zebrahub.contracts.mvp.v1';

const SERVICE_OPTIONS = [
  { key: 'social_media', label: 'Social Media', text: 'planejamento, criação, organização, programação e acompanhamento de conteúdos para redes sociais' },
  { key: 'planning', label: 'Planejamento de conteúdo', text: 'planejamento de calendário editorial e direcionamento estratégico' },
  { key: 'design', label: 'Design gráfico', text: 'criação de peças digitais e materiais gráficos relacionados às campanhas e à comunicação institucional' },
  { key: 'capture', label: 'Captação audiovisual', text: 'captação presencial de fotos e vídeos conforme agenda e frequência definidas entre as partes' },
  { key: 'video_editing', label: 'Edição de vídeo', text: 'edição e finalização de vídeos para Reels, Stories, TikTok, YouTube Shorts e formatos correlatos' },
  { key: 'instagram', label: 'Gestão de Instagram', text: 'gerenciamento e organização do perfil do Instagram, incluindo publicações, bio, destaques e alinhamentos recorrentes' },
  { key: 'tiktok', label: 'TikTok', text: 'planejamento e publicação de conteúdos adequados ao TikTok' },
  { key: 'youtube', label: 'YouTube', text: 'planejamento e publicação de conteúdos em formatos compatíveis com YouTube e YouTube Shorts' },
  { key: 'stories', label: 'Stories', text: 'direcionamento, criação e/ou cobertura de Stories de acordo com o calendário e as ações da CONTRATANTE' },
  { key: 'traffic', label: 'Tráfego pago', text: 'planejamento, configuração, acompanhamento e otimização de campanhas de mídia paga' },
  { key: 'external_channels', label: 'Google / canais externos', text: 'orientações e ajustes estratégicos em site, Google Perfil da Empresa e canais externos previamente definidos' },
  { key: 'events', label: 'Cobertura de eventos', text: 'cobertura de ações e eventos presenciais ou remotos dentro dos limites definidos neste contrato' },
  { key: 'reports', label: 'Relatórios', text: 'acompanhamento de métricas e elaboração de relatórios de desempenho' },
  { key: 'meetings', label: 'Reuniões', text: 'reuniões de acompanhamento, alinhamento e planejamento na frequência prevista neste contrato' },
  { key: 'site', label: 'Landing Page / Site', text: 'criação, manutenção ou ajustes de páginas digitais conforme escopo específico aprovado' },
  { key: 'branding', label: 'Branding', text: 'serviços estratégicos de marca, posicionamento e identidade conforme entregáveis definidos no escopo' },
];

const CLAUSE_OPTIONS = [
  { key: 'confidentiality', label: 'Confidencialidade', default: true },
  { key: 'portfolio', label: 'Uso em portfólio', default: true },
  { key: 'no_results', label: 'Ausência de garantia de resultados', default: true },
  { key: 'approval', label: 'Aprovação e prazos', default: true },
  { key: 'editable_files', label: 'Arquivos editáveis não inclusos', default: true },
  { key: 'late_payment', label: 'Multa e suspensão por atraso', default: true },
  { key: 'termination', label: 'Rescisão e aviso prévio', default: true },
  { key: 'copyright', label: 'Direitos autorais e materiais', default: true },
];

const emptyContract = {
  id: '',
  title: 'Contrato de Prestação de Serviços',
  status: 'draft',
  clientTradeName: '',
  clientLegalName: '',
  clientCnpj: '',
  clientAddress: '',
  clientRepresentative: '',
  clientEmail: '',
  clientPhone: '',
  contractorLegalName: '46.966.134 ARTHUR BARBOSA CID DE ALMEIDA - ME',
  contractorCnpj: '46.966.134/0001-62',
  contractorAddress: 'Rua São Paulo 154A, Alecrim, Natal/RN, CEP 59037-460',
  contractorRepresentative: 'ARTHUR BARBOSA CID DE ALMEIDA',
  services: ['social_media', 'planning', 'instagram', 'reports'],

  postsQuantity: '3',
  postsPeriod: 'week',
  videosQuantity: '1',
  videosPeriod: 'week',
  capturesQuantity: '1',
  capturesPeriod: 'week',
  meetingsPerMonth: '1',

  eventsIncluded: '1',
  extraEventValue: '150,00',
  remoteEventsIncluded: '0',
  extraRemoteEventValue: '100,00',
  customScope: '',
  billingType: 'monthly',
  paymentRegime: 'postpaid',
  cashValue: '2.000,00',
  barterEnabled: false,
  barterValue: '0,00',
  barterDescription: '',
  barterAccumulates: true,
  dueRule: 'day',
  dueDay: '20',
  lateFee: '5',
  mediaBudgetEnabled: false,
  mediaBudget: '1.000,00',
  mediaPaidDirectly: true,
  startDate: new Date().toISOString().slice(0, 10),
  durationMode: 'months',
  durationMonths: '12',
  endDate: '',
  autoRenew: true,
  noticeDays: '30',
  cancellationFeeEnabled: true,
  cancellationFeeDays: '30',
  clauses: Object.fromEntries(CLAUSE_OPTIONS.map((item) => [item.key, item.default])),
  city: 'NATAL',
  notes: '',
  createdAt: '',
  updatedAt: '',
};

function uid() {
  return globalThis.crypto?.randomUUID?.() || `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeContract(saved = {}) {
  return {
    ...clone(emptyContract),
    ...saved,
    clauses: { ...clone(emptyContract.clauses), ...(saved.clauses || {}) },
    postsQuantity: saved.postsQuantity ?? saved.postsPerWeek ?? '3',
    postsPeriod: saved.postsPeriod ?? 'week',
    videosQuantity: saved.videosQuantity ?? '1',
    videosPeriod: saved.videosPeriod ?? 'week',
    capturesQuantity: saved.capturesQuantity ?? saved.capturesPerWeek ?? '1',
    capturesPeriod: saved.capturesPeriod ?? 'week',
  };
}

function datePtBr(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  return `${String(day).padStart(2, '0')} de ${months[month - 1]} de ${year}`;
}

function money(value) {
  const cleaned = String(value || '').trim();
  return cleaned ? `R$ ${cleaned}` : 'R$ 0,00';
}

function periodLabel(period, quantity = 1) {
  if (period === 'month') return Number(quantity) === 1 ? 'mês' : 'mês';
  return Number(quantity) === 1 ? 'semana' : 'semana';
}

function SectionTitle({ number, children }) {
  return <h2 className="contract-section-title">{number}. {children}</h2>;
}

function Preview({ contract }) {
  const selectedServices = SERVICE_OPTIONS.filter((item) => contract.services.includes(item.key));
  const hasTraffic = contract.services.includes('traffic');
  const hasEvents = contract.services.includes('events');
  const hasCapture = contract.services.includes('capture');
  const hasVideo = contract.services.includes('video_editing') || hasCapture;
  const hasContent = contract.services.some((item) => ['social_media', 'planning', 'instagram', 'tiktok', 'youtube', 'stories'].includes(item));
  const hasMeetings = contract.services.includes('meetings');

  let section = 1;
  const objectSection = section++;
  const clientObligationsSection = section++;
  const contractorObligationsSection = section++;
  const approvalSection = contract.clauses.approval ? section++ : null;
  const priceSection = section++;
  const copyrightSection = contract.clauses.copyright ? section++ : null;
  const termSection = section++;
  const terminationSection = contract.clauses.termination ? section++ : null;

  const priceText = contract.billingType === 'annual'
    ? `${money(contract.cashValue)} por ano`
    : contract.billingType === 'project'
      ? `${money(contract.cashValue)} pelo projeto`
      : `${money(contract.cashValue)} por mês`;

  const durationText = contract.durationMode === 'date' && contract.endDate
    ? `até ${datePtBr(contract.endDate)}`
    : `${contract.durationMonths || 12} meses`;

  let scopeItem = 4;

  return (
    <article id="contract-print-area" className="contract-paper">
      <div className="contract-brand">
        <div>
          <p>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</p>
          <h1>{selectedServices.length ? selectedServices.slice(0, 3).map((item) => item.label).join(' + ') : 'Serviços Profissionais'}</h1>
        </div>
        <strong>ZEBRAZUL</strong>
      </div>

      <section className="contract-parties">
        <h2>Identificação das Partes Contratantes</h2>
        <div className="contract-party-grid">
          <div>
            <small>CONTRATANTE</small>
            <p><strong>{contract.clientLegalName || contract.clientTradeName || 'CONTRATANTE'}</strong>, pessoa jurídica de direito privado{contract.clientCnpj ? `, inscrita no CNPJ sob o nº ${contract.clientCnpj}` : ''}{contract.clientAddress ? `, com sede em ${contract.clientAddress}` : ''}{contract.clientRepresentative ? `, neste ato representada por ${contract.clientRepresentative}` : ''}, doravante denominada <strong>CONTRATANTE</strong>.</p>
          </div>
          <div>
            <small>CONTRATADA</small>
            <p><strong>{contract.contractorLegalName}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {contract.contractorCnpj}, com sede em {contract.contractorAddress}, neste ato representada por {contract.contractorRepresentative}, doravante denominada <strong>CONTRATADA</strong>.</p>
          </div>
        </div>
        <p>Por este instrumento particular, as partes resolvem livremente celebrar o presente contrato de prestação de serviços, nos termos das condições abaixo.</p>
      </section>

      <SectionTitle number={objectSection}>Do Objeto e Escopo</SectionTitle>
      <p><strong>{objectSection}.1.</strong> O presente contrato tem como objeto a prestação dos serviços profissionais selecionados e descritos neste instrumento, relacionados à comunicação, presença digital, conteúdo, marca e/ou performance da CONTRATANTE.</p>
      <p><strong>{objectSection}.2.</strong> A atuação da CONTRATADA terá como finalidade organizar a presença digital da CONTRATANTE, fortalecer sua autoridade, aprimorar sua comunicação e executar o escopo contratado, sem caracterizar promessa de resultado específico.</p>

      {selectedServices.map((item, index) => (
        <p key={item.key}><strong>{objectSection}.3.{index + 1}.</strong> <strong>{item.label}:</strong> {item.text}.</p>
      ))}

      {hasContent && (
        <p><strong>{objectSection}.{scopeItem++}.</strong> A cadência de conteúdo prevista é de <strong>{contract.postsQuantity || '0'} postagem(ns) por {periodLabel(contract.postsPeriod, contract.postsQuantity)}</strong>, podendo a distribuição entre formatos ser ajustada conforme estratégia e calendário.</p>
      )}

      {hasVideo && (
        <p><strong>{objectSection}.{scopeItem++}.</strong> A entrega audiovisual prevista contempla <strong>{contract.videosQuantity || '0'} vídeo(s) por {periodLabel(contract.videosPeriod, contract.videosQuantity)}</strong>, observados os formatos contratados e a disponibilidade de captação/material.</p>
      )}

      {hasCapture && (
        <p><strong>{objectSection}.{scopeItem++}.</strong> A captação audiovisual terá frequência estimada de <strong>{contract.capturesQuantity || '0'} captação(ões) por {periodLabel(contract.capturesPeriod, contract.capturesQuantity)}</strong>, sujeita a agenda, necessidade de conteúdo e alinhamento prévio.</p>
      )}

      {hasMeetings && (
        <p><strong>{objectSection}.{scopeItem++}.</strong> Estão previstas {contract.meetingsPerMonth || '1'} reunião(ões) de acompanhamento por mês.</p>
      )}

      {hasEvents && (
        <p><strong>{objectSection}.{scopeItem++}.</strong> Estão incluídas até {contract.eventsIncluded || '1'} cobertura(s) de evento presencial por mês. Eventos adicionais poderão ser cobrados em {money(contract.extraEventValue)} por evento. {Number(contract.remoteEventsIncluded || 0) > 0 ? `Também estão incluídas até ${contract.remoteEventsIncluded} coberturas remotas por mês, sendo as adicionais cobradas em ${money(contract.extraRemoteEventValue)} por evento.` : ''}</p>
      )}

      {contract.customScope?.trim() && <p><strong>{objectSection}.{scopeItem++}.</strong> Escopo complementar: {contract.customScope.trim()}</p>}

      {contract.clauses.no_results && <p><strong>{objectSection}.{scopeItem++}.</strong> A CONTRATADA compromete-se a empregar seus melhores esforços técnicos, estratégicos e criativos. Entretanto, fatores externos como algoritmos, público, mercado, concorrência, verba de mídia, atendimento comercial e decisões das plataformas impedem garantia de seguidores, leads, vendas, faturamento ou qualquer métrica específica.</p>}

      <SectionTitle number={clientObligationsSection}>Das Obrigações da Contratante</SectionTitle>
      <p><strong>{clientObligationsSection}.1.</strong> Fornecer informações, materiais, acessos, aprovações, autorizações e demais elementos necessários à execução dos serviços.</p>
      <p><strong>{clientObligationsSection}.2.</strong> Responder pela veracidade das informações fornecidas, direitos de uso de imagem, propriedade intelectual, dados de terceiros e conformidade legal dos materiais encaminhados.</p>
      <p><strong>{clientObligationsSection}.3.</strong> Realizar os pagamentos nos prazos e condições previstos neste contrato.</p>
      {hasTraffic && <p><strong>{clientObligationsSection}.4.</strong> Disponibilizar e pagar a verba destinada às plataformas de anúncios, quando houver campanhas de mídia paga.</p>}

      <SectionTitle number={contractorObligationsSection}>Das Obrigações da Contratada</SectionTitle>
      <p><strong>{contractorObligationsSection}.1.</strong> Executar os serviços com zelo, técnica, criatividade e estratégia, respeitando o escopo contratado.</p>
      <p><strong>{contractorObligationsSection}.2.</strong> Organizar os direcionamentos de conteúdo e comunicar necessidades, pendências e limitações que possam impactar a execução.</p>
      {contract.clauses.confidentiality && <p><strong>{contractorObligationsSection}.3.</strong> Manter sigilo sobre dados, documentos, materiais, operações e estratégias da CONTRATANTE, inclusive após o término da relação contratual.</p>}
      <p><strong>{contractorObligationsSection}.4.</strong> A CONTRATADA poderá recusar a publicação ou execução de conteúdo que entenda violar legislação, direitos de terceiros, políticas de plataformas ou princípios éticos de comunicação.</p>

      {approvalSection && <>
        <SectionTitle number={approvalSection}>Da Aprovação de Conteúdos e Prazos</SectionTitle>
        <p><strong>{approvalSection}.1.</strong> Os conteúdos serão submetidos à CONTRATANTE para validação sempre que a dinâmica do calendário permitir. A CONTRATANTE deverá aprovar, reprovar ou solicitar ajustes dentro do prazo operacional comunicado.</p>
        <p><strong>{approvalSection}.2.</strong> A ausência de retorno poderá impactar a data de publicação, remanejar o conteúdo ou implicar aprovação tácita quando essa dinâmica tiver sido previamente comunicada no fluxo de trabalho.</p>
      </>}

      <SectionTitle number={priceSection}>Do Preço e Forma de Pagamento</SectionTitle>
      <p><strong>{priceSection}.1.</strong> Pela execução dos serviços, a CONTRATANTE pagará à CONTRATADA {priceText}.</p>
      {contract.barterEnabled && <p><strong>{priceSection}.2.</strong> Além do valor financeiro, integra a contraprestação o montante de {money(contract.barterValue)} em permuta{contract.barterDescription ? `, correspondente a ${contract.barterDescription}` : ''}. {contract.barterAccumulates ? 'O saldo da permuta poderá ser acumulado para utilização futura.' : 'A permuta deverá ser utilizada dentro do período mensal correspondente.'}</p>}
      <p><strong>{priceSection}.{contract.barterEnabled ? '3' : '2'}.</strong> O pagamento será realizado {contract.paymentRegime === 'postpaid' ? 'após a prestação do período de serviço (pós-pago)' : 'antes do início do período de serviço (pré-pago)'}{contract.dueRule === 'business_day' ? `, até o ${contract.dueDay || '5'}º dia útil` : `, até o dia ${contract.dueDay || '20'} de cada mês`}.</p>
      {contract.clauses.late_payment && <p><strong>{priceSection}.{contract.barterEnabled ? '4' : '3'}.</strong> Em caso de atraso, poderá ser aplicada multa de {contract.lateFee || '5'}% sobre o valor em aberto, sem prejuízo da suspensão temporária dos serviços até a regularização.</p>}
      {hasTraffic && contract.mediaBudgetEnabled && <p><strong>{priceSection}.{contract.barterEnabled ? '5' : '4'}.</strong> O orçamento estimado para mídia paga será de até {money(contract.mediaBudget)} mensais. Esse valor não integra os honorários da CONTRATADA e será {contract.mediaPaidDirectly ? 'pago diretamente pela CONTRATANTE às plataformas de anúncios' : 'tratado por meio previamente acordado entre as partes'}.</p>}

      {copyrightSection && <>
        <SectionTitle number={copyrightSection}>Dos Direitos Autorais, Portfólio e Materiais</SectionTitle>
        {contract.clauses.portfolio && <p><strong>{copyrightSection}.1.</strong> Os conteúdos aprovados e publicados poderão ser utilizados pela CONTRATADA em portfólio, estudo de caso, apresentação comercial ou divulgação institucional, salvo restrição expressa formalizada pela CONTRATANTE.</p>}
        {contract.clauses.editable_files && <p><strong>{copyrightSection}.2.</strong> Arquivos editáveis, projetos abertos, templates internos, métodos, documentos estratégicos internos, prompts e processos de criação não integram a entrega, salvo contratação específica.</p>}
        <p><strong>{copyrightSection}.3.</strong> Materiais fornecidos pela CONTRATANTE permanecem de sua titularidade, observadas licenças, autorizações e direitos de terceiros.</p>
      </>}

      <SectionTitle number={termSection}>Da Vigência e Renovação</SectionTitle>
      <p><strong>{termSection}.1.</strong> O presente contrato terá vigência inicial de {durationText}, contada a partir de {datePtBr(contract.startDate) || 'sua assinatura'}.</p>
      <p><strong>{termSection}.2.</strong> {contract.autoRenew ? `O contrato será renovado automaticamente por períodos sucessivos, salvo manifestação contrária com aviso prévio mínimo de ${contract.noticeDays || '30'} dias.` : 'Não haverá renovação automática, salvo novo acordo escrito entre as partes.'}</p>

      {terminationSection && <>
        <SectionTitle number={terminationSection}>Da Rescisão Contratual</SectionTitle>
        <p><strong>{terminationSection}.1.</strong> O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de {contract.noticeDays || '30'} dias, devendo ser quitados valores vencidos e proporcionais referentes aos serviços já prestados.</p>
        <p><strong>{terminationSection}.2.</strong> O descumprimento de obrigações contratuais, atraso reiterado, ausência de informações essenciais, violação de direitos de terceiros, quebra de confidencialidade ou conduta que inviabilize a execução poderá justificar rescisão imediata por justa causa.</p>
        {contract.cancellationFeeEnabled && <p><strong>{terminationSection}.3.</strong> Caso a CONTRATANTE solicite cancelamento sem o aviso prévio previsto, poderá ser cobrado o equivalente a {contract.cancellationFeeDays || '30'} dias de serviço, além dos valores já vencidos ou proporcionais ao período trabalhado.</p>}
      </>}

      {contract.notes?.trim() && <>
        <h2 className="contract-section-title">Condições Complementares</h2>
        <p>{contract.notes.trim()}</p>
      </>}

      <p className="contract-legal">Aplicam-se ao presente instrumento, naquilo que couber, as disposições legais pertinentes à atividade contratada, inclusive normas de direitos autorais e publicidade.</p>
      <p className="contract-agreement"><strong>E, por assim estarem justos e acordados, firmam o presente contrato em duas vias de igual teor e forma.</strong></p>

      <div className="contract-signatures">
        <div><span>____________________________________</span><strong>CONTRATANTE</strong><small>{contract.clientRepresentative || contract.clientLegalName || contract.clientTradeName || ''}</small></div>
        <div><span>____________________________________</span><strong>CONTRATADA</strong><small>{contract.contractorRepresentative}</small></div>
      </div>

      <p className="contract-date">{contract.city || 'NATAL'}, {datePtBr(contract.startDate)}</p>
    </article>
  );
}

export default function Contracts() {
  const { selectedClient } = useClientFilter();
  const [contracts, setContracts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('list');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setContracts(Array.isArray(saved) ? saved.map(normalizeContract) : []);
    } catch {
      setContracts([]);
    }
  }, []);

  useEffect(() => {
    if (!savedNotice) return undefined;
    const timer = window.setTimeout(() => setSavedNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  function persist(next) {
    setContracts(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function newContract() {
    const base = clone(emptyContract);
    base.id = uid();
    base.createdAt = new Date().toISOString();
    base.updatedAt = base.createdAt;

    if (selectedClient) {
      base.clientTradeName = selectedClient.name || '';
      base.clientLegalName = selectedClient.name || '';
      base.clientCnpj = selectedClient.cnpj || '';
      base.clientAddress = selectedClient.address || '';
      base.clientEmail = selectedClient.email || '';
      base.clientPhone = selectedClient.phone || '';
    }

    setEditing(base);
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openContract(contract) {
    setEditing(normalizeContract(contract));
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function saveContract() {
    if (!editing) return;
    const record = { ...editing, updatedAt: new Date().toISOString() };
    const exists = contracts.some((item) => item.id === record.id);
    const next = exists ? contracts.map((item) => item.id === record.id ? record : item) : [record, ...contracts];
    persist(next);
    setEditing(record);
    setSavedNotice('Rascunho salvo neste navegador.');
  }

  function duplicateContract(contract = editing) {
    if (!contract) return;
    const copy = normalizeContract(contract);
    copy.id = uid();
    copy.title = `${copy.title} — cópia`;
    copy.status = 'draft';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    persist([copy, ...contracts]);
    setEditing(copy);
    setView('editor');
  }

  function deleteContract(id) {
    const next = contracts.filter((item) => item.id !== id);
    persist(next);
    if (editing?.id === id) {
      setEditing(null);
      setView('list');
    }
  }

  function update(key, value) {
    setEditing((current) => ({ ...current, [key]: value }));
  }

  function toggleService(key) {
    setEditing((current) => ({
      ...current,
      services: current.services.includes(key)
        ? current.services.filter((item) => item !== key)
        : [...current.services, key],
    }));
  }

  function toggleClause(key) {
    setEditing((current) => ({
      ...current,
      clauses: { ...current.clauses, [key]: !current.clauses[key] },
    }));
  }

  const stats = useMemo(() => ({
    total: contracts.length,
    drafts: contracts.filter((item) => item.status === 'draft').length,
    active: contracts.filter((item) => item.status === 'active').length,
  }), [contracts]);

  function printContract() {
    window.print();
  }

  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Gestão contratual</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Contratos</h1>
            <p className="mt-1 text-sm text-slate-500">Crie contratos modulares, revise o texto em tempo real e gere o PDF pela impressão do navegador.</p>
          </div>
          <button type="button" onClick={newContract} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus size={16} /> Novo contrato
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[['Total', stats.total], ['Rascunhos', stats.drafts], ['Ativos', stats.active]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {contracts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FileSignature size={25} /></span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Nenhum contrato criado ainda</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Crie o primeiro contrato usando os módulos de escopo, pagamento, vigência e cláusulas.</p>
            <button type="button" onClick={newContract} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
              <Plus size={15} /> Criar primeiro contrato
            </button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {contracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${contract.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {contract.status === 'active' ? 'Ativo' : 'Rascunho'}
                    </span>
                    <h2 className="mt-3 font-semibold text-slate-900">{contract.clientTradeName || contract.clientLegalName || 'Cliente sem nome'}</h2>
                    <p className="mt-1 text-xs text-slate-500">{SERVICE_OPTIONS.filter((item) => contract.services.includes(item.key)).slice(0, 4).map((item) => item.label).join(' · ') || 'Sem escopo definido'}</p>
                  </div>
                  <FileText size={18} className="text-slate-300" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Valor</span><strong className="mt-1 block text-slate-700">{money(contract.cashValue)}{contract.billingType === 'monthly' ? '/mês' : ''}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Vigência</span><strong className="mt-1 block text-slate-700">{contract.durationMode === 'date' ? datePtBr(contract.endDate) : `${contract.durationMonths} meses`}</strong></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openContract(contract)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir / editar</button>
                  <button type="button" onClick={() => duplicateContract(contract)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Copy size={13} /> Duplicar</button>
                  <button type="button" onClick={() => deleteContract(contract.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Excluir</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!editing) return null;
  const hasTraffic = editing.services.includes('traffic');
  const hasEvents = editing.services.includes('events');

  return (
    <div className="contracts-editor">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #contract-print-area, #contract-print-area * { visibility: visible !important; }
          #contract-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; box-shadow: none !important; border: 0 !important; margin: 0 !important; }
          @page { size: A4; margin: 12mm; }
        }
        .contract-paper { background: white; color: #252525; padding: 34px 38px 44px; border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 14px 42px rgba(15,23,42,.08); font-family: Arial, sans-serif; font-size: 11px; line-height: 1.55; }
        .contract-paper p { margin: 0 0 9px; text-align: justify; }
        .contract-brand { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; border-bottom: 5px solid #0969ff; padding-bottom:18px; margin-bottom:26px; }
        .contract-brand p { margin:0; font-size:10px; font-weight:800; letter-spacing:.15em; color:#64748b; text-align:left; }
        .contract-brand h1 { margin:4px 0 0; font-size:22px; line-height:1.1; color:#0f172a; }
        .contract-brand strong { color:#0969ff; font-size:15px; letter-spacing:.08em; }
        .contract-parties h2, .contract-section-title { color:#0b3f93; font-weight:800; }
        .contract-parties h2 { font-size:16px; margin:0 0 12px; }
        .contract-party-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
        .contract-party-grid > div { border:1px solid #e2e8f0; border-radius:10px; padding:13px; background:#f8fafc; }
        .contract-party-grid small { display:block; color:#0969ff; font-weight:800; margin-bottom:5px; }
        .contract-section-title { margin:22px 0 10px; font-size:15px; border-left:3px solid #0969ff; padding-left:9px; }
        .contract-legal { margin-top:20px !important; color:#475569; font-size:10px; }
        .contract-agreement { margin-top:22px !important; }
        .contract-signatures { display:grid; grid-template-columns:1fr 1fr; gap:36px; margin-top:52px; text-align:center; }
        .contract-signatures span, .contract-signatures strong, .contract-signatures small { display:block; }
        .contract-signatures strong { margin-top:5px; }
        .contract-signatures small { margin-top:3px; color:#64748b; }
        .contract-date { margin-top:28px !important; text-align:center !important; font-weight:700; }
        @media (max-width: 900px) { .contract-party-grid { grid-template-columns:1fr; } }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={() => { setView('list'); setEditing(null); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <ArrowLeft size={14} /> Contratos
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={duplicateContract} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy size={14} /> Duplicar</button>
          <button type="button" onClick={saveContract} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Save size={14} /> Salvar rascunho</button>
          <button type="button" onClick={printContract} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Printer size={14} /> Imprimir / PDF</button>
        </div>
      </div>

      {savedNotice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 print:hidden">{savedNotice}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.88fr)_minmax(520px,1.12fr)]">
        <div className="space-y-4 print:hidden">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Building2 size={17} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">1. Cliente</p><h2 className="font-semibold text-slate-900">Dados da contratante</h2></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nome fantasia" value={editing.clientTradeName} onChange={(value) => update('clientTradeName', value)} />
              <Field label="Razão social" value={editing.clientLegalName} onChange={(value) => update('clientLegalName', value)} />
              <Field label="CNPJ / CPF" value={editing.clientCnpj} onChange={(value) => update('clientCnpj', value)} />
              <Field label="Representante legal" value={editing.clientRepresentative} onChange={(value) => update('clientRepresentative', value)} />
              <Field label="E-mail" value={editing.clientEmail} onChange={(value) => update('clientEmail', value)} />
              <Field label="Telefone" value={editing.clientPhone} onChange={(value) => update('clientPhone', value)} />
              <div className="sm:col-span-2"><Field label="Endereço completo" value={editing.clientAddress} onChange={(value) => update('clientAddress', value)} /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={17} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">2. Escopo</p><h2 className="font-semibold text-slate-900">Serviços e quantidades</h2></div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SERVICE_OPTIONS.map((item) => {
                const active = editing.services.includes(item.key);
                return (
                  <button type="button" key={item.key} onClick={() => toggleService(item.key)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${active ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${active ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'}`}>{active && <Check size={12} />}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Cadência de entrega</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <QuantityPeriod
                  label="Postagens"
                  quantity={editing.postsQuantity}
                  period={editing.postsPeriod}
                  onQuantity={(value) => update('postsQuantity', value)}
                  onPeriod={(value) => update('postsPeriod', value)}
                />
                <QuantityPeriod
                  label="Vídeos"
                  quantity={editing.videosQuantity}
                  period={editing.videosPeriod}
                  onQuantity={(value) => update('videosQuantity', value)}
                  onPeriod={(value) => update('videosPeriod', value)}
                />
                <QuantityPeriod
                  label="Captações"
                  quantity={editing.capturesQuantity}
                  period={editing.capturesPeriod}
                  onQuantity={(value) => update('capturesQuantity', value)}
                  onPeriod={(value) => update('capturesPeriod', value)}
                />
                <Field label="Reuniões por mês" value={editing.meetingsPerMonth} onChange={(value) => update('meetingsPerMonth', value)} />
              </div>
            </div>

            {hasEvents && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Eventos inclusos / mês" value={editing.eventsIncluded} onChange={(value) => update('eventsIncluded', value)} />
                <Field label="Valor por evento adicional" value={editing.extraEventValue} onChange={(value) => update('extraEventValue', value)} prefix="R$" />
                <Field label="Coberturas remotas inclusas" value={editing.remoteEventsIncluded} onChange={(value) => update('remoteEventsIncluded', value)} />
              </div>
            )}

            <label className="mt-3 block text-xs font-semibold text-slate-600">Escopo complementar
              <textarea value={editing.customScope} onChange={(event) => update('customScope', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400" placeholder="Ex.: gestão do perfil pessoal, 2 reuniões extras, campanha específica..." />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><WalletCards size={17} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">3. Financeiro</p><h2 className="font-semibold text-slate-900">Pagamento e permuta</h2></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SelectField label="Cobrança" value={editing.billingType} onChange={(value) => update('billingType', value)} options={[['monthly','Mensal'],['annual','Anual'],['project','Projeto fechado']]} />
              <SelectField label="Regime" value={editing.paymentRegime} onChange={(value) => update('paymentRegime', value)} options={[['postpaid','Pós-pago'],['prepaid','Pré-pago']]} />
              <Field label="Valor financeiro" value={editing.cashValue} onChange={(value) => update('cashValue', value)} prefix="R$" />
              <Field label="Multa por atraso (%)" value={editing.lateFee} onChange={(value) => update('lateFee', value)} suffix="%" />
              <SelectField label="Regra de vencimento" value={editing.dueRule} onChange={(value) => update('dueRule', value)} options={[['day','Dia do mês'],['business_day','Dia útil']]} />
              <Field label={editing.dueRule === 'business_day' ? 'Qual dia útil?' : 'Dia do vencimento'} value={editing.dueDay} onChange={(value) => update('dueDay', value)} />
            </div>

            <Toggle label="Existe permuta?" checked={editing.barterEnabled} onChange={(checked) => update('barterEnabled', checked)} />
            {editing.barterEnabled && (
              <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                <Field label="Valor da permuta" value={editing.barterValue} onChange={(value) => update('barterValue', value)} prefix="R$" />
                <Field label="Descrição" value={editing.barterDescription} onChange={(value) => update('barterDescription', value)} placeholder="Ex.: procedimentos da clínica" />
                <div className="sm:col-span-2"><Toggle label="Permuta pode acumular?" checked={editing.barterAccumulates} onChange={(checked) => update('barterAccumulates', checked)} compact /></div>
              </div>
            )}

            {hasTraffic && <>
              <Toggle label="Definir verba de mídia no contrato?" checked={editing.mediaBudgetEnabled} onChange={(checked) => update('mediaBudgetEnabled', checked)} />
              {editing.mediaBudgetEnabled && (
                <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  <Field label="Verba mensal estimada" value={editing.mediaBudget} onChange={(value) => update('mediaBudget', value)} prefix="R$" />
                  <div className="pt-5"><Toggle label="Cliente paga diretamente à plataforma" checked={editing.mediaPaidDirectly} onChange={(checked) => update('mediaPaidDirectly', checked)} compact /></div>
                </div>
              )}
            </>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><CalendarDays size={17} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">4. Vigência</p><h2 className="font-semibold text-slate-900">Prazo e rescisão</h2></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Data inicial" value={editing.startDate} onChange={(value) => update('startDate', value)} type="date" />
              <SelectField label="Definir vigência por" value={editing.durationMode} onChange={(value) => update('durationMode', value)} options={[['months','Quantidade de meses'],['date','Data final']]} />
              {editing.durationMode === 'months'
                ? <Field label="Quantidade de meses" value={editing.durationMonths} onChange={(value) => update('durationMonths', value)} />
                : <Field label="Data final" value={editing.endDate} onChange={(value) => update('endDate', value)} type="date" />}
              <Field label="Aviso prévio (dias)" value={editing.noticeDays} onChange={(value) => update('noticeDays', value)} />
            </div>
            <Toggle label="Renovação automática" checked={editing.autoRenew} onChange={(checked) => update('autoRenew', checked)} />
            <Toggle label="Cobrar período equivalente se cancelar sem aviso" checked={editing.cancellationFeeEnabled} onChange={(checked) => update('cancellationFeeEnabled', checked)} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><ShieldCheck size={17} /></span>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">5. Cláusulas</p><h2 className="font-semibold text-slate-900">Proteções e condições</h2></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {CLAUSE_OPTIONS.map((item) => {
                const active = Boolean(editing.clauses[item.key]);
                return (
                  <button type="button" key={item.key} onClick={() => toggleClause(item.key)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${active ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-500'}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${active ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-300'}`}>{active && <Check size={12} />}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Condições complementares
              <textarea value={editing.notes} onChange={(event) => update('notes', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400" placeholder="Qualquer condição específica desta negociação..." />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Status do documento</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectField label="Status" value={editing.status} onChange={(value) => update('status', value)} options={[['draft','Rascunho'],['active','Ativo'],['ended','Encerrado']]} />
              <Field label="Cidade de assinatura" value={editing.city} onChange={(value) => update('city', value.toUpperCase())} />
            </div>
          </section>
        </div>

        <div className="min-w-0">
          <div className="sticky top-4">
            <div className="mb-2 flex items-center justify-between print:hidden">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Prévia em tempo real</p>
                <p className="text-xs text-slate-500">O PDF usará exatamente esta estrutura.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">A4</span>
            </div>
            <Preview contract={editing} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuantityPeriod({ label, quantity, period, onQuantity, onPeriod }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600">{label}</label>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_110px] overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-400">
        <input
          type="number"
          min="0"
          value={quantity || ''}
          onChange={(event) => onQuantity(event.target.value)}
          className="min-w-0 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-800 outline-none"
          placeholder="0"
        />
        <select
          value={period}
          onChange={(event) => onPeriod(event.target.value)}
          className="border-l border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-600 outline-none"
        >
          <option value="week">por semana</option>
          <option value="month">por mês</option>
        </select>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', prefix, suffix, placeholder = '' }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-400">
        {prefix && <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-500">{prefix}</span>}
        <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-800 outline-none" />
        {suffix && <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-400">
        {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange, compact = false }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 ${compact ? '' : 'mt-4 rounded-xl border border-slate-200 px-3 py-3'}`}>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-600" />
    </label>
  );
}
