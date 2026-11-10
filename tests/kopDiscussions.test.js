'use strict';
// Kop : les discussions sous les posts (une requête à part après l'édition). Le 2027-01-14, un compte inventé par l'IA
// faisait planter toute l'étape (le renommage appelait un journal absent) : l'édition est partie sans une seule réponse.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const providers = require(path.join(__dirname, '..', 'src/ai/providers.js'));
let answer = null;
providers.complete = async () => JSON.stringify(answer);
const world = require(path.join(__dirname, '..', 'src/world/world.js'));

const post = (id, handle, type, text) => ({ id, author: { handle, name: handle, type }, text, gameDate: '2027-01-14', createdAt: 1, replies: [], likes: 50, reposts: 2 });
const baseState = () => ({
  careerId: 'essai', editions: [], clubPages: {}, profile: { handle: 'ilan_off' },
  accounts: { ANLSarah3: { name: 'Sarah', type: 'fan' }, DijonAdam7: { name: 'Adam', type: 'rival' } },
  feed: [post('p1', 'ANLSarah3', 'fan', 'allez nancy ce soir à dijon'), post('p2', 'DijonAdam7', 'rival', 'nancy va prendre cher à gaston gérard')],
  snapshot: { gameDate: '2027-01-14', league: { name: 'Ligue 2 BKT' }, club: { name: 'AS Nancy Lorraine' }, player: { name: 'Ilan Morel', history: {} },
    table: [{ team: 'AS Nancy Lorraine', mine: true, pos: 8 }, { team: 'Dijon FCO', pos: 12 }] },
});

test('discussions : un compte inventé par l’IA est renommé, et les réponses sont publiées', async () => {
  const state = baseState();
  answer = { threads: [{ post_id: 'p1', messages: [
    { handle: 'DijonAdam7', name: 'Adam', type: 'rival', text: 'vous allez rien voir ce soir', reply_to: null },
    { handle: 'LucieDijon21', name: 'Lucie | Dijon FCO', type: 'rival', text: 'nancy en ligue 2 depuis trop longtemps mdr', reply_to: null },
    { handle: 'ANLSarah3', name: 'Sarah', type: 'fan', text: 'on en reparle à la fin du match', reply_to: 'LucieDijon21' },
  ] }], quotes: [] };
  const r = await world.writeDiscussions({ state, settings: { language: 'fr' }, apiKey: 'x', facts: {}, fresh: state.feed.slice(), people: [], gameDate: '2027-01-14', onProgress: () => {} });
  assert.strictEqual(r.renamed, 1);
  assert.strictEqual(r.messages, 3);
  const replies = state.feed[0].replies;
  assert.ok(!replies.some((x) => x.author.handle === 'LucieDijon21'), 'le pseudo inventé est remplacé');
  const renamed = replies[1].author.handle;
  assert.strictEqual(replies[2].replyTo, renamed, 'la réponse qui le visait suit le nouveau pseudo');
});
