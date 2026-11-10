'use strict';
// Le changement automatique de modèle quand le fournisseur est surchargé ou à court de quota.
// Réponses simulées, avec la forme de celles de Google : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const realTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...rest) => realTimeout(fn, 0, ...rest); // pas d'attente entre deux essais

const file = path.join(__dirname, '..', 'src/ai/providers.js');
const fresh = () => { delete require.cache[require.resolve(file)]; return require(file); }; // sans les quotas déjà vus
const settings = { provider: 'google', model: 'gemini-3.6-flash' };
const ALL = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (model) => reply(200, { candidates: [{ content: { parts: [{ text: model }] } }] });
const overloaded = () => reply(503, { error: { code: 503, message: 'This model is currently experiencing high demand.' } });
const gone = () => reply(404, { error: { code: 404, message: 'models/x is not found' } });
const quota = (retryDelay = '71746s') => reply(429, { error: { code: 429,
  message: `You exceeded your current quota. limit: 20. Please retry in ${retryDelay}.`,
  details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] } });

// behave(model) rend la réponse de ce modèle ; rend la liste des modèles demandés, dans l'ordre.
function serve(behave) {
  const asked = [];
  global.fetch = async (url) => {
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
    asked.push(model);
    return behave(model);
  };
  return asked;
}
const ask = (providers) => providers.complete(settings, 'cle-factice', { system: 's', user: 'u' });

test('modèles surchargés : le suivant répond', async () => {
  const asked = serve((m) => (m === 'gemini-3.8-flash' ? answer(m) : overloaded()));
  assert.strictEqual(await ask(fresh()), 'gemini-3.8-flash');
  assert.deepStrictEqual([...new Set(asked)], ALL.slice(0, 3));
});

test('tous surchargés : passager, et le message dit combien de modèles ont été essayés', async () => {
  const asked = serve(overloaded);
  const providers = fresh();
  await assert.rejects(ask(providers), (err) => {
    assert.match(err.message, /Google ne répond pas pour le moment : 5 modèles essayés/);
    assert.strictEqual(err.retryable, true);
    assert.strictEqual(providers.isDailyQuota(err), false);
    return true;
  });
  assert.deepStrictEqual([...new Set(asked)], ALL);
});

test('quota du jour partout, même avec un délai de reprise de Google : reconnu, sans réessai inutile', async () => {
  const asked = serve(() => quota());
  const providers = fresh();
  await assert.rejects(ask(providers), (err) => {
    assert.match(err.message, /Quota du jour épuisé chez Google : 5 modèles essayés/);
    assert.strictEqual(providers.isDailyQuota(err), true);
    return true;
  });
  assert.deepStrictEqual(asked, ALL);
});

test('quota du jour écrit seulement dans le message (« 19h55m46s ») : reconnu aussi', async () => {
  serve(() => reply(429, { error: { code: 429, message: 'Please retry in 19h55m46.49565611s.' } }));
  const providers = fresh();
  await assert.rejects(ask(providers), (err) => providers.isDailyQuota(err));
});

test('limite à la minute : ce n’est pas un quota du jour', async () => {
  const { AIError, isDailyQuota } = fresh();
  assert.strictEqual(isDailyQuota(new AIError('x', { retryable: true, limit: true, retryAfter: 37 })), false);
  assert.strictEqual(isDailyQuota(new AIError('x', { retryable: true, limit: true, retryAfter: 71746 })), true);
  assert.strictEqual(isDailyQuota(new AIError('x', { retryable: true, limit: true })), true);
  assert.strictEqual(isDailyQuota(new AIError('x', { retryable: true })), false);
});

test('un modèle de repli retiré par le fournisseur est sauté', async () => {
  const asked = serve((m) => (m === 'gemini-3.1-flash-lite' ? answer(m) : m === 'gemini-3.8-flash' ? gone() : overloaded()));
  assert.strictEqual(await ask(fresh()), 'gemini-3.1-flash-lite');
  assert.deepStrictEqual([...new Set(asked)], ALL.slice(0, 4));
});

test('le modèle choisi introuvable : on le dit tout de suite, sans essayer les autres', async () => {
  const asked = serve(gone);
  await assert.rejects(ask(fresh()), /Modèle introuvable chez Google/);
  assert.deepStrictEqual(asked, ['gemini-3.6-flash']);
});
