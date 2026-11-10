'use strict';
// Lecture d'une sauvegarde Become a Legend (BL00000000) de PES 2021 / Football Life.
// Offsets établis par rétro-ingénierie ; identiques en vanilla et en Football Life 2026.

const fs = require('fs');
const { decryptSave } = require('./pesCrypt');
const { readPlayerProfile } = require('./playerProfile');
const { readPhase } = require('./formations');
const { readTraining } = require('./training');

const TEAM_STRIDE = 0x690;      // bloc équipe : ref u32 à +0x50, nom à +0x54, sigle à +0x9A, stade à +0xA0
const ROSTER_OFFSET = 0x19C;    // effectif : paires [u32 numéro interne][u32 id joueur], 40 places au plus
const ROSTER_MAX = 40;
const TACTIC_A = 0x4B0;         // tactiques A et B du club (+0x4B0, +0x550) : 3 phases de 33 octets puis 61 octets de réglages
const COACH_TABLE = 0x133A38;   // nom de l'entraîneur de l'équipe 0 ; slot u32 à nom-8
const COACH_STRIDE = 0x258;
const COMP_TABLE = 0x1F1DFE;    // nom de la 1re compétition ; id u16 à nom-2
const COMP_STRIDE = 0x314;
const MATCH_TABLE = 0x329B08;    // 1er match (même numérotation que le jeu)
const MATCH_STRIDE = 0x254;
const MATCH_COUNT = 13001;
const PLAYER_REC = 0xB7E2C4;    // u32 id du joueur, nom à +8
const PLAYER_CLUB = 0xB7E3C0;   // ref d'équipe du club actuel ; ref de la sélection nationale juste après ;
                                // fin de contrat à +0x0C, salaire / 100 € à +0x30
const LAST_MATCH = 0xBE6388;    // compte rendu du dernier match joué : u32 numéro dans la table des matchs, puis date
const LAST_MATCH_SPAN = 0x2000; // compositions puis journal des buts (enregistrements de 40 octets)
const SLOTS_PER_SIDE = 17;      // 11 titulaires + 6 remplaçants
const CALENDAR = 0xA8D6CC;      // 365 cases d'un jour (0x2C4 octets) à partir du 1er janvier : u32 0xFFFFFFFF, u32, puis
const CALENDAR_DAY = 0x2C4;      // événements de 8 octets [u16 type][i16 param][date], type 0x3F = fin de liste
const CAREER_START_REC = 0x10C0078; // date de début de carrière à +4, id du joueur à +0x1C (vu sur les carrières vanilla en 1re saison)

const cstr = (buf, start, len) => {
  const b = buf.subarray(start, start + len);
  const end = b.indexOf(0);
  return b.subarray(0, end < 0 ? b.length : end).toString('utf8');
};
const pad = (n) => String(n).padStart(2, '0');

