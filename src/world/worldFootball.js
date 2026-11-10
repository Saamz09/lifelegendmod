'use strict';
// Le football mondial de La Transversale (2026-11-09) : le journal couvre les grandes compétitions comme un quotidien
// sportif européen (coupes d'Europe, grands championnats, grands tournois) et leurs récompenses, et suit la carrière du
// joueur dans la rubrique de son championnat. Tout vient des scores de toute la sauvegarde (src/world/scores.js) :
// depuis la dernière édition, les résultats de chaque grande compétition avec buteurs et homme du match, le haut et le
// bas du classement, les meilleurs buteurs, l'équipe type de la journée, et chaque début de mois le joueur du mois (avec
// ses matchs du mois : l'IA inventait un « doublé contre Everton »). Sans les notes de l'homme du match ni de l'équipe
// type : le journal les recopiait partout. Un résumé qui part dans la même requête que le journal : aucune requête de plus.

const MAX_COMPS = 8, MAX_RESULTS = 10, MAX_STANDOUTS = 8;
const MIN_APPS_MONTH = 3, MIN_MINUTES_MONTH = 30; // joueur du mois : 3 matchs d'au moins 30 minutes dans le mois
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthBefore = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Poids d'une compétition dans le journal : la Ligue des champions et les grands tournois d'abord, puis les cinq grands
// championnats, la Ligue Europa et la Libertadores.
const TIERS = [[/champions league/i, 10], [/world cup|coupe du monde/i, 10], [/\beuro\b/i, 10], [/^premier league$/i, 8], [/^laliga( santander| ea sports)?$/i, 8],
  [/^serie a\b/i, 7], [/^bundesliga$/i, 7], [/^ligue 1\b/i, 7], [/europa league/i, 6], [/libertadores/i, 5]];
const tierOf = (name) => (TIERS.find(([re]) => re.test(String(name || ''))) || [null, 4])[1];

// Rangée d'un classement : position, club, matchs, bilan, différence, points.
const row = (team) => (r, i) => ({ pos: i + 1, team: team(r[0]), p: r[1], w: r[2], d: r[3], l: r[4], gd: r[5] - r[6], pts: r[7] });

// Joueurs du mois d'un mois fini (« 2026-10 ») : meilleure note moyenne (au moins 3 matchs de 30 minutes), à égalité
// buts et passes. Par grand championnat (et son championnat), et un général sur les grandes compétitions.
function playersOfMonth(scores, month, { league = null } = {}) {
  const team = (ref) => scores.teams?.[ref]?.[0] || null;
  const per = new Map(); // nom de compétition (ou '*') -> Map(joueur -> cumul)
  const add = (key, name, ref, line, match) => {
    if (!per.has(key)) per.set(key, new Map());
    const m = per.get(key), id = `${name}|${ref}`;
    const a = m.get(id) || { player: name, team: team(ref), apps: 0, sum: 0, goals: 0, assists: 0, matches: [] };
    a.apps++; a.sum += line[3]; a.goals += line[4]; a.assists += line[5];
    a.matches.push({ ...match, goals: line[4], assists: line[5] });
    m.set(id, a);
  };
  scores.matches.forEach((m, i) => {
    const c = scores.comps[m[2]];
    if (!c || String(m[0]).slice(0, 7) !== month || m.length < 8) return;
    const lu = scores.details?.[i]?.lu;
    if (!Array.isArray(lu)) return;
    const counted = c.big && !c.mine;
    const ownLeague = league && c.name === league;
    if (!counted && !ownLeague) return;
    lu.forEach((side, s) => (side || []).forEach((line) => {
      if (!line?.[0] || line[2] < MIN_MINUTES_MONTH || !(line[3] > 0)) return;
      const ref = m[4 + s];
      const match = { date: m[0], competition: c.name, against: team(m[5 - s]), venue: s ? 'away' : 'home' };
      if (c.kind === 'league') add(c.name, line[0], ref, line, match);
      if (counted) add('*', line[0], ref, line, match);
    }));
  });
  const best = (m) => [...(m?.values() || [])].filter((a) => a.apps >= MIN_APPS_MONTH && a.team)
    .map(({ sum, matches, ...a }) => ({ ...a, avg: Math.round((sum / a.apps) * 100) / 100, matches: [...matches].sort((x, y) => x.date.localeCompare(y.date)) }))
    .sort((a, b) => b.avg - a.avg || (b.goals + b.assists) - (a.goals + a.assists) || b.apps - a.apps)[0] || null;
  const leagues = scores.comps.filter((c) => c.kind === 'league' && ((c.big && !c.mine) || (league && c.name === league)))
    .map((c) => { const b = best(per.get(c.name)); return { competition: c.name, ...b, ...(b ? { matches: b.matches.map(({ competition, ...x }) => x) } : {}) }; }).filter((x) => x.player)
    .sort((a, b) => (a.competition === league) - (b.competition === league) || tierOf(b.competition) - tierOf(a.competition));
  const overall = best(per.get('*'));
  return overall || leagues.length ? { month, overall, leagues } : null;
}

