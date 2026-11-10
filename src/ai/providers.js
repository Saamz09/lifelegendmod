'use strict';
// Appels aux fournisseurs d'IA. Chaque fonction renvoie le texte brut de la réponse.

const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.Anthropic || sdk.default || sdk;

// Préréglages : les modèles évoluent vite, le champ reste modifiable dans les réglages.
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    keyHint: 'sk-ant-…',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
  google: {
    label: 'Google AI Studio (Gemini) — gratuit',
    keyHint: 'AIza…',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    // Autres modèles gratuits, en dernier recours : ils ont chacun leur quota du jour, et restent hors de la liste des réglages.
    backups: ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
  },
  openai: {
    label: 'OpenAI (GPT)',
    keyHint: 'sk-…',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.6', 'gpt-5.6-mini'],
  },
  groq: {
    label: 'Groq — gratuit',
    keyHint: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  },
  openrouter: {
    label: 'OpenRouter',
    keyHint: 'sk-or-…',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
  },
  custom: {
    label: 'Autre (compatible OpenAI)',
    keyHint: '',
    models: [],
  },
};

class AIError extends Error {
  constructor(message, { retryable = false, network = false, retryAfter = null, limit = false } = {}) {
    super(message);
    this.retryable = retryable;
    this.network = network; // connexion impossible : changer de modèle n'y changerait rien
    this.limit = limit; // limite de requêtes atteinte (429)
    this.retryAfter = retryAfter; // secondes à attendre avant de réessayer, quand le serveur le dit (limite par minute)
  }
}

// Délai demandé par le serveur avant de réessayer, en secondes : en-tête Retry-After, RetryInfo de Google
// (« retryDelay »: "37s") ou « Please retry in 37.4s » dans le message. null s'il n'en donne pas (quota du jour).
function retryDelayOf(text, header) {
  const h = Number(header);
  if (Number.isFinite(h) && h > 0) return h;
  try {
    const info = (JSON.parse(text).error?.details || []).find((d) => /RetryInfo/.test(d['@type'] || ''));
    const s = parseFloat(String(info?.retryDelay || ''));
    if (Number.isFinite(s) && s > 0) return s;
  } catch { /* texte brut */ }
  const m = /retry in ([\d.]+)\s*s/i.exec(String(text));
  return m ? parseFloat(m[1]) : null;
}

// Les modèles Claude récents acceptent `effort` ; le repli serveur couvre les refus de sécurité.
const supportsEffort = (model) => /claude-(opus|sonnet|haiku)-5|claude-fable|claude-opus-4-[678]/.test(model);
const supportsFallback = (model) => /claude-(opus-5|sonnet-5-5|fable-5)/.test(model);

// Progression envoyée au fil de l'eau (au plus toutes les 250 ms) : réflexion, écriture, nouvel essai…
function throttled(onProgress, model) {
  let last = 0;
  return (p, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - last < 250) return;
    last = now;
    onProgress({ model, ...p });
  };
}

