'use strict';
// L'agent : quand son point mercato est dû, et la réorientation d'offres (expérimentale) désactivée par défaut.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { reportDue, applyStance, extensionByStance } = require(path.join(ROOT, 'src/world/agent.js'));
const world = require(path.join(ROOT, 'src/world/world.js'));

const view = (o = {}) => ({ computedOn: '2021-02-10', windowOpen: false, offers: [], clubs: [{ team: 'Utrecht', trend: 'flat' }, { team: 'Augsburg', trend: 'flat' }], extension: 30, ...o });
const agent = (days, rep = {}) => ({ lastReportOn: new Date(Date.parse('2021-02-10') - days * 864e5).toISOString().slice(0, 10), reported: { clubs: [{ team: 'Utrecht' }, { team: 'Augsburg' }], extension: 30, windowOpen: false, offers: [], ...rep } });

test('point mercato de l’agent : rare, sauf vraie nouveauté', () => {
  assert.strictEqual(reportDue({ reported: null }, view()), true, 'premier rapport');
  assert.strictEqual(reportDue(agent(14), view()), false, '14 jours sans nouveauté');
  assert.strictEqual(reportDue(agent(41), view()), false, '41 jours sans nouveauté');
  assert.strictEqual(reportDue(agent(42), view()), true, '6 semaines');
  assert.strictEqual(reportDue(agent(5), view({ clubs: [{ team: 'Augsburg', trend: 'flat' }, { team: 'Utrecht', trend: 'flat' }] })), false, 'mêmes clubs dans un autre ordre');
  assert.strictEqual(reportDue(agent(5), view({ clubs: [{ team: 'Utrecht', trend: 'flat' }, { team: 'Genk', trend: 'new' }] })), true, 'nouveau club intéressé');
  assert.strictEqual(reportDue(agent(5), view({ offers: [{ club: 'Genk', salary: 50000, contractUntil: '2023-08-31' }] })), true, 'nouvelle offre');
  assert.strictEqual(reportDue(agent(5), view({ extension: 46 })), false, 'prolongation +16 points');
  assert.strictEqual(reportDue(agent(5), view({ extension: 52 })), true, 'prolongation +22 points');
  assert.strictEqual(reportDue(agent(5, { windowOpen: false }), view({ windowOpen: true })), true, 'ouverture du mercato');
});

test('réorientation d’offres : refusée tant qu’elle n’est pas activée, sans toucher à la carrière', () => {
  const store = { activeCareer: () => { throw new Error('la carrière ne doit pas être lue'); } };
  assert.throws(() => world.redirectOffer({ store, settings: {}, offerId: 1, toRef: 2 }), /désactivée/);
  assert.throws(() => world.redirectOffer({ store, settings: { offerRedirect: false }, offerId: 1, toRef: 2 }), /désactivée/);
});

test('prolongation : les chiffres par attitude sont ceux que donnerait chaque attitude', () => {
  const market = { extensionBase: 0.4962, following: [] };
  const by = extensionByStance(market);
  assert.deepStrictEqual(by, { stay: 62, open: 50, leave: 27 });
  for (const stance of ['stay', 'open', 'leave']) {
    const v = applyStance(market, stance, null);
    assert.strictEqual(v.extension, by[stance]);
    assert.deepStrictEqual(v.extensionByStance, by);
  }
});

test('prolongation : contrat encore long, pas de chiffre quelle que soit l’attitude', () => {
  const market = { extensionBase: null, following: [] };
  assert.deepStrictEqual(extensionByStance(market), { stay: null, open: null, leave: null });
  assert.strictEqual(applyStance(market, 'stay', null).extension, null);
});
