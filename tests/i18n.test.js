'use strict';
// Traductions : les cinq dictionnaires (lifelegend/i18n) ont les mêmes textes, les mêmes paramètres {x}, et couvrent
// tout ce que l'interface et le moteur affichent (textes passés à tr()/trn(), tables de libellés, erreurs, étapes).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LANGS = ['en', 'es', 'it', 'pt', 'de'];
const unq = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function loadDict(lang) {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read(`lifelegend/i18n/${lang}.js`), ctx, { filename: `${lang}.js` });
  return ctx.window.LL_I18N[lang];
}
const dicts = Object.fromEntries(LANGS.map((l) => [l, loadDict(l)]));

// Tous les textes français que l'interface et le moteur font passer par les dictionnaires.
function expectedKeys() {
  const keys = new Set();
  const add = (list) => list.forEach((x) => { if (typeof x === 'string' && /\p{L}/u.test(x)) keys.add(x); });
  const app = read('lifelegend/app.js');
  for (const m of app.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
  for (const m of app.matchAll(/\btrn\([^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) { keys.add(unq(m[1])); keys.add(unq(m[2])); }
  for (const m of app.matchAll(/\['(\{who\}[^']*)', '(\{who\}[^']*)'\]/g)) { keys.add(m[1]); keys.add(m[2]); }
  for (const m of app.matchAll(/^const REAL_PEOPLE_NOTE = '((?:[^'\\]|\\.)*)';/gm)) keys.add(unq(m[1]));
  ['V', 'N', 'D'].forEach((k) => keys.add(`forme ${k}`));

  // Tables de libellés traduites à l'affichage : app.js exécuté dans un bac à sable (sans démarrer l'interface).
  const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub, construct: () => stub });
  const ctx = vm.createContext({ window: {}, document: stub, addEventListener() {}, matchMedia: () => ({ matches: false }), localStorage: stub, live: stub, navigator: stub, setTimeout() {}, setInterval() {}, clearInterval() {}, console: { log() {}, error() {} }, CSS: { escape: (x) => x } });
  try { vm.runInContext(app, ctx, { filename: 'app.js' }); } catch { /* init() échoue sans la vraie page */ }
  const t = (expr) => vm.runInContext(expr, ctx);
  add(Object.values(t('TYPE_LABEL')));
  add(Object.values(t('PROMISE_BADGE')).map((x) => x[1]));
  add(Object.values(t('MENTION_KIND')));
  for (const name of ['TW_NAV', 'TW_MORE', 'TW_TABS', 'TW_PROFILE_TABS', 'TW_ACCOUNT_TABS', 'TW_NOTIF_TABS', 'MAIL_FOLDERS', 'SK_SECTIONS', 'RG_TABS']) add(t(name).map((x) => x[1]));
  add(t('RG_TABS').map((x) => x[2]).filter(Boolean));
  add(Object.values(t('TW_TITLE')));
  add(Object.values(t('SYNC_HELP')).flatMap((x) => x.slice(0, 2)));
  add(Object.values(t('TW_EMPTY')).flat());
  add(Object.values(t('ACCOUNT_BIO')));
  add(Object.values(t('PROFILE_MEDIA')).map((x) => x.title));
  for (const name of ['ROLE_LABEL', 'STANCE_LABEL', 'REQUEST_OUTCOME', 'ABILITY_LABELS', 'INF_KIND', 'INF_STATUS', 'INF_REASON', 'INF_POS', 'TRAINING_BARS']) add(Object.values(t(name)));
  add(Object.keys(t('ARROW_ICON')));
  add(Object.values(t('GZ_SHORT')).filter((v) => !/^(Ligue [12]|LaLiga( 2)?|Serie [AB]|FA Cup|Libertadores|Championship|Liga Portugal)$/.test(v)));

  // Moteur : libellés lus dans la sauvegarde, étapes de la barre de progression, rôles, genres d'articles.
  const prof = read('src/save/playerProfile.js');
  for (const name of ['STYLES', 'TEAM_ROLES', 'FORM_ARROWS']) add([...prof.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unq(m[1])));
  add(['droit', 'gauche', 'aucun']);
  const { SKILL_NAMES, POSITION_NAMES } = require(path.join(ROOT, 'src/save/training.js'));
  add([...Object.values(SKILL_NAMES), ...Object.values(POSITION_NAMES)]);
  const world = read('src/world/world.js');
  for (const m of world.matchAll(/tracker\(progress, '([^']+)'/g)) keys.add(m[1]);
  for (const m of world.matchAll(/\['([^']+)', \d+\]/g)) keys.add(m[1]);
  for (const m of world.matchAll(/t\.step\(\d+, '([^']+)'\)/g)) keys.add(m[1]);
  add([...read('src/ai/prompts.js').match(/TRANSVERSALE_KINDS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  add([...read('src/world/agent.js').match(/BUCKETS = \[([^\n]*)\];/)[1].matchAll(/\['([^']+)'/g)].map((m) => m[1]));
  for (const m of read('src/ai/providers.js').matchAll(/label: '([^']+)'/g)) keys.add(m[1]);

  // Messages d'erreur écrits en toutes lettres (ceux qui contiennent un nom passent par les motifs de src/i18n.js).
  const sources = ['main.js', ...['src/world', 'src/save', 'src/ai'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];
  for (const f of sources) {
    for (const m of read(f).matchAll(/throw new (?:AI)?Error\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) keys.add(unq(m[1] ?? m[2]));
  }
  // Erreurs techniques réservées au journal (jamais vues seules par le joueur).
  ['Type de colonne CPK inconnu'].forEach((k) => keys.delete(k));
  return keys;
}

test('les cinq dictionnaires ont exactement les mêmes textes', () => {
  const en = Object.keys(dicts.en).sort();
  for (const l of LANGS) assert.deepStrictEqual(Object.keys(dicts[l]).sort(), en, `${l} diffère de en`);
});

test('chaque traduction garde les paramètres {x} du texte français et n’est pas vide', () => {
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(dicts[l])) {
      assert.ok(String(v).trim(), `${l} : traduction vide pour ${JSON.stringify(k)}`);
      assert.strictEqual(params(v), params(k), `${l} : paramètres de ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
    }
  }
});

test('tout ce que l’interface et le moteur affichent est traduit', () => {
  const { trError } = require(path.join(ROOT, 'src/i18n.js'));
  const missing = [...expectedKeys()].filter((k) => !(k in dicts.en) && trError('en', k) === k);
  assert.deepStrictEqual(missing, [], `textes sans traduction :\n${missing.join('\n')}`);
});

test('les messages d’erreur avec un nom sont traduits par leur motif', () => {
  const { trError } = require(path.join(ROOT, 'src/i18n.js'));
  assert.strictEqual(trError('en', 'Rennes ne répond plus à tes messages.'), 'Rennes no longer answers your messages.');
  assert.strictEqual(trError('de', 'Erreur Groq (429) : quota'), 'Groq-Fehler (429): quota');
  assert.strictEqual(trError('en', 'Sauvegarde introuvable : C:\\save\\BL00000000'), 'Save file not found: C:\\save\\BL00000000');
  assert.strictEqual(trError('fr', 'Ton post est vide.'), 'Ton post est vide.');
  assert.strictEqual(trError('es', 'message inconnu'), 'message inconnu');
});
