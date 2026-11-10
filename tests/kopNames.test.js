'use strict';
// Kop : des noms variés (un testeur : « c'est toujours les mêmes noms qui reviennent ») et des prénoms du pays du club de
// chaque compte (sa demande : un supporter de Leverkusen n'a pas un prénom français).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tribunePlan, newVoices, langOf, FIRST_NAMES, NICKNAMES, MEME_ACCOUNTS } = require(path.join(__dirname, '..', 'src/world/tribunePlan.js'));

const first = (name) => String(name).split(' | ')[0].replace(/\s+[A-Z]\.$/, '').trim();
const state = (accounts = {}) => ({ careerId: 'essai', editions: [], clubPages: {}, accounts, feed: [] });
const snapshot = { gameDate: '2026-12-02', league: { name: 'Ligue 2 BKT' }, club: { name: 'AS Nancy Lorraine', coach: 'Oswald Tanchot' }, player: { history: {}, contractUntil: '2028-06-30' }, fixtures: [],
  table: [{ team: 'AS Nancy Lorraine', mine: true, pos: 9 }, { team: 'Pau FC', pos: 18 }] };
const clubLeague = new Map([['AS Nancy Lorraine', 'Ligue 2 BKT'], ['Pau FC', 'Ligue 2 BKT'], ['Bayer 04 Leverkusen', 'Bundesliga'], ['Fenerbahçe SK', 'Trendyol Süper Lig'], ['Manchester City', 'Premier League']]);

test('noms : chaque championnat a la langue de son pays (Bundesliga n’est pas espagnole)', () => {
  const expect = { 'Ligue 2 BKT': 'fr', 'Premier League': 'en', 'EFL Championship': 'en', 'Scottish Premiership': 'en', 'Serie A': 'it', 'Serie BKT': 'it', LaLiga: 'es', 'LaLiga 2': 'es', Bundesliga: 'de', Eredivisie: 'nl', 'Liga Portugal Betclic': 'pt', 'Mir Russian Premier Liga': 'ru', 'Trendyol Süper Lig': 'tr', 'Jupiler Pro League': 'be', 'Super League': 'el', Superliga: 'da' };
  for (const [league, lang] of Object.entries(expect)) assert.strictEqual(langOf(league), lang, league);
});

test('noms : un supporter d’un club étranger a un prénom de son pays, un neutre ceux du championnat du joueur', () => {
  const world = { stories: [{ competition: 'UEFA Champions League', teams: ['Fenerbahçe SK', 'Manchester City'], story: 'Haaland' }, { competition: 'Bundesliga', teams: ['FC Köln', 'Bayer 04 Leverkusen'], story: 'Dallinga' }] };
  const plan = tribunePlan({ state: state(), snapshot, changes: { newResults: [] }, handle: 'ilan', world, clubLeague });
  const of = (club) => plan.find((p) => p.supports === club);
  const pool = (lang) => [...FIRST_NAMES[lang], ...NICKNAMES[lang]];
  assert.ok(pool('tr').includes(first(of('Fenerbahçe SK').name)), `Fenerbahçe : ${of('Fenerbahçe SK').name}`);
  assert.ok(pool('de').includes(first(of('Bayer 04 Leverkusen').name)), `Leverkusen : ${of('Bayer 04 Leverkusen').name}`);
  const local = plan.filter((p) => p.new && !p.supports && (p.type === 'fan' || p.type === 'rival'));
  assert.ok(local.length && local.every((p) => pool('fr').includes(first(p.name))), local.map((p) => p.name).join(', '));
});

test('noms : un nouveau compte prend un prénom pas encore vu sur Kop, six nouvelles voix pour les discussions', () => {
  // Tous les prénoms français sauf trois sont déjà pris : les nouveaux comptes prennent d'abord ces trois-là (un prénom
  // déjà vu ne revient qu'une fois les libres épuisés).
  const free = ['Mounir', 'Gwen', 'Salomé'];
  const accounts = Object.fromEntries(FIRST_NAMES.fr.filter((n) => !free.includes(n)).map((n, i) => [`compte${i}`, { name: n, type: 'fan' }]));
  const voices = newVoices({ state: state(accounts), snapshot, clubLeague });
  assert.strictEqual(voices.length, 6);
  const names = voices.map((v) => first(v.name));
  const people = names.filter((n) => !NICKNAMES.fr.includes(n));
  assert.deepStrictEqual(people.slice(0, 3).sort(), [...free].sort(), names.join(', '));
  assert.strictEqual(new Set(names).size, names.length, 'six noms différents');
});

