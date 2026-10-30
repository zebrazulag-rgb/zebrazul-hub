// Registro da equipe digital da Zebrazul. Hoje só o Ayrton existe de verdade; os demais ficam
// para o futuro. Novos agentes entram aqui e reaproveitam as tabelas agent_* (alertas, eventos, log de IA).
const AGENTS = {
  ayrton: {
    key: 'ayrton',
    name: 'Ayrton',
    role: 'Guardião da Conta',
    description: 'Acompanha a operação dos clientes e identifica o que precisa de atenção antes de virar problema.',
    signature: 'Se der para evitar o incêndio, prefiro não esperar a fumaça.',
    active: true,
  },
};
module.exports = { AGENTS, getAgent: (key) => AGENTS[key] || null };
