'use strict';
// Transforme la carrière lue dans la sauvegarde en un instantané compact (stocké et affiché),
// puis calcule ce qui a changé depuis la synchro précédente.

const { competitionMatches, leagueTable, scorers, prettyName } = require('../save/blReader');
const { abilityLabel, isGoalkeeper } = require('../save/playerProfile');
const { skillName } = require('../save/training');
const { matchesOf, compAccount, realTeam } = require('./competitions');
const COMP_DATA = require('../data/competitionAccounts.json');

// Identifiants des grands championnats (les noms varient selon le patch et la langue du jeu) :
// Angleterre, Italie, Espagne, France, Allemagne, Pays-Bas, Portugal.
const BIG_LEAGUES = [0x11, 0x12, 0x13, 0x14, 0x32, 0x15, 0x16];

// Note officielle du jeu (sur 10, par pas de 0,5) : la valeur brute vaut environ note × 5
// (calibré sur un 7,5 en jeu = 37 dans la sauvegarde ; 22/25/27/30/32/35 = 4,5…7,0).
const ratingFromRaw = (raw) => Math.round(raw / 2.5) / 2;
// Postes de la feuille de match (bits 14-17 de la composition, lus par blReader), en toutes lettres pour l'IA.
const LINEUP_POSITIONS = ['gardien', 'défenseur central', 'arrière latéral', 'milieu défensif', 'milieu central', 'milieu latéral', 'milieu offensif', 'second attaquant', 'ailier', 'avant-centre'];

function ratingWord(rating) {
  if (rating >= 8.5) return 'exceptionnel';
  if (rating >= 7.5) return 'excellent';
  if (rating >= 7) return 'très bon';
  if (rating >= 6.5) return 'bon';
  if (rating >= 6) return 'correct';
  if (rating >= 5.5) return 'moyen';
  return 'difficile';
}

const matchId = (m) => `${m.date}|${m.home.ref}|${m.away.ref}|${m.competitionId}`;
// Même match : même date, mêmes équipes. Le numéro de compétition n'entre pas en compte : il a changé pour certains
// matchs quand la lecture de la sauvegarde a été corrigée (Ligue des champions 4098 → 3074), et un identifiant
// enregistré avant reste valable.
const matchKey = (id) => String(id || '').split('|').slice(0, 3).join('|');
const sameMatch = (a, b) => Boolean(a && b) && matchKey(a) === matchKey(b);

function myLine(m, playerId) {
  if (!m.played) return null;
  const e = [...m.homeLineup, ...m.awayLineup].find((x) => x.playerId === playerId);
  if (!e) return null;
  const rating = ratingFromRaw(e.ratingRaw);
  return { starter: e.starter, minutes: e.minutes, goals: e.goals, assists: e.assists, ratingRaw: e.ratingRaw, rating, ratingWord: ratingWord(rating) };
}

// Buteurs et passeurs d'un côté, avec leur nom quand la base du jeu le connaît (sinon null).
function events(lineup, nameOf) {
  const scorers = [], assisters = [];
  for (const e of lineup) {
    if (e.goals) scorers.push({ name: nameOf(e.playerId), goals: e.goals });
    if (e.assists) assisters.push({ name: nameOf(e.playerId), assists: e.assists });
  }
  return { scorers, assisters };
}

// Homme du match : meilleure note des deux équipes (départage aux buts puis aux passes).
function manOfTheMatch(m, nameOf) {
  let best = null;
  for (const [team, lineup] of [[m.home, m.homeLineup], [m.away, m.awayLineup]]) {
    for (const e of lineup) {
      const key = [e.ratingRaw, e.goals, e.assists];
      if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))) {
        best = { key, playerId: e.playerId, team: team.name };
      }
    }
  }
  const name = best && nameOf(best.playerId);
  return name ? { name, team: best.team, rating: ratingFromRaw(best.key[0]) } : null;
}

