'use strict';
// Ralentis sauvegardés par le jeu (REPLAY00000000…) : on n'en lit que la description,
// qui donne le match, la minute et le buteur. Les images du ralenti ne sont pas une vidéo :
// seul le moteur du jeu sait les rejouer.

const fs = require('fs');
const path = require('path');
const { decryptSave } = require('./pesCrypt');

// Description type (langue du jeu) :
// « Ralenti 01 » / « MONTPELLIER vs OLYMPIQUE LYONNAIS » / « Vers une Légende » / « Temps écoulé : 10 min » / « Buteur : M. DEPAY »
function parseReplayDescription(desc) {
  const lines = desc.toString('utf8').split(/[\0\n]+/).map((s) => s.trim()).filter(Boolean);
  const info = { title: lines[0] || null, home: null, away: null, minute: null, scorer: null, mode: null };
  for (const line of lines.slice(1)) {
    const teams = line.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    const minute = line.match(/(\d{1,3})\s*min/i);
    if (teams && !info.home) { info.home = teams[1].trim(); info.away = teams[2].trim(); }
    else if (minute && info.minute === null) info.minute = Number(minute[1]);
    else if (line.includes(':')) info.scorer = line.slice(line.indexOf(':') + 1).trim() || null;
    else if (!info.mode) info.mode = line;
  }
  return info;
}

function listReplays(saveDir) {
  let names = [];
  try { names = fs.readdirSync(saveDir).filter((n) => /^REPLAY[0-9A-F]{8}$/i.test(n)); } catch { return []; }
  const out = [];
  for (const name of names) {
    const file = path.join(saveDir, name);
    try {
      const stat = fs.statSync(file);
      const parsed = decryptSave(fs.readFileSync(file), { descriptionOnly: true });
      if (parsed.fileType !== 'REPLAY') continue;
      out.push({ key: `${name}|${Math.round(stat.mtimeMs)}`, file: name, savedAt: stat.mtimeMs, ...parseReplayDescription(parsed.description) });
    } catch {
      // Fichier en cours d'écriture ou illisible : il sera repris au prochain passage.
    }
  }
  return out.sort((a, b) => a.savedAt - b.savedAt);
}

module.exports = { listReplays, parseReplayDescription };