test('noms : un compte inventé par l’IA dans une discussion est renommé, avec un prénom du pays de son club', () => {
  const { renameInvented } = require(path.join(__dirname, '..', 'src/world/tribunePlan.js'));
  const st = state({ Clara_ASE: { name: 'Clara | AS Saint-Étienne', type: 'rival' } });
  const keep = new Set(['clara_ase', 'nouvellevoix1']);
  const authors = [
    { handle: 'anaisavf98', name: 'Anaïs | Aston Villa FC', type: 'fan' },
    { handle: 'Clara_ASE', name: 'Clara | AS Saint-Étienne', type: 'rival' },
    { handle: 'NouvelleVoix1', name: 'Gwen', type: 'fan' },
    { handle: 'statsfoot', name: 'Stats Foot', type: 'stats' },
  ];
  const map = renameInvented({ state: st, snapshot, clubLeague: new Map([['Aston Villa FC', 'Premier League']]), authors, keep });
  assert.deepStrictEqual([...map.keys()], ['anaisavf98'], 'seul le compte inventé est renommé (pas un compte connu, une nouvelle voix ou un compte de stats)');
  const p = map.get('anaisavf98');
  assert.match(p.name, / \| Aston Villa FC$/, 'son club reste dans le nom');
  assert.ok([...FIRST_NAMES.en, ...NICKNAMES.en].includes(first(p.name)), `prénom anglais : ${p.name}`);
});

test('voix : consultants, mèmes et un deuxième journaliste naissent quand il en manque ; les marques gardent leur compte', () => {
  const st = state({ JulienMercier_: { name: 'Julien Mercier', type: 'journalist' } });
  st.editions = [{ gameDate: '2026-11-28' }];
  st.feed = [{ id: 'a', author: { handle: 'JulienMercier_', name: 'Julien Mercier', type: 'journalist' }, text: 'x', gameDate: '2026-11-28', replies: [] }];
  const next = { date: '2026-12-05', hour: 20, home: 'Pau FC', away: 'AS Nancy Lorraine', venue: 'extérieur', competition: 'Ligue 2 BKT', odds: { home: 2.1, draw: 3.2, away: 3.4 } };
  const plan = tribunePlan({ state: st, snapshot: { ...snapshot, next }, changes: { newResults: [] }, handle: 'ilan', clubLeague });
  const of = (type) => plan.filter((p) => p.type === type);
  assert.strictEqual(of('pundit').length, 1, 'le consultant parle du coach');
  assert.ok(of('pundit')[0].new && / /.test(of('pundit')[0].name), `prénom et nom : ${of('pundit')[0].name}`);
  assert.strictEqual(of('meme').length, 1);
  assert.ok(MEME_ACCOUNTS.fr.some(([h]) => h === of('meme')[0].handle));
  const j = of('journalist')[0];
  assert.ok(j.new && j.handle !== 'JulienMercier_', 'Julien Mercier a parlé à la dernière édition : un deuxième journaliste arrive');
  assert.deepStrictEqual(of('stats').map((p) => p.handle), ['Scoreline_FR']);
  assert.deepStrictEqual(of('betting').map((p) => p.handle), ['CoteFoot']);
  assert.ok(plan.some((p) => /travelling to Pau FC/.test(p.angle)), 'le déplacement à Pau');
  // Le journaliste habitué revient quand il n'a pas parlé la fois d'avant, ou quand le casting est complet.
  st.editions = [{ gameDate: '2026-11-21' }];
  const again = tribunePlan({ state: st, snapshot: { ...snapshot, next }, changes: { newResults: [] }, handle: 'ilan', clubLeague });
  assert.strictEqual(again.find((p) => p.type === 'journalist').handle, 'JulienMercier_');
});
