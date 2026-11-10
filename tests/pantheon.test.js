'use strict';
// Panthéon : un chapitre de la biographie n'est demandé à l'édition que pour un vrai événement de carrière (ses débuts
// sur la page, premier match ou premier but au club, transfert, prolongation, première sélection, trophée, palier, fin
// de saison).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { pantheonEvents, addChapter, chapterTitles, setBio } = require(path.join(__dirname, '..', 'src/world/pantheon.js'));

const season = (club, apps, goals) => ({ season: '2026-2027', club, stats: { apps, goals } });
const snapshot = { club: { name: 'AS Nancy Lorraine' }, season: '2026-2027' };
const quiet = { transfer: null, contractSigned: null };
const kinds = (events) => events.map((e) => e.kind);

test('biographie : le premier chapitre de la page, refait si le texte change', () => {
  const events = (state, changes = quiet) => pantheonEvents({ state, before: [], snapshot, changes });
  const bioEvent = { kind: 'origins', biography: true };
  const fresh = { seasons: {} };
  setBio(fresh, '  Né à Oujda.  ');
  assert.deepStrictEqual(fresh.bio, { text: 'Né à Oujda.', chapter: false });
  assert.deepStrictEqual(events(fresh), [bioEvent], 'page vierge');
  assert.deepStrictEqual(events({ ...fresh, pantheon: { chapters: [] } }, { ...quiet, contractSigned: { club: 'Nancy', until: '2029' } }).map((e) => e.kind), ['origins', 'contract_extension'], 'page vierge : les origines d’abord');

  // Une carrière déjà commencée : la biographie attend une édition sans autre événement, et passe en tête de la page.
  const old = { id: 'a', gameDate: '2026-08-22', title: 'Débuts à Nancy', text: 'Premier match.', events: ['first_match'] };
  const state = { seasons: {}, pantheon: { chapters: [old] } };
  setBio(state, 'Né à Oujda.');
  assert.deepStrictEqual(kinds(events(state, { ...quiet, transfer: { from: 'Nancy', to: 'Reims' } })), ['transfer'], 'pas ce coup-ci');
  assert.deepStrictEqual(events(state), [bioEvent]);
  addChapter(state, { title: 'Origines', text: 'Il naît à Oujda.' }, { gameDate: '2026-11-01', events: [bioEvent], id: 'b' });
  assert.deepStrictEqual(state.pantheon.chapters.map((c) => c.title), ['Origines', 'Débuts à Nancy']);
  assert.strictEqual(state.bio.chapter, true);
  assert.deepStrictEqual(events(state), [], 'écrit une fois');

  setBio(state, 'Né à Oujda.');
  assert.strictEqual(state.bio.chapter, true, 'même texte : rien à refaire');
  setBio(state, 'Né à Berkane.');
  assert.deepStrictEqual(events(state), [bioEvent], 'texte changé : chapitre à refaire');
  addChapter(state, { title: 'Origines (2)', text: 'Il naît à Berkane.' }, { gameDate: '2026-11-08', events: [bioEvent], id: 'c' });
  assert.deepStrictEqual(state.pantheon.chapters.map((c) => c.title), ['Origines (2)', 'Débuts à Nancy'], 'il remplace le précédent');

  setBio(state, '   ');
  assert.strictEqual(state.bio, null, 'texte vide : plus de biographie');
  assert.deepStrictEqual(events(state), []);
  assert.strictEqual(setBio({}, 'x'.repeat(5000)).bio.text.length, 3000, 'longueur limitée');
});

