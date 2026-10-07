const test = require('node:test');
const assert = require('node:assert/strict');
const { CRITERIA, normalizeScores, computeTotal, levelOf } = require('../services/clientHealth');

test('10 critérios, na ordem pedida', () => {
  assert.deepEqual(CRITERIA.map((c) => c.key), ['bio', 'link', 'foto_perfil', 'destaques', 'posts_fixados', 'grade_feed', 'capas_videos', 'harmonia', 'conteudo', 'trends']);
});
test('total é a média dos avaliados em escala 0–100; vazio = sem pontuação', () => {
  assert.equal(computeTotal(normalizeScores({})), null);
  assert.equal(computeTotal(normalizeScores({ bio: 10, link: 10 })), 100);
  assert.equal(computeTotal(normalizeScores({ bio: 8, link: 6, trends: 7 })), 70);
  assert.equal(computeTotal(normalizeScores({ bio: 0 })), 0);
});
test('"não se aplica" (null/vazio) não derruba a média', () => {
  assert.equal(computeTotal(normalizeScores({ bio: 10, capas_videos: null, trends: '' })), 100);
});
test('notas inválidas são recusadas; chaves desconhecidas ignoradas', () => {
  assert.throws(() => normalizeScores({ bio: 11 }), /Nota inválida/);
  assert.throws(() => normalizeScores({ bio: -1 }), /Nota inválida/);
  assert.throws(() => normalizeScores({ bio: 7.5 }), /Nota inválida/);
  assert.equal(normalizeScores({ xpto: 5 }).xpto, undefined);
});
test('faixas de cor', () => {
  assert.equal(levelOf(null), 'none');
  assert.equal(levelOf(80), 'green');
  assert.equal(levelOf(79), 'yellow');
  assert.equal(levelOf(60), 'yellow');
  assert.equal(levelOf(59), 'red');
});
