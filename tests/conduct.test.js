'use strict';
// Relation avec le club (sa demande du 2026-11-10) : ses écarts envers son coach, ses coéquipiers ou son club, en
// conférence de presse, sur Kop et dans Huddle, mènent par paliers à un rappel à l'ordre puis à une mise à l'écart d'un
// match, puis de deux, écrite dans le jeu (jours d'indisponibilité). Le temps apaise.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'src/world/conduct.js'));
const { unavailableInData, OFFSET } = require(path.join(ROOT, 'src/save/conductWrite.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));

let n = 0;
const newId = () => `id${++n}`;
const fixtures = [
  { id: 'm1', date: '2027-01-14', home: 'Dijon FCO', away: 'AS Nancy Lorraine' },
  { id: 'm2', date: '2027-01-17', home: 'AS Nancy Lorraine', away: 'Pau FC' },
  { id: 'm3', date: '2027-01-24', home: 'Rodez AF', away: 'AS Nancy Lorraine' },
  { id: 'm4', date: '2027-01-31', home: 'AS Nancy Lorraine', away: 'Stade de Reims' },
];
const snap = (gameDate, played = []) => ({ gameDate, club: { name: 'AS Nancy Lorraine', coach: 'Oswald Tanchot', ref: 8 }, fixtures: fixtures.map((f) => ({ ...f, played: played.includes(f.id) })) });
const insult = (state, date, source = 'kop') => C.recordConduct(state, { level: 3, target: 'coach', quote: 'il comprend rien' }, { source, text: 'franchement il comprend rien ce coach', gameDate: date });

test('relation : un message normal ne compte pas ; la citation vient toujours de ses mots', () => {
  const state = {};
  assert.strictEqual(C.recordConduct(state, { level: 0 }, { source: 'kop', text: 'on va gagner', gameDate: '2027-01-10' }), null);
  assert.strictEqual(state.conduct, undefined);
  const x = C.recordConduct(state, { level: 2, target: 'teammates', quote: 'des mots qu’il n’a pas dits' }, { source: 'huddle', text: 'vous êtes des touristes', gameDate: '2027-01-10' });
  assert.strictEqual(x.quote, 'vous êtes des touristes');
  assert.strictEqual(C.recordConduct(state, { level: 2 }, { source: 'mail', text: 'x', gameDate: '2027-01-10' }), null, 'seulement presse, Kop et Huddle');
});

test('relation : rappel à l’ordre du coach, puis écarté un match, puis deux, quel que soit le match', () => {
  const state = {};
  insult(state, '2027-01-10');
  const a = C.conductAtSync(state, snap('2027-01-11'), { newId, director: 'Marc Delmotte' });
  assert.strictEqual(a.change.kind, 'warning');
  assert.strictEqual(a.mail.from, 'Oswald Tanchot');
  assert.match(a.mail.messages[0].body, /il comprend rien/);
  assert.strictEqual(state.conduct.pending, null);

  insult(state, '2027-01-12', 'press');
  const b = C.conductAtSync(state, snap('2027-01-12'), { newId, director: 'Marc Delmotte', sanctions: true });
  assert.strictEqual(b.change.kind, 'left_out');
  assert.deepStrictEqual(b.change.matches.map((m) => m.home), ['Dijon FCO']);
  assert.strictEqual(b.change.public, true);
  assert.strictEqual(b.mail.from, 'Marc Delmotte');
  assert.strictEqual(b.mail.conduct, state.conduct.pending.id, 'le mail porte le bouton de cette sanction');
  assert.strictEqual(state.conduct.pending.days, 3, 'jusqu’au lendemain du match');

  // Pas de nouveau palier tant que la sanction court ; elle se termine quand le match est joué.
  insult(state, '2027-01-13', 'huddle');
  assert.strictEqual(C.conductAtSync(state, snap('2027-01-13'), { newId, sanctions: true }).change, null);
  const c = C.conductAtSync(state, snap('2027-01-15', ['m1']), { newId, director: 'Marc Delmotte', sanctions: true });
  assert.ok(c.ended, 'la première sanction est terminée');
  assert.strictEqual(c.change.kind, 'left_out');
  assert.deepStrictEqual(c.change.matches.map((m) => m.away), ['Pau FC', 'AS Nancy Lorraine'], 'deux matchs');
  assert.strictEqual(c.change.public, false, 'dans Huddle : privé');
});

test('relation : sanction en pause (le jeu ne l’applique pas encore) : après le rappel à l’ordre, l’ambiance se tend, sans mail', () => {
  assert.strictEqual(C.SANCTIONS_IN_GAME, false);
  const state = {};
  insult(state, '2027-01-10');
  assert.strictEqual(C.conductAtSync(state, snap('2027-01-11'), { newId }).change.kind, 'warning');
  insult(state, '2027-01-12', 'press');
  const r = C.conductAtSync(state, snap('2027-01-12'), { newId });
  assert.strictEqual(r.change.kind, 'tension');
  assert.strictEqual(r.mail, null);
  assert.strictEqual(state.conduct.pending, null);
  assert.strictEqual(state.conduct.stage, 1);
});

test('relation : le temps apaise (points effacés en deux semaines, un palier de moins par mois)', () => {
  const state = {};
  C.recordConduct(state, { level: 2, target: 'club', quote: 'ce club' }, { source: 'kop', text: 'ce club me déçoit', gameDate: '2027-01-01' });
  assert.strictEqual(state.conduct.points, 3);
  C.settle(state.conduct, '2027-01-16');
  assert.strictEqual(state.conduct.points, 0);
  state.conduct.stage = 2;
  state.conduct.calmFrom = '2027-01-01';
  C.settle(state.conduct, '2027-03-05');
  assert.strictEqual(state.conduct.stage, 0);
  assert.strictEqual(C.relationOf(state, '2027-03-05').club, 'good', 'plus de deux mois après');
  assert.strictEqual(C.relationOf(state, '2027-01-20').club, 'tense');
});

test('sanction dans le jeu : les jours d’indisponibilité de sa fiche, une vraie blessure plus longue reste', () => {
  const save = Buffer.alloc(OFFSET + 64);
  const PLAYER_REC = OFFSET - 328 + 48;
  save.writeUInt32LE(159475, PLAYER_REC);
  const r = unavailableInData(save, { playerId: 159475, days: 3 });
  assert.strictEqual(r.data[OFFSET], 3);
  assert.strictEqual(save[OFFSET], 0, 'la sauvegarde d’origine n’est pas touchée');
  save[OFFSET] = 20;
  assert.strictEqual(unavailableInData(save, { playerId: 159475, days: 3 }).data[OFFSET], 20);
  assert.throws(() => unavailableInData(save, { playerId: 1, days: 3 }), /pas la sauvegarde de ton joueur/);
});

test('sanction appliquée : ses jours d’indisponibilité ne sont pas une blessure', () => {
  const state = { conduct: { pending: { applied: { on: '2027-01-12', days: 3 } }, history: [] } };
  assert.ok(C.sanctionActive(state, '2027-01-13'));
  assert.ok(!C.sanctionActive(state, '2027-01-20'));
  state.conduct.history = [{ applied: { on: '2027-01-12', days: 3 } }];
  state.conduct.pending = null;
  assert.ok(C.endedRecently(state, '2027-01-16'), 'le retour juste après n’est pas un retour de blessure');
});

test('consignes : ses mots jugés dans les quatre requêtes qui partent déjà, et ce que l’édition en raconte', () => {
  const s = { language: 'fr' };
  for (const k of ['repliesSystem', 'threadSystem', 'huddleSystem', 'pressWriteupSystem']) {
    const t = prompts[k](s);
    assert.ok(t.includes('CONDUCT: also judge') && t.includes('"conduct": {"level"'), k);
  }
  const ed = prompts.editionSystem(s, { huddle: true });
  assert.ok(ed.includes('DISCIPLINE: CHANGES.conduct') && ed.includes('never write that email again'));
});