function compactMatch(m, ctx = {}) {
  const { clubRef, playerId, nameOf = () => null } = ctx;
  const out = {
    id: matchId(m),
    date: m.date,
    hour: Number.isInteger(m.hour) && m.hour >= 0 && m.hour <= 23 ? m.hour : null, // heure pas encore fixée (phases finales) : valeur invalide
    competition: m.competition,
    competitionId: m.competitionId,
    round: m.round + 1,
    home: m.home.name,
    away: m.away.name,
    homeRef: m.home.ref,
    awayRef: m.away.ref,
    stadium: m.home.stadium || null, // stade du club qui reçoit (les finales sur terrain neutre ne sont pas connues)
    played: m.played,
  };
  if (clubRef !== undefined) out.venue = m.home.ref === clubRef ? 'domicile' : 'extérieur';
  if (m.played) {
    out.score = m.score;
    out.events = { home: events(m.homeLineup, nameOf), away: events(m.awayLineup, nameOf) };
    out.motm = manOfTheMatch(m, nameOf);
    if (playerId !== undefined) out.me = myLine(m, playerId);
    if (clubRef !== undefined) {
      // Composition du club pour ce match : titulaires (avec leur poste sur la feuille de match) puis entrants,
      // avec minutes et note.
      out.clubLineup = (m.home.ref === clubRef ? m.homeLineup : m.awayLineup).map((e) => ({
        name: nameOf(e.playerId),
        starter: e.starter,
        ...(e.starter && LINEUP_POSITIONS[e.pos] ? { position: LINEUP_POSITIONS[e.pos] } : {}),
        minutes: e.minutes,
        rating: ratingFromRaw(e.ratingRaw),
        goals: e.goals,
        assists: e.assists,
      }));
    }
  }
  return out;
}

// Cotes décimales 1/N/2 à partir de la forme au classement (marge du bookmaker ~6 %).
function odds(table, homeRef, awayRef) {
  const strength = (ref) => {
    const r = table.find((x) => x.ref === ref);
    if (!r || r.p === 0) return 1.35;
    return (r.pts + 1.35 * 3) / (r.p + 3) + 0.15 * (r.gf - r.ga) / Math.max(r.p, 1);
  };
  const diff = strength(homeRef) - strength(awayRef) + 0.3;
  const draw = 0.28 * Math.exp(-diff * diff / 2.2);
  const home = (1 - draw) / (1 + Math.exp(-2.1 * diff));
  const away = 1 - draw - home;
  const price = (p) => Math.max(1.03, Math.round((1 / (p * 1.06)) * 100) / 100);
  return { home: price(home), draw: price(draw), away: price(away) };
}

function seasonLabel(matches) {
  if (!matches.length) return null;
  const y1 = Number(matches[0].date.slice(0, 4)), y2 = Number(matches[matches.length - 1].date.slice(0, 4));
  return y1 === y2 ? String(y1) : `${y1}-${y2}`;
}

// ---------- La Transversale : les compétitions du club d'abord, puis les grandes compétitions (le « hub ») ----------
// Grandes compétitions suivies même sans le club : celles de competitionAccounts.big, les grands championnats
// (BIG_LEAGUES) et les grandes coupes nationales.
// Ordre du tour des compétitions : les grands championnats, l'Europe et les grands tournois, puis les grandes coupes.
const HUB_ORDER = ['Premier League', 'LaLiga Santander', 'Serie A TIM', 'Bundesliga', 'Ligue 1 Uber Eats', 'UEFA Champions League', 'UEFA Europa League',
  'Conmebol Libertadores', 'FIFA World Cup', 'UEFA EURO', 'Eredivisie', 'Liga NOS', 'Emirates FA Cup', 'Copa Del Rey', 'Coppa Italia', 'DFB-Pokal', 'Coupe de France'];
const HUB_BIG = [...HUB_ORDER, ...COMP_DATA.big.filter((k) => !HUB_ORDER.includes(k))];
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const liteMatch = (m) => ({
  date: m.date, hour: Number.isInteger(m.hour) && m.hour >= 0 && m.hour <= 23 ? m.hour : null,
  home: m.home.name, away: m.away.name, homeRef: m.home.ref, awayRef: m.away.ref, played: m.played, ...(m.played ? { score: m.score } : {}),
});
const byKickoff = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.hour ?? 0) - (b.hour ?? 0));

