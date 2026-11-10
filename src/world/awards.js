'use strict';
// Récompenses d'un championnat, calculées sur les notes du jeu (aucune IA) : l'équipe type de chaque journée, le
// classement des meilleurs joueurs et, la saison finie, ses trophées (meilleur joueur, buteur, passeur, gardien,
// équipe type de la saison). Les matchs sont ceux de la sauvegarde (compositions avec note, minutes et poste joué).

const ratingFromRaw = (raw) => Math.round(raw / 2.5) / 2; // même échelle que snapshot.js
// Ligne du poste joué dans le match (0 gardien, 1-2 défenseurs, 3-6 milieux, 7-9 attaquants) ; équipe type en 4-3-3.
const lineOf = (pos) => (pos === 0 ? 'gk' : pos <= 2 ? 'def' : pos <= 6 ? 'mid' : 'att');
const SHAPE = [['gk', 1], ['def', 4], ['mid', 3], ['att', 3]];
const MIN_MINUTES = 45; // une entrée en fin de match ne compte ni pour l'équipe type ni pour la note moyenne

const byPerformance = (a, b) => b.rating - a.rating || (b.goals + b.assists) - (a.goals + a.assists) || b.minutes - a.minutes;

// Prestations d'un match : une par joueur aligné.
function performances(m) {
  return [[m.home, m.homeLineup], [m.away, m.awayLineup]].flatMap(([team, lu]) => (lu || []).map((e) => ({
    id: e.playerId, ref: team.ref, club: team.name, line: lineOf(e.pos), rating: ratingFromRaw(e.ratingRaw), goals: e.goals, assists: e.assists, minutes: e.minutes,
  })));
}

// Le meilleur onze d'une liste de prestations : les meilleures notes de chaque ligne, en 4-3-3.
const bestEleven = (perfs) => SHAPE.flatMap(([line, n]) => perfs.filter((p) => p.line === line).sort(byPerformance).slice(0, n));

// Équipe type et joueur d'une journée (ses matchs, tous joués).
function roundEleven(matches) {
  const perfs = matches.flatMap(performances).filter((p) => p.minutes >= MIN_MINUTES);
  return { xi: bestEleven(perfs), best: [...perfs].sort(byPerformance)[0] || null };
}

// Journées d'un championnat entièrement jouées, dans l'ordre.
function completeRounds(matches) {
  const rounds = new Map();
  for (const m of matches) { if (!rounds.has(m.round)) rounds.set(m.round, []); rounds.get(m.round).push(m); }
  return [...rounds.entries()].filter(([, ms]) => ms.every((m) => m.played)).sort(([a], [b]) => a - b).map(([round, ms]) => ({ round, matches: ms }));
}

// La dernière journée entièrement jouée et son équipe type (round compté à partir de 1) ; null avant la première.
function teamOfRound(matches) {
  const last = completeRounds(matches).at(-1);
  if (!last) return null;
  return { round: last.round + 1, date: last.matches.map((m) => m.date).sort().at(-1), ...roundEleven(last.matches) };
}

// Classement par note moyenne (matchs d'au moins 45 minutes, minApps au minimum) ; buts et passes de tous ses matchs.
function playerRanking(matches, { minApps = 1 } = {}) {
  const acc = new Map();
  for (const m of matches) {
    if (!m.played) continue;
    for (const p of performances(m)) {
      const a = acc.get(p.id) || { id: p.id, ref: p.ref, club: p.club, apps: 0, rated: 0, sum: 0, goals: 0, assists: 0, minutes: 0, lines: {} };
      a.apps++; a.goals += p.goals; a.assists += p.assists; a.minutes += p.minutes; a.ref = p.ref; a.club = p.club;
      if (p.minutes >= MIN_MINUTES) { a.rated++; a.sum += p.rating; a.lines[p.line] = (a.lines[p.line] || 0) + 1; }
      acc.set(p.id, a);
    }
  }
  // Sans match noté (seulement des entrées en fin de match) : pas de moyenne ni de ligne, classé après les autres.
  return [...acc.values()].filter((a) => a.rated >= minApps).map(({ sum, lines, ...a }) => ({
    ...a, avg: a.rated ? Math.round((sum / a.rated) * 100) / 100 : null, line: Object.entries(lines).sort((x, y) => y[1] - x[1])[0]?.[0] || null,
  })).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || (b.goals + b.assists) - (a.goals + a.assists) || b.rated - a.rated);
}

