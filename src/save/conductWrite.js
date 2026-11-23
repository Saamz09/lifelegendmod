'use strict';
// Mise à l'écart décidée par le club (src/world/conduct.js) : LifeLegend écrit une suspension dans la fiche de son
// joueur, comme le jeu après un carton rouge. Fiche + 0xCE, un u16 : bits 11 à 13 = matchs de suspension restants,
// bit 15 = suspendu. Relevé le 2026-11-23 sur deux carrières (vrai carton rouge à Accrington, GigaPack : 0x0340 puis
// 0x9b41 pour 3 matchs, 0x9341 après un match purgé ; le bit 0, allumé aussi par le vrai rouge, n'est pas nécessaire).
// Essai en jeu le même jour : 2 matchs écrits, « Suspendu 2 match(es) » dans Composition, écarté du match, compteur à 1
// ensuite, gardé par la sauvegarde du jeu. Le jeu décompte les matchs et éteint le drapeau tout seul. Tant qu'il est
// suspendu (vrai rouge compris), le calendrier du menu montre chaque match en double : c'est l'affichage du jeu.
// Une suspension plus longue déjà là (vrai carton rouge) est gardée. Permis dans une sauvegarde agrandie (GigaPack) :
// la fiche y est retrouvée par le nom du joueur.
// L'ancienne écriture (jours d'indisponibilité, fiche + 280) ne tenait pas : le jeu remettait le compteur à 0 (essai du
// 2026-11-10, titulaire quand même).

const { writeInSave } = require('./influenceWrite');
const { peekSave } = require('./blReader');

const SUSPENSION = 0xCE, COUNT = 0x3800, SHIFT = 11, FLAG = 0x8000, MAX_MATCHES = 7;

// Matchs de suspension restants d'après le champ (0 si le drapeau est éteint).
const suspensionOf = (v) => (v & FLAG ? (v & COUNT) >> SHIFT : 0);

// at : la place de la fiche du joueur (writePlaces). Rend la copie modifiée, avant / après en matchs.
function suspensionInData(source, { playerId, matches, at }) {
  const d = Buffer.from(source);
  if (at == null || at + SUSPENSION + 2 > d.length || d.readUInt32LE(at) !== playerId) throw new Error('Ce n’est pas la sauvegarde de ton joueur : rien n’a été modifié.');
  const n = Math.max(1, Math.min(MAX_MATCHES, Math.round(Number(matches) || 0)));
  const v = d.readUInt16LE(at + SUSPENSION);
  const before = suspensionOf(v);
  const after = Math.max(before, n);
  d.writeUInt16LE((v & ~COUNT) | (after << SHIFT) | FLAG, at + SUSPENSION);
  return { data: d, before, after, changes: [`suspendu ${after} match(s) (avant : ${before})`] };
}

function applySuspension({ savePath, backupDir, playerId, matches }) {
  let at = null, after = null;
  return writeInSave({
    savePath,
    backupDir,
    tag: 'sanction',
    enlarged: true, // essayé en jeu sur le GigaPack le 2026-11-23 : affiché, décompté, gardé par la sauvegarde du jeu
    playerName: peekSave(savePath).player,
    edit: (data, places) => { at = places.player; const r = suspensionInData(data, { playerId, matches, at }); after = r.after; return r; },
    check: (d) => d.readUInt32LE(at) === playerId && suspensionOf(d.readUInt16LE(at + SUSPENSION)) === after,
  });
}

module.exports = { suspensionInData, suspensionOf, applySuspension, SUSPENSION };
