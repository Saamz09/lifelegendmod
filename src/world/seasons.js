'use strict';
// Mémoire des saisons. La sauvegarde ne garde que la saison en cours : LifeLegend archive un
// résumé de chaque saison (et de chaque club, en cas de transfert) à chaque synchro.

const PALIERS = {
  apps: [50, 100, 150, 200, 250, 300, 400, 500],
  goals: [10, 25, 50, 75, 100, 150, 200, 250, 300],
  assists: [10, 25, 50, 75, 100, 150],
};
const LIBELLES = { apps: 'match', goals: 'but', assists: 'passe décisive' };

const seasonKey = (s) => `${s.season}|${s.club.ref}`;

function summarize(s) {
  const row = s.table.find((r) => r.mine) || null;
  return {
    season: s.season,
    club: s.club.name,
    league: s.league.name,
    position: row ? row.pos : null,
    teams: s.table.length,
    record: row ? { p: row.p, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, pts: row.pts } : null,
    stats: s.stats.total,
    byCompetition: s.stats.byCompetition,
    scorerRank: s.scorerRace.myRank,
    trophies: s.trophies || [],
    lastGameDate: s.gameDate,
    complete: Boolean(s.leagueComplete),
    // Ses matchs de la saison avec ce club : après un transfert, la sauvegarde ne les a plus, Scoreline si (courbe de
    // forme, minutes, liste des matchs de toute la saison).
    log: matchLog(s),
  };
}

function matchLog(s) {
  return (s.fixtures || []).filter((f) => f.played && f.me).map((f) => ({
    date: f.date, competition: f.competition, home: f.home, away: f.away, score: f.score,
    minutes: f.me.minutes, starter: f.me.starter, rating: f.me.rating, goals: f.me.goals, assists: f.me.assists,
  }));
}

function totals(seasons) {
  const t = { seasons: 0, apps: 0, goals: 0, assists: 0, minutes: 0, trophies: 0 };
  for (const s of seasons) {
    t.seasons++;
    t.apps += s.stats.apps; t.goals += s.stats.goals; t.assists += s.stats.assists; t.minutes += s.stats.minutes;
    t.trophies += s.trophies.length;
  }
  return t;
}

// La carrière est suivie depuis le début si le premier match en club a eu lieu pendant une saison archivée.
function trackedFromStart(state) {
  const debut = state.snapshot?.player?.history?.debuts?.find((d) => d.kind === 'club');
  const first = Object.values(state.seasons || {}).sort((a, b) => String(a.season).localeCompare(String(b.season)))[0];
  if (!debut || !first) return false;
  return String(first.season).includes(debut.date.slice(0, 4));
}

// Met l'archive à jour avec l'instantané ; renvoie les nouveautés à signaler aux journalistes.
function archiveSeason(state, snapshot) {
  state.seasons ||= {};
  const before = totals(Object.values(state.seasons));
  const previous = state.seasons[seasonKey(snapshot)];
  // Une saison remplacée par la suivante dans la sauvegarde est close.
  for (const s of Object.values(state.seasons)) if (s.season !== snapshot.season) s.complete = true;
  const current = summarize(snapshot);
  state.seasons[seasonKey(snapshot)] = current;
  const after = totals(Object.values(state.seasons));

  const news = { milestones: [], trophies: [] };
  const known = new Set((previous?.trophies || []).map((t) => t.competition));
  news.trophies = current.trophies.filter((t) => !known.has(t.competition));
  if (trackedFromStart(state)) {
    for (const [k, steps] of Object.entries(PALIERS)) {
      for (const n of steps) {
        if (before[k] < n && after[k] >= n) news.milestones.push(`${n}e ${LIBELLES[k]} en carrière`);
      }
    }
  }
  return news;
}

// Pour les rédacteurs : le parcours avant le suivi, chaque saison archivée et les totaux.
function careerFacts(state) {
  const seasons = Object.values(state.seasons || {})
    .sort((a, b) => String(a.season).localeCompare(String(b.season)))
    .map(({ byCompetition, log, ...s }) => s);
  return {
    before_tracking: state.snapshot?.player?.history || null,
    seasons,
    totals: totals(seasons),
    totals_cover_whole_career: trackedFromStart(state),
  };
}

module.exports = { archiveSeason, careerFacts, totals, trackedFromStart, matchLog };
