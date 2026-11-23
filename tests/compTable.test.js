'use strict';
// Table des compétitions : des places vides au milieu (21 dans une sauvegarde du GigaPack, 3 dans celle de Nancy,
// relevé le 2026-11-23). LifeLegend s'arrêtait à la première : tous ses matchs d'EFL League Two (fiche 328) restaient
// sans compétition, et « Mes matchs » de Scoreline était vide.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { readCompetitions } = require(path.join(ROOT, 'src/save/blReader.js'));

const STRIDE = 0x314, AT = 0x100;
function table(names) {
  const d = Buffer.alloc(AT + STRIDE * (names.length + 2));
  names.forEach((n, k) => {
    const o = AT + STRIDE * k;
    d.writeUInt16LE(k + 1, o - 2);
    if (n) d.write(`${n}\0`, o);
  });
  d.fill(0xFF, AT + STRIDE * names.length); // la fin de la table : ni un nom ni une place vide
  return d;
}

test('compétitions : les places vides sont sautées, la table s’arrête à la première fiche qui n’est ni un nom ni vide', () => {
  const d = table(['Premier League', '', '', 'EFL League Two', '', 'Qatar Stars League']);
  const comps = readCompetitions(d, { comp: AT });
  assert.deepStrictEqual([...comps], [[1, 'Premier League'], [4, 'EFL League Two'], [6, 'Qatar Stars League']]);
});

test('compétitions : table sans place vide (sauvegarde du jeu sans modules) et table introuvable', () => {
  assert.deepStrictEqual([...readCompetitions(table(['Ligue 1', 'Ligue 2']), { comp: AT })], [[1, 'Ligue 1'], [2, 'Ligue 2']]);
  assert.strictEqual(readCompetitions(table(['Ligue 1']), { comp: null }).size, 0);
});
