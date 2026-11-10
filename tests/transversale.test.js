'use strict';
// La Transversale (consigne réécrite le 2026-11-09) : un quotidien factuel, le plan fixé par le code selon l'actualité
// (le journal mondial : 5 à 7 articles, une grande compétition par article ; sinon trois après un match), une attaque par
// article qui change d'une édition à l'autre, des longueurs courtes à moyennes. Le journal suit le joueur et son club,
// leurs compétitions, et le football ailleurs d'après la sauvegarde.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const world = require(path.join(ROOT, 'src/world/world.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));
const { TOUR_KIND, competitionStories, tourAngle, longViewAngle, debateAngle, clubWords, coverageOf, coverageProblems } = require(path.join(ROOT, 'src/world/competitionDesk.js'));
const { worldFootball, worldStories, worldDebate, potmSummary, worldTotw } = require(path.join(ROOT, 'src/world/worldFootball.js'));
const WORLD = 'le foot ailleurs';

const desk = ['A. Lead', 'B. Tactique', 'C. Édito', 'D. Consultant', 'E. Reporter', 'F. Compétitions'].map((name) => ({ name, role: '' }));
const match = { match: 'Troyes 1-0 Grenoble', competition: 'Ligue 2 BKT', date: '2020-08-22' };
const next = { match: 'Caen - Troyes', competition: 'Ligue 2 BKT', date: '2020-08-29', in_days: 2 };
const body = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');
const kinds = (plan) => plan.map((p) => p.kind);
const words = (plan) => plan.reduce((n, p) => n + prompts.ARTICLE_SIZES[p.size].words[1], 0);
const worldStory = { competition: 'UEFA Champions League', teams: ['Real Madrid CF', 'Paris Saint-Germain'], story: "Kylian Mbappé's brace" };

test('plan selon l’actualité : trois articles après un match, quatre quand il compte', () => {
  for (let n = 0; n < 4; n++) {
    const plain = world.transversalePlan(desk, { after: match, before: null }, 'POST-MATCH', n);
    assert.deepStrictEqual(kinds(plain), ['récit du match', 'conférence de presse', TOUR_KIND]);
    assert.strictEqual(plain[0].size, 'medium', 'récit en format moyen');
    const big = world.transversalePlan(desk, { after: match, before: null }, 'POST-MATCH', n, { big: true });
    assert.strictEqual(big.length, 4);
    assert.strictEqual(big[0].size, 'long', 'une longue lecture quand le match compte');
  }
  // Le quatrième article tourne : analyse tactique, édito, regard du consultant, « Le Débrief ».
  assert.deepStrictEqual([0, 1, 2, 3].map((n) => world.transversalePlan(desk, { after: match, before: null }, 'POST-MATCH', n, { big: true })[3].kind), ['analyse tactique', 'édito', 'regard de consultant', 'débat télévisé']);
  assert.match(world.transversalePlan(desk, { after: match, before: null }, 'POST-MATCH', 3, { big: true })[3].subject, /an invented guest/);
  // Avant un match : la conférence, le consultant ou l'édito, et le tour quand une journée s'annonce.
  const tour = { competition: 'Ligue 2 BKT', subject: 'la journée' };
  assert.deepStrictEqual(kinds(world.transversalePlan(desk, { after: null, before: next }, 'PREVIEW', 0, { tour })), ['conférence de presse', 'regard de consultant', TOUR_KIND]);
  assert.deepStrictEqual(kinds(world.transversalePlan(desk, { after: null, before: next }, 'PREVIEW', 1, { tour })), ['conférence de presse', 'édito', TOUR_KIND]);
  const noTour = world.transversalePlan(desk, { after: null, before: next }, 'PREVIEW', 0, { story: 'la course au titre' });
  assert.deepStrictEqual(kinds(noTour), ['conférence de presse', 'regard de consultant', 'chronique']);
  assert.strictEqual(noTour[2].subject, 'la course au titre');
  // L'édito part du sujet calculé d'après la sauvegarde.
  assert.strictEqual(world.transversalePlan(desk, { after: null, before: next }, 'PREVIEW', 1, { debate: 'Saint-Étienne, vrai favori ?' })[1].subject, 'Saint-Étienne, vrai favori ?');
  // Fin de saison : le numéro spécial.
  for (const press of [{ after: match, before: null }, { after: null, before: null }]) {
    const special = world.transversalePlan(desk, press, 'SEASON REVIEW: …', 0, { world: worldStory });
    assert.deepStrictEqual(kinds(special), ['chronique', 'les chiffres', 'édito', 'regard de consultant'], 'sans le foot ailleurs');
    assert.ok(/special issue/.test(special[0].subject) && /season_awards/.test(special[1].subject) && /grade/.test(special[3].subject));
  }
  // Grande nouvelle : le chroniqueur l'ouvre, en longue lecture.
  const transfer = world.transversalePlan(desk, { after: match, before: null }, 'TRANSFER: …', 0);
  assert.strictEqual(transfer[0].focus, 'lead');
  assert.strictEqual(transfer[0].size, 'long');
});

