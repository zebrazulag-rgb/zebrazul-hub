const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RULE_DEFINITIONS,
  normalizeCooldown,
  uniqueNumbers,
  canManageAutomations,
  filterCandidatesForRules,
  summarizeRunDetails,
} = require('../services/automationEngine');

test('V16 nasce com cinco automações operacionais', () => {
  assert.deepEqual(RULE_DEFINITIONS.map((rule) => rule.key), [
    'correction_open', 'due_tomorrow', 'client_waiting', 'approved_undated', 'video_stalled',
  ]);
});

test('cooldown nunca fica abaixo de 4h nem acima de 168h', () => {
  assert.equal(normalizeCooldown(1), 4);
  assert.equal(normalizeCooldown(24), 24);
  assert.equal(normalizeCooldown(999), 168);
});

test('destinatários são deduplicados e ids inválidos somem', () => {
  assert.deepEqual(uniqueNumbers([1, '1', 2, null, 0, 'x', 2]), [1, 2]);
});

test('somente admin e head de operação gerenciam automações', () => {
  assert.equal(canManageAutomations({ role: 'admin' }), true);
  assert.equal(canManageAutomations({ role: 'team', is_operations_head: 1 }), true);
  assert.equal(canManageAutomations({ role: 'team', is_operations_head: 0 }), false);
});

test('filtro respeita regra pausada e ordena sinal mais antigo primeiro', () => {
  const settings = RULE_DEFINITIONS.map((rule) => ({ ...rule, enabled: rule.key !== 'due_tomorrow' }));
  const filtered = filterCandidatesForRules([
    { rule_key: 'due_tomorrow', entity_id: 9, age_days: 1 },
    { rule_key: 'correction_open', entity_id: 2, age_days: 1 },
    { rule_key: 'correction_open', entity_id: 1, age_days: 5 },
  ], settings);
  assert.deepEqual(filtered.map((item) => item.entity_id), [1, 2]);
});

test('resumo de rodada separa sinais encontrados de notificações enviadas', () => {
  const settings = RULE_DEFINITIONS.map((rule) => ({ ...rule, enabled: true }));
  const candidates = [
    { rule_key: 'correction_open' },
    { rule_key: 'correction_open' },
    { rule_key: 'client_waiting' },
  ];
  const deliveries = [{ rule_key: 'correction_open' }];
  const result = summarizeRunDetails(settings, candidates, deliveries);
  assert.equal(result.correction_open.candidates, 2);
  assert.equal(result.correction_open.delivered, 1);
  assert.equal(result.client_waiting.candidates, 1);
  assert.equal(result.client_waiting.delivered, 0);
});
