'use strict';
// La date du jeu (2026-11-16, PES 2021 sur Evoweb : « Sync failed: Invalid time value » à la première édition).
// L'en-tête de la sauvegarde écrit la date dans le format de la langue du jeu ; LifeLegend lisait toujours jour/mois et
// fabriquait une date impossible. Et sans date lisible ni match joué, la synchro n'avait plus de « jour du jeu ».
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { headerDates } = require(path.join(__dirname, '..', 'src/save/blReader.js'));
const { gameDay } = require(path.join(__dirname, '..', 'src/world/snapshot.js'));

test('date de l’en-tête : jour/mois, mois/jour, année d’abord', () => {
  assert.deepStrictEqual(headerDates('23/11/2021'), ['2021-11-23']);
  assert.deepStrictEqual(headerDates('11/23/2021'), ['2021-11-23'], 'anglais américain');
  assert.deepStrictEqual(headerDates('2021/11/23'), ['2021-11-23'], 'année d’abord');
  assert.deepStrictEqual(headerDates('2021-11-23'), ['2021-11-23']);
  assert.deepStrictEqual(headerDates('23.11.21'), ['2021-11-23'], 'année sur deux chiffres');
  assert.deepStrictEqual(headerDates('05/11/2021'), ['2021-11-05', '2021-05-11'], 'les deux lectures : readCareer tranche');
  assert.deepStrictEqual(headerDates('31/02/2021'), [], 'une date impossible n’est jamais rendue');
  assert.deepStrictEqual(headerDates(''), []);
});

test('jour du jeu : l’en-tête, sinon le dernier match, le début de carrière, ou la veille du premier match', () => {
  const matches = [{ date: '2021-08-14' }, { date: '2021-08-21' }];
  assert.strictEqual(gameDay({ save: { date: '2021-09-02' }, player: {}, matches }, [{ date: '2021-08-28' }]), '2021-09-02');
  assert.strictEqual(gameDay({ save: {}, player: {}, matches }, [{ date: '2021-08-28' }]), '2021-08-28');
  assert.strictEqual(gameDay({ save: { date: '2021-23-11' }, player: { careerStart: '2021-07-01' }, matches }, []), '2021-07-01', 'une date impossible est ignorée');
  assert.strictEqual(gameDay({ save: {}, player: {}, matches }, []), '2021-08-13', 'carrière toute neuve sans date');
  assert.strictEqual(gameDay({ save: {}, player: {}, matches: [] }, []), null);
});
