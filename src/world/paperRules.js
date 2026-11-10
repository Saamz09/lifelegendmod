'use strict';
// Les règles du journal que l'IA oublie, vérifiées par le code (essai réel du 2026-11-09 : malgré la consigne, le journal
// mondial donnait des nationalités, des postes, l'ordre des buts, des phases de coupe et des « trois jours plus tôt »
// faux ; le récit de son match inventait des arrêts et des courses, et passait la composition en revue).
// - tidyArticle : ce que le code corrige seul, sans requête (« l'attaquant norvégien Erling Haaland » → « Erling Haaland »).
// - ruleFlags : les passages fautifs qui restent, phrase par phrase ; la vérification des faits (déjà faite à chaque
//   synchro) les corrige, ou la reprise du rédacteur en chef quand elle est coupée : aucune requête de plus.
// - paperProblems : ce qui demande de réécrire (trop de notes, l'équipe type en entier, toute la composition).

// Nationalités : la forme masculine, les autres s'en déduisent.
const NATIONS = ('français anglais portugais néerlandais hollandais écossais irlandais gallois nord-irlandais danois suédois finlandais '
  + 'islandais polonais japonais chinois sénégalais congolais gabonais togolais béninois camerounais albanais hongrois luxembourgeois '
  + 'maltais néo-zélandais angolais libanais norvégien brésilien italien autrichien ukrainien géorgien arménien bosnien macédonien '
  + 'chilien colombien péruvien équatorien vénézuélien bolivien canadien australien algérien tunisien égyptien guinéen cap-verdien '
  + 'iranien haïtien israélien malien ivoirien gambien zambien estonien lituanien saoudien coréen sud-coréen uruguayen paraguayen '
  + 'ghanéen américain marocain mexicain sud-africain dominicain monténégrin jamaïcain mozambicain nigérian andorran espagnol '
  + 'allemand argentin kosovar ouzbek kazakh letton belge suisse croate serbe slovène russe tchèque slovaque bulgare chypriote turc '
  + 'grec roumain burkinabé').split(' ');
function forms(m) {
  if (m === 'turc') return ['turc', 'turque', 'turcs', 'turques'];
  if (m === 'grec') return ['grec', 'grecque', 'grecs', 'grecques'];
  if (/(i|é)en$/.test(m)) return [m, `${m}ne`, `${m}s`, `${m}nes`];
  if (/s$/.test(m)) return [m, `${m}e`, `${m}es`];
  if (/[eé]$/.test(m)) return [m, `${m}s`];
  return [m, `${m}e`, `${m}s`, `${m}es`];
}
const byLength = (a, b) => b.length - a.length;
const NAT = NATIONS.flatMap(forms).sort(byLength).join('|');
// « le Norvégien », « l'Argentin » : la nationalité prise pour nom (au singulier ; « les Portugais » désigne souvent un club).
const capital = (w) => w.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('-');
const NAT_NOUN = NATIONS.flatMap((m) => forms(m).filter((f) => !/s$/.test(f) || /s$/.test(m)).slice(0, 2)).map(capital).sort(byLength).join('|');

const L = '\\p{L}';
const ROLE = 'attaquant|buteur|milieu(?: de terrain| défensif| offensif| axial| relayeur)?|défenseur(?: central| gauche| droit)?|latéral(?: gauche| droit)?|arrière(?: gauche| droit| central)?|ailier(?: gauche| droit)?|gardien(?: de but)?|portier|meneur de jeu|avant-centre|piston(?: gauche| droit)?|sentinelle|international|capitaine|joueur|numéro (?:6|8|9|10)';
const ROLE_NAT = new RegExp(`(?<![${L}])(${ROLE})\\s+(?:${NAT})(?![${L}-])`, 'giu');
const ROLE_BEFORE_NAME = new RegExp(`(^|[\\s(«"—–-])((?:[Dd]e|[Qq]ue) )?([Ll]['’]|[Ll]e |[Ll]a )(?:${ROLE})\\s+(?=(\\p{Lu}))`, 'gu');
const VOWEL = /[AEIOUYÀÂÄÉÈÊËÎÏÔÖÛÜ]/;

