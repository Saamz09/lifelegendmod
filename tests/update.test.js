'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compareVersions, releaseInfo, RELEASES } = require('../src/update.js');

test('versions : la plus récente, avec ou sans « v », et la bêta avant sa version', () => {
  assert.ok(compareVersions('1.1.2', '1.1.1') > 0);
  assert.ok(compareVersions('1.2.0', '1.1.9') > 0);
  assert.ok(compareVersions('2.0', '1.9.9') > 0);
  assert.ok(compareVersions('v1.10.0', '1.9.0') > 0);
  assert.strictEqual(compareVersions('v1.1.1', '1.1.1'), 0);
  assert.ok(compareVersions('1.1.0', '1.1.1') < 0);
  assert.ok(compareVersions('1.1.1', '1.1.1-beta') > 0);
  assert.ok(compareVersions('1.1.1-beta', '1.1.1') < 0);
});

test('release GitHub : nouvelle version, même version, numéro illisible, lien étranger', () => {
  const page = 'https://github.com/Saamz09/lifelegendmod/releases/tag/v1.1.2';
  assert.deepStrictEqual(releaseInfo({ tag_name: 'v1.1.2', html_url: page }, '1.1.1'), { current: '1.1.1', latest: '1.1.2', newer: true, url: page });
  assert.strictEqual(releaseInfo({ tag_name: 'v1.1.1', html_url: page }, '1.1.1').newer, false);
  assert.strictEqual(releaseInfo({ tag_name: 'v1.1.0', html_url: page }, '1.1.1').newer, false);
  const odd = releaseInfo({ tag_name: 'dernière', html_url: page }, '1.1.1');
  assert.strictEqual(odd.newer, false);
  assert.strictEqual(odd.latest, '');
  assert.strictEqual(releaseInfo({ tag_name: 'v9.0.0', html_url: 'https://exemple.com/piege' }, '1.1.1').url, RELEASES);
  assert.strictEqual(releaseInfo(null, '1.1.1').newer, false);
});