test('joueur créé ou réel : un joueur réel n’a pas de biographie', () => {
  const state = { seasons: {}, pantheon: { chapters: [{ id: 'a', title: 'Débuts', text: '…', events: [] }] } };
  setBio(state, 'Né à Oujda.', 'created');
  assert.strictEqual(state.playerKind, 'created');
  addChapter(state, { title: 'Origines', text: 'Il naît à Oujda.' }, { gameDate: '2026-11-01', events: [{ kind: 'origins', biography: true }], id: 'b' });
  assert.deepStrictEqual(state.pantheon.chapters.map((c) => c.title), ['Origines', 'Débuts']);

  // Il s'était trompé de case : la biographie et son chapitre disparaissent, le reste de la page ne bouge pas.
  setBio(state, 'Né à Oujda.', 'real');
  assert.deepStrictEqual([state.playerKind, state.bio], ['real', null]);
  assert.deepStrictEqual(state.pantheon.chapters.map((c) => c.title), ['Débuts']);
  setBio(state, 'Encore un texte.');
  assert.strictEqual(state.bio, null, 'joueur réel : le texte est ignoré');
  setBio(state, 'Né à Berkane.', 'created');
  assert.deepStrictEqual(state.bio, { text: 'Né à Berkane.', chapter: false }, 'corrigé : la biographie revient');

  const none = setBio({}, 'Un texte.');
  assert.deepStrictEqual([none.playerKind, none.bio.text], ['created', 'Un texte.'], 'sans case cochée : écrire une biographie, c’est un joueur créé');
  assert.strictEqual(setBio({}, '   ').playerKind, undefined, 'ni case ni texte : rien n’est deviné');
  assert.strictEqual(setBio({}, '', 'autre').playerKind, undefined, 'valeur inconnue ignorée');
});

test('première page : le chapitre de ses débuts', () => {
  const state = { seasons: { a: season('AS Nancy Lorraine', 0, 0) } };
  assert.deepStrictEqual(kinds(pantheonEvents({ state, before: [], snapshot, changes: quiet })), ['origins']);
});

test('premier match puis premier but au club, une seule fois chacun', () => {
  const state = { pantheon: { chapters: [{ title: 'Débuts' }] }, seasons: { a: season('AS Nancy Lorraine', 1, 0) } };
  assert.deepStrictEqual(kinds(pantheonEvents({ state, before: [season('AS Nancy Lorraine', 0, 0)], snapshot, changes: quiet })), ['first_match']);
  state.seasons.a = season('AS Nancy Lorraine', 2, 1);
  assert.deepStrictEqual(kinds(pantheonEvents({ state, before: [season('AS Nancy Lorraine', 1, 0)], snapshot, changes: quiet })), ['first_goal']);
  state.seasons.a = season('AS Nancy Lorraine', 3, 2);
  assert.deepStrictEqual(pantheonEvents({ state, before: [season('AS Nancy Lorraine', 2, 1)], snapshot, changes: quiet }), [], 'rien de neuf : pas de chapitre');
});

test('transfert, prolongation, trophée, palier et fin de saison', () => {
  const state = { pantheon: { chapters: [{ title: 'Débuts' }] }, seasons: { a: season('AS Nancy Lorraine', 30, 12) } };
  const before = [season('AS Nancy Lorraine', 29, 12)];
  const events = pantheonEvents({ state, before, snapshot, changes: { transfer: { from: 'Dijon FCO', to: 'AS Nancy Lorraine' }, contractSigned: { club: 'AS Nancy Lorraine', until: '2029-06-30' }, callUp: { team: 'Maroc', first: true } },
    seasonNews: { trophies: [{ competition: 'Ligue 2 BKT' }], milestones: ['50e match en carrière'] }, seasonReview: { final_table: { position: 1 } } });
  assert.deepStrictEqual(kinds(events), ['transfer', 'contract_extension', 'first_call_up', 'trophy', 'milestone', 'season_end']);
  assert.deepStrictEqual(events[0], { kind: 'transfer', from: 'Dijon FCO', to: 'AS Nancy Lorraine' });
});

test('chapitre : gardé s’il a un titre et un texte, titres rappelés à l’édition suivante', () => {
  const state = {};
  assert.strictEqual(addChapter(state, { title: ' ', text: 'x' }, { gameDate: '2026-08-22', events: [], id: 'a' }), null);
  const c = addChapter(state, { title: ' Débuts à Nancy (2026-2027) ', text: ' Premier match.' }, { gameDate: '2026-08-22', events: [{ kind: 'origins' }], id: 'b' });
  assert.deepStrictEqual(c, { id: 'b', gameDate: '2026-08-22', title: 'Débuts à Nancy (2026-2027)', text: 'Premier match.', events: ['origins'] });
  assert.deepStrictEqual(chapterTitles(state), [{ date: '2026-08-22', title: 'Débuts à Nancy (2026-2027)' }]);
});