// Rend [{ id, name, mine, main, kind: 'league'|'cup', stage, results, nextStage, next, table, teams }] :
// son championnat, ses autres compétitions (coupes, Europe), puis les grandes compétitions dans l'ordre de HUB_BIG.
function competitionsHub(career, { clubRef, leagueId, today }) {
  const mineIds = new Set(career.matches.filter((m) => m.home.ref === clubRef || m.away.ref === clubRef).map((m) => m.competitionId));
  // Les phases d'une même compétition (groupes, tours, apertura/clausura) ont chacune leur numéro : on les regroupe par nom.
  const groups = new Map();
  for (const id of new Set(career.matches.map((m) => m.competitionId))) {
    const acc = compAccount(id, career.competitions.get(id) || career.matches.find((m) => m.competitionId === id)?.competition);
    if (!acc) continue;
    if (!groups.has(acc.key)) groups.set(acc.key, { acc, ids: [] });
    groups.get(acc.key).ids.push(id);
  }
  const out = [];
  for (const { acc, ids } of groups.values()) {
    const mine = ids.some((id) => mineIds.has(id));
    const bigId = ids.find((id) => BIG_LEAGUES.includes(id));
    let bigRank = HUB_BIG.indexOf(acc.key);
    if (bigRank < 0 && bigId !== undefined) bigRank = HUB_BIG.length + BIG_LEAGUES.indexOf(bigId);
    if (!mine && bigRank < 0) continue;
    // Un championnat (chacun affronte tous les autres) se lit par journées ; sinon par semaines de matchs.
    const leagueOf = (id) => { const t = leagueTable(career.matches, id); return t.length >= 8 && competitionMatches(career.matches, id).length >= 0.9 * (t.length * (t.length - 1)) / 2; };
    const id = ids.includes(leagueId) ? leagueId : ids.find(leagueOf) ?? ids[0];
    const league = leagueOf(id);
    const ms = (league ? [id] : ids).flatMap((x) => matchesOf(career.matches, x));
    if (!ms.length || (!mine && !ms.some((m) => realTeam(m.home) || realTeam(m.away)))) continue;
    const table = league ? leagueTable(career.matches, id) : [];
    // Pas de vieux résultats (une coupe finie il y a des mois) ni d'affiches lointaines.
    const played = ms.filter((m) => m.played && m.date <= today && m.date > addDays(today, -30));
    const upcoming = ms.filter((m) => !m.played && m.date >= today && m.date <= addDays(today, 45));
    let results, next, stage = null, nextStage = null;
    if (league) {
      const last = played.length ? Math.max(...played.map((m) => m.round)) : null;
      const nr = upcoming.length ? Math.min(...upcoming.map((m) => m.round)) : null;
      results = last === null ? [] : played.filter((m) => m.round === last);
      next = nr === null ? [] : upcoming.filter((m) => m.round === nr);
      if (last !== null) stage = `${last + 1}e journée`;
      if (nr !== null) nextStage = `${nr + 1}e journée`;
    } else {
      // Coupes et phases de groupes : la dernière « semaine » de matchs (4 jours), puis la prochaine.
      const last = played.map((m) => m.date).sort().at(-1), first = upcoming.map((m) => m.date).sort()[0];
      results = last ? played.filter((m) => m.date > addDays(last, -4)) : [];
      next = first ? upcoming.filter((m) => m.date < addDays(first, 4)) : [];
    }
    if (!results.length && !next.length) continue;
    out.push({
      id, name: id === leagueId ? career.competitions.get(id) || acc.name : acc.name, mine, main: id === leagueId, kind: league ? 'league' : 'cup',
      stage, results: results.map(liteMatch).sort(byKickoff), nextStage, next: next.map(liteMatch).sort(byKickoff),
      table: league ? table.slice(0, mine ? table.length : 6).map((r) => ({ pos: r.pos, team: r.team, ref: r.ref, p: r.p, gd: r.gf - r.ga, pts: r.pts, mine: r.ref === clubRef })) : null,
      teams: table.length, rank: mine ? (id === leagueId ? -2 : -1) : bigRank,
    });
  }
  const firstDate = (c) => c.next[0]?.date || c.results.at(-1)?.date || '9999';
  return out.sort((a, b) => a.rank - b.rank || (a.mine && b.mine ? firstDate(a).localeCompare(firstDate(b)) : 0)).map(({ rank, ...c }) => c);
}