test('plan : chaque article a son attaque, qui change d’une édition à l’autre', () => {
  const lead = (n) => world.transversalePlan(desk, { after: match, before: null }, 'POST-MATCH', n)[0].lead;
  assert.notStrictEqual(lead(0), lead(1));
  assert.match(lead(0), /decisive action/);
  for (const press of [{ after: match, before: null }, { after: match, before: next }, { after: null, before: next }, { after: null, before: null }]) {
    for (let n = 0; n < 8; n++) {
      for (const kind of ['POST-MATCH', 'MATCH DAY PREVIEW', 'TRANSFER: …', 'SEASON REVIEW: …', 'FIRST EDITION: … FACTS.biography …']) {
        for (const angles of [{}, { big: true }, { world: worldStory }, { big: true, world: worldStory, tour: { subject: 't' } }]) {
          const plan = world.transversalePlan(desk, press, kind, n, angles);
          const label = `${JSON.stringify(press)} ${kind} n°${n} ${JSON.stringify(angles)}`;
          assert.ok(plan.length >= 2 && plan.length <= 5, `2 à 5 articles : ${label}`);
          assert.ok(plan.every((p) => typeof p.lead === 'string' && p.lead.length > 10), `une attaque par article : ${label}`);
          assert.ok(plan.filter((p) => p.size === 'long').length <= 1, `une longue lecture au plus : ${label}`);
          assert.ok(plan.every((p) => ['club', 'competition', 'lead', 'world'].includes(p.focus)), `un point de vue par article : ${label}`);
          assert.ok(plan.some((p) => p.focus === 'competition' || p.focus === 'world'), `au moins un article sur les autres : ${label}`);
          assert.ok(plan.some((p) => p.focus === 'club' || p.focus === 'lead'), `au moins un article sur lui ou son club : ${label}`);
          assert.ok(words(plan) <= 2400, `pas de texte en trop : ${words(plan)} mots, ${label}`);
          if (/biography/.test(kind)) assert.ok(plan.some((p) => p.kind === 'portrait'), `le portrait : ${label}`);
        }
      }
    }
  }
});

// Le journal du football mondial (2026-11-09) : 5 à 7 articles, une grande compétition par article et par son
// correspondant, son match dans la rubrique de son championnat, à la une seulement quand il fait l'actualité.
const desk10 = [...desk, ...['G. Angleterre', 'H. Espagne', 'I. Italie', 'J. Allemagne'].map((name) => ({ name, role: '' }))];
const story = (competition, weight, extra = {}) => ({ competition, kind: 'league', matches: 10, teams: [`${competition} A`, `${competition} B`], story: `${competition} A 3-0 ${competition} B`, weight, ...extra });
const FIVE = [story('Premier League', 40), story('Serie A', 35, { totw: true }), story('Bundesliga', 33), story('LaLiga', 32), story('Ligue 1', 30)];
const worldOf = (stories, extra = {}) => ({ world: { stories, debate: 'Arsenal FC lead Premier League by 8 points', awards: null, ...extra } });

