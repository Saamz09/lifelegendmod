'use strict';
// « Signaler un problème » (Réglages › À propos) : un rapport en texte simple que le joueur relit, puis envoie lui-même :
// rien ne part tout seul. Il contient la version, le système, les réglages utiles (liste fermée), l'état de la carrière
// en chiffres et la fin des journaux. Jamais de clé d'IA, d'adresse e-mail, de nom d'utilisateur Windows, de nom de
// joueur ni de texte personnel (biographie, posts, mails, messages) : les chemins et les journaux sont nettoyés.

const os = require('os');

const SETTINGS = ['provider', 'model', 'language', 'theme', 'autoSync', 'factCheck', 'tribuneThreads', 'transversaleBrief', 'replays', 'offerRedirect', 'influenceWrites', 'fanVulgarity'];
const PATHS = ['savePath', 'gameDir', 'clipsDir'];
const LOG_TAIL = 30000;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ce qui ne sort jamais : le dossier de l'utilisateur et son nom, les clés d'IA, les adresses e-mail.
function scrub(text, { home = os.homedir(), user = safeUser(), names = [] } = {}) {
  let t = String(text ?? '');
  if (home) t = t.replace(new RegExp(escapeRe(home), 'gi'), '%USERPROFILE%').replace(new RegExp(escapeRe(home.replace(/\\/g, '/')), 'gi'), '%USERPROFILE%');
  t = t.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"'<>|:*?]+/gi, '$1%USERNAME%');
  for (const n of [user, ...names].filter((x) => x && String(x).length >= 3)) t = t.replace(new RegExp(escapeRe(n), 'gi'), '%NOM%');
  return t
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[clé masquée]')
    .replace(/\bsk-(?:ant-|proj-|or-)?[0-9A-Za-z_-]{16,}/g, '[clé masquée]')
    .replace(/\b(?:gsk|xai|hf|ghp|gho|github_pat)_[0-9A-Za-z_]{16,}/g, '[clé masquée]')
    .replace(/\b[0-9a-f]{40,}\b/gi, '[clé masquée]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail masqué]');
}
function safeUser() {
  try { return os.userInfo().username; } catch { return null; }
}

const tail = (text, n = LOG_TAIL) => { const s = String(text || ''); return s.length > n ? `…\n${s.slice(-n)}` : s; };
const baseUrlHost = (u) => { try { return u ? new URL(u).host : ''; } catch { return '(adresse illisible)'; } };

// Ce que la carrière dit d'elle, en chiffres seulement (pas de nom de joueur, pas de textes).
function careerLines(state) {
  if (!state) return ['Aucune carrière active.'];
  const s = state.snapshot || {};
  const count = (x) => (Array.isArray(x) ? x.length : 0);
  return [
    `Date de jeu : ${s.gameDate || '?'} · saison ${s.season || '?'}`,
    `Club : ${s.club?.name || '?'} · ${s.league?.name || '?'}`,
    `Éditions : ${count(state.editions)} · posts Kop : ${count(state.feed)} · mails : ${count(state.mail)} · groupes Vestiaire : ${count(state.huddles)}`,
    `Dernière synchro : ${state.lastSync ? JSON.stringify({ published: state.lastSync.published, gameDate: state.lastSync.gameDate, durations: state.lastSync.durations }) : 'aucune'}`,
    `Relation : palier ${state.conduct?.stage || 0}${state.conduct?.pending ? ` · mise à l'écart ${state.conduct.pending.applied ? 'écrite' : 'en attente'}` : ''} · objectifs : ${[state.objectives?.season, state.objectives?.comeback].filter(Boolean).length}`,
  ];
}

// Le rapport complet. logs : { errors, activity, sync } (textes bruts, nettoyés ici).
function buildReport({ version, settings = {}, state = null, logs = {}, env = {}, now = new Date() }) {
  const names = [state?.snapshot?.player?.name, ...(String(state?.snapshot?.player?.name || '').split(/\s+/)), state?.profile?.displayName, state?.profile?.handle, state?.careerId];
  const clean = (t) => scrub(t, { names });
  const lines = [
    'LifeLegend · rapport de problème',
    `Fait le ${now.toISOString()}`,
    'Ce fichier ne contient ni ta clé d’IA, ni ton adresse e-mail, ni tes textes. Relis-le avant de l’envoyer.',
    '',
    '== Version et système ==',
    `LifeLegend ${version || '?'} · Electron ${env.electron || process.versions.electron || '?'} · Node ${process.versions.node}`,
    `${os.type()} ${os.release()} · ${os.arch()} · ${Math.round(os.totalmem() / 2 ** 30)} Go de mémoire`,
    '',
    '== Réglages ==',
    ...SETTINGS.filter((k) => settings[k] !== undefined).map((k) => `${k} : ${JSON.stringify(settings[k])}`),
    ...(settings.baseUrl ? [`baseUrl (hôte) : ${baseUrlHost(settings.baseUrl)}`] : []),
    ...PATHS.map((k) => `${k} : ${settings[k] ? clean(settings[k]) : '(vide)'}`),
    `Clés d’IA enregistrées pour : ${(settings.savedKeys || []).join(', ') || 'aucune'}`,
    '',
    '== Carrière ==',
    ...careerLines(state).map(clean),
    '',
    '== Dernière synchro (journal) ==',
    clean(tail(logs.sync, 15000)) || '(rien depuis le lancement de LifeLegend)',
    '',
    `Journaux : ${logs.writeError ? `écriture impossible (${clean(logs.writeError)})` : 'écriture sans erreur depuis le lancement'} · dossier ${logs.folder ? clean(logs.folder) : '?'}`,
    '',
    '== Erreurs (errors.log) ==',
    clean(tail(logs.errors)) || '(aucune)',
    '',
    '== Activité (activity.log) ==',
    clean(tail(logs.activity)) || '(aucune)',
    '',
  ];
  return lines.join('\n');
}

module.exports = { buildReport, scrub, SETTINGS };
