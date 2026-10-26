const test = require('node:test');
const assert = require('node:assert/strict');
const { groupForAlert, sortAlerts, summarizeAlerts } = require('../services/smartAlerts');

const today = '2026-10-26';

test('alerta crítico sempre entra em urgentes', () => {
  assert.equal(groupForAlert({ severity: 3, due_date: '2026-10-28' }, today), 'urgent');
});

test('alerta de hoje entra no grupo hoje quando não é crítico', () => {
  assert.equal(groupForAlert({ severity: 2, due_date: today }, today), 'today');
});

test('resumo usa voz da Zebrazul e conta os grupos', () => {
  const summary = summarizeAlerts([
    { group: 'urgent' }, { group: 'today' }, { group: 'waiting' },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.urgent, 1);
  assert.equal(summary.headline, 'TEM 1 COISA GRITANDO.');
});

test('ordenação prioriza urgência antes da espera', () => {
  const rows = [
    { title: 'B', group: 'waiting', severity: 1, age_days: 10 },
    { title: 'A', group: 'urgent', severity: 3, age_days: 1 },
    { title: 'C', group: 'attention', severity: 2, age_days: 4 },
  ].sort(sortAlerts);
  assert.deepEqual(rows.map((row) => row.title), ['A', 'C', 'B']);
});
