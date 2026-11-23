'use strict';
// Relation avec le club (sa demande du 2026-11-10) : ses écarts envers son coach, ses coéquipiers ou son club, en
// conférence de presse, sur Kop et dans Huddle, mènent par paliers à un rappel à l'ordre puis à une mise à l'écart d'un
// match, puis de deux, écrite dans le jeu (une suspension, comme après un carton rouge). Le temps apaise.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'src/world/conduct.js'));
const { suspensionInData, suspensionOf, SUSPENSION } = require(path.join(ROOT, 'src/save/conductWrite.js'));
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

test('relation : la mise à l’écart est écrite dans le jeu (depuis le 2026-11-23) ; sanction en pause : l’ambiance se tend, sans mail', () => {
  assert.strictEqual(C.SANCTIONS_IN_GAME, true);
  const on = {};
  insult(on, '2027-01-10');
  C.conductAtSync(on, snap('2027-01-11'), { newId });
  insult(on, '2027-01-12', 'press');
  assert.strictEqual(C.conductAtSync(on, snap('2027-01-12'), { newId }).change.kind, 'left_out', 'réglage par défaut');
  const state = {};
  insult(state, '2027-01-10');
  assert.strictEqual(C.conductAtSync(state, snap('2027-01-11'), { newId, sanctions: false }).change.kind, 'warning');
  insult(state, '2027-01-12', 'press');
  const r = C.conductAtSync(state, snap('2027-01-12'), { newId, sanctions: false });
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

// Valeurs relevées le 2026-11-23 dans sa sauvegarde GigaPack (Accrington) : 0x0340 sans suspension, 0x9b41 après un
// vrai carton rouge (3 matchs), 0x9341 un match plus tard.
test('sanction dans le jeu : la suspension de sa fiche (+0xCE), comme après un carton rouge', () => {
  const at = 0x100;
  const save = Buffer.alloc(at + 0x200);
  save.writeUInt32LE(159475, at);
  save.writeUInt16LE(0x0340, at + SUSPENSION);
  const r = suspensionInData(save, { playerId: 159475, matches: 2, at });
  assert.strictEqual(r.data.readUInt16LE(at + SUSPENSION), 0x9340, 'bits 11-13 = 2, bit 15 allumé, le reste gardé');
  assert.deepStrictEqual([r.before, r.after], [0, 2]);
  assert.strictEqual(save.readUInt16LE(at + SUSPENSION), 0x0340, 'la sauvegarde d’origine n’est pas touchée');
  const diff = []; for (let i = 0; i < save.length; i++) if (save[i] !== r.data[i]) diff.push(i);
  assert.deepStrictEqual(diff, [at + SUSPENSION + 1], 'un seul octet change');
  assert.strictEqual(suspensionInData(save, { playerId: 159475, matches: 1, at }).after, 1);
  assert.strictEqual(suspensionInData(save, { playerId: 159475, matches: 99, at }).after, 7, '3 bits : 7 matchs au plus');
});

test('sanction dans le jeu : une suspension plus longue (vrai carton rouge) reste, et seulement dans sa fiche', () => {
  const at = 0x100;
  const save = Buffer.alloc(at + 0x200);
  save.writeUInt32LE(159475, at);
  save.writeUInt16LE(0x9b41, at + SUSPENSION);
  assert.strictEqual(suspensionOf(0x9b41), 3);
  assert.strictEqual(suspensionOf(0x9341), 2);
  assert.strictEqual(suspensionOf(0x1b41), 0, 'drapeau éteint : pas suspendu');
  const r = suspensionInData(save, { playerId: 159475, matches: 1, at });
  assert.strictEqual(r.data.readUInt16LE(at + SUSPENSION), 0x9b41);
  assert.deepStrictEqual([r.before, r.after], [3, 3]);
  assert.strictEqual(suspensionInData(save, { playerId: 159475, matches: 5, at }).data.readUInt16LE(at + SUSPENSION), 0xab41);
  assert.throws(() => suspensionInData(save, { playerId: 1, matches: 1, at }), /pas la sauvegarde de ton joueur/);
  assert.throws(() => suspensionInData(save, { playerId: 159475, matches: 1, at: null }), /pas la sauvegarde de ton joueur/, 'fiche introuvable');
});

test('sanction appliquée : les jours d’indisponibilité d’une ancienne sanction ne sont pas une blessure ; une suspension n’y touche pas', () => {
  const state = { conduct: { pending: { applied: { on: '2027-01-12', days: 3 } }, history: [] } };
  assert.ok(C.sanctionActive(state, '2027-01-13'));
  assert.ok(!C.sanctionActive(state, '2027-01-20'));
  state.conduct.history = [{ applied: { on: '2027-01-12', days: 3 } }];
  state.conduct.pending = null;
  assert.ok(C.endedRecently(state, '2027-01-16'), 'le retour juste après n’est pas un retour de blessure');
  const now = { conduct: { pending: { applied: { on: '2027-01-12', matches: 2 } }, history: [{ applied: { on: '2027-01-01', matches: 1 } }] } };
  assert.ok(!C.sanctionActive(now, '2027-01-13'), 'une vraie blessure pendant la suspension reste une blessure');
  assert.ok(!C.endedRecently(now, '2027-01-03'));
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
