// "Pergunte ao Ayrton": respostas determinísticas, só com dados que o usuário pode ver (mesma visão da página).
const ayrton = require('./ayrton');
const voice = require('./ayrtonVoice');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const SUGGESTIONS = ['Qual cliente mais precisa de atenção hoje?', 'Quais clientes estão com calendário atrasado?', 'Existe gravação próxima sem roteiro?', 'Quem tem mais tarefas atrasadas?', 'Quais contas estão esperando aprovação do cliente?', 'Quais publicações aprovadas estão sem data?', 'Quais contas estão tranquilas?'];

function ask(db, user, question, today, opts) {
  const q = norm(question);
  const view = ayrton.buildView(db, user, today, opts);
  const all = ayrton.visibleAlerts(db, user, today, opts).filter((a) => !ayrton.isIgnored(a, today) && a.level !== 'normal');
  const of = (type) => all.filter((a) => a.type === type);
  const list = (arr, fn) => arr.map(fn);
  const none = (t) => ({ answer: `${t} Não encontrei nada nos dados que você pode ver.`, items: [] });
  const row = (a) => ({ client_id: a.client_id, client_name: a.client_name, alert_id: a.id, text: `${a.title} — ${a.message.split('. ')[0]}.` });
  if (/tranquil|sem pendenc|normal|ok\b/.test(q)) {
    const n = view.normal_accounts;
    return { answer: n.length ? `${n.length} ${voice.plural(n.length, 'conta está', 'contas estão')} sem pendências: ${n.map((c) => c.client_name).join(', ')}.` : 'Nenhuma conta está totalmente sem pendências agora.', items: n.map((c) => ({ client_id: c.client_id, client_name: c.client_name })) };
  }
  if (/calendario/.test(q)) { const a = of('next_month_calendar'); return a.length ? { answer: `${a.length} ${voice.plural(a.length, 'cliente está', 'clientes estão')} com o calendário do próximo mês pendente.`, items: list(a, row) } : none('Calendário do próximo mês:'); }
  if (/gravac|roteiro/.test(q)) { const a = of('recording_no_prep'); return a.length ? { answer: `${a.length} ${voice.plural(a.length, 'cliente tem', 'clientes têm')} gravação próxima sem roteiro/pauta no sistema.`, items: list(a, row) } : none('Gravações próximas:'); }
  if (/sem data|aprovad.*data|publicac/.test(q)) { const a = of('approved_undated'); return a.length ? { answer: `${a.length} ${voice.plural(a.length, 'conta tem', 'contas têm')} publicação aprovada sem data.`, items: list(a, row) } : none('Publicações aprovadas sem data:'); }
  if (/aprova/.test(q)) {
    const a = of('approval_stuck').filter((x) => (x.evidence.items || []).some((i) => i.waiting === 'cliente'));
    return a.length ? { answer: `${a.length} ${voice.plural(a.length, 'conta tem', 'contas têm')} material esperando aprovação do cliente.`, items: list(a, (x) => ({ ...row(x), text: `${(x.evidence.items || []).filter((i) => i.waiting === 'cliente').length} material(is) com o cliente, parado(s) há até ${Math.max(...(x.evidence.items || []).filter((i) => i.waiting === 'cliente').map((i) => i.age_days))} dias.` })) } : none('Aprovações com o cliente:');
  }
  if (/atrasad|vencid|quem tem mais|responsavel/.test(q)) {
    const tally = new Map();
    for (const a of of('task_overdue')) for (const i of a.evidence.items || []) for (const n of (i.assignees?.length ? i.assignees : ['Sem responsável definido'])) tally.set(n, (tally.get(n) || 0) + 1);
    const rank = [...tally.entries()].sort((x, y) => y[1] - x[1]);
    if (!rank.length) return none('Tarefas vencidas:');
    return { answer: `${rank[0][0]} concentra mais tarefas vencidas (${rank[0][1]}) entre as que listei. Isso é contagem, não diagnóstico de sobrecarga.`, items: rank.slice(0, 8).map(([n, c]) => ({ text: `${n}: ${c} ${voice.plural(c, 'tarefa vencida', 'tarefas vencidas')}` })) };
  }
  if (/atencao|prioridade|urgente|mais precisa|critic|problema/.test(q)) {
    const top = view.accounts.slice(0, 3);
    return top.length ? { answer: `${top[0].client_name} é a conta que mais precisa de atenção: ${top[0].main.title.toLowerCase()}.`, items: top.map((c) => ({ client_id: c.client_id, client_name: c.client_name, alert_id: c.main.id, text: `${c.main.title} — ${c.main.message.split('. ')[0]}.` })) } : { answer: voice.okAll(`${today}:ask`), items: [] };
  }
  return { answer: 'Ainda não sei responder isso com os dados que tenho. Tente uma das perguntas sugeridas.', items: [], suggestions: SUGGESTIONS, understood: false };
}
module.exports = { ask, SUGGESTIONS };
