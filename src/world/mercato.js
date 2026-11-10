'use strict';
// Mercato : les effectifs de tous les clubs sont lus dans la sauvegarde ; en les comparant d'une synchro
// à l'autre, on sait qui a changé de club. Les sélections nationales (dont les joueurs figurent aussi
// dans l'effectif de leur club) sont mises à part.

const BIG_LEAGUES = [0x11, 0x12, 0x13, 0x14, 0x32, 0x15, 0x16];

// Une équipe dont presque tous les joueurs figurent déjà dans l'effectif d'une équipe précédente est une sélection.
function nationalTeams(teams) {
  const seen = new Set();
  const national = new Set();
  for (const t of [...teams.values()].sort((a, b) => a.index - b.index)) {
    const shared = t.roster.filter((id) => seen.has(id)).length;
    if (t.roster.length >= 5 && shared / t.roster.length >= 0.7) national.add(t.ref);
    for (const id of t.roster) seen.add(id);
  }
  return national;
}

// Club de chaque joueur : identifiant -> ref d'équipe (premier club qui le liste, hors sélections).
function clubMap(career) {
  const national = nationalTeams(career.teams);
  const map = {};
  for (const t of [...career.teams.values()].sort((a, b) => a.index - b.index)) {
    if (national.has(t.ref)) continue;
    for (const id of t.roster) if (!(id in map)) map[id] = t.ref;
  }
  return map;
}

function watchedTeams(career, clubRef, leagueId) {
  const comps = new Set([leagueId, ...BIG_LEAGUES]);
  const set = new Set([clubRef]);
  for (const m of career.matches) {
    if (comps.has(m.competitionId)) { set.add(m.home.ref); set.add(m.away.ref); }
  }
  return set;
}

// Transferts entre la synchro précédente et celle-ci (joueurs connus de la base, clubs suivis).
function detectTransfers(previous, current, career, { clubRef, leagueId, nameOf, gameDate }) {
  if (!previous) return [];
  const watched = watchedTeams(career, clubRef, leagueId);
  const out = [];
  for (const [id, to] of Object.entries(current)) {
    const from = previous[id];
    if (from === undefined || from === to) continue;
    if (!watched.has(from) && !watched.has(to)) continue;
    const name = nameOf(Number(id));
    if (!name) continue;
    out.push({
      player: name,
      from: career.teams.get(from)?.name || null,
      to: career.teams.get(to)?.name || null,
      involvesMyClub: from === clubRef || to === clubRef,
      direction: to === clubRef ? 'arrivée' : from === clubRef ? 'départ' : null,
      gameDate,
    });
  }
  // Ton club d'abord, puis le reste.
  return out.sort((a, b) => Number(b.involvesMyClub) - Number(a.involvesMyClub));
}

// Fenêtres de transferts européennes (indicatif) : été (juillet-août) et hiver (janvier).
function windowOpen(gameDate) {
  const m = Number(String(gameDate).slice(5, 7));
  return m === 7 || m === 8 || m === 1;
}

module.exports = { clubMap, detectTransfers, windowOpen, nationalTeams };
