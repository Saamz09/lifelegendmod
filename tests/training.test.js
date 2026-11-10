'use strict';
// Entraînement : lecture du bloc de l'écran Entraînement, geste appris d'une synchro à l'autre, et lecture dans la
// sauvegarde de référence quand elle est là (voir tests/README.md).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { readTraining, skillForAi, SKILLS } = require(path.join(ROOT, 'src/save/training.js'));
const { diffSnapshots, hasNews } = require(path.join(ROOT, 'src/world/snapshot.js'));
const FIXTURES = process.env.LIFELEGEND_FIXTURES || path.join(__dirname, 'fixtures');
const SAVE = path.join(FIXTURES, 'BL00000000'), KEY = path.join(FIXTURES, 'key.bin');

const TRAINING = 0xC7DCEC;
const PROFILE = 0x1000; // fiche fictive : les bits des gestes partent de son octet 28
function save({ bars = [2, 2, 2, 0, 2, 2, 2, 0], skill = [106, 6], position = [2, 3], remaining = 0, total = 21, owned = [] } = {}) {
  const d = Buffer.alloc(TRAINING + 0x20);
  Buffer.from([...bars, skill[1], position[1], remaining, total]).copy(d, TRAINING);
  d[TRAINING + 0xC] = skill[0];
  d[TRAINING + 0x10] = position[0];
  for (const c of owned) d[PROFILE + 28 + (c >> 3)] |= 1 << (c & 7);
  return d;
}

test('entraînement : barres, geste et poste en cours, comme sur l’écran du jeu (Bozok, 21/08/2020)', () => {
  const t = readTraining(save({ owned: [62, 76, 94] }), PROFILE);
  assert.deepStrictEqual(Object.values(t.focus), [2, 2, 2, 0, 2, 2, 2, 0]);
  assert.deepStrictEqual(t.skill, { code: 106, name: 'Frappes de loin', points: 6 });
  assert.deepStrictEqual(t.position, { code: 2, name: 'Second attaquant', points: 3 });
  assert.deepStrictEqual([t.remaining, t.total, t.skillsOwned], [0, 21, [76, 94]], 'le bit 62 (style de jeu de l’IA) n’est pas un geste');
  const none = readTraining(save({ bars: [4, 3, 4, 0, 3, 4, 3, 0], skill: [108, 0], position: [108, 0] }), PROFILE);
  assert.deepStrictEqual([none.skill, none.position], [null, null], '« Aucun(e) »');
  assert.strictEqual(readTraining(save({ skill: [94, 0], remaining: 6 }), PROFILE).skill.name, 'Combativité');
  assert.strictEqual(readTraining(save({ skill: [60, 0], remaining: 6 }), PROFILE).skill.name, null, 'pas un geste');
  assert.strictEqual(readTraining(save({ position: [5, 3] }), PROFILE).position.name, 'Milieu offensif', 'rang dans la fiche du joueur');
  assert.strictEqual(readTraining(save({ position: [13, 3] }), PROFILE).position.name, 'Gardien');
  assert.strictEqual(readTraining(save({ position: [14, 3] }), PROFILE).position.name, null, 'au-delà des 13 postes : inconnu');
  assert.strictEqual(readTraining(save({ total: 30 }), PROFILE), null, 'les points ne font pas le total');
  assert.strictEqual(readTraining(save({ bars: [9, 0, 0, 0, 0, 0, 0, 0], skill: [108, 6], position: [108, 6], total: 21 }), PROFILE), null, 'barre au-delà de 6');
});

// Instantané minimal pour diffSnapshots.
const snap = (training, gameDate) => ({ gameDate, season: '2020-2021', club: { ref: 1, name: 'Troyes' }, fixtures: [], table: [], windows: [], player: { offers: [], training } });

test('entraînement : le geste travaillé apparaît dans la fiche → geste appris, qui fait une édition', () => {
  const before = readTraining(save({ skill: [94, 6], position: [108, 0], remaining: 3 }), PROFILE);
  const after = readTraining(save({ skill: [76, 0], position: [108, 0], remaining: 9, owned: [94] }), PROFILE);
  const c = diffSnapshots(snap(before, '2020-10-10'), snap(after, '2020-10-20'));
  assert.deepStrictEqual(c.skillLearned, { code: 94, name: 'Combativité' });
  assert.ok(hasNews(c));
  assert.strictEqual(diffSnapshots(snap(after, '2020-10-20'), snap(after, '2020-10-21')).skillLearned, null, 'rien de nouveau');
  assert.strictEqual(diffSnapshots(snap(null, '2020-10-10'), snap(after, '2020-10-20')).skillLearned, null, 'ancien instantané sans entraînement');
});

test('entraînement : les 41 gestes du jeu, numérotés de 67 à 107, juste avant « Aucun » (108)', () => {
  const codes = Object.keys(SKILLS).map(Number);
  assert.deepStrictEqual(codes, Array.from({ length: 41 }, (_, i) => 67 + i));
  assert.strictEqual(new Set(Object.values(SKILLS).map(([fr]) => fr)).size, 41, 'noms français distincts');
  assert.strictEqual(new Set(Object.values(SKILLS).map(([, en]) => en)).size, 41, 'noms anglais distincts');
  assert.strictEqual(skillForAi(106), 'Frappes de loin (Long Range Shooting)');
  assert.strictEqual(skillForAi(60), null);
});

test('entraînement : lu dans la sauvegarde de référence', { skip: !(fs.existsSync(SAVE) && fs.existsSync(KEY)) && 'fichiers de référence absents' }, (ctx) => {
  const { setSaveKeys } = require(path.join(ROOT, 'src/save/pesCrypt.js'));
  ctx.after(() => setSaveKeys([]));
  setSaveKeys([fs.readFileSync(KEY)]);
  const { readCareer } = require(path.join(ROOT, 'src/save/blReader.js'));
  const t = readCareer(SAVE).player.training;
  assert.ok(t, 'bloc reconnu');
  assert.strictEqual(Object.values(t.focus).reduce((a, b) => a + b, 0) + (t.skill?.points || 0) + (t.position?.points || 0) + t.remaining, t.total);
  if (t.skill) assert.ok(!t.skillsOwned.includes(t.skill.code), 'le geste en cours n’est pas encore acquis');
  if (t.skill) assert.ok(t.skill.name, 'geste nommé');
  // Carrière de référence I. Morel : « Milieu offensif » choisi dans l'écran Entraînement du jeu le 01/11/2026.
  assert.deepStrictEqual(t.position, { code: 5, name: 'Milieu offensif', points: 6 });
});
