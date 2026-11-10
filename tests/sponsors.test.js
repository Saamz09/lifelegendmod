'use strict';
// Contrats d'équipementier (src/world/sponsors.js) : une offre à la fois, une marque à sa portée, des primes comptées une seule fois,
// et le catalogue lu dans la table du jeu.

const test = require('node:test');
const assert = require('node:assert');
const { parseBoots } = require('../src/save/boots');
const { sponsorTick, answerSponsor, sponsorFacts, eligible, tierOf, brandPool, seasonEnd } = require('../src/world/sponsors');
const { sponsorTexts, SPONSOR_LANGUAGES } = require('../src/world/sponsorTexts');

const CATALOG = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: 1010 + i, brand: 'Marque A' })),
  ...Array.from({ length: 30 }, (_, i) => ({ id: 2010 + i, brand: 'Marque B' })),
  ...Array.from({ length: 19 }, (_, i) => ({ id: 3010 + i, brand: 'Marque C' })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: 4010 + i, brand: 'Marque D' })),
  { id: 5010, brand: 'Marque E' }, { id: 5011, brand: 'Marque F' },
];
let n = 0;
const newId = () => `id${++n}`;
const snap = (gameDate, o = {}) => ({
  gameDate, club: { name: 'AS Nancy Lorraine' }, player: { name: 'Ilan Morel', salary: 268500 },
  stats: { total: { apps: 5, avgRating: 6.5, goals: 2, assists: 0, ...o.stats } }, fixtures: o.fixtures || [],
});
const world = (o = {}) => ({ careerId: '1-essai', profile: { displayName: 'Ilan Morel', followers: 6740, ...o.profile }, agent: { name: 'Lucas Vermeulen' }, mail: [], ...o.state });
function offered(state, date = '2026-10-28', snapshot = snap(date)) {
  state.snapshot = snapshot;
  const out = sponsorTick(state, snapshot, { language: 'fr', newId, catalog: CATALOG });
  if (out.mail) state.mail.push(out.mail);
  return out;
}

test('la table du jeu : numéro et marque, la faute de frappe corrigée, une autre forme ne donne rien', () => {
  const rec = (id, brand) => { const b = Buffer.alloc(304); b.writeUInt16LE(id, 0); b.write(`ID ${id}`, 4); b.write(brand, 204); return b; };
  assert.deepStrictEqual(parseBoots(Buffer.concat([rec(1010, 'Marque A'), rec(4010, 'New Balace')])), [{ id: 1010, brand: 'Marque A' }, { id: 4010, brand: 'New Balance' }]);
  assert.deepStrictEqual(parseBoots(Buffer.alloc(100)), []);
  assert.deepStrictEqual(parseBoots(null), []);
});

test('il faut avoir joué et compter : 3 matchs, une note correcte ou des buts', () => {
  assert.ok(eligible(snap('2026-10-28')));
  assert.ok(!eligible(snap('2026-10-28', { stats: { apps: 2 } })));
  assert.ok(!eligible(snap('2026-10-28', { stats: { avgRating: 5.5, goals: 1 } })));
  assert.ok(eligible(snap('2026-10-28', { stats: { avgRating: 5.5, goals: 1, assists: 1 } })));
});

test('la marque suit sa notoriété, les marques venant de la table du jeu', () => {
  assert.deepStrictEqual([tierOf(6740), tierOf(100000), tierOf(2000000)], ['starter', 'rising', 'star']);
  assert.deepStrictEqual(brandPool(CATALOG, 'star', [], '2026-10-28'), ['Marque A', 'Marque B', 'Marque C']);
  assert.ok(!brandPool(CATALOG, 'starter', [], '2026-10-28').includes('Marque A'), 'une grande marque ne court pas après un débutant');
  const refused = [{ brand: 'Marque C', status: 'declined', on: '2026-09-01' }];
  assert.ok(!brandPool(CATALOG, 'starter', refused, '2026-10-28').includes('Marque C'), 'refusée il y a moins d’un an');
  assert.ok(brandPool(CATALOG, 'starter', refused, '2027-10-28').includes('Marque C'), 'un an plus tard, elle peut revenir');
});

