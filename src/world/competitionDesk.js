'use strict';
// La Transversale suit le joueur et son club, et aussi les compétitions où ils jouent. Ce que racontent le classement,
// la dernière journée et les coupes est calculé ici d'après la sauvegarde : les articles sur le reste du championnat
// partent de chiffres exacts, et le sujet de chacun est décidé par le code, sans requête de plus.

const TOUR_KIND = 'le tour des terrains';

const days = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
// Série en cours : la forme va du plus ancien match au plus récent, sur 5 matchs au plus.
const run = (row, letter) => { let n = 0; for (let i = (row.form || []).length - 1; i >= 0 && row.form[i] === letter; i--) n++; return n; };
const line = (m) => `${m.home} ${m.score[0]}-${m.score[1]} ${m.away}`;

// La dernière journée : le plus gros écart et la surprise (le mal classé qui bat un club loin devant lui).
function roundStory(s, position) {
  const played = (s.roundResults || []).filter((m) => m.played && m.score);
  if (!played.length) return null;
  const gap = (m) => Math.abs(m.score[0] - m.score[1]);
  const biggest = [...played].sort((a, b) => gap(b) - gap(a))[0];
  const upset = played.map((m) => {
    if (m.score[0] === m.score[1]) return null;
    const [winner, loser] = m.score[0] > m.score[1] ? [m.home, m.away] : [m.away, m.home];
    return { m, winner, loser, places: (position.get(winner) || 0) - (position.get(loser) || 0) };
  }).filter((u) => u && u.places >= 6).sort((a, b) => b.places - a.places)[0];
  return {
    round: played[0].round, date: played.at(-1).date,
    goals: played.reduce((n, m) => n + m.score[0] + m.score[1], 0),
    biggest_win: gap(biggest) >= 2 ? line(biggest) : null,
    upset: upset ? { match: line(upset.m), winner: upset.winner, winner_position: position.get(upset.winner), beaten: upset.loser, beaten_position: position.get(upset.loser) } : null,
  };
}

// La prochaine journée : l'affiche du haut de tableau et le match de la peur en bas, loin de son club.
function nextRoundStory(s, position) {
  const size = position.size;
  const away = (s.nextRound || []).filter((m) => m.homeRef !== s.club.ref && m.awayRef !== s.club.ref && position.has(m.home) && position.has(m.away));
  if (!away.length) return null;
  const sum = (m) => position.get(m.home) + position.get(m.away);
  const sorted = [...away].sort((a, b) => sum(a) - sum(b));
  const label = (m) => ({ match: `${m.home} - ${m.away}`, date: m.date, home_position: position.get(m.home), away_position: position.get(m.away) });
  const low = sorted.at(-1);
  return {
    round: away[0].round,
    top_clash: label(sorted[0]),
    bottom_clash: size >= 10 && position.get(low.home) > size / 2 && position.get(low.away) > size / 2 ? label(low) : null,
  };
}

// Ses compétitions racontées en quelques faits exacts ; ils ne font que pointer vers league_table, league_last_round,
// league_next_round et competitions, déjà dans FACTS.
function competitionStories(s) {
  const table = s.table || [];
  const position = new Map(table.map((r) => [r.team, r.pos]));
  const matches = Math.max(0, ...table.map((r) => r.p || 0));
  const out = { league: s.league?.name || null, matches_played: matches };
  if (table.length >= 2 && matches >= 3) {
    const [first, second] = table;
    out.title_race = { leader: first.team, points: first.pts, second: second.team, second_points: second.pts, lead: first.pts - second.pts, within_3_points: table.slice(1).filter((r) => first.pts - r.pts <= 3).map((r) => r.team) };
    if (table.length >= 16) {
      const safe = table.at(-4);
      out.relegation = { zone: table.slice(-3).map((r) => ({ team: r.team, points: r.pts })), first_safe: { team: safe.team, points: safe.pts } };
    }
    const runs = (letter, min) => table.map((r) => ({ team: r.team, matches: run(r, letter) })).filter((r) => r.matches >= min).sort((a, b) => b.matches - a.matches).slice(0, 3);
    const winning = runs('V', 3), losing = runs('D', 3);
    if (winning.length || losing.length) out.runs = { winning, losing, note: 'form covers the last 5 matches at most: say "at least" for a run of 5' };
  }
  const top = s.scorerRace?.top?.[0];
  if (top && top.goals >= 2) out.top_scorer = { name: top.name, team: top.team, goals: top.goals };
  const round = roundStory(s, position);
  if (round) out.last_round = round;
  const next = nextRoundStory(s, position);
  if (next) out.next_round = next;
  const cups = (s.competitions || []).filter((c) => c.mine && !c.main && (c.results.length || c.next.length));
  if (cups.length) {
    out.cups = cups.map((c) => ({
      competition: c.name,
      last_played: c.results.at(-1)?.date || null,
      ties_played: c.results.length,
      next_date: c.next[0]?.date || null,
      ties_to_come: c.next.length,
      his_club_in_next: c.next.some((m) => m.homeRef === s.club.ref || m.awayRef === s.club.ref),
    }));
  }
  return out;
}

