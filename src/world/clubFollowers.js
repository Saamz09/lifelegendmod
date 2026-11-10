'use strict';
// Abonnés des comptes de clubs sur Kop, calés sur les chiffres relevés dans PES (« Abonnés » de la page du club).
// Le jeu ne les range pas tels quels dans la sauvegarde (cherchés le 20/10/2026 sans succès) : on part des valeurs
// relevées à la main (KNOWN), puis on estime les autres clubs par rapport à elles :
// - les grands clubs connus, d'après leur popularité réelle comparée à celle de Rennes (FAME, Rennes = 1) ;
// - les autres, d'après leur standing : niveau du championnat, place au classement (lissée), Europe.
// Estimations, sauf pour les clubs relevés en jeu.

const { clubPrestige } = require('./agent');

// Relevés en jeu : référence du club dans la sauvegarde → abonnés affichés par PES (le nom vérifie qu'il s'agit bien
// du même club : un patch comme Football Life peut donner la même référence à un autre club).
const KNOWN = {
  3571788: { name: 'Rennes', followers: 584294 }, // relevé le 20/10/2026 (saison 2020/2021)
  4014167: { name: 'Heerenveen', followers: 193650 }, // relevé le 20/10/2026 (saison 2020/2021)
};
const ANCHOR = 3571788; // Rennes : unité de la popularité réelle (FAME)
// Écart de standing → écart d'abonnés (×10 pour 1/K de standing). Calé sur les deux relevés : Rennes (Ligue 1, 9e,
// Ligue des champions) et Heerenveen (Eredivisie, 10e) ; à 2,5, Heerenveen ressortait à 98 596 au lieu de 193 650.
const K = 1.6;
const knownOf = (c) => { const k = KNOWN[c.ref]; return k && norm(k.name) === norm(c.name) ? k.followers : null; };

// Popularité réelle approximative (réseaux sociaux), Rennes = 1. Noms normalisés (sans accents, ponctuation, sigles) ;
// pour un nom porté par plusieurs clubs du jeu, le championnat suivi tranche (Arsenal anglais / argentin…).
const FAME = [
  [160, ['realmadrid']], [160, ['barcelona'], /laliga/], [95, ['manchesterunited', 'manutd', 'manchesterutd']],
  [68, ['juventus', 'piemontecalcio']], [68, ['parissaintgermain', 'psg', 'parissg']], [60, ['chelsea']],
  [57, ['liverpool', 'merseysidered'], /premierleague/], [52, ['bayernmunchen', 'bayernmunich', 'bayern']], [50, ['manchestercity', 'manblue']],
  [43, ['arsenal', 'northlondon'], /premierleague/], [29, ['milan']], [25, ['borussiadortmund', 'dortmund']],
  [25, ['atleticomadrid', 'atleticodemadrid', 'atletico']], [21, ['tottenhamhotspur', 'tottenham', 'northeastlondon']],
  [21, ['inter', 'internazionale', 'intermilan']], [21, ['galatasaray']], [21, ['flamengo']], [17, ['corinthians']],
  [16, ['fenerbahce']], [13, ['bocajuniors']], [11, ['besiktas']], [11, ['riverplate']], [8, ['olympiquedemarseille', 'olympiquemarseille', 'marseille']],
  [7, ['benfica']], [6.5, ['ajax']], [6, ['schalke04', 'schalke']], [6, ['roma']], [6, ['napoli']],
  [5.7, ['olympiquelyonnais', 'lyon']], [5.5, ['valencia']], [5, ['leicestercity', 'leicester']], [5, ['sevilla']], [5, ['porto']],
  [4.3, ['sportingcp', 'sporting', 'sportingclubedeportugal']], [3.6, ['monaco']], [3.6, ['zenit', 'zenitstpetersburg', 'zenitsaintpetersburg']],
  [2.9, ['celtic']], [2.1, ['lille', 'losclille', 'losc']], [1.7, ['saintetienne']], [1.6, ['bordeaux', 'girondinsdebordeaux']],
  [11, ['palmeiras']], [10, ['saopaulo']], [8, ['santos']], [5.5, ['vascodagama', 'vasco']], [5.5, ['gremio']],
  [5.5, ['atleticomineiro']], [5, ['cruzeiro']], [5, ['internacional']], [3.5, ['fluminense']], [3, ['botafogo']],
  [2.5, ['racingclub', 'racing']], [2.5, ['independiente']], [2, ['sanlorenzo']],
  [1.15, ['nantes']], [1, ['rennes', 'staderennais']], [0.85, ['lens']], [0.85, ['nice']], [0.7, ['montpellier', 'montpellierhsc']],
];
const SIGLES = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'ssc', 'afc', 'cd', 'sd', 'sk', 'fk', 'rc', 'ogc', 'sl', 'sv', 'ca', 'cr', 'se', 'hsc', 'losc', 'us']);
function norm(name) {
  const words = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !SIGLES.has(w));
  return (kept.length ? kept : words).join('');
}
const FAME_BY_KEY = new Map(FAME.flatMap(([w, keys, league]) => keys.map((k) => [k, { w, league }])));
function fameOf(name, follows = []) {
  const f = FAME_BY_KEY.get(norm(name));
  if (!f || (f.league && !follows.some((h) => f.league.test(h)))) return null;
  return f.w;
}

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// Standing d'un club : niveau du championnat + place (lissée) + Europe (la Ligue des champions pèse plus).
const DEFAULT_LEVEL = 0.3;
function standing(prestige, ref, follows = []) {
  const p = prestige.get(ref);
  const level = p ? p.level : DEFAULT_LEVEL;
  const position = p ? (p.prestige - p.level) / 0.38 : 0.5;
  const ucl = follows.some((h) => /champions/i.test(h)) ? 0.1 : 0;
  const uel = !ucl && follows.some((h) => /europa/i.test(h)) ? 0.05 : 0;
  return level + 0.25 * position + ucl + uel;
}

// clubs : [{ handle, ref, name, follows }] → Map(handle en minuscules → abonnés).
function clubFollowers({ career, leagueId, clubs }) {
  const prestige = clubPrestige(career, leagueId);
  const unit = KNOWN[ANCHOR].followers / (fameOf('Rennes') || 1); // abonnés pour une « popularité Rennes »
  // Points d'appui : les clubs relevés en jeu présents dans la liste (leur standing du moment) ; à défaut, Rennes à 0,8.
  const anchors = clubs.filter((c) => knownOf(c)).map((c) => ({ n: knownOf(c), s: standing(prestige, c.ref, c.follows) }));
  if (!anchors.length) anchors.push({ n: KNOWN[ANCHOR].followers, s: 0.8 });
  const out = new Map();
  for (const c of clubs) {
    let n = knownOf(c);
    if (n == null) {
      const fame = fameOf(c.name, c.follows);
      const s = standing(prestige, c.ref, c.follows);
      // Moyenne géométrique des estimations faites depuis chaque point d'appui, bornée (×0,03 à ×4 de Rennes).
      const est = fame != null ? unit * fame
        : Math.min(unit * 4, Math.max(unit * 0.03, Math.exp(anchors.reduce((sum, a) => sum + Math.log(a.n * 10 ** (K * (s - a.s))), 0) / anchors.length)));
      const jitter = 0.92 + (hash(c.handle) % 1601) / 10000; // ±8 %, stable : deux clubs proches n'ont pas le même chiffre
      n = Math.round(est * jitter);
    }
    out.set(String(c.handle).toLowerCase(), n);
  }
  return out;
}

module.exports = { clubFollowers, KNOWN, norm, fameOf };
