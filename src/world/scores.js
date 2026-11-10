'use strict';
// Scores de tout le monde du jeu, pour Scoreline (rubriques Scores, Compétitions, Équipes) : tous les matchs de la
// saison, classements, buteurs, effectifs, buteurs et homme du match de chaque match joué, compositions récentes et
// joueur du mois. Trop gros pour l'état de la carrière : fichier à part (scores.json), refait à chaque synchro.
// Format compact (tableaux) : voir les commentaires de buildScores.

const { competitionMatches, leagueTable } = require('../save/blReader');
const { compAccount } = require('./competitions');
const { teamOfRound, playerRanking, rankingMinApps, periodEleven } = require('./awards');
const DATA = require('../data/competitionAccounts.json');

const ratingFromRaw = (raw) => Math.round(raw / 2.5) / 2; // même échelle que snapshot.js
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validHour = (h) => (Number.isInteger(h) && h >= 0 && h <= 23 ? h : null);
const LINEUP_DAYS = 45; // compositions gardées pour les matchs des 45 derniers jours (et tous ceux du club)

// Pays des compétitions connues (affiché comme sur les sites de scores). Les noms suivent le jeu sans patch.
const COUNTRY = {
  'Premier League': 'Angleterre', 'EFL Championship': 'Angleterre', 'Emirates FA Cup': 'Angleterre', 'FA Community Shield': 'Angleterre',
  'Serie A TIM': 'Italie', 'Serie BKT': 'Italie', 'Coppa Italia': 'Italie', 'LaLiga Santander': 'Espagne', 'LaLiga 2': 'Espagne', 'Copa Del Rey': 'Espagne',
  'Ligue 1 Uber Eats': 'France', 'Ligue 2 BKT': 'France', 'Coupe de France': 'France', 'Bundesliga': 'Allemagne', 'DFB-Pokal': 'Allemagne',
  'Eredivisie': 'Pays-Bas', 'TOTO KNVB Beker': 'Pays-Bas', 'Liga NOS': 'Portugal', 'Taça de Portugal': 'Portugal', 'Jupiler Pro League': 'Belgique', 'Croky Cup': 'Belgique',
  'Scottish Premiership': 'Écosse', 'William Hill Scottish Cup': 'Écosse', 'Süper Lig': 'Turquie', 'Ziraat Türkiye Kupasi': 'Turquie',
  'Tinkoff Russian Premier Liga': 'Russie', 'Rambler Russian Cup': 'Russie', 'Raiffeisen Super League': 'Suisse', 'Schweizer Cup': 'Suisse',
  'Superliga': 'Danemark', 'DBU Pokalen': 'Danemark', 'Liga Profesional de Fútbol': 'Argentine', 'Copa TOTAL Argentina': 'Argentine',
  'UEFA Champions League': 'Europe', 'UEFA Europa League': 'Europe', 'UEFA EURO': 'Europe', 'Qualifications européennes': 'Europe',
  "Qualifications d'Amérique du Sud": 'Amérique du Sud', 'Conmebol Libertadores': 'Amérique du Sud', "Qualifications d'Afrique": 'Afrique',
  "Qualifications d'Asie et d'Océanie": 'Asie', 'Qualif. Amérique du Nord et centrale': 'Amérique du Nord', 'FIFA World Cup': 'Monde', 'Match amical international': 'Monde',
};

