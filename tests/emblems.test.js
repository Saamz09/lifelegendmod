'use strict';
// Logos des compétitions : les numéros que PES 2021 avait en faux logos ne sont écartés que dans PES 2021 tel quel.
// Football Life (son exécutable FL_xxxx.exe, ou Sider) porte les vrais logos dans ses archives.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isPatchedGame, ensureCompetitionLogos, ensureEmblems } = require('../src/save/emblems');

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

// Packs en fichiers libres déclarés à Sider (le GigaPack de Matozanato met ses écussons et logos dans
// SiderAddons/livecpk/_FL26Megapack, 2026-11-23) : lus avant les archives, dans l'ordre de sider.ini.
const png = (tag) => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(tag)]);
const FLAG = 'common/render/symbol/flag', LC = 'common/render/symbol/emblemLc';
const withPacks = (extra = {}) => gameDir({
  'FL_2027.exe': '',
  'SiderAddons/sider.ini': 'cpk.root = ".\\livecpk\\Gros pack"\r\n;cpk.root = ".\\livecpk\\Coupé"\r\ncpk.root = ".\\livecpk\\Autre"\r\n',
  [`SiderAddons/livecpk/Gros pack/${FLAG}/e_072000_r.png`]: png('gros-72000'),
  [`SiderAddons/livecpk/Gros pack/${FLAG}/e_072000_r_l.png`]: png('gros-72000-grand'),
  [`SiderAddons/livecpk/Gros pack/${FLAG}/e_072000_r_ll.png`]: png('gros-72000-tres-grand'),
  [`SiderAddons/livecpk/Autre/${FLAG}/e_072000_r.png`]: png('autre-72000'),
  [`SiderAddons/livecpk/Autre/${FLAG}/e_072001_r.png`]: png('autre-72001'),
  [`SiderAddons/livecpk/Coupé/${FLAG}/e_072002_r.png`]: png('coupe-72002'),
  [`SiderAddons/livecpk/Gros pack/${LC}/emb_0130_l.png`]: png('gros-logo-130'),
  [`SiderAddons/livecpk/Gros pack/${LC}/emb_0130_w_l.png`]: png('gros-logo-130-blanc'),
  ...extra,
});
const club = (id) => ({ id, emblemSlot: null, fakeOk: false });

test('écussons : ceux des packs de Sider, le premier dossier de sider.ini l’emporte, un dossier désactivé est ignoré', () => {
  const dir = withPacks();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'll-ecussons-'));
  const got = ensureEmblems({ gameDir: dir, savePath: path.join(dir, 'BL00000000'), clubs: [club(72000), club(72001), club(72002), club(99999)], outDir: out });
  assert.deepEqual(got, { 72000: '72000.png', 72001: '72001.png' });
  assert.equal(fs.readFileSync(path.join(out, '72000.png')).subarray(8).toString(), 'gros-72000-grand');
  assert.equal(fs.readFileSync(path.join(out, '72001.png')).subarray(8).toString(), 'autre-72001');
});

test('écussons : un pack installé ou mis à jour après coup remplace l’image déjà extraite ; retiré, l’ancienne reste', () => {
  const dir = withPacks();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'll-ecussons-'));
  // Écusson extrait avant ce changement (sans trace de sa source) : relu une fois depuis le pack.
  fs.writeFileSync(path.join(out, '72001.png'), png('ancien'));
  const args = { gameDir: dir, savePath: path.join(dir, 'BL00000000'), clubs: [club(72001)], outDir: out };
  ensureEmblems(args);
  assert.equal(fs.readFileSync(path.join(out, '72001.png')).subarray(8).toString(), 'autre-72001');
  const source = path.join(dir, `SiderAddons/livecpk/Autre/${FLAG}/e_072001_r.png`);
  fs.writeFileSync(source, png('autre-72001-version-2'));
  ensureEmblems(args);
  assert.equal(fs.readFileSync(path.join(out, '72001.png')).subarray(8).toString(), 'autre-72001-version-2');
  fs.unlinkSync(source);
  assert.deepEqual(ensureEmblems(args), { 72001: '72001.png' });
});

test('logos des compétitions : ceux des packs de Sider aussi (jamais la version blanche)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'll-logos-'));
  assert.deepEqual(ensureCompetitionLogos({ gameDir: withPacks(), logos: [{ logo: 130, fakeOk: false }, { logo: 131, fakeOk: false }], fakeLogos: new Set(), outDir: out }), { 130: 'comp-130.png' });
  assert.equal(fs.readFileSync(path.join(out, 'comp-130.png')).subarray(8).toString(), 'gros-logo-130');
});