// names : Map identifiant -> nom (base du jeu), ou null si elle ne correspond pas à la sauvegarde.
function buildSnapshot(career, names = null) {
  const { matches, club, player } = career;
  const nameOf = (id) => (id === player.id ? player.name : (names?.has(id) ? prettyName(names.get(id)) : null));
  const ctx = { clubRef: club.ref, playerId: player.id, nameOf };
  const clubMatches = matches.filter((m) => m.home.ref === club.ref || m.away.ref === club.ref);

  // Championnat principal : la compétition où le club joue le plus de matchs.
  const counts = new Map();
  for (const m of clubMatches) counts.set(m.competitionId, (counts.get(m.competitionId) || 0) + 1);
  const leagueId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const leagueMatches = leagueId === undefined ? [] : competitionMatches(matches, leagueId);
  const table = leagueId !== undefined ? leagueTable(matches, leagueId) : [];

  const fixtures = clubMatches.map((m) => compactMatch(m, ctx));

  // Titres de la saison : championnat terminé en tête, ou finale de coupe gagnée
  // (une finale est le dernier match de la compétition, seul ce jour-là).
  const trophies = [];
  const leagueComplete = leagueMatches.length > 0 && leagueMatches.every((m) => m.played);
  if (leagueComplete && table.find((r) => r.ref === club.ref)?.pos === 1) {
    trophies.push({ competition: career.competitions.get(leagueId) || 'Championnat', kind: 'league' });
  }
  for (const compId of new Set(clubMatches.map((m) => m.competitionId))) {
    if (compId === leagueId) continue;
    const all = matches.filter((m) => m.competitionId === compId);
    if (all.length < 3 || !all.every((m) => m.played)) continue;
    const final = all[all.length - 1];
    if (all.filter((m) => m.date === final.date).length > 1) continue;
    const side = final.home.ref === club.ref ? 0 : final.away.ref === club.ref ? 1 : -1;
    if (side < 0 || final.score[side] <= final.score[1 - side]) continue;
    trophies.push({ competition: career.competitions.get(compId) || 'Coupe', kind: 'cup', final: `${final.home.name} ${final.score[0]}-${final.score[1]} ${final.away.name}` });
  }

  // Chronologie des buts du dernier match joué (le jeu ne la garde que pour ce match).
  let lastTimeline = null;
  const ev = career.lastMatchEvents;
  const evMatch = ev && matches.find((m) => m.key === ev.matchKey && m.played);
  if (evMatch && ev.goals.length) {
    const homeIds = new Set(evMatch.homeLineup.map((e) => e.playerId));
    const goals = ev.goals.map((g) => ({
      minute: g.minute,
      side: homeIds.has(g.scorerId) ? 'home' : 'away',
      team: homeIds.has(g.scorerId) ? evMatch.home.name : evMatch.away.name,
      scorer: nameOf(g.scorerId),
      assist: g.assistId ? nameOf(g.assistId) : null,
      distance_m: g.distance,
    }));
    lastTimeline = { matchId: matchId(evMatch), goals };
    const f = fixtures.find((x) => x.id === lastTimeline.matchId);
    if (f) f.goalTimeline = goals;
  }
  const played = fixtures.filter((f) => f.played);
  const next = fixtures.find((f) => !f.played) || null;
  if (next) next.odds = odds(table, next.homeRef, next.awayRef);

  // Statistiques de la saison, totales et par compétition.
  const blank = () => ({ apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, avgRating: null, ratingSum: 0 });
  const stats = { total: blank(), byCompetition: {} };
  for (const f of played) {
    if (!f.me) continue;
    for (const s of [stats.total, (stats.byCompetition[f.competition] ||= blank())]) {
      s.apps++; s.starts += f.me.starter ? 1 : 0; s.minutes += f.me.minutes; s.goals += f.me.goals; s.assists += f.me.assists;
      s.ratingSum += f.me.rating;
    }
  }
  for (const s of [stats.total, ...Object.values(stats.byCompetition)]) {
    if (s.apps) s.avgRating = Math.round((s.ratingSum / s.apps) * 100) / 100;
    delete s.ratingSum;
  }

  // Sélection nationale : groupe convoqué (effectif de la sélection), matchs et statistiques de la saison.
  let nationalTeam = null;
  const nt = career.nationalTeam;
  if (nt) {
    const today = career.save.date || played[played.length - 1]?.date || '';
    const ntFixtures = matches.filter((m) => m.home.ref === nt.ref || m.away.ref === nt.ref).map((m) => compactMatch(m, { clubRef: nt.ref, playerId: player.id, nameOf }));
    const ntStats = blank();
    for (const f of ntFixtures) {
      if (!f.played || !f.me) continue;
      ntStats.apps++; ntStats.starts += f.me.starter ? 1 : 0; ntStats.minutes += f.me.minutes; ntStats.goals += f.me.goals; ntStats.assists += f.me.assists; ntStats.ratingSum += f.me.rating;
    }
    if (ntStats.apps) ntStats.avgRating = Math.round((ntStats.ratingSum / ntStats.apps) * 100) / 100;
    delete ntStats.ratingSum;
    const ntPlayed = ntFixtures.filter((f) => f.played);
    nationalTeam = {
      ref: nt.ref,
      name: nt.name,
      coach: nt.coach || null,
      inSquad: (nt.roster || []).includes(player.id),
      squad: (nt.roster || []).filter((id) => id !== player.id).map(nameOf).filter(Boolean),
      fixtures: ntFixtures,
      stats: ntStats,
      last: ntPlayed[ntPlayed.length - 1] || null,
      // Un match passé jamais joué (annulé par le calendrier du jeu) n'est pas « le prochain ».
      next: ntFixtures.find((f) => !f.played && f.date >= today) || null,
    };
  }

  const top = scorers(matches, leagueId);
  const myIdx = top.findIndex((s) => s.playerId === player.id);
  const scorerRace = {
    leaderGoals: top[0]?.goals || 0,
    leaderTeam: top[0]?.team || null,
    leaderIsMe: top[0]?.playerId === player.id,
    myRank: myIdx >= 0 ? myIdx + 1 : null,
    myGoals: myIdx >= 0 ? top[myIdx].goals : 0,
    top: top.slice(0, 8).map((x) => ({ name: nameOf(x.playerId), team: x.team, goals: x.goals, mine: x.playerId === player.id })),
  };

  // Effectif du club cette saison : les joueurs alignés, avec leurs stats.
  const squadMap = new Map();
  for (const m of clubMatches) {
    if (!m.played) continue;
    for (const e of m.home.ref === club.ref ? m.homeLineup : m.awayLineup) {
      const r = squadMap.get(e.playerId) || { name: nameOf(e.playerId), me: e.playerId === player.id, apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0 };
      r.apps++; r.starts += e.starter ? 1 : 0; r.minutes += e.minutes; r.goals += e.goals; r.assists += e.assists; r.ratingSum += ratingFromRaw(e.ratingRaw);
      squadMap.set(e.playerId, r);
    }
  }
  const squad = [...squadMap.values()]
    .map(({ ratingSum, ...r }) => ({ ...r, avgRating: Math.round((ratingSum / r.apps) * 100) / 100 }))
    .sort((a, b) => b.minutes - a.minutes);

  // Dernière journée jouée du championnat et prochaine journée (avec cotes).
  const playedRounds = leagueMatches.filter((m) => m.played).map((m) => m.round);
  const lastRound = playedRounds.length ? Math.max(...playedRounds) : null;
  const roundResults = lastRound === null ? [] : leagueMatches.filter((m) => m.round === lastRound && m.played).map((m) => compactMatch(m, { nameOf }));
  const nextRoundNo = leagueMatches.find((m) => !m.played)?.round;
  const nextRound = nextRoundNo === undefined ? [] : leagueMatches.filter((m) => m.round === nextRoundNo && !m.played).map((m) => {
    const c = compactMatch(m, { nameOf });
    c.odds = odds(table, m.home.ref, m.away.ref);
    return c;
  });

  // Les grands championnats, pour la page nationale.
  const otherLeagues = [];
  for (const id of BIG_LEAGUES) {
    const name = career.competitions.get(id);
    if (id === leagueId || !name) continue;
    const t = leagueTable(matches, id);
    if (t.length && t.some((r) => r.p > 0)) otherLeagues.push({ competition: name, top: t.slice(0, 4).map((r) => ({ team: r.team, pts: r.pts, p: r.p })) });
  }

  return {
    game: career.game,
    slot: career.save.slot,
    gameDate: career.save.date || played[played.length - 1]?.date || null,
    season: seasonLabel(leagueMatches),
    player: { id: player.id, name: player.name, nationality: player.nationality, contractUntil: player.contractUntil || null, salary: player.salary || null, history: player.history || null, offers: player.offers || [], interests: player.interests || [], profile: player.profile || null, training: player.training || null, careerStart: player.careerStart || null },
    club: { ref: club.ref, name: club.name, short: club.short, stadium: club.stadium, coach: club.coach },
    league: { id: leagueId, name: career.competitions.get(leagueId) || career.save.league || null },
    stats,
    scorerRace,
    // Sigle du club (« OL », « PSV ») : les tendances de Kop le reconnaissent dans les messages.
    table: table.map(({ ref, ...r }) => ({ ...r, ref, short: career.teams.get(ref)?.short || undefined, mine: ref === club.ref })),
    squad,
    // Numéro des joueurs par nom : deux joueurs peuvent porter le même nom, et leur visage dans le jeu n'est pas le même.
    playerIds: (() => {
      const oppRef = next ? (next.homeRef === club.ref ? next.awayRef : next.homeRef) : null;
      const ids = [...squadMap.keys(), ...(club.roster || []), ...((oppRef !== null && career.teams.get(oppRef)?.roster) || [])];
      return Object.fromEntries(ids.map((id) => [nameOf(id), id]).filter(([n]) => n));
    })(),
    rosters: (() => {
      const names = (team) => (team?.roster || []).map(nameOf).filter(Boolean);
      const oppRef = next ? (next.homeRef === club.ref ? next.awayRef : next.homeRef) : null;
      const opp = oppRef !== null ? career.teams.get(oppRef) : null;
      return { mine: names(club), opponent: opp ? { team: opp.name, short: opp.short, coach: opp.coach, players: names(opp) } : null };
    })(),
    lastTimeline,
    trophies,
    leagueComplete,
    fixtures,
    last: played[played.length - 1] || null,
    next,
    roundResults,
    nextRound,
    otherLeagues,
    competitions: competitionsHub(career, { clubRef: club.ref, leagueId, today: career.save.date || played[played.length - 1]?.date || '' }),
    nationalTeam,
    windows: career.transferWindows || [],
    coaches: {
      mine: club.coach,
      nextOpponent: next ? (next.homeRef === club.ref ? career.teams.get(next.awayRef)?.coach : career.teams.get(next.homeRef)?.coach) || null : null,
    },
  };
}

