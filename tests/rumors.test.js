'use strict';
// Rumeurs mercato (src/world/rumors.js) : le niveau de fiabilité vient de la sauvegarde (offre en cours, club qui le suit
// vraiment, rien), pas deux fois le même club en 30 jours, confirmées s'il y signe, démenties quand le mercato ferme.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { pickRumor, rumorSlot, settleRumors, noteRumorPost } = require(path.join(__dirname, '..', 'src/world/rumors.js'));

const window = { kind: 'hiver', open: '2027-01-01', eve: '2027-01-30', close: '2027-01-31' };
const snap = (gameDate, player = {}) => ({
  gameDate, club: { ref: 1, name: 'AS Nancy Lorraine' }, windows: [window],
  table: [{ team: 'AS Nancy Lorraine', pos: 3, mine: true }, { team: 'AS Saint-Étienne', pos: 1 }, { team: 'Rodez AF', pos: 2 }],
  player: { offers: [], interests: [], ...player },
});

test('niveau de fiabilité d’après la sauvegarde : offre en cours, club qui le suit, sinon spéculation pendant le mercato', () => {
  const offer = { status: 'pending', club: 'FC Metz', clubRef: 9 };
  assert.deepStrictEqual(pickRumor({ state: {}, snapshot: snap('2026-10-24', { offers: [offer] }) }), { tier: 'reliable', club: 'FC Metz', source: 'offer' });
  const follows = { interests: [{ club: 'Stade de Reims', clubRef: 7 }] };
  assert.deepStrictEqual(pickRumor({ state: {}, snapshot: snap('2026-12-20', follows), rand: () => 0.9 }), { tier: 'serious', club: 'Stade de Reims', source: 'interest' }, 'mercato dans moins de 3 semaines');
  assert.strictEqual(pickRumor({ state: {}, snapshot: snap('2026-10-24', follows), rand: () => 0.9 }), null, 'loin du mercato, pas à chaque fois');
  assert.deepStrictEqual(pickRumor({ state: {}, snapshot: snap('2027-01-10'), rand: () => 0.1 }), { tier: 'unverified', club: 'AS Saint-Étienne', source: 'none' });
  assert.strictEqual(pickRumor({ state: {}, snapshot: snap('2026-10-24'), rand: () => 0.1 }), null, 'rien à dire hors mercato');
});

test('pas deux fois le même club en 30 jours ; créneau de Kop tenu par l’insider du niveau', () => {
  const offer = { status: 'pending', club: 'FC Metz', clubRef: 9 };
  const state = { rumors: [{ club: 'FC Metz', gameDate: '2026-10-10' }] };
  assert.strictEqual(pickRumor({ state, snapshot: snap('2026-10-24', { offers: [offer] }), rand: () => 0.9 }), null);
  assert.strictEqual(pickRumor({ state, snapshot: snap('2026-11-12', { offers: [offer] }) }).tier, 'reliable');
  const slot = rumorSlot({ tier: 'unverified', club: 'Rodez AF' });
  assert.deepStrictEqual([slot.handle, slot.type, slot.new], ['MercatoSecret', 'journalist', true]);
  assert.match(slot.angle, /pure speculation/);
  assert.strictEqual(rumorSlot({ tier: 'reliable', club: 'FC Metz' }, { known: true }).new, undefined);
});

test('confirmée s’il signe dans le club, démentie quand le mercato ferme sans ce transfert', () => {
  const state = { feed: [{ id: 'p1' }, { id: 'p2' }] };
  noteRumorPost(state, { tier: 'serious', club: 'Stade de Reims', source: 'interest' }, state.feed[0], '2027-01-05');
  noteRumorPost(state, { tier: 'unverified', club: 'Rodez AF', source: 'none' }, state.feed[1], '2027-01-12');
  assert.deepStrictEqual(state.feed[0].rumor, { tier: 'serious', club: 'Stade de Reims' });
  const signed = settleRumors(state, { changes: { transfer: { from: 'AS Nancy Lorraine', to: 'Stade de Reims' } }, gameDate: '2027-01-20' });
  assert.deepStrictEqual(signed, [{ insider: '@InsideFootball', club: 'Stade de Reims', tier: 'serious', outcome: 'confirmed' }]);
  assert.strictEqual(state.feed[0].rumor.outcome, 'confirmed');
  const closed = settleRumors(state, { changes: { window: { event: 'close', ...window } }, gameDate: '2027-02-01' });
  assert.deepStrictEqual(closed.map((r) => [r.club, r.outcome]), [['Rodez AF', 'denied']]);
  assert.strictEqual(state.feed[1].rumor.outcome, 'denied');
});
