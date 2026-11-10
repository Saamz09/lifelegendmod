'use strict';
// Les règles du journal vérifiées par le code (src/world/paperRules.js), d'après les fautes de l'essai réel du
// 2026-11-09 ; et leur chemin : la vérification des faits les corrige, la reprise seulement quand elle est coupée.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// L'IA simulée, branchée avant de charger world.js (qui garde sa référence).
const providers = require(path.join(ROOT, 'src/ai/providers.js'));
const calls = [];
let replies = [];
providers.complete = async (settings, key, opts) => { calls.push(/editor-in-chief/.test(opts.system) ? 'reprise' : 'rédaction'); return replies.shift(); };

const world = require(path.join(ROOT, 'src/world/world.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));
const { applyCorrections } = require(path.join(ROOT, 'src/ai/factcheck.js'));
const { tidyText, tidyArticle, fixTypos, ruleFlags, flagsProblem, paperProblems } = require(path.join(ROOT, 'src/world/paperRules.js'));

test('règles du journal : les petites fautes de l’essai n°5 sont corrigées sans requête', () => {
  assert.strictEqual(fixTypos('Haaland occupe la tête du classement des buveurs.'), 'Haaland occupe la tête du classement des buteurs.');
  assert.strictEqual(fixTypos('Rodez, premier équipe hors de la zone rouge, dernier place pour Pau.'), 'Rodez, première équipe hors de la zone rouge, dernière place pour Pau.');
  assert.strictEqual(fixTypos('Une note moyenne de 6.5, puis 6.33.'), 'Une note moyenne de 6,5, puis 6,33.');
  assert.strictEqual(fixTypos('An average rating of 6.5.', 'en'), 'An average rating of 6.5.', 'l’anglais garde le point');
  assert.strictEqual(fixTypos('Le 2026.11.25, 10.000 spectateurs, premier but.'), 'Le 2026.11.25, 10.000 spectateurs, premier but.', 'ni les dates, ni les milliers, ni « premier but »');
});

test('règles du journal : un numéro de journée en coupe est relevé, pas en championnat', () => {
  const at = (competition, dek) => ruleFlags({ focus: 'world', kind: 'le tour des terrains', competition, headline: 'T', dek, body: 'Corps.' }).map((f) => f.passages);
  assert.deepStrictEqual(at('UEFA Champions League', 'City s’impose 3-1 lors de la 5e journée.'), [['5e journée']]);
  assert.deepStrictEqual(at('UEFA Europa League', 'Journée 4 : Braga gagne.'), [['Journée 4']]);
  assert.deepStrictEqual(at('LaLiga', 'L’équipe type de la 13e journée.'), [], 'l’équipe type d’un championnat donne sa journée');
  assert.match(prompts.transversaleSystem({ language: 'fr' }), /never say who votes or how/);
  assert.match(prompts.factcheckSystem({ language: 'fr' }), /A replacement never repeats what the sentence before or after already says/);
});

const filler = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');
const worldPiece = (body, extra = {}) => ({ headline: 'Titre', dek: 'Chapeau', author: 'Owen Hartley', kind: 'le tour des terrains', size: 'short', focus: 'world', competition: 'Premier League', body, ...extra });

test('règles du journal : le code retire seul la nationalité accolée et le poste devant un nom', () => {
  assert.strictEqual(tidyText('L’attaquant norvégien a inscrit les trois réalisations.'), 'L’attaquant a inscrit les trois réalisations.');
  assert.strictEqual(tidyText('Dans une rencontre où l’ailier Riccardo Orsolini a obtenu la meilleure note.'), 'Dans une rencontre où Riccardo Orsolini a obtenu la meilleure note.');
  assert.strictEqual(tidyText('Le triplé de l’attaquant néerlandais Jay Enem.'), 'Le triplé de Jay Enem.');
  assert.strictEqual(tidyText('Le doublé de l\'attaquant Erling Haaland.'), 'Le doublé d\'Erling Haaland.', 'l’élision suit');
  assert.strictEqual(tidyText('Le milieu de terrain Granit Xhaka a été désigné homme du match.'), 'Granit Xhaka a été désigné homme du match.');
  assert.strictEqual(tidyText('Le buteur des Citizens confirme. La victoire 3-1 des Anglais.'), 'Le buteur des Citizens confirme. La victoire 3-1 des Anglais.', 'rien d’autre ne change');
  const club = { kind: 'récit du match', focus: 'club', body: 'L’attaquant norvégien X.' };
  assert.strictEqual(tidyArticle(club).body, 'L’attaquant norvégien X.', 'seuls les articles du monde sont touchés');
});

test('règles du journal : les passages fautifs de l’essai sont relevés, phrase par phrase', () => {
  const body = [
    'Erling Haaland a inscrit un triplé pour Manchester City le 25 novembre 2026.',
    'Trois jours plus tôt dans la phase de poules, Manchester City s’était déjà imposé 3-0.',
    'Jay Enem a complété l’ouverture du score de Nicolò Cambiaghi. Kanté a réduit l’écart pour le club turc.',
    'Le Norvégien domine le classement des buteurs. Le piston gauche de l’Inter Milan Federico Dimarco s’impose.',
    'Braga poursuit sa course en phase de groupes.',
  ].join('\n\n');
  const flags = ruleFlags(worldPiece(body));
  for (const f of flags) assert.ok(body.includes(f.sentence), `phrase exacte : ${f.sentence}`);
  const found = flags.map((f) => [f.sentence.slice(0, 22), f.passages]);
  assert.deepStrictEqual(found, [
    ['Trois jours plus tôt d', ['Trois jours plus tôt', 'phase de poules']],
    ['Jay Enem a complété l’', ['ouverture du score']],
    ['Kanté a réduit l’écart', ['réduit l’écart']],
    ['Le Norvégien domine le', ['Le Norvégien']],
    ['Le piston gauche de l’', ['Le piston']],
    ['Braga poursuit sa cour', ['phase de groupes']],
  ]);
  assert.match(flagsProblem(flags), /« Trois jours plus tôt », « phase de poules » \(a count of days.*; a phase/);
  assert.deepStrictEqual(ruleFlags(worldPiece('Erling Haaland a inscrit un triplé pour Manchester City le 25 novembre 2026. Arsenal FC mène avec 32 points. Crystal Palace FC ferme la marche à la 20e position.')), [], 'un article propre passe');
  assert.deepStrictEqual(ruleFlags(worldPiece('Isak a marqué à la 63e minute. Prelec réduisant la marque.')).map((f) => f.passages), [['à la 63e minute'], ['réduisant la marque']]);
  // L'ordre sous-entendu (essai n°4).
  assert.deepStrictEqual(ruleFlags(worldPiece('Raúl Moro a complété le score. Cambiaghi a complété le tableau d’affichage. Serhou Guirassy répondant à Vangelis Pavlidis.')).map((f) => f.passages), [['complété le score'], ['complété le tableau d’affichage'], ['répondant à']]);
  assert.deepStrictEqual(ruleFlags(worldPiece('Bologne, répondant aux attentes, s’impose 4-0.')), [], '« répondant aux attentes » ne dit rien de l’ordre des buts');
  assert.deepStrictEqual(ruleFlags({ kind: 'le tour des terrains', focus: 'competition', body }), [], 'les règles du monde ne visent que ses articles');
});

test('règles du journal : le récit de son match ne raconte que ce que la sauvegarde donne', () => {
  const recit = (body) => ruleFlags({ kind: 'récit du match', focus: 'club', headline: 'T', dek: '', body });
  assert.deepStrictEqual(recit('Logan Ndenbe a multiplié les courses sur le côté gauche.').map((f) => f.passages), [['courses']]);
  assert.deepStrictEqual(recit('Enzo Basilio, bien qu’il ait repoussé les autres assauts, n’a rien pu faire.').map((f) => f.passages), [['repoussé', 'assauts']]);
  assert.deepStrictEqual(recit('Nancy reste dans la course au maintien. À l’occasion de ce match, Tom Saettel a marqué à la 63e minute.'), [], 'la course au classement, l’occasion d’un match et la minute d’un but sont permises');
  // Les tribunes : la sauvegarde n'en dit rien (essai n°4).
  assert.deepStrictEqual(recit('Le public du Stade Marcel-Picot a exprimé son mécontentement. Les supporters ont sifflé.').map((f) => f.passages), [['Le public', 'mécontentement'], ['supporters', 'sifflé']]);
  assert.deepStrictEqual(recit('Les Chardons n’ont pas su revenir devant leur public.'), [], 'un match à domicile n’est pas une scène de tribune');
});

test('règles du journal : trop de notes, toute l’équipe type ou toute la composition sont renvoyées', () => {
  assert.match(paperProblems(worldPiece('Xhaka (6,5) et Isidor, avec une note de 6,5, puis Evanilson noté 6,5.'))[0], /gives 3 match ratings: keep one at most/);
  assert.deepStrictEqual(paperProblems(worldPiece('Evanilson, joueur de la journée avec une note de 6,5.')), []);
  const xi = ['Fraser Forster', 'António Silva', 'James Hill', 'Adrien Truffert', 'Issa Diop', 'Gustavo Hamer', 'Boubacar Kamara', 'John McGinn', 'Evanilson', 'Haji Wright', 'Nicolas Jackson'];
  const coverage = { worldTotw: { 'Premier League': xi }, lineup: ['Enzo Basilio', 'Elydjah Mendy', 'N. Fernandez-Veliz', 'Thierno Baldé', 'Logan Ndenbe', 'Kouroufia Kebe', 'Mamadou Fofana', 'Yanis Delaveau', 'Walid Bouabdeli', 'Ilan Morel', 'Pape Meïssa Ba'] };
  assert.match(paperProblems(worldPiece(`L’équipe type réunit ${xi.join(', ')}.`), coverage)[0], /lists 11 players of the team of the round/);
  assert.deepStrictEqual(paperProblems(worldPiece('Evanilson, joueur de la journée, devance Haji Wright et Nicolas Jackson.'), coverage), []);
  const report = (body) => paperProblems({ kind: 'récit du match', focus: 'club', body }, coverage);
  assert.match(report(`Tanchot avait aligné ${coverage.lineup.join(', ')}.`)[0], /names 11 players of his club's lineup/);
  assert.deepStrictEqual(report('Morel, Ba, Basilio, Ndenbe et Fofana ont joué 90 minutes.'), []);
  // Le contrôle passe par la relecture de chaque article.
  assert.ok(world.articleProblems(worldPiece(`${filler(200)} L’équipe type réunit ${xi.join(', ')}.`), [], { coverage }).problems.some((p) => /team of the round/.test(p)));
});

test('règles du journal : la vérification des faits reçoit les phrases fautives et peut les supprimer', () => {
  const flags = [{ item: 'national.2', field: 'body', sentence: 'Kanté a réduit l’écart.', passages: ['réduit l’écart'], rules: ['the order'] }];
  assert.match(prompts.factcheckUser({ facts: {}, changes: {}, draft: [], flags }), /FLAGGED \(sentences to fix in any case\):\n\[\{"item":"national\.2"/);
  assert.ok(!/FLAGGED/.test(prompts.factcheckUser({ facts: {}, changes: {}, draft: [] })), 'rien quand rien n’est signalé');
  assert.match(prompts.factcheckSystem({ language: 'fr' }), /FLAGGED lists sentences/);
  assert.match(prompts.factcheckSystem({ language: 'fr' }), /write « il » or his surname, never his full name again/, 'pas « Erling Haaland » deux phrases de suite');
  const out = { national: [{ headline: 'T', dek: '', body: 'Le City gagne 3-1. Kanté a réduit l’écart. Haaland signe un triplé.' }] };
  applyCorrections(out, [{ item: 'national.0', field: 'body', find: 'Kanté a réduit l’écart.', replace: '', reason: 'ordre des buts inconnu' }]);
  assert.strictEqual(out.national[0].body, 'Le City gagne 3-1. Haaland signe un triplé.');
});

// La rédaction, avec une carrière minimale : un article du monde fautif.
const state = () => ({ feed: [], accounts: {}, profile: { handle: 'ilan', followers: 10 }, writers: { national_columnist: 'Marc Lhermitte' }, editions: [], mail: [], storylines: [], myLife: [], onRecord: [] });
const snapshot = { club: { ref: 1, name: 'AS Nancy Lorraine' }, player: { name: 'Ilan Morel' }, table: [], competitions: [], next: null };
const outline = { desk: [{ name: 'Owen Hartley', role: 'Correspondant en Angleterre', voice: '' }], press: {}, plan: [{ author: 'Owen Hartley', kind: 'le tour des terrains', focus: 'world', competition: 'Premier League', size: 'short', subject: 'Premier League', lead: 'the result' }] };
const draft = JSON.stringify({ national: [{ headline: 'Isidor écrase Liverpool', dek: 'Sunderland gagne 3-0.', body: `L’attaquant français Wilson Isidor a inscrit un triplé. Granit Xhaka a ouvert le score. ${filler(200)}` }] });
const write = (factCheck) => world.writeTransversale({ state: state(), settings: { provider: 'google', model: 'x', language: 'fr', factCheck }, apiKey: 'k', facts: { world_football: null }, changes: {}, rawChanges: {}, snapshot, kind: 'MATCH DAY', outline });

test('règles du journal : la vérification des faits corrige, sans reprise ; la reprise seulement si elle est coupée', async () => {
  calls.length = 0; replies = [draft];
  const list = await write(true);
  assert.deepStrictEqual(calls, ['rédaction'], 'aucune requête de plus');
  assert.match(list[0].body, /^Wilson Isidor a inscrit un triplé\./, 'le code a retiré seul « l’attaquant français »');
  assert.deepStrictEqual(ruleFlags(list[0]).map((f) => f.passages), [['ouvert le score']], 'il reste pour la vérification des faits');

  calls.length = 0; replies = [draft, JSON.stringify({ articles: [{ id: 0, headline: 'Isidor écrase Liverpool', dek: 'Sunderland gagne 3-0.', body: `Wilson Isidor a inscrit un triplé. Granit Xhaka a été élu homme du match. ${filler(200)}` }] })];
  const alone = await write(false);
  assert.deepStrictEqual(calls, ['rédaction', 'reprise'], 'sans vérification des faits, la reprise s’en charge');
  assert.match(alone[0].body, /Granit Xhaka a été élu homme du match/);
});
