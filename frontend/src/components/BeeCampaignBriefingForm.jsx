import { CheckCircle2, ClipboardCopy, Target, Users, Sparkles, Flag } from 'lucide-react';

export const BEE_BRIEFING_DEFAULTS = {
  objetivoPrincipal: 'Conquistar novos alunos para Natal e Parnamirim',
  resultadoConcreto: 'Atingir 310 alunos ativos em 2027 por meio da captação de novos alunos',
  escopo: 'Unidades Natal e Parnamirim',
  baseProjetada2027: '258',
  metaTotal2027: '310',
  metaNovosCalculada: '52',
  totalDistribuido: '0',
};

export const BEE_BRIEFING_REQUIRED = [
  'respondente','baseProjetada2027','publicoPrioritario','momentoVida','maiorDesejo','objecao',
  'percepcaoAtual','percepcaoDesejada','verdadeUnica','promessaCentral','territorio','provas',
  'emocaoPrincipal','identidadeCrista','tresAtributos','evitarTom','obrigatorios','proibidos','fraseNorte',
];

export function withBeeBriefingCalculations(source = {}) {
  const answers = { ...BEE_BRIEFING_DEFAULTS, ...source };
  const base = Math.max(0, Number(answers.baseProjetada2027) || 0);
  const target = Math.max(0, Number(answers.metaTotal2027) || 310);
  const natal = Math.max(0, Number(answers.metaNovosNatal) || 0);
  const parnamirim = Math.max(0, Number(answers.metaNovosParnamirim) || 0);
  return {
    ...answers,
    metaNovosCalculada: String(Math.max(0, target - base)),
    totalDistribuido: String(natal + parnamirim),
  };
}

export function beeBriefingProgress(source = {}) {
  const answers = withBeeBriefingCalculations(source);
  const done = BEE_BRIEFING_REQUIRED.filter((name) => String(answers[name] || '').trim()).length;
  return Math.round((done / BEE_BRIEFING_REQUIRED.length) * 100);
}

export function beeBriefingSummary(source = {}) {
  const a = withBeeBriefingCalculations(source);
  const line = (label, name) => `${label}: ${String(a[name] || '').trim() || '—'}`;
  return `BRIEFING CONCEITUAL — MATRÍCULAS BEE 2027
================================================

IDENTIFICAÇÃO
${line('Respondente','respondente')}
${line('Unidade / área','unidade')}
${line('Data','dataResposta')}

1. META
${line('Objetivo','objetivoPrincipal')}
${line('Meta total de alunos','metaTotal2027')}
${line('Base projetada para permanecer','baseProjetada2027')}
${line('Novos alunos necessários','metaNovosCalculada')}
${line('Distribuição — Natal','metaNovosNatal')}
${line('Distribuição — Parnamirim','metaNovosParnamirim')}
${line('Prioridades de Natal','prioridadeNatal')}
${line('Prioridades de Parnamirim','prioridadeParnamirim')}

2. PÚBLICO E PERCEPÇÃO
${line('Público prioritário','publicoPrioritario')}
${line('Momento vivido','momentoVida')}
${line('Maior desejo','maiorDesejo')}
${line('Principal objeção','objecao')}
${line('Percepção atual','percepcaoAtual')}
${line('Percepção desejada','percepcaoDesejada')}

3. CONCEITO
${line('Verdade mais importante','verdadeUnica')}
${line('Promessa central','promessaCentral')}
${line('Território','territorio')}
${line('Provas','provas')}
${line('Cena ou história real','historiaReal')}
${line('Emoção dominante','emocaoPrincipal')}
${line('Identidade cristã','identidadeCrista')}
${line('A campanha deve ser','tresAtributos')}
${line('A campanha não deve ser','evitarTom')}
${line('Obrigatório','obrigatorios')}
${line('Evitar','proibidos')}

4. DECISÃO FINAL
${line('Em 2027, a Bee quer mostrar que','fraseNorte')}
${line('Ação desejada','acaoDesejada')}
${line('Aprovação final','decisorFinal')}`;
}

const PUBLIC_CHOICES = [
  ['Famílias iniciando a primeira experiência escolar', 'Primeira escola', 'Estão escolhendo a primeira experiência escolar.'],
  ['Famílias que ainda não conhecem bem a Bee', 'Descobrindo a Bee', 'Precisam compreender a proposta.'],
  ['Famílias insatisfeitas com a escola atual', 'Em busca de mudança', 'Vivem frustração ou perda de confiança.'],
  ['Famílias que valorizam educação cristã', 'Educação cristã', 'Buscam coerência entre fé e formação.'],
  ['Famílias atraídas pela formação acadêmica, clássica ou bilíngue', 'Formação diferenciada', 'Buscam profundidade e preparo.'],
  ['Famílias próximas às unidades Natal ou Parnamirim', 'Proximidade', 'Buscam alinhamento e viabilidade na rotina.'],
];

