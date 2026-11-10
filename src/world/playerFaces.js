'use strict';
// Les visages de LifeLegend : le nom affiché → l'image lue dans le jeu. L'interface ne demande que ceux qu'une page affiche, et
// seulement de vrais joueurs et entraîneurs : le nom d'un supporter ou d'un journaliste inventé ne passe jamais par ici.
// Un entraîneur se demande avec le préfixe « coach| » : un joueur et un entraîneur peuvent porter le même nom.

const path = require('path');
const { detectGameFolders, loadGameDb, loadDbTable } = require('../save/gameDb');
const { ensureFaces, ensureCoachFaces, parseCoaches } = require('../save/faces');
const { prettyName } = require('../save/blReader');

const MAX_ASKED = 400; // par demande : une page n'en affiche jamais autant
const COACH_KEY = 'coach|';

// Numéros de la base par nom, tels que LifeLegend affiche les noms. La base compte plus de 26 000 joueurs : calculé une fois.
const indexes = new WeakMap();
function nameIndex(names) {
  if (indexes.has(names)) return indexes.get(names);
  const byName = new Map();
  for (const [id, raw] of names) { const name = prettyName(raw); if (!byName.has(name)) byName.set(name, []); byName.get(name).push(id); }
  indexes.set(names, byName);
  return byName;
}

// Le numéro de chaque joueur demandé. Deux joueurs du même nom : celui de la sauvegarde (snapshot.playerIds), sinon personne, car
// un mauvais visage est pire que des initiales. Rend [[nom, numéro]].
function faceIdsFor(state, names, wanted) {
  const s = state?.snapshot;
  if (!s || !names || !wanted) return [];
  const byName = nameIndex(names);
  const out = [];
  for (const name of new Set(wanted)) {
    const list = byName.get(name) || [];
    const id = name === s.player?.name ? s.player.id : s.playerIds?.[name] ?? (list.length === 1 ? list[0] : null);
    if (id != null) out.push([name, id]);
  }
  return out;
}

// Le numéro de chaque entraîneur demandé, d'après la table du jeu. Deux entraîneurs du même nom : personne. Rend [[nom, numéro]].
function coachIdsFor(coaches, wanted) {
  const byName = new Map();
  for (const c of coaches || []) { const name = prettyName(c.name); byName.set(name, byName.has(name) ? null : c.id); }
  return [...new Set(wanted || [])].map((name) => [name, byName.get(name)]).filter(([, id]) => id);
}

// Le dossier du jeu : celui des réglages, sinon l'installation dont la base connaît le mieux cet effectif.
const dirCache = new Map();
function gameDirOf(state, settings) {
  if (settings?.gameDir) return settings.gameDir;
  const dirs = detectGameFolders();
  if (dirs.length <= 1) return dirs[0] || null;
  const key = `${state.careerId}|${dirs.join('|')}`;
  if (!dirCache.has(key)) {
    const squad = (state.snapshot?.squad || []).map((p) => p.name);
    let best = dirs[0], bestRate = -1;
    for (const d of dirs) {
      let rate = 0;
      try { const known = nameIndex(loadGameDb(d).names); rate = squad.filter((n) => known.has(n)).length; } catch { rate = 0; }
      if (rate > bestRate) { best = d; bestRate = rate; }
    }
    dirCache.set(key, best);
  }
  return dirCache.get(key);
}

// Rend { nom demandé : fichier du dossier faces de la carrière }. Sans jeu installé : rien, les initiales restent.
function playerFaces({ store, settings, names }) {
  if (!Array.isArray(names)) return {};
  const state = store.activeCareer();
  if (!state?.snapshot) return {};
  const gameDir = gameDirOf(state, settings);
  if (!gameDir) return {};
  const asked = names.filter((n) => typeof n === 'string' && n).slice(0, MAX_ASKED);
  const outDir = path.join(store.dir, 'careers', state.careerId, 'faces');
  const out = {};
  const db = loadGameDb(gameDir);
  if (db) {
    const pairs = faceIdsFor(state, db.names, asked.filter((n) => !n.startsWith(COACH_KEY)));
    const files = ensureFaces({ gameDir, ids: [...new Set(pairs.map(([, id]) => id))], outDir });
    for (const [name, id] of pairs) if (files[id]) out[name] = files[id];
  }
  const coaches = asked.filter((n) => n.startsWith(COACH_KEY)).map((n) => n.slice(COACH_KEY.length));
  if (coaches.length) {
    const pairs = coachIdsFor(parseCoaches(loadDbTable(gameDir, 'Coach.bin')?.data), coaches);
    const files = ensureCoachFaces({ gameDir, ids: pairs.map(([, id]) => id), outDir });
    for (const [name, id] of pairs) if (files[id]) out[`${COACH_KEY}${name}`] = files[id];
  }
  return out;
}

module.exports = { playerFaces, faceIdsFor, coachIdsFor };
