// Voz do Ayrton: informação primeiro (80%), personalidade depois (20%).
// Regras: sarcasmo só na situação, nunca na pessoa; quanto mais grave, menos brincadeira (crítico = sem piada);
// nada de afirmar causa sem dado ("há indícios", "vale verificar").
function hash(text) { let h = 0; for (const c of String(text)) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return Math.abs(h); }
const pick = (list, seed) => list[hash(seed) % list.length];
const plural = (n, one, many) => (Number(n) === 1 ? one : many);

const QUIPS = {
  task_overdue: [
    (c) => `Venceu há ${c.maxLate} ${plural(c.maxLate, 'dia', 'dias')}. Tarefa não termina por osmose, infelizmente.`,
    (c) => `O prazo passou há ${c.maxLate} ${plural(c.maxLate, 'dia', 'dias')} e a tarefa continua esperando alguém lembrar dela.`,
    () => 'O prazo é uma sugestão enfática, mas ainda assim uma sugestão.',
  ],
  approval_stuck: [
    (c) => `Esperando aprovação há ${c.maxAge} dias. Já deu tempo de criar apego.`,
    () => 'Material aprovado só na imaginação ainda não conta para o calendário.',
    (c) => `${c.maxAge} dias de espera. A paciência é uma virtude, mas o calendário não é movido por ela.`,
  ],
  approved_undated: [
    () => 'Aprovado? Sim. Data de publicação? Aparentemente esse detalhe ficou para a próxima temporada.',
    () => 'Peça pronta, aprovada e sem data. Só falta dizer quando.',
    () => 'Aprovação feita. O calendário ainda não ficou sabendo.',
  ],
  next_month_calendar: [
    (c) => `${daysToMonthEnd(c.daysLeft, true)} e o próximo calendário ainda não existe. O futuro chegou mais rápido que o planejamento.`,
    (c) => `O mês acaba em ${c.daysLeft} ${plural(c.daysLeft, 'dia', 'dias')} e o próximo ainda está em branco.`,
  ],
  recording_no_prep: [
    () => 'Gravação chegando e nenhum roteiro encontrado. A improvisação é uma arte, mas talvez não seja o plano.',
    () => 'Câmera marcada, roteiro não encontrado. Vale checar se existe pauta fora do ZebraHub.',
  ],
};

const OK_ACCOUNT = [
  'Nenhum incêndio encontrado nessa conta. Pode continuar respirando normalmente.',
  'Nada urgente por aqui. Pode gastar sua ansiedade em outra conta.',
  'Calendário organizado, aprovações em dia e tarefas andando. Vou até conferir de novo.',
];
const OK_ALL = [
  'Hoje está tudo surpreendentemente organizado. Não se acostume.',
  'Calendário organizado, aprovações em dia e tarefas andando. Vou até conferir de novo.',
  'Nada urgente por aqui. Pode gastar sua ansiedade em outra conta.',
];
const CLOSERS = ['O resto, milagrosamente, segue funcionando.', 'As demais contas estão em ordem.', 'Fora isso, a operação está em ordem.'];

function quip(type, level, ctx, seed) {
  if (level === 'critical') return ''; // situação grave: direto ao ponto
  const bank = QUIPS[type]; if (!bank) return '';
  return pick(bank, `${seed}:${type}`)(ctx);
}
const okAccount = (seed) => pick(OK_ACCOUNT, seed);
const okAll = (seed) => pick(OK_ALL, seed);
const closer = (seed) => pick(CLOSERS, seed);

function greeting(hour) { return hour < 12 ? 'Bom dia' : (hour < 18 ? 'Boa tarde' : 'Boa noite'); }

const daysToMonthEnd = (n, joined = false) => { const t = n <= 0 ? 'Hoje é o último dia do mês' : (n === 1 ? 'Falta 1 dia para virar o mês' : `Faltam ${n} dias para virar o mês`); return joined ? t : `${t}.`; };
module.exports = { daysToMonthEnd, quip, okAccount, okAll, closer, greeting, plural, hash };
