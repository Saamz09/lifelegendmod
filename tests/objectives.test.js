'use strict';
// Objectifs personnels fixés par l'entraîneur (sa demande du 2026-11-10) : réalistes, d'après ses stats, son poste et
// le calendrier ; suivis dans la sauvegarde ; bilan à la fin du championnat ou après les matchs du retour de blessure.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { objectivesAtSync, objectivesFacts, seasonGoals } = require(path.join(__dirname, '..', 'src/world/objectives.js'));

let n = 0;
const newId = () => `o${++n}`;
const LEAGUE = 'Ligue 2 BKT';
// 34 journées : les `played` premières jouées, avec lui sur `withHim` d'entre elles (un but un match sur deux, note 6,5).
function season({ played = 17, withHim = 15, pos = 'AC', date = '2027-01-14' } = {}) {
  const fixtures = Array.from({ length: 34 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 19) + i * 7 * 864e5).toISOString().slice(0, 10); // la 18e journée le 16 janvier
    const done = i < played;
    return { id: `m${i}`, date: d, competition: LEAGUE, venue: 'domicile', played: done, score: done ? [2, i % 3 === 0 ? 0 : 1] : null,
      me: done && i < withHim ? { minutes: 90, starter: true, goals: i % 2, assists: 0, rating: 6.5 } : null };
  });
  return { gameDate: date, season: '2026-2027', club: { name: 'AS Nancy Lorraine', ref: 8, coach: 'Oswald Tanchot' }, league: { name: LEAGUE },
    player: { profile: { position: pos } }, fixtures, leagueComplete: played === 34 };
}

test('objectifs : en cours de saison, le coach en fixe trois pour la fin, à sa portée', () => {
  const state = {};
  const s = season();
  const r = objectivesAtSync(state, s, { firstSync: false }, { newId });
  assert.strictEqual(r.mails.length, 1);
  assert.strictEqual(r.mails[0].from, 'Oswald Tanchot');
  assert.match(r.mails[0].subject, /fin de saison/);
  const [apps, goals, rating] = state.objectives.season.items;
  assert.strictEqual(state.objectives.season.kind, 'second_half');
  assert.ok(apps.kind === 'apps' && apps.target >= 10 && apps.target <= 15, `matchs : ${apps.target} sur 17`);
  assert.ok(goals.kind === 'goals' && goals.target >= 4 && goals.target <= 9, `buts : ${goals.target}`);
  assert.ok(rating.kind === 'rating' && rating.target === 6.5, `note : ${rating.target}`);
  assert.ok(apps.label.includes(String(apps.target)), 'le libellé est gardé');
  // Pas deux fois.
  assert.strictEqual(objectivesAtSync(state, s, { firstSync: false }, { newId }).mails.length, 0);
});

test('objectifs : un défenseur vise des matchs sans encaisser, un milieu des buts et des passes', () => {
  assert.strictEqual(seasonGoals({ player: { profile: { position: 'DC' } } }, { left: 17, base: { matches: 17, apps: 15, goals: 0, ga: 0, clean: 5, rating: 6.2 } })[1].kind, 'clean');
  assert.strictEqual(seasonGoals({ player: { profile: { position: 'MC' } } }, { left: 17, base: { matches: 17, apps: 15, goals: 1, ga: 4, clean: 0, rating: 6.2 } })[1].kind, 'ga');
});

test('objectifs : suivis à chaque synchro, bilan à la fin du championnat ; tenus, ils apaisent la relation', () => {
  const state = { conduct: { stage: 1 } };
  objectivesAtSync(state, season(), { firstSync: false }, { newId });
  const set = state.objectives.season;
  // Il joue tout, marque un match sur deux, note 6,5 : tout est tenu à la fin.
  const end = season({ played: 34, withHim: 34, date: '2027-05-20' });
  const r = objectivesAtSync(state, end, { firstSync: false, seasonComplete: true }, { newId });
  assert.strictEqual(r.mails.length, 1);
  assert.match(r.mails[0].messages[0].body, /✓/);
  assert.strictEqual(r.news.review[0].verdict, 'all');
  assert.strictEqual(state.objectives.season, null);
  assert.strictEqual(state.objectives.history.at(-1).id, set.id);
  assert.strictEqual(state.conduct.stage, 0, 'un palier disciplinaire de moins');
});

test('objectifs : au retour de blessure, ses quatre prochains matchs ; un transfert annule le reste', () => {
  const state = {};
  const s = season();
  objectivesAtSync(state, s, { firstSync: false }, { newId, returning: true });
  assert.strictEqual(state.objectives.comeback.window, 4);
  assert.match(state.objectives.comeback.items[0].label, /de tes 4 prochains matchs/);
  assert.ok(objectivesFacts(state, s).some((x) => /comeback/.test(x.kind)));
  const moved = { ...season(), club: { name: 'FC Metz', ref: 9, coach: 'X' } };
  objectivesAtSync(state, moved, { firstSync: false }, { newId });
  assert.strictEqual(state.objectives.comeback, null);
  assert.ok(state.objectives.history.some((h) => h.status === 'void'));
});
