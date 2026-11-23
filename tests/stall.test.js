'use strict';
// Une IA qui se fige ne bloque plus la synchro : la requête est coupée et le modèle suivant répond. Et la durée
// habituelle de chaque étape, apprise sur les synchros précédentes, sert à dire « Google est lent en ce moment ».
// Réponses simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const providers = require(path.join(__dirname, '..', 'src/ai/providers.js'));
const { trError } = require(path.join(__dirname, '..', 'src/i18n.js'));
const { usualTimes, addTimes, slowAfter } = require(path.join(__dirname, '..', 'src/world/syncTimes.js'));

const settings = { provider: 'google', model: 'gemini-3.6-flash' };
const asked = [];
let freeze = 'stream'; // comment gemini-3.6-flash se fige : 'stream' (plus rien après les en-têtes) ou 'headers'
global.fetch = async (url) => {
  const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
  asked.push(model);
  if (model === 'gemini-3.6-flash') {
    if (freeze === 'headers') return new Promise(() => {});
    return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ model }) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
providers.STALL.ms = 60;
const ask = async (opts = {}) => JSON.parse(await providers.complete(settings, 'cle-factice', { system: 's', user: 'u', ...opts })).model;

test('un modèle qui se tait au milieu de sa réponse est coupé, sans être redemandé : le suivant répond', async () => {
  freeze = 'stream';
  asked.length = 0;
  const logs = [];
  const model = await ask({ log: (m) => logs.push(m) });
  assert.notStrictEqual(model, 'gemini-3.6-flash');
  assert.deepStrictEqual(asked, ['gemini-3.6-flash', model], 'une seule tentative sur le modèle figé');
  assert.ok(logs.some((l) => /Google ne répond plus depuis \d+ min\./.test(l)), logs.join('\n'));
});

test('un modèle qui ne renvoie même pas le début de sa réponse est coupé aussi', async () => {
  freeze = 'headers';
  asked.length = 0;
  const model = await ask();
  assert.notStrictEqual(model, 'gemini-3.6-flash');
  assert.deepStrictEqual(asked, ['gemini-3.6-flash', model]);
});

test('le message « ne répond plus » est traduit', () => {
  assert.strictEqual(trError('en', 'Google ne répond plus depuis 5 min.'), 'Google has not answered for 5 min.');
  assert.strictEqual(trError('de', 'Groq ne répond plus depuis 5 min.'), 'Groq antwortet seit 5 Min. nicht mehr.');
});

test('durée habituelle d’une étape : médiane des 5 dernières synchros, par fournisseur', () => {
  let h = {};
  for (const ms of [60000, 50000, 70000, 600000, 55000, 65000]) h = addTimes(h, 'google', { 'Rédaction de l’édition': ms, 'Discussions sur Kop': 10000 });
  assert.deepStrictEqual(h.google['Rédaction de l’édition'], [50000, 70000, 600000, 55000, 65000], 'les 5 dernières seulement');
  const usual = usualTimes(h, 'google');
  assert.strictEqual(usual['Rédaction de l’édition'], 65000, 'une synchro de 10 min ne fausse pas l’habitude');
  assert.strictEqual(usual['Discussions sur Kop'], 10000);
  assert.deepStrictEqual(usualTimes(h, 'groq'), {}, 'un autre fournisseur a ses propres habitudes');
  assert.deepStrictEqual(usualTimes(undefined, 'google'), {});
  h = addTimes(h, 'google', { 'Discussions sur Kop': NaN });
  assert.strictEqual(usualTimes(h, 'google')['Discussions sur Kop'], 10000, 'une durée invalide est ignorée');
});

test('« lent » : deux fois la durée habituelle, et au moins 45 s de plus ; rien sans habitude', () => {
  assert.strictEqual(slowAfter(65000), 130000);
  assert.strictEqual(slowAfter(10000), 55000);
  assert.strictEqual(slowAfter(0), 0);
  assert.strictEqual(slowAfter(undefined), 0);
});
