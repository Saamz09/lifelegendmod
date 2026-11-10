'use strict';
// Logos des compétitions : les numéros que PES 2021 avait en faux logos ne sont écartés que dans PES 2021 tel quel.
// Football Life (son exécutable FL_xxxx.exe, ou Sider) porte les vrais logos dans ses archives.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isPatchedGame, ensureCompetitionLogos } = require('../src/save/emblems');

const gameDir = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-jeu-'));
  for (const f of ['Data', 'download']) fs.mkdirSync(path.join(dir, f));
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), body); }
  return dir;
};

test('logos : Football Life (exécutable ou Sider) est un jeu patché, PES 2021 tel quel non', () => {
  assert.equal(isPatchedGame(gameDir({ 'FL_2027.exe': '' })), true);
  assert.equal(isPatchedGame(gameDir({ 'SiderAddons/sider.ini': '' })), true);
  assert.equal(isPatchedGame(gameDir({ 'PES2021.exe': '' })), false);
  assert.equal(isPatchedGame(path.join(os.tmpdir(), 'll-dossier-absent')), false);
});

test('logos : sans archive lisible, aucun logo (et aucune erreur), patché ou non', () => {
  for (const files of [{ 'FL_2027.exe': '' }, { 'PES2021.exe': '' }]) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'll-logos-'));
    assert.deepEqual(ensureCompetitionLogos({ gameDir: gameDir(files), logos: [{ logo: 2, fakeOk: false }, { logo: 10, fakeOk: false }], fakeLogos: new Set([2]), outDir: out }), {});
  }
});
