'use strict';
// Mise à l'écart décidée par le club (src/world/conduct.js) : LifeLegend écrit des jours d'indisponibilité dans sa fiche
// de Vers une Légende (fiche + 328, l'octet que lit src/save/playerProfile.js et que le jeu remplit pour une blessure),
// pour qu'il ne soit pas retenu tant qu'il en reste. Une indisponibilité plus longue déjà là (vraie blessure) est gardée.
// Jeu fermé, copie de sécurité, écriture puis relecture : le même chemin que l'Influence (writeInSave).
// Pas encore vu en jeu sur Football Life 2027 (2026-11-10) : le jeu l'affichera peut-être comme une blessure.

const { writeInSave } = require('./influenceWrite');
const { PLAYER_REC } = require('./blReader');

const PROFILE_BEFORE_ID = 48, UNAVAILABLE = 328, MAX_DAYS = 60;
const OFFSET = PLAYER_REC - PROFILE_BEFORE_ID + UNAVAILABLE;

function unavailableInData(source, { playerId, days }) {
  const d = Buffer.from(source);
  if (d.length <= OFFSET || d.readUInt32LE(PLAYER_REC) !== playerId) throw new Error('Ce n’est pas la sauvegarde de ton joueur : rien n’a été modifié.');
  const n = Math.max(1, Math.min(MAX_DAYS, Math.round(Number(days) || 0)));
  const before = d[OFFSET];
  d[OFFSET] = Math.max(before, n);
  return { data: d, before, after: d[OFFSET], changes: [`indisponible ${d[OFFSET]} jour(s) (avant : ${before})`] };
}

function applyUnavailable({ savePath, backupDir, playerId, days }) {
  let after = null;
  return writeInSave({
    savePath,
    backupDir,
    tag: 'sanction',
    edit: (data) => { const r = unavailableInData(data, { playerId, days }); after = r.after; return r; },
    check: (d) => d.readUInt32LE(PLAYER_REC) === playerId && d[OFFSET] === after,
  });
}

module.exports = { unavailableInData, applyUnavailable, OFFSET };
