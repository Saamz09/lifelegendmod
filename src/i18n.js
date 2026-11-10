'use strict';
// Textes de l'app hors interface (fenêtres de Windows, notifications, messages d'erreur) dans la langue choisie.
// Mêmes dictionnaires que l'interface : lifelegend/i18n/<langue>.js, dont les clés sont les textes français.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'lifelegend', 'i18n');
const LANGS = ['en', 'es', 'it', 'pt', 'de'];
const cache = {};

function dict(lang) {
  if (!cache[lang]) {
    try {
      const ctx = vm.createContext({ window: {} });
      vm.runInContext(fs.readFileSync(path.join(DIR, `${lang}.js`), 'utf8'), ctx, { filename: `${lang}.js` });
      cache[lang] = ctx.window.LL_I18N?.[lang] || {};
    } catch {
      cache[lang] = {};
    }
  }
  return cache[lang];
}

const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] ?? m)) : s);
const tr = (lang, fr, params) => fill(LANGS.includes(lang) ? dict(lang)[fr] ?? fr : fr, params);

// Messages qui contiennent un nom (club, fournisseur d'IA, fichier) : reconnus par leur motif français.
const PATTERNS = [
  [/^(.+) ne répond plus à tes messages\.$/s, '{name} ne répond plus à tes messages.', ['name']],
  [/^Club inconnu de ton agent : (.+)\.$/s, 'Club inconnu de ton agent : {club}.', ['club']],
  [/^(@\w+) est déjà le pseudo d’un autre compte de Kop\.$/, '{handle} est déjà le pseudo d’un autre compte de Kop.', ['handle']],
  [/^Ce fichier est une sauvegarde « (.+) »\. Choisis un fichier BL0000000x, jeu fermé\.$/, 'Ce fichier est une sauvegarde « {type} ». Choisis un fichier BL0000000x, jeu fermé.', ['type']],
  [/^Ce fichier est une sauvegarde « (.+) », pas Become a Legend \(BL00000000\)\.$/, 'Ce fichier est une sauvegarde « {type} », pas Become a Legend (BL00000000).', ['type']],
  [/^Sauvegarde introuvable : (.+)$/s, 'Sauvegarde introuvable : {path}', ['path']],
  [/^Relecture inattendue après écriture\. Ta sauvegarde d’origine est ici : (.+)$/s, 'Relecture inattendue après écriture. Ta sauvegarde d’origine est ici : {path}', ['path']],
  [/^Le modèle « (.+) » est introuvable chez Anthropic\. Choisis-en un autre\.$/, 'Le modèle « {model} » est introuvable chez Anthropic. Choisis-en un autre.', ['model']],
  [/^Clé (.+?) refusée : (.*)$/s, 'Clé {provider} refusée : {detail}', ['provider', 'detail']],
  [/^Modèle introuvable chez (.+?) : (.*)$/s, 'Modèle introuvable chez {provider} : {detail}', ['provider', 'detail']],
  [/^Erreur (.+?) \(([^)]*)\) : (.*)$/s, 'Erreur {provider} ({status}) : {detail}', ['provider', 'status', 'detail']],
  [/^Impossible de joindre (.+)\. Vérifie ta connexion\.$/, 'Impossible de joindre {provider}. Vérifie ta connexion.', ['provider']],
  [/^Réponse vide de (.+) \(souvent une limite de requêtes\)\. Réessaie\.$/, 'Réponse vide de {provider} (souvent une limite de requêtes). Réessaie.', ['provider']],
  [/^La connexion avec (.+) a été coupée pendant la réponse\.$/, 'La connexion avec {provider} a été coupée pendant la réponse.', ['provider']],
  [/^Google n'a renvoyé aucun texte \((.+)\)\.$/s, 'Google n’a renvoyé aucun texte ({reason}).', ['reason']],
  [/^Fournisseur inconnu : (.+)$/, 'Fournisseur inconnu : {provider}', ['provider']],
];

// Message d'erreur du moteur (écrit en français) dans la langue choisie ; tel quel s'il n'est pas connu.
function trError(lang, msg) {
  const text = String(msg ?? '');
  if (!LANGS.includes(lang)) return text;
  const d = dict(lang);
  if (d[text]) return d[text];
  for (const [re, key, names] of PATTERNS) {
    const m = text.match(re);
    if (m && d[key]) return fill(d[key], Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return text;
}

module.exports = { tr, trError };