test('journal mondial : une compétition par article, son match dans sa rubrique, à la une quand il fait l’actualité', () => {
  const plan = world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', 0, worldOf(FIVE));
  assert.ok(plan.length >= 5 && plan.length <= 7, `${plan.length} articles`);
  assert.deepStrictEqual([plan[0].kind, plan[0].competition, plan[0].size, plan[0].author], [TOUR_KIND, 'Premier League', 'long', 'G. Angleterre'], 'la plus grosse compétition à la une, par son correspondant');
  assert.deepStrictEqual([plan[1].kind, plan[1].author, plan[1].competition], ['récit du match', 'E. Reporter', 'Ligue 2 BKT'], 'son match dans sa rubrique');
  const tours = plan.filter((p) => p.focus === 'world' && p.kind === TOUR_KIND);
  // Deux « tour des terrains » au plus (sa demande du 2026-11-10 : moins de scores), les autres dans un article commun.
  assert.deepStrictEqual(tours.map((p) => p.competition), ['Premier League', 'Serie A']);
  assert.deepStrictEqual(tours.map((p) => p.author), ['G. Angleterre', 'I. Italie']);
  assert.match(plan.find((p) => p.kind === WORLD)?.subject || '', /\(Bundesliga, LaLiga, Ligue 1\)/);
  assert.ok(tours.every((p) => p.teams?.length === 2 && /only from its entry in FACTS\.world_football\.competitions/.test(p.subject)));
  assert.match(tours[1].subject, /team_of_the_round/, 'l’équipe type de la journée quand elle est nouvelle');
  // La conférence de presse à chaque match de son club, et un article d'après-match qui tourne.
  assert.ok(plan.some((p) => p.kind === 'conférence de presse' && p.focus === 'club'), 'la conférence de presse');
  const after = (n) => world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', n, worldOf(FIVE)).find((p) => ['analyse tactique', 'débat télévisé', 'regard de consultant'].includes(p.kind) && p.focus === 'club')?.kind;
  assert.deepStrictEqual([0, 1, 2].map(after), ['analyse tactique', 'débat télévisé', 'regard de consultant']);
  // Quand il fait l'actualité : son match ouvre le journal, la conférence de presse suit.
  const big = world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', 0, { ...worldOf(FIVE), big: true });
  assert.deepStrictEqual(big.slice(0, 2).map((p) => [p.kind, p.author, p.size]), [['récit du match', 'A. Lead', 'long'], ['conférence de presse', 'E. Reporter', 'medium']]);
  assert.ok(big.length <= 7);
  // Sans match : seulement le monde, et un édito ou les chiffres.
  const calm = world.transversalePlan(desk10, { after: null, before: null }, 'QUIET', 1, worldOf(FIVE));
  assert.ok(!calm.some((p) => p.focus === 'club'));
  assert.ok(calm.some((p) => p.kind === 'édito' && /Arsenal FC lead/.test(p.subject)));
  // Trop de compétitions : les dernières se partagent « le foot ailleurs ».
  const seven = [story('UEFA Champions League', 60, { kind: 'cup' }), story('UEFA Europa League', 45, { kind: 'cup' }), ...FIVE];
  const full = world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', 0, { ...worldOf(seven), big: true });
  assert.strictEqual(full.length, 7);
  const rest = full.find((p) => p.kind === WORLD);
  // Journal plein : l'édito sur la vie d'un championnat garde sa place (son choix, 2027-01-01), un championnat de plus
  // rejoint « le foot ailleurs ».
  assert.ok(rest && /\(Premier League, Serie A, Bundesliga, LaLiga, Ligue 1\)/.test(rest.subject), rest?.subject);
  assert.ok(full.some((p) => p.kind === 'édito'), 'l’édito sur la vie d’un championnat, même quand le journal est plein');
  assert.ok(plan.some((p) => p.kind === 'édito'), 'l’édito à chaque édition');
  assert.strictEqual(full.find((p) => p.competition === 'UEFA Champions League').author, 'F. Compétitions', 'le chroniqueur écrit déjà son match : la Ligue des champions va à la rubrique compétitions');
  // Une seule compétition : on complète jusqu'à cinq.
  assert.ok(world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', 0, worldOf([FIVE[0]])).length >= 5);
  // Début de mois : le joueur du mois, sans que la même plume signe aussi les chiffres.
  const potm = world.transversalePlan(desk10, { after: match, before: null }, 'POST-MATCH', 0, worldOf(FIVE, { awards: { player_of_the_month: { month: '2026-10' } } }));
  const award = potm.find((p) => p.kind === 'les récompenses');
  assert.ok(award && award.author === 'B. Tactique' && award.focus === 'awards' && /2026-10/.test(award.subject));
  assert.strictEqual(potm.filter((p) => p.author === 'B. Tactique').length, 1);
  assert.ok(prompts.TRANSVERSALE_KINDS.includes('les récompenses'));
  // Fin de saison : le numéro spécial de son championnat, comme avant.
  assert.deepStrictEqual(kinds(world.transversalePlan(desk10, { after: match, before: null }, 'SEASON REVIEW: …', 0, worldOf(FIVE))), ['chronique', 'les chiffres', 'édito', 'regard de consultant']);
});

test('football mondial : résultats, classements, buteurs, équipe type et joueur du mois d’après la sauvegarde', () => {
  const lu = (names, rating = 7) => names.map((n) => [n, 1, 90, rating, 0, 0, 9]);
  const scores = {
    comps: [
      { name: 'UEFA Champions League', kind: 'cup', big: true, mine: false, country: 'Europe', scorers: [['Kylian Mbappé', 1, 6, 1, 4]] },
      { name: 'LaLiga', kind: 'league', big: true, mine: false, country: 'Espagne', table: [[1, 10, 8, 1, 1, 20, 5, 25, 'VVVVV'], [2, 10, 7, 2, 1, 15, 6, 23, 'VVNVV'], [3, 10, 6, 2, 2, 12, 8, 20, 'VDVVN'], [5, 10, 1, 1, 8, 5, 20, 4, 'DDDDD']],
        totw: { round: 11, xi: [['Raphinha', 2, 'att', 8]], best: ['Raphinha', 2, 8] } },
      { name: 'Ligue 2 BKT', kind: 'league', big: false, mine: true, country: 'France', totw: { round: 9, xi: [['Ilan Morel', 6, 'att', 7.5]], best: null } },
      { name: 'Serie BKT', kind: 'league', big: false, mine: false, country: 'Italie' },
    ],
    teams: { 1: ['Real Madrid CF'], 2: ['FC Barcelona'], 3: ['Atlético Madrid'], 4: ['Paris Saint-Germain'], 5: ['Cádiz CF'], 6: ['AS Nancy Lorraine'], 7: ['Parma'] },
    matches: [
      ['2026-11-05', 21, 0, 4, 4, 1, 1, 2],
      ['2026-11-06', 21, 1, 10, 2, 5, 3, 0],
      ['2026-10-01', 21, 1, 9, 1, 2, 1, 1],
      ['2026-11-06', 20, 2, 10, 6, 5, 1, 0],
      ['2026-11-06', 20, 3, 10, 7, 5, 9, 0],
      ['2026-11-09', 20, 1, 11, 1, 3],
      ['2026-10-08', 20, 1, 8, 1, 3, 2, 0], ['2026-10-15', 20, 1, 9, 3, 1, 0, 1], ['2026-10-22', 20, 1, 10, 1, 5, 4, 0],
    ],
    details: {
      0: { ev: [[1, 'Kylian Mbappé', 2, 0], [0, 'Ousmane Dembélé', 1, 0]], motm: ['Kylian Mbappé', 1, 8.5] },
      1: { ev: [[0, 'Lamine Yamal', 1, 2], [0, 'Raphinha', 2, 0]] },
      6: { ev: [], lu: [lu(['Jude Bellingham'], 7.5), lu(['Koke'])] }, 7: { ev: [], lu: [lu(['Koke']), lu(['Jude Bellingham'], 8)] }, 8: { ev: [], lu: [lu(['Jude Bellingham'], 7), lu(['Rubén Sobrino'])] },
    },
  };
  const w = worldFootball(scores, { since: '2026-11-01', today: '2026-11-07', league: 'Ligue 2 BKT' });
  assert.deepStrictEqual(w.competitions.map((c) => [c.competition, c.matches_played]), [['UEFA Champions League', 1], ['LaLiga', 1]], 'la Ligue des champions d’abord ; ni ses compétitions, ni les petites, ni les vieux matchs, ni ceux à venir');
  assert.deepStrictEqual(w.competitions[0].results[0], { date: '2026-11-05', home: 'Paris Saint-Germain', away: 'Real Madrid CF', score: '1-2', scorers: ['Kylian Mbappé (2)', 'Ousmane Dembélé'], man_of_the_match: 'Kylian Mbappé (Real Madrid CF)' }, 'l’homme du match sans sa note : le journal la recopiait partout');
  assert.deepStrictEqual(w.competitions[0].top_scorers, [{ player: 'Kylian Mbappé', team: 'Real Madrid CF', goals: 6, assists: 1, apps: 4 }]);
  assert.deepStrictEqual(w.competitions[1].table_top[0], { pos: 1, team: 'Real Madrid CF', p: 10, w: 8, d: 1, l: 1, gd: 15, pts: 25 });
  assert.deepStrictEqual(w.competitions[1].team_of_the_round, { competition: 'LaLiga', round: 11, xi: [{ player: 'Raphinha', team: 'FC Barcelona', line: 'att' }], player_of_the_round: { player: 'Raphinha', team: 'FC Barcelona', rating: 8 } });
  assert.deepStrictEqual(w.standouts.map((s) => s.player), ['Kylian Mbappé', 'Raphinha', 'Lamine Yamal'], 'à buts égaux, la soirée européenne d’abord');
  // Le joueur du mois d'octobre : trois matchs d'au moins 30 minutes, la meilleure moyenne.
  const potm = w.awards.player_of_the_month;
  assert.strictEqual(potm.month, '2026-10');
  assert.deepStrictEqual([potm.overall.player, potm.overall.team, potm.overall.apps, potm.overall.avg], ['Jude Bellingham', 'Real Madrid CF', 3, 7.5]);
  assert.deepStrictEqual(potm.leagues.map((x) => [x.competition, x.player]), [['LaLiga', 'Jude Bellingham']]);
  // Ses matchs du mois, pour que l'article n'en invente pas ; sans la compétition quand c'est celle du classement.
  assert.deepStrictEqual(potm.overall.matches, [
    { date: '2026-10-08', competition: 'LaLiga', against: 'Atlético Madrid', venue: 'home', goals: 0, assists: 0 },
    { date: '2026-10-15', competition: 'LaLiga', against: 'Atlético Madrid', venue: 'away', goals: 0, assists: 0 },
    { date: '2026-10-22', competition: 'LaLiga', against: 'Cádiz CF', venue: 'home', goals: 0, assists: 0 },
  ]);
  assert.deepStrictEqual(potm.leagues[0].matches.map((m) => [m.date, m.against, m.competition]), [['2026-10-08', 'Atlético Madrid', undefined], ['2026-10-15', 'Atlético Madrid', undefined], ['2026-10-22', 'Cádiz CF', undefined]]);
  assert.ok(!('matches' in potmSummary(potm).overall) && !('matches' in potmSummary(potm).leagues[0]), 'la page Récompenses garde les lauréats, sans leurs matchs');
  assert.deepStrictEqual(worldTotw(w), { LaLiga: ['Raphinha'], '*awards': ['Ilan Morel'] });
  assert.strictEqual(w.awards.team_of_the_round_in_his_league.xi[0].player, 'Ilan Morel');
  assert.deepStrictEqual(w.marks, { month: '2026-10', rounds: { LaLiga: 11, 'Ligue 2 BKT': 9 }, poty: null });
  // Déjà annoncés : ni le joueur du mois, ni les mêmes équipes types ; une nouvelle saison (journée plus petite) l'est.
  const again = worldFootball(scores, { since: '2026-11-01', today: '2026-11-07', league: 'Ligue 2 BKT', seen: w.marks });
  assert.ok(!again.awards && !again.competitions[1].team_of_the_round);
  assert.ok(worldFootball(scores, { since: '2026-11-01', today: '2026-11-07', seen: { rounds: { LaLiga: 38 } } }).competitions[1].team_of_the_round, 'nouvelle saison');
  // Les sujets : du plus lourd au plus léger, avec l'attaque et les deux clubs de la vignette.
  const stories = worldStories(w);
  assert.deepStrictEqual(stories.map((s) => s.competition), ['UEFA Champions League', 'LaLiga']);
  assert.deepStrictEqual(stories[0].teams, ['Real Madrid CF', 'Paris Saint-Germain']);
  assert.match(stories[0].story, /Kylian Mbappé's brace for Real Madrid CF against Paris Saint-Germain/);
  assert.strictEqual(stories[1].totw, true);
  assert.match(worldDebate(w, 0), /title race in LaLiga: Real Madrid CF 25 pts, FC Barcelona 23 pts/);
  // Rien de neuf : rien.
  assert.strictEqual(worldFootball(scores, { since: '2026-11-07', today: '2026-11-08', seen: w.marks }), null);
  assert.strictEqual(worldFootball(scores, { today: '2026-11-07' }).since, '2026-10-31', 'première édition : les 7 derniers jours');
});

test('relecture : la chronique d’une grande compétition nomme ses clubs', () => {
  const coverage = { others: [], own: ['Nancy'], world: { LaLiga: ['Real Madrid CF', 'FC Barcelona', 'Cádiz CF', 'Atlético Madrid', 'Sevilla FC'] } };
  const art = (text) => ({ kind: TOUR_KIND, focus: 'world', competition: 'LaLiga', body: text });
  assert.ok(coverageProblems(art('Le Real Madrid gagne. Barcelona suit.'), coverage).length, 'deux clubs seulement');
  assert.deepStrictEqual(coverageProblems(art('Real Madrid, Barcelona, Cádiz et Atlético ont joué.'), coverage), []);
});

test('l’édition compte : son but, sa grande note, un gros écart, une coupe', () => {
  const snapshot = { club: { ref: 8 }, league: { name: 'Ligue 2 BKT' }, player: { name: 'Ilan Morel' } };
  const res = (extra = {}) => ({ newResults: [{ homeRef: 8, awayRef: 3, score: [0, 0], competition: 'Ligue 2 BKT', me: { goals: 0, assists: 0, rating: 6 }, ...extra }] });
  assert.strictEqual(world.bigEdition(snapshot, res(), {}), false);
  assert.strictEqual(world.bigEdition(snapshot, res({ me: { goals: 1, assists: 0, rating: 7 } }), {}), true);
  assert.strictEqual(world.bigEdition(snapshot, res({ me: { goals: 0, assists: 0, rating: 7.5 } }), {}), true);
  assert.strictEqual(world.bigEdition(snapshot, res({ score: [4, 1] }), {}), true);
  assert.strictEqual(world.bigEdition(snapshot, res({ competition: 'Coupe de France' }), {}), true);
  assert.strictEqual(world.bigEdition(snapshot, res({ motm: { name: 'Ilan Morel' } }), {}), true);
  assert.strictEqual(world.bigEdition(snapshot, { newResults: [] }, { before: { competition: 'Coupe de France' } }), true);
  assert.strictEqual(world.bigEdition(snapshot, { newResults: [] }, { before: { competition: 'Ligue 2 BKT' } }), false);
});

// Une journée de championnat à 18 clubs, le club du joueur en 8e position.
const TEAMS = ['AS Saint-Étienne', 'US Boulogne', 'Rodez AF', 'Stade de Reims', 'USL Dunkerque', 'Clermont Foot 63', 'Red Star FC', 'AS Nancy Lorraine', 'Montpellier HSC', 'Stade Lavallois', 'FC Nantes', 'Grenoble Foot 38', 'FC Annecy', 'EA Guingamp', 'Dijon FCO', 'FC Metz', 'Pau FC', 'FC Sochaux-Montbéliard'];
const FORMS = { 'AS Saint-Étienne': 'NVVVV', 'FC Sochaux-Montbéliard': 'DNDDD', 'Rodez AF': 'VVVDD', 'Pau FC': 'NDDDD' };
const table = TEAMS.map((team, i) => ({ team, ref: i + 1, pos: i + 1, p: 5, pts: 13 - Math.min(i, 12), form: (FORMS[team] || 'VNDVN').split(''), mine: i === 7 }));
const played = (home, away, score, date = '2026-10-24') => ({ home, away, homeRef: TEAMS.indexOf(home) + 1, awayRef: TEAMS.indexOf(away) + 1, played: true, score, round: 5, date });
const coming = (home, away, date = '2026-10-28') => ({ home, away, homeRef: TEAMS.indexOf(home) + 1, awayRef: TEAMS.indexOf(away) + 1, played: false, round: 6, date });
const snap = (extra = {}) => ({
  gameDate: '2026-10-26', league: { name: 'Ligue 2 BKT' }, club: { name: 'AS Nancy Lorraine', ref: 8 }, player: { name: 'Ilan Morel' }, table,
  roundResults: [played('AS Nancy Lorraine', 'USL Dunkerque', [0, 3]), played('FC Sochaux-Montbéliard', 'AS Saint-Étienne', [2, 1]), played('FC Metz', 'Pau FC', [1, 1])],
  nextRound: [coming('AS Nancy Lorraine', 'AS Saint-Étienne'), coming('US Boulogne', 'Rodez AF'), coming('Pau FC', 'FC Sochaux-Montbéliard')],
  scorerRace: { top: [{ name: 'Khalil Ayari', team: 'USL Dunkerque', goals: 5 }] },
  competitions: [{ name: 'Ligue 2 BKT', mine: true, main: true, results: [], next: [] }], ...extra,
});
const cup = (results, next = []) => ({ name: 'Coupe de France', mine: true, main: false, results, next });

test('la consigne : un quotidien factuel, ses genres, ses règles de vérité, sans celles de Kop', () => {
  const system = prompts.transversaleSystem({ language: 'fr' });
  for (const re of [/THE PAPER: a factual daily of world football/, /FOCUS: "club"/, /le tour des terrains: the round-up of ONE competition/, /les récompenses: the awards/, /quote nobody/, /FACTS\.world_football/, /« Le Débrief »/, /two or three pundits and the guest/, /TRUTH — never break these/, /PRESS QUOTES/]) assert.match(system, re);
  for (const re of [/Kop is alive/, /mdr, ptdr/, /HARD RULES/]) assert.doesNotMatch(system, re, 'les règles de Kop n’y sont plus');
  assert.ok(prompts.TRANSVERSALE_KINDS.includes(TOUR_KIND));
});

test('la rédaction : la nouvelle plume rejoint une carrière déjà commencée', () => {
  const state = { writers: { national_columnist: 'Marc Lhermitte', national_desk: [{ name: 'Marc Lhermitte', role: 'x' }, { name: 'Sofiane Kerbrat', role: 'x' }, { name: 'Hélène Marchetti', role: 'x' }, { name: 'Bruno Vidaillac', role: 'x' }, { name: 'Laura Ménard', role: 'x' }] } };
  const team = world.transversaleDesk(state);
  assert.strictEqual(team.length, 10);
  assert.deepStrictEqual(team.slice(0, 5).map((w) => w.name), ['Marc Lhermitte', 'Sofiane Kerbrat', 'Hélène Marchetti', 'Bruno Vidaillac', 'Laura Ménard'], 'les autres ne changent pas');
  assert.ok(team[5].voice.includes('Competitions editor'));
  assert.ok(team.slice(6).every((w) => /^Correspondante? en /.test(w.role)), 'les quatre correspondants');
  assert.strictEqual(state.writers.national_desk.length, 10, 'gardée dans la carrière');
  assert.strictEqual(world.transversaleDesk(state).length, 10, 'une seule fois');
});

test('compétitions : ce qui fait l’actualité, calculé d’après la sauvegarde', () => {
  const s = competitionStories(snap());
  assert.deepStrictEqual(s.title_race, { leader: 'AS Saint-Étienne', points: 13, second: 'US Boulogne', second_points: 12, lead: 1, within_3_points: ['US Boulogne', 'Rodez AF', 'Stade de Reims'] });
  assert.deepStrictEqual(s.relegation.zone.map((r) => r.team), ['FC Metz', 'Pau FC', 'FC Sochaux-Montbéliard']);
  assert.strictEqual(s.relegation.first_safe.team, 'Dijon FCO');
  assert.deepStrictEqual(s.runs.winning, [{ team: 'AS Saint-Étienne', matches: 4 }]);
  assert.deepStrictEqual(s.runs.losing, [{ team: 'Pau FC', matches: 4 }, { team: 'FC Sochaux-Montbéliard', matches: 3 }], 'la série en cours, pas celle d’avant');
  assert.deepStrictEqual(s.top_scorer, { name: 'Khalil Ayari', team: 'USL Dunkerque', goals: 5 });
  assert.strictEqual(s.last_round.goals, 8);
  assert.strictEqual(s.last_round.biggest_win, 'AS Nancy Lorraine 0-3 USL Dunkerque');
  assert.deepStrictEqual(s.last_round.upset, { match: 'FC Sochaux-Montbéliard 2-1 AS Saint-Étienne', winner: 'FC Sochaux-Montbéliard', winner_position: 18, beaten: 'AS Saint-Étienne', beaten_position: 1 });
  assert.strictEqual(s.next_round.top_clash.match, 'US Boulogne - Rodez AF', 'l’affiche, loin de son club');
  assert.strictEqual(s.next_round.bottom_clash.match, 'Pau FC - FC Sochaux-Montbéliard');

  // Début de saison : pas encore de course au titre ni de relégation à raconter.
  const early = competitionStories(snap({ table: table.map((r) => ({ ...r, p: 1, form: ['V'] })) }));
  assert.ok(!early.title_race && !early.relegation && !early.runs);
  assert.deepStrictEqual(competitionStories(snap({ table: [], roundResults: [], nextRound: [], scorerRace: null, competitions: [] })), { league: 'Ligue 2 BKT', matches_played: 0 }, 'saison pas commencée');
});

test('tour des terrains : la coupe qui vient de se jouer, sinon la journée, sinon la prochaine', () => {
  const after = { after: match, before: null }, before = { after: null, before: next };
  const angle = (s, press) => tourAngle(s, press, competitionStories(s));
  assert.match(angle(snap(), after).subject, /after round 5/);
  assert.strictEqual(angle(snap(), after).competition, 'Ligue 2 BKT');
  assert.match(angle(snap(), before).subject, /round 6 of Ligue 2 BKT ahead/);

  const tie = { home: 'FC Metz', away: 'Pau FC', homeRef: 16, awayRef: 17, played: true, score: [1, 0], date: '2026-10-25' };
  const fresh = snap({ competitions: [cup([tie])] });
  assert.strictEqual(angle(fresh, after).competition, 'Coupe de France', 'la coupe, plus récente que la journée');
  const old = snap({ competitions: [cup([{ ...tie, date: '2026-09-20' }])] });
  assert.strictEqual(angle(old, after).competition, 'Ligue 2 BKT', 'une vieille coupe ne passe pas devant');
  const cupNext = snap({ competitions: [cup([], [{ ...tie, played: false, date: '2026-10-28' }])] });
  assert.strictEqual(angle(cupNext, { after: null, before: { ...next, competition: 'Coupe de France' } }).competition, 'Coupe de France', 'avant un match de coupe : les affiches de la coupe');

  // La chronique change de grande histoire d'une édition à l'autre.
  const stories = competitionStories(snap());
  const seen = new Set([0, 1, 2, 3].map((n) => longViewAngle(stories, n)));
  assert.strictEqual(seen.size, 4);
  assert.strictEqual(longViewAngle({ league: 'x' }, 0), null, 'rien à raconter : le sujet général');
});

test('relecture : un article sur la compétition parle des autres clubs', () => {
  const coverage = coverageOf(snap());
  assert.ok(!coverage.others.includes('AS Nancy Lorraine') && coverage.others.includes('FC Metz'));
  assert.deepStrictEqual(coverage.own, ['Nancy', 'Lorraine', 'Morel']);
  assert.deepStrictEqual(clubWords('FC Sochaux-Montbéliard'), ['Sochaux-Montbéliard', 'Sochaux', 'Montbéliard']);
  assert.deepStrictEqual(clubWords('Stade de Reims'), ['Reims']);
  assert.deepStrictEqual(clubWords('Pau FC'), ['Pau']);

  const about = (body, extra = {}) => ({ headline: 'T', dek: '', kind: TOUR_KIND, size: 'short', focus: 'competition', body, ...extra });
  const good = 'Saint-Étienne perd à Sochaux.\n\nDunkerque gagne à Nancy.\n\nMetz et Pau se neutralisent, Rodez attend.';
  assert.deepStrictEqual(coverageProblems(about(good), coverage), []);
  assert.match(coverageProblems(about('Saint-Étienne perd à Sochaux. Rien d’autre.'), coverage)[0], /names 2 other clubs, name at least 4/);
  assert.deepStrictEqual(coverageProblems(about('Saint-Étienne perd à Sochaux.', { kind: 'édito' }), coverage), [], 'un édito peut ne citer que deux clubs');
  const self = 'Nancy souffre, Metz attend.\n\nMorel déçoit, Pau aussi.\n\nNancy recule, Rodez avance.\n\nDijon gagne.';
  assert.match(coverageProblems(about(self), coverage)[0], /3 of its 4 paragraphs come back to his club/);
  assert.deepStrictEqual(coverageProblems(about(self, { focus: 'club' }), coverage), [], 'un article sur son club peut en parler');
  assert.deepStrictEqual(coverageProblems({ kind: 'chronique', body: 'Nancy.' }, coverage), [], 'article déjà publié : rien à redire');
  assert.ok(!/\bPau\b/.test('Paul') && coverageProblems(about('Paul, Paulo et Pauline.'), coverage).length, 'un mot entier');

  // La relecture habituelle renvoie l'article avec ce défaut, et compte comme les autres.
  const checked = world.articleProblems(about(body(250)), [], { coverage });
  assert.ok(checked.problems.some((p) => /name at least 4/.test(p)) && checked.score >= 2);
});

test('l’édito : un fait de ses compétitions qui ne concerne pas son club, à tour de rôle', () => {
  const stories = competitionStories(snap());
  assert.match(debateAngle(stories, 0, 'AS Nancy Lorraine'), /Is AS Saint-Étienne \(13 pts, 1 ahead of US Boulogne\) the real favourite/);
  const seen = new Set([0, 1, 2, 3, 4].map((n) => debateAngle(stories, n, 'AS Nancy Lorraine')));
  assert.strictEqual(seen.size, 5);
  const forPau = [0, 1, 2, 3].map((n) => debateAngle(stories, n, 'Pau FC'));
  assert.ok(forPau.some((s) => /FC Sochaux-Montbéliard has lost its last 3/.test(s)), 'la série d’un autre club que le sien');
  assert.ok(!forPau.some((s) => /Pau FC/.test(s)), 'rien sur son propre club');
  assert.strictEqual(debateAngle({ league: 'x' }, 0, 'y'), null);
});

test('relecture : la longueur attendue dépend du format, avec une marge', () => {
  const tooShort = (size, n) => world.articleProblems({ headline: 'T', dek: '', kind: 'chronique', size, body: body(n) }).problems.some((p) => p.startsWith('too short'));
  assert.ok(!tooShort('short', 110) && tooShort('short', 100), 'brève : 60 % de 180 mots');
  assert.ok(!tooShort('medium', 185) && tooShort('medium', 170), 'moyen : 60 % de 300 mots');
  assert.ok(!tooShort('long', 275) && tooShort('long', 260), 'longue lecture : 60 % de 450 mots');
  assert.ok(tooShort(undefined, 260), 'sans format : longue lecture (articles déjà publiés)');
  const msg = world.articleProblems({ headline: 'T', dek: '', kind: 'chronique', size: 'short', body: body(100) }).problems[0];
  assert.match(msg, /write 180 to 280 words/);
});

test('relecture : les débuts de décor relevés dans les articles publiés sont renvoyés', () => {
  const opening = (text) => world.articleProblems({ headline: 'T', dek: '', kind: 'conférence de presse', size: 'short', body: `${text} ${body(200)}` }).problems.some((p) => /banned opening/.test(p));
  assert.ok(opening('Il régnait dans la salle de presse du Stade Marcel-Picot ce silence lourd.'));
  assert.ok(opening('Il existe des soirs où le football hésite.'));
  assert.ok(opening('Il y a des défaites qui comptent double.'));
  assert.ok(!opening('« On a manqué de tout », lâche Oswald Tanchot.'));
  assert.ok(world.articleProblems({ headline: 'La géométrie d’un verrou', dek: '', kind: 'analyse tactique', size: 'short', body: body(200) }).problems.some((p) => /géométrie/.test(p)));
});

test('relecture : un récit qui recopie les notes de la feuille de match est renvoyé', () => {
  const report = (text) => world.articleProblems({ headline: 'T', dek: '', kind: 'récit du match', size: 'short', body: `${text} ${body(200)}` }).problems.some((p) => /ratings/.test(p));
  assert.ok(report('Pape Meïssa Ba (noté 6) et Zakaria Ztouti, recevant la note de 4,5. Mendy (5) et Saint-Ruf (5), Ndenbe (6).'));
  assert.ok(!report('Morel (note de 6) a apporté de la mobilité. Gélin a tenu le milieu. Score : 0-0, 15 points (4 victoires).'));
  assert.ok(!world.articleProblems({ headline: 'T', dek: '', kind: 'les chiffres', size: 'short', body: `Ba (6), Ztouti (4,5), Mendy (5), Saint-Ruf (5), Ndenbe (6). ${body(200)}` }).problems.some((p) => /ratings/.test(p)), 'les chiffres peuvent en aligner');
  const system = prompts.transversaleSystem({ language: 'fr' });
  assert.match(system, /never a periphrasis of job or place/);
  assert.match(system, /A quote sounds spoken, not written/);
  assert.match(system, /never a list of players with their ratings/);
  assert.doesNotMatch(system, /On a manqué de justesse/, 'aucun exemple de citation à recopier');
  assert.match(system, /no goal order or minute, no nationality, age or position/);
  assert.ok(world.articleProblems({ headline: 'T', dek: '', kind: 'conférence de presse', size: 'short', body: `« Bien », a résumé le technicien nancéien. ${body(200)}` }).problems.some((p) => /le technicien/.test(p)));
});

test('consignes : les trois formats dans la consigne de la rédaction et de la reprise', () => {
  const system = prompts.transversaleSystem({ language: 'fr' });
  for (const s of ['long = 450 to 600 words', 'medium = 300 to 450 words', 'short = 180 to 280 words']) assert.ok(system.includes(s), s);
  // Les reprises partent ensemble, chacune avec son id, son attaque, son format et ses défauts.
  const article = { headline: '', dek: '', kind: '', body: '' };
  const repair = prompts.transversaleRepairUser({ facts: {}, items: [{ id: 1, writer: {}, subject: 's', size: 'short', lead: 'a quote', article, problems: ['p1'] }, { id: 3, writer: {}, subject: 't', size: 'long', article, problems: ['p3'] }] });
  const items = JSON.parse(repair.match(/^ARTICLES: (.*)$/m)[1]);
  assert.deepStrictEqual(items.map((x) => [x.id, x.LENGTH.split(' =')[0], x.PROBLEMS[0], x.LEAD || null]), [[1, 'short', 'p1', 'a quote'], [3, 'long', 'p3', null]]);
  const repairSystem = prompts.transversaleRepairSystem({ language: 'fr' });
  assert.match(repairSystem, /"articles": \[/);
  assert.match(repairSystem, /Its first sentence gives what LEAD says/);
});

test('la vie des championnats : un championnat différent à chaque édition, puis l’Europe, le maintien, le meilleur buteur', () => {
  const rows = (names, pts) => names.map((team, i) => ({ pos: i + 1, team, pts: pts[i], p: 18 }));
  const comp = (name, teams) => ({
    competition: name,
    table_top: rows(teams.slice(0, 6), [44, 38, 33, 31, 30, 29]),
    table_bottom: [{ pos: 18, team: `${name} 18`, pts: 14 }, { pos: 19, team: `${name} 19`, pts: 12 }, { pos: 20, team: `${name} 20`, pts: 9 }],
    top_scorers: [{ player: `${name} buteur`, team: teams[0], goals: 15 }, { player: `${name} second`, team: teams[1], goals: 12 }],
  });
  const w = { competitions: [comp('Premier League', ['Manchester City', 'Arsenal FC', 'C', 'D', 'E', 'F']), comp('LaLiga', ['Real Madrid CF', 'FC Barcelona', 'C', 'D', 'E', 'F'])] };
  const seq = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => worldDebate(w, n));
  assert.match(seq[0], /Manchester City lead Premier League by 6 points/);
  assert.match(seq[1], /Real Madrid CF lead LaLiga by 6 points/, 'un autre championnat à l’édition suivante');
  assert.match(seq[2], /European places in Premier League: 3\. C 33 pts/);
  assert.match(seq[4], /fight to stay up in Premier League: 18\./);
  assert.match(seq[6], /scorer race in Premier League: Premier League buteur \(Manchester City\) 15 goals/);
  assert.strictEqual(new Set(seq).size, 8, 'huit éditions, huit sujets différents');
  assert.ok(seq.every((s) => /FACTS\.world_football/.test(s) && /Take a side/.test(s)));
});
