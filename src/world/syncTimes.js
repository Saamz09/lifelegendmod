'use strict';
// Durée habituelle de chaque étape de la synchro, apprise sur les dernières synchros réussies (par fournisseur d'IA).
// Elle sert à dire, dans la barre de progression, qu'une étape dure bien plus que d'habitude : le fournisseur est
// lent, la synchro n'est pas bloquée.

const KEEP = 5; // dernières durées gardées par étape
const MIN_EXTRA = 45000; // jamais « lent » avant 45 s de plus que d'habitude

const valid = (ms) => Number.isFinite(ms) && ms >= 0;

// Médiane des dernières durées de chaque étape (ms) chez ce fournisseur : { étape: ms }.
function usualTimes(history, provider) {
  const out = {};
  for (const [step, list] of Object.entries(history?.[provider] || {})) {
    const s = (Array.isArray(list) ? list : []).filter(valid).slice(-KEEP).sort((a, b) => a - b);
    if (s.length) out[step] = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }
  return out;
}

// L'historique avec les durées d'une synchro réussie en plus ({ étape: ms }), les plus anciennes oubliées.
function addTimes(history, provider, times) {
  const all = history && typeof history === 'object' ? { ...history } : {};
  const mine = { ...(all[provider] || {}) };
  for (const [step, ms] of Object.entries(times || {})) {
    if (valid(ms)) mine[step] = [...(Array.isArray(mine[step]) ? mine[step] : []), Math.round(ms)].slice(-KEEP);
  }
  all[provider] = mine;
  return all;
}

// Au bout de combien de temps une étape est « lente » : deux fois sa durée habituelle, et au moins 45 s de plus.
// 0 : pas encore d'habitude pour cette étape, on ne dit rien.
const slowAfter = (usual) => (usual > 0 ? Math.max(2 * usual, usual + MIN_EXTRA) : 0);

module.exports = { usualTimes, addTimes, slowAfter };
