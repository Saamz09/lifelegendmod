'use strict';
// Messages privés de Kop (src/world/dms.js) : à qui il peut écrire, ce qui arrive sans IA après un match, ce que l'IA
// reçoit de la conversation. La réponse de l'IA elle-même est testée dans career.test.js (IA simulée).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { dmContacts, dmThread, addDmMessage, dmInbound, dmContext, findDm } = require(path.join(__dirname, '..', 'src/world/dms.js'));

let n = 0;
const newId = () => `id${++n}`;
const author = (handle, type, extra = {}) => ({ handle, name: handle, type, ...extra });
const world = (o = {}) => ({
  profile: { handle: 'IlanM' },
  accounts: { UltraNancy: { name: 'Ultra Nancy', type: 'fan', bio: 'Toujours là.' }, Scribe: { name: 'Le Scribe', type: 'journalist' } },
  feed: [
    { author: author('ChardonFou', 'fan'), text: 'Allez Nancy', gameDate: '2026-10-20', replies: [{ author: author('RivalDu57', 'rival'), text: 'Mdr' }, { author: { handle: 'IlanM', name: 'Moi', type: 'me', isMe: true }, text: 'Merci' }] },
    { author: author('ASNL', 'club'), text: 'Coup d’envoi', gameDate: '2026-10-20', replies: [] },
  ],
  snapshot: {
    gameDate: '2026-10-24', player: { name: 'Ilan Morel' }, club: { name: 'AS Nancy Lorraine', coach: 'O. Tanchot' }, table: [],
    rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Logan Ndenbe'], opponent: { team: 'Dijon FCO', short: 'DIJ', coach: 'B. Coach', players: ['Adversaire Un'] } },
  },
  ...o,
});
const match = (me, score = [2, 0], venue = 'domicile') => ({ me: { minutes: 90, goals: 0, assists: 0, rating: 7, ...me }, score, venue, home: 'AS Nancy Lorraine', away: 'Dijon FCO', clubLineup: [{ name: 'Ilan Morel' }, { name: 'Enzo Basilio' }, { name: 'Logan Ndenbe' }] });
const after = (m) => ({ firstSync: false, newResults: [m] });

test('il écrit à ses coéquipiers et aux supporters, pas à la presse, aux adversaires ni aux comptes officiels', () => {
  const by = Object.fromEntries(dmContacts(world()).map((c) => [c.handle, c.kind]));
  assert.deepStrictEqual(by, { EnzoBasilio: 'teammate', LoganNdenbe: 'teammate', ChardonFou: 'fan', RivalDu57: 'fan', UltraNancy: 'fan' });
  const state = world();
  assert.throws(() => dmThread(state, 'Scribe', newId), /ne reçoit pas de messages privés/);
  assert.throws(() => dmThread(state, 'AdversaireUn', newId), /ne reçoit pas de messages privés/);
  assert.throws(() => dmThread(state, 'ASNL', newId), /ne reçoit pas de messages privés/);
  const t = dmThread(state, 'enzobasilio', newId);
  assert.strictEqual(t.name, 'Enzo Basilio');
  assert.strictEqual(dmThread(state, 'EnzoBasilio', newId), t, 'une seule conversation par compte');
});

test('après un match : un coéquipier ou un supporter écrit quand il brille, sans relancer qui attend sa réponse', () => {
  const state = world();
  const first = dmInbound(state, state.snapshot, after(match({ goals: 1 })), { newId });
  assert.strictEqual(first.kind, 'teammate');
  assert.deepStrictEqual([first.unread, first.messages[0].who, first.messages[0].text], [true, 'them', 'Joli but contre Dijon FCO. Continue comme ça, on a besoin de toi.']);
  assert.strictEqual(dmInbound(state, { ...state.snapshot, gameDate: '2026-11-01' }, after(match({ goals: 1 })), { newId }), null, 'un tous les 14 jours');

  const next = { ...state.snapshot, gameDate: '2026-11-10' };
  const second = dmInbound(state, next, after(match({ assists: 1 }, [1, 2], 'extérieur')), { newId, language: 'en' });
  assert.strictEqual(second.kind, 'fan', 'chacun son tour');
  assert.notStrictEqual(second.handle, first.handle);
  assert.match(second.messages[0].text, /against AS Nancy Lorraine/, 'à l’extérieur, l’adversaire est le club qui reçoit');

  // Il n'a pas répondu au coéquipier : c'est l'autre coéquipier qui écrit.
  const third = dmInbound(state, { ...state.snapshot, gameDate: '2026-12-01' }, after(match({ goals: 1 })), { newId });
  assert.deepStrictEqual([third.kind, third.handle], ['teammate', 'LoganNdenbe']);
});

test('après un match : un supporter déçu seulement s’il a perdu et mal joué ; rien à la première synchro ni sans match', () => {
  const state = world();
  assert.strictEqual(dmInbound(state, state.snapshot, after(match({ rating: 7 }, [0, 1])), { newId }), null, 'défaite mais bon match');
  assert.strictEqual(dmInbound(state, state.snapshot, after(match({ rating: 5 }, [1, 1])), { newId }), null, 'mauvais match sans défaite');
  assert.strictEqual(dmInbound(state, state.snapshot, { firstSync: true, newResults: [match({ goals: 2 })] }, { newId }), null);
  assert.strictEqual(dmInbound(state, state.snapshot, { firstSync: false, newResults: [match({ minutes: 0, goals: 0 })] }, { newId }), null, 'il n’a pas joué');
  const angry = dmInbound(state, state.snapshot, after(match({ rating: 5 }, [0, 3])), { newId });
  assert.strictEqual(angry.type, 'fan', 'jamais un coéquipier, jamais un supporter adverse');
  assert.match(angry.messages[0].text, /On attend beaucoup mieux de toi/);
});

test('la conversation donnée à l’IA : ce qu’il a dit en public, les derniers messages, l’ancien coéquipier', () => {
  const state = world();
  const fan = dmThread(state, 'ChardonFou', newId);
  addDmMessage(fan, 'me', 'Merci pour le soutien', '2026-10-24');
  assert.strictEqual(fan.unread, false, 'son propre message ne compte pas comme non lu');
  const ctx = dmContext(state, fan);
  assert.deepStrictEqual(ctx.their_public_posts, [{ date: '2026-10-20', text: 'Allez Nancy' }]);
  assert.deepStrictEqual(ctx.messages, [{ who: 'me', text: 'Merci pour le soutien', date: '2026-10-24' }]);
  assert.strictEqual(dmContext(state, dmThread(state, 'UltraNancy', newId)).with.bio, 'Toujours là.');

  const mate = dmThread(state, 'EnzoBasilio', newId);
  assert.strictEqual(dmContext(state, mate).with.former_teammate, undefined);
  state.snapshot.rosters.mine = ['Ilan Morel', 'Logan Ndenbe'];
  assert.strictEqual(dmContext(state, mate).with.former_teammate, true, 'il a changé de club : le fil reste');
  assert.strictEqual(findDm(state, 'ENZOBASILIO'), mate);
  assert.strictEqual(dmThread(state, 'EnzoBasilio', newId), mate);
});
