import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFor, prepareTeam } from '../src/utils/officeScene.js';

test('layout: 3 colunas, cresce em fileiras e o lounge desce junto', () => {
  assert.equal(layoutFor(1).rows, 2);
  assert.equal(layoutFor(6).H, 220);
  const l = layoutFor(10);
  assert.equal(l.rows, 4);
  assert.equal(l.H, 324);
  assert.deepEqual(l.seats[3], [78, 142]);
  assert.deepEqual(l.seats[9], [78, 90 + 52 * 3]);
});

test('equipe: nome na plaquinha sem acento, duplas por coluna', () => {
  const t = prepareTeam([
    { id: 1, name: 'Érica Lima', status: 'available', look: {} },
    { id: 2, name: 'João', status: 'available', look: {} },
    { id: 3, name: 'Maximiliano Souza', status: 'offline', look: {} },
  ]);
  assert.deepEqual(t.map((m) => m.first), ['ERICA', 'JOAO', 'MAXIMILI']);
  assert.equal(t[0].partner, 1); assert.equal(t[1].partner, 0); assert.equal(t[2].partner, -1);
  assert.equal(t[0].off, t[1].off);
});
