'use strict';
// Récompenses d'un championnat sur les notes du jeu (src/world/awards.js) : équipe type de la dernière journée finie,
// classement à la note moyenne, trophées de la saison finie, et ce que l'édition apprend une seule fois.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const A = require(path.join(__dirname, '..', 'src/world/awards.js'));

// Postes joués : gardien, 4 défenseurs, 3 milieux, 3 attaquants (voir blReader). Note brute 35 = 7,0 ; 30 = 6,0.
const POS = [0, 1, 1, 2, 2, 3, 4, 6, 8, 9, 9];
const lineup = (base, raw = () => 30, extra = {}) => POS.map((pos, k) => ({ playerId: base + k, pos, ratingRaw: raw(k), minutes: 90, goals: 0, assists: 0, ...(extra[k] || {}) }));
const match = (round, home, away, opts = {}) => ({
  round, date: `2026-09-${String(10 + round).padStart(2, '0')}`, played: opts.played !== false,
  home: { ref: home, name: `Club ${home}` }, away: { ref: away, name: `Club ${away}` },
  homeLineup: lineup(home * 100, opts.homeRaw, opts.homeExtra), awayLineup: lineup(away * 100, opts.awayRaw, opts.awayExtra),
});

test('équipe type : la dernière journée finie, en 4-3-3, sans les entrées en fin de match', () => {
  const ms = [
    match(0, 1, 2, { homeRaw: (k) => (k === 10 ? 40 : 30) }), match(0, 3, 4),
    match(1, 1, 3, { homeExtra: { 9: { minutes: 20, ratingRaw: 45 } } }), match(1, 2, 4, { played: false }),
  ];
  const t = A.teamOfRound(ms);
  assert.strictEqual(t.round, 1, 'la 2e journée n’est pas finie');
  assert.deepStrictEqual(['gk', 'def', 'mid', 'att'].map((l) => t.xi.filter((p) => p.line === l).length), [1, 4, 3, 3]);
  assert.deepStrictEqual([t.best.id, t.best.rating], [110, 8]);
  ms[3].played = true;
  const t2 = A.teamOfRound(ms);
  assert.strictEqual(t2.round, 2);
  assert.ok(!t2.xi.some((p) => p.id === 109), '20 minutes ne suffisent pas, même à 9,0');
});

test('classement : note moyenne des matchs d’au moins 45 minutes, buts de tous les matchs', () => {
  const ms = [match(0, 1, 2, { homeRaw: (k) => (k === 10 ? 40 : 30), homeExtra: { 10: { goals: 2 } } }), match(1, 1, 2, { homeRaw: (k) => (k === 10 ? 35 : 30) })];
  const r = A.playerRanking(ms, { minApps: 2 });
  assert.deepStrictEqual([r[0].id, r[0].avg, r[0].goals, r[0].line, r[0].rated], [110, 7.5, 2, 'att', 2]);
  assert.strictEqual(A.rankingMinApps(ms), 2);
});

test('trophées : seulement la saison finie ; meilleur joueur, buteur, passeur, gardien, équipe type', () => {
  const ms = [match(0, 1, 2, { homeRaw: (k) => (k === 10 ? 40 : k === 0 ? 36 : 30), homeExtra: { 9: { goals: 3 }, 7: { assists: 2 } } }), match(1, 2, 1, { played: false })];
  assert.strictEqual(A.seasonAwards(ms), null);
  ms[1].played = true;
  const s = A.seasonAwards(ms);
  assert.deepStrictEqual([s.bestPlayer.id, s.topScorer.id, s.topAssists.id, s.bestKeeper.id, s.xi.length], [110, 109, 107, 100, 11]);
});

test('édition : la journée annoncée une seule fois, retenue s’il est dans l’équipe type ; trophées de la saison une fois', () => {
  const state = {};
  const opts = { season: '2026-2027', competition: 'Ligue 2 BKT', playerId: 110, nameOf: (id) => `Joueur ${id}` };
  const ms = [match(0, 1, 2, { homeRaw: (k) => (k === 10 ? 40 : 30) }), match(1, 1, 2, { played: false })];
  const first = A.awardsNews(state, { ...opts, matches: ms });
  assert.deepStrictEqual(first.round, { competition: 'Ligue 2 BKT', round: 1, in_team: true, player_of_the_round: true, his_rating: 8 });
  assert.strictEqual(A.awardsNews(state, { ...opts, matches: ms }).round, null, 'déjà annoncée');
  ms[1].played = true;
  const end = A.awardsNews(state, { ...opts, matches: ms });
  assert.ok(end.season.won.includes('bestPlayer') && end.season.won.includes('xi'));
  assert.strictEqual(end.season.bestPlayer.name, 'Joueur 110');
  assert.strictEqual(A.awardsNews(state, { ...opts, matches: ms }).season, null, 'trophées déjà remis');
  assert.strictEqual(state.awards.rounds.length, 2);
});
