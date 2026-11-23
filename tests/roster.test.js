'use strict';
// Effectifs lus dans la table des équipes : paires [numéro interne][id du joueur] à +0x19C. Dans une sauvegarde du
// GigaPack, le numéro interne vaut 0xFFFF pour tous les joueurs (seul le joueur créé en a un) : la liste s'arrête à la
// première place sans id, pas au premier 0xFFFF (2026-11-23 : Accrington Stanley lu avec 0 joueur au lieu de 28).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { readTeams } = require(path.join(__dirname, '..', 'src/save/blReader.js'));

const STRIDE = 0x690, ROSTER = 0x19C;
// Une table d'une équipe (puis une place vide qui la termine), avec ces paires [numéro interne, id].
function save(pairs) {
  const d = Buffer.alloc(STRIDE * 2 + 0x100);
  d.writeUInt32LE(123 << 14 | 7, 0x50);
  d.write('Accrington Stanley', 0x54, 'utf8');
  pairs.forEach(([slot, id], r) => { d.writeUInt32LE(slot, ROSTER + 8 * r); d.writeUInt32LE(id >>> 0, ROSTER + 8 * r + 4); });
  return d;
}
const roster = (pairs) => [...readTeams(save(pairs), { coach: null }).values()][0].roster;

test('effectif d’une sauvegarde normale : jusqu’à la première place vide', () => {
  assert.deepStrictEqual(roster([[5, 83001], [6, 83003], [0xFFFF, 0], [9, 83004]]), [83001, 83003]);
});

test('effectif du GigaPack : numéros internes à 0xFFFF, joueur créé à l’id au bit haut', () => {
  assert.deepStrictEqual(roster([[0xFFFF, 148024], [0xFFFF, 83001], [0, 0x800000BA], [0xFFFF, 0]]), [148024, 83001, 0x800000BA]);
});