// Rend { v, gameDate, clubRef, comps, matches, details, teams, potm, poty } :
//  comps[i]   = { key, name, kind: 'league'|'cup', mine, main, big, country, table, scorers, best, totw, xi }
//               xi (championnats) : { month: { month: 'AAAA-MM', players }, season: { players } }, players = [[nom, ref, ligne, note moyenne, matchs notés]]
//               table : [[ref, j, g, n, p, bp, bc, pts, forme]] ; scorers : [[nom, ref équipe, buts, passes, matchs]]
//  matches[i] = [date, heure|null, n° compétition, journée/tour, ref domicile, ref extérieur, (buts dom., buts ext.)]
//  details[i] = { ev: [[côté 0|1, nom, buts, passes]], motm: [nom, côté, note], lu: [[...domicile], [...extérieur]] }
//               une ligne de composition : [nom, titulaire 1|0, minutes, note, buts, passes, poste 0-9 (voir blReader)]
//  teams[ref] = [nom, sigle, stade, entraîneur, [noms de l'effectif]]
//  potm       = { name, teamRef, apps, goals, assists, avg, month, me } : joueur du mois (30 derniers jours)
//  poty       = [{ year, podium: [[nom, ref du club, points, lui 1|0]] }] : footballeur de l'année, du jeu (la plus récente d'abord)
function buildScores(career, { nameOf, clubRef, leagueId, playerId, today }) {
  const myComps = new Set(career.matches.filter((m) => m.home.ref === clubRef || m.away.ref === clubRef).map((m) => m.competitionId));
  // Les phases d'une même compétition (groupes, tours, apertura/clausura) sont regroupées par nom. Une compétition d'un
  // seul match est écartée : ce sont les supercoupes, dont la sauvegarde décale les noms d'équipes.
  const byId = new Map();
  for (const m of career.matches) { if (!byId.has(m.competitionId)) byId.set(m.competitionId, []); byId.get(m.competitionId).push(m); }
  const groups = new Map();
  for (const [id, raw] of byId) {
    if (raw.length <= 1) continue;
    const acc = compAccount(id, career.competitions.get(id) || raw[0].competition);
    if (!acc) continue;
    if (!groups.has(acc.key)) groups.set(acc.key, { acc, ids: [] });
    groups.get(acc.key).ids.push(id);
  }
  const leagueOf = (id) => { const t = leagueTable(career.matches, id); return t.length >= 6 && competitionMatches(career.matches, id).length >= 0.9 * (t.length * (t.length - 1)) / 2; };
  const comps = [];
  for (const { acc, ids } of groups.values()) {
    const lid = ids.find(leagueOf);
    let ms;
    if (lid !== undefined) {
      // Championnat : sans les enregistrements isolés d'équipes étrangères (voir competitionMatches).
      ms = [...competitionMatches(career.matches, lid), ...ids.filter((x) => x !== lid).flatMap((x) => byId.get(x))];
    } else {
      // Coupe : on écarte un match isolé (deux équipes qu'on ne revoit jamais, seul ce jour-là dans la compétition).
      const raw = ids.flatMap((x) => byId.get(x));
      const seen = new Map(), days = new Map();
      for (const m of raw) { for (const t of [m.home.ref, m.away.ref]) seen.set(t, (seen.get(t) || 0) + 1); days.set(m.date, (days.get(m.date) || 0) + 1); }
      ms = raw.filter((m) => !(seen.get(m.home.ref) === 1 && seen.get(m.away.ref) === 1 && days.get(m.date) === 1));
    }
    if (!ms.length) continue;
    const big = DATA.big.indexOf(acc.key);
    comps.push({
      key: acc.key, name: acc.name, kind: lid !== undefined ? 'league' : 'cup', mine: ids.some((id) => myComps.has(id)), main: ids.includes(leagueId),
      big: big >= 0 ? big : null, real: acc.real, country: COUNTRY[acc.key] || null, ms, table: lid !== undefined ? leagueTable(career.matches, lid) : null,
    });
  }
  const rank = (c) => (c.main ? 0 : c.mine ? 1 : c.big !== null ? 2 + c.big / 100 : c.real ? 3 : 4);
  comps.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));

  // Tous les matchs, dans l'ordre des coups d'envoi.
  const all = comps.flatMap((c, ci) => c.ms.map((m) => [m, ci]))
    .sort(([a], [b]) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (validHour(a.hour) ?? 99) - (validHour(b.hour) ?? 99)));
  const used = new Set();
  const matches = all.map(([m, ci]) => {
    used.add(m.home.ref); used.add(m.away.ref);
    return [m.date, validHour(m.hour), ci, m.round + 1, m.home.ref, m.away.ref, ...(m.played ? [m.score[0], m.score[1]] : [])];
  });

  // Matchs joués : buteurs, passeurs et homme du match ; compositions pour les matchs récents et ceux du club.
  const details = {};
  const from = addDays(today, -LINEUP_DAYS);
  all.forEach(([m], i) => {
    if (!m.played) return;
    const ev = [];
    let best = null;
    [m.homeLineup, m.awayLineup].forEach((lu, side) => {
      for (const e of lu) {
        if (e.goals || e.assists) ev.push([side, nameOf(e.playerId), e.goals, e.assists]);
        const key = [e.ratingRaw, e.goals, e.assists];
        if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))) best = { key, id: e.playerId, side };
      }
    });
    const d = { ev };
    if (best && nameOf(best.id)) d.motm = [nameOf(best.id), best.side, ratingFromRaw(best.key[0])];
    if (m.date >= from || m.home.ref === clubRef || m.away.ref === clubRef) {
      d.lu = [m.homeLineup, m.awayLineup].map((lu) => lu.map((e) => [nameOf(e.playerId), e.starter ? 1 : 0, e.minutes, ratingFromRaw(e.ratingRaw), e.goals, e.assists, e.pos]));
    }
    details[i] = d;
  });

  // Le mois fini (celui d'avant la date du jeu), pour l'équipe type du mois.
  const lastMonth = (() => { const [y, m] = String(today).slice(0, 7).split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
  // Buteurs de chaque compétition (toutes phases), avec passes et matchs joués.
  const compsOut = comps.map((c) => {
    const acc = new Map();
    for (const m of c.ms) {
      if (!m.played) continue;
      for (const [ref, lu] of [[m.home.ref, m.homeLineup], [m.away.ref, m.awayLineup]]) {
        for (const e of lu) {
          const a = acc.get(e.playerId) || { id: e.playerId, ref, goals: 0, assists: 0, apps: 0 };
          a.apps++; a.goals += e.goals; a.assists += e.assists; a.ref = ref;
          acc.set(e.playerId, a);
        }
      }
    }
    const scorers = [...acc.values()].filter((a) => a.goals).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps).slice(0, 20)
      .map((a) => [nameOf(a.id), a.ref, a.goals, a.assists, a.apps]);
    // Championnat : les meilleurs joueurs à la note moyenne et l'équipe type de la dernière journée (src/world/awards.js).
    const lg = c.kind === 'league' ? c.ms : null;
    const round = lg && teamOfRound(lg);
    // Les équipes types du mois fini et de la saison en cours (au moins 8 joueurs trouvés, sinon rien).
    const xi = (ms, minApps) => { const l = periodEleven(ms, { minApps, keep: (a) => Boolean(nameOf(a.id)) }); return l.length >= 8 ? l.map((a) => [nameOf(a.id), a.ref, a.line, a.avg, a.rated]) : null; };
    const monthMs = lg ? lg.filter((m) => m.played && String(m.date).slice(0, 7) === lastMonth) : [];
    const monthXi = monthMs.length ? xi(monthMs, Math.max(2, Math.ceil(new Set(monthMs.map((m) => m.round)).size / 2))) : null;
    const seasonXi = lg ? xi(lg, rankingMinApps(lg)) : null;
    return {
      key: c.key, name: c.name, kind: c.kind, mine: c.mine, main: c.main, big: c.big !== null, country: c.country,
      table: c.table ? c.table.map((r) => [r.ref, r.p, r.w, r.d, r.l, r.gf, r.ga, r.pts, r.form.join('')]) : null,
      scorers,
      best: lg ? playerRanking(lg, { minApps: rankingMinApps(lg) }).filter((a) => nameOf(a.id)).slice(0, 20).map((a) => [nameOf(a.id), a.ref, a.rated, a.avg, a.goals, a.assists, a.line]) : null,
      xi: lg && (monthXi || seasonXi) ? { ...(monthXi ? { month: { month: lastMonth, players: monthXi } } : {}), ...(seasonXi ? { season: { players: seasonXi } } : {}) } : null,
      totw: round ? { round: round.round, xi: round.xi.map((p) => [nameOf(p.id), p.ref, p.line, p.rating]), best: round.best && nameOf(round.best.id) ? [nameOf(round.best.id), round.best.ref, round.best.rating] : null } : null,
    };
  });

  // Effectifs des équipes qui jouent cette saison (noms connus de la base du jeu seulement).
  const teams = {};
  for (const ref of used) {
    const t = career.teams.get(ref);
    if (!t) continue;
    teams[ref] = [t.name, t.short || null, t.stadium || null, t.coach || null, (t.roster || []).map(nameOf).filter(Boolean)];
  }

  // Joueur du mois : meilleure note moyenne sur les 30 derniers jours (au moins 3 matchs de 30 minutes), dans les
  // compétitions du club et les grandes compétitions.
  const since = addDays(today, -30);
  const perf = new Map();
  for (const c of comps) {
    if (!c.mine && c.big === null) continue;
    for (const m of c.ms) {
      if (!m.played || m.date <= since || m.date > today) continue;
      for (const [ref, lu] of [[m.home.ref, m.homeLineup], [m.away.ref, m.awayLineup]]) {
        for (const e of lu) {
          if (e.minutes < 30) continue;
          const a = perf.get(e.playerId) || { id: e.playerId, ref, apps: 0, sum: 0, goals: 0, assists: 0 };
          a.apps++; a.sum += ratingFromRaw(e.ratingRaw); a.goals += e.goals; a.assists += e.assists; a.ref = ref;
          perf.set(e.playerId, a);
        }
      }
    }
  }
  const top = [...perf.values()].filter((a) => a.apps >= 3 && nameOf(a.id)).map((a) => ({ ...a, avg: a.sum / a.apps }))
    .sort((a, b) => b.avg - a.avg || (b.goals + b.assists) - (a.goals + a.assists))[0];
  const potm = top ? { name: nameOf(top.id), teamRef: top.ref, apps: top.apps, goals: top.goals, assists: top.assists, avg: Math.round(top.avg * 100) / 100, month: today.slice(0, 7), me: top.id === playerId } : null;

  // Footballeur de l'année : la récompense du jeu, lue dans la sauvegarde (son joueur peut y figurer un jour).
  const who = (id) => (id === playerId ? career.player?.name || nameOf(id) : nameOf(id));
  const poty = (career.playerOfYear || []).map((y) => ({ year: y.year, podium: y.podium.map((p) => [who(p.id) || null, p.teamRef, p.points, p.id === playerId ? 1 : 0]) }));

  return { v: 1, gameDate: today, clubRef, comps: compsOut, matches, details, teams, potm, poty };
}

module.exports = { buildScores };
