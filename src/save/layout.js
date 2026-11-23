'use strict';
// Où sont les tables dans une sauvegarde Become a Legend. Celles du jeu (vanilla, Football Life) sont à des places
// connues ; des modules Lua du jeu (ceux de FL Mod Studio, le GigaPack de Matozanato : 2026-11-16, retour d'un joueur et
// sa propre sauvegarde BL00000001) agrandissent la sauvegarde (736 équipes, plus de compétitions et de matchs, des jours
// de calendrier plus longs) et chaque section se décale différemment. Ici, chaque table est retrouvée par sa forme quand
// les places connues ne tiennent pas. LifeLegend n'y écrit que ce qui a été essayé en jeu sur ce genre de sauvegarde :
// le style de jeu et la suspension (voir writePlaces). Le reste est refusé (assertStandard).

// Les places du jeu sans modules.
const STANDARD = {
  coach: 0x133A38,       // nom de l'entraîneur de l'équipe 0, fiches de 0x258 octets, numéro d'équipe u32 8 octets avant
  comp: 0x1F1DFE,        // nom de la 1re compétition, fiches de 0x314 octets, id u16 2 octets avant
  match: 0x329B08,       // 1er match, fiches de 0x254 octets commençant par la date
  matchCount: 13001,
  calendar: 0xA8D6CC,    // 365 jours à partir du 1er janvier, commençant par 0xFFFFFFFF
  calendarDay: 0x2C4,
  player: 0xB7E2C4,      // u32 id du joueur, nom à +8 ; club, contrat, salaire, parcours, dernier match… à des écarts fixes
  careerStart: 0x10C0078, // date de début de carrière à +4, id du joueur à +0x1C
};
const COACH_STRIDE = 0x258, COMP_STRIDE = 0x314, MATCH_STRIDE = 0x254;