test('la fin de contrat tombe le 30 juin de la dernière saison', () => {
  assert.strictEqual(seasonEnd('2026-10-28', 1), '2027-06-30');
  assert.strictEqual(seasonEnd('2026-10-28', 2), '2028-06-30');
  assert.strictEqual(seasonEnd('2027-02-10', 1), '2027-06-30');
});

test('une offre : un mail, un montant à la mesure de son salaire, puis plus rien tant qu’elle est ouverte', () => {
  const state = world();
  const out = offered(state);
  assert.ok(out.mail && out.offer);
  assert.strictEqual(out.mail.sponsorOffer, out.offer.id);
  assert.ok(CATALOG.some((b) => b.id === out.offer.bootId && b.brand === out.offer.brand), 'un modèle de cette marque');
  assert.ok(out.offer.fee >= 10000 && out.offer.fee <= 22000, `montant ${out.offer.fee}`);
  assert.match(out.mail.messages[0].body, new RegExp(out.offer.brand));
  assert.strictEqual(offered(state, '2026-10-31').mail, null, 'une offre à la fois');
});

test('rien sans catalogue, sans matchs, ni à la première synchro de la marque suivante trop tôt', () => {
  const state = world();
  assert.strictEqual(sponsorTick(state, snap('2026-10-28'), { language: 'fr', newId, catalog: [] }).mail, null);
  assert.strictEqual(sponsorTick(state, snap('2026-10-28', { stats: { apps: 1 } }), { language: 'fr', newId, catalog: CATALOG }).mail, null);
});

test('même carrière, même jour : la même offre', () => {
  const a = offered(world()).offer, b = offered(world()).offer;
  assert.deepStrictEqual([a.brand, a.bootId, a.fee, a.via, a.person], [b.brand, b.bootId, b.fee, b.via, b.person]);
});

test('accepter : le contrat démarre, la marque répond, ses primes se comptent une seule fois', () => {
  const state = world();
  const { offer, mail } = offered(state);
  const deal = answerSponsor(state, 'accept', { language: 'fr', gameDate: '2026-10-29' });
  assert.strictEqual(state.sponsor.offer, null);
  assert.strictEqual(state.sponsor.deal, deal);
  assert.strictEqual(deal.brand, offer.brand);
  assert.deepStrictEqual(state.sponsor.news, { kind: 'signed', brand: offer.brand, until: offer.until });
  assert.strictEqual(mail.messages.at(-1).who, 'them', 'ses boutons ne le font pas écrire');
  assert.deepStrictEqual(sponsorFacts(state), { brand: offer.brand, since: '2026-10-29', until: offer.until });
  const fixtures = [{ id: 'avant', played: true, date: '2026-10-01', me: { goals: 3, assists: 0 } }, { id: 'a', played: true, date: '2026-11-01', me: { goals: 1, assists: 1 } }, { id: 'b', played: true, date: '2026-11-08', me: { goals: 0, assists: 0 } }];
  const s = snap('2026-11-10', { fixtures });
  sponsorTick(state, s, { language: 'fr', newId, catalog: CATALOG });
  sponsorTick(state, s, { language: 'fr', newId, catalog: CATALOG });
  assert.strictEqual(state.sponsor.deal.contributions, 2, 'seulement après la signature, et pas deux fois');
  assert.strictEqual(sponsorTick(state, snap('2026-12-01', { fixtures }), { language: 'fr', newId, catalog: CATALOG }).mail, null, 'pas d’offre sous contrat');
  assert.throws(() => answerSponsor(state, 'accept', { language: 'fr', gameDate: '2026-12-01' }), /n’attend plus/);
});

