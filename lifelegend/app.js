'use strict';
/* global live */
// LifeLegend : l'interface de la mod (charte dans lifelegend/style.css). Elle reprend celle de LegendLife, archivée
// dans ../archives/legendlife-2026-10-21/renderer, avec une autre barre du haut et quelques détails de présentation.

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (body) => esc(body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const linkify = (text) => esc(text).replace(/(^|\s)(@\w+)/g, '$1<span class="mention">$2</span>').replace(/(^|\s)(#[\wÀ-ÿ]+)/g, '$1<span class="tag">$2</span>');
// ---------- Langue de l'interface ----------
// Un seul réglage (settings.language) pour l'interface et pour ce que l'IA écrit. Les textes sont écrits en français
// dans le code ; tr() les traduit avec le dictionnaire de la langue (i18n/<langue>.js, clé = texte français), {nom}
// étant remplacé par la valeur donnée. trn() choisit la forme selon le nombre, avec les règles de la langue (en
// français 0 et 1 sont au singulier, en anglais seul 1). Un texte absent du dictionnaire reste en français.
const LOCALES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', de: 'de-DE' };
const lang = () => (LOCALES[settings?.language] ? settings.language : 'fr');
const locale = () => LOCALES[lang()];
// Italien : l'article devant un nom de club s'accorde à sa première lettre (« dell’Heerenveen », « lo Sparta »).
const IT_ART = { 'con il ': ['con l’', 'con lo '], 'del ': ['dell’', 'dello '], 'al ': ['all’', 'allo '], 'dal ': ['dall’', 'dallo '], 'nel ': ['nell’', 'nello '], 'il ': ['l’', 'lo '] };
const itArticles = (s, p) => s.replace(/(^|[\s(])(con il |del |al |dal |nel |il )\{(\w+)\}/g, (m, pre, art, k) => {
  const v = String(p[k] ?? '').replace(/<[^>]*>/g, '');
  const [elided, lo] = IT_ART[art];
  return `${pre}${/^h?[aeiouàèéìòù]/i.test(v) ? elided : /^(s[^aeiou]|z|gn|ps|x|y)/i.test(v) ? lo : art}{${k}}`;
});
// Français : même règle que deWho (src/world/postTexts.js) pour « de {nom} » : « d’Ilan Morel », « de l’AS Nancy Lorraine ».
const frDe = (n) => {
  const s = String(n);
  if (/^(AS|US|USL|AC|AJ|EA|ES|OGC|Olympique|Athletic|Atlético|Inter)\b/.test(s)) return `de l’${s}`;
  if (/^(FC|RC|SC|SM|RB|Stade|Real|Racing|Red Star|Paris (FC|Saint|SG))\b/.test(s)) return `du ${s}`;
  return /^([aeiouéèêàâîïôû]|yv)/i.test(s) ? `d’${s}` : `de ${s}`;
};
const frArticles = (s, p) => s.replace(/\bde \{(\w+)\}/g, (m, k) => {
  const v = String(p[k] ?? '');
  return v && !v.startsWith('<') ? frDe(v).slice(0, -v.length) + `{${k}}` : m;
});
const fill = (s, p) => (p ? (lang() === 'it' ? itArticles(String(s), p) : lang() === 'fr' ? frArticles(String(s), p) : String(s)).replace(/\{(\w+)\}/g, (m, k) => (p[k] ?? m)) : s);
const i18nMissing = new Set();
function tr(fr, params) {
  if (lang() === 'fr' || !fr) return fill(fr, params);
  const out = window.LL_I18N?.[lang()]?.[fr];
  if (out == null) i18nMissing.add(fr);
  return fill(out ?? fr, params);
}
function trn(n, one, other, params) {
  return tr(new Intl.PluralRules(locale()).select(Number(n)) === 'one' ? one : other, { n, ...params });
}
// Heure d'un match : « 21h » en français, « 21:00 » ailleurs.
const hh = (h) => (lang() === 'fr' ? `${h}h` : `${String(h).padStart(2, '0')}:00`);
// Guillemets de la langue autour d'un texte déjà échappé ; deux-points (espace avant en français seulement).
const quote = (s) => ({ fr: `« ${s} »`, en: `“${s}”`, pt: `“${s}”`, de: `„${s}“` }[lang()] || `«${s}»`);
const colon = () => (lang() === 'fr' ? ' :' : ':');
// Première lettre en minuscule au milieu d'une phrase (pas en allemand : les noms y gardent leur majuscule).
const lcFirst = (s) => (lang() === 'de' || !s ? s : s.charAt(0).toLowerCase() + s.slice(1));
const roundLabel = (n) => tr('{n}e journée', { n });
// Lettres de la forme (V, N, D dans les données) : W/D/L en anglais, etc.
const formLetter = (k) => (lang() === 'fr' ? k : tr(`forme ${k}`));
// Note sur 10 avec une décimale, à la façon de la langue (6,5 ou 6.5).
const fmtNote = (r) => r.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtNum = (n) => Number(n || 0).toLocaleString(locale());
const euros = (n) => Number(n || 0).toLocaleString(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (n) => (lang() === 'fr' || lang() === 'de' || lang() === 'es' ? `${n} %` : `${n}%`);

function fmtDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString(locale(), opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Rang : 1er, 2e (français) ; 1st, 2nd (anglais) ; 1.º (espagnol) ; 1º (italien, portugais) ; 1. (allemand).
function ordinal(n) {
  if (n == null) return '—';
  const l = lang();
  if (l === 'fr') return n === 1 ? '1er' : `${n}e`;
  if (l === 'en') { const k = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); return `${n}${k}`; }
  return l === 'es' ? `${n}.º` : l === 'de' ? `${n}.` : `${n}º`;
}
const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });

const SITES = [
  { id: 'national', label: () => 'La Transversale' },
  { id: 'local', label: () => state?.localPaper?.name || tr('Journal local') },
  { id: 'tribune', label: () => 'Kop' },
  { id: 'mail', label: () => 'Mails' },
  { id: 'huddle', label: () => 'Vestiaire' },
  { id: 'stats', label: () => 'Scoreline' },
  { id: 'pantheon', label: () => 'Panthéon' },
  { id: 'settings', hidden: true, label: () => tr('Réglages') },
];

const TYPE_LABEL = { national: 'SÉLECTION', competition: 'COMPÉTITION', journalist: 'PRESSE', rival: 'RIVAL', club: 'CLUB', pundit: 'CONSULTANT', stats: 'STATS', meme: 'MÈME', betting: 'PARIS', highlights: 'VIDÉO', player: '', coach: '', fan: '', me: '' };

// Textes en cours de frappe : conservés quand la page se redessine (synchro ou ralenti en arrière-plan).
const drafts = { post: '', poll: null, reply: '', mail: {}, dm: {}, huddle: {}, press: {}, noComment: {} };

// Chemin Windows -> URL file:/// pour le lecteur vidéo.
const fileUrl = (p) => `file:///${encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;

function videoHtml(p) {
  return `<video class="post-video" controls preload="metadata" src="${esc(fileUrl(p))}"></video>`;
}

// Photo et bannière du profil : fichiers rangés dans le dossier de la carrière (ou image en cours d'édition).
let appPaths = { careersDir: '' };
const profileImg = (f) => (!f ? null : String(f).startsWith('data:') ? f : appPaths.careersDir && state ? fileUrl(`${appPaths.careersDir}\\${state.careerId}\\profile\\${f}`) : null);
// Fiche d'un compte de club (écusson lu dans les fichiers du jeu, stade, championnat), d'après son pseudo.
const clubPage = (handle) => (handle && state?.clubPages?.[String(handle).toLowerCase()]) || null;
const emblemUrl = (f) => (!f ? null : String(f).startsWith('data:') ? f : appPaths.careersDir && state ? fileUrl(`${appPaths.careersDir}\\${state.careerId}\\emblems\\${f}`) : null);
// Les visages des joueurs et des entraîneurs, lus dans les fichiers du jeu, seulement pour ceux qu'une page affiche : { nom : fichier }.
let faceFiles = {}, faceAsked = new Set(), faceWanted = new Set(), faceTimer = null, faceCareer = null, faceScope = null;
const faceFileUrl = (f) => (appPaths.careersDir && state ? fileUrl(`${appPaths.careersDir}\\${state.careerId}\\faces\\${f}`) : null);
const faceMini = (u) => `<img class="face-img mini" src="${esc(u)}" alt="">`;
// Demande au jeu les visages que la page vient d'afficher : chacun prend sa place dès qu'il arrive, sans redessiner la page.
function askFaces() {
  faceTimer = null;
  if (!faceWanted.size || !live.playerFaces) return;
  const names = [...faceWanted], career = state?.careerId;
  faceWanted.clear();
  names.forEach((n) => faceAsked.add(n));
  live.playerFaces(names).then((files) => {
    if (career !== state?.careerId) return;
    Object.assign(faceFiles, files);
    document.querySelectorAll('[data-face]').forEach((el) => {
      const f = faceFiles[el.dataset.face], u = f && faceFileUrl(f);
      if (u) el.outerHTML = faceMini(u);
    });
  }).catch(() => {});
}
// Ce qu'on met dans une pastille de joueur : son visage, sinon `fallback`, qui reste s'il n'a pas de visage dans le jeu.
function faceIn(name, fallback = '', key = name) {
  if (!name) return fallback;
  const f = faceFiles[key], u = f && faceFileUrl(f);
  if (u) return faceMini(u);
  if (!faceAsked.has(key)) {
    faceWanted.add(key);
    if (!faceTimer) faceTimer = setTimeout(askFaces, 20);
  }
  return `<span class="face-wait" data-face="${esc(key)}">${fallback}</span>`;
}
// Un entraîneur : à part, car un joueur peut porter le même nom.
const coachFaceIn = (name, fallback = '') => faceIn(name, fallback, `coach|${name}`);
// Un compte de Kop : son visage s'il est joueur ou entraîneur. Jamais pour un supporter, même s'il porte le même nom.
const authorFace = (a, fallback) => (a?.type === 'player' || a?.type === 'me' ? faceIn(a.name, fallback) : a?.type === 'coach' ? coachFaceIn(a.name, fallback) : fallback);
// Le joueur lui-même : une photo choisie dans Kop passe avant son visage du jeu.
function myFaceIn(fallback = '') {
  const photo = profileImg(state?.profile?.avatar);
  return photo ? `<img class="face-img" src="${esc(photo)}" alt="">` : faceIn(state?.snapshot?.player?.name, fallback);
}
// Ceux dont on sait que ce sont de vrais joueurs : un membre du staff ou un expéditeur inventé peut porter le nom d'un autre.
const knownPlayers = new WeakMap();
function isKnownPlayer(name) {
  if (!state) return false;
  if (!knownPlayers.has(state)) {
    const s = state.snapshot;
    knownPlayers.set(state, new Set([s?.player?.name, ...(s?.squad || []).map((p) => p.name), ...(s?.rosters?.mine || []), ...(state.huddles || []).flatMap((g) => g.players || [])]));
  }
  return knownPlayers.get(state).has(name);
}
const knownCoaches = new WeakMap();
function isKnownCoach(name) {
  if (!state) return false;
  if (!knownCoaches.has(state)) knownCoaches.set(state, new Set([state.snapshot?.coaches?.mine, state.snapshot?.coaches?.nextOpponent, ...(state.huddles || []).map((g) => g.coach)].filter(Boolean)));
  return knownCoaches.get(state).has(name);
}
// Une autre carrière repart de zéro ; une synchro peut départager deux joueurs du même nom : on redemande ce qui manquait.
function facesFollowCareer() {
  const s = state?.snapshot, scope = `${state?.careerId}|${s?.gameDate}|${Boolean(s?.playerIds)}`;
  if (scope === faceScope) return;
  faceScope = scope;
  if (faceCareer !== state?.careerId) { faceCareer = state?.careerId; faceFiles = {}; }
  faceAsked = new Set();
}

let state = null;
let settings = null;
let providers = {};
let appVersion = '';
let current = 'national';
const view = { edition: null, thread: null, openPost: null };

// ---------- utilitaires d'interface ----------

// action : { label, run } ajoute un bouton (Réessayer, Réglages de l'IA…) ; la notification reste alors plus longtemps.
function toast(msg, isError = false, action = null) {
  const t = $('#toast');
  t.textContent = '';
  // Le texte dans son propre bloc : un long chemin de fichier y passe à la ligne au lieu de pousser le bouton dehors.
  t.appendChild(Object.assign(document.createElement('span'), { textContent: msg }));
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-act';
    b.textContent = action.label;
    b.onclick = () => { t.classList.add('hidden'); action.run(); };
    t.appendChild(b);
  }
  t.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), action ? 15000 : isError ? 9000 : 3500);
}

// Erreur de synchro : le message, une phrase qui dit quoi faire et le bouton qui y mène, selon le genre signalé par
// le processus principal (« ⟦genre⟧ » devant le message).
const SYNC_HELP = {
  save: ['Vérifie la sauvegarde choisie dans les réglages.', 'Ma sauvegarde', () => openSettings('rg-save')],
  pick: ['', 'Ma sauvegarde', () => openSettings('rg-save')], // « Choisis ta sauvegarde… » dit déjà quoi faire
  key: ['Il manque la clé de sauvegarde de Football Life 2027 : ajoute-la dans les réglages.', 'Ajouter ma clé…', () => openSettings('rg-save')],
  ai: ['Vérifie ta clé et ton modèle d’IA dans les réglages.', 'Réglages de l’IA', () => openSettings('rg-ai')],
  quota: ['Le quota gratuit du jour de ton IA est épuisé : il se renouvelle chaque jour. D’ici là, tu peux choisir un autre fournisseur gratuit (Groq) dans les réglages.', 'Réglages de l’IA', () => openSettings('rg-ai')],
  busy: ['Attends quelques secondes que le jeu ait fini, puis réessaie.', 'Réessayer', () => doSync()],
  retry: ['C’est souvent passager : réessaie dans un instant.', 'Réessayer', () => doSync()],
};
function syncFailure(raw) {
  const m = /^⟦(\w+)⟧ ([\s\S]*)$/.exec(String(raw || ''));
  const help = m && SYNC_HELP[m[1]];
  return { message: m ? m[2] : String(raw || ''), help: help && help[0] ? tr(help[0]) : '', action: help ? { label: tr(help[1]), run: help[2] } : null };
}
// Le message suivi de l'aide, avec un point entre les deux si le message n'en a pas (« … (429) : quota. Le quota… »).
const withHelp = (text, help) => (help ? `${text}${/[.!?…»)]$/.test(text.trim()) ? '' : '.'} ${help}` : text);

// Journal de synchro : gardé en mémoire mais jamais affiché (masqué à la demande) ; les erreurs et le « rien de
// nouveau » passent par une notification. Le détail reste dans data/activity.log.
function logLine(msg, kind = '') {
  const box = $('#synclog');
  const line = document.createElement('div');
  line.className = `logline ${kind}`;
  line.textContent = msg;
  box.appendChild(line);
}

// Textes fixes de la page (barre du haut, HUD), dans la langue choisie.
function localizeChrome() {
  document.documentElement.lang = lang();
  $('#tabs').setAttribute('aria-label', tr('Sites'));
  $('#sync-btn').setAttribute('aria-label', tr('Lire la sauvegarde et publier une nouvelle édition'));
  if (!$('#sync-btn').disabled) $('#sync-label').textContent = tr('Synchroniser');
  $('#settings-btn').title = tr('Réglages');
  $('#settings-btn').setAttribute('aria-label', tr('Réglages'));
}

// ---------- couleurs du thème ----------
// Les couleurs de LifeLegend au choix (Réglages › Apparence) : pour chaque thème, l'accent (l'or), le cadre et le fond
// des sites. Une palette toute prête, ou un nuancier par couleur. Les couleurs propres à chaque site (le bleu de Kop,
// la ligue, le club) ne changent pas. « Or » est la palette d'origine : avec elle, rien n'est ajouté à la feuille de style.
const PALETTES = [
  ['gold', 'Or', { light: { accent: '#e8b02a', frame: '#ebebe8', page: '#f6f6f5' }, dark: { accent: '#f0c24b', frame: '#101115', page: '#15161c' } }],
  ['ocean', 'Océan', { light: { accent: '#2f6fed', frame: '#e3e9f1', page: '#f5f7fa' }, dark: { accent: '#6f94f7', frame: '#0c111a', page: '#121823' } }],
  ['forest', 'Forêt', { light: { accent: '#1f9d63', frame: '#e2eae4', page: '#f4f7f5' }, dark: { accent: '#4cc38a', frame: '#0b120e', page: '#121a16' } }],
  ['garnet', 'Grenat', { light: { accent: '#c8364a', frame: '#efe4e5', page: '#f9f4f4' }, dark: { accent: '#ff6f7d', frame: '#140c0e', page: '#1c1315' } }],
  ['sand', 'Sable', { light: { accent: '#b07a2a', frame: '#ebe3d4', page: '#f8f4ec' }, dark: { accent: '#e0a85a', frame: '#13100b', page: '#1b1813' } }],
];
const COLOR_KEYS = ['accent', 'frame', 'page'];
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const relLum = (h) => { const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = hexRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrastOf = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Pousse une couleur vers `to` (blanc ou noir) jusqu'à ce que `ok` soit vrai.
const pushUntil = (hex, to, ok) => { let c = hex; for (let i = 0; i < 24 && !ok(c); i++) c = mixHex(c, to, 0.1); return c; };
const onColor = (c) => (contrastOf(c, '#111111') >= contrastOf(c, '#ffffff') ? '#111111' : '#ffffff');
// Les couleurs choisies, complétées par la palette d'origine (une valeur invalide est ignorée).
function themeColors(colors) {
  const base = PALETTES[0][2];
  return Object.fromEntries(['light', 'dark'].map((m) => [m, Object.fromEntries(COLOR_KEYS.map((k) => [k, COLOR_RE.test(colors?.[m]?.[k] || '') ? colors[m][k].toLowerCase() : base[m][k]]))]));
}
// L'or et ses déclinaisons, tirés d'un accent : lisible sur la page (4,5 pour le texte), texte noir ou blanc posé dessus.
function accentVars(a, page, dark) {
  const gold = dark ? pushUntil(a, '#ffffff', (c) => contrastOf(c, page) >= 3) : a;
  const ink = pushUntil(a, dark ? '#ffffff' : '#000000', (c) => contrastOf(c, page) >= 4.5);
  const hiC = dark ? gold : mixHex(a, '#ffffff', 0.12);
  return [`--gold: ${gold}`, `--gold-ink: ${ink}`, `--gold-soft: ${mixHex(page, a, dark ? 0.16 : 0.14)}`, `--on-gold: ${onColor(gold)}`, `--series: ${ink}`,
    `--gold-hi: ${hiC}`, `--gold-hi-2: ${mixHex(hiC, '#ffffff', 0.3)}`, `--on-gold-hi: ${onColor(hiC)}`];
}
// Les jetons des couleurs choisies pour le thème affiché : seulement ce qui diffère de la palette d'origine (les deux
// fonds toujours, Scoreline et Panthéon gardant le sombre en thème clair). Le fond clair reste assez clair pour l'encre
// sombre, le fond et le cadre sombres assez sombres pour l'encre claire.
function themeColorVars(colors, mode) {
  const c = themeColors(colors), base = PALETTES[0][2], out = [];
  const changed = (m, k) => c[m][k] !== base[m][k];
  const P = pushUntil(c.light.page, '#ffffff', (x) => relLum(x) >= 0.78), Q = pushUntil(c.dark.page, '#000000', (x) => relLum(x) <= 0.03);
  if (changed('light', 'page')) out.push(['--l-0', P], ['--l-1', mixHex(P, '#000000', 0.035)], ['--l-2', mixHex(P, '#000000', 0.08)], ['--l-back', mixHex(P, '#000000', 0.095)], ['--l-line', mixHex(P, '#000000', 0.08)], ['--l-line-2', mixHex(P, '#000000', 0.14)]);
  if (changed('dark', 'page')) out.push(['--d-1', Q], ['--d-0', mixHex(Q, '#000000', 0.4)], ['--d-2', mixHex(Q, '#ffffff', 0.04)], ['--d-3', mixHex(Q, '#ffffff', 0.085)], ['--d-line', mixHex(Q, '#ffffff', 0.064)], ['--d-line-2', mixHex(Q, '#ffffff', 0.13)]);
  const dark = mode === 'dark';
  if (changed(mode, 'frame')) {
    const f = dark ? pushUntil(c.dark.frame, '#000000', (x) => relLum(x) <= 0.02) : pushUntil(c.light.frame, '#ffffff', (x) => relLum(x) >= 0.6);
    out.push(['--sh-frame', f], ['--sh-back', mixHex(f, '#000000', dark ? 0.45 : 0.05)], ['--sh-panel', mixHex(f, '#ffffff', dark ? 0.03 : 0.3)]);
  }
  if (changed(mode, 'accent')) out.push(...accentVars(c[mode].accent, dark ? Q : P, dark).map((x) => x.split(': ')));
  return out;
}
// Posées sur la racine, comme les couleurs de club : la politique de sécurité de la page refuse les styles écrits dans
// le HTML. On retire celles d'avant (autre thème, autre palette) avant de poser les nouvelles.
let colorKeys = [];
function applyColors(colors) {
  const root = document.documentElement, vars = themeColorVars(colors, root.dataset.theme);
  for (const k of colorKeys) if (!vars.some(([x]) => x === k)) root.style.removeProperty(k);
  for (const [k, v] of vars) root.style.setProperty(k, v);
  colorKeys = vars.map(([k]) => k);
}
// Le thème et les couleurs enregistrés ; la page Réglages passe ceux du formulaire pour l'aperçu en direct.
function applyTheme(theme = settings?.theme, colors = settings?.colors) {
  const t = theme || 'auto';
  document.documentElement.dataset.theme = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
  applyColors(colors);
}

function go(site) {
  // En quittant les réglages sans enregistrer, l'aperçu du thème et des couleurs s'efface.
  if (current === 'settings' && site !== 'settings') applyTheme();
  current = site;
  if (site === 'national') { view.gzY = 0; const box = gzBox(); if (box) box.scrollTop = 0; }
  if (site === 'tribune') { view.twY = 0; const feed = document.querySelector('.tw-main'); if (feed) feed.scrollTop = 0; }
  if (site === 'local') { view.fbY = 0; const box = fbBox(); if (box) box.scrollTop = 0; }
  // En haut d'abord : l'entrée de la nouvelle page mesure ce qui est à l'écran.
  viewScrollTo(0);
  render();
}

// Échap revient d'un cran, comme dans le jeu : ferme ce qui est ouvert (menu de Kop, post ou profil, article,
// conférence de presse, Influence ou dossier de Mails, match déplié de Scoreline). Rend false s'il n'y a rien.
function goBack() {
  if (pressBox) { if (!view.pressBusy) closePressModal(); return true; }
  if (infBox) { closeInfModal(); return true; }
  if (setupActive() && current !== 'settings') return setupBack();
  if (current === 'tribune' && (view.twMenu || view.twMore || view.twRtMenu)) { Object.assign(view, { twMenu: null, twMore: false, twRtMenu: null }); render(); return true; }
  if (current === 'tribune' && view.twDmNew && view.twFilter === 'messages') { view.twDmNew = false; render(); return true; }
  // Les sites qui ont leur bouton retour (Kop, Mails sur petit écran) s'en servent, avec leur propre logique.
  const own = document.querySelector('#page [data-twback], #page [data-smback]');
  if (own && own.offsetParent !== null) { own.click(); return true; }
  if (current === 'national' && view.natArticle) { view.natArticle = null; render(); gzScrollTo(view.natBack || 0); return true; }
  if (current === 'national' && view.natAll) { view.natAll = null; render(); gzScrollTo(view.natBack || 0); return true; }
  if (current === 'national' && view.natRubric) { view.natRubric = null; render(); gzScrollTo(view.natRubricBack || 0); return true; }
  if (current === 'local' && view.locArticle) { view.locArticle = null; render(); fbScrollTo(view.locBack || 0); return true; }
  if (current === 'local' && (view.fbTab || view.blogCat || view.blogMonth || view.blogQ)) { view.fbTab = null; fbResetFilters(); render(); fbScrollTo(0); return true; }
  if (current === 'mail' && (view.smInfluence || view.smDossier)) { Object.assign(view, { smInfluence: false, smDossier: false, smReading: false }); render(); return true; }
  if (current === 'stats' && view.skOpen != null) { view.skOpen = null; render(); return true; }
  if (current === 'huddle' && view.hdDrawer) { view.hdDrawer = false; render(); return true; }
  return false;
}

// Réglages ouverts à une rubrique (#rg-save, #rg-ai…).
function openSettings(section) {
  view.rgTab = RG_SECTION_TAB[section] || view.rgTab; // l'onglet qui contient la section
  go('settings');
  setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 50);
}

function empty(title, text) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
}
// Accueil de la mod tant qu'aucune synchro n'a eu lieu : la une de la toute première édition.
function welcomeHtml(inline = false) {
  return `<div class="k-welcome"><div class="k-welcome-in">
    <p class="k-eyebrow">${tr('Première édition · bientôt en kiosque')}</p>
    <h1>${tr('Ta carrière va faire <em>la une</em>.')}</h1>
    <div class="k-rule"></div>
    <p class="k-lede">${tr('LifeLegend lit ta sauvegarde Become a Legend et en tire un monde : la presse, les supporters, le réseau social, tes mails et tes statistiques réagissent à chaque match.')}</p>
    <ol class="k-steps">
      <li><b>${tr('Ta sauvegarde')}</b><span>${tr('Le fichier BL de ta carrière, dans Documents\\SPGAME\\Football Life\\2027\\save.')}</span></li>
      <li><b>${tr('Ta clé d’IA')}</b><span>${tr('Google AI Studio, Groq, Anthropic ou un service compatible.')}</span></li>
      <li><b>${tr('Synchroniser')}</b><span>${tr('Le bouton doré en haut à droite, après chaque match.')}</span></li>
    </ol>
    <p class="k-note">${tr(REAL_PEOPLE_NOTE)}</p>
    ${inline ? '' : `<button class="k-btn" data-kgo="settings">${tr('Ouvrir les réglages')}</button>`}
  </div></div>`;
}
// Avertissement : les vrais joueurs, entraîneurs et clubs du jeu apparaissent, mais leurs propos sont inventés.
const REAL_PEOPLE_NOTE = 'LifeLegend est une fiction. Les joueurs, entraîneurs et clubs réels viennent de ton jeu, mais tout ce qu’on leur fait dire ou faire ici (citations, posts, réactions, mails) est écrit par l’IA : ce ne sont pas leurs propos. Ne présente jamais ces textes comme vrais et ne les leur attribue pas hors de LifeLegend. LifeLegend n’a aucun lien avec Konami, les clubs, les compétitions ni les joueurs.';
const needSync = () => welcomeHtml();

// ---------- Première ouverture : la fenêtre de configuration ----------
// Sauvegarde déjà faite, clé d'IA, puis la biographie du joueur, qui nourrit sa première édition. La sauvegarde n'est
// enregistrée qu'à la publication : la synchro automatique ne peut pas partir avant. Une nouvelle carrière choisie plus
// tard repasse par l'étape de la biographie.
const setupActive = () => !state || Boolean(view.setup?.newCareer);
const SETUP_STEPS = ['Ta sauvegarde', 'Ta clé d’IA', 'Sa biographie'];
const BIO_MAX = 3000;

function openBioStep(info) {
  view.setup = { step: 3, newCareer: true, savePath: settings.savePath, info, ...(settings.pendingBio?.savePath === settings.savePath ? { bio: settings.pendingBio.text, kind: settings.pendingBio.kind || null } : { bio: '', kind: null }) };
  if (current === 'settings') current = 'national';
  render();
  viewScrollTo(0);
}

function setupBack() {
  const su = view.setup;
  if (!su || su.busy) return false;
  if (su.newCareer) { view.setup = null; render(); return true; }
  if (su.step <= 1) return false;
  su.step -= 1;
  render();
  return true;
}

// Sauvegarde verrouillée : ce qu'il manque et quoi faire, à la première ouverture comme dans les réglages.
const FL27_KEY_PAGE = 'https://www.pessmokepatch.com/p/customizations-and-mods.html';
const keyHelpHtml = (id) => `<div class="keyhelp"><h4>${tr('Il te manque la clé de Football Life 2027')}</h4>
  <p>${tr('Ce jeu chiffre ses sauvegardes avec sa propre clé : un fichier de 64 octets, que LifeLegend ne fournit pas. Tu la trouves sur le site de PES Smoke Patch, rubrique {section}, lien {link}. Télécharge-la, puis ajoute-la ici. Elle reste sur ce PC et n’est envoyée nulle part.', { section: quote('Edit File Encryption'), link: quote('Download FL27 Encryption Key') })}</p>
  <div class="keyhelp-actions"><a class="btn" href="${FL27_KEY_PAGE}" target="_blank" rel="noopener">${tr('Ouvrir la page de la clé')}</a><button class="btn primary" id="${id}">${tr('Ajouter ma clé…')}</button></div></div>`;
const savePlace = (file) => `…\\${String(file).split(/[\\/]/).slice(-4).join('\\')}`;
const lockedSaveHtml = (s) => `<div><b>${tr('Sauvegarde verrouillée')}</b><br><span class="fineprint">${esc(savePlace(s.path))}</span></div>`;
// Après l'ajout d'une clé, une fois la liste relue : ouvre-t-elle la sauvegarde ?
const keyResult = (r, saves) => {
  if (saves.some((x) => x.locked)) toast(tr('Cette clé n’ouvre pas ta sauvegarde. Vérifie que c’est celle de ta version de Football Life.'), true);
  else toast(r.added ? tr('Clé ajoutée : les sauvegardes qu’elle ouvre apparaissent dans la liste.') : tr('Cette clé était déjà ajoutée.'));
};

function setupSaveHtml(su) {
  const row = (s, i) => `<label class="save-option"><input type="radio" name="su-save" value="${i}"${s.path === su.savePath ? ' checked' : ''}${s.error ? ' disabled' : ''}>
    ${s.locked ? lockedSaveHtml(s) : `<div>${s.error ? '' : `<b>${esc(s.player)}</b> · ${esc(s.club || '')} ${s.league ? `(${esc(s.league)})` : ''}<br>`}
    <span class="fineprint">${esc(s.game || (s.error && tr(s.error)) || '')}${s.date ? ` · ${esc(fmtDate(s.date, { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}</span></div>`}</label>`;
  const locked = su.saves?.some((s) => s.locked);
  const list = !su.saves ? `<p class="fineprint">${tr('Recherche des sauvegardes…')}</p>`
    : su.saves.length ? su.saves.map(row).join('') : `<p class="fineprint">${tr('Aucune sauvegarde pour l’instant. Crée ton joueur dans le jeu, sauvegarde ta carrière, puis clique sur {button}.', { button: quote(tr('Rechercher à nouveau')) })}</p>`;
  return `<section class="card"><h3>${tr('Ta sauvegarde')}</h3>
      <p class="su-text">${tr('Dans le jeu, lance Vers une Légende et crée ton joueur ({mode}), puis sauvegarde ta carrière depuis son menu. LifeLegend part de cette sauvegarde : ta biographie et ta première édition s’appuient dessus.', { mode: quote(tr('Joueur original')) })}</p>
      <div class="saves">${list}</div>
      ${locked ? keyHelpHtml('su-key') : ''}
      <div class="su-tools"><button class="btn" id="su-rescan">${tr('Rechercher à nouveau')}</button><button class="btn" id="su-browse">${tr('Choisir un autre fichier…')}</button>${locked ? '' : `<button class="btn" id="su-key">${tr('Ajouter une clé de sauvegarde…')}</button>`}</div>
      ${locked ? '' : `<p class="fineprint">${tr('Football Life 2027 chiffre ses sauvegardes avec sa propre clé, que LifeLegend ne fournit pas. Si tu l’as (un fichier de 64 octets), ajoute-la ici : elle reste sur ce PC.')}</p>`}
    </section>
    <div class="su-nav"><span></span><button class="btn primary big" id="su-next"${su.savePath ? '' : ' disabled'}>${tr('Suivant')}</button></div>`;
}

function setupAiHtml(su) {
  su.provider ||= settings.provider;
  const p = providers[su.provider] || {};
  const saved = settings.savedKeys.includes(su.provider);
  return `<section class="card"><h3>${tr('L’IA qui écrit ton monde')}</h3>
      <label>${tr('Fournisseur')}<select id="su-provider">${Object.entries(providers).map(([id, x]) => `<option value="${id}"${id === su.provider ? ' selected' : ''}>${esc(tr(x.label))}</option>`).join('')}</select></label>
      ${su.provider === 'custom' ? `<label>${tr('Adresse (Base URL)')}<input id="su-baseurl" value="${esc(settings.baseUrl || '')}" placeholder="https://…/v1"></label>` : ''}
      <label>${tr('Clé API')}<input id="su-apikey" type="password" autocomplete="off" placeholder="${saved ? tr('Clé enregistrée — colle une nouvelle clé pour la remplacer') : esc(p.keyHint || tr('Colle ta clé ici'))}"></label>
      <p class="fineprint">${tr('La clé est chiffrée avec ton compte Windows et n’est envoyée qu’au fournisseur choisi. Clés gratuites : Google AI Studio (aistudio.google.com) ou Groq (console.groq.com).')}</p>
    </section>
    <div class="su-nav"><button class="btn big" id="su-back">${tr('Retour')}</button><button class="btn primary big" id="su-next"${saved || su.provider === 'custom' ? '' : ' disabled'}>${tr('Suivant')}</button></div>`;
}

// Joueur créé ou réel : deux cases qui s'excluent, facultatives.
const kindOptions = (group, value, disabled = false) => [['created', tr('Un joueur que j’ai créé'), tr('Créé dans le jeu avec {mode} : tu écris son histoire.', { mode: quote(tr('Joueur original')) })], ['real', tr('Un joueur réel'), tr('Un joueur qui existe vraiment : pas de biographie, ce monde s’en tient à ta sauvegarde.')]].map(([v, label, sub]) => `<label class="save-option"><input type="radio" name="${group}" value="${v}"${v === value ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    <div><b>${label}</b><br><span class="fineprint">${sub}</span></div></label>`).join('');

function setupBioHtml(su) {
  const name = su.info?.player;
  const written = su.kind !== 'real';
  const title = written && name ? esc(tr('{name} : sa biographie', { name })) : name ? esc(name) : tr('Sa biographie');
  return `<section class="card"><h3>${title}</h3>
      ${su.info?.club ? `<p class="fineprint su-club">${esc(su.info.club)}</p>` : ''}
      <p class="su-ask">${tr('Qui incarnes-tu ?')}</p>
      <div class="saves su-kind">${kindOptions('su-kind', su.kind, su.busy)}</div>
      ${written ? `<p class="su-text">${tr('Raconte son histoire : d’où il vient, où il a grandi, ses premiers clubs, sa famille, son caractère, ce dont il rêve. Dans ce monde, tout cela sera vrai : la presse le présentera ainsi dès la première édition, et Panthéon en fera le premier chapitre de sa page.')}</p>
      <textarea id="su-bio" rows="11" maxlength="${BIO_MAX}" placeholder="${tr('Il est né à… Il a grandi dans… Il a commencé le football à…')}"${su.busy ? ' disabled' : ''}>${esc(su.bio)}</textarea>
      <p class="su-count" id="su-count">${su.bio.length} / ${BIO_MAX}</p>
      <p class="fineprint">${tr('Si elle contredit la sauvegarde (âge, club, sélection), c’est la sauvegarde qui l’emporte. Tu pourras l’écrire ou la modifier plus tard dans les réglages.')}</p>` : ''}
    </section>
    <div class="su-nav"><button class="btn big" id="su-back"${su.busy ? ' disabled' : ''}>${su.newCareer ? tr('Annuler') : tr('Retour')}</button><button class="btn primary big" id="su-publish"${su.busy ? ' disabled' : ''}>${su.busy ? tr('Première édition en préparation…') : tr('Publier la première édition')}</button></div>`;
}

async function setupScan() {
  const su = view.setup;
  let saves = [];
  try { saves = await live.detectSaves(); } catch (err) { toast(err.message, true); }
  su.saves = [...saves].sort((a, b) => (b.modified || 0) - (a.modified || 0));
  const good = su.saves.filter((s) => !s.error);
  su.info = good.find((s) => s.path === su.savePath) || good[0] || null;
  su.savePath = su.info?.path || null;
  if (su.keyAdded) { keyResult(su.keyAdded, su.saves); su.keyAdded = null; }
  if (view.setup === su && su.step === 1 && current !== 'settings') render();
}

async function setupPublish() {
  const su = view.setup;
  const text = su.kind === 'real' ? '' : su.bio.trim();
  su.busy = true;
  render();
  try {
    settings = await live.saveSettings({ savePath: su.savePath, pendingBio: { savePath: su.savePath, text, kind: su.kind } });
    if (await doSync({ bioAsked: true })) {
      view.setup = null;
      render();
      viewScrollTo(0);
      return;
    }
  } catch (err) { toast(err.message, true); }
  su.busy = false;
  render();
}

function renderSetup(page) {
  const su = (view.setup ||= { step: 1, savePath: settings.savePath || null, info: null, saves: null, bio: settings.pendingBio?.text || '', kind: settings.pendingBio?.kind || null });
  const steps = su.newCareer ? '' : `<ol class="su-steps">${SETUP_STEPS.map((l, i) => `<li class="${i + 1 === su.step ? 'on' : i + 1 < su.step ? 'done' : ''}"><b>${i + 1}</b><span>${tr(l)}</span></li>`).join('')}</ol>`;
  const hero = su.step === 1 ? `<p class="k-eyebrow">${tr('Première édition · bientôt en kiosque')}</p>
      <h1>${tr('Ta carrière va faire <em>la une</em>.')}</h1><div class="k-rule"></div>
      <p class="k-lede">${tr('LifeLegend lit ta sauvegarde Become a Legend et en tire un monde : la presse, les supporters, le réseau social, tes mails et tes statistiques réagissent à chaque match.')}</p>
      <label class="su-lang">${tr('Langue de LifeLegend')}<select id="su-lang">${LANGS.map(([v, l]) => `<option value="${v}"${v === lang() ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
    : su.newCareer ? `<p class="k-eyebrow">${tr('Nouvelle carrière')}</p>` : '';
  const body = su.step === 1 ? setupSaveHtml(su) : su.step === 2 ? setupAiHtml(su) : setupBioHtml(su);
  page.innerHTML = `<div class="k-welcome su"><div class="k-welcome-in settings">${hero}${steps}${body}
    ${su.step === 1 ? `<p class="k-note su-note">${tr(REAL_PEOPLE_NOTE)}</p>` : ''}</div></div>`;
  if ($('#su-back')) $('#su-back').onclick = setupBack;
  if (su.step === 1) {
    if (!su.saves) setupScan();
    $('#su-lang').onchange = async (ev) => {
      settings = await live.saveSettings({ language: ev.target.value });
      localizeChrome();
      render();
    };
    page.querySelectorAll('input[name=su-save]').forEach((r) => {
      r.onchange = () => { su.info = su.saves[Number(r.value)]; su.savePath = su.info.path; $('#su-next').disabled = false; };
    });
    $('#su-rescan').onclick = () => { su.saves = null; render(); };
    $('#su-browse').onclick = async () => {
      try {
        const r = await live.browseSave();
        if (r) { su.saves = [r, ...(su.saves || []).filter((s) => s.path !== r.path)]; su.info = r; su.savePath = r.path; render(); }
      } catch (err) { toast(err.message, true); }
    };
    $('#su-key').onclick = async () => {
      try {
        const r = await live.addSaveKey();
        if (!r) return;
        su.keyAdded = r;
        su.saves = null;
        render();
      } catch (err) { toast(err.message, true); }
    };
    $('#su-next').onclick = () => { su.step = 2; render(); viewScrollTo(0); };
  } else if (su.step === 2) {
    $('#su-provider').onchange = (ev) => { su.provider = ev.target.value; render(); };
    const key = $('#su-apikey');
    const saved = settings.savedKeys.includes(su.provider) || su.provider === 'custom';
    key.oninput = () => { $('#su-next').disabled = !saved && !key.value.trim(); };
    $('#su-next').onclick = async () => {
      const p = providers[su.provider] || {};
      const update = { provider: su.provider, model: su.provider === settings.provider ? settings.model : p.models?.[0] || '', ...($('#su-baseurl') ? { baseUrl: $('#su-baseurl').value.trim() } : {}), ...(key.value.trim() ? { apiKey: key.value.trim() } : {}) };
      try {
        settings = await live.saveSettings(update);
        su.step = 3;
        render();
        viewScrollTo(0);
        $('#su-bio')?.focus();
      } catch (err) { toast(err.message, true); }
    };
  } else {
    page.querySelectorAll('input[name=su-kind]').forEach((r) => {
      r.onchange = () => { su.kind = r.value; render(); $('#su-bio')?.focus(); };
    });
    const ta = $('#su-bio');
    if (ta) ta.oninput = () => { su.bio = ta.value; $('#su-count').textContent = `${ta.value.length} / ${BIO_MAX}`; };
    $('#su-publish').onclick = setupPublish;
  }
}

// Boîte de confirmation de la mod, à la place de confirm() (qui ouvrirait une fenêtre système). Échap ou un clic à
// côté annulent ; le bouton « Annuler » a le focus, pour ne rien valider par mégarde.
function kConfirm({ title, body, ok = tr('Confirmer'), cancel = tr('Annuler') }) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'k-modal-back';
    box.innerHTML = `<div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="k-modal-title">
      <p class="k-eyebrow">${tr('Confirmation')}</p><h2 id="k-modal-title">${esc(title)}</h2>
      ${String(body || '').split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="k-modal-actions"><button class="k-btn k-btn-ghost" data-no>${esc(cancel)}</button><button class="k-btn" data-yes>${esc(ok)}</button></div></div>`;
    document.body.appendChild(box);
    const done = (v) => { box.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(false); } };
    document.addEventListener('keydown', onKey, true);
    box.querySelector('[data-no]').onclick = () => done(false);
    box.querySelector('[data-yes]').onclick = () => done(true);
    box.onclick = (ev) => { if (ev.target === box) done(false); };
    box.querySelector('[data-no]').focus();
  });
}

// Bouton de synchro : libellé, et icône qui tourne pendant la synchro.
function setSyncBusy(busy) {
  const btn = $('#sync-btn');
  btn.disabled = busy;
  btn.classList.toggle('busy', busy);
  $('#sync-label').textContent = busy ? tr('Synchro…') : tr('Synchroniser');
}

// ---------- rendu ----------

// ----- Le mouvement. Une page qui change entre à l'écran, bloc après bloc ; ce qui est plus bas apparaît quand on y arrive.
// Un simple redessin (une synchro, un clic dans la même page) ne rejoue rien. Rien de tout ça si Windows demande moins d'animations.
const LL_BLOCKS = ['.gz-lead-main', '.gz-lead-item', '.gz-authors', '.gz-feature-art', '.gz-feature-text', '.gz-card', '.gz-sc', '.gz-mc-card', '.gz-post', '.gz-sb', '.fb-side > *', '.fb-hero', '.fb-card', '.fb-m', '.fb-widget', '.fb-wall-row', '.fb-wall-card', '.fb-content', '.fb-author', '.fb-reactions', '.fb-postnav', '.fb-full',
  '.tw-form', '.tw-li', '.tw-detail', '.tw-profile', '.tw-explore', '.tw-aside-in > *', '.sm-band', '.sm-item', '.sm-bar', '.sm-thread > *', '.dc-side', '.dc-head', '.dc-sec', '.ds-foot', '.ib > *', '.hd-row', '.hd-msgs > *', '.sc-head', '.sc-card', '.sc .card', '.pt-id', '.pt-visual', '.pt-about', '.pt-card', '.rg .card'].join(', ');
const LL_COUNTS = '.sc-hero-strip b, .ib-score-top b';
const llPageKey = () => [current, setupActive(), view.skSec, view.skOpen, view.scPlayerTab, view.skTab, view.skCompTab, view.skComp, view.skTeam, view.skTeamTab, current === 'stats' && Boolean(skCache.data),
  view.mailFolder, view.smDossier, view.smInfluence, view.natArticle?.edition, view.natArticle?.i, view.natAll, view.natAll && view.natOldest, view.locArticle?.edition, view.locArticle?.i, view.fbTab, view.blogCat, view.blogMonth, view.blogOld, view.press, view.twFilter, view.twPost, view.twAuthor, view.twFollowing, view.twDm, view.twQuery, view.hdGroup].map((x) => (x === false || x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : x)).join('|');
let llKey = null, llSite = null, llThread = null, llWatch = null, llAt = -1e9, llFrame = false, llReader = false;
function llCount(el) {
  const shown = el.textContent.trim(), m = /^(\d+)(?:([.,])(\d+))?$/.exec(shown);
  if (!m) return;
  const to = parseFloat(shown.replace(',', '.')), dec = m[3]?.length || 0, t0 = performance.now();
  const write = (v) => { el.textContent = v.toFixed(dec).replace('.', m[2] || '.'); };
  const step = (t) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (t - t0) / 800);
    if (p >= 1) { el.textContent = shown; return; }
    write(to * (1 - (1 - p) ** 3));
    requestAnimationFrame(step);
  };
  write(0);
  requestAnimationFrame(step);
}
function llEnter(page) {
  const key = llPageKey(), thread = current === 'mail' ? view.thread : null;
  const samePage = key === llKey, sameThread = thread === llThread, now = performance.now();
  // Juste après l'entrée, un redessin (les couleurs du club qui arrivent, un message marqué lu) refait la page : l'entrée continue dessus.
  const again = samePage && sameThread && now - llAt < 260;
  if (samePage && sameThread && !again) return;
  if (!again) { llAt = now; llFrame = current !== llSite; llReader = samePage; }
  llKey = key; llThread = thread; llSite = current;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Un autre message dans Mails : seule la lecture change, la liste ne bouge pas.
  const scope = llReader ? page.querySelector('.sm-content') || page : page;
  if (llFrame) page.querySelectorAll('.hd, .sc-app, .sm, .site-tribune > .tw, .site-national > .gz, .site-local > .fb').forEach((f) => f.classList.add('ll-frame'));
  llWatch?.disconnect();
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      watch.unobserve(e.target);
      e.target.classList.remove('ll-wait');
      e.target.classList.add('ll-in');
    }
  });
  llWatch = watch;
  const vh = innerHeight;
  let shown = 0, waiting = 0;
  for (const el of scope.querySelectorAll(LL_BLOCKS)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.top < vh) { if (shown < 18 && r.bottom > 0) { el.style.setProperty('--i', shown++); el.classList.add('ll-in'); } } else if (waiting < 60) { waiting++; el.classList.add('ll-wait'); watch.observe(el); }
  }
  scope.querySelectorAll(LL_COUNTS).forEach(llCount);
}

// Le cadre de LifeLegend : le rail des sites et son encoche, l'onglet du site ouvert, les outils et le profil.
const SITE_ICON = { national: 'newspaper', local: 'pencil', tribune: 'hashtag', mail: 'envelope', huddle: 'chat', stats: 'poll', pantheon: 'trophy' };
// La page défile dans la feuille du cadre, plus dans la fenêtre.
const llView = () => document.getElementById('ll-view');
const viewScrollTo = (top, smooth = false) => llView()?.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
let tabY = null, tabWasOff = true, shellMenu = false;
function placeTabLine(tabs, animate) {
  const on = tabs.querySelector('.tab.active'), line = tabs.querySelector('.tab-line');
  if (!line) return;
  line.classList.toggle('go', animate);
  // Les Réglages n'ont pas de place dans le rail : l'encoche s'efface.
  line.classList.toggle('off', !on);
  if (on) { tabY = on.offsetTop + on.offsetHeight / 2 - line.offsetHeight / 2; line.style.transform = `translateY(${tabY}px)`; } else if (tabY !== null) line.style.transform = `translateY(${tabY}px)`;
}
function paintTabs(tabs) {
  const line = document.createElement('i');
  line.className = 'tab-line';
  tabs.prepend(line);
  // L'encoche repart d'où elle était : le rail vient d'être redessiné.
  const wasOff = tabWasOff, before = tabY;
  if (before !== null) line.style.transform = `translateY(${before}px)`;
  if (wasOff) line.classList.add('off');
  line.getBoundingClientRect();
  const on = tabs.querySelector('.tab.active');
  const y = on ? on.offsetTop + on.offsetHeight / 2 - line.offsetHeight / 2 : before;
  placeTabLine(tabs, before !== null && !wasOff && y !== before);
  tabWasOff = !on;
}
// Aller à une rubrique : ouvre le site, puis passe par le lien de la page, pour faire exactement ce qu'il fait.
function shellGo(site, sel) {
  shellMenu = false;
  if (current !== site) go(site); else if (!sel) render();
  if (sel) document.querySelector(`#page ${sel}`)?.click();
  paintShell();
}
function paintShell() {
  const s = state?.snapshot;
  // Pas de logo : l'écusson de son club, sinon les initiales de LifeLegend.
  const crest = s ? teamEmblem(s.club.name) : null;
  const disc = $('#ll-home');
  const discKey = crest || 'LL';
  if (disc.dataset.k !== discKey) { disc.dataset.k = discKey; disc.innerHTML = crest ? `<img class="crest" src="${esc(crest)}" alt="">` : 'LL'; }
  disc.title = 'LifeLegend';
  disc.setAttribute('aria-label', 'LifeLegend');
  $('#ll-title').innerHTML = `<span>${esc(SITES.find((x) => x.id === current)?.label() || '')}</span>`;
  $('#settings-btn').classList.toggle('on', current === 'settings');
  const bell = $('#ll-bell');
  bell.title = tr('Notifications');
  bell.setAttribute('aria-label', tr('Notifications'));
  bell.innerHTML = `${hi('bell')}${current !== 'tribune' && state && heldPosts().length ? '<i></i>' : ''}`;
  bell.disabled = !s;
  bell.onclick = () => shellGo('tribune', '[data-twnav="mentions"]');
  const me = s ? state.profile?.displayName || s.player.name : '';
  const initials = me ? fbInitials(me) : hi('user');
  const items = [[tr('Ton profil'), 'tribune', '[data-twnav="mine"]'], [tr('Dossier de carrière'), 'mail', '[data-smdossier]'], [tr('Influence'), 'mail', '[data-sminfluence]'], ['Panthéon', 'pantheon', null], [tr('Réglages'), 'settings', null]];
  const box2 = $('#ll-me');
  box2.innerHTML = `<button class="ll-me-btn" id="ll-me-btn" aria-haspopup="true" aria-expanded="${shellMenu}"${s ? '' : ' disabled'}>${me ? `<span class="ll-me-name">${esc(me)}</span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 9.5h12L12 16z"/></svg>` : ''}<span class="ll-me-face">${s ? myFaceIn(initials) : initials}</span></button>
    ${shellMenu && s ? `<div class="ll-menu" role="menu"><small>LifeLegend</small>${items.map(([label], k) => `<button role="menuitem" data-llmenu="${k}">${esc(label)}</button>`).join('')}</div>` : ''}`;
  box2.querySelector('#ll-me-btn').onclick = (ev) => { ev.stopPropagation(); shellMenu = !shellMenu; paintShell(); };
  box2.querySelectorAll('[data-llmenu]').forEach((b) => { b.onclick = () => { const [, site, sel] = items[Number(b.dataset.llmenu)]; shellGo(site, sel); }; });
}
document.fonts?.ready.then(() => dispatchEvent(new Event('resize')));
addEventListener('resize', () => { const tabs = document.getElementById('tabs'); if (tabs?.querySelector('.tab-line')) placeTabLine(tabs, false); });
addEventListener('click', () => { if (shellMenu) { shellMenu = false; paintShell(); } });
addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && shellMenu) { shellMenu = false; paintShell(); ev.stopPropagation(); ev.preventDefault(); } }, true);

function render() {
  if (pressBox && (current !== 'national' || !pressNow())) closePressModal();
  if (infBox && (current !== 'mail' || !view.smInfluence)) closeInfModal();
  trackNewPosts();
  facesFollowCareer();
  const tabs = $('#tabs');
  const unread = state?.mail?.filter((m) => m.unread).length || 0;
  tabs.innerHTML = SITES.filter((s) => !s.hidden).map((s) => `
    <button class="tab${s.id === current ? ' active' : ''}" data-site="${s.id}" aria-label="${esc(s.label())}"${s.id === current ? ' aria-current="page"' : ''}>
      ${hi(SITE_ICON[s.id])}<span class="tab-label">${esc(s.label())}</span>${s.id === 'mail' && unread ? `<span class="count">${unread}</span>` : ''}${s.id === 'huddle' && hdUnread() ? `<span class="count">${hdUnread()}</span>` : ''}${s.id === 'tribune' && current !== 'tribune' && heldPosts().length ? `<span class="tab-dot" title="${tr('Nouveaux posts sur Kop')}"></span>` : ''}
    </button>`).join('');
  tabs.querySelectorAll('.tab').forEach((b) => { b.onclick = () => go(b.dataset.site); });
  paintTabs(tabs);
  const page = $('#page');
  page.className = `site site-${current}`;
  if (setupActive() && current !== 'settings') { renderSetup(page); paintShell(); return; }
  const renderers = { national: renderNational, local: renderLocal, tribune: renderTribune, mail: renderMail, huddle: renderHuddle, stats: renderStats, pantheon: renderPantheon, settings: renderSettings };
  renderers[current](page);
  llEnter(page);
  paintShell();
}

function editionPicker(editions) {
  const idx = view.edition ?? editions.length - 1;
  return `<select class="edition-pick" id="edition-pick">${editions.map((e, i) =>
    `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(fmtDate(e.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }))}${i === editions.length - 1 ? ` (${tr('dernière')})` : ''}</option>`).reverse().join('')}</select>`;
}

function bindEditionPicker() {
  const sel = $('#edition-pick');
  if (sel) sel.onchange = () => { view.edition = Number(sel.value); render(); };
}

// Bandeau de relecture : ce que le secrétariat de rédaction a corrigé dans cette édition.
function factcheckHtml(e, { compact = false } = {}) {
  const fc = e.factcheck;
  if (!fc) return '';
  if (!fc.checked) return `<div class="factcheck warn">${tr('Édition publiée sans vérification des faits ({why}).', { why: esc(String(fc.error || tr('erreur')).replace(/\.\s*$/, '')) })}</div>`;
  const n = fc.corrections.length;
  if (!n) return `<div class="factcheck ok">✓ ${tr('Faits vérifiés')}</div>`;
  const summary = compact ? `<summary title="${tr('Corrections faites avant publication')}">✓ ${tr('Faits vérifiés')} (${n})</summary>` : `<summary>✓ ${tr('Faits vérifiés')} · ${trn(n, '{n} correction avant publication', '{n} corrections avant publication')}</summary>`;
  return `<details class="factcheck ok">${summary}<ul>
    ${fc.corrections.map((c) => `<li><b>${esc(c.where)}</b>${colon()} ${quote(esc(c.before))} → ${quote(esc(c.after))}${c.reason ? ` <span class="why">(${esc(c.reason)})</span>` : ''}</li>`).join('')}</ul></details>`;
}

function resultLine(m) {
  const score = m.played ? `${m.score[0]} - ${m.score[1]}` : (m.hour ? hh(m.hour) : '—');
  return `<div class="result"><span class="t home">${esc(m.home)}${crestHtml(m.home, ' crest-s crest-after')}</span><span class="score">${score}</span><span class="t away">${crestHtml(m.away, ' crest-s')}${esc(m.away)}</span></div>`;
}

// La Transversale (journal national). Le modèle « The Gazette » (gratuit, de uiCookies) qui a servi de point de départ reste crédité en pied de page.
const GZ_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const GZ_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

// Écusson d'un club d'après son nom (fiches lues dans le jeu), pour illustrer la une et les résultats.
function teamEmblem(name) {
  const page = Object.values(state.clubPages || {}).find((p) => !p.kind || p.kind === 'national' ? p.name === name : false);
  return emblemUrl(page?.emblem);
}
// Écusson d'un club sur tous les sites (classe crest), avec son initiale quand le jeu n'en a pas.
const crestHtml = (name, cls = '') => { const u = teamEmblem(name); return u ? `<img class="crest${cls}" src="${esc(u)}" alt="">` : `<span class="crest crest-none${cls}">${esc(String(name || '?')[0])}</span>`; };
// Notes en pastilles de couleur, comme sur les sites de statistiques (rouge sous 6, orange, jaune, vert dès 7, bleu dès 9).
const ratingTier = (r) => (r >= 9 ? 'r9' : r >= 8 ? 'r8' : r >= 7 ? 'r7' : r >= 6.5 ? 'r65' : r >= 6 ? 'r6' : 'r5');
const ratingChip = (r, big = false) => (Number.isFinite(r) && r > 0 ? `<span class="rating ${ratingTier(r)}${big ? ' rating-big' : ''}">${fmtNote(r)}</span>` : '—');
// Défile jusqu'à une section de la page.
function scrollToId(id, extra = 12) {
  const t = document.getElementById(id);
  const v = llView();
  if (t && v) v.scrollTo({ top: t.getBoundingClientRect().top - v.getBoundingClientRect().top + v.scrollTop - extra, behavior: 'smooth' });
}
const gzCrest = (name, cls = '') => { const u = teamEmblem(name); return u ? `<img class="gz-crest${cls}" src="${esc(u)}" alt="">` : `<span class="gz-crest gz-crest-none${cls}">${esc(String(name || '?')[0])}</span>`; };
const readTime = (a) => Math.max(1, Math.round(String(a.body || '').split(/\s+/).length / 220));
const gzInitials = (n) => esc(String(n || 'R').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
const gzRole = (author) => {
  const w = state.writers || {};
  const desk = (w.national_desk || []).find((x) => x.name === author);
  return desk?.role ? tr(desk.role) : author && author === w.national_columnist ? tr('Chroniqueur national') : tr('Rédaction de La Transversale');
};
// Genre d'un article de La Transversale (écrit par l'IA depuis la rédaction à plusieurs plumes), avec une majuscule.
const gzKind = (a) => { const k = a?.kind ? tr(a.kind) : ''; return k ? k[0].toUpperCase() + k.slice(1) : ''; };

// Tous les articles nationaux, du plus récent au plus ancien : { edition, i, a, date }. Dans une édition, l'ordre où le journal
// les a écrits : le récit du match d'abord, la conférence de presse ensuite.
function nationalArticles() {
  const out = [];
  (state.editions || []).forEach((e, ei) => e.national.forEach((a, i) => out.push({ edition: ei, i, a, date: e.gameDate })));
  return out.sort((p, q) => String(q.date).localeCompare(String(p.date)) || q.edition - p.edition || p.i - q.i);
}

// Illustration d'un article, sur fond flouté aux couleurs des clubs : ce dont il parle (gzSubject) et rien d'autre.
// x : { a: l'article, date: la date de son édition }.
function gzFrame(x, ratio = '3x2') {
  const v = gzSubject(x.a, x.date);
  const logo = v.logo ? compEmblem(v.logo) : null;
  const urls = (logo ? [logo] : v.teams.map((n) => teamEmblem(n))).filter(Boolean);
  // Deux clubs : chacun sa couleur, d'un côté et de l'autre.
  const bg = urls.length > 1 ? `<img class="gz-frame-bg gz-frame-bg--l" src="${esc(urls[0])}" alt=""><img class="gz-frame-bg gz-frame-bg--r" src="${esc(urls[1])}" alt="">` : urls[0] ? `<img class="gz-frame-bg" src="${esc(urls[0])}" alt="">` : '';
  const crest = (n) => gzCrest(n, ' gz-crest--big');
  const badge = v.badge ? `<span class="gz-frame-badge">${hi(v.badge)}</span>` : '';
  const mid = v.score ? `<b class="gz-frame-mid">${v.score[0]}<i>-</i>${v.score[1]}</b>` : v.formation ? `<b class="gz-frame-mid gz-frame-form">${esc(v.formation)}</b>` : v.vs ? '<span class="gz-frame-mid gz-frame-vs">vs</span>' : v.done ? `<span class="gz-frame-mid gz-frame-vs">${tr('Fin')}</span>` : badge;
  const [one, two] = v.teams;
  let inner;
  if (v.mode === 'person') {
    const fallback = crest(one);
    inner = `<span class="gz-frame-face">${v.isCoach ? coachFaceIn(v.person, fallback) : v.person === state.snapshot.player?.name ? myFaceIn(fallback) : faceIn(v.person, fallback)}</span>${teamEmblem(one) ? `<span class="gz-frame-mark">${gzCrest(one)}</span>` : ''}`;
  } else if (logo) inner = `<span class="gz-frame-plate"><img src="${esc(logo)}" alt=""></span>${mid}`;
  else if (two) inner = `${crest(one)}${mid}${crest(two)}`;
  else inner = `${one ? crest(one) : ''}${mid}`;
  return `<div class="gz-frame gz-frame--${ratio} gz-frame-is-${v.mode}">${bg}<div class="gz-frame-crests${mid ? ' has-mid' : ''}">${inner}</div>${v.caption ? `<span class="gz-frame-cap">${esc(v.caption)}</span>` : ''}</div>`;
}

// Compétitions de La Transversale, lues dans la sauvegarde : seulement celles du club (son championnat, ses coupes,
// l'Europe). Synchro faite avant les compétitions : son championnat.
function transversaleComps(s) {
  if (s.competitions?.length) return s.competitions.filter((x) => x.mine);
  return [{ name: s.league.name || tr('Championnat'), mine: true, main: true, kind: 'league', stage: s.roundResults?.[0] ? roundLabel(s.roundResults[0].round) : null, results: s.roundResults || [], next: s.nextRound || [], table: s.table || [] }];
}
// Mercato de La Transversale : les transferts qui touchent son club ou un club de son championnat.
function gzTransfers(s) {
  const league = new Set((s.table || []).map((r) => r.team));
  return (state.transfers || []).filter((x) => x.involvesMyClub || league.has(x.from) || league.has(x.to));
}
const gzCompLogo = (name, cls = 'gz-comp-logo') => { const u = compEmblem(name); return u ? `<img class="${cls}" src="${esc(u)}" alt="">` : ''; };
const gzDay = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });

// Noms courts des compétitions, comme dans la presse sportive française.
const GZ_SHORT = { 'UEFA Champions League': 'Ligue des champions', 'UEFA Europa League': 'Ligue Europa', 'Ligue 1 Uber Eats': 'Ligue 1', 'Ligue 2 BKT': 'Ligue 2', 'LaLiga Santander': 'LaLiga', 'LaLiga SmartBank': 'LaLiga 2', 'Serie A TIM': 'Serie A', 'Serie BKT': 'Serie B', 'Emirates FA Cup': 'FA Cup', 'CONMEBOL Libertadores': 'Libertadores', 'Conmebol Libertadores': 'Libertadores', 'Coupe du monde FIFA': 'Coupe du monde', 'EFL Championship': 'Championship', 'Liga NOS': 'Liga Portugal', 'UEFA EURO': 'Euro' };
const gzShort = (name) => { const v = GZ_SHORT[name]; return v ? (lang() === 'fr' ? v : window.LL_I18N?.[lang()]?.[v] ?? v) : String(name || ''); };
const gzIsMine = (m, clubRef) => m.homeRef === clubRef || m.awayRef === clubRef;
const gzKick = (m) => `${fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })}${m.hour != null ? ` · ${hh(m.hour)}` : ''}`;

// Couleurs officielles du championnat de son club, qui suivent ses transferts : celles du logo lu dans le jeu, à défaut
// celles de sa charte. [nom, couleur sombre, accent sur fond clair, accent sur fond sombre]. Championnat inconnu : noir et blanc.
const GZ_LEAGUE_COLORS = [
  [/^ligue 2/i, '#000000', '#00854b', '#8ec740'],
  [/^ligue 1/i, '#091c3e', '#091c3e', '#cdfb0a'],
  [/^premier league/i, '#3d195b', '#3d195b', '#00ff85'],
  [/bundesliga/i, '#d10214', '#d10214', '#ffffff'],
  [/^laliga/i, '#16141f', '#ff4b44', '#ff4b44'],
  [/championship/i, '#0e2d6d', '#aa1a27', '#a69038'],
  [/^serie a/i, '#000a5b', '#0954a2', '#008fd7'],
  [/^serie b/i, '#017e41', '#017e41', '#91c220'],
  [/^eredivisie/i, '#003884', '#003884', '#ffffff'],
  [/^liga (portugal|nos)/i, '#00235a', '#e10014', '#e10014'],
  [/^jupiler/i, '#16002b', '#ff1740', '#ff1740'],
  [/russian premier/i, '#000000', '#e63338', '#e63338'],
  [/^super league/i, '#00498f', '#0073bc', '#1494d2'],
  [/s[üu]per lig$/i, '#000000', '#f11e2c', '#f11e2c'],
  [/^scottish prem/i, '#311b77', '#8f1dbf', '#ffffff'],
  [/^superliga/i, '#231815', '#231815', '#ffffff'],
];
function gzTheme(root, s) {
  const [, dark, accent, vivid] = GZ_LEAGUE_COLORS.find(([re]) => re.test(s.league?.name || '')) || [null, '#111113', '#111113', '#ffffff'];
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(vivid.slice(k, k + 2), 16));
  // Les bases : la feuille de style en tire --tv et --tv-accent, éclaircis en thème sombre.
  root.style.setProperty('--tv-base', dark);
  root.style.setProperty('--tv-accent-base', accent);
  root.style.setProperty('--tv-vivid', vivid);
  root.style.setProperty('--tv-on-vivid', 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000' : '#fff');
}

const gzGoals = (ev) => (ev?.scorers || []).filter((x) => x.name).map((x) => `${esc(x.name)}${x.goals > 1 ? ` (${x.goals})` : ''}`).join(', ');

// Carte d'un match : les deux écussons et le score, ou l'heure. « Résumé du match » mène à « Le match » pour le dernier
// de son club ; pour les autres, il déplie sur place les buteurs, l'homme du match et le stade.
function gzScoreCard(match, s, compName) {
  const m = match.events ? match : (s.fixtures || []).find((f) => f.date === match.date && f.home === match.home && f.away === match.away) || match;
  const played = m.played && m.score;
  const side = (team) => `<span class="gz-sc-team">${gzCrest(team, ' gz-crest--md')}<em title="${esc(team)}">${esc(team)}</em></span>`;
  const mid = played ? `<span class="gz-sc-mid"><b>${m.score[0]}<i>:</i>${m.score[1]}</b><small>${tr('Terminé')}</small></span>`
    : `<span class="gz-sc-mid"><b>${m.hour != null ? hh(m.hour) : 'vs'}</b><small>${esc(gzDay(m.date))}</small></span>`;
  const isLast = played && s.last?.date === m.date && s.last?.home === m.home && s.last?.away === m.away;
  const scorers = [[m.home, gzGoals(m.events?.home)], [m.away, gzGoals(m.events?.away)]].filter(([, g]) => g);
  const recap = played && !isLast && (scorers.length || m.motm?.name || m.stadium) ? `<div class="gz-sc-recap">
      ${scorers.map(([team, g]) => `<p><strong>${esc(team)}</strong>${colon()} ${g}</p>`).join('')}
      ${m.motm?.name ? `<p>${tr('Homme du match')}${colon()} <strong>${esc(m.motm.name)}</strong> ${ratingChip(m.motm.rating)}</p>` : ''}
      ${m.stadium ? `<p>${esc(m.stadium)}</p>` : ''}</div>` : '';
  const btn = isLast ? `<a class="gz-sc-btn" data-gzgo="gz-match">${tr('Résumé du match')}</a>` : recap ? `<button class="gz-sc-btn" data-gzrecap aria-expanded="false">${tr('Résumé du match')}</button>` : '';
  return `<div class="gz-sc${gzIsMine(m, s.club.ref) ? ' mine' : ''}"><span class="gz-sc-comp">${esc(compName)}</span><div class="gz-sc-body">${side(m.home)}${mid}${side(m.away)}</div>${recap}${btn}</div>`;
}

const GZ_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
const gzHasMatch = (s) => Boolean((s.last?.played && s.last.score) || s.next);

const GZ_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>';
const GZ_BARS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>';

// En-tête commun à la une et aux articles : le titre du journal, le menu, la recherche, et l'édition du jour (date,
// faits vérifiés, archives) derrière le bouton de menu. Un numéro spécial ou une édition non vérifiée s'annonce sous le menu.
// La Transversale défile dans sa carte. Sa position est gardée : la page se redessine à chaque action.
const gzBox = () => document.querySelector('.site-national > .gz');
function gzScrollTo(top, smooth = false) {
  const box = gzBox();
  if (!box) { view.gzY = 0; viewScrollTo(0); return; }
  box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  view.gzY = smooth ? top : box.scrollTop;
}
// L'onglet de la section à l'écran.
function gzSpy() {
  const box = gzBox();
  if (!box || view.natArticle || view.natAll) return;
  const links = [...box.querySelectorAll('.gz-main-nav a')];
  // Dans une rubrique, c'est elle qui reste allumée : on la montre dans le menu, sans suivre la lecture.
  if (view.natRubric) {
    const cur = links.find((a) => a.dataset.gzrubric === view.natRubric);
    if (cur && !box.dataset.gzRubShown) { box.dataset.gzRubShown = '1'; const row = cur.closest('ul'), cell = cur.closest('li'); if (row.scrollWidth > row.clientWidth) row.scrollLeft = cell.offsetLeft - (row.clientWidth - cell.offsetWidth) / 2; }
    return;
  }
  const line = (box.querySelector('.gz-navbar')?.getBoundingClientRect().bottom || 0) + 60;
  let on = links[0];
  for (const a of links) { const t = a.dataset.gzgo && document.getElementById(a.dataset.gzgo); if (t && t.getBoundingClientRect().top <= line) on = a; }
  if (on.hasAttribute('aria-current')) return;
  links.forEach((a) => { if (a === on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const row = on.closest('ul'), cell = on.closest('li');
  if (row.scrollWidth > row.clientWidth) row.scrollTo({ left: cell.offsetLeft - (row.clientWidth - cell.offsetWidth) / 2, behavior: 'smooth' });
}
function gzHeader(s, e, idx, eds) {
  const inside = view.natArticle || view.natAll || view.natRubric;
  const here = (name) => (!view.natArticle && !view.natAll && view.natRubric === name ? ' aria-current="page"' : '');
  const fc = factcheckHtml(e, { compact: true }).replace('class="factcheck', 'class="gz-fc factcheck');
  const unchecked = e.factcheck && !e.factcheck.checked;
  return `<div class="gz-masthead"><div class="gz-wrap gz-mast-in">
      <div class="gz-mast-l"><button class="gz-icon-btn" data-gzsearch aria-expanded="false" aria-controls="gz-searchbar" title="${tr('Rechercher dans le journal')}">${GZ_SEARCH}</button><i></i>
        <button class="gz-icon-btn" data-gzedition aria-expanded="false" aria-controls="gz-editionbar" title="${tr('Édition et archives')}">${GZ_BARS}</button></div>
      <a class="gz-brand ll-wordmark" data-gzhome>La Transversale</a>
      <div class="gz-mast-r"><a class="gz-icon-btn" data-gzsite="tribune" title="Kop" aria-label="Kop">${hi('logo')}</a><a class="gz-icon-btn" data-gzsite="mail" title="Mails" aria-label="Mails">${hi('envelope')}</a><i></i>
        <a class="gz-icon-btn" data-gzprofile title="${tr('Ton profil')}" aria-label="${tr('Ton profil')}">${hi('user')}</a></div>
    </div></div>
  <header class="gz-navbar">${view.natArticle ? '<div class="gz-progress"></div>' : ''}<div class="gz-wrap gz-nav-inner">
      <nav class="gz-main-nav"><ul>
        <li><a data-gzhome${inside ? '' : ' aria-current="page"'}>${tr('À la une')}</a></li>
        ${gzRubrics().map((name) => `<li><a data-gzrubric="${esc(name)}"${here(name)}>${esc(gzShort(name))}</a></li>`).join('')}
        <li><a data-gzrubric="${GZ_AWARDS}"${here(GZ_AWARDS)}>${tr('Récompenses')}</a></li>
        <li><a data-gzrubric="${GZ_MERCATO}"${here(GZ_MERCATO)}>${tr('Mercato')}</a></li>
        <li><a data-gzgo="gz-scores">${tr('Les scores')}</a></li>
        ${pressNow() ? `<li><a data-gzpress>${tr('Conférence de presse')}</a></li>` : ''}
        <li><a data-gzall>${tr('Tous les articles')}</a></li>
      </ul></nav>
    </div>
    <div class="gz-searchbar" id="gz-searchbar" inert><div><div class="gz-wrap">
      <input type="search" id="gz-search" placeholder="${tr('Rechercher un article, un club, un joueur…')}" autocomplete="off" aria-label="${tr('Rechercher dans La Transversale')}">
      <ul class="gz-search-results" id="gz-search-results"></ul>
    </div></div></div>
    <div class="gz-searchbar" id="gz-editionbar" inert><div><div class="gz-wrap gz-edition">
      <span>${esc(fmtDate(e.gameDate))}</span>
      <span>${tr('Édition nationale · N° {n}', { n: idx + 1 })}${e.round ? ` · ${roundLabel(e.round)}` : ''}</span>
      ${unchecked ? '' : fc}
      ${inside ? `<a data-gzhome>${tr('Retour à la une')}</a>` : `<span>${tr('Archives')} ${editionPicker(eds)}</span>`}
      <a data-gzgo="gz-newsletter">${settings?.transversaleBrief ? tr('Le brief ✓') : tr('Le brief du matin')}</a>
    </div></div></div>
  </header>
  ${e.special === 'season_review' || unchecked ? `<div class="gz-notice"><div class="gz-wrap">${e.special === 'season_review' ? `<b>${esc(tr('Numéro spécial · Bilan de la saison {season}', { season: e.season || '' }))}</b>` : ''}${unchecked ? fc : ''}</div></div>` : ''}`;
}

// Compétition dont parle un article : la première citée dans le titre (nom long ou court), sinon dans le chapeau,
// sinon son championnat.
function gzTopic(a, comps) {
  if (a?.competition) return gzShort(a.competition);
  const at = (t, x) => Math.min(...[x.name, gzShort(x.name)].map((n) => { const k = t.indexOf(n); return k < 0 ? Infinity : k; }));
  for (const t of [a?.headline || '', a?.dek || '']) {
    const best = comps.map((x) => [at(t, x), x]).filter(([k]) => k < Infinity).sort((p, q) => p[0] - q[0])[0];
    if (best) return gzShort(best[1].name);
  }
  return gzShort(state.snapshot.league.name) || 'Football';
}

// Répartition des articles sur la une, jamais deux fois le même : le carrousel avec ceux de l'édition (seulement le
// premier tant qu'il y a peu d'articles, pour nourrir les autres rubriques), puis « Dernières infos » (les plus récents),
// « À la une aussi » et « Recommandé ».
function gzFrontArticles(idx) {
  const e = state.editions[idx];
  const all = nationalArticles().filter((x) => x.edition <= idx);
  const used = new Set();
  const free = () => all.filter((x) => !used.has(`${x.edition}:${x.i}`));
  const grab = (n, test = () => true) => { const out = free().filter(test).slice(0, n); out.forEach((x) => used.add(`${x.edition}:${x.i}`)); return out; };
  const slides = grab(all.length >= 8 ? 4 : 1, e.national.length ? (x) => x.edition === idx : undefined).sort((p, q) => p.i - q.i);
  const side = [...slides.slice(1), ...grab(Math.max(0, 4 - slides.length))];
  return { lead: slides[0], side, latest: grab(5), spotlight: grab(4), picks: grab(2) };
}

// Mots qui désignent un club dans un texte (« Dunkerque » pour « USL Dunkerque ») : même règle que clubWords (src/world/competitionDesk.js).
const GZ_GENERIC = /^(fc|ac|as|sc|ogc|rc|sl|sv|fk|sk|cd|sd|us|usl|ea|af|hsc|cf|ud|foot|football|club|stade|sporting|olympique|racing|real|union|athletic|de|du|des|la|le|les|el|al|\d+)$/i;
const gzClubWords = (name) => {
  const words = String(name).split(/\s+/).filter((w) => w.length >= 3 && !GZ_GENERIC.test(w));
  return [...words, ...words.flatMap((w) => (w.includes('-') ? w.split('-').filter((x) => x.length >= 5 && x !== 'Saint') : []))];
};
const gzCites = (text, name) => gzClubWords(name).some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text));

// De quoi parle un article. Le plan de l'édition (src/world/world.js) lie chaque genre à un moment : le récit, l'analyse tactique,
// le débat et la conférence de presse reviennent sur le match qui vient de se jouer, le consultant regarde le suivant. Les éditos,
// le tour des terrains et les chiffres parlent des autres : les clubs qu'ils citent, sinon le logo de la compétition.
const GZ_AFTER = new Set(['récit du match', 'analyse tactique', 'débat télévisé', 'conférence de presse']);
const GZ_WIDE = new Set(['édito', 'le tour des terrains', 'les chiffres']);
const GZ_BADGE = { 'conférence de presse': 'mic', 'débat télévisé': 'film' };
// Un article du monde sans match, joueur, club ni logo : le pictogramme de son genre.
const GZ_WORLD_BADGE = { 'les chiffres': 'poll', 'regard de consultant': 'mic', 'débat télévisé': 'film' };
// Les clubs que cite un texte, dans l'ordre. Un mot partagé (« Manchester ») ne désigne que le club dont le nom complet
// est écrit : les noms complets des autres clubs connus sont d'abord retirés du texte.
function gzClubsCited(text, names, known = names) {
  const present = known.filter((n) => text.includes(n));
  return names.map((n) => [fbCitedAt(present.reduce((t, p) => (p === n || n.includes(p) ? t : t.split(p).join(' ')), text), gzClubWords(n)), n])
    .filter(([k]) => k < Infinity).sort((p, q) => p[0] - q[0]).map(([, n]) => n);
}
// Où un titre nomme quelqu'un : son nom complet, sinon son nom de famille (4 lettres au moins). Infinity : pas nommé.
function gzNamedAt(text, name) {
  const full = text.indexOf(name), last = String(name).split(/\s+/).pop().replace(/^.*\./, '');
  return Math.min(full < 0 ? Infinity : full, last.length >= 4 ? fbCitedAt(text, [last]) : Infinity);
}
// L'article parle d'abord de lui (son choix) : son nom vient avant celui de tout autre joueur ou entraîneur du titre.
// Alors son visage, même sur un match.
function gzAboutMe(text, others) {
  const me = state.snapshot?.player?.name;
  if (!me) return false;
  const k = gzNamedAt(text, me);
  return k < Infinity && others.every((n) => !n || n === me || gzNamedAt(text, n) > k);
}
// Les joueurs du monde, lus dans les scores (calculé une fois) : les buteurs et le podium du footballeur de l'année,
// reconnus aussi par leur nom de famille ; tous les effectifs, seulement par leur nom complet (des milliers de noms :
// un nom de famille seul serait trop souvent ambigu).
function gzWorldPeople(d) {
  if (d.people) return d.people;
  const stars = new Map(), everyone = new Map();
  for (const c of d.comps || []) for (const [n, ref] of c.scorers || []) if (n && !stars.has(n)) stars.set(n, ref);
  for (const p of d.poty || []) for (const [n, ref] of p.podium || []) if (n && !stars.has(n)) stars.set(n, ref);
  for (const [ref, t] of Object.entries(d.teams || {})) for (const n of t?.[4] || []) if (n && !everyone.has(n)) everyone.set(n, ref);
  d.people = { stars, everyone };
  return d.people;
}
function gzWorldPersonIn(text, d) {
  const { stars, everyone } = gzWorldPeople(d);
  const name = gzPersonIn(text, [...stars.keys()]) || [...everyone.keys()].find((n) => n.includes(' ') && text.includes(n));
  return name ? { name, team: d.teams?.[stars.get(name) ?? everyone.get(name)]?.[0] || null } : null;
}
// Le joueur que nomme un titre : son nom complet, sinon son nom de famille s'il n'y en a qu'un (et pas trop court : « Ba » est un mot).
function gzPersonIn(text, people) {
  const full = people.find((n) => text.includes(n));
  if (full) return full;
  const surnames = new Map();
  for (const n of new Set(people)) { const last = String(n).split(/\s+/).pop().replace(/^.*\./, ''); if (last.length >= 4) surnames.set(last, surnames.has(last) ? null : n); }
  return [...surnames].filter(([, n]) => n).map(([last, n]) => [fbCitedAt(text, [last]), n]).filter(([k]) => k < Infinity).sort((p, q) => p[0] - q[0])[0]?.[1] || null;
}
function gzSubjectOf(a, date) {
  const s = state.snapshot, club = s.club?.name, league = s.league?.name || '', kind = a.kind || '';
  const head = String(a.headline || ''), top = `${head} ${a.dek || ''}`, body = String(a.body || ''), all = `${top} ${body}`;
  const wide = (a.focus || (GZ_WIDE.has(kind) ? 'competition' : '')) === 'competition';
  // L'article donne-t-il ce score (dans un sens ou dans l'autre) ?
  const said = ([x, y]) => [[x, y], [y, x]].some(([p, q]) => new RegExp(`(^|[^\\d])${p}\\s*(-|–|à)\\s*${q}($|[^\\d])`).test(all));
  // Deux clubs qui viennent de se rencontrer : leur match, lu dans les scores (championnat, coupes, monde), comme pour son
  // club : les écussons dans l'ordre du match et le score (en coupe, seulement si l'article donne le même : une
  // prolongation fausse celui du jeu), sinon « Fin ». Sinon les clubs seuls ; scores pas encore chargés : pending.
  // « Récent » : depuis l'édition précédente (un article de la journée ne parle pas d'un match d'il y a un mois).
  const since = (state.editions || []).map((e) => e.gameDate).filter((g) => g && g < date).sort().at(-1) || null;
  const withMatch = (teams) => {
    const d = teams.length === 2 ? skData() : null, m = d ? gzStoryMatch(d, teams, date, since) : null;
    if (!m) return { mode: 'clubs', teams, pending: d === undefined };
    const score = m.league || said(m.score) ? m.score : null;
    return { mode: 'match', teams: m.teams, score, done: !score, caption: `${gzShort(m.comp)} · ${gzDay(m.date)}` };
  };
  // Les récompenses : le trophée sur le logo de la compétition du lauréat, sinon sur celui de son championnat.
  if (kind === 'les récompenses' || a.focus === 'awards') {
    // Le lauréat que nomme le titre (le footballeur de l'année d'abord, puis les joueurs du mois) : son visage et
    // l'écusson de son club. Scores du monde pas encore chargés : rien n'est retenu (pending), la vignette se refait.
    const d = skData();
    const poty = d?.poty?.[0]?.podium?.[0];
    const potm = (state.paperAwards?.potm || []).at(-1);
    const winners = [
      poty?.[0] && [poty[0], d.teams?.[poty[1]]?.[0], tr('Footballeur de l’année')],
      potm?.overall?.player && [potm.overall.player, potm.overall.team, tr('Joueur du mois')],
      ...(potm?.leagues || []).map((p) => [p.player, p.team, tr('Joueur du mois')]),
    ].filter((w) => w && w[0]);
    const pending = d === undefined;
    // Sans les scores, le footballeur de l'année manque : un autre lauréat cité dans le titre prendrait sa place. Le
    // trophée seul, le temps qu'ils arrivent.
    if (pending) return { mode: 'clubs', teams: [], badge: 'trophy', caption: tr('Récompenses'), pending };
    const who = gzPersonIn(head, winners.map(([n]) => n));
    if (who) { const [, team, caption] = winners.find(([n]) => n === who); return { mode: 'person', person: who, teams: [team].filter(Boolean), caption, pending }; }
    // Un lauréat d'avant (le joueur du mois d'un mois passé) : n'importe quel joueur du monde nommé dans le titre.
    const star = gzWorldPersonIn(head, d);
    if (star) return { mode: 'person', person: star.name, teams: [star.team].filter(Boolean), caption: tr('Récompenses') };
    // Le logo de la compétition que nomme le titre, s'il est connu ; sinon le trophée seul (jamais le logo d'une autre compétition).
    const named = gzRubrics().find((n) => top.includes(n) || top.includes(gzShort(n)));
    return named && compEmblem(named) ? { mode: 'league', teams: [], logo: named, badge: 'trophy', caption: tr('Récompenses'), pending } : { mode: 'clubs', teams: [], badge: 'trophy', caption: tr('Récompenses'), pending };
  }
  // Le football ailleurs : le match de son histoire, sinon le joueur que nomme le titre, sinon ses clubs, sinon le logo de
  // sa compétition, sinon le pictogramme de son genre. Jamais son club à lui : l'article parle du monde.
  if (kind === 'le foot ailleurs' || a.focus === 'world') {
    const known = Object.values(state.clubPages || {}).filter((p) => p.kind !== 'competition').map((p) => p.name);
    const teams = [...new Set([...(a.teams || []), ...gzClubsCited(top, known)])].slice(0, 2);
    // Scores pas encore chargés : rien n'est retenu (pending), la vignette se refait.
    const d = skData(), pending = d === undefined;
    const m = withMatch(teams);
    if (m.mode === 'match') return m;
    // Un joueur du monde dans le titre : son visage et l'écusson de son club, comme le lauréat des récompenses.
    const who = d && gzWorldPersonIn(head, d);
    if (who) return { mode: 'person', person: who.name, teams: [who.team].filter(Boolean), caption: who.name };
    if (teams.length) return { ...m, pending };
    const comp = a.competition || gzRubrics().find((n) => top.includes(n) || top.includes(gzShort(n)));
    // Pas retenu tant que les scores manquent : le joueur du titre, lu dans les scores, passe avant le logo.
    if (comp && compEmblem(comp)) return { mode: 'league', teams: [], logo: comp, caption: gzShort(comp), pending };
    return { mode: 'clubs', teams: [], badge: GZ_WORLD_BADGE[kind] || 'newspaper', caption: comp ? gzShort(comp) : gzKind(a), pending };
  }

  // Les clubs cités, dans l'ordre où le texte les nomme. Son club n'y est ajouté que dans un article sur lui.
  const pool = [...new Set([...(s.table || []).map((r) => r.team), ...(s.fixtures || []).flatMap((f) => [f.home, f.away]), ...(s.competitions || []).flatMap((c) => [...(c.results || []), ...(c.next || [])].flatMap((m) => [m.home, m.away]))].filter(Boolean))];
  const everyClub = [...new Set([...pool, ...Object.values(state.clubPages || {}).filter((p) => p.kind !== 'competition').map((p) => p.name)])];
  const citedIn = (text) => gzClubsCited(text, pool, everyClub);
  const clubs = citedIn(top);
  const ownFirst = (list) => (wide || list.includes(club) ? list : [club, ...list].filter(Boolean)).slice(0, 2);

  // Un article qui parle d'abord de lui : son visage, quel que soit le genre (son choix, avant la règle commune).
  const rivals = s.rosters?.opponent?.players || [];
  if (gzAboutMe(head, [s.coaches?.mine, s.coaches?.nextOpponent, ...(s.squad || []).map((p) => p.name), ...(s.rosters?.mine || []), ...rivals])) return { mode: 'person', person: s.player.name, teams: [club], caption: s.player.name };

  // Une seule règle pour tous les articles : un article sur un match montre le match (même s'il nomme un joueur, comme
  // les histoires du monde) ; les autres montrent la personne que nomme le titre, puis le mercato, les clubs, la compétition.
  // Le match dont parle l'article : celui qui précède l'édition, ou celui qui vient dans les 3 jours. Son adversaire doit être
  // nommé quelque part dans le texte : sinon, ce n'est pas de ce match qu'il s'agit (un article d'un ancien club, par exemple).
  const mine = (s.fixtures || []).filter((f) => f.home === club || f.away === club).sort((p, q) => p.date.localeCompare(q.date));
  const named = (f) => (f && fbCitedAt(all, gzClubWords(f.home === club ? f.away : f.home)) < Infinity ? f : null);
  const days = (f) => Math.round((Date.parse(`${f.date}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 864e5);
  const after = named(mine.filter((f) => f.played && f.date < date).at(-1)) || (kind !== 'conférence de presse' && GZ_AFTER.has(kind) ? named(mine.find((f) => f.played && f.date === date)) : null);
  const next = mine.find((f) => f.date >= date);
  const before = next && days(next) <= 3 ? named(next) : null;
  const match = GZ_AFTER.has(kind) ? after || (kind === 'conférence de presse' ? before : null) : kind === 'regard de consultant' ? before : null;
  if (match) {
    const played = match === after;
    // En coupe, le score de la sauvegarde peut être faux après une prolongation : seulement si l'article donne le même.
    // Un match joué sans score sûr affiche « Fin », comme Mails ; « vs » reste aux matchs à venir.
    const score = played && match.score && (match.competition === league || said(match.score)) ? match.score : null;
    const formation = kind === 'analyse tactique' ? (all.match(/(?<![\d-])\d(?:-\d){2,4}(?![\d-])/g) || []).find((t) => t.split('-').reduce((n, x) => n + Number(x), 0) === 10) : null;
    const badge = GZ_BADGE[kind];
    const bare = !badge && !formation && !score;
    return { mode: badge ? 'press' : 'match', teams: [match.home, match.away], badge, formation: formation || null, score: badge || formation ? null : score, vs: bare && !played, done: bare && played, caption: `${gzShort(match.competition)} · ${gzDay(match.date)}` };
  }

  // Un entraîneur dans le titre : son visage, sauf en conférence de presse, où le micro dit déjà ce qu'est l'article.
  const coach = kind === 'conférence de presse' ? null : gzPersonIn(head, [s.coaches?.mine, s.coaches?.nextOpponent].filter(Boolean));
  if (coach) return { mode: 'person', person: coach, isCoach: true, teams: [coach === s.coaches?.mine ? club : s.rosters?.opponent?.team || club], caption: coach };
  // Un joueur dans le titre, ou son portrait : son visage. Pas en conférence de presse : comme pour l'entraîneur, le
  // micro et les deux clubs, pour toutes les conférences.
  const person = kind === 'conférence de presse' ? null : gzPersonIn(head, [s.player?.name, ...(s.squad || []).map((p) => p.name), ...(s.rosters?.mine || []), ...rivals].filter(Boolean)) || (kind === 'portrait' ? s.player?.name : null);
  if (person) return { mode: 'person', person, teams: [rivals.includes(person) && !(s.squad || []).some((p) => p.name === person) ? s.rosters.opponent.team : club], caption: person };

  if (/mercato|transfert|recrue|recrutement/i.test(wide ? top : head)) {
    return clubs.length || !wide || !compEmblem(league) ? { mode: 'mercato', teams: (clubs.length ? clubs : [club]).slice(0, 1), badge: 'swap', caption: tr('Mercato') } : { mode: 'mercato', teams: [], logo: league, badge: 'swap', caption: tr('Mercato') };
  }
  // Une conférence de presse sans match reconnu : son club et le micro.
  if (kind === 'conférence de presse') return { mode: 'press', teams: ownFirst(clubs), badge: 'mic', caption: tr('Conférence de presse') };

  // Le tour des terrains raconte des résultats : deux clubs cités qui viennent de se rencontrer montrent leur match.
  if (clubs.length) return kind === 'le tour des terrains' ? withMatch(ownFirst(clubs)) : { mode: 'clubs', teams: ownFirst(clubs) };
  // Pas de club dans le titre ni le chapeau : la compétition si c'est d'elle qu'il parle.
  const comp = a.competition || league;
  if ((wide || top.includes(comp) || top.includes(gzShort(comp))) && comp && compEmblem(comp)) return { mode: 'league', teams: [], logo: comp, caption: gzShort(comp) };
  const early = citedIn(body.slice(0, 500));
  if (wide) return { mode: 'clubs', teams: (early.length ? early : gzWideTeams(a)).slice(0, 2) };
  return { mode: 'clubs', teams: early.length ? ownFirst(early) : [club].filter(Boolean) };
}
// Le dernier match joué entre deux clubs avant l'article (depuis l'édition précédente, 45 jours au plus), lu dans les scores.
function gzStoryMatch(d, teams, date, since = null) {
  const want = teams.map((n) => String(n).toLowerCase()), day = (iso) => Date.parse(`${iso}T12:00:00Z`), t = day(date);
  let best = null;
  for (const m of d.matches) {
    // Un match sans date (pas encore programmé) donne NaN : écarté. 45 jours : deux éditions peuvent être espacées d'un
    // mois, et deux clubs ne se rencontrent presque jamais deux fois dans ce délai.
    const ago = (t - day(m[0])) / 864e5;
    if (m[6] === undefined || m[6] === null || !(ago >= 0 && ago <= 45) || (since && m[0] < since)) continue;
    const names = [m[4], m[5]].map((r) => String(d.teams?.[r]?.[0] || '').toLowerCase());
    if (names[0] !== names[1] && names.every((n) => want.includes(n)) && (!best || m[0] > best[0])) best = m;
  }
  if (!best) return null;
  const c = d.comps[best[2]];
  return { teams: [d.teams[best[4]][0], d.teams[best[5]][0]], score: [best[6], best[7]], league: c?.kind === 'league', comp: c?.name || '', date: best[0] };
}
// Calculé une fois par article (et par langue) : une page affiche beaucoup de vignettes.
const gzSubjects = new WeakMap();
function gzSubject(a, date) {
  const known = gzSubjects.get(a);
  if (known?.lang === lang() && known.date === date) return known.v;
  const v = gzSubjectOf(a, date);
  if (!v.pending) gzSubjects.set(a, { lang: lang(), date, v });
  return v;
}
// Article sur la compétition sans club cité dans son titre : les clubs dont elle parle, pas le sien.
function gzWideTeams(a) {
  const s = state.snapshot;
  const cup = (s.competitions || []).find((c) => c.name === a.competition && !c.main);
  const tie = cup && [...cup.results, ...cup.next].find((m) => !gzIsMine(m, s.club.ref));
  return tie ? [tie.home, tie.away] : (s.table || []).filter((r) => !r.mine).slice(0, 2).map((r) => r.team);
}

// ----- Les rubriques (2026-11-09) : La Transversale couvre le football mondial, une rubrique par grande compétition
// (comme L'Équipe ou Marca), celle de son championnat, les récompenses et le mercato. Chaque rubrique a ses articles,
// ses derniers résultats, son classement, ses buteurs et son équipe type, lus dans les scores du monde du jeu (scores.json).
const GZ_RUBRIC_ORDER = [/champions league/i, /europa league/i, /^premier league$/i, /^laliga( santander| ea sports)?$/i, /^serie a( tim)?$/i, /^bundesliga$/i, /^ligue 1( uber eats| mcdonald'?s)?$/i, /libertadores/i, /world cup|coupe du monde/i, /^uefa euro$/i];
const GZ_AWARDS = '*awards', GZ_MERCATO = '*mercato';
const gzRubricRank = (name) => { const k = GZ_RUBRIC_ORDER.findIndex((re) => re.test(String(name || ''))); return k < 0 ? 99 : k; };
// Les grandes compétitions de la sauvegarde (et celles dont le journal a parlé), dans l'ordre du menu, puis son championnat.
function gzRubrics() {
  const d = skData(), league = state.snapshot?.league?.name;
  const names = new Set();
  for (const c of d?.comps || []) if (c.big) names.add(c.name);
  for (const x of nationalArticles()) if (x.a.focus === 'world' && x.a.competition) names.add(x.a.competition);
  const list = [...names].filter((n) => gzRubricRank(n) < 99).sort((a, b) => gzRubricRank(a) - gzRubricRank(b));
  if (league && !list.includes(league)) list.push(league);
  return list;
}
// La rubrique d'un article : sa grande compétition, les récompenses, sinon celle de son championnat (son club, ses coupes).
function gzRubricOf(a) {
  if (a.kind === 'les récompenses' || a.focus === 'awards') return GZ_AWARDS;
  if (a.focus === 'world') {
    if (a.competition && a.kind !== 'le foot ailleurs') return a.competition;
    const top = `${a.headline || ''} ${a.dek || ''}`;
    return gzRubrics().find((n) => top.includes(n) || top.includes(gzShort(n))) || a.competition || null;
  }
  return state.snapshot?.league?.name || null;
}
const gzRubricTitle = (name) => (name === GZ_AWARDS ? tr('Récompenses') : name === GZ_MERCATO ? tr('Mercato') : gzShort(name));

// Un match des scores du monde, dans la forme qu'attend la carte de score (gzScoreCard).
function gzWorldMatch(d, i) {
  const m = d.matches[i], det = d.details?.[i] || {}, played = m.length > 6;
  const side = (k) => ({ scorers: (det.ev || []).filter((e) => e[0] === k && e[2] > 0).map((e) => ({ name: e[1], goals: e[2] })) });
  return { date: m[0], hour: m[1], home: skName(d, m[4]), away: skName(d, m[5]), homeRef: m[4], awayRef: m[5], played, score: played ? [m[6], m[7]] : null,
    events: { home: side(0), away: side(1) }, motm: det.motm ? { name: det.motm[0], rating: det.motm[2] } : null, stadium: d.teams?.[m[4]]?.[2] || null };
}
// Les derniers résultats d'une compétition (sa dernière journée jouée, ou en coupe la dernière semaine), et ce qui vient.
function gzWorldScores(d, ci) {
  const s = state.snapshot, c = d.comps[ci], all = d.byComp.get(ci) || [];
  const played = all.filter((i) => d.matches[i].length > 6), coming = all.filter((i) => d.matches[i].length <= 6);
  const lastI = played.at(-1), nextI = coming[0];
  const sameStage = (ref, list) => (c.kind === 'league' ? list.filter((i) => d.matches[i][3] === d.matches[ref][3])
    : list.filter((i) => Math.abs(Date.parse(d.matches[i][0]) - Date.parse(d.matches[ref][0])) <= 7 * 864e5));
  const past = lastI !== undefined ? sameStage(lastI, played) : [], next = nextI !== undefined ? sameStage(nextI, coming) : [];
  if (!past.length && !next.length) return '';
  const showNext = view.gzRound === 'next' ? next.length > 0 : !past.length;
  const list = (showNext ? next : [...past].reverse()).map((i) => gzWorldMatch(d, i));
  const shown = view.gzScoresAll ? list : list.slice(0, 8);
  const stage = c.kind === 'league' ? roundLabel(d.matches[showNext ? nextI : lastI][3]) : '';
  const seg = past.length && next.length ? `<div class="gz-seg"><button data-gzround="past" aria-pressed="${!showNext}">${tr('Résultats')}</button><button data-gzround="next" aria-pressed="${showNext}">${tr('À venir')}</button></div>` : '';
  const more = list.length > 8 ? `<a class="gz-more" data-gzmore>${view.gzScoresAll ? tr('Voir moins') : tr('Voir plus')} ${GZ_CHEVRON}</a>` : '';
  return `<section class="gz-wrap gz-sec" id="gz-scores"><div class="gz-band">
    <div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Les scores')}</h2><span class="gz-mc-sub">${esc(gzShort(c.name))}${stage ? ` · ${esc(stage)}` : ''}</span></div><div class="gz-sec-tools">${seg}${more}</div></div>
    <div class="gz-sc-grid">${shown.map((m) => gzScoreCard(m, s, gzShort(c.name))).join('')}</div>
  </div></section>`;
}
// Les meilleurs buteurs d'une compétition.
function gzScorers(d, ci, n = 10) {
  const rows = (d.comps[ci].scorers || []).slice(0, n);
  if (!rows.length) return '';
  return `<div class="gz-sec-head"><h2>${tr('Buteurs')}</h2></div>
    <ol class="gz-rank">${rows.map(([name, ref, goals, assists], k) => { const team = skName(d, ref); return `<li><b class="gz-rank-n">${k + 1}</b>${gzCrest(team, ' gz-crest--s')}<span class="gz-rank-name"><strong>${esc(name)}</strong><small>${esc(team)}${assists ? ` · ${esc(trn(assists, '{n} passe D.', '{n} passes D.'))}` : ''}</small></span><span class="gz-rank-val">${goals}</span></li>`; }).join('')}</ol>`;
}
// L'équipe type de la dernière journée d'un championnat, ligne par ligne, et le joueur de la journée.
// Un onze ligne par ligne : [[nom, ref du club, ligne, note]] (la note d'un match, ou la moyenne d'une période).
function gzXiLines(d, xi) {
  const line = (key) => { const ps = xi.filter((p) => p[2] === key); return ps.length ? `<div class="gz-totw-line"><span class="gz-totw-label">${tr(LINE_LABEL[key])}</span><div>${ps.map(([name, ref, , rating]) => `<span class="gz-totw-p${name === state.snapshot.player?.name ? ' me' : ''}" title="${esc(skName(d, ref))}">${gzCrest(skName(d, ref), ' gz-crest--s')}<b>${esc(name)}</b>${ratingChip(rating)}</span>`).join('')}</div></div>` : ''; };
  return `<div class="gz-totw">${['att', 'mid', 'def', 'gk'].map(line).join('')}</div>`;
}
function gzTotw(d, ci, { title = true } = {}) {
  const c = d.comps[ci], t = c?.totw;
  if (!t?.xi?.length) return '';
  return `${title ? `<div class="gz-sec-head"><h2>${tr('Équipe type · {round}', { round: esc(roundLabel(t.round)) })}</h2></div>` : ''}
    ${gzXiLines(d, t.xi)}
    ${t.best ? `<p class="gz-fine">${esc(tr('Joueur de la journée : {name} ({club}) · {rating}', { name: t.best[0], club: skName(d, t.best[1]), rating: sfRating(t.best[2]) }))}</p>` : ''}`;
}
// Le classement d'une compétition des scores du monde, avec son club en surbrillance.
const gzWorldRows = (d, ci) => (d.comps[ci].table || []).map((r, k) => ({ pos: k + 1, team: skName(d, r[0]), ref: r[0], p: r[1], w: r[2], d: r[3], l: r[4], gd: r[5] - r[6], pts: r[7], mine: r[0] === d.clubRef }));
// Ce que la page d'une grande compétition montre sous ses articles : les scores, puis le classement à côté des buteurs et
// de l'équipe type (une coupe : les buteurs seuls).
function gzWorldBlocks(d, ci) {
  const c = d.comps[ci];
  const table = c.table?.length ? gzStandingTable(c.name, gzWorldRows(d, ci)) : '';
  const side = `${gzScorers(d, ci, table ? 10 : 16)}${table ? gzTotw(d, ci) : ''}`;
  // Une coupe n'a pas de classement : ses buteurs sur deux colonnes.
  if (!table) return `${gzWorldScores(d, ci)}${side ? `<section class="gz-wrap gz-sec gz-rank-two">${side}</section>` : ''}`;
  return `${gzWorldScores(d, ci)}<section class="gz-wrap gz-sec${side ? ' gz-split gz-split--wide' : ''}"><div>${table}</div>${side ? `<aside class="gz-rub-side">${side}</aside>` : ''}</section>${gzPowerBlock(d, ci)}`;
}
// Le classement de puissance d'un championnat : la forme du moment, sur les 5 derniers matchs de championnat de chaque
// club (points, puis différence de buts, puis buts marqués, puis place au classement). Rend [{ team, ref, pos (place au
// classement), played, pts (sur 15 au plus), gd, gf, form (du plus ancien au plus récent : 'win'|'draw'|'loss'),
// streak: { kind: 'win'|'unbeaten'|'loss'|'winless', n } | null }], le plus en forme d'abord. Calculé une fois par chargement.
function gzPower(d, ci) {
  d.power ||= new Map();
  if (d.power.has(ci)) return d.power.get(ci);
  const c = d.comps[ci], rows = [];
  (c.table || []).forEach((row, k) => {
    const ref = row[0];
    const ms = (d.byTeam.get(ref) || []).map((i) => d.matches[i]).filter((m) => m[2] === ci && m[6] != null).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!ms.length) return;
    const res = ms.map((m) => { const home = m[4] === ref, gf = home ? m[6] : m[7], ga = home ? m[7] : m[6]; return { gf, ga, r: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw' }; });
    const last = res.slice(-5);
    // La série en cours, lue depuis le dernier match : victoires, défaites, matchs sans défaite ou sans victoire.
    const run = (ok) => { let n = 0; for (let i = res.length - 1; i >= 0 && ok(res[i].r); i--) n++; return n; };
    const wins = run((r) => r === 'win'), losses = run((r) => r === 'loss'), unbeaten = run((r) => r !== 'loss'), winless = run((r) => r !== 'win');
    const streak = wins >= 2 ? { kind: 'win', n: wins } : losses >= 2 ? { kind: 'loss', n: losses } : unbeaten >= 4 ? { kind: 'unbeaten', n: unbeaten } : winless >= 4 ? { kind: 'winless', n: winless } : null;
    rows.push({ team: skName(d, ref), ref, pos: k + 1, played: last.length, pts: last.reduce((n, x) => n + (x.r === 'win' ? 3 : x.r === 'draw' ? 1 : 0), 0),
      gd: last.reduce((n, x) => n + x.gf - x.ga, 0), gf: last.reduce((n, x) => n + x.gf, 0), form: last.map((x) => x.r), streak });
  });
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.pos - b.pos);
  d.power.set(ci, rows);
  return rows;
}
const GZ_FORM = { win: ['Victoire', 'V'], draw: ['Match nul', 'N'], loss: ['Défaite', 'D'] };
const gzFormChips = (form) => `<span class="gz-form gz-pw-form">${form.map((r) => `<b class="gz-form-${r}" title="${tr(GZ_FORM[r][0])}">${formLetter(GZ_FORM[r][1])}</b>`).join('')}</span>`;
const gzStreak = (st) => (!st ? '' : st.kind === 'win' ? trn(st.n, '{n} victoire de suite', '{n} victoires de suite') : st.kind === 'loss' ? trn(st.n, '{n} défaite de suite', '{n} défaites de suite')
  : st.kind === 'unbeaten' ? trn(st.n, '{n} match sans défaite', '{n} matchs sans défaite') : trn(st.n, '{n} match sans victoire', '{n} matchs sans victoire'));
const gzSigned = (n) => (n > 0 ? `+${n}` : String(n));
// Sur la page d'un championnat : les dix clubs les plus en forme (et le sien s'il est plus bas), avec l'écart entre
// leur forme et leur place au classement.
function gzPowerBlock(d, ci) {
  const rows = gzPower(d, ci);
  if (rows.length < 4) return '';
  const club = state.snapshot.club?.name;
  const shown = rows.map((r, k) => ({ ...r, rank: k + 1 })).filter((r) => r.rank <= 10 || r.team === club);
  const move = (r) => { const dlt = r.pos - r.rank; return dlt > 0 ? `<span class="gz-pw-up" title="${esc(tr('Mieux que sa place au classement'))}">▲ ${dlt}</span>` : dlt < 0 ? `<span class="gz-pw-down" title="${esc(tr('Moins bien que sa place au classement'))}">▼ ${-dlt}</span>` : '<span class="gz-pw-same">=</span>'; };
  return `<section class="gz-wrap gz-sec gz-pw"><div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Le classement de puissance')}</h2><span class="gz-mc-sub">${tr('La forme du moment, sur les 5 derniers matchs')}</span></div></div>
    <table class="gz-table gz-pw-table"><thead><tr><th>#</th><th>${tr('Club')}</th><th>${tr('Forme')}</th><th title="${esc(tr('Points sur les 5 derniers matchs'))}">${tr('Pts')}</th><th title="${esc(tr('Différence de buts'))}">${tr('Diff.')}</th><th>${tr('Série en cours')}</th><th title="${esc(tr('Place au classement'))}">${tr('Class.')}</th></tr></thead>
    <tbody>${shown.map((r) => `<tr class="${r.team === club ? 'mine' : ''}"><td><b>${r.rank}</b></td><td><span class="gz-mf-club">${gzCrest(r.team, ' gz-crest--md')}<b>${esc(r.team)}</b></span></td><td>${gzFormChips(r.form)}</td><td><b>${r.pts}</b><small>/${r.played * 3}</small></td><td>${gzSigned(r.gd)}</td><td>${esc(gzStreak(r.streak)) || '—'}</td><td>${esc(ordinal(r.pos))} ${move(r)}</td></tr>`).join('')}</tbody></table></section>`;
}
// À la une : les six clubs les plus en forme des grands championnats (son championnat compris), tous pays confondus.
function gzPowerFront(d) {
  if (!d) return '';
  const mine = state.snapshot.league?.name;
  const all = d.comps.map((c, ci) => [c, ci]).filter(([c]) => c.table?.length && (c.big || c.name === mine)).flatMap(([c, ci]) => gzPower(d, ci).filter((r) => r.played >= 5).map((r) => ({ ...r, league: c.name })));
  if (all.length < 6) return '';
  const top = all.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.pos - b.pos).slice(0, 6);
  return `<section class="gz-wrap gz-sec gz-pw"><div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Le classement de puissance')}</h2><span class="gz-mc-sub">${tr('Les clubs les plus en forme des grands championnats, sur 5 matchs')}</span></div></div>
    <ol class="gz-pw-cards">${top.map((r, k) => `<li><a data-gzrubric="${esc(r.league)}"><span class="gz-pw-rank">${k + 1}</span>${gzCrest(r.team, ' gz-crest--md')}<span class="gz-pw-who"><b>${esc(r.team)}</b><small>${esc(gzShort(r.league))} · ${esc(ordinal(r.pos))}</small></span>
      <span class="gz-pw-num"><b>${r.pts}</b><small>/15 · ${gzSigned(r.gd)}</small></span>${gzFormChips(r.form)}${r.streak ? `<em>${esc(gzStreak(r.streak))}</em>` : ''}</a></li>`).join('')}</ol></section>`;
}
// Les récompenses : les joueurs du mois annoncés par le journal (le dernier mois), puis l'équipe type de la dernière
// journée de chaque grand championnat et du sien.
function gzAwardsBlocks(d) {
  const s = state.snapshot;
  const potm = (state.paperAwards?.potm || []).at(-1);
  const who = (p) => `${esc(p.team)} · ${esc(trn(p.apps, '{n} match', '{n} matchs'))} · ${esc(trn(p.goals, '{n} but', '{n} buts'))} · ${esc(trn(p.assists, '{n} passe D.', '{n} passes D.'))}`;
  const months = potm ? `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Les joueurs du mois')}</h2><span class="gz-mc-sub">${esc(monthYear(potm.month))}</span></div></div>
    <div class="gz-potm-grid">${potm.overall ? `<article class="gz-mc-card gz-potm-main"><span class="gz-kicker">${tr('Joueur du mois')}</span><span class="gz-potm-face">${faceIn(potm.overall.player, gzCrest(potm.overall.team, ' gz-crest--big'))}</span><h3>${esc(potm.overall.player)}</h3><p>${who(potm.overall)}</p><div class="gz-potm-note"><span>${tr('Meilleure note moyenne du mois')}</span>${ratingChip(potm.overall.avg, true)}</div></article>` : ''}
      <ul class="gz-potm-list">${(potm.leagues || []).map((p) => `<li${p.competition === s.league?.name ? ' class="mine"' : ''}>${gzCompLogo(p.competition, 'gz-potm-logo') || `<span class="gz-potm-logo gz-potm-logo--none">${hi('trophy')}</span>`}<span><small>${esc(gzShort(p.competition))}</small><strong>${esc(p.player)}</strong><em>${who(p)}</em></span>${ratingChip(p.avg)}</li>`).join('')}</ul></div></section>`
    : `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><h2>${tr('Les joueurs du mois')}</h2></div><p class="gz-empty">${tr('Le joueur du mois sera annoncé au début du mois prochain.')}</p></section>`;
  if (d === undefined) return `${months}<section class="gz-wrap gz-sec"><p class="gz-empty">${tr('Chargement des scores…')}</p></section>`;
  // Le footballeur de l'année, la récompense du jeu lue dans la sauvegarde : le dernier podium avec ses points, puis le
  // palmarès des années précédentes. Son joueur, s'il y figure un jour, est mis en avant.
  const potyList = (d?.poty || []).filter((y) => y.podium?.[0]?.[0]);
  const club = (ref) => d?.teams?.[ref]?.[0] || '';
  const pts = (n) => esc(trn(n, '{n} point', '{n} points'));
  const last = potyList[0];
  const year = last ? `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Footballeur de l’année')}</h2><span class="gz-mc-sub">${esc(String(last.year))}</span></div></div>
    <div class="gz-potm-grid"><article class="gz-mc-card gz-potm-main"><span class="gz-kicker">${tr('Lauréat {year}', { year: last.year })}</span><span class="gz-potm-face">${faceIn(last.podium[0][0], gzCrest(club(last.podium[0][1]), ' gz-crest--big'))}</span><h3>${esc(last.podium[0][0])}</h3><p>${esc(club(last.podium[0][1]))} · ${pts(last.podium[0][2])}</p></article>
      <ul class="gz-potm-list">${last.podium.slice(1).filter(([n]) => n).map(([n, ref, p, me], i) => `<li${me ? ' class="mine"' : ''}><span class="gz-poty-rank">${i + 2}</span><span><small>${esc(club(ref))}</small><strong>${esc(n)}</strong></span><b class="gz-poty-pts">${pts(p)}</b></li>`).join('')}
        ${potyList.slice(1).map((y) => `<li class="gz-poty-past${y.podium[0][3] ? ' mine' : ''}"><span class="gz-poty-rank gz-poty-year">${esc(String(y.year))}</span><span><small>${tr('Lauréat {year}', { year: y.year })}</small><strong>${esc(y.podium[0][0])}</strong><em>${esc(club(y.podium[0][1]))}</em></span><b class="gz-poty-pts">${pts(y.podium[0][2])}</b></li>`).join('')}</ul></div></section>` : '';
  // Les équipes types de chaque grand championnat et du sien : de la dernière journée, du mois fini ou de la saison en
  // cours, au choix. Celles du mois et de la saison viennent des notes moyennes du jeu (calculées à la synchro).
  const pool = (d?.comps || []).map((c, ci) => [c, ci]).filter(([c]) => c.kind === 'league' && ((c.big && gzRubricRank(c.name) < 99) || c.name === s.league?.name))
    .sort(([a], [b]) => (a.name === s.league?.name) - (b.name === s.league?.name) || gzRubricRank(a.name) - gzRubricRank(b.name));
  const has = { round: ([c]) => c.totw?.xi?.length, month: ([c]) => c.xi?.month?.players?.length, season: ([c]) => c.xi?.season?.players?.length };
  const kinds = [['round', 'Journée'], ['month', 'Mois'], ['season', 'Saison']].filter(([k]) => pool.some(has[k]));
  const kind = kinds.some(([k]) => k === view.gzXi) ? view.gzXi : kinds[0]?.[0];
  const when = (c) => (kind === 'round' ? roundLabel(c.totw.round) : kind === 'month' ? monthYear(c.xi.month.month) : tr('Saison en cours'));
  const xiCard = ([c, ci]) => `<article class="gz-mc-card"><div class="gz-mc-title"><span class="gz-totw-comp">${gzCompLogo(c.name)}${esc(gzShort(c.name))}</span><span class="gz-mc-count">${esc(when(c))}</span></div>${kind === 'round' ? gzTotw(d, ci, { title: false }) : gzXiLines(d, c.xi[kind].players)}</article>`;
  const xiNote = kind === 'month' ? tr('Les meilleures notes moyennes du mois, en 4-3-3, parmi les joueurs qui ont joué au moins la moitié des journées du mois.')
    : kind === 'season' ? tr('Les meilleures notes moyennes de la saison en cours, en 4-3-3, parmi les joueurs qui ont joué au moins 40 % des journées.') : '';
  const teams = kind ? `<section class="gz-wrap gz-sec" id="gz-xi"><div class="gz-sec-head"><h2>${tr('Les équipes types')}</h2>${kinds.length > 1 ? `<div class="gz-seg">${kinds.map(([k, l]) => `<button type="button" data-gzxi="${k}" aria-pressed="${k === kind}">${tr(l)}</button>`).join('')}</div>` : ''}</div>
    <div class="gz-totw-grid">${pool.filter(has[kind]).map(xiCard).join('')}</div>${xiNote ? `<p class="gz-fine">${esc(xiNote)}</p>` : ''}</section>` : '';
  return year + months + teams;
}
// Les articles d'une rubrique : le plus récent en grand, les autres en cartes.
function gzRubricArticles(list, comps) {
  if (!list.length) return `<section class="gz-wrap gz-sec"><p class="gz-empty">${tr('Pas encore d’article dans cette rubrique : il arrivera avec une prochaine édition.')}</p></section>`;
  const [big, ...rest] = list;
  return `<section class="gz-wrap gz-sec gz-rub-arts"><div class="gz-sec-head"><h2>${tr('Les articles')}</h2><span class="gz-mc-sub">${esc(trn(list.length, '{n} article', '{n} articles'))}</span></div>
    <article class="gz-feature"><a class="gz-feature-art" ${gzOpen(big)} tabindex="-1" aria-hidden="true">${gzFrame(big, 'fill')}</a><div class="gz-feature-text">${gzBy(big)}
      <h3><a ${gzOpen(big)}>${esc(big.a.headline)}</a></h3>${big.a.dek ? `<p>${esc(big.a.dek)}</p>` : ''}${gzTagLine(big, comps)}</div></article>
    ${rest.length ? `<div class="gz-grid4 gz-rub-grid">${rest.slice(0, 23).map((x) => gzCard(x, comps)).join('')}</div>` : ''}</section>`;
}
// La page d'une rubrique, aux couleurs de sa compétition quand on les connaît.
function renderRubric(page, s, e, idx, eds) {
  const name = view.natRubric, d = skData();
  const comps = transversaleComps(s);
  const mine = name === s.league?.name;
  const all = nationalArticles().filter((x) => (name === GZ_MERCATO ? gzSubject(x.a, x.date).mode === 'mercato' : gzRubricOf(x.a) === name));
  const ci = d ? d.comps.findIndex((c) => c.name === name) : -1;
  const country = ci >= 0 && d.comps[ci].country && d.comps[ci].country !== 'Europe' ? tr(d.comps[ci].country) : '';
  const sub = mine ? `${esc(s.club.name)} · ${esc(s.player.name)}` : name === GZ_AWARDS ? tr('Footballeur de l’année, joueurs du mois et équipes types, d’après le jeu') : esc(country);
  const logo = name.startsWith('*') ? `<span class="gz-rub-icon">${hi(name === GZ_AWARDS ? 'trophy' : 'swap')}</span>` : gzCompLogo(name, 'gz-rub-logo');
  let blocks;
  if (name === GZ_AWARDS) blocks = gzAwardsBlocks(d);
  else if (name === GZ_MERCATO) blocks = gzMercatoFeed(s, d);
  else if (mine) blocks = `${gzMatchCentre(s)}${gzScores(s, comps)}${gzCentre(s, { picks: [] }, comps)}${ci >= 0 ? gzPowerBlock(d, ci) : ''}${gzClubs(s)}`;
  else blocks = ci >= 0 ? gzWorldBlocks(d, ci) : d === undefined ? `<section class="gz-wrap gz-sec"><p class="gz-empty">${tr('Chargement des scores…')}</p></section>` : '';
  page.innerHTML = `<div class="gz">${gzHeader(s, e, idx, eds)}
    <main><section class="gz-wrap gz-rub-head">${logo}<div><h1>${esc(gzRubricTitle(name))}</h1>${sub ? `<p>${sub}</p>` : ''}</div></section>
      ${name === GZ_MERCATO ? `${blocks}${gzRubricArticles(all, comps)}` : `${gzRubricArticles(all, comps)}${blocks}`}</main>
    ${gzFooter()}</div>`;
  bindNational(page);
}

// La une : le grand article à gauche ; à droite, trois autres et les signatures du journal.
const gzOpen = (x) => `data-gzart="${x.edition}:${x.i}"`;
const gzMeta = (x, comps, long = false) => `<div class="gz-meta"><span class="gz-avatar">${gzInitials(x.a.author)}</span><span class="gz-meta-name">${esc(x.a.author || tr('La rédaction'))}</span><i></i><span class="gz-kind">${esc(gzKind(x.a) || gzTopic(x.a, comps))}</span><time>${esc(gzDay(x.date))}${long ? ` · ${tr('{n} min de lecture', { n: readTime(x.a) })}` : ''}</time></div>`;
function gzAuthors() {
  const count = new Map();
  for (const x of nationalArticles()) if (x.a.author) count.set(x.a.author, (count.get(x.a.author) || 0) + 1);
  const top = [...count].sort((p, q) => q[1] - p[1]).slice(0, 2);
  if (!top.length) return '';
  return `<div class="gz-authors"><h2>${tr('Les signatures')}</h2><div>${top.map(([name, n]) => `<a class="gz-author" data-gzauthor="${esc(name)}"><span class="gz-avatar gz-avatar--lg">${gzInitials(name)}</span><span><b>${esc(name)}</b><small>${esc(trn(n, '{n} article', '{n} articles'))}</small></span>${GZ_ARROW}</a>`).join('')}</div></div>`;
}
function gzLead(lead, side, comps) {
  if (!lead) return '';
  return `<section class="gz-wrap gz-lead" id="gz-front">
    <article class="gz-lead-main"><a class="gz-framelink" ${gzOpen(lead)} tabindex="-1" aria-hidden="true">${gzFrame(lead, 'lead')}</a>
      ${gzMeta(lead, comps, true)}
      <h1><a ${gzOpen(lead)}>${esc(lead.a.headline)}</a></h1>
      ${lead.a.dek ? `<p class="gz-lead-dek">${esc(lead.a.dek)}</p>` : ''}
      <a class="gz-lead-more" ${gzOpen(lead)}>${tr('Lire la suite')}</a></article>
    <div class="gz-lead-side">${side.map((x) => `<article class="gz-lead-item"><div class="gz-lead-row"><a class="gz-framelink" ${gzOpen(x)} tabindex="-1" aria-hidden="true">${gzFrame(x, '3x2')}</a><h3><a class="gz-hl" ${gzOpen(x)}>${esc(x.a.headline)}</a></h3></div>${gzMeta(x, comps)}</article>`).join('')}${gzAuthors()}</div>
  </section>`;
}

// Au-dessus du titre : les initiales et le nom de l'auteur, la date. En dessous : le genre de l'article et le temps de lecture.
const gzBy = (x) => `<div class="gz-by"><span class="gz-avatar">${gzInitials(x.a.author)}</span><span class="gz-by-name">${esc(x.a.author || tr('La rédaction'))}</span><span class="gz-by-when">${esc(gzDay(x.date))}</span></div>`;
const gzTagLine = (x, comps) => `<div class="gz-tagline"><span class="gz-kind">${esc(gzKind(x.a) || gzTopic(x.a, comps))}</span><span>${tr('{n} min de lecture', { n: readTime(x.a) })}</span></div>`;
const gzCard = (x, comps, ratio = '4x3', dek = true) => `<article class="gz-card"><a class="gz-framelink" ${gzOpen(x)}>${gzFrame(x, ratio)}</a>${gzBy(x)}
  <h3><a class="gz-hl" ${gzOpen(x)}>${esc(x.a.headline)}</a></h3>${dek && x.a.dek ? `<p>${esc(x.a.dek)}</p>` : ''}${gzTagLine(x, comps)}</article>`;
const gzMore = () => `<a class="gz-more" data-gzall>${tr('Voir plus')} ${GZ_ARROW}</a>`;

// « Dernières infos » : le plus récent en grand, le titre posé sur l'illustration, et quatre autres dessous.
function gzLatest(list, comps) {
  if (!list.length) return '';
  const [big, ...rest] = list;
  return `<section class="gz-wrap gz-sec" id="gz-latest"><div class="gz-sec-head"><h2>${tr('Dernières infos')}</h2>${gzMore()}</div>
    <article class="gz-feature"><a class="gz-feature-art" ${gzOpen(big)} tabindex="-1" aria-hidden="true">${gzFrame(big, 'fill')}</a><div class="gz-feature-text">${gzBy(big)}
      <h3><a ${gzOpen(big)}>${esc(big.a.headline)}</a></h3>${big.a.dek ? `<p>${esc(big.a.dek)}</p>` : ''}${gzTagLine(big, comps)}</div></article>
    ${rest.length ? `<div class="gz-grid4 gz-wide-cards gz-feature-rest">${rest.map((x) => gzCard(x, comps, '21x9', false)).join('')}</div>` : ''}</section>`;
}

// « Le match » (L'Équipe, Sky Sports) : le dernier match du club (score, buteurs, homme du match), les notes de ses
// joueurs et le prochain rendez-vous avec la forme du moment.
function gzMatchCentre(s) {
  const last = s.last?.played && s.last.score ? s.last : null, next = s.next;
  if (!last && !next) return '';
  const clubRef = s.club.ref;
  const verdict = (m) => { const home = m.homeRef === clubRef; const [a, b] = home ? m.score : [m.score[1], m.score[0]]; return a > b ? [tr('Victoire'), 'win', formLetter('V')] : a < b ? [tr('Défaite'), 'loss', formLetter('D')] : [tr('Match nul'), 'draw', formLetter('N')]; };
  const side = (team) => `<span class="gz-sb-team">${gzCrest(team, ' gz-crest--sb')}<em>${esc(team)}</em></span>`;
  const board = last ? (() => { const [label, cls] = verdict(last); return `<div class="gz-mc-card gz-mc-board">
      <div class="gz-mc-meta"><span class="gz-flag gz-flag--sm">${esc(gzShort(last.competition))}</span><span class="gz-mc-date">${esc(fmtDate(last.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><span class="gz-mb-verdict ${cls}">${label}</span></div>
      <div class="gz-sb">${side(last.home)}<b class="gz-sb-score">${last.score[0]}<i>-</i>${last.score[1]}</b>${side(last.away)}</div>
      <div class="gz-sb-goals"><span>${gzGoals(last.events?.home)}</span><span>${gzGoals(last.events?.away)}</span></div>
      <p class="gz-mc-foot">${last.stadium ? `<span>${esc(last.stadium)}</span>` : ''}${last.motm?.name ? `<span>${tr('Homme du match')}${colon()} <strong>${esc(last.motm.name)}</strong>${last.motm.team ? ` (${esc(last.motm.team)})` : ''} ${ratingChip(last.motm.rating)}</span>` : ''}</p>
    </div>`; })() : '';
  const lineup = last?.clubLineup || [];
  const played = lineup.some((p) => p.name === s.player.name);
  const notes = lineup.length ? `<div class="gz-mc-card gz-mc-notes"><div class="gz-mc-title">${tr('Les notes')} · ${esc(s.club.name)}</div>
      <ol class="gz-notes">${lineup.map((p) => `<li class="${[p.name === s.player.name ? 'mine' : '', p.starter ? '' : 'sub'].filter(Boolean).join(' ')}"><span class="gz-note">${p.rating > 0 ? ratingChip(p.rating) : `<span class="gz-note-nn">${tr('nn')}</span>`}</span><span class="gz-note-name">${esc(p.name)}</span><span class="gz-note-min">${p.starter ? '' : `${tr('entré')} · `}${p.minutes}’${p.goals ? ` · ${trn(p.goals, '{n} but', '{n} buts')}` : ''}${p.assists ? ` · ${trn(p.assists, '{n} passe', '{n} passes')}` : ''}</span></li>`).join('')}</ol>
      <p class="gz-mc-legend">${tr('Notes du jeu sur 10 · nn : non noté')}${played ? '' : ` · ${tr('{who} n’a pas joué', { who: esc(s.player.name) })}`}</p></div>` : '';
  const days = next ? Math.round((Date.parse(`${next.date}T12:00:00Z`) - Date.parse(`${s.gameDate}T12:00:00Z`)) / 864e5) : 0;
  const form = (s.fixtures || []).filter((f) => f.played && f.score).slice(-5).map(verdict);
  const nextHtml = next ? `<div class="gz-mc-card gz-mc-next"><div class="gz-mc-title">${tr('Prochain match')}<span class="gz-mc-count">${days <= 0 ? tr('Aujourd’hui') : days === 1 ? tr('Demain') : trn(days, 'Dans {n} jour', 'Dans {n} jours')}</span></div>
      <div class="gz-sb gz-sb--next">${side(next.home)}<b class="gz-sb-vs">${next.hour != null ? hh(next.hour) : 'vs'}</b>${side(next.away)}</div>
      <p class="gz-mc-foot"><span>${esc(gzShort(next.competition))} · ${esc(fmtDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span>${next.stadium ? `<span>${esc(next.stadium)}</span>` : ''}</p>
      ${form.length ? `<div class="gz-form"><span>${tr('Forme')}</span>${form.map(([label, cls, k]) => `<b class="gz-form-${cls}" title="${label}">${k}</b>`).join('')}</div>` : ''}
    </div>` : '';
  return `<section class="gz-wrap gz-sec gz-mc" id="gz-match"><div class="gz-sec-head"><h2>${tr('Le match')}</h2><span class="gz-mc-sub">${esc(s.club.name)} · ${esc(s.player.name)}</span></div>
    <div class="gz-mc-grid${notes ? '' : ' gz-mc-grid--two'}">${board}${notes}${nextHtml}</div></section>`;
}

// « Les scores » : les matchs d'une compétition de son club à la fois (flèches), le sien d'abord, huit de front et « Voir plus ».
function gzScores(s, comps) {
  if (!comps.length) return '';
  const at = Math.max(0, comps.findIndex((x) => x.name === view.gzComp));
  const c = comps[at];
  const stageOf = (label) => { const m = /^(\d+)e journée$/.exec(label || ''); return m ? roundLabel(Number(m[1])) : label || ''; };
  const step = (d, label) => { const x = comps[(at + d + comps.length) % comps.length]; return `<button class="gz-arrow${d < 0 ? ' back' : ''}" data-gzcomp="${esc(x.name)}" title="${esc(gzShort(x.name))}" aria-label="${label}">${GZ_CHEVRON}</button>`; };
  const arrows = comps.length > 1 ? `<span class="gz-arrows">${step(-1, tr('Compétition précédente'))}${step(1, tr('Compétition suivante'))}</span>` : '';
  const showNext = view.gzRound === 'next' ? c.next.length > 0 : !c.results.length;
  const list = showNext ? c.next : c.main && s.roundResults?.length ? s.roundResults : c.results;
  const mine = (m) => gzIsMine(m, s.club.ref);
  const ordered = [...list.filter(mine), ...list.filter((m) => !mine(m))];
  const shown = view.gzScoresAll ? ordered : ordered.slice(0, 8);
  const stage = stageOf(showNext ? c.nextStage : c.stage);
  const seg = c.results.length && c.next.length ? `<div class="gz-seg"><button data-gzround="past" aria-pressed="${!showNext}">${tr('Résultats')}</button><button data-gzround="next" aria-pressed="${showNext}">${tr('À venir')}</button></div>` : '';
  const more = ordered.length > 8 ? `<a class="gz-more" data-gzmore>${view.gzScoresAll ? tr('Voir moins') : tr('Voir plus')} ${GZ_CHEVRON}</a>` : '';
  return `<section class="gz-wrap gz-sec" id="gz-scores"><div class="gz-band">
    <div class="gz-sec-head"><div class="gz-sec-title"><h2>${tr('Les scores')}</h2><span class="gz-mc-sub">${esc(gzShort(c.name))}${stage ? ` · ${esc(stage)}` : ''}</span></div><div class="gz-sec-tools">${seg}${arrows}${more}</div></div>
    <div class="gz-sc-grid">${shown.map((m) => gzScoreCard(m, s, gzShort(c.name))).join('')}</div>
  </div></section>`;
}

// Le classement de son championnat.
function gzStanding(s) {
  return gzStandingTable(s.league.name, (s.table || []).map((r) => ({ ...r, mine: r.mine || r.ref === s.club.ref })), 'gz-table');
}
// Un classement : rows = [{ pos, team, p, w, d, l, gd (ou gf et ga), pts, mine }].
function gzStandingTable(compName, rows, id = '') {
  if (!rows.length) return '';
  const full = rows[0].w != null;
  const diff = (r) => { const d = r.gd ?? r.gf - r.ga; return `${d > 0 ? '+' : ''}${d}`; };
  return `<div class="gz-sec-head"${id ? ` id="${id}"` : ''}><div class="gz-sec-title">${gzCompLogo(compName)}<h2>${tr('Classement')} · ${esc(gzShort(compName))}</h2></div></div>
    <table class="gz-table"><thead><tr><th>#</th><th>${tr('Club')}</th><th>${tr('J')}</th>${full ? `<th>${formLetter('V')}</th><th>${formLetter('N')}</th><th>${formLetter('D')}</th>` : ''}<th>${tr('Diff.')}</th><th>${tr('Pts')}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr${r.mine ? ' class="mine"' : ''}><td>${r.pos}</td><td class="gz-table-club"><div>${gzCrest(r.team, ' gz-crest--s')}<span>${esc(r.team)}</span></div></td><td>${r.p}</td>${full ? `<td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>` : ''}<td>${diff(r)}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>`;
}

// Le classement, à côté de deux articles recommandés.
function gzCentre(s, f, comps) {
  const left = gzStanding(s);
  const side = f.picks.length ? `<aside><div class="gz-sec-head"><h2>${tr('Recommandé')}</h2></div><div class="gz-side-cards">${f.picks.map((x) => gzCard(x, comps, '3x2')).join('')}</div></aside>` : '';
  if (!left && !side) return '';
  return `<section class="gz-wrap gz-sec${left && side ? ' gz-split' : ''}">${left ? `<div>${left}</div>` : ''}${side}</section>`;
}

// Les clubs de son championnat, en pastilles : chacun ouvre les articles qui le citent.
function gzClubs(s) {
  const rows = s.table || [];
  if (!rows.length) return '';
  return `<section class="gz-wrap gz-sec" id="gz-clubs"><div class="gz-sec-head"><h2>${tr('Les clubs de {league}', { league: esc(gzShort(s.league.name)) })}</h2></div>
    <div class="gz-clubs">${rows.map((r) => `<button class="gz-club${r.mine || r.ref === s.club.ref ? ' mine' : ''}" data-gzclub="${esc(r.team)}" title="${esc(r.team)}"><span class="gz-club-ring">${gzCrest(r.team, ' gz-crest--md')}</span><span class="gz-club-name">${esc(r.team)}</span></button>`).join('')}</div></section>`;
}

// « Centre des transferts » : l'état du mercato, puis les transferts officiels qui touchent son championnat.
// world : la page Mercato, tous les transferts suivis (son championnat et les grands championnats).
function gzTransferCentre(s, world = false) {
  const today = s.gameDate, windows = s.windows || [];
  const openWin = windows.find((w) => today >= w.open && today <= w.close);
  const upcoming = windows.filter((w) => w.open > today).sort((a, b) => (a.open < b.open ? -1 : 1))[0];
  const day = (iso) => { const d = fmtDate(iso, { day: 'numeric', month: 'long' }); return lang() === 'fr' ? d.replace(/^1 /, '1er ') : d; };
  const status = openWin ? `<span class="gz-tc-pill on"><span class="gz-live-dot"></span>${tr('Ouvert')}</span><span>${tr('jusqu’au {d}', { d: esc(day(openWin.close)) })}</span>`
    : `<span class="gz-tc-pill">${tr('Fermé')}</span><span>${upcoming ? tr('réouverture le {d}', { d: esc(day(upcoming.open)) }) : tr('pas de fenêtre annoncée')}</span>`;
  const list = (world ? state.transfers || [] : gzTransfers(s)).map((x, k) => [x, k]).sort((x, y) => (y[0].gameDate || '').localeCompare(x[0].gameDate || '') || y[1] - x[1]).slice(0, world ? 40 : 8).map(([x]) => x);
  const league = esc(gzShort(s.league.name));
  return `<section class="gz-wrap gz-sec gz-tc" id="gz-mercato"><div class="gz-sec-head"><h2>${tr('Centre des transferts')}</h2><div class="gz-tc-status">${status}</div></div>
    ${list.length ? `<ul class="gz-tc-list">${list.map((t) => `<li class="${t.involvesMyClub ? 'mine' : ''}"><span class="gz-tc-when">${t.gameDate ? esc(gzDay(t.gameDate)) : ''}</span><strong class="gz-tc-player">${esc(t.player)}</strong>
      <span class="gz-tc-move">${gzCrest(t.from, ' gz-crest--md')}<span class="gz-tc-club">${esc(t.from || '?')}</span><span class="gz-tc-arrow">${GZ_ARROW}</span>${gzCrest(t.to, ' gz-crest--md')}<span class="gz-tc-club">${esc(t.to || '?')}</span></span><span class="gz-tc-tag">${tr('Officiel')}</span></li>`).join('')}</ul>` : `<p class="gz-empty">${world ? tr('Aucun transfert officiel pour l’instant : les mouvements des grands championnats s’afficheront ici.') : tr('Aucun transfert ne touche {league} pour l’instant : les mouvements officiels s’afficheront ici.', { league })}</p>`}
  </section>`;
}

// Club → son championnat, d'après les classements des scores du monde (calculé une fois).
function gzClubLeagues(d) {
  if (!d) return new Map();
  if (!d.clubLeague) {
    d.clubLeague = new Map();
    for (const c of d.comps || []) if (c.table) for (const row of c.table) { const n = d.teams?.[row[0]]?.[0]; if (n && !d.clubLeague.has(n)) d.clubLeague.set(n, c.name); }
  }
  return d.clubLeague;
}
// Le fil du mercato (rubrique Mercato) : tous les transferts suivis (son championnat et les grands championnats), jour
// par jour, avec le championnat de chaque club ; des filtres (tous, son club, un championnat) ; et le bilan club par
// club de la fenêtre en cours, ou de la dernière une fois fermée. Sans IA : les transferts viennent des effectifs de la
// sauvegarde, comparés d'une synchro à l'autre (leur date est celle de la synchro qui les a vus).
function gzMercatoFeed(s, d) {
  const today = s.gameDate, windows = s.windows || [];
  const openWin = windows.find((w) => today >= w.open && today <= w.close);
  const lastWin = windows.filter((w) => w.close < today).sort((a, b) => (a.close < b.close ? -1 : 1)).at(-1);
  const upcoming = windows.filter((w) => w.open > today).sort((a, b) => (a.open < b.open ? -1 : 1))[0];
  const win = openWin || lastWin || null;
  const day = (iso, long = false) => { const x = fmtDate(iso, long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' }); return lang() === 'fr' ? x.replace(/(^|\s)1 /, '$11er ') : x; };
  const status = openWin ? `<span class="gz-tc-pill on"><span class="gz-live-dot"></span>${tr('Ouvert')}</span><span>${tr('jusqu’au {d}', { d: esc(day(openWin.close)) })}</span>`
    : `<span class="gz-tc-pill">${tr('Fermé')}</span><span>${upcoming ? tr('réouverture le {d}', { d: esc(day(upcoming.open)) }) : tr('pas de fenêtre annoncée')}</span>`;
  const leagueOf = gzClubLeagues(d), mine = s.league?.name, club = s.club?.name;
  const all = state.transfers || [];
  const touches = (t, league) => leagueOf.get(t.from) === league || leagueOf.get(t.to) === league;
  // Les filtres : tous, son club, puis les championnats qui ont bougé (le sien d'abord, puis les plus actifs).
  const count = new Map();
  for (const t of all) for (const l of new Set([leagueOf.get(t.from), leagueOf.get(t.to)])) if (l) count.set(l, (count.get(l) || 0) + 1);
  const leagues = [...count.keys()].sort((a, b) => Number(b === mine) - Number(a === mine) || count.get(b) - count.get(a)).slice(0, 8);
  const filter = view.gzMercato === 'mine' || leagues.includes(view.gzMercato) ? view.gzMercato : 'all';
  const keep = (t) => filter === 'all' || (filter === 'mine' ? t.involvesMyClub : touches(t, filter));
  const chip = (v, label) => `<button type="button" data-gzmf="${esc(v)}" aria-pressed="${filter === v}">${esc(label)}</button>`;
  const chips = `<div class="gz-seg gz-mf-filters">${chip('all', tr('Tous'))}${chip('mine', tr('Ton club'))}${leagues.map((l) => chip(l, gzShort(l))).join('')}</div>`;
  // Le fil, jour par jour (les 80 derniers).
  const list = all.map((x, k) => [x, k]).filter(([x]) => keep(x)).sort((x, y) => (y[0].gameDate || '').localeCompare(x[0].gameDate || '') || y[1] - x[1]).slice(0, 80).map(([x]) => x);
  const days = [...new Set(list.map((t) => t.gameDate || ''))];
  const side = (name) => `<span class="gz-mf-side">${gzCrest(name, ' gz-crest--md')}<span><b>${esc(name || '?')}</b>${leagueOf.get(name) ? `<small>${esc(gzShort(leagueOf.get(name)))}</small>` : ''}</span></span>`;
  const item = (t) => `<li class="${t.involvesMyClub ? 'mine' : ''}"><span class="gz-mf-face">${faceIn(t.player, esc(String(t.player || '?').trim()[0] || '?'))}</span><strong class="gz-mf-player">${esc(t.player)}</strong>
      <span class="gz-mf-move">${side(t.from)}<span class="gz-tc-arrow">${GZ_ARROW}</span>${side(t.to)}</span></li>`;
  const feed = list.length ? days.map((dt) => { const of = list.filter((t) => (t.gameDate || '') === dt); return `<h3 class="gz-mf-day">${dt ? esc(day(dt, true)) : ''}<span>${esc(trn(of.length, '{n} transfert', '{n} transferts'))}</span></h3><ul class="gz-mf-list">${of.map(item).join('')}</ul>`; }).join('')
    : `<p class="gz-empty">${all.length ? tr('Aucun transfert pour ce filtre.') : tr('Aucun transfert officiel pour l’instant.')}</p>`;
  // Les chiffres de la fenêtre et le bilan club par club (le championnat du filtre, sinon le sien).
  const inWin = win ? all.filter((t) => t.gameDate >= win.open && t.gameDate <= win.close) : [];
  const league = filter !== 'all' && filter !== 'mine' ? filter : mine;
  const rows = new Map();
  const row = (name) => { if (!rows.has(name)) rows.set(name, { in: [], out: [] }); return rows.get(name); };
  for (const t of inWin) {
    if (t.to && leagueOf.get(t.to) === league) row(t.to).in.push(t.player);
    if (t.from && leagueOf.get(t.from) === league) row(t.from).out.push(t.player);
  }
  const clubs = [...rows].sort((a, b) => Number(b[0] === club) - Number(a[0] === club) || (b[1].in.length + b[1].out.length) - (a[1].in.length + a[1].out.length) || a[0].localeCompare(b[0]));
  const names = (l) => (l.length ? esc(l.join(', ')) : '—');
  const winName = win ? tr(win.kind === 'hiver' ? 'Mercato d’hiver' : 'Mercato d’été') : '';
  const figures = win ? `<div class="gz-mf-figures"><div><b>${fmtNum(inWin.length)}</b><span>${esc(trn(inWin.length, 'transfert', 'transferts'))} · ${esc(winName)}</span></div>
      <div><b>${fmtNum(inWin.filter((t) => touches(t, mine)).length)}</b><span>${esc(gzShort(mine || ''))}</span></div>
      <div><b>${fmtNum(inWin.filter((t) => t.to === club).length)} / ${fmtNum(inWin.filter((t) => t.from === club).length)}</b><span>${esc(club || '')} · ${tr('arrivées / départs')}</span></div></div>` : '';
  const recap = win ? `<section class="gz-wrap gz-sec gz-mf-recap"><div class="gz-sec-head"><h2>${tr(openWin ? 'Le mercato club par club' : 'Le bilan du mercato')}</h2><div class="gz-tc-status"><span>${esc(winName)} · ${esc(gzShort(league || ''))} · ${esc(day(win.open))} – ${esc(day(win.close))}</span></div></div>
    ${clubs.length ? `<table class="gz-table gz-mf-table"><thead><tr><th>${tr('Club')}</th><th>${tr('Arrivées')}</th><th>${tr('Départs')}</th></tr></thead><tbody>${clubs.map(([name, r]) => `<tr class="${name === club ? 'mine' : ''}"><td><span class="gz-mf-club">${gzCrest(name, ' gz-crest--md')}<b>${esc(name)}</b></span></td><td><i>${r.in.length}</i>${names(r.in)}</td><td><i>${r.out.length}</i>${names(r.out)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="gz-empty">${tr('Aucun mouvement dans ce championnat pendant cette fenêtre.')}</p>`}</section>` : '';
  return `<section class="gz-wrap gz-sec gz-tc gz-mf" id="gz-mercato"><div class="gz-sec-head"><h2>${tr('Le fil du mercato')}</h2><div class="gz-tc-status">${status}</div></div>
    ${figures}${chips}${feed}</section>${recap}`;
}

// « Ça parle sur Kop » (The Sun, Bild) : les posts les plus suivis des derniers jours, hors comptes officiels et hors joueur.
function gzTribune(s) {
  const since = new Date(Date.parse(`${s.gameDate}T12:00:00Z`) - 4 * 864e5).toISOString().slice(0, 10);
  const weight = (p) => (p.likes || 0) + (p.replies?.length || 0) * 25;
  const posts = (state.feed || []).filter((p) => p.gameDate >= since && p.text && !p.aboutPost && !p.official && !p.author?.isMe && p.author?.type !== 'competition').sort((a, b) => weight(b) - weight(a)).filter((p, k, all) => all.findIndex((q) => q.author.handle === p.author.handle) === k).slice(0, 4);
  if (!posts.length) return '';
  return `<section class="gz-wrap gz-sec gz-social"><div class="gz-sec-head"><h2>${tr('Ça parle sur Kop')}</h2><a class="gz-more" data-gzsite="tribune">${tr('Ouvrir Kop')} ${GZ_ARROW}</a></div>
    <div class="gz-social-grid">${posts.map((p) => `<article class="gz-post" data-gzsite="tribune"><header><span class="gz-post-ava">${authorFace(p.author, esc(String(p.author.name || '?').trim()[0] || '?'))}</span><span class="gz-post-who"><strong>${esc(p.author.name)}</strong><em>@${esc(p.author.handle)}</em></span></header>
      <p>${esc(p.text)}</p><footer><span>♥ ${fmtNum(p.likes || 0)}</span>${p.replies?.length ? `<span>${trn(p.replies.length, '{n} réponse', '{n} réponses')}</span>` : ''}<span>${esc(gzDay(p.gameDate))}</span></footer></article>`).join('')}</div></section>`;
}

// La Transversale, quotidien du championnat et des coupes de son club, aux couleurs de ce championnat : la une en carrousel,
// le match, les dernières infos, « À la une aussi », les scores, le classement et les articles recommandés, les clubs, les
// transferts, les réactions sur Kop et le brief du matin dans le pied de page.
function renderNational(page) {
  const liveGz = page.querySelector('.gz');
  if (liveGz) view.gzY = liveGz.scrollTop;
  const eds = state?.editions || [];
  if (!eds.length) { page.innerHTML = needSync(); return; }
  if (view.natArticle) { renderNationalArticle(page); return; }
  const idx = view.edition ?? eds.length - 1;
  const e = eds[idx];
  const s = state.snapshot;
  const comps = transversaleComps(s);
  if (view.natRubric && !view.natAll) { renderRubric(page, s, e, idx, eds); return; }
  if (view.natAll) {
    const club = view.natAll.club, author = view.natAll.author;
    const all = nationalArticles().filter((x) => (!club || gzCites(`${x.a.headline} ${x.a.dek} ${x.a.body}`, club)) && (!author || x.a.author === author));
    if (view.natOldest) all.sort((p, q) => String(p.date).localeCompare(String(q.date)) || p.edition - q.edition || p.i - q.i);
    const days = [];
    for (const x of all) { if (days.at(-1)?.date !== x.date) days.push({ date: x.date, list: [] }); days.at(-1).list.push(x); }
    page.innerHTML = `<div class="gz">${gzHeader(s, e, idx, eds)}
      <main class="gz-wrap gz-sec"><div class="gz-sec-head"><h2>${author ? tr('Articles de {who}', { who: esc(author) }) : club ? tr('Articles sur {topic}', { topic: esc(club) }) : tr('Tous les articles')}</h2><span class="gz-mc-sub">${esc(trn(all.length, '{n} article', '{n} articles'))}</span>${all.length > 1 ? `<div class="gz-seg gz-order"><button data-gzorder="new" aria-pressed="${!view.natOldest}">${tr('Plus récents')}</button><button data-gzorder="old" aria-pressed="${Boolean(view.natOldest)}">${tr('Plus anciens')}</button></div>` : ''}</div>
        ${all.length ? days.map((d) => `<section class="gz-day"><h3 class="gz-day-h">${esc(fmtDate(d.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</h3><div class="gz-grid4">${d.list.map((x) => gzCard(x, comps)).join('')}</div></section>`).join('') : `<p class="gz-empty">${tr('Aucun article ne correspond.')}</p>`}</main>
      ${gzFooter()}</div>`;
    bindNational(page);
    return;
  }
  const f = gzFrontArticles(idx);
  page.innerHTML = `<div class="gz">
    ${gzHeader(s, e, idx, eds)}
    <main>
      ${gzLead(f.lead, f.side, comps)}
      ${gzMatchCentre(s)}
      ${gzLatest(f.latest, comps)}
      ${f.spotlight.length ? `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><h2>${tr('À la une aussi')}</h2>${gzMore()}</div><div class="gz-grid4">${f.spotlight.map((x) => gzCard(x, comps)).join('')}</div></section>` : ''}
      ${gzScores(s, comps)}
      ${gzCentre(s, f, comps)}
      ${gzPowerFront(skData())}
      ${gzClubs(s)}
      ${gzTransferCentre(s)}
      ${gzTribune(s)}
    </main>
    ${gzFooter()}
  </div>`;
  bindNational(page);
}

// Pied de page : le brief du matin dans son panneau (l'abonnement fait arriver un résumé de chaque édition dans Mails),
// puis le journal, ses liens vers Kop et Mails, ses rubriques, sa rédaction, les mentions et le retour en haut de page.
function gzFooter() {
  const s = state.snapshot;
  const on = Boolean(settings?.transversaleBrief);
  const me = state.profile?.displayName || s.player.name;
  const desk = state.writers?.national_desk?.length ? state.writers.national_desk.map((w) => w.name) : [state.writers?.national_columnist].filter(Boolean);
  return `<footer class="gz-footer" id="gz-newsletter"><div class="gz-wrap">
    <div class="gz-news">
      <div><span class="gz-news-label">${tr('Le brief du matin')}</span>
        <p class="gz-news-pitch">${tr('À chaque édition : le dernier match de {club}, le classement en un coup d’œil et les titres du jour, dans ta boîte Mails.', { club: esc(s.club.name) })}</p></div>
      <div><div class="gz-news-row"><span class="gz-news-input">${esc(`${mailSlug(state.profile?.handle || me)}@mails.foot`)}</span><button class="gz-pill" data-gzbrief>${on ? tr('Se désabonner') : tr('S’abonner')}</button></div>
        <p class="gz-news-note">${on ? tr('✓ Abonnement actif : le brief arrive dans Mails à chaque nouvelle édition.') : tr('Gratuit · désinscription en un clic.')}</p></div>
    </div>
    <div class="gz-footer-top">
      <div class="gz-footer-brand"><a class="gz-word" data-gzhome>La Transversale</a>
        <p>${tr('Le quotidien sportif de LifeLegend : chaque édition est écrite par l’IA à partir de ta sauvegarde, puis relue face aux faits.')}</p>
        <div class="gz-foot-social"><a data-gzsite="tribune" title="Kop" aria-label="Kop">${hi('logo')}</a><a data-gzsite="mail" title="Mails" aria-label="Mails">${hi('envelope')}</a></div></div>
      <div class="gz-foot-col"><h4>${tr('Rubriques')}</h4><ul><li><a data-gzhome>${tr('À la une')}</a></li>${gzHasMatch(s) ? `<li><a data-gzgo="gz-match">${tr('Le match')}</a></li>` : ''}<li><a data-gzgo="gz-scores">${tr('Les scores')}</a></li>${s.table?.length ? `<li><a data-gzgo="gz-table">${tr('Classement')}</a></li>` : ''}<li><a data-gzrubric="${GZ_AWARDS}">${tr('Récompenses')}</a></li><li><a data-gzrubric="${GZ_MERCATO}">${tr('Mercato')}</a></li><li><a data-gzall>${tr('Tous les articles')}</a></li></ul></div>
      <div class="gz-foot-col"><h4>${tr('La rédaction')}</h4><ul>${desk.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    </div>
    <div class="gz-footer-bottom"><span>${tr('Journal fictif de LifeLegend')} · ${tr('Articles écrits par l’IA')} · ${tr('Propos des vraies personnes inventés')}</span><span class="gz-uic">${tr('Mise en page : <b>The Gazette</b>, modèle gratuit de uiCookies')}</span>
      <button class="gz-top" data-gztop aria-label="${tr('Retour en haut')}" title="${tr('Retour en haut')}">${hi('arrowUp')}</button></div>
  </div></footer>`;
}

function bindNational(page) {
  const box = page.querySelector('.gz');
  // Une rubrique de grande compétition prend les couleurs de celle-ci ; partout ailleurs, celles de son championnat.
  const rub = !view.natArticle && !view.natAll && view.natRubric && !view.natRubric.startsWith('*') ? view.natRubric : null;
  gzTheme(box, rub ? { league: { name: rub } } : state.snapshot);
  box.scrollTop = view.gzY || 0;
  page.querySelectorAll('[data-gzrubric]').forEach((a) => {
    a.onclick = () => {
      if (!view.natRubric) view.natRubricBack = gzBox()?.scrollTop || 0;
      Object.assign(view, { natRubric: a.dataset.gzrubric, natArticle: null, natAll: null, gzRound: null, gzScoresAll: false });
      render(); gzScrollTo(0);
    };
  });
  page.querySelectorAll('[data-gzpress]').forEach((a) => { a.onclick = openPressModal; });
  autoPressModal();
  bindEditionPicker();
  const openArt = (a) => {
    a.onclick = () => { const [edition, i] = a.dataset.gzart.split(':').map(Number); view.natArticle = { edition, i }; view.natBack = gzBox()?.scrollTop || 0; render(); gzScrollTo(0); };
  };
  page.querySelectorAll('[data-gzart]').forEach(openArt);
  page.querySelectorAll('[data-gzsite]').forEach((a) => { a.onclick = () => go(a.dataset.gzsite); });
  page.querySelectorAll('[data-gzcomp]').forEach((b) => { b.onclick = () => { view.gzComp = b.dataset.gzcomp; render(); }; });
  page.querySelectorAll('[data-gzround]').forEach((b) => { b.onclick = () => { view.gzRound = b.dataset.gzround; render(); }; });
  page.querySelectorAll('[data-gzmf]').forEach((b) => { b.onclick = () => { view.gzMercato = b.dataset.gzmf; render(); }; });
  page.querySelectorAll('[data-gzxi]').forEach((b) => { b.onclick = () => { view.gzXi = b.dataset.gzxi; render(); }; });
  page.querySelectorAll('[data-gzorder]').forEach((b) => { b.onclick = () => { view.natOldest = b.dataset.gzorder === 'old'; render(); gzScrollTo(0); }; });
  page.querySelectorAll('[data-gztop]').forEach((b) => { b.onclick = () => gzScrollTo(0, true); });
  page.querySelectorAll('[data-gzmore]').forEach((a) => { a.onclick = () => { view.gzScoresAll = !view.gzScoresAll; render(); }; });
  page.querySelectorAll('[data-gzrecap]').forEach((b) => { b.onclick = () => b.setAttribute('aria-expanded', String(b.closest('.gz-sc').classList.toggle('open'))); });
  const openAll = (t) => { view.natAll = t; view.natArticle = null; view.natBack = gzBox()?.scrollTop || 0; render(); gzScrollTo(0); };
  page.querySelectorAll('[data-gzall]').forEach((a) => { a.onclick = () => openAll(true); });
  page.querySelectorAll('[data-gzclub]').forEach((a) => { a.onclick = () => openAll({ club: a.dataset.gzclub }); });
  page.querySelectorAll('[data-gzauthor]').forEach((a) => { a.onclick = () => openAll({ author: a.dataset.gzauthor }); });
  page.querySelectorAll('[data-gzprofile]').forEach((a) => { a.onclick = () => { Object.assign(view, { twFilter: 'mine', twAuthor: null, twPost: null, twQuery: '', twFollowing: null, twStack: [], twDm: null }); go('tribune'); }; });
  // Recherche dans le journal : un bandeau sous le menu, résultats parmi tous les articles parus.
  const sbar = $('#gz-searchbar'), input = $('#gz-search'), list = $('#gz-search-results');
  const toggle = page.querySelector('.gz-masthead [data-gzsearch]');
  const ebar = $('#gz-editionbar'), etoggle = page.querySelector('[data-gzedition]');
  if (etoggle) etoggle.onclick = () => { const on = ebar.classList.toggle('open'); ebar.inert = !on; etoggle.setAttribute('aria-expanded', String(on)); };
  const setSearch = (open) => {
    if (!sbar) return;
    sbar.classList.toggle('open', open);
    sbar.inert = !open;
    toggle?.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => input.focus(), 120); // le menu est collant : la recherche s'ouvre là où l'on lit
  };
  page.querySelectorAll('[data-gzsearch]').forEach((b) => { b.onclick = () => setSearch(b === toggle ? !sbar.classList.contains('open') : true); });
  if (input) {
    input.oninput = () => {
      const q = plainText(input.value).trim();
      if (q.length < 2) { list.innerHTML = ''; return; }
      const hits = nationalArticles().filter((x) => plainText(`${x.a.headline} ${x.a.dek} ${x.a.body} ${x.a.author}`).includes(q)).slice(0, 8);
      list.innerHTML = hits.length ? hits.map((x) => `<li><a data-gzart="${x.edition}:${x.i}"><span class="gz-dateline">${esc(fmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span><strong>${esc(x.a.headline)}</strong></a></li>`).join('') : `<li class="gz-search-none">${tr('Aucun article ne correspond.')}</li>`;
      list.querySelectorAll('[data-gzart]').forEach(openArt);
    };
    input.onkeydown = (ev) => { if (ev.key === 'Escape') { setSearch(false); toggle?.focus(); } };
  }
  // Abonnement au brief du matin (réglage enregistré, le brief part avec chaque nouvelle édition).
  const brief = page.querySelector('[data-gzbrief]');
  if (brief) {
    brief.onclick = async () => {
      brief.disabled = true;
      try {
        settings = await live.saveSettings({ transversaleBrief: !settings?.transversaleBrief });
        render();
        toast(settings.transversaleBrief ? tr('Abonnement au brief du matin activé : il arrivera dans Mails avec la prochaine édition.') : tr('Brief du matin : abonnement arrêté.'));
      } catch (err) { brief.disabled = false; toast(err.message, true); }
    };
  }
  page.querySelectorAll('[data-gzhome]').forEach((a) => { a.onclick = () => { const inside = view.natArticle || view.natAll || view.natRubric; Object.assign(view, { natArticle: null, natAll: null, natRubric: null, gzRound: null, gzScoresAll: false }); render(); gzScrollTo(0, !inside); }; });
  page.querySelectorAll('[data-gzgo]').forEach((a) => {
    a.onclick = () => {
      const go = () => { const b = gzBox(), t = document.getElementById(a.dataset.gzgo); if (b && t) gzScrollTo(t.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - (b.querySelector('.gz-navbar')?.offsetHeight || 46) - 14, true); };
      // Une ancre de la une (les scores, le classement…) : depuis un article ou une rubrique, on revient d'abord à la une.
      if (view.natArticle || view.natAll || view.natRubric) { Object.assign(view, { natArticle: null, natAll: null, natRubric: null }); render(); setTimeout(go, 0); } else go();
    };
  });
  // Barre de lecture de la page article.
  const bar = page.querySelector('.gz-progress'), body = page.querySelector('[data-gzbody]');
  const reading = () => {
    if (!bar || !body) return;
    const r = body.getBoundingClientRect(), total = r.height - box.clientHeight;
    bar.style.width = `${total > 0 ? Math.min(100, Math.max(0, ((box.getBoundingClientRect().top - r.top) / total) * 100)) : 0}%`;
  };
  reading();
  gzSpy();
  box.onscroll = () => { view.gzY = box.scrollTop; reading(); gzSpy(); };
  const copy = page.querySelector('[data-gzcopy]');
  if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(copy.dataset.gzcopy); copy.classList.add('flashed'); setTimeout(() => copy.classList.remove('flashed'), 1400); } catch { toast(tr('Copie impossible.'), true); } };
}

// Page article : l'illustration en grand, le titre et la signature, puis le texte à gauche ; à droite, « À lire aussi » numéroté,
// qui suit la lecture ; dessous, « Recommandé » et la rédaction, pour ne jamais laisser de vide à côté d'un article court.
function renderNationalArticle(page) {
  const { edition, i } = view.natArticle;
  const e = state.editions[edition];
  const a = e?.national[i];
  if (!a) { view.natArticle = null; renderNational(page); return; }
  const s = state.snapshot;
  const paragraphs = String(a.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pull = (a.body.match(/[«“„]\s?([^»”“]{30,180}?)\s?[»”“]/) || [])[1];
  // Débat télévisé (« Le Débrief ») : une intervention par paragraphe, le nom de l'intervenant en gras, sans exergue.
  const tv = a.kind === 'débat télévisé';
  const line = (p) => { const m = tv && /^([^:«»\n]{2,40}?)\s?:\s+([\s\S]+)$/.exec(p); return m ? `<p class="gz-say"><b>${esc(m[1])}${colon()}</b> ${esc(m[2]).replace(/\n/g, '<br>')}</p>` : `<p>${esc(p).replace(/\n/g, '<br>')}</p>`; };
  const bodyHtml = paragraphs.map((p, k) => `${line(p)}${pull && !tv && k === 1 ? `<div class="gz-pullquote"><p>${quote(esc(pull))}</p><cite>La Transversale</cite></div>` : ''}`).join('');
  // D'abord les autres articles de l'édition, puis les plus récents.
  const others = nationalArticles().filter((x) => !(x.edition === edition && x.i === i));
  const related = [...others.filter((x) => x.edition === edition), ...others.filter((x) => x.edition !== edition)];
  const reads = related.slice(0, 3), picks = related.slice(3, 7);
  const tags = [s.league.name, s.club.name, s.player.name].filter((x) => x && `${a.headline} ${a.dek} ${a.body}`.includes(x));
  const role = gzRole(a.author);
  const since = state.editions[0]?.gameDate;
  const rubric = gzRubricOf(a);
  const worldBeat = a.focus === 'world' && a.competition ? a.competition : null; // un correspondant suit sa compétition, pas sa carrière
  const comps = transversaleComps(s);
  const desk = state.writers?.national_desk || [];
  page.innerHTML = `<div class="gz">
    ${gzHeader(s, e, edition, state.editions)}
    <article>
      <figure class="gz-article-cover">${gzFrame({ a, date: e.gameDate }, 'fill')}</figure>
      <div class="gz-wrap">
        <header class="gz-article-head">
          ${rubric ? `<a class="gz-rub-chip" data-gzrubric="${esc(rubric)}">${gzCompLogo(rubric, 'gz-rub-chip-logo')}${esc(gzRubricTitle(rubric))}</a>` : ''}
          <div class="gz-article-titlerow"><h1 class="gz-article-title">${esc(a.headline)}</h1>
            <div class="gz-share"><button class="gz-share-btn" data-gzcopy="${esc(`${a.headline} — La Transversale`)}" title="${tr('Copier le titre')}">${GZ_LINK}</button></div></div>
          <div class="gz-byrow"><span class="gz-avatar">${gzInitials(a.author)}</span><span class="gz-name">${tr('Par {who}', { who: esc(a.author || tr('la rédaction')) })}</span><span class="gz-by-meta">${esc(role)} · ${esc(fmtDate(e.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>
            <span class="gz-tagline"><span class="gz-kind">${esc(gzKind(a) || gzTopic(a, comps))}</span><span>${tr('{n} min de lecture', { n: readTime(a) })}</span></span></div>
        </header>
        <div class="gz-article-cols${related.length ? '' : ' gz-article-cols--one'}">
          <div class="gz-article-body" data-gzbody>${a.dek ? `<p class="gz-article-dek">${esc(a.dek)}</p>` : ''}${bodyHtml}
            ${tags.length ? `<div class="gz-article-tags">${tags.map((x) => `<span class="gz-tag">${esc(x)}</span>`).join('')}</div>` : ''}
            <div class="gz-article-author"><span class="gz-avatar gz-avatar--xl">${gzInitials(a.author)}</span><div><span class="gz-kicker">${tr('À propos de l’auteur')}</span><h3>${esc(a.author || tr('La rédaction'))}</h3>
              <p>${esc(role === tr('Rédaction de La Transversale') ? role : tr('À La Transversale : {role}', { role: lcFirst(role) }))}. ${esc(worldBeat ? (since ? tr('Rubrique {league} depuis le {d}.', { league: gzShort(worldBeat), d: fmtDate(since, { day: 'numeric', month: 'long', year: 'numeric' }) }) : tr('Rubrique {league}.', { league: gzShort(worldBeat) }))
                : since ? tr('Suit {league} et la carrière de {player} depuis le {d}.', { league: s.league.name || tr('le championnat'), player: s.player.name, d: fmtDate(since, { day: 'numeric', month: 'long', year: 'numeric' }) }) : tr('Suit {league} et la carrière de {player}.', { league: s.league.name || tr('le championnat'), player: s.player.name }))}</p></div></div>
          </div>
          ${related.length ? `<aside class="gz-article-side">
            <h2>${tr('À lire aussi')}</h2>
            <ol class="gz-reads">${reads.map((x, k) => `<li>${k === 0 ? `<a class="gz-framelink" ${gzOpen(x)}>${gzFrame(x, '4x3')}</a>` : ''}<div class="gz-read"><b>${k + 1}</b><div><h3><a class="gz-hl" ${gzOpen(x)}>${esc(x.a.headline)}</a></h3>${gzTagLine(x, comps)}</div></div></li>`).join('')}</ol>
          </aside>` : ''}
        </div>
      </div>
    </article>
    ${picks.length ? `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><h2>${tr('Recommandé')}</h2>${gzMore()}</div><div class="gz-grid4 gz-wide-cards">${picks.map((x) => gzCard(x, comps, '21x9', false)).join('')}</div></section>` : ''}
    ${desk.length ? `<section class="gz-wrap gz-sec"><div class="gz-sec-head"><h2>${tr('La rédaction')}</h2></div><ul class="gz-desk">${desk.map((w) => `<li><span class="gz-avatar gz-avatar--lg">${gzInitials(w.name)}</span><div><strong>${esc(w.name)}</strong><span>${esc(gzRole(w.name))}</span></div></li>`).join('')}</ul></section>` : ''}
    ${gzFooter()}
  </div>`;
  bindNational(page);
}

// ---------- La conférence d'après-match : une fenêtre sur La Transversale, une question à la fois ----------

const PRESS_ACTIVE = ['pending', 'open'];
let pressLoading = false;
let pressBox = null;
const pressNow = () => { const p = state?.press; return p && PRESS_ACTIVE.includes(p.status) ? p : null; };

function closePressModal() {
  if (!pressBox) return;
  stopDictation(true);
  pressBox.remove();
  pressBox = null;
  ['#page', '.ll-rail', '.ll-top'].forEach((q) => { const el = document.querySelector(q); if (el) el.inert = false; });
}
function openPressModal() {
  if (pressBox || !pressNow()) return;
  pressBox = document.createElement('div');
  pressBox.className = 'gz-modal-back';
  document.body.appendChild(pressBox);
  ['#page', '.ll-rail', '.ll-top'].forEach((q) => { const el = document.querySelector(q); if (el) el.inert = true; });
  paintPressModal();
}
// Elle s'ouvre une fois d'elle-même en arrivant sur La Transversale ; ensuite, depuis son menu.
function autoPressModal() {
  const p = pressNow();
  if (!p || pressBox || view.pressSeen === p.id || setupActive()) return;
  view.pressSeen = p.id;
  openPressModal();
}

function paintPressModal() {
  if (!pressBox) return;
  const p = pressNow();
  if (!p) { closePressModal(); return; }
  const s = state.snapshot;
  if (view.pressFor !== p.id) Object.assign(view, { pressFor: p.id, pressStep: 0, pressIn: false });
  const total = p.questions?.length || 0;
  const at = Math.min(view.pressStep || 0, Math.max(0, total - 1));
  const q = view.pressIn ? p.questions?.[at] : null;
  const m = (s.fixtures || []).find((f) => f.id === p.matchId);
  const side = (team) => `<span class="gz-sb-team">${gzCrest(team, ' gz-crest--sb')}<em>${esc(team)}</em></span>`;
  const head = `<button class="gz-modal-x" data-press-close aria-label="${tr('Revenir plus tard')}" title="${tr('Revenir plus tard')}">${hi('xmark')}</button>
    <span class="gz-modal-label">${tr('Conférence de presse · après-match')}</span>`;
  let body;
  if (q) {
    body = `${head}<p class="gz-modal-match">${esc(p.match)}</p>
      <div class="gz-modal-progress"><span>${tr('Question {n} sur {total}', { n: at + 1, total })}</span><div class="gz-modal-bar">${p.questions.map((_, k) => `<i class="${k <= at ? 'on' : ''}"></i>`).join('')}</div></div>
      <p class="gz-modal-who"><span class="gz-avatar">${gzInitials(q.journalist)}</span><b>${esc(q.journalist)}</b>${q.outlet ? `<span>${esc(q.outlet)}</span>` : ''}</p>
      <h2 id="gz-modal-title">${esc(q.question)}</h2>
      <textarea class="gz-answer" data-i="${at}" placeholder="${tr('Ta réponse…')}"${drafts.noComment[at] ? ' disabled' : ''}>${esc(drafts.press[at] || '')}</textarea>
      <div class="gz-answer-tools">${micHtml(at, drafts.noComment[at])}<label class="gz-check"><input type="checkbox" data-nc="${at}"${drafts.noComment[at] ? ' checked' : ''}> ${tr('Pas de commentaire')}</label>
        ${settings?.provider === 'google' ? `<span class="gz-mic-note">${tr('Ta voix part chez Google pour être transcrite. Relis avant d’envoyer.')}</span>` : ''}</div>
      <div class="gz-modal-foot">
        ${at > 0 ? `<button class="gz-modal-btn gz-modal-btn--ghost" data-pstep="-1">← ${tr('Question précédente')}</button>` : ''}
        ${at < total - 1 ? `<button class="gz-modal-btn" data-pstep="1">${tr('Question suivante')} →</button>` : `<button class="gz-modal-btn" id="press-submit">${tr('Terminer la conférence')}</button>`}
      </div>
      <p class="gz-modal-note">${tr('Tes mots seront cités tels quels dans La Transversale, et repris par les journalistes dans les prochaines éditions.')}</p>`;
  } else if (view.pressIn) {
    body = `${head}<h2 id="gz-modal-title">${tr('Les journalistes s’installent…')}</h2><p class="gz-modal-note">${tr('Préparation des questions.')}</p>`;
  } else {
    body = `${head}${m?.score ? `<div class="gz-sb gz-modal-score">${side(m.home)}<b class="gz-sb-score">${m.score[0]}<i>-</i>${m.score[1]}</b>${side(m.away)}</div>` : `<p class="gz-modal-match">${esc(p.match)}</p>`}
      <h2 id="gz-modal-title">${tr('Les journalistes t’attendent en salle de presse.')}</h2>
      <p class="gz-modal-note">${tr('Salle de presse')} · ${esc(fmtDate(p.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${tr('tes mots seront cités tels quels')}</p>
      <div class="gz-modal-foot"><button class="gz-modal-btn" id="press-go">${p.questions ? tr('Reprendre') : tr('Y aller')}</button><button class="gz-modal-btn gz-modal-btn--ghost" data-press-close>${tr('Revenir plus tard')}</button><button class="gz-modal-skip" id="press-skip">${tr('Ne pas venir')}</button></div>`;
  }
  pressBox.innerHTML = `<div class="gz gz-modal" role="dialog" aria-modal="true" aria-labelledby="gz-modal-title">${body}</div>`;
  const root = pressBox.firstElementChild;
  gzTheme(root, s);
  root.querySelectorAll('[data-press-close]').forEach((b) => { b.onclick = closePressModal; });
  const go = root.querySelector('#press-go'), skip = root.querySelector('#press-skip');
  if (go) {
    go.onclick = () => {
      view.pressIn = true;
      paintPressModal();
      if (p.questions || pressLoading) return;
      pressLoading = true;
      live.openPress()
        .then((st) => { state = st; })
        .catch((err) => { toast(err.message, true); view.pressIn = false; })
        .finally(() => { pressLoading = false; paintPressModal(); });
    };
    go.focus();
  }
  if (skip) {
    skip.onclick = async () => {
      try { state = await live.skipPress(); closePressModal(); render(); toast(tr('Tu n’es pas venu à la conférence. Personne ne t’en tiendra rigueur.')); } catch (err) { toast(err.message, true); }
    };
  }
  if (!q) return;
  const answer = root.querySelector('.gz-answer');
  answer.oninput = () => { drafts.press[at] = answer.value; };
  if (!answer.disabled) { answer.focus(); answer.setSelectionRange(answer.value.length, answer.value.length); }
  root.querySelector('input[data-nc]').onchange = (ev) => { drafts.noComment[at] = ev.target.checked; stopDictation(true); paintPressModal(); };
  root.querySelectorAll('[data-pstep]').forEach((b) => { b.onclick = () => { stopDictation(true); view.pressStep = at + Number(b.dataset.pstep); paintPressModal(); }; });
  root.querySelectorAll('[data-mic]').forEach((b) => {
    b.onclick = () => {
      if (dictation) { stopDictation(); return; }
      startDictation(at, (text) => { const cur = (drafts.press[at] || '').trimEnd(); drafts.press[at] = cur ? `${cur} ${text}` : text; }, paintPressModal);
    };
  });
  if (dictation) paintMic();
  const submit = root.querySelector('#press-submit');
  if (submit) {
    submit.onclick = async () => {
      const answers = p.questions.map((_, i) => (drafts.noComment[i] ? '' : (drafts.press[i] || '').trim()));
      view.pressBusy = true;
      submit.disabled = true;
      submit.textContent = tr('Les journalistes rédigent…');
      try {
        state = await live.submitPress(answers);
        drafts.press = {};
        drafts.noComment = {};
        Object.assign(view, { pressStep: 0, pressIn: false, pressBusy: false, edition: null });
        closePressModal();
        // Le compte rendu vient de paraître : on l'ouvre.
        const last = state.editions.length - 1, count = state.editions[last]?.national?.length || 0;
        view.natArticle = count ? { edition: last, i: count - 1 } : null;
        render();
        gzScrollTo(0);
        toast(tr('Ta conférence de presse est dans La Transversale.'));
      } catch (err) {
        view.pressBusy = false;
        submit.disabled = false;
        submit.textContent = tr('Terminer la conférence');
        toast(err.message, true);
      }
    };
  }
}

// Dictée : le micro enregistre (deux minutes au plus), le son part chez Gemini à l'arrêt, et le texte s'ajoute à la réponse,
// modifiable avant l'envoi. Une dictée abandonnée (autre question, fenêtre fermée) ne part pas.
const DICTATION_MAX_SECONDS = 120;
let dictation = null;
const micClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function micHtml(i, disabled) {
  if (settings?.provider !== 'google') return '';
  return `<button class="gz-mic${dictation?.index === i ? ' on' : ''}" type="button" data-mic="${i}"${disabled ? ' disabled' : ''}>${hi('mic')}<span>${tr('Dicter')}</span></button>`;
}
// Le son en WAV mono 16 kHz, le format le plus sûr pour Gemini ; null s'il est trop court ou sans voix (rien n'est envoyé).
async function dictationWav(blob) {
  const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration < 0.4) return null;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  if (!pcm.some((v) => Math.abs(v) > 0.01)) return null;
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const tag = (at, s) => [...s].forEach((c, k) => out.setUint8(at + k, c.charCodeAt(0)));
  tag(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); tag(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); tag(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, k) => out.setInt16(44 + k * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
  return new Uint8Array(out.buffer);
}
function paintMic() {
  const btn = document.querySelector(`[data-mic="${dictation?.index}"]`);
  if (!btn) return false;
  btn.classList.toggle('on', dictation.phase === 'recording');
  btn.disabled = dictation.phase === 'sending';
  btn.querySelector('span').textContent = dictation.phase === 'sending' ? tr('Transcription…') : `${tr('Arrêter')} · ${micClock((Date.now() - dictation.since) / 1000)}`;
  return true;
}
function stopDictation(cancel = false) {
  if (!dictation || dictation.phase !== 'recording') return;
  dictation.cancelled = cancel;
  dictation.phase = 'sending';
  clearInterval(dictation.timer);
  dictation.recorder.stop();
  dictation.stream.getTracks().forEach((t) => t.stop());
  paintMic();
}
async function startDictation(index, onText, onDone) {
  if (dictation) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast(tr('Micro inaccessible : vérifie qu’il est branché et autorisé dans les paramètres de Windows (Confidentialité, Microphone).'), true);
    return;
  }
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  const d = dictation = { index, recorder, stream, phase: 'recording', since: Date.now(), cancelled: false, timer: null };
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    try {
      if (d.cancelled) return;
      const wav = await dictationWav(new Blob(chunks, { type: recorder.mimeType }));
      if (!wav) { toast(tr('Aucune voix détectée : rien n’a été envoyé.'), true); return; }
      const text = await live.transcribe(wav);
      if (text) onText(text); else toast(tr('Aucune voix détectée : rien n’a été ajouté.'), true);
    } catch (err) {
      toast(err.message, true);
    } finally {
      dictation = null;
      onDone();
    }
  };
  recorder.start();
  d.timer = setInterval(() => {
    if ((Date.now() - d.since) / 1000 >= DICTATION_MAX_SECONDS) stopDictation();
    else if (!paintMic()) stopDictation(true);
  }, 500);
  paintMic();
}

// ---------- Le journal des supporters : un blog de supporters, aux couleurs du club ----------

// Chaque édition garde le journal où elle a paru ; les anciennes, celui du premier club suivi.
function localPaperOf(ei) {
  const eds = state.editions;
  return eds[ei]?.paper || (state.pastPapers?.length && ei < eds.length - 1 ? state.pastPapers[0] : null) || state.localPaper || { name: tr('Journal local'), city: '' };
}

// Tous les billets du blog, du plus récent au plus ancien : { edition, i, a, date }.
// Les billets du blog, du plus récent au plus ancien ; dans une édition, l'ordre où le blog les a écrits.
function localArticles() {
  const out = [];
  // Billets sans texte (réponse vide de l'IA) : pas affichés.
  (state.editions || []).forEach((e, ei) => (e.local || []).forEach((a, i) => { if (String(a.body || '').trim()) out.push({ edition: ei, i, a, date: e.gameDate }); }));
  return out.sort((p, q) => String(q.date).localeCompare(String(p.date)) || q.edition - p.edition || p.i - q.i);
}

const fbSummary = (a, n = 220) => { const t = String(a.dek || a.body || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, t.lastIndexOf(' ', n))}…` : t; };
const fbDay = (iso) => fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
const fbOpen = (x) => `data-fbart="${x.edition}:${x.i}"`;
const fbInitials = (n) => esc(String(n || 'R').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
const fbMonth = (iso) => fmtDate(iso, { month: 'long', year: 'numeric' });

// Couleurs du club, tirées de son écusson (même calcul que src/world/clubColors.js) : par le processus principal
// pour les fichiers du jeu, sur un canevas pour les images intégrées (aperçu). En cache, puis la page se redessine.
const clubColorCache = {};
function fbDominant(px, w, h) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000))), bins = new Map();
  let light = 0, dark = 0; const ds = [0, 0, 0];
  const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4; if (px[i + 3] < 160) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (s > 0.3 && l > 0.12 && l < 0.88) {
      const hue = (max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60;
      const k = Math.floor(hue / 15) % 24, e = bins.get(k) || { k, n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
    } else if (l >= 0.6) light++; else { dark++; ds[0] += r; ds[1] += g; ds[2] += b; }
  }
  const ranked = [...bins.values()].sort((p, q) => q.n - p.n), top = ranked[0];
  const avg = (e) => hex(e.r / e.n, e.g / e.n, e.b / e.n), darkHex = dark ? hex(ds[0] / dark, ds[1] / dark, ds[2] / dark) : '#1b1b1b';
  if (!top || top.n < (dark + light) * 0.08) return { primary: darkHex, secondary: light >= dark ? '#ffffff' : '#9a9a9a' };
  const second = ranked.find((e) => e !== top && Math.min(Math.abs(e.k - top.k), 24 - Math.abs(e.k - top.k)) >= 3 && e.n >= top.n * 0.15);
  return { primary: avg(top), secondary: second ? avg(second) : light >= dark ? '#ffffff' : darkHex };
}
function clubColors(name) {
  if (clubColorCache[name] !== undefined) return clubColorCache[name];
  clubColorCache[name] = null;
  const page = Object.values(state.clubPages || {}).find((p) => (!p.kind || p.kind === 'national') && p.name === name);
  const done = (c) => {
    clubColorCache[name] = c || null;
    if (!c) return;
    if (current === 'huddle') hdPaintColors();
    else if (current === 'mail' && view.smDossier) { dsPaintColors(); smPaintColors(); }
    else if (current === 'pantheon') ptPaintColors();
    else if (current === 'tribune') smPaintColors();
    else if (current === 'mail' && !view.smInfluence) smPaintColors();
    else if (current === 'local' || current === 'stats' || (current === 'mail' && view.smInfluence)) render();
  };
  if (!page?.emblem) return null;
  if (String(page.emblem).startsWith('data:')) {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); done(fbDominant(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height)); } catch { done(null); } };
    img.src = page.emblem;
  } else if (live.emblemColors) live.emblemColors(page.emblem).then(done).catch(() => done(null));
  return null;
}
// Couleur lisible sur un fond : texte blanc sur les couleurs sombres, noir sur les claires.
const fbInk = (hex) => { const v = parseInt(String(hex).slice(1), 16); const l = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; return l > 0.6 ? '#141414' : '#ffffff'; };
function fbAccent(hex) {
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (f) => 0.2126 * lin(rgb[0] * f) + 0.7152 * lin(rgb[1] * f) + 0.0722 * lin(rgb[2] * f);
  let f = 1;
  while (f > 0.2 && 1.05 / (lum(f) + 0.05) < 4.5) f -= 0.05;
  return `#${rgb.map((v) => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`;
}
// En thème sombre, la même couleur éclaircie jusqu'à rester lisible sur la page sombre (contraste 4,5 sur #15161c).
const accentOnDark = (hex) => (COLOR_RE.test(String(hex)) ? pushUntil(hex.toLowerCase(), '#ffffff', (c) => contrastOf(c, '#15161c') >= 4.5) : '#e8e8ea');
function applyClubColors(root, name) {
  const c = clubColors(name);
  if (!c) return;
  root.style.setProperty('--fb-club', c.primary);
  root.style.setProperty('--fb-accent', fbAccent(c.primary));
  root.style.setProperty('--fb-accent-dark', accentOnDark(c.primary));
  root.style.setProperty('--fb-club-2', c.secondary);
  root.style.setProperty('--fb-club-ink', fbInk(c.primary));
}

// Position du premier mot qui désigne un club ou une personne dans un texte (Infinity s'il n'y est pas).
const fbCitedAt = (text, words) => Math.min(...words.map((w) => { const m = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').exec(text); return m ? m.index : Infinity; }));

// De quoi parle un billet, d'après son titre et son chapeau, à défaut le début du texte : la conférence de presse, le mercato,
// un match de son club, une personne du club, le championnat, sinon le club. Le score n'est donné que s'il figure dans le
// billet : celui de la sauvegarde peut différer après une prolongation.
function fbSubject(a, date) {
  const s = state.snapshot, club = s.club.name, league = s.league?.name || '';
  const head = a.headline, dek = a.dek || '', body = String(a.body || ''), all = `${head} ${dek} ${body}`;
  const fixtures = (s.fixtures || []).filter((f) => f.home === club || f.away === club);
  const rivals = [...new Set([...(s.table || []).map((r) => r.team), ...fixtures.flatMap((f) => [f.home, f.away])])].filter((t) => t && t !== club);
  const firstRival = (text) => gzClubsCited(text, rivals, [club, ...rivals])[0];
  const coach = s.coaches?.mine;
  const people = [coach, s.player?.name, ...(s.squad || []).map((p) => p.name)].filter(Boolean);
  const personIn = (text) => people.find((n) => text.includes(n)) || people.find((n) => { const last = n.split(/\s+/).pop(); return last.length >= 4 && fbCitedAt(text, [last]) < Infinity; });
  const person = personIn(head) || personIn(dek);
  const rival = firstRival(head) || firstRival(dek) || (person ? null : firstRival(body.slice(0, 400)));
  const against = rival ? fixtures.filter((f) => f.home === rival || f.away === rival) : [];
  const match = [...against].reverse().find((f) => f.date <= date) || against[0] || null;
  const said = (x, y) => new RegExp(`(^|[^\\d])${x}\\s*(-|–|à)\\s*${y}($|[^\\d])`).test(all);
  // Même règle que La Transversale : en championnat, le score du jeu ; en coupe, seulement si le billet donne le même.
  const score = match?.played && match.score && (match.competition === league || said(match.score[0], match.score[1]) || said(match.score[1], match.score[0])) ? match.score : null;
  const teams = match ? [match.home, match.away] : rival ? [club, rival] : [club];
  const about = match ? `${gzShort(match.competition)} · ${gzDay(match.date)}` : '';
  // Un billet qui parle d'abord de lui : son visage, comme dans La Transversale (son choix, avant tout le reste).
  if (gzAboutMe(head, [...people, ...(s.rosters?.opponent?.players || [])])) return { kind: 'me', teams: [club], person: s.player.name, caption: s.player.name };
  if (/presse|press/i.test(a.kicker || '')) return { kind: 'press', teams, caption: tr('Conférence de presse') };
  if (/mercato|transfert|recrue|recrutement/i.test(head)) return { kind: 'mercato', teams: [club], caption: tr('Mercato') };
  if (match || rival) return { kind: 'match', teams, score, played: Boolean(match?.played && match.date <= date), caption: about || gzDay(date) };
  if (person) return { kind: 'person', teams: [club], person, caption: person === coach ? tr('Entraîneur') : tr('Joueur') };
  if (league && (all.includes(league) || all.includes(gzShort(league)))) return { kind: 'league', teams: [club], league, caption: gzShort(league) };
  return { kind: 'club', teams: [club], caption: gzDay(date) };
}

const fbAbouts = new WeakMap();
function fbAbout(a, date) {
  const known = fbAbouts.get(a);
  if (known?.lang === lang()) return known.v;
  const v = fbSubject(a, date);
  fbAbouts.set(a, { lang: lang(), v });
  return v;
}

// La vignette d'un billet : les écussons sur les couleurs du club, avec ce dont il parle (le score, la personne, le micro de
// la conférence de presse, le mercato, le championnat) et une légende.
function fbVignette(a, date, cls = '') {
  const v = fbAbout(a, date);
  const crest = (n) => crestHtml(n, ' fb-banner-crest');
  const badge = (icon) => `<span class="fb-banner-badge">${hi(icon)}</span>`;
  const [one, two] = v.teams;
  let inner = crest(one), solo = true;
  // Un match joué sans score sûr affiche « Fin », comme Mails et La Transversale ; « vs » reste aux matchs à venir.
  if (v.kind === 'match' && two) { solo = false; inner = `${crest(one)}${v.score ? `<b class="fb-banner-score">${v.score[0]}<i>-</i>${v.score[1]}</b>` : `<span class="fb-banner-vs">${v.played ? tr('Fin') : 'vs'}</span>`}${crest(two)}`; }
  if (v.kind === 'press') { solo = !two; inner = `${crest(one)}${badge('mic')}${two ? crest(two) : ''}`; }
  if (v.kind === 'mercato') inner = `${crest(one)}${badge('swap')}`;
  if (v.kind === 'person') inner = `${crest(one)}<span class="fb-banner-name">${esc(v.person)}</span>`;
  if (v.kind === 'me') inner = `<span class="fb-banner-face">${myFaceIn(crest(one))}</span><span class="fb-banner-mark">${crestHtml(one)}</span>`;
  if (v.kind === 'league') { const logo = compEmblem(v.league); inner = `${crest(one)}${logo ? `<span class="fb-banner-plate"><img src="${esc(logo)}" alt=""></span>` : `<span class="fb-banner-name">${esc(gzShort(v.league))}</span>`}`; }
  return `<div class="fb-banner${cls}"><div class="fb-banner-crests${solo && v.kind === 'club' ? ' solo' : ''}">${inner}</div><span class="fb-banner-cap">${esc(v.caption)}</span></div>`;
}

// Le blog défile dans sa carte, sous sa barre du haut. Sa position est gardée : la page se redessine à chaque action.
const fbBox = () => document.querySelector('.site-local .fb-scroll');
function fbScrollTo(top, smooth = false) {
  const box = fbBox();
  if (!box) { view.fbY = 0; viewScrollTo(0); return; }
  box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  view.fbY = smooth ? top : box.scrollTop;
}
const fbResetFilters = () => Object.assign(view, { blogCat: null, blogMonth: null, blogQ: '', blogPage: 0 });

// Réactions des supporters sur Kop (le « mur » du blog et les commentaires d'un billet).
function fbFanPosts(date = null, max = 5) {
  const s = state.snapshot, club = s.club.name, short = s.club.short || '';
  const fan = (p) => ['fan', 'rival', 'meme'].includes(p.author?.type) && !p.official;
  const about = (p) => p.text.includes(club) || (short && p.text.includes(short)) || /#\w/.test(p.text);
  let list = state.feed.filter((p) => fan(p) && (!date || p.gameDate === date));
  const focused = list.filter(about);
  if (focused.length >= 2) list = focused;
  return list.slice(-max).reverse();
}
const fbFanInitial = (p) => esc(String(p.author.name || p.author.handle || '?').trim()[0] || '?');
const fbComment = (p) => `<li class="fb-comment"><span class="fb-avatar fb-avatar--sm">${fbFanInitial(p)}</span>
  <div><div class="fb-comment-head"><b>${esc(p.author.name || p.author.handle)}</b> <span>@${esc(p.author.handle)} · ${esc(fbDay(p.gameDate))}</span></div><p>${linkify(p.text)}</p></div></li>`;

// Les rubriques : ce dont parle chaque billet, d'après son texte. Le chapeau de l'IA n'en donne presque jamais.
const FB_RUBRIC = { match: 'Matchs', press: 'Conférence de presse', mercato: 'Mercato', person: 'Effectif', league: 'Championnat', club: 'Actu du club' };
const fbRubricName = (kind) => tr(FB_RUBRIC[kind]);
const fbKind = (x) => fbAbout(x.a, x.date).kind;
const fbTag = (x) => `<span class="fb-tag">${esc(fbRubricName(fbKind(x)))}</span>`;
const fbNorm = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const fbCap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const fbReactions = (date) => fbFanPosts(date, Infinity).length;
// Le temps de lecture et les réactions : les seuls chiffres vrais d'un billet (le blog ne compte pas ses lecteurs).
const fbStats = (x) => { const n = fbReactions(x.date); return `<span class="fb-stats"><span>${hi('clock')}${tr('{n} min', { n: readTime(x.a) })}</span><span title="${esc(trn(n, '{n} réaction', '{n} réactions'))}">${hi('chat')}${n}</span></span>`; };

// Un titre de section : le premier mot en gras (les deux premiers après un article), le reste en clair.
function fbTitle(text) {
  const w = String(text).split(' '), n = w[0].length <= 3 ? 2 : 1;
  return `<b>${esc(w.slice(0, n).join(' '))}</b>${w.length > n ? ` ${esc(w.slice(n).join(' '))}` : ''}`;
}
const fbHead = (text, more = '') => `<div class="fb-h"><h2>${fbTitle(text)}</h2>${more}</div>`;
const fbSeeAll = (tab) => `<a class="fb-all" data-fbtab="${tab}">${tr('Voir tout')}</a>`;

// La barre du haut : le blog, ses pages, le bouton vers Kop, la recherche dans les billets.
function fbHeader(paper, s, tab) {
  const nav = (k, icon, label) => `<a data-fbtab="${k}"${tab === k ? ' aria-current="page"' : ''}>${hi(icon)}<span>${label}</span></a>`;
  return `<header class="fb-header">
    <a class="fb-logo" data-fbhome>${crestHtml(s.club.name, ' fb-logo-crest')}<b class="fb-title">${esc(paper.name)}</b></a>
    <nav class="fb-nav">${nav('home', 'home', tr('Accueil'))}${nav('matches', 'calendar', tr('Matchs'))}${nav('table', 'poll', tr('Classement'))}${nav('wall', 'chat', tr('Le mur des supporters'))}</nav>
    <a class="fb-btn fb-header-cta" data-fbtribune>${tr('Réagir sur Kop')}</a>
    <label class="fb-search"><input type="search" id="fb-q" value="${esc(view.blogQ || '')}" placeholder="${tr('Rechercher un billet')}" aria-label="${tr('Rechercher un billet')}" autocomplete="off">${hi('search')}</label>
  </header>`;
}

// La colonne de gauche : le joueur et ses chiffres, les rubriques, les archives.
function fbSide(s, posts, cat, month) {
  const st = s.stats?.total, eds = state.editions;
  const kinds = new Map(), months = new Map();
  for (const x of posts) {
    const k = fbKind(x); kinds.set(k, (kinds.get(k) || 0) + 1);
    const m = x.date.slice(0, 7); months.set(m, (months.get(m) || 0) + 1);
  }
  const row = (attr, value, label, n, on) => `<li><a ${attr}="${esc(value)}"${on ? ' aria-current="true"' : ''}><span>${esc(label)}</span><em>${n}</em></a></li>`;
  return `<aside class="fb-side">
    <section class="fb-panel fb-me">
      <div class="fb-me-top"><span class="fb-avatar">${myFaceIn(fbInitials(s.player.name))}</span>
        <button class="fb-me-cog" data-fbsettings title="${tr('Réglages')}" aria-label="${tr('Réglages')}">${sfi('cog')}</button></div>
      <div class="fb-me-name"><b>${esc(s.player.name)}</b>${st?.avgRating ? ratingChip(st.avgRating) : ''}</div>
      ${st ? `<p>${trn(st.apps, '{n} match', '{n} matchs', { n: fmtNum(st.apps) })} · ${trn(st.goals, '{n} but', '{n} buts', { n: fmtNum(st.goals) })} · ${trn(st.assists, '{n} passe déc.', '{n} passes déc.', { n: fmtNum(st.assists) })}</p>` : ''}
    </section>
    <section class="fb-panel fb-list fb-rubs"><h3>${tr('Rubriques')}</h3><ul>
      ${row('data-fbcat', '', tr('Tous les billets'), posts.length, !cat && !month && !view.locArticle && !view.fbTab)}
      ${Object.keys(FB_RUBRIC).filter((k) => kinds.has(k)).map((k) => row('data-fbcat', k, fbRubricName(k), kinds.get(k), k === cat)).join('')}
    </ul></section>
    ${months.size ? `<section class="fb-panel fb-list fb-arch"><h3>${tr('Archives')}</h3><ul>
      ${[...months].slice(0, 12).map(([k, n]) => row('data-fbmonth', k, fbCap(fbMonth(`${k}-01`)), n, k === month)).join('')}
    </ul>${eds.length > 1 ? `<label class="fb-select" title="${tr('Archives')}">${editionPicker(eds)}</label>` : ''}</section>` : ''}
  </aside>`;
}

// Un match, à la manière du modèle : deux équipes l'une sous l'autre, le score au bout de la ligne. En coupe, le score de la
// sauvegarde peut être faux après une prolongation : ni score ni verdict.
function fbMatchCard(m, s) {
  const scored = m.played && m.score && m.competition === s.league?.name;
  const me = m.homeRef === s.club.ref ? 0 : 1;
  const verdict = scored && (m.score[me] > m.score[1 - me] ? [tr('Victoire'), 'win'] : m.score[me] < m.score[1 - me] ? [tr('Défaite'), 'loss'] : [tr('Nul'), 'draw']);
  const days = Math.round((Date.parse(`${m.date}T12:00:00Z`) - Date.parse(`${s.gameDate}T12:00:00Z`)) / 864e5);
  const status = m.played ? tr('Terminé') : days === 0 ? tr('Jour de match') : days === 1 ? tr('Demain') : days > 1 ? tr('J-{n}', { n: days }) : tr('Prochain match');
  const team = (name, i) => `<div class="fb-m-team">${crestHtml(name, ' fb-m-crest')}<b>${esc(name)}</b>${scored ? `<strong>${m.score[i]}</strong>` : ''}</div>`;
  const where = [`${gzShort(m.competition)}${m.round && m.competition === s.league?.name ? ` · ${roundLabel(m.round)}` : ''}`, fmtDate(m.date, m.played ? { day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' }), !m.played && m.hour != null ? hh(m.hour) : '', m.stadium || ''].filter(Boolean).join(' · ');
  return `<article class="fb-m" role="link" tabindex="0" data-fbmatch="${mailMatchKey(m)}" title="${tr('Voir le match')}">
    ${team(m.home, 0)}
    <div class="fb-m-vs"><span>VS</span><small>${esc(status)}</small>${verdict ? `<i class="fb-verdict ${verdict[1]}">${verdict[0]}</i>` : ''}</div>
    ${team(m.away, 1)}
    <p class="fb-m-note">${esc(where)}</p>
    ${m.played && m.motm?.name ? `<p class="fb-m-note">${tr('Homme du match')}${colon()} <b>${esc(m.motm.name)}</b></p>` : ''}
  </article>`;
}

// La colonne de droite : les matchs, le classement autour du club, la forme, le mur. Une page ne se répète pas à côté d'elle-même.
function fbRail(s, tab) {
  const table = s.table || [], mine = table.find((r) => r.mine), form = mine?.form || [];
  const last = s.last?.played ? s.last : null, next = s.next || null;
  // Classement autour du club : les 3 premiers, puis le club et ses voisins.
  const around = mine ? table.filter((r) => r.pos <= 3 || Math.abs(r.pos - mine.pos) <= 2) : table.slice(0, 6);
  const wall = fbFanPosts(null, 3);
  return `<aside class="fb-rail">
    ${tab !== 'matches' && (last || next) ? `<section class="fb-rail-sec">${fbHead(tr('Matchs'), fbSeeAll('matches'))}<div class="fb-rail-m">${[last, next].filter(Boolean).map((m) => fbMatchCard(m, s)).join('')}</div></section>` : ''}
    ${tab !== 'table' && table.length ? `<section class="fb-rail-sec">${fbHead(`${tr('Classement')} · ${gzShort(s.league?.name || '')}`, fbSeeAll('table'))}<div class="fb-panel fb-widget">
      <table class="fb-table"><thead><tr><th></th><th>${tr('Club')}</th><th>${tr('J')}</th><th>${tr('Pts')}</th></tr></thead><tbody>
      ${around.map((r, k) => `${k && r.pos - around[k - 1].pos > 1 ? '<tr class="fb-gap"><td colspan="4">…</td></tr>' : ''}<tr class="${r.mine ? 'mine' : ''}"><td>${r.pos}</td><td>${crestHtml(r.team, ' crest-s')}${esc(r.team)}</td><td>${r.p}</td><td><b>${r.pts}</b></td></tr>`).join('')}
      </tbody></table></div></section>` : ''}
    ${form.length ? `<section class="fb-rail-sec">${fbHead(tr('La forme'))}<div class="fb-panel fb-widget">
      <div class="fb-form">${form.map((f) => `<i class="fb-f fb-f-${esc(f)}">${esc(formLetter(f))}</i>`).join('')}</div><p class="fb-w-meta">${tr('Les cinq derniers matchs de championnat')}</p></div></section>` : ''}
    ${tab !== 'wall' ? `<section class="fb-rail-sec">${fbHead(tr('Le mur des supporters'), fbSeeAll('wall'))}
      ${wall.length ? `<div class="fb-wall-rows">${wall.map((p) => `<article class="fb-wall-row" data-fbtribune><span class="fb-avatar fb-avatar--sm">${fbFanInitial(p)}</span><div><p>${linkify(p.text)}</p><small>${esc(p.author.name || p.author.handle)} · ${esc(gzDay(p.gameDate))}</small></div></article>`).join('')}</div>` : `<p class="fb-w-meta">${tr('Rien pour l’instant sur Kop.')}</p>`}
    </section>` : ''}
  </aside>`;
}

// Le pied de la carte : le blog, ses pages, les autres sites, les mentions.
function fbFooter(paper, s) {
  const year = String(s.gameDate || '').slice(0, 4);
  const writer = state.writers?.local_beat_writer || tr('la rédaction');
  const about = paper.city ? tr('{paper}, c’est le blog des supporters de {club}, depuis {city} : avant-matchs, réactions à chaud, mercato et coups de gueule. Les billets sont signés {writer}.', { paper: paper.name, club: s.club.name, city: paper.city, writer }) : tr('{paper}, c’est le blog des supporters de {club} : avant-matchs, réactions à chaud, mercato et coups de gueule. Les billets sont signés {writer}.', { paper: paper.name, club: s.club.name, writer });
  return `<footer class="fb-footer fb-panel">
    <div class="fb-footer-top">
      <div class="fb-footer-brand"><a class="fb-logo" data-fbhome>${crestHtml(s.club.name, ' fb-logo-crest')}<b class="fb-title">${esc(paper.name)}</b></a>
        <p>${esc(about)}</p><p>${tr('Blog de supporters non officiel, sans lien avec le club.')}</p></div>
      <div class="fb-foot-col"><h4>${tr('Le blog')}</h4><ul><li><a data-fbtab="home">${tr('Accueil')}</a></li><li><a data-fbtab="matches">${tr('Matchs')}</a></li><li><a data-fbtab="table">${tr('Classement')}</a></li><li><a data-fbtab="wall">${tr('Le mur des supporters')}</a></li></ul></div>
      <div class="fb-foot-col"><h4>${tr('Sur LifeLegend')}</h4><ul><li><a data-fbtribune>Kop</a></li><li><a data-fbsite="national">La Transversale</a></li><li><a data-fbsite="stats">Scoreline</a></li></ul></div>
    </div>
    <p class="fb-footer-bottom">© ${esc(year)} ${esc(paper.name)} · ${tr('Le blog des supporters de {club}', { club: esc(s.club.name) })} · ${tr('Blog fictif de LifeLegend, billets écrits par l’IA à partir de ta sauvegarde.')}</p>
  </footer>`;
}

// Une carte de billet : l'illustration, la rubrique, le temps de lecture, le titre, le résumé et la date.
const fbCard = (x, mini = false) => `<article class="fb-card${mini ? ' fb-card--mini' : ''}"><a class="fb-card-art" ${fbOpen(x)}>${fbVignette(x.a, x.date, ' fb-banner--card')}</a>
  <div class="fb-card-top">${fbTag(x)}${fbStats(x)}</div>
  <h3><a ${fbOpen(x)}>${esc(x.a.headline)}</a></h3>${mini ? '' : `<p>${esc(fbSummary(x.a, 140))}</p><span class="fb-card-date">${esc(fbDay(x.date))}</span>`}</article>`;

// Le grand billet : l'illustration, la rubrique et les chiffres, le titre et son bouton, le résumé, la signature.
const fbHero = (x) => `<article class="fb-hero">
    <a class="fb-hero-art" ${fbOpen(x)}>${fbVignette(x.a, x.date)}</a>
    <div class="fb-hero-text">
      <div class="fb-card-top">${fbTag(x)}${fbStats(x)}</div>
      <div class="fb-hero-row"><h1><a ${fbOpen(x)}>${esc(x.a.headline)}</a></h1><a class="fb-act fb-act--club" ${fbOpen(x)}>${tr('Lire le billet')}</a></div>
      <p class="fb-hero-sum">${esc(fbSummary(x.a, 300))}</p>
      <p class="fb-meta"><span class="fb-avatar fb-avatar--xs">${fbInitials(x.a.author)}</span>${esc(x.a.author || tr('La rédaction'))} · ${esc(fbDay(x.date))}</p>
    </div>
  </article>`;

// Les billets du blog (pas ceux du blog d'un ancien club), du plus récent au plus ancien.
const fbBlogPosts = (idx, paper) => localArticles().filter((x) => x.edition <= idx && localPaperOf(x.edition).name === paper.name);

// Accueil : le grand billet, puis les autres. Une rubrique, un mois ou une recherche ne font que restreindre la liste.
function fbHomeMain(e, s, posts, cat, month) {
  const q = fbNorm(view.blogQ);
  const hits = posts.filter((x) => (!cat || fbKind(x) === cat) && (!month || x.date.startsWith(month)) && (!q || fbNorm(`${x.a.headline} ${x.a.dek || ''} ${x.a.body}`).includes(q)));
  const [first, ...others] = hits;
  const rest = view.blogOld ? [...others].sort((p, q) => String(p.date).localeCompare(String(q.date)) || p.edition - q.edition || p.i - q.i) : others;
  const PER = 8, shown = rest.slice(0, PER * ((view.blogPage || 0) + 1));
  const order = rest.length > 1 ? `<div class="fb-seg"><button data-fborder="new" aria-pressed="${!view.blogOld}">${tr('Plus récents')}</button><button data-fborder="old" aria-pressed="${Boolean(view.blogOld)}">${tr('Plus anciens')}</button></div>` : '';
  const filtered = Boolean(q || cat || month);
  const title = q ? tr('Résultats pour « {q} »', { q: String(view.blogQ).trim() }) : cat ? fbRubricName(cat) : month ? fbCap(fbMonth(`${month}-01`)) : tr('À la une');
  const fc = factcheckHtml(e).replace('class="factcheck', 'class="fb-fc factcheck');
  return `${fbHead(title, filtered ? `<a class="fb-all" data-fbcat="">← ${tr('Tous les billets')}</a>` : `<span class="fb-h-date">${esc(fmtDate(e.gameDate))}</span>`)}
    ${first ? fbHero(first) : `<div class="fb-empty">${posts.length ? tr('Aucun billet ne correspond.') : tr('Pas encore de billet sur ce blog.')}</div>`}
    ${filtered ? '' : fc}
    ${shown.length ? `<section class="fb-sec">${fbHead(view.blogOld ? tr('Les billets') : tr('Derniers billets'), order)}<div class="fb-grid">${shown.map((x) => fbCard(x)).join('')}</div>
      ${rest.length > shown.length ? `<div class="fb-more-row"><button class="fb-act" data-fbmore>${tr('Voir plus')}</button></div>` : ''}</section>` : ''}`;
}

// Page « Matchs » : ce qui vient, puis ce qui s'est joué.
function fbMatchesMain(s) {
  const club = s.club.name, all = (s.fixtures || []).filter((f) => f.home === club || f.away === club).sort((a, b) => a.date.localeCompare(b.date));
  const up = all.filter((f) => !f.played).slice(0, 6), done = all.filter((f) => f.played).reverse().slice(0, 12);
  return `${up.length ? `<section>${fbHead(tr('À venir'))}<div class="fb-grid">${up.map((m) => fbMatchCard(m, s)).join('')}</div></section>` : ''}
    ${done.length ? `<section class="${up.length ? 'fb-sec' : ''}">${fbHead(tr('Résultats'))}<div class="fb-grid">${done.map((m) => fbMatchCard(m, s)).join('')}</div></section>` : ''}`;
}

// Page « Classement » : le championnat en entier.
function fbTableMain(s) {
  const table = s.table || [];
  const diff = (r) => { const d = r.gf - r.ga; return d > 0 ? `+${d}` : String(d); };
  return `${fbHead(`${tr('Classement')} · ${gzShort(s.league?.name || '')}`)}<div class="fb-panel fb-full"><table class="fb-table fb-table--full"><thead><tr><th></th><th>${tr('Club')}</th><th>${tr('J')}</th><th>${tr('G')}</th><th>${tr('N')}</th><th>${tr('P')}</th><th>${tr('BP')}</th><th>${tr('BC')}</th><th>${tr('Diff')}</th><th>${tr('Pts')}</th><th>${tr('Forme')}</th></tr></thead><tbody>
    ${table.map((r) => `<tr class="${r.mine ? 'mine' : ''}"><td>${r.pos}</td><td>${crestHtml(r.team, ' crest-s')}${esc(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${diff(r)}</td><td><b>${r.pts}</b></td><td><span class="fb-form fb-form--s">${(r.form || []).map((f) => `<i class="fb-f fb-f-${esc(f)}">${esc(formLetter(f))}</i>`).join('')}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}

// Page « Le mur des supporters » : ce que disent les supporters sur Kop.
function fbWallMain(s) {
  const wall = fbFanPosts(null, 12);
  return `${fbHead(tr('Le mur des supporters'))}<p class="fb-lead">${tr('Ce que les supporters de {club} disent sur Kop.', { club: esc(s.club.name) })}</p>
    ${wall.length ? `<div class="fb-grid">${wall.map((p) => `<article class="fb-wall-card" data-fbtribune><span class="fb-wall-date">${esc(fbDay(p.gameDate))}</span><p>${linkify(p.text)}</p>
      <div class="fb-wall-who"><span class="fb-avatar fb-avatar--sm">${fbFanInitial(p)}</span><b>${esc(p.author.name || p.author.handle)}</b></div></article>`).join('')}</div>` : `<div class="fb-empty">${tr('Rien pour l’instant sur Kop.')}</div>`}
    <div class="fb-more-row"><button class="fb-btn" data-fbtribune>${tr('Réagir sur Kop')}</button></div>`;
}

function renderLocal(page) {
  const liveFb = fbBox();
  if (liveFb) view.fbY = liveFb.scrollTop;
  const eds = state?.editions || [];
  if (!eds.length) { page.innerHTML = needSync(); return; }
  if (view.locArticle) { renderLocalArticle(page); return; }
  const idx = view.edition ?? eds.length - 1;
  const e = eds[idx], s = state.snapshot, paper = localPaperOf(idx);
  const posts = fbBlogPosts(idx, paper);
  const tab = view.fbTab || 'home';
  const cat = FB_RUBRIC[view.blogCat] && posts.some((x) => fbKind(x) === view.blogCat) ? view.blogCat : null;
  const month = posts.some((x) => x.date.startsWith(view.blogMonth)) ? view.blogMonth : null;
  const main = tab === 'matches' ? fbMatchesMain(s) : tab === 'table' ? fbTableMain(s) : tab === 'wall' ? fbWallMain(s) : fbHomeMain(e, s, posts, cat, month);
  page.innerHTML = `<div class="fb">
    ${fbHeader(paper, s, tab)}
    <div class="fb-scroll"><div class="fb-cols">
      ${fbSide(s, posts, tab === 'home' ? cat : null, tab === 'home' ? month : null)}
      <div class="fb-main">${main}</div>
      ${fbRail(s, tab)}
      </div>
      ${fbFooter(paper, s)}
    </div>
  </div>`;
  bindLocal(page);
}

// Page d'un billet : la rubrique, l'illustration, les chiffres, le titre et ses boutons, la signature, le texte, l'auteur,
// les réactions, les billets voisins ; à droite, ce qu'il y a d'autre à lire.
function renderLocalArticle(page) {
  const { edition, i } = view.locArticle;
  const e = state.editions[edition];
  const a = e?.local?.[i];
  if (!a) { view.locArticle = null; renderLocal(page); return; }
  const s = state.snapshot;
  const paper = localPaperOf(edition);
  const x = { edition, i, a, date: e.gameDate };
  const isQuote = (p) => /^[«“]/.test(p) && /[»”]\s*[.!?]?$/.test(p);
  const body = String(a.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => (isQuote(p) ? `<blockquote>${esc(p)}</blockquote>` : `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)).join('');
  const same = localArticles().filter((y) => localPaperOf(y.edition).name === paper.name);
  const pos = same.findIndex((y) => y.edition === edition && y.i === i);
  const newer = same[pos - 1], older = same[pos + 1];
  const kind = fbKind(x), others = same.filter((y) => !(y.edition === edition && y.i === i));
  // À lire aussi : la même rubrique d'abord.
  const related = [...others.filter((y) => fbKind(y) === kind), ...others.filter((y) => fbKind(y) !== kind)].slice(0, 3);
  const total = fbReactions(e.gameDate), comments = fbFanPosts(e.gameDate, 6);
  page.innerHTML = `<div class="fb">
    ${fbHeader(paper, s, null)}
    <div class="fb-scroll"><div class="fb-cols">
      ${fbSide(s, fbBlogPosts(view.edition ?? state.editions.length - 1, paper), kind, null)}
      <div class="fb-main">
        ${fbHead(fbRubricName(kind), `<a class="fb-all" data-fbback>← ${tr('Tous les billets')}</a>`)}
        <article class="fb-hero fb-hero--post">
          <div class="fb-hero-art">${fbVignette(a, e.gameDate)}</div>
          <div class="fb-hero-text">
            <div class="fb-card-top">${fbTag(x)}${fbStats(x)}</div>
            <div class="fb-hero-row"><h1>${esc(a.headline)}</h1>
              <div class="fb-acts"><button class="fb-act" data-fbcopy="${esc(`${a.headline} — ${paper.name}`)}">${hi('clipboard')}${tr('Copier le titre')}</button><button class="fb-act fb-act--kop" data-fbtribune>${hi('share')}${tr('Partager sur Kop')}</button></div></div>
            ${a.dek ? `<p class="fb-hero-sum">${esc(a.dek)}</p>` : ''}
            <p class="fb-meta"><span class="fb-avatar fb-avatar--xs">${fbInitials(a.author)}</span><span>${tr('Par {who}', { who: `<b>${esc(a.author || tr('la rédaction'))}</b>` })} · ${esc(fbDay(e.gameDate))} · ${tr('{n} min de lecture', { n: readTime(a) })}</span></p>
          </div>
        </article>
        <div class="fb-content">${body}</div>
        <div class="fb-panel fb-author"><span class="fb-avatar fb-avatar--lg">${fbInitials(a.author)}</span><div><b>${esc(a.author || tr('La rédaction'))}</b>
          <p>${tr('Plume de {paper}, supporter de {club}. Avant-matchs, réactions à chaud et coups de gueule.', { paper: esc(paper.name), club: esc(s.club.name) })}</p></div></div>
        <section class="fb-panel fb-reactions"><h3>${tr('Les réactions des supporters')} <span>(${tr('{n}, sur Kop', { n: total })})</span></h3>
          ${comments.length ? `<ul class="fb-comments">${comments.map(fbComment).join('')}</ul>` : `<p class="fb-w-meta">${tr('Pas encore de réaction.')}</p>`}
          <button class="fb-btn" data-fbtribune>${tr('Réagir sur Kop')}</button></section>
        <nav class="fb-postnav">${newer ? `<a ${fbOpen(newer)}><span>← ${tr('Billet suivant')}</span><b>${esc(newer.a.headline)}</b></a>` : '<span></span>'}${older ? `<a class="right" ${fbOpen(older)}><span>${tr('Billet précédent')} →</span><b>${esc(older.a.headline)}</b></a>` : '<span></span>'}</nav>
      </div>
      <aside class="fb-rail">${related.length ? `<section class="fb-rail-sec">${fbHead(tr('À lire aussi sur le blog'), `<a class="fb-all" data-fbback>${tr('Voir tout')}</a>`)}<div class="fb-rail-m">${related.map((y) => fbCard(y, true)).join('')}</div></section>` : ''}</aside>
      </div>
      ${fbFooter(paper, s)}
    </div>
  </div>`;
  bindLocal(page);
}

// Le centre et la droite défilent ensemble ; le plus court s'arrête sur sa fin : il ne laisse jamais de vide à côté de l'autre.
let fbColsWatch = null;
function fbFitColumns(box, cols) {
  const fit = () => { const pad = parseFloat(getComputedStyle(box).paddingTop) * 2; for (const c of cols) c.style.setProperty('--fb-stick', `${Math.min(0, box.clientHeight - c.offsetHeight - pad)}px`); };
  fbColsWatch?.disconnect();
  fbColsWatch = new ResizeObserver(fit);
  for (const el of [box, ...cols]) fbColsWatch.observe(el);
  fit();
}

function bindLocal(page) {
  const root = page.querySelector('.fb'), box = page.querySelector('.fb-scroll');
  applyClubColors(root, state.snapshot.club.name);
  fbFitColumns(box, [page.querySelector('.fb-main'), page.querySelector('.fb-rail')]);
  box.scrollTop = view.fbY || 0;
  box.onscroll = () => { view.fbY = box.scrollTop; };
  const on = (attr, fn) => page.querySelectorAll(`[${attr}]`).forEach((el) => { el.onclick = () => fn(el); });
  on('data-fbart', (a) => {
    const [edition, i] = a.dataset.fbart.split(':').map(Number);
    // D'un billet à l'autre, le retour reste celui de la liste.
    if (!view.locArticle) view.locBack = box.scrollTop;
    view.locArticle = { edition, i };
    render();
    fbScrollTo(0);
  });
  on('data-fbhome', () => { const plain = !view.locArticle && !view.fbTab && !view.blogCat && !view.blogMonth && !view.blogQ; view.locArticle = null; view.fbTab = null; fbResetFilters(); render(); fbScrollTo(0, plain); });
  on('data-fbback', () => { view.locArticle = null; render(); fbScrollTo(view.locBack || 0); });
  on('data-fbtab', (a) => { const k = a.dataset.fbtab; view.locArticle = null; view.fbTab = k === 'home' ? null : k; if (k === 'home') fbResetFilters(); render(); fbScrollTo(0); });
  on('data-fbcat', (a) => { fbResetFilters(); view.blogCat = a.dataset.fbcat || null; view.locArticle = null; view.fbTab = null; render(); fbScrollTo(0); });
  on('data-fbmonth', (a) => { const k = a.dataset.fbmonth; fbResetFilters(); view.blogMonth = k; view.locArticle = null; view.fbTab = null; render(); fbScrollTo(0); });
  on('data-fbmore', () => { view.blogPage = (view.blogPage || 0) + 1; render(); });
  on('data-fborder', (b) => { view.blogOld = b.dataset.fborder === 'old'; view.blogPage = 0; render(); });
  on('data-fbtribune', () => go('tribune'));
  on('data-fbsite', (a) => go(a.dataset.fbsite));
  on('data-fbsettings', () => go('settings'));
  // Un match : il s'ouvre dans Scoreline, dès que ses scores sont chargés.
  page.querySelectorAll('[data-fbmatch]').forEach((m) => {
    const openIt = () => { view.skMatchKey = m.dataset.fbmatch; go('stats'); };
    m.onclick = openIt;
    m.onkeydown = (ev) => { if (ev.key === 'Enter') openIt(); };
  });
  const picker = $('#edition-pick');
  if (picker) picker.onchange = () => { view.edition = Number(picker.value); view.locArticle = null; view.fbTab = null; render(); fbScrollTo(0); };
  // La recherche : la liste se restreint à chaque lettre, le curseur reste où il est.
  const q = $('#fb-q');
  if (q) {
    q.oninput = () => {
      const at = q.selectionStart;
      view.blogQ = q.value; view.blogPage = 0; view.locArticle = null; view.fbTab = null;
      render(); fbScrollTo(0);
      const again = $('#fb-q');
      if (again) { again.focus(); again.setSelectionRange(at, at); }
    };
    q.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); if (q.value) { q.value = ''; q.oninput(); } else q.blur(); } };
  }
  const copy = page.querySelector('[data-fbcopy]');
  if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(copy.dataset.fbcopy); toast(tr('Titre copié.')); } catch { toast(tr('Copie impossible.'), true); } };
}

// Le joueur lui-même (ses posts, ses réponses, son compte) : c'est sa photo de profil qui s'affiche.
const isMeAuthor = (a) => Boolean(state?.profile && a.handle && (a.isMe || a.type === 'me') && a.handle.toLowerCase() === state.profile.handle.toLowerCase());

function avatar(author) {
  const initial = esc((author.name || author.handle || '?').trim()[0] || '?').toUpperCase();
  if (isMeAuthor(author)) return `<div class="avatar t-me">${myFaceIn(initial)}</div>`;
  // Les clubs : leur écusson, dans un carré arrondi comme les comptes d'organisation.
  const emblem = emblemUrl(clubPage(author.handle)?.emblem);
  if (emblem) return `<div class="avatar emblem"><img src="${esc(emblem)}" alt=""></div>`;
  return `<div class="avatar t-${esc(author.type || 'fan')}">${authorFace(author, initial)}</div>`;
}

const PROMISE_BADGE = {
  open: ['🔒', 'Promesse en cours'],
  kept: ['✅', 'Promesse tenue'],
  broken: ['❌', 'Promesse non tenue'],
  void: ['⊘', 'Promesse annulée'],
  expired: ['⌛', 'Promesse expirée'],
};

// Étiquette de fiabilité d'une rumeur mercato (src/world/rumors.js), confirmée ou démentie quand le mercato a tranché.
const RUMOR_LABEL = { unverified: ['⚪', 'Invérifiable'], serious: ['🟡', 'Piste sérieuse'], reliable: ['🟢', 'Très fiable'], confirmed: ['✅', 'Officiel'], denied: ['❌', 'Démenti'] };
function rumorBadge(p) {
  const key = p.rumor && (p.rumor.outcome || p.rumor.tier);
  const [icon, label] = RUMOR_LABEL[key] || [];
  return label ? `<p class="tw-rumor t-${esc(key)}">${icon} ${esc(tr(label))} · ${esc(tr('rumeur mercato'))}</p>` : '';
}

function promiseBadge(p) {
  const pr = p.promiseId && (state.promises || []).find((x) => x.id === p.promiseId);
  if (!pr) return '';
  const [icon, text] = PROMISE_BADGE[pr.status] || PROMISE_BADGE.open;
  return `<div class="promise ${esc(pr.status)}">${icon} ${tr(text)} · ${esc(pr.label)}${pr.detail && pr.status !== 'open' ? ` <span class="handle">(${esc(pr.detail)})</span>` : ''}${p.ratio ? ' <span class="pill ratio">RATIO</span>' : ''}</div>`;
}

// Icônes Heroicons v2 (contour, © Tailwind Labs, licence MIT) : celles du modèle de Kop.
const HI = {
  check: 'm4.5 12.75 6 6 9-13.5',
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  plane: 'M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5',
  bars: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  flag: 'M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5',
  userPlus: 'M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z',
  shieldCheck: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
  exit: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
  contract: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
  mic: 'M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z',
  swap: 'M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  home: 'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  hashtag: 'M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5',
  envelope: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
  bell: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  bookmark: 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z',
  user: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  moreCircle: 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  pencil: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125',
  ellipsis: 'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
  chat: 'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z',
  repost: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  heart: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z',
  share: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
  views: 'M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z',
  search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
  photo: 'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  gif: 'M12.75 8.25v7.5m6-7.5h-3V12m0 0v3.75m0-3.75H18M9.75 9.348c-1.03-1.464-2.698-1.464-3.728 0-1.03 1.465-1.03 3.84 0 5.304 1.03 1.464 2.699 1.464 3.728 0V12h-1.5M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
  poll: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  smile: 'M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z',
  pin: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z',
  film: 'm15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z',
  logo: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z',
  back: 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  euro: 'M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  newspaper: 'M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z',
  trophy: 'M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0',
  clipboard: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
  arrowUp: 'M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  link: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
  briefcase: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z',
  camera: 'M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z',
  xmark: 'M6 18 18 6M6 6l12 12',
  minus: 'M5 12h14',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  language: 'm10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802',
};
const hi = (k) => `<svg class="hi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${HI[k]}"/></svg>`;

// Nombres comme sur X : exacts jusqu'à 9 999, puis « 10,4 k », « 1,2 M ».
const compactFmts = {};
const compactFmt = () => (compactFmts[locale()] ||= new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }));
const fmtCount = (n) => (Math.abs(n || 0) < 10000 ? fmtNum(n) : compactFmt().format(n));
// « A et B », « A, B et C ».
const andJoin = (list) => (list.length < 2 ? list.join('') : tr('{a} et {b}', { a: list.slice(0, -1).join(', '), b: list.at(-1) }));

// Badge certifié de X : bleu pour les personnes, doré pour les clubs (comptes d'organisation).
const BADGE_PATH = 'M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z';
// Organisations (clubs, compétitions) : badge doré, toujours certifiées.
const ORG_TYPES = new Set(['club', 'competition', 'national']);
const isVerified = (a) => (a.isMe || isMeAuthor(a) ? Boolean(state.profile.verified) : Boolean(a.verified || ORG_TYPES.has(a.type)));
const badgeHtml = (a) => {
  if (!isVerified(a)) return '';
  const org = ORG_TYPES.has(a.type), label = org ? tr('Compte officiel certifié') : tr('Compte certifié');
  return `<svg class="tw-badge${org ? ' gold' : ''}" viewBox="0 0 22 22" role="img" aria-label="${label}"><title>${label}</title><path d="${BADGE_PATH}"/></svg>`;
};

// Heure des posts : Kop ne la garde pas. Une heure stable par post, dans l'ordre de publication,
// répartie sur la journée de jeu ; les réponses suivent leur post de quelques minutes.
// Le jour d'un de ses matchs : ce qui a été écrit avant le résultat tombe entre le matin et le coup d'envoi,
// ce qui a été écrit après, entre le coup de sifflet final et minuit.
let postClock = { at: new Map(), now: 0, day: null };
function dayWindows(day, posts) {
  const own = (state.snapshot?.fixtures || []).find((m) => m.date === day);
  const seen = state.resultSeen?.[day];
  // Pas de match, résultat connu avant cette règle, ou moment sans aucun post écrit après (jour passé) : journée entière.
  const usable = seen && (day === state.snapshot?.gameDate || posts.some((p) => (p.createdAt || 0) >= seen));
  if (!own || (own.played && !usable)) return [[posts, 450, 1410]];
  const kick = (Number.isInteger(own.hour) && own.hour >= 9 && own.hour <= 22 ? own.hour : 20) * 60;
  const before = posts.filter((p) => !own.played || (p.createdAt || 0) < seen);
  return [[before, 420, kick - 25], [posts.filter((p) => !before.includes(p)), Math.min(kick + 115, 1380), 1436]];
}
function buildPostClock() {
  const at = new Map();
  const byDay = new Map();
  for (const p of state.feed) { if (!byDay.has(p.gameDate)) byDay.set(p.gameDate, []); byDay.get(p.gameDate).push(p); }
  for (const [day, all] of byDay) for (const [posts, from, to] of dayWindows(day, all)) {
    let prev = 0;
    posts.forEach((p, i) => {
      const m = Math.min(to, Math.max(prev + 1, from + Math.round(((i + 0.5) / posts.length) * (to - from)) + (hashOf(p.id) % 21) - 10));
      at.set(p.id, m);
      prev = m;
      // Réponses arrivées un autre jour (discussion relancée) : dans l'ordre aussi, à partir d'une heure du matin au soir.
      let same = m, otherDay = null, other = 0;
      for (const r of p.replies || []) {
        let t;
        if (r.gameDate && r.gameDate !== p.gameDate) {
          t = otherDay === r.gameDate ? Math.min(1438, other + 3 + (hashOf(r.id) % 38)) : 480 + (hashOf(r.id) % 600);
          otherDay = r.gameDate; other = t;
        } else { same = Math.min(Math.max(to, m) + 12, same + 3 + (hashOf(r.id) % 38)); t = same; }
        at.set(r.id, t);
      }
    });
  }
  const day = state.snapshot?.gameDate || null;
  let now = 0;
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if ((x.gameDate || p.gameDate) === day) now = Math.max(now, at.get(x.id) || 0);
  postClock = { at, now: now + 7, day };
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function timeLabel(p, parent = null) {
  const date = p.gameDate || parent?.gameDate;
  if (!date) return '';
  const m = postClock.at.get(p.id);
  if (date === postClock.day && m != null) {
    const diff = Math.max(1, postClock.now - m);
    return diff < 60 ? tr('{n} min', { n: diff }) : tr('{n} h', { n: Math.floor(diff / 60) });
  }
  return date.slice(0, 4) === String(postClock.day || '').slice(0, 4) ? shortDate(date) : fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
}
const fullStamp = (p, parent = null) => {
  const date = p.gameDate || parent?.gameDate;
  const m = postClock.at.get(p.id);
  return `${m != null ? `${hhmm(m)} · ` : ''}${date ? fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
};

// Compteur de caractères en cercle, comme sur X (le nombre restant apparaît à 20 caractères de la limite).
function charRing(len) {
  if (!len) return '';
  const left = 280 - len, c = 2 * Math.PI * 9;
  // Couleur par la feuille de style (encre, puis or près de la limite, rouge au-delà).
  const level = left <= 0 ? ' over' : left <= 20 ? ' near' : '';
  return `<span class="tw-ring" title="${len}/280"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" class="tw-ring-bg"/><circle cx="12" cy="12" r="9" class="tw-ring-fg${level}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - Math.min(1, len / 280))).toFixed(2)}"/></svg>${left <= 20 ? `<b${left <= 0 ? ' class="over"' : ''}>${left}</b>` : ''}</span>`;
}

// Vues : Kop ne les compte pas ; un ordre de grandeur stable tiré des j'aime et des partages.
const postViews = (p) => Math.round(((p.likes || 0) * 14 + (p.reposts || 0) * 45 + 30) / 10) * 10;

// Post de Kop, même structure que le modèle : avatar | nom @compte · date (menu …) | texte | actions.
// Zone de réponse, sous le message auquel il répond.
function replyBoxHtml(handle) {
  const me = { name: state.profile.displayName, handle: state.profile.handle, type: 'me' };
  const draft = drafts.reply || '';
  return `<div class="tw-replybox">${avatar(me)}
    <div class="tw-replybox-main">
      <p class="tw-replying">${tr('En réponse à')} <span>@${esc(handle)}</span></p>
      <textarea id="tw-reply-text" rows="1" maxlength="280" placeholder="${tr('Poste ta réponse')}">${esc(draft)}</textarea>
      <div class="tw-replybox-foot"><span class="tw-chars" id="tw-reply-chars">${charRing(draft.length)}</span><button class="tw-btn tw-btn-sm" id="tw-reply-send"${draft.trim() ? '' : ' disabled'}>${tr('Répondre')}</button></div>
    </div></div>`;
}

// Message cité par un post (citation) : un post du fil ou l'une de ses réponses.
function quotedOf(p) {
  const root = p.aboutPost && state.feed.find((x) => x.id === p.aboutPost);
  if (!root) return null;
  const target = p.aboutReply ? (root.replies || []).find((r) => r.id === p.aboutReply) : root;
  return target ? { root, target } : null;
}

// Carte du message cité, comme sur X : auteur, date et texte ; un clic ouvre la discussion d'origine.
function quotedHtml(q, { link = true } = {}) {
  if (!q) return '';
  const t = q.target, parent = t === q.root ? null : q.root;
  const when = timeLabel(t, parent);
  return `<div class="tw-quote"${link ? ` role="link" tabindex="0" data-twopen="${esc(q.root.id)}"` : ''}>
    <div class="tw-quote-head">${avatar(t.author)}<span class="tw-name">${esc(t.author.name)}</span>${badgeHtml(t.author)}<span class="tw-user">@${esc(t.author.handle)}</span>${when ? `<span class="tw-user tw-quote-time">· ${esc(when)}</span>` : ''}</div>
    ${parent ? `<p class="tw-replying">${tr('En réponse à')} <span>@${esc(t.replyTo || parent.author.handle)}</span></p>` : ''}
    <div class="tw-quote-text">${linkify(t.text)}</div></div>`;
}

// Bouton repost comme sur X : il ouvre un petit menu « Reposter » (ou « Annuler le repost ») et « Citer ».
function rtActionHtml(p, ids) {
  const open = view.twRtMenu === p.id;
  return `<li class="tw-rt-wrap"><button class="tw-act tw-rt${p.repostedByMe ? ' on' : ''}" data-twrtmenu="${esc(p.id)}" title="${tr('Reposter ou citer')}" aria-haspopup="menu" aria-expanded="${open}">${hi('repost')}${fmtCount(p.reposts || 0)}</button>${open ? `<div class="tw-dropdown tw-rt-menu" role="menu">
    <button role="menuitem" data-twrepost ${ids}>${hi('repost')}<span>${p.repostedByMe ? tr('Annuler le repost') : tr('Reposter')}</span></button>
    <button role="menuitem" data-twquote ${ids}>${hi('pencil')}<span>${tr('Citer')}</span></button></div>` : ''}</li>`;
}

function postHtml(p, { reply = false, parent = null, open = false } = {}) {
  const badge = !p.author.isMe && tr(TYPE_LABEL[p.author.type]);
  const quoted = quotedOf(p);
  const replies = p.replies?.length || 0;
  // Identifiants pour les interactions : le post du fil, et la réponse visée le cas échéant.
  const postId = parent ? parent.id : p.id;
  const replyId = parent ? p.id : '';
  const ids = `data-post="${esc(postId)}" data-reply="${esc(replyId)}"`;
  const replying = view.twReplyTo && view.twReplyTo.postId === postId && (view.twReplyTo.replyId || '') === replyId;
  const showThread = !reply && replies > 0 && (open || view.openPost === p.id);
  return `${!reply && p.repostedByMe ? `<div class="tw-reposted">${hi('repost')}<span>${tr('Tu as reposté')}</span></div>` : ''}<div class="tw-post${reply ? ' reply' : ''}${showThread ? ' has-thread' : ''}" data-id="${esc(p.id)}" data-root="${esc(postId)}">
    <div class="tw-post-av"><button class="tw-av-link" data-twprofile="${esc(p.author.isMe ? '' : p.author.handle)}" aria-label="${tr('Profil de {name}', { name: esc(p.author.name) })}">${avatar(p.author)}</button></div>
    <div class="tw-post-body">
      <div class="tw-post-head">
        <div class="tw-post-meta"><span class="tw-name" role="link" tabindex="0" data-twprofile="${esc(p.author.isMe ? '' : p.author.handle)}">${esc(p.author.name)}</span>${badgeHtml(p.author)}${badge ? `<span class="pill">${esc(badge)}</span>` : ''}<span class="tw-user">@${esc(p.author.handle)}</span>${timeLabel(p, parent) ? `·<span class="tw-user tw-time" title="${esc(fullStamp(p, parent))}">${esc(timeLabel(p, parent))}</span>` : ''}</div>
        <div class="tw-menu-wrap"><button class="tw-iconbtn" data-twmenu="${esc(p.id)}" aria-label="${tr('Plus d’options')}">${hi('ellipsis')}</button>${view.twMenu === p.id ? `<div class="tw-dropdown">
          <button data-twprofile="${esc(p.author.isMe ? '' : p.author.handle)}">${hi('user')}<span>${tr('Voir le profil de {handle}', { handle: `@${esc(p.author.handle)}` })}</span></button>
          <button data-twshare="${esc(p.id)}">${hi('share')}<span>${tr('Copier le post')}</span></button></div>` : ''}</div>
      </div>
      ${parent && (p.replyTo || !reply) ? `<p class="tw-replying">${tr('En réponse à')} <span>@${esc(p.replyTo || parent.author.handle)}</span></p>` : ''}
      <div class="tw-post-text">${linkify(p.text)}</div>${twPollHtml(p)}
      ${rumorBadge(p)}${promiseBadge(p)}
      ${p.media?.kind === 'video' ? videoHtml(p.media.path) : ''}
      ${p.replay && !p.media ? `<div class="replay-card">🎬 ${tr('Ralenti sauvegardé')}${p.replay.minute != null ? ` · ${tr('{n}e minute', { n: p.replay.minute })}` : ''}${p.replay.scorer ? ` · ${esc(p.replay.scorer)}` : ''}<br><span class="handle">${esc(p.replay.match)}</span></div>` : ''}
      ${quotedHtml(quoted)}
      ${p.likedBy?.length ? `<div class="liked-by">❤️ ${trn(p.likedBy.length, '{who} a aimé', '{who} ont aimé', { who: esc(p.likedBy.join(', ')) })}</div>` : ''}
      <ul class="tw-actions">
        <li class="tw-views" title="${tr('Vues')}">${hi('views')}${fmtCount(postViews(p))}</li>
        <li><button class="tw-act tw-reply${replying ? ' on' : ''}" data-twreply ${ids} title="${tr('Répondre')}">${hi('chat')}${reply ? '' : replies}</button></li>
        ${rtActionHtml(p, ids)}
        <li><button class="tw-act tw-like${p.likedByMe ? ' on' : ''}" data-twlike ${ids} title="${p.likedByMe ? tr('Retirer le j’aime') : tr('J’aime')}">${hi('heart')}${fmtCount(p.likes || 0)}</button></li>
        <li><button class="tw-act" data-twshare="${esc(p.id)}" title="${tr('Copier le post')}">${hi('share')}</button></li>
      </ul>
      ${replying ? replyBoxHtml(p.author.handle) : ''}
      ${!reply && replies && !showThread ? `<button class="tw-link tw-showthread show-replies">${trn(replies, 'Afficher la réponse', 'Afficher les {n} réponses')}</button>` : ''}
    </div></div>${showThread ? `
    <div class="tw-thread">${p.replies.map((r) => postHtml(r, { reply: true, parent: p })).join('')}</div>
    ${open ? '' : `<button class="tw-link tw-showthread tw-hidethread show-replies" data-id="${esc(p.id)}">${tr('Masquer les réponses')}</button>`}` : ''}`;
}

// ---------- Mentions @ ----------

let mentionDir = null;
let confirmUnknown = false;
const mentionState = { items: [], index: 0, start: -1 };
const plainText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MENTION_KIND = { national: 'Sélection', competition: 'Compétition', player: 'Joueur', coach: 'Entraîneur', club: 'Compte officiel', journalist: 'Presse', pundit: 'Consultant', stats: 'Stats', meme: 'Mèmes', rival: 'Supporter adverse', fan: 'Supporter', betting: 'Paris', highlights: 'Vidéos' };

function mentionSubtitle(e) {
  const side = e.side === 'teammate' ? tr('Coéquipier') : e.side === 'opponent' ? tr('Adversaire') : '';
  if (e.kind === 'player') return `${side} · ${e.team}`;
  if (e.kind === 'coach') return `${tr('Entraîneur')} · ${e.team}`;
  return MENTION_KIND[e.kind] ? tr(MENTION_KIND[e.kind]) : e.kind;
}

function updateMentionPop(ta) {
  const pop = $('#mention-pop');
  const before = ta.value.slice(0, ta.selectionStart);
  const m = before.match(/(^|\s)@(\w*)$/);
  if (!m || !mentionDir) { pop.classList.add('hidden'); return; }
  const q = plainText(m[2]);
  mentionState.start = before.length - m[2].length - 1;
  mentionState.items = mentionDir
    .filter((e) => !q || plainText(e.handle).includes(q) || plainText(e.name).includes(q))
    .sort((a, b) => Number(plainText(b.handle).startsWith(q)) - Number(plainText(a.handle).startsWith(q)) || (a.side === 'teammate' ? -1 : 1))
    .slice(0, 8);
  mentionState.index = 0;
  if (!mentionState.items.length) { pop.classList.add('hidden'); return; }
  pop.innerHTML = mentionState.items.map((e, i) => `<button class="mention-item${i === 0 ? ' active' : ''}" data-i="${i}">
    ${avatar({ name: e.name, handle: ORG_TYPES.has(e.kind) ? e.handle : undefined, type: e.kind === 'player' ? 'me' : e.kind })}
    <span><b>${esc(e.name)}</b>${e.verified ? '<span class="verified">✔</span>' : ''} <span class="handle">@${esc(e.handle)}</span><br><span class="handle">${esc(mentionSubtitle(e))}</span></span></button>`).join('');
  pop.classList.remove('hidden');
  pop.querySelectorAll('.mention-item').forEach((b) => { b.onmousedown = (ev) => { ev.preventDefault(); insertMention(ta, Number(b.dataset.i)); }; });
}

function insertMention(ta, i) {
  const e = mentionState.items[i];
  if (!e) return;
  const after = ta.value.slice(ta.selectionStart);
  const head = `${ta.value.slice(0, mentionState.start)}@${e.handle} `;
  ta.value = head + after.replace(/^\w*/, '');
  ta.selectionStart = ta.selectionEnd = head.length;
  $('#mention-pop').classList.add('hidden');
  ta.dispatchEvent(new Event('input'));
}

function mentionKeys(ev, ta) {
  const pop = $('#mention-pop');
  if (pop.classList.contains('hidden')) return;
  const n = mentionState.items.length;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    mentionState.index = (mentionState.index + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
    pop.querySelectorAll('.mention-item').forEach((b, i) => b.classList.toggle('active', i === mentionState.index));
  } else if (ev.key === 'Enter' || ev.key === 'Tab') {
    ev.preventDefault();
    insertMention(ta, mentionState.index);
  } else if (ev.key === 'Escape') {
    pop.classList.add('hidden');
  }
}

// Kop : interface reprise du clone « Twitter UI practice » (© 2023 Roy Quilor, licence MIT,
// https://github.com/royquilor/twitter-ui-practise) : mêmes couleurs (palette slate),
// mesures et icônes (Heroicons), réécrites en HTML et CSS sans React ni Tailwind, et branchées sur les données de Kop.
const TW_NAV = [
  ['all', 'Accueil', 'home'],
  ['explore', 'Explorer', 'hashtag'],
  ['mentions', 'Notifications', 'bell'],
  ['messages', 'Messages', 'envelope'],
  ['promises', 'Promesses', 'bookmark'],
  ['mine', 'Profil', 'user'],
];
const TW_MORE = [['replays', 'Ralentis', 'film']];
const TW_TABS = [['all', 'Pour toi'], ['following', 'Abonnements'], ['official', 'Officiels'], ['fans', 'Supporters']];
const TW_OFFICIAL = new Set(['national', 'competition', 'journalist', 'club', 'pundit', 'stats', 'highlights', 'coach', 'player']);
// Compétitions de son club (abonnements de la fiche du club) : seules à passer dans « Pour toi » avec celles qu'il suit.
let myCompsCache = { state: null, set: new Set() };
function myCompetitionHandles() {
  if (myCompsCache.state !== state) {
    const club = Object.values(state?.clubPages || {}).find((p) => !p.kind && p.name === state.snapshot?.club?.name);
    myCompsCache = { state, set: new Set(club?.follows || []) };
  }
  return myCompsCache.set;
}
const TW_FILTER = {
  // « Pour toi » : les programmes et résultats des autres championnats restent dans « Officiels » (sauf en recherche).
  all: (p) => p.author.type !== 'competition' || Boolean(view.twQuery) || isFollowing(p.author.handle) || myCompetitionHandles().has(p.author.handle.toLowerCase()),
  following: (p) => !p.author.isMe && isFollowing(p.author.handle),
  official: (p) => !p.author.isMe && TW_OFFICIAL.has(p.author.type),
  fans: (p) => !p.author.isMe && !TW_OFFICIAL.has(p.author.type),
  // Notifications : posts qui le citent, et réponses qui s'adressent à lui (sur ses posts ou après ses réponses).
  // Ses anciens pseudos comptent aussi : les posts déjà écrits ne changent pas de texte.
  mentions: (p) => {
    const mine = [state.profile.handle, ...(state.profile.formerHandles || [])].map((h) => h.toLowerCase());
    const text = (p.text || '').toLowerCase();
    return (!p.author.isMe && mine.some((h) => new RegExp(`@${h}\\b`).test(text)))
      || (p.replies || []).some((r) => !r.author.isMe && (p.author.isMe || mine.includes(String(r.replyTo || '').toLowerCase())));
  },
  replays: (p) => Boolean(p.replay || p.media),
  promises: (p) => Boolean(p.promiseId) || (p.replies || []).some((r) => r.promiseId),
  mine: (p) => p.author.isMe || p.repostedByMe,
  myreplies: (p) => (p.replies || []).some((r) => r.author.isMe),
  mylikes: (p) => p.likedByMe || (p.replies || []).some((r) => r.likedByMe),
};
const TW_TITLE = { all: 'Accueil', following: 'Accueil', official: 'Accueil', fans: 'Accueil', explore: 'Explorer', mentions: 'Notifications', messages: 'Messages', replays: 'Ralentis', promises: 'Promesses', mine: 'Profil', myreplies: 'Profil', mylikes: 'Profil' };
const TW_PROFILE_TABS = [['mine', 'Posts'], ['myreplies', 'Réponses'], ['mylikes', 'J’aime']];
// Vues où les discussions s'affichent ouvertes (on y vient pour lire les réponses).
const TW_OPEN_THREADS = new Set(['mentions', 'myreplies']);
const TW_EMPTY = {
  all: ['Fil vide', 'Les posts arrivent à chaque synchro.'],
  following: ['Aucun abonnement', 'Suis des comptes (bouton « Suivre » sur leur profil ou dans « Comptes à voir ») : leurs posts apparaîtront ici.'],
  official: ['Aucun compte officiel', 'Journalistes, clubs et consultants publient à chaque édition.'],
  fans: ['Aucun supporter', 'Les supporters réagissent à chaque édition.'],
  mine: ['Aucun post de toi', 'Écris ton premier post depuis l’accueil, ou reposte celui d’un autre : supporters, journalistes et rivaux réagiront.'],
  myreplies: ['Aucune réponse', 'Clique sur la bulle d’un post pour répondre : la discussion apparaîtra ici.'],
  mylikes: ['Aucun j’aime', 'Clique sur le cœur d’un post : il apparaîtra ici.'],
  mentions: ['Aucune notification', () => tr('Personne ne t’a encore cité avec {handle} ni répondu.', { handle: `@${state.profile.handle}` })],
  replays: ['Aucun ralenti', 'Sauvegarde un ralenti dans le jeu : il sera publié ici avec ta vidéo.'],
  promises: ['Aucune promesse', 'Promets quelque chose dans un post (un but, une victoire…) : LifeLegend vérifiera si tu as tenu parole.'],
};

// Tendances : de quoi parle Kop ces 3 derniers jours de jeu (hashtags, clubs du championnat, son nom), sans les
// listes de résultats et programmes des compétitions. Le volume est celui d'un vrai réseau : le fil n'en montre qu'un
// échantillon, on l'estime d'après les messages et leur engagement.
const isoDaysBefore = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// Un nom dans un texte : d'abord un test rapide (le texte en minuscules le contient), puis le mot entier.
const twWord = (w, flags = 'iu') => ({ s: w.toLowerCase(), re: new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, flags) });
// Le football mondial dans les tendances (2026-11-09) : les clubs et les joueurs des grandes compétitions, d'après les
// scores du monde de la sauvegarde (chargés comme pour La Transversale). Un club se reconnaît à son nom, à son nom sans
// sigle (« Real Madrid », « Bournemouth ») et à ses mots propres ; un mot que deux clubs partagent (« Manchester »,
// « Milan ») n'en désigne aucun. Un joueur, à son nom complet ou à son nom de famille avec la majuscule (« Haaland »,
// pas « doué » pour Doué), quand aucun autre joueur ne le porte. Rend [{ key, label, cat, query, words }].
let twWorldCache = { key: null, list: [] };
function twWorldNames(leagueTeams = []) {
  const d = skData();
  if (!d) return [];
  if (twWorldCache.key === skCache.key) return twWorldCache.list;
  const team = (ref) => d.teams?.[ref]?.[0] || null;
  const comps = d.comps.map((c, ci) => ({ c, ci })).filter(({ c }) => c.big && !c.mine).sort((a, b) => gzRubricRank(a.c.name) - gzRubricRank(b.c.name));
  const since = isoDaysBefore(state.snapshot.gameDate, 10);
  const clubs = new Map(), players = new Map(); // nom → compétition (la plus grande d'abord)
  for (const { c, ci } of comps) {
    for (const r of c.table || []) if (team(r[0]) && !clubs.has(team(r[0]))) clubs.set(team(r[0]), c.name);
    for (const i of d.byComp.get(ci) || []) {
      const m = d.matches[i];
      for (const ref of [m[4], m[5]]) if (team(ref) && !clubs.has(team(ref))) clubs.set(team(ref), c.name);
      if (m[0] >= since && m[0] <= state.snapshot.gameDate) for (const e of d.details?.[i]?.ev || []) if (e[1] && e[2] > 0 && !players.has(e[1])) players.set(e[1], c.name);
    }
    for (const s of (c.scorers || []).slice(0, 10)) if (s[0] && !players.has(s[0])) players.set(s[0], c.name);
    for (const x of c.totw?.xi || []) if (x[0] && !players.has(x[0])) players.set(x[0], c.name);
  }
  const league = new Set(leagueTeams);
  for (const n of league) clubs.delete(n); // son championnat a déjà ses tendances
  const GENERIC = new Set(['olympique', 'stade', 'sporting', 'athletic', 'football', 'club', 'calcio', 'real', 'united', 'city', 'borussia', 'racing']);
  const bare = (n) => n.split(/\s+/).filter((w) => !/^([A-Z0-9]{1,4}|Vf[BL]|TSG|\d+\.?)$/.test(w)).join(' ');
  const wordsOf = (n) => n.split(/[\s-]+/).filter((w) => w.length >= 5 && !GENERIC.has(w.toLowerCase()));
  const all = [...clubs.keys(), ...league];
  const shared = (w, self) => all.some((o) => o !== self && (o.split(/[\s-]+/).some((x) => x.toLowerCase() === w.toLowerCase()) || bare(o).toLowerCase() === w.toLowerCase()));
  const list = [];
  for (const [name, comp] of clubs) {
    const forms = [...new Set([name, bare(name), ...wordsOf(name)])].filter((f) => f && (f === name || !shared(f, name)));
    const query = forms.find((f) => f !== name && f === bare(name)) || forms.find((f) => f !== name) || name;
    list.push({ key: `w:${name}`, label: name, cat: gzShort(comp), query, words: forms.map((f) => twWord(f)) });
  }
  const me = state.snapshot.player?.name;
  const surnames = new Map();
  for (const p of players.keys()) { const s = p.trim().split(/\s+/).at(-1); surnames.set(s, (surnames.get(s) || 0) + 1); }
  for (const [name, comp] of players) {
    if (name === me) continue;
    const surname = name.trim().split(/\s+/).at(-1);
    const own = surname !== name && surname.length >= 4 && /^\p{Lu}/u.test(surname) && surnames.get(surname) === 1 && !all.some((t) => t.split(/[\s-]+/).includes(surname));
    list.push({ key: `p:${name}`, label: name, cat: gzShort(comp), query: own ? surname : name, words: [twWord(name, 'u'), ...(own ? [twWord(surname, 'u')] : [])] });
  }
  twWorldCache = { key: skCache.key, list };
  return list;
}
function tribuneTrends(days = 3) {
  const counts = new Map();
  const add = (key, label, cat, x, query = label) => { const c = counts.get(key) || { label, cat, n: 0, reach: 0, query, ...(/^[wp]:/.test(key) ? { world: true } : {}), ...(/^m:/.test(key) ? { market: true } : {}) }; c.n++; c.reach += (x.likes || 0) + 3 * (x.reposts || 0); counts.set(key, c); };
  const league = state.snapshot.league?.name || tr('Football');
  // Chaque club se reconnaît à son nom, à son mot le plus parlant (« Marseille » pour Olympique Marseille) et à son
  // sigle en majuscules (« l'OL », « le PSV ») ; les comptes de supporters écrivent rarement le nom officiel entier.
  const GENERIC = new Set(['olympique', 'stade', 'sporting', 'athletic', 'football', 'club', 'calcio', 'real', 'united', 'city']);
  const teams = (state.snapshot.table || []).filter((r) => r.team).map((r) => {
    const word = r.team.split(/[\s-]+/).filter((w) => w.length >= 5 && !GENERIC.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    const words = [r.team, word].filter(Boolean).map((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu'));
    if (/^[A-Z]{2,4}$/.test(r.short || '')) words.push(new RegExp(`(^|[^\\p{L}])${r.short}($|[^\\p{L}])`, 'u'));
    return { team: r.team, words };
  });
  const surname = String(state.snapshot.player.name || '').split(' ').at(-1);
  const world = twWorldNames(teams.map((t) => t.team));
  const since = isoDaysBefore(state.snapshot.gameDate, days);
  // Le mercato : les joueurs transférés ces jours-ci (lus dans la sauvegarde) et les rumeurs en cours sur lui, quand le
  // fil en parle. Sans IA : on compte les posts qui les citent.
  const esc0 = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const moves = (state.transfers || []).filter((t) => t.gameDate >= since && t.player).map((t) => {
    const last = String(t.player).split(/\s+/).pop().replace(/^.*\./, '');
    const words = [...new Set([t.player, last.length >= 4 ? last : null].filter(Boolean))].map((w) => ({ s: w.toLowerCase(), re: new RegExp(`(^|[^\\p{L}])${esc0(w)}($|[^\\p{L}])`, 'iu') }));
    return { key: `m:t:${t.player}`, label: t.player, query: last.length >= 4 ? last : t.player, words, bonus: t.involvesMyClub ? 900 : 300 };
  });
  const rumors = new Map((state.rumors || []).filter((r) => r.gameDate >= since && r.postId && r.club && !r.outcome).map((r) => [r.postId, r]));
  const bonus = new Map(moves.map((m) => [m.key, m.bonus]));
  for (const p of state.feed) {
    // Une rumeur : son post, ses réponses et les posts qui le citent.
    const rumor = rumors.get(p.id) || rumors.get(p.aboutPost);
    if (rumor) { const key = `m:r:${rumor.club}`; bonus.set(key, 1200); for (const x of [p, ...(p.replies || [])]) if ((x.gameDate || p.gameDate) >= since) add(key, `${surname} · ${rumor.club}`, `${tr('Mercato')} · ${tr('Rumeur')}`, x, rumor.club); }
    if (p.gameDate < since && !(p.replies || []).some((r) => r.gameDate >= since)) continue;
    for (const x of [p, ...(p.replies || [])]) {
      if ((x.gameDate || p.gameDate) < since || x.author.type === 'competition') continue;
      const text = x.text || '';
      const seen = new Set();
      for (const m of text.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)) {
        const k = `#${m[1].toLowerCase()}`;
        if (!seen.has(k)) { seen.add(k); add(k, `#${m[1]}`, tr('Football'), x); }
      }
      for (const t of teams) if (t.words.some((re) => re.test(text))) add(`t:${t.team}`, t.team, league, x);
      const lower = text.toLowerCase();
      for (const w of world) if (w.words.some(({ s, re }) => lower.includes(s) && re.test(text))) add(w.key, w.label, w.cat, x, w.query);
      for (const m of moves) if (m.words.some(({ s: w, re }) => lower.includes(w) && re.test(text))) add(m.key, m.label, `${tr('Mercato')} · ${tr('Officiel')}`, x, m.query);
      if (surname && surname.length > 2 && text.includes(surname)) add('me', state.snapshot.player.name, tr('Joueur'), x);
    }
  }
  const sorted = [...counts].filter(([, c]) => c.n >= (c.market ? 1 : 2))
    .map(([k, c]) => ({ ...c, volume: Math.round((c.n * 140 + c.reach * 1.2 + (bonus.get(k) || 0)) / 10) * 10 }))
    .sort((a, b) => b.volume - a.volume);
  // Le fil tourne autour de son club : le football mondial y est peu échantillonné. Comme les tendances d'un vrai réseau,
  // les cinq premières lui gardent jusqu'à deux places, avec leur vrai nombre de posts.
  const elsewhere = sorted.filter((c) => c.world).slice(0, 2);
  // Le mercato passe en tête (deux places au plus) : pendant une fenêtre, c'est ce dont un vrai réseau parle d'abord.
  const market = sorted.filter((c) => c.market).slice(0, 2);
  const head = [...market, ...[...sorted.filter((c) => !c.world && !c.market).slice(0, Math.max(1, 5 - elsewhere.length - market.length)), ...elsewhere].sort((a, b) => b.volume - a.volume)].slice(0, 5);
  const list = [...head, ...sorted.filter((c) => !head.includes(c))].slice(0, 10);
  return list.length < 5 && days < 7 ? tribuneTrends(7) : list; // fil calme : on remonte à la semaine
}

// Comptes à voir : les plus actifs du fil ces derniers temps (hors toi). Les comptes de compétitions n'y sont que
// pour ses compétitions et celles qu'il suit, pas les dizaines de championnats et coupes du jeu.
function tribuneAccounts() {
  const by = new Map();
  const mine = myCompetitionHandles();
  const recent = isoDaysBefore(state.snapshot.gameDate, 10);
  for (const p of state.feed) {
    for (const x of [p, ...(p.replies || [])]) {
      if (x.author.isMe) continue;
      const h = x.author.handle;
      if (x.author.type === 'competition' && !mine.has(h.toLowerCase()) && !isFollowing(h)) continue;
      const a = by.get(h.toLowerCase()) || { ...x.author, n: 0 };
      a.n += ((x.gameDate || p.gameDate) >= recent ? 3 : 1) * (x === p ? 2 : 1);
      by.set(h.toLowerCase(), a);
    }
  }
  return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 12);
}

// Éléments du fil : des posts, et dans « Profil › Posts » les réponses qu'il a repostées (affichées seules).
// Tous les comptes connus de Kop : clubs, compétitions et sélections (fiches), auteurs du fil, comptes mémorisés.
function accountIndex() {
  const map = new Map();
  const add = (a) => {
    if (!a?.handle || a.isMe) return;
    const k = a.handle.toLowerCase();
    if (!map.has(k)) map.set(k, { handle: a.handle, name: a.name || a.handle, type: a.type || 'fan', verified: a.verified });
  };
  for (const pg of Object.values(state.clubPages || {})) if (pg.handle) add({ handle: pg.handle, name: pg.name, type: pg.kind || 'club', verified: true });
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) add(x.author);
  for (const [h, a] of Object.entries(state.accounts || {})) add({ handle: h, name: a.name, type: a.type });
  return [...map.values()];
}

function searchAccounts(query, limit = 20) {
  const q = plainText(String(query || '').trim().replace(/^@/, ''));
  if (!q) return [];
  const scored = [];
  for (const a of accountIndex()) {
    const h = plainText(a.handle), n = plainText(a.name);
    const score = h === q || n === q ? 0 : h.startsWith(q) ? 1 : n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : h.includes(q) || n.includes(q) ? 3 : null;
    if (score !== null) scored.push([score - (ORG_TYPES.has(a.type) ? 1.5 : 0), a]); // comptes officiels d'abord, comme sur X
  }
  return scored.sort((x, y) => x[0] - y[0] || Number(ORG_TYPES.has(y[1].type)) - Number(ORG_TYPES.has(x[1].type)) || x[1].name.localeCompare(y[1].name, locale()))
    .slice(0, limit).map(([, a]) => a);
}

// Résultats de recherche : les comptes d'abord (3, puis tous), puis les posts.
function searchAccountsHtml() {
  const found = searchAccounts(view.twQuery);
  if (!found.length) return '';
  return `<div class="tw-search-accounts"><div class="tw-panel-title"><h2>${tr('Comptes')}</h2></div>${found.slice(0, view.twSearchAll ? 20 : 3).map(twWhoHtml).join('')}
    ${found.length > 3 ? `<div class="tw-panel-more"><button class="tw-link" data-twtoggle="twSearchAll">${view.twSearchAll ? tr('Afficher moins') : tr('Afficher les {n} comptes', { n: found.length })}</button></div>` : ''}</div>
    <div class="tw-panel-title tw-search-posts"><h2>${tr('Posts')}</h2></div>`;
}

// ---------- Nouveaux posts (comme sur X) ----------
// Les posts apportés par une synchro ne s'insèrent pas sous les yeux du joueur : l'accueil les garde de côté et un
// bandeau « Afficher N nouveaux posts » les montre d'un clic. Le dernier post vu est mémorisé sur ce PC, par carrière,
// pour retrouver le bandeau après un redémarrage. Ses propres posts ne sont jamais mis de côté.
const TW_HOME = new Set(['all', 'following', 'official', 'fans']);
// Kop défile dans sa carte. Sa position est gardée : la page se redessine à chaque action, et doit rester où elle était.
function twScrollTo(top, smooth = false) {
  const main = document.querySelector('.tw-main');
  if (!main) { view.twY = 0; viewScrollTo(0); return; }
  main.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  view.twY = smooth ? top : main.scrollTop;
}
let twSeen = null; // { careerId, ids, stored }
const twSeenKey = () => `tribune-fil-vu:${state.careerId}`;
function trackNewPosts() {
  if (!state?.feed) return;
  if (twSeen?.careerId !== state.careerId) {
    let last = null;
    try { last = localStorage.getItem(twSeenKey()); } catch { /* stockage indisponible : tout compte comme vu */ }
    const k = last ? state.feed.findIndex((p) => p.id === last) : -1;
    twSeen = { careerId: state.careerId, ids: new Set(state.feed.slice(0, k < 0 ? state.feed.length : k + 1).map((p) => p.id)), stored: last };
  }
  for (const p of state.feed) if (p.author.isMe) twSeen.ids.add(p.id);
  if (!heldPosts().length) markFeedSeen();
}
const heldPosts = () => (twSeen && state?.feed ? state.feed.filter((p) => !twSeen.ids.has(p.id)) : []);
function markFeedSeen() {
  for (const p of state.feed) twSeen.ids.add(p.id);
  const last = state.feed.at(-1)?.id || '';
  if (last === twSeen.stored) return;
  twSeen.stored = last;
  try { localStorage.setItem(twSeenKey(), last); } catch { /* rien à mémoriser */ }
}
// Affiche les posts mis de côté, en haut du fil, avec un bref surlignage.
function revealNewPosts() {
  view.twFresh = new Set(heldPosts().map((p) => p.id));
  markFeedSeen();
  render();
  view.twFresh = null;
  twScrollTo(0, true);
}
// Pastille flottante : seulement quand le bandeau est passé sous l'en-tête.
function syncNewPill() {
  const bar = $('#tw-newbar'), pill = $('#tw-newpill'), head = document.querySelector('.tw-header');
  if (pill) pill.classList.toggle('on', Boolean(bar && head) && bar.getBoundingClientRect().bottom < head.getBoundingClientRect().bottom + 1);
}
addEventListener('scroll', syncNewPill, { passive: true, capture: true });

function tribuneFeed() {
  const filter = TW_FILTER[view.twFilter] || TW_FILTER.all;
  const q = plainText(view.twQuery || '').trim();
  const keep = (x) => (!view.twAuthor || x.author.handle === view.twAuthor)
    && (!q || plainText(`${x.text} ${x.author.name} @${x.author.handle}`).includes(q));
  const items = [];
  if (view.twAuthor) {
    const h = view.twAuthor.toLowerCase();
    const his = (x) => !x.author.isMe && x.author.handle.toLowerCase() === h;
    for (const p of [...state.feed].reverse()) {
      if (view.twAuthorTabEff === 'replies') { if ((p.replies || []).some(his)) items.push({ post: p, open: true }); } else if (his(p)) items.push({ post: p });
    }
    return items;
  }
  const held = !q && TW_HOME.has(view.twFilter) ? new Set(heldPosts().map((p) => p.id)) : null;
  for (const p of [...state.feed].reverse()) {
    if (held?.has(p.id)) continue;
    if (filter(p) && keep(p)) items.push({ post: p });
    if (view.twFilter === 'mine') {
      for (const r of p.replies || []) if (r.repostedByMe && keep(r)) items.push({ post: p, reply: r });
    } else if (q) {
      for (const r of p.replies || []) if (keep(r)) items.push({ post: p, reply: r });
    }
  }
  return items;
}

function tribuneFeedHtml() {
  const feed = tribuneFeed();
  const open = TW_OPEN_THREADS.has(view.twFilter);
  if (feed.length) return feed.map((it) => `<li class="tw-li${!it.reply && view.twFresh?.has(it.post.id) ? ' tw-fresh' : ''}">${it.reply ? postHtml(it.reply, { parent: it.post }) : postHtml(it.post, { open: open || it.open })}</li>`).join('');
  if (view.twAuthor) return `<li>${empty(view.twAuthorTabEff === 'replies' ? tr('Aucune réponse') : tr('Aucun post'), tr('Ce compte n’a encore rien publié ici.'))}</li>`;
  if (view.twQuery) return `<li>${empty(tr('Aucun post trouvé'), tr('Essaie un autre mot, ou reviens à l’accueil.'))}</li>`;
  const [title, text] = TW_EMPTY[view.twFilter] || TW_EMPTY.all;
  return `<li>${empty(tr(title), typeof text === 'function' ? text() : tr(text))}</li>`;
}

const twTrendHtml = (t, i) => `<div class="tw-trend" role="button" tabindex="0" data-twquery="${esc(t.query)}">
  <div class="tw-trend-text"><p class="tw-xs">${Number.isInteger(i) ? `${i + 1} · ` : ''}${esc(t.cat)} · ${tr('Tendance')}</p><p class="tw-trend-title">${esc(t.label)}</p><p class="tw-xs">${trn(t.volume ?? t.n, '{n} post', '{n} posts', { n: fmtCount(t.volume ?? t.n) })}</p></div>
  <span class="tw-trend-more">${hi('ellipsis')}</span></div>`;

const twWhoHtml = (a) => `<div class="tw-who" role="link" tabindex="0" data-twprofile="${esc(a.handle)}">
  <div class="tw-who-id">${avatar(a)}<div class="tw-who-text"><p class="tw-who-name"><span>${esc(a.name)}</span>${badgeHtml(a)}</p><p class="tw-who-user">@${esc(a.handle)}</p></div></div>
  ${followBtnHtml(a.handle, true)}</div>`;

// Bouton Suivre / Abonné (au survol : Se désabonner), comme sur Twitter.
const isFollowing = (handle) => Object.keys(state?.follows || {}).some((k) => k.toLowerCase() === String(handle).toLowerCase());
const followBtnHtml = (handle, small = false) => (isFollowing(handle)
  ? `<button class="tw-btn${small ? ' tw-btn-sm' : ''} tw-btn-outline tw-following" data-twfollow="${esc(handle)}"><span class="tw-following-on">${tr('Abonné')}</span><span class="tw-following-off">${tr('Ne plus suivre')}</span></button>`
  : `<button class="tw-btn${small ? ' tw-btn-sm' : ''}" data-twfollow="${esc(handle)}">${followsMe(handle) ? tr('Suivre en retour') : tr('Suivre')}</button>`);

// Retrouve un post ou une réponse par son identifiant.
function findPost(id) {
  for (const p of state.feed) {
    if (p.id === id) return p;
    const r = (p.replies || []).find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

// Ouvre la page d'un post (et garde la position du fil pour le retour).
function openPostPage(id) {
  if (!view.twPost) view.twScrollBack = document.querySelector('.tw-main')?.scrollTop || 0;
  view.twPost = id; view.twMenu = null;
  view.twReplyTo = { postId: id, replyId: '' };
  render();
  twScrollTo(0);
}

function bindTwFollow(root) {
  root.querySelectorAll('[data-twfollow]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      const h = b.dataset.twfollow;
      try {
        state = await live.followAccount(h);
        render();
        if (isFollowing(h)) toast(tr('Tu suis {handle} : le compte le verra à la prochaine édition.', { handle: `@${h}` }));
      } catch (err) { toast(err.message, true); }
    };
  });
}

// Le résultat d'un sondage : une barre par choix (sa largeur est posée par twPaintPolls : pas de style dans le HTML),
// le choix en tête en gras, le nombre de votes.
function twPollHtml(p) {
  const poll = p.poll;
  if (!poll?.options?.length || !Array.isArray(poll.percents)) return '';
  const top = Math.max(...poll.percents);
  return `<div class="tw-poll">${poll.options.map((o, k) => `<div class="tw-poll-row${poll.percents[k] === top ? ' top' : ''}"><span class="tw-poll-bar" data-pct="${Number(poll.percents[k]) || 0}"></span><span class="tw-poll-label">${esc(o)}</span><b>${Number(poll.percents[k]) || 0} %</b></div>`).join('')}
    <p class="tw-xs">${trn(poll.votes, '{n} vote', '{n} votes', { n: fmtCount(poll.votes) })} · ${tr('Sondage terminé')}</p></div>`;
}
const twPaintPolls = (root = document) => root.querySelectorAll('.tw-poll-bar[data-pct]').forEach((el) => el.style.setProperty('--pct', `${el.dataset.pct}%`));
// Le sondage en préparation dans le champ de post : 2 à 4 choix de 40 caractères.
function twPollEditHtml() {
  if (!drafts.poll) return '';
  return `<div class="tw-poll-edit">${drafts.poll.map((o, k) => `<label><input data-pollopt="${k}" maxlength="40" value="${esc(o)}" placeholder="${esc(tr('Choix {n}', { n: k + 1 }))}" aria-label="${esc(tr('Choix {n}', { n: k + 1 }))}">${k >= 2 ? `<button type="button" class="tw-poll-x" data-polldrop="${k}" title="${esc(tr('Retirer ce choix'))}" aria-label="${esc(tr('Retirer ce choix'))}">${hi('xmark')}</button>` : ''}</label>`).join('')}
    <div class="tw-poll-edit-foot">${drafts.poll.length < 4 ? `<button type="button" class="tw-linkbtn" id="poll-add">${tr('Ajouter un choix')}</button>` : '<span></span>'}<button type="button" class="tw-linkbtn" id="poll-off">${tr('Retirer le sondage')}</button></div></div>`;
}

function bindTribuneFeed(page) {
  page.querySelectorAll('.tw-post[data-root]').forEach((el) => {
    el.onclick = (ev) => {
      if (ev.target.closest('button, a, textarea, input, video, .tw-dropdown, [data-twprofile], [data-twopen], .tw-replybox') || String(window.getSelection())) return;
      if (view.twPost === el.dataset.root) return;
      openPostPage(el.dataset.root);
    };
  });
  page.querySelectorAll('[data-twopen]').forEach((el) => {
    el.onclick = (ev) => { ev.stopPropagation(); if (!ev.target.closest('[data-twprofile]')) openPostPage(el.dataset.twopen); };
    el.onkeydown = (ev) => { if (ev.key === 'Enter') openPostPage(el.dataset.twopen); };
  });
  page.querySelectorAll('.show-replies').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id || b.closest('.tw-post').dataset.id;
      view.openPost = view.openPost === id ? null : id;
      render();
    };
  });
  // J'aime et repost : enregistrés tout de suite ; les comptes y réagiront à la prochaine édition.
  page.querySelectorAll('[data-twlike]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      try { state = await live.likePost(b.dataset.post, b.dataset.reply || null); render(); } catch (err) { toast(err.message, true); }
    };
  });
  page.querySelectorAll('[data-twrtmenu]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); view.twRtMenu = view.twRtMenu === b.dataset.twrtmenu ? null : b.dataset.twrtmenu; view.twMenu = null; view.twMore = false; render(); };
  });
  page.querySelectorAll('[data-twquote]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); view.twRtMenu = null; render(); openQuoteComposer(b.dataset.post, b.dataset.reply || null); };
  });
  page.querySelectorAll('[data-twrepost]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      view.twRtMenu = null;
      const postId = b.dataset.post, replyId = b.dataset.reply || null;
      try {
        state = await live.repostPost(postId, replyId);
        render();
        if (findPost(replyId || postId)?.repostedByMe) toast(tr('Reposté : le compte le verra à la prochaine édition.'));
      } catch (err) { toast(err.message, true); }
    };
  });
  // Répondre : ouvre la zone de réponse sous le message visé (et la discussion).
  page.querySelectorAll('[data-twreply]').forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const target = { postId: b.dataset.post, replyId: b.dataset.reply || '' };
      const same = view.twReplyTo && view.twReplyTo.postId === target.postId && view.twReplyTo.replyId === target.replyId;
      if (!same) drafts.reply = '';
      view.twReplyTo = same ? null : target;
      view.openPost = target.postId;
      render();
      $('#tw-reply-text')?.focus();
    };
  });
  const rt = $('#tw-reply-text'), rs = $('#tw-reply-send');
  if (rt && rs) {
    const grow = () => { rt.style.height = 'auto'; rt.style.height = `${rt.scrollHeight}px`; };
    grow();
    rt.oninput = () => {
      drafts.reply = rt.value;
      grow();
      $('#tw-reply-chars').innerHTML = charRing(rt.value.length);
      rs.disabled = !rt.value.trim();
    };
    rt.onkeydown = (ev) => {
      if (ev.key === 'Escape') { view.twReplyTo = view.twPost ? { postId: view.twPost, replyId: '' } : null; render(); }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !rs.disabled) rs.click();
    };
    rs.onclick = async (ev) => {
      ev.stopPropagation();
      const { postId, replyId } = view.twReplyTo;
      const text = rt.value.trim();
      if (!text) return;
      rs.disabled = true; rt.disabled = true; rs.textContent = tr('Envoi…');
      try {
        state = await live.replyPost(postId, replyId || null, text);
        drafts.reply = '';
        view.twReplyTo = view.twPost ? { postId: view.twPost, replyId: '' } : null;
        view.openPost = postId;
        render();
      } catch (err) {
        state = await live.getState();
        rs.disabled = false; rt.disabled = false; rs.textContent = tr('Répondre');
        render();
        toast(err.message, true);
      }
    };
  }
  page.querySelectorAll('[data-twmenu]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); view.twMenu = view.twMenu === b.dataset.twmenu ? null : b.dataset.twmenu; view.twMore = false; view.twRtMenu = null; render(); };
  });
  page.querySelectorAll('[data-twshare]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      const p = findPost(b.dataset.twshare);
      view.twMenu = null;
      try { await navigator.clipboard.writeText(`${p.author.name} (@${p.author.handle})${colon()} ${p.text}`); toast(tr('Post copié.')); } catch { toast(tr('Copie impossible.'), true); }
      render();
    };
  });
  // Avatar, nom ou compte suggéré : ouvre la page profil (la sienne pour ses propres posts).
  page.querySelectorAll('[data-twprofile]').forEach((b) => {
    const open = (ev) => {
      ev.stopPropagation();
      const h = b.dataset.twprofile;
      view.twMenu = null; view.twQuery = ''; view.twMore = false;
      if (view.twAuthor && h) view.twStack = [...(view.twStack || []), { twAuthor: view.twAuthor, twFollowing: view.twFollowing, twAuthorTab: view.twAuthorTab }].slice(-10);
      else view.twStack = [];
      view.twFollowing = null;
      if (!h) { view.twAuthor = null; view.twFilter = 'mine'; } else { view.twAuthor = h; view.twAuthorTab = null; view.twFilter = 'all'; }
      render();
      twScrollTo(0);
    };
    b.onclick = open;
    b.onkeydown = (ev) => { if (ev.key === 'Enter') open(ev); };
  });
  bindTwFollow(page);
  bindTwCards(page);
  page.querySelectorAll('[data-twquery]').forEach((b) => {
    b.onclick = () => { view.twQuery = b.dataset.twquery; view.twFilter = 'all'; view.twAuthor = null; render(); twScrollTo(0); };
  });
}

// ---------- Page profil de Kop ----------

const me0 = () => ({ name: state.profile.displayName, handle: state.profile.handle, type: 'me' });
// Bannières : la palette de LifeLegend (encre, or, puis les tons sourds des avatars).
const PROFILE_COLORS = ['#111111', '#d9a21f', '#2d3a4f', '#1e5e45', '#7a2e2a', '#4b3b6b', '#8a6200', '#5b5750'];
const siteLabel = (url) => String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
const initialOf = (name) => esc((String(name || '?').trim()[0] || '?').toUpperCase());

// Abonnements : Kop ne les simule pas ; un nombre stable propre à la carrière.
function followingCount(prof) {
  if (prof.following != null) return prof.following;
  let h = 0;
  for (const c of String(state.careerId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 140 + (h % 360);
}

function profileHeaderHtml() {
  const prof = state.profile;
  const banner = profileImg(prof.banner);
  const club = state.snapshot?.club?.name;
  const joined = state.editions?.[0]?.gameDate || state.snapshot?.gameDate;
  const meta = [
    (prof.position || club) && `<span>${hi('briefcase')}${esc([prof.position, club].filter(Boolean).join(' · '))}</span>`,
    prof.location && `<span>${hi('pin')}${esc(prof.location)}</span>`,
    prof.website && `<span class="tw-site" title="${esc(prof.website)}">${hi('link')}${esc(siteLabel(prof.website))}</span>`,
    joined && `<span>${hi('calendar')}${esc(tr('A rejoint Kop en {d}', { d: fmtDate(joined, { month: 'long', year: 'numeric' }) }))}</span>`,
  ].filter(Boolean);
  return `<div class="tw-profile">
    <div class="tw-banner" data-banner="${esc(prof.bannerColor || PROFILE_COLORS[0])}">${banner ? `<img src="${esc(banner)}" alt="">` : ''}</div>
    <div class="tw-profile-top">
      <div class="tw-profile-photo">${myFaceIn(initialOf(prof.displayName))}</div>
      <button class="tw-btn tw-btn-outline tw-edit-btn" id="tw-edit-profile">${tr('Éditer le profil')}</button>
    </div>
    <div class="tw-profile-id">
      <h1 class="tw-profile-name">${esc(prof.displayName)}${badgeHtml({ ...me0(), isMe: true })}</h1>
      <p class="tw-profile-handle">@${esc(prof.handle)}</p>
    </div>
    ${prof.bio ? `<p class="tw-profile-bio">${linkify(prof.bio)}</p>` : ''}
    ${meta.length ? `<div class="tw-profile-meta">${meta.join('')}</div>` : ''}
    <div class="tw-profile-counts"><span>${tr('{n} abonnements', { n: `<b>${fmtCount(followingCount(prof) + Object.keys(state.follows || {}).length)}</b>` })}</span><span>${tr('{n} abonnés', { n: `<b>${fmtCount(prof.followers)}</b>` })}</span></div>
  </div>`;
}

// ---------- Pages profil des autres comptes ----------

// Un compte du fil (auteur d'un post ou d'une réponse), ou connu de Kop.
function accountOf(handle) {
  const h = String(handle || '').toLowerCase();
  if (!h) return null;
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if (!x.author.isMe && x.author.handle.toLowerCase() === h) return x.author;
  const k = Object.keys(state.accounts || {}).find((x) => x.toLowerCase() === h);
  if (k) return { handle: k, name: state.accounts[k].name, type: state.accounts[k].type };
  const page = state.clubPages?.[h];
  if (page?.handle) return { handle: page.handle, name: page.name, type: page.kind || 'club', verified: true };
  // Un coéquipier qui n'a rien posté sur Kop a quand même un compte : celui de sa conversation ou de la liste des contacts.
  const dm = dmOf(h) || dmDir?.find((c) => c.handle.toLowerCase() === h);
  return dm ? { handle: dm.handle, name: dm.name, type: dm.type, ...(dm.verified ? { verified: true } : {}) } : null;
}

// Abonnements d'un compte quand on les connaît : une compétition suit tous les clubs engagés,
// un club suit ses compétitions (championnat, coupes, compétitions européennes).
const followingOf = (a) => {
  const page = clubPage(a.handle);
  const list = page?.kind === 'competition' ? page.clubs : page?.follows;
  return list?.length ? list.map(accountOf).filter(Boolean) : null;
};

// Kop ne simule pas les abonnés des autres : un ordre de grandeur stable selon le type de compte.
// Même échelle que src/world/engagement.js (les likes des posts en dépendent).
const ACCOUNT_SCALE = { national: [80000, 7000000], competition: [150000, 9000000], club: [60000, 2500000], player: [20000, 3000000], coach: [10000, 800000], journalist: [6000, 150000], pundit: [20000, 600000], stats: [30000, 900000], meme: [20000, 700000], highlights: [50000, 1500000], betting: [8000, 120000], rival: [80, 6000], fan: [60, 9000] };
const ACCOUNT_BIO = {
  journalist: 'Journaliste football.', pundit: 'Consultant football.', stats: 'Les chiffres du foot, sans filtre.', meme: 'Le foot, mais en mèmes.',
  betting: 'Cotes, paris et pronos. Jouez avec modération.', highlights: 'Les meilleurs moments du foot en vidéo.', rival: 'Supporter. Pas du même côté que toi.', fan: 'Supporter.',
};
function hashOf(str) {
  let h = 2166136261;
  for (const c of String(str).toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function accountStats(a) {
  const h = hashOf(a.handle);
  const [lo, hiN] = ACCOUNT_SCALE[a.type] || ACCOUNT_SCALE.fan;
  // Clubs : abonnés calés sur ceux du jeu (calculés à la synchro) ; sinon un ordre de grandeur stable.
  const page = a.type === 'club' ? clubPage(a.handle) : null;
  const base = Number.isFinite(page?.followers) ? page.followers : Math.round(lo * (hiN / lo) ** ((h % 10007) / 10007));
  // Chiffre calé sur le jeu : affiché tel quel (le suivre sur Kop ne le décale pas d'une unité).
  const followers = base + (isFollowing(a.handle) && !Number.isFinite(page?.followers) ? 1 : 0);
  const known = followingOf(a);
  const following = known ? known.length : ORG_TYPES.has(a.type) ? 30 + ((h >>> 8) % 300) : 80 + ((h >>> 8) % 1400);
  const joined = `${(ORG_TYPES.has(a.type) ? 2009 : 2010) + ((h >>> 4) % (ORG_TYPES.has(a.type) ? 4 : 12))}-${String(1 + ((h >>> 12) % 12)).padStart(2, '0')}-01`;
  return { followers, following, joined };
}

// Bio d'un compte : officielle pour les clubs, sélections et compétitions, sinon celle écrite par l'IA ou celle de son type.
function accountBio(a) {
  const club = ORG_TYPES.has(a.type) ? clubPage(a.handle) : null;
  return club?.kind === 'competition' ? `${tr('Compte officiel · {name}.', { name: club.name || a.name })}${club.teams ? ` ${tr('{n} équipes engagées.', { n: club.teams })}` : ''}`
    : club?.kind === 'national' ? tr('Compte officiel de la sélection : {name}.', { name: club.name || a.name })
    : club ? `${tr('Compte officiel de {name}.', { name: club.name || a.name })}${club.league ? ` ${club.league}.` : ''}`
    : Object.entries(state.accounts || {}).find(([k]) => k.toLowerCase() === a.handle.toLowerCase())?.[1]?.bio || (ACCOUNT_BIO[a.type] ? tr(ACCOUNT_BIO[a.type]) : '');
}
const followersText = (a, stats) => (a.type === 'club' && Number.isFinite(clubPage(a.handle)?.followers) ? fmtNum(stats.followers) : fmtCount(stats.followers));

// Carte de profil au survol d'un avatar, comme dans le modèle : la photo, le bouton Suivre, le nom, la bio, les compteurs.
let twCard = null, twCardTimer = null;
function closeTwCard() {
  clearTimeout(twCardTimer);
  twCard?.remove();
  twCard = null;
}
function openTwCard(anchor, handle) {
  closeTwCard();
  const a = accountOf(handle);
  if (!a || !document.contains(anchor)) return;
  const stats = accountStats(a), bio = accountBio(a);
  const card = document.createElement('div');
  card.className = 'tw-card';
  card.innerHTML = `<div class="tw-card-top"><button class="tw-av-link" data-twcardopen>${avatar(a)}</button>${followBtnHtml(a.handle)}</div>
    <div><p class="tw-card-name" data-twcardopen>${esc(a.name)}${badgeHtml(a)}</p><p class="tw-card-user">@${esc(a.handle)}${followsMe(a.handle) ? `<span class="tw-follows-you">${tr('Te suit')}</span>` : ''}</p></div>
    ${bio ? `<p class="tw-card-bio">${linkify(bio)}</p>` : ''}
    <div class="tw-card-counts"><span>${tr('{n} abonnements', { n: `<b>${fmtCount(stats.following)}</b>` })}</span><span>${tr('{n} abonnés', { n: `<b>${followersText(a, stats)}</b>` })}</span></div>`;
  anchor.closest('.tw').appendChild(card);
  // Sous l'avatar, au-dessus s'il n'y a pas la place.
  const r = anchor.getBoundingClientRect();
  card.style.left = `${Math.max(8, Math.min(r.left, innerWidth - card.offsetWidth - 8))}px`;
  card.style.top = `${r.bottom + 4 + card.offsetHeight <= innerHeight ? r.bottom + 4 : Math.max(8, r.top - card.offsetHeight - 4)}px`;
  card.onmouseenter = () => clearTimeout(twCardTimer);
  card.onmouseleave = () => { twCardTimer = setTimeout(closeTwCard, 200); };
  card.querySelectorAll('[data-twcardopen]').forEach((x) => { x.onclick = () => anchor.click(); });
  bindTwFollow(card);
  twCard = card;
}
function bindTwCards(page) {
  closeTwCard();
  page.querySelectorAll('.tw-av-link[data-twprofile]').forEach((b) => {
    if (!b.dataset.twprofile) return; // son propre compte
    b.onmouseenter = () => { clearTimeout(twCardTimer); twCardTimer = setTimeout(() => openTwCard(b, b.dataset.twprofile), 350); };
    b.onmouseleave = () => { clearTimeout(twCardTimer); twCardTimer = setTimeout(closeTwCard, 200); };
  });
}
addEventListener('scroll', () => { if (twCard) closeTwCard(); }, { passive: true, capture: true });

function accountHeaderHtml(a) {
  const club = ORG_TYPES.has(a.type) ? clubPage(a.handle) : null;
  const emblem = emblemUrl(club?.emblem);
  const stats = accountStats(a);
  const label = tr(TYPE_LABEL[a.type]);
  const bio = accountBio(a);
  const meta = [
    label && `<span>${hi('briefcase')}${esc(label.charAt(0) + label.slice(1).toLowerCase())}</span>`,
    club?.stadium && `<span>${hi('pin')}${esc(club.stadium)}</span>`,
    `<span>${hi('calendar')}${esc(tr('A rejoint Kop en {d}', { d: fmtDate(stats.joined, { month: 'long', year: 'numeric' }) }))}</span>`,
  ].filter(Boolean);
  const color = PROFILE_COLORS[hashOf(a.handle) % PROFILE_COLORS.length];
  return `<div class="tw-profile">
    <div class="tw-banner${emblem ? ' tw-banner-emblem' : ''}" data-banner="${esc(color)}">${emblem ? `<img src="${esc(emblem)}" alt="">` : ''}</div>
    <div class="tw-profile-top">
      <div class="tw-profile-photo${emblem ? ' emblem' : ` t-${esc(a.type || 'fan')}`}">${emblem ? `<img src="${esc(emblem)}" alt="">` : authorFace(a, initialOf(a.name))}</div>
      <div class="tw-profile-btns">${canDm(a) ? `<button class="tw-btn tw-btn-outline tw-dm-to" data-twdm="${esc(a.handle)}" title="${esc(tr('Envoyer un message à {name}', { name: a.name }))}" aria-label="${esc(tr('Envoyer un message à {name}', { name: a.name }))}">${hi('envelope')}</button>` : ''}${followBtnHtml(a.handle)}</div>
    </div>
    <div class="tw-profile-id">
      <h1 class="tw-profile-name">${esc(a.name)}${badgeHtml(a)}</h1>
      <p class="tw-profile-handle">@${esc(a.handle)}${followsMe(a.handle) ? `<span class="tw-follows-you">${tr('Te suit')}</span>` : ''}</p>
    </div>
    ${bio ? `<p class="tw-profile-bio">${linkify(bio)}</p>` : ''}
    <div class="tw-profile-meta">${meta.join('')}</div>
    <div class="tw-profile-counts">${followingOf(a) ? `<button class="tw-count-link" data-twfollowing="${esc(a.handle)}">${tr('{n} abonnements', { n: `<b>${fmtCount(stats.following)}</b>` })}</button>` : `<span>${tr('{n} abonnements', { n: `<b>${fmtCount(stats.following)}</b>` })}</span>`}<span title="${esc(tr('{n} abonnés', { n: fmtNum(stats.followers) }))}">${tr('{n} abonnés', { n: `<b>${followersText(a, stats)}</b>` })}</span></div>
  </div>`;
}

const TW_ACCOUNT_TABS = [['posts', 'Posts'], ['replies', 'Réponses']];

function followingPageHtml(a) {
  const list = followingOf(a) || [];
  return `<div class="tw-tabs tw-tabs-line"><button class="tw-tab active"><span class="tw-tab-in">${tr('Abonnements')}<span class="tw-tab-bar"></span></span></button></div>
    <ul class="tw-feed" id="tw-feed">${list.map((x) => {
      const page = clubPage(x.handle);
      const bio = page?.kind === 'competition' ? tr('Compte officiel · {name}.', { name: page.name }) : page?.kind === 'national' ? tr('Compte officiel de la sélection : {name}.', { name: page.name }) : page ? `${tr('Compte officiel de {name}.', { name: page.name })}${page.stadium ? ` ${page.stadium}.` : ''}` : '';
      return `<li class="tw-li tw-follow-row" role="link" tabindex="0" data-twprofile="${esc(x.handle)}">
        ${avatar(x)}
        <div class="tw-follow-main">
          <div class="tw-follow-head"><div class="tw-follow-id"><p class="tw-who-name"><span>${esc(x.name)}</span>${badgeHtml(x)}</p><p class="tw-who-user">@${esc(x.handle)}${followsMe(x.handle) ? `<span class="tw-follows-you">${tr('Te suit')}</span>` : ''}</p></div>${followBtnHtml(x.handle, true)}</div>
          ${bio ? `<p class="tw-follow-bio">${esc(bio)}</p>` : ''}
        </div></li>`;
    }).join('')}</ul>`;
}

// Page d'un post, comme sur X : le post en grand, l'heure et les vues, la zone de réponse, puis les réponses.
function postDetailHtml(p) {
  const badge = !p.author.isMe && tr(TYPE_LABEL[p.author.type]);
  const quoted = quotedOf(p);
  const replying = view.twReplyTo && view.twReplyTo.postId === p.id && !view.twReplyTo.replyId;
  const ids = `data-post="${esc(p.id)}" data-reply=""`;
  const prof = p.author.isMe ? '' : p.author.handle;
  return `<div class="tw-detail">
    <div class="tw-detail-head">
      <button class="tw-av-link" data-twprofile="${esc(prof)}" aria-label="${tr('Profil de {name}', { name: esc(p.author.name) })}">${avatar(p.author)}</button>
      <div class="tw-detail-who"><p><span class="tw-name" role="link" tabindex="0" data-twprofile="${esc(prof)}">${esc(p.author.name)}</span>${badgeHtml(p.author)}${badge ? `<span class="pill">${esc(badge)}</span>` : ''}</p><p class="tw-user">@${esc(p.author.handle)}</p></div>
      ${p.author.isMe ? '' : followBtnHtml(p.author.handle, true)}
    </div>
    <div class="tw-detail-text">${linkify(p.text)}</div>${twPollHtml(p)}
    ${promiseBadge(p)}
    ${p.media?.kind === 'video' ? videoHtml(p.media.path) : ''}
    ${quotedHtml(quoted)}
    ${p.likedBy?.length ? `<div class="liked-by">❤️ ${trn(p.likedBy.length, '{who} a aimé', '{who} ont aimé', { who: esc(p.likedBy.join(', ')) })}</div>` : ''}
    <p class="tw-detail-time">${esc(fullStamp(p))} · ${trn(postViews(p), '{n} vue', '{n} vues', { n: `<b>${fmtCount(postViews(p))}</b>` })}</p>
    <ul class="tw-actions tw-detail-actions">
      <li><button class="tw-act tw-reply${replying ? ' on' : ''}" data-twreply ${ids} title="${tr('Répondre')}">${hi('chat')}${fmtCount(p.replies?.length || 0)}</button></li>
      ${rtActionHtml(p, ids)}
      <li><button class="tw-act tw-like${p.likedByMe ? ' on' : ''}" data-twlike ${ids} title="${p.likedByMe ? tr('Retirer le j’aime') : tr('J’aime')}">${hi('heart')}${fmtCount(p.likes || 0)}</button></li>
      <li><button class="tw-act" data-twshare="${esc(p.id)}" title="${tr('Copier le post')}">${hi('share')}</button></li>
    </ul>
    ${replying ? replyBoxHtml(p.author.handle) : ''}
  </div>
  <ul class="tw-feed tw-detail-replies" id="tw-feed">${(p.replies || []).map((r) => `<li class="tw-li">${postHtml(r, { reply: true, parent: p })}</li>`).join('')}</ul>`;
}

// Notifications comme sur X : j'aime et reposts de tes posts (regroupés), réponses, mentions et citations.
const NOTIF_ICON = { like: 'heart', repost: 'repost', follow: 'user' };
function notifications() {
  const mine = [state.profile.handle, ...(state.profile.formerHandles || [])].map((h) => h.toLowerCase());
  const mentionsMe = (t) => mine.some((h) => new RegExp(`@${h}\\b`, 'i').test(t || ''));
  const out = [];
  state.feed.forEach((p, i) => {
    const base = i * 1000;
    if (p.author.isMe) {
      if (p.reposts) out.push({ kind: 'repost', post: p, order: base + 900 });
      if (p.likes) out.push({ kind: 'like', post: p, order: base + 950 });
    } else if (mentionsMe(p.text)) out.push({ kind: 'mention', post: p, order: base + 10 });
    else if (quotedOf(p)?.target.author.isMe) out.push({ kind: 'quote', post: p, order: base + 10 });
    (p.replies || []).forEach((r, k) => {
      if (r.author.isMe) { if (r.likes) out.push({ kind: 'like', post: p, reply: r, order: base + 960 + k }); return; }
      const toMe = p.author.isMe ? (!r.replyTo || mine.includes(String(r.replyTo).toLowerCase())) : mine.includes(String(r.replyTo || '').toLowerCase());
      if (toMe || mentionsMe(r.text)) out.push({ kind: 'reply', post: p, reply: r, order: base + 20 + k });
    });
  });
  for (const ev of state.followerLog || []) out.push({ kind: 'follow', ev, order: Math.max(0, (ev.feedLen || 1) - 1) * 1000 + 990 });
  return out.sort((a, b) => b.order - a.order);
}

// Qui s'est abonné : des comptes connus du fil (supporters, médias, consultants…), jamais deux fois le même,
// dans l'ordre des gains d'abonnés. Le reste du gain reste anonyme (« et 1 238 autres »).
function newFollowers() {
  const pool = Object.entries(state.accounts || {}).filter(([, a]) => ['fan', 'meme', 'stats', 'pundit', 'highlights', 'journalist'].includes(a.type));
  const used = new Set();
  const byEvent = new Map();
  for (const ev of state.followerLog || []) {
    const want = Math.min(3, ev.gain);
    const people = [];
    let h = hashOf(ev.id);
    for (let tries = 0; people.length < want && tries < pool.length * 2; tries++) {
      const [handle, a] = pool[h % pool.length];
      if (!used.has(handle)) { used.add(handle); people.push({ handle, name: a.name, type: a.type }); }
      h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
    }
    byEvent.set(ev.id, people);
  }
  return { byEvent, all: used };
}
const followsMe = (handle) => newFollowers().all.has(Object.keys(state.accounts || {}).find((k) => k.toLowerCase() === String(handle).toLowerCase()));

// Qui a aimé ou reposté : les vrais joueurs d'abord (leurs j'aime viennent du jeu), puis des comptes connus du fil.
function notifPeople(n) {
  const target = n.reply || n.post;
  const people = (n.kind === 'like' ? target.likedBy || [] : []).map((name) => ({ name, type: 'player' }));
  const pool = Object.entries(state.accounts || {}).filter(([, a]) => ['fan', 'meme', 'stats', 'pundit', 'highlights'].includes(a.type));
  let h = hashOf(target.id + n.kind);
  while (people.length < 3 && pool.length) {
    const [handle, a] = pool[h % pool.length];
    if (!people.some((x) => x.handle === handle)) people.push({ handle, name: a.name, type: a.type });
    h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
    if (people.length >= pool.length) break;
  }
  return people;
}

function notificationHtml(n) {
  if (n.kind === 'follow') {
    const people = newFollowers().byEvent.get(n.ev.id) || [];
    const named = people.slice(0, n.ev.gain > 2 ? 1 : 2);
    const others = n.ev.gain - named.length;
    const names = named.map((x) => `<b>${esc(x.name)}</b>`);
    const who = named.length ? (others > 0 ? trn(others, '{who} et {n} autre', '{who} et {n} autres', { who: names.join(', '), n: fmtCount(others) }) : andJoin(names)) : `<b>${trn(n.ev.gain, '{n} personne', '{n} personnes', { n: fmtCount(n.ev.gain) })}</b>`;
    const why = n.ev.reason === 'promise' ? tr('Promesse tenue : ta parole a fait son effet.') : '';
    return `<li class="tw-li tw-notif"${people[0] ? ` role="link" tabindex="0" data-twprofile="${esc(people[0].handle)}"` : ''}>
    <div class="tw-notif-icon follow">${hi('user')}</div>
    <div class="tw-notif-body">
      <div class="tw-notif-avs">${people.map((x) => avatar(x)).join('')}</div>
      <p class="tw-notif-what">${trn(n.ev.gain, '{who} s’est abonné à toi', '{who} se sont abonnés à toi', { who })}</p>
      ${why ? `<p class="tw-notif-text">${why}</p>` : ''}
    </div></li>`;
  }
  if (n.kind === 'reply') return `<li class="tw-li">${postHtml(n.reply, { parent: n.post })}</li>`;
  if (n.kind === 'mention' || n.kind === 'quote') return `<li class="tw-li">${postHtml(n.post)}</li>`;
  const target = n.reply || n.post;
  const total = n.kind === 'like' ? target.likes || 0 : target.reposts || 0;
  const people = notifPeople(n).slice(0, Math.min(3, total));
  const named = people.slice(0, total > 2 ? 1 : 2);
  const others = total - named.length;
  const names = named.map((x) => `<b>${esc(x.name)}</b>`);
  const who = others > 0 ? trn(others, '{who} et {n} autre', '{who} et {n} autres', { who: names.join(', '), n: fmtCount(others) }) : andJoin(names);
  const what = n.kind === 'like'
    ? (n.reply ? ['{who} a aimé ta réponse', '{who} ont aimé ta réponse'] : ['{who} a aimé ton post', '{who} ont aimé ton post'])
    : (n.reply ? ['{who} a reposté ta réponse', '{who} ont reposté ta réponse'] : ['{who} a reposté ton post', '{who} ont reposté ton post']);
  return `<li class="tw-li tw-notif" role="link" tabindex="0" data-twopen="${esc(n.post.id)}">
    <div class="tw-notif-icon ${n.kind}">${hi(NOTIF_ICON[n.kind])}</div>
    <div class="tw-notif-body">
      <div class="tw-notif-avs">${people.map((x) => avatar(x)).join('')}</div>
      <p class="tw-notif-what">${trn(total, ...what, { who })}</p>
      <p class="tw-notif-text">${linkify(target.text)}</p>
    </div></li>`;
}

const TW_NOTIF_TABS = [['all', 'Tout'], ['mentions', 'Mentions']];

// Pastille de la cloche : notifications arrivées depuis la dernière visite (mémorisées sur ce PC, par carrière).
const notifSeenKey = () => `tribune-notifs-vues:${state.careerId}`;
function unseenNotifications(total) {
  try { return Math.max(0, total - Number(localStorage.getItem(notifSeenKey()) ?? total)); } catch { return 0; }
}
function markNotificationsSeen(total) {
  try { localStorage.setItem(notifSeenKey(), String(total)); } catch { /* stockage indisponible : pas de pastille */ }
}
function notificationsHtml() {
  const all = notifications();
  const list = view.twNotifTab === 'mentions' ? all.filter((n) => ['reply', 'mention', 'quote'].includes(n.kind)) : all;
  if (!list.length) return `<ul class="tw-feed" id="tw-feed"><li>${empty(...TW_EMPTY.mentions.map((x) => (typeof x === 'function' ? x() : tr(x))))}</li></ul>`;
  return `<ul class="tw-feed" id="tw-feed">${list.slice(0, 120).map(notificationHtml).join('')}</ul>`;
}

// Fenêtre « Citer », comme sur X : son commentaire au-dessus du message cité. Posée sur la page (hors du rendu) :
// une synchro en arrière-plan ne la ferme pas. Les comptes réagissent tout de suite, le compte cité d'abord.
function openQuoteComposer(postId, replyId) {
  if ($('.tw-modal-back')) return;
  const root = state.feed.find((x) => x.id === postId);
  const target = root && (replyId ? (root.replies || []).find((r) => r.id === replyId) : root);
  if (!target) { toast(tr('Ce post n’existe plus.'), true); return; }
  const box = document.createElement('div');
  box.className = 'tw tw-modal-back';
  box.innerHTML = `<div class="tw-modal tw-qc" role="dialog" aria-modal="true" aria-label="${tr('Citer le post')}">
    <div class="tw-modal-head"><button class="tw-iconbtn tw-modal-x" data-close aria-label="${tr('Fermer')}">${hi('xmark')}</button><h2>${tr('Citer')}</h2></div>
    <div class="tw-modal-body"><div class="tw-qc-row">${avatar(me0())}
      <div class="tw-qc-main">
        <textarea id="tw-qc-text" rows="2" maxlength="280" placeholder="${tr('Ajouter un commentaire')}"></textarea>
        ${quotedHtml({ root, target }, { link: false })}
        <div class="tw-qc-foot"><span class="tw-chars" id="tw-qc-chars">${charRing(0)}</span><button class="tw-btn" id="tw-qc-send" disabled>${tr('Poster')}</button></div>
      </div></div></div></div>`;
  document.body.appendChild(box);
  const ta = box.querySelector('#tw-qc-text'), send = box.querySelector('#tw-qc-send');
  let busy = false;
  const close = () => { if (busy) return; box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);
  box.querySelector('[data-close]').onclick = close;
  box.onclick = (ev) => { if (ev.target === box && !ta.value.trim()) close(); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  ta.oninput = () => { grow(); box.querySelector('#tw-qc-chars').innerHTML = charRing(ta.value.length); send.disabled = !ta.value.trim(); };
  ta.onkeydown = (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !send.disabled) send.click(); };
  send.onclick = async () => {
    const text = ta.value.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true; ta.disabled = true; send.textContent = tr('Quelqu’un écrit…');
    try {
      state = await live.post(text, { postId, replyId: replyId || null });
      busy = false;
      close();
      mentionDir = null; // de nouveaux comptes ont pu apparaître
      Object.assign(view, { twFilter: 'all', twAuthor: null, twQuery: '', twPost: null, twFollowing: null, twStack: [] });
      view.openPost = state.feed.filter((p) => p.author.isMe).at(-1)?.id;
      render();
      twScrollTo(0);
    } catch (err) {
      state = await live.getState();
      busy = false;
      // Le post est parti même si les réponses n'ont pas pu être écrites : la fenêtre se ferme alors.
      if (state?.feed.some((p) => p.author.isMe && p.aboutPost === postId && p.text === text)) close();
      else { send.disabled = false; ta.disabled = false; send.textContent = tr('Poster'); }
      render();
      toast(err.message, true);
    }
  };
  ta.focus();
}

// Fenêtre « Éditer le profil », comme sur Twitter : bannière et photo (recadrées ici), nom, pseudo, bio, poste,
// ville, site, badge. Posée sur la page (hors du rendu) : une synchro en arrière-plan ne la ferme pas.
const PROFILE_MEDIA = { avatar: { w: 400, h: 400, title: 'Recadrer la photo' }, banner: { w: 1500, h: 500, title: 'Recadrer la bannière' } };

function openProfileEditor() {
  if ($('.tw-modal-back')) return;
  const prof = state.profile;
  const fields = { displayName: prof.displayName, handle: prof.handle, bio: prof.bio || '', position: prof.position || '', location: prof.location || '', website: prof.website || '' };
  // Images : undefined = inchangée, null = retirée, data:… = nouvelle image recadrée.
  const ed = { avatar: undefined, banner: undefined, color: prof.bannerColor || PROFILE_COLORS[0], verified: Boolean(prof.verified) };
  const shown = (kind) => (ed[kind] === undefined ? profileImg(prof[kind]) : ed[kind]);
  let crop = null, pickKind = null;

  const box = document.createElement('div');
  box.className = 'tw tw-modal-back';
  document.body.appendChild(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    if (crop) { crop = null; draw(); } else close();
  };
  document.addEventListener('keydown', onKey);

  const field = (k, label, max, multi = false) => `<label class="tw-field"><span class="tw-field-top"><span>${label}</span><span class="tw-field-count" data-count="${k}">${fields[k].length}/${max}</span></span>
    ${multi ? `<textarea data-f="${k}" maxlength="${max}" rows="3">${esc(fields[k])}</textarea>` : `<input data-f="${k}" maxlength="${max}" value="${esc(fields[k])}"${k === 'handle' ? ' spellcheck="false"' : ''}>`}</label>`;
  const mediaBtns = (kind) => `<div class="tw-media-btns"><button class="tw-media-btn" data-pick="${kind}" title="${kind === 'banner' ? tr('Changer la bannière') : tr('Changer la photo')}">${hi('camera')}</button>${shown(kind) ? `<button class="tw-media-btn" data-drop="${kind}" title="${kind === 'banner' ? tr('Retirer la bannière') : tr('Retirer la photo')}">${hi('xmark')}</button>` : ''}</div>`;

  function draw() {
    if (crop) { drawCrop(); return; }
    const banner = shown('banner'), photo = shown('avatar');
    box.innerHTML = `<div class="tw-modal" role="dialog" aria-modal="true" aria-label="${tr('Éditer le profil')}">
      <div class="tw-modal-head"><button class="tw-iconbtn tw-modal-x" data-close aria-label="${tr('Fermer')}">${hi('xmark')}</button><h2>${tr('Éditer le profil')}</h2><button class="tw-btn tw-btn-sm" id="pe-save">${tr('Enregistrer')}</button></div>
      <div class="tw-modal-body">
        <div class="tw-banner" data-banner="${esc(ed.color)}">${banner ? `<img src="${esc(banner)}" alt="">` : ''}${mediaBtns('banner')}</div>
        <div class="tw-pe-photo"><div class="tw-profile-photo">${photo ? `<img src="${esc(photo)}" alt="">` : faceIn(state.snapshot?.player?.name, initialOf(fields.displayName))}${mediaBtns('avatar')}</div></div>
        <div class="tw-pe-colors"><span>${tr('Couleur de la bannière')}</span>${PROFILE_COLORS.map((c) => `<button class="tw-swatch${c === ed.color ? ' on' : ''}" data-color="${c}" data-banner="${c}" aria-label="${tr('Couleur {c}', { c })}"></button>`).join('')}</div>
        ${field('displayName', tr('Nom'), 50)}
        ${field('handle', tr('Pseudo (@)'), 20)}
        ${field('bio', tr('Bio'), 160, true)}
        ${field('position', tr('Poste'), 40)}
        ${field('location', tr('Localisation'), 30)}
        ${field('website', tr('Site web'), 100)}
        <label class="tw-pe-check"><input type="checkbox" id="pe-verified"${ed.verified ? ' checked' : ''}> ${tr('Afficher le badge certifié')} <span class="verified">✔</span></label>
        <p class="tw-pe-note">${tr('Tes abonnés viennent de tes matchs : ils ne se modifient pas. Ton nom, ta bio et ta ville seront connus des autres comptes à la prochaine édition. Le poste sert aussi aux journalistes.')}</p>
      </div></div>
      <input type="file" id="pe-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>`;
    box.querySelectorAll('[data-banner]').forEach((el) => el.style.setProperty('--banner', el.dataset.banner));
    box.querySelector('[data-close]').onclick = close;
    box.querySelectorAll('[data-f]').forEach((el) => {
      el.oninput = () => {
        if (el.dataset.f === 'handle') el.value = el.value.replace(/^@/, '').replace(/[^\w]/g, '');
        fields[el.dataset.f] = el.value;
        box.querySelector(`[data-count="${el.dataset.f}"]`).textContent = `${el.value.length}/${el.maxLength}`;
      };
    });
    box.querySelector('#pe-verified').onchange = (ev) => { ed.verified = ev.target.checked; };
    box.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { ed.color = b.dataset.color; draw(); }; });
    box.querySelectorAll('[data-drop]').forEach((b) => { b.onclick = () => { ed[b.dataset.drop] = null; draw(); }; });
    const file = box.querySelector('#pe-file');
    box.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { pickKind = b.dataset.pick; file.value = ''; file.click(); }; });
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { toast(tr('Choisis une image JPEG, PNG, WebP ou GIF.'), true); return; }
      if (f.size > 20 * 1024 * 1024) { toast(tr('Image trop lourde (20 Mo au plus).'), true); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => { crop = { kind: pickKind, img, z: 1 }; draw(); };
        img.onerror = () => toast(tr('Image illisible.'), true);
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    const save = box.querySelector('#pe-save');
    save.onclick = async () => {
      if (fields.handle.length < 3) { toast(tr('Le pseudo doit faire au moins 3 caractères (lettres, chiffres ou _).'), true); return; }
      if (!fields.displayName.trim()) { toast(tr('Ton nom ne peut pas être vide.'), true); return; }
      save.disabled = true; save.textContent = tr('Enregistrement…');
      const update = { ...fields, verified: ed.verified, bannerColor: ed.color };
      for (const k of ['avatar', 'banner']) if (ed[k] !== undefined) update[k] = ed[k];
      try {
        state = await live.saveProfile(update);
        close();
        render();
        toast(tr('Profil mis à jour.'));
      } catch (err) {
        save.disabled = false; save.textContent = tr('Enregistrer');
        toast(err.message, true);
      }
    };
  }

  // Recadrage : l'image couvre toujours le cadre ; on la fait glisser, le curseur zoome.
  function drawCrop() {
    const spec = PROFILE_MEDIA[crop.kind];
    box.innerHTML = `<div class="tw-modal" role="dialog" aria-modal="true" aria-label="${tr(spec.title)}">
      <div class="tw-modal-head"><button class="tw-iconbtn tw-modal-x" data-back aria-label="${tr('Retour')}">${hi('back')}</button><h2>${tr(spec.title)}</h2><button class="tw-btn tw-btn-sm" id="pe-apply">${tr('Appliquer')}</button></div>
      <div class="tw-crop-stage"><div class="tw-crop-frame ${crop.kind}" id="pe-frame"><img src="${esc(crop.img.src)}" alt="" draggable="false"></div></div>
      <div class="tw-crop-zoom"><button class="tw-iconbtn" data-zoom="-0.25" aria-label="${tr('Dézoomer')}">${hi('minus')}</button><input type="range" id="pe-zoom" min="1" max="4" step="0.01" value="${crop.z}" aria-label="${tr('Zoom')}"><button class="tw-iconbtn" data-zoom="0.25" aria-label="${tr('Zoomer')}">${hi('plus')}</button></div>
      <p class="tw-pe-note tw-crop-note">${tr('Fais glisser l’image pour la placer dans le cadre.')}</p></div>`;
    const frame = box.querySelector('#pe-frame'), im = frame.querySelector('img'), zoom = box.querySelector('#pe-zoom');
    const { naturalWidth: w, naturalHeight: h } = crop.img;
    const W = frame.clientWidth, H = frame.clientHeight;
    const base = Math.max(W / w, H / h);
    const scale = () => base * crop.z;
    const clamp = () => {
      crop.x = Math.min(0, Math.max(W - w * scale(), crop.x));
      crop.y = Math.min(0, Math.max(H - h * scale(), crop.y));
    };
    const place = () => { clamp(); im.style.width = `${w * scale()}px`; im.style.transform = `translate(${crop.x}px, ${crop.y}px)`; };
    if (crop.x == null) { crop.x = (W - w * scale()) / 2; crop.y = (H - h * scale()) / 2; }
    place();
    // Zoom autour du centre du cadre.
    const setZoom = (z) => {
      const nz = Math.min(4, Math.max(1, z));
      const cx = (W / 2 - crop.x) / scale(), cy = (H / 2 - crop.y) / scale();
      crop.z = nz;
      crop.x = W / 2 - cx * scale(); crop.y = H / 2 - cy * scale();
      zoom.value = nz;
      place();
    };
    zoom.oninput = () => setZoom(Number(zoom.value));
    box.querySelectorAll('[data-zoom]').forEach((b) => { b.onclick = () => setZoom(crop.z + Number(b.dataset.zoom)); });
    frame.onwheel = (ev) => { ev.preventDefault(); setZoom(crop.z * (ev.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    let drag = null;
    frame.onpointerdown = (ev) => { drag = { x: ev.clientX - crop.x, y: ev.clientY - crop.y }; frame.setPointerCapture(ev.pointerId); };
    frame.onpointermove = (ev) => { if (!drag) return; crop.x = ev.clientX - drag.x; crop.y = ev.clientY - drag.y; place(); };
    frame.onpointerup = frame.onpointercancel = () => { drag = null; };
    box.querySelector('[data-back]').onclick = () => { crop = null; draw(); };
    box.querySelector('#pe-apply').onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = spec.w; canvas.height = spec.h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, spec.w, spec.h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(crop.img, -crop.x / scale(), -crop.y / scale(), W / scale(), H / scale(), 0, 0, spec.w, spec.h);
      ed[crop.kind] = canvas.toDataURL('image/jpeg', 0.9);
      crop = null;
      draw();
    };
  }

  draw();
  box.querySelector('[data-f="displayName"]')?.focus();
}

function renderTribune(page) {
  if (!state) { page.innerHTML = needSync(); return; }
  const liveMain = page.querySelector('.tw-main');
  if (liveMain) view.twY = liveMain.scrollTop;
  const prof = state.profile;
  const me = { name: prof.displayName, handle: prof.handle, type: 'me' };
  if (!TW_TITLE[view.twFilter]) view.twFilter = 'all';
  const home = ['all', 'following', 'official', 'fans'].includes(view.twFilter);
  const profile = ['mine', 'myreplies', 'mylikes'].includes(view.twFilter);
  buildPostClock();
  const openPost = view.twPost ? state.feed.find((p) => p.id === view.twPost) : null;
  if (view.twPost && !openPost) view.twPost = null;
  const author = !openPost && view.twAuthor ? accountOf(view.twAuthor) : null;
  if (view.twAuthor && !author && !openPost) view.twAuthor = null;
  const notifPage = view.twFilter === 'mentions' && !openPost && !author && !view.twQuery;
  const dmPage = view.twFilter === 'messages' && !openPost && !author && !view.twQuery;
  const dmAccount = dmPage && view.twDm ? dmOf(view.twDm) || accountOf(view.twDm) || { handle: view.twDm, name: view.twDm } : null;
  const dmCount = dmUnread();
  const notifTotal = notifications().length;
  if (notifPage) markNotificationsSeen(notifTotal);
  const unseen = unseenNotifications(notifTotal);
  const trends = tribuneTrends();
  const accounts = tribuneAccounts();
  const promises = state.promises || [];
  const nPromise = (s) => promises.filter((p) => p.status === s).length;
  const myPosts = state.feed.filter((p) => p.author.isMe).length;
  const ownPage = profile && !author && !view.twQuery;
  const followingPage = author && view.twFollowing && view.twFollowing.toLowerCase() === author.handle.toLowerCase() && followingOf(author);
  const title = openPost ? tr('Post') : dmAccount ? dmAccount.name : author ? author.name : ownPage ? prof.displayName : tr(TW_TITLE[view.twFilter]);
  const authorPosts = author ? state.feed.filter((p) => !p.author.isMe && p.author.handle.toLowerCase() === author.handle.toLowerCase()).length : 0;
  // Onglet par défaut : ses posts, ou ses réponses s'il n'a fait que répondre.
  const authorReplied = author && !authorPosts && state.feed.some((p) => (p.replies || []).some((r) => !r.author.isMe && r.author.handle.toLowerCase() === author.handle.toLowerCase()));
  if (author) view.twAuthorTabEff = view.twAuthorTab || (authorReplied ? 'replies' : 'posts');
  const sub = openPost ? '' : dmAccount ? `@${esc(dmAccount.handle)}` : followingPage ? `@${esc(author.handle)}` : author ? trn(authorPosts, '{n} post', '{n} posts', { n: fmtNum(authorPosts) })
    : view.twQuery ? `${tr('Recherche {q}', { q: quote(esc(view.twQuery)) })} <button class="tw-link" id="tw-clear">${tr('Effacer')}</button>`
      : profile ? trn(myPosts, '{n} post', '{n} posts', { n: fmtNum(myPosts) }) : '';
  // Nouveaux posts de l'onglet affiché (bandeau en tête du fil, pastille quand on a défilé).
  const held = home && !openPost && !author && !view.twQuery ? heldPosts().filter(TW_FILTER[view.twFilter]) : [];
  const anyHeld = heldPosts().length;
  const heldWho = [...new Map([...held].reverse().map((p) => [p.author.handle.toLowerCase(), p.author])).values()].slice(0, 3);
  const newBar = held.length ? `<button class="tw-newbar" id="tw-newbar">${trn(held.length, 'Afficher {n} nouveau post', 'Afficher {n} nouveaux posts', { n: fmtNum(held.length) })}</button>` : '';
  const newPill = held.length ? `<button class="tw-newpill" id="tw-newpill" aria-label="${tr('Afficher les nouveaux posts')}">${hi('arrowUp')}<span class="tw-newpill-av">${heldWho.map(avatar).join('')}</span><span>${trn(heldWho.length, 'a posté', 'ont posté')}</span></button>` : '';
  const mainBody = openPost ? postDetailHtml(openPost) : notifPage ? notificationsHtml() : dmPage ? dmPageHtml() : view.twFilter === 'explore' && !author && !view.twQuery
    ? `<div class="tw-explore">
        <div class="tw-panel-title"><h2>${tr('Tendances')}</h2></div>${trends.length ? trends.map(twTrendHtml).join('') : `<p class="tw-note">${tr('Pas encore de tendance : il faut quelques posts sur le même sujet.')}</p>`}
        <div class="tw-panel-title"><h2>${tr('Comptes')}</h2></div>${accounts.map(twWhoHtml).join('')}</div>`
    : `${home && !author && !view.twQuery ? `<div class="tw-form">${avatar(me)}
          <div class="tw-form-main">
            <div class="tw-form-input"><textarea id="composer" rows="1" maxlength="280" placeholder="${tr('Quoi de neuf ?')}">${esc(drafts.post)}</textarea>
              <div class="mention-pop hidden" id="mention-pop"></div></div>
            <div class="mention-warn hidden" id="mention-warn"></div>${twPollEditHtml()}
            <div class="tw-form-foot">
              <div class="tw-form-tools"><button type="button" class="tw-form-poll${drafts.poll ? ' on' : ''}" id="poll-btn" title="${tr(drafts.poll ? 'Retirer le sondage' : 'Ajouter un sondage')}" aria-pressed="${Boolean(drafts.poll)}">${hi('poll')}</button><div class="tw-form-icons" title="${tr('Images, GIF, emojis et lieux ne sont pas disponibles sur Kop')}">${['photo', 'gif', 'smile', 'pin'].map((k) => `<span>${hi(k)}</span>`).join('')}</div></div>
              <div class="tw-form-send"><span class="tw-chars" id="chars">${charRing(drafts.post.length)}</span><button class="tw-btn" id="post-btn"${drafts.post.trim() ? '' : ' disabled'}>${tr('Poster')}</button></div>
            </div>
          </div>
        </div>` : ''}
      ${followingPage ? followingPageHtml(author) : author ? `${accountHeaderHtml(author)}<div class="tw-tabs tw-tabs-line">${TW_ACCOUNT_TABS.map(([k, l]) => `<button class="tw-tab${view.twAuthorTabEff === k ? ' active' : ''}" data-twauthortab="${k}"><span class="tw-tab-in">${tr(l)}<span class="tw-tab-bar"></span></span></button>`).join('')}</div>` : ''}
      ${ownPage ? `${profileHeaderHtml()}<div class="tw-tabs tw-tabs-line">${TW_PROFILE_TABS.map(([k, l]) => `<button class="tw-tab${view.twFilter === k ? ' active' : ''}" data-twfilter="${k}"><span class="tw-tab-in">${tr(l)}<span class="tw-tab-bar"></span></span></button>`).join('')}</div>` : ''}
      ${view.twQuery && !author && !followingPage ? searchAccountsHtml() : ''}
      ${followingPage ? '' : `${newBar}<ul class="tw-feed" id="tw-feed">${tribuneFeedHtml()}</ul>`}`;
  page.innerHTML = `
    <div class="tw">
      <header class="tw-nav"><div class="tw-nav-in">
        <div class="tw-nav-top">
          <button class="tw-navitem tw-logo" data-twnav="all" title="Kop"><span class="ll-sitemark ll-wordmark">Kop</span></button>
          ${TW_NAV.map(([k, label, icon]) => `<button class="tw-navitem${!author && (view.twFilter === k || (k === 'all' && home) || (k === 'mine' && profile)) ? ' active' : ''}" data-twnav="${k}"><span class="tw-navicon">${hi(icon)}${k === 'all' && anyHeld ? '<span class="tw-navdot"></span>' : ''}${k === 'mentions' && unseen ? `<span class="tw-navcount">${unseen > 99 ? '99+' : unseen}</span>` : ''}${k === 'messages' && dmCount ? `<span class="tw-navcount">${dmCount > 99 ? '99+' : dmCount}</span>` : ''}</span><span class="tw-navlabel">${tr(label)}</span></button>`).join('')}
          <div class="tw-more"><button class="tw-navitem" id="tw-more-btn">${hi('moreCircle')}<span class="tw-navlabel">${tr('Plus')}</span></button>
            ${view.twMore ? `<div class="tw-popover">${TW_MORE.map(([k, label, icon]) => `<button class="tw-navitem tw-full" data-twnav="${k}">${hi(icon)}<span>${tr(label)}</span></button>`).join('')}</div>` : ''}</div>
          <div class="tw-cta"><button class="tw-btn tw-btn-lg" id="tw-compose">${hi('pencil')}<span class="tw-cta-label">${tr('Poster')}</span></button></div>
        </div>
        <div class="tw-account" role="button" tabindex="0" data-twnav="mine" title="${tr('Ton profil')}"><div class="tw-account-id">${avatar(me)}<div class="tw-account-text"><p class="tw-account-name">${esc(prof.displayName)}</p><p class="tw-account-user">@${esc(prof.handle)}</p></div></div>
          <span class="tw-account-more">${hi('ellipsis')}</span></div>
      </div></header>
      <main class="tw-main">
        <div class="tw-header${home && !openPost && !author && !view.twQuery ? ' tw-header-home' : ''}"><div class="tw-header-in">${openPost || author || view.twQuery || dmAccount ? `<button class="tw-iconbtn tw-back" data-twback aria-label="${tr('Revenir au fil')}">${hi('back')}</button>` : ''}<div class="tw-header-title"${dmAccount ? ` role="link" tabindex="0" data-twprofile="${esc(dmAccount.handle)}"` : ''}><h2>${esc(title)}</h2>${sub ? `<p class="tw-header-sub">${sub}</p>` : ''}</div></div>
          ${notifPage ? `<div class="tw-tabs">${TW_NOTIF_TABS.map(([k, l]) => `<button class="tw-tab${(view.twNotifTab || 'all') === k ? ' active' : ''}" data-twnotiftab="${k}"><span class="tw-tab-in">${tr(l)}<span class="tw-tab-bar"></span></span></button>`).join('')}</div>` : ''}
          ${home && !openPost && !author && !view.twQuery ? `<div class="tw-tabs">${TW_TABS.map(([k, l]) => `<button class="tw-tab${view.twFilter === k ? ' active' : ''}" data-twfilter="${k}"><span class="tw-tab-in">${tr(l)}<span class="tw-tab-bar"></span></span></button>`).join('')}</div>` : ''}${newPill}</div>
        ${mainBody}
      </main>
      <aside class="tw-aside"><div class="tw-aside-in">
        <div class="tw-search"><div class="tw-search-field">${hi('search')}<input type="search" id="tw-search" placeholder="${tr('Rechercher sur Kop')}" autocomplete="off" value="${esc(view.twQuery || '')}"><div class="tw-search-pop hidden" id="tw-search-pop"></div></div></div>
        ${accounts.length ? `<div class="tw-panel"><div class="tw-panel-title"><h2>${tr('Comptes à voir')}</h2></div>${accounts.slice(0, view.twAllWho ? 8 : 3).map(twWhoHtml).join('')}
          ${accounts.length > 3 ? `<div class="tw-panel-more"><button class="tw-link" data-twtoggle="twAllWho">${view.twAllWho ? tr('Afficher moins') : tr('Afficher plus')}</button></div>` : '<div class="tw-panel-end"></div>'}</div>` : ''}
        ${trends.length ? `<div class="tw-panel"><div class="tw-panel-title"><h2>${tr('Tendances')}</h2></div>${trends.slice(0, view.twAllTrends ? 10 : 5).map(twTrendHtml).join('')}
          ${trends.length > 5 ? `<div class="tw-panel-more"><button class="tw-link" data-twtoggle="twAllTrends">${view.twAllTrends ? tr('Afficher moins') : tr('Afficher plus')}</button></div>` : '<div class="tw-panel-end"></div>'}</div>` : ''}
        ${promises.length ? `<div class="tw-panel"><div class="tw-panel-title"><h2>${tr('Tes promesses')}</h2></div>
          <div class="tw-promises"><div><b>${nPromise('kept')}</b><span>${tr('tenues')}</span></div><div><b>${nPromise('broken')}</b><span>${tr('non tenues')}</span></div><div><b>${nPromise('open')}</b><span>${tr('en cours')}</span></div></div></div>` : ''}
        <div class="tw-footer"><span>${tr('Réseau fictif de LifeLegend')}</span><span>${tr('Comptes et posts écrits par l’IA')}</span><span>${tr('Propos des vraies personnes inventés')}</span><span>${tr('Interface : Twitter UI practice, © 2023 Roy Quilor (MIT)')}</span><span>${tr('Police Manrope, © The Manrope Project Authors (OFL)')}</span></div>
      </div></aside>
    </div>`;

  smPaintColors();
  const twMain = page.querySelector('.tw-main');
  twMain.scrollTop = view.twY || 0;
  twMain.onscroll = () => { view.twY = twMain.scrollTop; };
  const twSide = page.querySelector('.tw-aside-in');
  twSide.scrollTop = view.twSideY || 0;
  twSide.onscroll = () => { view.twSideY = twSide.scrollTop; };
  const goTo = (k) => {
    if (k === view.twFilter && TW_HOME.has(k) && !view.twAuthor && !view.twPost && !view.twQuery && held.length) { revealNewPosts(); return; }
    view.twMore = false; view.twMenu = null;
    if (view.twPost) view.twReplyTo = null;
    view.twFilter = k; view.twAuthor = null; view.twQuery = ''; view.twPost = null; view.twFollowing = null; view.twStack = []; view.twDm = null; view.twDmNew = false; view.twDmBack = null;
    render();
    twScrollTo(0);
  };
  page.querySelectorAll('[data-twnav], [data-twfilter]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); goTo(b.dataset.twnav || b.dataset.twfilter); }; });
  // Retour : d'abord de la page du post vers là d'où on venait, sinon vers le fil.
  page.querySelectorAll('[data-twback]').forEach((b) => {
    b.onclick = () => {
      if (view.twFilter === 'messages' && view.twDm) {
        const from = view.twDmBack;
        Object.assign(view, { twDm: null, twDmBack: null }, from ? { twAuthor: from, twFilter: 'all' } : {});
        render();
        twScrollTo(0);
        return;
      }
      if (view.twDm && view.twAuthor && !view.twPost && !view.twFollowing && !view.twStack?.length) {
        Object.assign(view, { twAuthor: null, twFilter: 'messages' });
        render();
        twScrollTo(1e9);
        return;
      }
      const fromPost = Boolean(view.twPost);
      if (fromPost) { view.twPost = null; view.twReplyTo = null; } else if (view.twFollowing) { view.twFollowing = null; } else if (view.twStack?.length) { Object.assign(view, view.twStack.pop()); } else { view.twAuthor = null; view.twQuery = ''; }
      render();
      twScrollTo(fromPost ? view.twScrollBack || 0 : 0);
    };
  });
  page.querySelectorAll('[data-twfollowing]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); view.twFollowing = b.dataset.twfollowing; render(); twScrollTo(0); };
  });
  page.querySelectorAll('[data-twnotiftab]').forEach((b) => { b.onclick = () => { view.twNotifTab = b.dataset.twnotiftab; render(); }; });
  page.querySelectorAll('[data-twauthortab]').forEach((b) => { b.onclick = () => { view.twAuthorTab = b.dataset.twauthortab; render(); }; });
  page.querySelectorAll('[data-twtoggle]').forEach((b) => { b.onclick = () => { view[b.dataset.twtoggle] = !view[b.dataset.twtoggle]; render(); }; });
  $('#tw-more-btn').onclick = (ev) => { ev.stopPropagation(); view.twMore = !view.twMore; view.twMenu = null; render(); };
  if ($('#tw-clear')) $('#tw-clear').onclick = () => { view.twQuery = ''; render(); };
  // Menus ouverts : un clic ailleurs les ferme.
  page.onclick = (ev) => {
    if ((view.twMenu || view.twMore || view.twRtMenu) && !ev.target.closest('.tw-dropdown, .tw-popover')) { view.twMenu = null; view.twMore = false; view.twRtMenu = null; render(); }
  };
  // Grand bouton « Poster » : ramène au formulaire de l'accueil.
  $('#tw-compose').onclick = (ev) => {
    ev.stopPropagation();
    if (view.twPost) view.twReplyTo = null;
    view.twFilter = 'all'; view.twAuthor = null; view.twQuery = ''; view.twPost = null; view.twMore = false;
    render();
    twScrollTo(0);
    $('#composer')?.focus();
  };
  // La recherche ne redessine que le fil, pour garder le curseur dans le champ.
  const search = $('#tw-search');
  const pop = $('#tw-search-pop');
  const openAccount = (h) => { view.twQuery = ''; view.twSearchAll = false; view.twFollowing = null; view.twPost = null; view.twStack = []; view.twAuthor = h; view.twAuthorTab = null; view.twFilter = 'all'; render(); twScrollTo(0); };
  const showPop = () => {
    const q = search.value.trim();
    if (!q) { pop.classList.add('hidden'); return; }
    const found = searchAccounts(q, 6);
    pop.innerHTML = `<button class="tw-search-row tw-search-all" data-q="1">${hi('search')}<span>${tr('Rechercher {q}', { q: quote(esc(q)) })}</span></button>${found.map((a) => `<button class="tw-search-row" data-h="${esc(a.handle)}">${avatar(a)}<span class="tw-search-who"><span class="tw-who-name"><span>${esc(a.name)}</span>${badgeHtml(a)}</span><span class="tw-who-user">@${esc(a.handle)}</span></span></button>`).join('')}`;
    pop.classList.remove('hidden');
    pop.querySelectorAll('[data-h]').forEach((b) => { b.onmousedown = (ev) => { ev.preventDefault(); openAccount(b.dataset.h); }; });
    pop.querySelector('[data-q]').onmousedown = (ev) => { ev.preventDefault(); view.twSearchAll = false; render(); twScrollTo(0); };
  };
  search.oninput = () => {
    view.twQuery = search.value;
    view.twSearchAll = false;
    if (view.twFilter === 'explore' || view.twFilter === 'messages') view.twFilter = 'all';
    showPop();
    const feed = $('#tw-feed');
    if (feed) { feed.innerHTML = tribuneFeedHtml(); bindTribuneFeed(page); }
  };
  search.onfocus = showPop;
  search.onblur = () => setTimeout(() => pop.classList.add('hidden'), 150);
  search.onkeydown = (ev) => {
    if (ev.key === 'Enter') { pop.classList.add('hidden'); render(); twScrollTo(0); }
    if (ev.key === 'Escape') { view.twQuery = ''; render(); }
  };
  bindTribuneFeed(page);
  bindDms(page);
  page.querySelectorAll('#tw-newbar, #tw-newpill').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); revealNewPosts(); }; });
  syncNewPill();
  // Couleur de bannière choisie : posée en propriété CSS (pas de style en ligne avec la politique de sécurité).
  page.querySelectorAll('[data-banner]').forEach((el) => el.style.setProperty('--banner', el.dataset.banner));
  if ($('#tw-edit-profile')) $('#tw-edit-profile').onclick = (ev) => { ev.stopPropagation(); openProfileEditor(); };

  twPaintPolls(page);
  const ta = $('#composer'), btn = $('#post-btn');
  if (!ta) return;
  // Le sondage : le bouton l'ajoute ou le retire ; les choix restent dans le brouillon quand la page se redessine.
  $('#poll-btn').onclick = () => { drafts.poll = drafts.poll ? null : ['', '']; render(); if (drafts.poll) $('[data-pollopt="0"]')?.focus(); };
  page.querySelectorAll('[data-pollopt]').forEach((i) => { i.oninput = () => { drafts.poll[Number(i.dataset.pollopt)] = i.value; }; });
  page.querySelectorAll('[data-polldrop]').forEach((b) => { b.onclick = () => { drafts.poll.splice(Number(b.dataset.polldrop), 1); render(); }; });
  if ($('#poll-add')) $('#poll-add').onclick = () => { drafts.poll.push(''); render(); $(`[data-pollopt="${drafts.poll.length - 1}"]`)?.focus(); };
  if ($('#poll-off')) $('#poll-off').onclick = () => { drafts.poll = null; render(); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  grow();
  ta.oninput = () => {
    drafts.post = ta.value;
    grow();
    $('#chars').innerHTML = charRing(ta.value.length);
    btn.disabled = !ta.value.trim();
    confirmUnknown = false;
    $('#mention-warn').classList.add('hidden');
    btn.textContent = tr('Poster');
    updateMentionPop(ta);
  };
  ta.onkeydown = (ev) => mentionKeys(ev, ta);
  ta.onblur = () => setTimeout(() => $('#mention-pop')?.classList.add('hidden'), 150);
  if (!mentionDir) live.mentionDirectory().then((d) => { mentionDir = d; }).catch(() => { mentionDir = []; });
  btn.onclick = async () => {
    const text = ta.value.trim();
    if (!text) return;
    // @ inconnu : on prévient avant de poster dans le vide.
    const unknown = [...text.matchAll(/@(\w{2,30})/g)].map((m) => m[1]).filter((h) => !(mentionDir || []).some((e) => e.handle.toLowerCase() === h.toLowerCase()));
    if (unknown.length && !confirmUnknown) {
      confirmUnknown = true;
      const warn = $('#mention-warn');
      warn.textContent = `⚠ ${trn(unknown.length, '{handles} n’existe pas sur Kop : personne ne le verra. Corrige ou clique encore pour poster quand même.', '{handles} n’existent pas sur Kop : personne ne les verra. Corrige ou clique encore pour poster quand même.', { handles: unknown.map((h) => '@' + h).join(', ') })}`;
      warn.classList.remove('hidden');
      btn.textContent = tr('Poster quand même');
      return;
    }
    const poll = drafts.poll ? { options: drafts.poll.map((o) => o.trim()).filter(Boolean) } : null;
    if (poll && new Set(poll.options.map((o) => o.toLowerCase())).size < 2) { toast(tr('Un sondage a besoin d’au moins deux choix différents.'), true); return; }
    confirmUnknown = false;
    btn.disabled = true; ta.disabled = true; btn.textContent = tr('Quelqu’un écrit…');
    try {
      state = await live.post(text, null, poll);
      drafts.post = '';
      drafts.poll = null;
      mentionDir = null; // de nouveaux comptes ont pu apparaître
      view.openPost = state.feed.filter((p) => p.author.isMe).at(-1)?.id;
      render();
    } catch (err) {
      state = await live.getState();
      render();
      toast(err.message, true);
    }
  };
}

// Messages privés de Kop (src/world/dms.js) : ses conversations, le choix d'un coéquipier ou d'un supporter, puis le fil.
const dmOf = (handle) => (state.dms || []).find((t) => t.handle.toLowerCase() === String(handle).toLowerCase()) || null;
const dmUnread = () => (state.dms || []).filter((t) => t.unread).length;
// Bouton sur un profil : ses coéquipiers du moment et les supporters (le moteur revérifie).
const canDm = (a) => ['fan', 'rival'].includes(a.type) || (a.type === 'player' && (state.snapshot?.rosters?.mine || []).includes(a.name));
let dmDir = null;

const dmRowHtml = (a, last = null) => `<button class="tw-dm-row${a.unread ? ' unread' : ''}" data-twdm="${esc(a.handle)}">${avatar(a)}
  <span class="tw-dm-text"><span class="tw-dm-head"><span class="tw-who-name"><span>${esc(a.name)}</span>${badgeHtml(a)}</span><span class="tw-who-user">@${esc(a.handle)}</span>${last ? `<span class="tw-dm-date">${esc(fmtDate(last.gameDate, { day: 'numeric', month: 'short' }))}</span>` : ''}</span>
  ${last ? `<span class="tw-dm-last">${last.who === 'me' ? `${tr('Toi :')} ` : ''}${esc(last.text)}</span>` : ''}</span>${a.unread ? '<span class="tw-dm-dot"></span>' : ''}</button>`;

function dmFoundHtml(query = '') {
  if (!dmDir) return '';
  const q = plainText(query).trim();
  const found = dmDir.filter((c) => !q || plainText(`${c.name} @${c.handle}`).includes(q));
  const group = (title, list) => (list.length ? `<div class="tw-panel-title"><h2>${title}</h2></div>${list.slice(0, q ? 20 : 40).map((c) => dmRowHtml(c)).join('')}` : '');
  const html = group(tr('Coéquipiers'), found.filter((c) => c.kind === 'teammate')) + group(tr('Supporters'), found.filter((c) => c.kind === 'fan'));
  return html || `<p class="tw-note tw-dm-none">${tr('Aucun compte trouvé.')}</p>`;
}

function dmPageHtml() {
  if (view.twDm) return dmThreadHtml(view.twDm);
  const threads = [...(state.dms || [])].filter((t) => t.messages.length).sort((a, b) => (b.messages.at(-1).at || 0) - (a.messages.at(-1).at || 0));
  return `<div class="tw-dm-bar"><button class="tw-btn tw-btn-sm${view.twDmNew ? ' tw-btn-outline' : ''}" id="tw-dm-new">${view.twDmNew ? tr('Fermer') : tr('Nouveau message')}</button></div>
    ${view.twDmNew ? `<div class="tw-dm-picker"><div class="tw-dm-search"><input type="search" id="tw-dm-q" placeholder="${tr('Rechercher un coéquipier ou un supporter')}" autocomplete="off"></div><div id="tw-dm-found">${dmFoundHtml()}</div></div>` : ''}
    ${threads.length ? threads.map((t) => dmRowHtml(t, t.messages.at(-1))).join('') : view.twDmNew ? '' : empty(tr('Aucun message'), tr('Écris à un coéquipier ou à un supporter. Ce qui se dit ici reste entre vous : ni la presse ni Kop n’en sauront rien.'))}`;
}

function dmThreadHtml(handle) {
  const t = dmOf(handle);
  const a = accountOf(handle) || t || { handle, name: handle, type: 'fan' };
  const pending = view.twDmPending === handle.toLowerCase();
  let day = null;
  const msgs = (t?.messages || []).map((m) => {
    const sep = m.gameDate !== day ? `<div class="tw-dm-day">${esc(fmtDate(m.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>` : '';
    day = m.gameDate;
    return `${sep}<div class="tw-dm-msg${m.who === 'me' ? ' me' : ''}">${esc(m.text)}</div>`;
  }).join('');
  const waiting = !pending && t && !t.closed && t.messages.at(-1)?.who === 'me';
  return `<div class="tw-dm-thread">
    <p class="tw-dm-private">${hi('envelope')}<span>${tr('Entre vous : ni la presse ni Kop n’en sauront rien.')}</span></p>
    <div class="tw-dm-msgs">${msgs}${pending ? `<div class="tw-dm-msg tw-dm-typing">${tr('Quelqu’un écrit…')}</div>` : ''}</div>
    ${waiting ? `<p class="tw-note tw-dm-wait">${esc(tr('{name} n’a pas encore répondu.', { name: a.name }))} <button class="tw-link" id="tw-dm-retry">${tr('Réessayer')}</button></p>` : ''}
    ${t?.closed ? `<p class="tw-note tw-dm-wait">${esc(tr('{name} ne répond plus à tes messages.', { name: a.name }))}</p>` : `<div class="tw-dm-compose"><textarea id="tw-dm-text" rows="1" maxlength="1000" placeholder="${tr('Écris ton message…')}"${pending ? ' disabled' : ''}>${esc(drafts.dm[handle.toLowerCase()] || '')}</textarea><button class="tw-btn" id="tw-dm-send"${pending || !(drafts.dm[handle.toLowerCase()] || '').trim() ? ' disabled' : ''}>${tr('Envoyer')}</button></div>`}
  </div>`;
}

function bindDms(page) {
  page.querySelectorAll('[data-twdm]').forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      Object.assign(view, { twDmBack: view.twAuthor || null, twFilter: 'messages', twDm: b.dataset.twdm, twDmNew: false, twAuthor: null, twPost: null, twQuery: '', twFollowing: null, twStack: [] });
      render();
      twScrollTo(1e9);
      $('#tw-dm-text')?.focus();
    };
  });
  if ($('#tw-dm-new')) {
    $('#tw-dm-new').onclick = async () => {
      view.twDmNew = !view.twDmNew;
      if (view.twDmNew) dmDir = await live.dmContacts().catch(() => []);
      render();
      $('#tw-dm-q')?.focus();
    };
  }
  const q = $('#tw-dm-q');
  if (q) q.oninput = () => { $('#tw-dm-found').innerHTML = dmFoundHtml(q.value); bindDms($('#tw-dm-found')); };
  const handle = view.twDm;
  if (!handle || view.twFilter !== 'messages') return;
  if (dmOf(handle)?.unread) live.readDm(handle).then((s) => { state = s; render(); }).catch(() => {});
  const key = handle.toLowerCase();
  const send = async (text) => {
    view.twDmPending = key;
    drafts.dm[key] = '';
    if (text) {
      const t = dmOf(handle);
      if (t) t.messages.push({ who: 'me', text, gameDate: state.snapshot.gameDate });
      else state.dms = [...(state.dms || []), { ...(accountOf(handle) || { handle, name: handle, type: 'fan' }), messages: [{ who: 'me', text, gameDate: state.snapshot.gameDate }] }];
    }
    render();
    twScrollTo(1e9);
    try {
      state = await live.sendDm(handle, text);
    } catch (err) {
      state = await live.getState();
      toast(err.message, true);
    }
    view.twDmPending = null;
    render();
    twScrollTo(1e9);
    $('#tw-dm-text')?.focus();
  };
  if ($('#tw-dm-retry')) $('#tw-dm-retry').onclick = () => send('');
  const ta = $('#tw-dm-text'), btn = $('#tw-dm-send');
  if (!ta) return;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  grow();
  ta.oninput = () => { drafts.dm[key] = ta.value; grow(); btn.disabled = !ta.value.trim(); };
  ta.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); if (ta.value.trim()) send(ta.value.trim()); } };
  btn.onclick = () => send(ta.value.trim());
}

// ---------- Vestiaire : le groupe privé de son club (src/world/huddle.js) ----------
// Disposé d'après sa référence : une grande carte sur son fond, trois colonnes (les groupes et le staff, le vestiaire, la
// conversation). Les couleurs : le thème de LifeLegend et celles de l'écusson du groupe, pour l'accent et le reflet sur ce qui
// est actif. Un clic sur un nom le mentionne : la personne nommée répond en premier (consigne de l'IA).
const hdActive = () => (state?.huddles || []).find((g) => g.scope !== 'national' && !g.left && g.clubRef === state.snapshot?.club?.ref) || null;
const hdUnread = () => (state?.huddles || []).filter((g) => !g.left).reduce((n, g) => n + (g.unread || 0), 0);
const hdRole = (r, group) => ({ coach: group?.scope === 'national' ? tr('Sélectionneur') : tr('Entraîneur'), assistant: tr('Entraîneur adjoint'), fitness: tr('Préparateur physique'), physio: tr('Kiné'), manager: tr('Intendant') }[r] || '');
const hdLastSaid = (g) => g.messages.filter((m) => m.who !== 'system').at(-1);
const hdMembers = (g) => [...(g.coach ? [g.coach] : []), ...g.staff.map((p) => p.name), ...g.players];
// Le visage du joueur sur une pastille, sinon ses initiales : toujours la même couleur pour la même personne. Le point vert : a écrit ce jour-là.
const hdInitials = (name) => { const w = String(name || '?').replace(/\./g, ' ').trim().split(/\s+/); return (w.length > 1 ? `${w[0][0]}${w.at(-1)[0]}` : w[0].slice(0, 2)).toUpperCase(); };
const hdFace = (name, on) => `<span class="hd-face t${[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8}${on ? ' live' : ''}">${isKnownCoach(name) ? coachFaceIn(name, esc(hdInitials(name))) : isKnownPlayer(name) ? faceIn(name, esc(hdInitials(name))) : esc(hdInitials(name))}</span>`;
function hdMe(on) {
  return `<span class="hd-face me${on ? ' live' : ''}">${myFaceIn(esc(hdInitials(state.profile?.displayName || state.snapshot.player.name)))}</span>`;
}
function hdEvent(m, group) {
  if (m.event === 'created') return tr('Groupe {club} : tu en fais partie.', { club: group.club });
  if (m.event === 'joined') return tr('{name} a rejoint le groupe', { name: m.name });
  if (m.event === 'left') return tr('{name} a quitté le groupe', { name: m.name });
  return m.event === 'you_left' ? tr('Tu as quitté le groupe') : tr('Tu es de retour dans le groupe');
}
// Le texte d'un message, les mentions en couleur.
function hdText(text, group) {
  let out = esc(text);
  [...hdMembers(group), state.snapshot.player.name].sort((a, b) => b.length - a.length).forEach((n) => { out = out.split(`@${esc(n)}`).join(`<b class="hd-tag">@${esc(n)}</b>`); });
  return out;
}
// Le prochain match annoncé par l'intendant, en carte sous son message, tant qu'il n'est pas joué.
function hdMatchCard(group) {
  const n = group.scope === 'national' ? state.snapshot.nationalTeam?.next : state.snapshot.next;
  if (!n?.id || n.id !== group.announced) return '';
  const days = dsDaysTo(n.date);
  const when = days <= 0 ? tr('Aujourd’hui') : days === 1 ? tr('Demain') : tr('Dans {n} jours', { n: days });
  return `<div class="hd-match"><span class="hd-match-crests">${crestHtml(n.home, ' hd-crest')}${crestHtml(n.away, ' hd-crest')}</span>
    <span><b>${esc(n.home)} – ${esc(n.away)}</b><small>${esc(fmtDate(n.date, { weekday: 'short', day: 'numeric', month: 'short' }))}${n.hour != null ? ` · ${hh(n.hour)}` : ''}${n.stadium ? ` · ${esc(n.stadium)}` : ''}</small></span><em>${esc(when)}</em></div>`;
}

// L'heure du message dans la journée du jeu (les messages d'avant cette mise à jour n'en ont pas).
const hdClock = (m) => (Number.isInteger(m.clock) ? `<time>${String(Math.floor(m.clock / 60)).padStart(2, '0')}:${String(m.clock % 60).padStart(2, '0')}</time>` : '');
// Les réactions emoji sous un message (src/world/huddle.js, reactionsFor).
function hdReacts(m) {
  if (!Array.isArray(m.reactions) || !m.reactions.length) return '';
  const total = m.reactions.reduce((n, r) => n + (Number(r[1]) || 0), 0);
  return `<span class="hd-reacts" title="${esc(trn(total, '{n} réaction', '{n} réactions'))}">${m.reactions.map(([e, n]) => `<span>${esc(e)}${n > 1 ? `<b>${Number(n)}</b>` : ''}</span>`).join('')}</span>`;
}

function hdMessagesHtml(group, onDay) {
  const list = group.messages;
  const sameRun = (a, b) => a && b && a.who !== 'system' && a.who === b.who && a.from === b.from && a.gameDate === b.gameDate;
  const card = hdMatchCard(group);
  const cardAt = card ? list.findLastIndex((m) => m.role === 'manager') : -1;
  let day = null;
  return list.map((m, i) => {
    const sep = m.gameDate !== day ? `<div class="hd-day"><span>${esc(m.gameDate === state.snapshot.gameDate ? tr('Aujourd’hui') : fmtDate(m.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>` : '';
    day = m.gameDate;
    if (m.who === 'system') return `${sep}<div class="hd-event">${esc(hdEvent(m, group))}</div>`;
    const first = !sameRun(list[i - 1], m), last = !sameRun(m, list[i + 1]);
    const bubble = `<div class="hd-bubble">${hdText(m.text, group)}</div>`;
    const time = hdClock(m);
    const reacts = hdReacts(m);
    if (m.who === 'me') return `${sep}<div class="hd-msg me${first ? ' first' : ''}">${first ? `<span class="hd-from">${time}${tr('Toi')}</span>` : ''}<div class="hd-line">${bubble}${last ? hdMe(onDay.has('me')) : '<span class="hd-gap"></span>'}</div>${reacts ? `<div class="hd-line">${reacts}<span class="hd-gap"></span></div>` : ''}</div>`;
    return `${sep}<div class="hd-msg${first ? ' first' : ''}">${first ? `<span class="hd-from">${esc(m.from)}${m.role ? ` <i>${esc(hdRole(m.role, group))}</i>` : ''}${time}</span>` : ''}<div class="hd-line">${last ? hdFace(m.from, onDay.has(m.from)) : '<span class="hd-gap"></span>'}${bubble}</div>${reacts ? `<div class="hd-line"><span class="hd-gap"></span>${reacts}</div>` : ''}${i === cardAt ? `<div class="hd-line"><span class="hd-gap"></span>${card}</div>` : ''}</div>`;
  }).join('');
}

// Les groupes et le staff.
function hdNavHtml(group, onDay) {
  const memberCount = (g) => tr('{n} membres', { n: hdMembers(g).length + 1 });
  const inbox = (g) => `<button class="hd-inbox${g === group ? ' on' : ''}" data-hdgroup="${esc(g.id)}">${crestHtml(g.club, ' hd-crest')}<span><b>${esc(g.club)}</b><small>${g.left ? tr('Ancien groupe') : g.scope === 'national' ? tr('Sélection') : esc(memberCount(g))}</small></span>${g.unread ? '<i class="hd-dot"></i>' : ''}</button>`;
  const groups = state.huddles || [];
  const staff = [...(group.coach ? [{ name: group.coach, role: 'coach' }] : []), ...group.staff];
  const me = state.profile?.displayName || state.snapshot.player.name;
  return `<div class="hd-brand ll-wordmark">Vestiaire</div>
    <label class="hd-search">${hi('search')}<input type="search" id="hd-search" placeholder="${tr('Chercher un membre')}" autocomplete="off" value="${esc(view.hdQuery || '')}"><kbd>/</kbd></label>
    <h3>${tr('Groupes')}</h3>${groups.filter((g) => !g.left).map(inbox).join('')}
    ${groups.some((g) => g.left) ? `<h3>${tr('Anciens groupes')}</h3>${groups.filter((g) => g.left).map(inbox).join('')}` : ''}
    <h3>${tr('Staff')}</h3>${staff.map((p) => `<button class="hd-person" data-hdmention="${esc(p.name)}" title="${esc(tr('Mentionner {name}', { name: p.name }))}">${hdFace(p.name, onDay.has(p.name))}<span><b>${esc(p.name)}</b><small>${esc(hdRole(p.role, group))}</small></span></button>`).join('')}
    <footer class="hd-self">${hdMe(true)}<span><b>${esc(me)}</b>${state.profile?.handle ? `<small>@${esc(state.profile.handle)}</small>` : ''}</span></footer>`;
}

// Le vestiaire : ceux qui viennent d'écrire d'abord, puis ceux qui jouent le plus.
function hdListHtml(group, onDay) {
  const stats = new Map(group.scope === 'national' ? [] : (state.snapshot.squad || []).map((p) => [p.name, p]));
  const said = new Map();
  group.messages.forEach((m) => { if (m.who === 'them') said.set(m.from, m); });
  const players = group.players.map((name) => ({ name, said: said.get(name), st: stats.get(name) }))
    .sort((a, b) => (b.said?.at || 0) - (a.said?.at || 0) || (b.st?.minutes || 0) - (a.st?.minutes || 0));
  const statLine = (st) => (st?.apps ? `${trn(st.apps, '{n} match', '{n} matchs')}${st.goals ? ` · ${trn(st.goals, '{n} but', '{n} buts')}` : ''}` : tr('Pas encore joué'));
  return `<header class="hd-list-head"><h2>${tr('Effectif')}</h2><p>${tr('Clique sur un nom pour le mentionner.')}</p></header>
    <div class="hd-list-label">${tr('Joueurs')} · ${group.players.length}</div>
    <div class="hd-rows">${players.map((p) => `<button class="hd-row" data-hdmention="${esc(p.name)}" title="${esc(tr('Mentionner {name}', { name: p.name }))}">${hdFace(p.name, onDay.has(p.name))}
      <span class="hd-row-main"><span class="hd-row-top"><b>${esc(p.name)}</b>${p.said ? `<time>${esc(shortDate(p.said.gameDate))}</time>` : ''}</span>
        <span class="hd-row-sub"><small>${p.said ? esc(snippet(p.said.text)) : esc(statLine(p.st))}</small></span></span></button>`).join('')}
      <p class="hd-none hidden" id="hd-none">${tr('Aucun membre ne correspond.')}</p></div>`;
}

function renderHuddle(page) {
  if (!state?.snapshot) { page.innerHTML = needSync(); return; }
  const group = (state.huddles || []).find((g) => g.id === view.hdGroup) || hdActive();
  // Carrière commencée avant Vestiaire : le moteur ouvre le groupe. Messages non lus : il les marque lus.
  if (!group ? !view.hdOpened : group.unread) {
    view.hdOpened = true;
    if (group) group.unread = 0;
    live.readHuddle(group?.id).then((s) => { state = s; if (current === 'huddle') render(); }).catch(() => {});
  }
  if (!group) { page.innerHTML = empty('Vestiaire', tr('Le groupe de ton club apparaîtra à ta prochaine synchro.')); return; }
  const pending = Boolean(view.hdPending);
  const waiting = !pending && !group.left && hdLastSaid(group)?.who === 'me';
  const quiet = !group.messages.some((m) => m.who !== 'system');
  // Ceux qui ont écrit le jour du match en cours de la sauvegarde.
  const onDay = new Set(group.messages.filter((m) => m.who !== 'system' && m.gameDate === state.snapshot.gameDate).map((m) => (m.who === 'me' ? 'me' : m.from)));
  const speakers = [...new Set(group.messages.filter((m) => m.who === 'them').map((m) => m.from))].reverse();
  const stack = [...speakers, ...hdMembers(group)].filter((n, i, all) => all.indexOf(n) === i).slice(0, 3);
  page.innerHTML = `<div class="hd${view.hdDrawer ? ' drawer' : ''}" data-hdclub="${esc(group.club)}">
    <div class="hd-scrim" data-hdmenu></div>
    <div class="hd-panels"><aside class="hd-nav">${hdNavHtml(group, onDay)}</aside><section class="hd-list">${hdListHtml(group, onDay)}</section></div>
    <section class="hd-chat">
      <header class="hd-head">
        <button class="hd-tool hd-menu" data-hdmenu title="${tr('Membres')}">${hi('bars')}</button>
        <div class="hd-stack">${stack.map((n) => hdFace(n)).join('')}</div>
        <div class="hd-title"><h2>${esc(group.club)}</h2><p>${esc(tr('{n} membres', { n: hdMembers(group).length + 1 }))}${onDay.size ? ` · ${trn(onDay.size, '{n} actif aujourd’hui', '{n} actifs aujourd’hui')}` : ''}</p></div>
      </header>
      <div class="hd-msgs" id="hd-msgs">
        <p class="hd-private">${hi('lock')}<span>${tr('Entre vous : ni la presse ni Kop n’en sauront rien.')}</span></p>
        ${hdMessagesHtml(group, onDay)}${quiet ? `<p class="hd-quiet">${tr('Le groupe s’anime à chaque nouvelle édition. Tu peux aussi écrire le premier message.')}</p>` : ''}
        ${pending ? `<div class="hd-msg first"><div class="hd-line"><span class="hd-gap"></span><div class="hd-bubble hd-typing" title="${tr('Quelqu’un écrit…')}" aria-label="${tr('Quelqu’un écrit…')}"><i></i><i></i><i></i></div></div></div>` : ''}
      </div>
      ${waiting ? `<p class="hd-wait">${tr('Le groupe n’a pas encore répondu.')} <button id="hd-retry">${tr('Réessayer')}</button></p>` : ''}
      ${!group.left ? `<div class="hd-foot"><div class="hd-compose">
        <div class="hd-pop hidden" id="hd-pop"></div>
        <button class="hd-at" id="hd-at" title="${tr('Mentionner quelqu’un')}"${pending ? ' disabled' : ''}>@</button>
        <textarea id="hd-text" rows="1" maxlength="1000" placeholder="${tr('Écris au groupe…')}"${pending ? ' disabled' : ''}>${esc(drafts.huddle[group.id] || '')}</textarea>
        <button class="hd-tool" id="hd-emoji" title="${tr('Émojis')}"${pending ? ' disabled' : ''}>${hi('smile')}</button>
        <button class="hd-tool hd-send" id="hd-send" title="${tr('Envoyer')}"${pending || !(drafts.huddle[group.id] || '').trim() ? ' disabled' : ''}>${hi('plane')}</button>
      </div></div>` : `<p class="hd-wait">${tr('Tu as quitté ce groupe : tu peux relire ses messages, plus y écrire.')}</p>`}
    </section>
  </div>`;
  bindHuddle(page, group);
}

// Le clavier d'emoji (lifelegend/emoji.js), rangé comme celui d'iOS : catégories, couleur de peau, récents.
const HD_EMOJI_TABS = [['recent', '🕘'], ['smileys', '😀'], ['animals', '🐻'], ['food', '🍔'], ['activity', '⚽'], ['travel', '🚗'], ['objects', '💡'], ['symbols', '🔣'], ['flags', '🏁']];
const hdEmojiTitle = (k) => ({ recent: tr('Récents'), smileys: tr('Smileys et personnes'), animals: tr('Animaux et nature'), food: tr('Nourriture et boissons'), activity: tr('Activités'), travel: tr('Voyages et lieux'), objects: tr('Objets'), symbols: tr('Symboles'), flags: tr('Drapeaux') }[k]);
const HD_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
const hdLoad = (k, d) => { try { return JSON.parse(localStorage.getItem(`ll-huddle-${k}`)) ?? d; } catch { return d; } };
const hdSave = (k, v) => { try { localStorage.setItem(`ll-huddle-${k}`, JSON.stringify(v)); } catch { /* stockage indisponible : rien à mémoriser */ } };
// Un emoji dans la couleur de peau choisie, s'il en a une (le groupe de deux personnes : les deux, jamais la poignée de main).
let hdRgi = null;
function hdToned(e, tone) {
  if (!tone) return e;
  hdRgi ??= new RegExp('^\\p{RGI_Emoji}$', 'v');
  const all = e.replace(/(?!\u{1F91D})(\p{Emoji_Modifier_Base})\uFE0F?/gu, `$1${tone}`);
  if (all !== e && hdRgi.test(all)) return all;
  const first = String.fromCodePoint(e.codePointAt(0));
  const one = `${first}${tone}${e.slice(first.length).replace(/^\uFE0F/, '')}`;
  return hdRgi.test(one) ? one : e;
}
// Ce que la police de la machine sait dessiner : une séquence inconnue s'étale sur plusieurs emoji, un emoji trop récent
// devient un carré vide. Ceux-là sont retirés. Les drapeaux restent : ceux des pays viennent de la police Twemoji Country Flags.
// La vérification se fait par petits morceaux en arrière-plan, sinon elle bloquerait la page près d'une seconde.
const hdEmojiPages = {};
const hdEmojiRaw = () => Object.fromEntries(Object.entries(window.LL_EMOJI || {}).map(([k, s]) => [k, s.split(' ')]));
let hdEmojiLists = null, hdEmojiChecked = false;
const hdEmojiCats = () => (hdEmojiLists ??= hdEmojiRaw());
function hdEmojiWarm() {
  if (hdEmojiChecked) return;
  hdEmojiChecked = true;
  let ctx, one, blank;
  try {
    ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.canvas.width = ctx.canvas.height = 32;
    ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textBaseline = 'top';
  } catch { return; }
  const print = (e) => { ctx.clearRect(0, 0, 32, 32); ctx.fillText(e, 0, 0); return ctx.getImageData(0, 0, 32, 32).data.join(); };
  const drawn = (e) => (e.includes('‍') ? ctx.measureText(e).width < one * 1.4 : e.codePointAt(0) < 0x1F900 || print(e) !== blank);
  const todo = Object.entries(hdEmojiRaw()).filter(([k]) => k !== 'flags').flatMap(([k, l]) => l.map((e) => [k, e]));
  const gone = new Set();
  let i = 0;
  const step = () => {
    one ??= ctx.measureText('😀').width;
    blank ??= print('🯿');
    const end = performance.now() + 8;
    while (i < todo.length && performance.now() < end) { const [, e] = todo[i++]; if (!drawn(e)) gone.add(e); }
    if (i < todo.length) { setTimeout(step, 20); return; }
    if (!gone.size) return;
    hdEmojiLists = Object.fromEntries(Object.entries(hdEmojiRaw()).map(([k, l]) => [k, l.filter((e) => !gone.has(e))]));
    for (const k of Object.keys(hdEmojiPages)) delete hdEmojiPages[k];
  };
  setTimeout(step, 400);
}
function hdEmojiHtml() {
  const tone = hdLoad('tone', '');
  const cats = hdEmojiCats();
  const recent = hdLoad('recent', []);
  const grids = (list) => { let out = ''; for (let i = 0; i < list.length; i += 54) { const part = list.slice(i, i + 54); out += `<div class="hd-emoji-grid r${Math.ceil(part.length / 9)}">${part.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>`; } return out; };
  const section = (k, list) => `<section data-cat="${k}"><h4>${esc(hdEmojiTitle(k))}</h4>${grids(list)}</section>`;
  hdEmojiPages[tone] ??= Object.entries(cats).map(([k, list]) => section(k, k === 'smileys' ? list.map((e) => hdToned(e, tone)) : list)).join('');
  const tabs = HD_EMOJI_TABS.filter(([k]) => (k === 'recent' ? recent.length : cats[k]?.length));
  return `<div class="hd-emoji-head"><b>${tr('Émojis')}</b><div class="hd-tones" role="group" aria-label="${tr('Couleur de peau')}">${HD_TONES.map((m) => `<button class="${m === tone ? 'on' : ''}" data-tone="${m}" title="${tr('Couleur de peau')}">✋${m}</button>`).join('')}</div></div>
    <div class="hd-emoji-scroll">${recent.length ? section('recent', recent) : ''}${hdEmojiPages[tone]}</div>
    <nav class="hd-emoji-tabs">${tabs.map(([k, icon]) => `<button data-tab="${k}" title="${esc(hdEmojiTitle(k))}" aria-label="${esc(hdEmojiTitle(k))}">${icon}</button>`).join('')}</nav>`;
}
// Les couleurs de l'écusson du groupe, posées dès qu'elles arrivent (sans écusson : celles du thème).
function hdPaintColors() {
  const box = document.querySelector('.site-huddle'), root = box?.querySelector('.hd');
  if (!root) return;
  const c = clubColors(root.dataset.hdclub);
  // Un écusson très sombre ou très clair : l'accent s'éclaircit ou se fonce d'autant, pour que le texte reste lisible.
  const v = c && parseInt(c.primary.slice(1), 16), lum = c && (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  [['--hd-c', c?.primary], ['--hd-c2', c?.secondary], ['--hd-c-ink', c && fbInk(c.primary)], ['--hd-lift', c && (lum < 0.35 ? '40%' : '74%')], ['--hd-drop', c && (lum > 0.6 ? '45%' : '82%')]].forEach(([k, x]) => { if (x) box.style.setProperty(k, x); else box.style.removeProperty(k); });
}
function bindHuddle(page, group) {
  hdPaintColors();
  hdEmojiWarm();
  const box = $('#hd-msgs');
  box.scrollTop = box.scrollHeight;
  const root = page.querySelector('.hd');
  page.querySelectorAll('[data-hdgroup]').forEach((b) => { b.onclick = () => { view.hdGroup = b.dataset.hdgroup; view.hdDrawer = false; render(); }; });
  page.querySelectorAll('[data-hdmenu]').forEach((b) => { b.onclick = () => { view.hdDrawer = !view.hdDrawer; root.classList.toggle('drawer', view.hdDrawer); }; });
  // La recherche filtre les noms sans redessiner la page.
  const search = $('#hd-search');
  const filter = () => {
    const q = plainText(view.hdQuery || '').trim();
    page.querySelectorAll('[data-hdmention]').forEach((r) => r.classList.toggle('hidden', Boolean(q) && !plainText(r.dataset.hdmention).includes(q)));
    $('#hd-none').classList.toggle('hidden', !q || Boolean(page.querySelector('.hd-row:not(.hidden)')));
  };
  search.oninput = () => { view.hdQuery = search.value; filter(); };
  search.onkeydown = (ev) => { if (ev.key === 'Escape' && search.value) { ev.stopPropagation(); search.value = ''; view.hdQuery = ''; filter(); } };
  filter();

  const send = async (text) => {
    view.hdPending = true;
    drafts.huddle[group.id] = '';
    if (text) group.messages.push({ who: 'me', text, gameDate: state.snapshot.gameDate });
    render();
    try {
      state = await live.sendHuddle(text, group.id);
    } catch (err) {
      state = await live.getState();
      toast(err.message, true);
    }
    view.hdPending = false;
    render();
    $('#hd-text')?.focus();
  };
  if ($('#hd-retry')) $('#hd-retry').onclick = () => send('');
  const ta = $('#hd-text'), btn = $('#hd-send');
  if (!ta) return;
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  const pop = $('#hd-pop');
  const hidePop = () => { pop.classList.add('hidden'); pop.dataset.kind = ''; };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; };
  // Ceux qu'il a mentionnés dans son brouillon s'allument dans les listes.
  const mark = () => page.querySelectorAll('[data-hdmention]').forEach((r) => r.classList.toggle('on', ta.value.includes(`@${r.dataset.hdmention}`)));
  const insert = (text) => {
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = `${ta.value.slice(0, a)}${text}${ta.value.slice(b)}`;
    ta.selectionStart = ta.selectionEnd = a + text.length;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };
  // « @ » propose les membres du groupe à mesure qu'on tape.
  const at = { items: [], index: 0, start: 0 };
  const paintAt = () => {
    pop.className = 'hd-pop';
    pop.dataset.kind = 'at';
    pop.innerHTML = at.items.map((n, i) => `<button class="hd-pop-item${i === at.index ? ' on' : ''}" data-i="${i}">${hdFace(n)}<span>${esc(n)}</span></button>`).join('');
    pop.querySelectorAll('[data-i]').forEach((b) => { b.onmousedown = (ev) => { ev.preventDefault(); pickAt(Number(b.dataset.i)); }; });
  };
  const pickAt = (i) => {
    const name = at.items[i];
    if (!name) return;
    const head = `${ta.value.slice(0, at.start)}@${name} `;
    ta.value = head + ta.value.slice(ta.selectionStart).replace(/^\S*/, '');
    ta.selectionStart = ta.selectionEnd = head.length;
    hidePop();
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };
  const updateAt = () => {
    if (pop.dataset.kind === 'emoji') return;
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(^|\s)@([^\s@]*)$/);
    if (!m) { if (pop.dataset.kind === 'at') hidePop(); return; }
    const q = plainText(m[2]);
    at.items = hdMembers(group).filter((n) => plainText(n).includes(q)).slice(0, 6);
    at.index = 0;
    at.start = before.length - m[2].length - 1;
    if (at.items.length) paintAt(); else hidePop();
  };
  grow();
  mark();
  ta.oninput = () => { drafts.huddle[group.id] = ta.value; grow(); mark(); btn.disabled = !ta.value.trim(); updateAt(); };
  ta.onkeyup = (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') updateAt(); };
  ta.onkeydown = (ev) => {
    if (pop.dataset.kind === 'at') {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        at.index = (at.index + (ev.key === 'ArrowDown' ? 1 : at.items.length - 1)) % at.items.length;
        paintAt();
        return;
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); pickAt(at.index); return; }
    }
    if (ev.key === 'Escape' && pop.dataset.kind) { ev.stopPropagation(); hidePop(); return; }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); if (ta.value.trim()) send(ta.value.trim()); }
  };
  btn.onclick = () => send(ta.value.trim());
  // Un clic sur un nom le mentionne.
  page.querySelectorAll('[data-hdmention]').forEach((r) => {
    r.onclick = () => {
      if (ta.disabled) return;
      const tag = `@${r.dataset.hdmention}`;
      if (view.hdDrawer) { view.hdDrawer = false; root.classList.remove('drawer'); }
      if (ta.value.includes(tag)) { ta.focus(); return; }
      insert(`${ta.value.slice(0, ta.selectionStart) && !/\s$/.test(ta.value.slice(0, ta.selectionStart)) ? ' ' : ''}${tag} `);
    };
  });
  $('#hd-at').onclick = () => {
    if (ta.disabled) return;
    if (pop.dataset.kind === 'emoji') hidePop();
    insert(`${ta.value.slice(0, ta.selectionStart) && !/\s$/.test(ta.value.slice(0, ta.selectionStart)) ? ' ' : ''}@`);
  };
  const openEmoji = (scrollTop = 0) => {
    pop.className = 'hd-pop hd-pop-emoji';
    pop.dataset.kind = 'emoji';
    pop.innerHTML = hdEmojiHtml();
    const scroller = pop.querySelector('.hd-emoji-scroll');
    const tabs = [...pop.querySelectorAll('[data-tab]')], secs = [...scroller.querySelectorAll('[data-cat]')];
    const lit = () => {
      const cur = secs.filter((s) => s.offsetTop <= scroller.scrollTop + 4).at(-1) || secs[0];
      tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === cur?.dataset.cat));
    };
    scroller.scrollTop = scrollTop;
    scroller.onscroll = lit;
    lit();
    // Le clic ne retire pas le curseur de la zone de saisie.
    pop.onmousedown = (ev) => ev.preventDefault();
    pop.onclick = (ev) => {
      ev.stopPropagation();
      const e = ev.target.closest('[data-e]'), tab = ev.target.closest('[data-tab]'), tone = ev.target.closest('[data-tone]');
      if (e) { insert(e.dataset.e); hdSave('recent', [e.dataset.e, ...hdLoad('recent', []).filter((x) => x !== e.dataset.e)].slice(0, 32)); }
      else if (tab) scroller.scrollTop = scroller.querySelector(`[data-cat="${tab.dataset.tab}"]`).offsetTop;
      else if (tone) { hdSave('tone', tone.dataset.tone); openEmoji(scroller.scrollTop); }
    };
  };
  $('#hd-emoji').onclick = () => { if (pop.dataset.kind === 'emoji') hidePop(); else openEmoji(); };
  // Un clic ailleurs referme ce qui est ouvert.
  root.onclick = (ev) => { if (pop.dataset.kind && !ev.target.closest('.hd-compose')) hidePop(); };
}
// « / » va à la recherche, sauf quand on écrit.
addEventListener('keydown', (ev) => {
  if (current !== 'huddle' || ev.key !== '/' || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const search = document.getElementById('hd-search');
  if (search && search.offsetParent !== null) { ev.preventDefault(); search.focus(); search.select(); }
});


const ROLE_LABEL = { coach: 'Staff', club: 'Club', journalist: 'Presse', agent: 'Agent', family: 'Famille', friend: 'Ami', sponsor: 'Sponsor', newsletter: 'Newsletter' };

const trend = (k) => ({ up: '<span class="up">↑</span>', down: '<span class="down">↓</span>', new: `<span class="new">${tr('nouveau')}</span>`, flat: '<span class="flat">=</span>' }[k] || '');
const STANCE_LABEL = { stay: 'Je veux prolonger', open: 'Ouvert à tout', leave: 'Je veux partir' };

// Dates du mercato lues dans le calendrier du jeu.
function windowDates(snap) {
  const wins = snap?.windows || [], d = snap?.gameDate || '';
  const day = (iso) => fmtDate(iso, { day: 'numeric', month: 'long' });
  const cur = wins.find((w) => d >= w.open && d <= w.close);
  if (cur) return esc(tr('jusqu’au {d}', { d: day(cur.close) }));
  const next = wins.find((w) => w.open > d);
  return next ? esc(tr('ouverture le {d}', { d: day(next.open) })) : '';
}

// Prénom de l'agent (personnage fictif propre à chaque carrière).
const agentFirst = () => state?.agent?.name?.split(' ')[0] || tr('ton agent');

// Résultat de la dernière demande de transfert.
const REQUEST_OUTCOME = { success: 'acceptée, tu as été transféré', failed: 'sans suite à la fermeture du mercato', elsewhere: 'dépassée, tu as signé ailleurs' };

// « Ton attitude » agit sur le jeu : avec « je veux partir », une vraie offre peut devenir celle d'un club proposé
// par l'agent, aux mêmes conditions. LifeLegend écrit alors dans la sauvegarde (jeu fermé, copie gardée).
function redirectBlock(a, v) {
  if (a.stance !== 'leave') return '';
  const offers = (v.offers || []).filter((o) => o.redirectable);
  const targets = v.redirectTargets || [];
  const last = a.redirects?.at(-1);
  const lastHtml = last ? `<p class="fineprint">${esc(tr('Dernière réorientation : {from} → {to}, le {d}.', { from: last.from || '?', to: last.to, d: fmtDate(last.on, { day: 'numeric', month: 'long', year: 'numeric' }) }))}</p>` : '';
  // Expérimental : seulement si le joueur l'a activé dans les réglages (LifeLegend modifie alors la sauvegarde).
  if (!settings?.offerRedirect || !offers.length || !targets.length) return lastHtml;
  const options = targets.map((c) => `<option value="${c.ref}">${esc(c.team)} · ${esc(tr(c.role))}${c.league ? ` · ${esc(c.league)}` : ''}</option>`).join('');
  return `<h4 class="ds-sub">${tr('Réorienter une offre')}</h4>
    <p class="fineprint">${esc(tr('Tu veux partir : {agent} fait jouer ses contacts. Une vraie offre reçue dans le jeu devient celle d’un club de ton choix, aux mêmes conditions (salaire, contrat, date limite). LifeLegend modifie ta sauvegarde : sauvegarde et quitte le jeu avant. Une copie est gardée.', { agent: agentFirst() }))}</p>
    ${offers.map((o) => `<div class="ds-redirect"><span><b>${esc(o.club)}</b><small>${esc(euros(o.salary))}</small></span>
      <select data-redirect-to="${o.id}" aria-label="${esc(tr('Club d’arrivée pour l’offre de {club}', { club: o.club }))}">${options}</select>
      <button class="btn" data-redirect="${o.id}" data-from="${esc(o.club)}">${tr('Réorienter')}</button></div>`).join('')}
    ${lastHtml}`;
}

// ---------- Dossier de carrière (Mails → Carrière) ----------
// Le bureau de l'agent : le contrat sur sa ligne de temps avec les mercatos, rester ou partir, et le marché en cartes de
// transfert aux couleurs des clubs. Contrat, offres et clubs qui suivent sont lus dans la sauvegarde, le reste est estimé.
const dsTime = (iso) => Date.parse(`${iso}T12:00:00Z`);
const dsDaysTo = (iso) => Math.round((dsTime(iso) - dsTime(state.snapshot.gameDate)) / 864e5);
const dsDay = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
// Les mercatos du calendrier du jeu (janvier, puis du 1er juillet au 31 août) qui touchent une période.
function dsWindows(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push({ name: tr('Mercato d’hiver'), open: `${y}-01-01`, close: `${y}-01-31` }, { name: tr('Mercato d’été'), open: `${y}-07-01`, close: `${y}-08-31` });
  return out.filter((w) => w.close >= from && w.open <= to);
}
// Le calendrier du contrat, de deux mois en deux mois, de l'arrivée au club à la fin du contrat : les matchs de son club (joués
// ou à venir), ceux qu'il a joués, ses buts et passes, les mercatos et la fin du contrat. Un seul axe : ce sont tous des nombres de matchs ou d'actions.
function dcChart(s, v) {
  const today = s.gameDate, club = s.club.name;
  const start = s.player.history?.joinedClub || s.player.careerStart || today;
  const end = v.contractUntil && v.contractUntil > today ? v.contractUntil : today;
  const key = (iso) => Number(iso.slice(0, 4)) * 6 + Math.floor((Number(iso.slice(5, 7)) - 1) / 2);
  let first = key(start < today ? start : today), last = key(end);
  // Un long contrat : les quatre dernières périodes et ce qui vient, douze au plus.
  if (last - first > 11) { first = Math.max(first, key(today) - 3); last = Math.min(last, first + 11); }
  const cols = new Map();
  for (let k = first; k <= last; k++) cols.set(k, { club: 0, played: 0, goals: 0, assists: 0, left: 0 });
  const seen = new Set();
  for (const f of s.fixtures || []) {
    if (f.home !== club && f.away !== club) continue;
    seen.add(f.date);
    const c = cols.get(key(f.date));
    if (!c) continue;
    c.club++;
    if (!f.played) c.left++;
    else if (f.me) { c.played++; c.goals += f.me.goals || 0; c.assists += f.me.assists || 0; }
  }
  // Ses saisons précédentes dans ce contrat : les matchs qu'il a joués, gardés par LifeLegend.
  for (const se of Object.values(state.seasons || {})) {
    for (const g of se.log || []) {
      if (seen.has(g.date) || g.date < start) continue;
      const c = cols.get(key(g.date));
      if (!c) continue;
      c.club++; c.played++; c.goals += g.goals || 0; c.assists += g.assists || 0;
    }
  }
  const windows = dsWindows(start < today ? start : today, end);
  const max = Math.max(1, ...[...cols.values()].flatMap((c) => [c.club, c.goals + c.assists]));
  const top = max % 2 ? max + 1 : max;
  const h = (n) => ((n / top) * 100).toFixed(1);
  const month = (m) => new Date(2000, m, 15).toLocaleDateString(locale(), { month: 'short' }).replace(/\.$/, '');
  const now = key(today);
  const body = [...cols].map(([k, c]) => {
    const y = Math.floor(k / 6), n = k % 6, m0 = n * 2;
    const label = `${month(m0)}–${month(m0 + 1)}`;
    const lo = `${y}-${String(m0 + 1).padStart(2, '0')}-01`, hi2 = `${y}-${String(m0 + 2).padStart(2, '0')}-31`;
    const win = windows.find((w) => w.close >= lo && w.open <= hi2);
    const gp = c.goals + c.assists;
    const missed = c.club - c.played - c.left;
    const lines = [c.played ? trn(c.played, '{n} match joué', '{n} matchs joués') : '', missed > 0 ? trn(missed, '{n} sans toi', '{n} sans toi') : '', c.left ? (c.played || missed > 0 ? tr('{n} à venir', { n: c.left }) : trn(c.left, '{n} match à venir', '{n} matchs à venir')) : ''].filter(Boolean).join(' · ') || tr('Aucun match');
    const more = [c.goals ? trn(c.goals, '{n} but', '{n} buts', { n: c.goals }) : '', c.assists ? trn(c.assists, '{n} passe déc.', '{n} passes déc.', { n: c.assists }) : '', win ? win.name : '', k === key(end) ? tr('Fin de contrat') : ''].filter(Boolean).join(' · ');
    const tip = `${lines}${more ? ` · ${more}` : ''}`;
    return `<div class="dc-col${k === now ? ' now' : ''}${k === key(end) ? ' end' : ''}" title="${esc(`${label} ${y} : ${tip}`)}"><div class="dc-tip"><b>${esc(lines)}</b>${more ? `<small>${esc(more)}</small>` : ''}</div>
      <div class="dc-bars"><span class="dc-b"><i class="p" data-h="${h(c.club)}"></i><i class="s" data-h="${h(c.played)}"></i></span><span class="dc-b"><i class="c" data-h="${h(gp)}"></i></span></div>
      <em>${esc(label)}</em><u class="${win ? '' : 'none'}"></u></div>`;
  }).join('');
  return `<div class="dc-chart-box"><div class="dc-chart-head"><h3>${tr('Calendrier du contrat')}</h3>
      <div class="dc-key"><span><i class="a"></i>${tr('Matchs joués')}</span><span><i class="p"></i>${tr('Matchs du club')}</span><span><i class="b"></i>${tr('Buts + passes')}</span></div></div>
    <div class="dc-chart"><div class="dc-axis"><span data-b="100">${top}</span><span data-b="50">${top / 2}</span><span data-b="0">0</span></div><div class="dc-plot">${body}</div></div></div>`;
}
const dsRoute = (from, to) => `<span class="ds-route">${crestHtml(from, ' ds-crest')}<i class="ds-arrow"></i>${crestHtml(to, ' ds-crest')}</span>`;

// Le bloc « Équipementier » du dossier : le contrat en cours, ou l'offre qui attend.
// Objectifs personnels fixés par l'entraîneur (src/world/objectives.js) : où il en est, lu dans sa sauvegarde à chaque
// synchro ; puis les derniers bilans. Les barres se posent après le rendu (la politique de la page bloque style="").
const OBJ_TITLE = { season: 'Saison', second_half: 'Fin de saison', comeback: 'Retour de blessure' };
const OBJ_VERDICT = { all: 'Tout rempli', most: 'En bonne partie rempli', some: 'En partie rempli', none: 'Pas rempli' };
const objValue = (kind, v) => (v == null ? '–' : kind === 'rating' ? Number(v).toLocaleString(locale(), { maximumFractionDigits: 2 }) : String(v));
function dsGoals() {
  const o = state.objectives;
  const sets = [o?.season, o?.comeback].filter(Boolean);
  const card = (set) => `<article class="ds-goal"><header><b>${tr(OBJ_TITLE[set.kind])}</b><small>${esc(tr('fixés le {d}', { d: fmtDate(set.set, { day: 'numeric', month: 'long', year: 'numeric' }) }))}</small></header>
    ${set.items.map((it, k) => {
      const now = set.last?.[k] || {};
      const pct = it.kind === 'rating' ? (now.value == null ? 0 : Math.min(100, Math.round((now.value / it.target) * 100))) : Math.min(100, Math.round(((now.value || 0) / it.target) * 100));
      return `<div class="ds-goal-row${now.met ? ' met' : ''}"><span class="ds-goal-text">${esc(it.label || '')}</span><span class="ds-goal-num">${now.met ? '✓ ' : ''}${esc(objValue(it.kind, now.value))} / ${esc(objValue(it.kind, it.target))}</span><span class="ds-goal-bar"><i data-gpct="${pct}"></i></span></div>`;
    }).join('')}</article>`;
  const past = (o?.history || []).filter((h) => h.status === 'reviewed').slice(-3).reverse();
  return `${sets.length ? `<div class="ds-goals">${sets.map(card).join('')}</div>` : `<p class="ds-none">${tr('Ton entraîneur fixe tes objectifs en début de saison et à ton retour de blessure.')}</p>`}
    ${past.length ? `<h4 class="ds-sub">${tr('Derniers bilans')}</h4><ul class="ds-rel-list">${past.map((h) => `<li><time>${esc(fmtDate(h.closed, { day: 'numeric', month: 'short', year: 'numeric' }))}</time><span>${esc(tr(OBJ_TITLE[h.kind]))}</span><b>${esc(tr(OBJ_VERDICT[h.verdict]))}</b></li>`).join('')}</ul>` : ''}
    <p class="fineprint">${tr('Fixés par ton entraîneur d’après tes stats, ton poste et le calendrier. Suivis dans ta sauvegarde à chaque synchro.')}</p>`;
}

// Relation avec le club (src/world/conduct.js) : l'entraîneur, les coéquipiers, le club, la sanction en cours et les
// derniers écarts relevés. Les états viennent du moteur (relation_with de FACTS.discipline, recalculés ici).
const REL_LABEL = { good: 'Bonne', tense: 'Tendue', broken: 'Rompue' };
const REL_SOURCE = { press: 'en conférence de presse', kop: 'sur Kop', huddle: 'dans le Vestiaire' };
function dsRelationState() {
  const c = state.conduct;
  const out = { coach: 'good', teammates: 'good', club: 'good' };
  if (!c) return out;
  const today = state.snapshot.gameDate;
  const days = (d) => (Date.parse(today) - Date.parse(d)) / 864e5;
  for (const t of Object.keys(out)) {
    const w = (c.incidents || []).filter((x) => x.target === t && days(x.date) <= 60).reduce((n, x) => n + [0, 1, 3, 5][x.level], 0);
    out[t] = w >= 5 ? 'broken' : w >= 1 ? 'tense' : 'good';
  }
  if (c.stage >= 2 && out.club === 'good') out.club = 'tense';
  return out;
}
function dsRelation() {
  const c = state.conduct;
  const rel = dsRelationState();
  const s = state.snapshot;
  const row = (key, label, who) => `<div class="ds-rel-row"><span><b>${tr(label)}</b>${who ? `<small>${esc(who)}</small>` : ''}</span><span class="ds-rel-pill ${rel[key]}">${tr(REL_LABEL[rel[key]])}</span></div>`;
  const p = c?.pending;
  const now = p ? `<p class="ds-alert">${esc(tr('Écarté du groupe : {matches}.', { matches: p.matches.map(cdMatch).join(' · ') }))}${p.applied ? '' : ` ${esc(tr('À appliquer dans le jeu depuis le mail du club.'))}`}</p>`
    : c?.stage ? `<p class="ds-rel-stage">${esc(c.stage === 1 ? tr('Ton entraîneur t’a déjà rappelé à l’ordre : le prochain écart aura des conséquences.') : tr('Tu as déjà été écarté du groupe : au prochain écart, ce sera pour deux matchs.'))}</p>` : '';
  const recent = (c?.incidents || []).slice(-3).reverse();
  return `<div class="ds-rel">${row('coach', 'Ton entraîneur', s.club.coach || s.coaches?.mine)}${row('teammates', 'Tes coéquipiers', '')}${row('club', 'Le club', s.club.name)}</div>
    ${now}
    ${recent.length ? `<h4 class="ds-sub">${tr('Derniers écarts relevés')}</h4><ul class="ds-rel-list">${recent.map((x) => `<li><time>${esc(fmtDate(x.date, { day: 'numeric', month: 'short' }))}</time><span>${esc(tr(REL_SOURCE[x.source] || ''))}</span><q>${esc(x.quote)}</q></li>`).join('')}</ul>` : ''}
    <p class="fineprint">${tr('Ce que tu dis de ton entraîneur, de tes coéquipiers et de ton club en conférence de presse, sur Kop et dans le Vestiaire compte : un rappel à l’ordre, puis une ambiance de plus en plus tendue. Le temps et un bon comportement apaisent les choses.')}</p>`;
}

function dsSponsor() {
  const sp = state.sponsor, o = sp?.deal || sp?.offer;
  const head = `<div class="ib-sec"><i class="${o ? 'open' : ''}"></i><span class="ib-eyebrow">${tr('Équipementier')}</span></div>`;
  if (!o) {
    const last = (sp?.history || []).filter((h) => h.status === 'ended').at(-1);
    return `${head}<p class="sp-none">${tr('Pas encore de contrat : les marques écriront quand tes matchs et ta notoriété attireront leur attention.')}${last ? ` ${esc(tr('Dernier contrat : {brand}, jusqu’au {d}.', { brand: last.brand, d: spLongDate(last.until) }))}` : ''}</p>`;
  }
  const deal = Boolean(sp.deal);
  const earned = deal ? (sp.deal.contributions || 0) * sp.deal.bonus : 0;
  return `${head}<article class="sp-offer sp-offer--ds">${spVisual(o)}<div class="sp-main"><span class="sp-eyebrow">${deal ? esc(tr('Contrat signé le {d}', { d: spLongDate(sp.deal.since) })) : tr('Une offre t’attend dans Mails.')}</span>${spTerms(o)}
    ${deal ? `<p class="sp-earned"><small>${tr('Primes gagnées')}</small><b>${esc(spMoney(earned))}</b><span>${esc(trn(sp.deal.contributions || 0, '{n} but ou passe D.', '{n} buts ou passes D.'))}</span></p>` : ''}
    <button class="sm-btn sm-btn-ghost" data-dsthread="${esc(o.threadId)}">${tr('Voir le mail')}</button>${SP_FICTION()}</div></article>`;
}

function dossierPage() {
  const a = state.agent, v = a.view, s = state.snapshot;
  const club = v.club, months = v.monthsLeft, today = s.gameDate;
  const offers = v.offers || [];
  const extensionOffer = offers.find((o) => o.kind === 'extension');
  const signedNow = a.signed && a.signed.until === v.contractUntil;
  const tag = months === null ? null : months <= 6 ? ['hot', tr('Fin de contrat proche')] : months <= 12 ? ['warm', tr('Dernière année')] : months > 36 ? ['', tr('Contrat long')] : ['', tr('Sous contrat')];
  // Le mercato en cours, ou le prochain.
  const win = dsWindows(today, `${Number(today.slice(0, 4)) + 1}-12-31`)[0];
  const winOpen = win.open <= today, winDays = dsDaysTo(winOpen ? win.close : win.open);

  // Le haut de la fiche : le portrait, le poste, le nom, les montants.
  const prof = s.player.profile || {};
  const posIndex = POS_CODES.indexOf(prof.position);
  const role = [posIndex >= 0 ? tr(INF_POS[posIndex]) : '', prof.age ? trn(prof.age, '{n} an', '{n} ans') : ''].filter(Boolean).join(' · ');
  const agentThread = [...state.mail].reverse().find((t) => t.role === 'agent');
  const head = `<header class="dc-head"><span class="dc-portrait">${myFaceIn(fbInitials(s.player.name))}</span>
    <div class="dc-who">${role ? `<p>${esc(role)}</p>` : ''}<h1>${esc(s.player.name)}</h1>
      <div class="dc-money">${v.salary ? `<span class="m1">${hi('euro')}<b>${esc(euros(v.salary))}</b><small>${tr('Salaire')}</small></span>` : ''}${v.marketValue ? `<span class="m2">${hi('euro')}<b>${esc(millions(v.marketValue))}</b><small>${tr('Valeur marchande')}</small></span>` : ''}
        <span class="m3">${hi('clock')}${months !== null ? `<b>${months}</b><small>${trn(months, 'mois restant', 'mois restants')}</small>` : '<b>—</b>'}${tag ? `<em class="dc-tag ${tag[0]}">${tag[1]}</em>` : ''}</span></div></div>
    <div class="dc-acts"><button class="dc-btn" data-dcinf>${tr('Influence')}</button>${agentThread ? `<button class="dc-btn dark" data-dsthread="${esc(agentThread.id)}">${esc(tr('Parler à {name}', { name: agentFirst() }))}</button>` : ''}</div></header>`;
  // Les informations principales, en champs.
  const field = (label, body, cls = '') => `<div class="dc-field${cls ? ` ${cls}` : ''}"><small>${label}</small>${body}</div>`;
  const joined = s.player.history?.joinedClub;
  const info = `<p class="dc-label">${tr('Informations principales')}</p><div class="dc-fields">
      ${field(tr('Club actuel'), `<div>${crestHtml(club)}<span>${esc(club)}</span></div>`, 'wide')}
      ${field(tr('Prochain club'), a.plannedMove ? `<div>${crestHtml(a.plannedMove.club)}<span>${esc(a.plannedMove.club)}</span></div>` : `<div class="mut"><span>${tr('Aucun transfert prévu')}</span></div>`, 'wide')}
      ${field(tr('Arrivée au club'), `<div><span>${joined ? esc(dsDay(joined)) : '—'}</span>${hi('calendar')}</div>`)}
      ${field(tr('Fin de contrat'), `<div><span>${v.contractUntil ? esc(dsDay(v.contractUntil)) : '—'}</span>${hi('calendar')}</div>`)}
      ${field(winOpen ? tr('Mercato ouvert') : tr('Mercato fermé'), `<div><i class="dc-dot${winOpen ? ' open' : ''}"></i><span>${winDays > 0 ? trn(winDays, '{n} jour', '{n} jours') : tr('Dernier jour')}</span></div>${winDays > 0 ? `<em>${esc(winOpen ? tr('avant la fermeture, le {d}', { d: fmtDate(win.close, { day: 'numeric', month: 'long' }) }) : tr('avant l’ouverture, le {d}', { d: fmtDate(win.open, { day: 'numeric', month: 'long' }) }))}</em>` : ''}`)}
    </div>`;

  const deal = a.plannedMove ? `<section class="ds-offer ds-deal" data-dsclub="${esc(a.plannedMove.club)}">
    <div class="ds-offer-band">${dsRoute(club, a.plannedMove.club)}<div><span class="ds-tag">${tr('Transfert conclu')}</span><h3>${esc(a.plannedMove.club)}</h3></div></div>
    <div class="ds-terms">
      <div><small>${tr('Salaire')}</small><b>${esc(euros(a.plannedMove.salary))}</b></div>
      <div><small>${tr('Contrat jusqu’au')}</small><b>${esc(dsDay(a.plannedMove.contractUntil))}</b></div>
      <div><small>${tr('Arrivée')}</small><b>${a.plannedMove.immediate ? tr('transfert en cours, pendant ce mercato') : a.plannedMove.effective ? esc(tr('tu les rejoindras le {d}, à l’ouverture du mercato', { d: fmtDate(a.plannedMove.effective, { day: 'numeric', month: 'long', year: 'numeric' }) })) : tr('au prochain mercato')}</b></div>
    </div></section>` : '';

  const alerts = [
    v.injuredDays > 0 ? trn(v.injuredDays, 'Tu es blessé (environ {n} jour) : les clubs attendent de te revoir sur le terrain.', 'Tu es blessé (environ {n} jours) : les clubs attendent de te revoir sur le terrain.') : '',
    v.lockedUntilNextWindow ? tr('{why} : le jeu ne t’enverra pas d’offres avant le prochain mercato ({month}).', { why: tr({ debut: 'Premier mercato de ta carrière', moved: 'Tu viens d’arriver dans ton nouveau club', signed: 'Tu viens de signer' }[v.lockReason] || 'Tu viens de signer'), month: fmtDate(`2000-${new Date(today).getMonth() === 0 ? '07' : '01'}-15`, { month: 'long' }) }) : '',
  ].filter(Boolean).map((x) => `<p class="ds-alert">${esc(x)}</p>`).join('');

  // Rester ou partir : ce que le club pourrait proposer, et ce que l'attitude y change.
  const by = v.extensionByStance;
  const ext = extensionOffer ? `<div class="ds-ext-state"><b>${tr('Offre reçue')}</b><span>${esc(euros(extensionOffer.salary))}</span></div>`
    : signedNow ? `<div class="ds-ext-state"><b>${tr('Signée')} ✓</b><span>${tr('nouveau contrat')}</span></div>`
      : v.extension === null ? `<div class="ds-ext-state"><b>${tr('Pas à l’ordre du jour')}</b><span>${tr('contrat encore long')}</span></div>`
        : `<span class="ds-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"/><circle class="v" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${v.extension} 100" transform="rotate(-90 18 18)"/></svg><strong>${pct(v.extension)}</strong></span>
          <div class="ds-ext-why"><p>${tr('d’ici la fin de saison')}</p>
            ${v.extensionTrend === 'up' || v.extensionTrend === 'down' ? `<small>${trend(v.extensionTrend)} ${esc(tr('depuis le dernier point de {agent}', { agent: agentFirst() }))}</small>` : ''}
            <small>${esc(tr('Forme : {n}/100', { n: v.form }))}</small>
            ${months !== null ? `<small>${trn(months, '{n} mois restant', '{n} mois restants')}</small>` : ''}</div>`;
  const stanceLine = { stay: tr('Le club a plus de chances de te proposer un nouveau contrat.'), open: tr('{agent} garde toutes les portes ouvertes.', { agent: agentFirst() }), leave: tr('{agent} prépare ta sortie : tu peux demander ton transfert plus bas.', { agent: agentFirst() }) };
  const fate = `<section class="ds-fate">
    <div class="ds-ext"><span class="ib-eyebrow">${tr('Proposition de prolongation')}</span><div class="ds-ext-row">${ext}</div>${extensionOffer || signedNow || v.extension === null ? '' : `<small class="ds-est">${esc(tr('Estimation de {agent}', { agent: agentFirst() }))}</small>`}</div>
    <div class="ds-stances-box"><span class="ib-eyebrow">${tr('Ton attitude')}</span><div class="ds-stances">
      ${Object.entries(STANCE_LABEL).map(([k, l]) => `<button class="ds-stance${a.stance === k ? ' on' : ''}" data-stance="${k}" aria-pressed="${a.stance === k}"><b>${tr(l)}</b>${by && by[k] !== null ? `<span><strong>${pct(by[k])}</strong><small>${tr('de chances de prolongation')}</small></span>` : ''}<small>${esc(stanceLine[k])}</small></button>`).join('')}
    </div></div>
  </section>`;

  // Les offres, lues dans le jeu.
  const offerCard = (o) => {
    const delta = v.salary && o.salary ? Math.round(((o.salary - v.salary) / v.salary) * 100) : 0;
    const days = o.deadline ? dsDaysTo(o.deadline) : null;
    return `<article class="ds-offer" data-dsclub="${esc(o.club)}">
      <div class="ds-offer-band">${o.kind === 'extension' ? crestHtml(o.club, ' ds-crest') : dsRoute(club, o.club)}<div><span class="ds-tag">${o.kind === 'extension' ? tr('Prolongation') : tr('Offre de transfert')}</span><h3>${esc(o.club)}</h3></div></div>
      <div class="ds-terms">
        <div><small>${tr('Salaire')}</small><b>${esc(euros(o.salary))}</b>${delta ? `<small><span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${pct(delta)}</span> ${tr('par rapport à ton salaire')}</small>` : ''}</div>
        <div><small>${tr('Contrat jusqu’au')}</small><b>${o.contractUntil ? esc(dsDay(o.contractUntil)) : '—'}</b></div>
        <div><small>${tr('Réponse avant le')}</small><b>${o.deadline ? esc(dsDay(o.deadline)) : '—'}</b>${days !== null && days >= 0 ? `<small>${days > 0 ? trn(days, '{n} jour', '{n} jours') : tr('Dernier jour')}</small>` : ''}</div>
      </div></article>`;
  };
  const offersHtml = offers.length ? `<h4 class="ds-sub">${tr('Offres reçues dans le jeu')}</h4>
    <div class="ds-offers">${offers.map(offerCard).join('')}</div>
    <p class="fineprint">${tr('Pour l’accepter, passe par le jeu ({menu}) ; sans réponse de ta part, elle ne se fait pas. LifeLegend verra la signature à la prochaine sauvegarde.', { menu: quote(tr('Évolution des négociations')) })}</p>` : '';

  // Les clubs qui le suivent vraiment (liste cachée du jeu).
  const followCard = (c) => `<article class="ds-follow" data-dsclub="${esc(c.team)}">${crestHtml(c.team, ' ds-crest')}
    <div><b>${esc(c.team)}</b>${c.league ? `<span>${esc(c.league)}</span>` : ''}${c.since ? `<small>${esc(tr('depuis le {d}', { d: dsDay(c.since) }))}</small>` : ''}${c.valuation ? `<small>${esc(tr('Te valorise à {v}', { v: millions(c.valuation) }))}</small>` : ''}
      ${c.offerMade || c.trend === 'new' ? `<p class="ds-follow-end">${c.offerMade ? `<span class="pill">${tr('offre faite')}</span>` : ''}${c.trend === 'new' ? trend('new') : ''}</p>` : ''}</div></article>`;
  const followHtml = `<h4 class="ds-sub">${v.lockedUntilNextWindow ? tr('Clubs qui suivent ton dossier (pour le prochain mercato)') : tr('Clubs qui suivent ton dossier')}</h4>
    ${v.clubs.length ? `<div class="ds-follows">${v.clubs.map(followCard).join('')}</div>` : `<p class="ds-none">${tr('Aucun club ne suit ton dossier pour l’instant.')}</p>`}
    <p class="fineprint">${tr('Liste tirée de ta sauvegarde : ce sont les clubs que le jeu fait vraiment s’intéresser à toi. Une offre peut suivre.')}</p>`;

  // Où demander son transfert : les clubs estimés par l'agent, la demande en cours, le résultat de la dernière.
  const askCard = (c) => {
    const asked = a.request?.club === c.team;
    return `<article class="ds-tc${asked ? ' asked' : ''}" data-dsclub="${esc(c.team)}">
      <div class="ds-tc-band">${dsRoute(club, c.team)}${c.chance != null ? ibRing(c.chance) : ''}</div>
      <div class="ds-tc-body"><b>${esc(c.team)}</b>${c.league ? `<span>${esc(c.league)}</span>` : ''}${c.role ? `<em>${esc(tr(c.role))}</em>` : ''}</div>
      ${asked ? `<div class="ds-tc-foot"><div><b>${tr('Demande en cours')}</b><small>${esc(tr('demande faite le {d}', { d: fmtDate(a.request.on, { day: 'numeric', month: 'long', year: 'numeric' }) }))} · ${tr('en attente de la réponse du club')}</small></div><button class="btn" data-request="">${tr('Annuler')}</button></div>`
    : a.stance === 'leave' && !a.request ? `<div class="ds-tc-foot"><button class="btn primary" data-request="${esc(c.team)}">${tr('J’ai fait la demande')}</button></div>` : ''}
    </article>`;
  };
  const targets = v.targets || [];
  const askable = a.request && !targets.some((c) => c.team === a.request.club) ? [{ team: a.request.club, league: a.request.league }, ...targets] : targets;
  const how = `<p class="fineprint">${tr('Dans le jeu : {path}. Un seul club à la fois, pendant un mercato (sinon la demande part à l’ouverture du suivant). Le club accepte si ton poste colle à sa tactique (vérifie son plan de jeu) et si tu vaux au moins un remplaçant chez lui.', { path: `<b>${tr('Négociations → Demande de transfert')}</b>` })}</p>`;
  const lastAsk = a.lastRequest ? `<p class="fineprint">${esc(tr('Dernière demande : {club}, {outcome}.', { club: a.lastRequest.club, outcome: REQUEST_OUTCOME[a.lastRequest.outcome] ? tr(REQUEST_OUTCOME[a.lastRequest.outcome]) : '' }))}</p>` : '';
  const askHtml = `<h4 class="ds-sub">${tr('Où demander ton transfert')}</h4>
    ${askable.length ? `<div class="ds-tcs">${askable.map(askCard).join('')}</div>` : `<p class="ds-none">${tr('Aucun club à ta mesure pour l’instant : continue d’enchaîner les bons matchs.')}</p>`}
    ${targets.length ? `<p class="fineprint">${esc(tr('Chances que le club accepte, estimées par {agent} d’après ton niveau et celui du club.', { agent: agentFirst() }))}${a.stance !== 'leave' && !a.request ? ` ${tr('Passe sur {attitude} pour faire ta demande.', { attitude: quote(tr(STANCE_LABEL.leave)) })}` : ''}</p>` : ''}
    ${a.stance === 'leave' || a.request ? how : ''}${lastAsk}`;

  // Le dernier mot de l'agent, et le parcours.
  const thread = [...state.mail].reverse().find((t) => t.role === 'agent');
  const said = thread?.messages.filter((m) => m.who !== 'me').at(-1);
  const note = `<section class="ds-note">
    <span class="ib-eyebrow">${esc(tr('Le dernier mot de {agent}', { agent: agentFirst() }))}</span>
    <header>${smAvatar(a.name, 'agent')}<div><b>${esc(a.name)}</b><span>${esc(a.agency || tr('Agent'))}</span></div>${said ? `<time>${esc(dsDay(said.gameDate))}</time>` : ''}</header>
    ${said ? `<blockquote>${esc(said.body)}</blockquote><button class="btn" data-dsthread="${esc(thread.id)}">${tr('Lire et répondre')}</button>` : `<p class="ds-none">${esc(tr('Le premier point de {agent} arrive avec une prochaine édition.', { agent: agentFirst() }))}</p>`}
    <p class="fineprint">${tr('Agent · offres et clubs lus dans ta sauvegarde, le reste est estimé')}</p>
  </section>`;
  const seasons = Object.values(state.seasons || {}).sort((x, y) => String(y.season).localeCompare(String(x.season))).slice(0, 4);
  const h = s.player.history;
  const debut = (kind, label) => { const d = h?.debuts?.find((x) => x.kind === kind); return d ? `<p class="ds-debut"><b>${tr(label)}</b> ${esc(monthYear(d.date))} · ${esc(d.team)} – ${esc(d.opponent)}${d.competition ? ` (${esc(d.competition)})` : ''}</p>` : ''; };
  const logged = seasons.find((x) => x.log?.length);
  const games = (logged?.log || []).slice(-5).map((g) => {
    const opponent = g.home === logged.club ? g.away : g.home;
    return `<span class="ds-game" title="${esc(`${opponent} · ${fmtDate(g.date, { day: 'numeric', month: 'short', year: 'numeric' })}`)}">${crestHtml(opponent, ' ds-crest')}${ratingChip(g.rating)}<small>${g.goals ? `${g.goals} ${tr('B')}` : ''}</small></span>`;
  }).join('');
  const path = `<section class="ds-path">
    <span class="ib-eyebrow">${tr('Ton parcours')}</span>
    ${seasons.map((x) => `<div class="ds-season">${crestHtml(x.club, ' ds-crest')}<div><b>${esc(x.club)}</b><span>${esc(x.season)}${x.position ? ` · ${ordinal(x.position)}` : ''}${x.league ? ` · ${esc(x.league)}` : ''}${!x.complete && x.club === club ? ` <span class="pill">${tr('EN COURS')}</span>` : ''}</span></div>
      <dl>${[['MJ', x.stats.apps], ['B', x.stats.goals], ['PD', x.stats.assists]].map(([k, n]) => `<div><dt>${tr(k)}</dt><dd>${n}</dd></div>`).join('')}<div><dt>${tr('Note')}</dt><dd>${ratingChip(x.stats.avgRating)}</dd></div></dl></div>`).join('')}
    ${games ? `<div class="ds-form"><small>${tr('Tes derniers matchs')}</small><div>${games}</div></div>` : ''}
    ${debut('club', 'Débuts en club')}${debut('national_team', 'Débuts en sélection')}
  </section>`;

  // La colonne sombre : tout ce que contient le dossier. Un clic y conduit, dans la fiche.
  const dcRow = ({ key, media, name, sub, end, go, dsclub, dim }) => `<button type="button" class="dc-row${(view.dcRow || 'me') === key ? ' on' : ''}${dim ? ' dim' : ''}" data-dcrow="${esc(key)}" data-dcgo="${go}"${dsclub ? ` data-dcclub="${esc(dsclub)}"` : ''} data-q="${esc(plainText(name))}"><span class="dc-ava">${media}</span><span class="dc-row-t"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${end ? `<em>${esc(end)}</em>` : ''}</button>`;
  const dcGroup = (title, rows) => (rows.length ? `<div class="dc-group"><h4>${esc(title)}</h4>${rows.join('')}</div>` : '');
  const clubRow = (prefix, c, extra = {}) => dcRow({ key: `${prefix}:${c.team || c.club}`, media: crestHtml(c.team || c.club), name: c.team || c.club, sub: c.league || '', go: 'dc-transfer', dsclub: c.team || c.club, ...extra });
  const spOne = state.sponsor?.deal || state.sponsor?.offer;
  const spMedia = spOne && bootFile(spOne.photo) ? `<img class="dc-boot" src="${esc(bootFile(spOne.photo))}" alt="">` : esc(String(spOne?.brand || '?')[0]);
  const side = `<aside class="dc-side"><p class="dc-eyebrow">${tr('Ta carrière')}</p><div class="dc-club">${crestHtml(club)}<b>${esc(club)}</b></div>
      <label class="dc-search">${hi('search')}<input type="search" id="dc-q" placeholder="${tr('Chercher')}" aria-label="${tr('Chercher')}" autocomplete="off"></label>
      ${dcGroup(tr('Ton contrat'), [dcRow({ key: 'me', media: myFaceIn(fbInitials(s.player.name)), name: s.player.name, sub: months !== null ? trn(months, '{n} mois restant', '{n} mois restants') : '', go: 'dc-over' }), dcRow({ key: 'ext', media: hi('contract'), name: tr('Prolongation'), end: v.extension !== null && v.extension !== undefined ? pct(v.extension) : '', go: 'dc-contract' })])}
      ${dcGroup(tr('Offres reçues'), [...(a.plannedMove ? [clubRow('deal', { club: a.plannedMove.club }, { sub: tr('Transfert conclu') })] : []), ...offers.map((o) => clubRow('offer', o, { sub: o.kind === 'extension' ? tr('Prolongation') : tr('Offre de transfert') }))])}
      ${dcGroup(tr('Clubs qui suivent ton dossier'), v.clubs.map((c) => clubRow('follow', c)))}
      ${dcGroup(tr('Où demander ton transfert'), askable.map((c) => clubRow('ask', c, { end: c.chance != null ? pct(c.chance) : '' })))}
      ${dcGroup(tr('Équipementier'), [spOne ? dcRow({ key: 'sp', media: spMedia, name: spOne.brand, sub: state.sponsor?.deal ? tr('Contrat signé') : tr('Offre en attente'), go: 'dc-sponsor' }) : dcRow({ key: 'sp', media: '–', name: tr('Pas encore de contrat'), go: 'dc-sponsor', dim: true })])}
      ${dcGroup(tr('Objectifs'), [dcRow({ key: 'goals', media: hi('flag'), name: tr('Tes objectifs'), sub: [state.objectives?.season, state.objectives?.comeback].filter(Boolean).length ? tr(OBJ_TITLE[(state.objectives.comeback || state.objectives.season).kind]) : tr('Aucun pour l’instant'), go: 'dc-goals' })])}
      ${dcGroup(tr('Relation avec le club'), [dcRow({ key: 'rel', media: hi('user'), name: tr('Ton entraîneur et tes coéquipiers'), sub: tr(REL_LABEL[dsRelationState().coach]), go: 'dc-relation' })])}
      ${dcGroup(tr('Agent'), [dcRow({ key: 'agent', media: fbInitials(a.name), name: a.name, sub: a.agency || '', go: 'dc-agent' })])}
      ${dcGroup(tr('Ton parcours'), seasons.map((x) => dcRow({ key: `season:${x.season}`, media: crestHtml(x.club), name: x.club, sub: x.season, go: 'dc-path' })))}
      <p class="dc-none" id="dc-none">${tr('Rien ne correspond.')}</p>
      <div class="dc-side-foot"><button class="dc-back" data-smback>${hi('back')}Mails</button></div></aside>`;
  const tabs = [['dc-over', tr('Aperçu')], ['dc-contract', tr('Contrat')], ['dc-transfer', tr('Transfert')], ['dc-sponsor', tr('Équipementier')], ['dc-goals', tr('Objectifs')], ['dc-relation', tr('Relation')], ['dc-agent', tr('Agent')], ['dc-path', tr('Parcours')]];
  return `<div class="ds dc${view.dsRingFrom !== undefined ? ' ds-just' : ''}">${side}
    <div class="dc-main">${head}
      <nav class="dc-tabs" aria-label="${tr('Sommaire')}">${tabs.map(([id, l], k) => `<button type="button" class="${k ? '' : 'on'}" data-dctab="${id}">${esc(l)}</button>`).join('')}</nav>
      <div class="dc-body">
        <section class="dc-sec" id="dc-over">${info}${alerts}${dcChart(s, v)}</section>
        <section class="dc-sec" id="dc-contract"><p class="dc-label">${tr('Ton contrat')}</p>${fate}</section>
        <section class="dc-sec" id="dc-transfer"><div class="ib-sec"><i class="${winOpen ? 'open' : ''}"></i><span class="ib-eyebrow">${tr('Le marché')}</span></div>${deal}${offersHtml}${redirectBlock(a, v)}${followHtml}${askHtml}</section>
        <section class="dc-sec" id="dc-sponsor">${dsSponsor()}</section>
        <section class="dc-sec" id="dc-goals"><p class="dc-label">${tr('Tes objectifs')}</p>${dsGoals()}</section>
        <section class="dc-sec" id="dc-relation"><p class="dc-label">${tr('Relation avec le club')}</p>${dsRelation()}</section>
        <div class="ds-foot"><div id="dc-agent" class="dc-anchor">${note}</div><div id="dc-path" class="dc-anchor">${path}</div></div>
      </div>
    </div>
  </div>`;
}

// Redessine la page : la fiche garde sa position (view.dsY).
const dsRedraw = () => render();
// La fiche : position gardée, onglets qui suivent la lecture, colonne qui conduit aux blocs, recherche dans la colonne.
function bindDossierSheet(page, root) {
  const main = root.querySelector('.dc-main');
  if (!main) return;
  const tabs = [...root.querySelectorAll('[data-dctab]')];
  const bar = root.querySelector('.dc-tabs');
  let pinned = null, arriving = false, arrival = null;
  const spy = () => {
    const line = bar.getBoundingClientRect().bottom + 30;
    let on = tabs[0];
    for (const t of tabs) { const el = root.querySelector(`#${t.dataset.dctab}`); if (el && el.getBoundingClientRect().top <= line) on = t; }
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 2) on = pinned || tabs.at(-1);
    else if (pinned) on = pinned;
    tabs.forEach((t) => t.classList.toggle('on', t === on));
  };
  const goTo = (el, tab) => {
    if (!el) return;
    pinned = tab || null;
    arriving = true;
    clearTimeout(arrival);
    arrival = setTimeout(() => { arriving = false; }, 1200);
    main.scrollTo({ top: main.scrollTop + el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 8, behavior: 'smooth' });
    spy();
  };
  main.scrollTop = view.dsY || 0;
  main.onscroll = () => { view.dsY = main.scrollTop; if (!arriving) pinned = null; spy(); };
  main.addEventListener('scrollend', () => { arriving = false; });
  main.addEventListener('wheel', () => { arriving = false; pinned = null; }, { passive: true });
  spy();
  tabs.forEach((t) => { t.onclick = () => goTo(root.querySelector(`#${t.dataset.dctab}`), t); });
  root.querySelectorAll('[data-dcrow]').forEach((r) => {
    r.onclick = () => {
      view.dcRow = r.dataset.dcrow;
      root.querySelectorAll('[data-dcrow]').forEach((x) => x.classList.toggle('on', x === r));
      const tab = tabs.find((t) => t.dataset.dctab === r.dataset.dcgo);
      const club = r.dataset.dcclub;
      const card = club && [...root.querySelectorAll('.dc-main [data-dsclub]')].find((c) => c.dataset.dsclub === club && !c.closest('.dc-head'));
      goTo(card || root.querySelector(`#${r.dataset.dcgo}`), tab);
      if (card) { card.classList.remove('dc-flash'); requestAnimationFrame(() => card.classList.add('dc-flash')); }
    };
  });
  const q = root.querySelector('#dc-q');
  if (q) {
    q.oninput = () => {
      const text = plainText(q.value).trim();
      let shown = 0;
      root.querySelectorAll('.dc-group').forEach((g) => {
        let any = false;
        g.querySelectorAll('[data-dcrow]').forEach((r) => { const on = !text || r.dataset.q.includes(text); r.hidden = !on; any = any || on; if (on) shown++; });
        g.hidden = !any;
      });
      root.querySelector('#dc-none').style.display = shown ? 'none' : 'block';
    };
    q.onkeydown = (ev) => { if (ev.key === 'Escape' && q.value) { ev.stopPropagation(); ev.preventDefault(); q.value = ''; q.oninput(); } };
  }
  root.querySelectorAll('[data-gpct]').forEach((i) => { i.style.width = `${i.dataset.gpct}%`; });
  const inf = root.querySelector('[data-dcinf]');
  if (inf) inf.onclick = () => page.querySelector('[data-sminfluence]')?.click();
}
// Les couleurs des écussons, posées à mesure qu'elles arrivent.
function dsPaintColors() {
  document.querySelectorAll('.ds [data-dsclub]').forEach((el) => {
    const c = clubColors(el.dataset.dsclub);
    if (!c) return;
    el.style.setProperty('--ds-c', c.primary);
    el.style.setProperty('--ds-c2', c.secondary);
  });
}
function bindDossier(page) {
  const root = page.querySelector('.ds');
  if (!root) return;
  dsPaintColors();
  // La CSP interdit les attributs style : positions et largeurs sont posées ici.
  root.querySelectorAll('[data-l]').forEach((el) => { el.style.left = `${el.dataset.l}%`; });
  root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  root.querySelectorAll('.ib-bar [data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  root.querySelectorAll('[data-h]').forEach((el) => { el.style.height = `${el.dataset.h}%`; });
  root.querySelectorAll('.dc-axis [data-b]').forEach((el) => { el.style.bottom = `${el.dataset.b}%`; });
  bindDossierSheet(page, root);
  // Une autre attitude : l'estimation glisse de l'ancienne valeur à la nouvelle.
  const ring = root.querySelector('.ds-ring');
  const from = view.dsRingFrom, to = state.agent.view.extension;
  delete view.dsRingFrom;
  if (ring && from !== undefined && from !== null && to !== null && from !== to) {
    const arc = ring.querySelector('.v'), label = ring.querySelector('strong');
    arc.style.strokeDasharray = `${from} 100`;
    label.textContent = pct(from);
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDasharray = `${to} 100`; }));
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      label.textContent = pct(Math.round(from + (to - from) * k));
      if (k < 1 && label.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  root.querySelectorAll('[data-stance]').forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.stance === state.agent.stance) return;
      const before = state.agent.view.extension;
      try { state = await live.setAgentStance(b.dataset.stance); view.dsRingFrom = before; dsRedraw(); toast(tr('{agent} a pris note.', { agent: agentFirst() })); } catch (err) { toast(err.message, true); }
    };
  });
  root.querySelectorAll('[data-request]').forEach((b) => {
    b.onclick = async () => {
      const club = b.dataset.request || null;
      try { state = await live.setTransferRequest(club); dsRedraw(); toast(club ? tr('Demande à {club} notée : {agent} suit le dossier.', { club, agent: agentFirst() }) : tr('Demande annulée.')); } catch (err) { toast(err.message, true); }
    };
  });
  root.querySelectorAll('[data-redirect]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.redirect);
      const select = root.querySelector(`[data-redirect-to="${id}"]`);
      const to = select.selectedOptions[0].textContent.split(' · ')[0];
      const ok = await kConfirm({
        title: tr('Réorienter l’offre vers {club} ?', { club: to }),
        body: tr('L’offre de {from} va devenir une offre de {to}, aux mêmes conditions.\n\nLe jeu doit être fermé : sauvegarde ta partie et quitte le jeu avant de continuer. LifeLegend garde une copie de ta sauvegarde.', { from: b.dataset.from, to }),
        ok: tr('Réorienter l’offre'),
      });
      if (!ok) return;
      b.disabled = true;
      try {
        const r = await live.redirectOffer(id, Number(select.value));
        state = r.state; dsRedraw();
        toast(tr('Offre réorientée vers {club}. Lance le jeu : elle t’attend dans la Liste d’offres.', { club: r.result.to }));
      } catch (err) { b.disabled = false; toast(err.message, true); }
    };
  });
  root.querySelectorAll('[data-dsthread]').forEach((b) => {
    b.onclick = async () => {
      Object.assign(view, { smDossier: false, thread: b.dataset.dsthread, mailFolder: 'all', smReading: true });
      state = await live.readMail(view.thread);
      render();
    };
  });
}

// ---------- Influence (Mails → Carrière → Influence) ----------
// Jauge d'influence, demandes à l'entraîneur (plan de jeu) et au directeur sportif (mercato, avenir), et décisions
// acceptées que LifeLegend peut écrire dans la sauvegarde (expérimental : formation tout de suite, transferts au mercato).
// Présentée en tableau tactique : le score et ce qui le fait, le terrain et ses joueurs pour le plan de jeu, une carte et
// une fenêtre par demande du mercato.
let influenceData = null;   // vue calculée par le moteur (live.influence), refaite quand la carrière change
let influenceStamp = '';
let influenceLoading = false;
let influenceHits = null;   // résultats de la recherche de recrue
// Postes officiels du jeu (codes PES 0-12, dans l'ordre de POS_CODES), pour le poste à renforcer.
const INF_POS = ['Gardien', 'Défenseur central', 'Arrière gauche', 'Arrière droit', 'Milieu défensif', 'Milieu central', 'Milieu gauche', 'Milieu droit', 'Milieu offensif', 'Ailier gauche', 'Ailier droit', 'Second attaquant', 'Avant-centre'];
const INF_KIND = { formation: 'Plan de jeu', signing: 'Recrue', sale: 'Départ', undo: 'Vente refusée', keep: 'Retenir', future: 'Ton avenir' };
const INF_STATUS = { waiting: 'En attente du mercato', ready: 'Prête à écrire', applied: 'Écrite dans ta sauvegarde', confirmed: 'Gardée par le jeu', reverted: 'Pas gardée par le jeu', expired: 'Expirée', cancelled: 'Annulée' };
const INF_REASON = {
  same: 'C’est déjà le plan de jeu du club.', cooldown: 'Tu as fait une demande de ce genre il y a peu : laisse passer quelques semaines.', pending: 'Une décision de ce genre est déjà en cours.',
  out_of_reach: 'Hors de portée : son club joue dans une autre catégorie.', squad_full: 'L’effectif est complet (40 joueurs).', already_here: 'Il joue déjà dans ton club.', is_me: 'C’est toi.',
  dest_full: 'Ce club a déjà 40 joueurs.', already_kept: 'Le club le retient déjà.', too_many_keeps: 'Tu protèges déjà trois coéquipiers.', unknown: 'Demande impossible pour l’instant.',
  winning: 'l’équipe gagne avec le système actuel', struggling: 'les résultats sont mauvais en ce moment', recent_change: 'le système vient de changer', bigger_club: 'son club est plus huppé',
  smaller_club: 'son club est plus modeste', abroad: 'un championnat que le club connaît mal', key_player: 'un titulaire indiscutable', regular: 'un joueur qui joue souvent', fringe: 'un joueur qui joue peu',
  squad_big: 'l’effectif est déjà chargé', in_form: 'tu es en forme', out_of_form: 'ta forme n’est pas bonne', average_form: 'ta forme est moyenne', long_contract: 'ton contrat court encore plus de trois ans',
  thin_position: 'ton club manque de joueurs à ce poste', deep_position: 'ton club a déjà du monde à ce poste',
  contract_ending: 'ton contrat se termine bientôt', low_influence: 'tu n’as pas encore assez de poids dans le vestiaire',
};
// Formation : le nom affiché par le jeu d'abord (celui du plan de jeu), le nom courant ensuite s'il diffère.
const fmName = (f) => (!f ? '—' : f.name && f.name !== f.gameName ? `${f.gameName} (≈ ${f.name})` : f.gameName);
const infWhy = (a) => (a && !a.blocked && a.reasons?.length ? `${tr('Ce qui joue')}${colon()} ${a.reasons.map((r) => esc(tr(INF_REASON[r] || r))).join(' · ')}.` : '');
const infDay = (iso) => fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
function effectLabel(e) {
  if (e.kind === 'formation') return tr('Plan de jeu : {name}', { name: fmName(e) });
  if (e.kind === 'signing') return tr('Recrue : {name} ({club})', { name: e.name, club: e.from || '?' });
  if (e.kind === 'sale') return tr('Départ : {name} vers {club}', { name: e.name, club: e.to || '?' });
  return tr('Vente refusée : {name} reste au club', { name: e.name });
}
function effectState(e, writes) {
  if (e.status === 'waiting') return esc(e.opens ? tr('ouverture du mercato le {d}', { d: infDay(e.opens) }) : tr('au prochain mercato'));
  if (e.status === 'ready') return writes ? `<button class="btn primary" data-infapply="${esc(e.id)}">${tr('Écrire dans le jeu')}</button>` : `<span class="handle">${tr('à activer dans les réglages')}</span>`;
  if (e.status === 'applied') return esc(tr('écrite le {d} : lance le jeu pour la voir', { d: infDay(e.appliedOn) }));
  if (e.status === 'confirmed') return e.judged === 'paid_off' ? tr('et ça a payé') : e.judged === 'backfired' ? tr('mais les résultats ont baissé') : '✓';
  return '';
}

// Les places sur le terrain : x du gardien vers l'attaque, y du côté gauche de l'équipe vers le droit (l'affichage les pose de bas en haut).
// Le jeu donne les postes dans l'ordre des lignes. Un nom de formation inattendu : terrain sans joueurs.
const IB_SIDE = { DG: 0, MG: 0, AG: 0, DD: 2, MD: 2, AD: 2 };
function ibSlots(f) {
  const parts = String(f?.gameName || '').split('-').map(Number);
  if (f?.roles?.length !== 11 || parts.reduce((a, b) => a + b, 0) !== 10) return [];
  const slots = [{ role: f.roles[0], x: 7, y: 50 }];
  let at = 1;
  parts.forEach((count, li) => {
    const line = f.roles.slice(at, at + count).sort((a, b) => (IB_SIDE[a] ?? 1) - (IB_SIDE[b] ?? 1));
    at += count;
    const x = 25 + (li * 65) / Math.max(1, parts.length - 1);
    // Une ligne axiale reste serrée (deux avant-centres), une ligne avec des côtés prend toute la largeur.
    const span = line.some((r) => r in IB_SIDE) ? 68 : count === 2 ? 34 : 52;
    line.forEach((role, i) => slots.push({ role, x, y: count === 1 ? 50 : 50 - span / 2 + (span * i) / (count - 1) }));
  });
  return slots;
}
// Le onze probable : le joueur à son poste, puis ses coéquipiers du plus au moins utilisé (la liste est triée par temps de
// jeu), chacun à son poste ou à un poste voisin, pour qu'un titulaire ne sorte pas au profit d'un remplaçant. Les places
// restantes vont à ceux qui jouent le plus. Le gardien reste gardien.
const IB_NEAR = { DC: ['DD', 'DG', 'MDC'], DD: ['DG', 'MD', 'DC'], DG: ['DD', 'MG', 'DC'], MDC: ['MC', 'DC'], MC: ['MDC', 'MOC', 'MD', 'MG'], MD: ['MG', 'AD', 'MC', 'DD'], MG: ['MD', 'AG', 'MC', 'DG'], MOC: ['MC', 'SA', 'MD', 'MG'], AD: ['AG', 'MD', 'SA', 'AC'], AG: ['AD', 'MG', 'SA', 'AC'], SA: ['AC', 'MOC', 'AG', 'AD'], AC: ['SA', 'AG', 'AD', 'MOC', 'MG', 'MD'] };
function ibLineup(d, f) {
  const slots = ibSlots(f), me = state.snapshot.player, mine = me.profile?.position;
  const out = slots.map(() => null), used = new Set();
  const seat = (i, p) => { out[i] = p; used.add(p.id); };
  let at = slots.findIndex((x) => x.role === mine);
  if (at < 0) at = slots.findIndex((x) => IB_NEAR[mine]?.includes(x.role));
  if (at >= 0) seat(at, { id: me.id, name: me.name, me: true });
  const squad = d.squad.map((x) => ({ id: x.id, name: x.name, share: x.share, role: POS_CODES[x.role] ?? null }));
  const free = (test) => slots.findIndex((s, i) => !out[i] && test(s));
  squad.forEach((p) => {
    let i = free((s) => s.role === p.role);
    for (const near of IB_NEAR[p.role] || []) { if (i >= 0) break; i = free((s) => s.role === near); }
    if (i >= 0) seat(i, p);
  });
  squad.filter((p) => !used.has(p.id)).forEach((p) => {
    const i = free((s) => s.role !== 'GB' && p.role !== 'GB');
    if (i >= 0) seat(i, p);
  });
  return slots.flatMap((s, i) => (out[i] ? [{ ...out[i], ...s }] : []));
}
// Les jetons gardent leur joueur d'un système à l'autre : ils glissent à leur nouvelle place, les sortants s'effacent.
function ibPaintPitch(page, d, f) {
  const field = page.querySelector('.ib-xi');
  if (!field) return;
  const old = new Map([...field.children].filter((el) => !el.classList.contains('out')).map((el) => [el.dataset.id, el]));
  const lineup = ibLineup(d, f);
  lineup.forEach((t) => {
    let el = old.get(String(t.id));
    if (el) old.delete(String(t.id));
    else {
      el = document.createElement('div');
      el.className = `ib-token${t.me ? ' me' : ''}`;
      el.dataset.id = t.id;
      el.title = t.me ? t.name : `${t.name} · ${tr('temps de jeu {p}', { p: pct(t.share) })}`;
      el.innerHTML = `<span>${faceIn(t.name, fbInitials(t.name))}</span><b><em>${esc(ibShort(t.name))}</em><i></i></b>`;
      if (!t.me) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.onclick = () => ibOpenPlayer(page, d, t.id); el.onkeydown = (ev) => { if (ev.key === 'Enter') ibOpenPlayer(page, d, t.id); }; }
      field.appendChild(el);
    }
    el.querySelector('i').textContent = posLabel(t.role);
    el.classList.toggle('tight', lineup.filter((o) => o.x === t.x).length >= 5);
    // Le terrain est plus étroit que long : la ligne prend un peu plus de largeur, cinq défenseurs tiennent côte à côte.
    el.style.left = `${50 + (t.y - 50) * 1.1}%`;
    el.style.top = `${7 + (100 - t.x) * 0.86}%`;
  });
  old.forEach((el) => { el.classList.add('out'); setTimeout(() => el.remove(), 300); });
}
const ibShort = (name) => String(name).trim().split(/\s+/).at(-1).replace(/^.*\./, '');
const ibFace = (name) => `<span class="ib-face">${faceIn(name, fbInitials(name))}</span>`;
// Les chances dans un anneau.
const ibRing = (n) => `<span class="ib-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"/><circle class="v" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${n} 100" transform="rotate(-90 18 18)"/></svg><strong>${pct(n)}</strong></span>`;
// Les chances d'une demande, ou ce qui l'empêche.
const ibOdds = (a) => (!a ? '' : a.blocked ? `<span class="ib-why">${esc(tr(INF_REASON[a.blocked] || INF_REASON.unknown))}</span>` : `<span class="ib-odds"><span class="ib-bar"><i data-pct="${a.chance}"></i></span><strong>${pct(a.chance)}</strong></span>`);
// Ce qui empêche une demande pour tous les coéquipiers (rien si au moins un reste possible).
const ibAllBlocked = (d, key) => (d.squad.length && d.squad.every((x) => x[key]?.blocked) ? d.squad[0][key].blocked : null);
// Le système proposé : aucun tant que le joueur n'a pas choisi, le terrain montre alors le plan de jeu actuel.
const ibChosen = (d) => d.formations.find((f) => f.key === view.infFormation && f.assess.blocked !== 'same') || null;
function ibOffer(f) {
  if (!f) return `<p class="fineprint">${tr('Choisis un système : le terrain te montre où chacun jouerait.')}</p>`;
  if (f.assess.blocked) return `<p class="fineprint">${esc(tr(INF_REASON[f.assess.blocked] || INF_REASON.unknown))}</p>`;
  return `<div class="ib-pick">${ibRing(f.assess.chance)}<div><b>${esc(tr('Proposer le {name}', { name: f.gameName }))}</b>${f.name && f.name !== f.gameName ? `<small>≈ ${esc(f.name)}</small>` : ''}${infWhy(f.assess) ? `<small>${infWhy(f.assess)}</small>` : ''}</div></div>`;
}
function ibShow(page, d) {
  const chosen = ibChosen(d), offer = page.querySelector('#ib-offer');
  page.querySelectorAll('[data-inftile]').forEach((x) => x.classList.toggle('on', x.dataset.inftile === chosen?.key));
  if (offer) offer.innerHTML = ibOffer(chosen);
  const ask = page.querySelector('[data-infformation]');
  if (ask) ask.disabled = !chosen || Boolean(chosen.assess.blocked);
  const tag = page.querySelector('.ib-tag');
  tag.classList.toggle('prev', Boolean(chosen));
  tag.firstElementChild.textContent = chosen ? tr('Aperçu') : tr('Plan de jeu actuel');
  tag.lastElementChild.textContent = (chosen || d.formation)?.gameName || '—';
  ibPaintPitch(page, d, chosen || d.formation);
}

// Les joueurs d'Influence : un filtre par ligne, des cartes, et la grande fiche de celui qu'on a choisi. Rien d'inventé : le save
// ne donne ni l'âge, ni la nationalité, ni le numéro des coéquipiers, seulement leur poste, leur temps de jeu et leurs matchs.
const IB_LINES = [['all', 'Tous', null], ['att', 'Attaquants', [9, 10, 11, 12]], ['mid', 'Milieux', [4, 5, 6, 7, 8]], ['def', 'Défenseurs', [1, 2, 3]], ['gk', 'Gardiens', [0]]];
const ibStatsOf = (x) => (state.snapshot.squad || []).find((p) => p.name === x.name) || null;
const ibCode = (x) => (x.role !== null && x.role !== undefined ? posLabel(POS_CODES[x.role]) : x.pos !== null && x.pos !== undefined ? skPos(x.pos) : '');
const ibNote = (st) => (st?.avgRating ? fmtNote(st.avgRating) : '—');
const ibLine = () => IB_LINES.find(([k]) => k === view.infLine) || IB_LINES[0];
const ibLineList = (d) => { const roles = ibLine()[2]; return d.squad.filter((x) => !roles || roles.includes(x.role)); };
const ibPicked = (d) => d.squad.find((x) => x.id === view.infPlayer) || ibLineList(d)[0] || d.squad[0] || null;
const ibNameHtml = (name) => { const w = String(name).trim().split(/\s+/), last = w.pop(); return `${w.length ? `<span>${esc(w.join(' '))}</span>` : ''}<b>${esc(last)}</b>`; };
function ibCardsHtml(d) {
  const picked = ibPicked(d);
  return ibLineList(d).map((x) => {
    const st = ibStatsOf(x);
    return `<button type="button" class="ib-pcard${x === picked ? ' on' : ''}" data-infplayer="${x.id}"><span class="ib-pcut">${faceIn(x.name, fbInitials(x.name))}</span>
      <span class="ib-pid"><span class="ib-pname">${ibNameHtml(x.name)}</span>
        <span class="ib-pfacts"><span><small>${tr('Matchs')}</small><b>${st?.apps ?? 0}</b></span><span><small>${tr('Note')}</small><b>${ibNote(st)}</b></span><span><small>${tr('Temps de jeu')}</small><b>${pct(x.share)}</b></span></span></span>
      <i class="ib-pcode">${esc(ibCode(x))}</i></button>`;
  }).join('') || `<p class="fineprint">${tr('Aucun joueur à ce poste.')}</p>`;
}
function ibSheetHtml(d, x) {
  if (!x) return '';
  const s = state.snapshot, st = ibStatsOf(x);
  const games = (s.fixtures || []).filter((f) => f.played && (f.home === s.club.name || f.away === s.club.name)).length;
  const most = Math.max(1, ...(s.squad || []).map((p) => p.goals + p.assists));
  const gp = (st?.goals || 0) + (st?.assists || 0);
  const bar = (label, text, n) => `<div class="ib-sb"><div><span>${esc(label)}</span><b>${esc(text)}</b></div><span class="ib-sb-t"><i class="${n >= 70 ? 'hi' : n >= 45 ? 'mid' : 'lo'}" data-pct="${Math.max(0, Math.min(100, n))}"></i></span></div>`;
  const odds = (label, a, none) => (a && !a.blocked ? bar(label, pct(a.chance), a.chance) : `<div class="ib-sb off"><div><span>${esc(label)}</span><small>${esc(a ? tr(INF_REASON[a.blocked] || INF_REASON.unknown) : none)}</small></div></div>`);
  const line = x.role !== null && x.role !== undefined ? tr(INF_POS[x.role]) : '';
  const noSale = tr('Aucun club intéressé pour l’instant.');
  return `<div class="ib-sheet-top"><span class="ib-sheet-cut">${faceIn(x.name, fbInitials(x.name))}</span>
      <div class="ib-sheet-id"><span class="ib-eyebrow">${esc(line)}</span><h3>${ibNameHtml(x.name)}</h3>
        <div class="ib-sheet-facts"><span><small>${tr('Matchs')}</small><b>${st?.apps ?? 0}</b></span><span><small>${tr('Minutes')}</small><b>${st?.minutes ?? 0}</b></span><span><small>${tr('Poste')}</small><b>${esc(ibCode(x))}</b></span></div></div></div>
    <div class="ib-sheet-body">
      ${bar(tr('Temps de jeu'), pct(x.share), x.share)}
      ${bar(tr('Titularisations'), games ? `${x.starts} / ${games}` : String(x.starts), games ? (x.starts / games) * 100 : 0)}
      ${bar(tr('Note moyenne'), ibNote(st), st?.avgRating ? st.avgRating * 10 : 0)}
      ${bar(tr('Buts + passes'), String(gp), (gp / most) * 100)}
      ${odds(tr('Chances de le retenir'), x.keep, '')}
      ${odds(tr('Chances de le faire partir'), x.sale, noSale)}
      <div class="ib-sheet-acts"><button type="button" class="btn primary" data-infsheet="keep"${!x.keep || x.keep.blocked ? ' disabled' : ''}>${tr('Retenir ce joueur')}</button><button type="button" class="btn" data-infsheet="sale"${!x.sale || x.sale.blocked || !d.saleTargets.length ? ' disabled' : ''}>${tr('Demander son départ')}</button></div>
    </div>`;
}
// Repeint la liste et la fiche sur place : la page ne bouge pas.
function ibPaintPlayers(page, d, { list = true } = {}) {
  const box = page.querySelector('#ib-plist'), sheet = page.querySelector('#ib-sheet');
  if (!box || !sheet) return;
  const picked = ibPicked(d);
  if (list) box.innerHTML = ibCardsHtml(d);
  else box.querySelectorAll('[data-infplayer]').forEach((b) => b.classList.toggle('on', Number(b.dataset.infplayer) === picked?.id));
  sheet.innerHTML = ibSheetHtml(d, picked);
  sheet.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  sheet.querySelectorAll('[data-infsheet]').forEach((b) => { b.onclick = () => openInfModal(b.dataset.infsheet, picked.id); });
  box.querySelectorAll('[data-infplayer]').forEach((b) => { b.onclick = () => { view.infPlayer = Number(b.dataset.infplayer); ibPaintPlayers(page, d, { list: false }); }; });
}
// Choisir un joueur sur le terrain ouvre sa fiche, sous le terrain.
function ibOpenPlayer(page, d, id) {
  view.infPlayer = id;
  if (!ibLineList(d).some((x) => x.id === id)) {
    view.infLine = 'all';
    page.querySelectorAll('[data-infline]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.infline === 'all')));
  }
  ibPaintPlayers(page, d);
  page.querySelector('#ib-squad')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  page.querySelector(`[data-infplayer="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function influencePage() {
  const d = influenceData;
  if (!d) return `<p class="fineprint ib-wait">${tr('Chargement…')}</p>`;
  if (!d.ready) return `<p class="fineprint ib-wait">${tr('Synchronise ta sauvegarde : LifeLegend y lit ton temps de jeu, celui de tes coéquipiers et les formations du jeu.')}</p>`;
  const s = state.snapshot, p = d.score.parts, pts = p.points || {}, score = d.score.score;
  const level = score >= 70 ? tr('Forte') : score >= 45 ? tr('En progrès') : tr('Limitée');
  const coach = d.coach || tr('ton entraîneur');
  const crest = teamEmblem(s.club.name);
  const joined = s.player.history?.joinedClub;
  const effects = d.effects.filter((e) => e.status !== 'cancelled' || e.on >= s.gameDate);
  const reason = (r) => esc(tr(INF_REASON[r] || INF_REASON.unknown));
  const lv = (cls, lo, up, label) => `<div class="ib-lv ${cls}${score >= lo && (score < up || up === 100) ? ' on' : ''}"><span class="ib-bar"><i data-pct="${(Math.max(0, Math.min(score, up) - lo) / (up - lo)) * 100}"></i></span><small>${label}</small></div>`;
  const tile = (f) => {
    const now = f.assess.blocked === 'same';
    return `<button type="button" class="ib-tile${now ? ' now' : ''}" data-inftile="${esc(f.key)}" title="${esc(fmName(f))}"><b>${esc(f.gameName)}</b>${now ? `<span>${tr('Actuel')}</span>` : ''}</button>`;
  };
  const head = (icon, title) => `<span class="ib-card-head"><span class="ib-ico">${hi(icon)}</span><b>${esc(title)}</b></span>`;
  const easiest = (key) => d.squad.filter((x) => x[key] && !x[key].blocked).sort((a, b) => b[key].chance - a[key].chance || b.share - a.share).slice(0, 3);
  const people = (kind, icon, title, lead) => {
    const stop = kind === 'sale' && !d.saleTargets.length ? tr('Aucun club intéressé pour l’instant.') : ibAllBlocked(d, kind) ? tr(INF_REASON[ibAllBlocked(d, kind)] || INF_REASON.unknown) : null;
    return `<button type="button" class="ib-card" data-infopen="${kind}"${stop ? ' disabled' : ''}>${head(icon, title)}
      ${stop ? `<span class="ib-sub">${esc(stop)}</span>` : `<span class="ib-sub">${esc(lead)}</span>
      <span class="ib-tops">${easiest(kind).map((x) => `<span><span class="ib-top-who">${ibFace(x.name)}<span class="ib-top-n">${esc(x.name)}</span></span><strong>${pct(x[kind].chance)}</strong></span>`).join('')}</span>
      <em>${tr('Choisir un coéquipier')} →</em>`}</button>`;
  };
  const thin = Object.keys(d.depth || {}).length ? INF_POS.map((l, i) => [i, d.depth[i] || 0, l]).sort((a, b) => a[1] - b[1]).slice(0, 4) : [];
  const wish = (kind, title) => {
    const a = d.future[kind];
    return `<button type="button" class="ib-wish" data-infopen="${kind}"${a.blocked ? ' disabled' : ''}><span><b>${esc(title)}</b>${a.blocked ? `<small>${reason(a.blocked)}</small>` : ''}</span>${a.blocked ? '' : ibRing(a.chance)}</button>`;
  };
  const lists = [
    effects.length && `<section class="ib-list"><h3>${tr('Décisions')}</h3>
      ${effects.map((e) => `<div class="ib-row"><span class="pill">${esc(tr(INF_KIND[e.kind] || e.kind))}</span><div><b>${esc(effectLabel(e))}</b><span>${esc(tr(INF_STATUS[e.status] || e.status))} · ${esc(tr('décidée le {d}', { d: infDay(e.on) }))}</span></div><div class="ib-row-end">${effectState(e, d.writes)}</div></div>`).join('')}
      <p class="fineprint">${d.writes ? tr('Écrire une décision modifie ta sauvegarde : sauvegarde ta partie et quitte le jeu avant. LifeLegend garde une copie.') : tr('Les décisions acceptées restent dans LifeLegend tant que {setting} n’est pas activé dans les réglages (expérimental).', { setting: quote(tr('Influence : effets réels dans le jeu')) })}</p></section>`,
    d.requests.length && `<section class="ib-list"><h3>${tr('Tes dernières demandes')}</h3>
      ${d.requests.map((r) => `<div class="ib-row"><span class="pill">${esc(tr(INF_KIND[r.kind] || r.kind))}</span><div><b>${esc(requestLabel(r))}</b><span>${esc(infDay(r.on))} · ${esc(r.from)}</span></div><div class="ib-row-end"><span class="sm-chip${r.accepted ? ' sm-chip--yes' : ' sm-chip--closed'}">${r.accepted ? tr('Acceptée') : tr('Refusée')}</span>${r.threadId ? `<button class="btn" data-infthread="${esc(r.threadId)}">${tr('Lire')}</button>` : ''}</div></div>`).join('')}</section>`,
  ].filter(Boolean).join('');
  const hello = String(state.profile?.displayName || s.player.name).trim().split(/\s+/)[0];
  const fac = (icon, label, n, max, note) => `<div class="ib-fac"><span class="ib-fac-ico">${hi(icon)}</span><div><b>${esc(label)}</b><small>${esc(note)}</small></div><span class="ib-ring ib-fac-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"/><circle class="v" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${((n || 0) / max) * 100} 100" transform="rotate(-90 18 18)"/></svg><strong>${n ?? '—'}<small>/${max}</small></strong></span></div>`;
  return `<div class="ib">
    <header class="ib-top">
      <div class="ib-hello"><p>${esc(tr('Bon retour, {name}', { name: hello }))}</p><h1>${tr('Influence')}</h1></div>
      <div class="ib-score">
        <div class="ib-score-top">${crest ? `<img src="${esc(crest)}" alt="">` : ''}<div><span class="ib-eyebrow">${tr('Ton influence')} · ${esc(s.club.name)}</span><p><b>${score}</b><small>/100</small><em>${level}</em></p></div></div>
        <div class="ib-levels">${lv('a', 0, 45, tr('Limitée'))}${lv('b', 45, 70, tr('En progrès'))}${lv('c', 70, 100, tr('Forte'))}</div>
      </div>
    </header>
    <div class="ib-main">
      <section class="ib-board">
        <div class="ib-board-head"><h2>${tr('Plan de jeu')}</h2><div class="ib-tag"><span></span><b></b></div><a class="ib-all" data-infsquad>${tr('Voir tout l’effectif')}</a></div>
        <div class="ib-board-in">
          <div class="ib-turf">
            <svg class="ib-lines" viewBox="0 0 68 68" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M2 0v66h64V0"/><path d="M2 8h64"/><circle cx="34" cy="8" r="9.15"/><rect x="13.84" y="49.5" width="40.32" height="16.5"/><rect x="24.84" y="60.5" width="18.32" height="5.5"/><path d="M26.7 49.5a9.15 9.15 0 0 1 14.6 0"/></svg>
            <div class="ib-xi"></div>
          </div>
          <div class="ib-ask"><span class="ib-eyebrow">${esc(tr('Demande à {name}', { name: coach }))}</span><h3>${tr('Quel système proposes-tu ?')}</h3>
            ${d.formations.length ? `<div class="ib-grid">${d.formations.map(tile).join('')}</div>
            <div id="ib-offer"></div>
            <input class="ib-input" data-msg="formation" maxlength="300" placeholder="${tr('Ton argument (facultatif)')}">
            <button class="btn primary" data-infformation disabled>${esc(tr('Demander à {name}', { name: coach }))}</button>`
    : `<p class="fineprint">${tr('Formations du jeu introuvables : indique le dossier du jeu dans les réglages, puis resynchronise.')}</p>`}
            <p class="ib-xi-note">${tr('Onze probable d’après le temps de jeu')}</p></div>
        </div>
      </section>
      <aside class="ib-rail">
        <section class="ib-panel"><h3>${tr('Ce qui compte')}</h3>
          ${fac('clock', tr('Temps de jeu'), pts.starts, 35, tr('Titulaire : {p} des {n} derniers matchs', { p: pct(p.starts), n: p.matches }))}
          ${fac('poll', tr('Forme'), pts.form, 30, `${p.form}/100`)}
          ${fac('user', tr('Rôle d’équipe'), pts.role, 20, p.role ? tr('Rôle : {role}', { role: tr(p.role) }) : tr('Pas encore de rôle d’équipe'))}
          ${fac('calendar', tr('Ancienneté'), pts.seniority, 15, joined ? tr('au club depuis le {d}', { d: infDay(joined) }) : '')}
          ${p.track || p.fans ? `<p class="fineprint">${[p.track ? `${tr('Bilan de tes demandes')}${colon()} ${p.track > 0 ? `+${p.track}` : p.track}` : '', p.fans ? tr('Supporters : {n}', { n: p.fans }) : ''].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
        </section>
        <section class="ib-panel"><h3>${tr('Ton avenir')}</h3>
          ${s.player.contractUntil ? `<span class="ib-sub">${esc(tr('Contrat jusqu’au {d}', { d: infDay(s.player.contractUntil) }))}</span>` : ''}
          ${wish('extend', tr('Une prolongation'))}${wish('leave', tr('Ton départ'))}
        </section>
      </aside>
    </div>
    ${d.squad.length ? `<section class="ib-squad" id="ib-squad">
      <div class="ib-squad-head"><h2>${tr('Joueurs')}</h2><div class="ib-lines-f" role="group" aria-label="${tr('Poste')}">${IB_LINES.map(([k, l]) => `<button type="button" data-infline="${k}" aria-pressed="${ibLine()[0] === k}">${esc(tr(l))}</button>`).join('')}</div></div>
      <div class="ib-roster"><div class="ib-plist" id="ib-plist"></div><article class="ib-sheet" id="ib-sheet"></article></div>
    </section>` : ''}
    <span class="ib-eyebrow ib-sec"><i class="${d.window ? 'open' : ''}"></i>${esc(tr('Mercato'))} · ${esc(d.window ? tr('Ouvert') : tr('Fermé'))} · ${esc(windowDates(s))} · ${esc(d.director)}</span>
    <div class="ib-cards">
      <button type="button" class="ib-card" data-infopen="signing">${head('userPlus', tr('Recommander une recrue'))}
        <span class="ib-sub">${thin.length ? tr('Postes les plus légers') : tr('Choisis un poste pour voir des joueurs à ta portée, ou cherche un nom.')}</span>
        ${thin.length ? `<span class="ib-thin">${thin.map(([i, n, l]) => `<span title="${esc(tr(l))}">${esc(posLabel(POS_CODES[i]))}<small>${n}</small></span>`).join('')}</span>` : ''}
        <em>${tr('Chercher un joueur')} →</em></button>
      ${d.squad.length ? `${people('sale', 'exit', tr('Demander un départ'), tr('Les plus faciles à faire partir'))}
      ${people('keep', 'shieldCheck', tr('Retenir un coéquipier'), tr('Les plus faciles à retenir'))}` : ''}
    </div>
    ${lists ? `<div class="ib-lists">${lists}</div>` : ''}
    <p class="fineprint ib-note">${tr('Calculée sur ta sauvegarde à chaque synchro. Elle monte quand tu joues, quand tu es en forme, avec l’ancienneté et ton rôle d’équipe dans le jeu, et quand tes demandes portent leurs fruits. Une demande refusée l’use un peu.')}</p>
  </div>`;
}

// Chaque carte du mercato ouvre sa fenêtre, avec ses seuls champs ; la demande part de là.
let infBox = null;
const IB_PANELS = { signing: 'Recommander une recrue', sale: 'Demander un départ', keep: 'Retenir un coéquipier', extend: 'Une prolongation', leave: 'Ton départ' };
function closeInfModal() {
  if (!infBox) return;
  infBox.remove();
  infBox = null;
  view.infPanel = null;
  ['#page', '.ll-rail', '.ll-top'].forEach((q) => { const el = document.querySelector(q); if (el) el.inert = false; });
}
function openInfModal(kind, pick = null) {
  if (infBox) return;
  Object.assign(view, { infPanel: kind, infPick: pick });
  infBox = document.createElement('div');
  infBox.className = 'ib-modal-back ll-open';
  setTimeout(() => infBox?.classList.remove('ll-open'), 400);
  infBox.onclick = (ev) => { if (ev.target === infBox) closeInfModal(); };
  document.body.appendChild(infBox);
  ['#page', '.ll-rail', '.ll-top'].forEach((q) => { const el = document.querySelector(q); if (el) el.inert = true; });
  paintInfModal();
  infBox.querySelector('.ib-modal').focus();
  infBox.querySelector('.ib-person.on')?.scrollIntoView({ block: 'nearest' });
}
function infPanelBody(d, kind) {
  const dates = windowDates(state.snapshot);
  const mercato = `<p class="fineprint">${d.window ? esc(tr('Le mercato est ouvert {dates} : une décision acceptée peut être écrite tout de suite.', { dates })) : esc(tr('Le mercato est fermé ({dates}) : une décision acceptée attendra son ouverture.', { dates }))}</p>`;
  const arg = `<input class="ib-input" data-msg="${kind}" maxlength="300" placeholder="${tr('Ton argument (facultatif)')}">`;
  const go = (on) => `<button class="btn primary" data-infsend${on ? '' : ' disabled'}>${esc(tr('Demander à {name}', { name: d.director }))}</button>`;
  if (kind === 'extend' || kind === 'leave') {
    const a = d.future[kind];
    return `<div class="ib-chance">${a.blocked ? ibOdds(a) : `<b>${pct(a.chance)}</b><span>${tr('de chances')}</span>`}</div>
      ${infWhy(a) ? `<p class="fineprint">${infWhy(a)}</p>` : ''}
      <p class="fineprint">${tr('Pas d’effet direct dans le jeu : c’est le jeu qui fait les offres. Pour partir, vois aussi {attitude} dans le dossier de carrière.', { attitude: quote(tr('Ton attitude')) })}</p>
      <div class="ib-foot">${go(!a.blocked)}</div>`;
  }
  if (kind === 'signing') {
    const chip = (i, label, title, n) => `<button type="button" class="ib-chip${(view.infPos ?? null) === i ? ' on' : ''}" data-infpos="${i ?? ''}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}${n === undefined ? '' : `<small>${n}</small>`}</button>`;
    return `${mercato}
      <div class="ib-chips" role="group" aria-label="${tr('Poste à renforcer')}">${chip(null, tr('Tous les postes'))}${INF_POS.map((l, i) => chip(i, posLabel(POS_CODES[i]), tr(l), d.depth?.[i] || 0)).join('')}</div>
      <p class="fineprint" id="inf-pos-note"></p>
      <div class="ib-send"><input class="ib-input" id="inf-search" type="search" placeholder="${tr('Nom du joueur (facultatif)')}" autocomplete="off" value="${esc(view.infQuery || '')}"><button class="btn" id="inf-search-go">${tr('Chercher')}</button></div>
      <div class="ib-send">${arg}</div>
      <div class="ib-people" id="inf-hits">${influenceHitsHtml()}</div>`;
  }
  if (kind === 'sale' && !d.saleTargets.length) return `${mercato}<p class="fineprint">${tr('Aucun club intéressé pour l’instant.')}</p>`;
  return `${kind === 'sale' ? mercato : `<p class="fineprint">${tr('Si le jeu le vend pendant le mercato, le club refusera la vente : LifeLegend te proposera de la défaire dans ta sauvegarde.')}${d.keeps.length ? ` ${esc(tr('Protégés : {list}.', { list: d.keeps.map((k) => tr('{name} (jusqu’au {d})', { name: k.name, d: infDay(k.until) })).join(', ') }))}` : ''}</p>`}
    <div class="ib-people">${d.squad.map((x) => `<button type="button" class="ib-person${view.infPick === x.id ? ' on' : ''}" data-infpick="${x.id}"${x[kind]?.blocked ? ' disabled' : ''}>
      ${ibFace(x.name)}<span class="ib-who"><b>${esc(x.name)}</b><span>${x.pos !== null && x.pos !== undefined ? `${esc(skPos(x.pos))} · ` : ''}${esc(tr('temps de jeu {p}', { p: pct(x.share) }))}</span></span>${ibOdds(x[kind])}</button>`).join('')}</div>
    ${kind === 'sale' ? `<label class="ib-field"><span class="ib-eyebrow">${tr('Club intéressé')}</span><select class="ib-input" id="inf-sale-to">${d.saleTargets.map((c) => `<option value="${c.ref}">${esc(c.name)}${c.league ? ` · ${esc(c.league)}` : ''}</option>`).join('')}</select></label>` : ''}
    <p class="fineprint" id="inf-pick-why">${view.infPick === null ? tr('Choisis un coéquipier dans la liste.') : infWhy(d.squad.find((x) => x.id === view.infPick)?.[kind])}</p>
    <div class="ib-send">${arg}${go(view.infPick !== null)}</div>`;
}
function paintInfModal() {
  if (!infBox) return;
  const d = influenceData, kind = view.infPanel;
  if (!d?.ready) { closeInfModal(); return; }
  const draft = infBox.querySelector('[data-msg]')?.value || '';
  infBox.innerHTML = `<div class="ib-modal" role="dialog" aria-modal="true" aria-labelledby="ib-modal-title" tabindex="-1">
    <button class="ib-modal-x" data-infclose aria-label="${tr('Fermer')}" title="${tr('Fermer')}">${hi('xmark')}</button>
    <span class="ib-eyebrow">${esc(tr('Demande à {name}', { name: d.director }))}</span><h2 id="ib-modal-title">${esc(tr(IB_PANELS[kind]))}</h2>
    ${infPanelBody(d, kind)}</div>`;
  const field = infBox.querySelector('[data-msg]');
  if (field) field.value = draft;
  bindInfModal(d, kind);
}

function requestLabel(r) {
  const sm = r.summary || {};
  if (r.kind === 'formation') return fmName(sm);
  if (r.kind === 'signing') return `${sm.name || '?'}${sm.from ? ` (${sm.from})` : ''}${Number.isInteger(sm.position) ? ` · ${posLabel(POS_CODES[sm.position])}` : ''}`;
  if (r.kind === 'sale') return `${sm.name || '?'}${sm.to ? ` → ${sm.to}` : ''}`;
  if (r.kind === 'keep') return sm.name || '?';
  return sm.wish === 'extend' ? tr('Une prolongation') : tr('Ton départ');
}

// Négocier avec son agent : trois questions toutes prêtes sous son mail, quand une offre attend dans le jeu. Elles
// remplissent la réponse ; elle ne part (une requête) que s'il clique sur Envoyer. L'offre du jeu ne change pas : l'agent
// répond franchement d'après son marché (src/ai/prompts.js, consigne de l'agent).
function agentQuickReplies() {
  const offer = (state.agent?.view?.offers || [])[0];
  if (!offer) return '';
  const club = offer.club || '';
  const asks = [
    tr('Pour l’offre de {club} : tu peux obtenir un meilleur salaire ?', { club }),
    tr('Pour l’offre de {club} : tu peux obtenir un contrat plus long ?', { club }),
    tr('Pour l’offre de {club} : franchement, je signe maintenant ou j’attends ?', { club }),
  ];
  const labels = [tr('Un meilleur salaire ?'), tr('Un contrat plus long ?'), tr('Je signe ou j’attends ?')];
  return `<div class="sm-quick"><span>${tr('Négocier')}</span>${asks.map((q, k) => `<button type="button" class="sm-quick-btn" data-quick="${esc(q)}">${esc(labels[k])}</button>`).join('')}</div>`;
}

// En tête d'un fil de Mails né d'une demande : ce qui a été demandé et la décision.
// Conseil du coach à l'entraînement (src/world/coachAdvice.js) : ses deux réponses, puis où il en est. C'est la sauvegarde
// qui dit s'il a changé son programme : LifeLegend ne touche pas à l'entraînement.
function adviceCard(t) {
  const a = state.coachAdvice;
  if (!t.advice || a?.id !== t.advice) return '';
  const bar = tr(TRAINING_BARS[a.area] || a.area);
  const body = a.status === 'open' && !a.choice
    ? `<p>${esc(tr('Le coach te demande de travailler ce domaine : {bar}. À toi de décider.', { bar }))}</p>
      <div class="sm-advice-btns"><button class="sm-btn sm-btn-primary" data-advice="follow">${tr('Suivre son conseil')}</button><button class="sm-btn sm-btn-ghost" data-advice="ignore">${tr('Pas cette fois')}</button></div>`
    : `<p>${esc(a.status === 'followed' ? tr('Conseil suivi : {bar} a monté dans ton programme d’entraînement.', { bar })
      : a.status === 'ignored' ? tr('Conseil pas suivi : {bar} n’a pas monté dans ton programme d’entraînement.', { bar })
        : a.choice === 'follow' ? tr('À régler dans l’écran Entraînement du jeu ({bar}) : LifeLegend le verra à la prochaine synchro.', { bar })
          : tr('Tu gardes ton programme pour l’instant.'))}</p>`;
  return `<div class="sm-msg"><div class="sm-advice">${body}</div></div>`;
}

// Mise à l'écart décidée par le club (src/world/conduct.js) : sous son mail, le bouton qui l'écrit dans la sauvegarde
// (jeu fermé), puis où elle en est.
// Dans une phrase : « jeudi 14 janvier » sans majuscule (fmtDate en met une, pour les débuts de ligne).
const cdMatch = (m) => { const [y, mo, d] = m.date.split('-').map(Number); return `${m.home} – ${m.away}, ${new Date(y, mo - 1, d).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}`; };
function conductCard(t) {
  const c = state.conduct;
  if (!t.conduct || t.conduct === 'warning' || !c) return '';
  const p = c.pending?.id === t.conduct ? c.pending : (c.history || []).find((x) => x.id === t.conduct);
  if (!p) return '';
  const matches = p.matches.map(cdMatch).join(' · ');
  const body = p.ended ? `<p>${esc(p.applied ? tr('Sanction purgée.') : tr('Sanction terminée sans avoir été écrite dans le jeu.'))}</p>`
    : p.applied ? `<p>${esc(trn(p.applied.days, 'C’est écrit : tu es indisponible {n} jour dans le jeu, le temps de la sanction.', 'C’est écrit : tu es indisponible {n} jours dans le jeu, le temps de la sanction.'))}</p><p class="sm-conduct-note">${tr('Le jeu l’affiche peut-être comme une blessure.')}</p>`
      : `<p>${esc(tr('Pour que la sanction compte dans le jeu, LifeLegend écrit dans ta sauvegarde que tu es indisponible jusqu’au lendemain du dernier match : {matches}.', { matches }))}</p>
        <p class="sm-conduct-note">${tr('Le jeu doit être fermé : sauvegarde ta partie et quitte le jeu avant de continuer. LifeLegend garde une copie de ta sauvegarde.')}</p>
        <div class="sm-advice-btns"><button class="sm-btn sm-btn-primary" data-conductapply>${tr('Appliquer dans le jeu')}</button></div>`;
  return `<div class="sm-msg"><div class="sm-advice sm-conduct">${body}</div></div>`;
}

// Le contrat d'équipementier (src/world/sponsors.js) : ses images, lues dans le jeu, et son état.
const bootFile = (f) => (f && appPaths.careersDir && state ? fileUrl(`${appPaths.careersDir}\\${state.careerId}\\boots\\${f}`) : null);
const spMoney = (n) => `${Number(n).toLocaleString(locale(), { maximumFractionDigits: 0 })} €`;
const spAll = () => { const sp = state?.sponsor; return sp ? [sp.offer, sp.deal, ...(sp.history || [])].filter(Boolean) : []; };
const spBrandOf = (person) => spAll().find((o) => o.person === person)?.brand || null;
const spLongDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
function spVisual(o) {
  const photo = bootFile(o.photo), logo = bootFile(o.logo);
  return `<div class="sp-art">${photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc(o.brand)}</span>`}</div>
    <div class="sp-band">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<b>${esc(o.brand)}</b></div>`;
}
function spTerms(o) {
  return `<div class="sp-terms"><div><small>${tr('Par saison')}</small><b>${esc(spMoney(o.fee))}</b></div><div><small>${tr('Prime par but ou passe D.')}</small><b>${esc(spMoney(o.bonus))}</b></div><div><small>${tr('Fin du contrat')}</small><b>${esc(spLongDate(o.until))}</b></div></div>`;
}
const SP_FICTION = () => `<p class="sp-fine">${tr('Offre fictive de LifeLegend : ni la marque ni le jeu n’y sont associés.')}</p>`;
function sponsorCard(t) {
  if (!t.sponsorOffer) return '';
  const sp = state.sponsor, id = t.sponsorOffer;
  const open = sp?.offer?.id === id ? sp.offer : null, deal = sp?.deal?.id === id ? sp.deal : null;
  const old = !open && !deal ? (sp?.history || []).find((h) => h.id === id) : null;
  const o = open || deal || old;
  if (!o) return '';
  const label = { declined: tr('Offre refusée'), lapsed: tr('Offre expirée'), ended: tr('Contrat terminé') };
  const foot = open
    ? `<p class="sp-until">${esc(tr('Offre valable jusqu’au {d}', { d: spLongDate(o.expires) }))}</p>
      <div class="sp-btns"><button class="sm-btn sm-btn-primary" data-sponsor="accept">${tr('Accepter')}</button>${state.agent?.name && !o.negotiated ? `<button class="sm-btn sm-btn-ghost" data-sponsor="negotiate">${esc(tr('Demander à {name} de négocier', { name: state.agent.name }))}</button>` : ''}<button class="sm-btn sm-btn-ghost" data-sponsor="decline">${tr('Refuser')}</button></div>`
    : deal ? `<span class="sm-chip sm-chip--yes">${tr('Contrat signé')}</span><p class="sp-fine">${tr('Dans le jeu, c’est à toi d’enfiler ces crampons : LifeLegend ne peut pas les changer ni vérifier que tu les portes.')}</p>`
      : `<span class="sm-chip sm-chip--closed">${esc(label[old.status] || '')}</span>`;
  return `<div class="sm-msg"><article class="sp-offer">${spVisual(o)}<div class="sp-main"><span class="sp-eyebrow">${tr('Contrat d’équipementier')}</span>${spTerms(o)}${foot}${SP_FICTION()}</div></article></div>`;
}

function requestCard(r) {
  return `<div class="agent-offer inf-request"><span class="pill">${esc(tr(INF_KIND[r.kind] || r.kind))}</span><div><b>${esc(requestLabel(r))}</b><span class="handle">${tr('Ta demande, faite depuis la page Influence')}</span></div>
    <span class="sm-chip${r.accepted ? ' sm-chip--yes' : ' sm-chip--closed'}">${r.accepted ? tr('Acceptée') : tr('Refusée')}</span></div>`;
}

function influenceHitsHtml() {
  if (!influenceHits) return '';
  if (!influenceHits.length) return `<p class="fineprint">${view.infQuery ? tr('Aucun joueur de club ne porte ce nom.') : tr('Aucun joueur à ta portée à ce poste pour l’instant.')}</p>`;
  return influenceHits.map((h) => `<div class="ib-person ib-hit">${ibFace(h.name)}<span class="ib-who"><b>${esc(h.name)}${h.role !== null && h.role !== undefined ? ` <span class="pill">${esc(posLabel(POS_CODES[h.role]))}</span>` : ''}</b><span>${esc(h.club || '?')}${h.league ? ` · ${esc(h.league)}` : ''} · ${esc(h.share === null ? tr('début de saison') : tr('temps de jeu {p}', { p: pct(h.share) }))}</span></span>
    ${ibOdds(h.assess)}<button class="btn" data-infsign="${h.id}"${h.assess.blocked ? ' disabled' : ''}>${tr('Recommander')}</button></div>`).join('');
}

// Envoie une demande : la réponse arrive dans Mails, le fil s'ouvre tout de suite.
async function sendInfluence(kind, params, msgKey, btn) {
  btn.disabled = true;
  const message = document.querySelector(`[data-msg="${msgKey}"]`)?.value || '';
  try {
    state = await live.influenceRequest(kind, params, message);
    influenceData = null;
    influenceHits = null;
    closeInfModal();
    const t = state.mail.at(-1);
    Object.assign(view, { smInfluence: false, smDossier: false, thread: t.id, mailFolder: 'all', smReading: true, infFormation: null });
    render();
    toast(tr('Réponse de {name} dans Mails.', { name: t.from }));
  } catch (err) {
    btn.disabled = false;
    toast(err.message, true);
  }
}

function bindInfluence(page) {
  const d = influenceData;
  if (!d?.ready) return;
  // L'accent du club, tiré de son écusson.
  const shirt = clubColors(state.snapshot.club.name), root = page.querySelector('.ib');
  if (shirt) root.style.setProperty('--ib-accent', fbAccent(shirt.primary));
  root.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  ibShow(page, d);
  page.querySelectorAll('[data-inftile]').forEach((t) => {
    t.onclick = () => {
      view.infFormation = view.infFormation === t.dataset.inftile || t.classList.contains('now') ? null : t.dataset.inftile;
      ibShow(page, d);
    };
  });
  const ask = page.querySelector('[data-infformation]');
  if (ask) ask.onclick = () => sendInfluence('formation', { key: ibChosen(d).key }, 'formation', ask);
  page.querySelectorAll('[data-infopen]').forEach((b) => { b.onclick = () => openInfModal(b.dataset.infopen); });
  ibPaintPlayers(page, d);
  page.querySelector('[data-infsquad]')?.addEventListener('click', () => page.querySelector('#ib-squad')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  page.querySelectorAll('[data-infline]').forEach((b) => {
    b.onclick = () => {
      view.infLine = b.dataset.infline;
      page.querySelectorAll('[data-infline]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (!ibLineList(d).some((x) => x.id === view.infPlayer)) view.infPlayer = ibLineList(d)[0]?.id ?? null;
      ibPaintPlayers(page, d);
    };
  });
  page.querySelectorAll('[data-infthread]').forEach((b) => {
    b.onclick = () => { Object.assign(view, { smInfluence: false, thread: b.dataset.infthread, mailFolder: 'all', smReading: true }); render(); };
  });
  page.querySelectorAll('[data-infapply]').forEach((b) => {
    b.onclick = async () => {
      const e = d.effects.find((x) => x.id === b.dataset.infapply);
      const ok = await kConfirm({
        title: tr('Écrire cette décision dans ta sauvegarde ?'),
        body: `${effectLabel(e)}\n\n${e.kind === 'formation' ? '' : `${tr('Le transfert est encore expérimental : il n’a pas été vérifié dans Football Life 2027.')}\n\n`}${tr('Le jeu doit être fermé : sauvegarde ta partie et quitte le jeu avant de continuer. LifeLegend garde une copie de ta sauvegarde.')}`,
        ok: tr('Écrire dans ma sauvegarde'),
      });
      if (!ok) return;
      b.disabled = true;
      try {
        const r = await live.influenceApply(e.id);
        state = r.state;
        influenceData = null;
        render();
        toast(r.result.kind === 'formation' ? tr('C’est écrit : lance le jeu, le plan de jeu de {club} a changé.', { club: state.snapshot.club.name })
          : tr('C’est écrit : lance le jeu, {name} a changé de club.', { name: r.result.name }));
      } catch (err) { b.disabled = false; toast(err.message, true); }
    };
  });
  paintInfModal();
}

function bindInfModal(d, kind) {
  const box = infBox;
  const widths = () => box.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  widths();
  box.querySelector('[data-infclose]').onclick = closeInfModal;
  const send = box.querySelector('[data-infsend]');
  box.querySelectorAll('[data-infpick]').forEach((b) => {
    b.onclick = () => {
      view.infPick = Number(b.dataset.infpick);
      box.querySelectorAll('[data-infpick]').forEach((x) => x.classList.toggle('on', x === b));
      box.querySelector('#inf-pick-why').innerHTML = infWhy(d.squad.find((x) => x.id === view.infPick)?.[kind]);
      send.disabled = false;
    };
  });
  if (send) {
    send.onclick = () => {
      if (kind === 'sale') sendInfluence('sale', { playerId: view.infPick, toRef: Number(box.querySelector('#inf-sale-to').value) }, 'sale', send);
      else if (kind === 'keep') sendInfluence('keep', { playerId: view.infPick }, 'keep', send);
      else sendInfluence('future', { wish: kind }, null, send);
    };
  }
  const search = box.querySelector('#inf-search');
  if (!search) return;
  // Recrue : un poste (le club dit combien il en a), un nom, ou les deux.
  const hits = box.querySelector('#inf-hits');
  const bindHits = () => {
    widths();
    hits.querySelectorAll('[data-infsign]').forEach((b) => { b.onclick = () => sendInfluence('signing', { playerId: Number(b.dataset.infsign), ...(Number.isInteger(view.infPos) ? { pos: view.infPos } : {}) }, 'signing', b); });
  };
  const showDepth = () => {
    const p = view.infPos ?? null;
    box.querySelector('#inf-pos-note').textContent = p === null ? tr('Choisis un poste pour voir des joueurs à ta portée, ou cherche un nom.')
      : trn(d.depth?.[p] || 0, 'Ton club compte {n} joueur à ce poste.', 'Ton club compte {n} joueurs à ce poste.');
  };
  let asked = 0;
  const runSearch = async () => {
    const q = search.value.trim(), me = ++asked;
    view.infQuery = q;
    if (q.length < 2 && (view.infPos ?? null) === null) { influenceHits = null; hits.innerHTML = ''; return; }
    let found;
    try { found = await live.influenceSearch(q, view.infPos ?? null); } catch (err) { toast(err.message, true); return; }
    if (me !== asked || infBox !== box) return;
    influenceHits = found;
    hits.innerHTML = influenceHitsHtml();
    bindHits();
  };
  search.onkeydown = (ev) => { if (ev.key === 'Enter') runSearch(); };
  box.querySelector('#inf-search-go').onclick = runSearch;
  box.querySelectorAll('[data-infpos]').forEach((b) => {
    b.onclick = () => {
      view.infPos = b.dataset.infpos === '' ? null : Number(b.dataset.infpos);
      box.querySelectorAll('[data-infpos]').forEach((x) => x.classList.toggle('on', x === b));
      showDepth();
      runSearch();
    };
  });
  showDepth();
  bindHits();
}

// La vue se recalcule quand la carrière a bougé (synchro, demande, décision écrite).
function influenceFresh() {
  const inf = state.influence || {};
  const stamp = `${state.snapshot.gameDate}|${state.mail.length}|${(inf.effects || []).map((e) => e.status).join()}|${inf.computedOn || ''}`;
  if (influenceData && stamp === influenceStamp) return true;
  if (influenceLoading) return false;
  influenceLoading = true;
  live.influence().then((d) => { influenceData = d || { ready: false }; influenceStamp = stamp; }, (err) => { influenceData = { ready: false }; toast(err.message, true); })
    .finally(() => { influenceLoading = false; render(); });
  return false;
}

// Mails : mise en page reprise du modèle « SmartMail » (© 2021 Mienard Lumaad / ThemePixels, licence MIT) :
// colonne des boîtes, liste des messages en cartes, lecture à droite. Icônes Heroicons v2 (contour, © Tailwind Labs, licence MIT).
const RI = {
  inbox: ["M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"], // inbox
  unread: ["M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"], // envelope
  agent: ["M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"], // briefcase
  club: ["M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"], // user-group
  press: ["M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z"], // newspaper
  close: ["M6 18 18 6M6 6l12 12"], // x-mark
  sponsor: ["M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46"], // megaphone
  dossier: ["M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"], // folder
  search: ["m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"], // magnifying-glass
  menu: ["M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"], // bars-3
  back: ["M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"], // arrow-left
  reply: ["M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"], // arrow-uturn-left
  send: ["M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"], // paper-airplane
  prev: ["M15.75 19.5 8.25 12l7.5-7.5"], // chevron-left
  next: ["m8.25 4.5 7.5 7.5-7.5 7.5"], // chevron-right
  empty: ["M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z"], // envelope-open
};
const ri = (k) => `<svg class="ri" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${RI[k].map((d) => `<path stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`).join('')}</svg>`;
const MAIL_FOLDERS = [
  ['all', 'Réception', () => true, 'inbox'],
  ['unread', 'Non lus', (t) => t.unread, 'unread'],
  ['agent', 'Agent', (t) => t.role === 'agent', 'agent'],
  ['club', 'Club et staff', (t) => t.role === 'coach' || t.role === 'club', 'club'],
  ['press', 'Presse', (t) => t.role === 'journalist' || t.role === 'newsletter', 'press'],
  ['close', 'Proches', (t) => t.role === 'family' || t.role === 'friend', 'close'],
  ['sponsor', 'Sponsors', (t) => t.role === 'sponsor' || Boolean(t.sponsorOffer), 'sponsor'],
];
const MAIL_AVATAR = { coach: 'club', club: 'club', journalist: 'journalist', agent: 'agent', family: 'fan', friend: 'fan', sponsor: 'betting' };
// Pastilles du modèle (initiale sur fond de couleur), par rôle de l'expéditeur.
const SM_TINT = { agent: 'indigo', journalist: 'blue', family: 'green', friend: 'green', sponsor: 'yellow', coach: 'blue', club: 'blue', newsletter: 'red' };
const snippet = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);

// Club et journal local d'un fil à la date de son premier message : après un transfert, le staff et la presse de
// l'ancien club gardent leur club (écusson, adresse). Le club est noté sur les fils récents, sinon on le retrouve par
// le journal de l'édition du jour (journal → club suivi → nom du club dans les saisons archivées).
function threadEra(t) {
  const day = t?.messages?.[0]?.gameDate || '';
  let ei = -1;
  (state.editions || []).forEach((e, i) => { if (e.gameDate <= day) ei = i; });
  const paper = ei >= 0 ? localPaperOf(ei) : state.localPaper;
  const ref = [state.localPaper, ...(state.pastPapers || [])].find((p) => p?.name === paper?.name)?.clubRef;
  const season = ref && Object.entries(state.seasons || {}).find(([k]) => k.endsWith(`|${ref}`));
  return { club: t?.club || season?.[1]?.club || state.snapshot.club.name, paper: paper?.name || state.localPaper?.name };
}

// Adresse fictive d'un expéditeur : prenom.nom@organisation.foot.
const mailSlug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function mailAddress(name, role, era = threadEra(null)) {
  if (role === 'newsletter') return 'brief@latransversale.foot'; // le brief du matin de La Transversale
  const local = String(name || 'contact').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  const w = state.writers || {};
  const national = name === w.national_columnist || (w.national_desk || []).some((x) => x.name === name);
  const org = role === 'agent' ? state.agent?.agency
    : role === 'coach' || role === 'club' ? era.club
      : role === 'journalist' ? (national ? 'La Transversale' : era.paper || 'presse')
        : role === 'sponsor' ? spBrandOf(name) || name : 'mails';
  return `${local}@${mailSlug(org) || 'mails'}.foot`;
}

// Pastille d'un expéditeur : le visage de l'entraîneur, l'écusson du club (celui de l'époque) pour le club, sinon son initiale en couleur.
function smAvatar(name, role, era = threadEra(null)) {
  const crest = (role === 'club' || role === 'coach') && teamEmblem(era.club);
  if (role === 'coach') return `<div class="sm-avatar sm-avatar--coach">${coachFaceIn(name, crest ? `<img class="sm-av-crest" src="${esc(crest)}" alt="">` : `<span class="${SM_TINT.coach}">${esc(String(name || '?').trim()[0] || '?')}</span>`)}</div>`;
  if (crest) return `<div class="sm-avatar sm-avatar--crest"><img src="${esc(crest)}" alt=""></div>`;
  const initial = `<span class="${SM_TINT[role] || 'blue'}">${esc(String(name || '?').trim()[0] || '?')}</span>`;
  return `<div class="sm-avatar">${isKnownPlayer(name) ? faceIn(name, initial) : initial}</div>`;
}
function smMe() {
  const me = state.profile?.displayName || state.snapshot.player.name;
  return `<div class="sm-avatar">${myFaceIn(`<span class="me">${esc(me.trim()[0] || 'm')}</span>`)}</div>`;
}
// « (il y a 3 jours) » d'après la date du jeu.
function smAgo(iso) {
  const days = Math.round((Date.parse(`${state.snapshot.gameDate}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 864e5);
  return days <= 0 ? tr('aujourd’hui') : days === 1 ? tr('hier') : tr('il y a {n} jours', { n: days });
}

// Le match d'un fil : le premier qui suit son dernier message. Au-delà de 60 jours (intersaison, ancien club), aucun.
function mailGameOf(t) {
  const s = state.snapshot, d = t.messages.at(-1)?.gameDate || '';
  const g = s.fixtures.filter((f) => f.played || f.date >= s.gameDate).sort((a, b) => a.date.localeCompare(b.date)).find((f) => f.date >= d);
  return g && sfDays(d, g.date) <= 60 ? g : null;
}
// Le score d'un match : en coupe, celui de la sauvegarde peut être faux après une prolongation, on ne l'affiche pas.
const mailScore = (g) => (!g.played ? (g.hour != null ? hh(g.hour) : 'vs') : g.competition === state.snapshot.league.name ? `${g.score[0]} - ${g.score[1]}` : tr('Fin'));
const mailMatchTitle = (g) => (g.played && g.competition === state.snapshot.league.name ? `${g.home} ${mailScore(g)} ${g.away}` : `${g.home} – ${g.away}`);
const mailMatchKey = (g) => esc(`${g.date}|${g.homeRef}|${g.awayRef}`);
function mailBand(g) {
  return `<li class="sm-band${g.played ? '' : ' next'}" role="link" tabindex="0" data-smmatch="${mailMatchKey(g)}" title="${tr('Voir le match')}"><span><b>${g.played ? tr('Avant ce match') : tr('Prochain match')}</b><small>${esc(gzShort(g.competition))} · ${esc(shortDate(g.date))}</small></span>
    <span class="sm-band-m">${crestHtml(g.home, ' sc-crest s22')}<strong>${esc(mailScore(g))}</strong>${crestHtml(g.away, ' sc-crest s22')}</span></li>`;
}
function smPaintColors() {
  const root = document.documentElement, c = state?.snapshot && clubColors(state.snapshot.club.name);
  if (!c) return;
  const v = parseInt(c.primary.slice(1), 16), lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  root.style.setProperty('--m-c', c.primary);
  root.style.setProperty('--m-on', fbInk(c.primary));
  // Un écusson très clair : l'accent se fonce pour rester lisible sur le blanc.
  root.style.setProperty('--m-tx', lum > 0.55 ? `color-mix(in srgb, ${c.primary} 55%, #000)` : c.primary);
  root.style.setProperty('--m-tx-dark', accentOnDark(c.primary));
}

function renderMail(page) {
  if (!state) { page.innerHTML = needSync(); return; }
  const all = [...state.mail].reverse();
  const folders = MAIL_FOLDERS.filter(([k, , f]) => k === 'all' || k === 'unread' || all.some(f));
  if (!folders.some(([k]) => k === view.mailFolder)) view.mailFolder = 'all';
  const folder = MAIL_FOLDERS.find(([k]) => k === view.mailFolder);
  const q = plainText(view.mailQuery || '').trim();
  const found = (t) => !q || plainText(`${t.from} ${t.subject} ${t.messages.map((m) => m.body).join(' ')}`).includes(q);
  // « Non lus » garde affiché le message qu'on vient d'ouvrir, sinon il disparaîtrait de la liste.
  const threads = all.filter((t) => (folder[2](t) || (view.mailFolder === 'unread' && t.id === view.thread)) && found(t));
  // Comme une messagerie : le message le plus récent du dossier s'ouvre tout seul (et compte comme lu).
  if (!view.smDossier && !view.smInfluence && !threads.some((t) => t.id === view.thread) && threads.length) {
    view.thread = threads[0].id;
    if (threads[0].unread) live.readMail(view.thread).then((s) => { state = s; render(); }).catch(() => {});
  }
  const open = view.smDossier || view.smInfluence ? null : threads.find((t) => t.id === view.thread) || null;
  const me = state.profile?.displayName || state.snapshot.player.name;
  const myAddress = `${mailSlug(state.profile?.handle || me)}@mails.foot`;
  const hasDossier = Boolean(state.agent?.view);
  const offers = (state.agent?.view?.offers || []).length;
  const readyEffects = (state.influence?.effects || []).filter((e) => e.status === 'ready').length;
  const label = open ? (ROLE_LABEL[open.role] ? tr(ROLE_LABEL[open.role]) : open.role || '') : '';
  const openEra = open && threadEra(open);
  // Fil avec le staff ou la presse locale d'un club qu'il a quitté (le moteur le dit aussi à l'IA quand il répond).
  const w = state.writers || {};
  const nationalPress = open && (open.from === w.national_columnist || (w.national_desk || []).some((x) => x.name === open.from));
  const formerClub = open && ['coach', 'club', 'journalist'].includes(open.role) && !nationalPress && openEra.club !== state.snapshot.club.name ? openEra.club : null;

  const msgHtml = (m, i) => {
    const mine = m.who === 'me';
    const name = mine ? me : open.from;
    return `<div class="sm-msg">
      <div class="sm-msg-header">${mine ? smMe() : smAvatar(open.from, open.role, openEra)}
        <div class="sm-msg-sender"><h6>${esc(name)}</h6><p>${esc(tr('De : {who}', { who: mine ? myAddress : mailAddress(open.from, open.role, openEra) }))}<i></i>${esc(tr('à : {who}', { who: mine ? open.from : tr('moi') }))}</p></div>
        <div class="sm-msg-time">${esc(fmtDate(m.gameDate, { day: 'numeric', month: 'short', year: 'numeric' }))}<span>${esc(smAgo(m.gameDate))}</span></div></div>
      ${i === 0 ? `<h4 class="sm-title">${esc(open.subject)}</h4>` : ''}
      <div class="sm-msg-body${mine ? ' sm-msg-body--me' : ''}">${paras(m.body)}</div></div>`;
  };
  // Le match lié au fil, comme une pièce jointe : un clic ouvre sa page dans Scoreline.
  const openGame = open && mailGameOf(open);
  const attach = openGame ? `<div class="sm-attach"><p><span>${openGame.played ? tr('Match suivant') : tr('Prochain match')}</span><a data-smmatch="${mailMatchKey(openGame)}">${tr('Voir le match')}</a></p>
    <a class="sm-attach-card" data-smmatch="${mailMatchKey(openGame)}">${crestHtml(openGame.home, ' sc-crest s28')}<span><b>${esc(mailMatchTitle(openGame))}</b><small>${esc(gzShort(openGame.competition))} · ${esc(fmtDate(openGame.date, { day: 'numeric', month: 'long' }))}${!openGame.played && openGame.hour != null ? ` · ${esc(hh(openGame.hour))}` : ''}</small></span>${crestHtml(openGame.away, ' sc-crest s28')}</a></div>` : '';
  const pos = open ? threads.indexOf(open) : -1;
  const step = (k, icon, label) => { const t = threads[pos + k]; return `<a class="sm-tool${t ? '' : ' off'}"${t ? ` data-smgo="${esc(t.id)}"` : ''} title="${label}" aria-label="${label}">${ri(icon)}</a>`; };
  if (view.smInfluence) influenceFresh();
  const content = view.smInfluence ? `
      <div class="sm-subject"><nav class="sm-tools"><a class="sm-tool sm-back" data-smback title="${tr('Retour')}">${ri('back')}</a></nav><h4>${tr('Influence')}</h4></div>
      ${influencePage()}`
    : view.smDossier && hasDossier ? dossierPage()
    : open ? `
      <div class="sm-bar"><a class="sm-tool sm-back" data-smback title="${tr('Retour')}">${ri('back')}</a>
        <div class="sm-pager">${step(-1, 'prev', tr('Message précédent'))}<span>${esc(tr('{a} sur {n}', { a: pos + 1, n: threads.length }))}</span>${step(1, 'next', tr('Message suivant'))}</div>
        <div class="sm-chips">${label ? `<span class="sm-chip">${esc(label)}</span>` : ''}${formerClub ? `<span class="sm-chip sm-chip--former">${tr('Ancien club')} · ${esc(formerClub)}</span>` : ''}${open.closed && open.role !== 'newsletter' ? `<span class="sm-chip sm-chip--closed">${tr('Conversation close')}</span>` : ''}</div></div>
      <div class="sm-thread">${open.request ? requestCard(open.request) : ''}${open.messages.map(msgHtml).join('')}${open.sponsorOffer ? sponsorCard(open) : attach}${adviceCard(open)}${conductCard(open)}
        ${open.closed ? `<p class="sm-closed">${open.role === 'newsletter' ? tr('Envoyé automatiquement par La Transversale : on ne peut pas répondre à ce brief. Pour l’arrêter, {link} en bas de la une.', { link: quote(tr('Se désabonner')) }) : esc(tr('{name} ne répond plus à tes messages.', { name: open.from }))}</p>` : `
        <div class="sm-msg sm-reply"><div class="sm-msg-body"><label class="sm-reply-label" for="mail-reply">${ri('reply')} ${esc(tr('Répondre à {name}', { name: open.from }))}</label>
          ${open.role === 'agent' ? agentQuickReplies() : ''}<textarea id="mail-reply" placeholder="${tr('Écris ta réponse…')}">${esc(drafts.mail[open.id] || '')}</textarea></div>
          <div class="sm-footer"><button class="sm-btn sm-btn-primary" id="mail-send">${ri('send')} ${tr('Envoyer')}</button></div></div>`}
      </div>`
      : `<div class="sm-placeholder">${ri('empty')}<h5>${threads.length ? tr('Aucun message sélectionné') : tr('Aucun message ici')}</h5></div>`;

  // La liste : chaque fil sous le match qui l'a suivi, le plus récent en haut ; le prochain match toujours visible.
  const rowHtml = (t) => {
    const last = t.messages.at(-1);
    return `<li class="sm-item${t.unread ? ' unread' : ''}${open?.id === t.id ? ' active' : ''}" data-id="${esc(t.id)}"><i class="sm-dot"></i>
      <div class="sm-item-body"><div class="sm-item-top"><h6 class="sm-subject-line">${esc(t.subject)}</h6><span class="sm-time">${esc(shortDate(last?.gameDate))}</span></div>
        <div class="sm-item-from">${smAvatar(t.from, t.role, threadEra(t))}<span class="sm-sender">${esc(t.from)}</span>${t.messages.length > 1 ? `<em>${t.messages.length}</em>` : ''}${t.messages.some((m) => m.who === 'me') ? ri('reply') : ''}</div>
        <p class="sm-text">${last?.who === 'me' ? `${tr('Moi')}${colon()} ` : ''}${esc(snippet(last?.body))}</p></div></li>`;
  };
  let listHtml = '';
  if (view.mailGroup === 'date') listHtml = threads.map(rowHtml).join('');
  else {
    const groups = new Map();
    const add = (key, g) => { if (!groups.has(key)) groups.set(key, { g, list: [] }); return groups.get(key); };
    for (const t of threads) { const g = mailGameOf(t); add(g ? g.date : 'older', g).list.push(t); }
    const next = state.snapshot.next;
    if (next && !q && view.mailFolder === 'all') add(next.date, next);
    const order = [...groups.entries()].sort(([a], [b]) => (a === 'older' ? 1 : b === 'older' ? -1 : b.localeCompare(a)));
    listHtml = threads.length || groups.size ? order.map(([, { g, list }]) => `${g ? mailBand(g) : `<li class="sm-band older"><span><b>${tr('Plus tôt')}</b></span></li>`}${list.map(rowHtml).join('')}`).join('') : '';
  }
  page.innerHTML = `<div class="sm sm-light${view.smInfluence || view.smDossier ? ' sm-wide' : ''}${view.smInfluence ? ' sm-inf' : ''}${view.smDossier && hasDossier ? ' sm-dc' : ''}${view.smReading ? ' sm-reading' : ''}${view.smSidebar ? ' sm-sidebar-show' : ''}${view.smSideHidden && !view.smInfluence && !view.smDossier ? ' sm-sidebar-hide' : ''}">
    <aside class="sm-sidebar">
      <div class="sm-sidebar-header"><a class="sm-logo ll-wordmark" data-folder="all"><strong>Mails</strong></a></div>
      <div class="sm-account">${smMe()}<span><b>${esc(me)}</b><small>${esc(myAddress)}</small></span></div>
      <div class="sm-sidebar-body">
        <label class="sm-label">${tr('Boîtes')}</label>
        <nav class="sm-nav">${folders.map(([k, name, f, icon]) => {
          const n = all.filter(f).filter((t) => t.unread).length;
          return `<a class="sm-navlink${view.mailFolder === k && !view.smDossier && !view.smInfluence ? ' active' : ''}" data-folder="${k}">${ri(icon)}<span>${tr(name)}</span>${n ? `<small>${n}</small>` : ''}${k !== 'unread' ? `<em>${all.filter(f).length}</em>` : ''}</a>`;
        }).join('')}</nav>
        ${hasDossier ? `<label class="sm-label">${tr('Carrière')}</label>
        <nav class="sm-nav"><a class="sm-navlink${view.smDossier ? ' active' : ''}" data-smdossier>${ri('dossier')}<span>${tr('Dossier de carrière')}</span>${offers ? `<small>${offers}</small>` : ''}</a>
          <a class="sm-navlink${view.smInfluence ? ' active' : ''}" data-sminfluence>${ri('club')}<span>${tr('Influence')}</span>${readyEffects ? `<small>${readyEffects}</small>` : ''}</a></nav>` : ''}
      </div>
    </aside>
    <section class="sm-mailbox">
      <div class="sm-listhead"><a class="sm-menu" data-smmenu title="${tr('Boîtes')}">${ri('menu')}</a><div><h4>${esc(tr(folder[1]))}</h4><small>${esc(trn(threads.length, '{n} message', '{n} messages'))} · ${esc(trn(threads.filter((t) => t.unread).length, '{n} non lu', '{n} non lus'))}</small></div></div>
      <div class="sm-mailbox-header"><label class="sm-search">${ri('search')}<input type="search" id="bm-search" placeholder="${tr('Rechercher un message')}" autocomplete="off" value="${esc(view.mailQuery || '')}"></label>
        <select class="sm-select" id="bm-group" aria-label="${tr('Ranger')}"><option value="match">${tr('Par match')}</option><option value="date"${view.mailGroup === 'date' ? ' selected' : ''}>${tr('Par date')}</option></select></div>
      ${q ? `<div class="sm-option"><span>${trn(threads.length, '{n} résultat pour {q}', '{n} résultats pour {q}', { q: quote(esc(view.mailQuery)) })}</span><button class="sm-clear" id="bm-clear">${tr('Effacer')}</button></div>` : ''}
      <ul class="sm-group">${listHtml || `<li class="sm-none">${q ? tr('Aucun message ne correspond à ta recherche.') : view.mailFolder === 'unread' ? tr('Tout est lu.') : view.mailFolder === 'all' ? tr('Le courrier arrive avec les éditions, à partir de la deuxième synchro.') : tr('Aucun message ici pour l’instant.')}</li>`}</ul>
    </section>
    <main class="sm-content">${content}</main>
    <div class="sm-backdrop" data-smmenu></div>
  </div>`;

  if (view.smDossier) bindDossier(page);
  const root = page.querySelector('.sm');
  smPaintColors();
  // La liste se redessine à chaque message ouvert : elle reste où elle était.
  const listBox = page.querySelector('.sm-group');
  listBox.scrollTop = view.smListY || 0;
  listBox.onscroll = () => { view.smListY = listBox.scrollTop; };
  if (view.smReveal) { view.smReveal = false; listBox.querySelector('.sm-item.active')?.scrollIntoView({ block: 'nearest' }); }
  const group = $('#bm-group');
  group.onchange = () => { view.mailGroup = group.value; view.smListY = 0; render(); };
  page.querySelectorAll('[data-smgo]').forEach((b) => { b.onclick = async () => { view.thread = b.dataset.smgo; view.smReveal = true; state = await live.readMail(view.thread); render(); page.querySelector('.sm-content').scrollTop = 0; }; });
  // Un match : il s'ouvre dans Scoreline, dès que ses scores sont chargés.
  page.querySelectorAll('[data-smmatch]').forEach((b) => {
    const openIt = () => { view.skMatchKey = b.dataset.smmatch; go('stats'); };
    b.onclick = openIt;
    b.onkeydown = (ev) => { if (ev.key === 'Enter') openIt(); };
  });
  // Comme le modèle : sur petit écran le menu fait glisser la barre des boîtes, sur grand écran il la replie.
  page.querySelectorAll('[data-smmenu]').forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('sm-backdrop')) view.smSidebar = false;
      else if (innerWidth < 768) view.smSidebar = !view.smSidebar;
      else view.smSideHidden = !view.smSideHidden;
      root.classList.toggle('sm-sidebar-show', Boolean(view.smSidebar));
      root.classList.toggle('sm-sidebar-hide', Boolean(view.smSideHidden));
    };
  });
  page.querySelectorAll('[data-smback]').forEach((b) => { b.onclick = () => { view.smReading = false; view.smDossier = false; view.smInfluence = false; render(); }; });
  const dossierLink = page.querySelector('[data-smdossier]');
  if (dossierLink) dossierLink.onclick = () => { view.smDossier = true; view.smInfluence = false; view.smReading = true; view.smSidebar = false; view.dsY = 0; view.dcRow = null; render(); };
  const influenceLink = page.querySelector('[data-sminfluence]');
  if (influenceLink) influenceLink.onclick = () => { view.smInfluence = true; view.smDossier = false; view.smReading = true; view.smSidebar = false; render(); };
  if (view.smInfluence) bindInfluence(page);
  const search = $('#bm-search');
  const runSearch = (value) => { view.mailQuery = value.trim(); view.thread = null; view.smDossier = false; view.smInfluence = false; render(); };
  search.onkeydown = (ev) => { if (ev.key === 'Enter') runSearch(search.value); if (ev.key === 'Escape') runSearch(''); };
  search.addEventListener('search', () => { if (!search.value) runSearch(''); });
  const clear = $('#bm-clear');
  if (clear) clear.onclick = () => runSearch('');
  page.querySelectorAll('[data-folder]').forEach((b) => {
    b.onclick = () => { view.mailFolder = b.dataset.folder; view.thread = null; view.smListY = 0; view.smDossier = false; view.smInfluence = false; view.smReading = false; view.smSidebar = false; render(); };
  });
  page.querySelectorAll('.sm-item').forEach((b) => {
    b.onclick = async () => {
      view.thread = b.dataset.id;
      view.smDossier = false;
      view.smInfluence = false;
      view.smReading = true;
      state = await live.readMail(view.thread);
      render();
    };
  });
  page.querySelectorAll('[data-sponsor]').forEach((b) => {
    b.onclick = async () => {
      const choice = b.dataset.sponsor;
      page.querySelectorAll('[data-sponsor]').forEach((x) => { x.disabled = true; });
      try {
        state = await live.answerSponsor(choice);
        render();
        if (choice === 'accept') toast(tr('Contrat signé avec {brand}.', { brand: state.sponsor.deal.brand }));
      } catch (err) { render(); toast(err.message, true); }
    };
  });
  page.querySelectorAll('[data-dsthread]').forEach((b) => {
    b.onclick = () => { Object.assign(view, { smDossier: false, smInfluence: false, thread: b.dataset.dsthread, mailFolder: 'all', smReading: true }); render(); };
  });
  page.querySelectorAll('[data-conductapply]').forEach((b) => {
    b.onclick = async () => {
      const ok = await kConfirm({
        title: tr('Écrire ta mise à l’écart dans ta sauvegarde ?'),
        body: tr('Le jeu doit être fermé : sauvegarde ta partie et quitte le jeu avant de continuer. LifeLegend garde une copie de ta sauvegarde.'),
        ok: tr('Écrire dans ma sauvegarde'),
      });
      if (!ok) return;
      b.disabled = true;
      try {
        const r = await live.conductApply();
        state = r.state;
        render();
        toast(tr('C’est écrit : lance le jeu, tu ne seras pas retenu pour ce ou ces matchs.'));
      } catch (err) { b.disabled = false; toast(err.message, true); }
    };
  });
  page.querySelectorAll('[data-advice]').forEach((b) => {
    b.onclick = async () => {
      try { state = await live.answerCoachAdvice(b.dataset.advice); render(); } catch (err) { toast(err.message, true); }
    };
  });
  const send = $('#mail-send');
  if (send) {
    $('#mail-reply').oninput = (ev) => { drafts.mail[open.id] = ev.target.value; };
    // Une réponse rapide remplit le message (rien ne part tant qu'il n'a pas cliqué sur Envoyer).
    page.querySelectorAll('[data-quick]').forEach((b) => { b.onclick = () => { const ta = $('#mail-reply'); ta.value = b.dataset.quick; drafts.mail[open.id] = ta.value; ta.focus(); }; });
    send.onclick = async () => {
      const text = $('#mail-reply').value.trim();
      if (!text) return;
      send.disabled = true; send.lastChild.textContent = ` ${tr('Envoi…')}`;
      // Envoyé : le brouillon se vide (il restait affiché sous la réponse) ; en cas d'échec, il reste pour réessayer.
      try { state = await live.replyMail(open.id, text); delete drafts.mail[open.id]; } catch (err) { state = await live.getState(); toast(err.message, true); }
      render();
    };
  }
}

// Logo d'une compétition d'après son nom (fiches lues dans le jeu).
const compEmblem = (name) => emblemUrl(Object.values(state.clubPages || {}).find((p) => p.kind === 'competition' && p.name === name)?.emblem);
const fmtRating = (r) => (Number.isFinite(r) ? r.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—');

const monthYear = (ym) => { if (!ym) return '—'; const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); };

// Parcours (lu dans la sauvegarde) et saisons archivées par LifeLegend.
function careerCard(s) {
  const h = s.player.history;
  const seasons = Object.values(state.seasons || {}).sort((a, b) => String(a.season).localeCompare(String(b.season)));
  const debut = (kind) => h?.debuts?.find((d) => d.kind === kind);
  const debutLine = (d) => (d ? `${esc(monthYear(d.date))} · ${esc(d.team)} – ${esc(d.opponent)} (${esc(d.competition || '')})` : '—');
  return `<section class="card"><h3>${tr('Carrière')}</h3>
    ${h ? `<div class="career-path">
      <div class="row"><span>${tr('Premier club')}</span><b>${esc(h.firstClub || '—')}</b></div>
      ${h.previousClub ? `<div class="row"><span>${tr('Club précédent')}</span><b>${esc(h.previousClub)}</b></div>` : ''}
      <div class="row"><span>${esc(tr('Arrivée à {club}', { club: s.club.name }))}</span><b>${h.joinedClub ? esc(fmtDate(h.joinedClub, { day: 'numeric', month: 'long', year: 'numeric' })) : '—'}</b></div>
      <div class="row"><span>${tr('Débuts en club')}</span><b>${debutLine(debut('club'))}</b></div>
      <div class="row"><span>${tr('Débuts en sélection')}</span><b>${debutLine(debut('national_team'))}</b></div>
    </div>` : ''}
    ${seasons.length ? `<table class="data"><thead><tr>${['Saison', 'Club', 'Clas.', 'MJ', 'B', 'PD', 'Note', 'Trophées'].map((x) => `<th>${tr(x)}</th>`).join('')}</tr></thead><tbody>
      ${seasons.map((x) => `<tr><td>${esc(x.season)}${!x.complete && x.club === s.club.name ? ` <span class="pill">${tr('EN COURS')}</span>` : ''}</td><td>${esc(x.club)}</td><td class="num">${ordinal(x.position)}</td><td class="num">${x.stats.apps}</td><td class="num">${x.stats.goals}</td><td class="num">${x.stats.assists}</td><td class="num">${ratingChip(x.stats.avgRating)}</td><td>${x.trophies.map((t) => `🏆 ${esc(t.competition)}`).join('<br>') || '—'}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <p class="fineprint">${tr('Les saisons sont archivées par LifeLegend à chaque synchro, à partir de ta première synchro (la sauvegarde ne garde que la saison en cours).')}</p>
  </section>`;
}

// Fiche du joueur telle que le jeu la garde (notes sur 99), avec la progression vue par LifeLegend.
// Noms des capacités (mêmes libellés que src/save/playerProfile.js).
const ABILITY_LABELS = { offensiveAwareness: 'Instinct offensif', ballControl: 'Contrôle de balle', dribbling: 'Dribble', tightPossession: 'Tenue de balle', lowPass: 'Passe à terre', loftedPass: 'Passe lobée', finishing: 'Finition', heading: 'Jeu de tête', placeKicking: 'Coups de pied arrêtés', curl: 'Effet', speed: 'Vitesse', acceleration: 'Accélération', kickingPower: 'Puissance de frappe', jump: 'Détente', physicalContact: 'Contact physique', balance: 'Équilibre', stamina: 'Endurance', defensiveAwareness: 'Instinct défensif', ballWinning: 'Récupération du ballon', aggression: 'Agressivité', gkAwareness: 'Vigilance (gardien)', gkCatching: 'Arrêt du gardien', gkClearing: 'Dégagement du gardien', gkReflexes: 'Réflexes du gardien', gkReach: 'Portée du gardien' };
const POS_CODES = ['GB', 'DC', 'DG', 'DD', 'MDC', 'MC', 'MG', 'MD', 'MOC', 'AG', 'AD', 'SA', 'AC'];
const POS_BY_LANG = {
  en: ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'],
  es: ['PT', 'DEC', 'LI', 'LD', 'MCD', 'MC', 'MI', 'MD', 'MO', 'EI', 'ED', 'SD', 'DC'],
  it: ['PT', 'DC', 'TS', 'TD', 'MED', 'CC', 'ES', 'ED', 'TRQ', 'AS', 'AD', 'SP', 'P'],
  pt: ['GO', 'ZC', 'LE', 'LD', 'VOL', 'MC', 'ME', 'MD', 'MAT', 'PE', 'PD', 'SA', 'CA'],
  de: ['TW', 'IV', 'LV', 'RV', 'DM', 'ZM', 'LM', 'RM', 'OM', 'LF', 'RF', 'HS', 'MS'],
};
const posLabel = (code) => { const i = POS_CODES.indexOf(code); return i >= 0 && POS_BY_LANG[lang()] ? POS_BY_LANG[lang()][i] : code; };
const ARROW_ICON = { 'Très mauvaise': '⬇', Mauvaise: '↘', Normale: '➡', Bonne: '↗', Excellente: '⬆' };
const millions = (n) => (n >= 1e6 ? tr('{n} M€', { n: (n / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 }) }) : tr('{n} k€', { n: Math.round(n / 1e3).toLocaleString(locale()) }));

function profileCard(s) {
  const p = s.player.profile;
  if (!p) return '';
  const gained = {};
  for (const x of state.progressLog || []) gained[x.ability] = (gained[x.ability] || 0) + (x.to - x.from);
  const keeper = p.position === 'GB';
  const entries = Object.entries(p.abilities).filter(([k]) => keeper === k.startsWith('gk'));
  const label = (k) => ABILITY_LABELS[k] || k;
  // Valeurs lues dans la sauvegarde (libellés français du moteur) : traduites à l'affichage.
  const facts = [
    ['Âge', esc(trn(p.age, '{n} an', '{n} ans'))], ['Taille / poids', esc(`${p.height} cm · ${p.weight} kg`)], ['Poste', esc(posLabel(p.position) || '—')], ['Pied fort', esc(tr(p.strongFoot))],
    ['Style de jeu', esc(p.playingStyle ? tr(p.playingStyle) : '—')], ['Rôle dans l’équipe', esc(tr(p.teamRole || 'aucun'))],
    ['Forme', esc(p.formArrow ? `${ARROW_ICON[p.formArrow] || ''} ${tr(p.formArrow)}` : '—')], ['Valeur marchande', esc(p.marketValue ? millions(p.marketValue) : '—')],
    ['Disponibilité', p.unavailableDays > 0 ? `<span class="down">${esc(trn(p.unavailableDays, 'blessé · environ {n} jour', 'blessé · environ {n} jours'))}</span>` : esc(tr('apte'))],
  ];
  return `<section class="card"><h3>${tr('Fiche joueur')}</h3>
    <div class="profile-grid">${facts.map(([k, v]) => `<div><span class="handle">${tr(k)}</span><b>${v}</b></div>`).join('')}</div>
    <div class="abilities">${entries.map(([k, v]) => {
      const name = label(k), g = gained[name] || 0;
      return `<div class="ability"><span>${esc(tr(name))}</span><span class="bar"><i data-pct="${v}"></i></span><b>${v}</b><span class="${g > 0 ? 'up' : g < 0 ? 'down' : 'flat'}">${g > 0 ? `+${g}` : g < 0 ? g : ''}</span></div>`;
    }).join('')}</div>
    <p class="fineprint">${tr('Notes du jeu sur 99, lues dans ta sauvegarde. Les + et − cumulent ce que LifeLegend a vu bouger depuis qu’il suit ta carrière.')}</p>
  </section>`;
}

// Écran Entraînement du jeu : barres sur 6, geste et poste en cours, gestes appris depuis que LifeLegend suit la carrière.
const TRAINING_BARS = { shooting: 'Tirs', passing: 'Passes', dribbling: 'Dribble', defending: 'Défense', speed: 'Vitesse', strength: 'Force', stamina: 'Endurance', goalkeeping: 'Talent de GB' };
function trainingCard(s) {
  const t = s.player.training;
  if (!t) return '';
  const learning = (x, unknown) => (x ? esc(`${x.name ? tr(x.name) : tr(unknown, { n: x.code })} · ${trn(x.points, '{n} point', '{n} points')}`) : esc(tr('aucun')));
  const learned = (state.skillsLearned || []).slice(-6).reverse();
  return `<section class="card"><h3>${tr('Entraînement')}</h3>
    <div class="profile-grid">
      <div><span class="handle">${tr('Geste technique')}</span><b>${learning(t.skill, 'Geste inconnu (code {n})')}</b></div>
      <div><span class="handle">${tr('Nouveau poste')}</span><b>${learning(t.position, 'Poste inconnu (code {n})')}</b></div>
      <div><span class="handle">${tr('Points restants')}</span><b>${esc(tr('{n} sur {total}', { n: t.remaining, total: t.total }))}</b></div>
    </div>
    <div class="abilities">${Object.entries(TRAINING_BARS).map(([k, label]) => {
      const v = t.focus[k] ?? 0;
      return `<div class="ability"><span>${esc(tr(label))}</span><span class="bar"><i data-pct="${Math.round((v / 6) * 100)}"></i></span><b>${v}</b><span></span></div>`;
    }).join('')}</div>
    ${learned.length ? `<p class="fineprint">${tr('Gestes appris')}${colon()} ${esc(learned.map((x) => `${x.name ? tr(x.name) : tr('geste inconnu')} (${shortDate(x.gameDate)})`).join(', '))}.</p>` : ''}
    <p class="fineprint">${tr('Réglages de l’écran Entraînement du jeu, lus dans ta sauvegarde (barres sur 6). Le jeu n’y garde pas les jours restants.')}</p>
  </section>`;
}

// Sélection nationale : groupe convoqué, statistiques de la saison, matchs joués et à venir.
function nationalCard(s) {
  const n = s.nationalTeam;
  if (!n) return '';
  const st = n.stats;
  const today = s.gameDate || '';
  const shown = n.fixtures.filter((f) => f.played || f.date >= today);
  return `<section class="card"><h3>${tr('Sélection')} · ${esc(n.name)}</h3>
    <div class="profile-grid">
      <div><span class="handle">${tr('Groupe actuel')}</span><b>${n.inSquad ? `<span class="up">${tr('Convoqué')} ✓</span>` : tr('Non retenu')}</b></div>
      <div><span class="handle">${tr('Sélections cette saison')}</span><b>${st.apps}${st.starts ? ` (${tr('{n} tit.', { n: st.starts })})` : ''}</b></div>
      <div><span class="handle">${tr('Buts / passes D.')}</span><b>${st.goals} / ${st.assists}</b></div>
      <div><span class="handle">${tr('Note moyenne')}</span><b>${fmtRating(st.avgRating)}</b></div>
      <div><span class="handle">${tr('Sélectionneur')}</span><b>${esc(n.coach || '—')}</b></div>
      <div><span class="handle">${tr('Prochain match')}</span><b>${n.next ? `${esc(shortDate(n.next.date))} · ${esc(n.next.home)} – ${esc(n.next.away)}` : '—'}</b></div>
    </div>
    ${shown.length ? `<div class="fixtures">${shown.map((f) => `<div class="fixture${f.played ? ' played' : ''}"><span class="fx-date">${esc(shortDate(f.date))}</span><span class="fx-comp">${esc(f.competition || '')}</span>${resultLine(f)}${f.me ? `<div class="fx-me">${f.me.starter ? tr('titulaire') : tr('entré en jeu')} · ${tr('{n} min', { n: f.me.minutes })} · ${tr('note {r}', { r: fmtRating(f.me.rating) })}${f.me.goals ? ` · ${trn(f.me.goals, '{n} but', '{n} buts')}` : ''}${f.me.assists ? ` · ${trn(f.me.assists, '{n} passe D.', '{n} passes D.')}` : ''}</div>` : f.played ? `<div class="fx-me">${tr('pas joué')}</div>` : ''}</div>`).join('')}</div>` : `<p class="fineprint">${tr('Aucun match de la sélection cette saison.')}</p>`}
    <p class="fineprint">${tr('Saison en cours seulement : la sauvegarde ne garde pas le total de sélections de la carrière.')}</p>
  </section>`;
}

// Bilan de la dernière saison terminée (publié par LifeLegend à la fin du championnat).
// Rétrospective de la saison dans le bilan : ses matchs mois par mois (saison archivée de ce club) et les trophées de
// son championnat (récompenses calculées sur les notes du jeu, src/world/awards.js).
function retroHtml(r) {
  const archived = Object.values(state.seasons || {}).find((x) => x.season === r.season && x.club === r.club);
  const months = new Map();
  for (const f of archived?.log || []) {
    const m = months.get(f.date.slice(0, 7)) || { apps: 0, goals: 0, assists: 0, sum: 0 };
    m.apps++; m.goals += f.goals || 0; m.assists += f.assists || 0; m.sum += f.rating || 0;
    months.set(f.date.slice(0, 7), m);
  }
  const monthRows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => `<tr><td>${esc(monthYear(k))}</td><td class="num">${m.apps}</td><td class="num">${m.goals}</td><td class="num">${m.assists}</td><td class="num">${ratingChip(m.apps ? m.sum / m.apps : null)}</td></tr>`).join('');
  const aw = state.awards?.seasons?.[r.season];
  const LABEL = { bestPlayer: 'Meilleur joueur de la saison', topScorer: 'Meilleur buteur', topAssists: 'Meilleur passeur', bestKeeper: 'Meilleur gardien' };
  const winners = aw ? Object.entries(LABEL).filter(([k]) => aw[k]?.name).map(([k, l]) => `<div><span class="handle">${tr(l)}</span><b>${esc(aw[k].name)}${aw[k].me ? ` (${tr('toi')})` : ''}</b><span class="handle">${esc(aw[k].club || '')}</span></div>`).join('') : '';
  return `${monthRows ? `<h4>${tr('Mois par mois')}</h4><table class="data"><thead><tr><th></th><th class="num">${tr('MJ')}</th><th class="num">${tr('B')}</th><th class="num">${tr('PD')}</th><th class="num">${tr('Note')}</th></tr></thead><tbody>${monthRows}</tbody></table>` : ''}
    ${winners ? `<h4>${tr('Trophées du championnat')} · ${esc(aw.competition)}</h4><div class="profile-grid">${winners}</div>${aw.xi?.length ? `<p class="fineprint">${tr('Équipe type de la saison')}${colon()} ${esc(aw.xi.join(', '))}</p>` : ''}` : ''}`;
}

function reviewCard() {
  const reviews = Object.values(state.seasonReviews || {}).sort((a, b) => String(b.season).localeCompare(String(a.season)));
  const r = reviews[0];
  if (!r) return '';
  const p = r.player, st = p.stats, ft = r.final_table;
  const award = (label, x, unit) => (x ? `<div><span class="handle">${tr(label)}</span><b>${esc(x.name)}${x.me ? ` (${tr('toi')})` : ''}</b><span class="handle">${esc(unit(x.value))}</span></div>` : '');
  return `<section class="card"><h3>${esc(tr('Bilan de la saison {season}', { season: r.season }))} · ${esc(r.club)}</h3>
    <div class="review-head"><div class="grade${p.grade ? '' : ' none'}">${esc(p.grade || '—')}</div>
      <div><b>${ft.position ? esc(tr('{pos} sur {n}', { pos: ordinal(ft.position), n: ft.teams })) : '—'}</b> ${esc(tr('en {league}', { league: r.league || '' }))}${ft.record ? ` · ${esc(tr('{pts} pts ({w}V {d}N {l}D)', { pts: ft.record.points, w: ft.record.won, d: ft.record.drawn, l: ft.record.lost }))}` : ''}
      <div class="handle">${st.apps ? `${trn(st.apps, '{n} match', '{n} matchs')} · ${trn(st.goals, '{n} but', '{n} buts')} · ${trn(st.assists, '{n} passe D.', '{n} passes D.')} · ${tr('note moyenne {r}', { r: fmtRating(st.avgRating) })}` : tr('Pas de temps de jeu en championnat cette saison.')}</div>
      <div class="handle">${tr('Champion')}${colon()} ${esc(ft.champion?.team || '—')}${ft.relegation_zone.length ? ` · ${tr('relégués')}${colon()} ${esc(ft.relegation_zone.join(', '))}` : ''}</div></div></div>
    <h4>${tr('Trophées de La Transversale')} · ${esc(r.club)}</h4>
    <div class="profile-grid">
      ${award('Joueur de la saison', r.awards.player_of_the_season, (v) => tr('note moyenne {r}', { r: fmtRating(v) }))}
      ${award('Meilleur buteur', r.awards.top_scorer, (v) => trn(v, '{n} but', '{n} buts'))}
      ${award('Meilleur passeur', r.awards.top_assister, (v) => trn(v, '{n} passe D.', '{n} passes D.'))}
    </div>
    ${p.best_match ? `<p class="fineprint">${esc(tr('Ton match de la saison : {match} ({d}), note {r}', { match: p.best_match.match, d: shortDate(p.best_match.date), r: fmtRating(p.best_match.rating) }))}${p.best_match.goals ? `, ${trn(p.best_match.goals, '{n} but', '{n} buts')}` : ''}${p.best_match.assists ? `, ${trn(p.best_match.assists, '{n} passe D.', '{n} passes D.')}` : ''}.</p>` : ''}
    ${p.progress.length ? `<p class="fineprint">${tr('Progrès de la saison')}${colon()} ${esc(p.progress.map((x) => `${tr(x.ability)} ${x.change > 0 ? '+' : ''}${x.change}`).join(', '))}.</p>` : ''}
    ${p.market_value ? `<p class="fineprint">${tr('Valeur marchande')}${colon()} ${esc(millions(p.market_value.now))}${p.market_value.at_start ? ` (${esc(tr('{v} en début de saison', { v: millions(p.market_value.at_start) }))})` : ''}.</p>` : ''}
    ${r.trophies.length ? `<p class="fineprint">${tr('Trophées')}${colon()} ${r.trophies.map((t) => `🏆 ${esc(t.competition)}`).join(' · ')}</p>` : ''}
    ${retroHtml(r)}
    <p class="fineprint">${tr('Et maintenant')}${colon()} ${esc(tr('contrat jusqu’au {d}', { d: r.next.contract_until ? fmtDate(r.next.contract_until, { day: 'numeric', month: 'long', year: 'numeric' }) : '—' }))}${r.next.clubs_following.length ? ` · ${esc(tr('suivi par {clubs}', { clubs: r.next.clubs_following.join(', ') }))}` : ''}${r.next.pending_offers.length ? ` · ${tr('offres en attente')}${colon()} ${esc(r.next.pending_offers.join(', '))}` : ''}.</p>
  </section>`;
}

// Scoreline : outils communs (icônes Heroicons v2, contour, © Tailwind Labs, licence MIT ; graphiques ; lignes de matchs).
const SF_ICON = {
  dash: ["M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"], // squares-2x2
  matches: ["M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"], // calendar-days
  stats: ["M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"], // chart-bar
  profile: ["M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"], // user
  table: ["M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5"], // table-cells
  squad: ["M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"], // user-group
  nation: ["M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"], // flag
  career: ["M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"], // trophy
  time: ["M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"], // clock
  pin: ["M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z","M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"], // map-pin
  down: ["m19.5 8.25-7.5 7.5-7.5-7.5"], // chevron-down
  next: ["m8.25 4.5 7.5 7.5-7.5 7.5"], // chevron-right
  up: ["M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"], // arrow-up
  search: ["m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"], // magnifying-glass
  prev: ["M15.75 19.5 8.25 12l7.5-7.5"], // chevron-left
  right: ["M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"], // arrow-right
  bars: ["M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"], // bars-3
  swap: ["M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"], // arrows-right-left
  cog: ["M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"], // cog-6-tooth
};
const sfi = (k) => `<svg class="sfa-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${SF_ICON[k].map((d) => `<path stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`).join('')}</svg>`;
const sfDays = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
const sfRating = (r) => (Number.isFinite(r) ? fmtNote(r) : '—');
const sfMatchLabel = (f) => `${f.home} ${f.played && f.score ? `${f.score[0]}-${f.score[1]}` : '–'} ${f.away}`;

// Repère du transfert sur les graphiques de la saison : trait pointillé avant le premier match au nouveau club.
const sfSplit = (xs, T, B, H, label) => `<line class="sfa-split" x1="${xs.toFixed(1)}" x2="${xs.toFixed(1)}" y1="${T}" y2="${H - B}"/><text class="sfa-split-label" x="${(xs + 6).toFixed(1)}" y="${T + 10}">${esc(label)}</text>`;

// Graphique en courbe (une série) : notes match par match. Ligne 2 px, points avec anneau, croix de lecture + infobulle.
// split : { index, label } du premier match au nouveau club, quand la saison compte un transfert. fmt (valeur au bout
// de la courbe), tick (graduations), label (nom pour les lecteurs d'écran) et empty servent aux autres séries.
function sfLineChart(id, points, { min = 4, max = 9, ticks = [5, 6, 7, 8], split = null, fmt = sfRating, tick = (t) => t, label = tr('Note par match'), empty = tr('Pas assez de matchs pour tracer la courbe.'), logos = null, also = null, step = false, W = 640, H = 220 } = {}) {
  if (points.length < 2) return `<p class="fineprint">${esc(empty)}</p>`;
  const endChars = Math.max(String(fmt(points.at(-1).value)).length, also ? String(fmt(also.at(-1))).length : 0);
  const L = Math.max(34, Math.max(...ticks.map((t) => String(tick(t)).length)) * 7 + 12), R = Math.max(34, endChars * 8 + 12), T = 14, B = 26;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((max - Math.max(min, Math.min(max, v))) * (H - T - B)) / (max - min);
  const trace = (vals) => vals.map((v, i) => (!i ? `M${x(0).toFixed(1)} ${y(v).toFixed(1)}` : step ? `H${x(i).toFixed(1)} V${y(v).toFixed(1)}` : `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(' ');
  const line = trace(points.map((p) => p.value));
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const last = points.at(-1);
  // Les deux valeurs au bout des courbes : écartées quand elles se touchent.
  const yEnd = y(last.value), yAlso = also ? y(also.at(-1)) : 0, near = also && Math.abs(yEnd - yAlso) < 14, up = yEnd <= yAlso;
  return `<div class="sfa-chart" id="${id}" data-chart="line">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" tabindex="0">
      ${ticks.map((t) => `<line class="sfa-gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="sfa-tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${esc(tick(t))}</text>`).join('')}
      <line class="sfa-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      ${split && split.index > 0 && split.index < points.length ? sfSplit((x(split.index - 1) + x(split.index)) / 2, T, B, H, split.label) : ''}
      <text class="sfa-tick" x="${x(0)}" y="${H - 8}" text-anchor="start">${esc(shortDate(points[0].date))}</text>
      <text class="sfa-tick" x="${x(points.length - 1)}" y="${H - 8}" text-anchor="end">${esc(shortDate(last.date))}</text>
      <path class="sfa-area" d="${area}"/>
      ${also ? `<path class="sfa-line b" d="${trace(also)}"/>${also.map((v, i) => `<circle class="sfa-dot-b" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"/>`).join('')}<text class="sfa-endlabel" x="${(x(points.length - 1) + 8).toFixed(1)}" y="${(near ? (up ? yAlso + 12 : yAlso - 3) : yAlso + 4).toFixed(1)}">${esc(fmt(also.at(-1)))}</text>` : ''}
      <path class="sfa-line" pathLength="1" d="${line}"/>
      ${points.map((p, i) => `<circle class="sfa-dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4"/>`).join('')}
      ${logos && points.length <= 16 ? points.map((p, i) => (logos[i] ? `<circle class="sfa-logo" cx="${x(i).toFixed(1)}" cy="${(y(p.value) - 20).toFixed(1)}" r="11"/><image href="${esc(logos[i])}" x="${(x(i) - 9).toFixed(1)}" y="${(y(p.value) - 29).toFixed(1)}" width="18" height="18"/>` : '')).join('') : ''}
      <text class="sfa-endlabel" x="${(x(points.length - 1) + 8).toFixed(1)}" y="${(near ? (up ? yEnd - 3 : yEnd + 12) : yEnd + 4).toFixed(1)}">${esc(fmt(last.value))}</text>
      <line class="sfa-cross" x1="0" x2="0" y1="${T}" y2="${H - B}"/>
      <rect class="sfa-hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/>
    </svg>
    <div class="sfa-tip" role="status"></div>
  </div>`;
}

// Graphique en colonnes (une série) : minutes jouées par match. Colonnes ≤ 24 px, bout arrondi, infobulle par colonne.
function sfColumns(id, points, { max = 90, ticks = [30, 60, 90], split = null, tick = (t) => t, label = tr('Minutes jouées par match'), W = 640, H = 200 } = {}) {
  if (!points.length) return `<p class="fineprint">${tr('Aucun match joué.')}</p>`;
  const L = Math.max(34, Math.max(...ticks.map((t) => String(tick(t)).length)) * 7 + 12), R = 10, T = 12, B = 26;
  const slot = (W - L - R) / points.length, bw = Math.min(24, Math.max(4, slot - 2));
  const y = (v) => T + ((max - Math.min(max, v)) * (H - T - B)) / max;
  const bar = (i, v) => {
    const x0 = L + i * slot + (slot - bw) / 2, top = y(v), base = H - B, r = Math.min(4, bw / 2, base - top);
    if (base - top < 0.5) return '';
    return `<path class="sfa-col${points[i].alt ? ' alt' : ''}" data-i="${i}" d="M${x0.toFixed(1)} ${base} V${(top + r).toFixed(1)} Q${x0.toFixed(1)} ${top.toFixed(1)} ${(x0 + r).toFixed(1)} ${top.toFixed(1)} H${(x0 + bw - r).toFixed(1)} Q${(x0 + bw).toFixed(1)} ${top.toFixed(1)} ${(x0 + bw).toFixed(1)} ${(top + r).toFixed(1)} V${base} Z"/>`;
  };
  return `<div class="sfa-chart" id="${id}" data-chart="columns">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" tabindex="0">
      ${ticks.map((t) => `<line class="sfa-gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="sfa-tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${esc(tick(t))}</text>`).join('')}
      <line class="sfa-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      ${points.length === 1 ? `<text class="sfa-tick" x="${(L + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(shortDate(points[0].date))}</text>`
    : `<text class="sfa-tick" x="${L}" y="${H - 8}">${esc(shortDate(points[0].date))}</text>
      <text class="sfa-tick" x="${W - R}" y="${H - 8}" text-anchor="end">${esc(shortDate(points.at(-1).date))}</text>`}
      ${split && split.index > 0 && split.index < points.length ? sfSplit(L + split.index * slot, T, B, H, split.label) : ''}
      ${points.map((p, i) => bar(i, p.value)).join('')}
      ${points.map((p, i) => `<rect class="sfa-hitcol" data-i="${i}" x="${(L + i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/>`).join('')}
    </svg>
    <div class="sfa-tip" role="status"></div>
  </div>`;
}

// Survol et clavier des graphiques : infobulle (valeur d'abord, puis le match), croix de lecture sur la courbe.
function bindSfCharts(page, series) {
  page.querySelectorAll('.sfa-chart').forEach((box) => {
    const pts = series[box.id];
    if (!pts) return;
    const svg = box.querySelector('svg'), tip = box.querySelector('.sfa-tip');
    const vb = svg.viewBox.baseVal;
    let current = pts.length - 1;
    const show = (i) => {
      current = Math.max(0, Math.min(pts.length - 1, i));
      const p = pts[current];
      tip.textContent = '';
      const v = document.createElement('b'); v.textContent = p.valueText;
      const l = document.createElement('span'); l.textContent = p.label;
      const d = document.createElement('small'); d.textContent = p.sub;
      tip.append(v, l, d);
      const rect = svg.getBoundingClientRect(), scale = rect.width / vb.width;
      let px;
      if (box.dataset.chart === 'line') {
        const dot = svg.querySelectorAll('.sfa-dot')[current];
        px = Number(dot.getAttribute('cx'));
        const cross = svg.querySelector('.sfa-cross');
        cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.classList.add('on');
        svg.querySelectorAll('.sfa-dot').forEach((c, k) => c.classList.toggle('on', k === current));
      } else {
        const hit = svg.querySelectorAll('.sfa-hitcol')[current];
        px = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
        svg.querySelectorAll('.sfa-col').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === current));
      }
      tip.classList.add('on');
      const left = Math.min(Math.max(px * scale, 70), rect.width - 70);
      tip.style.left = `${left}px`;
    };
    const hide = () => { tip.classList.remove('on'); svg.querySelector('.sfa-cross')?.classList.remove('on'); svg.querySelectorAll('.on').forEach((c) => c.classList.remove('on')); };
    svg.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect(), vx = ((ev.clientX - rect.left) / rect.width) * vb.width;
      if (box.dataset.chart === 'line') {
        const dots = [...svg.querySelectorAll('.sfa-dot')].map((c) => Number(c.getAttribute('cx')));
        let best = 0; dots.forEach((cx, k) => { if (Math.abs(cx - vx) < Math.abs(dots[best] - vx)) best = k; });
        show(best);
      } else {
        const hit = ev.target.closest?.('.sfa-hitcol');
        if (hit) show(Number(hit.dataset.i));
      }
    });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(current));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(current - 1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); show(current + 1); }
    });
  });
}

function statRow(label, st) {
  return `<tr><td>${esc(label)}</td><td class="num">${st.apps}</td><td class="num">${st.starts}</td><td class="num">${st.minutes}</td><td class="num">${st.goals}</td><td class="num">${st.assists}</td><td class="num">${ratingChip(st.avgRating)}</td></tr>`;
}

// ---------- Scoreline : le site de scores, disposé d'après sa référence (un tableau de bord de foot) ----------
// Un cadre à deux colonnes : le menu (rubriques, compétitions, pays, profil) et la page. Rubriques : Scores (tous les matchs
// du monde du jeu, jour par jour), Joueur (sa fiche), Compétitions et Équipes ; chaque match ouvre sa page. Les scores du monde
// viennent de scores.json, écrit à chaque synchro (voir src/world/scores.js) ; sa carrière vient de l'état. Le jeu ne garde
// pas de statistiques d'équipe (possession, tirs, arbitre) : les blocs de match se calculent sur les notes, buts et passes.

let skCache = { key: null, data: undefined, loading: null };
// Scores du monde du jeu : undefined pendant le chargement, null s'il n'y en a pas encore (aucune synchro récente).
function skData() {
  const key = `${state.careerId}|${state.snapshot?.gameDate}|${state.lastSync?.gameDate || ''}`;
  if (skCache.key === key) return skCache.data;
  if (skCache.loading !== key) {
    skCache.loading = key;
    // Lecture d'abord, affichage ensuite : une erreur de dessin ne doit pas effacer des scores bien lus.
    live.getScores().then((data) => {
      skCache = { key, data: data && data.v === 1 ? skIndex(data) : null, loading: null };
    }, () => { skCache = { key, data: null, loading: null }; }).then(() => {
      if (current === 'stats' || current === 'national' || current === 'tribune') render(); // La Transversale aussi : ses rubriques lisent les scores du monde ; Kop, ses tendances
    });
  }
  return undefined;
}
// Index des matchs par jour, par affiche (date|domicile|extérieur), par équipe et par compétition.
function skIndex(d) {
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  d.byDay = new Map(); d.byKey = new Map(); d.byTeam = new Map(); d.byComp = new Map();
  d.matches.forEach((m, i) => {
    push(d.byDay, m[0], i);
    d.byKey.set(`${m[0]}|${m[4]}|${m[5]}`, i);
    push(d.byTeam, m[4], i); push(d.byTeam, m[5], i);
    push(d.byComp, m[2], i);
  });
  d.leagues = d.comps.map((c, i) => (c.table ? i : -1)).filter((i) => i >= 0);
  return d;
}

const SK_SECTIONS = [['scores', 'Scores'], ['joueur', 'Joueur'], ['comps', 'Compétitions'], ['teams', 'Équipes']];
const SK_INITIALS = { 'UEFA Champions League': 'C1', 'UEFA Europa League': 'C3', 'Coupe de France': 'CF', 'UEFA EURO': 'EU' };
const skName = (d, ref) => d?.teams?.[ref]?.[0] || '—';
const skPlayed = (d, i) => d.matches[i][6] !== undefined;
const skAdd = (iso, n) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// Logo d'une compétition (lu dans le jeu), sinon ses initiales : le jeu n'a pas les logos sans licence (C1, CF…).
const skLogo = (name, size = 20) => {
  const u = compEmblem(name);
  if (u) return `<img class="sc-lg s${size}" src="${esc(u)}" alt="">`;
  const ini = SK_INITIALS[name] || String(name || '?').replace(/[^A-Z0-9]/g, '').slice(0, 2) || String(name || '?')[0];
  return `<span class="sc-lg sc-lg-none s${size}">${esc(ini)}</span>`;
};
// Chaque écusson sur sa pastille blanche : un écusson sombre reste lisible sur le fond de nuit.
const scCrest = (name, size = 22) => crestHtml(name, ` sc-crest s${size}`);
const scSurname = (name) => String(name || '?').trim().split(/\s+/).at(-1).replace(/^.*\.(?=.)/, '');
const scMean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const scIsMe = (name) => Boolean(name) && name === state.snapshot.player.name;
// Le visage d'un joueur, l'écusson de son club en petit. Sans visage : l'écusson, sinon l'initiale.
const scFace = (name, club, size = 32) => `<span class="sc-pf s${size}">${faceIn(name, club ? crestHtml(club, ' sc-crest') : esc(String(name || '?').trim()[0] || '?'))}${club ? `<i class="sc-pf-club">${crestHtml(club, ' sc-crest')}</i>` : ''}</span>`;
// Résultat d'un match vu d'une équipe : V, N ou D.
const skRes = (d, i, ref) => {
  const m = d.matches[i];
  if (m[6] === undefined) return null;
  const [a, b] = m[4] === ref ? [m[6], m[7]] : [m[7], m[6]];
  return a > b ? 'V' : a < b ? 'D' : 'N';
};
const skBadge = (r) => (r ? `<i class="sfa-res sfa-res-${r}">${formLetter(r)}</i>` : '');
const scCard = (title, body, { cls = '', end = '', foot = '' } = {}) => `<section class="sc-card ${cls}">${title ? `<header class="sc-ch"><h3>${title}</h3>${end}</header>` : ''}${body}${foot}</section>`;
const scEmpty = (title, text = '') => `<div class="sc-empty"><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
const scTabs = (tabs, cur, kind) => `<nav class="sc-tabs">${tabs.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-sk="${kind}" data-v="${esc(k)}">${l}</button>`).join('')}</nav>`;
const scMore = (label, sk, v = '') => `<button class="sc-more" data-sk="${sk}" data-v="${esc(v)}"><span>${label}</span>${sfi('right')}</button>`;
const scPills = (list, cur, kind) => `<div class="sc-pills">${list.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-sk="${kind}" data-v="${esc(k)}">${l}</button>`).join('')}</div>`;

// Une ligne de match : statut, domicile, score, extérieur, colonne libre. Toute la ligne ouvre le match (ou le choisit).
function scRow(d, i, extra = '', sk = 'open') {
  const [date, hour, , , h, a, hs, as] = d.matches[i];
  const played = hs !== undefined, past = !played && date < d.gameDate;
  const on = sk === 'pick' && view.scPick === i;
  return `<div class="sc-m${on ? ' on' : ''}${h === d.clubRef || a === d.clubRef ? ' us' : ''}" role="button" tabindex="0" data-sk="${sk}" data-v="${i}">
    <span class="sc-st${played ? '' : past ? ' off' : ' up'}">${played ? tr('Fin') : past ? tr('Non joué') : hour != null ? hh(hour) : '—'}</span>
    <span class="sc-m-h"><span>${esc(skName(d, h))}</span>${scCrest(skName(d, h), 18)}</span><b class="sc-sc">${played ? `${hs} - ${as}` : '-'}</b><span class="sc-m-a">${scCrest(skName(d, a), 18)}<span>${esc(skName(d, a))}</span></span>
    ${extra ? `<span class="sc-m-x">${extra}</span>` : ''}</div>`;
}
const scByDate = (d, list, sk = 'open') => {
  const days = [];
  for (const i of list) { const k = d.matches[i][0]; const g = days.find((x) => x[0] === k); if (g) g[1].push(i); else days.push([k, [i]]); }
  return days.map(([k, is]) => `<div class="sc-day">${esc(fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>${is.map((i) => scRow(d, i, '', sk)).join('')}`).join('');
};

// Postes lus dans la sauvegarde (voir blReader.readLineup), en abréviations françaises de PES.
const SK_POS_BY_LANG = {
  fr: ['GB', 'DC', 'DL', 'MDC', 'MC', 'ML', 'MO', 'SA', 'AIL', 'AC'],
  en: ['GK', 'CB', 'FB', 'DMF', 'CMF', 'WM', 'AMF', 'SS', 'WF', 'CF'],
  es: ['PT', 'DEC', 'LAT', 'MCD', 'MC', 'MB', 'MO', 'SD', 'EXT', 'DC'],
  it: ['PT', 'DC', 'TER', 'MED', 'CC', 'EST', 'TRQ', 'SP', 'ALA', 'P'],
  pt: ['GO', 'ZC', 'LAT', 'VOL', 'MC', 'MEI', 'MAT', 'SA', 'PON', 'CA'],
  de: ['TW', 'IV', 'AV', 'DM', 'ZM', 'AM', 'OM', 'HS', 'FL', 'MS'],
};
const skPos = (k) => (SK_POS_BY_LANG[lang()] || SK_POS_BY_LANG.fr)[k];
// Lignes du terrain, du but vers l'attaque : gardien, défense, milieu défensif, milieu, milieu offensif, attaque.
const SK_LINES = [[0], [1, 2], [3], [4, 5], [6, 7], [8, 9]];
// Titulaires rangés en lignes ; latéraux, milieux latéraux et ailiers aux deux bords de leur ligne. Sans postes
// (scores écrits avant leur lecture), ordre de la feuille en 1-4-3-3.
function skLines(lu, known) {
  const xi = lu.filter((p) => p[1]);
  if (!known) { const x = xi.slice(0, 11); return [x.slice(0, 1), x.slice(1, 5), x.slice(5, 8), x.slice(8, 11)].filter((l) => l.length); }
  return SK_LINES.map((codes) => {
    const line = xi.filter((p) => codes.includes(p[6]));
    const edge = line.filter((p) => [2, 5, 8].includes(p[6])), axis = line.filter((p) => ![2, 5, 8].includes(p[6]));
    return edge.length >= 2 ? [edge[0], ...axis, ...edge.slice(1)] : [...axis, ...edge];
  }).filter((l) => l.length);
}
const scHalfLines = '<svg class="sc-plines" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="98" height="58"/><rect x="26" y="1" width="48" height="13"/><rect x="39" y="1" width="22" height="5"/><path d="M1 59h98"/><path d="M38 59a12 9 0 0 1 24 0"/></svg>';
const scFullLines = '<svg class="sc-plines" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="98" height="128"/><path d="M1 65h98"/><circle cx="50" cy="65" r="11"/><rect x="24" y="1" width="52" height="17"/><rect x="38" y="1" width="24" height="6"/><rect x="24" y="112" width="52" height="17"/><rect x="38" y="123" width="24" height="6"/></svg>';

// Ce que l'on sait d'un match joué, équipe par équipe, d'après les feuilles de match.
function scSideStats(d, i) {
  const lu = d.details?.[i]?.lu;
  if (!lu) return null;
  return lu.map((l) => {
    const rated = l.filter((p) => Number.isFinite(p[3]) && p[3] > 0);
    return { avg: scMean(rated.map((p) => p[3])), best: rated.length ? Math.max(...rated.map((p) => p[3])) : null, goals: l.reduce((n, p) => n + (p[4] || 0), 0), assists: l.reduce((n, p) => n + (p[5] || 0), 0), seven: l.filter((p) => p[1] && p[3] >= 7).length, subs: l.filter((p) => !p[1]).length };
  });
}
// Une ligne de comparaison : la valeur, sa barre, le libellé au milieu, la barre, la valeur.
const scDuel = (label, a, b, fmt = (x) => x) => {
  const top = Math.max(a ?? 0, b ?? 0) || 1;
  const w = (x) => Math.round(((x ?? 0) / top) * 100);
  return `<div class="sc-duel"><b>${a == null ? '—' : esc(fmt(a))}</b><span class="l"><i data-w="${w(a)}"></i></span><small>${esc(label)}</small><span class="r"><i data-w="${w(b)}"></i></span><b>${b == null ? '—' : esc(fmt(b))}</b></div>`;
};
// Avant le match : ce que disent le classement et la forme.
function scPreviewDuels(d, i) {
  const m = d.matches[i];
  const ci = d.comps[m[2]].table ? m[2] : d.leagues.find((k) => d.comps[k].table.some((r) => r[0] === m[4]) && d.comps[k].table.some((r) => r[0] === m[5]));
  const t = ci !== undefined ? d.comps[ci].table : null;
  const row = (ref) => t?.find((r) => r[0] === ref);
  const [a, b] = [row(m[4]), row(m[5])];
  if (!a || !b) return '';
  const form = (r) => [...r[8]].reduce((n, x) => n + (x === 'V' ? 3 : x === 'N' ? 1 : 0), 0);
  return scDuel(tr('Points'), a[7], b[7]) + scDuel(tr('Buts marqués'), a[5], b[5]) + scDuel(tr('Buts encaissés'), a[6], b[6]) + scDuel(tr('Victoires'), a[2], b[2]) + scDuel(tr('Points sur les 5 derniers matchs'), form(a), form(b));
}
const scPlayedDuels = (st) => (st ? scDuel(tr('Note moyenne'), st[0].avg, st[1].avg, sfRating) + scDuel(tr('Meilleure note'), st[0].best, st[1].best, sfRating) + scDuel(tr('Buts'), st[0].goals, st[1].goals) + scDuel(tr('Passes D.'), st[0].assists, st[1].assists) + scDuel(tr('Titulaires à 7 ou plus'), st[0].seven, st[1].seven) + scDuel(tr('Entrés en jeu'), st[0].subs, st[1].subs) : '');
// Buts d'un match : avec la minute pour le dernier match du club (seul que la sauvegarde détaille), sinon sans ordre.
function scGoals(d, i) {
  const m = d.matches[i];
  const f = state.snapshot.fixtures?.find((x) => x.date === m[0] && x.homeRef === m[4] && x.awayRef === m[5]);
  if (f?.goalTimeline?.length) return f.goalTimeline.map((g) => ({ side: g.side === 'home' ? 0 : 1, name: g.scorer, assist: g.assist, minute: g.minute })).sort((a, b) => a.minute - b.minute);
  return (d.details?.[i]?.ev || []).filter((e) => e[2]).map((e) => ({ side: e[0], name: e[1], count: e[2] }));
}
const scGoalChip = (g) => `<span class="sc-goal">⚽ ${esc(scSurname(g.name) || tr('Joueur inconnu'))}${g.count > 1 ? ` ×${g.count}` : ''}${g.minute != null ? ` <small>${g.minute}′</small>` : ''}</span>`;

// Le match choisi sur la page d'une compétition : le score, le lieu, les buts, la comparaison.
function scMatchCard(d, i) {
  const m = d.matches[i], played = skPlayed(d, i), names = [skName(d, m[4]), skName(d, m[5])], stadium = d.teams?.[m[4]]?.[2];
  const goals = played ? scGoals(d, i) : [];
  const duels = played ? scPlayedDuels(scSideStats(d, i)) : scPreviewDuels(d, i);
  return `<section class="sc-card sc-pick">
    <div class="sc-pick-top"><span>${scCrest(names[0], 32)}<b>${esc(names[0])}</b></span><div><strong>${played ? `${m[6]} – ${m[7]}` : m[1] != null ? hh(m[1]) : '–'}</strong><small>${played ? tr('Terminé') : tr('À venir')}</small></div><span class="away"><b>${esc(names[1])}</b>${scCrest(names[1], 32)}</span></div>
    <div class="sc-pick-meta"><ul><li>${sfi('matches')}${esc(fmtDate(m[0], { day: 'numeric', month: 'long', year: 'numeric' }))}</li>${stadium ? `<li>${sfi('pin')}${esc(stadium)}</li>` : ''}</ul><div class="sc-pick-goals">${goals.slice(0, 5).map(scGoalChip).join('') || (played ? `<small>${tr('Aucun but')}</small>` : '')}</div></div>
    ${duels ? `<div class="sc-duels"><div class="sc-duels-h">${scCrest(names[0], 18)}<small>${played ? tr('Statistiques du match') : tr('Avant le match')}</small>${scCrest(names[1], 18)}</div>${duels}</div>` : `<p class="sc-fine">${tr('Composition non conservée : Scoreline garde celles des 45 derniers jours et de tous les matchs de ton club.')}</p>`}
    ${scMore(tr('Voir le match'), 'open', i)}
  </section>`;
}

// Classement : tout, ou la tranche autour de son club (limit), toujours avec la forme.
function scTable(d, ci, { limit = 0, mark = null, foot = '' } = {}) {
  const c = d.comps[ci];
  if (!c?.table) return '';
  const n = c.table.length, marks = mark || [d.clubRef];
  const mine = c.table.findIndex((r) => marks.includes(r[0]));
  const from = limit && n > limit ? Math.max(0, Math.min(n - limit, mine < 0 ? 0 : mine - Math.floor(limit / 2))) : 0;
  const rows = limit ? c.table.slice(from, from + limit) : c.table;
  const full = !limit;
  return scCard(`<span class="sc-link" role="link" tabindex="0" data-sk="comp" data-v="${ci}">${esc(c.name)}</span>`, `<table class="sc-t"><thead><tr><th>#</th><th>${tr('Équipe')}</th><th class="n">${tr('J')}</th><th class="n">${tr('G')}</th><th class="n">${tr('N')}</th><th class="n">${tr('P')}</th>${full ? `<th class="n">${tr('BP')}</th><th class="n">${tr('BC')}</th>` : ''}<th class="n">${tr('Diff')}</th><th class="n">${tr('Pts')}</th><th>${tr('Forme')}</th></tr></thead><tbody>
    ${rows.map((r, k) => { const pos = from + k; return `<tr class="${marks.includes(r[0]) ? 'us' : ''}${n >= 10 && pos >= n - 2 ? ' down' : n >= 10 && pos === n - 3 ? ' risk' : ''}"><td>${pos + 1}</td><td class="sc-cut"><span class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${r[0]}">${scCrest(skName(d, r[0]), 18)}<span>${esc(skName(d, r[0]))}</span></span></td><td class="n">${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td>${full ? `<td class="n">${r[5]}</td><td class="n">${r[6]}</td>` : ''}<td class="n">${r[5] - r[6] > 0 ? '+' : ''}${r[5] - r[6]}</td><td class="n"><b>${r[7]}</b></td><td><span class="sfa-form">${[...r[8]].map(skBadge).join('')}</span></td></tr>`; }).join('')}</tbody></table>`, { foot });
}
// Buts et passes de toute la compétition, d'après les feuilles de tous les matchs.
function scTally(d, ci) {
  const acc = new Map();
  for (const i of d.byComp.get(ci) || []) {
    const m = d.matches[i];
    for (const [side, name, g, a] of d.details?.[i]?.ev || []) {
      if (!name) continue;
      const x = acc.get(name) || { name, ref: m[4 + side], goals: 0, assists: 0 };
      x.goals += g; x.assists += a; x.ref = m[4 + side];
      acc.set(name, x);
    }
  }
  return [...acc.values()];
}
const scLeaders = (d, title, list, val) => `<div class="sc-rank"><h4>${title}</h4>${list.slice(0, 5).map((x, k) => `<div class="sc-rank-row${scIsMe(x.name) ? ' me' : ''}">${scFace(x.name, skName(d, x.ref), 36)}<span><b>${esc(x.name)}</b><small>${esc(skName(d, x.ref))}</small></span><em class="${k === 0 ? 'top' : ''}">${val(x)}</em></div>`).join('') || `<p class="sc-fine">${tr('Pas encore de but marqué')}</p>`}</div>`;
function scLeadersCard(d, ci) {
  const t = scTally(d, ci);
  const by = (f) => [...t].filter((x) => f(x) > 0).sort((a, b) => f(b) - f(a) || b.goals - a.goals);
  return `<section class="sc-card sc-ranks">${scLeaders(d, tr('Buteurs'), by((x) => x.goals), (x) => x.goals)}${scLeaders(d, tr('Passeurs'), by((x) => x.assists), (x) => x.assists)}${scLeaders(d, tr('Buts + passes'), by((x) => x.goals + x.assists), (x) => x.goals + x.assists)}</section>`;
}
// Équipe type de la dernière journée de ce championnat, sur un terrain, lui en surbrillance.
function scTotw(d, ci) {
  const t = d?.comps?.[ci]?.totw;
  if (!t?.xi?.length) return '';
  const line = (k) => { const ps = t.xi.filter((p) => p[2] === k && p[0]); return ps.length ? `<div class="sc-pline">${ps.map((p) => `<div class="sc-ppl${scIsMe(p[0]) ? ' me' : ''}" title="${esc(`${p[0]} · ${skName(d, p[1])}`)}"><span class="sc-ppl-d">${scFace(p[0], skName(d, p[1]), 36)}${ratingChip(p[3])}</span><b>${esc(scSurname(p[0]))}</b></div>`).join('')}</div>` : ''; };
  return scCard(tr('Équipe type'), `<div class="sc-pitch">${scFullLines}${['att', 'mid', 'def', 'gk'].map(line).join('')}</div>${t.best ? `<p class="sc-fine">${esc(tr('Joueur de la journée : {name} ({club}) · {rating}', { name: t.best[0], club: skName(d, t.best[1]), rating: sfRating(t.best[2]) }))}</p>` : ''}`, { cls: 'sc-totw', end: `<small>${esc(roundLabel(t.round))}</small>` });
}
// Joueur du mois : meilleure note moyenne des 30 derniers jours (compétitions du club et grandes compétitions).
function scPotm(d) {
  const p = d?.potm;
  if (!p) return '';
  const team = skName(d, p.teamRef);
  return `<section class="sc-card sc-potm"><small>${esc(monthYear(p.month))}</small><h3>${tr('Joueur du mois')}</h3>${scFace(p.name, team, 72)}<b>${esc(p.name)}</b>
    <p>${esc(team)} · ${trn(p.apps, '{n} match', '{n} matchs')} · ${trn(p.goals, '{n} but', '{n} buts')} · ${trn(p.assists, '{n} passe D.', '{n} passes D.')}</p>
    <div><span>${p.me ? tr('C’est toi !') : tr('Meilleure note moyenne du mois')}</span>${ratingChip(p.avg)}</div></section>`;
}
// Championnat affiché à droite des Scores : celui choisi avec les flèches, sinon le sien.
const skTableIndex = (d) => {
  const L = d.leagues;
  if (!L.length) return -1;
  const mine = Math.max(0, L.findIndex((ci) => d.comps[ci].main));
  return L[((view.skTable ?? mine) % L.length + L.length) % L.length];
};

// ----- Le menu : les rubriques, les compétitions, les pays, son profil -----
const SC_NOT_COUNTRY = new Set(['Europe', 'Monde', 'Amérique du Sud', 'Afrique', 'Asie', 'Amérique du Nord']);
function scSide(d, sec, ci) {
  const s = state.snapshot, count = d ? (d.byDay.get(s.gameDate) || []).length : 0;
  const nav = [['scores', 'matches', 'Scores', count], ['joueur', 'profile', 'Joueur', 0], ['comps', 'table', 'Compétitions', 0], ['teams', 'squad', 'Équipes', 0]];
  const all = d ? d.comps.map((c, k) => [c, k]) : [];
  const top = all.filter(([c]) => c.mine || c.big);
  const compRow = ([c, k]) => `<button class="sc-nav${sec === 'comps' && view.skOpen == null && k === ci ? ' on' : ''}" data-sk="comp" data-v="${k}">${skLogo(c.name, 18)}<span>${esc(c.name)}</span><small>${(d.byComp.get(k) || []).length}</small></button>`;
  const others = all.filter(([c]) => !c.mine && !c.big);
  const lands = new Map();
  for (const [c, k] of all) {
    if (!c.country || SC_NOT_COUNTRY.has(c.country)) continue;
    const x = lands.get(c.country) || { name: c.country, n: 0, first: null, mine: false };
    x.n += (d.byComp.get(k) || []).length;
    if (x.first === null || (c.table && !d.comps[x.first].table)) x.first = k;
    if (c.main) x.mine = true;
    lands.set(c.country, x);
  }
  const countries = [...lands.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || b.n - a.n);
  const landRow = (x) => `<button class="sc-nav" data-sk="comp" data-v="${x.first}">${scCrest(x.name, 18)}<span>${esc(x.name)}</span><small>${x.n}</small></button>`;
  const me = state.profile?.displayName || s.player.name;
  return `<div class="sc-brand"><button class="sc-burger" data-sk="menu" aria-label="${tr('Menu')}">${sfi('bars')}</button><b class="ll-wordmark">Scoreline</b></div>
    <div class="sc-side-scroll">
      <h6>${tr('Navigation')}</h6>
      ${nav.map(([k, icon, l, n]) => `<button class="sc-nav${sec === k && view.skOpen == null ? ' on' : ''}" data-sk="sec" data-v="${k}">${sfi(icon)}<span>${tr(l)}</span>${n ? `<em>${n}</em>` : ''}</button>`).join('')}
      ${top.length ? `<h6>${tr('Compétitions populaires')}</h6>${top.slice(0, 8).map(compRow).join('')}
        ${view.skAllComps ? [...top.slice(8), ...others].map(compRow).join('') : ''}
        ${others.length + top.length > 8 ? `<button class="sc-nav sc-nav-more" data-sk="allcomps"><span>${view.skAllComps ? tr('Afficher moins') : tr('Toutes les compétitions')}</span>${sfi(view.skAllComps ? 'down' : 'next')}</button>` : ''}` : ''}
      ${countries.length ? `<h6>${tr('Pays populaires')}</h6>${countries.slice(0, view.scAllLands ? countries.length : 2).map(landRow).join('')}
        ${countries.length > 2 ? `<button class="sc-nav sc-nav-more" data-sk="alllands"><span>${view.scAllLands ? tr('Afficher moins') : tr('Tous les pays')}</span>${sfi(view.scAllLands ? 'down' : 'next')}</button>` : ''}` : ''}
    </div>
    <div class="sc-side-foot"><button class="sc-nav" data-sk="settings">${sfi('cog')}<span>${tr('Réglages')}</span></button>
      <div class="sc-me"><span class="sc-me-face">${myFaceIn(esc(String(me).trim()[0] || '?'))}</span><span><b>${esc(me)}</b>${state.profile?.handle ? `<small>@${esc(state.profile.handle)}</small>` : ''}</span></div></div>`;
}

// ----- Rubrique Scores : les matchs du jour, groupés par compétition -----
function scHome(d) {
  const s = state.snapshot, today = s.gameDate, day = view.skDay || today;
  const ids = d.byDay.get(day) || [];
  const filters = [['all', tr('Tous'), () => true], ['done', tr('Terminés'), (i) => skPlayed(d, i)], ['up', tr('À venir'), (i) => !skPlayed(d, i)], ['mine', tr('Mes compétitions'), (i) => d.comps[d.matches[i][2]].mine]];
  const fl = filters.find(([k]) => k === view.skFilter) || filters[0];
  const list = ids.filter(fl[2]);
  const days = Array.from({ length: 7 }, (_, k) => skAdd(day, k - 3));
  const groups = new Map();
  for (const i of list) { const ci = d.matches[i][2]; if (!groups.has(ci)) groups.set(ci, []); groups.get(ci).push(i); }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const shown = view.skMore ? sorted : sorted.slice(0, 10);
  const fold = view.skFold || {};
  const anyMine = shown.some(([ci]) => d.comps[ci].mine);
  const ti = skTableIndex(d);
  const n = s.next, l = s.last?.played ? s.last : null;
  const mine = (f, title, mid) => (f ? scCard(title, `<div class="sc-vs"><span>${scCrest(f.home, 36)}<em>${esc(f.home)}</em></span><b>${mid}</b><span>${scCrest(f.away, 36)}<em>${esc(f.away)}</em></span></div><p class="sc-fine">${esc(gzShort(f.competition))} · ${esc(fmtDate(f.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${f.stadium ? ` · ${esc(f.stadium)}` : ''}</p>`, { foot: (() => { const i = d.byKey.get(`${f.date}|${f.homeRef}|${f.awayRef}`); return i !== undefined ? scMore(tr('Voir le match'), 'open', i) : ''; })() }) : '');
  const nextIn = n ? sfDays(s.gameDate, n.date) : 0;
  return { html: `<header class="sc-head"><div><h1>${tr('Scores')}</h1><p>${esc(fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div></header>
    <div class="sc-dates"><button data-sk="day" data-v="${skAdd(day, -7)}" aria-label="${tr('Semaine précédente')}">${sfi('prev')}</button>${days.map((x) => `<button class="${x === day ? 'on' : ''}" data-sk="day" data-v="${x}">${x === today ? tr('Aujourd’hui') : esc(fmtDate(x, { weekday: 'short', day: 'numeric', month: 'short' }))}</button>`).join('')}<button data-sk="day" data-v="${skAdd(day, 7)}" aria-label="${tr('Semaine suivante')}">${sfi('next')}</button></div>
    <div class="sc-cols"><div class="sc-col">
      ${scCard(tr('Matchs'), `${shown.map(([ci, is], k) => { const c = d.comps[ci], f = fold[c.key] ?? (anyMine ? !c.mine : k > 0); return `<div class="sc-gh"><span class="sc-link" role="link" tabindex="0" data-sk="comp" data-v="${ci}">${skLogo(c.name, 20)}${esc(c.name)}${c.country ? ` <small>${esc(c.country)}</small>` : ''}</span><small>${trn(is.length, '{n} match', '{n} matchs')}</small><button class="sc-fold" data-sk="fold" data-v="${esc(c.key)}" data-f="${f ? 1 : 0}" aria-label="${f ? tr('Déplier {name}', { name: esc(c.name) }) : tr('Replier {name}', { name: esc(c.name) })}">${sfi(f ? 'next' : 'down')}</button></div>${f ? '' : is.map((i) => scRow(d, i, c.kind === 'league' ? `<small>${tr('J{n}', { n: d.matches[i][3] })}</small>` : '')).join('')}`; }).join('') || scEmpty(tr('Aucun match ce jour-là'), tr('Choisis un autre jour dans la frise.'))}
        ${sorted.length > shown.length ? `<button class="sc-more" data-sk="more"><span>${trn(sorted.length - shown.length, 'Afficher l’autre compétition', 'Afficher les {n} autres compétitions')}</span>${sfi('down')}</button>` : ''}`, { end: scPills(filters.map(([k, lab, f]) => [k, `${lab} ${ids.filter(f).length}`]), fl[0], 'filter') })}
    </div><div class="sc-col sc-col-side">
      ${mine(n, `${tr('Prochain match')} <span class="sc-tag">${nextIn <= 0 ? tr('Aujourd’hui') : nextIn === 1 ? tr('Demain') : tr('Dans {n} jours', { n: nextIn })}</span>`, n?.hour != null ? hh(n.hour) : 'vs')}
      ${mine(l, tr('Dernier match'), l ? `${l.score[0]} – ${l.score[1]}` : '')}
      ${ti >= 0 ? scTable(d, ti, { limit: 7, foot: d.leagues.length > 1 ? `<div class="sc-arrows"><button data-sk="table" data-v="-1" aria-label="${tr('Championnat précédent')}">${sfi('prev')}</button><button data-sk="comp" data-v="${ti}">${tr('Tout le classement')}</button><button data-sk="table" data-v="1" aria-label="${tr('Championnat suivant')}">${sfi('next')}</button></div>` : scMore(tr('Tout le classement'), 'comp', ti) }) : ''}
      ${scPotm(d)}
    </div></div>` };
}

// ----- Rubrique Compétitions : l'aperçu, puis les matchs, le classement, les buteurs, les meilleurs joueurs, les équipes -----
function scCompIndex(d) { return Number.isInteger(view.skComp) && d.comps[view.skComp] ? view.skComp : Math.max(0, d.comps.findIndex((c) => c.main)); }
function scComp(d) {
  const ci = scCompIndex(d), c = d.comps[ci], ms = d.byComp.get(ci) || [];
  const tabs = [['over', tr('Aperçu')], ['results', tr('Matchs')], ...(c.table ? [['table', tr('Classement')]] : []), ['scorers', tr('Buteurs')], ...(c.best?.length ? [['best', tr('Meilleurs joueurs')]] : []), ['teams', tr('Équipes')]];
  const tab = tabs.some(([k]) => k === view.skCompTab) ? view.skCompTab : 'over';
  const teams = [...new Set(ms.flatMap((i) => [d.matches[i][4], d.matches[i][5]]))].sort((a, b) => skName(d, a).localeCompare(skName(d, b), locale()));
  const played = ms.filter((i) => skPlayed(d, i));
  const rounds = [...new Set(ms.map((i) => d.matches[i][3]))].sort((a, b) => a - b);
  const lastRound = played.length ? Math.max(...played.map((i) => d.matches[i][3])) : rounds[0];
  const round = rounds.includes(view.skRound) ? view.skRound : lastRound;
  const k = rounds.indexOf(round);
  const head = `<header class="sc-head sc-head-comp">${skLogo(c.name, 56)}<div><h1>${esc(c.name)}</h1><p>${esc([c.country, state.snapshot.season, c.kind === 'league' ? trn(teams.length, '{n} équipe', '{n} équipes') : trn(played.length, '{n} match joué sur {total}', '{n} matchs joués sur {total}', { total: ms.length })].filter(Boolean).join(' · '))}</p></div>${c.mine ? `<span class="sc-tag">${tr('Ta compétition')}</span>` : ''}${scTabs(tabs, tab, 'ctab')}</header>`;
  const roundNav = `<div class="sc-roundnav"><button data-sk="round" data-v="${rounds[Math.max(0, k - 1)]}"${k <= 0 ? ' disabled' : ''} aria-label="${tr('Journée précédente')}">${sfi('prev')}</button><b>${c.kind === 'league' ? roundLabel(round) : tr('Tour {n}', { n: round })}</b><button data-sk="round" data-v="${rounds[Math.min(rounds.length - 1, k + 1)]}"${k >= rounds.length - 1 ? ' disabled' : ''} aria-label="${tr('Journée suivante')}">${sfi('next')}</button></div>`;
  let body;
  if (tab === 'over') {
    const pills = [['all', tr('Tous')], ['done', tr('Résultats')], ['up', tr('À venir')]];
    const pill = pills.some(([x]) => x === view.scPill) ? view.scPill : 'all';
    const inRound = ms.filter((i) => d.matches[i][3] === round);
    const list = inRound.filter((i) => pill === 'all' || (pill === 'done' ? skPlayed(d, i) : !skPlayed(d, i)));
    if (!inRound.includes(view.scPick)) view.scPick = inRound.find((i) => d.matches[i][4] === d.clubRef || d.matches[i][5] === d.clubRef) ?? inRound.find((i) => skPlayed(d, i)) ?? inRound[0];
    body = `<div class="sc-grid-over">
      ${scCard(tr('Matchs'), `${scPills(pills, pill, 'mpill')}${roundNav}<div class="sc-mlist">${scByDate(d, list, 'pick') || scEmpty(tr('Aucun match'))}</div>`, { cls: 'sc-compact', foot: scMore(tr('Tous les matchs'), 'ctab', 'results') })}
      ${view.scPick !== undefined ? scMatchCard(d, view.scPick) : ''}
      ${c.table ? scTable(d, ci, { limit: 8, foot: scMore(tr('Tout le classement'), 'ctab', 'table') }) : scPotm(d)}
      ${scLeadersCard(d, ci)}
      ${scTotw(d, ci) || scPotm(d)}
    </div>`;
  } else if (tab === 'results') {
    const list = ms.filter((i) => d.matches[i][3] === round);
    body = c.kind === 'league' ? scCard('', `${roundNav}${scByDate(d, list)}`) : (() => { const done = played.slice(-30).reverse(), up = ms.filter((i) => !skPlayed(d, i) && d.matches[i][0] >= d.gameDate).slice(0, 15); return scCard('', `${up.length ? `<div class="sc-gh"><span>${tr('À venir')}</span></div>${scByDate(d, up)}` : ''}${done.length ? `<div class="sc-gh"><span>${tr('Derniers résultats')}</span></div>${scByDate(d, done)}` : ''}${!up.length && !done.length ? scEmpty(tr('Aucun match')) : ''}`); })();
  } else if (tab === 'table') {
    body = scTable(d, ci);
  } else if (tab === 'scorers') {
    body = scCard('', c.scorers.length ? `<table class="sc-t"><thead><tr><th>#</th><th>${tr('Joueur')}</th><th>${tr('Équipe')}</th><th class="n">${tr('Buts')}</th><th class="n">${tr('PD')}</th><th class="n">${tr('MJ')}</th></tr></thead><tbody>
      ${c.scorers.map((x, n) => `<tr class="${scIsMe(x[0]) ? 'us' : ''}"><td>${n + 1}</td><td${x[0] ? '' : ' class="sc-mut"'}>${esc(x[0] || tr('Joueur inconnu'))}</td><td class="sc-cut"><span class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${x[1]}">${scCrest(skName(d, x[1]), 18)}<span>${esc(skName(d, x[1]))}</span></span></td><td class="n"><b>${x[2]}</b></td><td class="n">${x[3]}</td><td class="n">${x[4]}</td></tr>`).join('')}</tbody></table>` : scEmpty(tr('Pas encore de but marqué')));
  } else if (tab === 'best') {
    body = scCard('', `<table class="sc-t"><thead><tr><th>#</th><th>${tr('Joueur')}</th><th>${tr('Équipe')}</th><th>${tr('Poste')}</th><th class="n">${tr('MJ')}</th><th class="n">${tr('Note')}</th><th class="n">${tr('Buts')}</th><th class="n">${tr('PD')}</th></tr></thead><tbody>
      ${c.best.map((x, n) => `<tr class="${scIsMe(x[0]) ? 'us' : ''}"><td>${n + 1}</td><td>${esc(x[0])}</td><td class="sc-cut"><span class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${x[1]}">${scCrest(skName(d, x[1]), 18)}<span>${esc(skName(d, x[1]))}</span></span></td><td>${esc(tr(LINE_LABEL[x[6]] || ''))}</td><td class="n">${x[2]}</td><td class="n">${ratingChip(x[3])}</td><td class="n">${x[4]}</td><td class="n">${x[5]}</td></tr>`).join('')}</tbody></table><p class="sc-fine">${tr('Note moyenne des matchs d’au moins 45 minutes, d’après les notes du jeu.')}</p>`);
  } else {
    body = scCard('', `<div class="sc-teams">${teams.map((ref) => `<button class="${ref === d.clubRef ? 'us' : ''}" data-sk="team" data-v="${ref}">${scCrest(skName(d, ref), 56)}<span>${esc(skName(d, ref))}</span></button>`).join('')}</div>`);
  }
  return { html: head + body };
}
const LINE_LABEL = { gk: 'Gardien', def: 'Défense', mid: 'Milieu', att: 'Attaque' };

// ----- La page d'un match -----
// Un terrain à moitié : le gardien près de son but, l'attaque vers le milieu. La note sur chaque joueur, lui en surbrillance.
function scLineup(d, i, side) {
  const lu = d.details[i].lu, known = lu.every((l) => l.every((p) => p[6] !== undefined));
  const lines = skLines(lu[side], known);
  const form = lines.slice(1).map((l) => l.length).join('-');
  const avg = scMean(lu[side].filter((p) => p[3] > 0).map((p) => p[3]));
  const name = skName(d, d.matches[i][4 + side]);
  const player = (p) => `<div class="sc-ppl${scIsMe(p[0]) ? ' me' : ''}" title="${esc(`${p[0] || tr('Inconnu')}${known && skPos(p[6]) ? ` · ${skPos(p[6])}` : ''}`)}"><span class="sc-ppl-d"><span class="sc-dot">${faceIn(p[0], esc(known ? skPos(p[6]) || '?' : String(p[0] || '?')[0]))}</span>${ratingChip(p[3])}</span><b>${esc(scSurname(p[0]) || tr('Inconnu'))}</b></div>`;
  const rows = (side === 0 ? lines : [...lines].reverse()).map((l) => `<div class="sc-pline">${l.map(player).join('')}</div>`).join('');
  return `<div class="sc-lu${side ? ' away' : ''}"><header>${scCrest(name, 22)}<span><b>${esc(name)}</b>${form ? `<small>${esc(form)}</small>` : ''}</span>${ratingChip(avg)}</header><div class="sc-half">${scHalfLines}${rows}</div></div>`;
}
const scSubs = (d, i) => `<div class="sc-subs">${d.details[i].lu.map((lu, s) => `<div><h5>${scCrest(skName(d, d.matches[i][4 + s]), 18)}${tr('Entrés en jeu')}</h5>${lu.filter((p) => !p[1]).map((p) => `<span class="${scIsMe(p[0]) ? 'me' : ''}">${p[0] ? scFace(p[0], null, 24) : ''}${esc(p[0] || tr('Inconnu'))} <small>${tr('{n} min', { n: p[2] })}</small>${ratingChip(p[3])}</span>`).join('') || `<span class="sc-mut">${tr('Aucun')}</span>`}</div>`).join('')}</div>`;
// Les notes des deux équipes en miroir, joueur par joueur, du gardien à l'attaque.
function scMirror(d, i) {
  const lu = d.details?.[i]?.lu;
  if (!lu) return '';
  const sides = lu.map((l) => l.filter((p) => p[3] > 0).sort((a, b) => (a[1] === b[1] ? (a[6] ?? 0) - (b[6] ?? 0) : b[1] - a[1])));
  const W = 640, H = 210, mid = H / 2, n = Math.max(...sides.map((s) => s.length), 1), slot = (W - 8) / n, bw = Math.min(26, slot - 4);
  const bar = (p, k, s) => { const h = Math.max(6, Math.min(1, (p[3] - 4) / 4) * (mid - 18)), x = 4 + k * slot + (slot - bw) / 2; return `<g><title>${esc(`${p[0] || tr('Inconnu')} · ${sfRating(p[3])}`)}</title><rect class="${s ? 'b' : 'a'}${scIsMe(p[0]) ? ' me' : ''}" x="${x.toFixed(1)}" y="${(s ? mid + 1 : mid - 1 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>${p[4] ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(s ? mid + h + 14 : mid - h - 5).toFixed(1)}" text-anchor="middle">⚽</text>` : ''}</g>`; };
  return scCard(tr('Notes joueur par joueur'), `<svg class="sc-mirror" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Notes joueur par joueur')}"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}"/>${sides.map((l, s) => l.map((p, k) => bar(p, k, s)).join('')).join('')}</svg>
    <div class="sc-legend"><span><i class="a"></i>${esc(skName(d, d.matches[i][4]))}</span><span><i class="b"></i>${esc(skName(d, d.matches[i][5]))}</span></div>`);
}
function scTopStats(d, i) {
  const st = scSideStats(d, i);
  if (!st) return '';
  const a = st[0].avg ?? 0, b = st[1].avg ?? 0, share = a + b ? Math.round((a / (a + b)) * 100) : 50;
  const row = (l, x, y) => `<div class="sc-stat"><em>${esc(x)}</em><small>${esc(l)}</small><em>${esc(y)}</em></div>`;
  return scCard(tr('Comparaison'), `<small class="sc-split-t">${tr('Note moyenne')}</small><div class="sc-split"><i data-w="${share}"><b>${sfRating(st[0].avg)}</b></i><i data-w="${100 - share}"><b>${sfRating(st[1].avg)}</b></i></div>
    ${row(tr('Meilleure note'), sfRating(st[0].best), sfRating(st[1].best))}${row(tr('Passes D.'), st[0].assists, st[1].assists)}${row(tr('Titulaires à 7 ou plus'), st[0].seven, st[1].seven)}${row(tr('Entrés en jeu'), st[0].subs, st[1].subs)}`);
}
// Les buts et les passes, puis les entrées en jeu, de chaque côté. La minute seulement quand la sauvegarde la donne.
function scEvents(d, i) {
  const det = d.details?.[i], m = d.matches[i];
  const goals = scGoals(d, i), timed = goals.some((g) => g.minute != null);
  const line = (side, who, main, sub, mid) => { const body = `<div class="sc-ev-in">${who ? scFace(who, null, 26) : ''}<span>${main}${sub ? `<small>${sub}</small>` : ''}</span></div>`; return `<div class="sc-ev"><div>${side === 0 ? body : ''}</div><span>${mid}</span><div>${side === 1 ? body : ''}</div></div>`; };
  const list = timed
    ? goals.map((g) => line(g.side, g.name, `<b>${esc(g.name || tr('Joueur inconnu'))}</b>`, g.assist ? esc(tr('Passe D. : {name}', { name: g.assist })) : '', `${g.minute}′`))
    : (det?.ev || []).map((e) => line(e[0], e[1], `<b>${esc(e[1] || tr('Joueur inconnu'))}</b>`, [e[2] ? `${tr('But')}${e[2] > 1 ? ` ×${e[2]}` : ''}` : '', e[3] ? `${tr('Passe D.')}${e[3] > 1 ? ` ×${e[3]}` : ''}` : ''].filter(Boolean).join(' · '), e[2] ? '⚽' : '🅰️'));
  const subs = det?.lu ? det.lu.flatMap((lu, s) => lu.filter((p) => !p[1]).map((p) => line(s, p[0], esc(p[0] || tr('Inconnu')), esc(tr('Entré en jeu · {n} min', { n: p[2] })), sfi('swap')))) : [];
  return scCard(tr('Événements'), `${list.join('') || `<p class="sc-fine">${tr('Aucun but ni passe décisive.')}</p>`}${subs.join('')}<div class="sc-ev-end"><span>${tr('Fin')} · ${m[6]}-${m[7]}</span></div>${(det?.ev || []).reduce((n, e) => n + (e[2] || 0), 0) !== m[6] + m[7] ? `<p class="sc-fine">${tr('Les buts notés ne collent pas au score enregistré : pour une coupe, le jeu ne garde pas toujours la prolongation.')}</p>` : ''}${timed ? '' : `<p class="sc-fine">${tr('La sauvegarde ne garde pas la minute des buts (seulement pour le dernier match de ton club).')}</p>`}`);
}
function scMatch(d, i) {
  const m = d.matches[i], comp = d.comps[m[2]], played = skPlayed(d, i), det = d.details?.[i];
  const [h, a] = [m[4], m[5]], names = [skName(d, h), skName(d, a)], stadium = d.teams?.[h]?.[2];
  const hasLu = Boolean(det?.lu);
  const tabs = [['facts', tr('Résumé')], ...(hasLu ? [['compo', tr('Compositions')], ['notes', tr('Notes')]] : []), ['table', tr('Classement')], ['h2h', tr('Face-à-face')]];
  const tab = tabs.some(([k]) => k === view.skTab) ? view.skTab : 'facts';
  const goals = played ? scGoals(d, i) : [];
  const league = comp.table ? m[2] : d.leagues.find((k) => d.comps[k].table.some((r) => r[0] === h));
  const head = `<header class="sc-mhead">
    <div class="sc-mhead-top"><button class="sc-back" data-sk="back" aria-label="${tr('Retour')}">${sfi('prev')}</button><div><p class="sc-link" role="link" tabindex="0" data-sk="comp" data-v="${m[2]}">${skLogo(comp.name, 20)}<b>${esc(comp.name)}</b>${comp.kind === 'league' ? ` · ${esc(roundLabel(m[3]))}` : ''}</p><ul><li>${sfi('matches')}${esc(fmtDate(m[0], { day: 'numeric', month: 'long', year: 'numeric' }))}${m[1] != null ? ` · ${hh(m[1])}` : ''}</li>${stadium ? `<li>${sfi('pin')}${esc(stadium)}</li>` : ''}</ul></div></div>
    <div class="sc-mscore"><span class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${h}"><b>${esc(names[0])}</b>${scCrest(names[0], 44)}</span><div><strong>${played ? `${m[6]} – ${m[7]}` : m[1] != null ? hh(m[1]) : '–'}</strong><small>${played ? tr('Terminé') : tr('À venir')}</small></div><span class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${a}">${scCrest(names[1], 44)}<b>${esc(names[1])}</b></span></div>
    ${goals.length ? `<div class="sc-mgoals"><div>${goals.filter((g) => g.side === 0).map(scGoalChip).join('')}</div><span></span><div>${goals.filter((g) => g.side === 1).map(scGoalChip).join('')}</div></div>` : ''}
    ${det?.motm ? `<p class="sc-motm">${scFace(det.motm[0], null, 24)}${tr('Homme du match')}${colon()} <b>${esc(det.motm[0])}</b> ${ratingChip(det.motm[2])}</p>` : ''}
    ${scTabs(tabs, tab, 'mtab')}</header>`;
  let body;
  if (tab === 'facts') {
    const lu = hasLu ? scCard(tr('Compositions'), `${scLineup(d, i, 0)}${scLineup(d, i, 1)}`, { cls: 'sc-lus' }) : scCard(tr('Compositions'), `<p class="sc-fine">${played ? tr('Composition non conservée : Scoreline garde celles des 45 derniers jours et de tous les matchs de ton club.') : tr('Les compositions arrivent une fois le match joué.')}</p>`);
    const left = played ? `<div class="sc-duo">${scMirror(d, i)}${scTopStats(d, i)}</div>${scEvents(d, i)}` : `${(() => { const x = scPreviewDuels(d, i); return x ? scCard(tr('Avant le match'), `<div class="sc-duels">${x}</div>`) : ''; })()}${scH2h(d, i)}`;
    body = `<div class="sc-grid-match"><div class="sc-col">${left}</div><div class="sc-col">${lu}</div></div>`;
  } else if (tab === 'compo') {
    const known = det.lu.every((l) => l.every((p) => p[6] !== undefined));
    body = `<div class="sc-compo">${scCard('', scLineup(d, i, 0))}${scCard('', scLineup(d, i, 1))}</div>${scCard('', `${scSubs(d, i)}<p class="sc-fine">${known ? tr('Postes joués dans ce match, lus dans la sauvegarde ; le côté (gauche ou droite) n’y est pas, l’ordre sur la ligne est indicatif.') : tr('Placement indicatif : cette composition date d’avant la lecture des postes ; resynchronise pour les avoir.')}</p>`)}`;
  } else if (tab === 'notes') {
    const rows = det.lu.flatMap((lu, s) => lu.map((p) => [p, s])).sort((x, y) => y[0][3] - x[0][3]);
    body = scCard('', `<table class="sc-t"><thead><tr><th>${tr('Joueur')}</th><th>${tr('Poste')}</th><th>${tr('Équipe')}</th><th class="n">${tr('Min')}</th><th class="n">${tr('B')}</th><th class="n">${tr('PD')}</th><th class="n">${tr('Note')}</th></tr></thead><tbody>
      ${rows.map(([p, s]) => `<tr class="${scIsMe(p[0]) ? 'us' : ''}"><td>${esc(p[0] || tr('Joueur inconnu'))}${p[1] ? '' : ` <small class="sc-mut">(${tr('entré')})</small>`}</td><td class="sc-mut">${esc(skPos(p[6]) || '')}</td><td class="sc-cut">${scCrest(names[s], 18)} ${esc(names[s])}</td><td class="n">${p[2]}</td><td class="n">${p[4] || ''}</td><td class="n">${p[5] || ''}</td><td class="n">${ratingChip(p[3])}</td></tr>`).join('')}</tbody></table>`);
  } else if (tab === 'table') {
    body = league !== undefined ? scTable(d, league, { mark: [h, a] }) : scCard('', scEmpty(tr('Pas de classement pour cette compétition')));
  } else {
    body = scH2h(d, i);
  }
  return { html: head + body };
}
// Leurs autres rencontres de la saison, et la forme de chacun.
function scH2h(d, i) {
  const m = d.matches[i], [h, a] = [m[4], m[5]];
  const met = (d.byTeam.get(h) || []).filter((k) => k !== i && (d.matches[k][4] === a || d.matches[k][5] === a));
  const form = (ref) => { const done = (d.byTeam.get(ref) || []).filter((k) => skPlayed(d, k) && d.matches[k][0] <= m[0]).slice(-5); return `<div class="sc-form"><span>${scCrest(skName(d, ref), 22)}<b>${esc(skName(d, ref))}</b></span><span class="sfa-form">${done.map((k) => skBadge(skRes(d, k, ref))).join('') || '—'}</span></div>`; };
  return `${scCard(tr('Forme'), form(h) + form(a))}${scCard(tr('Autres rencontres cette saison'), met.map((k) => scRow(d, k, `<small>${esc(shortDate(d.matches[k][0]))} · ${esc(gzShort(d.comps[d.matches[k][2]].name))}</small>`)).join('') || `<p class="sc-fine">${tr('Aucune autre rencontre cette saison.')}</p>`)}`;
}

// Saison du joueur, tous clubs confondus : les clubs quittés en cours de saison (archivés par LifeLegend, avec leurs
// matchs quand l'archive les a gardés), puis le club actuel. La sauvegarde, elle, repart de zéro après un transfert.
function seasonClubs(s) {
  const past = Object.values(state.seasons || {}).filter((x) => x.season === s.season && x.club !== s.club.name)
    .sort((a, b) => String(a.lastGameDate).localeCompare(String(b.lastGameDate)));
  const fromLog = (x) => (x.log || []).map((m) => ({ date: m.date, competition: m.competition, home: m.home, away: m.away, played: true, score: m.score, me: { minutes: m.minutes, starter: m.starter, rating: m.rating, goals: m.goals, assists: m.assists } }));
  return [...past.map((x) => ({ club: x.club, stats: x.stats, byCompetition: x.byCompetition || {}, matches: fromLog(x), past: true })),
    { club: s.club.name, stats: s.stats.total, byCompetition: s.stats.byCompetition, matches: s.fixtures, past: false }];
}
// Totaux de plusieurs lignes de statistiques ; la note moyenne pondérée par les matchs joués.
function sumStats(list) {
  const t = { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0 };
  let n = 0, sum = 0;
  for (const x of list) {
    for (const k of Object.keys(t)) t[k] += x?.[k] || 0;
    if (Number.isFinite(x?.avgRating) && x.apps) { sum += x.avgRating * x.apps; n += x.apps; }
  }
  return { ...t, avgRating: n ? sum / n : null };
}

// Petites pièces des graphiques du joueur.
const scTile = (l, v, cls = '') => `<div class="sc-tile ${cls}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
const scKey = (list) => `<div class="sc-key">${list.map(([cls, l]) => `<span><i class="${cls}"></i>${esc(l)}</span>`).join('')}</div>`;
// Graduations rondes jusqu'au sommet (jamais moins de 1).
const scTicks = (top) => {
  const raw = Math.max(top, 1) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const by = Math.max(1, [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw));
  const ticks = [];
  for (let t = by; ; t += by) { ticks.push(t); if (t >= top) break; }
  return { max: ticks.at(-1), ticks };
};
// Un classement en barres : les premiers, et lui à sa vraie place s'il n'y est pas. rows : du meilleur au moins bon.
function scRankBars(title, rows, fmt = String, top = 5) {
  if (!rows.length) return '';
  const ranked = rows.map((r) => ({ ...r, rank: r.rank ?? 1 + rows.filter((x) => x.value > r.value).length }));
  const shown = ranked.slice(0, top), me = ranked.find((r) => r.me);
  const list = me && !shown.includes(me) ? [...shown, { ...me, far: true }] : shown;
  const most = Math.max(...ranked.map((r) => r.value), 0) || 1;
  return `<div class="sc-bars"><h4>${title}</h4>${list.map((r) => `<div class="sc-bar${r.me ? ' me' : ''}${r.far ? ' far' : ''}" title="${esc(r.name)}"><p><span class="r">${r.rank}</span>${scFace(r.name, r.crest, 22)}<span class="n">${esc(scSurname(r.name))}</span><b>${esc(fmt(r.value))}</b></p><span class="t"><i data-w="${Math.round((Math.max(0, r.value) / most) * 100)}"></i></span></div>`).join('')}</div>`;
}

// Les abonnés gagnés, jour de jeu par jour de jeu : ce que LifeLegend a noté (src/world/world.js).
function scFollowerGains() {
  const by = new Map();
  for (const e of state.followerLog || []) if (e.gameDate) by.set(e.gameDate, (by.get(e.gameDate) || 0) + e.gain);
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value, valueText: `+${fmtCount(value)}`, label: tr('Abonnés gagnés'), sub: fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' }) }));
}
// Notoriété au fil des synchros (src/world/notoriety.js) : abonnés Kop, valeur marchande quand le jeu la donne, cote
// médiatique sur 100. Rend la carte et ses séries (infobulles). compact : la version de l'Aperçu.
function notorietyCard({ compact = false, cls = '' } = {}) {
  const pts = state.notoriety || [];
  const series = (key, fmtV, lbl) => pts.filter((p) => Number.isFinite(p[key])).map((p) => ({ date: p.date, value: p[key], valueText: fmtV(p[key]), label: lbl, sub: fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' }) }));
  // Échelle autour des valeurs (marge de 10 %), trois graduations.
  const scale = (s) => {
    const vals = s.map((p) => p.value), lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(1, (hi - lo) * 0.1, hi * 0.02);
    const min = Math.max(0, lo - pad), max = hi + pad;
    return { min, max, ticks: [1, 2, 3].map((k) => Math.round(min + (k * (max - min)) / 4)) };
  };
  const followers = series('followers', fmtCount, tr('Abonnés Kop'));
  const value = series('value', millions, tr('Valeur marchande'));
  const score = series('score', (v) => `${v} / 100`, tr('Image dans la presse'));
  const gains = scFollowerGains();
  const size = compact ? { W: 400, H: 210 } : { W: 540, H: 210 };
  const chart = (id, s, opts) => sfLineChart(id, s, { ...size, ...opts, label: s[0]?.label || '', empty: tr('La courbe se dessinera au fil des synchros.') });
  const lastScore = score.at(-1)?.value, lastValue = value.at(-1)?.value, lastGain = gains.at(-1);
  const tiles = `<div class="sc-tiles${lastValue ? '' : ' three'}">${scTile(tr('Abonnés Kop'), fmtCount(state.profile?.followers ?? followers.at(-1)?.value ?? 0))}${scTile(tr('Dernier gain'), lastGain ? lastGain.valueText : '—', lastGain ? 'up' : '')}${scTile(tr('Image dans la presse'), Number.isFinite(lastScore) ? `${lastScore} / 100` : '—')}${lastValue ? scTile(tr('Valeur marchande'), millions(lastValue)) : ''}</div>`;
  const gainChart = gains.length ? sfColumns('sfa-gains', gains, { ...size, ...scTicks(Math.max(...gains.map((g) => g.value))), tick: fmtCount, label: tr('Abonnés gagnés') }) : `<p class="fineprint">${tr('La courbe se dessinera au fil des synchros.')}</p>`;
  // Une seule synchro connue : la jauge plutôt qu'une courbe vide.
  const press = score.length > 1 ? chart('sfa-score', score, { min: 0, max: 100, ticks: [25, 50, 75], fmt: String, tick: String })
    : Number.isFinite(lastScore) ? `<div class="sc-meter"><span><i data-w="${lastScore}"></i></span><p><b>${lastScore}</b> / 100</p></div>` : `<p class="fineprint">${tr('La courbe se dessinera au fil des synchros.')}</p>`;
  const why = `<p class="sc-fine">${tr('Image dans la presse sur 100 : la place qu’elle lui donne (articles de ses 3 dernières éditions), sa forme (notes des 5 derniers matchs), ses buts et passes, ses titularisations et l’humeur des supporters à son égard.')}</p>`;
  const block = (t, c) => `<div><h5 class="sc-sub">${esc(t)}</h5>${c}</div>`;
  const parts = compact ? [[tr('Abonnés gagnés'), gainChart], [tr('Image dans la presse'), press + why]]
    : [[tr('Abonnés gagnés'), gainChart], ...(followers.length > 1 ? [[tr('Abonnés Kop'), chart('sfa-fans', followers, { ...scale(followers), fmt: fmtCount, tick: fmtCount })]] : []),
      ...(value.length ? [[tr('Valeur marchande'), chart('sfa-value', value, { ...(value.length > 1 ? scale(value) : {}), fmt: millions, tick: millions })]] : []),
      [tr('Image dans la presse'), press]];
  return {
    html: scCard(tr('Notoriété'), `${tiles}<div class="sc-two">${parts.map(([t, c]) => block(t, c)).join('')}</div>${compact ? '' : why}`, { cls }),
    series: { 'sfa-fans': followers, 'sfa-value': value, 'sfa-score': score, 'sfa-gains': gains },
  };
}

// Le profil en radar : six familles de capacités, chacune la moyenne de ses notes du jeu sur 99.
const SC_TRAITS = [['Attaque', ['offensiveAwareness', 'finishing', 'kickingPower', 'heading']], ['Technique', ['ballControl', 'dribbling', 'tightPossession']], ['Passe', ['lowPass', 'loftedPass', 'curl', 'placeKicking']], ['Vitesse', ['speed', 'acceleration']], ['Physique', ['physicalContact', 'jump', 'balance', 'stamina']], ['Défense', ['defensiveAwareness', 'ballWinning', 'aggression']]];
const SC_TRAITS_GK = [['Vigilance', ['gkAwareness']], ['Arrêts', ['gkCatching']], ['Dégagements', ['gkClearing']], ['Réflexes', ['gkReflexes']], ['Portée', ['gkReach']], ['Physique', ['physicalContact', 'jump', 'balance', 'stamina']]];
function scRadar(prof) {
  const ab = prof?.abilities;
  if (!ab) return '';
  const traits = (prof.position === 'GB' ? SC_TRAITS_GK : SC_TRAITS).map(([l, keys]) => [tr(l), Math.round(scMean(keys.map((k) => ab[k]).filter(Number.isFinite)) || 0)]);
  const C = 130, R = 86, at = (k, r) => { const t = -Math.PI / 2 + (k * Math.PI * 2) / traits.length; return [C + Math.cos(t) * r, C + Math.sin(t) * r]; };
  const poly = (r) => traits.map((_, k) => at(k, r).map((x) => x.toFixed(1)).join(',')).join(' ');
  const shape = traits.map(([, v], k) => at(k, (Math.max(0, v - 30) / 69) * R).map((x) => x.toFixed(1)).join(',')).join(' ');
  return scCard(tr('Profil du joueur'), `<svg class="sc-radar" viewBox="-30 0 320 260" role="img" aria-label="${tr('Profil du joueur')}">
    ${[1, 0.66, 0.33].map((k) => `<polygon class="g" points="${poly(R * k)}"/>`).join('')}${traits.map((_, k) => { const [x, y] = at(k, R); return `<line class="g" x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
    <polygon class="v" points="${shape}"/>
    ${traits.map(([l, v], k) => { const [x, y] = at(k, R + 24); return `<text x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle"><tspan class="n" x="${x.toFixed(1)}">${v}</tspan><tspan class="l" x="${x.toFixed(1)}" dy="14">${esc(l)}</tspan></text>`; }).join('')}</svg>
    <p class="sc-fine">${tr('Moyenne de ses capacités par famille : notes du jeu sur 99, lues dans ta sauvegarde.')}</p>`, { cls: 'sc-traits c4' });
}

// Où il a joué, match par match : un point par match au poste de la feuille. Le côté n'est pas dans la sauvegarde.
const SC_POS_XY = { 0: [50, 92], 1: [50, 76], 2: [15, 70], 3: [50, 60], 4: [50, 48], 5: [15, 44], 6: [50, 33], 7: [50, 23], 8: [15, 20], 9: [50, 11] };
// Les postes qu'il a occupés sur ces matchs (d'après les feuilles de match).
function scPositionsPlayed(d, fixtures) {
  const me = state.snapshot.player.name, out = new Set();
  for (const f of fixtures) {
    const i = d?.byKey?.get(`${f.date}|${f.homeRef}|${f.awayRef}`);
    const row = i !== undefined ? d.details?.[i]?.lu?.flat().find((p) => p[0] === me) : null;
    if (row && row[6] !== undefined && SC_POS_XY[row[6]]) out.add(row[6]);
  }
  return out;
}
// La frise de ses matchs : une case par match, dans l'ordre ; k = le match affiché à droite.
function scMatchStrip(fixtures, k) {
  return `<div class="sc-strip">${fixtures.map((f, i) => {
    const opp = f.venue === 'domicile' ? f.away : f.home;
    const g = f.me.goals || 0;
    const title = `${opp} · ${fmtDate(f.date, { day: 'numeric', month: 'short' })} · ${f.score[0]}-${f.score[1]}${f.me.starter ? '' : ` · ${tr('Entré')}`}${g ? ` · ${trn(g, '{n} but', '{n} buts')}` : ''}`;
    return `<button type="button" class="sc-strip-m${i === k ? ' on' : ''}${f.me.starter ? '' : ' sub'}" data-sk="log" data-v="${i}" title="${esc(title)}" aria-label="${esc(title)}">${scCrest(opp, 22)}${g ? `<em class="sc-strip-goal">${g > 1 ? g : ''}</em>` : ''}${ratingChip(f.me.rating)}</button>`;
  }).join('')}</div>
  <div class="sc-legend"><span><i class="sc-lg-st"></i>${tr('Titulaire')}</span><span><i class="sc-lg-sub"></i>${tr('Entré')}</span><span><i class="sc-lg-goal"></i>${tr('But')}</span></div>`;
}

function scPosDots(d, fixtures) {
  const me = state.snapshot.player.name;
  const seen = {};
  return fixtures.map((f) => {
    const i = d?.byKey?.get(`${f.date}|${f.homeRef}|${f.awayRef}`);
    const row = i !== undefined ? d.details?.[i]?.lu?.flat().find((p) => p[0] === me) : null;
    if (!row || row[6] === undefined || !SC_POS_XY[row[6]]) return '';
    const [x0, y] = SC_POS_XY[row[6]], k = (seen[row[6]] = (seen[row[6]] || 0) + 1) - 1;
    const x = x0 === 15 ? (k % 2 ? 85 : 15) + (k >> 1) * (k % 2 ? -6 : 6) : x0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8;
    return `<i class="${row[1] ? 'st' : 'sub'}${row[4] ? ' goal' : ''}" data-l="${x}" data-t="${y}" title="${esc(`${sfMatchLabel(f)} · ${skPos(row[6]) || ''}`)}"></i>`;
  }).join('');
}

// Toutes ses capacités, rangées par famille comme le radar, avec ce que LifeLegend a vu bouger.
function scAbilities(prof) {
  const ab = prof?.abilities;
  if (!ab) return '';
  const gained = {};
  for (const x of state.progressLog || []) gained[x.ability] = (gained[x.ability] || 0) + (x.to - x.from);
  const total = Object.values(gained).reduce((a, b) => a + b, 0);
  const fams = (prof.position === 'GB' ? SC_TRAITS_GK : SC_TRAITS).map(([l, keys]) => {
    const rows = keys.filter((k) => Number.isFinite(ab[k]));
    return `<div class="sc-abil-f"><h4><span>${esc(tr(l))}</span><b>${Math.round(scMean(rows.map((k) => ab[k])) || 0)}</b></h4>${rows.map((k) => {
      const name = ABILITY_LABELS[k] || k, g = gained[name] || 0;
      return `<div class="sc-abil-r"><span>${esc(tr(name))}</span><span class="t"><i data-w="${ab[k]}"></i></span><b>${ab[k]}</b><em class="${g > 0 ? 'up' : g < 0 ? 'down' : ''}">${g > 0 ? `+${g}` : g < 0 ? g : ''}</em></div>`;
    }).join('')}</div>`;
  }).join('');
  return scCard(tr('Capacités'), `<div class="sc-abil">${fams}</div><p class="sc-fine">${tr('Notes du jeu sur 99, lues dans ta sauvegarde. Les + et − cumulent ce que LifeLegend a vu bouger depuis qu’il suit ta carrière.')}</p>`, { cls: 'c12', end: total > 0 ? `<small>${trn(total, '+{n} point depuis le début du suivi', '+{n} points depuis le début du suivi')}</small>` : '' });
}
// Comparé au reste de l'équipe, match par match, d'après les notes des compositions de la sauvegarde.
function scVsTeam(s, motm) {
  const me = s.player.name;
  const list = s.fixtures.filter((f) => f.played && Number.isFinite(f.me?.rating) && f.clubLineup?.length).map((f) => {
    const others = f.clubLineup.filter((x) => x.name !== me && Number.isFinite(x.rating)).map((x) => x.rating);
    return { f, mine: f.me.rating, team: scMean(others), rank: 1 + others.filter((r) => r > f.me.rating).length, n: others.length + 1 };
  }).filter((x) => x.team != null);
  const pts = list.map((x) => ({ date: x.f.date, value: x.mine, valueText: `${sfRating(x.mine)} · ${tr('équipe')} ${sfRating(x.team)}`, label: sfMatchLabel(x.f), sub: `${gzShort(x.f.competition)} · ${fmtDate(x.f.date, { day: 'numeric', month: 'short' })} · ${tr('{rank} sur {n} dans l’équipe', { rank: ordinal(x.rank), n: x.n })}` }));
  const gap = scMean(list.map((x) => x.mine - x.team));
  const above = list.filter((x) => x.mine > x.team).length, tops = list.filter((x) => x.rank === 1).length;
  return {
    pts,
    html: scCard(tr('Comparé à son équipe'), `<div class="sc-tiles">${scTile(tr('Écart moyen'), gap == null ? '—' : `${gap > 0 ? '+' : ''}${sfRating(gap)}`, gap > 0 ? 'up' : gap < 0 ? 'down' : '')}${scTile(tr('Au-dessus de l’équipe'), `${above} / ${list.length}`)}${scTile(tr('Meilleure note de l’équipe'), tops)}${scTile(tr('Homme du match'), motm)}</div>
      ${scKey([['a', scSurname(me)], ['b', tr('Reste de l’équipe')]])}<div class="sc-pad">${sfLineChart('sfa-vs', pts, { also: list.map((x) => x.team), label: tr('Comparé à son équipe'), W: 540, H: 200 })}</div>`, { cls: 'c6' }),
  };
}
// Domicile et extérieur (ses chiffres) ; avec et sans lui (le club, en championnat : en coupe, le score peut différer après prolongation).
function scSplits(s) {
  const mine = s.fixtures.filter((f) => f.played && f.me);
  const side = (v) => {
    const l = mine.filter((f) => f.venue === v), sum = (k) => l.reduce((n, f) => n + (f.me[k] || 0), 0);
    return { n: l.length, min: sum('minutes'), g: sum('goals'), a: sum('assists'), note: scMean(l.map((f) => f.me.rating).filter(Number.isFinite)) };
  };
  const [h, e] = [side('domicile'), side('extérieur')];
  const league = s.fixtures.filter((f) => f.played && f.score && f.competition === s.league.name);
  const agg = (l) => {
    const o = l.map((f) => { const [x, y] = f.venue === 'domicile' ? f.score : [f.score[1], f.score[0]]; return { gf: x, ga: y, r: x > y ? 'V' : x < y ? 'D' : 'N' }; });
    const per = (fn) => (l.length ? o.reduce((n, x) => n + fn(x), 0) / l.length : null);
    return { n: l.length, form: o.map((x) => x.r), pts: per((x) => (x.r === 'V' ? 3 : x.r === 'N' ? 1 : 0)), gf: per((x) => x.gf), ga: per((x) => x.ga) };
  };
  const [w, wo] = [agg(league.filter((f) => f.me)), agg(league.filter((f) => !f.me))];
  const dec = (v) => v.toLocaleString(locale(), { maximumFractionDigits: 2 });
  const who = scSurname(s.player.name);
  return scCard(tr('Répartition'), `<div class="sc-duels big"><div class="sc-duels-h"><small>${tr('Domicile')}</small><small>${tr('Extérieur')}</small></div>
      ${scDuel(tr('Matchs'), h.n, e.n)}${scDuel(tr('Minutes'), h.min, e.min)}${scDuel(tr('Buts'), h.g, e.g)}${scDuel(tr('Passes D.'), h.a, e.a)}${scDuel(tr('Note moy.'), h.note, e.note, sfRating)}</div>
    ${league.length ? `<div class="sc-duels big"><div class="sc-duels-h"><small>${esc(tr('Avec {club}', { club: who }))}</small><small>${esc(tr('Sans {club}', { club: who }))}</small></div>
      <div class="sc-duel-form"><span class="sfa-form">${w.form.map(skBadge).join('')}</span><span class="sfa-form">${wo.form.map(skBadge).join('')}</span></div>
      ${scDuel(tr('Matchs'), w.n, wo.n)}${scDuel(tr('Points / match'), w.pts, wo.pts, dec)}${scDuel(tr('Buts pour / match'), w.gf, wo.gf, dec)}${scDuel(tr('Buts contre / match'), w.ga, wo.ga, dec)}</div>
      <p class="sc-fine">${tr('Avec et sans le joueur : en championnat seulement.')}</p>` : ''}`, { cls: 'c6' });
}
// Sa place dans l'effectif et dans son championnat.
function scSquadCard(s, games, cls) {
  const sq = (s.squad || []).filter((x) => x.apps > 0 && x.name);
  if (sq.length < 2) return '';
  const minApps = Math.max(2, Math.ceil(games * 0.3));
  const rows = (list, val) => list.map((x) => ({ name: x.name, value: val(x), me: x.me })).sort((a, b) => b.value - a.value);
  const int = (v) => v.toLocaleString(locale());
  return scCard(tr('Dans l’effectif'), `<div class="sc-bars-grid">${scRankBars(tr('Note moyenne'), rows(sq.filter((x) => Number.isFinite(x.avgRating) && (x.apps >= minApps || x.me)), (x) => x.avgRating), sfRating)}${scRankBars(tr('Minutes'), rows(sq, (x) => x.minutes), int)}${scRankBars(tr('Buts + passes'), rows(sq.filter((x) => x.goals + x.assists > 0 || x.me), (x) => x.goals + x.assists))}</div>
    <p class="sc-fine">${tr('Note moyenne : au moins {n} matchs joués.', { n: minApps })}</p>`, { cls, end: `<small>${trn(sq.length, '{n} joueur utilisé', '{n} joueurs utilisés')}</small>` });
}
function scLeagueCard(s, d, cls) {
  const race = s.scorerRace;
  const scorers = (race?.top || []).map((x, k) => ({ name: x.name, value: x.goals, crest: x.team, me: x.mine, rank: k + 1 }));
  if (race?.myRank && !scorers.some((r) => r.me)) scorers.push({ name: s.player.name, value: race.myGoals, crest: s.club.name, me: true, rank: race.myRank });
  const best = (d?.comps?.find((c) => c.main)?.best || []).map((x, k) => ({ name: x[0], value: x[3], crest: skName(d, x[1]), me: scIsMe(x[0]), rank: k + 1 }));
  if (!scorers.length && !best.length) return '';
  return scCard(esc(gzShort(s.league.name)), `<div class="sc-bars-grid two">${scRankBars(tr('Buteurs'), scorers)}${scRankBars(tr('Note moyenne'), best, sfRating)}</div>
    ${best.length ? `<p class="sc-fine">${tr('Note moyenne des matchs d’au moins 45 minutes, d’après les notes du jeu.')}</p>` : ''}`, { cls });
}

// ----- Rubrique Joueur : l'aperçu, ses matchs, ses capacités, sa carrière, sa notoriété -----
function scPlayer(d) {
  const s = state.snapshot, p = s.player, prof = p.profile || {};
  const clubs = seasonClubs(s), past = clubs.filter((c) => c.past), several = past.length > 0;
  const t = several ? sumStats(clubs.map((c) => c.stats)) : s.stats.total;
  const log = clubs.flatMap((c) => c.matches.filter((f) => f.played && f.me).map((f) => ({ ...f, club: c.club })));
  const at = (f) => (several ? ` · ${f.club}` : '');
  const ratingPts = log.map((f) => ({ date: f.date, value: f.me.rating, valueText: `${sfRating(f.me.rating)} / 10`, label: sfMatchLabel(f), sub: `${gzShort(f.competition)}${at(f)} · ${fmtDate(f.date, { day: 'numeric', month: 'short' })} · ${tr('{n} min', { n: f.me.minutes })}` }));
  // Tous les matchs joués par le club : ceux qu'il a manqués comptent aussi, à zéro minute.
  const clubGames = clubs.flatMap((c) => c.matches.filter((f) => f.played).map((f) => ({ ...f, club: c.club })));
  const minutePts = clubGames.map((f) => ({ date: f.date, value: f.me?.minutes || 0, alt: Boolean(f.me && !f.me.starter), valueText: f.me ? tr('{n} min', { n: f.me.minutes }) : tr('pas joué'), label: sfMatchLabel(f), sub: `${gzShort(f.competition)}${at(f)} · ${fmtDate(f.date, { day: 'numeric', month: 'short' })}${f.me ? ` · ${f.me.starter ? tr('titulaire') : tr('entré en jeu')}` : ''}` }));
  const firstHere = log.findIndex((f) => f.club === s.club.name);
  const split = several && firstHere > 0 ? { index: firstHere, label: `→ ${s.club.name}` } : null;
  const firstGameHere = clubGames.findIndex((f) => f.club === s.club.name);
  const splitGames = several && firstGameHere > 0 ? { index: firstGameHere, label: `→ ${s.club.name}` } : null;
  const motm = s.fixtures.filter((f) => f.played && f.motm?.name === p.name).length;
  const comps = [...new Set(s.fixtures.map((f) => f.competition).filter(Boolean))];
  const tabs = [['over', tr('Aperçu')], ['matches', tr('Matchs')], ['skills', tr('Capacités')], ['career', tr('Carrière')], ['fame', tr('Notoriété')]];
  const tab = tabs.some(([k]) => k === view.scPlayerTab) ? view.scPlayerTab : 'over';
  const fl = view.sfFilter || 'all';
  const head = `<header class="sc-head sc-head-player"><p class="sc-crumb"><button data-sk="sec" data-v="scores">${tr('Scores')}</button>${sfi('next')}<b>${tr('Joueur')}</b></p>${d ? `<div class="sc-find">${sfi('search')}<input id="sc-find" type="search" placeholder="${tr('Chercher un joueur')}" autocomplete="off" aria-label="${tr('Chercher un joueur')}"><div class="sc-find-pop hidden" id="sc-find-pop"></div></div>` : ''}<span class="sc-tag sc-tag-season">${sfi('matches')}${esc(tr('saison {season}', { season: s.season || '' }))}</span>${scTabs(tabs, tab, 'ptab')}</header>`;
  const fact = (icon, label, v) => (v ? `<div>${sfi(icon)}<span><small>${esc(label)}</small><b>${esc(v)}</b></span></div>` : '');
  const totw = d?.comps?.find((c) => c.main)?.totw;
  const honours = [motm ? `${tr('Homme du match')} × ${motm}` : null, d?.potm?.me ? `${tr('Joueur du mois')} · ${monthYear(d.potm.month)}` : null, totw?.xi?.some((x) => scIsMe(x[0])) ? `${tr('Équipe type')} · ${roundLabel(totw.round)}` : null].filter(Boolean);
  const hero = `<section class="sc-card sc-hero c8" data-scclub="${esc(s.club.name)}">${crestHtml(s.club.name, ' sc-hero-mark')}
    <div class="sc-hero-main"><span class="sc-hero-face">${myFaceIn(esc(String(p.name).split(/\s+/).map((w) => w[0]).slice(0, 2).join('')))}</span>
      <div class="sc-hero-id"><h1>${esc(p.name)}</h1><p class="sc-team" role="link" tabindex="0" data-sk="team" data-v="${s.club.ref}">${scCrest(s.club.name, 22)}<span>${esc(s.club.name)}</span></p>
        <p class="sc-hero-line">${[prof.age ? trn(prof.age, '{n} an', '{n} ans') : null, p.nationality, posLabel(prof.position)].filter(Boolean).map(esc).join('<i></i>')}</p>
        <div class="sc-hero-facts">${fact('squad', tr('Taille'), prof.height ? `${prof.height} cm` : null)}${fact('stats', tr('Poids'), prof.weight ? `${prof.weight} kg` : null)}${fact('profile', tr('Pied fort'), prof.strongFoot && tr(prof.strongFoot))}${fact('nation', tr('Nationalité'), p.nationality)}${fact('career', tr('Valeur'), prof.marketValue ? millions(prof.marketValue) : null)}${fact('time', tr('Contrat'), p.contractUntil ? fmtDate(p.contractUntil, { day: 'numeric', month: 'short', year: 'numeric' }) : null)}${fact('matches', tr('Arrivée'), p.history?.joinedClub ? fmtDate(p.history.joinedClub, { day: 'numeric', month: 'short', year: 'numeric' }) : null)}${fact('career', tr('Style de jeu'), prof.playingStyle && tr(prof.playingStyle))}${fact('career', tr('Équipementier'), state.sponsor?.deal?.brand)}${fact('stats', tr('Forme'), prof.formArrow && tr(prof.formArrow))}</div>${honours.length ? `<p class="sc-hero-chips">${honours.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}</div></div>
    <div class="sc-hero-strip">${[['Matchs', t.apps], ['Titulaire', t.starts], ['Minutes', t.minutes], ['Buts', t.goals], ['Passes D.', t.assists]].map(([k, v]) => `<div><small>${tr(k)}</small><b>${v}</b></div>`).join('')}<div class="rate"><small>${tr('Note moy.')}</small><b>${sfRating(t.avgRating)}</b></div></div>
    ${several ? `<p class="sc-fine">${tr('Saison {season}, tous clubs : {clubs}.', { season: esc(s.season || ''), clubs: clubs.map((c) => `${esc(c.club)} (${trn(c.stats.apps, '{n} match', '{n} matchs')})`).join(tr(' puis ')) })}</p>` : ''}</section>`;
  const series = { 'sfa-form': ratingPts, 'sfa-minutes': minutePts };
  let body;
  if (tab === 'over') {
    const notes = log.map((f) => f.me.rating).filter(Number.isFinite);
    const best = notes.length ? Math.max(...notes) : null, low = notes.length ? Math.min(...notes) : null, lastN = notes.at(-1) ?? null, gain = notes.length > 1 ? lastN - notes[0] : null;
    const tile = scTile;
    const logos = log.map((f) => teamEmblem(f.home === f.club ? f.away : f.home));
    const form = scCard(`${tr('Forme')}${colon()} ${sfRating(t.avgRating)}`, `<div class="sc-tiles">${tile(tr('Dernier match'), sfRating(lastN))}${tile(tr('Meilleure note'), sfRating(best))}${tile(tr('Note la plus basse'), sfRating(low))}${tile(tr('Évolution'), gain == null ? '—' : `${gain > 0 ? '+' : ''}${sfRating(gain)}`, gain > 0 ? 'up' : gain < 0 ? 'down' : '')}</div><div class="sc-pad">${sfLineChart('sfa-form', ratingPts, { split, logos, W: 540, H: 210 })}</div>`, { cls: 'sc-form-card c6', end: `<small>${trn(notes.length, '{n} match noté', '{n} matchs notés')}</small>` });
    // La saison : le terrain des postes joués, puis un match à la fois.
    const shownF = s.fixtures.filter((f) => f.played && f.me && (fl === 'all' || fl === `c:${f.competition}`));
    const k = Math.max(0, Math.min(shownF.length - 1, view.scLog ?? shownF.length - 1)), f = shownF[k];
    const fi = f && d?.byKey?.get(`${f.date}|${f.homeRef}|${f.awayRef}`);
    const st = sumStats([{ apps: shownF.length, starts: shownF.filter((x) => x.me.starter).length, minutes: shownF.reduce((n, x) => n + x.me.minutes, 0), goals: shownF.reduce((n, x) => n + x.me.goals, 0), assists: shownF.reduce((n, x) => n + x.me.assists, 0), avgRating: scMean(shownF.map((x) => x.me.rating)) }]);
    const chips = [['all', `${tr('Tous')} ${s.fixtures.filter((x) => x.played && x.me).length}`], ...comps.map((c) => [`c:${c}`, `${gzShort(c)} ${s.fixtures.filter((x) => x.competition === c && x.played && x.me).length}`])];
    const season = scCard(`${esc(s.season || '')} · ${tr('Match par match')}`, `<div class="sc-season"><div>
        ${d && scPositionsPlayed(d, shownF).size >= 2 ? `<div class="sc-spitch">${scFullLines}${scPosDots(d, shownF)}</div>
        <div class="sc-legend"><span><i class="st"></i>${tr('Titulaire')}</span><span><i class="sub"></i>${tr('Entré')}</span><span><i class="goal"></i>${tr('But')}</span></div>` : scMatchStrip(shownF, k)}
        <div class="sc-tiles four">${tile(tr('Matchs'), st.apps)}${tile(tr('Buts'), st.goals)}${tile(tr('Minutes'), st.minutes)}${tile(tr('Note'), sfRating(st.avgRating))}</div></div>
      <div>${f ? `<div class="sc-lognav"><button data-sk="log" data-v="${k - 1}"${k <= 0 ? ' disabled' : ''} aria-label="${tr('Match précédent')}">${sfi('prev')}</button><span>${scCrest(f.home, 28)}<b>${f.score[0]} - ${f.score[1]}</b>${scCrest(f.away, 28)}</span><button data-sk="log" data-v="${k + 1}"${k >= shownF.length - 1 ? ' disabled' : ''} aria-label="${tr('Match suivant')}">${sfi('next')}</button></div>
        <p class="sc-fine sc-center">${esc(gzShort(f.competition))} · ${esc(fmtDate(f.date, { day: 'numeric', month: 'long' }))}</p>
        <dl class="sc-dl"><div><dt>${tr('Temps de jeu')}</dt><dd>${f.me.minutes}′</dd></div><div><dt>${tr('Statut')}</dt><dd>${f.me.starter ? tr('Titulaire') : tr('Entré')}</dd></div><div><dt>${tr('Buts')}</dt><dd>${f.me.goals}</dd></div><div><dt>${tr('Passes D.')}</dt><dd>${f.me.assists}</dd></div><div><dt>${tr('Note')}</dt><dd>${ratingChip(f.me.rating)}</dd></div></dl>
        ${fi !== undefined ? scMore(tr('Voir le match'), 'open', fi) : ''}` : scEmpty(tr('Aucun match joué.'))}
        <h5 class="sc-sub">${tr('Compétition')}</h5>${scPills(chips, fl, 'pfilter')}</div></div>`, { cls: 'sc-season-card c6' });
    // Le temps de jeu, sur le club actuel : ce qu'il a joué de ce qui était jouable (prolongations comprises).
    const here = clubGames.filter((f) => f.club === s.club.name);
    const possible = here.reduce((n, f) => n + Math.max(90, ...(f.clubLineup || []).map((x) => x.minutes || 0)), 0);
    const hereMin = here.reduce((n, f) => n + (f.me?.minutes || 0), 0), hereStarts = here.filter((f) => f.me?.starter).length;
    const share = possible ? (hereMin / possible).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 }) : '—';
    const minutes = scCard(`${tr('Temps de jeu')}${colon()} ${share}`, `<div class="sc-tiles">${tile(tr('Minutes'), possible ? `${hereMin} / ${possible}` : '—')}${tile(tr('Titulaire'), `${hereStarts} / ${here.length}`)}${tile(tr('Minutes par match'), t.apps ? `${Math.round(t.minutes / t.apps)}′` : '—')}${tile(tr('Matchs manqués'), here.filter((f) => !f.me).length)}</div>
      ${scKey([['a', tr('Titulaire')], ['b', tr('Entré')]])}<div class="sc-pad">${sfColumns('sfa-minutes', minutePts, { split: splitGames, max: Math.max(90, ...minutePts.map((x) => x.value)), W: 540, H: 200 })}</div>`, { cls: 'c6' });
    // Buts et passes cumulés, en marches.
    let goalsSum = 0, assistsSum = 0;
    const goalPts = log.map((m) => { goalsSum += m.me.goals || 0; assistsSum += m.me.assists || 0; return { date: m.date, value: goalsSum, assists: assistsSum, valueText: `${trn(goalsSum, '{n} but', '{n} buts')} · ${trn(assistsSum, '{n} passe D.', '{n} passes D.')}`, label: sfMatchLabel(m), sub: `${gzShort(m.competition)}${at(m)} · ${fmtDate(m.date, { day: 'numeric', month: 'short' })}` }; });
    const goals = scCard(tr('Buts et passes'), `<div class="sc-tiles">${tile(tr('Buts'), t.goals)}${tile(tr('Passes D.'), t.assists)}${tile(tr('Minutes par but'), t.goals ? `${Math.round(t.minutes / t.goals)}′` : '—')}${tile(tr('Buts + passes / 90 min'), t.minutes ? (((t.goals + t.assists) / t.minutes) * 90).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')}</div>
      ${scKey([['a', tr('Buts')], ['b', tr('Passes D.')]])}<div class="sc-pad">${sfLineChart('sfa-goals', goalPts, { step: true, min: 0, ...scTicks(Math.max(goalsSum, assistsSum, 1)), also: goalPts.map((x) => x.assists), fmt: String, tick: String, split, label: tr('Buts et passes'), W: 540, H: 200 })}</div>`, { cls: 'c6' });
    const vs = scVsTeam(s, motm);
    series['sfa-vs'] = vs.pts; series['sfa-goals'] = goalPts;
    // L'entraînement et la notoriété, puis la saison par compétition et le prochain match.
    const focus = p.training?.focus;
    const training = focus ? scCard(tr('Entraînement'), `<div class="sc-train">${Object.entries(TRAINING_BARS).filter(([k]) => k !== 'goalkeeping' || prof.position === 'GB').map(([k, l]) => { const v = focus[k] ?? 0; return `<div class="sc-abil-r"><span>${esc(tr(l))}</span><span class="t"><i data-w="${Math.round((v / 6) * 100)}"></i></span><b>${v}</b><em></em></div>`; }).join('')}</div><p class="sc-fine">${tr('Réglages de l’écran Entraînement du jeu, sur 6.')}</p>`, { cls: 'c4' }) : '';
    const fame = notorietyCard({ compact: true, cls: focus ? 'c8' : 'c12' });
    Object.assign(series, fame.series);
    const next = s.next, nextI = next ? d?.byKey?.get(`${next.date}|${next.homeRef}|${next.awayRef}`) : undefined;
    const days = next ? sfDays(s.gameDate, next.date) : 0;
    const nextCard = next ? scCard(tr('Prochain match'), `<div class="sc-pick-top"><span>${scCrest(next.home, 32)}<b>${esc(next.home)}</b></span><div><strong>${next.hour != null ? hh(next.hour) : 'vs'}</strong></div><span class="away"><b>${esc(next.away)}</b>${scCrest(next.away, 32)}</span></div>
      <p class="sc-fine sc-center">${esc(gzShort(next.competition))} · ${esc(fmtDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${next.stadium ? ` · ${esc(next.stadium)}` : ''}</p>${nextI !== undefined ? scMore(tr('Voir le match'), 'open', nextI) : ''}`, { cls: 'c4', end: `<small>${days <= 0 ? tr('Aujourd’hui') : days === 1 ? tr('Demain') : tr('Dans {n} jours', { n: days })}</small>` }) : '';
    const byComp = scCard(tr('Par compétition'), `<div class="sc-pad"><table class="data"><thead><tr><th></th>${['MJ', 'Tit.', 'Min', 'B', 'PD', 'Note'].map((x) => `<th class="num">${tr(x)}</th>`).join('')}</tr></thead><tbody>${Object.entries(s.stats.byCompetition).map(([c, x]) => statRow(gzShort(c), x)).join('')}${statRow(tr('Total'), s.stats.total)}</tbody></table></div>`, { cls: next ? 'c8' : 'c12' });
    const hasSquad = scSquadCard(s, here.length, ''), hasLeague = scLeagueCard(s, d, '');
    body = `<div class="sc-grid-player">${hero}${scRadar(prof) || ''}${form}${season}${vs.html}${minutes}${goals}${scSplits(s)}${scSquadCard(s, here.length, hasLeague ? 'c7' : 'c12')}${scLeagueCard(s, d, hasSquad ? 'c5' : 'c12')}${scAbilities(prof)}${fame.html}${training}${byComp}${nextCard}</div>`;
  } else if (tab === 'matches') {
    const shown = s.fixtures.filter((f) => fl === 'all' || fl === `c:${f.competition}`);
    const pastLogged = past.filter((c) => c.matches.length);
    const chips = [['all', `${tr('Tous les matchs')} ${s.fixtures.length + pastLogged.reduce((n, c) => n + c.matches.length, 0)}`], ...comps.map((c) => [`c:${c}`, `${gzShort(c)} ${s.fixtures.filter((f) => f.competition === c).length}`]), ...pastLogged.map((c) => [`club:${c.club}`, `${tr('Avec {club}', { club: c.club })} ${c.matches.length}`])];
    const myExtra = (f) => `<small>${esc(shortDate(f.date))}</small>${f.me ? `<span class="sc-me-line">${f.me.minutes}′ ${ratingChip(f.me.rating)}</span>` : f.played ? `<small>${tr('non utilisé')}</small>` : ''}`;
    const simple = (f) => `<div class="sc-m"><span class="sc-st${f.played ? '' : ' up'}">${f.played ? tr('Fin') : f.hour != null ? hh(f.hour) : '—'}</span><span class="sc-m-h"><span>${esc(f.home)}</span>${scCrest(f.home, 18)}</span><b class="sc-sc">${f.played ? `${f.score[0]} - ${f.score[1]}` : '-'}</b><span class="sc-m-a">${scCrest(f.away, 18)}<span>${esc(f.away)}</span></span><span class="sc-m-x">${myExtra(f)}</span></div>`;
    const byComp = comps.map((c) => [c, shown.filter((f) => f.competition === c)]).filter(([, fs]) => fs.length);
    const pastGroups = past.filter((c) => fl === 'all' || fl === `club:${c.club}`).map((c) => `<div class="sc-gh"><span>${scCrest(c.club, 20)}${esc(tr('Avec {club}', { club: c.club }))}</span><small>${trn(c.stats.apps, '{n} match joué', '{n} matchs joués')}</small></div>${c.matches.length ? c.matches.map(simple).join('') : `<p class="sc-fine">${esc(tr('Détail des matchs non conservé : seuls les totaux de la saison avec {club} sont connus.', { club: c.club }))}</p>`}`).join('');
    body = scCard(tr('Mes matchs'), `${byComp.map(([c, fs]) => `<div class="sc-gh"><span>${skLogo(c, 20)}${esc(c)}</span><small>${trn(fs.filter((f) => f.played).length, '{n} joué sur {total}', '{n} joués sur {total}', { total: fs.length })}</small></div>${fs.map((f) => { const i = d?.byKey?.get(`${f.date}|${f.homeRef}|${f.awayRef}`); return i !== undefined ? scRow(d, i, myExtra(f)) : simple(f); }).join('')}`).join('')}${pastGroups}` || scEmpty(tr('Aucun match')), { end: scPills(chips, fl, 'pfilter') });
  } else if (tab === 'skills') {
    let gainedSum = 0;
    const progress = (state.progressLog || []).map((x) => { gainedSum += x.to - x.from; return { date: x.gameDate, value: gainedSum, valueText: `${gainedSum > 0 ? '+' : ''}${gainedSum}`, label: `${tr(x.ability)} ${x.from} → ${x.to}`, sub: fmtDate(x.gameDate, { day: 'numeric', month: 'long', year: 'numeric' }) }; });
    series['sfa-prog'] = progress;
    const peak = Math.max(1, ...progress.map((x) => x.value)), low = Math.min(0, ...progress.map((x) => x.value));
    const progressCard = progress.length ? scCard(tr('Progression'), `<div class="sc-two"><div class="sc-pad">${sfLineChart('sfa-prog', progress, { step: true, min: low, ...scTicks(peak), fmt: (v) => `${v > 0 ? '+' : ''}${v}`, tick: String, label: tr('Progression'), empty: tr('La courbe se dessinera au fil des synchros.'), W: 540, H: 210 })}</div>
      <ul class="sc-changes">${(state.progressLog || []).slice(-8).reverse().map((x) => `<li><span>${esc(tr(x.ability))}</span><small>${esc(shortDate(x.gameDate))}</small><b>${x.from} → ${x.to}</b></li>`).join('')}</ul></div>`, { end: `<small>${trn(gainedSum, '+{n} point depuis le début du suivi', '+{n} points depuis le début du suivi')}</small>` }) : '';
    body = `${profileCard(s)}${progressCard}${trainingCard(s)}`;
  } else if (tab === 'career') {
    const compRows = several
      ? `${clubs.map((c) => `<tr class="sc-grp"><td colspan="7">${scCrest(c.club, 18)} ${esc(c.club)}</td></tr>${Object.entries(c.byCompetition).map(([k, st]) => statRow(gzShort(k), st)).join('')}`).join('')}${statRow(tr('Total saison'), t)}`
      : `${Object.entries(s.stats.byCompetition).map(([c, st]) => statRow(gzShort(c), st)).join('')}${statRow(tr('Total'), t)}`;
    const race = s.scorerRace;
    body = `${reviewCard()}${scCard(tr('Par compétition'), `<div class="sc-pad"><table class="data"><thead><tr><th></th>${['MJ', 'Tit.', 'Min', 'B', 'PD', 'Note'].map((x) => `<th class="num">${tr(x)}</th>`).join('')}</tr></thead><tbody>${compRows}</tbody></table>
      <p class="sc-fine">${tr('Course au titre de meilleur buteur')}${colon()} ${race.myRank ? trn(race.myGoals, '{rank} avec {n} but', '{rank} avec {n} buts', { rank: ordinal(race.myRank) }) : tr('pas encore classé')} · ${tr('leader')}${colon()} ${trn(race.leaderGoals, '{n} but', '{n} buts')}${race.leaderTeam ? ` (${esc(race.leaderTeam)})` : ''}.</p></div>`)}${nationalCard(s)}${careerCard(s)}`;
  } else {
    const fame = notorietyCard();
    body = fame.html;
    Object.assign(series, fame.series);
  }
  return { html: head + body, series };
}

// ----- Rubrique Équipes : résultats, effectif (buts et passes de la saison), transferts -----
function scTeam(d) {
  const ref = d.teams[view.skTeam] ? Number(view.skTeam) : d.clubRef;
  const t = d.teams[ref] || [skName(d, ref), null, null, null, []];
  const name = t[0], ms = d.byTeam.get(ref) || [];
  const li = d.comps.findIndex((c) => c.table && c.table.some((r) => r[0] === ref));
  const row = li >= 0 ? d.comps[li].table.findIndex((r) => r[0] === ref) : -1;
  const tabs = [['results', tr('Résultats')], ['squad', tr('Effectif')], ['transfers', tr('Transferts')]];
  const tab = tabs.some(([k]) => k === view.skTeamTab) ? view.skTeamTab : 'results';
  const done = ms.filter((i) => skPlayed(d, i));
  const form = done.slice(-5).map((i) => skBadge(skRes(d, i, ref))).join('');
  const head = `<header class="sc-head sc-head-comp">${scCrest(name, 56)}<div><h1>${esc(name)}</h1><p>${esc(t[2] || '')}${t[2] && t[3] ? ' · ' : ''}${t[3] ? `<span class="sc-coach"><span class="sc-pf s24">${coachFaceIn(t[3], esc(String(t[3]).trim()[0] || '?'))}</span>${tr('Entraîneur')}${colon()} ${esc(t[3])}</span>` : ''}</p>
    ${li >= 0 ? `<p><span class="sc-link" role="link" tabindex="0" data-sk="comp" data-v="${li}">${skLogo(d.comps[li].name, 18)}${esc(d.comps[li].name)}</span> · ${ordinal(row + 1)} · ${tr('{n} pts', { n: d.comps[li].table[row][7] })}</p>` : ''}</div>${form ? `<span class="sfa-form">${form}</span>` : ''}${scTabs(tabs, tab, 'ttab')}</header>`;
  let body;
  if (tab === 'results') {
    const up = ms.filter((i) => !skPlayed(d, i) && d.matches[i][0] >= d.gameDate).slice(0, 8), last = done.slice(-15).reverse();
    const rows = (list) => list.map((i) => scRow(d, i, `${skBadge(skRes(d, i, ref))}<small>${esc(shortDate(d.matches[i][0]))} · ${esc(gzShort(d.comps[d.matches[i][2]].name))}</small>`)).join('');
    body = scCard('', `${up.length ? `<div class="sc-gh"><span>${tr('Prochains matchs')}</span></div>${rows(up)}` : ''}${last.length ? `<div class="sc-gh"><span>${tr('Derniers résultats')}</span></div>${rows(last)}` : ''}${!up.length && !last.length ? scEmpty(tr('Aucun match cette saison')) : ''}`);
  } else if (tab === 'squad') {
    if (ref === d.clubRef && state.snapshot.squad?.length) {
      body = scCard('', `<table class="sc-t"><thead><tr><th>${tr('Joueur')}</th>${['MJ', 'Min', 'B', 'PD', 'Note'].map((x) => `<th class="n">${tr(x)}</th>`).join('')}</tr></thead><tbody>
        ${state.snapshot.squad.map((x) => `<tr class="${x.me ? 'us' : ''}"><td${x.name ? '' : ' class="sc-mut"'}><span class="sc-td-p">${x.name ? scFace(x.name, null, 28) : ''}<span>${esc(x.name || tr('Joueur inconnu'))}</span></span></td><td class="n">${x.apps}</td><td class="n">${x.minutes}</td><td class="n">${x.goals}</td><td class="n">${x.assists}</td><td class="n">${ratingChip(x.avgRating)}</td></tr>`).join('')}</tbody></table><p class="sc-fine">${tr('Ton club : statistiques complètes de la saison.')}</p>`);
    } else {
      const g = new Map();
      for (const i of done) {
        const side = d.matches[i][4] === ref ? 0 : 1;
        for (const e of d.details?.[i]?.ev || []) if (e[0] === side && e[1]) { const x = g.get(e[1]) || [0, 0]; x[0] += e[2]; x[1] += e[3]; g.set(e[1], x); }
      }
      const names = [...new Set([...(t[4] || []), ...g.keys()])].sort((a, b) => ((g.get(b)?.[0] || 0) - (g.get(a)?.[0] || 0)) || ((g.get(b)?.[1] || 0) - (g.get(a)?.[1] || 0)) || a.localeCompare(b, locale()));
      body = scCard('', `${names.length ? `<table class="sc-t"><thead><tr><th>${tr('Joueur')}</th><th class="n">${tr('Buts')}</th><th class="n">${tr('Passes D.')}</th></tr></thead><tbody>${names.map((n) => `<tr><td><span class="sc-td-p">${scFace(n, null, 28)}<span>${esc(n)}</span></span></td><td class="n">${g.get(n)?.[0] || ''}</td><td class="n">${g.get(n)?.[1] || ''}</td></tr>`).join('')}</tbody></table>` : scEmpty(tr('Effectif inconnu'), tr('La base du jeu ne donne pas les noms de ces joueurs.'))}<p class="sc-fine">${tr('Effectif lu dans la sauvegarde ; buts et passes de la saison, toutes compétitions.')}</p>`);
    }
  } else {
    const list = (state.transfers || []).filter((x) => x.from === name || x.to === name).slice().reverse();
    body = scCard('', list.length ? `<table class="sc-t"><thead><tr><th>${tr('Date')}</th><th>${tr('Joueur')}</th><th>${tr('Mouvement')}</th></tr></thead><tbody>${list.map((x) => `<tr><td>${esc(shortDate(x.gameDate))}</td><td><span class="sc-td-p">${scFace(x.player, null, 28)}<span>${esc(x.player)}</span></span></td><td>${x.to === name ? `<span class="sc-in">${tr('Arrivée')}</span> ${esc(tr('de {club}', { club: x.from }))}` : `<span class="sc-out">${tr('Départ')}</span> ${esc(tr('vers {club}', { club: x.to }))}`}</td></tr>`).join('')}</tbody></table>` : scEmpty(tr('Aucun transfert repéré'), tr('Scoreline note les transferts à chaque synchro, en comparant les effectifs.')));
  }
  const side = `${li >= 0 ? scTable(d, li, { limit: 7, mark: [ref], foot: scMore(tr('Tout le classement'), 'comp', li) }) : ''}${scPotm(d)}`;
  return { html: `${head}<div class="sc-cols"><div class="sc-col">${body}</div><div class="sc-col sc-col-side">${side}</div></div>` };
}

function renderStats(page) {
  if (!state) { page.innerHTML = needSync(); return; }
  const d = skData();
  if (d && view.skMatchKey) { const i = d.byKey.get(view.skMatchKey); if (i !== undefined) view.skOpen = i; view.skMatchKey = null; }
  const sec = SK_SECTIONS.some(([k]) => k === view.skSec) ? view.skSec : 'joueur';
  const openMatch = d && view.skOpen != null && d.matches[view.skOpen] ? view.skOpen : null;
  const waiting = { html: scCard('', d === undefined ? scEmpty(tr('Chargement des scores…')) : scEmpty(tr('Pas encore de scores'), tr('Lance une synchro : Scoreline y prépare les matchs, les classements et les effectifs de tout le monde du jeu.'))) };
  let out;
  if (openMatch !== null) out = scMatch(d, openMatch);
  else if (sec === 'joueur') out = scPlayer(d || null);
  else if (!d) out = waiting;
  else out = sec === 'scores' ? scHome(d) : sec === 'comps' ? scComp(d) : scTeam(d);
  const ci = d && sec === 'comps' ? scCompIndex(d) : -1;
  const yKey = openMatch !== null ? 'scMatchY' : 'scY';
  page.innerHTML = `<div class="sc${view.scMenu ? ' menu' : ''}"><div class="sc-app">
    <div class="sc-scrim" data-sk="menu"></div>
    <aside class="sc-side">${scSide(d || null, sec, ci)}</aside>
    <main class="sc-main" id="sc-main"><button class="sc-burger sc-burger-main" data-sk="menu" aria-label="${tr('Menu')}">${sfi('bars')}<b>Scoreline</b></button>${out.html}
      <p class="sc-data">${esc(tr('Données du {d}', { d: fmtDate(state.snapshot.gameDate, { day: 'numeric', month: 'short', year: 'numeric' }) }))} · ${tr('Lues dans ta sauvegarde Become a Legend à chaque synchro : matchs, compositions, classements et effectifs de tout le monde du jeu.')}</p></main>
  </div></div>`;
  // La CSP interdit les attributs style : largeurs et positions sont posées ici.
  page.querySelectorAll('.ability [data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  page.querySelectorAll('[data-w]').forEach((i) => { i.style.width = `${i.dataset.w}%`; });
  page.querySelectorAll('[data-l]').forEach((i) => { i.style.left = `${i.dataset.l}%`; i.style.top = `${i.dataset.t}%`; });
  page.querySelectorAll('[data-scclub]').forEach((el) => { const c = clubColors(el.dataset.scclub); if (c) { el.style.setProperty('--sc-club', c.primary); } });
  if (out.series) bindSfCharts(page, out.series);
  const main = page.querySelector('#sc-main');
  main.scrollTop = view[yKey] || 0;
  main.onscroll = () => { view[yKey] = main.scrollTop; };
  const side = page.querySelector('.sc-side-scroll');
  side.scrollTop = view.scSideY || 0;
  side.onscroll = () => { view.scSideY = side.scrollTop; };
  const find = page.querySelector('#sc-find');
  if (find) {
    const pop = page.querySelector('#sc-find-pop');
    find.oninput = () => {
      const q = plainText(find.value).trim();
      if (q.length < 2) { pop.classList.add('hidden'); return; }
      // Son club d'abord, puis les clubs des championnats, les sélections à la fin.
      if (!d.allPlayers) {
        const clubs = new Set(d.comps.flatMap((c) => (c.table || []).map((r) => r[0])));
        const rank = (ref) => (ref === d.clubRef ? 0 : clubs.has(ref) ? 1 : 2);
        d.allPlayers = Object.entries(d.teams).flatMap(([ref, t]) => (t[4] || []).map((n) => [n, Number(ref), plainText(n)])).sort((x, y) => rank(x[1]) - rank(y[1]));
      }
      const hits = d.allPlayers.filter((x) => x[2].includes(q)).slice(0, 8);
      pop.innerHTML = hits.map(([n, ref]) => `<button data-sk="team" data-v="${ref}" data-tab="squad">${scFace(n, skName(d, ref), 32)}<span><b>${esc(n)}</b><small>${esc(skName(d, ref))}</small></span></button>`).join('') || `<p>${tr('Aucun joueur ne correspond.')}</p>`;
      pop.classList.remove('hidden');
    };
    find.onkeydown = (ev) => { if (ev.key === 'Escape' && find.value) { ev.stopPropagation(); find.value = ''; pop.classList.add('hidden'); } };
  }
  // Change de page : on repart du haut. Sinon la page se redessine au même endroit.
  const toTop = (fn) => { fn(); view.skOpen = null; view.scMenu = false; view.scY = 0; render(); };
  page.onclick = (ev) => {
    const b = ev.target.closest('[data-sk]');
    if (current !== 'stats' || !b || !page.contains(b) || b.disabled) return;
    const v = b.dataset.v;
    switch (b.dataset.sk) {
      case 'sec': toTop(() => { view.skSec = v; }); break;
      case 'day': view.skDay = v; render(); break;
      case 'filter': view.skFilter = v; render(); break;
      case 'pfilter': view.sfFilter = v; view.scLog = null; render(); break;
      case 'open': view.skOpen = Number(v); view.skTab = null; view.scMatchY = 0; view.scMenu = false; render(); break;
      case 'back': view.skOpen = null; render(); break;
      case 'mtab': view.skTab = v; render(); break;
      case 'pick': view.scPick = Number(v); render(); break;
      case 'mpill': view.scPill = v; render(); break;
      case 'comp': toTop(() => { view.skSec = 'comps'; view.skComp = Number(v); view.skCompTab = null; view.skRound = null; view.scPick = undefined; view.scPill = null; }); break;
      case 'ctab': view.skCompTab = v; view.scY = 0; render(); break;
      case 'ptab': view.scPlayerTab = v; view.scY = 0; render(); break;
      case 'round': view.skRound = Number(v); view.scPick = undefined; render(); break;
      case 'team': toTop(() => { view.skSec = 'teams'; view.skTeam = Number(v); view.skTeamTab = b.dataset.tab || null; }); break;
      case 'ttab': view.skTeamTab = v; render(); break;
      case 'table': { const L = d?.leagues || []; if (L.length) { const cur = L.indexOf(skTableIndex(d)); view.skTable = cur + Number(v); render(); } break; }
      case 'log': view.scLog = Number(v); render(); break;
      case 'more': view.skMore = !view.skMore; render(); break;
      case 'allcomps': view.skAllComps = !view.skAllComps; render(); break;
      case 'alllands': view.scAllLands = !view.scAllLands; render(); break;
      case 'fold': view.skFold = { ...(view.skFold || {}), [v]: b.dataset.f !== '1' }; render(); break;
      case 'settings': go('settings'); break;
      case 'menu': view.scMenu = !view.scMenu; page.querySelector('.sc').classList.toggle('menu', view.scMenu); break;
      default: break;
    }
  };
  page.onkeydown = (ev) => {
    if (current !== 'stats' || ev.key !== 'Enter') return;
    const b = ev.target.closest('[data-sk][role="link"], [data-sk][role="button"]');
    if (b) { ev.preventDefault(); b.click(); }
  };
}

// ---------- Panthéon : l'encyclopédie, sa page de joueur ----------
// Disposée d'après sa référence (une page de joueur sombre) : le nom, le visuel et le profil ; la fiche ; les statistiques
// par compétition ; les records et le palmarès. Tout reste sur une page : les onglets font défiler jusqu'à la
// section. La biographie vient des chapitres que l'édition écrit quand sa carrière a un événement. Sans photo, l'écusson
// du club tient la place du visuel ; la sauvegarde ne garde ni cartons ni numéro de maillot.
function renderPantheon(page) {
  const s = state?.snapshot;
  if (!s) { page.innerHTML = empty(tr('Pas encore de page'), tr('Synchronise ta sauvegarde : Panthéon ouvrira sa page.')); return; }
  const p = s.player, prof = p.profile || {}, club = s.club.name;
  const posName = (code) => { const i = POS_CODES.indexOf(code); return i >= 0 ? tr(INF_POS[i]) : code; };
  const seasons = Object.values(state.seasons || {}).sort((a, b) => String(a.season).localeCompare(String(b.season)));
  const chapters = state.pantheon?.chapters || [];
  const date = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const photo = profileImg(state.profile?.avatar);
  const position = prof.position && posName(prof.position);

  // ----- Le haut : le nom, le visuel, le profil -----
  const words = String(p.name).trim().split(/\s+/);
  const nameHtml = words.length > 1 ? `${esc(words[0])}<br>${esc(words.slice(1).join(' '))}` : esc(p.name);
  const [firstChapter, ...nextChapters] = chapters;
  const bioWaits = state.bio?.text && !state.bio.chapter ? `<p class="pt-none">${tr('L’histoire que tu as écrite entrera dans cette page à la prochaine édition.')}</p>` : '';
  const profile = `${bioWaits}${firstChapter ? `<h3>${esc(firstChapter.title)}</h3><p>${esc(firstChapter.text)}</p>` : `<p class="pt-none">${tr('Sa biographie s’écrira au fil de sa carrière : premier match, premier but, transferts, trophées…')}</p>`}`;
  const links = [nextChapters.length ? `<a data-ptgo="pt-bio">${tr('Lire la suite')}</a>` : '', state.playerKind !== 'real' ? `<a data-ptbio>${state.bio?.text ? tr('modifier') : tr('écrire son histoire')}</a>` : ''].filter(Boolean).join('');
  const hero = `<header class="pt-hero" id="pt-top"><div class="pt-brand"><b class="ll-wordmark">Panthéon</b><span>${tr('L’encyclopédie du football')}</span></div>
    <div class="pt-hero-in">
      <div class="pt-id"><p class="pt-crumb">${esc(tr('Footballeur'))}${s.season ? ` · ${esc(s.season)}` : ''}</p><h1>${nameHtml}</h1>${position ? `<p class="pt-pos">${esc(position)}</p>` : ''}<p class="pt-club">${crestHtml(club, ' sc-crest s22')}<span>${esc(club)}</span></p></div>
      <div class="pt-visual">${photo ? `<img class="pt-photo" src="${esc(photo)}" alt="">` : `<span class="pt-face">${faceIn(p.name, crestHtml(club, ' pt-crest'))}</span>`}</div>
      <div class="pt-about"><h2>${tr('Profil du joueur')}</h2>${profile}${links ? `<p class="pt-links">${links}</p>` : ''}</div>
    </div></header>`;

  // ----- La fiche -----
  const clubsPlayed = [...new Set([...seasons.map((x) => x.club), club])];
  const facts = [[tr('Nom complet'), p.name], [tr('Âge'), prof.age ? trn(prof.age, '{n} an', '{n} ans') : null], [tr('Taille'), prof.height ? `${prof.height} cm` : null], [tr('Poids'), prof.weight ? `${prof.weight} kg` : null],
    [tr('Nationalité'), p.nationality], [tr('Pied fort'), prof.strongFoot && tr(prof.strongFoot)], [tr('Poste'), position], [tr('Style de jeu'), prof.playingStyle && tr(prof.playingStyle)],
    [tr('Arrivée au club'), p.history?.joinedClub && date(p.history.joinedClub)], [tr('Contrat'), p.contractUntil && date(p.contractUntil)], [tr('Équipementier'), state.sponsor?.deal?.brand], [tr('Valeur'), prof.marketValue ? millions(prof.marketValue) : null], [tr('Sélection'), s.nationalTeam?.name]].filter(([, v]) => v);
  const factsCard = `<section class="pt-card"><div class="pt-facts">${facts.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}<div><small>${tr('Clubs')}</small><span class="pt-clubs">${clubsPlayed.map((c) => `<span title="${esc(c)}">${crestHtml(c, ' sc-crest s22')}</span>`).join('')}</span></div></div></section>`;

  // ----- La biographie : les chapitres suivants (le premier est en haut) -----
  const bioCard = nextChapters.length ? `<section class="pt-card pt-bio" id="pt-bio"><h2>${tr('Biographie')}</h2>${nextChapters.map((c) => `<h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>`).join('')}</section>` : '';

  // ----- Les statistiques : un tableau par compétition, une ligne par saison, de la plus récente à la plus ancienne -----
  const byComp = new Map();
  for (const x of [...seasons].reverse()) {
    const list = Object.entries(x.byCompetition || {});
    for (const [c, t] of list.length ? list : [[x.league || tr('Total'), x.stats]]) {
      if (!byComp.has(c)) byComp.set(c, []);
      byComp.get(c).push({ season: x.season, club: x.club, t });
    }
  }
  const nat = s.nationalTeam;
  if (nat?.stats?.apps) byComp.set(nat.name, [{ season: s.season, club: nat.name, t: nat.stats }]);
  const compKey = byComp.has(view.ptComp) ? view.ptComp : 'all';
  const seasonList = [...new Set(seasons.map((x) => x.season))].reverse();
  const seasonKey = seasonList.includes(view.ptSeason) ? view.ptSeason : 'all';
  const cols = `<colgroup><col class="c-s"><col class="c-c"><col><col><col><col><col><col></colgroup>`;
  const head = `<thead><tr><th>${tr('Saison')}</th><th>${tr('Club')}</th><th class="n">${tr('Matchs')}</th><th class="n">${tr('Titulaire')}</th><th class="n">${tr('Buts')}</th><th class="n">${tr('Passes D.')}</th><th class="n">${tr('Minutes')}</th><th class="n">${tr('Note')}</th></tr></thead>`;
  const cells = (t) => `<td class="n">${t.apps ?? 0}</td><td class="n">${t.starts ?? 0}</td><td class="n">${t.goals ?? 0}</td><td class="n">${t.assists ?? 0}</td><td class="n">${t.minutes != null ? fmtNum(t.minutes) : '—'}</td><td class="n">${ratingChip(t.avgRating)}</td>`;
  const groups = [...byComp].filter(([c]) => compKey === 'all' || c === compKey).map(([c, rows]) => {
    const shown = rows.filter((r) => seasonKey === 'all' || r.season === seasonKey);
    if (!shown.length) return '';
    return `<div class="pt-grp"><h3>${skLogo(c, 28)}<span>${esc(c)}</span></h3><div class="pt-tw"><table class="pt-table">${cols}${head}<tbody>${shown.map((r) => `<tr><td>${esc(r.season)}</td><td class="pt-cut">${crestHtml(r.club, ' sc-crest s18')}<span>${esc(r.club)}</span></td>${cells(r.t)}</tr>`).join('')}${shown.length > 1 ? `<tr class="sum"><td colspan="2">${tr('Total')}</td>${cells(sumStats(shown.map((r) => r.t)))}</tr>` : ''}</tbody></table></div></div>`;
  }).join('');
  const clubSeasons = seasons.filter((x) => seasonKey === 'all' || x.season === seasonKey);
  const clubTotal = compKey === 'all' && clubSeasons.length ? `<div class="pt-tw"><table class="pt-table pt-grand">${cols}<tbody><tr class="sum"><td colspan="2">${tr('Total en club')}</td>${cells(sumStats(clubSeasons.map((x) => x.stats)))}</tr></tbody></table></div>` : '';
  // Le parcours : un club par ligne, avec ses saisons, ses matchs et ses buts.
  const route = [];
  for (const x of seasons) {
    const last = route.at(-1);
    if (last?.club === x.club) { last.to = x.season; last.apps += x.stats.apps; last.goals += x.stats.goals; } else route.push({ club: x.club, from: x.season, to: x.season, apps: x.stats.apps, goals: x.stats.goals });
  }
  const years = (r) => (r.from === r.to ? r.from : `${String(r.from).slice(0, 4)}-${String(r.to).slice(-4)}`);
  const routeHtml = route.length ? `<div class="pt-route"><h3>${tr('Parcours en club')}</h3><ol>${route.map((r) => `<li>${crestHtml(r.club, ' sc-crest s28')}<span><b>${esc(r.club)}</b><small>${esc(years(r))}</small></span><em>${trn(r.apps, '{n} match', '{n} matchs')} · ${trn(r.goals, '{n} but', '{n} buts')}</em></li>`).join('')}</ol></div>` : '';
  const statsCard = `<section class="pt-card" id="pt-stats"><h2>${esc(tr('Statistiques de carrière de {name}', { name: p.name }))}</h2>
    ${byComp.size ? `<div class="pt-filters"><div class="pt-filt"><button class="${compKey === 'all' ? 'on' : ''}" data-ptcomp="all">${tr('Tout')}</button>${[...byComp.keys()].map((c) => `<button class="${c === compKey ? 'on' : ''}" data-ptcomp="${esc(c)}">${esc(gzShort(c))}</button>`).join('')}</div>
      <select class="pt-select" id="pt-season" aria-label="${tr('Saison')}"><option value="all">${tr('Toutes les saisons')}</option>${seasonList.map((x) => `<option value="${esc(x)}"${x === seasonKey ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      ${groups || `<p class="pt-none">${tr('Aucun match')}</p>`}${clubTotal}${routeHtml}` : `<p class="pt-none">${tr('Pas encore de match officiel.')}</p>`}</section>`;

  // ----- Les records, à partir des matchs archivés saison par saison -----
  const games = seasons.flatMap((x) => (x.log || []).map((m) => ({ ...m, club: x.club }))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const opponent = (m) => (m.home === m.club ? m.away : m.home);
  const gameLine = (m) => `${m.home} ${m.score ? `${m.score[0]}-${m.score[1]}` : '–'} ${m.away} · ${fmtDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const top = (val) => games.reduce((a, m) => (Number.isFinite(val(m)) && val(m) > (a ? val(a) : -Infinity) ? m : a), null);
  const firstGoal = games.find((m) => m.goals > 0), bestRated = top((m) => m.rating), mostGoals = top((m) => m.goals);
  const manOfMatch = s.fixtures.filter((f) => f.played && f.motm?.name === p.name).length;
  const records = [games[0] && [opponent(games[0]), tr('Premier match'), gameLine(games[0])], firstGoal && [opponent(firstGoal), tr('Premier but'), gameLine(firstGoal)],
    bestRated && [opponent(bestRated), `${tr('Meilleure note')} · ${sfRating(bestRated.rating)}`, gameLine(bestRated)], mostGoals?.goals > 1 && [opponent(mostGoals), `${tr('Plus de buts en un match')} · ${mostGoals.goals}`, gameLine(mostGoals)],
    manOfMatch && [club, `${tr('Homme du match')} × ${manOfMatch}`, esc(tr('saison {season}', { season: s.season || '' }))]].filter(Boolean);
  const recordsCard = records.length ? `<section class="pt-card" id="pt-records"><h2>${tr('Records')}</h2><ul class="pt-pairs">${records.map(([team, t, line]) => `<li>${crestHtml(team, ' sc-crest s32')}<span><b>${esc(t)}</b><small>${esc(line)}</small></span></li>`).join('')}</ul></section>` : '';

  // ----- Le palmarès : chaque titre avec ses saisons, puis les distinctions individuelles -----
  const titles = {};
  for (const x of seasons) for (const t of x.trophies || []) (titles[t.competition] ||= []).push(x.season);
  const AWARD_LABEL = { bestPlayer: 'Meilleur joueur de la saison', topScorer: 'Meilleur buteur', topAssists: 'Meilleur passeur', bestKeeper: 'Meilleur gardien', xi: 'Équipe type de la saison' };
  const aw = state.awards || {};
  const rounds = {};
  for (const r of aw.rounds || []) (rounds[`${r.competition} ${r.season}`] ||= []).push(r);
  const distinctions = [...Object.entries(aw.seasons || {}).flatMap(([season, x]) => (x.won || []).map((k) => [tr(AWARD_LABEL[k]), `${x.competition} ${season}`])),
    ...Object.entries(rounds).flatMap(([where, rs]) => [
      ...(rs.some((r) => r.inTeam) ? [[tr('Équipe type de la journée'), `${where} : ${rs.filter((r) => r.inTeam).map((r) => roundLabel(r.round)).join(', ')}`]] : []),
      ...(rs.some((r) => r.best) ? [[tr('Joueur de la journée'), `${where} : ${rs.filter((r) => r.best).map((r) => roundLabel(r.round)).join(', ')}`]] : [])])];
  const pair = (t, line) => `<li><i>${sfi('career')}</i><span><b>${esc(t)}</b><small>${esc(line)}</small></span></li>`;
  const honoursCard = `<section class="pt-card" id="pt-honours"><h2>${tr('Palmarès')}</h2>${Object.keys(titles).length ? `<ul class="pt-pairs">${Object.entries(titles).map(([c, ss]) => pair(c, ss.join(', '))).join('')}</ul>` : `<p class="pt-none pt-center">${tr('Aucun titre pour l’instant.')}</p>`}
    ${distinctions.length ? `<h3 class="pt-center">${tr('Distinctions individuelles')}</h3><ul class="pt-pairs">${distinctions.map(([t, line]) => pair(t, line)).join('')}</ul>` : ''}</section>`;

  // ----- Les onglets et le pied de page -----
  const sections = [['pt-top', 'Profil'], ...(nextChapters.length ? [['pt-bio', 'Biographie']] : []), ['pt-stats', 'Statistiques'], ...(records.length ? [['pt-records', 'Records']] : []), ['pt-honours', 'Palmarès']];
  const tabs = `<nav class="pt-tabs" aria-label="${tr('Sommaire')}">${sections.map(([id, t], k) => `<button class="${k ? '' : 'on'}" data-ptgo="${id}">${esc(tr(t))}</button>`).join('')}</nav>`;
  const foot = `<footer class="pt-foot"><div class="pt-foot-in"><div class="pt-foot-about"><b>Panthéon</b>${chapters.length ? `<p>${tr('Dernière modification de cette page : {date}.', { date: esc(date(chapters.at(-1).gameDate)) })}</p>` : ''}<p>${tr('Panthéon est l’encyclopédie fictive de LifeLegend : la biographie est écrite par l’IA à partir de ta sauvegarde et de l’histoire que tu lui donnes.')}</p></div>
    <nav><h4>${tr('Sur cette page')}</h4>${sections.map(([id, t]) => `<a data-ptgo="${id}">${esc(tr(t))}</a>`).join('')}</nav>
    <nav><h4>${tr('Sur LifeLegend')}</h4><a data-ptsite="national">La Transversale</a><a data-ptsite="tribune">Kop</a><a data-ptsite="mail">Mails</a><a data-ptsite="stats">Scoreline</a></nav></div></footer>`;
  page.innerHTML = `<div class="pt">${hero}${tabs}<div class="pt-body">${factsCard}${bioCard}${statsCard}${recordsCard}${honoursCard}</div>${foot}<button class="pt-up" id="pt-up" aria-label="${tr('Retour en haut')}" title="${tr('Retour en haut')}">${sfi('up')}</button></div>`;

  ptPaintColors();
  const toTop = () => viewScrollTo(0, true);
  page.querySelector('#pt-up').onclick = toTop;
  page.querySelectorAll('[data-ptgo]').forEach((a) => { a.onclick = () => { ptPinned = a.dataset.ptgo; if (ptPinned === 'pt-top') toTop(); else document.getElementById(ptPinned)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); ptArrived = false; ptScrollSpy(); }; });
  page.querySelectorAll('[data-ptbio]').forEach((a) => { a.onclick = () => openSettings('rg-mebio'); });
  page.querySelectorAll('[data-ptsite]').forEach((a) => { a.onclick = () => go(a.dataset.ptsite); });
  page.querySelectorAll('[data-ptcomp]').forEach((b) => { b.onclick = () => { view.ptComp = b.dataset.ptcomp; renderPantheon(page); }; });
  const pick = page.querySelector('#pt-season');
  if (pick) pick.onchange = () => { view.ptSeason = pick.value; renderPantheon(page); };
  ptScrollSpy();
}
function ptPaintColors() {
  const box = document.querySelector('.pt'), c = state?.snapshot && clubColors(state.snapshot.club.name);
  if (box && c) box.style.setProperty('--pt-c', c.primary);
}
// L'onglet de la section à l'écran, et le bouton de retour en haut. Après un clic, l'onglet choisi reste allumé tant
// qu'on ne fait pas défiler soi-même : une section du bas ne peut pas toujours monter jusqu'aux onglets.
let ptPinned = null, ptArrived = false;
['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, () => { ptPinned = null; ptArrived = false; }, { passive: true }));
addEventListener('scrollend', () => { if (ptPinned) ptArrived = true; }, { passive: true, capture: true });
function ptScrollSpy(ev) {
  const tabs = [...document.querySelectorAll('.pt-tabs button')];
  if (!tabs.length) return;
  // Un défilement après l'arrivée (la barre de défilement, par exemple) : l'onglet suit de nouveau la page.
  if (ptArrived && !ev?.type?.startsWith('scrollend')) { ptPinned = null; ptArrived = false; }
  const line = document.querySelector('.pt-tabs').getBoundingClientRect().bottom + 24;
  let on = tabs[0];
  for (const b of tabs) { const t = document.getElementById(b.dataset.ptgo); if (t && t.getBoundingClientRect().top <= line) on = b; }
  if (ptPinned) on = tabs.find((b) => b.dataset.ptgo === ptPinned) || on;
  else if (llView() && llView().scrollTop + llView().clientHeight >= llView().scrollHeight - 2) on = tabs.at(-1);
  tabs.forEach((b) => b.classList.toggle('on', b === on));
  document.getElementById('pt-up')?.classList.toggle('on', (llView()?.scrollTop || 0) > 420);
}
addEventListener('scroll', ptScrollSpy, { passive: true, capture: true });

// ---------- réglages ----------

// Réglages (refonte du 2026-11-09, sur sa référence « Settings ») : un titre, des onglets, et dans chaque onglet des
// lignes (l'intitulé à gauche, le réglage et son explication à droite) ; en bas, Annuler et Enregistrer. Tous les
// onglets restent dans la page (cachés) : Enregistrer prend aussi ce qui a changé dans un autre onglet.
const LANGS = [['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['de', 'Deutsch']];
const LANG_FLAGS = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', it: '🇮🇹', pt: '🇧🇷', de: '🇩🇪' };
const RG_TABS = [
  ['save', 'Sauvegarde', 'Où LifeLegend lit ta carrière, et ce qu’il a le droit d’y écrire.'],
  ['ai', 'Intelligence artificielle', 'Le fournisseur, le modèle et la clé qui écrivent ton monde.'],
  ['look', 'Apparence', 'La langue et les couleurs de LifeLegend.'],
  ['world', 'Le monde', 'Comment la presse et les supporters réagissent à ta carrière.'],
  ['me', 'Ton joueur', 'Ce que le monde sait de ton joueur. Son nom, son pseudo, son poste et sa photo se changent sur Kop : Profil › Éditer le profil.'],
  ['about', 'À propos', ''],
];
// L'onglet de chaque section qu'ouvrent les autres pages (« Réglages de l'IA », « Ajouter ma clé… », la bio de Panthéon).
const RG_SECTION_TAB = { 'rg-save': 'save', 'rg-key': 'save', 'rg-names': 'save', 'rg-ai': 'ai', 'rg-lang': 'look', 'rg-theme': 'look', 'rg-tone': 'world', 'rg-replays': 'world', 'rg-mebio': 'me','rg-about': 'about' };
const rgRow = (id, label, control, note = '') => `<div class="rg-row"${id ? ` id="${id}"` : ''}><div class="rg-label"><h3>${label}</h3>${note ? `<p>${note}</p>` : ''}</div><div class="rg-ctl">${control}</div></div>`;
const rgSwitch = (id, on, label, note = '') => `<label class="rg-switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span class="rg-switch-text"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span></label>`;
// Miniature d'un thème : le cadre de LifeLegend (rail, barre, blocs), clair ou sombre ; Automatique est coupé en diagonale.
// Les couleurs d'une miniature passent par data-ma (posées ensuite par rgPaintMinis : pas de style écrit dans le HTML).
const rgApp = (tone, half = false, c = null) => `<span class="rg-app rg-app--${tone}${half ? ' rg-app--half' : ''}"${c ? ` data-ma="${c.frame},${c.page},${c.accent}"` : ''}><i></i><span><b></b><em></em><em></em></span></span>`;
const rgPaintMinis = (box) => box.querySelectorAll('[data-ma]').forEach((el) => { const [f, p, a] = el.dataset.ma.split(','); el.style.setProperty('--ma-frame', f); el.style.setProperty('--ma-page', p); el.style.setProperty('--ma-accent', a); });
// Une palette : sa miniature claire, coupée en diagonale par la sombre.
const rgPalette = (colors) => ([id, name, p]) => `<label class="rg-choice"><input type="radio" name="rg-palette" value="${id}"${COLOR_KEYS.every((k) => p.light[k] === colors.light[k] && p.dark[k] === colors.dark[k]) ? ' checked' : ''}>
  <span class="rg-shot">${rgApp('light', false, p.light)}${rgApp('dark', true, p.dark)}<span class="rg-check">${hi('check')}</span></span><b>${tr(name)}</b></label>`;
const RG_COLOR_LABELS = { accent: 'Accent', frame: 'Cadre', page: 'Fond des sites' };
const rgSwatches = (mode, colors) => `<div class="rg-swatches">${COLOR_KEYS.map((k) => `<label class="rg-swatch"><input type="color" data-rgcolor="${mode}.${k}" value="${colors[mode][k]}" aria-label="${esc(tr(RG_COLOR_LABELS[k]))}"><span><b>${tr(RG_COLOR_LABELS[k])}</b><small>${colors[mode][k].toUpperCase()}</small></span></label>`).join('')}</div>`;
// Les couleurs du formulaire, pour l'aperçu et l'enregistrement.
const rgFormColors = () => themeColors(Object.fromEntries(['light', 'dark'].map((m) => [m, Object.fromEntries(COLOR_KEYS.map((k) => [k, document.querySelector(`[data-rgcolor="${m}.${k}"]`)?.value]))])));
// Aperçu en direct : le thème et les couleurs du formulaire s'appliquent tout de suite ; Annuler, ou quitter les
// réglages sans enregistrer, les efface.
function rgPreview() {
  applyTheme(document.querySelector('input[name=rg-theme]:checked')?.value || settings.theme, rgFormColors());
}
const rgTheme = ([v, name, note]) => `<label class="rg-choice"><input type="radio" name="rg-theme" value="${v}"${(settings.theme || 'auto') === v ? ' checked' : ''}>
  <span class="rg-shot">${rgApp(v === 'dark' ? 'dark' : 'light')}${v === 'auto' ? rgApp('dark', true) : ''}<span class="rg-check">${hi('check')}</span></span><b>${tr(name)}</b><small>${tr(note)}</small></label>`;
function rgShowTab(id) {
  view.rgTab = id;
  document.querySelectorAll('[data-rgpanel]').forEach((p) => { p.hidden = p.dataset.rgpanel !== id; });
  document.querySelectorAll('[data-rgtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rgtab === id)));
  rgTabInView();
  viewScrollTo(0);
}
// Sur un écran étroit, les onglets défilent : celui qui est choisi vient en vue.
function rgTabInView() {
  const b = document.querySelector('[data-rgtab][aria-selected="true"]'), bar = b?.parentElement;
  if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, b.offsetLeft - bar.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2);
}

async function renderSettings(page) {
  const prov = providers[settings.provider] || {};
  const colors = themeColors(settings.colors);
  const tabs = RG_TABS.filter(([id]) => state || id !== 'me');
  const tab = tabs.some(([id]) => id === view.rgTab) ? view.rgTab : 'save';
  const panel = (id, rows) => { const [, label, note] = RG_TABS.find(([x]) => x === id); return `<section class="rg-panel" data-rgpanel="${id}"${id === tab ? '' : ' hidden'}><div class="rg-panel-head"><h2>${tr(label)}</h2>${note ? `<p>${tr(note)}</p>` : ''}</div>${rows.join('')}</section>`; };
  page.innerHTML = `
    <div class="rg">${state ? '' : welcomeHtml(true)}
    <header class="rg-head"><h1>${tr('Réglages')}</h1></header>
    <nav class="rg-tabs" role="tablist" aria-label="${tr('Sections des réglages')}">${tabs.map(([id, label]) => `<button type="button" role="tab" data-rgtab="${id}" aria-selected="${id === tab}">${tr(label)}</button>`).join('')}</nav>
    <div class="settings rg-main">
    ${panel('save', [
    rgRow('rg-save', tr('Ta carrière'), `<div id="saves" class="saves"><p class="fineprint">${tr('Recherche des sauvegardes…')}</p></div>
      <button class="btn" id="browse">${tr('Choisir un autre fichier…')}</button>
      <p class="fineprint">${tr('Fichier choisi')}${colon()} <code id="save-path">${esc(settings.savePath || tr('aucun'))}</code></p>
      <p class="fineprint">${tr('Chaque carrière a son fichier ({first} pour {name01}, {second} pour la 02…), dans {path}. Ferme le jeu (ou sauvegarde) avant de synchroniser.', { first: '<code>BL00000000</code>', second: '<code>BL00000001</code>', name01: quote(tr('Vers une Légende 01')), path: 'Documents\\SPGAME\\Football Life\\2027\\save' })}</p>`),
    rgRow('rg-key', tr('Clé de sauvegarde'), `<div id="key-help"></div>
      <div id="key-plain"><p class="fineprint">${tr('Football Life 2027 chiffre ses sauvegardes avec sa propre clé, que LifeLegend ne fournit pas. Si tu l’as (un fichier de 64 octets), ajoute-la ici : elle reste sur ce PC.')} <span id="key-count"></span></p>
      <button class="btn" id="add-key">${tr('Ajouter une clé de sauvegarde…')}</button></div>`),
    rgRow('', tr('Synchronisation automatique'), rgSwitch('autosync', settings.autoSync, tr('Synchroniser automatiquement dès que le jeu sauvegarde la carrière'), tr('LifeLegend surveille le fichier pendant qu’il est ouvert. Active aussi la sauvegarde automatique dans les paramètres du jeu : chaque match sera alors enregistré et publié sans que tu touches à rien. Une requête à l’IA n’est envoyée que si quelque chose a vraiment changé.'))),
    rgRow('rg-names', tr('Noms des joueurs'), `<p class="fineprint">${tr('Dossier du jeu')}${colon()} <code id="game-dir">${esc(settings.gameDir || tr('détection automatique…'))}</code></p>
      <button class="btn" id="browse-game">${tr('Choisir le dossier du jeu…')}</button>
      <p class="fineprint">${tr('La sauvegarde ne contient que les numéros des autres joueurs. Leurs noms (et les écussons) sont lus dans les fichiers du jeu ou du patch, comme Football Life, seulement s’ils correspondent à ta carrière. Avec plusieurs jeux installés, LifeLegend prend pour chaque carrière celui qui lui correspond.')}</p>`),
    rgRow('', tr('Écrire dans la sauvegarde'), rgSwitch('offerredirect', settings.offerRedirect, tr('Réorientation d’offres (expérimental) : autoriser LifeLegend à modifier ma sauvegarde'), tr('Avec l’attitude « Je veux partir », ton agent peut faire passer une vraie offre reçue dans le jeu au nom d’un autre club. LifeLegend écrit alors dans ta sauvegarde, jeu fermé, et en garde une copie. Testé sur peu de carrières : laisse décoché si tu ne veux prendre aucun risque.'))
      + rgSwitch('influencewrites', settings.influenceWrites, tr('Influence : effets réels dans le jeu : autoriser LifeLegend à écrire dans ma sauvegarde les décisions de mon entraîneur et de mon club'), tr('Une formation acceptée par ton entraîneur, un transfert accepté par ton club pendant un mercato : LifeLegend les écrit dans ta sauvegarde quand tu le lui demandes, jeu fermé, et en garde une copie. La formation est vérifiée dans Football Life 2027 ; le transfert reste expérimental. Sans ces deux options, LifeLegend ne fait que lire ta sauvegarde.'))),
  ])}
    ${panel('ai', [
    rgRow('rg-ai', tr('Fournisseur'), `<select id="provider" aria-label="${tr('Fournisseur')}">${Object.entries(providers).map(([id, p]) => `<option value="${id}"${id === settings.provider ? ' selected' : ''}>${esc(tr(p.label))}</option>`).join('')}</select>`),
    rgRow('', tr('Modèle'), `<input id="model" list="models" aria-label="${tr('Modèle')}" value="${esc(settings.model)}"><datalist id="models">${(prov.models || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <label id="baseurl-wrap" class="${settings.provider === 'custom' ? '' : 'hidden'}">${tr('Adresse (Base URL)')}<input id="baseurl" value="${esc(settings.baseUrl)}" placeholder="https://…/v1"></label>`),
    rgRow('', tr('Clé API'), `<input id="apikey" type="password" aria-label="${tr('Clé API')}" placeholder="${settings.savedKeys.includes(settings.provider) ? tr('Clé enregistrée — colle une nouvelle clé pour la remplacer') : esc(prov.keyHint || tr('Colle ta clé ici'))}">
      <p class="fineprint">${tr('La clé est chiffrée avec ton compte Windows et n’est envoyée qu’au fournisseur choisi. Clés gratuites : Google AI Studio (aistudio.google.com) ou Groq (console.groq.com).')}</p>`),
    rgRow('', tr('Vérification des faits'), rgSwitch('factcheck', settings.factCheck !== false, tr('Vérifier les faits avant de publier chaque édition'), tr('Une 2e requête relit l’édition face à ta sauvegarde (scores, points, classement, minutes, buteurs) et corrige les erreurs avant publication.'))),
    rgRow('', tr('Discussions sur Kop'), rgSwitch('tribunethreads', settings.tribuneThreads !== false, tr('Faire discuter les internautes entre eux sur Kop'), tr('Après chaque édition, une requête de plus écrit les échanges sous les posts : réponses entre supporters, désaccords, l’auteur qui réplique.'))),
  ])}
    ${panel('look', [
    rgRow('rg-theme', tr('Thème'), `<div class="rg-choices">${[['auto', 'Automatique', 'Comme Windows'], ['light', 'Clair', 'Toujours clair'], ['dark', 'Sombre', 'Toujours sombre']].map(rgTheme).join('')}</div>`),
    rgRow('rg-colors', tr('Couleurs'), `<div class="rg-choices rg-palettes">${PALETTES.map(rgPalette(colors)).join('')}</div>`,
      tr('Une palette toute prête, ou tes propres couleurs juste en dessous. « Or » remet les couleurs d’origine. Les couleurs propres à chaque site (le bleu de Kop, ta ligue, ton club) ne changent pas.')),
    rgRow('', tr('Thème clair'), rgSwatches('light', colors)),
    rgRow('', tr('Thème sombre'), rgSwatches('dark', colors)),
    rgRow('rg-lang', `${tr('Langue')}${lang() === 'en' ? '' : ' · Language'}`, `<div class="rg-lang"><span class="rg-flag" id="rg-flag" aria-hidden="true">${LANG_FLAGS[lang()] || ''}</span><select id="language" aria-label="${tr('Langue de LifeLegend')}">${LANGS.map(([v, l]) => `<option value="${v}"${v === lang() ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="fineprint">${tr('Une seule langue pour tout : l’interface, et ce que l’IA écrit (articles, posts, mails, conférences de presse). Ce qui est déjà publié reste dans sa langue d’origine.')}</p>`),
  ])}
    ${panel('world', [
    rgRow('rg-tone', tr('Le ton du monde'), `<p class="fineprint">${tr('Pas de réglage de ton : la pression médiatique suit la taille de ton club et de son championnat (et l’Europe, la sélection, ta notoriété), et le drame suit l’enjeu du moment (titre, maintien, coupe, fin de mercato, crise).')}</p>`),
    rgRow('', tr('Supporters'), rgSwitch('fanvulgarity', settings.fanVulgarity !== false, tr('Supporters vulgaires après de très mauvais résultats'), tr('Le ton des supporters suit tes résultats, comme en vrai : après une soirée catastrophe, certains peuvent t’insulter et réclamer ta vente. Décoche pour qu’ils restent durs mais sans vulgarité.'))),
    rgRow('rg-replays', tr('Ralentis et vidéos'), rgSwitch('replays', settings.replays !== false, tr('Publier sur Kop les ralentis que je sauvegarde dans le jeu'), tr('La minute et le buteur du ralenti sont aussi donnés aux journalistes. Le ralenti du jeu n’est pas une vidéo : pour avoir les images, enregistre l’écran pendant que le jeu le montre avec la Xbox Game Bar ({keys} pour démarrer et arrêter). LifeLegend trouve la vidéo toute seule et l’ajoute au post du ralenti.', { keys: '<b>Win + Alt + R</b>' }))
      + `<p class="fineprint">${tr('Dossier des vidéos')}${colon()} <code id="clips-dir">${esc(settings.clipsDir || tr('Vidéos\\Captures (par défaut, captures du jeu seulement)'))}</code></p>
      <button class="btn" id="browse-clips">${tr('Choisir un autre dossier…')}</button>`),
  ])}
    ${state ? panel('me', [
    // « Ton histoire » réunit la biographie et l'ancien « Ma vie » : ses lignes, s'il en reste, s'ajoutent au texte.
    rgRow('rg-mebio', tr('Ton histoire'), `<p class="su-ask">${tr('Qui incarnes-tu ?')}</p><div class="saves su-kind">${kindOptions('rg-kind', state.playerKind)}</div>
      <textarea id="bio" aria-label="${tr('Ton histoire')}" class="${state.playerKind === 'real' ? 'hidden' : ''}" rows="10" maxlength="${BIO_MAX}">${esc([state.bio?.text, ...(state.myLife || [])].filter(Boolean).join('\n'))}</textarea>`,
      tr('D’où vient ton joueur, ses premiers clubs, son caractère, et aussi sa vie d’aujourd’hui : sa famille, sa ville, son chien… Tout le monde dans ce monde la tient pour vraie, et Panthéon en fait le premier chapitre de sa page à la prochaine édition.')),
  ]) : ''}
    ${panel('about', [
    rgRow('rg-about', tr('À propos de LifeLegend'), `<p class="fineprint">${esc(/-/.test(appVersion || '') ? tr('Version {v} · bêta', { v: appVersion }) : tr('Version {v}', { v: appVersion || '—' }))}</p>
      <p class="fineprint">${tr(REAL_PEOPLE_NOTE)}</p>
      <p class="fineprint">${tr('LifeLegend est publié sous licence MIT. Polices, icônes et mises en page reprises ont leurs propres licences : voir LICENSE et THIRD-PARTY-NOTICES.txt dans le dossier de LifeLegend.')}</p>`),
    ...(introAvailable ? [rgRow('rg-intro', tr('Animation d’ouverture'), `<button class="btn" id="rg-intro-btn" type="button">${tr('Revoir')}</button>`, tr('La courte vidéo qui ouvre LifeLegend au premier lancement. Animation réalisée avec Profounder (profounder.com), qui n’a pas de lien avec LifeLegend.'))] : []),
    rgRow('rg-report', tr('Signaler un problème'), `<button class="btn" id="rg-report-btn" type="button">${tr('Préparer le rapport')}</button>`,
      tr('LifeLegend prépare un fichier texte avec sa version, tes réglages utiles et ses derniers messages d’erreur, sans ta clé d’IA, ton adresse e-mail ni tes textes. Relis-le, puis envoie-le toi-même : rien ne part tout seul.')),
  ])}
    </div>
    <footer class="rg-foot"><p class="fineprint">${tr('Rien n’est pris en compte tant que tu n’as pas appuyé sur {button}.', { button: quote(tr('Enregistrer')) })}</p>
      <button class="btn" id="rg-cancel">${tr('Annuler')}</button><button class="btn primary" id="save-settings">${tr('Enregistrer les réglages')}</button></footer>
    </div>`;
  page.querySelectorAll('[data-rgtab]').forEach((b) => { b.onclick = () => rgShowTab(b.dataset.rgtab); });
  rgTabInView();
  if ($('#rg-intro-btn')) $('#rg-intro-btn').onclick = () => playIntro({ save: false });
  // Signaler un problème : il choisit où enregistrer le rapport, l'Explorateur le montre ; rien n'est envoyé.
  const report = $('#rg-report-btn');
  if (report) {
    report.onclick = async () => {
      report.disabled = true;
      try {
        const r = await live.makeReport(tr('Enregistrer le rapport'));
        if (r) toast(tr('Rapport enregistré. Relis-le, puis envoie-le à qui t’aide.'));
      } catch (err) { toast(err.message, true); }
      report.disabled = false;
    };
  }
  $('#language').onchange = () => { $('#rg-flag').textContent = LANG_FLAGS[$('#language').value] || ''; };
  // Annuler : on oublie ce qui n'est pas enregistré, la page se redessine sur les réglages en cours (même onglet).
  $('#rg-cancel').onclick = () => { pendingSave = null; pendingGameDir = null; pendingClipsDir = null; applyTheme(); render(); };
  // Le thème, une palette ou un nuancier : l'aperçu suit tout de suite. Une palette remplit les six nuanciers ; un
  // nuancier touché coche la palette qui lui correspond encore, ou aucune.
  rgPaintMinis(page);
  const swatch = (key) => page.querySelector(`[data-rgcolor="${key}"]`);
  const syncPalette = () => {
    const c = rgFormColors();
    page.querySelectorAll('input[name=rg-palette]').forEach((r) => { const p = PALETTES.find(([id]) => id === r.value)[2]; r.checked = COLOR_KEYS.every((k) => p.light[k] === c.light[k] && p.dark[k] === c.dark[k]); });
    page.querySelectorAll('[data-rgcolor]').forEach((i) => { i.nextElementSibling.querySelector('small').textContent = i.value.toUpperCase(); });
  };
  page.querySelectorAll('input[name=rg-theme]').forEach((r) => { r.onchange = rgPreview; });
  page.querySelectorAll('input[name=rg-palette]').forEach((r) => {
    r.onchange = () => {
      const p = PALETTES.find(([id]) => id === r.value)[2];
      for (const m of ['light', 'dark']) for (const k of COLOR_KEYS) swatch(`${m}.${k}`).value = p[m][k];
      syncPalette(); rgPreview();
    };
  });
  page.querySelectorAll('[data-rgcolor]').forEach((i) => { i.oninput = () => { syncPalette(); rgPreview(); }; });

  $('#provider').onchange = () => {
    const p = providers[$('#provider').value];
    $('#models').innerHTML = (p.models || []).map((m) => `<option value="${esc(m)}">`).join('');
    $('#model').value = p.models?.[0] || '';
    $('#baseurl-wrap').classList.toggle('hidden', $('#provider').value !== 'custom');
    $('#apikey').placeholder = settings.savedKeys.includes($('#provider').value) ? tr('Clé enregistrée — colle une nouvelle clé pour la remplacer') : (p.keyHint || tr('Colle ta clé ici'));
  };
  $('#browse').onclick = async () => {
    try {
      const r = await live.browseSave();
      if (r) { pendingSave = r.path; $('#save-path').textContent = r.path; }
    } catch (err) { toast(err.message, true); }
  };
  $('#save-settings').onclick = saveSettings;
  page.querySelectorAll('input[name=rg-kind]').forEach((r) => { r.onchange = () => $('#bio').classList.toggle('hidden', r.value === 'real'); });
  $('#browse-clips').onclick = async () => {
    try {
      const dir = await live.browseClips();
      if (dir) { pendingClipsDir = dir; $('#clips-dir').textContent = dir; }
    } catch (err) { toast(err.message, true); }
  };
  $('#browse-game').onclick = async () => {
    try {
      const dir = await live.browseGame();
      if (dir) { pendingGameDir = dir; $('#game-dir').textContent = dir; }
    } catch (err) { toast(err.message, true); }
  };
  if (!settings.gameDir) {
    live.detectGame().then((dirs) => {
      const el = $('#game-dir');
      if (el && !pendingGameDir) el.textContent = dirs.length > 1 ? tr('automatique selon la carrière, parmi {dirs}', { dirs: andJoin(dirs) }) : dirs[0] ? tr('{dir} (détecté automatiquement)', { dir: dirs[0] }) : tr('introuvable : choisis-le à la main');
    }).catch(() => {});
  }

  const showKeys = (n) => { const el = $('#key-count'); if (el) el.textContent = n ? trn(n, '({n} clé ajoutée)', '({n} clés ajoutées)') : ''; };
  live.saveKeyCount().then(showKeys).catch(() => {});
  const addKey = async () => {
    try {
      const r = await live.addSaveKey();
      if (!r) return;
      showKeys(r.count);
      keyResult(r, await fillSaves());
    } catch (err) { toast(err.message, true); }
  };
  $('#add-key').onclick = addKey;
  await fillSaves();

  // Les sauvegardes trouvées (relues après l'ajout d'une clé) ; une sauvegarde illisible dit pourquoi.
  async function fillSaves() {
    let saves = [];
    try { saves = await live.detectSaves(); } catch (err) { toast(err.message, true); }
    const box = $('#saves');
    if (!box) return saves;
    const locked = saves.some((s) => s.locked);
    $('#key-help').innerHTML = locked ? keyHelpHtml('add-key-now') : '';
    $('#key-plain').hidden = locked;
    if (locked) $('#add-key-now').onclick = addKey;
    box.innerHTML = saves.length ? saves.map((s, i) => `
      <label class="save-option"><input type="radio" name="save" value="${i}"${s.path === (pendingSave || settings.savePath) ? ' checked' : ''}${s.error ? ' disabled' : ''}>
        ${s.locked ? lockedSaveHtml(s) : `<div><b>${esc(s.player || tr('Sauvegarde illisible'))}</b> · ${esc(s.club || '')} ${s.league ? `(${esc(s.league)})` : ''}<br>
        <span class="fineprint">${esc(s.game || (s.error && tr(s.error)) || '')}${s.date ? ` · ${esc(fmtDate(s.date, { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}</span></div>`}</label>`).join('')
      : `<p class="fineprint">${tr('Aucune sauvegarde trouvée automatiquement. Utilise {button}.', { button: quote(tr('Choisir un autre fichier')) })}</p>`;
    box.querySelectorAll('input[name=save]').forEach((r) => {
      r.onchange = () => { pendingSave = saves[Number(r.value)].path; $('#save-path').textContent = pendingSave; };
    });
    return saves;
  }
}

let pendingSave = null;
let pendingGameDir = null;
let pendingClipsDir = null;

async function saveSettings() {
  const update = {
    savePath: pendingSave || settings.savePath,
    gameDir: pendingGameDir || settings.gameDir,
    provider: $('#provider').value,
    model: $('#model').value.trim(),
    baseUrl: $('#baseurl').value.trim(),
    autoSync: $('#autosync').checked,
    offerRedirect: $('#offerredirect').checked,
    influenceWrites: $('#influencewrites').checked,
    factCheck: $('#factcheck').checked,
    tribuneThreads: $('#tribunethreads').checked,
    replays: $('#replays').checked,
    clipsDir: pendingClipsDir ?? settings.clipsDir,
    language: $('#language').value,
    theme: document.querySelector('input[name=rg-theme]:checked')?.value || settings.theme || 'auto',
    colors: rgFormColors(),
    fanVulgarity: $('#fanvulgarity').checked,
  };
  const key = $('#apikey').value.trim();
  if (key) update.apiKey = key;
  try {
    settings = await live.saveSettings(update);
    // Le nom, le pseudo et le poste se changent sur Kop (Éditer le profil) : ici, « Ton histoire ». Elle contient déjà les
    // anciennes lignes de « Ma vie » : une fois l'histoire enregistrée, on les vide (pas de doublon).
    if (state && $('#bio')) {
      state = await live.saveBio({ text: $('#bio').value, kind: document.querySelector('input[name=rg-kind]:checked')?.value || null });
      if (state.myLife?.length) state = await live.saveLife([]);
    }
    pendingSave = null;
    pendingGameDir = null;
    pendingClipsDir = null;
    applyTheme();
    localizeChrome();
    toast(tr('Réglages enregistrés.'));
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- HUD : progression de l'IA ----------

const hud = { timer: null, startedAt: 0, model: '' };
const fmtElapsed = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hudTick = () => { $('#hud-time').textContent = fmtElapsed(Date.now() - hud.startedAt); };

function onAiProgress(ev) {
  // Vestiaire montre déjà « Quelqu’un écrit… » dans la conversation : pas de vignette par-dessus le champ de saisie.
  if (ev.task === 'Vestiaire') return;
  const box = $('#ai-hud');
  if (ev.done) {
    clearInterval(hud.timer);
    hud.timer = null;
    box.classList.remove('waiting');
    box.classList.toggle('error', !ev.ok);
    $('#hud-label').textContent = ev.ok ? tr('✓ Terminé') : `✕ ${tr('Interrompu (voir le message)')}`;
    $('#hud-sub').textContent = [hud.model, tr('durée {t}', { t: fmtElapsed(Date.now() - hud.startedAt) })].filter(Boolean).join(' · ');
    if (ev.ok) $('#hud-fill').style.width = '100%';
    setTimeout(() => { if (!hud.timer) box.classList.add('hidden'); }, ev.ok ? 1800 : 5000);
    return;
  }
  box.classList.remove('hidden', 'error');
  if (ev.startedAt) hud.startedAt = ev.startedAt;
  if (!hud.timer) hud.timer = setInterval(hudTick, 1000);
  hudTick();
  if (ev.phase === 'start' && ev.index === 0) hud.model = '';
  if (ev.model) hud.model = ev.model;
  $('#hud-task').textContent = tr(ev.task);
  box.style.setProperty('--hud-steps', String(ev.steps.length || 1));
  $('#hud-label').textContent = `${tr('Étape {n}/{total}', { n: ev.index + 1, total: ev.steps.length })} · ${tr(ev.label)}`;
  // Barre : étapes terminées + part estimée de l'étape en cours (taille de réponse attendue).
  const within = ev.phase === 'writing' && ev.expect ? Math.min(0.95, ev.chars / ev.expect) : 0;
  $('#hud-fill').style.width = `${Math.max(3, ((ev.index + within) / ev.steps.length) * 100)}%`;
  box.classList.toggle('waiting', ev.phase === 'waiting' || ev.phase === 'retry');
  const detail = {
    start: ev.expect ? tr('envoi de la requête…') : tr('en cours…'),
    waiting: tr('réfléchit…'),
    writing: tr('écrit… {n} caractères reçus', { n: fmtNum(ev.chars) }),
    // Limite de requêtes (quota gratuit) : le délai donné par le serveur ; sinon, serveur occupé.
    retry: ev.wait ? tr('limite de requêtes atteinte, nouvel essai dans {n} s…', { n: ev.wait }) : tr('serveur occupé, nouvel essai ({n}/2)…', { n: ev.attempt }),
    fallback: tr('{model} surchargé → bascule', { model: ev.from || tr('modèle') }),
  }[ev.phase] || '';
  $('#hud-sub').textContent = [hud.model, detail].filter(Boolean).join(' · ');
}

// ---------- synchro ----------

// Redessin en arrière-plan : jamais sur les réglages (modifs non enregistrées), ni pendant la frappe.
let pendingRender = false;
const isTyping = () => ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName);
function softRender() {
  if (current === 'settings') return;
  if (isTyping()) { pendingRender = true; return; }
  render();
}

// Synchro lancée par LifeLegend quand le jeu a réécrit la sauvegarde.
function onAutoSync(ev) {
  if (ev.phase === 'new-career') { if (!view.setup) openBioStep(ev.info); return; }
  const box = $('#synclog');
  if (ev.phase === 'start') {
    box.innerHTML = '';
    logLine(tr('Le jeu vient de sauvegarder ta carrière : synchronisation automatique…'));
    setSyncBusy(true);
    return;
  }
  setSyncBusy(false);
  if (ev.phase === 'error') {
    const f = syncFailure(ev.error);
    logLine(f.message, 'error');
    toast(withHelp(tr('Synchro automatique impossible : {error}', { error: f.message }), f.help), true, f.action);
    return;
  }
  state = ev.state;
  view.edition = null;
  softRender();
  const published = state.lastSync?.published;
  if (published) toast(tr('Nouvelle édition publiée (synchro automatique).'));
  else if (state.lastSync?.agentMail) toast(tr('Offre de contrat reçue : ton agent t’a écrit dans Mails.'));
  box.classList.add('hidden');
}

async function doSync({ bioAsked = false } = {}) {
  // Étapes de démarrage pas finies (sauvegarde, clé d'IA, biographie) : on y ramène, sans synchro vouée à l'échec.
  if (!bioAsked && setupActive()) {
    current = 'national';
    render();
    toast(tr('Termine d’abord les étapes : ta sauvegarde, ta clé d’IA, puis sa biographie. La première édition part à la fin.'));
    return false;
  }
  if (!bioAsked && state) {
    const fresh = await live.newCareerInfo().catch(() => null);
    if (fresh) { openBioStep(fresh); return false; }
  }
  let ok = false;
  setSyncBusy(true);
  const box = $('#synclog');
  box.innerHTML = '';
  logLine(tr('Synchronisation…'));
  try {
    state = await live.sync();
    view.edition = null;
    if (current === 'settings') current = 'national';
    render();
    if (state.lastSync?.published === false) {
      toast(state.lastSync.agentMail ? tr('Offre de contrat reçue : ton agent t’a écrit dans Mails.') : tr('Synchro terminée : rien de nouveau depuis la dernière fois.'));
    } else {
      toast(tr('Nouvelle édition publiée.'));
    }
    ok = true;
    if (settings.pendingBio) settings = { ...settings, pendingBio: null };
  } catch (err) {
    const f = syncFailure(err.message);
    logLine(f.message, 'error');
    toast(withHelp(tr('Synchro impossible : {error}', { error: f.message }), f.help), true, f.action);
  } finally {
    box.classList.add('hidden');
    setSyncBusy(false);
  }
  return ok;
}

init();

// L'animation d'ouverture (media/intro.mp4, la vidéo « LIFE LEGEND » qu'il a choisie) : plein écran, avec le son, puis
// un fondu. « Passer », Échap, Entrée ou Espace l'arrêtent. save : ne plus la rejouer (premier lancement).
// La vidéo est-elle là et lisible ? (la version publique ne l'a pas.) Vérifié une fois au démarrage.
let introAvailable = false;
const probeIntro = () => new Promise((resolve) => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.onloadedmetadata = () => resolve(true);
  v.onerror = () => resolve(false);
  v.src = 'media/intro.mp4';
  setTimeout(() => resolve(false), 3000);
});
function playIntro({ save = true } = {}) {
  if (!introAvailable || document.querySelector('.ll-intro')) return;
  const box = document.createElement('div');
  box.className = 'll-intro';
  box.innerHTML = `<video src="media/intro.mp4" playsinline preload="auto"></video><button type="button" class="ll-intro-skip">${tr('Passer')}</button>`;
  document.body.append(box);
  const v = box.querySelector('video');
  let done = false;
  const key = (ev) => { if (['Escape', 'Enter', ' '].includes(ev.key)) { ev.preventDefault(); ev.stopPropagation(); end(); } };
  function end() {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', key, true);
    box.classList.add('out');
    setTimeout(() => box.remove(), 600);
    if (save) live.saveSettings({ introSeen: true }).then(() => { settings.introSeen = true; }).catch(() => {});
  }
  document.addEventListener('keydown', key, true);
  v.onended = end;
  v.onerror = end;
  box.querySelector('.ll-intro-skip').onclick = end;
  // Si le son est refusé, sans le son ; si la vidéo ne part pas du tout, on passe.
  v.play().catch(() => { v.muted = true; v.play().catch(end); });
}

async function init() {
  const s = await live.getSettings();
  settings = s.settings;
  providers = s.providers;
  appVersion = s.version || '';
  applyTheme();
  localizeChrome();
  // Ce que le cadre prend sur la hauteur de la fenêtre : les sites en carte remplissent exactement ce qui reste.
  const chromeHeight = () => document.documentElement.style.setProperty('--chrome-h', `${Math.ceil(innerHeight - llView().clientHeight)}px`);
  chromeHeight();
  addEventListener('resize', chromeHeight);
  // …et quand il change de hauteur (polices chargées, barre repliée).
  new ResizeObserver(chromeHeight).observe(llView());
  document.fonts.ready.then(chromeHeight);
  state = await live.getState();
  try { appPaths = await live.paths(); } catch { /* sans dossier : pas de photo de profil */ }
  live.onSyncLog((msg) => logLine(msg));
  live.onAutoSync(onAutoSync);
  live.onProgress(onAiProgress);
  live.onMediaUpdate((s) => {
    state = s;
    softRender();
    toast(tr('Nouveau ralenti ou nouvelle vidéo sur Kop.'));
  });
  document.addEventListener('focusout', () => {
    if (pendingRender) setTimeout(() => { if (pendingRender && !isTyping()) { pendingRender = false; render(); } }, 0);
  });
  $('#sync-btn').onclick = doSync;
  document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-kgo]'); if (b) go(b.dataset.kgo); });
  $('#settings-btn').onclick = () => go('settings');
  $('#ll-home').onclick = () => go('national');
  // Échap revient d'un cran (pas en pleine saisie, ni quand une fenêtre gère sa propre touche).
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || isTyping() || document.querySelector('.k-modal-back, .tw-modal-back')) return;
    if (goBack()) ev.preventDefault();
  });
  // Sans carrière : la fenêtre de configuration (renderSetup), quel que soit le site ouvert.
  if (!settings.savePath && state) current = 'settings';
  render();
  // Tout premier lancement : l'animation d'ouverture, avant les étapes de démarrage (si la vidéo est là).
  introAvailable = await probeIntro();
  if (introAvailable && !settings.introSeen && setupActive()) playIntro();
  if (introAvailable && current === 'settings') render();
}