const TERRITORIES = ['Raízes e futuro','Formação integral','Pertencimento e cuidado','Excelência com propósito','Transformação visível','Comunidade e parceria'];
const EMOTIONS = ['Confiança','Esperança','Pertencimento','Orgulho','Encantamento','Coragem'];
const CHRISTIAN_IDENTITY = [
  ['Como mensagem explícita e central','Explícita e central'],
  ['Como fundamento claro da proposta','Fundamento claro'],
  ['Como valor percebido nas histórias e atitudes','Percebida nas histórias'],
];

export default function BeeCampaignBriefingForm({ answers = {}, onChange, readOnly = false, showSummary = true }) {
  const data = withBeeBriefingCalculations(answers);
  const progress = beeBriefingProgress(data);
  const gap = Number(data.metaNovosCalculada || 0);
  const distributed = Number(data.totalDistribuido || 0);
  const allocationText = !data.metaNovosNatal && !data.metaNovosParnamirim
    ? `Distribua os ${gap} novos alunos conforme as vagas disponíveis.`
    : distributed === gap
      ? `Meta fechada: ${data.metaNovosNatal || 0} para Natal + ${data.metaNovosParnamirim || 0} para Parnamirim.`
      : distributed < gap
        ? `Ainda faltam distribuir ${gap - distributed} alunos.`
        : `A distribuição excede a meta em ${distributed - gap} alunos.`;

  const set = (name, value) => {
    if (readOnly || !onChange) return;
    onChange(name, value);
  };

  async function copySummary() {
    try { await navigator.clipboard.writeText(beeBriefingSummary(data)); } catch {}
  }

  return (
    <div className="space-y-6">
      <BriefingSection number="01" eyebrow="Como usar" title="Um briefing curto para decidir o essencial." icon={CheckCircle2}
        description="Cada diretor responde individualmente. Depois, a direção consolida uma única resposta institucional para entregar à idealização criativa.">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard title="20–30 minutos" text="Cada participante registra sua visão sem influência do grupo." label="Resposta individual" />
          <InfoCard title="60 minutos" text="A direção resolve divergências e aprova uma resposta única." label="Consolidação" />
          <InfoCard title="Próxima etapa" text="Zebrazul traduz o norte aprovado em uma campanha executável." label="Idealização" />
        </div>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <strong>Regra de foco:</strong> uma campanha forte escolhe um público prioritário, uma verdade central, uma promessa e uma emoção dominante.
        </div>
      </BriefingSection>

      <BriefingSection number="02" eyebrow="Meta" title="A meta é chegar a 310 alunos ativos." icon={Target}
        description="A campanha é de matrículas para novos alunos nas unidades Natal e Parnamirim. A quantidade necessária será atualizada conforme a base efetivamente rematriculada.">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Base projetada" value={data.baseProjetada2027 || '0'} />
          <MetricCard label="Meta institucional" value={data.metaTotal2027 || '310'} />
          <MetricCard label="Novos alunos necessários" value={data.metaNovosCalculada || '0'} emphasis />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <TextField label="Respondente" required value={data.respondente} onChange={(v) => set('respondente', v)} placeholder="Nome e função" readOnly={readOnly} />
          <TextField label="Unidade ou área" value={data.unidade} onChange={(v) => set('unidade', v)} placeholder="Direção geral, Natal, Parnamirim..." readOnly={readOnly} />
          <TextField label="Data" type="date" value={data.dataResposta} onChange={(v) => set('dataResposta', v)} readOnly={readOnly} />
          <TextField label="Base projetada para permanecer" type="number" required value={data.baseProjetada2027} onChange={(v) => set('baseProjetada2027', v)} readOnly={readOnly} />
          <TextField label="Meta total" type="number" value={data.metaTotal2027} onChange={(v) => set('metaTotal2027', v)} readOnly={readOnly} />
          <TextField label="Meta calculada" type="number" value={data.metaNovosCalculada} readOnly />
          <TextField label="Natal" type="number" value={data.metaNovosNatal} onChange={(v) => set('metaNovosNatal', v)} placeholder="Novos alunos" readOnly={readOnly} />
          <TextField label="Parnamirim" type="number" value={data.metaNovosParnamirim} onChange={(v) => set('metaNovosParnamirim', v)} placeholder="Novos alunos" readOnly={readOnly} />
          <TextField label="Total distribuído" type="number" value={data.totalDistribuido} readOnly />
          <TextArea label="Prioridades de Natal" value={data.prioridadeNatal} onChange={(v) => set('prioridadeNatal', v)} placeholder="Turmas ou segmentos com maior necessidade de vagas." readOnly={readOnly} />
          <TextArea label="Prioridades de Parnamirim" value={data.prioridadeParnamirim} onChange={(v) => set('prioridadeParnamirim', v)} placeholder="Turmas ou segmentos com maior necessidade de vagas." readOnly={readOnly} />
        </div>
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${distributed === gap ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{allocationText}</div>
      </BriefingSection>

      <BriefingSection number="03" eyebrow="Público e percepção" title="Quem precisa escolher a Bee — e o que precisa entender?" icon={Users}
        description="Aqui a direção define a nova família prioritária e a mudança de percepção que a comunicação precisa provocar.">
        <ChoiceGrid label="Qual família deve ser priorizada primeiro?" required name="publicoPrioritario" value={data.publicoPrioritario} choices={PUBLIC_CHOICES} onChange={set} readOnly={readOnly} columns="md:grid-cols-2 xl:grid-cols-3" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextArea label="Que momento essa família está vivendo?" required value={data.momentoVida} onChange={(v) => set('momentoVida', v)} placeholder="Situação atual e contexto da decisão." readOnly={readOnly} />
          <TextArea label="O que ela mais deseja para o filho?" required value={data.maiorDesejo} onChange={(v) => set('maiorDesejo', v)} placeholder="Desejo mais profundo, além de ‘boa educação’." readOnly={readOnly} />
          <TextArea label="Qual é a principal objeção?" required value={data.objecao} onChange={(v) => set('objecao', v)} placeholder="Preço, localização, adaptação, metodologia, estrutura..." readOnly={readOnly} />
          <TextArea label="O que ela ainda não entende sobre a Bee?" required value={data.percepcaoAtual} onChange={(v) => set('percepcaoAtual', v)} placeholder="Desconhecimento ou percepção incompleta." readOnly={readOnly} />
          <div className="md:col-span-2"><TextArea label="Depois da campanha, o que queremos que ela passe a pensar?" required value={data.percepcaoDesejada} onChange={(v) => set('percepcaoDesejada', v)} placeholder="Complete: ‘Agora eu entendo que a Bee...’" readOnly={readOnly} /></div>
        </div>
      </BriefingSection>

      <BriefingSection number="04" eyebrow="Conceito" title="Qual verdade deve sustentar toda a campanha?" icon={Sparkles}
        description="Não é necessário criar o slogan. A direção deve fornecer o território, a promessa, as provas e a emoção que orientarão a criação.">
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea label="A verdade mais importante que temos para dizer é..." required value={data.verdadeUnica} onChange={(v) => set('verdadeUnica', v)} placeholder="Uma única ideia, simples e defensável." readOnly={readOnly} />
          <TextArea label="Ao escolher a Bee, a família pode esperar..." required value={data.promessaCentral} onChange={(v) => set('promessaCentral', v)} placeholder="Transformação legítima para o aluno e a família." readOnly={readOnly} />
        </div>
        <div className="mt-5"><ChoiceGrid label="Qual território mais representa essa ideia?" required name="territorio" value={data.territorio} choices={TERRITORIES.map((x) => [x,x,''])} onChange={set} readOnly={readOnly} columns="md:grid-cols-2 xl:grid-cols-3" /></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextArea label="Quais duas provas sustentam essa promessa?" required value={data.provas} onChange={(v) => set('provas', v)} placeholder="Práticas, histórias, resultados ou experiências reais." readOnly={readOnly} />
          <TextArea label="Existe uma cena ou história real que materializa a ideia?" value={data.historiaReal} onChange={(v) => set('historiaReal', v)} placeholder="Momento real que poderia inspirar a narrativa." readOnly={readOnly} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ChoiceGrid label="Qual emoção deve dominar a campanha?" required name="emocaoPrincipal" value={data.emocaoPrincipal} choices={EMOTIONS.map((x) => [x,x,''])} onChange={set} readOnly={readOnly} columns="grid-cols-2 md:grid-cols-3" />
          <ChoiceGrid label="Como a identidade cristã deve aparecer?" required name="identidadeCrista" value={data.identidadeCrista} choices={CHRISTIAN_IDENTITY.map(([v,l]) => [v,l,''])} onChange={set} readOnly={readOnly} columns="grid-cols-1" />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextField label="A campanha deve ser..." required value={data.tresAtributos} onChange={(v) => set('tresAtributos', v)} placeholder="Três palavras: humana, confiante, inspiradora..." readOnly={readOnly} />
          <TextField label="A campanha não deve ser..." required value={data.evitarTom} onChange={(v) => set('evitarTom', v)} placeholder="Três palavras: genérica, agressiva, infantilizada..." readOnly={readOnly} />
          <TextArea label="O que precisa aparecer?" required value={data.obrigatorios} onChange={(v) => set('obrigatorios', v)} placeholder="Valores, informações ou elementos obrigatórios." readOnly={readOnly} />
          <TextArea label="O que deve ser evitado?" required value={data.proibidos} onChange={(v) => set('proibidos', v)} placeholder="Promessas, clichês ou abordagens inadequadas." readOnly={readOnly} />
        </div>
      </BriefingSection>

      <BriefingSection number="05" eyebrow="Decisão final" title="Uma frase para orientar a criação." icon={Flag}
        description="Depois da conversa da direção, revise as respostas anteriores e registre apenas a frase-norte aprovada.">
        <TextArea label="Em 2027, a Bee quer mostrar que..." required value={data.fraseNorte} onChange={(v) => set('fraseNorte', v)} placeholder="Frase-norte entregue à idealização criativa." readOnly={readOnly} tall />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField label="Quem aprova o conceito final?" value={data.decisorFinal} onChange={(v) => set('decisorFinal', v)} readOnly={readOnly} />
          <TextField label="Qual ação a família deve desejar realizar?" value={data.acaoDesejada} onChange={(v) => set('acaoDesejada', v)} placeholder="Conhecer, visitar, conversar, matricular..." readOnly={readOnly} />
        </div>
      </BriefingSection>

      <div className="rounded-3xl bg-[#121620] p-6 text-white md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#EBAE20]">Prontidão do briefing</p>
            <h3 className="mt-2 text-2xl font-semibold">{progress === 100 ? 'Briefing pronto para validação.' : progress >= 65 ? 'O conceito está tomando forma.' : 'O briefing ainda está começando.'}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">O indicador considera apenas os campos essenciais. A consolidação institucional acontece depois que as respostas individuais forem comparadas.</p>
          </div>
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[10px] border-white/10 bg-white/[0.04] text-2xl font-black text-[#EBAE20]">{progress}%</div>
        </div>
      </div>

      {showSummary && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-[#EBAE20] px-5 py-4">
            <div><h3 className="font-semibold text-slate-950">Síntese da resposta</h3><p className="text-xs text-slate-800/65">Gerada automaticamente a partir do briefing.</p></div>
            <button type="button" onClick={copySummary} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"><ClipboardCopy size={14} /> Copiar</button>
          </div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-5 text-xs leading-6 text-slate-600">{beeBriefingSummary(data)}</pre>
        </div>
      )}
    </div>
  );
}

function BriefingSection({ number, eyebrow, title, description, icon: Icon, children }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.025]">
      <div className="border-b border-slate-100 px-5 py-5 md:px-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Icon size={20} /></span>
          <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">{number} · {eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{title}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{description}</p></div>
        </div>
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

function InfoCard({ title, label, text }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">{label}</p><h3 className="mt-2 font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div>;
}

function MetricCard({ label, value, emphasis = false }) {
  return <div className={`rounded-2xl border p-4 ${emphasis ? 'border-[#EBAE20] bg-[#EBAE20] text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-900'}`}><p className="text-xs font-semibold opacity-60">{label}</p><p className="mt-1 text-3xl font-black tracking-tight">{value}</p></div>;
}

function FieldLabel({ children, required }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}{required && <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">· essencial</span>}</label>;
}

function TextField({ label, value = '', onChange, placeholder = '', type = 'text', required = false, readOnly = false }) {
  return <div><FieldLabel required={required}>{label}</FieldLabel><input type={type} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100 read-only:bg-slate-50" /></div>;
}

function TextArea({ label, value = '', onChange, placeholder = '', required = false, readOnly = false, tall = false }) {
  return <div><FieldLabel required={required}>{label}</FieldLabel><textarea value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly} className={`w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 read-only:bg-slate-50 ${tall ? 'min-h-[150px]' : 'min-h-[105px]'}`} /></div>;
}

function ChoiceGrid({ label, required, name, value, choices, onChange, readOnly, columns = 'md:grid-cols-2' }) {
  return <div><FieldLabel required={required}>{label}</FieldLabel><div className={`grid gap-2.5 ${columns}`}>{choices.map(([choiceValue, title, description]) => { const active = value === choiceValue; return <button type="button" key={choiceValue} disabled={readOnly} onClick={() => onChange?.(name, choiceValue)} className={`rounded-xl border px-3.5 py-3 text-left transition ${active ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-slate-200 bg-white hover:border-amber-300'} ${readOnly ? 'cursor-default' : ''}`}><span className="block text-sm font-semibold text-slate-800">{title}</span>{description && <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>}</button>; })}</div></div>;
}
