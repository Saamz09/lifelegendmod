'use strict';
// Bilan de fin de saison : publié quand le championnat du club se termine (dernier match joué dans la sauvegarde).
// Tout vient de la sauvegarde ; les « Trophées de La Transversale » sont des distinctions de LifeLegend, calculées ici.

const { careerFacts } = require('./seasons');

// Note de saison du joueur, d'après sa note moyenne (échelle du jeu, sur 10).
function seasonGrade(stats) {
  if (!stats.apps) return null;
  const r = stats.avgRating ?? 0;
  return r >= 7.0 ? 'A+' : r >= 6.7 ? 'A' : r >= 6.4 ? 'B' : r >= 6.1 ? 'C' : 'D';
}

// Distinctions du club : un minimum de matchs pour éviter qu'un remplaçant d'un soir gagne le titre.
function clubAwards(squad, leagueGames) {
  const named = squad.filter((p) => p.name);
  const regulars = named.filter((p) => p.apps >= Math.max(5, Math.round(leagueGames * 0.4)));
  const best = (list, key) => list.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key] || b.minutes - a.minutes)[0] || null;
  const pick = (p, value) => (p ? { name: p.name, me: Boolean(p.me), value } : null);
  const player = best(regulars, 'avgRating');
  const scorer = best(named, 'goals');
  const assister = best(named, 'assists');
  return {
    player_of_the_season: pick(player, player?.avgRating),
    top_scorer: pick(scorer, scorer?.goals),
    top_assister: pick(assister, assister?.assists),
  };
}

function buildSeasonReview(state, snapshot) {
  const s = snapshot;
  const row = s.table.find((r) => r.mine) || null;
  const leagueGames = row ? row.p : 0;
  const seasonStart = s.fixtures[0]?.date || null;
  // Progrès de la saison : somme des changements notés depuis le début de la saison.
  const progress = {};
  for (const x of state.progressLog || []) {
    if (seasonStart && x.gameDate < seasonStart) continue;
    progress[x.ability] = (progress[x.ability] || 0) + (x.to - x.from);
  }
  const start = state.seasonStart?.[s.season];
  const value = s.player.profile?.marketValue || null;
  const mine = s.fixtures.filter((f) => f.played && f.me && f.me.minutes > 0);
  const bestMatch = mine.slice().sort((a, b) => b.me.rating - a.me.rating || (b.me.goals + b.me.assists) - (a.me.goals + a.me.assists))[0] || null;
  const archived = Object.values(state.seasons || {}).find((x) => x.season === s.season && x.club === s.club.name);
  return {
    season: s.season,
    club: s.club.name,
    league: s.league.name,
    final_table: {
      position: row?.pos ?? null,
      teams: s.table.length,
      record: row ? { played: row.p, won: row.w, drawn: row.d, lost: row.l, goals_for: row.gf, goals_against: row.ga, points: row.pts } : null,
      champion: s.table[0] ? { team: s.table[0].team, points: s.table[0].pts } : null,
      relegation_zone: s.table.length >= 16 ? s.table.slice(-3).map((r) => r.team) : [],
      top_scorers: (s.scorerRace.top || []).slice(0, 3),
    },
    player: {
      grade: seasonGrade(s.stats.total),
      stats: s.stats.total,
      by_competition: s.stats.byCompetition,
      league_scorer_rank: s.scorerRace.myRank,
      best_match: bestMatch ? { date: bestMatch.date, match: `${bestMatch.home} ${bestMatch.score[0]}-${bestMatch.score[1]} ${bestMatch.away}`, competition: bestMatch.competition, rating: bestMatch.me.rating, goals: bestMatch.me.goals, assists: bestMatch.me.assists } : null,
      progress: Object.entries(progress).filter(([, v]) => v !== 0).map(([ability, change]) => ({ ability, change })),
      market_value: value ? { now: value, at_start: start?.marketValue && start.marketValue !== value ? start.marketValue : undefined, tracked_since: start?.gameDate } : null,
      national_team: s.nationalTeam ? { team: s.nationalTeam.name, ...s.nationalTeam.stats } : null,
    },
    awards: clubAwards(s.squad || [], leagueGames),
    trophies: archived?.trophies || s.trophies || [],
    next: {
      contract_until: s.player.contractUntil,
      clubs_following: (s.player.interests || []).map((i) => i.club),
      pending_offers: (s.player.offers || []).filter((o) => o.status === 'pending').map((o) => o.club),
    },
    career_so_far: careerFacts(state).totals,
  };
}

// Valeur marchande au premier passage de LifeLegend dans une saison (pour l'évolution sur la saison).
function noteSeasonStart(state, snapshot) {
  state.seasonStart ||= {};
  if (!state.seasonStart[snapshot.season]) {
    state.seasonStart[snapshot.season] = { gameDate: snapshot.gameDate, marketValue: snapshot.player.profile?.marketValue || null };
  }
}

module.exports = { buildSeasonReview, noteSeasonStart, seasonGrade };