async function callAnthropic({ apiKey, model, system, user, maxTokens, progress }) {
  const client = new Anthropic({ apiKey });
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  if (supportsEffort(model)) params.output_config = { effort: 'medium' };
  if (supportsFallback(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  try {
    const stream = supportsFallback(model) ? client.beta.messages.stream(params) : client.messages.stream(params);
    let chars = 0;
    stream.on('text', (delta) => { chars += delta.length; progress({ phase: 'writing', chars }); });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new AIError("Le modèle a refusé d'écrire cette édition. Relance la synchro.");
    if (message.stop_reason === 'max_tokens') throw new AIError('La réponse a été coupée (trop longue). Relance la synchro.', { retryable: true });
    return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AIError('Clé Anthropic refusée. Vérifie-la dans les réglages.');
    if (err instanceof Anthropic.NotFoundError) throw new AIError(`Le modèle « ${model} » est introuvable chez Anthropic. Choisis-en un autre.`);
    if (err instanceof Anthropic.RateLimitError) throw new AIError('Limite de requêtes atteinte chez Anthropic. Réessaie dans une minute.', { retryable: true, limit: true, retryAfter: retryDelayOf('', err.headers?.get?.('retry-after')) });
    if (err instanceof Anthropic.APIConnectionError) throw new AIError('Impossible de joindre Anthropic. Vérifie ta connexion.', { retryable: true, network: true });
    if (err instanceof Anthropic.APIError) throw new AIError(`Erreur Anthropic (${err.status ?? '?'}) : ${err.message}`, { retryable: (err.status ?? 0) >= 500 });
    throw err;
  }
}

function httpError(status, text, providerName, retryHeader = null) {
  let detail = text.slice(0, 300);
  try { detail = JSON.parse(text).error?.message || detail; } catch { /* texte brut */ }
  if (status === 401 || status === 403) return new AIError(`Clé ${providerName} refusée : ${detail}`);
  if (status === 404) return new AIError(`Modèle introuvable chez ${providerName} : ${detail}`);
  return new AIError(`Erreur ${providerName} (${status}) : ${detail}`, { retryable: status === 429 || status >= 500, limit: status === 429, retryAfter: status === 429 ? retryDelayOf(text, retryHeader) : null });
}

// Requête en streaming (SSE). onEvent reçoit chaque événement JSON ; si le serveur ne streame pas,
// la réponse complète est renvoyée telle quelle.
async function postStream(url, headers, body, providerName, onEvent) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new AIError(`Impossible de joindre ${providerName}. Vérifie ta connexion.`, { retryable: true, network: true });
  }
  if (!res.ok) throw httpError(res.status, await res.text(), providerName, res.headers.get('retry-after'));
  if (!(res.headers.get('content-type') || '').includes('event-stream')) {
    const text = await res.text();
    if (!text.trim()) throw new AIError(`Réponse vide de ${providerName} (souvent une limite de requêtes). Réessaie.`, { retryable: true });
    return JSON.parse(text);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const data = t.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event.error) throw httpError(event.error.code || 500, JSON.stringify(event), providerName);
    onEvent(event);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    }
    handle(buffer);
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError(`La connexion avec ${providerName} a été coupée pendant la réponse.`, { retryable: true, network: true });
  }
  return null;
}

async function callGemini({ apiKey, model, system, user, maxTokens, progress }) {
  const url = `${PROVIDERS.google.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  let text = '';
  let blocked = null;
  const full = await postStream(url, { 'x-goog-api-key': apiKey }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
  }, 'Google', (event) => {
    if (event.promptFeedback?.blockReason) blocked = event.promptFeedback.blockReason;
    const parts = event.candidates?.[0]?.content?.parts || [];
    for (const p of parts) if (p.text && !p.thought) text += p.text;
    progress({ phase: 'writing', chars: text.length });
  });
  if (full) {
    const cand = full.candidates?.[0] || (Array.isArray(full) ? full[0]?.candidates?.[0] : null);
    text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  }
  if (!text) throw new AIError(`Google n'a renvoyé aucun texte (${blocked || 'raison inconnue'}).`, { retryable: true });
  return text;
}

async function callOpenAICompatible({ apiKey, model, system, user, baseUrl, providerName, progress }) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    stream: true,
  };
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  let text = '';
  const onEvent = (event) => {
    text += event.choices?.[0]?.delta?.content || '';
    progress({ phase: 'writing', chars: text.length });
  };
  let full;
  try {
    full = await postStream(url, headers, body, providerName, onEvent);
  } catch (err) {
    // Certains serveurs compatibles ne connaissent pas response_format : on réessaie sans.
    if (!/response_format/i.test(err.message)) throw err;
    delete body.response_format;
    text = '';
    full = await postStream(url, headers, body, providerName, onEvent);
  }
  if (full) text = full.choices?.[0]?.message?.content || '';
  return text;
}

// Modèle léger du fournisseur (le dernier proposé : flash-lite, haiku, mini…), pour les tâches courtes comme les
// discussions sur Kop : il ménage le quota du modèle choisi. Le modèle choisi quand le fournisseur n'en propose pas.
function lightModel(settings) {
  const list = PROVIDERS[settings.provider]?.models || [];
  return list.length > 1 ? list[list.length - 1] : settings.model;
}

