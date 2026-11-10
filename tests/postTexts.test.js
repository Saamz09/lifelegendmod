'use strict';
// Textes faits sans IA (src/world/postTexts.js) dans les six langues, sur une carrière inventée :
// posts officiels du club, promesses, brief du matin, réponses types des joueurs.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { postTexts, deWho } = require(path.join(ROOT, 'src/world/postTexts'));
const { clubPosts } = require(path.join(ROOT, 'src/world/clubPosts'));
const { bindPromise, resolvePromises } = require(path.join(ROOT, 'src/world/promises'));
const { transversaleBrief } = require(path.join(ROOT, 'src/world/world'));

const LANGS = ['fr', 'en', 'es', 'it', 'pt', 'de'];
const FRENCH = /\b(journée|résultats|classement|demain|aujourd’hui|victoire|défaite|rejoint|bienvenue|prolonge|marquer|contre|cette saison|essentiel|rédaction|bonjour|homme du match|passe décisive)\b/i;

const snapshot = {
  gameDate: '2021-01-24',
  season: '2020-2021',
  club: { name: 'Heerenveen', ref: 10 },
  league: { name: 'Eredivisie' },
  player: { name: 'M. Abline' },
  stats: { total: { goals: 3 } },
  table: [{ team: 'Heerenveen', pos: 10, pts: 21, mine: true }, { team: 'Ajax', pos: 1, pts: 45 }],
  last: { played: true, home: 'Sparta Rotterdam', away: 'Heerenveen', score: [0, 0], competition: 'Eredivisie' },
  next: { id: 'm2', date: '2021-01-24', hour: 21, home: 'Heerenveen', away: 'Twente', homeRef: 10, awayRef: 11 },
  fixtures: [{ id: 'm2', date: '2021-01-24', hour: 21, home: 'Heerenveen', away: 'Twente', homeRef: 10, awayRef: 11, played: false }],
};
const changes = {
  newResults: [{ id: 'm1', venue: 'domicile', home: 'Heerenveen', away: 'Twente', score: [2, 1], competition: 'Eredivisie', events: { home: { scorers: [{ name: 'M. Abline', goals: 2 }] } }, me: { goals: 2, assists: 1, rating: 7.5 }, motm: { team: 'Heerenveen', name: 'M. Abline' } }],
  contractSigned: { until: '2023-06-30' },
};
const transfers = [{ player: 'J. Exemple', direction: 'arrivée', from: 'Ajax', gameDate: '2021-01-24' }];
const edition = { national: [{ headline: 'Un titre', dek: 'Un chapô' }] };

test('chaque langue a les mêmes textes que le français', () => {
  const shape = (o) => Object.keys(o).sort().map((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? `${k}{${shape(o[k])}}` : k)).join(',');
  for (const l of LANGS) assert.strictEqual(shape(postTexts(l)).replace(/,?(lang|locale)/g, ''), shape(postTexts('fr')).replace(/,?(lang|locale)/g, ''), `structure de ${l}`);
});

test('posts du club : le français ne change pas', () => {
  const texts = clubPosts({ snapshot, changes, transfers, handle: 'ablinematthis', language: 'fr' }).map((p) => p.text);
  assert.ok(texts.includes('⚽ DOUBLÉ de M. Abline (@ablinematthis) et une passe décisive face à Twente !\n\nSon 3e but de la saison.'));
  assert.ok(texts.includes('⭐ Homme du match : M. Abline (@ablinematthis), noté 7,5.'));
  assert.ok(texts.includes('✍️ OFFICIEL | J. Exemple rejoint Heerenveen, en provenance d’Ajax. Bienvenue !'));
  assert.ok(texts.includes('✍️ OFFICIEL | M. Abline (@ablinematthis) prolonge son contrat avec Heerenveen jusqu’au 30 juin 2023 !'));
});

