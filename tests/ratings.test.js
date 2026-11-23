'use strict';
// Notes des joueurs dans les feuilles de match : 7 bits en dixièmes (bits 7 à 13 du mot « packed »). Les mots viennent
// de sa feuille Accrington Stanley 0-1 Colchester United (10/08/2026, GigaPack, module fair_rating), relevée le
// 2026-11-23 : les 22 notes de l'écran de fin de match du jeu tombent juste. LifeLegend lisait 6 bits et montrait 6,0
// au lieu de 5,8.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { sheetEntry } = require(path.join(ROOT, 'src/save/blReader.js'));
const { ratingFromRaw } = require(path.join(ROOT, 'src/world/snapshot.js'));

const rating = (packed) => ratingFromRaw(sheetEntry(1, 0, packed).ratingRaw);

test('notes : 7 bits en dixièmes, comme l’écran de fin de match du jeu', () => {
  assert.strictEqual(rating(0x625d5a), 5.8, 'son joueur (LifeLegend montrait 6,0)');
  assert.strictEqual(rating(0x60255a), 7.4, 'le gardien, Louie Moulden');
  assert.strictEqual(rating(0x605eda), 6.1, 'Farrend Rawson : le bit 7 donne le dixième impair');
  assert.strictEqual(rating(0x6256da), 4.5, 'Kelsey Mooney');
  assert.strictEqual(rating(0x60645a), 7.2, 'Sean Raggett, homme du match');
});

test('feuille de match : les autres champs du même mot ne bougent pas', () => {
  assert.deepStrictEqual(sheetEntry(148024, 0x0201, 0x60255a), { playerId: 148024, starter: true, pos: 0, minutes: 90, ratingRaw: 74, goals: 1, assists: 2 });
  const sub = sheetEntry(83030, 0, 0x415919);
  assert.deepStrictEqual([sub.starter, sub.minutes, sub.ratingRaw], [false, 25, 50], 'entré en jeu, 25 minutes, 5,0');
});
