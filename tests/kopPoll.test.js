'use strict';
// Kop : les sondages (son choix, 2026-11-10). Les choix sont nettoyés, et la répartition rendue par l'IA devient des
// pourcentages entiers qui font 100 ; une réponse inutilisable est écartée.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pollOptions, pollPercents } = require(path.join(__dirname, '..', 'src/world/world.js'));

test('sondage : 2 à 4 choix différents, 40 caractères au plus', () => {
  assert.deepStrictEqual(pollOptions({ options: ['  Oui ', 'Non', 'oui', '', 'Peut-être', 'Jamais', 'Encore'] }), ['Oui', 'Non', 'Peut-être', 'Jamais']);
  assert.strictEqual(pollOptions({ options: ['x'.repeat(60), 'b'] })[0].length, 40);
  assert.strictEqual(pollOptions({ options: ['Seul'] }), null, 'un seul choix : pas de sondage');
  assert.strictEqual(pollOptions(null), null);
});

test('sondage : des pourcentages entiers qui font toujours 100', () => {
  assert.deepStrictEqual(pollPercents([58, 31, 11], 3), [58, 31, 11]);
  assert.deepStrictEqual(pollPercents([1, 1, 1], 3).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(pollPercents([0.6, 0.4], 2), [60, 40], 'des parts plutôt que des pourcentages');
  assert.strictEqual(pollPercents([50, 50], 3), null, 'pas autant de nombres que de choix');
  assert.strictEqual(pollPercents([0, 0], 2), null);
  assert.strictEqual(pollPercents(['a', 40], 2), null);
});
