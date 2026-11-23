'use strict';
// La liste des modèles demandée au fournisseur avec la clé du joueur (src/ai/modelList.js) : la bonne adresse et la
// clé, seulement les modèles qui écrivent du texte, ceux de LifeLegend d'abord, et des erreurs claires.
// Réponses simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { listModels, textModels } = require(path.join(__dirname, '..', 'src/ai/modelList.js'));

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function server(body, status) {
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const h = init.headers instanceof Headers ? Object.fromEntries(init.headers) : Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    asked.push({ url: String(url), headers: h });
    return json(body, status);
  };
  return { asked, fetchImpl };
}

test('compatible OpenAI : /models avec la clé, sans les modèles d’image, de voix ou de plongement', async () => {
  const { asked, fetchImpl } = server({ data: [
    { id: 'gpt-6-luna' }, { id: 'gpt-image-2' }, { id: 'gpt-realtime-2' }, { id: 'text-embedding-4' }, { id: 'gpt-6.2-sol' },
    { id: 'gpt-transcribe' }, { id: 'davinci-002' }, { id: 'gpt-7-preview' }, { id: 'omni-moderation-latest' },
  ] });
  const models = await listModels({ provider: 'openai', apiKey: 'cle', fetchImpl });
  assert.deepStrictEqual(asked.map((a) => [a.url, a.headers.authorization]), [['https://api.openai.com/v1/models', 'Bearer cle']]);
  assert.deepStrictEqual(models, ['gpt-6.2-sol', 'gpt-6-luna', 'gpt-7-preview'], 'ceux de LifeLegend dans leur ordre, puis le nouveau');
});

test('Mistral : seulement ceux qui savent discuter', async () => {
  const { fetchImpl } = server({ data: [
    { id: 'mistral-small-latest', capabilities: { completion_chat: true } }, { id: 'mistral-embed', capabilities: { completion_chat: false } },
    { id: 'codestral-latest', capabilities: { completion_chat: true } }, { id: 'mistral-ocr-latest', capabilities: { completion_chat: false } },
  ] });
  assert.deepStrictEqual(await listModels({ provider: 'mistral', apiKey: 'cle', fetchImpl }), ['mistral-small-latest', 'codestral-latest']);
});

test('Google : les Gemini qui écrivent, sans « models/ »', async () => {
  const { asked, fetchImpl } = server({ models: [
    { name: 'models/gemini-4-hydrogen', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-3.6-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemma-4-31b', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-nano-banana-2.1', supportedGenerationMethods: ['generateContent'] }, // images (relevé dans une vraie liste)
  ] });
  const models = await listModels({ provider: 'google', apiKey: 'AIza-cle', fetchImpl });
  assert.strictEqual(asked[0].headers['x-goog-api-key'], 'AIza-cle');
  assert.deepStrictEqual(models, ['gemini-3.6-flash', 'gemini-4-hydrogen']);
});

test('Anthropic : par sa bibliothèque, avec la clé', async () => {
  const { asked, fetchImpl } = server({ data: [
    { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' },
    { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-01-01T00:00:00Z' },
    { type: 'model', id: 'claude-next-6', display_name: 'Claude Next 6', created_at: '2026-11-01T00:00:00Z' },
  ], has_more: false, first_id: 'claude-haiku-5-5', last_id: 'claude-next-6' });
  const models = await listModels({ provider: 'anthropic', apiKey: 'sk-ant-cle', fetchImpl });
  assert.match(asked[0].url, /^https:\/\/api\.anthropic\.com\/v1\/models\?/);
  assert.strictEqual(asked[0].headers['x-api-key'], 'sk-ant-cle');
  assert.deepStrictEqual(models, ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-next-6']);
});

test('OpenRouter : les gratuits avant les autres ; « Autre » : son adresse', async () => {
  assert.deepStrictEqual(textModels('openrouter', ['z/model', 'a/model', 'm/model:free']), ['m/model:free', 'a/model', 'z/model']);
  const { asked, fetchImpl } = server({ data: [{ id: 'local-model' }] });
  assert.deepStrictEqual(await listModels({ provider: 'custom', apiKey: '', baseUrl: 'http://localhost:1234/v1/', fetchImpl }), ['local-model']);
  assert.strictEqual(asked[0].url, 'http://localhost:1234/v1/models');
  assert.strictEqual(asked[0].headers.authorization, undefined, 'sans clé, pas d’en-tête');
});

test('erreurs : clé refusée, réseau coupé, sans clé', async () => {
  await assert.rejects(listModels({ provider: 'deepseek', apiKey: 'x', fetchImpl: server({ error: { message: 'Authentication Fails' } }, 401).fetchImpl }), /^Error: Clé DeepSeek refusée : Authentication Fails$/);
  await assert.rejects(listModels({ provider: 'xai', apiKey: 'x', fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /Impossible de joindre xAI\. Vérifie ta connexion\./);
  await assert.rejects(listModels({ provider: 'groq', apiKey: '' }), /Aucune clé d'IA enregistrée/);
});
