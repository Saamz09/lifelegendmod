'use strict';
// La liste des fournisseurs d'IA (2026-11-23 : Mistral, DeepSeek, xAI, Cerebras ajoutés ; modèles mis à jour) : chacun
// a de quoi être appelé, et un fournisseur compatible OpenAI part bien à son adresse, avec la clé et le modèle choisis.
// Réponses simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { PROVIDERS, complete } = require(path.join(__dirname, '..', 'src/ai/providers.js'));

test('chaque fournisseur : un nom, des modèles sans doublon, une adresse pour ceux compatibles OpenAI', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.ok(p.label, `${id} : un nom`);
    // L'ordre de secours sans doublon ; « more » ajoute aux réglages un modèle hors de la liste (il peut être un secours).
    const chain = [...(p.models || []), ...(p.backups || [])];
    assert.strictEqual(new Set(chain).size, chain.length, `${id} : un modèle en double`);
    assert.ok((p.more || []).every((m) => !(p.models || []).includes(m)), `${id} : « more » répète la liste`);
    if (['openrouter', 'custom'].includes(id)) continue;
    assert.ok(p.models.length >= 2, `${id} : au moins un modèle et un modèle léger`);
    if (id !== 'anthropic') assert.match(p.baseUrl, /^https:\/\//, `${id} : adresse`);
  }
});

test('fournisseurs compatibles OpenAI : la bonne adresse, la clé, le modèle choisi', async () => {
  const sent = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, auth: init.headers.Authorization, model: body.model });
    return new Response(JSON.stringify({ choices: [{ message: { content: `{"ok":"${body.model}"}` } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const cases = {
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
  };
  for (const [provider, url] of Object.entries(cases)) {
    const model = PROVIDERS[provider].models[0];
    const text = await complete({ provider, model }, 'cle-factice', { system: 's', user: 'u' });
    assert.strictEqual(text, `{"ok":"${model}"}`);
    assert.deepStrictEqual(sent.at(-1), { url, auth: 'Bearer cle-factice', model }, provider);
  }
});