// Modèles dont le quota du jour est épuisé (limite sans délai de reprise) : pendant une heure, on passe directement
// au suivant au lieu de le redemander à chaque étape de la synchro.
const exhausted = new Map();
const EXHAUSTED_FOR = 60 * 60 * 1000;
const isExhausted = (provider, model) => (exhausted.get(`${provider}|${model}`) || 0) > Date.now();
// Quota du jour : pas de délai, ou un délai trop long pour attendre (Google en donne un, par exemple « 19h55m »).
const isDailyQuota = (err) => Boolean(err?.limit) && !(err.retryAfter > 0 && err.retryAfter <= MAX_WAIT);

// Plus aucun modèle : on dit combien ont été essayés, car le message du premier laisserait croire qu'il était le seul.
function noModelLeft(provider, failed) {
  const refused = failed.filter((e) => e.retryable);
  if (failed.length < 2 || !refused.length) return failed[0];
  const who = PROVIDERS[provider]?.label.split(' ')[0] || 'Le fournisseur';
  if (refused.every(isDailyQuota)) return new AIError(`Quota du jour épuisé chez ${who} : ${failed.length} modèles essayés.`, { retryable: true, limit: true });
  return new AIError(`${who} ne répond pas pour le moment : ${failed.length} modèles essayés, tous surchargés ou limités.`, { retryable: true });
}

async function complete(settings, apiKey, { system, user, maxTokens = 16000, log, onProgress, light = false }) {
  const { provider } = settings;
  const first = light ? lightModel(settings) : settings.model;
  // Le modèle voulu, puis les autres proposés pour ce fournisseur (modèle surchargé ou limité) ; ceux dont le quota
  // du jour est épuisé passent en dernier.
  const order = [first, settings.model, ...(PROVIDERS[provider]?.models || []), ...(PROVIDERS[provider]?.backups || [])].filter((m, i, all) => m && all.indexOf(m) === i);
  const models = [...order.filter((m) => !isExhausted(provider, m)), ...order.filter((m) => isExhausted(provider, m))];
  if (models[0] !== first) log?.(`Quota du jour de ${first} épuisé : ${models[0]} répond à sa place.`);
  let firstErr = null;
  const failed = [];
  for (const [i, model] of models.entries()) {
    if (i > 0) {
      log?.(`Le modèle ${models[i - 1]} ne répond pas (${firstErr.message}). Essai avec ${model}…`);
      onProgress?.({ model, phase: 'fallback', from: models[i - 1] });
    }
    try {
      return await completeWith(settings, model, apiKey, { system, user, maxTokens, onProgress, log: i === 0 ? log : undefined });
    } catch (err) {
      if (isDailyQuota(err)) exhausted.set(`${provider}|${model}`, Date.now() + EXHAUSTED_FOR);
      // Le premier modèle tranche : clé refusée, modèle mal écrit ou pas de réseau, les autres n'y changeraient rien.
      // Ensuite, un modèle retiré par le fournisseur ou fermé à cette clé est simplement sauté.
      if (!(err instanceof AIError) || (i === 0 && (!err.retryable || err.network))) throw err;
      failed.push(err);
      firstErr ??= err;
    }
  }
  throw noModelLeft(provider, failed);
}