// Ce que le code corrige seul : la nationalité accolée à un rôle, et le rôle placé devant un nom.
function tidyText(text) {
  return String(text || '')
    .replace(ROLE_NAT, '$1')
    .replace(ROLE_BEFORE_NAME, (m, lead, prep, art, initial) => `${lead}${prep ? (VOWEL.test(initial) ? `${prep.slice(0, -2)}'` : prep) : ''}`);
}
const worldPiece = (a) => a && (a.focus === 'world' || a.focus === 'awards');

// Petites fautes que l'IA laisse (essai n°5 : « le classement des buveurs », « premier équipe », « 6.5 ») : corrigées sur
// tous les articles, sans requête. Les décimales prennent la virgule, sauf en anglais.
const FEMININE = 'équipe|place|journée|fois|victoire|défaite|division|ligue|période|mi-temps|position|saison';
function fixTypos(text, language = 'fr') {
  let t = String(text || '')
    .replace(/(?<![\p{L}])([Bb])uveu(r|rs|se|ses)(?![\p{L}])/gu, '$1uteu$2')
    .replace(new RegExp(`(?<![\\p{L}])([Pp]remi|[Dd]erni)er (${FEMININE})(?![\\p{L}])`, 'gu'), '$1ère $2');
  if (language !== 'en') t = t.replace(/(?<![\d.,])(\d{1,2})\.(\d{1,2})(?!\d|\.\d)/g, '$1,$2');
  return t;
}
function fixArticle(article, language = 'fr') {
  for (const f of ['headline', 'dek', 'body']) if (typeof article?.[f] === 'string') article[f] = fixTypos(article[f], language);
  return article;
}
function tidyArticle(article) {
  if (!worldPiece(article)) return article;
  for (const f of ['headline', 'dek', 'body']) if (typeof article[f] === 'string') article[f] = tidyText(article[f]);
  return article;
}

// Les passages qui enfreignent une règle : [type, motif, ce que la règle dit].
const WORLD_RULES = [
  ['nationality', new RegExp(`(?<![${L}])(?:[Ll]e|[Dd]u|[Aa]u|[Uu]n) (?:${NAT_NOUN})(?![${L}-])|(?<![${L}])[Ll]['’](?:${NAT_NOUN})(?![${L}-])|(?<![${L}])(?:${ROLE})\\s+(?:${NAT})(?![${L}-])`, 'gu'), 'a nationality, which FACTS do not give'],
  ['position', new RegExp(`(?<![${L}])(?:[Ll]['’]|[Ll]e |[Ll]a |[Dd]u |[Uu]n |[Ss]on |[Ll]eur )(?:ailier|piston|latéral|arrière (?:gauche|droit|central)|défenseur|milieu (?:de terrain|défensif|offensif|axial|relayeur)|avant-centre|meneur de jeu|sentinelle|international|capitaine|numéro (?:6|8|9|10))(?![${L}])`, 'gu'), 'a position or a role, which FACTS do not give'],
  ['order', new RegExp(`(?<![${L}])(?:ouvert le score|ouvre le score|ouvrir le score|ouverture du score|rédui${L}* (?:l['’]écart|la marque)|complét${L}* (?:le score|la marque|le tableau d['’]affichage|la feuille de (?:score|marque))|(?:répondant|répondu|répondre|réponse) à|égalis${L}*|but initial|premier but|deuxième but|second but|troisième but|quatrième but|cinquième but|dernier but|but du break|doubl(?:é|e|er) la mise|corsé l['’]addition|(?:aggravé|alourdi) (?:le score|la marque)|scellé le score|enfoncé le clou|renversé la (?:situation|vapeur|tendance)|en (?:fin|début) de (?:match|rencontre)|en (?:première|seconde|deuxième) (?:période|mi-temps)|(?:avant|après|à) la pause|dès l['’]entame|d['’]entrée de jeu|dans les arrêts de jeu|dans le temps additionnel|(?:à la )?\\d+\\s?(?:e|ème)? minute|à la \\d+['’]|menée?s? au score)(?![${L}])`, 'giu'), 'the order or the timing of goals: FACTS.world_football give the scorers of each match, never their order or minute'],
  ['phase', new RegExp(`(?<![${L}])(?:phases? (?:de (?:poules?|groupes?|ligue|championnat)|finale|à élimination directe)|poules?|groupe [A-L](?![${L}])|tours? préliminaires?|(?:premier|deuxième|second|troisième) tour|barrages?|seizièmes?|huitièmes?|quarts? de finale|demi-finales?|(?:la|en|une) finale|matchs? (?:aller|retour)|élimination directe)(?![${L}])`, 'giu'), 'a phase, a round or the format of a competition, which FACTS do not give'],
  ['days', new RegExp(`(?<![${L}])(?:(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|quelques|plusieurs|\\d+)\\s+(?:jours?|semaines?)\\s+(?:plus tôt|plus tard|auparavant|avant|après)|la veille|le lendemain|l['’]avant-veille|le surlendemain|la semaine (?:précédente|suivante|passée|dernière))(?![${L}])`, 'giu'), 'a count of days between matches, often wrong: give the date of each match instead (« le 25 novembre »)'],
];
// Le récit de son match : la sauvegarde donne buts, passes, minutes des buts, notes et changements, rien d'autre.
const MATCH_RULES = [
  ['action', new RegExp(`(?<![${L}])(?:parades?|arrêts? (?:décisifs?|réflexes?|déterminants?)|a (?:repoussé|détourné|capté|sauvé)|repouss${L}*|détourn${L}*|sauvetages?|frappes?|tirs?|a tiré|a frappé|tentatives?|dribbles?|dribbl${L}+|courses?(?! (?:au|à|en tête|pour))|duels?|poteaux?|barre transversale|tacles?|interceptions?|pertes? de balle|centres?(?= (?:pour|vers|parfait|précis|décisif|de \\p{Lu}))|a centré|corners?|coups? francs?|p[eé]naltys?|cartons?|expuls${L}*|hors-jeu|occasions?(?= (?:nettes?|franches?|énormes?|immanquables?))|(?:grosses?|belles?|nettes?|franches?) occasions?|assauts?|(?:une|l['’]|son|cette) erreur|bévues?)(?![${L}])`, 'giu'), 'an action of the match that FACTS do not give (they give only goals, assists, goal minutes, ratings and substitutions)'],
  // « Le public du Stade Marcel-Picot a exprimé son mécontentement » (essai du 2026-11-09) : la sauvegarde ne dit rien des tribunes.
  ['crowd', new RegExp(`(?<![${L}])(?:(?:le|du|au) public|supporters?|tribunes?|sifflets?|siffl${L}*|huées?|hué(?:e|s|es)?|conspu${L}*|ovation${L}*|applaudi${L}*|chants?|ambiance|atmosphère|mécontentement|colère des)(?![${L}])`, 'giu'), 'a crowd scene, which FACTS do not give'],
];
// Une coupe (Ligue des champions, Ligue Europa…) : le résumé ne donne pas le numéro de journée (essai n°5 : « lors de la
// 5e journée », inventé). Les championnats, si : celui de l'équipe type.
const CUP = /champions league|europa|conference|libertadores|world cup|coupe|cup|euro/i;
const CUP_RULES = [['matchday', new RegExp(`(?<![${L}])(?:\\d+\\s?(?:e|ème|re|ère)\\s+journée|journée\\s+\\d+)(?![${L}])`, 'giu'), 'a matchday number in a cup, which FACTS do not give']];
const MAX_FLAGS = 12;

// La phrase qui contient le passage, telle quelle dans le texte (pour une correction mot pour mot).
function sentenceAt(text, index, length) {
  const start = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf('\n', index), text.lastIndexOf('! ', index), text.lastIndexOf('? ', index));
  const ends = ['. ', '.\n', '! ', '? ', '\n'].map((s) => text.indexOf(s, index + length)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start < 0 ? 0 : start + (text[start] === '\n' ? 1 : 2), end).trim();
}