// scores : le résultat de buildScores ; since : date de la dernière édition (sinon les 7 derniers jours) ; today : date
// du jeu ; seen : ce qui a déjà été annoncé ({ month, rounds: { championnat: journée } }) ; league : son championnat.
// Rend null s'il n'y a rien de neuf ; sinon le résumé, avec « marks » à retenir une fois l'édition parue.
function worldFootball(scores, { since = null, today, seen = {}, league = null } = {}) {
  if (!scores?.comps?.length || !Array.isArray(scores.matches) || !today) return null;
  const from = since && since < today ? since : addDays(today, -7);
  const team = (ref) => scores.teams?.[ref]?.[0] || null;
  const byComp = new Map();
  const standouts = [];
  scores.matches.forEach((m, i) => {
    const [date, , ci, , h, a, gh, ga] = m;
    const c = scores.comps[ci];
    if (!c || !c.big || c.mine || gh == null || ga == null || !(date > from && date <= today)) return;
    const home = team(h), away = team(a);
    if (!home || !away) return;
    const d = scores.details?.[i] || {};
    const ev = d.ev || [];
    const score = `${gh}-${ga}`;
    for (const [side, player, goals, assists] of ev) {
      if (goals >= 2 || goals + assists >= 3) standouts.push({ player, team: side ? away : home, goals, assists, against: side ? home : away, match: `${home} ${score} ${away}`, competition: c.name, date, europe: c.country === 'Europe' });
    }
    const scorers = ev.filter((e) => e[2] > 0).map((e) => (e[2] > 1 ? `${e[1]} (${e[2]})` : e[1]));
    const motm = Array.isArray(d.motm) && d.motm[0] ? `${d.motm[0]} (${d.motm[1] ? away : home})` : null;
    const weight = Math.max(0, ...ev.map((e) => 2 * e[2] + e[3])) + Math.abs(gh - ga) + gh + ga;
    if (!byComp.has(ci)) byComp.set(ci, []);
    byComp.get(ci).push({ date, home, away, score, scorers, ...(motm ? { man_of_the_match: motm } : {}), weight });
  });

  // L'équipe type de la journée de chaque grand championnat (et du sien), quand une journée nouvelle s'est finie.
  const rounds = { ...(seen.rounds || {}) };
  const totwOf = (c) => {
    const t = c.totw;
    if (!t?.round || t.round === seen.rounds?.[c.name] || !Array.isArray(t.xi) || !t.xi.length) return null;
    rounds[c.name] = t.round;
    return { competition: c.name, round: t.round, xi: t.xi.map(([player, ref, line]) => ({ player, team: team(ref), line })), ...(t.best?.[0] ? { player_of_the_round: { player: t.best[0], team: team(t.best[1]), rating: t.best[2] } } : {}) };
  };

  // Les compétitions du journal : la plus lourde d'abord (poids, puis matchs joués).
  const competitions = [...byComp].map(([ci, ms]) => [scores.comps[ci], ms])
    .sort(([a, x], [b, y]) => tierOf(b.name) - tierOf(a.name) || y.length - x.length).slice(0, MAX_COMPS).map(([c, ms]) => {
      const table = c.kind === 'league' && Array.isArray(c.table) && c.table.length ? c.table.map(row(team)) : null;
      const totw = c.kind === 'league' ? totwOf(c) : null;
      return {
        competition: c.name, country: c.country || null, kind: c.kind, tier: tierOf(c.name), matches_played: ms.length,
        results: [...ms].sort((p, q) => q.weight - p.weight).slice(0, MAX_RESULTS).map(({ weight, ...r }) => r),
        ...(table ? { table_top: table.slice(0, 6), table_bottom: table.length > 9 ? table.slice(-3) : undefined } : {}),
        ...(c.scorers?.length ? { top_scorers: c.scorers.slice(0, 5).map(([player, ref, goals, assists, apps]) => ({ player, team: team(ref), goals, assists, apps })) } : {}),
        ...(totw ? { team_of_the_round: totw } : {}),
      };
    });
  // Son championnat : l'équipe type de sa journée rejoint les récompenses (sa rubrique a déjà ses classements).
  const own = league && scores.comps.find((c) => c.name === league && c.kind === 'league');
  const ownTotw = own ? totwOf(own) : null;

  // Le joueur du mois : le mois fini, une seule fois.
  const prev = monthBefore(today.slice(0, 7));
  const potm = seen.month !== prev && !(seen.month > prev) ? playersOfMonth(scores, prev, { league }) : null;
  // Le footballeur de l'année, la récompense du jeu (lue dans la sauvegarde) : la dernière décernée, une seule fois, et
  // seulement si elle est de cette année ou de la précédente (pas le palmarès d'avant la carrière).
  const lastPoty = (scores.poty || [])[0];
  const year = Number(today.slice(0, 4));
  const poty = lastPoty && lastPoty.year >= year - 1 && seen.poty !== lastPoty.year && !(seen.poty > lastPoty.year) ? {
    year: lastPoty.year,
    ranking: lastPoty.podium.filter(([player]) => player).map(([player, ref, points, me], i) => ({ rank: i + 1, player, team: team(ref), points, ...(me ? { is_the_user: true } : {}) })),
    ...((scores.poty || [])[1] ? { previous: { year: scores.poty[1].year, winner: scores.poty[1].podium[0]?.[0] || null, team: team(scores.poty[1].podium[0]?.[1]) } } : {}),
  } : null;
  const awards = {
    ...(poty?.ranking.length ? { player_of_the_year: poty } : {}),
    ...(potm ? { player_of_the_month: potm } : {}),
    ...(ownTotw ? { team_of_the_round_in_his_league: ownTotw } : {}),
  };
  if (!competitions.length && !Object.keys(awards).length) return null;
  // Les buts d'abord, à égalité une soirée européenne, puis les passes et la date.
  standouts.sort((p, q) => q.goals - p.goals || q.europe - p.europe || q.assists - p.assists || q.date.localeCompare(p.date));
  return {
    since: from, until: today,
    standouts: standouts.slice(0, MAX_STANDOUTS).map(({ europe, ...s }) => s),
    competitions,
    ...(Object.keys(awards).length ? { awards } : {}),
    marks: { month: potm ? prev : seen.month || null, rounds, poty: poty?.ranking.length ? poty.year : seen.poty || null },
  };
}

