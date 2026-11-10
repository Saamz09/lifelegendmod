'use strict';
// Clés de sauvegarde : un patch qui chiffre ses sauvegardes avec sa propre clé (Football Life 2027) n'est lu qu'avec la
// clé ajoutée par le joueur, et une sauvegarde réécrite garde la clé qui l'a ouverte. Les sauvegardes sont fabriquées
// ici avec une clé tirée au hasard : aucune vraie clé dans le dépôt. Une vraie carrière Football Life 2027 est lue si
// sa copie et sa clé sont dans les fichiers de référence (voir tests/README.md).

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { decryptSave, splitSave, joinSave, setSaveKeys } = require(path.join(ROOT, 'src/save/pesCrypt.js'));
const FIXTURES = process.env.LIFELEGEND_FIXTURES || path.join(__dirname, 'fixtures');
const SAVE = path.join(FIXTURES, 'BL00000000'), KEY = path.join(FIXTURES, 'key.bin');

// Une petite sauvegarde Become a Legend chiffrée avec `key` (la clé de PES 2021 sans clé).
function fakeSave(key, game = 'SP Football Life 2027') {
  const fh = Buffer.alloc(208);
  const parts = { desc: crypto.randomBytes(384), logo: crypto.randomBytes(100), data: crypto.randomBytes(4096), serial: crypto.randomBytes(46), tail: crypto.randomBytes(64), fh };
  fh.writeUInt32LE(parts.data.length, 64); fh.writeUInt32LE(parts.logo.length, 68); fh.writeUInt32LE(parts.desc.length, 72); fh.writeUInt32LE(parts.serial.length / 2, 76);
  fh.write('BL', 144, 'latin1'); fh.write(game, 176, 'latin1');
  return { file: key ? joinSave(parts, key) : joinSave(parts), data: parts.data };
}

test('une sauvegarde chiffrée avec une autre clé : refusée sans elle, lue avec elle', (t) => {
  t.after(() => setSaveKeys([]));
  const key = crypto.randomBytes(64);
  const { file, data } = fakeSave(key);
  setSaveKeys([]);
  assert.throws(() => decryptSave(file), /Football Life 2027 : ajoute sa clé dans Réglages › Sauvegarde/);
  assert.throws(() => decryptSave(file), (err) => err.code === 'SAVE_KEY', 'le code qui fait proposer l’ajout de la clé');
  setSaveKeys([crypto.randomBytes(64), key]);
  const r = decryptSave(file);
  assert.strictEqual(r.fileType, 'BL');
  assert.strictEqual(r.gameVersion, 'SP Football Life 2027');
  assert.ok(r.data.equals(data));
});

test('réécriture : la sauvegarde garde la clé qui l’a ouverte, à l’octet près', (t) => {
  t.after(() => setSaveKeys([]));
  const key = crypto.randomBytes(64);
  const { file } = fakeSave(key);
  setSaveKeys([key]);
  const parts = splitSave(file);
  assert.ok(parts.key.equals(key));
  assert.ok(joinSave(parts).equals(file));
});

test('les sauvegardes de PES 2021 restent lues, avec ou sans clés ajoutées ; une clé de la mauvaise taille est ignorée', (t) => {
  t.after(() => setSaveKeys([]));
  const { file, data } = fakeSave(null, 'eFootball PES 2021 SEASON UPDATE');
  setSaveKeys([Buffer.alloc(32), crypto.randomBytes(64)]);
  assert.ok(decryptSave(file).data.equals(data));
  assert.ok(joinSave(splitSave(file)).equals(file));
});

test('vraie carrière Football Life 2027 : lue avec sa clé', { skip: !(fs.existsSync(SAVE) && fs.existsSync(KEY)) && 'copie ou clé de Football Life 2027 absente' }, (t) => {
  t.after(() => setSaveKeys([]));
  setSaveKeys([fs.readFileSync(KEY)]);
  const { readCareer } = require(path.join(ROOT, 'src/save/blReader.js'));
  const c = readCareer(SAVE);
  assert.strictEqual(c.game, 'SP Football Life 2027');
  assert.ok(c.player.name && c.club.name, 'joueur et club lus');
  assert.ok(c.teams.size > 500 && c.matches.length > 1000, 'équipes et calendrier lus');
});