// Les passages fautifs d'un article : [{ field, sentence, passage, rule }].
function ruleFlags(article) {
  const rules = worldPiece(article) ? [...WORLD_RULES, ...(CUP.test(article.competition || '') ? CUP_RULES : [])] : article?.kind === 'récit du match' ? MATCH_RULES : [];
  const flags = [];
  for (const field of ['headline', 'dek', 'body']) {
    const text = String(article?.[field] || '');
    // Dans l'ordre du texte, une entrée par phrase.
    const hits = rules.flatMap(([, re, rule]) => [...text.matchAll(re)].map((m) => ({ at: m.index, passage: m[0], rule }))).sort((a, b) => a.at - b.at);
    for (const { at, passage, rule } of hits) {
      const sentence = sentenceAt(text, at, passage.length);
      const same = flags.find((f) => f.field === field && f.sentence === sentence);
      if (same) { if (!same.passages.includes(passage)) same.passages.push(passage); if (!same.rules.includes(rule)) same.rules.push(rule); continue; }
      if (flags.length >= MAX_FLAGS) return flags;
      flags.push({ field, sentence, passages: [passage], rules: [rule] });
    }
  }
  return flags;
}
// Les mêmes passages, dits à la reprise du rédacteur en chef.
const flagsProblem = (flags) => `breaks the paper's rules, rewrite these sentences without the passage in quotes: ${flags.map((f) => `« ${f.passages.join(' », « ')} » (${f.rules.join('; ')})`).join(' — ')}`;