// Le jeu vanilla écrit beaucoup de noms en capitales (« M. DEPAY », « STADE DE REIMS »).
// On les remet en casse normale, en gardant les sigles (PSG, RC, OL…) et les particules en minuscules.
const ABBREVIATIONS = new Set(['AS', 'AC', 'OL', 'OM', 'US', 'AZ', 'AEK', 'AFC', 'CA', 'SE', 'EC', 'IF', 'IK', 'UD', 'CD', 'AD', 'AA', 'OGC', 'AJ', 'AJA', 'UE', 'CE', 'SL', 'UC', 'RB', 'WB', 'LB', 'CB', 'RN', 'II', 'III']);
const PARTICLES = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'DI', 'DA', 'DEL', 'DELLA', 'VAN', 'VON', 'DEN', 'DER', 'Y', 'E', 'D', 'L']);
function prettyName(raw) {
  const s = raw && raw.trim();
  if (!s || !/\p{Lu}/u.test(s) || /\p{Ll}/u.test(s)) return s;
  let prev = null;
  return s.replace(/[\p{L}.]+/gu, (word) => {
    const before = prev;
    prev = word;
    const letters = word.replace(/\./g, '');
    if (word.endsWith('.') && letters.length <= 2) return word;                   // initiale : « M. »
    // Particule en minuscule au milieu d'un nom (« Stade de Reims »), mais pas juste après
    // une initiale où elle commence le nom de famille (« M. Der Zakarian »).
    if (before && !before.endsWith('.') && PARTICLES.has(letters)) return word.toLowerCase();
    if (ABBREVIATIONS.has(letters) || (letters.length <= 3 && !/[AEIOUYÀ-ÖØ-Ý]/.test(letters))) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}

function readDescription(desc) {
  const parts = desc.toString('utf8').split(/[\0\n]+/).map((s) => s.trim()).filter(Boolean);
  const info = { slot: parts[0] || null };
  if (parts.length >= 4) {
    info.player = prettyName(parts[1]);
    const [club, ...league] = parts[2].split(' / ');
    info.club = prettyName(club);
    info.league = league.join(' / ');
    const [d, m, y] = parts[3].split('/').map(Number);
    if (y) info.date = `${y}-${pad(m)}-${pad(d)}`;
  }
  return info;
}

function readTeams(d) {
  const teams = new Map();
  for (let k = 0; k < 4096; k++) {
    const o = TEAM_STRIDE * k;
    if (o + 0x9A > d.length || d[o + 0x54] === 0 || d[o + 0x54] === 0xFF) break;
    const ref = d.readUInt32LE(o + 0x50);
    const team = {
      ref,
      id: ref >>> 14,
      slot: ref & 0x3FFF,
      name: prettyName(cstr(d, o + 0x54, 0x46)),
      short: cstr(d, o + 0x9A, 4) || null,
      stadium: cstr(d, o + 0xA0, 0x80) || null,
      coach: null,
    };
    // Écusson importé par l'option file : numéro du fichier TEMBLEM de la sauvegarde (0xFFFF = aucun).
    const slot = d.readUInt16LE(o + 0x2E8);
    team.emblemSlot = slot === 0xFFFF ? null : slot;
    team.roster = [];
    for (let r = 0; r < ROSTER_MAX; r++) {
      const e = o + ROSTER_OFFSET + 8 * r;
      const slot = d.readUInt32LE(e) & 0xFFFF, pid = d.readUInt32LE(e + 4);
      if (slot === 0xFFFF || pid < 1000 || pid > 1000000) break;
      team.roster.push(pid);
    }
    team.index = k;
    // Formation de la tactique A (1re phase), celle du plan de jeu : voir formations.js.
    team.formation = readPhase(d, o + TACTIC_A);
    const c = COACH_TABLE + COACH_STRIDE * team.slot;
    if (c + 0x40 < d.length && d.readUInt32LE(c - 8) === team.slot) team.coach = prettyName(cstr(d, c, 0x40)) || null;
    teams.set(ref, team);
  }
  return teams;
}

function readCompetitions(d) {
  const comps = new Map();
  for (let o = COMP_TABLE; o < d.length && d[o] >= 0x20 && d[o] < 0xF8; o += COMP_STRIDE) {
    const id = d.readUInt16LE(o - 2);
    if (!comps.has(id)) comps.set(id, cstr(d, o, 0x46));
  }
  return comps;
}

// Logo de chaque compétition : numéro du fichier emblemLc du jeu (u16 à nom+0x7E).
function readCompetitionLogos(d) {
  const logos = new Map();
  for (let o = COMP_TABLE; o < d.length && d[o] >= 0x20 && d[o] < 0xF8; o += COMP_STRIDE) {
    const id = d.readUInt16LE(o - 2);
    if (!logos.has(id)) logos.set(id, d.readUInt16LE(o + 0x7E));
  }
  return logos;
}

function readLineup(d, o) {
  const out = [];
  for (let k = 0; k < SLOTS_PER_SIDE; k++) {
    const e = o + 16 * k;
    const slot = d.readUInt32LE(e), playerId = d.readUInt32LE(e + 4);
    if (slot === 0xFFFF || playerId === 0) continue;
    const events = d.readUInt32LE(e + 8), packed = d.readUInt32LE(e + 12);
    out.push({
      playerId,
      // Titulaire : bit 21. Les 11 premières places de la feuille de match ne sont pas toujours les titulaires
      // (vérifié sur 1 032 compositions : 11 titulaires à chaque fois avec ce bit, la moitié fausses avec les places).
      starter: ((packed >>> 21) & 1) === 1,
      // Poste joué dans ce match (bits 14-17) : 0 gardien, 1 défenseur central, 2 latéral, 3 milieu défensif,
      // 4 milieu central, 5 milieu latéral, 6 milieu offensif, 7 second attaquant, 8 ailier, 9 avant-centre.
      // Le côté (gauche, droite) n'est pas dans ce champ.
      pos: (packed >>> 14) & 0xF,
      minutes: packed & 0x7F,
      ratingRaw: (packed >>> 8) & 0x3F, // échelle encore à calibrer
      goals: events & 0xFF,
      assists: (events >>> 8) & 0xFF,
    });
  }
  return out;
}

function readMatches(d, teams, comps) {
  const matches = [];
  for (let i = 0; i < MATCH_COUNT; i++) {
    const o = MATCH_TABLE + i * MATCH_STRIDE;
    if (o + MATCH_STRIDE > d.length) break;
    const year = d.readUInt16LE(o);
    if (year < 2000 || year > 2100) continue;
    // Compétition (16 bits bas) et journée (8 bits suivants) : le u32 juste AVANT la date. Lu autrefois en fin de fiche
    // (+0x250), c'est-à-dire celui du match suivant : une journée sur deux héritait d'un match de la précédente.
    const comp = d.readUInt32LE(o - 4);
    const homeRef = d.readUInt32LE(o + 0x0C), awayRef = d.readUInt32LE(o + 0x10);
    const teamOf = (ref) => teams.get(ref) || { ref, id: ref >>> 14, slot: ref & 0x3FFF, name: null, coach: null };
    const m = {
      key: i,
      date: `${year}-${pad(d[o + 2])}-${pad(d[o + 3])}`,
      hour: d.readUInt32LE(o + 8),
      competitionId: comp & 0xFFFF,
      competition: comps.get(comp & 0xFFFF) || null,
      round: (comp >>> 16) & 0xFF,
      home: teamOf(homeRef),
      away: teamOf(awayRef),
    };
    // Match joué = compositions enregistrées des deux côtés. Le bit 30 du champ compétition, utilisé avant,
    // n'est pas fiable : absent sur des matchs joués (matchs aller des barrages de Ligue des champions) et
    // présent sur des matchs retour encore à jouer (lus alors comme des 0-0 sans joueurs).
    const homeLineup = readLineup(d, o + 0x1C), awayLineup = readLineup(d, o + 0x1C + 16 * SLOTS_PER_SIDE);
    m.played = homeLineup.length >= 7 && awayLineup.length >= 7;
    if (m.played) {
      m.score = [d[o + 0x14], d[o + 0x17]];
      m.homeLineup = homeLineup;
      m.awayLineup = awayLineup;
    }
    matches.push(m);
  }
  matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.hour - b.hour));
  return matches;
}