const AROUND = 'told from ground to ground, with exact scores and scorers, and what it changes for each club; his club gets no more than any other';

// Sujet du tour des terrains : la coupe qui vient de se jouer, sinon la dernière journée du championnat ; avant un match
// (aucun résultat tout frais de son club), le tour d'après. Rend { competition, subject }.
function tourAngle(s, press, stories) {
  const league = stories.league;
  const cups = stories.cups || [];
  const roundDate = stories.last_round?.date || '';
  const fresh = cups.filter((c) => c.last_played && days(c.last_played, s.gameDate) <= 7 && c.last_played >= roundDate).sort((a, b) => b.last_played.localeCompare(a.last_played))[0];
  const pastRound = () => stories.last_round && {
    competition: league,
    subject: `around the grounds of ${league} after round ${stories.last_round.round}: every match of FACTS.league_last_round, ${AROUND} (FACTS.competition_stories.last_round, league_table)`,
  };
  const comingRound = () => stories.next_round && {
    competition: league,
    subject: `round ${stories.next_round.round} of ${league} ahead, ground by ground: the matches that matter away from his club, the top of the table and the bottom of it (FACTS.league_next_round, FACTS.competition_stories.next_round, league_table)`,
  };
  if (press.after) {
    if (fresh) return { competition: fresh.competition, subject: `around the grounds of ${fresh.competition}: the latest ties (FACTS.competitions, last_results), ${AROUND}; who goes through and the surprises` };
    return pastRound() || comingRound() || null;
  }
  const cup = press.before && cups.find((c) => c.competition === press.before.competition && c.ties_to_come);
  if (cup) return { competition: cup.competition, subject: `the coming ties of ${cup.competition}, ground by ground (FACTS.competitions, next): the matches to watch away from his club` };
  return comingRound() || pastRound() || null;
}

// La grande histoire du moment dans ses compétitions, pour la chronique : une par édition, à tour de rôle.
function longViewAngle(stories, editions = 0) {
  const list = [];
  if (stories.title_race) list.push(`the title race in ${stories.league}, from the long view: who can hold on and who is coming (FACTS.competition_stories.title_race, league_table): NOT a preview of the next match`);
  if (stories.relegation) list.push(`the relegation fight in ${stories.league}, from the long view: the clubs in danger and what is at stake for them (FACTS.competition_stories.relegation, league_table): NOT a preview of the next match`);
  if (stories.runs) list.push(`the clubs on a run in ${stories.league}, up or down, and what these runs say about the season (FACTS.competition_stories.runs, league_table): NOT a preview of the next match`);
  if (stories.top_scorer) list.push(`the race for top scorer in ${stories.league}, the men who lead it and the teams behind them (FACTS.scorer_race_in_league): NOT a preview of the next match`);
  for (const c of (stories.cups || []).filter((x) => x.ties_to_come)) list.push(`the road in ${c.competition}, who is still in it and what it means to them (FACTS.competitions): NOT a preview of the next match`);
  return list.length ? list[editions % list.length] : null;
}

