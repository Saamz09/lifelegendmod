'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { decodeDds } = require('../src/save/dds');
const { prettyName } = require('../src/save/blReader');
const { faceIdsFor, coachIdsFor } = require('../src/world/playerFaces');
const { parseCoaches } = require('../src/save/faces');

// Un DDS de 4 x 4 pixels fait d'un seul bloc.
function dds(format, block) {
  const head = Buffer.alloc(128);
  head.write('DDS ', 0, 'latin1');
  head.writeUInt32LE(4, 12); head.writeUInt32LE(4, 16);
  head.writeUInt32LE(4, 80); head.write(format, 84, 'latin1');
  return Buffer.concat([head, block]);
}
const RED = 0xF800, BLUE = 0x001F;
const pixel = (d, n) => [...d.rgba.subarray(n * 4, n * 4 + 4)];

test('DXT5 : quatre couleurs et alpha interpolés', () => {
  const block = Buffer.alloc(16);
  block[0] = 255; block[1] = 0;
  // Indice d'alpha 1 (transparent) pour le dernier pixel : bits 45 à 47.
  block.writeUIntLE(2 ** 45, 2, 6);
  block.writeUInt16LE(RED, 8); block.writeUInt16LE(BLUE, 10);
  // Indices de couleur des pixels 0 à 3 : 0, 1, 2, 3.
  block.writeUInt32LE(0b11100100, 12);
  const d = decodeDds(dds('DXT5', block));
  assert.strictEqual(d.width, 4);
  assert.deepStrictEqual(pixel(d, 0), [255, 0, 0, 255]);
  assert.deepStrictEqual(pixel(d, 1), [0, 0, 255, 255]);
  assert.deepStrictEqual(pixel(d, 2), [170, 0, 85, 255]);
  assert.deepStrictEqual(pixel(d, 3), [85, 0, 170, 255]);
  assert.strictEqual(pixel(d, 15)[3], 0);
});

test('DXT5 : même quand les deux alphas sont dans l’autre ordre, 6 et 7 valent 0 et 255', () => {
  const block = Buffer.alloc(16);
  block[0] = 10; block[1] = 200;
  // Pixel 0 : indice 6 ; pixel 1 : indice 7.
  block.writeUIntLE(6 + 7 * 8, 2, 6);
  const d = decodeDds(dds('DXT5', block));
  assert.strictEqual(pixel(d, 0)[3], 0);
  assert.strictEqual(pixel(d, 1)[3], 255);
});

test('DXT1 : c0 <= c1 donne le mode à trois couleurs, avec un transparent', () => {
  const block = Buffer.alloc(8);
  block.writeUInt16LE(BLUE, 0); block.writeUInt16LE(RED, 2);
  block.writeUInt32LE(0b11, 4);
  const d = decodeDds(dds('DXT1', block));
  assert.strictEqual(pixel(d, 0)[3], 0);
  assert.deepStrictEqual(pixel(d, 1), [0, 0, 255, 255]);
});

test('DDS : un format inconnu, un fichier coupé ou autre chose ne donnent rien', () => {
  assert.strictEqual(decodeDds(dds('ATI2', Buffer.alloc(16))), null);
  assert.strictEqual(decodeDds(dds('DXT5', Buffer.alloc(8))), null);
  assert.strictEqual(decodeDds(Buffer.from('pas une image')), null);
  assert.strictEqual(decodeDds(null), null);
});

const names = new Map([[1, 'Ilan Morel'], [2, 'Logan Ndenbe'], [3, 'Mamadou Fofana'], [4, 'Mamadou Fofana']]);
const baseState = { snapshot: { player: { id: 1, name: 'Ilan Morel' } } };
const asked = ['Ilan Morel', 'Logan Ndenbe', 'Mamadou Fofana', 'Inconnu Total'];

test('Visages : un seul joueur de ce nom, le sien ; deux joueurs du même nom ou inconnu, personne', () => {
  assert.deepStrictEqual(faceIdsFor(baseState, names, asked), [['Ilan Morel', 1], ['Logan Ndenbe', 2]]);
});

test('Visages : la sauvegarde départage deux joueurs du même nom', () => {
  const state = { snapshot: { ...baseState.snapshot, playerIds: { 'Mamadou Fofana': 4 } } };
  assert.ok(faceIdsFor(state, names, asked).some(([n, id]) => n === 'Mamadou Fofana' && id === 4));
});

test('Visages : les noms sont comparés tels que LifeLegend les affiche', () => {
  assert.deepStrictEqual(faceIdsFor(baseState, new Map([[9, 'JEAN ESSAI']]), [prettyName('JEAN ESSAI')]), [[prettyName('JEAN ESSAI'), 9]]);
});

test('Visages : sans carrière, sans base ou sans demande, rien', () => {
  assert.deepStrictEqual(faceIdsFor(null, names, asked), []);
  assert.deepStrictEqual(faceIdsFor(baseState, null, asked), []);
  assert.deepStrictEqual(faceIdsFor(baseState, names, null), []);
});

const coachRecord = (id, name) => { const b = Buffer.alloc(100); b.writeUInt32LE(id, 0); b.writeUInt32LE(99999, 4); b.write(name, 8); b.write(name, 54); return b; };

test('Entraîneurs : la table du jeu donne le numéro et le nom, une autre forme ne donne rien', () => {
  assert.deepStrictEqual(parseCoaches(Buffer.concat([coachRecord(153, 'Oswald Tanchot'), coachRecord(100476, 'Olivier Frapolli')])), [{ id: 153, name: 'Oswald Tanchot' }, { id: 100476, name: 'Olivier Frapolli' }]);
  assert.deepStrictEqual(parseCoaches(Buffer.alloc(150)), []);
  assert.deepStrictEqual(parseCoaches(null), []);
});

test('Entraîneurs : un seul de ce nom, le sien ; deux du même nom ou inconnu, personne', () => {
  const coaches = [{ id: 1, name: 'Jean Essai' }, { id: 2, name: 'Paul Double' }, { id: 3, name: 'Paul Double' }, { id: 4, name: 'MARC MAJUSCULE' }];
  assert.deepStrictEqual(coachIdsFor(coaches, ['Jean Essai', 'Paul Double', 'Inconnu Total', 'Jean Essai']), [['Jean Essai', 1]]);
  assert.deepStrictEqual(coachIdsFor(coaches, [prettyName('MARC MAJUSCULE')]), [[prettyName('MARC MAJUSCULE'), 4]]);
  assert.deepStrictEqual(coachIdsFor(null, ['Jean Essai']), []);
  assert.deepStrictEqual(coachIdsFor(coaches, null), []);
});