// Matchs d'une compétition entre ses vraies équipes. La sauvegarde contient parfois un
// enregistrement isolé qui porte l'identifiant du championnat avec deux équipes étrangères
// (ex. Levante en Ligue 1) : on ne garde que les équipes présentes dans au moins la moitié
// des matchs de l'équipe la plus présente.
function competitionMatches(matches, competitionId) {
  const ms = matches.filter((m) => m.competitionId === competitionId);
  const count = new Map();
  for (const m of ms) for (const t of [m.home.ref, m.away.ref]) count.set(t, (count.get(t) || 0) + 1);
  const max = Math.max(0, ...count.values());
  return ms.filter((m) => count.get(m.home.ref) * 2 >= max && count.get(m.away.ref) * 2 >= max);
}

function leagueTable(matches, competitionId) {
  const rows = new Map();
  const row = (team) => {
    if (!rows.has(team.ref)) rows.set(team.ref, { ref: team.ref, team: team.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
    return rows.get(team.ref);
  };
  for (const m of competitionMatches(matches, competitionId)) {
    row(m.home); row(m.away);
    if (!m.played) continue;
    for (const [team, gf, ga] of [[m.home, m.score[0], m.score[1]], [m.away, m.score[1], m.score[0]]]) {
      const r = row(team);
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += 3; r.form.push('V'); }
      else if (gf === ga) { r.d++; r.pts += 1; r.form.push('N'); }
      else { r.l++; r.form.push('D'); }
    }
  }
  const table = [...rows.values()].sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || String(a.team).localeCompare(String(b.team)));
  table.forEach((r, i) => { r.pos = i + 1; r.form = r.form.slice(-5); });
  return table;
}