test('le contrat prend fin : un message, l’historique, et une nouvelle offre seulement après un délai', () => {
  const state = world();
  const { offer, mail } = offered(state);
  answerSponsor(state, 'accept', { language: 'fr', gameDate: '2026-10-29' });
  const out = sponsorTick(state, snap(offer.until), { language: 'fr', newId, catalog: CATALOG });
  assert.strictEqual(state.sponsor.deal, null);
  assert.strictEqual(state.sponsor.history.at(-1).status, 'ended');
  assert.ok(mail.unread);
  assert.strictEqual(out.mail, null, 'pas tout de suite');
  assert.ok(sponsorTick(state, snap('2029-01-01'), { language: 'fr', newId, catalog: CATALOG }).mail, 'plus tard, oui');
});

test('refuser : la marque répond, un délai, et elle ne revient pas tout de suite', () => {
  const state = world();
  const { offer } = offered(state);
  assert.strictEqual(answerSponsor(state, 'decline', { language: 'fr', gameDate: '2026-10-29' }), null);
  assert.strictEqual(state.sponsor.history.at(-1).status, 'declined');
  assert.strictEqual(offered(state, '2026-11-20').mail, null, 'moins de 60 jours');
  const next = offered(state, '2027-01-15');
  assert.ok(next.offer);
  assert.notStrictEqual(next.offer.brand, offer.brand);
});

test('sans réponse en 30 jours, l’offre tombe', () => {
  const state = world();
  const { offer, mail } = offered(state);
  mail.unread = false;
  offered(state, offer.expires);
  assert.strictEqual(state.sponsor.offer, null);
  assert.strictEqual(state.sponsor.history.at(-1).status, 'lapsed');
  assert.ok(mail.unread, 'le message de retrait se voit');
});

test('négocier une seule fois : plus d’argent ou non, jamais moins, et l’offre reste ouverte', () => {
  let ups = 0;
  for (let i = 0; i < 30; i++) {
    const state = world();
    const { offer, mail } = offered(state, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`);
    const before = offer.fee, count = mail.messages.length;
    answerSponsor(state, 'negotiate', { language: 'fr', gameDate: offer.on });
    assert.ok(state.sponsor.offer, 'toujours ouverte');
    assert.ok(offer.fee >= before);
    if (offer.fee > before) { ups++; assert.ok(offer.fee <= Math.ceil(before * 1.21) + 500); }
    assert.strictEqual(mail.messages.length, count + 1);
    assert.throws(() => answerSponsor(state, 'negotiate', { language: 'fr', gameDate: offer.on }), /déjà négocié/);
  }
  assert.ok(ups > 5 && ups < 30, `parfois oui, parfois non (${ups} sur 30)`);
});

test('sans agent : la marque écrit directement, et on ne peut pas négocier', () => {
  const state = world({ state: { agent: null } });
  const { offer } = offered(state);
  assert.strictEqual(offer.via, 'direct');
  assert.throws(() => answerSponsor(state, 'negotiate', { language: 'fr', gameDate: offer.on }), /pas d’agent/);
});

test('les six langues ont tous leurs textes, sans trou', () => {
  const o = { first: 'Ilan', club: 'Nancy', brand: 'Marque', person: 'Clara', agent: 'Lucas', fee: '10 €', bonus: '1 €', until: '30 juin', deadline: '1 mai' };
  assert.strictEqual(SPONSOR_LANGUAGES.length, 6);
  for (const lang of SPONSOR_LANGUAGES) {
    const L = sponsorTexts(lang);
    const all = [L.subject(o), L.direct(o), L.agent(o), ...['accepted', 'declined', 'up', 'no', 'lapsed', 'ended'].flatMap((k) => [L[k].direct(o), L[k].agent(o)])];
    for (const text of all) assert.ok(text && !/undefined/.test(text), `${lang} : ${text}`);
  }
});