// Équipe type d'une période (le mois fini, la saison en cours) : les meilleures notes moyennes de chaque ligne, en 4-3-3,
// parmi les joueurs qui ont assez joué (minApps matchs d'au moins 45 minutes). keep écarte les joueurs sans nom connu.
function periodEleven(matches, { minApps = 1, keep = () => true } = {}) {
  const ranked = playerRanking(matches, { minApps }).filter(keep);
  return SHAPE.flatMap(([line, n]) => ranked.filter((p) => p.line === line).slice(0, n));
}

// Seuil du classement en cours de saison : 40 % des journées jouées (au moins 2 matchs).
const rankingMinApps = (matches) => Math.max(2, Math.ceil(completeRounds(matches).length * 0.4));

// Trophées d'une saison finie : meilleur joueur et meilleur gardien (note moyenne, au moins la moitié des journées),
// meilleur buteur et passeur, équipe type de la saison (meilleures moyennes par ligne). null tant qu'elle n'est pas finie.
function seasonAwards(matches) {
  if (!matches.length || !matches.every((m) => m.played)) return null;
  const rounds = new Set(matches.map((m) => m.round)).size;
  const ranked = playerRanking(matches, { minApps: Math.ceil(rounds / 2) });
  const everyone = playerRanking(matches, { minApps: 0 });
  const top = (key) => [...everyone].sort((a, b) => b[key] - a[key] || (b.avg ?? 0) - (a.avg ?? 0))[0] || null;
  return {
    bestPlayer: ranked[0] || null,
    topScorer: top('goals'),
    topAssists: top('assists'),
    bestKeeper: ranked.find((a) => a.line === 'gk') || null,
    xi: bestEleven(ranked.map((a) => ({ ...a, rating: a.avg }))),
  };
}

// Nouvelles récompenses de son championnat depuis la dernière synchro, retenues dans state.awards : la dernière journée
// finie (s'il est dans l'équipe type ou meilleur joueur) et, la saison finie, ses trophées. Rend ce que l'édition doit
// savoir : { round, season }, chacun null s'il n'y a rien de neuf.
function awardsNews(state, { matches, season, competition, playerId, nameOf }) {
  const aw = (state.awards ||= { last: null, rounds: [], seasons: {} });
  const out = { round: null, season: null };
  const t = teamOfRound(matches);
  if (t && (aw.last?.season !== season || t.round > aw.last.round)) {
    aw.last = { season, round: t.round };
    const me = t.xi.find((p) => p.id === playerId);
    const best = t.best?.id === playerId;
    if (me || best) {
      out.round = { competition, round: t.round, in_team: Boolean(me), player_of_the_round: best || undefined, his_rating: (me || t.best).rating };
      aw.rounds = [...aw.rounds, { season, competition, round: t.round, inTeam: Boolean(me), best }].slice(-200);
    }
  }
  const s = seasonAwards(matches);
  if (s && !aw.seasons[season]) {
    const who = (a, value) => (a ? { name: nameOf(a.id) || null, club: a.club, ...value, me: a.id === playerId || undefined } : null);
    const won = ['bestPlayer', 'topScorer', 'topAssists', 'bestKeeper'].filter((k) => s[k]?.id === playerId);
    if (s.xi.some((p) => p.id === playerId)) won.push('xi');
    aw.seasons[season] = {
      competition,
      bestPlayer: who(s.bestPlayer, { avg: s.bestPlayer?.avg }), topScorer: who(s.topScorer, { goals: s.topScorer?.goals }),
      topAssists: who(s.topAssists, { assists: s.topAssists?.assists }), bestKeeper: who(s.bestKeeper, { avg: s.bestKeeper?.avg }),
      xi: s.xi.map((p) => nameOf(p.id)).filter(Boolean), won,
    };
    out.season = aw.seasons[season];
  }
  return out;
}

module.exports = { teamOfRound, roundEleven, completeRounds, playerRanking, rankingMinApps, periodEleven, seasonAwards, awardsNews, lineOf };