// Classement des buteurs par identifiant (les noms des autres joueurs ne sont pas dans la sauvegarde).
function scorers(matches, competitionId) {
  const goals = new Map();
  for (const m of competitionMatches(matches, competitionId)) {
    if (!m.played) continue;
    for (const [team, lineup] of [[m.home, m.homeLineup], [m.away, m.awayLineup]]) {
      for (const e of lineup) {
        if (!e.goals) continue;
        const g = goals.get(e.playerId) || { playerId: e.playerId, team: team.name, goals: 0 };
        g.goals += e.goals;
        g.team = team.name;
        goals.set(e.playerId, g);
      }
    }
  }
  return [...goals.values()].sort((a, b) => b.goals - a.goals);
}

// Journal des buts du dernier match joué (le jeu n'en garde qu'un). Enregistrement de 40 octets :
// u32 ?, u32 minute, u32 ?, u32 type, u32 slot+u32 id du buteur, u32 slot+u32 id du passeur (0xFFFF/0 si aucun),
// f32 distance du tir en mètres, u32 drapeaux.
function readLastMatchEvents(d) {
  if (LAST_MATCH + LAST_MATCH_SPAN > d.length) return null;
  const matchKey = d.readUInt32LE(LAST_MATCH);
  const year = d.readUInt16LE(LAST_MATCH + 4);
  if (matchKey >= MATCH_COUNT || year < 2000 || year > 2100) return null;
  const goals = [];
  for (let o = LAST_MATCH + 8; o + 40 <= LAST_MATCH + LAST_MATCH_SPAN; o += 4) {
    const [first, minute, third, type, sSlot, sId, aSlot, aId] = [0, 4, 8, 12, 16, 20, 24, 28].map((k) => d.readUInt32LE(o + k));
    const distance = d.readFloatLE(o + 32);
    if (first > 1 || minute > 130 || third > 5 || type > 15) continue;
    if (sSlot < 0x900 || sSlot > 0x2FFF || sId < 1000 || sId > 1000000) continue;
    const noAssist = aSlot === 0xFFFF && aId === 0;
    if (!noAssist && (aSlot < 0x900 || aSlot > 0x2FFF || aId < 1000 || aId > 1000000)) continue;
    if (!(distance > 0.3 && distance < 80)) continue;
    goals.push({ minute, scorerId: sId, assistId: noAssist ? null : aId, distance: Math.round(distance), type });
    o += 36; // enregistrement suivant
  }
  goals.sort((a, b) => a.minute - b.minute);
  return { matchKey, goals };
}

// Parcours du joueur avant la saison en cours : premier club, club précédent, date d'arrivée,
// et débuts (en club puis en sélection). Enregistrements de débuts tous les 0x30 octets :
// u32 type (0 club, 2 sélection), u32 année, u32 mois, u32 compétition, u32 équipe, u32 adversaire.
function readDate(d, o) {
  const y = d.readUInt16LE(o), m = d[o + 2], day = d[o + 3];
  return y > 2000 && y < 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31 ? `${y}-${pad(m)}-${pad(day)}` : null;
}

function readPlayerHistory(d, teams, comps) {
  const team = (ref) => (ref === 0xFFFFFFFF ? null : teams.get(ref)?.name || null);
  const year = d.readUInt16LE(PLAYER_CLUB + 0x3C);
  const history = {
    firstClub: team(d.readUInt32LE(PLAYER_CLUB + 0x38)),
    previousClub: team(d.readUInt32LE(PLAYER_CLUB + 0x34)),
    joinedClub: year > 2000 && year < 2100 ? `${year}-${pad(d[PLAYER_CLUB + 0x3E])}-${pad(d[PLAYER_CLUB + 0x3F])}` : null,
    debuts: [],
  };
  for (let o = PLAYER_CLUB + 0x70; o <= PLAYER_CLUB + 0xA0; o += 0x30) {
    const kind = d.readUInt32LE(o), y = d.readUInt32LE(o + 4), m = d.readUInt32LE(o + 8);
    if ((kind !== 0 && kind !== 2) || y < 2000 || y > 2100 || m < 1 || m > 12) continue;
    history.debuts.push({
      kind: kind === 0 ? 'club' : 'national_team',
      date: `${y}-${pad(m)}`,
      competition: comps.get(d.readUInt32LE(o + 12)) || null,
      team: team(d.readUInt32LE(o + 16)),
      opponent: team(d.readUInt32LE(o + 20)),
    });
  }
  return history;
}

