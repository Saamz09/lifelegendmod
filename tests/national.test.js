'use strict';
// Sélection nationale : première convocation (il n'avait pas de sélection), nouvelle liste annoncée par le compte de
// la sélection, rumeur avant un match de sa sélection quand il n'est pas dans le groupe.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { diffSnapshots } = require(path.join(ROOT, 'src/world/snapshot.js'));
const { clubPosts } = require(path.join(ROOT, 'src/world/clubPosts.js'));

const next = { id: 'nt1', home: 'Maroc', away: 'Sénégal', competition: 'Match amical international', date: '2026-11-14', played: false };
const nt = (inSquad, squad, extra = {}) => ({ ref: 524946, name: 'Maroc', inSquad, squad, fixtures: [next], next, ...extra });
const snap = (gameDate, nationalTeam) => ({
  gameDate, season: '2026-2027', club: { ref: 1, name: 'AS Nancy Lorraine' }, fixtures: [], table: [], windows: [],
  player: { name: 'Ilan Morel', offers: [], profile: null }, nationalTeam,
});
const SQUAD = ['Y. Bounou', 'A. Hakimi', 'N. Aguerd', 'S. Amrabat', 'B. Diaz'];

test('première convocation : il n’avait pas de sélection, la liste est annoncée avec lui', () => {
  const c = diffSnapshots(snap('2026-11-03', null), snap('2026-11-04', nt(true, SQUAD)));
  assert.deepStrictEqual([c.callUp.team, c.callUp.first], ['Maroc', true]);
  assert.deepStrictEqual([c.ntList.me, c.ntList.match, c.ntList.players], [true, 'Maroc - Sénégal', SQUAD]);
  const post = clubPosts({ snapshot: { ...snap('2026-11-04', null), stats: { total: {} } }, changes: { newResults: [], ...c }, handle: 'ilanmorel_off' }).find((p) => p.key.startsWith('nt|'));
  assert.match(post.text, /^📋 Maroc : la liste pour Maroc - Sénégal\n\nIlan Morel \(@ilanmorel_off\), Y\. Bounou/);
  assert.strictEqual(post.author.type, 'national');
});

test('nouvelle liste sans lui : annoncée, et pas de convocation ; une liste qui bouge peu n’est pas annoncée', () => {
  const c = diffSnapshots(snap('2026-11-03', nt(false, ['X1', 'X2', 'X3'])), snap('2026-11-04', nt(false, SQUAD)));
  assert.strictEqual(c.callUp, null);
  assert.strictEqual(c.ntList.me, false);
  const same = diffSnapshots(snap('2026-11-03', nt(false, SQUAD)), snap('2026-11-04', nt(false, [...SQUAD.slice(0, 4), 'Z1'])));
  assert.strictEqual(same.ntList, undefined, 'un seul nom change');
});

test('rumeur : sa sélection joue dans les 14 jours et il n’est pas dans le groupe', () => {
  assert.strictEqual(diffSnapshots(snap('2026-10-24', nt(false, SQUAD)), snap('2026-10-25', nt(false, SQUAD))).ntRumor, undefined, '20 jours avant : trop tôt');
  const c = diffSnapshots(snap('2026-11-03', nt(false, SQUAD)), snap('2026-11-04', nt(false, SQUAD)));
  assert.deepStrictEqual([c.ntRumor.team, c.ntRumor.fixture], ['Maroc', 'nt1']);
  assert.strictEqual(diffSnapshots(snap('2026-11-03', nt(true, SQUAD)), snap('2026-11-04', nt(true, SQUAD))).ntRumor, undefined, 'déjà dans le groupe');
});