test('« de » devant un nom : élision et article des clubs, la même règle dans l’interface', () => {
  const cases = { 'Ilan Morel': 'd’Ilan Morel', 'AS Nancy Lorraine': 'de l’AS Nancy Lorraine', 'US Boulogne': 'de l’US Boulogne', 'USL Dunkerque': 'de l’USL Dunkerque', 'FC Metz': 'du FC Metz',
    'Stade de Reims': 'du Stade de Reims', 'Red Star FC': 'du Red Star FC', 'Paris FC': 'du Paris FC', 'Paris Brunner': 'de Paris Brunner', 'Dijon FCO': 'de Dijon FCO', Ajax: 'd’Ajax', 'Émile Martin': 'd’Émile Martin',
    Hazard: 'de Hazard', 'Yanis Kouini': 'de Yanis Kouini', Yves: 'd’Yves', 'M. Abline': 'de M. Abline', 'Oswald Tanchot': 'd’Oswald Tanchot' };
  const src = require('fs').readFileSync(path.join(ROOT, 'lifelegend/app.js'), 'utf8');
  const frDe = eval(`(${/const frDe = (\(n\) => \{[\s\S]*?\n\});/.exec(src)[1]})`);
  for (const [name, want] of Object.entries(cases)) {
    assert.strictEqual(deWho(name), want);
    assert.strictEqual(frDe(name), want, 'interface');
  }
  assert.strictEqual(postTexts('fr').clip('Ilan Morel', 12, 'Nancy 1-0 Metz'), '📹 La vidéo : le but d’Ilan Morel (12e), Nancy 1-0 Metz.');
  assert.strictEqual(postTexts('fr').clipPlain('Nancy 1-0 Metz'), '📹 Les images du match Nancy 1-0 Metz.');
});

test('posts, promesses et brief : rien de français ni de trou dans les autres langues', () => {
  for (const l of LANGS) {
    const texts = clubPosts({ snapshot, changes, transfers, handle: 'ablinematthis', language: l }).map((p) => p.text);
    const p1 = bindPromise({ kind: 'goal', count: 2, opponent: 'Twente' }, { snapshot, sourceText: 'x', source: 'tribune', language: l });
    const p2 = bindPromise({ kind: 'season_assists', count: 5 }, { snapshot, sourceText: 'x', source: 'tribune', language: l });
    texts.push(p1.label, p2.label);
    const brief = transversaleBrief(snapshot, edition, l);
    texts.push(brief.subject, brief.messages[0].body);
    const all = texts.join('\n');
    assert.ok(!/undefined|NaN|\{\w+\}|\[object/.test(all), `${l} : trou dans le texte\n${all}`);
    if (l !== 'fr') assert.ok(!FRENCH.test(all.replace(/Un titre|Un chapô/g, '')), `${l} : du français reste\n${all.match(FRENCH)}`);
  }
});

test('verdict des promesses dans la langue choisie', () => {
  const played = { ...snapshot, fixtures: [{ ...snapshot.fixtures[0], played: true, score: [1, 0], me: { goals: 1, assists: 0 } }] };
  for (const l of LANGS) {
    const p = bindPromise({ kind: 'goal', count: 2, opponent: 'Twente' }, { snapshot, sourceText: 'x', source: 'tribune', language: l });
    const [done] = resolvePromises({ promises: [p], seasons: {} }, played, l);
    assert.strictEqual(done.status, 'broken');
    assert.strictEqual(done.detail, postTexts(l).judge.goals(1));
  }
});

test('italien : l’article s’accorde au nom du club', () => {
  const L = postTexts('it');
  assert.match(L.joins('X', 'Heerenveen', 'Sparta Rotterdam'), /dell’Heerenveen, arriva dallo Sparta Rotterdam/);
  assert.match(L.promise.win(1, 'Twente'), /battere il Twente/);
});

test('réponses types des joueurs dans toutes les langues', () => {
  for (const l of LANGS) {
    const c = postTexts(l).canned;
    for (const side of ['teammate', 'opponent']) for (const tone of ['praise', 'neutral', 'question']) assert.ok(c[side][tone].length, `${l} ${side} ${tone}`);
  }
});