// Offres de contrat reçues par le joueur. La table n'a pas d'adresse fixe (vers 0x1217D8D en vanilla, 0x1282C02 en
// Football Life) : elle suit OFFER_MARKER, premier enregistrement à marqueur + 0x10.
// Enregistrements de 0x30 octets : u16 numéro à +0 (0xFFFF = emplacement libre : le jeu ignore ou efface l'offre),
// u32 ref du club à +4, état à +8 (1 = offre faite au joueur ; 2 = close ; 3 = acceptée, « Contrat planifié » dans le
// jeu : vu pour le Paris FC accepté le dernier jour du mercato, le 31/08/2021), u32 clé de
// carrière à +0x1C, id du joueur à +0x20, salaire / 100 € à +0x24, valeur de transfert du joueur / 100 € à +0x28
// (la même pour tous les clubs), fin du contrat proposé à +0x2C.
// Offres et négociations entre clubs partagent une suite de numéros : le jeu prend le plus petit numéro libre
// (Barry : négo Middlesbrough 0, offre 1, négo Heerenveen 2, offre 4…).
// L'offre d'un autre club n'est affichée par le jeu que si elle a aussi sa négociation (effacée à la fermeture du
// mercato, comme pour Nantes chez Augustin le 03/01/2021) et son bloc de date limite (voir DEADLINES). Une prolongation
// (offre du club actuel) n'a ni l'une ni l'autre ; acceptée, elle disparaît de la table. Acceptée hors mercato
// (Leeds pour Barry), une offre de transfert garde l'état 1 : cette acceptation-là ne se lit pas, seul le transfert
// se voit, au changement de club.
const OFFER_STRIDE = 0x30;
const OFFER_MARKER = Buffer.concat([Buffer.from('74450700', 'hex'), Buffer.alloc(12)]);
const OFFER_MAX = 40;
const OFFER_SEARCH_FROM = 0x1000000;
// Négociations entre clubs : 0xD5B8 octets après la ref du club de la 1re offre, enregistrements de 0x3C :
// u16 numéro à +4, ref du club acheteur à +8, ref du club vendeur à +0x20, id du joueur à +0x28.
const NEGO_FROM_OFFERS = 0xD5B8;
const NEGO_SIZE = 0x3C;
const NEGO_MAX = 64;
// Dates limites des offres d'autres clubs : 0x57F70 octets après le marqueur, 20 blocs de 100 octets
// [00][N][ff ff] puis 8 lignes de 12 octets [u16 numéro d'offre][01][x][date d'arrivée][date limite].
// La date limite est la fermeture du mercato en cours, ou du suivant pour une offre reçue hors mercato
// (Forest le 09/09/2020 : 31/01/2021). Vérifié en jeu le 16/10/2026 : une offre créée n'apparaît qu'avec ce bloc.
const DEADLINES = 0x57F70;
const DEADLINE_BLOCK = 100;
const DEADLINE_BLOCKS = 20;

function readOffers(d, teams, playerId, clubRef) {
  const m = d.indexOf(OFFER_MARKER, OFFER_SEARCH_FROM);
  if (m < 0) return [];
  const negotiating = new Set();
  for (let k = 0; k < NEGO_MAX; k++) {
    const o = m + 0x14 + NEGO_FROM_OFFERS + k * NEGO_SIZE;
    if (o + NEGO_SIZE > d.length) break;
    if (d.readUInt16LE(o + 4) !== 0xFFFF && d.readUInt32LE(o + 0x28) === playerId) negotiating.add(d.readUInt32LE(o + 8));
  }
  const deadlines = new Map();
  for (let b = 0; b < DEADLINE_BLOCKS; b++) {
    const o = m + DEADLINES + b * DEADLINE_BLOCK;
    if (o + DEADLINE_BLOCK > d.length || d[o] !== 0 || d[o + 2] !== 0xFF || d[o + 3] !== 0xFF) break;
    for (let k = 0; k < 8; k++) {
      const r = o + 4 + k * 12, id = d.readUInt16LE(r);
      if (id !== 0xFFFF && d[r + 2] === 1) deadlines.set(id, { receivedOn: readDate(d, r + 4), deadline: readDate(d, r + 8), dossier: d[o + 1] });
    }
  }
  const offers = [];
  for (let k = 0; k < OFFER_MAX; k++) {
    const o = m + 0x10 + k * OFFER_STRIDE;
    if (o + OFFER_STRIDE > d.length) break;
    const ref = d.readUInt32LE(o + 4);
    if (ref !== 0xFFFFFFFF && !teams.has(ref)) break; // fin de la table
    const id = d.readUInt16LE(o);
    if (id === 0xFFFF || ref === 0xFFFFFFFF || d.readUInt32LE(o + 0x20) !== playerId) continue;
    const open = d[o + 8] === 1 && (ref === clubRef || (negotiating.has(ref) && deadlines.has(id)));
    const planned = d[o + 8] === 3 && ref !== clubRef;
    offers.push({
      slot: k,
      id,
      clubRef: ref,
      club: teams.get(ref).name,
      status: planned ? 'accepted' : open ? 'pending' : 'closed',
      salary: d.readUInt32LE(o + 0x24) * 100,
      amount2: d.readUInt32LE(o + 0x28) * 100,
      contractUntil: readDate(d, o + 0x2C),
      receivedOn: deadlines.get(id)?.receivedOn || null,
      deadline: deadlines.get(id)?.deadline || null,
      // Dossier interne du jeu (N du bloc) : seules les vraies offres en ont un (255 = aucun). Sans dossier,
      // une offre acceptée ne mène jamais au transfert ; avec, on peut la réorienter vers un autre club.
      hasDossier: (deadlines.get(id)?.dossier ?? 0xFF) !== 0xFF,
    });
  }
  return offers;
}

