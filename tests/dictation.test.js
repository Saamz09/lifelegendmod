'use strict';
// Dictée de la conférence d'après-match : l'audio part chez Gemini sous la bonne forme, à la demande, avec les noms du
// contexte ; le modèle léger d'abord, le suivant si le quota est épuisé. Réponses simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const providers = require(path.join(__dirname, '..', 'src/ai/providers.js'));
const world = require(path.join(__dirname, '..', 'src/world/world.js'));

const settings = { provider: 'google', model: 'gemini-3.6-flash' };
const asked = [];
let answer = 'Bonjour à tous.';
let quotaOut = false;
global.fetch = async (url, init) => {
  const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
  asked.push({ url, model, key: init.headers['x-goog-api-key'], body: JSON.parse(init.body) });
  if (quotaOut && model === 'gemini-3.5-flash-lite') return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `${answer}\n` }] } }] }), { status: 200 });
};

test('dictée : le son et les noms du contexte partent chez Gemini, le texte revient propre', async () => {
  asked.length = 0;
  const store = { activeCareer: () => ({ snapshot: { player: { name: 'Ilan Morel' }, club: { name: 'AS Nancy Lorraine' }, coaches: { mine: 'Oswald Tanchot' }, squad: [{ name: 'Pape Meïssa Ba' }] }, press: { questions: [{ journalist: 'Julien Mercier' }] } }), getKey: () => 'cle-de-test' };
  const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const text = await world.transcribeDictation({ store, settings, audio: wav });
  assert.strictEqual(text, 'Bonjour à tous.');
  assert.strictEqual(asked.length, 1);
  assert.match(asked[0].url, /:generateContent$/);
  assert.strictEqual(asked[0].model, 'gemini-3.5-flash-lite', 'le modèle léger d’abord');
  assert.strictEqual(asked[0].key, 'cle-de-test');
  const [prompt, audio] = asked[0].body.contents[0].parts;
  assert.strictEqual(audio.inlineData.mimeType, 'audio/wav');
  assert.deepStrictEqual([...Buffer.from(audio.inlineData.data, 'base64')], [...wav]);
  for (const name of ['Ilan Morel', 'AS Nancy Lorraine', 'Oswald Tanchot', 'Pape Meïssa Ba', 'Julien Mercier']) assert.ok(prompt.text.includes(name), name);
});

test('dictée : personne ne parle, le texte reste vide', async () => {
  answer = '(rien)';
  assert.strictEqual(await providers.transcribe(settings, 'k', { audio: 'AA==', prompt: 'p' }), '');
  answer = 'Bonjour à tous.';
});

test('dictée : un enregistrement vide ou trop long ne part pas', async () => {
  asked.length = 0;
  const store = { activeCareer: () => ({}), getKey: () => 'k' };
  await assert.rejects(world.transcribeDictation({ store, settings, audio: new Uint8Array(0) }), /vide ou trop long/);
  await assert.rejects(world.transcribeDictation({ store, settings, audio: new Uint8Array(8 * 1024 * 1024 + 1) }), /vide ou trop long/);
  assert.strictEqual(asked.length, 0);
});

test('dictée : réservée à Gemini, et il faut une clé', async () => {
  asked.length = 0;
  await assert.rejects(providers.transcribe({ provider: 'openai', model: 'x' }, 'k', { audio: 'AA==', prompt: 'p' }), /passe par Gemini/);
  await assert.rejects(providers.transcribe(settings, '', { audio: 'AA==', prompt: 'p' }), /Aucune clé/);
  assert.strictEqual(asked.length, 0);
});

test('dictée : quota du modèle léger épuisé, le modèle suivant répond', async () => {
  asked.length = 0;
  quotaOut = true;
  assert.strictEqual(await providers.transcribe(settings, 'k', { audio: 'AA==', prompt: 'p' }), 'Bonjour à tous.');
  assert.deepStrictEqual(asked.map((a) => a.model), ['gemini-3.5-flash-lite', 'gemini-3.6-flash']);
  quotaOut = false;
});
