'use strict';
// Places des tables d'une sauvegarde Become a Legend : celles du jeu sans modules, et la détection par la forme pour
// une sauvegarde agrandie par des modules Lua (FL Mod Studio, GigaPack…), où chaque section se décale.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { saveLayout, detectLayout, assertStandard, standardFits, STANDARD } = require(path.join(ROOT, 'src/save/layout.js'));
const FIXTURES = process.env.LIFELEGEND_FIXTURES || path.join(__dirname, 'fixtures');
const SAVE = path.join(FIXTURES, 'BL00000000'), KEY = path.join(FIXTURES, 'key.bin');

const date = (d, o, y, m, day) => { d.writeUInt16LE(y, o); d[o + 2] = m; d[o + 3] = day; };

// Une sauvegarde agrandie en miniature : chaque table ailleurs que dans le jeu sans modules, des jours de calendrier
// plus longs (remplis de 0xFF après leurs événements, et du 0xFF juste avant le 1er janvier, comme dans le vrai cas).
const AT = { coach: 0x20000, comp: 0x40002, player: 0x60000, careerStart: 0x61000, match: 0x80000, calendar: 0x100000, calendarDay: 0x6C4 };
function moddedSave() {
  const d = Buffer.alloc(0x200000);
  for (let k = 0; k < 50; k++) d.writeUInt32LE(k, AT.coach + k * 0x258 - 8);
  for (let k = 0; k < 35; k++) { d.writeUInt16LE(k + 1, AT.comp + k * 0x314 - 2); d.write(`Liga ${k + 1}\0`, AT.comp + k * 0x314); }
  d.writeUInt32LE(151506, AT.player); d.write('Iker Bravo\0', AT.player + 8);
  date(d, AT.careerStart + 4, 2026, 8, 21); d.writeUInt32LE(151506, AT.careerStart + 0x1C);
  // 60 matchs, 5 places vides, puis 3 matchs encore : la table continue après le trou.
  for (let k = 0; k < 68; k++) if (k < 60 || k >= 65) date(d, AT.match + k * 0x254, 2026, 8 + (k % 2), 1 + (k % 28));
  d.fill(0xFF, AT.calendar - 0x600, AT.calendar);
  for (let k = 0; k < 365; k++) {
    const o = AT.calendar + k * AT.calendarDay;
    d.fill(0xFF, o, o + AT.calendarDay);
    d.writeUInt32LE(0, o + 4);
  }
  // Ouvertures et fermetures du mercato : 1er janvier, 1er juillet, 1er septembre.
  for (const [type, dy, m] of [[6, 0, 1], [3, 181, 7], [4, 243, 9]]) {
    const e = AT.calendar + dy * AT.calendarDay + 8;
    d.writeUInt16LE(type, e); d.writeUInt16LE(0, e + 2); date(d, e + 4, 2026, m, 1);
    d.writeUInt16LE(0x3F, e + 8);
  }
  return d;
}

test('sauvegarde agrandie : chaque table retrouvée par sa forme', () => {
  const d = moddedSave();
  assert.strictEqual(standardFits(d, 'Iker Bravo'), false);
  const L = saveLayout(d, { playerName: 'Iker Bravo' });
  assert.deepStrictEqual(L, { standard: false, ...AT, matchCount: 68 });
});

// Un joueur créé peut porter l'id 0x80000000 (bit haut + numéro), celui de ses feuilles de match et de son début de
// carrière (2026-11-16, sauvegarde d'un joueur d'Evoweb : « fiche introuvable » en 1.1.0).
test('sauvegarde agrandie : joueur créé à l’id au bit haut', () => {
  const d = moddedSave();
  d.writeUInt32LE(0x80000000, AT.player); d.writeUInt32LE(41126, AT.player + 4);
  d.writeUInt32LE(0x80000000, AT.careerStart + 0x1C);
  assert.deepStrictEqual(saveLayout(d, { playerName: 'Iker Bravo' }), { standard: false, ...AT, matchCount: 68 });
});

test('sauvegarde agrandie : pas d’écriture, et un message clair si la fiche du joueur manque', () => {
  const d = moddedSave();
  assert.throws(() => assertStandard(d), (e) => e.code === 'SAVE_LAYOUT' && /n’y écrit pas/.test(e.message));
  assert.throws(() => saveLayout(d, { playerName: 'Quelqu’un d’autre' }), (e) => e.code === 'SAVE_LAYOUT');
});

test('sauvegarde du jeu sans modules : places connues, et la détection retombe dessus', { skip: !(fs.existsSync(SAVE) && fs.existsSync(KEY)) && 'fichiers de référence absents' }, () => {
  const { setSaveKeys, decryptSave } = require(path.join(ROOT, 'src/save/pesCrypt.js'));
  const { peekSave } = require(path.join(ROOT, 'src/save/blReader.js'));
  setSaveKeys([fs.readFileSync(KEY)]);
  const d = decryptSave(fs.readFileSync(SAVE)).data;
  const name = peekSave(SAVE).player;
  assert.strictEqual(saveLayout(d, { playerName: name }).standard, true);
  assert.doesNotThrow(() => assertStandard(d, name));
  const { matchCount, standard, ...found } = detectLayout(d, name);
  const { matchCount: total, ...known } = STANDARD;
  assert.deepStrictEqual(found, known);
  assert.ok(matchCount > 0 && matchCount <= total);
});
