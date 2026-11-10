'use strict';
// Quota de l'IA : le modèle léger du fournisseur pour les tâches courtes, et un modèle dont le quota du jour est épuisé
// évité pendant une heure au lieu d'être redemandé à chaque étape. Réponses simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const providers = require(path.join(__dirname, '..', 'src/ai/providers.js'));
const settings = { provider: 'google', model: 'gemini-3.6-flash' };
const asked = [];
let quotaOut = false;
global.fetch = async (url) => {
  const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
  asked.push(model);
  const json = { 'content-type': 'application/json' };
  if (quotaOut && model === 'gemini-3.6-flash') {
    return new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20' } }), { status: 429, headers: json });
  }
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ model }) }] } }] }), { status: 200, headers: json });
};
const ask = async (opts = {}) => JSON.parse(await providers.complete(settings, 'cle-factice', { system: 's', user: 'u', ...opts })).model;

test('tâche courte : le modèle léger du fournisseur ; les autres : le modèle choisi', async () => {
  asked.length = 0;
  assert.strictEqual(await ask({ light: true }), 'gemini-3.5-flash-lite');
  assert.strictEqual(await ask(), 'gemini-3.6-flash');
  assert.deepStrictEqual(asked, ['gemini-3.5-flash-lite', 'gemini-3.6-flash']);
});

test('quota du jour épuisé : le modèle suivant répond, puis le modèle épuisé n’est plus redemandé', async () => {
  quotaOut = true;
  asked.length = 0;
  const logs = [];
  assert.strictEqual(await ask({ log: (m) => logs.push(m) }), 'gemini-3.5-flash-lite');
  assert.deepStrictEqual(asked, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  asked.length = 0;
  assert.strictEqual(await ask({ log: (m) => logs.push(m) }), 'gemini-3.5-flash-lite');
  assert.deepStrictEqual(asked, ['gemini-3.5-flash-lite'], 'gemini-3.6-flash n’est pas redemandé');
  assert.ok(logs.some((l) => /^Quota du jour de gemini-3\.6-flash épuisé : gemini-3\.5-flash-lite répond à sa place\.$/.test(l)), logs.join('\n'));
});