const hasWord = (text, word) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text);
// Un joueur est nommé par son nom complet, ou par son nom de famille quand il est assez long pour ne pas prêter à confusion.
const named = (text, name) => hasWord(text, name) || (() => { const last = String(name).trim().split(/\s+/).at(-1); return last.length >= 4 && last !== name && hasWord(text, last); })();
const RATING = /\(\d{1,2}(?:[.,]\d{1,2})?\)|\bnot(?:é|ée|e)s? (?:de )?\d{1,2}(?:[.,]\d{1,2})?\b|\bla note de \d/gi;

// Ce qui demande de réécrire : un article du monde qui aligne les notes ou toute l'équipe type ; un récit de son match
// qui passe sa composition en revue. coverage : { worldTotw: { compétition: [noms] }, lineup: [noms de son équipe] }.
function paperProblems(article, coverage = {}) {
  const body = String(article?.body || '');
  const problems = [];
  if (article?.focus === 'world' && article.kind !== 'les chiffres') {
    const ratings = (body.match(RATING) || []).length;
    const max = article.kind === 'le tour des terrains' ? 1 : 2;
    if (ratings > max) problems.push(`gives ${ratings} match ratings: keep ${max === 1 ? 'one at most, the player_of_the_round\'s' : 'two at most, the players of the round\'s'}, and tell what the players did instead`);
  }
  if (worldPiece(article)) {
    const totw = article.focus === 'awards' ? coverage.worldTotw?.['*awards'] || [] : article.competition && article.kind === 'le tour des terrains' ? coverage.worldTotw?.[article.competition] || [] : Object.entries(coverage.worldTotw || {}).filter(([k]) => k !== '*awards').flatMap(([, v]) => v);
    const n = totw.filter((p) => named(body, p)).length;
    if (n > 5) problems.push(`lists ${n} players of the team of the round: name its player_of_the_round and two or three others, never the eleven (the paper's competition page prints the whole team)`);
  }
  if (article?.kind === 'récit du match' && coverage.lineup?.length) {
    const n = coverage.lineup.filter((p) => named(body, p)).length;
    if (n > 6) problems.push(`names ${n} players of his club's lineup: keep five or six (the scorers and passers, the man of the match, the player himself, a substitute who changed the match), never the lineup line by line`);
  }
  return problems;
}

module.exports = { tidyText, tidyArticle, fixTypos, fixArticle, ruleFlags, flagsProblem, paperProblems };
