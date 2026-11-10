'use strict';
// Équipes types du mois et de la saison (son choix, 2026-11-10) : les meilleures notes moyennes de chaque ligne, en
// 4-3-3, parmi les joueurs qui ont assez joué. Calculées par le code d'après les notes du jeu, sans IA.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { periodEleven } = require(path.join(__dirname, '..', 'src/world/awards.js'));

// Deux équipes de 12 joueurs : poste 0 gardien, 1-2 défenseurs, 3-6 milieux, 7-9 attaquants. Note du jeu = brut / 5.
const POS = [0, 1, 1, 2, 2, 3, 4, 5, 7, 8, 9, 9];
const lineup = (base, raw, minutes = 90) => POS.map((pos, k) => ({ playerId: base + k, pos, ratingRaw: raw(k), goals: 0, assists: 0, minutes }));
const match = (round, date, home, away) => ({ played: true, round, date, home: { ref: 1, name: 'A' }, away: { ref: 2, name: 'B' }, homeLineup: home, awayLineup: away });

test('équipe type d’une période : un gardien, quatre défenseurs, trois milieux, trois attaquants, les meilleures moyennes', () => {
  // L'équipe A est mieux notée (7) que B (6), sauf son 12e homme, un attaquant à 8 qui n'a joué qu'un match.
  const a = (rounds) => lineup(100, (k) => (k === 11 ? 40 : 35)).filter((p) => p.playerId !== 111 || rounds === 1);
  const b = () => lineup(200, () => 30);
  const ms = [match(0, '2026-12-05', a(1), b()), match(1, '2026-12-12', a(2), b()), match(2, '2026-12-19', a(3), b())];
  const xi = periodEleven(ms, { minApps: 2 });
  assert.strictEqual(xi.length, 11);
  assert.deepStrictEqual(['gk', 'def', 'mid', 'att'].map((l) => xi.filter((p) => p.line === l).length), [1, 4, 3, 3]);
  assert.ok(xi.every((p) => p.ref === 1 && p.avg === 7 && p.rated === 3), 'les joueurs de A, à 7 de moyenne sur trois matchs');
  assert.ok(!xi.some((p) => p.id === 111), 'un seul match : pas dans l’équipe type, même avec la meilleure note');
  // Sans seuil, il y entre ; et un joueur sans nom connu est écarté au profit du suivant.
  assert.ok(periodEleven(ms, { minApps: 1 }).some((p) => p.id === 111));
  const named = periodEleven(ms, { minApps: 2, keep: (p) => p.id !== 100 });
  assert.strictEqual(named.find((p) => p.line === 'gk').id, 200, 'le gardien de B remplace celui de A, écarté');
});

test('équipe type d’une période : une entrée en fin de match ne compte pas', () => {
  const ms = [0, 1].map((r) => match(r, `2026-12-0${r + 1}`, lineup(100, () => 35, 20), lineup(200, () => 30)));
  const xi = periodEleven(ms, { minApps: 2 });
  assert.ok(xi.length === 11 && xi.every((p) => p.ref === 2), 'seuls les joueurs qui ont joué 45 minutes sont notés');
});