// Salaire du contrat en cours (vérifié : passe de 4 041 500 € à 6 774 900 € quand Depay accepte la prolongation de l'OL).
function readSalary(d) {
  const raw = d.readUInt32LE(PLAYER_CLUB + 0x30);
  return raw > 0 && raw < 10000000 ? raw * 100 : null;
}

// Périodes de mercato du calendrier du jeu : types 3/4/5 = ouverture, veille de la fermeture, fermeture (été) ;
// 6/7/8 = la même chose en hiver. Même place en vanilla et en Football Life.
const WINDOW_EVENTS = { 3: ['ete', 'open'], 4: ['ete', 'eve'], 5: ['ete', 'close'], 6: ['hiver', 'open'], 7: ['hiver', 'eve'], 8: ['hiver', 'close'] };

function readTransferWindows(d) {
  const windows = new Map();
  for (let k = 0; k < 365; k++) {
    const o = CALENDAR + k * CALENDAR_DAY;
    if (o + CALENDAR_DAY > d.length || d.readUInt32LE(o) !== 0xFFFFFFFF) return [];
    for (let e = o + 8; e + 8 <= o + CALENDAR_DAY; e += 8) {
      const type = d.readUInt16LE(e);
      if (type === 0x3F) break;
      const ev = WINDOW_EVENTS[type];
      const date = ev && readDate(d, e + 4);
      if (!date) continue;
      const key = `${ev[0]}-${date.slice(0, 4)}`;
      const w = windows.get(key) || { kind: ev[0] === 'ete' ? 'été' : 'hiver' };
      w[ev[1]] = date;
      windows.set(key, w);
    }
  }
  return [...windows.values()].filter((w) => w.open && w.close).sort((a, b) => a.open.localeCompare(b.open));
}

// Clubs qui suivent le joueur (liste cachée du jeu, ~« Clubs intéressés ») : 0x56294 octets après la table des
// offres, enregistrements de 0x2C : u32 clé de carrière, u32 id du joueur, u32 ref du club, …, u8 à +0x1D (niveau ?),
// date de début de l'intérêt à +0x20, valeur du joueur pour ce club / 100 € à +0x24, u8 « offre faite » à +0x28.
// Le jeu vide la liste quand le joueur change de club. Vu sur Barry (Forest, Mouqabaram, Guingamp, Twente, Middlesbrough).
const INTERESTS_FROM_OFFERS = 0x56294;
const INTEREST_SIZE = 0x2C;

function readInterests(d, teams, playerId) {
  const m = d.indexOf(OFFER_MARKER, OFFER_SEARCH_FROM);
  if (m < 0) return [];
  const base = m + 0x14 + INTERESTS_FROM_OFFERS;
  const out = [];
  for (let k = 0; k < 64; k++) {
    const o = base + k * INTEREST_SIZE;
    if (o + INTEREST_SIZE > d.length) break;
    if (d.readUInt32LE(o + 4) !== playerId) continue;
    const club = teams.get(d.readUInt32LE(o + 8));
    if (!club) continue;
    out.push({
      clubRef: club.ref,
      club: club.name,
      since: readDate(d, o + 0x20),
      valuation: d.readUInt32LE(o + 0x24) * 100,
      offerMade: d[o + 0x28] === 1,
      level: d[o + 0x1D],
    });
  }
  return out;
}