const isDate = (d, o) => { if (o < 0 || o + 4 > d.length) return false; const y = d.readUInt16LE(o); return y >= 1990 && y <= 2100 && d[o + 2] >= 1 && d[o + 2] <= 12 && d[o + 3] >= 1 && d[o + 3] <= 31; };
const printable = (d, o) => o >= 0 && o < d.length && d[o] >= 0x21 && d[o] < 0xF8;
const plausibleId = (id) => id >= 1000 && id < 4000000;
// L'id en tête de la fiche du joueur. Un joueur créé peut porter un id au bit haut allumé (0x80000000 + numéro) : c'est
// lui que portent ses feuilles de match et son début de carrière (2026-11-16, sauvegarde d'un joueur d'Evoweb, Thiago
// Bennett à Fribourg, carrière faite avec FL Mod Studio ; l'id d'un vrai joueur suit 4 octets plus loin).
const playerIdOk = (id) => plausibleId(id) || (id >= 0x80000000 && id - 0x80000000 < 4000000);
const cstr = (d, o, n) => { let e = o; while (e < o + n && e < d.length && d[e]) e++; return d.toString('utf8', o, e); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Les places connues tiennent-elles ? La fiche du joueur (un id, son nom s'il est connu), une compétition, un match.
function standardFits(d, playerName) {
  const S = STANDARD;
  if (S.careerStart + 0x20 > d.length) return false;
  if (!playerIdOk(d.readUInt32LE(S.player))) return false;
  if (playerName && norm(cstr(d, S.player + 8, 61)) !== norm(playerName)) return false;
  return printable(d, S.comp) && isDate(d, S.match) && d.readUInt32LE(S.coach - 8) === 0;
}

// La fiche du joueur : son nom (celui de l'en-tête de la sauvegarde) 8 octets après un id plausible.
function findPlayer(d, playerName) {
  if (!playerName) return null;
  const needle = Buffer.from(`${playerName}\0`, 'utf8');
  for (let i = d.indexOf(needle); i >= 0; i = d.indexOf(needle, i + 1)) if (i >= 8 && playerIdOk(d.readUInt32LE(i - 8))) return i - 8;
  return null;
}
// Entraîneurs : 40 fiches de suite numérotées 0, 1, 2…
function findCoach(d) {
  for (let o = 8; o < d.length - COACH_STRIDE * 40; o += 2) {
    if (d.readUInt32LE(o - 8) !== 0 || d.readUInt32LE(o + COACH_STRIDE - 8) !== 1) continue;
    let k = 2; while (k < 40 && d.readUInt32LE(o + COACH_STRIDE * k - 8) === k) k++;
    if (k === 40) return o;
  }
  return null;
}
// Compétitions : 30 fiches de suite avec un nom lisible, puis on remonte aux fiches d'avant qui en ont un aussi.
function findComp(d) {
  for (let o = 2; o < d.length - COMP_STRIDE * 30; o += 2) {
    if (!printable(d, o) || d.readUInt16LE(o - 2) >= 0x1000) continue;
    let k = 1; while (k < 30 && printable(d, o + COMP_STRIDE * k) && d.readUInt16LE(o + COMP_STRIDE * k - 2) < 0x1000) k++;
    if (k < 30) continue;
    while (printable(d, o - COMP_STRIDE) && o - COMP_STRIDE >= 2) o -= COMP_STRIDE;
    return o;
  }
  return null;
}
// Matchs : la plus longue suite de fiches qui commencent par une date ; la table continue tant que des dates reviennent
// (des places vides entre deux) et s'arrête après 512 places de suite sans date.
function findMatches(d) {
  let best = null;
  for (let o = 0; o < d.length - MATCH_STRIDE * 50; o += 2) {
    if (!isDate(d, o)) continue;
    let k = 1; while (isDate(d, o + MATCH_STRIDE * k)) k++;
    if (k >= 50 && (!best || k > best[1])) best = [o, k];
    if (k >= 50) o += MATCH_STRIDE * k - 2;
  }
  if (!best) return null;
  const [start] = best;
  let count = 0, empty = 0;
  for (let i = 0; start + MATCH_STRIDE * (i + 1) <= d.length && empty < 512; i++) {
    if (isDate(d, start + MATCH_STRIDE * i)) { count = i + 1; empty = 0; } else empty++;
  }
  return { start, count };
}
// Calendrier : la taille d'un jour se déduit des événements de mercato (types 3 à 8, une date), rangés par jour de
// l'année ; puis le 1er janvier, là où 365 jours de cette taille commencent tous par leur en-tête (0xFFFFFFFF puis
// autre chose : la fin de chaque jour est remplie de 0xFF, plus longue dans une sauvegarde agrandie, et ne doit pas
// passer pour un début).
const dayHeader = (d, o) => d.readUInt32LE(o) === 0xFFFFFFFF && d.readUInt32LE(o + 4) !== 0xFFFFFFFF;
const doy = (m, day) => Math.round((Date.UTC(2021, m - 1, day) - Date.UTC(2021, 0, 1)) / 864e5);
function calendarWindows(d, start, day) {
  let n = 0;
  for (let k = 0; k < 365; k++) for (let e = start + k * day + 8; e + 8 <= start + (k + 1) * day; e += 8) { const t = d.readUInt16LE(e); if (t === 0x3F) break; if (t >= 3 && t <= 8 && isDate(d, e + 4)) n++; }
  return n;
}
function findCalendar(d) {
  const ev = [];
  for (let o = 0; o < d.length - 8; o += 2) {
    const t = d.readUInt16LE(o);
    if (t < 3 || t > 8 || !isDate(d, o + 4) || ![1, 2, 6, 7, 8, 9, 12].includes(d[o + 6])) continue;
    ev.push([o, doy(d[o + 6], d[o + 7])]);
  }
  const votes = new Map();
  for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length && ev[j][0] - ev[i][0] < 0x800000; j++) {
    const days = ev[j][1] - ev[i][1];
    if (days < 20) continue;
    const s = Math.round((ev[j][0] - ev[i][0]) / days / 4) * 4;
    if (s >= 0x100 && s <= 0x2000) votes.set(s, (votes.get(s) || 0) + 1);
  }
  const strides = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  for (const guess of strides) {
    for (let day = guess - 16; day <= guess + 16; day += 4) {
      for (const [o, dy] of ev) {
        const approx = o - dy * day;
        for (let s = approx - day; s <= approx; s += 2) {
          if (s < 0 || s + 365 * day + 8 > d.length || !dayHeader(d, s)) continue;
          let k = 1; while (k < 365 && dayHeader(d, s + k * day)) k++;
          if (k === 365 && calendarWindows(d, s, day) >= 2) return { start: s, day };
        }
      }
    }
  }
  return null;
}
// Début de carrière : l'id du joueur à +0x1C d'une date à +4, après sa fiche.
function findCareerStart(d, player, id) {
  for (let o = player; o + 0x20 <= d.length; o += 4) if (d.readUInt32LE(o + 0x1C) === id && isDate(d, o + 4)) return o;
  return null;
}

// Les places des tables : { standard, coach, comp, match, matchCount, calendar, calendarDay, player, careerStart }.
// playerName : le nom du joueur dans l'en-tête de la sauvegarde (pour retrouver sa fiche).
function saveLayout(d, { playerName = null } = {}) {
  if (standardFits(d, playerName)) return { ...STANDARD, standard: true };
  return detectLayout(d, playerName);
}
// Chaque table cherchée par sa forme (exporté pour les tests : sur une sauvegarde du jeu sans modules, la détection
// doit retrouver les places connues).
function detectLayout(d, playerName) {
  const player = findPlayer(d, playerName);
  if (player == null) {
    const err = new Error('Sauvegarde agrandie par des modules (FL Mod Studio ou un autre pack) : la fiche de ton joueur est introuvable. Envoie un rapport (Réglages › À propos) : on regardera.');
    err.code = 'SAVE_LAYOUT';
    throw err;
  }
  const matches = findMatches(d);
  const cal = findCalendar(d);
  return {
    standard: false,
    player,
    coach: findCoach(d),
    comp: findComp(d),
    match: matches?.start ?? null,
    matchCount: matches?.count ?? 0,
    calendar: cal?.start ?? null,
    calendarDay: cal?.day ?? STANDARD.calendarDay,
    careerStart: findCareerStart(d, player, d.readUInt32LE(player)),
  };
}

// Les écritures (Influence, offres, sanction) ne sont vérifiées que sur les places du jeu sans modules.
function assertStandard(d, playerName = null) {
  if (!standardFits(d, playerName)) {
    const err = new Error('Ta sauvegarde a été agrandie par des modules (FL Mod Studio ou un autre pack) : LifeLegend la lit, mais n’y écrit pas encore. Rien n’a été modifié.');
    err.code = 'SAVE_LAYOUT';
    throw err;
  }
}

// Où écrire. Sauvegarde du jeu sans modules : les places connues. Sauvegarde agrandie : seulement pour une écriture déjà
// essayée en jeu sur ce genre de sauvegarde (enlarged), avec la table des entraîneurs et la fiche du joueur (son nom :
// playerName, celui de l'en-tête) retrouvées par leur forme (null si introuvables). Essais du 2026-11-23 sur le GigaPack
// de Matozanato (Accrington) : le style de jeu et une suspension écrits ont été affichés, puis gardés par la sauvegarde
// du jeu.
function writePlaces(d, { enlarged = false, playerName = null } = {}) {
  if (standardFits(d)) return { standard: true, coach: STANDARD.coach, player: STANDARD.player };
  if (!enlarged) assertStandard(d);
  return { standard: false, coach: findCoach(d), player: findPlayer(d, playerName) };
}

module.exports = { saveLayout, detectLayout, assertStandard, standardFits, writePlaces, STANDARD };