// Les joueurs du mois gardés pour la page Récompenses, sans le détail de leurs matchs.
function potmSummary(p) {
  if (!p) return p;
  const lite = (x) => { if (!x) return x; const { matches, ...rest } = x; return rest; };
  return { ...p, overall: lite(p.overall), leagues: (p.leagues || []).map(lite) };
}

// Les joueurs de l'équipe type de chaque compétition du résumé (et de son championnat, sous « *awards »), pour la
// relecture : un article ne les aligne pas tous.
function worldTotw(w) {
  const out = {};
  for (const c of w?.competitions || []) if (c.team_of_the_round?.xi?.length) out[c.competition] = c.team_of_the_round.xi.map((x) => x.player);
  const own = w?.awards?.team_of_the_round_in_his_league;
  if (own?.xi?.length) out['*awards'] = own.xi.map((x) => x.player);
  return out;
}

// Le football mondial pour Kop (2026-11-09, demande d'un testeur : « Mbappé plante un doublé en LdC ») : un résumé court
// du même résumé, dans la requête de l'édition qui part déjà. Les plus gros résultats de chaque grande compétition avec
// leurs buteurs, le haut du classement, le meilleur buteur, les grandes performances, le joueur du mois et le footballeur
// de l'année.
function worldBrief(w) {
  if (!w?.competitions?.length && !w?.awards?.player_of_the_month && !w?.awards?.player_of_the_year) return null;
  const potm = w.awards?.player_of_the_month?.overall;
  const poty = w.awards?.player_of_the_year;
  return {
    since: w.since, until: w.until,
    competitions: (w.competitions || []).slice(0, 7).map((c) => ({
      competition: c.competition,
      big_results: (c.results || []).slice(0, 3).map((r) => `${r.home} ${r.score} ${r.away} (${r.date}${r.scorers?.length ? `; ${r.scorers.join(', ')}` : ''})`),
      ...(c.table_top?.length >= 2 ? { top_of_table: c.table_top.slice(0, 3).map((r) => `${r.pos}. ${r.team} ${r.pts} pts (${r.p} matches)`) } : {}),
      ...(c.top_scorers?.[0] ? { top_scorer: `${c.top_scorers[0].player} (${c.top_scorers[0].team}), ${c.top_scorers[0].goals} goals` } : {}),
    })),
    standouts: (w.standouts || []).slice(0, 5).map((s) => `${s.player} (${s.team}): ${s.goals} goal(s)${s.assists ? ` and ${s.assists} assist(s)` : ''} in ${s.match}, ${s.competition}, ${s.date}`),
    ...(poty ? { player_of_the_year: `the game's « footballeur de l'année » ${poty.year}: ${poty.ranking.map((r) => `${r.rank}. ${r.player} (${r.team}) ${r.points} points`).join(', ')}` } : {}),
    ...(potm ? { player_of_the_month: `${potm.player} (${potm.team}), ${w.awards.player_of_the_month.month}: ${potm.goals} goals in ${potm.apps} matches, average rating ${potm.avg}` } : {}),
  };
}

