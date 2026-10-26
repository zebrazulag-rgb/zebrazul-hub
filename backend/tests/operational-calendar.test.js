const assert = require('assert');
const { normalizeDay, normalizeScope, classifyTask, headlineForSummary } = require('../utils/operationalCalendar');

assert.strictEqual(normalizeDay('2026-10-26T10:00:00'), '2026-10-26');
assert.strictEqual(normalizeDay('26/10/2026'), null);
assert.strictEqual(normalizeScope('mine'), 'mine');
assert.strictEqual(normalizeScope('anything'), 'team');
assert.deepStrictEqual(classifyTask({ workflow_stage: 'correction' }).type, 'approval');
assert.deepStrictEqual(classifyTask({ workflow_stage: 'scheduled' }).type, 'post');
assert.deepStrictEqual(classifyTask({ workflow_stage: 'in_progress' }).type, 'delivery');
assert.strictEqual(headlineForSummary({ total: 0 }), 'TEM ESPAÇO AQUI. MILAGRE.');
assert.strictEqual(headlineForSummary({ total: 30 }), 'SEMANA CHEIA. ORGANIZA O JOGO.');
assert.strictEqual(headlineForSummary({ total: 8, recording: 4 }), 'TEM GRAVAÇÃO NA RUA.');

console.log('operational-calendar: 10/10');