function diffSnapshots(prev, cur) {
  const changes = { firstSync: !prev, transfer: null, newSeason: false, newResults: [], tableMove: null, dateAdvanced: false, matchday: false, newOffers: [], contractSigned: null, progress: [], injury: null, recovered: false, formChange: null, marketValue: null, newTeamRole: null, skillLearned: null, ntResults: [], callUp: null, droppedFromSquad: null, ntMatchday: false, window: null, plannedMove: null, seasonComplete: false };
  // Jour de match : la sauvegarde est datée du jour du prochain match (et ce n'était pas déjà le cas).
  changes.matchday = Boolean(cur.next && cur.gameDate === cur.next.date && (!prev || prev.gameDate !== cur.gameDate));
  if (!prev) {
    changes.newResults = cur.fixtures.filter((f) => f.played).slice(-1);
    return changes;
  }
  if (prev.club.ref !== cur.club.ref) changes.transfer = { from: prev.club.name, to: cur.club.name };
  if (prev.season !== cur.season) changes.newSeason = true;
  // Fin du championnat : le dernier match de la saison vient d'être joué.
  changes.seasonComplete = Boolean(cur.leagueComplete && !prev.leagueComplete && prev.season === cur.season);
  const before = new Set(prev.fixtures.filter((f) => f.played).map((f) => matchKey(f.id)));
  // Seulement les matchs joués depuis la dernière synchro : après un transfert, les matchs passés du nouveau club
  // (absents de l'ancien instantané) ne sont pas des résultats nouveaux (cinq « C'EST TERMINÉ » d'Heerenveen, 21/01/2021).
  changes.newResults = cur.fixtures.filter((f) => f.played && !before.has(matchKey(f.id)) && f.date >= prev.gameDate);
  const posOf = (s) => s.table.find((r) => r.mine)?.pos ?? null;
  if (posOf(prev) !== null && posOf(cur) !== null && posOf(prev) !== posOf(cur) && !changes.newSeason && !changes.transfer) {
    changes.tableMove = { from: posOf(prev), to: posOf(cur) };
  }
  changes.dateAdvanced = prev.gameDate !== cur.gameDate;
  // Offres de contrat arrivées depuis la synchro précédente (écran « Évolution des négociations » du jeu).
  const offerKey = (o) => `${o.slot}|${o.clubRef}|${o.salary}|${o.contractUntil}`;
  const known = new Set((prev.player.offers || []).filter((o) => o.status === 'pending').map(offerKey));
  changes.newOffers = (cur.player.offers || []).filter((o) => o.status === 'pending' && !known.has(offerKey(o)));
  // Mercato (calendrier du jeu) : ouverture, veille de la fermeture, fermeture. Le plus récent l'emporte.
  if (prev.gameDate && cur.gameDate) {
    for (const w of cur.windows || []) {
      const inside = cur.gameDate >= w.open && cur.gameDate <= w.close;
      if (prev.gameDate <= w.close && cur.gameDate > w.close) changes.window = { event: 'close', ...w };
      else if (w.eve && prev.gameDate < w.eve && cur.gameDate >= w.eve && inside) changes.window = { event: 'eve', ...w };
      else if (prev.gameDate < w.open && inside) changes.window = { event: 'open', ...w };
    }
  }
  // Sélection : nouveaux matchs internationaux, convocation ou non, veille de match en sélection.
  // (Les instantanés des anciennes versions n'ont pas la sélection : rien n'est signalé avant d'avoir une référence.)
  const pn = prev.nationalTeam, cn = cur.nationalTeam;
  const nextLabel = (t) => (t.next ? `${t.next.home} - ${t.next.away} (${t.next.competition}, ${t.next.date})` : null);
  const listOf = (t) => ({ team: t.name, me: t.inSquad, next: nextLabel(t), match: t.next ? `${t.next.home} - ${t.next.away}` : null, players: t.squad || [] });
  if (pn && cn && pn.ref === cn.ref) {
    const seen = new Set(pn.fixtures.filter((f) => f.played).map((f) => f.id));
    changes.ntResults = cn.fixtures.filter((f) => f.played && !seen.has(f.id) && f.me);
    if (!pn.inSquad && cn.inSquad) changes.callUp = { team: cn.name, next: nextLabel(cn) };
    else if (pn.inSquad && !cn.inSquad) changes.droppedFromSquad = { team: cn.name };
    changes.ntMatchday = Boolean(cn.inSquad && cn.next && cur.gameDate === cn.next.date && prev.gameDate !== cur.gameDate);
    // Nouvelle liste (au moins 3 noms changent, ou lui entre ou sort) : le compte de la sélection l'annonce.
    const before = new Set(pn.squad || []);
    if (changes.callUp || changes.droppedFromSquad || (cn.squad || []).filter((n) => !before.has(n)).length >= 3) {
      changes.ntList = listOf(cn);
    }
  } else if (pn === null && cn?.inSquad) {
    // Première convocation : il n'avait pas encore de sélection (null, pas undefined des anciens instantanés).
    changes.callUp = { team: cn.name, next: nextLabel(cn), first: true };
    changes.ntList = listOf(cn);
  }
  // Rumeurs : sa sélection joue dans les 14 jours et il n'est pas dans le groupe ; la presse et Kop se demandent s'il
  // sera appelé (une seule fois par match, voir world.js).
  if (cn && !cn.inSquad && cn.next && (Date.parse(cn.next.date) - Date.parse(cur.gameDate)) / 864e5 <= 14) {
    changes.ntRumor = { team: cn.name, next: nextLabel(cn), fixture: cn.next.id };
  }
  // Fiche du joueur : progression des capacités, blessure, forme, valeur marchande, rôle d'équipe.
  const pa = prev.player.profile, pc = cur.player.profile;
  if (pa && pc) {
    changes.progress = Object.keys(pc.abilities)
      .filter((k) => pa.abilities[k] !== undefined && pc.abilities[k] !== pa.abilities[k] && (isGoalkeeper(pc) || !k.startsWith('gk')))
      .map((k) => ({ ability: abilityLabel(k), from: pa.abilities[k], to: pc.abilities[k] }));
    if (pc.unavailableDays > 0 && !(pa.unavailableDays > 0)) changes.injury = { days: pc.unavailableDays };
    else if (pa.unavailableDays > 0 && !(pc.unavailableDays > 0)) changes.recovered = true;
    if (pc.formArrow !== pa.formArrow) changes.formChange = { from: pa.formArrow, to: pc.formArrow };
    if (pa.marketValue && pc.marketValue && Math.abs(pc.marketValue - pa.marketValue) >= pa.marketValue * 0.05) {
      changes.marketValue = { from: pa.marketValue, to: pc.marketValue };
    }
    if (pc.teamRole && pc.teamRole !== pa.teamRole) changes.newTeamRole = pc.teamRole;
  }
  // Geste appris à l'entraînement : celui qu'il travaillait est maintenant dans sa fiche (le jeu passe alors au suivant).
  const ta = prev.player.training, tc = cur.player.training;
  if (ta?.skill && !ta.skillsOwned.includes(ta.skill.code) && tc?.skillsOwned.includes(ta.skill.code)) {
    changes.skillLearned = { code: ta.skill.code, name: skillName(ta.skill.code) };
  }
  // Transfert accepté (« Contrat planifié ») : exécuté le jour même pendant un mercato (Barry -> Paris FC, accepté et
  // transféré le 31/01/2022), sinon à l'ouverture du mercato suivant (Barry -> Leeds, accepté en septembre, le 1er janvier).
  const accepted = (snap) => (snap.player.offers || []).filter((o) => o.status === 'accepted' && o.clubRef !== snap.club.ref);
  const wasAccepted = new Set(accepted(prev).map((o) => `${o.clubRef}|${o.contractUntil}`));
  const planned = accepted(cur).find((o) => !wasAccepted.has(`${o.clubRef}|${o.contractUntil}`));
  if (planned) {
    const inWindow = (cur.windows || []).some((w) => w.open <= cur.gameDate && cur.gameDate <= w.close);
    const nextWindow = (cur.windows || []).find((w) => w.open > cur.gameDate);
    changes.plannedMove = { club: planned.club, contractUntil: planned.contractUntil, effective: inWindow ? cur.gameDate : nextWindow ? nextWindow.open : null, immediate: inWindow, salary: planned.salary };
  }
  // Prolongation signée : même club, contrat allongé (l'offre acceptée disparaît alors de la table des offres).
  if (!changes.transfer && cur.player.contractUntil && prev.player.contractUntil && cur.player.contractUntil > prev.player.contractUntil) {
    changes.contractSigned = {
      club: cur.club.name,
      until: cur.player.contractUntil,
      previousUntil: prev.player.contractUntil,
      salary: cur.player.salary || null,
      previousSalary: prev.player.salary || null,
    };
  }
  return changes;
}

// Une édition ne sort que pour un vrai événement : un simple jour d'entraînement qui passe
// (fréquent avec la sauvegarde automatique du jeu) ne déclenche pas d'appel à l'IA.
const hasNews = (c) => Boolean(c.firstSync || c.transfer || c.newSeason || c.newResults.length > 0 || c.matchday || c.contractSigned || c.injury || c.newTeamRole || c.skillLearned || c.ntResults.length > 0 || c.callUp || c.ntMatchday || c.window?.event === 'close' || c.plannedMove || c.seasonComplete);

module.exports = { buildSnapshot, diffSnapshots, hasNews, ratingFromRaw, ratingWord, sameMatch };