// Le sujet de l'édito : une question tranchée, tirée d'un fait de ses compétitions qui ne concerne pas son club, à tour
// de rôle d'une édition à l'autre (null s'il n'y a rien à trancher).
function debateAngle(stories, editions = 0, club = null) {
  const other = (team) => team && team !== club;
  const list = [];
  const L = stories.league;
  const t = stories.title_race;
  if (t && other(t.leader)) list.push(`Is ${t.leader} (${t.points} pts, ${t.lead} ahead of ${t.second}) the real favourite of ${L}, or is the title race still open? Take a side (FACTS.competition_stories.title_race, league_table)`);
  const runOf = (r) => (r.matches >= 5 ? 'at least 5' : r.matches);
  const down = (stories.runs?.losing || []).find((r) => other(r.team));
  if (down) list.push(`${down.team} has lost its last ${runOf(down)} league matches: a crisis or a bad patch? Take a side on its choices, from FACTS (league_table, form)`);
  const up = (stories.runs?.winning || []).find((r) => other(r.team));
  if (up) list.push(`${up.team} has won its last ${runOf(up)} league matches: how far can it go this season? Take a side (league_table, form)`);
  const r = stories.relegation;
  if (r && r.zone.every((z) => other(z.team))) list.push(`Who will go down in ${L}? Take a side on the clubs in the zone (${r.zone.map((z) => z.team).join(', ')}) and those just above (league_table)`);
  const s = stories.top_scorer;
  if (s && other(s.team)) list.push(`${s.name} (${s.team}, ${s.goals} goals): the best striker of ${L} right now? Take a side (scorer_race_in_league)`);
  for (const c of (stories.cups || []).filter((x) => x.ties_to_come)) list.push(`Is ${c.competition} worth fighting for this season, for the clubs still in it? Take a side (FACTS.competitions)`);
  return list.length ? list[editions % list.length] : null;
}

// Mots qui désignent un club dans un texte (« Reims » pour « Stade de Reims », « Sochaux » pour « FC Sochaux-Montbéliard »).
const GENERIC_WORD = /^(fc|ac|as|sc|ogc|rc|sl|sv|fk|sk|cd|sd|us|usl|ea|af|hsc|cf|ud|foot|football|club|stade|sporting|olympique|racing|real|union|athletic|de|du|des|la|le|les|el|al|\d+)$/i;
function clubWords(name) {
  const words = String(name || '').split(/\s+/).filter((w) => w.length >= 3 && !GENERIC_WORD.test(w));
  const parts = words.flatMap((w) => (w.includes('-') ? w.split('-').filter((x) => x.length >= 5 && x !== 'Saint') : []));
  return [...new Set([...words, ...parts])];
}
const hasWord = (text, word) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text);

// Ce que la relecture doit savoir pour juger un article sur la compétition : les autres clubs, et ce qui désigne les siens.
function coverageOf(s) {
  const teams = new Set((s.table || []).map((r) => r.team));
  for (const c of (s.competitions || []).filter((x) => x.mine)) for (const m of [...c.results, ...c.next]) { teams.add(m.home); teams.add(m.away); }
  teams.delete(s.club?.name);
  const surname = String(s.player?.name || '').trim().split(/\s+/).at(-1);
  return { others: [...teams], own: [...clubWords(s.club?.name), ...(surname ? [surname] : [])] };
}

// Un article sur la compétition doit parler des autres clubs, et ne pas revenir sans cesse au sien ni au joueur.
function coverageProblems(article, coverage) {
  if (article.focus === 'world' && article.kind === TOUR_KIND && coverage?.world?.[article.competition]) {
    const teams = coverage.world[article.competition];
    const want = Math.min(4, teams.length);
    const named = teams.filter((team) => clubWords(team).some((w) => hasWord(String(article.body || ''), w))).length;
    return named < want ? [`this article is about ${article.competition}: it names ${named} of its clubs, name at least ${want}, with their exact results from FACTS.world_football`] : [];
  }
  if (article.focus !== 'competition' || !coverage) return [];
  const body = String(article.body || '');
  const want = article.kind === TOUR_KIND ? 4 : 2;
  const named = coverage.others.filter((team) => clubWords(team).some((w) => hasWord(body, w))).length;
  const problems = [];
  if (named < want) problems.push(`this article is about the competition as a whole: it names ${named} other club${named > 1 ? 's' : ''}, name at least ${want}, with their exact results or positions from FACTS`);
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const own = paragraphs.filter((p) => coverage.own.some((w) => hasWord(p, w))).length;
  if (own >= 2 && own > paragraphs.length / 2) problems.push(`this article is about the competition as a whole: ${own} of its ${paragraphs.length} paragraphs come back to his club or the player, keep them to one or two sentences and write about the other clubs`);
  return problems;
}

module.exports = { TOUR_KIND, competitionStories, tourAngle, longViewAngle, debateAngle, clubWords, coverageOf, coverageProblems };
