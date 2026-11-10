'use strict';
// Conseils du coach à l'entraînement, sans IA : le code repère un point faible (ses 5 derniers matchs et leurs notes, sa
// forme, son poste, ses réglages de l'écran Entraînement du jeu) et le coach lui écrit dans Mails. Il répond qu'il suit le conseil ou pas ;
// à chaque synchro, la sauvegarde dit s'il a vraiment changé son entraînement (la barre du domaine a monté).
// Un conseil à la fois, un tous les 30 jours au plus ; sans changement au bout de 3 semaines, il n'est pas suivi.

const { postTexts } = require('./postTexts');

const ATTACK = ['AC', 'SA', 'AG', 'AD', 'MOC'];
const MIDFIELD = ['MC', 'MDC', 'MG', 'MD', 'MOC'];
const DEFENCE = ['DC', 'DG', 'DD', 'MDC'];
const EVERY_DAYS = 30, WAIT_DAYS = 21, LOW = 4;
const POOR_RATING = 6, GOOD_RATING = 7.5, POOR_FORM = 1; // flèche de forme du jeu : 0 très mauvaise, 1 mauvaise, 2 normale…
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// Le point faible à travailler d'après ses derniers matchs, s'il n'y met pas déjà assez de points (moins de 4 sur 6).
function adviceFor(snapshot) {
  const focus = snapshot.player?.training?.focus, pos = snapshot.player?.profile?.position;
  if (!focus || !pos) return null;
  const recent = (snapshot.fixtures || []).filter((f) => f.played && f.me).slice(-5);
  if (recent.length < 3) return null;
  const low = (area) => (focus[area] ?? 6) < LOW;
  const rated = recent.filter((f) => f.me.minutes >= 30 && Number.isFinite(f.me.rating));
  const rating = rated.length >= 3 ? Math.round((rated.reduce((n, f) => n + f.me.rating, 0) / rated.length) * 10) / 10 : null;
  if (rating !== null && rating >= GOOD_RATING) return null; // il vole : le coach ne le reprend pas
  const sum = (k) => recent.reduce((n, f) => n + (f.me[k] || 0), 0);
  const starts = recent.filter((f) => f.me.starter);
  const minutes = starts.length ? Math.round(starts.reduce((n, f) => n + f.me.minutes, 0) / starts.length) : 90;
  const conceded = recent.reduce((n, f) => n + (f.score ? f.score[f.venue === 'domicile' ? 1 : 0] : 0), 0);
  if (ATTACK.includes(pos) && sum('goals') <= 1 && low('shooting')) return { area: 'shooting', reason: { goals: sum('goals'), matches: recent.length } };
  if (starts.length >= 2 && minutes < 70 && low('stamina')) return { area: 'stamina', reason: { minutes } };
  if (MIDFIELD.includes(pos) && sum('assists') === 0 && low('passing')) return { area: 'passing', reason: { matches: recent.length } };
  if (DEFENCE.includes(pos) && conceded >= recent.length * 1.6 && low('defending')) return { area: 'defending', reason: { conceded, matches: recent.length } };
  // Rien de précis dans les chiffres : ses notes, le domaine clé de son poste, puis sa forme.
  const core = pos === 'GB' ? 'goalkeeping' : ATTACK.includes(pos) ? 'dribbling' : MIDFIELD.includes(pos) ? 'passing' : DEFENCE.includes(pos) ? 'defending' : null;
  if (rating !== null && rating < POOR_RATING && core && low(core)) return { area: core, reason: { rating, matches: rated.length } };
  const form = snapshot.player.profile.formArrowLevel;
  if (Number.isFinite(form) && form <= POOR_FORM && low('stamina')) return { area: 'stamina', reason: { form } };
  return null;
}

// À chaque synchro : tranche le conseil en cours, puis en donne un nouveau si le moment s'y prête.
// Rend { mail, outcome } : le mail du coach à publier, et le conseil tranché pour l'édition.
function coachAdvice(state, snapshot, { language = 'fr', newId }) {
  const out = { mail: null, outcome: null };
  const bar = (area) => snapshot.player?.training?.focus?.[area];
  const a = state.coachAdvice;
  if (a?.status === 'open') {
    if (bar(a.area) > a.bar) a.status = 'followed';
    else if (days(a.gameDate, snapshot.gameDate) >= WAIT_DAYS) a.status = 'ignored';
    if (a.status !== 'open') {
      a.settledOn = snapshot.gameDate;
      out.outcome = { area: a.area, followed: a.status === 'followed', his_answer: a.choice || null };
    }
  }
  const last = state.coachAdvice;
  if (last?.status === 'open' || (last && days(last.gameDate, snapshot.gameDate) < EVERY_DAYS) || !snapshot.club?.coach) return out;
  const adv = adviceFor(snapshot);
  if (!adv) return out;
  const L = postTexts(language).coachAdvice;
  state.coachAdvice = { id: newId(), area: adv.area, reason: adv.reason, bar: bar(adv.area), gameDate: snapshot.gameDate, status: 'open', choice: null };
  out.mail = { id: newId(), from: snapshot.club.coach, role: 'coach', club: snapshot.club.name, subject: L.subject(adv.area), unread: true, closed: false,
    advice: state.coachAdvice.id, messages: [{ who: 'them', body: L.body(adv), gameDate: snapshot.gameDate }] };
  return out;
}

// Sa réponse dans Mails : il suit le conseil (à régler dans l'écran Entraînement du jeu) ou pas cette fois.
function answerAdvice(state, choice, { language = 'fr', gameDate }) {
  const a = state.coachAdvice;
  if (!a || a.status !== 'open' || a.choice) throw new Error('Ce conseil du coach n’attend plus de réponse.');
  if (choice !== 'follow' && choice !== 'ignore') throw new Error('Réponse inconnue.');
  a.choice = choice;
  const mail = (state.mail || []).find((m) => m.advice === a.id);
  const L = postTexts(language).coachAdvice;
  if (mail) mail.messages.push({ who: 'me', body: choice === 'follow' ? L.replyFollow : L.replyIgnore, gameDate });
  return a;
}

module.exports = { adviceFor, coachAdvice, answerAdvice };
