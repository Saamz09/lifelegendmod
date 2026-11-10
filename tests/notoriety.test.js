'use strict';
// Notoriété (src/world/notoriety.js) : l'image dans la presse sur 100 calculée sans IA, et un point par jour de jeu.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { pressShare, mediaScore, recordNotoriety } = require(path.join(__dirname, '..', 'src/world/notoriety.js'));

const played = (me) => ({ played: true, me: { minutes: 90, starter: true, goals: 0, assists: 0, rating: 6, ...me } });

test('image dans la presse : la place que les journaux lui donnent, sur les 3 dernières éditions', () => {
  const snap = { player: { name: 'Ilan Morel' }, fixtures: [] };
  const art = (headline, body = '') => ({ headline, dek: '', body });
  const edition = (...national) => ({ national, local: [] });
  assert.strictEqual(pressShare(snap, []), null, 'pas encore de presse');
  assert.strictEqual(mediaScore(snap, null, []), 50, 'pas encore de presse : neutre');
  assert.strictEqual(pressShare(snap, [edition(art('Morel décisif'), art('Le titre', 'Avec MOREL en pointe.'), art('Reims gagne'), art('Le Morelen', 'Mot qui le contient seulement.'))]), 3 / 8, 'titre 2, texte 1, autre 0, mot plus long 0');
  const about = edition(art('Morel décisif'));
  const other = edition(art('Reims gagne'));
  assert.strictEqual(pressShare(snap, [about, other, other, other]), 0, 'seules comptent les 3 dernières');
  assert.ok(mediaScore(snap, null, [about]) > mediaScore(snap, null, [other]), 'plus de place, meilleure image');
  assert.strictEqual(mediaScore(snap, null, [about]), 68, 'tous les articles : +18');
  assert.strictEqual(mediaScore(snap, null, [other]), 44, 'aucun article : -6');
  const state = { profile: { followers: 1 }, editions: [about] };
  assert.strictEqual(recordNotoriety(state, { ...snap, gameDate: '2026-10-24' }).score, 68, 'le point du jour lit les éditions de la carrière');
});

test('image dans la presse : forme, buts et passes, titularisations, humeur des supporters quand elle le vise', () => {
  assert.strictEqual(mediaScore({ fixtures: [] }), 50, 'sans match : neutre');
  const good = { fixtures: [played({ rating: 7.5, goals: 1 }), played({ rating: 7, assists: 1 }), { played: false }] };
  assert.strictEqual(mediaScore(good), Math.round(50 + (7.25 - 6) * 15 + 8 + 4));
  assert.strictEqual(mediaScore(good, { level: 2, target: 'player' }), Math.round(50 + (7.25 - 6) * 15 + 8 + 4 - 16));
  assert.strictEqual(mediaScore(good, { level: 3, target: 'team' }), mediaScore(good), 'l’équipe visée, pas lui');
  assert.strictEqual(mediaScore({ fixtures: Array.from({ length: 5 }, () => played({ rating: 9, goals: 3 })) }), 100, 'plafonnée à 100');
});

test('un point par jour de jeu, remplacé si on resynchronise le même jour', () => {
  const state = { profile: { followers: 1200 } };
  recordNotoriety(state, { gameDate: '2026-08-22', fixtures: [], player: { profile: { marketValue: 800000 } } });
  state.profile.followers = 1500;
  recordNotoriety(state, { gameDate: '2026-08-22', fixtures: [], player: { profile: {} } });
  recordNotoriety(state, { gameDate: '2026-08-29', fixtures: [], player: { profile: {} } });
  assert.deepStrictEqual(state.notoriety, [
    { date: '2026-08-22', followers: 1500, value: null, score: 50 },
    { date: '2026-08-29', followers: 1500, value: null, score: 50 },
  ]);
});
