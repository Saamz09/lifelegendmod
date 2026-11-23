'use strict';
// Style de jeu d'une équipe : les 7 consignes oui/non de chaque tactique, juste après ses 3 phases de formation
// (99 octets), une par octet, dans l'ordre de l'écran du jeu « Plan de jeu › Tactiques définies ».
// Vérifié en jeu le 16/11/2026 (Football Life 2027, Watford) : les octets 0, 2, 4 et 6 inversés dans les 5 tactiques
// du club ont changé exactement les lignes 1, 3, 5 et 7 de l'écran (Contre-attaque → Jeu de possession, Centre →
// Écarté, Pressing attaquants → Défense totale, Prudent → Agressif). Les mots des valeurs 1, 3 et 5 non vues à
// l'écran (Passe longue, Flexible, Centre) suivent les consignes de PES 2021.
// L'écran du jeu montre la 1re tactique de l'entraîneur (fiche de l'entraîneur +0x48), pas la tactique A du club.

const STYLE_AT = 99;
// [clé, nom de la consigne à l'écran, [valeur 0, valeur 1], noms anglais pour l'IA]
const STYLE = [
  ['attacking_style', 'Style offensif', ['Contre-attaque', 'Jeu de possession'], ['attacking style', ['counter attack', 'possession game']]],
  ['build_up', 'Construction', ['Passe longue', 'Passe courte'], ['build-up', ['long passes', 'short passes']]],
  ['attacking_area', 'Zone d’attaque', ['Écarté', 'Centre'], ['attacking area', ['wide', 'centre']]],
  ['positioning', 'Placement', ['Conserver la formation', 'Flexible'], ['positioning', ['maintain formation', 'flexible']]],
  ['defensive_style', 'Style défensif', ['Pressing attaquants', 'Défense totale'], ['defensive style', ['frontline pressure', 'all-out defence']]],
  ['containment_area', 'Zone de pressing', ['Centre', 'Écarté'], ['containment area', ['middle', 'wide']]],
  ['pressuring', 'Pressing constant', ['Agressif', 'Prudent'], ['pressuring', ['aggressive', 'conservative']]],
];

const validStyle = (v) => Array.isArray(v) && v.length === STYLE.length && v.every((x) => x === 0 || x === 1);

// Les 7 consignes d'une tactique commençant à `at`, ou null si ces octets ne sont pas des oui/non.
function readStyle(d, at) {
  const s = at + STYLE_AT;
  if (at < 0 || s + STYLE.length > d.length) return null;
  const v = [...d.subarray(s, s + STYLE.length)];
  return validStyle(v) ? v : null;
}

function writeStyle(d, at, values) {
  if (!validStyle(values)) throw new Error('Style de jeu illisible.');
  values.forEach((v, i) => { d[at + STYLE_AT + i] = v; });
}

// Pour l'IA : les consignes qui changent, en anglais (« attacking style: possession game (was counter attack) »).
function styleChangesEn(values, previous) {
  if (!validStyle(values)) return [];
  return STYLE.flatMap(([, , , [name, words]], i) => (previous && previous[i] === values[i] ? [] : [`${name}: ${words[values[i]]}${previous ? ` (was ${words[previous[i]]})` : ''}`]));
}
const styleEn = (values) => (validStyle(values) ? Object.fromEntries(STYLE.map(([key, , , [, words]], i) => [key, words[values[i]]])) : null);

module.exports = { STYLE, STYLE_AT, validStyle, readStyle, writeStyle, styleChangesEn, styleEn };