// Footballeur de l'année, la récompense du jeu (vue dans Football Life 2027 le 2026-11-09 : Mbappé, 828 points, devant
// Haaland et Vinícius Júnior). Le jeu garde les dernières années dans des emplacements de 0x17D8 octets : u32 numéro de
// l'emplacement (0, 1, 2…), u32 année (0 tant qu'elle n'est pas décernée), puis le podium en enregistrements de 16 octets
// [u32 ?, u32 id du joueur, u32 ref de son club au moment du vote, u32 points], écrit deux fois. L'année de la carrière va
// dans l'emplacement 0, la précédente (créée au début de la carrière) dans le 1.
const POTY_TABLE = 0xBEE290;
const POTY_STRIDE = 0x17D8;
const POTY_SLOTS = 6;
const POTY_PODIUM = 3;
function readPlayerOfYear(d) {
  const out = [];
  for (let k = 0; k < POTY_SLOTS; k++) {
    const o = POTY_TABLE + k * POTY_STRIDE;
    if (o + 8 + POTY_PODIUM * 16 > d.length || d.readUInt32LE(o) !== k) break;
    const year = d.readUInt32LE(o + 4);
    if (year < 1990 || year > 2100) continue;
    const podium = [];
    for (let i = 0; i < POTY_PODIUM; i++) {
      const r = o + 8 + i * 16;
      const id = d.readUInt32LE(r + 4);
      if (!id || id === 0xFFFFFFFF) break;
      podium.push({ id, teamRef: d.readUInt32LE(r + 8), points: d.readUInt32LE(r + 12) });
    }
    if (podium.length) out.push({ year, podium });
  }
  return out.sort((a, b) => b.year - a.year);
}

function readCareer(savePath) {
  const file = decryptSave(fs.readFileSync(savePath));
  if (file.fileType !== 'BL') throw new Error(`Ce fichier est une sauvegarde « ${file.fileType} », pas Become a Legend (BL00000000).`);
  const d = file.data;
  const teams = readTeams(d);
  const competitions = readCompetitions(d);
  const competitionLogos = readCompetitionLogos(d);
  const matches = readMatches(d, teams, competitions);
  const clubRef = d.readUInt32LE(PLAYER_CLUB);
  const nationalTeam = teams.get(d.readUInt32LE(PLAYER_CLUB + 4));
  return {
    game: file.gameVersion,
    save: readDescription(file.description),
    player: {
      id: d.readUInt32LE(PLAYER_REC),
      name: prettyName(cstr(d, PLAYER_REC + 8, 61)),
      nationality: nationalTeam?.name || null,
      contractUntil: readDate(d, PLAYER_CLUB + 0x0C),
      salary: readSalary(d),
      history: readPlayerHistory(d, teams, competitions),
      offers: readOffers(d, teams, d.readUInt32LE(PLAYER_REC), clubRef),
      interests: readInterests(d, teams, d.readUInt32LE(PLAYER_REC)),
      profile: readPlayerProfile(d, PLAYER_REC),
      training: readTraining(d, PLAYER_REC - 48),
      careerStart: d.readUInt32LE(CAREER_START_REC + 0x1C) === d.readUInt32LE(PLAYER_REC) ? readDate(d, CAREER_START_REC + 4) : null,
    },
    club: teams.get(clubRef) || { ref: clubRef, name: null },
    // Sélection : son effectif est le groupe convoqué en cours (le jeu le met à jour à chaque rassemblement).
    nationalTeam: nationalTeam || null,
    teams,
    competitions,
    competitionLogos,
    matches,
    lastMatchEvents: readLastMatchEvents(d),
    transferWindows: readTransferWindows(d),
    playerOfYear: readPlayerOfYear(d),
  };
}

// Aperçu rapide d'une sauvegarde (joueur, club, date) sans tout déchiffrer.
function peekSave(savePath) {
  const file = decryptSave(fs.readFileSync(savePath), { descriptionOnly: true });
  return { fileType: file.fileType, game: file.gameVersion, ...readDescription(file.description) };
}

module.exports = { readCareer, peekSave, competitionMatches, leagueTable, scorers, prettyName, readPlayerOfYear, PLAYER_REC };
