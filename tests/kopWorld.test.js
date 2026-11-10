'use strict';
// Kop et le football mondial (demande d'un testeur : « Mbappé plante un doublé en LdC ») : un résumé court dans la
// requête de l'édition, trois places dans le plan des posts, des supporters des clubs du monde qui ne deviennent jamais
// des supporters de son club.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { tribunePlan } = require(path.join(ROOT, 'src/world/tribunePlan.js'));
const { worldBrief } = require(path.join(ROOT, 'src/world/worldFootball.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));

const sunderlandFan = { handle: 'Rayan_Sunderland', name: 'Rayan | Sunderland AFC', type: 'fan' };
const state = () => ({
  careerId: 'essai', editions: [], clubPages: {},
  accounts: { Rayan_Sunderland: { name: sunderlandFan.name, type: 'fan', supports: 'Sunderland AFC' } },
  feed: [{ author: sunderlandFan, gameDate: '2026-11-20', text: 'Isidor !!', replies: [] }],
});
const snapshot = { gameDate: '2026-12-02', league: { name: 'Ligue 2 BKT' }, club: { name: 'AS Nancy Lorraine', coach: 'Oswald Tanchot' }, player: { history: {}, contractUntil: '2028-06-30' }, fixtures: [], next: null,
  table: [{ team: 'AS Nancy Lorraine', mine: true, pos: 9 }, { team: 'Pau FC', pos: 18 }] };
const world = {
  stories: [
    { competition: 'Premier League', teams: ['Sunderland AFC', 'Liverpool FC'], story: "Wilson Isidor's hat-trick for Sunderland AFC against Liverpool FC (Sunderland AFC 3-0 Liverpool FC, 2026-11-18)" },
    { competition: 'Serie A', teams: ['Bologna FC', 'Inter Milan'], story: "Jay Enem's hat-trick for Bologna FC against Inter Milan (Bologna FC 4-0 Inter Milan, 2026-11-18)" },
  ],
  take: 'the player of the month (FACTS.football_elsewhere.player_of_the_month): deserved or not? Take a side',
};
const elsewhere = (plan) => plan.filter((p) => /^football elsewhere/.test(p.angle));

test('Kop : trois posts sur le football mondial, par des supporters de ces clubs et une voix neutre', () => {
  const plan = tribunePlan({ state: state(), snapshot, changes: { newResults: [] }, handle: 'ilan', world });
  const w = elsewhere(plan);
  assert.strictEqual(w.length, 3);
  assert.deepStrictEqual([w[0].handle, w[0].supports], ['Rayan_Sunderland', 'Sunderland AFC'], 'le supporter de Sunderland revient quand son club fait l’actualité');
  assert.match(w[0].angle, /Isidor's hat-trick.*only FACTS\.football_elsewhere.*no goal order or minute/);
  assert.ok(w[1].new && w[1].supports === 'Inter Milan' && /a fan of Inter Milan/.test(w[1].angle), 'un nouveau supporter du club battu');
  assert.ok(!w[2].supports && /player of the month/.test(w[2].angle), 'une voix neutre sur le joueur du mois');
  // Il ne parle jamais au nom de son club : les places des supporters de Nancy vont à d'autres.
  const clubSlots = plan.filter((p) => !/^football elsewhere/.test(p.angle) && p.type === 'fan');
  assert.ok(clubSlots.length && clubSlots.every((p) => p.handle !== 'Rayan_Sunderland'));
  assert.ok(plan.every((p) => p.handle !== 'ilan'), 'personne n’écrit à sa place');
});

test('Kop : sans football mondial, rien ; le joueur du mois seul, une voix neutre', () => {
  assert.deepStrictEqual(elsewhere(tribunePlan({ state: state(), snapshot, changes: { newResults: [] }, handle: 'ilan' })), []);
  const only = elsewhere(tribunePlan({ state: state(), snapshot, changes: { newResults: [] }, handle: 'ilan', world: { stories: [], take: world.take } }));
  assert.strictEqual(only.length, 1);
  assert.ok(!only[0].supports);
});

test('Kop : le résumé court du football mondial et sa règle', () => {
  const digest = {
    since: '2026-11-21', until: '2026-12-02',
    competitions: [{ competition: 'Premier League', results: [{ date: '2026-11-18', home: 'Sunderland AFC', away: 'Liverpool FC', score: '3-0', scorers: ['Wilson Isidor (3)'], man_of_the_match: 'Granit Xhaka (Sunderland AFC)' }],
      table_top: [{ pos: 1, team: 'Arsenal FC', p: 13, pts: 32 }, { pos: 2, team: 'Manchester City', p: 13, pts: 29 }], top_scorers: [{ player: 'Erling Haaland', team: 'Manchester City', goals: 12 }] }],
    standouts: [{ player: 'Wilson Isidor', team: 'Sunderland AFC', goals: 3, assists: 0, match: 'Sunderland AFC 3-0 Liverpool FC', competition: 'Premier League', date: '2026-11-18' }],
    awards: { player_of_the_month: { month: '2026-11', overall: { player: 'Erling Haaland', team: 'Manchester City', apps: 6, goals: 9, avg: 6.5 } } },
  };
  assert.deepStrictEqual(worldBrief(digest), {
    since: '2026-11-21', until: '2026-12-02',
    competitions: [{ competition: 'Premier League', big_results: ['Sunderland AFC 3-0 Liverpool FC (2026-11-18; Wilson Isidor (3))'], top_of_table: ['1. Arsenal FC 32 pts (13 matches)', '2. Manchester City 29 pts (13 matches)'], top_scorer: 'Erling Haaland (Manchester City), 12 goals' }],
    standouts: ['Wilson Isidor (Sunderland AFC): 3 goal(s) in Sunderland AFC 3-0 Liverpool FC, Premier League, 2026-11-18'],
    player_of_the_month: 'Erling Haaland (Manchester City), 2026-11: 9 goals in 6 matches, average rating 6.5',
  });
  assert.strictEqual(worldBrief(null), null);
  const system = prompts.editionSystem({ language: 'fr' }, { transversale: true });
  assert.match(system, /36\. Football elsewhere: FACTS\.football_elsewhere/);
  assert.ok(!/covers ONLY the competitions his club plays/.test(system), 'La Transversale couvre aussi le football mondial');
});
