'use strict';
// La liste des modèles d'un fournisseur, demandée avec la clé du joueur (2026-11-23 : les noms changent tous les quelques
// mois, la liste écrite dans providers.js vieillit). Seuls les modèles qui écrivent du texte sont gardés : ceux de la
// liste de LifeLegend d'abord, les autres par ordre alphabétique. Seule la clé part, au fournisseur choisi.

const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.Anthropic || sdk.default || sdk;
const { PROVIDERS, AIError } = require('./providers');

const MAX = 300; // OpenRouter en propose des centaines : assez pour choisir, sans alourdir les réglages
const TIMEOUT = 15000;
// Modèles qui n'écrivent pas de texte (images, vidéo, voix, transcription, plongements, modération, recherche…).
const NOT_TEXT = /embed|banana|whisper|tts|transcri|audio|realtime|speech|voice|image|imagen|dall-e|veo|video|moderation|guard|rerank|ocr|search|live|robotics|computer-use|aqa/i;

// Ne garde que les modèles qui écrivent du texte, sans doublon, ceux de LifeLegend d'abord (puis, chez OpenRouter, les
// gratuits). Exporté pour les tests.
function textModels(provider, ids) {
  const p = PROVIDERS[provider] || {};
  let keep = ids.filter((id) => typeof id === 'string' && id && !NOT_TEXT.test(id));
  if (provider === 'openai') keep = keep.filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/instruct/.test(id));
  if (provider === 'google') keep = keep.filter((id) => /^gemini-/.test(id));
  const known = [...(p.models || []), ...(p.more || []), ...(p.backups || [])];
  const rank = (id) => { const k = known.indexOf(id); return k >= 0 ? k : provider === 'openrouter' && id.endsWith(':free') ? 1000 : 2000; };
  return [...new Set(keep)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, MAX);
}

const short = (provider) => (PROVIDERS[provider]?.label || 'le fournisseur').split(' ')[0];

async function getJson(url, headers, name, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    throw new AIError(`Impossible de joindre ${name}. Vérifie ta connexion.`, { network: true });
  }
  if (res.ok) return res.json();
  let detail = '';
  try { const b = await res.json(); detail = b?.error?.message || b?.message || ''; } catch { /* pas de JSON */ }
  if (res.status === 401 || res.status === 403) throw new AIError(`Clé ${name} refusée : ${detail || res.status}`);
  throw new AIError(`Erreur ${name} (${res.status}) : ${detail || 'liste des modèles indisponible'}`);
}

// { provider, apiKey, baseUrl (fournisseur « Autre ») } → les identifiants des modèles, triés.
async function listModels({ provider, apiKey, baseUrl = '', fetchImpl = fetch }) {
  const p = PROVIDERS[provider];
  if (!p) throw new AIError(`Fournisseur inconnu : ${provider}`);
  if (!apiKey && provider !== 'custom') throw new AIError("Aucune clé d'IA enregistrée. Ajoute-la dans les réglages.");
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT, maxRetries: 1, fetch: fetchImpl });
    const ids = [];
    try {
      // Les modèles en service seulement (sans ceux qu'Anthropic annonce comme bientôt retirés).
      for await (const m of client.models.list({ limit: 100, lifecycle: ['active'] })) ids.push(m.id);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AIError('Clé Anthropic refusée. Vérifie-la dans les réglages.');
      if (err instanceof Anthropic.APIConnectionError) throw new AIError('Impossible de joindre Anthropic. Vérifie ta connexion.', { network: true });
      if (err instanceof Anthropic.APIError) throw new AIError(`Erreur Anthropic (${err.status ?? '?'}) : ${err.message}`);
      throw err;
    }
    return textModels(provider, ids);
  }
  if (provider === 'google') {
    const body = await getJson(`${p.baseUrl}/models?pageSize=1000`, { 'x-goog-api-key': apiKey }, 'Google', fetchImpl);
    const ids = (body.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name || '').replace(/^models\//, ''));
    return textModels(provider, ids);
  }
  const base = provider === 'custom' ? baseUrl : p.baseUrl;
  if (!base) throw new AIError("Renseigne l'adresse (Base URL) du fournisseur personnalisé.");
  const name = provider === 'custom' ? 'le fournisseur' : short(provider);
  const body = await getJson(`${base.replace(/\/$/, '')}/models`, apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, name, fetchImpl);
  // Mistral dit pour chaque modèle s'il sait discuter ; les autres ne donnent que l'identifiant.
  const ids = (body.data || body.models || []).filter((m) => m?.capabilities?.completion_chat !== false).map((m) => m?.id);
  return textModels(provider, ids);
}

module.exports = { listModels, textModels };