async function completeWith(settings, model, apiKey, { system, user, maxTokens, onProgress, log }) {
  const { provider } = settings;
  if (!model) throw new AIError('Aucun modèle choisi dans les réglages.');
  if (!apiKey && provider !== 'custom') throw new AIError("Aucune clé d'IA enregistrée. Ajoute-la dans les réglages.");
  const progress = throttled(onProgress, model);
  const run = () => {
    switch (provider) {
      case 'anthropic': return callAnthropic({ apiKey, model, system, user, maxTokens: Math.max(maxTokens, 32000), progress });
      case 'google': return callGemini({ apiKey, model, system, user, maxTokens, progress });
      case 'custom':
        if (!settings.baseUrl) throw new AIError("Renseigne l'adresse (Base URL) du fournisseur personnalisé.");
        return callOpenAICompatible({ apiKey, model, system, user, baseUrl: settings.baseUrl, providerName: 'le fournisseur', progress });
      default: {
        const p = PROVIDERS[provider];
        if (!p) throw new AIError(`Fournisseur inconnu : ${provider}`);
        return callOpenAICompatible({ apiKey, model, system, user, baseUrl: p.baseUrl, providerName: p.label.split(' ')[0], progress });
      }
    }
  };
  // Les erreurs passagères (serveur) sont réessayées deux fois avec attente croissante. Une limite de requêtes (429) :
  // on attend le délai donné par le serveur (une minute au plus) et on réessaie une fois ; sans délai (quota du jour),
  // réessayer ne ferait qu'user le quota : on laisse complete() passer au modèle suivant.
  for (let attempt = 0; ; attempt++) {
    progress({ phase: 'waiting', chars: 0, attempt }, true);
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof AIError) || !err.retryable || attempt >= 2 || provider === 'anthropic') throw err;
      if (err.limit && (!(err.retryAfter > 0) || err.retryAfter > MAX_WAIT || attempt >= 1)) throw err;
      const wait = err.limit ? Math.ceil(err.retryAfter) + 1 : 4 * (attempt + 1);
      if (err.limit) log?.(`Limite de requêtes de ${model} : nouvel essai dans ${wait} s.`);
      progress({ phase: 'retry', attempt: attempt + 1, error: err.message, wait: err.limit ? wait : undefined }, true);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}
const MAX_WAIT = 60; // secondes : au-delà, on ne bloque pas la synchro à attendre

// Transcription d'une dictée, à la demande du joueur et jamais pendant une synchro : l'audio part chez Gemini, seul
// fournisseur à l'accepter ici. Le modèle léger d'abord, pour ménager le quota. Rend le texte, '' si personne ne parle.
const NO_SPEECH = '(rien)';
async function transcribe(settings, apiKey, { audio, prompt, mimeType = 'audio/wav' }) {
  if (settings.provider !== 'google') throw new AIError('La dictée passe par Gemini : choisis Google AI Studio dans les réglages.');
  if (!apiKey) throw new AIError("Aucune clé d'IA enregistrée. Ajoute-la dans les réglages.");
  const order = [lightModel(settings), settings.model, ...PROVIDERS.google.models].filter((m, i, all) => m && all.indexOf(m) === i);
  const models = [...order.filter((m) => !isExhausted('google', m)), ...order.filter((m) => isExhausted('google', m))];
  let firstErr = null;
  for (const model of models) {
    try {
      let res;
      try {
        res = await fetch(`${PROVIDERS.google.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: audio } }] }], generationConfig: { temperature: 0, maxOutputTokens: 4000 } }),
        });
      } catch {
        throw new AIError('Impossible de joindre Google. Vérifie ta connexion.', { retryable: true, network: true });
      }
      const text = await res.text();
      if (!res.ok) throw httpError(res.status, text, 'Google', res.headers.get('retry-after'));
      const out = (JSON.parse(text).candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
      if (!out) throw new AIError("Google n'a renvoyé aucun texte. Réessaie.", { retryable: true });
      return out === NO_SPEECH ? '' : out;
    } catch (err) {
      if (err instanceof AIError && err.limit && !(err.retryAfter > 0 && err.retryAfter <= MAX_WAIT)) exhausted.set(`google|${model}`, Date.now() + EXHAUSTED_FOR);
      if (!(err instanceof AIError) || !err.retryable || err.network) throw err;
      firstErr ??= err;
    }
  }
  throw firstErr;
}

// Extrait le premier objet JSON de la réponse (certains modèles ajoutent du texte ou des ```).
function parseJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); } catch { /* on cherche l'objet */ }
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* invalide */ }
  }
  throw new AIError("La réponse de l'IA n'était pas lisible (JSON invalide). Relance la synchro.", { retryable: true });
}

module.exports = { PROVIDERS, AIError, complete, transcribe, parseJson, isDailyQuota };