// Ce que chaque compétition a de plus fort, pour l'attaque de son article et la vignette (deux clubs) : la plus grosse
// performance, sinon le plus gros résultat.
function competitionAngle(c, standouts = []) {
  const s = standouts.find((x) => x.competition === c.competition);
  if (s) {
    const feat = s.goals >= 3 ? `hat-trick (${s.goals} goals)` : s.goals === 2 ? 'brace' : `${s.goals} goal(s) and ${s.assists} assist(s)`;
    return { teams: [s.team, s.against], story: `${s.player}'s ${feat} for ${s.team} against ${s.against} (${s.match}, ${s.date})`, weight: c.tier * (2 + Math.min(c.matches_played, 10) / 5) + s.goals * 2 };
  }
  const r = c.results[0];
  return { teams: [r.home, r.away], story: `${r.home} ${r.score} ${r.away} (${r.date})`, weight: c.tier * (2 + Math.min(c.matches_played, 10) / 5) };
}

// Les sujets du journal mondial, du plus lourd au plus léger : une compétition chacun, avec son attaque.
function worldStories(w) {
  return (w?.competitions || []).filter((c) => c.results?.length)
    .map((c) => ({ competition: c.competition, kind: c.kind, matches: c.matches_played, totw: Boolean(c.team_of_the_round), ...competitionAngle(c, w.standouts) }))
    .sort((a, b) => b.weight - a.weight);
}

// Un débat du football mondial pour l'édito, à tour de rôle d'une édition à l'autre : la course au titre d'un grand
// championnat (écart entre les deux premiers), sinon le leader du classement des buteurs.
// La vie des championnats (son choix le 2027-01-01 : « ce type d'article qui raconte la vie des championnats, un peu plus
// souvent ») : l'édito de La Transversale et la voix neutre de Kop. Un championnat différent à chaque édition ; quand tous
// y sont passés, le sujet change : la course au titre, puis la lutte pour l'Europe, le maintien, le meilleur buteur.
function worldDebate(w, editions = 0) {
  const src = '(FACTS.world_football)';
  const line = (rows) => rows.map((r) => `${r.pos}. ${r.team} ${r.pts} pts`).join(', ');
  const perComp = (w?.competitions || []).filter((c) => c.table_top?.length >= 2).map((c) => {
    const t = c.table_top, [a, b] = t, gap = a.pts - b.pts, sc = c.top_scorers || [];
    return [
      gap <= 2
        ? `the title race in ${c.competition}: ${a.team} ${a.pts} pts, ${b.team} ${b.pts} pts after ${a.p} matches ${src}: who is the real favourite? Take a side`
        : `${a.team} lead ${c.competition} by ${gap} points over ${b.team} (${a.pts} against ${b.pts}, FACTS.world_football): is the title race already over? Take a side`,
      t.length >= 6 ? `the race for the European places in ${c.competition}: ${line(t.slice(2, 6))} ${src}: who will make it, who will fall short? Take a side` : null,
      c.table_bottom?.length >= 2 ? `the fight to stay up in ${c.competition}: ${line(c.table_bottom)} ${src}: who is in real danger, who will get out of it? Take a side` : null,
      sc.length >= 2 ? `the scorer race in ${c.competition}: ${sc.slice(0, 3).map((p) => `${p.player} (${p.team}) ${p.goals} goals`).join(', ')} ${src}: who will finish top scorer? Take a side` : null,
    ].filter(Boolean);
  });
  if (!perComp.length) return null;
  const list = perComp[editions % perComp.length];
  return list[Math.floor(editions / perComp.length) % list.length];
}

// Ancien angle « le foot ailleurs » (un seul article) : gardé pour les éditions sans grande compétition dans le plan.
function worldAngle(w) {
  const s = worldStories(w)[0];
  return s ? { competition: s.competition, teams: s.teams, story: s.story } : null;
}

module.exports = { worldFootball, worldStories, worldDebate, worldAngle, worldBrief, playersOfMonth, potmSummary, worldTotw, tierOf };
